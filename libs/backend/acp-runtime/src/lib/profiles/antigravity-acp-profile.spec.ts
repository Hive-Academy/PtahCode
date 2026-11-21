/**
 * antigravityAcpProfile — the pure profile rules, then the runtime driven by
 * the profile against the fake agent scripted with the agy 1.5.13 P3
 * recordings (`antigravity-p3-ptah-mcp-tool-use`,
 * `antigravity-p3-cancel-then-continue`).
 */
import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';
import { createMockLogger } from '@ptah-extension/shared/testing';
import {
  readAcpFixture,
  recordedResult,
  recordedUpdatesDuring,
} from '../__fixtures__/acp-fixture-reader';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
  type FakeAcpAgent,
  type FakeAcpTransport,
} from '../__fixtures__/fake-acp-agent';
import type { AcpSpawnOptions } from '../acp-process-transport';
import { createAcpSession, type AcpSession } from '../acp-session-runtime';
import type { AcpRequestFailure, AcpSessionOptions } from '../acp-vendor-profile';
import { antigravityAcpProfile } from './antigravity-acp-profile';

const TOOL_USE = readAcpFixture('antigravity-p3-ptah-mcp-tool-use.ndjson');
const CANCEL = readAcpFixture('antigravity-p3-cancel-then-continue.ndjson');

const base: AcpSessionOptions = { workingDirectory: '/w', mcp: [] };
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function withPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const real = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(process, 'platform', { value: real, configurable: true });
  }
}

describe('antigravityAcpProfile — spawn', () => {
  it('runs `agy acp` unattended by default and for yolo, as the stream-json lane does', () => {
    expect(antigravityAcpProfile.buildSpawn(base).args).toEqual([
      'acp',
      '--dangerously-skip-permissions',
    ]);
    expect(antigravityAcpProfile.buildSpawn({ ...base, permission: 'yolo' }).args).toEqual([
      'acp',
      '--dangerously-skip-permissions',
    ]);
  });

  it('keeps approvals on when auto-approve is off or a narrower mode is set', () => {
    expect(antigravityAcpProfile.buildSpawn({ ...base, autoApprove: false }).args).toEqual(['acp']);
    expect(antigravityAcpProfile.buildSpawn({ ...base, permission: 'plan' }).args).toEqual(['acp']);
    expect(antigravityAcpProfile.buildSpawn({ ...base, permission: 'auto-edit' }).args).toEqual([
      'acp',
    ]);
  });

  it('adds no isolation flag (D10: shared profile)', () => {
    const args = antigravityAcpProfile.buildSpawn(base).args.join(' ');
    expect(args).not.toMatch(/app-data-dir|gemini-dir|cli_dir_name/);
  });

  it('gives the agent a console and NODE_PTY_USE_CONPTY=0 on Windows only', () => {
    expect(withPlatform('win32', () => antigravityAcpProfile.buildSpawn(base))).toEqual({
      args: ['acp', '--dangerously-skip-permissions'],
      env: { mode: 'merge', set: { NODE_PTY_USE_CONPTY: '0' } },
      needsConsole: true,
    });
    const posix = withPlatform('linux', () => antigravityAcpProfile.buildSpawn(base));
    expect(posix.env).toBeUndefined();
    expect(posix.needsConsole).toBeUndefined();
  });
});

describe('antigravityAcpProfile — MCP, modes, config', () => {
  it('attaches Ptah MCP as an http entry with the bearer header (D9)', () => {
    expect(
      antigravityAcpProfile.buildMcpServers({
        ...base,
        mcp: [
          {
            name: 'ptah',
            url: 'http://localhost:1/agent/a',
            headers: [{ name: 'Authorization', value: 'Bearer t' }],
          },
        ],
      }),
    ).toEqual([
      {
        type: 'http',
        name: 'ptah',
        url: 'http://localhost:1/agent/a',
        headers: [{ name: 'Authorization', value: 'Bearer t' }],
      },
    ]);
  });

  it.each([
    ['plan', 'plan'],
    ['auto-edit', 'accept-edits'],
    ['ask', 'default'],
    ['yolo', 'auto'],
  ] as const)('maps permission %s to the agy mode %s', (permission, mode) => {
    expect(antigravityAcpProfile.modeFor?.({ ...base, permission })).toBe(mode);
  });

  it('sets no mode without a permission', () => {
    expect(antigravityAcpProfile.modeFor?.(base)).toBeUndefined();
  });

  it('sends the model as a binding option and the effort as thought_level', () => {
    expect(
      antigravityAcpProfile.sessionConfig?.({
        ...base,
        model: 'claude-sonnet-5-5',
        reasoningEffort: 'high',
      }),
    ).toEqual([
      { configId: 'model', value: 'claude-sonnet-5-5', binding: true },
      { configId: 'thought_level', value: 'high' },
    ]);
  });

  it('keeps the effort of a model id that carries one', () => {
    expect(
      antigravityAcpProfile.sessionConfig?.({
        ...base,
        model: 'gpt-oss-120b-medium',
        reasoningEffort: 'high',
      }),
    ).toEqual([{ configId: 'model', value: 'gpt-oss-120b-medium', binding: true }]);
  });

  it('maps max to xhigh and drops an effort agy has no level for', () => {
    expect(antigravityAcpProfile.sessionConfig?.({ ...base, reasoningEffort: 'max' })).toEqual([
      { configId: 'thought_level', value: 'xhigh' },
    ]);
    expect(antigravityAcpProfile.sessionConfig?.({ ...base, reasoningEffort: 'minimal' })).toEqual(
      [],
    );
  });

  it('names the available models when agy rejects one', () => {
    const failure: AcpRequestFailure = {
      method: 'session/set_config_option',
      code: -32602,
      message: 'Invalid params',
      configId: 'model',
      configValue: 'nope',
      advertisedValues: ['gemini-3.8-flash', 'claude-opus-5-5'],
      options: base,
    };
    expect(antigravityAcpProfile.describeError?.(failure)).toBe(
      "Antigravity rejected model 'nope'; available models: gemini-3.8-flash, claude-opus-5-5",
    );
    expect(
      antigravityAcpProfile.describeError?.({ ...failure, method: 'session/prompt' }),
    ).toBeUndefined();
  });
});

