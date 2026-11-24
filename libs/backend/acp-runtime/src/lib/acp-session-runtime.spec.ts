/**
 * createAcpSession — the protocol side of the ACP runtime against the
 * scripted fake agent: the events it emits (with their identity), the
 * error codes, and an SDK that cannot load. The lane semantics on top
 * (`SdkHandle`, segments, continuation) are pinned in
 * `cli-agent-runtime/.../provider-session-lane-handle.spec.ts`.
 */
import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';
import { createMockLogger } from '@ptah-extension/shared/testing';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
  type FakeAcpAgent,
  type FakeAcpAgentOptions,
  type FakeAcpTransport,
} from './__fixtures__/fake-acp-agent';
import { readAcpFixture } from './__fixtures__/acp-fixture-reader';
import type { AcpSpawnOptions } from './acp-process-transport';
import * as loader from './acp-sdk-loader';
import { createAcpSession, readAvailableCommands, type AcpSession } from './acp-session-runtime';
import type { AcpVendorProfile } from './acp-vendor-profile';

const SESSION_ID = 'sess-1';

const profile: AcpVendorProfile = {
  vendor: 'grok',
  displayName: 'Test Agent',
  signInHint: 'run `test login`',
  buildSpawn: () => ({ args: ['agent', 'stdio'] }),
  buildMcpServers: () => [],
};

interface Harness {
  readonly session: AcpSession;
  readonly agent: FakeAcpAgent;
  readonly transport: FakeAcpTransport;
  readonly events: ProviderSessionEvent[];
  readonly resolved: string[];
  readonly abort: AbortController;
  readonly spawn: () => AcpSpawnOptions | undefined;
}

const live: FakeAcpAgent[] = [];

function start(
  agentOptions: FakeAcpAgentOptions = {},
  script?: (agent: FakeAcpAgent) => void,
): Harness {
  const agent = createFakeAcpAgent({ sessionId: SESSION_ID, ...agentOptions });
  live.push(agent);
  script?.(agent);
  const transport = createFakeAcpTransport(agent);
  const events: ProviderSessionEvent[] = [];
  const resolved: string[] = [];
  const abort = new AbortController();
  let spawn: AcpSpawnOptions | undefined;
  const session = createAcpSession({
    profile,
    options: { workingDirectory: process.cwd(), agentId: 'agent-1', mcp: [] },
    command: 'test-agent',
    baseEnv: { PATH: '/bin' },
    transportFactory: (options) => {
      spawn = options;
      return transport;
    },
    logger: createMockLogger(),
    signal: abort.signal,
    onEvent: (event) => events.push(event),
    onSessionResolved: (id) => resolved.push(id),
  });
  return {
    session,
    agent,
    transport,
    events,
    resolved,
    abort,
    spawn: () => spawn,
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all(live.splice(0).map((agent) => agent.close()));
});

