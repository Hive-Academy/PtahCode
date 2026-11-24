/**
 * The ACP lane `SdkHandle` end to end against the scripted fake ACP agent:
 * the real `@ptah-extension/acp-runtime` session runs underneath, with only
 * its transport replaced by an in-memory one. These are the `SdkHandle` cases
 * of the former `acp-session-handle.spec.ts`, assertions unchanged; the
 * runtime-only case (SDK load failure) lives in `acp-session-runtime.spec.ts`.
 */
import type {
  CliAdapterManifest,
  CliOutputSegment,
  FlatStreamEventUnion,
  ProviderAccountBinding,
} from '@ptah-extension/shared';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { MockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  ACP_CANCEL_GRACE_MS,
  ACP_HANDSHAKE_TIMEOUTS_MS,
  ACP_USAGE_DRAIN_MS,
  readAcpErrorDetail,
  type AcpRequestFailure,
  type AcpSpawnOptions,
  type AcpVendorProfile,
} from '@ptah-extension/acp-runtime';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
  type FakeAcpAgent,
  type FakeAcpAgentOptions,
  type FakeAcpMessage,
  type FakeAcpTransport,
  readAcpFixture,
} from '@ptah-extension/acp-runtime/testing';
import { LaneUsageNormalizer } from '../../lane-usage-normalizer';
import type { McpAttachment } from '../../mcp-attachment-probe.port';
import type { CliCommandOptions, SdkHandle } from '../cli-adapter.interface';
import {
  acpLaneManifestSections,
  createProviderSessionLaneHandle,
} from './provider-session-lane-handle';
import { laneTurnInputContractViolations } from '../../testing/lane-turn-input-contract';

