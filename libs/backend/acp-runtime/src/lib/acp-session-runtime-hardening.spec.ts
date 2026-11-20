/**
 * createAcpSession — the P2 hardening against the fake ACP agent, scripted
 * with recorded agent replies where a fixture exists:
 * - Antigravity (`antigravity-p2-handshake.ndjson`, agy 1.5.13): a v1 reply,
 *   advertised modes, `authenticate` on auth-required;
 * - Grok: interrupt keeps the process (`grok-p2-cancel-mid-shell`),
 *   `session/load` replay capture (`grok-p2-session-load-replay`), approvals
 *   (`grok-p2-permission-allow-once`);
 * - require-resume, the generation guard and respawn, the prompt watchdog,
 *   extension request hooks and the spawn env.
 */
import type {
  ProviderApprovalSink,
  ProviderSessionEvent,
} from '@ptah-extension/provider-session-contracts';
import { createMockLogger } from '@ptah-extension/shared/testing';
import {
  readAcpFixture,
  recordedResult,
  recordedUpdatesDuring,
} from './__fixtures__/acp-fixture-reader';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
  type FakeAcpAgent,
  type FakeAcpAgentOptions,
  type FakeAcpTransport,
} from './__fixtures__/fake-acp-agent';
import type { AcpProcessExit, AcpSpawnOptions } from './acp-process-transport';
import {
  ACP_AUTH_REQUIRED_CODE,
  createAcpSession,
  type AcpSession,
  type AcpSessionConfig,
} from './acp-session-runtime';
import type { AcpSessionOptions, AcpVendorProfile } from './acp-vendor-profile';

const AGY = readAcpFixture('antigravity-p2-handshake.ndjson');
const CANCEL = readAcpFixture('grok-p2-cancel-mid-shell.ndjson');
const LOAD = readAcpFixture('grok-p2-session-load-replay.ndjson');
const ALLOW = readAcpFixture('grok-p2-permission-allow-once.ndjson');

function permissionRequests(): Record<string, unknown>[] {
  return ALLOW.flatMap((envelope) =>
    envelope.dir === 'in' && envelope.msg?.['method'] === 'session/request_permission'
      ? [envelope.msg['params'] as Record<string, unknown>]
      : [],
  );
}

const baseProfile: AcpVendorProfile = {
  vendor: 'grok',
  displayName: 'Test Agent',
  signInHint: 'run `test login`',
  buildSpawn: () => ({ args: ['acp'] }),
  buildMcpServers: () => [],
};

interface Harness {
  readonly session: AcpSession;
  readonly agents: FakeAcpAgent[];
  readonly transports: FakeAcpTransport[];
  readonly spawns: AcpSpawnOptions[];
  readonly events: ProviderSessionEvent[];
  readonly abort: AbortController;
  readonly types: () => string[];
  readonly errors: () => Array<{ code: string; message: string }>;
}

const live: FakeAcpAgent[] = [];

function start(setup: {
  profile?: Partial<AcpVendorProfile>;
  options?: Partial<AcpSessionOptions>;
  config?: Partial<AcpSessionConfig>;
  agent?: (generation: number) => FakeAcpAgentOptions;
  script?: (agent: FakeAcpAgent, generation: number) => void;
  /** Build the transport around an agent (default: the fake transport). */
  transport?: (agent: FakeAcpAgent) => FakeAcpTransport;
} = {}): Harness {
  const agents: FakeAcpAgent[] = [];
  const transports: FakeAcpTransport[] = [];
  const spawns: AcpSpawnOptions[] = [];
  const events: ProviderSessionEvent[] = [];
  const abort = new AbortController();
  const session = createAcpSession({
    profile: { ...baseProfile, ...setup.profile },
    options: { workingDirectory: process.cwd(), agentId: 'agent-1', mcp: [], ...setup.options },
    command: 'test-agent',
    baseEnv: { PATH: '/bin', HOME: '/home/u' },
    transportFactory: (spawnOptions) => {
      const generation = spawns.push(spawnOptions);
      const agent = createFakeAcpAgent({ sessionId: 'sess-1', ...setup.agent?.(generation) });
      live.push(agent);
      agents.push(agent);
      setup.script?.(agent, generation);
      const transport = (setup.transport ?? createFakeAcpTransport)(agent);
      transports.push(transport);
      return transport;
    },
    logger: createMockLogger(),
    signal: abort.signal,
    onEvent: (event) => events.push(event),
    ...setup.config,
  });
  return {
    session,
    agents,
    transports,
    spawns,
    events,
    abort,
    types: () => events.map((event) => event.type),
    errors: () =>
      events.flatMap((event) => (event.type === 'error' ? [{ ...event.error }] : [])),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

const sent = (agent: FakeAcpAgent, method: string) =>
  agent.received.filter((message) => message.method === method);

afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(live.splice(0).map((agent) => agent.close()));
});

