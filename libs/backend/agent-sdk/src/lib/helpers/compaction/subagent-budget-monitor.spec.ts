import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  Logger,
  SubagentRegistryService,
} from '@ptah-extension/vscode-core';
import { Logger as LoggerClass } from '@ptah-extension/vscode-core';
import { registerProviderPricing, resetPricingMapForTesting, type SubagentRecord } from '@ptah-extension/shared';
import type { CompactionConfigProvider } from '../compaction-config-provider';
import { MainThreadNoticeQueue } from '../main-thread-notice-queue';
import {
  SubagentBudgetStopCallbackRegistry,
  type SubagentBudgetStopPayload,
} from '../subagent-budget-stop-callback-registry';
import {
  HANDOFF_FILES_TIMEOUT_MS,
  SubagentHandoffFiles,
  type SubagentHandoffPaths,
} from './subagent-handoff-files';
import {
  PARENT_PUSH_ATTEMPTS,
  PARENT_PUSH_RETRY_DELAY_MS,
} from './subagent-handoff-delivery';
import { SubagentNoticeQueue } from '../subagent-notice-queue';
import { SubagentStopNotices } from './subagent-stop-notices';
import {
  HANDOFF_RECORD_SUFFIX,
  SubagentHandoffRecords,
  ownerHash,
  type HandoffRecordWrite,
} from './subagent-handoff-record';
import {
  SubagentHandoffIndex,
  type HandoffPointerAudience,
} from './subagent-handoff-index';
import {
  MAX_RECORD_ATTEMPTS,
  MAX_STOP_ATTEMPTS,
  SubagentBudgetMonitor,
  readSubagentRequestUsage,
  readSubagentTaskText,
  redactBudgetSecrets,
  resolveSubagentTranscriptPath,
  requestContextTokens,
  type SubagentBudgetDispatcherPort,
  type SubagentHandoffFilesPort,
  type SubagentHandoffIndexPort,
  type SubagentHandoffRecordsPort,
} from './subagent-budget-monitor';
import {
  adviseSubagentResume,
  type SubagentResumeAdviceInput,
} from './subagent-resume-advice';

const SESSION = 'session-1';
const TOOL_CALL = 'toolu_task_1';
const HANDOFF_TOKENS = 150_000;
const STOP_WEIGHTED = 3_000_000;
beforeAll(() => registerProviderPricing({
  'claude-sonnet-4-5-20250929': {
    inputCostPerToken: 3e-6, outputCostPerToken: 15e-6,
    cacheReadCostPerToken: 0.3e-6, cacheCreationCostPerToken: 3.75e-6,
    provider: 'anthropic',
  },
}));
afterAll(() => resetPricingMapForTesting());

interface Usage {
  input?: number;
  cacheRead?: number;
  cacheWrite?: number;
  output?: number;
  write1h?: number;
}

function assistant(
  usage: Usage | null,
  opts: { id?: string; parent?: string | null } = {},
): unknown {
  return {
    type: 'assistant',
    parent_tool_use_id: opts.parent === undefined ? TOOL_CALL : opts.parent,
    message: {
      model: 'claude-sonnet-4-5-20250929',
      ...(opts.id ? { id: opts.id } : {}),
      role: 'assistant',
      content: [],
      ...(usage
        ? {
            usage: {
              input_tokens: usage.input ?? 0,
              cache_read_input_tokens: usage.cacheRead ?? 0,
              cache_creation_input_tokens: usage.cacheWrite ?? 0,
              output_tokens: usage.output ?? 0,
              ...(usage.write1h !== undefined
                ? {
                    cache_creation: {
                      ephemeral_5m_input_tokens:
                        (usage.cacheWrite ?? 0) - usage.write1h,
                      ephemeral_1h_input_tokens: usage.write1h,
                    },
                  }
                : {}),
            },
          }
        : {}),
    },
  };
}

/** Workspace the default fake record store reports (nothing is written there). */
const RECORD_WORKSPACE = path.join(os.tmpdir(), 'ptah-fake-record-ws');

/**
 * In-memory handoff record store: every write succeeds with a fresh name
 * unless a test overrides `writeOnce`. `order` logs the calls in sequence.
 */
function fakeRecords(order: string[]) {
  let count = 0;
  return {
    workspaceOf: jest.fn(
      (_sessionId: string): string | undefined => RECORD_WORKSPACE,
    ),
    writeOnce: jest.fn(
      async (
        _sessionId: string,
        toolCallId: string,
        _text: string,
      ): Promise<HandoffRecordWrite> => {
        order.push('writeOnce');
        count += 1;
        const name = `20260101T000000000Z-${'0'.repeat(16)}-${toolCallId}-${count
          .toString(16)
          .padStart(8, '0')}${HANDOFF_RECORD_SUFFIX}`;
        return {
          ok: true,
          path: path.join(RECORD_WORKSPACE, name),
          workspace: RECORD_WORKSPACE,
          name,
        };
      },
    ),
    markInvoked: jest.fn((_toolCallId: string) => {
      order.push('markInvoked');
    }),
    withdraw: jest.fn(async (_toolCallId: string, _recordPath: string) => {
      order.push('withdraw');
    }),
    forget: jest.fn((_sessionIds: ReadonlySet<string>) => undefined),
    writeStub: jest.fn(
      async (_prompt: string, _agentType: string, _recordPath: string) =>
        undefined,
    ),
  };
}

function fakeIndex() {
  return {
    publish: jest.fn((_workspace: string, _name: string) => undefined),
    forgetCursor: jest.fn((_cursorKey: string) => undefined),
    pointerFor: jest.fn(
      async (
        _workspace: string,
        _audience: HandoffPointerAudience,
      ): Promise<string | undefined> => undefined,
    ),
  };
}

function makeHarness(
  record: Partial<SubagentRecord> | null = {},
  opts: {
    enabled?: boolean;
    handoffTokens?: number;
    maxDurationMin?: number;
    workspace?: string;
    handoffFiles?: SubagentHandoffFilesPort;
    records?: SubagentHandoffRecordsPort;
    index?: SubagentHandoffIndexPort;
    lookupTranscript?: typeof resolveSubagentTranscriptPath;
  } = {},
) {
  // The order of record, stop and delivery calls.
  const order: string[] = [];
  const recordStore = fakeRecords(order);
  if (opts.workspace) recordStore.workspaceOf.mockReturnValue(opts.workspace);
  const index = fakeIndex();
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const config = {
    getAgentBudgetSettings: jest.fn(() => ({
      warnRatio: 0.85,
      handoffContextTokens: opts.handoffTokens ?? HANDOFF_TOKENS,
      stopWeightedTokens: STOP_WEIGHTED,
      maxDurationMin: opts.maxDurationMin ?? 90,
    })),
    getConfig: jest.fn(() => ({
      enabled: opts.enabled ?? true,
      subagentHandoffTokens: opts.handoffTokens ?? HANDOFF_TOKENS,
      subagentStopWeightedTokens: STOP_WEIGHTED,
    })),
  };
  // Every handoff the monitor delivered, by either route.
  const streamed: string[] = [];
  const notices = new MainThreadNoticeQueue(logger as unknown as Logger);
  const subagentNotices = new SubagentNoticeQueue();
  const dispatcher = {
    stopSubagent: jest.fn(async (_sessionId: string, _taskId: string) => {
      order.push('stopSubagent');
    }),
    pushParentMessage: jest.fn(async (_sessionId: string, content: string) => {
      order.push('push');
      streamed.push(content);
    }),
    postMainThreadNotice: jest.fn(
      (sessionId: string, text: string, onDropped?: () => void) => {
        order.push('post');
        streamed.push(text);
        notices.post(sessionId, text, onDropped);
      },
    ),
    withdrawMainThreadNotice: jest.fn((sessionId: string, text: string) =>
      notices.withdraw(sessionId, text),
    ),
    postSubagentNotice: jest.fn((agentId: string, text: string) =>
      subagentNotices.post(agentId, text),
    ),
    withdrawSubagentNotice: jest.fn((agentId: string) =>
      subagentNotices.withdraw(agentId),
    ),
  };
  const registry = {
    get: jest.fn((_toolCallId: string) =>
      record === null
        ? null
        : ({
            toolCallId: TOOL_CALL,
            agentType: 'Explore',
            agentId: 'a1',
            status: 'running',
            startedAt: 0,
            taskId: 'task-1',
            ...record,
          } as SubagentRecord),
    ),
    getToolCallIdByAgentId: jest.fn((_agentId: string) => undefined as string | undefined),
    update: jest.fn(),
  };
  const budgetStops = new SubagentBudgetStopCallbackRegistry(
    Object.assign(Object.create(LoggerClass.prototype) as Logger, logger),
  );
  const stopNotices = new SubagentStopNotices();
  const monitor = new SubagentBudgetMonitor(
    logger as unknown as Logger,
    config as unknown as CompactionConfigProvider,
    dispatcher as unknown as SubagentBudgetDispatcherPort,
    registry as unknown as SubagentRegistryService,
    // No workspace by default: no handoff files.
    opts.handoffFiles ??
      new SubagentHandoffFiles(
        logger as unknown as Logger,
        () => opts.workspace,
      ),
    opts.records ?? recordStore,
    opts.index ?? index,
    budgetStops,
    stopNotices,
    opts.lookupTranscript ?? (async () => undefined),
  );
  return {
    monitor,
    config,
    order,
    recordStore,
    index,
    logger,
    dispatcher,
    registry,
    streamed,
    notices,
    subagentNotices,
    budgetStops,
    stopNotices,
  };
}

/** The main-thread user message carrying the spawning call's tool result. */
function toolResult(toolUseId = TOOL_CALL): unknown {
  return {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: 'Async agent launched',
        },
      ],
    },
  };
}

/** A parent assistant message that spawns the subagent with `input`. */
function spawn(input: Record<string, unknown>, name = 'Agent'): unknown {
  return {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'delegating' },
        { type: 'tool_use', id: TOOL_CALL, name, input },
      ],
    },
  };
}

/**
 * Builds a fake credential fixture from parts at runtime so secret scanners
 * (GitGuardian) do not flag the spec source. None of these values are real.
 */
const fake = (...parts: string[]): string => parts.join('');

