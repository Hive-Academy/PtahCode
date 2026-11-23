import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  Logger,
  SubagentRegistryService,
} from '@ptah-extension/vscode-core';
import { Logger as LoggerClass } from '@ptah-extension/vscode-core';
import {
  formatHandoffNormalReturn,
  formatHandoffNotesDelay,
  formatHandoffRecordFailure,
  registerProviderPricing,
  resetPricingMapForTesting,
  type SubagentRecord,
} from '@ptah-extension/shared';
import type { CompactionConfigProvider } from '../compaction-config-provider';
import { MainThreadNoticeQueue } from '../main-thread-notice-queue';
import { NOTES_GATE_TIMEOUT_MS } from './subagent-notes-gate';
import { SubagentBudgetStopCallbackRegistry } from '../subagent-budget-stop-callback-registry';
import { SubagentHandoffFiles } from './subagent-handoff-files';
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
  buildBudgetResumeRefusal,
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
    disposeUnsafe: jest.fn(async (_toolCallId: string, _recordPath: string) => {
      order.push('disposeUnsafe');
    }),
    markScrubbed: jest.fn(async () => true),
    publishIfOwned: jest.fn((_toolCallId: string, _recordPath: string, publish: () => void) => {
      publish();
      return true;
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
    stopWeightedTokens?: number;
    workspace?: string;
    handoffFiles?: SubagentHandoffFilesPort;
    records?: SubagentHandoffRecordsPort;
    index?: SubagentHandoffIndexPort;
    lookupTranscript?: typeof resolveSubagentTranscriptPath;
    /** Model the SDK ending the agent: SubagentStop right after a message that asked or paused it. */
    returnWhenAsked?: boolean;
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
      stopWeightedTokens: opts.stopWeightedTokens ?? STOP_WEIGHTED,
      maxDurationMin: opts.maxDurationMin ?? 90,
    })),
    getConfig: jest.fn(() => ({
      enabled: opts.enabled ?? true,
      subagentHandoffTokens: opts.handoffTokens ?? HANDOFF_TOKENS,
      subagentStopWeightedTokens: opts.stopWeightedTokens ?? STOP_WEIGHTED,
    })),
  };
  // Every handoff the monitor delivered, by either route.
  const streamed: string[] = [];
  const notices = new MainThreadNoticeQueue(logger as unknown as Logger);
  const subagentNotices = new SubagentNoticeQueue();
  const dispatcher = {
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
    announceSubagentNotice: jest.fn(),
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
    hasHeldUnboundStart: jest.fn((_agentId: string, _parentSessionId: string) => false),
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
  createdMonitors.push(monitor);
  if (opts.returnWhenAsked) {
    const observe = monitor.observe.bind(monitor);
    monitor.observe = async (sessionId, message, route) => {
      await observe(sessionId, message, route);
      const agentId = registry.get(TOOL_CALL)?.agentId;
      if (agentId && monitor.notesGatePhase(agentId)) await monitor.finishWarnedAgent(sessionId, agentId, 'completed');
    };
  }
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

/** A harness whose subagent returns normally as soon as it is asked or paused. */
function makeReturningHarness(
  record: Partial<SubagentRecord> | null = {},
  opts: Parameters<typeof makeHarness>[1] = {},
) {
  return makeHarness(record, { ...opts, returnWhenAsked: true });
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

/**
 * Every monitor a test built. A monitor a test leaves running keeps REAL
 * timers (the 1 s notes-gate watchdog re-arms itself, plus deadline and
 * stop-retry timers). Under machine load such a timer fires inside a LATER
 * test, and its callback arms new timers on that test's fake clock, which a
 * `jest.getTimerCount()` assertion then counts. Releasing the sessions after
 * every test clears all of them, so no timer outlives its test.
 */
const createdMonitors: SubagentBudgetMonitor[] = [];
const SESSIONS_USED = [SESSION, 'session-2', 'session-rekeyed'];

afterEach(() => {
  jest.useRealTimers();
  for (const monitor of createdMonitors.splice(0)) {
    for (const sessionId of SESSIONS_USED) monitor.release(sessionId);
  }
});

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

  it('ignores the old registry teammate name after a same-name replacement spawns', async () => {
    const h = makeHarness({ teammateName: 'reviewer' });
    await h.monitor.observe(SESSION, assistant({ input: 310_000, output: 600_000 }, { id: 'old-stop' }));
    await h.monitor.observe(SESSION, {
      type: 'assistant', parent_tool_use_id: null,
      message: { content: [{ type: 'tool_use', id: 'new-call', name: 'Agent', input: { name: 'reviewer' } }] },
    });
    expect(h.monitor.getAgentBudgetState('reviewer', SESSION)?.stopped).not.toBe(true);
  });

  it('keeps one request charge and one ask across a late task id', async () => {
    const h = makeHarness({ taskId: undefined }, { workspace: RECORD_WORKSPACE, stopWeightedTokens: 100_000 });
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'warn-unknown' }));
    const before = h.monitor.getSnapshot(SESSION, TOOL_CALL)?.weightedUsed;
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-later');
    await h.monitor.observe(SESSION, assistant({ input: 130_000 }, { id: 'warn-unknown' }));
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.weightedUsed).toBe(before);
    expect(h.monitor.notesGatePhase('a1')).toBe('asked');
    expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
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

  it('tracks tool result outcomes and keeps only the last ten tool calls', async () => {
    const h = makeReturningHarness();
    const progress = assistant({ input: 100 }, { id: 'progress' }) as { message: { content: unknown[] } };
    progress.message.content = Array.from({ length: 12 }, (_, index) => ({
      type: 'tool_use', id: `call-${index}`, name: 'Read', input: { file_path: `file-${index}.txt` },
    }));
    await h.monitor.observe(SESSION, progress);
    await h.monitor.observe(SESSION, {
      type: 'user', parent_tool_use_id: TOOL_CALL,
      message: { content: [{ type: 'tool_result', tool_use_id: 'call-11', is_error: true }] },
    });
    await h.monitor.observe(SESSION, assistant({ input: 310_000, output: 600_000 }, { id: 'stop-tools' }));
    const record = h.recordStore.writeOnce.mock.calls[0][2];
    expect(record).toContain('file-11.txt');
    expect(record).toContain('failed');
    expect(record).not.toContain('file-0.txt');
    expect(record).not.toContain('file-1.txt');
  });
  it('redacts a long private key before applying the progress text cap', async () => {
    const h = makeReturningHarness();
    const progress = assistant({ input: 310_000, output: 600_000 }, { id: 'stop-pem' }) as { message: { content: unknown[] } };
    const secret = 'Q'.repeat(3000);
    progress.message.content = [{ type: 'text', text: `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----` }];
    await h.monitor.observe(SESSION, progress);
    const record = h.recordStore.writeOnce.mock.calls[0][2];
    expect(record).not.toContain(secret.slice(0, 100));
    expect(record).toContain('[redacted private key]');
  });

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

  it('release after rekey forgets notices recorded under both session ids', () => {
    const h = makeHarness();
    h.stopNotices.record(SESSION, 'task-old', 'old notice');
    h.monitor.rekey(SESSION, 'session-2');
    h.stopNotices.record('session-2', 'task-new', 'new notice');

    h.monitor.release('session-2');

    expect(h.stopNotices.noticeFor('task-old')).toBeUndefined();
    expect(h.stopNotices.noticeFor('task-new')).toBeUndefined();
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

  it('release forgets the session', async () => {
    const h = makeHarness();
    await h.monitor.observe(SESSION, assistant({ input: 10 }));
    h.monitor.release(SESSION);
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)).toBeUndefined();
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

    it('normal background exit writes a record when the SDK gives no task id', async () => {
      const h = makeHarness({ agentId: 'agent-7', taskId: undefined }, { workspace });
      await h.monitor.observe(SESSION, spawn({ description: 'Review remaining files' }));
      await h.monitor.observe(SESSION, toolResult());
      await h.monitor.observe(SESSION, atContext(130_000, 'background-warning'));
      await h.monitor.finishWarnedAgent(SESSION, 'agent-7', 'completed');
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.recordStore.markInvoked).toHaveBeenCalledWith(TOOL_CALL);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
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

    it('normal exit without a task id writes inferred notes and hands off in memory', async () => {
      const h = makeHarness({ agentId: 'agent-7', taskId: undefined }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      await h.monitor.finishWarnedAgent(SESSION, 'agent-7', 'completed');
      expect(h.monitor.hasNotesGate('agent-7')).toBe(false);
      expect(fs.readFileSync(notesPath(), 'utf8')).toContain('host-generated, inferred');
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toContain('Continue unfinished work autonomously now');
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toBeUndefined();
      expect(h.logger.warn.mock.calls.filter((call) => String(call[0]).includes('Normal exit has no task id'))).toHaveLength(1);
    });

    it('ignores old SDK outcomes and starts for a resumed task', async () => {
      const h = makeHarness({}, { workspace });
      await h.monitor.observe(SESSION, spawn({ run_in_background: true }));
      await h.monitor.observe(SESSION, toolResult());
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-1', undefined, 'run-1');
      await h.monitor.observe(SESSION, atContext(310_000, 'request-1'));
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-1', undefined, 'run-2');
      expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.contextTokens).toBe(0);
      await h.monitor.observe(SESSION, atContext(310_000, 'request-2'));

      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-1', undefined, 'run-1');
      await h.monitor.recordTaskTerminal(SESSION, 'task-1', 'stopped', 'run-2', 'different-tool');
      for (const status of ['stopped', 'failed', 'completed'] as const) {
        await h.monitor.recordTaskTerminal(SESSION, 'task-1', status, 'run-1', TOOL_CALL);
      }
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      expect(h.recordStore.writeOnce).not.toHaveBeenCalled();

      await h.monitor.recordTaskTerminal(SESSION, 'task-1', 'completed', 'run-2', TOOL_CALL);
      expect(h.monitor.notesGatePhase('a1')).toBeUndefined();
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    });

    it('keeps the next invocation independent when the old record write completes late', async () => {
    const h = makeHarness({}, { workspace });
    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'old-task');
    await h.monitor.observe(SESSION, atContext(130_000, 'old-request'));
    let finishWrite: (value: HandoffRecordWrite) => void = () => undefined;
    h.recordStore.writeOnce.mockImplementationOnce(() => new Promise((resolve) => { finishWrite = resolve; }));
    const finishing = h.monitor.recordTaskTerminal(SESSION, 'old-task', 'completed');
    await waitUntil(() => h.recordStore.writeOnce.mock.calls.length === 1);

    h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'new-task');
    expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.contextTokens).toBe(0);
    await h.monitor.observe(SESSION, atContext(310_000, 'new-request'));
    finishWrite({ ok: true, path: path.join(workspace, 'old.md'), workspace, name: 'old.md' });
    await finishing;

    expect(h.recordStore.withdraw).toHaveBeenCalledWith(TOOL_CALL, path.join(workspace, 'old.md'));
    expect(h.index.publish).not.toHaveBeenCalled();
    expect(h.registry.update).not.toHaveBeenCalled();
    expect(h.monitor.notesGatePhase('a1')).toBe('paused');
    await h.monitor.recordTaskTerminal(SESSION, 'new-task', 'completed');
    expect(h.recordStore.writeOnce.mock.calls[1][1]).not.toBe(TOOL_CALL);
    expect(h.index.publish).toHaveBeenCalledTimes(1);
    expect(h.monitor.notesGatePhase('a1')).toBeUndefined();
  });

  it('publishes a safe normal-exit record when the session was released during preparation', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      let finishWrite: (value: HandoffRecordWrite) => void = () => undefined;
      h.recordStore.writeOnce.mockImplementationOnce(() => new Promise<HandoffRecordWrite>((resolve) => { finishWrite = resolve; }));
      const finishing = h.monitor.finishWarnedAgent(SESSION, 'agent-7', 'completed');
      await waitUntil(() => h.recordStore.writeOnce.mock.calls.length === 1);
      h.monitor.release(SESSION);
      finishWrite({ ok: true, path: path.join(workspace, 'record.md'), workspace, name: 'record.md' });
      await finishing;
      expect(h.index.publish).toHaveBeenCalledWith(workspace, 'record.md');
      expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
    });

    it('queues the normal handoff if the parent Agent hook did not run', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, spawn({ description: 'Test handoff', prompt: 'Finish task' }));
      await h.monitor.observe(SESSION, atContext(130_000, 'm1'));
      await h.monitor.finishWarnedAgent(SESSION, 'agent-7', 'completed');
      await h.monitor.observe(SESSION, toolResult());
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.monitor.takeNormalHandoff(SESSION, TOOL_CALL)).toBeUndefined();
      expect(h.index.publish).toHaveBeenCalledTimes(1);
    });

    it('redacts agent-written key-value notes on normal exit and saves the handoff record', async () => {
      const h = makeHarness({ agentId: 'agent-7' }, { workspace });
      await h.monitor.observe(SESSION, atContext(130_000, 'normal-notes'));
      fs.mkdirSync(path.dirname(notesPath()), { recursive: true });
      fs.writeFileSync(notesPath(), 'Progress: read ten files\napi_key=PLACEHOLDER_NOT_A_SECRET\nNext: read remaining files');

      await h.monitor.finishWarnedAgent(SESSION, 'agent-7', 'completed');

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
  const over = (id: string) => assistant({ input: 310_000, output: 600_000 }, { id });
  let workspace: string;
  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-records-'));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it.each(['scrub', 'publish'])('delivers an inline handoff when final %s fails', async (step) => {
    const h = makeHarness({ agentType: 'general-purpose' }, { workspace });
    if (step === 'scrub') h.recordStore.markScrubbed.mockResolvedValueOnce(false);
    else h.recordStore.publishIfOwned.mockReturnValueOnce(false);
    await h.monitor.observe(SESSION, spawn({ prompt: 'Inspect the source' }));
    await h.monitor.observe(SESSION, toolResult());
    const notes = path.join(workspace, '.ptah', 'subagent-handoffs', `${TOOL_CALL}.md`);
    const turn = over('inline-fallback') as { message: { content: unknown[] } };
    turn.message.content = [{ type: 'text', text: `Reviewed the source. Notes: ${notes} api_key=PLACEHOLDER_NOT_A_SECRET` }];
    await h.monitor.observe(SESSION, turn);
    await h.monitor.recordTaskTerminal(SESSION, 'task-1', 'completed');

    expect(h.recordStore.disposeUnsafe).toHaveBeenCalledTimes(1);
    expect(h.index.publish).not.toHaveBeenCalled();
    expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    const [, text] = h.dispatcher.pushParentMessage.mock.calls[0];
    expect(text).toContain(formatHandoffRecordFailure('a1'));
    expect(text).toContain('Reviewed the source');
    expect(text).toContain('api_key=[redacted]');
    expect(text).not.toContain(notes);
    expect(text).not.toContain('PLACEHOLDER_NOT_A_SECRET');
    expect(h.monitor.getAgentBudgetState('a1', SESSION)).toMatchObject({ lifecycle: 'settled' });
    expect(h.monitor.getAgentBudgetState('a1', SESSION)?.recordPath).toBeUndefined();
  });

  it('keeps an invoked shared record when a later final notes scrub fails', async () => {
    const records = new SubagentHandoffRecords(quietLogger(), () => workspace);
    const writeOnce = jest.spyOn(records, 'writeOnce');
    const paths = { notes: '/ws/private-notes.md', task: '/ws/task.md' };
    let redactions = 0;
    let failFirstFinal: (() => void) | undefined;
    const handoffFiles = {
      paths: jest.fn(() => paths), saveTask: jest.fn(async () => true),
      notesExist: jest.fn(async () => true),
      redactNotes: jest.fn(async () => {
        redactions += 1;
        if (redactions === 2) {
          return new Promise<boolean>((resolve) => { failFirstFinal = () => resolve(false); });
        }
        return true;
      }),
    };
    const h = makeReturningHarness({ agentId: 'a1' }, { records, handoffFiles });
    const first = h.monitor.observe('session-a', over('a1'));
    await waitUntil(() => failFirstFinal !== undefined);
    const second = h.monitor.observe('session-b', over('b1'));
    await second;
    const write = await writeOnce.mock.results[0].value as HandoffRecordWrite;
    if (!write.ok) throw new Error('record setup failed');
    expect(h.index.publish).toHaveBeenCalledWith(write.workspace, write.name);
    failFirstFinal?.();
    await first;
    expect(fs.existsSync(write.path)).toBe(true);
    expect(fs.readFileSync(write.path, 'utf8')).not.toContain(paths.notes);
  });

  it('omits handoff notes when their redaction fails before record creation', async () => {
    const paths = { notes: '/ws/secret-notes.md', task: '/ws/task.md' };
    const handoffFiles = {
      paths: jest.fn(() => paths),
      saveTask: jest.fn(async () => true),
      notesExist: jest.fn(async () => true),
      redactNotes: jest.fn(async () => false),
    };
    const h = makeReturningHarness({}, { handoffFiles });
    await h.monitor.observe(SESSION, over('m1'));
    const recordText = h.recordStore.writeOnce.mock.calls[0][2];
    expect(recordText).not.toContain(paths.notes);
    expect(h.streamed.join('\n')).not.toContain(paths.notes);
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('redaction failed'), expect.any(Error));
  });

  it('two in-flight stops of one tool id reserved under different sessions, then rekeyed, write one record file and publish one name', async () => {
    const records = new SubagentHandoffRecords(quietLogger(), () => workspace);
    const writeOnce = jest.spyOn(records, 'writeOnce');
    const h = makeReturningHarness({}, { records });

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
      const dottedRecord = await records.writeOnce('a.b', 'toolu_dot', 'handoff of a.b');
      const underscoredRecord = await records.writeOnce('a_b', 'toolu_under', 'handoff of a_b');
      const dotted = savedName(dottedRecord);
      const underscored = savedName(underscoredRecord);
      if (!dottedRecord.ok || !underscoredRecord.ok) throw new Error('expected records');
      expect(await records.markScrubbed('toolu_dot', dottedRecord.path)).toBe(true);
      expect(await records.markScrubbed('toolu_under', underscoredRecord.path)).toBe(true);

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
      const written = await records.writeOnce('A', 'toolu_a', 'handoff of A');
      const name = savedName(written);
      if (!written.ok) throw new Error('expected a record');
      expect(await records.markScrubbed('toolu_a', written.path)).toBe(true);
      h.monitor.rekey('A', 'A2');

      const pointer = await h.monitor.handoffPointer('A2', undefined);
      expect(pointer).toContain(name);
      expect(pointer).not.toContain('from another');
    });
  });
});