describe('Antigravity handshake (agy 1.5.13 fixture)', () => {
  const agyAgent = (): FakeAcpAgentOptions => {
    const init = recordedResult(AGY, 'initialize');
    return {
      protocolVersion: init['protocolVersion'] as number,
      agentCapabilities: init['agentCapabilities'] as Record<string, unknown>,
    };
  };
  const agyScript = (agent: FakeAcpAgent): void => {
    agent.handle('initialize', () => ({ result: recordedResult(AGY, 'initialize') }));
    agent.handle('session/new', () => ({ result: recordedResult(AGY, 'session/new') }));
    // PF-4 recorded no set_mode; ACP answers it with an empty result.
    agent.handle('session/set_mode', () => ({ result: {} }));
  };

  it('accepts the recorded protocol-1 reply to the v1 request and resolves the recorded session id', async () => {
    const h = start({ agent: agyAgent, script: agyScript });
    await expect(h.session.start()).resolves.toEqual({ ok: true, restoredContext: false });
    expect(h.session.getSessionId()).toBe('25488c9c-f58f-4ca9-a4fe-ff84d418aade');
    expect(h.errors()).toEqual([]);
    h.abort.abort();
  });

  it('sets an advertised mode through session/set_mode and skips one the agent lacks', async () => {
    const planned = start({ agent: agyAgent, script: agyScript, profile: { modeFor: () => 'plan' } });
    await planned.session.start();
    expect(sent(planned.agents[0], 'session/set_mode').map((m) => m.params)).toEqual([
      { sessionId: '25488c9c-f58f-4ca9-a4fe-ff84d418aade', modeId: 'plan' },
    ]);
    expect(planned.events.find((event) => event.type === 'modeChanged')).toMatchObject({
      mode: 'plan',
    });
    planned.abort.abort();

    const unknown = start({ agent: agyAgent, script: agyScript, profile: { modeFor: () => 'yolo' } });
    await expect(unknown.session.start()).resolves.toMatchObject({ ok: true });
    expect(sent(unknown.agents[0], 'session/set_mode')).toHaveLength(0);
    expect(unknown.events.filter((event) => event.type === 'info')).toEqual([
      expect.objectContaining({ message: 'Test Agent does not offer the "yolo" mode, so it was not applied' }),
    ]);
    unknown.abort.abort();
  });

  it('authenticates once with the profile method when session/new answers auth-required', async () => {
    let creates = 0;
    const h = start({
      agent: agyAgent,
      profile: { authMethod: 'oauth-personal' },
      script: (agent) => {
        agyScript(agent);
        agent.handle('session/new', () =>
          ++creates === 1
            ? { error: { code: ACP_AUTH_REQUIRED_CODE, message: 'Authentication required' } }
            : { result: recordedResult(AGY, 'session/new') },
        );
        agent.handle('authenticate', () => ({ result: {} }));
      },
    });
    await expect(h.session.start()).resolves.toMatchObject({ ok: true });
    expect(sent(h.agents[0], 'authenticate').map((m) => m.params)).toEqual([
      { methodId: 'oauth-personal' },
    ]);
    expect(sent(h.agents[0], 'session/new')).toHaveLength(2);
    h.abort.abort();
  });

  it('fails with auth-required and the sign-in hint when no method applies', async () => {
    const h = start({
      agent: agyAgent,
      script: (agent) => {
        agyScript(agent);
        agent.handle('session/new', () => ({
          error: { code: ACP_AUTH_REQUIRED_CODE, message: 'Authentication required' },
        }));
      },
    });
    await expect(h.session.start()).resolves.toEqual({ ok: false });
    expect(sent(h.agents[0], 'authenticate')).toHaveLength(0);
    expect(h.errors()).toEqual([
      { code: 'auth-required', message: 'Test Agent is not signed in: run `test login`' },
    ]);
  });
});