describe('createAcpSession', () => {
  it('hands the profile argv, the complete env and the console flag to the transport', () => {
    const h = start();
    expect(h.spawn()?.args).toEqual(['agent', 'stdio']);
    expect(h.spawn()?.command).toBe('test-agent');
    expect(h.spawn()?.env).toEqual({ PATH: '/bin' });
    expect(h.spawn()?.needsConsole).toBe(false);
    h.abort.abort();
  });

  it('sets up the session, then stamps turn events with their identity', async () => {
    const h = start({}, (agent) =>
      agent.handle('session/prompt', async (params, fake) => {
        await fake.sessionUpdate(String(params['sessionId']), {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hello' },
        });
        return {
          result: {
            stopReason: 'end_turn',
            _meta: { usage: { inputTokens: 3, outputTokens: 2 } },
          },
        };
      }),
    );

    await expect(h.session.start()).resolves.toEqual({
      ok: true,
      restoredContext: false,
    });
    expect(h.resolved).toEqual([SESSION_ID]);
    expect(h.session.isSetupComplete()).toBe(true);
    await expect(h.session.prompt('hi')).resolves.toBe(0);

    // Session, run, this runtime instance (unique per process), prompt number.
    const turnId = h.events[0]?.turnId;
    expect(turnId).toMatch(new RegExp(`^${SESSION_ID}:agent-1:[0-9a-f]{8}:1$`));
    expect(h.events.map((event) => event.type)).toEqual([
      'textDelta',
      'usage',
      'terminal',
    ]);
    for (const event of h.events) {
      expect(event).toMatchObject({
        contextId: 'agent-1',
        processGeneration: 1,
        sessionId: SESSION_ID,
        turnId,
      });
    }
    expect(h.events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(h.events[1]).toMatchObject({
      type: 'usage',
      provider: 'Test Agent',
      turnId,
      usage: { inputTokens: 3, outputTokens: 2 },
    });
    expect(h.events[2]).toMatchObject({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    expect(h.session.isTurnRunning()).toBe(false);
    h.abort.abort();
  });

  it('reads the protocol PromptResponse.usage and names the advertised model (no drain wait)', async () => {
    const h = start(
      {
        configOptions: [
          {
            id: 'model',
            category: 'model',
            type: 'select',
            currentValue: 'agent-model-1',
            options: [{ value: 'agent-model-1', name: 'One' }],
          },
        ],
      },
      (agent) =>
        agent.handle('session/prompt', async (params, fake) => {
          await fake.sessionUpdate(String(params['sessionId']), {
            sessionUpdate: 'usage_update',
            used: 900,
            size: 1000,
          });
          return {
            result: {
              stopReason: 'end_turn',
              usage: {
                inputTokens: 7,
                outputTokens: 2,
                cachedReadTokens: 5,
                cachedWriteTokens: null,
                totalTokens: 14,
              },
            },
          };
        }),
    );
    await h.session.start();
    const started = Date.now();
    await expect(h.session.prompt('hi')).resolves.toBe(0);
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(h.events.find((event) => event.type === 'usage')).toMatchObject({
      usage: {
        model: 'agent-model-1',
        inputTokens: 7,
        outputTokens: 2,
        cacheReadTokens: 5,
        contextTokens: 900,
        // The window from `usage_update.size` (issue #1459: context fill).
        contextWindow: 1000,
      },
    });
    const usage = h.events.find((event) => event.type === 'usage');
    expect(usage?.type === 'usage' && usage.usage).not.toHaveProperty('cacheWriteTokens');
    h.abort.abort();
  });

  it('emits trimmed stderr lines as diagnostics and drops blank ones', () => {
    const h = start();
    h.spawn()?.onStderrLine?.('  warming up  ');
    h.spawn()?.onStderrLine?.('   ');
    expect(h.events).toEqual([
      expect.objectContaining({
        type: 'diagnostic',
        stream: 'stderr',
        line: 'warming up',
      }),
    ]);
    expect(h.events[0]).not.toHaveProperty('sessionId');
    h.abort.abort();
  });

  it('fails setup with protocol-unsupported on another protocol version and kills the agent', async () => {
    const h = start({ protocolVersion: 3 });

    await expect(h.session.start()).resolves.toEqual({ ok: false });
    expect(h.events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: {
          code: 'protocol-unsupported',
          message: 'Test Agent speaks unsupported ACP protocol version 3',
        },
      }),
    ]);
    expect(h.transport.killCount).toBe(1);
  });

  it('accepts a protocol version 2 reply that has the v1 shape (D8)', async () => {
    const h = start({ protocolVersion: 2 });
    await expect(h.session.start()).resolves.toEqual({ ok: true, restoredContext: false });
    expect(h.agent.received[0]).toMatchObject({
      method: 'initialize',
      params: { protocolVersion: 1 },
    });
    h.abort.abort();
  });

  it('refuses a version 2 reply whose shape is not v1', async () => {
    const h = start({ protocolVersion: 2, agentCapabilities: { loadSession: 'yes' } });
    await expect(h.session.start()).resolves.toEqual({ ok: false });
    expect(h.events[0]).toMatchObject({
      type: 'error',
      error: {
        code: 'protocol-unsupported',
        message:
          'Test Agent speaks ACP protocol version 2 with a reply that is not v1-shaped (agentCapabilities.loadSession)',
      },
    });
  });

  it('maps AcpUnavailableError to a failed setup', async () => {
    jest
      .spyOn(loader, 'connectAcp')
      .mockRejectedValueOnce(
        new loader.AcpUnavailableError(new Error('Cannot find module')),
      );
    const h = start();

    await expect(h.session.start()).resolves.toEqual({ ok: false });
    const errors = h.events.flatMap((event) =>
      event.type === 'error' ? [event.error.message] : [],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      'The ACP client library could not be loaded: Cannot find module',
    );
    expect(h.transport.killCount).toBe(1);
  });

  it('refuses a prompt before the session exists with one error and one terminal event', async () => {
    const h = start();
    await expect(h.session.prompt('early')).resolves.toBe(1);
    expect(h.events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: {
          code: 'turn-failed',
          message: 'Test Agent has no ACP session to prompt',
        },
      }),
      // Every accepted prompt ends with exactly one terminal (review S-2).
      expect.objectContaining({ type: 'terminal', status: 'failed', disposition: 'broken' }),
    ]);
    h.abort.abort();
  });
});