describe('cooperative budget: ask, pause and normal return', () => {
  let workspace: string;
  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-coop-'));
  });
  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });
  const notesPath = () =>
    path.join(workspace, '.ptah', 'subagent-handoffs', `${TOOL_CALL}.md`);
  const ctx = (tokens: number, id: string) => assistant({ input: tokens }, { id });
  const failedWrite: HandoffRecordWrite = { ok: false, errorType: 'Timeout' };
  const settings = (handoffContextTokens: number) => ({
    warnRatio: 0.85,
    handoffContextTokens,
    stopWeightedTokens: STOP_WEIGHTED,
    maxDurationMin: 90,
  });
  /** Spawn and return the launching tool result so the handoff is pushed, not queued. */
  async function launched(h: ReturnType<typeof makeHarness>): Promise<void> {
    await h.monitor.observe(SESSION, spawn({ description: 'Review files', prompt: 'Finish task' }));
    await h.monitor.observe(SESSION, toolResult());
  }

  it('has no forced stop anywhere in the source or the dispatcher port', () => {
    const source = fs.readFileSync(path.join(__dirname, 'subagent-budget-monitor.ts'), 'utf8');
    expect(source).not.toMatch(/stopSubagent|stopTask\(/);
    expect('stopSubagent' in makeHarness().dispatcher).toBe(false);
  });

  describe('thresholds', () => {
    it.each([false, true])('pauses an unbound foreground agent before its tool result (late hook: %s)', async (late) => {
      const h = makeHarness(null);
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'a1');
      h.registry.hasHeldUnboundStart.mockReturnValue(!late);
      await h.monitor.observe(SESSION, ctx(310_000, 'foreground'));
      if (late) {
        await expect(h.monitor.checkNotesTool(SESSION, 'a1', 'Bash', {})).resolves.toBeUndefined();
        h.registry.hasHeldUnboundStart.mockReturnValue(true);
      }
      await expect(h.monitor.checkNotesTool(SESSION, 'a1', 'Bash', {})).resolves.toMatch(/Ptah budget monitor paused/);
      await expect(h.monitor.checkPausedTool(SESSION, 'a1', 'Bash', {})).resolves.toMatch(/Ptah budget monitor paused/);
      expect(h.registry.hasHeldUnboundStart).toHaveBeenCalledWith('a1', SESSION);
    });

    it('asks at 85% of the handoff context and pauses at twice the limit', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, ctx(120_000, 'c0'));
      expect(h.monitor.notesGatePhase('a1')).toBeUndefined();
      await h.monitor.observe(SESSION, ctx(127_500, 'c1'));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
      await h.monitor.observe(SESSION, ctx(299_999, 'c2'));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      await h.monitor.observe(SESSION, ctx(300_000, 'c3'));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postMainThreadNotice.mock.calls[0][1]).toContain('a1');
      expect(h.monitor.getAgentBudgetState('a1', SESSION)?.admission).toBe('paused');
    });

    it('announces the ask and the pause to the UI without stopping the agent', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, ctx(127_500, 'c1'));
      expect(h.dispatcher.announceSubagentNotice).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.announceSubagentNotice).toHaveBeenLastCalledWith(
        SESSION,
        'a1',
        expect.objectContaining({ action: 'asked-handoff', reason: 'context-budget' }),
        expect.stringContaining('asked a1 for a handoff'),
      );
      await h.monitor.observe(SESSION, ctx(300_000, 'c3'));
      expect(h.dispatcher.announceSubagentNotice).toHaveBeenCalledTimes(2);
      expect(h.dispatcher.announceSubagentNotice).toHaveBeenLastCalledWith(
        SESSION,
        'a1',
        expect.objectContaining({ action: 'paused' }),
        expect.stringContaining('The execution remains live'),
      );
    });

    it('keeps the agent running when the UI sink throws', async () => {
      const h = makeHarness();
      h.dispatcher.announceSubagentNotice.mockImplementation(() => {
        throw new Error('sink down');
      });
      await expect(h.monitor.observe(SESSION, ctx(127_500, 'c1'))).resolves.toBeUndefined();
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
    });

    it('asks and pauses on weighted usage (weighted = 5 x output)', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, assistant({ output: 500_000 }, { id: 'w0' }));
      expect(h.monitor.notesGatePhase('a1')).toBeUndefined();
      await h.monitor.observe(SESSION, assistant({ output: 10_000 }, { id: 'w1' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      await h.monitor.observe(SESSION, assistant({ output: 690_000 }, { id: 'w2' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
    });

    it('asks and pauses on raw usage when weighted usage stays low', async () => {
      const h = makeHarness();
      for (let i = 0; i < 25; i += 1) await h.monitor.observe(SESSION, assistant({ cacheRead: 100_000 }, { id: `r${i}` }));
      expect(h.monitor.notesGatePhase('a1')).toBeUndefined();
      await h.monitor.observe(SESSION, assistant({ cacheRead: 100_000 }, { id: 'r25' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      for (let i = 26; i < 60; i += 1) await h.monitor.observe(SESSION, assistant({ cacheRead: 100_000 }, { id: `r${i}` }));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
    });

    it('asks and pauses on duration without stopping the agent', async () => {
      jest.useFakeTimers();
      const h = makeHarness();
      await h.monitor.observe(SESSION, ctx(10, 'd0'));
      await jest.advanceTimersByTimeAsync(75 * 60_000);
      expect(h.monitor.notesGatePhase('a1')).toBeUndefined();
      await jest.advanceTimersByTimeAsync(2 * 60_000);
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(104 * 60_000);
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      const notices = h.dispatcher.postMainThreadNotice.mock.calls.map(([, text]) => text);
      expect(notices.filter((text) => text.includes('paused new work'))).toHaveLength(1);
      expect(h.monitor.hasNotesGate('a1')).toBe(true);
    });

    it('asks on the first unavailable turn and pauses on the third consecutive one', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, assistant(null, { id: 't1' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      await h.monitor.observe(SESSION, assistant(null, { id: 't1' }));
      await h.monitor.observe(SESSION, assistant(null, { id: 't2' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      await h.monitor.observe(SESSION, assistant(null, { id: 't3' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
    });

    it('counts interleaved missing blocks by request id and clears the streak on valid usage', async () => {
      const h = makeHarness();
      for (const id of ['A', 'B', 'A']) await h.monitor.observe(SESSION, assistant(null, { id }));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      await h.monitor.observe(SESSION, assistant({ input: 1_000 }, { id: 'B' }));
      for (const id of ['B', 'C', 'D', 'C']) await h.monitor.observe(SESSION, assistant(null, { id }));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      await h.monitor.observe(SESSION, assistant(null, { id: 'E' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
    });

    it('keeps later requests unresolved when usage arrives late for an earlier request', async () => {
      const h = makeHarness();
      for (const id of ['A', 'B']) await h.monitor.observe(SESSION, assistant(null, { id }));
      await h.monitor.observe(SESSION, assistant({ input: 1_000 }, { id: 'A' }));
      await h.monitor.observe(SESSION, assistant(null, { id: 'C' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      await h.monitor.observe(SESSION, assistant(null, { id: 'D' }));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
    });

    it('a jump across both thresholds posts one ask and one parent pause notice', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, ctx(310_000, 'j1'));
      await h.monitor.observe(SESSION, ctx(320_000, 'j2'));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      expect(h.dispatcher.postSubagentNotice).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
    });

    it('a paused agent stays paused when the settings later grow', async () => {
      const h = makeHarness();
      await h.monitor.observe(SESSION, ctx(300_000, 'l1'));
      h.config.getAgentBudgetSettings.mockReturnValue(settings(1_000_000));
      await h.monitor.observe(SESSION, ctx(1_000, 'l2'));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
    });
  });

  describe('notes and normal return', () => {
    it('a notes write keeps the gate, pushes nothing and writes no record', async () => {
      const h = makeHarness({ agentType: 'general-purpose' }, { workspace });
      await launched(h);
      await h.monitor.observe(SESSION, ctx(130_000, 'n1'));
      await h.monitor.recordNotesToolResult(SESSION, 'a1', 'Write', { file_path: notesPath() });
      expect(h.monitor.hasNotesGate('a1')).toBe(true);
      expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
      expect(h.recordStore.writeOnce).not.toHaveBeenCalled();
      await h.monitor.finishWarnedAgent(SESSION, 'a1', 'completed');
      expect(h.monitor.hasNotesGate('a1')).toBe(false);
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
    });

    it('reports a single target as asked, paused, finalizing, then settled', async () => {
      const h = makeHarness({}, { workspace });
      await launched(h);
      h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-1');
      const budgetState = () => {
        const state = h.monitor.getAgentBudgetState('a1', SESSION);
        if (!state) throw new Error('Expected budget state for a1');
        return state;
      };
      await h.monitor.observe(SESSION, ctx(130_000, 'asked'));
      expect(budgetState().lifecycle).toBe('asked');
      expect(buildBudgetResumeRefusal(budgetState())).toBeNull();
      await h.monitor.observe(SESSION, ctx(310_000, 'paused'));
      await h.monitor.observe(SESSION, ctx(1_000, 'later'));
      expect(budgetState().lifecycle).toBe('paused');
      expect(buildBudgetResumeRefusal(budgetState())).toContain('context reached 310000 of 150000 tokens');

      let finishWrite: (value: HandoffRecordWrite) => void = () => undefined;
      h.recordStore.writeOnce.mockImplementationOnce(() => new Promise((resolve) => { finishWrite = resolve; }));
      const finishing = h.monitor.recordTaskTerminal(SESSION, 'task-1', 'completed');
      await waitUntil(() => h.recordStore.writeOnce.mock.calls.length === 1);
      expect(budgetState().lifecycle).toBe('finalizing');
      expect(buildBudgetResumeRefusal(budgetState())).toContain('is returning its handoff');
      const recordPath = path.join(workspace, 'settled.md');
      finishWrite({ ok: true, path: recordPath, workspace, name: 'settled.md' });
      await finishing;

      expect(budgetState()).toMatchObject({ lifecycle: 'settled', recordPath, stopped: true });
      expect(buildBudgetResumeRefusal(budgetState())).toContain(`handoff record: ${recordPath}`);
    });

    it('parallel returns finish once: one record, one push, normal-return wording', async () => {
      const h = makeHarness({}, { workspace });
      await launched(h);
      await h.monitor.observe(SESSION, ctx(130_000, 's1'));
      await Promise.all([
        h.monitor.finishWarnedAgent(SESSION, 'a1', 'completed'),
        h.monitor.finishWarnedAgent(SESSION, 'a1', 'completed'),
      ]);
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      const record = h.recordStore.writeOnce.mock.results[0].value as Promise<HandoffRecordWrite>;
      const written = await record;
      if (!written.ok) throw new Error('record setup failed');
      const text = h.dispatcher.pushParentMessage.mock.calls[0][1];
      expect(text).toMatch(/^a1 returned normally/);
      expect(text).toContain(formatHandoffNormalReturn('a1', written.path));
      expect(h.registry.update).toHaveBeenCalledWith(TOOL_CALL, expect.objectContaining({ status: 'completed' }));
    });

    it('hands off even when the SDK gave no task id', async () => {
      const h = makeHarness({ taskId: undefined }, { workspace });
      await launched(h);
      await h.monitor.observe(SESSION, ctx(130_000, 'k1'));
      await h.monitor.finishWarnedAgent(SESSION, 'a1', 'completed');
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    });

    it('delivers once whether the launching result arrives before or after the return', async () => {
      const before = makeHarness({}, { workspace });
      await launched(before);
      await before.monitor.observe(SESSION, ctx(130_000, 'b1'));
      await before.monitor.finishWarnedAgent(SESSION, 'a1', 'completed');
      expect(before.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);

      const after = makeHarness({}, { workspace });
      await after.monitor.observe(SESSION, spawn({ description: 'Review files', prompt: 'Finish task' }));
      await after.monitor.observe(SESSION, ctx(130_000, 'a1m'));
      await after.monitor.finishWarnedAgent(SESSION, 'a1', 'completed');
      expect(after.dispatcher.pushParentMessage).not.toHaveBeenCalled();
      await after.monitor.observe(SESSION, toolResult());
      expect(after.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(after.recordStore.writeOnce).toHaveBeenCalledTimes(1);
    });

    it('an agent that was never asked produces no record and no push', async () => {
      const h = makeHarness({}, { workspace });
      await launched(h);
      await h.monitor.observe(SESSION, ctx(1_000, 'q1'));
      await h.monitor.finishWarnedAgent(SESSION, 'a1', 'completed');
      expect(h.recordStore.writeOnce).not.toHaveBeenCalled();
      expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
      expect(h.registry.update).not.toHaveBeenCalled();
    });

    it.each(['stopped', 'failed'] as const)('releases a %s execution whether its stop hook comes first or last', async (outcome) => {
      for (const hookFirst of [true, false]) {
        const h = makeHarness({}, { workspace });
        await launched(h);
        h.monitor.recordTaskStarted(SESSION, TOOL_CALL, 'task-1');
        await h.monitor.observe(SESSION, ctx(310_000, 'terminal'));
        if (hookFirst) {
          await h.monitor.finishWarnedAgent(SESSION, 'a1');
          expect(h.monitor.hasNotesGate('a1')).toBe(true);
          expect(h.recordStore.writeOnce).not.toHaveBeenCalled();
        }
        await h.monitor.recordTaskTerminal(SESSION, 'task-1', outcome);
        if (!hookFirst) await h.monitor.finishWarnedAgent(SESSION, 'a1');
        const budgetState = h.monitor.getAgentBudgetState('a1', SESSION);
        expect(budgetState).toMatchObject({ sdkOutcome: outcome, lifecycle: 'stopped', stopState: 'none', stopped: false });
        expect(h.monitor.getSnapshot(SESSION, TOOL_CALL)?.stopped).toBe(false);
        expect(budgetState && buildBudgetResumeRefusal(budgetState, 'a1')).toContain(`The SDK reports that a1 ${outcome}`);
        expect(h.monitor.hasNotesGate('a1')).toBe(false);
        expect(h.dispatcher.withdrawSubagentNotice).toHaveBeenCalledWith('a1');
        expect(h.recordStore.writeOnce).not.toHaveBeenCalled();
        expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
        expect(h.registry.update).not.toHaveBeenCalled();
      }
    });

    it.each([true, false])('finalizes after a foreground report with output_file text and a stop hook (hook first: %s)', async (hookFirst) => {
      const h = makeHarness({}, { workspace });
      await h.monitor.observe(SESSION, spawn({ prompt: 'Finish task' }));
      await h.monitor.observe(SESSION, ctx(310_000, 'foreground-return'));
      const result = toolResult() as { message: { content: Array<{ content: string }> } };
      result.message.content[0].content = 'Finished reviewing the files.\noutput_file: report.md';
      if (hookFirst) await h.monitor.finishWarnedAgent(SESSION, 'a1');
      await h.monitor.observe(SESSION, result);
      if (!hookFirst) await h.monitor.finishWarnedAgent(SESSION, 'a1');
      await h.monitor.finishWarnedAgent(SESSION, 'a1', 'completed');
      expect(h.monitor.hasNotesGate('a1')).toBe(false);
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
    });

    it('an explicit user stop writes no record and pushes no handoff', async () => {
      const h = makeHarness({}, { workspace });
      await launched(h);
      await h.monitor.observe(SESSION, ctx(130_000, 'u1'));
      h.registry.get.mockReturnValue({
        toolCallId: TOOL_CALL, agentType: 'Explore', agentId: 'a1',
        status: 'interrupted', startedAt: 0, taskId: 'task-1',
      } as SubagentRecord);
      await h.monitor.finishWarnedAgent(SESSION, 'a1', 'completed');
      expect(h.recordStore.writeOnce).not.toHaveBeenCalled();
      expect(h.dispatcher.pushParentMessage).not.toHaveBeenCalled();
      expect(h.registry.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'completed' }));
    });

    it('warns the parent once after 10 minutes and leaves the gate unchanged', async () => {
      jest.useFakeTimers();
      const h = makeHarness();
      await h.monitor.observe(SESSION, ctx(130_000, 'o1'));
      await jest.advanceTimersByTimeAsync(NOTES_GATE_TIMEOUT_MS - 60_000);
      expect(h.dispatcher.postMainThreadNotice).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(91_000);
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledWith(SESSION, formatHandoffNotesDelay('a1'));
      await jest.advanceTimersByTimeAsync(5 * 60_000);
      expect(h.dispatcher.postMainThreadNotice).toHaveBeenCalledTimes(1);
      expect(h.monitor.notesGatePhase('a1')).toBe('asked');
      expect(h.monitor.hasNotesGate('a1')).toBe(true);
    });

    it('delivers an inline handoff after MAX_RECORD_ATTEMPTS failed record writes', async () => {
      const h = makeHarness({}, { workspace });
      h.recordStore.writeOnce.mockResolvedValue(failedWrite);
      await launched(h);
      await h.monitor.observe(SESSION, ctx(130_000, 'f1'));
      await h.monitor.finishWarnedAgent(SESSION, 'a1', 'completed');
      expect(h.recordStore.writeOnce).toHaveBeenCalledTimes(MAX_RECORD_ATTEMPTS);
      expect(h.dispatcher.pushParentMessage).toHaveBeenCalledTimes(1);
      expect(h.dispatcher.pushParentMessage.mock.calls[0][1]).toContain(formatHandoffRecordFailure('a1'));
      expect(h.index.publish).not.toHaveBeenCalled();
    });
  });

  describe('gate rights at pause', () => {
    it.each([
      ['Explore', 'Explore'],
      ['an empty type', ''],
      ['a missing type', undefined],
    ])('a read-only role (%s) keeps Read, Grep and Glob and gets no notes path', async (_label, agentType) => {
      const h = makeHarness({ agentType }, { workspace });
      await h.monitor.observe(SESSION, ctx(300_000, 'ro'));
      expect(h.monitor.notesGatePhase('a1')).toBe('paused');
      for (const tool of ['Read', 'Grep', 'Glob']) {
        expect(await h.monitor.checkNotesTool(SESSION, 'a1', tool, {})).toBeUndefined();
      }
      for (const tool of ['Write', 'Edit', 'Bash']) {
        expect(await h.monitor.checkNotesTool(SESSION, 'a1', tool, { file_path: notesPath() })).toEqual(expect.any(String));
      }
      expect(h.dispatcher.postSubagentNotice.mock.calls[0][1]).not.toContain('subagent-handoffs');
    });

    it('a writable role may touch only the notes path', async () => {
      const h = makeHarness({ agentType: 'general-purpose' }, { workspace });
      await h.monitor.observe(SESSION, ctx(300_000, 'rw'));
      expect(h.dispatcher.postSubagentNotice.mock.calls[0][1]).toContain(notesPath());
      expect(await h.monitor.checkNotesTool(SESSION, 'a1', 'Write', { file_path: notesPath() })).toBeUndefined();
      expect(await h.monitor.checkNotesTool(SESSION, 'a1', 'Write', { file_path: path.join(workspace, 'src', 'x.ts') })).toEqual(expect.any(String));
      expect(await h.monitor.checkPausedTool(SESSION, 'a1', 'Bash', { command: 'ls' })).toEqual(expect.any(String));
      expect(h.monitor.takeInterruptedHandoff()).toBeUndefined();
    });
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