describe('re-attach', () => {
  it('fails setup with resume-failed when the attach must succeed (require-resume)', async () => {
    const h = start({
      options: { resumeSessionId: 'old', attachFailure: 'error' },
      script: (agent) =>
        agent.handle('session/resume', () => ({ error: { code: -32002, message: 'Resource not found' } })),
    });
    await expect(h.session.start()).resolves.toEqual({ ok: false });
    expect(h.errors()).toEqual([
      { code: 'resume-failed', message: 'could not resume old: Resource not found' },
    ]);
    expect(sent(h.agents[0], 'session/new')).toHaveLength(0);
    expect(h.transports[0].killCount).toBe(1);
  });

  it('uses session/load when only load is advertised, whatever the preference', async () => {
    const h = start({
      options: { resumeSessionId: 'old' },
      agent: () => ({ agentCapabilities: { loadSession: true } }),
    });
    await expect(h.session.start()).resolves.toEqual({ ok: true, restoredContext: true });
    expect(sent(h.agents[0], 'session/load')).toHaveLength(1);
    expect(sent(h.agents[0], 'session/resume')).toHaveLength(0);
    h.abort.abort();
  });

  it('captures the recorded session/load history as replayed user and agent turns', async () => {
    const h = start({
      options: { resumeSessionId: 'old', attachMethod: 'load' },
      script: (agent) =>
        agent.handle('session/load', async (params, fake) => {
          for (const { update, meta } of recordedUpdatesDuring(LOAD, 'session/load')) {
            await fake.sessionUpdate(String(params['sessionId']), update, meta);
          }
          return { result: recordedResult(LOAD, 'session/load') };
        }),
    });
    await expect(h.session.start()).resolves.toEqual({ ok: true, restoredContext: true });

    // Nothing of the history reaches the live stream.
    expect(h.events.filter((event) => event.replayed)).toEqual([]);
    const replay = h.session.getReplay();
    expect(replay.every((event) => event.replayed === true && event.sessionId === 'old')).toBe(true);
    const user = replay.filter((event) => event.type === 'userText');
    expect(user).toEqual([
      expect.objectContaining({
        text: 'Remember the token ZEBRA-4471. Reply OK only.',
        turnId: 'old:replay:1',
      }),
    ]);
    const reply = replay
      .flatMap((event) => (event.type === 'textDelta' ? [event.delta] : []))
      .join('');
    expect(reply).toBe('OK');
    expect(replay.some((event) => event.type === 'reasoning')).toBe(true);
    h.abort.abort();
  });
});

describe('interrupt (grok-p2-cancel-mid-shell)', () => {
  const cancelScript = (agent: FakeAcpAgent): void => {
    agent.handle('session/new', () => ({ result: recordedResult(CANCEL, 'session/new') }));
    let prompts = 0;
    agent.handle('session/prompt', async (params, fake) => {
      if (++prompts > 1) return { result: { stopReason: 'end_turn' } };
      for (const { update, meta } of recordedUpdatesDuring(CANCEL, 'session/prompt')) {
        const kind = (update as Record<string, unknown>)['sessionUpdate'];
        if (kind === 'agent_message_chunk' || kind === 'tool_call') {
          await fake.sessionUpdate(String(params['sessionId']), update, meta);
        }
      }
      return { hold: true };
    });
  };
  const sessionId = String(recordedResult(CANCEL, 'session/new')['sessionId']);

  it('cancels the turn, keeps the process and takes the next prompt on it', async () => {
    const h = start({ profile: { cancelBehavior: 'await-reply' }, script: cancelScript });
    await h.session.start();
    expect(h.session.supportsInterrupt()).toBe(true);
    const turn = h.session.prompt('run the slow command');
    await h.agents[0].next((m) => m.method === 'session/prompt');
    await settle();

    await expect(h.session.interrupt()).resolves.toBe(true);
    await expect(turn).resolves.toBe(1);
    expect(sent(h.agents[0], 'session/cancel').map((m) => m.params)).toEqual([{ sessionId }]);
    expect(h.transports[0].killCount).toBe(0);
    expect(h.session.isClosed()).toBe(false);
    expect(h.events.filter((event) => event.type === 'terminal')).toEqual([
      expect.objectContaining({ status: 'interrupted', disposition: 'reusable' }),
    ]);
    expect(h.errors()).toEqual([]);

    await expect(h.session.prompt('next')).resolves.toBe(0);
    expect(h.session.getPid()).toBe(4242);
    h.abort.abort();
  });

  it('sends the profile cancel _meta', async () => {
    const h = start({
      profile: { cancelBehavior: 'await-reply', cancelMeta: () => ({ reason: 'user' }) },
      script: cancelScript,
    });
    await h.session.start();
    const turn = h.session.prompt('x');
    await h.agents[0].next((m) => m.method === 'session/prompt');
    await settle();
    await h.session.interrupt();
    await turn;
    expect(sent(h.agents[0], 'session/cancel')[0].params).toEqual({
      sessionId,
      _meta: { reason: 'user' },
    });
    h.abort.abort();
  });

  it('offers no interrupt and stops the agent for the default kill behaviour', async () => {
    const h = start({ script: cancelScript });
    await h.session.start();
    expect(h.session.supportsInterrupt()).toBe(false);
    const turn = h.session.prompt('x');
    await h.agents[0].next((m) => m.method === 'session/prompt');
    await settle();
    await expect(h.session.interrupt()).resolves.toBe(false);
    await turn;
    expect(h.transports[0].killCount).toBe(1);
  });

  it('returns false when no turn is running', async () => {
    const h = start({ profile: { cancelBehavior: 'await-reply' } });
    await h.session.start();
    await expect(h.session.interrupt()).resolves.toBe(false);
    expect(sent(h.agents[0], 'session/cancel')).toHaveLength(0);
    h.abort.abort();
  });
});