describe('available commands', () => {
  /** Every recorded `available_commands_update` payload of a fixture, in order. */
  function recordedCommandUpdates(name: string): Record<string, unknown>[] {
    return readAcpFixture(name)
      .filter((envelope) => envelope.dir === 'in' && envelope.msg?.['method'] === 'session/update')
      .map((envelope) => (envelope.msg?.['params'] as { update?: unknown } | undefined)?.update)
      .filter((update): update is Record<string, unknown> =>
        typeof update === 'object' && update !== null &&
        (update as Record<string, unknown>)['sessionUpdate'] === 'available_commands_update');
  }

  async function captured(fixture: string): Promise<AcpSession> {
    const updates = recordedCommandUpdates(fixture);
    expect(updates.length).toBeGreaterThan(0);
    const h = start({}, (agent) =>
      agent.handle('session/prompt', async (params, fake) => {
        for (const update of updates) await fake.sessionUpdate(String(params['sessionId']), update);
        return { result: { stopReason: 'end_turn' } };
      }),
    );
    await h.session.start();
    expect(h.session.getAvailableCommands()).toEqual([]);
    await h.session.prompt('hi');
    return h.session;
  }

  it('keeps the latest Grok list: 55 entries, skills carry their SKILL.md path', async () => {
    const commands = (await captured('grok-plain-turn.ndjson')).getAvailableCommands();
    expect(commands).toHaveLength(55);
    expect(commands[0]).toEqual({ name: 'compact', description: 'Compress conversation history to save context window' });
    expect(commands.filter((command) => command.path?.endsWith('SKILL.md'))).toHaveLength(40);
    expect(commands.map((command) => command.name)).toContain('always-approve');
  });

  it('keeps the agy list, which has no _meta paths', async () => {
    const commands = (await captured('antigravity-p3-ptah-mcp-tool-use.ndjson')).getAvailableCommands();
    expect(commands).toHaveLength(13);
    expect(commands[0]?.name).toBe('goal');
    expect(commands.some((command) => command.path !== undefined)).toBe(false);
  });

  it('reads malformed updates defensively', () => {
    expect(readAvailableCommands({ sessionUpdate: 'plan' })).toBeUndefined();
    expect(readAvailableCommands({ sessionUpdate: 'available_commands_update' })).toBeUndefined();
    expect(readAvailableCommands({
      sessionUpdate: 'available_commands_update',
      availableCommands: [null, { name: '' }, { name: 'x', description: 3, _meta: { path: 7 } }],
    })).toEqual([{ name: 'x' }]);
  });
});