describe('SubagentBudgetMonitor', () => {
  it('loads budget settings once for an accepted assistant message', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, assistant({ input: 10 }, { id: 'settings-once' }));
    expect(h.config.getAgentBudgetSettings).toHaveBeenCalledTimes(1);
  });
  it.each([
    fake('Authorization: Bear', 'er ', 'eyJhbGci', 'OiJIUzI1NiJ9', '.very-secret'),
    fake('Authorization: Bas', 'ic ', 'dXNlcjpw', 'YXNz'),
    '"apiKey": "very-secret"',
    'AWS_SECRET_ACCESS_KEY=very-secret',
    fake('SERVICE_', 'TOKEN=', 'very-', 'secret'),
    'MY_PRIVATE_KEY=very-secret',
    fake('AK', 'IA', '1234567890ABCDEF'),
    fake('AS', 'IA', '1234567890ABCDEF'),
    fake('sk', '-', '1234567890abcdef'),
    fake('gh', 'p_', '1234567890abcdef'),
    fake('github', '_pat_', '1234567890abcdef'),
    fake('xo', 'xb-', '1234567890abcdef'),
    fake('client', '_secret', '=', 'abc123'),
    fake('access', '_token', '=', 'abc123'),
    fake('db', '_password', '=', 'abc123'),
    fake('api', '_key', ': ', 'abc123'),
    fake('"Authorization": "Bear', 'er ', 'abc123"'),
    fake('Authorization: Bas', 'ic ', 'abc123'),
    fake('Bear', 'er ', 'abc123.jwt'),
    fake('Bear', 'er ', 'abc123def456', ')'),
    fake('Bas', 'ic ', 'dXNlcjpw', 'YXNz=', ']'),
    fake('pass', 'word: ', 'correct', 'horse', 'battery'),
    fake('access', 'Token=', 'letters', 'only'),
    fake('postgres://', 'user:', 'pass', '/word', '@host'),
    fake('pass', 'word', ' = "two words"'),
    fake('postgres://', 'user:', 'pass', '@host'),
    fake('-----BEGIN PRIV', 'ATE KEY-----\nvery-secret\n-----END PRIV', 'ATE KEY-----'),
  ])('redacts credential pattern in persisted text: %s', (secret) => {
    expect(redactBudgetSecrets(secret)).not.toContain(secret.includes('very-secret') ? 'very-secret' : secret);
  });

  it.each([
    [fake('--pass', 'word=', 'dummy', 'value123'), '--password=[redacted]'],
    [fake('--to', 'ken=', 'dummy', 'value123'), '--token=[redacted]'],
    [fake('--se', 'cret=', 'dummy', 'value123'), '--secret=[redacted]'],
    [fake('--api-', 'key ', 'dummy', 'value123'), '--api-key [redacted]'],
    [fake('--api-', 'key=', 'dummy', 'value123'), '--api-key=[redacted]'],
    [fake('--pa', 'ss=', 'dummy', 'value123'), '--pass=[redacted]'],
    [fake('**Pass', 'word:** ', 'dummy', 'value123'), '**Password:** [redacted]'],
    [fake('*To', 'ken*: ', 'dummy', 'value123'), '*Token*: [redacted]'],
    [fake('__Se', 'cret__: ', 'dummy', 'value123'), '__Secret__: [redacted]'],
    [fake('pass', 'word=', '123', '456'), 'password=[redacted]'],
    [fake('SECRET_', 'KEY_BASE=', 'dummy', 'value123'), 'SECRET_KEY_BASE=[redacted]'],
    [fake('SERVICE_', 'TOKEN_VALUE=', 'dummy', 'value123'), 'SERVICE_TOKEN_VALUE=[redacted]'],
    [fake('access', 'Key=', 'dummy', 'value123'), 'accessKey=[redacted]'],
    [fake('secret', 'Key=', 'dummy', 'value123'), 'secretKey=[redacted]'],
    [fake('private', 'Key=', 'dummy', 'value123'), 'privateKey=[redacted]'],
  ])('redacts flagged or formatted credential: %s', (input, expected) => {
    expect(redactBudgetSecrets(input)).toBe(expected);
  });

  it.each([
    fake('access', '-token'), fake('auth', '-token'), fake('refresh', '-token'),
    fake('client', '-secret'), fake('api', '-token'), fake('private', '-key'),
  ])('redacts compound long flag with equals and space: %s', (name) => {
    const credential = fake('dummy', 'value123');
    expect(redactBudgetSecrets(fake('--', name, '=', credential))).toBe(`--${name}=[redacted]`);
    expect(redactBudgetSecrets(fake('--', name, ' ', credential))).toBe(`--${name} [redacted]`);
  });

  it.each(['github-token', 'db-password', 'npm-auth-token', 'aws-secret-key'])('redacts credential-suffixed long flag %s', (name) => {
    const credential = fake('dummy', 'value123');
    expect(redactBudgetSecrets(fake('--', name, '=', credential))).toBe(`--${name}=[redacted]`);
    expect(redactBudgetSecrets(fake('--', name, ' ', credential))).toBe(`--${name} [redacted]`);
  });

  it.each(['access-key', 'encryption-key', 'signing-key'])('redacts credential key flag %s', (name) => {
    const credential = fake('dummy', 'value123');
    expect(redactBudgetSecrets(fake('--', name, '=', credential))).toBe(`--${name}=[redacted]`);
    expect(redactBudgetSecrets(fake('--', name, ' ', credential))).toBe(`--${name} [redacted]`);
  });

  it.each(['encryptionKey', 'signingKey', 'authKey', 'masterKey'])('redacts credential camelCase name %s', (name) => {
    expect(redactBudgetSecrets(fake(name, '=', 'dummy', 'value123'))).toBe(`${name}=[redacted]`);
  });

  it.each(['the token count is 31079', 'update the key handler', 'password reset flow',
    'Basic usage', 'Basic functionality', 'Basic configuration',
    'primary key: id', 'the key insight', 'Bearer of bad news', 'monkey: x',
    'timeout: 123456',
    fake('token-', 'budget: 130000'),
    fake('token_', 'count: 42'),
    fake('key_', 'count=123456'),
    fake('password_', 'reset_url: 123456'),
    fake('max-', 'tokens=130000'),
    fake('sort', 'Key: 123456'),
    fake('mkdir ', '-p src/lib'),
    fake('ls ', '-p dir'),
    fake('npm ', '-p pkg'),
  ])('preserves normal sentence: %s', (sentence) => {
    expect(redactBudgetSecrets(sentence)).toBe(sentence);
  });

  it('handles a long delimiter chain without repeated suffix scans', () => {
    const line = 'a-'.repeat(50_000);
    const started = performance.now();
    expect(redactBudgetSecrets(line)).toBe(line);
    expect(redactBudgetSecrets(`${line}: abc123`)).toBe(`${line}: abc123`);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it('handles a 1 MiB base64url-like line with many underscores in under one second', () => {
    const line = 'ab_'.repeat(349_525);
    const started = performance.now();
    expect(redactBudgetSecrets(line)).toBe(line);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('accepts only an existing transcript in the expected session directory', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-transcript-home-'));
    const workspace = path.join(home, 'workspace');
    const session = 'session-1';
    const agent = 'agent-1';
    const slug = path.resolve(workspace).replace(/[^A-Za-z0-9]/g, '-');
    const directory = path.join(home, '.claude', 'projects', slug, session, 'subagents');
    const file = path.join(directory, `agent-${agent}.jsonl`);
    const outside = path.join(home, `agent-${agent}.jsonl`);
    const hookDirectory = path.join(home, '.claude', 'projects', 'different-claude-slug', session, 'subagents');
    const hookFile = path.join(hookDirectory, `agent-${agent}.jsonl`);
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(file, '{}\n');
      fs.writeFileSync(outside, '{}\n');
      fs.mkdirSync(hookDirectory, { recursive: true });
      fs.writeFileSync(hookFile, '{}\n');
      await expect(resolveSubagentTranscriptPath(home, workspace, session, agent)).resolves.toBe(fs.realpathSync(file));
      await expect(resolveSubagentTranscriptPath(home, workspace, session, agent, file)).resolves.toBe(fs.realpathSync(file));
      await expect(resolveSubagentTranscriptPath(home, workspace, session, agent, hookFile)).resolves.toBe(fs.realpathSync(hookFile));
      await expect(resolveSubagentTranscriptPath(home, workspace, session, agent, outside)).resolves.toBeUndefined();
      await expect(resolveSubagentTranscriptPath(home, workspace, session, agent, `${directory}${path.sep}..${path.sep}subagents${path.sep}agent-${agent}.jsonl`)).resolves.toBeUndefined();
      fs.unlinkSync(file);
      await expect(resolveSubagentTranscriptPath(home, workspace, session, agent)).resolves.toBe(fs.realpathSync(hookFile));
      fs.unlinkSync(hookFile);
      await expect(resolveSubagentTranscriptPath(home, workspace, session, agent)).resolves.toBeUndefined();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('prefers the current project, then the newest transcript across projects', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-transcript-order-'));
    const workspace = path.join(home, 'workspace');
    const session = 'session-1';
    const agent = 'agent-1';
    const root = path.join(home, '.claude', 'projects');
    const slug = path.resolve(workspace).replace(/[^A-Za-z0-9]/g, '-');
    const filename = `agent-${agent}.jsonl`;
    const current = path.join(root, slug, session, 'subagents', filename);
    const older = path.join(root, 'other-a', session, 'subagents', filename);
    const newer = path.join(root, 'other-b', session, 'subagents', filename);
    try {
      for (const file of [current, older, newer]) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, '{}\n');
      }
      fs.utimesSync(current, new Date(1_000), new Date(1_000));
      fs.utimesSync(older, new Date(2_000), new Date(2_000));
      fs.utimesSync(newer, new Date(3_000), new Date(3_000));
      const scan = jest.spyOn(fs.promises, 'readdir');
      try {
        await expect(resolveSubagentTranscriptPath(home, workspace, session, agent)).resolves.toBe(fs.realpathSync(current));
        expect(scan).not.toHaveBeenCalled();
      } finally {
        scan.mockRestore();
      }
      fs.unlinkSync(current);
      await expect(resolveSubagentTranscriptPath(home, workspace, session, agent)).resolves.toBe(fs.realpathSync(newer));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('retains stopped identities by SDK id, spawning call, and teammate name after registry removal', async () => {
    const h = makeHarness({ teammateName: 'reviewer' });
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop-name' }));
    h.registry.get.mockReturnValue(null);
    for (const target of ['a1', TOOL_CALL, 'reviewer', 'task-1'])
      expect(h.monitor.getAgentBudgetState(target, SESSION)).toEqual(expect.objectContaining({ stopped: true }));
    h.monitor.release(SESSION);
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)?.stopped).toBe(true);
    expect(h.monitor.getAgentBudgetState('task-1', SESSION)?.stopped).toBe(true);
  });

  it('keeps Task identity through a session rekey and after release', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop-before-rekey' }));
    h.monitor.rekey(SESSION, 'session-rekeyed');
    h.registry.get.mockReturnValue(null);
    expect(h.monitor.getAgentBudgetState('task-1', 'session-rekeyed')?.stopped).toBe(true);
    expect(h.monitor.getAgentBudgetState('task-1', SESSION)?.stopped).toBe(true);
    h.monitor.release('session-rekeyed');
    expect(h.monitor.getAgentBudgetState('task-1', 'session-rekeyed')?.stopped).toBe(true);
    expect(h.monitor.getAgentBudgetState('task-1', 'other-session')).toBeUndefined();
  });

  it('clears a stopped name when a new same-name agent spawns without usage', async () => {
    const h = makeHarness({ teammateName: 'reviewer' });
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'old-stop' }));
    h.registry.get.mockReturnValue(null);
    await h.monitor.observe(SESSION, {
      type: 'assistant', parent_tool_use_id: null,
      message: { content: [{ type: 'tool_use', id: 'new-call', name: 'Agent', input: { name: 'reviewer', description: 'new review' } }] },
    });
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)?.stopped).not.toBe(true);
    expect(h.monitor.getAgentBudgetState('new-call', SESSION)).toBeUndefined();
    expect(h.monitor.getAgentBudgetState(TOOL_CALL, SESSION)?.stopState).toBe('stopped');
  });

  it('ignores the old registry teammate name after a same-name replacement spawns', async () => {
    const h = makeHarness({ teammateName: 'reviewer' });
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'old-stop' }));
    await h.monitor.observe(SESSION, {
      type: 'assistant', parent_tool_use_id: null,
      message: { content: [{ type: 'tool_use', id: 'new-call', name: 'Agent', input: { name: 'reviewer' } }] },
    });
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)?.stopped).not.toBe(true);
  });

  it('keeps identical teammate names independent across sessions', async () => {
    const h = makeHarness({ teammateName: 'reviewer' });
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'first-stop' }));
    h.registry.get.mockReturnValue(null);
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)?.stopState).toBe('stopped');
    expect(h.monitor.getAgentBudgetState('reviewer', 'session-2')).toBeUndefined();
    await h.monitor.observe('session-2', assistant({ input: 100 }, { id: 'second-low' }));
    expect(h.monitor.getAgentBudgetState('reviewer', 'session-2')).toBeUndefined();
  });

  it('exposes a budget refusal independently of compaction', async () => {
    const h = makeHarness({}, { enabled: false });
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'disabled' }));
    expect(h.monitor.getAgentBudgetState('a1', SESSION)?.stopped).toBe(true);
  });

  it('shows a pending stop immediately and clears it after a rejected attempt', async () => {
    const h = makeHarness({ teammateName: 'reviewer' });
    let rejectStop: (error: Error) => void = () => undefined;
    h.dispatcher.stopSubagent.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectStop = reject; }));
    const observing = h.monitor.observe(SESSION, assistant({ output: 600_000 }, { id: 'pending' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)?.stopState).toBe('pending');
    rejectStop(new Error('busy'));
    await observing;
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)).toEqual(expect.objectContaining({ stopped: false, stopState: 'none', running: true }));
  });

  it('refuses steering while handoff preparation is still in flight', async () => {
    const h = makeHarness({ teammateName: 'reviewer' }, { workspace: RECORD_WORKSPACE });
    let finishPreparation: () => void = () => undefined;
    let reached: () => void = () => undefined;
    const writing = new Promise<void>((resolve) => { reached = resolve; });
    h.recordStore.writeOnce.mockImplementationOnce(() => new Promise<HandoffRecordWrite>((resolve) => {
      finishPreparation = () => resolve({ ok: false, errorType: 'Unavailable' });
      reached();
    }));
    const observing = h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'preparing' }));
    await writing;
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)).toEqual(expect.objectContaining({ stopped: true, stopState: 'pending' }));
    finishPreparation();
    await observing;
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)?.stopState).toBe('stopped');
  });

  it('caches a missing transcript across stop preparation retries', async () => {
    const lookupTranscript = jest.fn(async () => undefined);
    const h = makeHarness({}, { workspace: RECORD_WORKSPACE, lookupTranscript });
    h.recordStore.writeOnce.mockResolvedValue({ ok: false, errorType: 'Unavailable' });
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'first-try' }));
    const denialAt = Date.now();
    for (let i = 0; i < 3; i += 1) await h.monitor.checkNotesTool(SESSION, 'a1', 'Read', {}, denialAt + i * 2_001);
    await waitUntil(() => h.recordStore.writeOnce.mock.calls.length === 1);
    expect(lookupTranscript).toHaveBeenCalledTimes(1);
    await h.monitor.checkNotesTool(SESSION, 'a1', 'Read', {});
    await waitUntil(() => h.recordStore.writeOnce.mock.calls.length === 2);
    expect(lookupTranscript).toHaveBeenCalledTimes(1);
  });

  it('re-arms a warning whose first task id was unknown', async () => {
    const h = makeHarness({ taskId: undefined }, { workspace: RECORD_WORKSPACE });
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'warn-unknown' }));
    expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-later');
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'warn-again' }));
    expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(2);
  });

  it('warns and finds budget state through the hook UUID for a streamed Task', async () => {
    const h = makeHarness(null, { workspace: RECORD_WORKSPACE });
    const hookRecord: SubagentRecord = {
      toolCallId: 'hook-uuid', agentType: 'Explore', agentId: 'task-agent',
      status: 'running', startedAt: 0, parentSessionId: SESSION,
    };
    h.registry.get.mockImplementation((id: string) => id === 'hook-uuid' ? hookRecord : null);
    h.registry.getToolCallIdByAgentId.mockReturnValue('hook-uuid');
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-agent');
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'near-budget' }));
    expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledWith('task-agent', expect.any(String));
    expect(h.monitor.getAgentBudgetState('task-agent', SESSION)).toEqual(
      expect.objectContaining({ running: true, stopped: false }),
    );
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop' }));
    expect(h.monitor.getAgentBudgetState('task-agent', SESSION)).toEqual(
      expect.objectContaining({ stopped: true }),
    );
  });

  it('warns once at 86 percent and re-arms for a new task invocation', async () => {
    const h = makeHarness({}, { workspace: RECORD_WORKSPACE });
    await h.monitor.observe(SESSION, assistant({ input: 100 }, { id: 'm1' }));
    await h.monitor.observe(SESSION, assistant({ input: 129_000 }, { id: 'm2' }));
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'm3' }));
    expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-2');
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'm4' }));
    expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(2);
  });

  it('carries progress and attribution through a jump beyond the stop threshold', async () => {
    const h = makeHarness({}, { workspace: RECORD_WORKSPACE });
    await h.monitor.observe(SESSION, assistant({ input: 100 }, { id: 'm1' }));
    const jump = assistant({ input: 186_000 }, { id: 'm2' }) as { message: { content: unknown[] } };
    jump.message.content = [
      { type: 'text', text: 'Changed the parser token=PLACEHOLDER_NOT_A_SECRET' },
      { type: 'tool_use', id: 'edit-1', name: 'Edit', input: { file_path: 'src/parser.ts', new_string: 'PLACEHOLDER_NOT_A_SECRET' } },
    ];
    await h.monitor.observe(SESSION, jump);
    expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
    expect(h.recordStore.writeOnce).not.toHaveBeenCalled();
    expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    expect(h.monitor.getAgentBudgetState('a1', SESSION)).toEqual(expect.objectContaining({ stopped: false, contextTokens: 186_000 }));
    expect(h.monitor.hasNotesGate('a1')).toBe(true);
    expect(h.subagentNotices.take('a1')).toContain('budget');
    const denialAt = Date.now();
    for (let i = 0; i < 3; i += 1) await h.monitor.checkNotesTool(SESSION, 'a1', 'Read', { file_path: 'remaining.txt' }, denialAt + i * 2_001);
    await waitUntil(() => h.recordStore.writeOnce.mock.calls.length > 0);
    const recordText = h.recordStore.writeOnce.mock.calls[0][2];
    expect(recordText).toContain('src/parser.ts');
    expect(recordText).toContain('Changed the parser token=[redacted]');
    expect(recordText).not.toContain('PLACEHOLDER_NOT_A_SECRET');
  });
  it('tracks tool result outcomes and keeps only the last ten tool calls', async () => {
    const h = makeHarness();
    const progress = assistant({ input: 100 }, { id: 'progress' }) as { message: { content: unknown[] } };
    progress.message.content = Array.from({ length: 12 }, (_, index) => ({
      type: 'tool_use', id: `call-${index}`, name: 'Read', input: { file_path: `file-${index}.txt` },
    }));
    await h.monitor.observe(SESSION, progress);
    await h.monitor.observe(SESSION, {
      type: 'user', parent_tool_use_id: TOOL_CALL,
      message: { content: [{ type: 'tool_result', tool_use_id: 'call-11', is_error: true }] },
    });
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop-tools' }));
    const record = h.recordStore.writeOnce.mock.calls[0][2];
    expect(record).toContain('file-11.txt');
    expect(record).toContain('failed');
    expect(record).not.toContain('file-0.txt');
    expect(record).not.toContain('file-1.txt');
  });
  it('redacts a long private key before applying the progress text cap', async () => {
    const h = makeHarness();
    const progress = assistant({ input: 310_000 }, { id: 'stop-pem' }) as { message: { content: unknown[] } };
    const secret = 'Q'.repeat(3000);
    progress.message.content = [{ type: 'text', text: `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----` }];
    await h.monitor.observe(SESSION, progress);
    const record = h.recordStore.writeOnce.mock.calls[0][2];
    expect(record).not.toContain(secret.slice(0, 100));
    expect(record).toContain('[redacted private key]');
  });
  it('publishes one id-only signal for an invoked stop with a record', async () => {
    const h = makeHarness({}, { workspace: RECORD_WORKSPACE });
    const observed: SubagentBudgetStopPayload[] = [];
    h.budgetStops.register((payload) => {
      observed.push(payload);
    });
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    await h.monitor.observe(
      SESSION,
      assistant({ input: 320_000 }, { id: 'm2' }),
    );
    expect(observed).toHaveLength(1);
    expect(observed[0]).toEqual({
      agentId: 'a1',
      parentSessionId: SESSION,
      timestamp: expect.any(Number),
    });
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
  });

  it('joins a hook UUID to the streamed Task by agent id before publishing the stop', async () => {
    const h = makeHarness(null, { workspace: RECORD_WORKSPACE });
    const hookRecord: SubagentRecord = {
      toolCallId: 'hook-uuid', agentType: 'Explore', agentId: 'task-agent',
      status: 'running', startedAt: 0, parentSessionId: SESSION,
    };
    h.registry.get.mockImplementation((id: string) => id === 'hook-uuid' ? hookRecord : null);
    h.registry.getToolCallIdByAgentId.mockReturnValue('hook-uuid');
    const observed = jest.fn();
    h.budgetStops.register(observed);
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-agent');

    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop' }));

    expect(h.registry.getToolCallIdByAgentId).toHaveBeenCalledWith('task-agent');
    expect(observed).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'task-agent' }));
    expect(h.registry.update).toHaveBeenCalledWith('hook-uuid', expect.objectContaining({ status: 'completed' }));
  });

  it('prefers the direct tool ID over an agent ID join', async () => {
    const h = makeHarness({ agentId: 'direct', taskId: 'task-agent' });
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-agent');
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop' }));
    expect(h.registry.getToolCallIdByAgentId).not.toHaveBeenCalled();
    expect(h.registry.update).toHaveBeenCalledWith(TOOL_CALL, expect.objectContaining({ status: 'completed' }));
  });

  it.each([
    ['another session', { parentSessionId: 'other-session', status: 'running' }],
    ['completed', { parentSessionId: SESSION, status: 'completed' }],
    ['interrupted', { parentSessionId: SESSION, status: 'interrupted' }],
  ] as const)('does not attribute a stale agent ID join from %s', async (_label, fields) => {
    const h = makeHarness(null);
    h.registry.get.mockImplementation((id: string) => id === 'hook-uuid' ? {
      toolCallId: 'hook-uuid', agentType: 'Explore', agentId: 'task-agent',
      startedAt: 0, ...fields,
    } : null);
    h.registry.getToolCallIdByAgentId.mockReturnValue('hook-uuid');
    const observed = jest.fn();
    h.budgetStops.register(observed);
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-agent');
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop' }));
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(SESSION, 'task-agent');
    expect(observed).not.toHaveBeenCalled();
    expect(h.registry.update).not.toHaveBeenCalled();
  });

  it('does not signal or complete when the registry has no matching agent', async () => {
    const h = makeHarness(null);
    const observed = jest.fn();
    h.budgetStops.register(observed);
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-agent');
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop' }));
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(SESSION, 'task-agent');
    expect(observed).not.toHaveBeenCalled();
    expect(h.registry.update).not.toHaveBeenCalled();
  });

  it('stops only the over-budget member of two running subagents', async () => {
    const h = makeHarness(null);
    const records = new Map<string, SubagentRecord>([
      [TOOL_CALL, { toolCallId: TOOL_CALL, agentType: 'Explore', agentId: 'first', status: 'running', startedAt: 0, parentSessionId: SESSION }],
      ['toolu_second', { toolCallId: 'toolu_second', agentType: 'Explore', agentId: 'second', status: 'running', startedAt: 0, parentSessionId: SESSION }],
    ]);
    h.registry.get.mockImplementation((id: string) => records.get(id) ?? null);
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'first');
    h.monitor.recordTaskStarted(SESSION, 'toolu_second', 'second');
    await h.monitor.observe(SESSION, assistant({ input: 310_000 }, { id: 'stop' }));
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(SESSION, 'first');
    expect(h.registry.update).toHaveBeenCalledTimes(1);
    expect(h.registry.update).toHaveBeenCalledWith(TOOL_CALL, expect.objectContaining({ status: 'completed' }));
    expect(h.monitor.getSnapshot(SESSION, 'toolu_second')?.stopped).not.toBe(true);
  });

  it('does not publish a stop for a failed attempt', async () => {
    const h = makeHarness({}, { workspace: RECORD_WORKSPACE });
    const observed = jest.fn();
    h.budgetStops.register(observed);
    h.dispatcher.stopSubagent.mockRejectedValueOnce(new Error('busy'));
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    expect(observed).not.toHaveBeenCalled();
  });

  it('publishes one signal for a record-less safety stop', async () => {
    const h = makeHarness();
    const observed: SubagentBudgetStopPayload[] = [];
    h.budgetStops.register((payload) => {
      observed.push(payload);
    });
    h.recordStore.writeOnce.mockResolvedValueOnce({
      ok: false,
      errorType: 'Error',
      errorCode: 'ENOSPC',
    });
    await h.monitor.observe(
      SESSION,
      assistant({ output: 600_000 }, { id: 'm1' }),
    );

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.recordStore.markInvoked).not.toHaveBeenCalled();
    expect(observed).toHaveLength(1);
    expect(observed[0]).toEqual({
      agentId: 'a1',
      parentSessionId: SESSION,
      timestamp: expect.any(Number),
    });
  });

  it('a stop without an agent id warns and does not publish', async () => {
    const h = makeHarness({ agentId: '' });
    const observed = jest.fn();
    h.budgetStops.register(observed);
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(observed).not.toHaveBeenCalled();
    expect(
      h.logger.warn.mock.calls.filter((call) =>
        String(call[0]).includes('without an agent id'),
      ),
    ).toHaveLength(1);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('without an agent id'),
      expect.objectContaining({ toolCallId: TOOL_CALL }),
    );
  });

  it('a second trigger after a stop publishes nothing', async () => {
    const h = makeHarness({}, { workspace: RECORD_WORKSPACE });
    const observed: SubagentBudgetStopPayload[] = [];
    h.budgetStops.register((payload) => {
      observed.push(payload);
    });
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    expect(observed).toHaveLength(1);
    await h.monitor.observe(
      SESSION,
      assistant({ input: 320_000 }, { id: 'm2' }),
    );

    expect(observed).toHaveLength(1);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
  });

  it('takes no action below the thresholds', async () => {
    const h = makeHarness();
    await h.monitor.observe(
      SESSION,
      assistant({
        input: 10,
        cacheRead: 100_000,
        cacheWrite: 40_000,
        output: 50,
      }),
    );

    expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    expect(h.registry.update).not.toHaveBeenCalled();
    expect(h.streamed).toHaveLength(0);
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)).toEqual({
      contextTokens: 140_010,
      weightedUsed: 140_060, // shared policy's raw-token floor
      stopped: false,
      budgetReached: false,
    });
  });

  it('ignores parent messages and non-assistant messages', async () => {
    const h = makeHarness();
    await h.monitor.observe(
      SESSION,
      assistant({ input: 200_000 }, { parent: null }),
    );
    await h.monitor.observe(SESSION, {
      type: 'user',
      parent_tool_use_id: TOOL_CALL,
    });

    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)).toBeUndefined();
    expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
  });

  it('at the handoff size stops the subagent, marks it not resumable and streams one parent message, once', async () => {
    const h = makeHarness({ teammateName: 'scout' });
    await h.monitor.observe(
      SESSION,
      assistant({ input: 1, cacheRead: 149_999 }, { id: 'm1' }),
    );
    await h.monitor.observe(
      SESSION,
      assistant({ input: 1, cacheRead: 310_000 }, { id: 'm2' }),
    );

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(SESSION, 'task-1');
    expect(h.registry.update).toHaveBeenCalledWith(
      TOOL_CALL,
      expect.objectContaining({ status: 'completed' }),
    );
    expect(h.streamed).toHaveLength(1);
    expect(h.streamed[0]).toContain('`Explore`');
    expect(h.streamed[0]).toContain('310001 context tokens of 150000');
    expect(h.streamed[0]).toContain('spawn a fresh `Explore` subagent');
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.stopped).toBe(true);
  });

  it('weighted safety stop fires once on the same stop path', async () => {
    const h = makeHarness();
    // Each request weighs 151k (output 5x) while its context stays at 1k; the 20th crosses 3M.
    for (let i = 0; i < 25; i++) {
      await h.monitor.observe(
        SESSION,
        assistant({ input: 1_000, output: 30_000 }, { id: `m${i}` }),
      );
    }

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.streamed).toHaveLength(1);
    expect(h.streamed[0]).toContain('safety limit 3000000');
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.budgetReached).toBe(true);
  });

  it('stops on the shared maximum duration even with a small turn', async () => {
    const h = makeHarness({}, { maxDurationMin: 0.000001 });
    await h.monitor.observe(SESSION, assistant({ input: 1, output: 1 }, { id: 'duration' }));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await h.monitor.observe(SESSION, assistant({ input: 1, output: 1 }, { id: 'duration-2' }));
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(SESSION, 'task-1');
    expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
  });

  it('streams forced interruption immediately and does not claim hook delivery', async () => {
    const h = makeHarness();
    for (let i = 0; i < 45; i++) {
      await h.monitor.observe(SESSION, assistant({ input: 1_000, output: 30_000 }, { id: `runaway-${i}` }));
    }
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    expect(h.streamed[0]).toContain("Ptah's subagent budget monitor");
    expect(h.streamed[0]).toContain('No user input is needed');
    expect(h.streamed[0]).toContain('SMALLER scope');
    expect(h.streamed[0]).toContain('Give the replacement this instruction:');
    expect(h.streamed[0]).not.toContain('plus this instruction:');
    expect(h.monitor.takeInterruptedHandoff(SESSION, TOOL_CALL)).toContain('Ptah');
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      reason: 'safety limit',
      usage: { input: 300_000 },
      amount: '300000 of 3000000 tokens',
    },
    {
      reason: 'safety limit',
      usage: { output: 600_000 },
      amount: '3000000 of 3000000 tokens',
    },
  ])(
    'records the $reason notice before the stop settles',
    async ({ reason, usage, amount }) => {
      const h = makeHarness({ teammateName: 'scout' });
      let finishStop: () => void = () => undefined;
      let signalStarted: () => void = () => undefined;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      h.dispatcher.stopSubagent.mockImplementationOnce(() => {
        signalStarted();
        return new Promise<void>((resolve) => {
          finishStop = resolve;
        });
      });

      const observing = h.monitor.observe(
        SESSION,
        assistant(usage, { id: 'm1' }),
      );
      await started;
      const notice = h.stopNotices.noticeFor('task-1');
      expect(notice).toContain("Ptah's budget monitor stopped `Explore` ('scout')");
      expect(notice).toContain(reason);
      expect(notice).toContain(amount);
      expect(notice).not.toContain('stopped by user');

      finishStop();
      await observing;
      h.monitor.release(SESSION);
      expect(h.stopNotices.noticeFor('task-1')).toBeUndefined();
    },
  );

  it('counts a request streamed as several messages with one id only once', async () => {
    const h = makeHarness();
    await h.monitor.observe(
      SESSION,
      assistant({ input: 100, output: 10 }, { id: 'm1' }),
    );
    await h.monitor.observe(
      SESSION,
      assistant({ input: 100, output: 20 }, { id: 'm1' }),
    );

    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.weightedUsed).toBe(200);
  });

  it('defers the stop until the task id is known, logging once', async () => {
    const h = makeHarness({ taskId: undefined });
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm2' }),
    );

    expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalledTimes(1);

    h.registry.get.mockReturnValue({
      toolCallId: TOOL_CALL,
      agentType: 'Explore',
      agentId: 'a1',
      status: 'running',
      startedAt: 0,
      taskId: 'task-1',
    } as SubagentRecord);
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm3' }),
    );
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
  });

  describe('task id from task_started (R5)', () => {
    it('stops with the recorded task id and hands off when the registry has no record', async () => {
      const h = makeHarness(null);
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-started-1', 'Plan');
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(
        SESSION,
        'task-started-1',
      );
      expect(h.registry.update).not.toHaveBeenCalled();
      expect(h.streamed).toHaveLength(1);
      expect(h.streamed[0]).toContain('handed off subagent `Plan`');
      expect(h.streamed[0]).toContain('spawn a fresh `Plan` subagent');
      expect(h.logger.warn).toHaveBeenCalledTimes(1);
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('without an agent id'),
        expect.objectContaining({ toolCallId: TOOL_CALL }),
      );
      expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.stopped).toBe(true);
    });

    it('names the subagent generically when neither the registry nor task_started gives a type', async () => {
      const h = makeHarness(null);
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-started-1');
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.streamed[0]).toContain('handed off subagent `subagent`');
    });

    it('stops with the recorded task id when the registry record has none, and marks the record', async () => {
      const h = makeHarness({ taskId: undefined, teammateName: 'scout' });
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-started-1', 'Plan');
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(
        SESSION,
        'task-started-1',
      );
      expect(h.registry.update).toHaveBeenCalledWith(
        TOOL_CALL,
        expect.objectContaining({ status: 'completed' }),
      );
      // The registry record names the subagent when it exists.
      expect(h.streamed[0]).toContain("`Explore` ('scout')");
    });

    it('prefers the recorded task id over the registry one', async () => {
      const h = makeHarness();
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-started-1');
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(
        SESSION,
        'task-started-1',
      );
    });

    it('with nothing recorded and no registry record, defers with one WARN and no stop', async () => {
      const h = makeHarness(null);
      // A non-agent task (bash) under another tool_use id is not this subagent.
      h.monitor.recordTaskStarted(SESSION, 'toolu_bash_1', 'task-bash-1');
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm2' }),
      );

      expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
      expect(h.registry.update).not.toHaveBeenCalled();
      expect(h.streamed).toHaveLength(0);
      expect(h.logger.warn).toHaveBeenCalledTimes(1);
      expect(h.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('stop deferred'),
        expect.objectContaining({ toolCallId: TOOL_CALL }),
      );
    });

    it('a task id recorded after a deferral lets the next message stop', async () => {
      const h = makeHarness(null);
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-started-1');
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm2' }),
      );

      expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
      expect(h.streamed).toHaveLength(1);
    });

    it('ignores a blank session, tool_use or task id', async () => {
      const h = makeHarness(null);
      h.monitor.recordTaskStarted('', TOOL_CALL, 'task-started-1');
      h.monitor.recordTaskStarted(SESSION, '', 'task-started-1');
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, '');
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    });

    it('keeps a task id recorded under the old id across a rekey, and under an alias', async () => {
      const h = makeHarness(null);
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-started-1');
      h.monitor.rekey(SESSION, 'session-2');
      h.monitor.recordTaskStarted(SESSION, 'toolu_task_2', 'task-started-2');
      await h.monitor.observe(
        'session-2',
        assistant({ input: 310_000 }, { id: 'm1' }),
      );
      await h.monitor.observe(
        'session-2',
        assistant({ input: 310_000 }, { id: 'm2', parent: 'toolu_task_2' }),
      );

      expect(h.dispatcher.stopSubagent).toHaveBeenNthCalledWith(
        1,
        'session-2',
        'task-started-1',
      );
      expect(h.dispatcher.stopSubagent).toHaveBeenNthCalledWith(
        2,
        'session-2',
        'task-started-2',
      );
    });

    it('merges task ids recorded under both ids on a rekey', async () => {
      const h = makeHarness(null);
      h.monitor.recordTaskStarted('session-2', TOOL_CALL, 'task-started-1');
      h.monitor.recordTaskStarted(SESSION, 'toolu_task_2', 'task-started-2');
      h.monitor.rekey(SESSION, 'session-2');
      await h.monitor.observe(
        'session-2',
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(
        'session-2',
        'task-started-1',
      );
    });

    it('forgets recorded task ids when the session is released', async () => {
      const h = makeHarness(null);
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-started-1');
      h.monitor.release(SESSION);
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    });
  });

  it('retries a rejected stop on the next subagent message and gives up after the cap', async () => {
    const h = makeHarness();
    h.dispatcher.stopSubagent.mockRejectedValue(new Error('gone'));
    for (let i = 0; i < MAX_STOP_ATTEMPTS + 3; i++) {
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: `m${i}` }),
      );
    }

    expect(MAX_STOP_ATTEMPTS).toBe(3);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(MAX_STOP_ATTEMPTS);
    expect(h.registry.update).not.toHaveBeenCalled();
    expect(h.streamed).toHaveLength(0);
    expect(h.logger.warn).toHaveBeenCalledTimes(1);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('giving up'),
      expect.objectContaining({ attempts: MAX_STOP_ATTEMPTS }),
    );
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.stopped).toBe(false);
    expect(h.stopNotices.noticeFor('task-1')).toContain('safety limit');
  });

  it('a retried stop that succeeds hands off once', async () => {
    const h = makeHarness();
    h.dispatcher.stopSubagent.mockRejectedValueOnce(new Error('busy'));
    for (let i = 0; i < 4; i++) {
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: `m${i}` }),
      );
    }

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(2);
    expect(h.streamed).toHaveLength(1);
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.stopped).toBe(true);
  });

  it('starts no second stop while one is in flight', async () => {
    const h = makeHarness();
    let settle: () => void = () => undefined;
    h.dispatcher.stopSubagent.mockReturnValueOnce(
      new Promise<void>((resolve) => (settle = resolve)),
    );
    const first = h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm2' }),
    );
    settle();
    await first;

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.streamed).toHaveLength(1);
  });

  it('a stop that rejects after release is not retried and sends no handoff; its record is kept and published', async () => {
    const h = makeHarness();
    let fail: (error: Error) => void = () => undefined;
    let called: () => void = () => undefined;
    const stopCalled = new Promise<void>((resolve) => (called = resolve));
    h.dispatcher.stopSubagent.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
          called();
        }),
    );
    const first = h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    await stopCalled;
    h.monitor.release(SESSION);
    fail(new Error('session ended'));
    await first;

    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)).toBeUndefined();
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.registry.update).not.toHaveBeenCalled();
    expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
    expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
    expect(h.recordStore.withdraw).not.toHaveBeenCalled();
    expect(h.index.publish).toHaveBeenCalledTimes(1);
    expect(h.logger.warn).not.toHaveBeenCalled();
    expect(h.logger.debug).toHaveBeenCalledWith(
      '[SubagentBudgetMonitor] Near-budget warning deferred',
      expect.objectContaining({ missingPaths: true }),
    );
  });

  it('the handoff restates the task from the spawning Agent tool_use', async () => {
    const h = makeHarness();
    await h.monitor.observe(
      SESSION,
      spawn({
        description: 'Map the auth module',
        prompt: `List every auth entry point. ${'x'.repeat(400)}`,
        subagent_type: 'Explore',
      }),
    );
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );

    expect(h.streamed).toHaveLength(1);
    expect(h.streamed[0]).toContain(
      'Its task was: Map the auth module: List every auth entry point.',
    );
    expect(h.streamed[0]).not.toContain('x'.repeat(301));
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
      SESSION,
      h.streamed[0],

    );
  });

  it('reads the task from the earlier Task tool name and omits it when unknown', async () => {
    const h = makeHarness();
    await h.monitor.observe(
      SESSION,
      spawn({ prompt: 'Fix the build' }, 'Task'),
    );
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    expect(h.streamed[0]).toContain('Its task was: Fix the build');

    const other = makeHarness();
    await other.monitor.observe(SESSION, spawn({ prompt: 'ignored' }, 'Bash'));
    await other.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    expect(other.streamed[0]).not.toContain('Its task was');
  });

  it('with compaction.enabled false still enforces the agent budget', async () => {
    const h = makeHarness({}, { enabled: false });
    for (let i = 0; i < 25; i++) {
      await h.monitor.observe(
        SESSION,
        assistant({ input: 160_000, output: 30_000 }, { id: `m${i}` }),
      );
    }

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.registry.update).toHaveBeenCalled();
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)).toEqual(
      expect.objectContaining({ stopped: true, budgetReached: true }),
    );
    expect(h.logger.info).toHaveBeenCalledWith(
      '[SubagentBudgetMonitor] Accepted subagent turn',
      expect.objectContaining({ sessionId: SESSION, taskId: 'task-1' }),
    );
  });

  it('rekey moves the session state and the handoff goes to the new id', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, spawn({ description: 'Audit logs' }));
    await h.monitor.observe(SESSION, assistant({ input: 1_000 }, { id: 'm1' }));
    h.monitor.rekey(SESSION, 'session-2');

    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)).toBeUndefined();
    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)?.contextTokens).toBe(
      1_000,
    );

    await h.monitor.observe(
      'session-2',
      assistant({ input: 310_000 }, { id: 'm2' }),
    );
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(
      'session-2',
      'task-1',
    );
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
      'session-2',
      expect.stringContaining('Its task was: Audit logs'),

    );
  });

  it('rekey keeps subagents already seen under the new id and ignores no-op calls', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, assistant({ input: 10 }, { id: 'm1' }));
    await h.monitor.observe(
      'session-2',
      assistant({ input: 20 }, { id: 'm2', parent: 'toolu_other' }),
    );
    h.monitor.rekey(SESSION, SESSION);
    h.monitor.rekey('unknown', 'session-2');
    h.monitor.rekey(SESSION, 'session-2');

    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)?.contextTokens).toBe(
      10,
    );
    expect(
      h.monitor.getSnapshot('session-2', 'toolu_other')?.contextTokens,
    ).toBe(20);
  });

  it('a stop in flight on the merged-into session finishes once after a rekey', async () => {
    const h = makeHarness();
    let settle: () => void = () => undefined;
    h.dispatcher.stopSubagent.mockReturnValueOnce(
      new Promise<void>((resolve) => (settle = resolve)),
    );
    const pending = h.monitor.observe(
      'session-2',
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    await h.monitor.observe(SESSION, assistant({ input: 10 }, { id: 'm0' }));
    h.monitor.rekey(SESSION, 'session-2');
    settle();
    await pending;

    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
      'session-2',
      expect.any(String),

    );
    expect(h.registry.update).toHaveBeenCalledTimes(1);
    expect(h.registry.update).toHaveBeenCalledWith(
      TOOL_CALL,
      expect.objectContaining({ status: 'completed' }),
    );
    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)?.stopped).toBe(true);

    await h.monitor.observe(
      'session-2',
      assistant({ input: 300_000 }, { id: 'm2' }),
    );
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
  });

  it('a stop in flight across a rekey merge sends no handoff once released', async () => {
    const h = makeHarness();
    let settle: () => void = () => undefined;
    h.dispatcher.stopSubagent.mockReturnValueOnce(
      new Promise<void>((resolve) => (settle = resolve)),
    );
    const pending = h.monitor.observe(
      'session-2',
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    await h.monitor.observe(SESSION, assistant({ input: 10 }, { id: 'm0' }));
    h.monitor.rekey(SESSION, 'session-2');
    h.monitor.release('session-2');
    settle();
    await pending;

    expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
    expect(h.registry.update).not.toHaveBeenCalled();
    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)).toBeUndefined();
  });

  it('release after rekey forgets notices recorded under both session ids', () => {
    const h = makeHarness();
    h.stopNotices.record(SESSION, 'task-old', 'old notice');
    h.monitor.rekey(SESSION, 'session-2');
    h.stopNotices.record('session-2', 'task-new', 'new notice');

    h.monitor.release('session-2');

    expect(h.stopNotices.noticeFor('task-old')).toBeUndefined();
    expect(h.stopNotices.noticeFor('task-new')).toBeUndefined();
  });

  it('an old-id message after a rekey adds to the same state (G.2 FM-2)', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, assistant({ input: 1_000 }, { id: 'm1' }));
    h.monitor.rekey(SESSION, 'session-2');
    // Still queued under the old id when the PostCompact hook ran.
    await h.monitor.observe(SESSION, assistant({ input: 2_000 }, { id: 'm2' }));

    expect(h.monitor.currentSessionId(SESSION)).toBe('session-2');
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)).toBeUndefined();
    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)).toEqual(
      expect.objectContaining({ contextTokens: 2_000, weightedUsed: 3_000 }),
    );

    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm3' }),
    );
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(
      'session-2',
      'task-1',
    );
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
      'session-2',
      expect.any(String),

    );
  });

  it('release drops the aliases of the released id: no state lands on it afterwards', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, assistant({ input: 1_000 }, { id: 'm1' }));
    h.monitor.rekey(SESSION, 'session-2');
    h.monitor.rekey('session-2', 'session-3');
    expect(h.monitor.currentSessionId(SESSION)).toBe('session-3');

    h.monitor.release('session-3');
    expect(h.monitor.currentSessionId(SESSION)).toBe(SESSION);
    expect(h.monitor.currentSessionId('session-2')).toBe('session-2');

    await h.monitor.observe(SESSION, assistant({ input: 5 }, { id: 'm2' }));
    expect(h.monitor.getSnapshot('session-3', TOOL_CALL)).toBeUndefined();
    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)).toBeUndefined();
  });

  it('a rekey back to an earlier id forms no alias loop', () => {
    const h = makeHarness();
    h.monitor.rekey(SESSION, 'session-2');
    h.monitor.rekey('session-2', SESSION);

    expect(h.monitor.currentSessionId(SESSION)).toBe(SESSION);
    expect(h.monitor.currentSessionId('session-2')).toBe(SESSION);
  });

  it('a rejected stop retries on the next request, not on the other blocks of the same one (FM-6)', async () => {
    const h = makeHarness();
    h.dispatcher.stopSubagent.mockRejectedValue(new Error('busy'));
    // One request streamed as three content-block messages.
    for (let i = 0; i < 3; i++) {
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );
    }
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);

    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'm2' }),
    );
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(2);
    expect(h.logger.warn).not.toHaveBeenCalled();
  });

  it('a stop rejecting across a rekey merge counts once and retries on the next request (rereview m3)', async () => {
    const h = makeHarness();
    let fail: (error: Error) => void = () => undefined;
    h.dispatcher.stopSubagent.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => (fail = reject)),
    );
    const pending = h.monitor.observe(
      'session-2',
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    await h.monitor.observe(SESSION, assistant({ input: 10 }, { id: 'm0' }));
    h.monitor.rekey(SESSION, 'session-2');
    fail(new Error('busy'));
    await pending;

    expect(h.logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('retrying'),
      expect.objectContaining({ sessionId: 'session-2', attempt: 1 }),
    );
    expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();

    await h.monitor.observe(
      'session-2',
      assistant({ input: 310_000 }, { id: 'm2' }),
    );
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(2);
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)?.stopped).toBe(true);
  });

  it('with stops in flight on both merged records, a failure on the last attempt does not hide the other success (rereview m1, m3)', async () => {
    const h = makeHarness();
    // Source record: two attempts rejected, the third (F) left in flight.
    h.dispatcher.stopSubagent
      .mockRejectedValueOnce(new Error('busy'))
      .mockRejectedValueOnce(new Error('busy'));
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'a1' }),
    );
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'a2' }),
    );
    let settleF: () => void = () => undefined;
    h.dispatcher.stopSubagent.mockReturnValueOnce(
      new Promise<void>((resolve) => (settleF = resolve)),
    );
    const pendingF = h.monitor.observe(
      SESSION,
      assistant({ input: 310_000 }, { id: 'a3' }),
    );
    // Target record: its own stop (E) in flight.
    let failE: (error: Error) => void = () => undefined;
    h.dispatcher.stopSubagent.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => (failE = reject)),
    );
    const pendingE = h.monitor.observe(
      'session-2',
      assistant({ input: 310_000 }, { id: 'b1' }),
    );

    h.monitor.rekey(SESSION, 'session-2');
    failE(new Error('busy'));
    await pendingE;
    settleF();
    await pendingF;

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(4);
    expect(h.logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('giving up'),
      expect.anything(),
    );
    expect(h.registry.update).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
      'session-2',
      expect.any(String),

    );
    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)?.stopped).toBe(true);
  });

  it('a rekey keeps the fired target state over a fresh source one: no second stop or handoff (rereview m3)', async () => {
    const h = makeHarness();
    await h.monitor.observe(
      'session-2',
      assistant({ input: 310_000 }, { id: 'm1' }),
    );
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    await h.monitor.observe(SESSION, assistant({ input: 10 }, { id: 'm0' }));
    h.monitor.rekey(SESSION, 'session-2');

    expect(h.monitor.getSnapshot('session-2', TOOL_CALL)?.stopped).toBe(true);
    await h.monitor.observe(
      'session-2',
      assistant({ input: 300_000 }, { id: 'm2' }),
    );
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
  });

  it('the handoff after a rekey restates the task recorded on the merged-away record (rereview m3)', async () => {
    const h = makeHarness();
    await h.monitor.observe(
      'session-2',
      spawn({ description: 'Trace the bug' }),
    );
    await h.monitor.observe(SESSION, assistant({ input: 10 }, { id: 'm0' }));
    h.monitor.rekey(SESSION, 'session-2');
    await h.monitor.observe(
      'session-2',
      assistant({ input: 310_000 }, { id: 'm1' }),
    );

    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
      'session-2',
      expect.stringContaining('Its task was: Trace the bug'),

    );
  });

  it('without usage fails closed and logs once per subagent', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, assistant(null));
    await h.monitor.observe(
      SESSION,
      assistant(null, { parent: 'toolu_other' }),
    );

    expect(h.logger.warn).toHaveBeenCalledTimes(2);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalled();
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.stopped).toBe(true);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(SESSION, 'task-1');
    expect(h.recordStore.writeOnce).toHaveBeenCalled();
    expect(h.logger.warn.mock.calls.filter(([message]) => message.includes('telemetry unavailable'))).toHaveLength(2);

    await h.monitor.observe(SESSION, assistant(null));
    expect(h.logger.warn.mock.calls.filter(([message]) => message.includes('telemetry unavailable'))).toHaveLength(2);

    await h.monitor.observe('session-2', assistant(null));
    expect(h.logger.warn).toHaveBeenCalledTimes(3);
  });

  it('release forgets the session', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, assistant({ input: 10 }));
    h.monitor.release(SESSION);
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)).toBeUndefined();
  });

  describe('handoff route', () => {
    it('background subagent (tool result already returned): streams the handoff as a parent user turn, not into the notice queue', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
      await h.monitor.observe(SESSION, toolResult());
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
        SESSION,
        expect.stringContaining('Its task was: Map auth'),
      );
      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
      // Turn end clears the queue; nothing of the handoff was in it.
      expect(h.notices.take(SESSION)).toBeUndefined();
      // A later tool result for the same call delivers nothing more.
      await h.monitor.observe(SESSION, toolResult());
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    });

    it('the handoff names the budget monitor, not the user, and the limit', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
      await h.monitor.observe(SESSION, toolResult());
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      const text = h.streamed[0];
      expect(text).toContain("Ptah's subagent budget monitor handed off");
      expect(text).toContain('not the user');
      expect(text).toContain('2x handoff ceiling 300000');
      expect(text).toContain(
        `If a Read or Glob right after this handoff fails with "The user doesn't want to take this action right now" ` +
          `and you saw no permission prompt the user declined, retry that call once; ` +
          `if it fails the same way, stop and report to the user.`,
      );
    });

    it('foreground subagent: streams the forced handoff once before its tool result', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.streamed[0]).toContain('Its task was: Map auth');
      await h.monitor.observe(SESSION, toolResult());

      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.streamed).toHaveLength(1);
    });

    it('foreground subagent whose tool result arrives after the forced stream does not duplicate it', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );
      await h.monitor.observe(SESSION, toolResult());
      await h.monitor.observe(SESSION, toolResult());

      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
        SESSION,
        h.streamed[0],
      );
      const parentHandoff = h.dispatcher.pushParentMessage.mock.calls[0][1];
      expect(parentHandoff).toContain('not the user');
      expect(parentHandoff).not.toContain('stopped by user');
      expect(h.notices.take(SESSION)).toBeUndefined();
    });

    it('a tool result that returns while the stop is in flight routes the handoff to a user turn', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
      let settle: () => void = () => undefined;
      h.dispatcher.stopSubagent.mockReturnValueOnce(
        new Promise<void>((resolve) => (settle = resolve)),
      );
      const pending = h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );
      await h.monitor.observe(SESSION, toolResult());
      settle();
      await pending;

      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
    });

    it('a call known only from task_started counts as returned once its tool result arrives', async () => {
      const h = makeHarness(null);
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-9', 'Explore');
      await h.monitor.observe(SESSION, toolResult());
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.stopSubagent).toHaveBeenCalledWith(SESSION, 'task-9');
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
    });

    describe('handoff files', () => {
      let workspace: string;
      beforeEach(() => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-handoff-'));
      });
      afterEach(() => {
        fs.rmSync(workspace, { recursive: true, force: true });
      });
      const dir = () => path.join(workspace, '.ptah', 'subagent-handoffs');
      const longPrompt = `Design the auth module. ${'y'.repeat(400)} END`;

      async function stopSpawned(h: ReturnType<typeof makeHarness>) {
        h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-9', 'architect');
        await h.monitor.observe(
          SESSION,
          spawn({
            description: 'Design auth',
            prompt: longPrompt,
            name: 'arch',
          }),
        );
        await h.monitor.observe(SESSION, toolResult());
        await h.monitor.observe(
          SESSION,
          assistant({ input: 310_000 }, { id: 'm1' }),
        );
        return h.streamed[0];
      }

      it('saves the full prompt and points a fresh subagent of the same type and name at the notes', async () => {
        const h = makeHarness(null, { workspace });
        fs.mkdirSync(dir(), { recursive: true });
        const notes = path.join(dir(), `${TOOL_CALL}.md`);
        fs.writeFileSync(notes, 'state: half done');

        const text = await stopSpawned(h);
        const taskFile = path.join(dir(), `${TOOL_CALL}.task.md`);

        expect(fs.readFileSync(taskFile, 'utf8')).toBe(longPrompt);
        expect(text).not.toContain(' END');
        expect(text).toContain(`original task prompt at ${taskFile}`);
        expect(text).toContain(`Its progress notes are at ${notes}.`);
        expect(text).toContain(
          "spawn a fresh `architect` subagent named 'arch'",
        );
        expect(text).toContain(
          `"Read ${notes} first and continue from it; do not redo finished work. This handoff is saved at`,
        );
        expect(text).toContain(
          'Its output file: not yet known; it is in the task notification for task task-9.',
        );
        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      });

      it('without a notes file still hands off and says the file is missing', async () => {
        const h = makeHarness(null, { workspace });

        const text = await stopSpawned(h);
        const notes = path.join(dir(), `${TOOL_CALL}.md`);

        expect(text).toContain(`Its progress notes (host-generated, inferred) are at ${notes}.`);
        expect(fs.readFileSync(notes, 'utf8')).toContain('host-generated, inferred');
        expect(text).toContain('do not redo finished work');
        expect(fs.existsSync(path.join(dir(), `${TOOL_CALL}.task.md`))).toBe(
          true,
        );
        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      });

      it('without a workspace names no files and takes the prompt from the spawning call', async () => {
        const h = makeHarness(null);

        const text = await stopSpawned(h);

        expect(text).not.toContain('.ptah');
        expect(text).toContain(
          'Its progress notes file: unavailable (workspace unknown).',
        );
        expect(text).toContain(
          'only the remaining items from its original Agent task',
        );
      });
    });

    describe('delivery under load and failure', () => {
      afterEach(() => {
        jest.useRealTimers();
      });

      /** Spawn a foreground subagent `id` with task `taskId` and stop it. */
      async function stopForeground(
        h: ReturnType<typeof makeHarness>,
        id: string,
        taskId: string,
      ): Promise<void> {
        h.monitor.recordTaskStarted(SESSION, id, taskId, 'Explore');
        await h.monitor.observe(SESSION, {
          type: 'assistant',
          parent_tool_use_id: null,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id,
                name: 'Agent',
                input: { description: `Part ${taskId}` },
              },
            ],
          },
        });
        await h.monitor.observe(
          SESSION,
          assistant({ input: 310_000 }, { id: `m-${id}`, parent: id }),
        );
      }

      it('five foreground stops before any drain: every handoff is delivered exactly once', async () => {
        const h = makeHarness(null);
        const ids = [1, 2, 3, 4, 5].map((i) => `toolu_fg_${i}`);
        for (const [i, id] of ids.entries()) {
          await stopForeground(h, id, `task-fg-${i + 1}`);
        }

        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(5);
        expect(h.notices.take(SESSION)).toBeUndefined();
        for (const id of ids) {
          await h.monitor.observe(SESSION, toolResult(id));
        }

        const delivered = [
          ...h.dispatcher.pushParentMessage.mock.calls.map((call) => call[1]),
        ].join('\n');
        for (let i = 1; i <= ids.length; i += 1) {
          const marker = `task notification for task task-fg-${i}.`;
          expect(delivered.split(marker)).toHaveLength(2);
        }
        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(5);
      });

      it('background handoff whose first push rejects is retried and sent once', async () => {
        jest.useFakeTimers();
        const h = makeHarness();
        await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
        await h.monitor.observe(SESSION, toolResult());
        h.dispatcher.pushParentMessage.mockRejectedValueOnce(
          new Error('not active'),
        );
        const pending = h.monitor.observe(
          SESSION,
          assistant({ input: 310_000 }, { id: 'm1' }),
        );
        await jest.advanceTimersByTimeAsync(PARENT_PUSH_RETRY_DELAY_MS);
        await pending;

        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(2);
        expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
        expect(h.logger.warn).not.toHaveBeenCalled();
      });

      it('background handoff whose pushes all reject stays pending in the notice queue, once', async () => {
        jest.useFakeTimers();
        const h = makeHarness();
        await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
        await h.monitor.observe(SESSION, toolResult());
        h.dispatcher.pushParentMessage.mockRejectedValue(
          new Error('not active'),
        );
        const pending = h.monitor.observe(
          SESSION,
          assistant({ input: 310_000 }, { id: 'm1' }),
        );
        await jest.advanceTimersByTimeAsync(
          PARENT_PUSH_RETRY_DELAY_MS * PARENT_PUSH_ATTEMPTS,
        );
        await pending;

        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(
          PARENT_PUSH_ATTEMPTS,
        );
        expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
        expect(h.logger.warn).toHaveBeenCalledTimes(1);
        const warned = JSON.stringify(h.logger.warn.mock.calls[0]);
        expect(warned).not.toContain('Map auth');
        // The next main-thread tool result's PostToolUse carries it.
        expect(h.notices.take(SESSION)).toContain('Its task was: Map auth');
      });

      it('background handoff whose fallback notice is cleared is not resent; its record stays the durable copy', async () => {
        jest.useFakeTimers();
        const h = makeHarness();
        await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
        await h.monitor.observe(SESSION, toolResult());
        h.dispatcher.pushParentMessage.mockRejectedValue(
          new Error('not active'),
        );
        const allRetriesMs = PARENT_PUSH_RETRY_DELAY_MS * PARENT_PUSH_ATTEMPTS;
        const pending = h.monitor.observe(
          SESSION,
          assistant({ input: 310_000 }, { id: 'm1' }),
        );
        await jest.advanceTimersByTimeAsync(allRetriesMs);
        await pending;
        // Turn end clears the fallback notice: nothing in memory resends it.
        h.notices.clear(SESSION);
        await jest.advanceTimersByTimeAsync(allRetriesMs);
        await h.monitor.observe(SESSION, toolResult('toolu_other'));

        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(
          PARENT_PUSH_ATTEMPTS,
        );
        expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
        expect(h.recordStore.withdraw).not.toHaveBeenCalled();
        expect(h.index.publish).toHaveBeenCalledTimes(1);
      });

      it('handoff file checks that never settle: a degraded handoff after the bound, and no second one', async () => {
        jest.useFakeTimers();
        let finishSave: (saved: boolean) => void = () => undefined;
        const paths: SubagentHandoffPaths = {
          notes: '/ws/.ptah/subagent-handoffs/n.md',
          task: '/ws/.ptah/subagent-handoffs/n.task.md',
        };
        const handoffFiles = {
          paths: jest.fn(() => paths),
          redactNotes: jest.fn(async () => true),
          saveTask: jest.fn(
            () => new Promise<boolean>((resolve) => (finishSave = resolve)),
          ),
          notesExist: jest.fn(() => new Promise<boolean>(() => undefined)),
        };
        const h = makeHarness(null, { handoffFiles });
        h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-9', 'Explore');
        await h.monitor.observe(
          SESSION,
          spawn({ description: 'Map auth', prompt: 'Map the auth module' }),
        );
        await h.monitor.observe(SESSION, toolResult());
        const pending = h.monitor.observe(
          SESSION,
          assistant({ input: 310_000 }, { id: 'm1' }),
        );
        await jest.advanceTimersByTimeAsync(HANDOFF_FILES_TIMEOUT_MS);
        await pending;

        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
        const text = h.dispatcher.pushParentMessage.mock.calls[0][1];
        expect(text).toContain(
          `Its progress notes file: unavailable (the file check did not finish); look for ${paths.notes}.`,
        );
        expect(text).toContain(`If ${paths.notes} exists, read it first`);
        expect(text).not.toContain(`saved at ${paths.task}`);

        finishSave(true);
        await jest.advanceTimersByTimeAsync(HANDOFF_FILES_TIMEOUT_MS);
        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
        expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
      });

      it('names the output file a background spawn result reported, with the task id', async () => {
        const h = makeHarness(null);
        h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-9', 'Explore');
        await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
        await h.monitor.observe(SESSION, {
          type: 'user',
          parent_tool_use_id: null,
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: TOOL_CALL,
                content: [
                  {
                    type: 'text',
                    text: 'Async agent launched successfully.\nagentId: a1\noutput_file: /tmp/tasks/task-9.output\nThe agent is working.',
                  },
                ],
              },
            ],
          },
        });
        await h.monitor.observe(
          SESSION,
          assistant({ input: 310_000 }, { id: 'm1' }),
        );

        expect(h.dispatcher.pushParentMessage).toHaveBeenCalledWith(
          SESSION,
          expect.stringContaining(
            'Its output so far is in /tmp/tasks/task-9.output (task task-9).',
          ),
        );
      });
    });

    it("ignores a subagent's own tool results and results of calls that spawn nothing", async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, spawn({ description: 'Map auth' }));
      await h.monitor.observe(SESSION, {
        ...(toolResult() as Record<string, unknown>),
        parent_tool_use_id: 'toolu_parent',
      });
      await h.monitor.observe(SESSION, toolResult('toolu_read'));
      await h.monitor.observe(
        SESSION,
        assistant({ input: 310_000 }, { id: 'm1' }),
      );

      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('near-budget warning', () => {
    let workspace: string;
    beforeEach(() => {
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-warn-'));
    });
    afterEach(() => {
      fs.rmSync(workspace, { recursive: true, force: true });
    });
    const notesPath = () =>
      path.join(workspace, '.ptah', 'subagent-handoffs', `${TOOL_CALL}.md`);
    /** 85% of the handoff size is 127 500 context tokens. */
    const atContext = (tokens: number, id: string) =>
      assistant({ input: tokens }, { id });

    it('routes a 54k to 101k threshold jump into the notes gate', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace, handoffTokens: 60_000 });
      await h.monitor.observe(SESSION, atContext(54_000, 'jump-before'));
      await h.monitor.observe(SESSION, atContext(101_000, 'jump-after'));
      expect(h.monitor.hasNotesGate('agent-7')).toBe(true);
      expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    });

    it('normal background exit writes a record when the SDK gives no task id', async () => {
      const h = makeHarness({ agentId: 'agent-7', taskId: undefined }, { workspace });
      await h.monitor.observe(SESSION, spawn({ description: 'Review remaining files' }));
      await h.monitor.observe(SESSION, toolResult());
      await h.monitor.observe(SESSION, atContext(130_000, 'background-warning'));
      await h.monitor.finishWarnedAgent(SESSION, 'agent-7');
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.recordStore.markInvoked).toHaveBeenCalledWith(TOOL_CALL);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    });

    it("goes once to the subagent's own agent id, keyed by its registry record, naming the notes path", async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(127_499, 'm0'));
      expect(h.dispatcher.postSubagentNotice).not.toHaveBeenCalled();

      await h.monitor.observe(SESSION, atContext(127_500, 'm1'));
      await h.monitor.observe(SESSION, atContext(130_000, 'm2'));
      await h.monitor.observe(SESSION, atContext(140_000, 'm3'));

      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
      expect(h.registry.get).toHaveBeenCalledWith(TOOL_CALL);
      const warning = h.subagentNotices.take('agent-7');
      expect(warning).toContain(`write or UPDATE your progress notes at ${notesPath()}`);
      expect(warning).toContain('Task id: task-1');
      expect(warning).toContain('150000-token limit');
      expect(h.subagentNotices.take('agent-7')).toBeUndefined();
      expect(h.subagentNotices.take('a1')).toBeUndefined();
      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
      expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
      expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    });

    it('waits for the registry record that maps the subagent to its agent id', async () => {
      const h = makeHarness(null, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      expect(h.dispatcher.postSubagentNotice).not.toHaveBeenCalled();

      h.registry.get.mockReturnValue({
        toolCallId: TOOL_CALL,
        agentType: 'Explore',
        agentId: 'agent-late',
        status: 'running',
        startedAt: 0,
      } as SubagentRecord);
      await h.monitor.observe(SESSION, atContext(131_000, 'm2'));

      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledWith(
        'agent-late',
        expect.any(String),
      );
    });

    it('is not sent without a workspace, but is sent with compaction disabled', async () => {
      const noWorkspace = makeHarness();
      await noWorkspace.monitor.observe(SESSION, atContext(130_000, 'm1'));
      const disabled = makeHarness({}, { workspace, enabled: false });
      await disabled.monitor.observe(SESSION, atContext(130_000, 'm1'));

      expect(noWorkspace.dispatcher.postSubagentNotice).not.toHaveBeenCalled();
      expect(disabled.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
    });

    it('the hard stop names the same notes path, says it is missing when unwritten, and withdraws an undelivered warning', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      await h.monitor.observe(SESSION, atContext(310_000, 'm2'));

      expect(h.dispatcher.withdrawSubagentNotice).toHaveBeenCalledWith(
        'agent-7',
      );
      expect(h.subagentNotices.take('agent-7')).toBeUndefined();
      expect(h.streamed).toHaveLength(1);
      expect(h.streamed[0]).toContain(`Its progress notes (host-generated, inferred) are at ${notesPath()}.`);
      expect(fs.readFileSync(notesPath(), 'utf8')).toContain('host-generated, inferred');
    });

    it('normal completion attaches one handoff to the parent result and suppresses queued fallback', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, spawn({ description: 'Test handoff', prompt: 'Finish task' }));
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      await h.monitor.finishWarnedAgent(SESSION, 'agent-7');

      const handoff = h.monitor.takeNormalHandoff(SESSION, TOOL_CALL);
      expect(handoff).toContain("Ptah's subagent budget monitor handed off");
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toBeUndefined();
      await h.monitor.observe(SESSION, toolResult());
      expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
      expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
      expect(h.recordStore.markInvoked).toHaveBeenCalledWith(TOOL_CALL);
      expect(h.index.publish).toHaveBeenCalledTimes(1);
    });

    it('keeps the notes gate when the safety stop has no task id, then retries after the id arrives', async () => {
      const h = makeHarness({ agentId: 'agent-7', taskId: undefined }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      const denialAt = Date.now();
      for (let i = 0; i < 3; i += 1) {
        expect(await h.monitor.checkNotesTool(SESSION, 'agent-7', 'Read', {}, denialAt + i * 2_001)).toContain('End your turn now');
      }
      await waitUntil(() => h.logger.warn.mock.calls.some((call) => String(call[0]).includes('stop deferred')));
      expect(h.monitor.hasNotesGate('agent-7')).toBe(true);
      expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-late', 'Explore');
      await h.monitor.checkNotesTool(SESSION, 'agent-7', 'Read', {}, denialAt + 6_003);
      await waitUntil(() => h.dispatcher.stopSubagent.mock.calls.length === 1);
      await waitUntil(() => !h.monitor.hasNotesGate('agent-7'));
    });

    it('keeps the notes gate after a rejected safety stop and retries', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      h.dispatcher.stopSubagent.mockRejectedValueOnce(new Error('busy'));
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      const denialAt = Date.now();
      for (let i = 0; i < 3; i += 1) await h.monitor.checkNotesTool(SESSION, 'agent-7', 'Read', {}, denialAt + i * 2_001);
      await waitUntil(() => h.logger.warn.mock.calls.some((call) => String(call[0]).includes('gate remains active')));
      expect(h.monitor.hasNotesGate('agent-7')).toBe(true);
      await h.monitor.checkNotesTool(SESSION, 'agent-7', 'Read', {}, denialAt + 6_003);
      await waitUntil(() => h.dispatcher.stopSubagent.mock.calls.length === 2);
      await waitUntil(() => !h.monitor.hasNotesGate('agent-7'));
    });

    it('returns a denial before stopTask settles and clears the watchdog on release', async () => {
      jest.useFakeTimers();
      try {
        const h = makeHarness({ agentId: 'agent-7' }, { workspace });
        await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
        let finishStop: () => void = () => undefined;
        h.dispatcher.stopSubagent.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStop = resolve; }));
        const startedAt = Date.now();
        await h.monitor.checkNotesTool(SESSION, 'agent-7', 'Read', {}, startedAt);
        await h.monitor.checkNotesTool(SESSION, 'agent-7', 'Read', {}, startedAt + 2_001);
        const reason = await h.monitor.checkNotesTool(SESSION, 'agent-7', 'Read', {}, startedAt + 4_002);
        expect(reason).toContain('End your turn now');
        expect(h.monitor.hasNotesGate('agent-7')).toBe(true);
        const activeTimers = jest.getTimerCount();
        expect(activeTimers).toBeGreaterThan(0);
        h.monitor.release(SESSION);
        expect(jest.getTimerCount()).toBeLessThan(activeTimers);
        finishStop();
      } finally {
        jest.useRealTimers();
      }
    });

    it('normal exit without a task id writes inferred notes and hands off in memory', async () => {
      const h = makeHarness({ agentId: 'agent-7', taskId: undefined }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      await h.monitor.finishWarnedAgent(SESSION, 'agent-7');
      expect(h.monitor.hasNotesGate('agent-7')).toBe(false);
      expect(fs.readFileSync(notesPath(), 'utf8')).toContain('host-generated, inferred');
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toContain('Continue unfinished work autonomously now');
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toBeUndefined();
      expect(h.logger.warn.mock.calls.filter((call) => String(call[0]).includes('Normal exit has no task id'))).toHaveLength(1);
    });

    it('normal exit with a failed record write still supplies inferred notes and an in-memory handoff', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      h.recordStore.writeOnce.mockResolvedValueOnce({ ok: false, errorType: 'Unavailable', errorCode: 'EIO' });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      await h.monitor.finishWarnedAgent(SESSION, 'agent-7');
      expect(h.monitor.hasNotesGate('agent-7')).toBe(false);
      expect(fs.readFileSync(notesPath(), 'utf8')).toContain('host-generated, inferred');
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toContain('Its progress notes (host-generated, inferred) are at');
      expect(h.recordStore.markInvoked).not.toHaveBeenCalled();
      expect(h.logger.warn.mock.calls.filter((call) => String(call[0]).includes('delivering in-memory handoff'))).toHaveLength(1);
    });

    it('does not send a normal handoff after its session is released during preparation', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      let finishWrite: (value: HandoffRecordWrite) => void = () => undefined;
      h.recordStore.writeOnce.mockImplementationOnce(() => new Promise<HandoffRecordWrite>((resolve) => { finishWrite = resolve; }));
      const finishing = h.monitor.finishWarnedAgent(SESSION, 'agent-7');
      await waitUntil(() => h.recordStore.writeOnce.mock.calls.length === 1);
      h.monitor.release(SESSION);
      finishWrite({ ok: false, errorType: 'Unavailable', errorCode: 'EIO' });
      await finishing;
      expect(h.monitor.hasNotesGate('agent-7')).toBe(false);
      expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
      expect(h.index.publish).not.toHaveBeenCalled();
    });

    it('queues the normal handoff if the parent Agent hook did not run', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, spawn({ description: 'Test handoff', prompt: 'Finish task' }));
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      await h.monitor.finishWarnedAgent(SESSION, 'agent-7');
      await h.monitor.observe(SESSION, toolResult());
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toBeUndefined();
      expect(h.index.publish).toHaveBeenCalledTimes(1);
    });

    it('does not duplicate the interrupted handoff when the parent tool result precedes the failure hook', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, spawn({ description: 'Review task' }));
      await h.monitor.observe(SESSION, atContext(310_000, 'm1'));
      await h.monitor.observe(SESSION, toolResult());
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.monitor.takeInterruptedHandoff(SESSION, TOOL_CALL)).toContain("Ptah's subagent budget monitor");
    });

    it('does not queue the interrupted handoff after the failure hook has claimed it', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, spawn({ description: 'Review task' }));
      await h.monitor.observe(SESSION, atContext(310_000, 'm1'));
      expect(h.monitor.takeInterruptedHandoff(SESSION, TOOL_CALL)).toContain("Ptah's subagent budget monitor");
      await h.monitor.observe(SESSION, toolResult());
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.monitor.takeInterruptedHandoff(SESSION, TOOL_CALL)).toContain("Ptah's subagent budget monitor");
    });

    it('repairs an interrupted parent result while stopTask is still pending', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      let finishStop: () => void = () => undefined;
      h.dispatcher.stopSubagent.mockImplementationOnce(() => new Promise<void>((resolve) => { finishStop = resolve; }));
      const observing = h.monitor.observe(SESSION, atContext(310_000, 'm1'));
      await waitUntil(() => h.dispatcher.stopSubagent.mock.calls.length === 1);
      expect(h.monitor.getAgentBudgetState(TOOL_CALL, SESSION)?.stopState).toBe('pending');
      expect(h.monitor.takeInterruptedHandoff(SESSION, TOOL_CALL)).toContain('continue autonomously now');
      finishStop();
      await observing;
      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
    });

    it('the hard stop points the fresh subagent at the notes the warned subagent wrote', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      fs.mkdirSync(path.dirname(notesPath()), { recursive: true });
      fs.writeFileSync(notesPath(), 'next: wire the guard');
      await h.monitor.observe(SESSION, atContext(310_000, 'm2'));

      expect(h.streamed[0]).toContain(
        `"Read ${notesPath()} first and continue from it; do not redo finished work. This handoff is saved at`,
      );
    });

    it('redacts agent-written notes before the parent receives the handoff', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      fs.mkdirSync(path.dirname(notesPath()), { recursive: true });
      const marker = fake('API_KEY=', 'fake', '-marker-123');
      fs.writeFileSync(notesPath(), `Finding: ${marker}\nBasic usage`);
      h.dispatcher.stopSubagent.mockImplementation(async () => {
        expect(fs.readFileSync(notesPath(), 'utf8')).toContain(marker);
      });

      await h.monitor.observe(SESSION, atContext(310_000, 'm2'));

      expect(fs.readFileSync(notesPath(), 'utf8')).toBe('Finding: API_KEY=[redacted]\nBasic usage');
      expect(h.streamed[0]).toContain(notesPath());
    });

    it('redacts agent-written key-value notes on normal exit and saves the handoff record', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'normal-notes'));
      fs.mkdirSync(path.dirname(notesPath()), { recursive: true });
      fs.writeFileSync(notesPath(), 'Progress: read ten files\napi_key=PLACEHOLDER_NOT_A_SECRET\nNext: read remaining files');

      await h.monitor.finishWarnedAgent(SESSION, 'agent-7');

      expect(fs.readFileSync(notesPath(), 'utf8')).toBe('Progress: read ten files\napi_key=[redacted]\nNext: read remaining files');
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toContain('This handoff is saved at');
    });

    it('release drops a warning no tool result drained', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      h.monitor.release(SESSION);

      expect(h.subagentNotices.take('agent-7')).toBeUndefined();
    });
  });
});