describe('process generations', () => {
  /** A transport whose `exited` the spec settles while the agent stream stays open. */
  function detachedExit(agent: FakeAcpAgent): FakeAcpTransport & { die(): void } {
    const inner = createFakeAcpTransport(agent);
    let settle!: (exit: AcpProcessExit) => void;
    const exited = new Promise<AcpProcessExit>((resolve) => {
      settle = resolve;
    });
    return {
      ...inner,
      exited,
      getPid: () => undefined,
      get killCount() {
        return inner.killCount;
      },
      die: () => settle({ code: 1, signal: null }),
    };
  }

  it('respawns on the next prompt after an exit, re-attaches, and drops what the dead process still sends', async () => {
    const first: Array<FakeAcpTransport & { die(): void }> = [];
    const h = start({
      config: { respawnOnPrompt: true },
      transport: (agent) => {
        const transport = detachedExit(agent);
        first.push(transport);
        return transport;
      },
      script: (agent) =>
        agent.handle('session/prompt', async (params, fake) => {
          await fake.sessionUpdate(String(params['sessionId']), {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'live' },
          });
          return { result: { stopReason: 'end_turn', _meta: { usage: { inputTokens: 1, outputTokens: 1 } } } };
        }),
    });
    await h.session.start();
    first[0].die();
    await settle();
    expect(h.session.isClosed()).toBe(true);

    await expect(h.session.prompt('after crash')).resolves.toBe(0);
    expect(h.spawns).toHaveLength(2);
    expect(h.session.getProcessGeneration()).toBe(2);
    expect(sent(h.agents[1], 'session/resume').map((m) => m.params)).toEqual([
      { sessionId: 'sess-1', cwd: process.cwd(), mcpServers: [] },
    ]);
    const before = h.events.length;

    // The dead generation is still connected in this spec: whatever it sends is dropped.
    await h.agents[0].sessionUpdate('sess-1', {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'LATE' },
    });
    h.spawns[0].onStderrLine?.('late stderr');
    await settle();
    expect(h.events.slice(before)).toEqual([]);
    expect(h.events.filter((event) => event.type === 'textDelta').every((event) => event.processGeneration === 2)).toBe(true);
    h.abort.abort();
  });

  it('fails the prompt with resume-failed when the respawned agent cannot re-attach', async () => {
    const dying: Array<FakeAcpTransport & { die(): void }> = [];
    const h = start({
      config: { respawnOnPrompt: true },
      agent: (generation) => (generation === 2 ? { agentCapabilities: {} } : {}),
      transport: (agent) => {
        const transport = detachedExit(agent);
        dying.push(transport);
        return transport;
      },
    });
    await h.session.start();
    dying[0].die();
    await settle();
    await expect(h.session.prompt('x')).resolves.toBe(1);
    expect(h.errors()).toEqual([
      { code: 'resume-failed', message: 'could not resume sess-1: Test Agent does not support resuming a session' },
    ]);
    expect(sent(h.agents[1], 'session/new')).toHaveLength(0);
  });
});