const NAME = 'Test Agent';
const SESSION_ID = 'sess-1';
const MCP_SERVER = {
  type: 'http' as const,
  name: 'ptah',
  url: 'http://localhost:51820/agent/a-1/workspace/w',
  headers: [],
};
const GROK_OPTIONS = [
  { optionId: 'always-allow', name: 'Always allow', kind: 'allow_always' },
  { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' },
  { optionId: 'reject-always', name: 'Reject always', kind: 'reject_always' },
];
const MODEL_OPTION = {
  id: 'model',
  name: 'Model',
  category: 'model',
  type: 'select',
  currentValue: 'model-a',
  options: [
    { value: 'model-a', name: 'Model A' },
    { value: 'model-b', name: 'Model B' },
  ],
};

/** Test profile: maps the error rows the way a vendor profile would. */
function describeTestError(failure: AcpRequestFailure): string | undefined {
  const detail = readAcpErrorDetail(failure.data);
  if (failure.code === -32003) return `${NAME} is rate limited: ${detail}`;
  if (failure.code === -32000) return `${NAME} is not signed in`;
  if (failure.code === -32602 && failure.configId === 'model') {
    return `${NAME} rejected model '${String(failure.configValue)}' (from ${failure.options.modelSource ?? 'setting'}); available: ${failure.advertisedValues?.join(', ')}`;
  }
  return undefined;
}

function createProfile(
  overrides: Partial<AcpVendorProfile> = {},
): AcpVendorProfile {
  return {
    vendor: 'opencode',
    displayName: NAME,
    signInHint: 'run `test login`',
    buildSpawn: () => ({ args: ['agent', '--no-leader', 'stdio'] }),
    buildMcpServers: () => [MCP_SERVER],
    extensions: { notification: (method) => /^_?x\.ai\//.test(method) },
    describeError: describeTestError,
    ...overrides,
  };
}

interface Harness {
  readonly handle: SdkHandle;
  readonly agent: FakeAcpAgent;
  readonly transport: FakeAcpTransport;
  readonly segments: CliOutputSegment[];
  readonly output: () => string;
  readonly errors: () => string[];
  readonly infos: () => string[];
  readonly resolvedIds: string[];
  readonly spawn: () => AcpSpawnOptions | undefined;
  readonly logger: MockLogger;
}

const live: FakeAcpAgent[] = [];

function start(
  setup: {
    profile?: Partial<AcpVendorProfile>;
    options?: Partial<CliCommandOptions>;
    agent?: FakeAcpAgentOptions;
    script?: (agent: FakeAcpAgent) => void;
  } = {},
): Harness {
  const agent = createFakeAcpAgent({ sessionId: SESSION_ID, ...setup.agent });
  live.push(agent);
  setup.script?.(agent);
  const transport = createFakeAcpTransport(agent);
  const logger = createMockLogger();
  let spawn: AcpSpawnOptions | undefined;
  const handle = createProviderSessionLaneHandle({
    profile: createProfile(setup.profile),
    options: {
      task: 'Summarise the repository',
      workingDirectory: process.cwd(),
      projectGuidance: 'PROJECT-GUIDANCE-MARKER',
      ...setup.options,
    },
    command: 'test-agent',
    transportFactory: (spawnOptions) => {
      spawn = spawnOptions;
      return transport;
    },
    logger: logger as unknown as Logger,
  });
  const segments: CliOutputSegment[] = [];
  const chunks: string[] = [];
  const resolvedIds: string[] = [];
  handle.onSegment?.((s) => segments.push(s));
  handle.onOutput((d) => chunks.push(d));
  handle.onSessionResolved?.((id) => resolvedIds.push(id));
  return {
    handle,
    agent,
    transport,
    segments,
    output: () => chunks.join(''),
    errors: () =>
      segments.filter((s) => s.type === 'error').map((s) => s.content),
    infos: () =>
      segments
        .filter((s) => s.type === 'info' && !s.turnTelemetry)
        .map((s) => s.content),
    resolvedIds,
    spawn: () => spawn,
    logger,
  };
}

const byMethod =
  (method: string) =>
  (m: FakeAcpMessage): boolean =>
    m.method === method;

function sent(agent: FakeAcpAgent, method: string): FakeAcpMessage[] {
  return agent.received.filter(byMethod(method));
}

function paramsOf(message: FakeAcpMessage): Record<string, unknown> {
  return message.params as Record<string, unknown>;
}

function promptText(message: FakeAcpMessage): string {
  const prompt = paramsOf(message)['prompt'] as Array<{ text: string }>;
  return prompt.map((p) => p.text).join('');
}

/** Let in-flight stream reads and promise chains settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

afterEach(async () => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  await Promise.all(live.splice(0).map((agent) => agent.close()));
});

describe('createProviderSessionLaneHandle — first turn', () => {
  it('separates turn IDs across runs that resume the same ACP session', async () => {
    const script = (agent: FakeAcpAgent): void => {
      agent.handle('session/prompt', () => ({
        result: {
          stopReason: 'end_turn',
          _meta: { usage: { inputTokens: 1, outputTokens: 1 } },
        },
      }));
    };
    const first = start({ options: { agentId: 'run-a' }, script });
    const resumed = start({ options: { agentId: 'run-b' }, script });
    await expect(first.handle.done).resolves.toBe(0);
    await expect(resumed.handle.done).resolves.toBe(0);
    expect(
      first.segments.find((item) => item.turnTelemetry)?.turnTelemetry,
    ).toMatchObject({
      status: 'reported',
      usage: { turnId: expect.stringMatching(/^sess-1:run-a:[0-9a-f]{8}:1$/) },
    });
    expect(
      resumed.segments.find((item) => item.turnTelemetry)?.turnTelemetry,
    ).toMatchObject({
      status: 'reported',
      usage: { turnId: expect.stringMatching(/^sess-1:run-b:[0-9a-f]{8}:1$/) },
    });
  });

  it('reports prompt _meta.usage and preserves the UI usage segment', async () => {
    const h = start({
      options: { model: 'grok-test' },
      script: (agent) =>
        agent.handle('session/prompt', () => ({
          result: {
            stopReason: 'end_turn',
            _meta: {
              usage: {
                inputTokens: 12,
                outputTokens: 4,
                cacheReadTokens: 2,
                costUsd: 0.03,
                model: 'grok-billed',
              },
            },
          },
        })),
    });
    await expect(h.handle.done).resolves.toBe(0);
    const telemetry = h.segments.filter((segment) => segment.turnTelemetry);
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].turnTelemetry).toMatchObject({
      status: 'reported',
      usage: {
        modelId: 'grok-billed',
        inputTokens: 12,
        outputTokens: 4,
      },
    });
    expect(telemetry[0].usage).toMatchObject({
      inputTokens: 12,
      outputTokens: 4,
    });
    expect(h.handle).toMatchObject({
      outcomeUsageIsTurnTotal: true,
      usageScope: 'turn',
    });
    expect(h.handle.getObservedNativeThreadId?.()).toBe('sess-1');
  });

  it('reconciles usage_update metadata when the prompt response omits usage', async () => {
    const h = start({
      options: { model: 'requested-alias' },
      script: (agent) =>
        agent.handle('session/prompt', async (params, active) => {
          await active.sessionUpdate(String(params['sessionId']), {
            sessionUpdate: 'usage_update',
            used: 25,
            size: 1000,
            _meta: {
              usage: {
                inputTokens: 12,
                outputTokens: 4,
                model: 'billed-model',
              },
            },
          });
          return { result: { stopReason: 'end_turn' } };
        }),
    });
    await expect(h.handle.done).resolves.toBe(0);
    expect(h.segments.filter((item) => item.turnTelemetry)).toEqual([
      expect.objectContaining({
        turnTelemetry: expect.objectContaining({
          status: 'reported',
          usage: expect.objectContaining({
            inputTokens: 12,
            outputTokens: 4,
            requestContextTokens: expect.objectContaining({
              status: 'reported',
              value: 25,
            }),
            modelId: 'billed-model',
          }),
        }),
      }),
    ]);
  });

  it('reconciles usage_update after the prompt response', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', (params, active) => {
          setTimeout(() => {
            void active.sessionUpdate(String(params['sessionId']), {
              sessionUpdate: 'usage_update',
              used: 25,
              size: 1000,
              _meta: {
                usage: {
                  inputTokens: 12,
                  outputTokens: 4,
                  model: 'billed-model',
                },
              },
            });
          }, 150);
          return { result: { stopReason: 'end_turn' } };
        }),
    });
    await expect(h.handle.done).resolves.toBe(0);
    expect(
      h.segments.find((item) => item.turnTelemetry)?.turnTelemetry?.status,
    ).toBe('reported');
  });

  it('emits one unavailable record per completed turn without usable prompt usage', async () => {
    const h = start({ options: { model: 'grok-test' } });
    await expect(h.handle.done).resolves.toBe(0);
    h.agent.handle('session/prompt', () => ({
      result: {
        stopReason: 'end_turn',
        _meta: { usage: { inputTokens: -1, outputTokens: 2 } },
      },
    }));
    const next = await h.handle.continue?.('Follow up');
    await expect(next?.done).resolves.toBe(0);
    const telemetry = h.segments.filter((segment) => segment.turnTelemetry);
    expect(telemetry).toHaveLength(2);
    expect(telemetry.map((segment) => segment.turnTelemetry)).toEqual([
      expect.objectContaining({
        status: 'unavailable',
        reason: 'no-usage-event',
      }),
      expect.objectContaining({
        status: 'unavailable',
        reason: 'no-usage-event',
      }),
    ]);
    const unavailable = telemetry.flatMap((segment) =>
      segment.turnTelemetry?.status === 'unavailable'
        ? [segment.turnTelemetry]
        : [],
    );
    expect(unavailable[0].turnId).not.toBe(unavailable[1].turnId);
  });

  it('waits for the Ptah MCP attachment before the first prompt', async () => {
    let attach: (value: McpAttachment) => void = () => {
      throw new Error('attachment waiter was not installed');
    };
    const waitFor = jest.fn(
      () =>
        new Promise<McpAttachment | undefined>((resolve) => {
          attach = resolve;
        }),
    );
    const h = start({
      options: {
        agentId: 'a-1',
        mcpPort: 51820,
        attachmentProbe: {
          get: () => undefined,
          getAttempt: () => undefined,
          waitFor,
        },
      },
    });

    await settle();
    expect(sent(h.agent, 'session/new')).toHaveLength(1);
    expect(sent(h.agent, 'session/prompt')).toHaveLength(0);
    expect(waitFor).toHaveBeenCalledWith(
      'a-1',
      51820,
      15_000,
      expect.any(AbortSignal),
    );

    attach({
      agentId: 'a-1',
      port: 51820,
      method: 'initialize',
      time: Date.now(),
    });
    await expect(h.handle.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/prompt')).toHaveLength(1);
  });

  it('continues the first prompt and warns when attachment times out', async () => {
    const h = start({
      options: {
        agentId: 'a-1',
        mcpPort: 51820,
        attachmentProbe: {
          get: () => undefined,
          getAttempt: () => undefined,
          waitFor: async () => undefined,
        },
      },
    });

    await expect(h.handle.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/prompt')).toHaveLength(1);
    expect(h.infos()).toContain(
      'Ptah MCP did not connect within 15s; report in your final message.',
    );
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[AcpSessionHandle] Ptah MCP did not connect before first prompt',
      expect.objectContaining({ cause: 'handshake-timeout' }),
    );
  });

  it('cancels its attachment waiter when stopped before the first prompt', async () => {
    let waiterSignal: AbortSignal | undefined;
    const h = start({
      options: {
        agentId: 'a-1',
        mcpPort: 51820,
        attachmentProbe: {
          get: () => undefined,
          getAttempt: () => undefined,
          waitFor: (_id, _port, _timeout, signal) => {
            waiterSignal = signal;
            return new Promise((resolve) =>
              signal?.addEventListener('abort', () => resolve(undefined), {
                once: true,
              }),
            );
          },
        },
      },
    });
    await settle();
    expect(waiterSignal?.aborted).toBe(false);
    const onTimeout = jest.fn();
    h.handle.onMcpAttachmentTimeout?.(onTimeout);
    h.handle.abort.abort();
    await expect(h.handle.done).resolves.toBe(1);
    expect(waiterSignal?.aborted).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(sent(h.agent, 'session/prompt')).toHaveLength(0);
    expect(h.logger.warn).not.toHaveBeenCalledWith(
      '[AcpSessionHandle] Ptah MCP did not connect before first prompt',
      expect.anything(),
    );
    expect(h.infos()).not.toContain(
      'Ptah MCP did not connect within 15s; report in your final message.',
    );
  });

  it('completes an end_turn prompt with 0 and resolves the session id', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', async (params, a) => {
          await a.sessionUpdate(String(params['sessionId']), {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Hello from the agent' },
          });
          return { result: { stopReason: 'end_turn' } };
        }),
    });

    await expect(h.handle.done).resolves.toBe(0);

    expect(h.spawn()?.args).toEqual(['agent', '--no-leader', 'stdio']);
    expect(h.spawn()?.env).toMatchObject({ NO_COLOR: '1', FORCE_COLOR: '0' });
    expect(h.resolvedIds).toEqual([SESSION_ID]);
    expect(h.handle.getSessionId?.()).toBe(SESSION_ID);
    expect(h.output()).toContain('Hello from the agent');
    expect(h.segments).toContainEqual({
      type: 'text',
      content: 'Hello from the agent',
    });
    expect(h.errors()).toEqual([]);

    const init = paramsOf(sent(h.agent, 'initialize')[0]);
    expect(init['protocolVersion']).toBe(1);
    expect(init['clientCapabilities']).toEqual({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    });
    const created = paramsOf(sent(h.agent, 'session/new')[0]);
    expect(created['cwd']).toBe(process.cwd());
    expect(created['mcpServers']).toEqual([MCP_SERVER]);
    const prompt = sent(h.agent, 'session/prompt')[0];
    expect(paramsOf(prompt)['sessionId']).toBe(SESSION_ID);
    expect(promptText(prompt)).toContain('Summarise the repository');
    expect(promptText(prompt)).toContain('PROJECT-GUIDANCE-MARKER');
    expect(h.handle.supportsContinuation?.()).toBe(true);
  });

  it('passes the profile spawn env, merged over the lane base env, to the transport', async () => {
    const h = start({
      profile: {
        buildSpawn: () => ({
          args: ['acp'],
          env: { mode: 'merge', set: { VENDOR_CONFIG: '{"lane":true}' } },
        }),
      },
    });

    await expect(h.handle.done).resolves.toBe(0);
    expect(h.spawn()?.args).toEqual(['acp']);
    expect(h.spawn()?.env).toMatchObject({
      VENDOR_CONFIG: '{"lane":true}',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    });
  });

  it('declares no steer, and no usable interrupt for a profile that kills on cancel', async () => {
    const h = start();
    await h.handle.done;

    expect(h.handle.steer).toBeUndefined();
    expect(h.handle.supportsInterrupt?.()).toBe(false);
  });

  it('drops updates for another session id', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', async (_params, a) => {
          await a.sessionUpdate('someone-else', {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'FOREIGN' },
          });
          return { result: { stopReason: 'end_turn' } };
        }),
    });

    await expect(h.handle.done).resolves.toBe(0);
    expect(h.output()).not.toContain('FOREIGN');
  });

  it('routes stderr lines to output and classified segments', async () => {
    const agent = createFakeAcpAgent({ sessionId: SESSION_ID });
    live.push(agent);
    const transport = createFakeAcpTransport(agent);
    let onStderrLine: ((line: string) => void) | undefined;
    const handle = createProviderSessionLaneHandle({
      profile: createProfile(),
      options: { task: 't', workingDirectory: process.cwd() },
      command: 'test-agent',
      transportFactory: (spawn) => {
        onStderrLine = spawn.onStderrLine;
        return transport;
      },
    });
    const segments: CliOutputSegment[] = [];
    const chunks: string[] = [];
    handle.onSegment?.((s) => segments.push(s));
    handle.onOutput((d) => chunks.push(d));

    onStderrLine?.('  warming up  ');
    onStderrLine?.('fatal: cannot read config');
    onStderrLine?.('   ');
    await handle.done;

    expect(chunks.join('')).toContain('[stderr] warming up\n');
    expect(segments).toContainEqual({ type: 'info', content: 'warming up' });
    expect(segments).toContainEqual({
      type: 'error',
      content: 'fatal: cannot read config',
    });
  });

  it('redacts secrets and the lane token from agent stderr', async () => {
    const mcpToken = 'lane-mcp-token-7f3a';
    const agent = createFakeAcpAgent({ sessionId: SESSION_ID });
    live.push(agent);
    const transport = createFakeAcpTransport(agent);
    let onStderrLine: ((line: string) => void) | undefined;
    const handle = createProviderSessionLaneHandle({
      profile: createProfile(),
      options: { task: 't', workingDirectory: process.cwd(), mcpToken },
      command: 'test-agent',
      transportFactory: (spawn) => {
        onStderrLine = spawn.onStderrLine;
        return transport;
      },
    });
    const segments: CliOutputSegment[] = [];
    const chunks: string[] = [];
    handle.onSegment?.((s) => segments.push(s));
    handle.onOutput((d) => chunks.push(d));

    onStderrLine?.(
      `HTTP debug Authorization: Bearer super-secret-token api_key=abc123 ${mcpToken}`,
    );
    await handle.done;

    const output = chunks.join('');
    const rendered = output + segments.map((s) => s.content).join('\n');
    expect(output).toContain('[stderr]');
    expect(rendered).toContain('[REDACTED]');
    expect(rendered).not.toContain('super-secret-token');
    expect(rendered).not.toContain('abc123');
    expect(rendered).not.toContain(mcpToken);
  });
});

describe('createProviderSessionLaneHandle — continuation', () => {
  it('runs a further session/prompt with its own done', async () => {
    const h = start();
    await expect(h.handle.done).resolves.toBe(0);

    h.agent.handle('session/prompt', () => ({
      result: { stopReason: 'max_tokens' },
    }));
    const next = await h.handle.continue?.('Follow-up message');

    await expect(next?.done).resolves.toBe(0);
    const prompts = sent(h.agent, 'session/prompt');
    expect(prompts).toHaveLength(2);
    expect(promptText(prompts[1])).toBe('Follow-up message');
    expect(h.infos()).toContain('Token limit reached.');
  });

  it('rejects continue before the session exists and while a prompt is in flight', async () => {
    const h = start({
      script: (agent) => agent.handle('session/prompt', () => ({ hold: true })),
    });

    await expect(h.handle.continue?.('too early')).rejects.toThrow(
      /no ACP session/,
    );
    await h.agent.next(byMethod('session/prompt'));
    await expect(h.handle.continue?.('too busy')).rejects.toThrow(
      /still running a turn/,
    );

    h.handle.abort.abort();
    await expect(h.handle.done).resolves.toBe(1);
  });
});

describe('createProviderSessionLaneHandle — stop reasons', () => {
  it.each([
    ['end_turn', 0, undefined],
    ['max_tokens', 0, { type: 'info', content: 'Token limit reached.' }],
    [
      'max_turn_requests',
      0,
      { type: 'info', content: 'Turn request limit reached.' },
    ],
    ['refusal', 1, { type: 'error', content: `${NAME} refused the turn.` }],
    ['cancelled', 1, { type: 'error', content: 'turn cancelled by the agent' }],
    [
      'novel_reason',
      1,
      {
        type: 'error',
        content: `${NAME} stopped for unknown reason: novel_reason`,
      },
    ],
  ])('maps %s to %i', async (stopReason, code, expected) => {
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', () => ({ result: { stopReason } })),
    });

    await expect(h.handle.done).resolves.toBe(code);

    const notable = h.segments.filter(
      (s) => (s.type === 'error' || s.type === 'info') && !s.turnTelemetry,
    );
    expect(notable).toEqual(expected ? [expected] : []);
  });
});

describe('createProviderSessionLaneHandle — permissions', () => {
  it('answers a permission request with the allow_once option', async () => {
    let reply: FakeAcpMessage | undefined;
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', async (params, a) => {
          reply = await a.request('session/request_permission', {
            sessionId: params['sessionId'],
            toolCall: {
              toolCallId: 't-1',
              title: 'ptah__ptah_agent_report',
              kind: 'other',
            },
            options: GROK_OPTIONS,
          });
          return { result: { stopReason: 'end_turn' } };
        }),
    });

    await expect(h.handle.done).resolves.toBe(0);
    expect(reply?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'allow-once' },
    });
    expect(h.errors()).toEqual([]);
  });

  it('fails the turn with a named error when the policy refused a permission (R5)', async () => {
    let reply: FakeAcpMessage | undefined;
    const h = start({
      options: { autoApprove: false },
      script: (agent) =>
        agent.handle('session/prompt', async (params, a) => {
          reply = await a.request('session/request_permission', {
            sessionId: params['sessionId'],
            toolCall: {
              toolCallId: 't-1',
              title: 'run shell',
              kind: 'execute',
            },
            options: GROK_OPTIONS,
          });
          return { result: { stopReason: 'cancelled' } };
        }),
    });

    await expect(h.handle.done).resolves.toBe(1);
    expect(reply?.result).toEqual({
      outcome: { outcome: 'selected', optionId: 'reject-once' },
    });
    expect(h.errors()).toEqual([
      `${NAME} stopped the turn: permission refused for run shell`,
    ]);
  });

  it('keeps a refusal local to its turn', async () => {
    const h = start({
      options: { autoApprove: false },
      script: (agent) =>
        agent.handle('session/prompt', async (params, a) => {
          await a.request('session/request_permission', {
            sessionId: params['sessionId'],
            toolCall: { toolCallId: 't-1', title: 'run shell' },
            options: GROK_OPTIONS,
          });
          return { result: { stopReason: 'end_turn' } };
        }),
    });
    await expect(h.handle.done).resolves.toBe(0);

    h.agent.handle('session/prompt', () => ({
      result: { stopReason: 'cancelled' },
    }));
    const next = await h.handle.continue?.('again');

    await expect(next?.done).resolves.toBe(1);
    expect(h.errors()).toEqual(['turn cancelled by the agent']);
  });
});

describe('createProviderSessionLaneHandle — extension notifications', () => {
  it('ignores the vendor namespace and names an unknown method once', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', async (params, a) => {
          await a.notify('_x.ai/session/setup', {
            phase: 'auth',
            sessionId: null,
          });
          await a.notify('_x.ai/session_notification', {
            sessionId: params['sessionId'],
            update: {
              sessionUpdate: 'retry_state',
              type: 'retrying',
              attempt: 1,
            },
          });
          await a.notify('_other.vendor/ping', {});
          await a.notify('_other.vendor/ping', {});
          return { result: { stopReason: 'end_turn' } };
        }),
    });

    await expect(h.handle.done).resolves.toBe(0);
    expect(h.errors()).toEqual([]);
    expect(h.infos()).toEqual([
      `${NAME} sent an unsupported notification: _other.vendor/ping`,
    ]);
  });

  it('reports every unknown method when the profile names no namespace', async () => {
    const h = start({
      profile: { extensions: undefined },
      script: (agent) =>
        agent.handle('session/prompt', async () => {
          await agent.notify('_x.ai/session/setup', {});
          return { result: { stopReason: 'end_turn' } };
        }),
    });

    await expect(h.handle.done).resolves.toBe(0);
    expect(h.infos()).toEqual([
      `${NAME} sent an unsupported notification: _x.ai/session/setup`,
    ]);
  });
});

describe('createProviderSessionLaneHandle — resume', () => {
  it('resumes with the same mcpServers and restores the context (R7)', async () => {
    const h = start({ options: { resumeSessionId: 'old-session' } });

    await expect(h.handle.done).resolves.toBe(0);

    const resume = sent(h.agent, 'session/resume');
    expect(resume).toHaveLength(1);
    expect(paramsOf(resume[0])).toEqual({
      sessionId: 'old-session',
      cwd: process.cwd(),
      mcpServers: [MCP_SERVER],
    });
    expect(sent(h.agent, 'session/new')).toHaveLength(0);
    expect(h.resolvedIds).toEqual(['old-session']);
    const prompt = promptText(sent(h.agent, 'session/prompt')[0]);
    expect(prompt).not.toContain('PROJECT-GUIDANCE-MARKER');
    expect(prompt).toContain('Summarise the repository');
    // The restored session's earlier turns ran in another handle, so this
    // first prompt must still carry the lane policy (4332578879).
    expect(prompt).toContain('Lane policy id: ptah-lane-policy-v1');
  });

  it('falls back to session/new with an info when resume fails', async () => {
    const h = start({
      options: { resumeSessionId: 'old-session' },
      script: (agent) =>
        agent.handle('session/resume', () => ({
          error: {
            code: -32002,
            message: 'Resource not found',
            data: 'no such session',
          },
        })),
    });

    await expect(h.handle.done).resolves.toBe(0);

    expect(h.infos()).toEqual([
      'could not resume old-session: Resource not found (no such session); started a new session',
    ]);
    expect(h.handle.getSessionId?.()).toBe(SESSION_ID);
    expect(promptText(sent(h.agent, 'session/prompt')[0])).toContain(
      'PROJECT-GUIDANCE-MARKER',
    );
  });

  it('falls back to session/new when the agent cannot resume', async () => {
    const h = start({
      options: { resumeSessionId: 'old-session' },
      agent: { agentCapabilities: {} },
    });

    await expect(h.handle.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/resume')).toHaveLength(0);
    expect(h.infos()).toEqual([
      `could not resume old-session: ${NAME} does not support resuming a session; started a new session`,
    ]);
  });

  it('drops _meta.isReplay updates on session/load and keeps live ones', async () => {
    const h = start({
      options: { resumeSessionId: 'old-session' },
      agent: {
        agentCapabilities: { loadSession: true },
        replay: [
          {
            sessionUpdate: 'user_message_chunk',
            content: { type: 'text', text: 'REPLAYED-USER' },
          },
          {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'REPLAYED-AGENT' },
          },
        ],
      },
      script: (agent) =>
        agent.handle('session/prompt', async (params, a) => {
          await a.sessionUpdate(String(params['sessionId']), {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'LIVE-AGENT' },
          });
          return { result: { stopReason: 'end_turn' } };
        }),
    });

    await expect(h.handle.done).resolves.toBe(0);

    const load = sent(h.agent, 'session/load');
    expect(load).toHaveLength(1);
    expect(paramsOf(load[0])['mcpServers']).toEqual([MCP_SERVER]);
    expect(h.output()).not.toContain('REPLAYED');
    expect(h.output()).toContain('LIVE-AGENT');
    expect(h.infos()).toEqual([]);
  });

  const ROLE = {
    name: 'reviewer',
    body: 'ROLE-BODY-MARKER',
    sourcePath: '/ws/reviewer.md',
    bytes: 16,
  };

  it('omits project guidance and the role only when agy restored the session (round 4)', async () => {
    const h = start({ options: { resumeSessionId: 'old-session', role: ROLE } });
    await expect(h.handle.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/resume')).toHaveLength(1);
    const prompt = promptText(sent(h.agent, 'session/prompt')[0]);
    expect(prompt).not.toContain('PROJECT-GUIDANCE-MARKER');
    expect(prompt).not.toContain('## Role: reviewer');
    expect(prompt).toContain('Summarise the repository');
  });

  it('omits them after a successful session/load too', async () => {
    const h = start({
      options: { resumeSessionId: 'old-session', role: ROLE },
      agent: { agentCapabilities: { loadSession: true } },
    });
    await expect(h.handle.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/load')).toHaveLength(1);
    const prompt = promptText(sent(h.agent, 'session/prompt')[0]);
    expect(prompt).not.toContain('PROJECT-GUIDANCE-MARKER');
    expect(prompt).not.toContain('## Role: reviewer');
  });

  it.each([
    [
      'session/resume fails',
      {
        script: (agent: FakeAcpAgent) =>
          agent.handle('session/resume', () => ({
            error: { code: -32002, message: 'Resource not found' },
          })),
      },
    ],
    ['the agent cannot resume', { agent: { agentCapabilities: {} } }],
  ])('re-sends guidance and the role when %s and a new session starts (round 4)', async (_label, setup) => {
    const h = start({ options: { resumeSessionId: 'old-session', role: ROLE }, ...setup });
    await expect(h.handle.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/new')).toHaveLength(1);
    const prompt = promptText(sent(h.agent, 'session/prompt')[0]);
    expect(prompt).toContain('PROJECT-GUIDANCE-MARKER');
    expect(prompt).toContain('## Role: reviewer');
    expect(prompt).toContain('ROLE-BODY-MARKER');
  });

  it('prefers session/resume when the agent advertises both resume and load', async () => {
    const h = start({ options: { resumeSessionId: 'old-session' } });

    await expect(h.handle.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/resume')).toHaveLength(1);
    expect(sent(h.agent, 'session/load')).toHaveLength(0);
    expect(h.infos()).toEqual([]);
  });
});

describe('createProviderSessionLaneHandle — session config (R6)', () => {
  it('applies advertised config before the first prompt and skips the rest with an info', async () => {
    const h = start({
      agent: { configOptions: [MODEL_OPTION] },
      profile: {
        sessionConfig: () => [
          { configId: 'model', value: 'model-b', binding: true },
          { configId: 'reasoning_effort', value: 'high' },
        ],
      },
    });

    await expect(h.handle.done).resolves.toBe(0);

    const configCalls = sent(h.agent, 'session/set_config_option');
    expect(configCalls.map(paramsOf)).toEqual([
      { sessionId: SESSION_ID, configId: 'model', value: 'model-b' },
    ]);
    const order = h.agent.received.map((m) => m.method);
    expect(order.indexOf('session/set_config_option')).toBeLessThan(
      order.indexOf('session/prompt'),
    );
    expect(h.infos()).toEqual([
      `${NAME} does not offer the "reasoning_effort" setting, so high was not applied`,
    ]);
  });

  it('fails the first turn before any prompt when the agent rejects the model (-32602)', async () => {
    const describeError = jest.fn(describeTestError);
    const h = start({
      agent: { configOptions: [MODEL_OPTION] },
      options: { model: 'model-x', modelSource: 'setting' },
      profile: {
        sessionConfig: (options) => [
          { configId: 'model', value: options.model ?? '', binding: true },
        ],
        describeError,
      },
      script: (agent) =>
        agent.handle('session/set_config_option', () => ({
          error: {
            code: -32602,
            message: 'Invalid params',
            data: 'unknown model id',
          },
        })),
    });

    await expect(h.handle.done).resolves.toBe(1);

    expect(sent(h.agent, 'session/prompt')).toHaveLength(0);
    expect(h.errors()).toEqual([
      `${NAME} rejected model 'model-x' (from setting); available: model-a, model-b`,
    ]);
    expect(describeError).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'session/set_config_option',
        code: -32602,
        data: 'unknown model id',
        configId: 'model',
        configValue: 'model-x',
        advertisedValues: ['model-a', 'model-b'],
      }),
    );
    expect(h.transport.killCount).toBe(1);
    expect(h.handle.supportsContinuation?.()).toBe(false);
  });

  it('reads binding from the entry, not its id: a rejected non-binding model is a hint', async () => {
    const h = start({
      agent: { configOptions: [MODEL_OPTION] },
      profile: {
        sessionConfig: () => [{ configId: 'model', value: 'model-b' }],
      },
      script: (agent) =>
        agent.handle('session/set_config_option', () => ({
          error: { code: -32602, message: 'Invalid params' },
        })),
    });

    await expect(h.handle.done).resolves.toBe(0);

    expect(sent(h.agent, 'session/prompt')).toHaveLength(1);
    expect(h.errors()).toEqual([]);
    expect(h.infos()).toEqual([
      expect.stringContaining('continuing without the "model" setting'),
    ]);
  });

  it('sends a binding entry the session does not advertise', async () => {
    const h = start({
      agent: { configOptions: [] },
      profile: {
        sessionConfig: () => [
          { configId: 'model', value: 'model-b', binding: true },
        ],
      },
    });

    await expect(h.handle.done).resolves.toBe(0);

    expect(sent(h.agent, 'session/set_config_option').map(paramsOf)).toEqual([
      { sessionId: SESSION_ID, configId: 'model', value: 'model-b' },
    ]);
    expect(sent(h.agent, 'session/prompt')).toHaveLength(1);
    expect(h.infos()).toEqual([]);
  });

  it('fails the turn when an unadvertised binding entry is rejected', async () => {
    const h = start({
      agent: { configOptions: [] },
      profile: {
        sessionConfig: () => [
          { configId: 'model', value: 'model-x', binding: true },
        ],
      },
      script: (agent) =>
        agent.handle('session/set_config_option', () => ({
          error: { code: -32602, message: 'Invalid params' },
        })),
    });

    await expect(h.handle.done).resolves.toBe(1);

    expect(sent(h.agent, 'session/prompt')).toHaveLength(0);
    expect(h.errors()).toHaveLength(1);
    expect(h.transport.killCount).toBe(1);
  });

  const effortOption = (values: readonly string[]) => ({
    id: 'reasoning_effort',
    name: 'Reasoning effort',
    type: 'select',
    currentValue: values[0],
    options: values.map((value) => ({ value, name: value })),
  });

  it('skips an effort the session does not advertise with an info and still runs the lane', async () => {
    const h = start({
      agent: { configOptions: [MODEL_OPTION, effortOption(['high'])] },
      profile: {
        sessionConfig: () => [{ configId: 'reasoning_effort', value: 'xhigh' }],
      },
    });

    await expect(h.handle.done).resolves.toBe(0);

    expect(sent(h.agent, 'session/set_config_option')).toHaveLength(0);
    expect(sent(h.agent, 'session/prompt')).toHaveLength(1);
    expect(h.infos()).toEqual([
      `${NAME} does not offer xhigh for "reasoning_effort" (available: high), so it was not applied`,
    ]);
    expect(h.errors()).toEqual([]);
  });

  it('validates the effort against the options returned by the model change', async () => {
    const h = start({
      agent: {
        configOptions: [MODEL_OPTION, effortOption(['high', 'xhigh'])],
      },
      profile: {
        sessionConfig: () => [
          { configId: 'model', value: 'model-b', binding: true },
          { configId: 'reasoning_effort', value: 'xhigh' },
        ],
      },
      script: (agent) =>
        agent.handle('session/set_config_option', () => ({
          result: { configOptions: [MODEL_OPTION, effortOption(['high'])] },
        })),
    });

    await expect(h.handle.done).resolves.toBe(0);

    expect(sent(h.agent, 'session/set_config_option').map(paramsOf)).toEqual([
      { sessionId: SESSION_ID, configId: 'model', value: 'model-b' },
    ]);
    expect(h.infos()).toEqual([
      `${NAME} does not offer xhigh for "reasoning_effort" (available: high), so it was not applied`,
    ]);
  });

  it('continues the lane with an info when the agent rejects the effort', async () => {
    const h = start({
      agent: { configOptions: [MODEL_OPTION, effortOption(['high'])] },
      profile: {
        sessionConfig: () => [{ configId: 'reasoning_effort', value: 'high' }],
      },
      script: (agent) =>
        agent.handle('session/set_config_option', () => ({
          error: { code: -32602, message: 'Invalid params' },
        })),
    });

    await expect(h.handle.done).resolves.toBe(0);

    expect(sent(h.agent, 'session/prompt')).toHaveLength(1);
    expect(h.errors()).toEqual([]);
    expect(h.infos()).toEqual([
      expect.stringContaining(
        'continuing without the "reasoning_effort" setting',
      ),
    ]);
  });
});

describe('createProviderSessionLaneHandle — error rows', () => {
  it.each([
    ['a string', 'API error (status 429 Too Many Requests): usage exhausted'],
    [
      'an object',
      {
        message: 'API error (status 429 Too Many Requests): usage exhausted',
        promptUsage: {},
      },
    ],
  ])(
    'fails a rate-limited prompt (-32003, data as %s)',
    async (_shape, data) => {
      const h = start({
        script: (agent) =>
          agent.handle('session/prompt', () => ({
            error: { code: -32003, message: 'Rate limited', data },
          })),
      });

      await expect(h.handle.done).resolves.toBe(1);
      expect(h.errors()).toEqual([
        `${NAME} is rate limited: API error (status 429 Too Many Requests): usage exhausted`,
      ]);
      // The session survives a failed prompt, so the lane can take the next message.
      expect(h.handle.supportsContinuation?.()).toBe(true);
    },
  );

  it('fails the turn when session/new needs sign-in (-32000)', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('session/new', () => ({
          error: {
            code: -32000,
            message: 'Authentication required',
            data: 'no auth method id provided',
          },
        })),
    });

    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([`${NAME} is not signed in`]);
    expect(sent(h.agent, 'session/prompt')).toHaveLength(0);
    // The segment is the profile's summary; the raw JSON-RPC answer goes to the log.
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[AcpSessionHandle] ACP request failed',
      expect.objectContaining({
        vendor: 'opencode',
        method: 'session/new',
        code: -32000,
        message: 'Authentication required',
        detail: 'no auth method id provided',
      }),
    );
  });

  it('uses a generic message when the profile has none', async () => {
    const h = start({
      profile: { describeError: undefined },
      script: (agent) =>
        agent.handle('session/prompt', () => ({
          error: {
            code: -32603,
            message: 'Internal error',
            data: { message: 'boom' },
          },
        })),
    });

    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([
      `${NAME} session/prompt failed: Internal error (boom) [code -32603]`,
    ]);
  });

  it('fails the turn on an unsupported protocol version', async () => {
    const h = start({ agent: { protocolVersion: 3 } });

    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([
      `${NAME} speaks unsupported ACP protocol version 3`,
    ]);
    expect(sent(h.agent, 'session/new')).toHaveLength(0);
    expect(h.transport.killCount).toBe(1);
  });
});

describe('createProviderSessionLaneHandle — handshake timeout', () => {
  it('fails the turn and kills the agent when initialize overruns its deadline', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    const h = start({
      script: (agent) => agent.handle('initialize', () => ({ hold: true })),
    });
    await h.agent.next(byMethod('initialize'));

    await jest.advanceTimersByTimeAsync(ACP_HANDSHAKE_TIMEOUTS_MS.initialize);

    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([
      `${NAME} did not complete the ACP handshake (initialize) in 45 s`,
    ]);
    expect(h.transport.killCount).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('gives session setup its own deadline after initialize answers', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    const h = start({
      script: (agent) => agent.handle('session/new', () => ({ hold: true })),
    });
    await h.agent.next(byMethod('session/new'));

    // Past the initialize budget, the session phase still runs: a slow MCP
    // connect under load must not fail the lane at the old 30 s mark.
    await jest.advanceTimersByTimeAsync(ACP_HANDSHAKE_TIMEOUTS_MS.initialize);
    expect(h.errors()).toEqual([]);
    expect(h.transport.killCount).toBe(0);

    await jest.advanceTimersByTimeAsync(
      ACP_HANDSHAKE_TIMEOUTS_MS.session - ACP_HANDSHAKE_TIMEOUTS_MS.initialize,
    );

    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([
      `${NAME} did not complete the ACP handshake (session setup) in 90 s`,
    ]);
    expect(h.transport.killCount).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the handshake timer once setup completes', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    const h = start();
    await h.agent.next(byMethod('session/prompt'));
    await settle();
    await jest.advanceTimersByTimeAsync(ACP_USAGE_DRAIN_MS);
    await expect(h.handle.done).resolves.toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('createProviderSessionLaneHandle — process lifecycle', () => {
  it('fails the turn naming the exit code when the agent exits mid-turn', async () => {
    const h = start({
      script: (agent) => agent.handle('session/prompt', () => ({ hold: true })),
    });
    await h.agent.next(byMethod('session/prompt'));

    await h.transport.exit(3);

    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([`${NAME} exited (code 3) during the turn`]);
    expect(h.handle.supportsContinuation?.()).toBe(false);
    expect(h.handle.getPid?.()).toBeUndefined();
  });

  it('abort sends session/cancel, then kills, and stays silent', async () => {
    const h = start({
      script: (agent) => agent.handle('session/prompt', () => ({ hold: true })),
    });
    await h.agent.next(byMethod('session/prompt'));

    h.handle.abort.abort();

    await expect(h.handle.done).resolves.toBe(1);
    const cancel = await h.agent.next(byMethod('session/cancel'));
    expect(cancel.id).toBeUndefined();
    expect(paramsOf(cancel)).toEqual({ sessionId: SESSION_ID });
    await settle();
    expect(h.transport.killCount).toBe(1);
    expect(h.errors()).toEqual([]);
    expect(sent(h.agent, 'session/close')).toHaveLength(0);
    expect(h.handle.supportsContinuation?.()).toBe(false);
  });

  it('waits up to the cancel grace for an agent that ignores the cancel, then kills', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    const h = start({
      // A prompt that never answers, not even `cancelled`.
      script: (agent) =>
        agent.handle('session/prompt', () => new Promise(() => undefined)),
    });
    await h.agent.next(byMethod('session/prompt'));

    h.handle.abort.abort();
    await h.agent.next(byMethod('session/cancel'));
    await settle();

    await jest.advanceTimersByTimeAsync(ACP_CANCEL_GRACE_MS - 1);
    expect(h.transport.killCount).toBe(0);

    await jest.advanceTimersByTimeAsync(1);
    expect(h.transport.killCount).toBe(1);
    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('skips the kill when the agent exits within the cancel grace', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', () => new Promise(() => undefined)),
    });
    await h.agent.next(byMethod('session/prompt'));

    h.handle.abort.abort();
    await h.agent.next(byMethod('session/cancel'));
    await h.transport.exit(0);

    await expect(h.handle.done).resolves.toBe(1);
    await settle();
    expect(h.transport.killCount).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('abort while idle kills without a cancel', async () => {
    const h = start();
    await expect(h.handle.done).resolves.toBe(0);

    h.handle.abort.abort();
    await settle();

    expect(sent(h.agent, 'session/cancel')).toHaveLength(0);
    expect(h.transport.killCount).toBe(1);
  });

  it('closes silently when the agent exits while idle, and never returns the exited pid', async () => {
    const h = start();
    await expect(h.handle.done).resolves.toBe(0);
    expect(h.handle.getPid?.()).toBe(4242);
    const before = h.segments.length;

    await h.transport.exit(0);
    await settle();

    expect(h.handle.getPid?.()).toBeUndefined();
    expect(h.handle.supportsContinuation?.()).toBe(false);
    expect(h.segments).toHaveLength(before);
    await expect(h.handle.continue?.('late')).rejects.toThrow(
      /no longer running/,
    );
    // Exited on its own: no kill, so a reused pid is never targeted.
    expect(h.transport.killCount).toBe(0);
  });
});

describe('createProviderSessionLaneHandle — P2', () => {
  const usageReply = {
    result: {
      stopReason: 'end_turn',
      _meta: { usage: { inputTokens: 1, outputTokens: 1 } },
    },
  };

  it('interrupts the turn via session/cancel, keeps the process, and continues on it', async () => {
    let prompts = 0;
    const h = start({
      profile: { cancelBehavior: 'await-reply' },
      script: (agent) =>
        agent.handle('session/prompt', () =>
          ++prompts === 1 ? { hold: true } : usageReply,
        ),
    });
    await h.agent.next(byMethod('session/prompt'));
    await settle();
    expect(h.handle.supportsInterrupt?.()).toBe(true);

    await h.handle.interrupt?.();
    // A Ptah interrupt keeps a healthy lane: exit 0, as Cursor's (review S-1).
    await expect(h.handle.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/cancel')).toHaveLength(1);
    expect(h.transport.killCount).toBe(0);
    expect(h.errors()).toEqual([]);

    const next = await h.handle.continue?.('follow-up');
    await expect(next?.done).resolves.toBe(0);
    expect(sent(h.agent, 'session/prompt')).toHaveLength(2);
    expect(h.handle.getPid?.()).toBe(4242);
    h.handle.abort.abort();
  });

  it('interrupts a continuation turn with exit 0, while a lane abort mid-turn stays 1', async () => {
    let prompts = 0;
    const h = start({
      profile: { cancelBehavior: 'await-reply' },
      script: (agent) =>
        agent.handle('session/prompt', () =>
          ++prompts === 1 ? usageReply : { hold: true },
        ),
    });
    await expect(h.handle.done).resolves.toBe(0);
    const second = await h.handle.continue?.('long one');
    while (prompts < 2) await settle();
    await settle();
    await h.handle.interrupt?.();
    await expect(second?.done).resolves.toBe(0);

    const third = await h.handle.continue?.('another long one');
    while (prompts < 3) await settle();
    await settle();
    h.handle.abort.abort();
    await expect(third?.done).resolves.toBe(1);
    expect(h.errors()).toEqual([]);
  });

  it('offers no interrupt when the profile does not keep the process', async () => {
    const h = start();
    await expect(h.handle.done).resolves.toBe(0);
    expect(h.handle.supportsInterrupt?.()).toBe(false);
    h.handle.abort.abort();
  });

  it('keeps the task prompt first: continue() refuses until it was sent (PR #1444 review)', async () => {
    let releaseProbe: (value: McpAttachment | undefined) => void = () =>
      undefined;
    const attachmentProbe = {
      get: () => undefined,
      waitFor: jest.fn(
        () =>
          new Promise<McpAttachment | undefined>((resolve) => {
            releaseProbe = resolve;
          }),
      ),
    };
    const h = start({
      options: {
        agentId: 'a-1',
        mcpPort: 51820,
        mcpToken: 'tok',
        attachmentProbe,
      },
      script: (agent) => agent.handle('session/prompt', () => usageReply),
    });
    await h.agent.next(byMethod('session/new'));
    await settle();
    expect(attachmentProbe.waitFor).toHaveBeenCalled();
    // The router parks a message while the first turn runs (review M-2), so
    // continuation is offered; continue() itself still keeps the task prompt first.
    expect(h.handle.supportsContinuation?.()).toBe(true);
    expect(h.handle.supportsInterrupt?.()).toBe(false);
    await expect(h.handle.continue?.('too early')).rejects.toThrow(
      `${NAME} has not sent its task prompt yet; send the message after it`,
    );

    releaseProbe({
      agentId: 'a-1',
      method: 'initialize',
      port: 51820,
      time: 1,
    });
    await expect(h.handle.done).resolves.toBe(0);
    const prompts = sent(h.agent, 'session/prompt');
    expect(prompts).toHaveLength(1);
    expect(promptText(prompts[0])).toContain('Summarise the repository');
    expect(h.handle.supportsContinuation?.()).toBe(true);
    h.handle.abort.abort();
  });

  it('fails at once with one error when no process spawner was supplied', async () => {
    const handle = createProviderSessionLaneHandle({
      profile: createProfile(),
      options: { task: 't', workingDirectory: process.cwd() },
      command: 'test-agent',
    });
    const segments: CliOutputSegment[] = [];
    handle.onSegment?.((item) => segments.push(item));
    await expect(handle.done).resolves.toBe(1);
    expect(segments).toEqual([
      {
        type: 'error',
        content: `${NAME} cannot start: no process spawner was supplied for the lane`,
      },
    ]);
    expect(handle.supportsContinuation?.()).toBe(false);
  });
});

describe('createProviderSessionLaneHandle — account binding (PR #1445 review)', () => {
  const binding: ProviderAccountBinding = {
    version: 1,
    provider: 'grok',
    profileId: 'profile-1',
    routeRevision: 1,
    routeFingerprint: 'fingerprint',
    authEpoch: 1,
    runId: 'run-1',
    identity: { kind: 'unknown' },
  } as unknown as ProviderAccountBinding;

  it('awaits the binding checkpoint with the session id before the task prompt', async () => {
    let agentRef: FakeAcpAgent | undefined;
    const order: string[] = [];
    const onAccountBinding = jest.fn(async () => {
      expect(agentRef && sent(agentRef, 'session/prompt')).toHaveLength(0);
      order.push('binding');
    });
    const h = start({
      options: {
        accountBinding: binding,
        accountBindingId: 'binding-1',
        onAccountBinding,
      },
      script: (agent) => {
        agentRef = agent;
        agent.handle('session/prompt', () => {
          order.push('prompt');
          return { result: { stopReason: 'end_turn' } };
        });
      },
    });
    await expect(h.handle.done).resolves.toBe(0);
    expect(onAccountBinding).toHaveBeenCalledTimes(1);
    expect(onAccountBinding).toHaveBeenCalledWith(
      { accountBinding: binding, accountBindingId: 'binding-1' },
      SESSION_ID,
    );
    expect(order).toEqual(['binding', 'prompt']);
    h.handle.abort.abort();
  });

  it('never calls the checkpoint for a default-account lane', async () => {
    const onAccountBinding = jest.fn(async () => undefined);
    const h = start({ options: { onAccountBinding } });
    await expect(h.handle.done).resolves.toBe(0);
    expect(onAccountBinding).not.toHaveBeenCalled();
    h.handle.abort.abort();
  });

  it('returns 1 without sending the task prompt when the checkpoint rejects', async () => {
    const onAccountBinding = jest.fn(async () => {
      throw new Error('binding storage unavailable');
    });
    const h = start({
      options: {
        accountBinding: binding,
        accountBindingId: 'binding-1',
        onAccountBinding,
      },
    });
    await expect(h.handle.done).resolves.toBe(1);
    await settle();
    expect(sent(h.agent, 'session/prompt')).toHaveLength(0);
    expect(h.errors()).toEqual([
      `${NAME} did not start: its account binding could not be recorded`,
    ]);
    expect(h.handle.supportsContinuation?.()).toBe(false);
  });

  it('returns 1 without prompting when the binding is incomplete', async () => {
    const onAccountBinding = jest.fn(async () => undefined);
    const h = start({
      options: { accountBindingId: 'binding-1', onAccountBinding },
    });
    await expect(h.handle.done).resolves.toBe(1);
    expect(onAccountBinding).not.toHaveBeenCalled();
    expect(sent(h.agent, 'session/prompt')).toHaveLength(0);
  });
});

describe('createProviderSessionLaneHandle — stream events (P1 review m-4)', () => {
  it('projects the turn to flat stream events for the execution cards, beside the segments', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', async (params, a) => {
          const sessionId = String(params['sessionId']);
          await a.sessionUpdate(sessionId, {
            sessionUpdate: 'tool_call',
            toolCallId: 'call-1',
            title: 'Run ptah_search',
            kind: 'other',
            status: 'in_progress',
          });
          await a.sessionUpdate(sessionId, {
            sessionUpdate: 'tool_call_update',
            toolCallId: 'call-1',
            status: 'completed',
          });
          await a.sessionUpdate(sessionId, {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Found it' },
          });
          return { result: { stopReason: 'end_turn' } };
        }),
    });
    const stream: FlatStreamEventUnion[] = [];
    h.handle.onStreamEvent?.((event) => stream.push(event));

    await expect(h.handle.done).resolves.toBe(0);

    expect(stream.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'message_start',
        'tool_start',
        'tool_result',
        'text_delta',
      ]),
    );
    expect(
      stream.find((event) => event.eventType === 'tool_start'),
    ).toMatchObject({
      toolCallId: 'call-1',
      sessionId: SESSION_ID,
    });
    expect(h.segments).toContainEqual({ type: 'text', content: 'Found it' });
  });

  it('leaves a failure to its error segment so the card does not show it twice', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', () => ({
          error: {
            code: -32003,
            message: 'Rate limited',
            data: 'usage exhausted',
          },
        })),
    });
    const stream: FlatStreamEventUnion[] = [];
    h.handle.onStreamEvent?.((event) => stream.push(event));

    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([`${NAME} is rate limited: usage exhausted`]);
    expect(
      stream.filter(
        (event) =>
          event.eventType === 'text_delta' && event.delta.startsWith('Error:'),
      ),
    ).toEqual([]);
  });
});

describe('createProviderSessionLaneHandle — setup failure', () => {
  it('a failed setup ends the lane with one error', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('initialize', () => ({
          error: { code: -32603, message: 'boom' },
        })),
    });
    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toHaveLength(1);
    expect(h.errors()[0]).toMatch(/boom/);
    expect(sent(h.agent, 'session/new')).toHaveLength(0);
    expect(h.handle.supportsContinuation?.()).toBe(false);
  });

  it('a missing sign-in fails the lane with the sign-in hint', async () => {
    const h = start({
      profile: { describeError: undefined },
      script: (agent) =>
        agent.handle('session/new', () => ({
          error: { code: -32000, message: 'Authentication required' },
        })),
    });
    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toEqual([`${NAME} is not signed in: run \`test login\``]);
  });

  it('a failed setup closes the ACP child', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('initialize', () => ({ error: { code: -32603, message: 'boom' } })),
    });
    await expect(h.handle.done).resolves.toBe(1);
    expect(h.transport.killCount).toBe(1);
    expect(h.agent.closed).toBe(true);
  });

  it('a refused model after the session opened fails the lane', async () => {
    const h = start({
      options: { model: 'model-z' },
      agent: { configOptions: [MODEL_OPTION] },
      profile: {
        sessionConfig: (options) => [
          { configId: 'model', value: options.model ?? '', binding: true },
        ],
      },
      script: (agent) =>
        agent.handle('session/set_config_option', () => ({
          error: { code: -32602, message: 'Invalid params' },
        })),
    });
    await expect(h.handle.done).resolves.toBe(1);
    expect(h.errors()).toHaveLength(1);
    expect(h.errors()[0]).toMatch(/rejected model 'model-z'/);
  });
});

describe('createProviderSessionLaneHandle — MCP credential revoke (round 4)', () => {
  it('keeps the credential while the warm process can continue', async () => {
    const onMcpConfigRestored = jest.fn();
    const h = start({ options: { onMcpConfigRestored } });
    await expect(h.handle.done).resolves.toBe(0);
    await settle();
    expect(h.handle.supportsContinuation?.()).toBe(true);
    expect(onMcpConfigRestored).not.toHaveBeenCalled();
    h.handle.abort.abort();
  });

  it('leaves an abort (stop, idle release) to the manager, which revokes itself', async () => {
    const onMcpConfigRestored = jest.fn();
    const h = start({ options: { onMcpConfigRestored } });
    await expect(h.handle.done).resolves.toBe(0);
    h.handle.abort.abort();
    await h.transport.exited;
    await settle();
    // AgentProcessManager.stop and releaseSubprocess call revokeSubject; see
    // agent-process-manager.service.spec.ts "revokes the lane credential when
    // the idle subprocess is released" and "... when a running lane is stopped".
    expect(onMcpConfigRestored).not.toHaveBeenCalled();
  });

  it('revokes once after a failed setup', async () => {
    const onMcpConfigRestored = jest.fn();
    const h = start({
      options: { onMcpConfigRestored },
      script: (agent) =>
        agent.handle('initialize', () => ({ error: { code: -32603, message: 'boom' } })),
    });
    await expect(h.handle.done).resolves.toBe(1);
    await h.transport.exited;
    await settle();
    h.handle.abort.abort();
    await settle();
    expect(onMcpConfigRestored).toHaveBeenCalledTimes(1);
  });

  it('revokes when the agent process dies after a turn', async () => {
    const onMcpConfigRestored = jest.fn();
    const h = start({ options: { onMcpConfigRestored } });
    await expect(h.handle.done).resolves.toBe(0);
    await h.transport.exit(1);
    await settle();
    expect(onMcpConfigRestored).toHaveBeenCalledTimes(1);
  });

  it('revokes after a turn that failed and broke the session', async () => {
    const onMcpConfigRestored = jest.fn();
    const h = start({
      options: { onMcpConfigRestored },
      script: (agent) =>
        agent.handle('session/prompt', async () => {
          await h.transport.exit(1);
          return { hold: true };
        }),
    });
    await expect(h.handle.done).resolves.toBe(1);
    await settle();
    expect(onMcpConfigRestored).toHaveBeenCalledTimes(1);
  });

  it('revokes at once when the lane has no spawner', async () => {
    const onMcpConfigRestored = jest.fn();
    const handle = createProviderSessionLaneHandle({
      profile: createProfile(),
      options: { task: 't', workingDirectory: process.cwd(), onMcpConfigRestored },
      command: 'test-agent',
    });
    await expect(handle.done).resolves.toBe(1);
    expect(onMcpConfigRestored).toHaveBeenCalledTimes(1);
  });
});

describe('createProviderSessionLaneHandle — lane turn input (B8)', () => {
  const PNG = 'iVBORw0KGgo=';
  const IMAGE_CAPABLE = { loadSession: true, sessionCapabilities: { resume: {} }, promptCapabilities: { image: true } };
  const EFFORT_OPTION = {
    id: 'reasoning_effort',
    name: 'Effort',
    type: 'select',
    currentValue: 'low',
    options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }],
  };
  const effortProfile: Partial<AcpVendorProfile> = {
    sessionConfig: (options) => [
      ...(options.model ? [{ configId: 'model', value: options.model, binding: true }] : []),
      ...(options.reasoningEffort ? [{ configId: 'reasoning_effort', value: options.reasoningEffort }] : []),
    ],
  };

  /** Replays a fixture's `available_commands_update` payloads during the first prompt. */
  function withFixtureCommands(fixture: string) {
    const updates = readAcpFixture(fixture)
      .filter((envelope) => envelope.dir === 'in' && envelope.msg?.['method'] === 'session/update')
      .map((envelope) => (envelope.msg?.['params'] as { update?: unknown } | undefined)?.update)
      .filter((update): update is Record<string, unknown> =>
        typeof update === 'object' && update !== null &&
        (update as Record<string, unknown>)['sessionUpdate'] === 'available_commands_update');
    return (agent: FakeAcpAgent) =>
      agent.handle('session/prompt', async (params, fake) => {
        for (const update of updates) await fake.sessionUpdate(String(params['sessionId']), update);
        return { result: { stopReason: 'end_turn' } };
      });
  }

  it('sends images and files as ACP content blocks on a continued turn', async () => {
    const h = start({ agent: { agentCapabilities: IMAGE_CAPABLE } });
    await expect(h.handle.done).resolves.toBe(0);
    expect(h.handle.turnInputSupport?.().images).toEqual({ state: 'supported', onSteer: false });
    const next = await h.handle.continue?.('look', {
      images: [{ data: PNG, mediaType: 'image/png' }],
      files: ['/repo/src/a.ts'],
    });
    await expect(next?.done).resolves.toBe(0);
    const prompt = paramsOf(sent(h.agent, 'session/prompt')[1])['prompt'];
    expect(prompt).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', mimeType: 'image/png', data: PNG },
      { type: 'resource_link', uri: 'file:///repo/src/a.ts', name: 'a.ts' },
    ]);
    expect(JSON.stringify(h.logger.info.mock.calls)).not.toContain(PNG);
    // Req 4.3: every turn input item the ACP sections claim has its handle operation.
    const sections = acpLaneManifestSections(createProfile(), 'No lane prompts.');
    expect(laneTurnInputContractViolations(h.handle, sections as unknown as CliAdapterManifest)).toEqual([]);
  });

  it('refuses images the agent did not advertise and sends nothing', async () => {
    const h = start();
    await expect(h.handle.done).resolves.toBe(0);
    expect(h.handle.turnInputSupport?.().images).toEqual({
      state: 'unsupported',
      reason: `${NAME} did not advertise image input.`,
    });
    await expect(
      h.handle.continue?.('look', { images: [{ data: PNG, mediaType: 'image/png' }] }),
    ).rejects.toThrow(`${NAME} did not advertise image input`);
    expect(sent(h.agent, 'session/prompt')).toHaveLength(1);
  });

  it('applies model and effort through session/set_config_option for the next turn', async () => {
    const h = start({ agent: { configOptions: [MODEL_OPTION, EFFORT_OPTION] }, profile: effortProfile });
    await expect(h.handle.done).resolves.toBe(0);
    const before = sent(h.agent, 'session/set_config_option').length;
    await expect(h.handle.applyTurnSettings?.({ model: 'model-b', reasoningEffort: 'high' }))
      .resolves.toEqual({ model: 'model-b', reasoningEffort: 'high', appliesAt: 'next-turn' });
    expect(sent(h.agent, 'session/set_config_option').slice(before).map(paramsOf)).toEqual([
      { sessionId: SESSION_ID, configId: 'model', value: 'model-b' },
      { sessionId: SESSION_ID, configId: 'reasoning_effort', value: 'high' },
    ]);
  });

  it('refuses an effort the profile maps to nothing before the model changes (M2)', async () => {
    const h = start({ agent: { configOptions: [MODEL_OPTION, EFFORT_OPTION] } });
    await expect(h.handle.done).resolves.toBe(0);
    const before = sent(h.agent, 'session/set_config_option').length;
    await expect(h.handle.applyTurnSettings?.({ model: 'model-b', reasoningEffort: 'high' }))
      .rejects.toMatchObject({ field: 'reasoningEffort' });
    expect(sent(h.agent, 'session/set_config_option').slice(before)).toHaveLength(0);
  });

  it('rolls the model back when the agent refuses the effort (M2)', async () => {
    const h = start({ agent: { configOptions: [MODEL_OPTION, EFFORT_OPTION] }, profile: effortProfile });
    await expect(h.handle.done).resolves.toBe(0);
    h.agent.handle('session/set_config_option', (params) =>
      params['configId'] === 'reasoning_effort'
        ? { error: { code: -32602, message: 'Invalid params' } }
        : { result: { configOptions: [MODEL_OPTION, EFFORT_OPTION] } });
    const before = sent(h.agent, 'session/set_config_option').length;
    await expect(h.handle.applyTurnSettings?.({ model: 'model-b', reasoningEffort: 'high' }))
      .rejects.toMatchObject({ field: 'reasoningEffort', reason: `${NAME} did not accept the effort level "high".` });
    expect(sent(h.agent, 'session/set_config_option').slice(before).map(paramsOf)).toEqual([
      { sessionId: SESSION_ID, configId: 'model', value: 'model-b' },
      { sessionId: SESSION_ID, configId: 'reasoning_effort', value: 'high' },
      { sessionId: SESSION_ID, configId: 'model', value: 'model-a' },
    ]);
  });

  it('refuses a model the agent rejects, naming the CLI and the model', async () => {
    const h = start({ agent: { configOptions: [MODEL_OPTION] }, profile: effortProfile });
    await expect(h.handle.done).resolves.toBe(0);
    h.agent.handle('session/set_config_option', () => ({
      error: { code: -32602, message: 'Invalid params' },
    }));
    await expect(h.handle.applyTurnSettings?.({ model: 'model-x' })).rejects.toMatchObject({
      field: 'model',
      reason: `${NAME} did not accept the model "model-x".`,
    });
  });

  it('splits the Grok fixture into commands and skills and hides always-approve', async () => {
    const h = start({
      agent: { configOptions: [MODEL_OPTION] },
      profile: { ...effortProfile, hiddenLaneCommands: ['always-approve'] },
      script: withFixtureCommands('grok-plain-turn.ndjson'),
    });
    await expect(h.handle.done).resolves.toBe(0);
    const catalog = await h.handle.listTurnOptions?.();
    const names = catalog?.commands.map((command) => command.name) ?? [];
    expect(names).not.toContain('always-approve');
    expect(names).toHaveLength(54);
    expect(catalog?.commands.filter((command) => command.group === 'skill')).toHaveLength(40);
    expect(catalog?.commands[0]).toEqual({
      name: 'compact',
      description: 'Compress conversation history to save context window',
      group: 'command',
    });
    expect(catalog?.models).toEqual([
      { id: 'model-a', name: 'Model A' },
      { id: 'model-b', name: 'Model B' },
    ]);
    expect(catalog?.currentModel).toBe('model-a');
    expect(catalog?.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(h.handle.turnInputSupport?.().skills).toEqual({ state: 'supported' });
  });

  it('reports no skills for the agy fixture', async () => {
    const h = start({ script: withFixtureCommands('antigravity-p3-ptah-mcp-tool-use.ndjson') });
    await expect(h.handle.done).resolves.toBe(0);
    const catalog = await h.handle.listTurnOptions?.();
    expect(catalog?.commands).toHaveLength(13);
    expect(catalog?.commands.every((command) => command.group === 'command')).toBe(true);
    expect(catalog?.efforts).toEqual([]);
    expect(h.handle.turnInputSupport?.().skills).toEqual({
      state: 'unsupported',
      reason: `${NAME} advertises no skills to lanes.`,
    });
  });

  it('keeps turn-total usage semantics after the normalizer change, with and without a handle scope', async () => {
    const h = start();
    await expect(h.handle.done).resolves.toBe(0);
    expect(h.handle.usageScope).toBe('turn');
    const failed = createProviderSessionLaneHandle({
      profile: createProfile(),
      options: { task: 'x', workingDirectory: process.cwd() },
      command: 'test-agent',
    });
    // The manager's fold: segment scope ?? handle scope ?? 'turn'.
    expect(failed.usageScope).toBeUndefined();
    const normalizer = new LaneUsageNormalizer();
    const first = normalizer.accept('lane', h.handle.usageScope ?? 'turn', { inputTokens: 10, outputTokens: 4 });
    expect(first.increment).toEqual({ inputTokens: 10, outputTokens: 4 });
    expect(first.turnTotal).toEqual({ inputTokens: 10, outputTokens: 4 });
    normalizer.settleTurn('lane');
    const second = normalizer.accept('lane', failed.usageScope ?? 'turn', { inputTokens: 7, outputTokens: 2 });
    expect(second.increment).toEqual({ inputTokens: 7, outputTokens: 2 });
    expect(second.turnTotal).toEqual({ inputTokens: 7, outputTokens: 2 });
  });
});