describe('antigravityAcpProfile — recorded agy turns', () => {
  const live: FakeAcpAgent[] = [];
  afterEach(async () => {
    await Promise.all(live.splice(0).map((agent) => agent.close()));
  });

  function open(
    fixture: ReturnType<typeof readAcpFixture>,
    script: (agent: FakeAcpAgent) => void,
  ): {
    session: AcpSession;
    events: ProviderSessionEvent[];
    agent: () => FakeAcpAgent;
    transport: () => FakeAcpTransport;
    spawn: () => AcpSpawnOptions;
    abort: AbortController;
  } {
    const events: ProviderSessionEvent[] = [];
    const abort = new AbortController();
    let agent: FakeAcpAgent | undefined;
    let transport: FakeAcpTransport | undefined;
    let spawn: AcpSpawnOptions | undefined;
    const session = createAcpSession({
      profile: antigravityAcpProfile,
      options: {
        ...base,
        model: 'gemini-3.8-flash-low',
        mcp: [
          {
            name: 'ptah',
            url: 'http://localhost:1/agent/a',
            headers: [{ name: 'Authorization', value: 'Bearer t' }],
          },
        ],
      },
      command: 'agy',
      baseEnv: { PATH: '/bin' },
      logger: createMockLogger(),
      signal: abort.signal,
      onEvent: (event) => events.push(event),
      transportFactory: (options) => {
        spawn = options;
        agent = createFakeAcpAgent();
        live.push(agent);
        agent.handle('session/new', () => ({ result: recordedResult(fixture, 'session/new') }));
        agent.handle('session/set_config_option', () => ({
          result: recordedResult(fixture, 'session/set_config_option'),
        }));
        script(agent);
        transport = createFakeAcpTransport(agent);
        return transport;
      },
    });
    return {
      session,
      events,
      agent: () => agent as FakeAcpAgent,
      transport: () => transport as FakeAcpTransport,
      spawn: () => spawn as AcpSpawnOptions,
      abort,
    };
  }

  const replayPrompt =
    (fixture: ReturnType<typeof readAcpFixture>, nth: number) =>
    async (params: Record<string, unknown>, fake: FakeAcpAgent) => {
      for (const { update, meta } of recordedUpdatesDuring(fixture, 'session/prompt', nth)) {
        await fake.sessionUpdate(String(params['sessionId']), update, meta);
      }
    };

  it('calls the Ptah MCP tool from the http entry and streams its answer', async () => {
    const h = open(TOOL_USE, (agent) => {
      agent.handle('session/prompt', async (params, fake) => {
        await replayPrompt(TOOL_USE, 0)(params, fake);
        return { result: recordedResult(TOOL_USE, 'session/prompt') };
      });
    });
    await expect(h.session.start()).resolves.toEqual({ ok: true, restoredContext: false });
    expect(h.spawn().args).toEqual(['acp', '--dangerously-skip-permissions']);
    const created = h.agent().received.find((message) => message.method === 'session/new');
    expect((created?.params as Record<string, unknown>)['mcpServers']).toEqual([
      expect.objectContaining({ type: 'http', name: 'ptah' }),
    ]);
    await expect(h.session.prompt('call the tool')).resolves.toBe(0);
    expect(h.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'toolStarted' }),
        expect.objectContaining({ type: 'toolCompleted', status: 'completed' }),
      ]),
    );
    const reply = h.events.flatMap((event) => (event.type === 'textDelta' ? [event.delta] : []));
    expect(reply.join('')).toBe('TOKEN-ZETA-9917');
    expect(h.events.filter((event) => event.type === 'error')).toEqual([]);
    h.abort.abort();
  });

  it('interrupts a running shell turn, keeps the process and runs the next prompt', async () => {
    let prompts = 0;
    const h = open(CANCEL, (agent) => {
      agent.handle('session/prompt', async (params, fake) => {
        const nth = prompts++;
        await replayPrompt(CANCEL, nth)(params, fake);
        if (nth === 1) return { hold: true };
        return { result: recordedResult(CANCEL, 'session/prompt', nth) };
      });
    });
    await h.session.start();
    expect(h.session.supportsInterrupt()).toBe(true);
    await expect(h.session.prompt('READY')).resolves.toBe(0);

    const turn = h.session.prompt('run ping');
    for (let wait = 0; wait < 50 && prompts < 2; wait++) await settle();
    await settle();
    await expect(h.session.interrupt()).resolves.toBe(true);
    await turn;
    expect(h.transport().killCount).toBe(0);
    expect(h.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'terminal', status: 'interrupted', disposition: 'reusable' }),
      ]),
    );

    const before = h.events.length;
    await expect(h.session.prompt('AFTER-INTERRUPT')).resolves.toBe(0);
    const after = h.events
      .slice(before)
      .flatMap((event) => (event.type === 'textDelta' ? [event.delta] : []));
    expect(after.join('')).toBe('AFTER-INTERRUPT');
    expect(h.session.getPid()).toBe(4242);
    h.abort.abort();
  });
});