describe('approvals through a sink (A17)', () => {
  const [executeRequest] = permissionRequests();

  function withSink(sink: ProviderApprovalSink) {
    return start({
      config: { approvals: sink },
      script: (agent) =>
        agent.handle('session/prompt', async (params, fake) => {
          const answer = await fake.request('session/request_permission', {
            ...executeRequest,
            sessionId: params['sessionId'],
          });
          void answer;
          return { result: { stopReason: 'end_turn', _meta: { usage: { inputTokens: 1, outputTokens: 1 } } } };
        }),
    });
  }

  async function answerFor(sink: ProviderApprovalSink): Promise<{ answer: unknown; h: Harness }> {
    const h = withSink(sink);
    await h.session.start();
    await h.session.prompt('x');
    const answer = h.agents[0].received.find((m) => m.id === 1000)?.result;
    h.abort.abort();
    return { answer, h };
  }

  it('asks the sink and allows once on accept', async () => {
    const request = jest.fn().mockResolvedValue('accept');
    const { answer, h } = await answerFor({ request });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Execute `echo b0 > shell.txt`', kind: 'execute' }),
      expect.any(AbortSignal),
    );
    expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'allow-once' } });
    expect(h.types()).toEqual(expect.arrayContaining(['approvalRequested', 'approvalSettled']));
  });

  it('maps acceptForSession to the offered allow_always option', async () => {
    const { answer } = await answerFor({ request: async () => 'acceptForSession' });
    expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'always-allow' } });
  });

  it('answers cancelled when the sink fails, never allow', async () => {
    const { answer, h } = await answerFor({ request: () => Promise.reject(new Error('ui gone')) });
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } });
    expect(h.events.find((event) => event.type === 'approvalSettled')).toMatchObject({
      decision: 'cancel',
    });
  });
});

describe('prompt watchdog', () => {
  it('fails a prompt that outlives promptTimeoutMs, cancels it and stops the agent', async () => {
    const h = start({
      options: { promptTimeoutMs: 30 },
      script: (agent) => agent.handle('session/prompt', () => ({ hold: true })),
    });
    await h.session.start();
    await expect(h.session.prompt('slow')).resolves.toBe(1);
    await settle();
    expect(h.errors()).toEqual([
      { code: 'prompt-timeout', message: 'Test Agent did not finish the turn within 0.03 s' },
    ]);
    expect(sent(h.agents[0], 'session/cancel')).toHaveLength(1);
    expect(h.transports[0].killCount).toBe(1);
    expect(h.events.filter((event) => event.type === 'terminal')).toEqual([
      expect.objectContaining({ status: 'failed', disposition: 'broken' }),
    ]);
  });
});

describe('extension hooks', () => {
  it('answers a vendor request through the profile hook, and method-not-found otherwise', async () => {
    const h = start({
      profile: {
        extensions: {
          request: async (method) => (method === '_vendor/ask' ? { ok: true } : undefined),
        },
      },
    });
    await h.session.start();
    await expect(h.agents[0].request('_vendor/ask', {})).resolves.toMatchObject({
      result: { ok: true },
    });
    await expect(h.agents[0].request('_vendor/other', {})).resolves.toMatchObject({
      error: { code: -32601 },
    });
    h.abort.abort();
  });

  it('lets a notification hook silence its vendor methods', async () => {
    const seen: string[] = [];
    const h = start({
      profile: {
        extensions: {
          notification: (method) => {
            seen.push(method);
            return method.startsWith('_vendor/');
          },
        },
      },
    });
    await h.session.start();
    await h.agents[0].notify('_vendor/ping', {});
    await h.agents[0].notify('_other/ping', {});
    await settle();
    expect(seen).toEqual(['_vendor/ping', '_other/ping']);
    expect(h.events.filter((event) => event.type === 'info')).toEqual([
      expect.objectContaining({ message: 'Test Agent sent an unsupported notification: _other/ping' }),
    ]);
    h.abort.abort();
  });
});