/**
 * Yield to I/O until `done()` holds (bounded). Real file writes on a loaded CI
 * runner can need far more than a few thousand turns; the loop exits as soon as
 * `done()` holds, so the high bound only matters on the failure path.
 */
async function waitUntil(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200_000 && !done(); i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!done()) {
    throw new Error('condition not reached');
  }
}

/** The record file name of a successful write. */
function savedName(write: HandoffRecordWrite): string {
  if (!write.ok) {
    throw new Error(`record not saved: ${write.errorType}`);
  }
  return path.basename(write.path);
}

function quietLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

describe('SubagentBudgetMonitor handoff records', () => {
  const over = (id: string) => assistant({ input: 310_000 }, { id });
  async function gateAttempt(
    h: ReturnType<typeof makeHarness>,
    id: string,
    done: () => boolean = () => h.recordStore.writeOnce.mock.calls.length > 0,
    settle = true,
  ): Promise<void> {
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id }));
    expect(h.monitor.hasNotesGate('a1')).toBe(true);
    const denialAt = Date.now();
    for (let i = 0; i < 3; i += 1) {
      await h.monitor.checkNotesTool(SESSION, 'a1', 'Read', {}, denialAt + i * 2_001);
    }
    if (settle) {
      await waitUntil(done);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  const failed = (errorCode?: string): HandoffRecordWrite => ({
    ok: false,
    errorType: errorCode ? 'Error' : 'Timeout',
    errorCode,
  });
  const warnings = (logger: { warn: jest.Mock }, text: string) =>
    logger.warn.mock.calls.filter(([message]) =>
      String(message).includes(text),
    );

  let workspace: string;
  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-records-'));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('writes the record before the stop, marks it invoked, then stops, publishes, pushes and leaves a stub', async () => {
    const h = makeHarness();
    await h.monitor.observe(
      SESSION,
      spawn({ description: 'Map auth', prompt: 'Map the auth module' }),
    );
    await h.monitor.observe(SESSION, toolResult());
    await h.monitor.observe(SESSION, over('m1'));

    expect(h.order).toEqual([
      'writeOnce',
      'markInvoked',
      'stopSubagent',
      'push',
    ]);
    const write = (await h.recordStore.writeOnce.mock.results[0]
      .value) as HandoffRecordWrite;
    if (!write.ok) {
      throw new Error('fake write failed');
    }
    expect(h.index.publish).toHaveBeenCalledWith(write.workspace, write.name);
    const [publishOrder] = h.index.publish.mock.invocationCallOrder;
    expect(publishOrder).toBeGreaterThan(
      h.dispatcher.stopSubagent.mock.invocationCallOrder[0],
    );
    expect(publishOrder).toBeLessThan(
      h.dispatcher.pushParentMessage.mock.invocationCallOrder[0],
    );
    expect(h.streamed[0]).toContain(
      `This handoff is saved at \`${write.path}\``,
    );
    expect(h.recordStore.writeStub).toHaveBeenCalledWith(
      'Map the auth module',
      'Explore',
      write.path,
    );
    expect(h.recordStore.withdraw).not.toHaveBeenCalled();
  });

  it('a foreground handoff is posted only after the record write and the stop', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, over('m1'));

    expect(h.order).toEqual([
      'writeOnce',
      'markInvoked',
      'stopSubagent',
      'push',
    ]);
  });

  it.each([
    ['a write error', failed('EACCES')],
    ['the write timeout', failed()],
  ])(
    'after %s stops nothing; the next request retries the write, then stops',
    async (_label, failure) => {
      const h = makeHarness({}, { workspace });
      h.recordStore.writeOnce.mockResolvedValueOnce(failure);

      await gateAttempt(h, 'm1');
      // Another content block of the request whose write failed: no retry.
      await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'm1' }));
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
      expect(h.streamed).toHaveLength(0);
      expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.stopped).toBe(false);

      await gateAttempt(h, 'm2', () => h.recordStore.writeOnce.mock.calls.length === 2);
      await waitUntil(() => h.streamed.length === 1);
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(2);
      expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
      expect(h.streamed).toHaveLength(1);
      expect(warnings(h.logger, 'not saved after 3 attempts')).toHaveLength(0);
    },
  );

  it('a record write that completes after its timeout is unlinked and stops nothing', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let reached: () => void = () => undefined;
    const publishing = new Promise<void>((resolve) => (reached = resolve));
    let complete: () => void = () => undefined;
    const published = new Promise<void>((resolve) => (complete = resolve));
    let publishedPath = '';
    let temporaryPath = '';
    const records = new SubagentHandoffRecords(quietLogger(), () => workspace);
    // Hold the final publish until the monitor's record timeout has elapsed.
    Object.defineProperty(records, 'publishComplete', {
      value: async (recordPath: string, content: string): Promise<void> => {
        temporaryPath = `${recordPath}.tmp`;
        await fs.promises.writeFile(temporaryPath, content);
        reached();
        await gate;
        await fs.promises.link(temporaryPath, recordPath);
        await fs.promises.unlink(temporaryPath);
        publishedPath = recordPath;
        expect(fs.existsSync(recordPath)).toBe(true);
        complete();
      },
    });
    const writeSpy = jest.spyOn(records, 'writeOnce');
    const h = makeHarness({}, { records, workspace });

    const first = gateAttempt(h, 'm1', () => true, false);
    await publishing;
    expect(writeSpy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(HANDOFF_FILES_TIMEOUT_MS);
    await first;
    expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    expect(h.index.publish).not.toHaveBeenCalled();

    open();
    jest.useRealTimers();
    await published;
    // The record published after the timeout is withdrawn by the real record store.
    await waitUntil(() => !fs.existsSync(publishedPath));
    expect(fs.existsSync(temporaryPath)).toBe(false);
    expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
  }, 30_000);

  it(`after ${MAX_RECORD_ATTEMPTS} failed writes: one warn, no handoff stop, and the later safety stop runs without a record`, async () => {
    const h = makeHarness({}, { workspace });
    h.recordStore.writeOnce.mockResolvedValue(failed('EIO'));
    for (let i = 1; i <= MAX_RECORD_ATTEMPTS + 2; i += 1) {
      await gateAttempt(h, `m${i}`, () => h.recordStore.writeOnce.mock.calls.length >= Math.min(i, MAX_RECORD_ATTEMPTS));
    }

    expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(MAX_RECORD_ATTEMPTS);
    expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    expect(warnings(h.logger, 'not saved after 3 attempts')).toHaveLength(1);

    // Output weight 5: 600 000 output tokens reach the 3 000 000 safety limit.
    await h.monitor.observe(
      SESSION,
      assistant({ input: 310_000, output: 600_000 }, { id: 'm-safety' }),
    );
    expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(
      MAX_RECORD_ATTEMPTS + 1,
    );
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.recordStore.markInvoked).not.toHaveBeenCalled();
    expect(h.index.publish).not.toHaveBeenCalled();
    expect(
      warnings(h.logger, 'Safety stop without a durable record'),
    ).toHaveLength(1);
    expect(h.streamed).toHaveLength(1);
    expect(h.streamed[0]).not.toContain('This handoff is saved at');
  });

  it('counts and stops when progress capture throws', async () => {
    const h = makeHarness();
    const capture = jest.fn(() => { throw new Error('capture failed'); });
    Object.defineProperty(h.monitor, 'captureProgress', { value: capture });
    await h.monitor.observe(SESSION, assistant({ output: 600_000 }, { id: 'capture-1' }));
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.weightedUsed).toBeGreaterThanOrEqual(STOP_WEIGHTED);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.logger.error).toHaveBeenCalledWith(
      '[SubagentBudgetMonitor] Progress capture failed',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('a safety stop whose record write fails still stops and hands off in memory (B2)', async () => {
    const h = makeHarness();
    h.recordStore.writeOnce.mockResolvedValueOnce(failed('ENOSPC'));
    await h.monitor.observe(
      SESSION,
      assistant({ output: 600_000 }, { id: 'm1' }),
    );

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.streamed).toHaveLength(1);
    expect(h.recordStore.writeStub).not.toHaveBeenCalled();
    const [warned] = warnings(h.logger, 'Safety stop without a durable record');
    expect(warned[1]).toEqual(
      expect.objectContaining({ errorType: 'Error', errorCode: 'ENOSPC' }),
    );
    expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain(
      'budget monitor stopped',
    );
  });

  it('release while the record is written withdraws it and stops nothing', async () => {
    const h = makeHarness();
    const observed = jest.fn();
    h.budgetStops.register(observed);
    let finish: (write: HandoffRecordWrite) => void = () => undefined;
    let reached: () => void = () => undefined;
    const writing = new Promise<void>((resolve) => (reached = resolve));
    h.recordStore.writeOnce.mockImplementationOnce(
      () =>
        new Promise<HandoffRecordWrite>((resolve) => {
          finish = resolve;
          reached();
        }),
    );
    const first = h.monitor.observe(SESSION, over('m1'));
    await writing;
    expect(h.monitor.getAgentBudgetState(TOOL_CALL, SESSION)?.stopState).toBe('pending');
    h.monitor.release(SESSION);
    finish({
      ok: true,
      path: path.join(RECORD_WORKSPACE, 'r.handoff.md'),
      workspace: RECORD_WORKSPACE,
      name: 'r.handoff.md',
    });
    await first;

    expect(h.recordStore.withdraw).toHaveBeenCalledWith(
      TOOL_CALL,
      path.join(RECORD_WORKSPACE, 'r.handoff.md'),
    );
    expect(h.recordStore.markInvoked).not.toHaveBeenCalled();
    expect(h.dispatcher.stopSubagent).not.toHaveBeenCalled();
    expect(observed).not.toHaveBeenCalled();
    expect(h.index.publish).not.toHaveBeenCalled();
    expect(h.streamed).toHaveLength(0);
  });

  it('a rejected stop keeps and publishes its record; the retry reuses it without a second write', async () => {
    const h = makeHarness();
    h.dispatcher.stopSubagent.mockRejectedValueOnce(new Error('busy'));

    await h.monitor.observe(SESSION, over('m1'));
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(1);
    expect(h.index.publish).toHaveBeenCalledTimes(1);
    expect(h.recordStore.withdraw).not.toHaveBeenCalled();
    expect(h.streamed).toHaveLength(0);

    await h.monitor.observe(SESSION, over('m2'));
    expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(2);
    expect(h.streamed).toHaveLength(1);
    expect(h.streamed[0]).toContain('This handoff is saved at');
  });

  it(`stops rejected ${MAX_STOP_ATTEMPTS} times: one write, the record kept, one give-up warn, no handoff`, async () => {
    const h = makeHarness();
    h.dispatcher.stopSubagent.mockRejectedValue(new Error('busy'));
    for (let i = 1; i <= MAX_STOP_ATTEMPTS + 1; i += 1) {
      await h.monitor.observe(SESSION, over(`m${i}`));
    }

    expect(h.dispatcher.stopSubagent).toHaveBeenCalledTimes(MAX_STOP_ATTEMPTS);
    expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
    expect(h.recordStore.withdraw).not.toHaveBeenCalled();
    expect(
      warnings(
        h.logger,
        'Stopping the subagent failed; giving up, record kept',
      ),
    ).toHaveLength(1);
    expect(h.streamed).toHaveLength(0);
  });

  it('two in-flight stops of one tool id reserved under different sessions, then rekeyed, write one record file and publish one name', async () => {
    const records = new SubagentHandoffRecords(quietLogger(), () => workspace);
    const writeOnce = jest.spyOn(records, 'writeOnce');
    const h = makeHarness({}, { records });

    const a = h.monitor.observe('session-a', over('a1'));
    const b = h.monitor.observe('session-b', over('b1'));
    await waitUntil(() => writeOnce.mock.calls.length === 2);
    expect(writeOnce.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      'session-a',
      'session-b',
    ]);
    h.monitor.rekey('session-a', 'session-b');
    await Promise.all([a, b]);

    const files = fs
      .readdirSync(path.join(workspace, '.ptah', 'subagent-handoffs'))
      .filter((name) => name.endsWith(HANDOFF_RECORD_SUFFIX));
    expect(files).toHaveLength(1);
    expect(new Set(h.index.publish.mock.calls.map(([, name]) => name))).toEqual(
      new Set(files),
    );
    expect(h.streamed).toHaveLength(1);
  });

  describe('handoffPointer', () => {
    function pointerHarness() {
      const logger = quietLogger();
      const records = new SubagentHandoffRecords(logger, () => workspace);
      const index = new SubagentHandoffIndex(logger);
      const h = makeHarness({}, { records, index });
      return { h, records };
    }
    /** Make `sessionId` a live session of the monitor. */
    const live = (h: ReturnType<typeof makeHarness>, sessionId: string) =>
      h.monitor.observe(sessionId, assistant({ input: 10 }, { id: sessionId }));

    it('live sessions `a.b` and `a_b` each see only their own record; a released owner is foreign', async () => {
      const { h, records } = pointerHarness();
      await live(h, 'a.b');
      await live(h, 'a_b');
      expect(ownerHash('a.b')).not.toBe(ownerHash('a_b'));
      const dotted = savedName(
        await records.writeOnce('a.b', 'toolu_dot', 'handoff of a.b'),
      );
      const underscored = savedName(
        await records.writeOnce('a_b', 'toolu_under', 'handoff of a_b'),
      );

      const forDotted = await h.monitor.handoffPointer('a.b', undefined);
      expect(forDotted).toContain(dotted);
      expect(forDotted).not.toContain(underscored);
      expect(forDotted).not.toContain('from another');
      const forUnderscored = await h.monitor.handoffPointer('a_b', undefined);
      expect(forUnderscored).toContain(underscored);
      expect(forUnderscored).not.toContain(dotted);
      expect(forDotted).not.toContain('handoff of');

      h.monitor.release('a_b');
      const afterRelease = await h.monitor.handoffPointer('a.b', undefined);
      // The rotating cursor resumes after the record named last.
      const next = await h.monitor.handoffPointer('a.b', undefined);
      expect(`${afterRelease}\n${next}`).toContain(
        `${underscored} (from another or an ended session`,
      );
      expect(`${afterRelease}\n${next}`).toContain(dotted);
    });

    it('a record written under an id later rekeyed is the new id’s own', async () => {
      const { h, records } = pointerHarness();
      await live(h, 'A');
      const name = savedName(
        await records.writeOnce('A', 'toolu_a', 'handoff of A'),
      );
      h.monitor.rekey('A', 'A2');

      const pointer = await h.monitor.handoffPointer('A2', undefined);
      expect(pointer).toContain(name);
      expect(pointer).not.toContain('from another');
    });
  });

  it('states the safety-stop limit (B2) in the class doc comment', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'subagent-budget-monitor.ts'),
      'utf8',
    );
    const classAt = source.indexOf('export class SubagentBudgetMonitor');
    const docStart = source.lastIndexOf('/**', classAt);
    const doc = source
      .slice(docStart, classAt)
      .replace(/\s*\n\s*\*\s?/g, ' ')
      .replace(/\s+/g, ' ');
    expect(doc).toContain(
      'A safety (cost) stop does not wait for a durable record: when its ' +
        'record write fails, the handoff travels only through the in-memory ' +
        'send, so it is lost only if both the disk write and that send fail.',
    );
  });
});

describe('readSubagentTaskText', () => {
  it('joins the description and a capped prompt excerpt', () => {
    expect(readSubagentTaskText({ description: ' D ', prompt: ' P ' })).toBe(
      'D: P',
    );
    expect(readSubagentTaskText({ prompt: 'p'.repeat(301) })).toBe(
      `${'p'.repeat(300)}...`,
    );
    expect(readSubagentTaskText({ description: 'only' })).toBe('only');
    expect(readSubagentTaskText({ description: 3 })).toBeUndefined();
    expect(readSubagentTaskText(undefined)).toBeUndefined();
  });
});

describe('subagent request context tokens', () => {
  it('parses the sanitized AS10 subagent transcript fixture', () => {
    const line = fs
      .readFileSync(
        path.join(
          __dirname,
          '__fixtures__',
          'as10-subagent-assistant-usage.jsonl',
        ),
        'utf8',
      )
      .trim();
    const raw = JSON.parse(line) as {
      message: { usage: Record<string, number> };
    };
    const usage = readSubagentRequestUsage(raw);

    expect(usage).toBeDefined();
    if (!usage) return;
    const u = raw.message.usage;
    expect(requestContextTokens(usage)).toBe(
      u['input_tokens'] +
        u['cache_read_input_tokens'] +
        u['cache_creation_input_tokens'],
    );
    expect(requestContextTokens(usage)).toBeGreaterThan(0);
  });
});

describe('adviseSubagentResume', () => {
  const warm: SubagentResumeAdviceInput = {
    stopped: false,
    cacheState: 'warm',
    contextTokens: 10_000,
    handoffTokens: HANDOFF_TOKENS,
    budgetReached: false,
  };

  it.each<[string, Partial<SubagentResumeAdviceInput>]>([
    ['stopped', { stopped: true }],
    ['cold', { cacheState: 'cold' }],
    ['context at the handoff size', { contextTokens: HANDOFF_TOKENS }],
    ['budget reached', { budgetReached: true }],
  ])('is fresh when %s', (_label, change) => {
    expect(adviseSubagentResume({ ...warm, ...change })).toBe('fresh');
  });

  it('is resume for a warm, small, running subagent', () => {
    expect(adviseSubagentResume(warm)).toBe('resume');
    expect(adviseSubagentResume({ ...warm, contextTokens: undefined })).toBe(
      'resume',
    );
  });
});