describe('spawn env', () => {
  it('applies the profile env to baseEnv and passes needsConsole through', () => {
    const merged = start({
      profile: {
        buildSpawn: () => ({
          args: ['acp'],
          env: { mode: 'merge', set: { AGENT: '1' }, remove: ['HOME'] },
          needsConsole: true,
        }),
      },
    });
    expect(merged.spawns[0].env).toEqual({ PATH: '/bin', AGENT: '1' });
    expect(merged.spawns[0].needsConsole).toBe(true);
    merged.abort.abort();

    const replaced = start({
      profile: { buildSpawn: () => ({ args: [], env: { mode: 'replace', set: { ONLY: 'x' } } }) },
    });
    expect(replaced.spawns[0].env).toEqual({ ONLY: 'x' });
    replaced.abort.abort();
  });
});

describe('PR #1444 review fixes', () => {
  it('stops the child at once when the signal was already aborted', async () => {
    const abort = new AbortController();
    abort.abort();
    const h = start({ config: { signal: abort.signal } });
    await settle();
    expect(h.transports[0].killCount).toBe(1);
    await expect(h.session.start()).resolves.toEqual({ ok: false });
    expect(h.agents[0].received).toEqual([]);
    expect(h.errors()).toEqual([]);
  });

  it('rejects an overlapping prompt and leaves the running turn intact', async () => {
    const h = start({
      script: (agent) =>
        agent.handle('session/prompt', () => ({
          result: { stopReason: 'end_turn', _meta: { usage: { inputTokens: 1, outputTokens: 1 } } },
        })),
    });
    await h.session.start();
    const first = h.session.prompt('one');
    await expect(h.session.prompt('two')).rejects.toThrow(
      'Test Agent is still running a turn; wait for it before prompting again',
    );
    await expect(first).resolves.toBe(0);
    expect(sent(h.agents[0], 'session/prompt')).toHaveLength(1);
    await expect(h.session.prompt('three')).resolves.toBe(0);
    h.abort.abort();
  });
});

describe('code-logic review fix round 1', () => {
  const usage = { inputTokens: 1, outputTokens: 1 };
  const terminals = (h: Harness) => h.events.filter((event) => event.type === 'terminal');

  /** A transport whose `exited` the spec settles while the agent stream stays open. */
  function dyingTransport(agent: FakeAcpAgent): FakeAcpTransport & { die(): void } {
    const inner = createFakeAcpTransport(agent);
    let settleExit!: (exit: AcpProcessExit) => void;
    const exited = new Promise<AcpProcessExit>((resolve) => {
      settleExit = resolve;
    });
    return {
      ...inner,
      exited,
      getPid: () => undefined,
      get killCount() {
        return inner.killCount;
      },
      die: () => settleExit({ code: 1, signal: null }),
    };
  }

  it('S-2: a failed respawn ends the turn with one failed/broken terminal and a turn id on its error', async () => {
    const dying: Array<FakeAcpTransport & { die(): void }> = [];
    const h = start({
      config: { respawnOnPrompt: true },
      agent: (generation) => (generation === 2 ? { agentCapabilities: {} } : {}),
      transport: (agent) => {
        const transport = dyingTransport(agent);
        dying.push(transport);
        return transport;
      },
    });
    await h.session.start();
    dying[0].die();
    await settle();
    await expect(h.session.prompt('x')).resolves.toBe(1);
    const error = h.events.find((event) => event.type === 'error');
    expect(error?.turnId).toBeDefined();
    expect(terminals(h)).toEqual([
      expect.objectContaining({ status: 'failed', disposition: 'broken', turnId: error?.turnId }),
    ]);
  });

  it('S-2: a prompt after abort sends nothing, emits no error and one interrupted/broken terminal', async () => {
    const h = start();
    await h.session.start();
    h.abort.abort();
    await expect(h.session.prompt('x')).resolves.toBe(1);
    expect(sent(h.agents[0], 'session/prompt')).toHaveLength(0);
    expect(h.errors()).toEqual([]);
    expect(terminals(h)).toEqual([
      expect.objectContaining({ status: 'interrupted', disposition: 'broken' }),
    ]);
  });

  it('S-3: interrupt answers a pending approval cancelled before session/cancel and keeps the process', async () => {
    const [executeRequest] = permissionRequests();
    const sink: ProviderApprovalSink = {
      // The user never answers: only the interrupt settles it.
      request: (_request, abortSignal) =>
        new Promise((resolve) => abortSignal.addEventListener('abort', () => resolve('accept'))),
    };
    let answer: unknown;
    const h = start({
      profile: { cancelBehavior: 'await-reply' },
      config: { approvals: sink },
      script: (agent) =>
        agent.handle('session/prompt', async (params, fake) => {
          answer = (
            await fake.request('session/request_permission', {
              ...executeRequest,
              sessionId: params['sessionId'],
            })
          ).result;
          await fake.next((m) => m.method === 'session/cancel');
          return { result: { stopReason: 'cancelled' } };
        }),
    });
    await h.session.start();
    const turn = h.session.prompt('x');
    await h.agents[0].next((m) => m.method === 'session/prompt');
    await settle();
    expect(h.types()).toContain('approvalRequested');

    await expect(h.session.interrupt()).resolves.toBe(true);
    await expect(turn).resolves.toBe(1);
    expect(answer).toEqual({ outcome: { outcome: 'cancelled' } });
    const received = h.agents[0].received;
    const answerIndex = received.findIndex((m) => m.id === 1000 && m.method === undefined);
    const cancelIndex = received.findIndex((m) => m.method === 'session/cancel');
    expect(answerIndex).toBeGreaterThanOrEqual(0);
    expect(answerIndex).toBeLessThan(cancelIndex);
    expect(h.events.find((event) => event.type === 'approvalSettled')).toMatchObject({ decision: 'cancel' });
    expect(h.transports[0].killCount).toBe(0);
    expect(terminals(h)).toEqual([
      expect.objectContaining({ status: 'interrupted', disposition: 'reusable' }),
    ]);
    h.abort.abort();
  });

  it('M-1: a reply that races the watchdog stays failed, with no completed terminal or usage', async () => {
    const h = start({
      options: { promptTimeoutMs: 30 },
      script: (agent) =>
        agent.handle('session/prompt', async (_params, fake) => {
          await fake.next((m) => m.method === 'session/cancel');
          return { result: { stopReason: 'end_turn', _meta: { usage } } };
        }),
    });
    await h.session.start();
    await expect(h.session.prompt('slow')).resolves.toBe(1);
    await settle();
    expect(h.errors().map((error) => error.code)).toEqual(['prompt-timeout']);
    expect(h.types()).not.toContain('usage');
    expect(terminals(h)).toEqual([
      expect.objectContaining({ status: 'failed', disposition: 'broken' }),
    ]);
  });

  it('M-4: keeps the first replay when a respawn re-loads the session', async () => {
    const dying: Array<FakeAcpTransport & { die(): void }> = [];
    const h = start({
      options: { resumeSessionId: 'sess-1' },
      config: { respawnOnPrompt: true },
      agent: (generation) => ({
        agentCapabilities: { loadSession: true },
        replay: [
          { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `history ${generation}` } },
        ],
      }),
      transport: (agent) => {
        const transport = dyingTransport(agent);
        dying.push(transport);
        return transport;
      },
      script: (agent) =>
        agent.handle('session/prompt', () => ({ result: { stopReason: 'end_turn', _meta: { usage } } })),
    });
    await h.session.start();
    const first = h.session.getReplay();
    expect(first.length).toBeGreaterThan(0);
    dying[0].die();
    await settle();
    await expect(h.session.prompt('after crash')).resolves.toBe(0);
    expect(sent(h.agents[1], 'session/load')).toHaveLength(1);
    expect(h.session.getReplay()).toBe(first);
    h.abort.abort();
  });

  it('M-5: reports the turn running while it respawns before session/prompt', async () => {
    const dying: Array<FakeAcpTransport & { die(): void }> = [];
    const h = start({
      config: { respawnOnPrompt: true },
      transport: (agent) => {
        const transport = dyingTransport(agent);
        dying.push(transport);
        return transport;
      },
      script: (agent) =>
        agent.handle('session/prompt', () => ({ result: { stopReason: 'end_turn', _meta: { usage } } })),
    });
    await h.session.start();
    dying[0].die();
    await settle();
    const turn = h.session.prompt('after crash');
    expect(h.session.isTurnRunning()).toBe(true);
    await expect(turn).resolves.toBe(0);
    expect(h.session.isTurnRunning()).toBe(false);
    h.abort.abort();
  });
});
