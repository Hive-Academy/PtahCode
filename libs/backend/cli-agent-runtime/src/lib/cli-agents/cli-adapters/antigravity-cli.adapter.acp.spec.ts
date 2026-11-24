/**
 * AntigravityCliAdapter — the ACP-only lane (TASK_2026_2291 P3,
 * TASK_2026_2322): the version floor, then `runSdk` on `agy acp` against the
 * fake ACP agent scripted with the agy 1.5.13 recordings
 * (`antigravity-p3-*`), and the `agy models` id cache that feeds the ACP
 * `model` option.
 */
import 'reflect-metadata';
import { EventEmitter } from 'events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import type { AcpSpawnOptions } from '@ptah-extension/acp-runtime';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
  readAcpFixture,
  recordedResult,
  recordedUpdatesDuring,
  type FakeAcpAgent,
  type FakeAcpTransport,
} from '@ptah-extension/acp-runtime/testing';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type { FlatStreamEventUnion, CliOutputSegment } from '@ptah-extension/shared';
import type { CliCommandOptions, SdkHandle } from './cli-adapter.interface';

const mockSpawnCli = jest.fn();
const mockResolveCliPath = jest.fn();
const mockProbeCliVersion = jest.fn();

jest.mock('./cli-adapter.utils', () => {
  const actual = jest.requireActual<typeof import('./cli-adapter.utils')>(
    './cli-adapter.utils',
  );
  return {
    ...actual,
    spawnCli: (...args: unknown[]) => mockSpawnCli(...args),
    resolveCliPath: (...args: unknown[]) => mockResolveCliPath(...args),
    probeCliVersion: (...args: unknown[]) => mockProbeCliVersion(...args),
  };
});

import { classifyLaneLimit } from '../limits/lane-limit-classifier';
import { matchesApiRateLimit } from '../limits/lane-rate-limit-classifier';
import {
  antigravityAcpManifest,
  meetsAgyAcpFloor,
  type AntigravityAcpSeam,
} from './antigravity-acp-lane';
import { AntigravityCliAdapter } from './antigravity-cli.adapter';

const TOOL_USE = readAcpFixture('antigravity-p3-ptah-mcp-tool-use.ndjson');
const CANCEL = readAcpFixture('antigravity-p3-cancel-then-continue.ndjson');

/**
 * Lines of the `agy models` stdout agy 1.5.14 printed on 2026-11-22 (the full
 * output is pinned in `antigravity-cli.adapter.spec.ts`). The ACP lane derives
 * its `model` option from these ids.
 */
const AGY_MODELS_STDOUT = [
  'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
  'claude-opus-5-5-low\tClaude Opus 5.5 (Low)',
  'claude-opus-5-5-medium\tClaude Opus 5.5 (Medium)',
  'claude-opus-5-5-high\tClaude Opus 5.5 (High)',
  'claude-sonnet-5-5-low\tClaude Sonnet 5.5 (Low)',
  'claude-sonnet-5-5-medium\tClaude Sonnet 5.5 (Medium)',
  'claude-sonnet-5-5-high\tClaude Sonnet 5.5 (High)',
  '',
].join('\r\n');

/** A `spawnCli` child that prints `stdout` and closes. */
function printingChild(stdout: string): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  whenSpawned: Promise<number>;
  killed: boolean;
} {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    whenSpawned: Promise.resolve(77),
    killed: false,
  });
  setImmediate(() => {
    child.stdout.end(stdout);
    child.stderr.end();
    setImmediate(() => child.emit('close', 0));
  });
  return child;
}

const fakeSpawner: IProcessSpawner = {
  spawnProcess: () => {
    throw new Error('the ACP specs use an in-memory transport');
  },
};

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** How many `agy models` probes were spawned. */
function modelProbeCount(): number {
  return mockSpawnCli.mock.calls.filter(([, args]) => (args as string[])[0] === 'models')
    .length;
}

/** The `model` value the lane sent in `session/set_config_option`. */
function sentModel(agent: FakeAcpAgent): unknown {
  const config = agent.received.find(
    (message) =>
      message.method === 'session/set_config_option' &&
      (message.params as { configId?: unknown } | undefined)?.configId === 'model',
  );
  return (config?.params as { value?: unknown } | undefined)?.value;
}

describe('meetsAgyAcpFloor', () => {
  it.each([
    ['1.5.13', true],
    ['agy 1.5.1', true],
    ['2.0.0', true],
    ['1.5.0', false],
    ['1.4.99', false],
    ['agy future-version', false],
    [undefined, false],
  ])('%s -> %s', (version, expected) => {
    expect(meetsAgyAcpFloor(version)).toBe(expected);
  });
});

describe('AntigravityCliAdapter — detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
  });

  it('reads only --version and declares the ACP manifest', async () => {
    mockProbeCliVersion.mockResolvedValue('1.5.13');
    const adapter = new AntigravityCliAdapter(fakeSpawner);
    await expect(adapter.detect()).resolves.toMatchObject({
      installed: true,
      version: '1.5.13',
    });
    expect(mockProbeCliVersion).toHaveBeenCalledTimes(1);
    expect(mockSpawnCli).not.toHaveBeenCalled();
    const manifest = adapter.capabilities();
    expect(manifest).toEqual(antigravityAcpManifest('task-prompt'));
    expect(manifest.messaging.interrupt.state).toBe('supported');
    expect(manifest.messaging.continuation.state).toBe('supported');
    expect(manifest.permissionModes.ask?.state).toBe('unsupported');
  });

  it('still reports an agy below the floor as installed', async () => {
    mockProbeCliVersion.mockResolvedValue('1.4.2');
    const adapter = new AntigravityCliAdapter(fakeSpawner);
    await expect(adapter.detect()).resolves.toMatchObject({
      installed: true,
      version: '1.4.2',
    });
    expect(mockSpawnCli).not.toHaveBeenCalled();
  });

  it('rejects a lane with the upgrade message from the version detection read', async () => {
    mockProbeCliVersion.mockResolvedValue('1.4.2');
    const transportFactory = jest.fn();
    const adapter = new AntigravityCliAdapter(fakeSpawner, undefined, { transportFactory });
    await adapter.detect();
    await expect(
      adapter.runSdk({ task: 'x', workingDirectory: '/proj', binaryPath: '/usr/local/bin/agy' }),
    ).rejects.toThrow(
      'Antigravity lanes need agy 1.5.1 or later (installed: 1.4.2). Update agy and try again.',
    );
    // A below-floor answer is not cached: the lane reads the version again.
    expect(mockProbeCliVersion).toHaveBeenCalledTimes(2);
    expect(transportFactory).not.toHaveBeenCalled();
  });

  it('reports the freshly read version after agy is upgraded in place', async () => {
    mockProbeCliVersion.mockResolvedValueOnce('1.5.0').mockResolvedValueOnce('1.5.2');
    const transportFactory = jest.fn();
    const adapter = new AntigravityCliAdapter(fakeSpawner, undefined, { transportFactory });
    await expect(adapter.detect()).resolves.toMatchObject({
      installed: true,
      version: '1.5.0',
    });
    await expect(adapter.detect()).resolves.toMatchObject({
      installed: true,
      version: '1.5.2',
    });
    expect(mockProbeCliVersion).toHaveBeenCalledTimes(2);
  });

  it('does not read --version a second time when the detection read is unreadable', async () => {
    mockProbeCliVersion.mockResolvedValue(undefined);
    const transportFactory = jest.fn();
    const adapter = new AntigravityCliAdapter(fakeSpawner, undefined, { transportFactory });
    await expect(adapter.detect()).resolves.toMatchObject({ installed: true });
    // One read: a timed-out read is not run again inside the same detection.
    expect(mockProbeCliVersion).toHaveBeenCalledTimes(1);

    // The next lane request still retries the read.
    mockProbeCliVersion.mockResolvedValue('1.4.2');
    await expect(
      adapter.runSdk({ task: 'x', workingDirectory: '/proj', binaryPath: '/usr/local/bin/agy' }),
    ).rejects.toThrow('(installed: 1.4.2)');
    expect(mockProbeCliVersion).toHaveBeenCalledTimes(2);
    expect(transportFactory).not.toHaveBeenCalled();
  });

  it('drops a cached floor pass when detection reads a downgraded agy', async () => {
    mockProbeCliVersion.mockResolvedValueOnce('1.5.13').mockResolvedValue('1.4.2');
    const transportFactory = jest.fn();
    const adapter = new AntigravityCliAdapter(fakeSpawner, undefined, { transportFactory });
    await adapter.detect();
    await adapter.detect();
    expect(mockProbeCliVersion).toHaveBeenCalledTimes(2);
    await expect(
      adapter.runSdk({ task: 'x', workingDirectory: '/proj', binaryPath: '/usr/local/bin/agy' }),
    ).rejects.toThrow(
      'Antigravity lanes need agy 1.5.1 or later (installed: 1.4.2). Update agy and try again.',
    );
    expect(transportFactory).not.toHaveBeenCalled();
  });
});

describe('AntigravityCliAdapter — ACP lane', () => {
  const realHome = process.env['HOME'];
  const realProfile = process.env['USERPROFILE'];
  let home: string;
  const live: FakeAcpAgent[] = [];

  /** What the lane's `agy models` probe prints. */
  let servedModels: string;

  beforeEach(() => {
    jest.clearAllMocks();
    servedModels = AGY_MODELS_STDOUT;
    mockSpawnCli.mockImplementation((_binary: string, args: string[]) => {
      if (args[0] !== 'models') throw new Error(`unexpected spawn: ${args.join(' ')}`);
      return printingChild(servedModels);
    });
    home = mkdtempSync(join(tmpdir(), 'ptah-agy-acp-'));
    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
  });
  afterEach(async () => {
    await Promise.all(live.splice(0).map((agent) => agent.close()));
    process.env['HOME'] = realHome;
    process.env['USERPROFILE'] = realProfile;
    rmSync(home, { recursive: true, force: true });
  });

  interface Lane {
    readonly handle: SdkHandle;
    readonly agent: () => FakeAcpAgent;
    readonly transport: () => FakeAcpTransport;
    readonly spawn: () => AcpSpawnOptions;
    readonly segments: CliOutputSegment[];
    readonly stream: FlatStreamEventUnion[];
  }

  interface LaneSetup {
    /** Extra scripting after the recorded handlers (overrides them). */
    readonly script?: (agent: FakeAcpAgent) => void;
    readonly seam?: Partial<AntigravityAcpSeam>;
    readonly logger?: Logger;
  }

  /** One adapter and every ACP agent its lanes opened, in spawn order. */
  interface Rig {
    readonly adapter: AntigravityCliAdapter;
    readonly agents: FakeAcpAgent[];
    readonly transports: FakeAcpTransport[];
    readonly spawns: AcpSpawnOptions[];
  }

  function laneRig(
    fixture: ReturnType<typeof readAcpFixture>,
    prompt: (nth: number) => 'result' | 'hold',
    setup: LaneSetup = {},
  ): Rig {
    const agents: FakeAcpAgent[] = [];
    const transports: FakeAcpTransport[] = [];
    const spawns: AcpSpawnOptions[] = [];
    const adapter = new AntigravityCliAdapter(undefined, setup.logger, {
      probe: async () => true,
      transportFactory: (spawnOptions) => {
        spawns.push(spawnOptions);
        const agent = createFakeAcpAgent();
        let prompts = 0;
        agents.push(agent);
        live.push(agent);
        agent.handle('session/new', () => ({ result: recordedResult(fixture, 'session/new') }));
        agent.handle('session/set_config_option', () => ({
          result: recordedResult(fixture, 'session/set_config_option'),
        }));
        agent.handle('session/prompt', async (params, fake) => {
          const nth = prompts++;
          for (const { update, meta } of recordedUpdatesDuring(fixture, 'session/prompt', nth)) {
            await fake.sessionUpdate(String(params['sessionId']), update, meta);
          }
          return prompt(nth) === 'hold'
            ? { hold: true }
            : { result: recordedResult(fixture, 'session/prompt', nth) };
        });
        setup.script?.(agent);
        const transport = createFakeAcpTransport(agent);
        transports.push(transport);
        return transport;
      },
      ...setup.seam,
    });
    return { adapter, agents, transports, spawns };
  }

  async function runLane(rig: Rig, options: Partial<CliCommandOptions> = {}): Promise<Lane> {
    const nth = rig.agents.length;
    const handle = await rig.adapter.runSdk({
      task: 'Call the ptah_echo_token MCP tool',
      workingDirectory: join(home, 'work'),
      agentId: 'agent-1',
      mcpPort: 51820,
      mcpToken: 'lane-token',
      model: 'gemini-3.8-flash-low',
      ...options,
    });
    const segments: CliOutputSegment[] = [];
    const stream: FlatStreamEventUnion[] = [];
    handle.onSegment?.((segment) => segments.push(segment));
    handle.onStreamEvent?.((event) => stream.push(event));
    return {
      handle,
      agent: () => rig.agents[nth],
      transport: () => rig.transports[nth],
      spawn: () => rig.spawns[nth],
      segments,
      stream,
    };
  }

  async function startLane(
    fixture: ReturnType<typeof readAcpFixture>,
    prompt: (nth: number) => 'result' | 'hold',
    options: Partial<CliCommandOptions> = {},
    setup: LaneSetup = {},
  ): Promise<Lane> {
    return runLane(laneRig(fixture, prompt, setup), options);
  }

  /** Run one lane to its first `done`, then stop it; returns the model it sent. */
  async function finishLane(rig: Rig, options: Partial<CliCommandOptions> = {}): Promise<unknown> {
    const lane = await runLane(rig, options);
    await lane.handle.done;
    lane.handle.abort.abort();
    return lane.agent() ? sentModel(lane.agent()) : undefined;
  }

  const failInitialize = (agent: FakeAcpAgent): void =>
    agent.handle('initialize', () => ({
      error: { code: -32603, message: 'agent runtime unpack failed' },
    }));

  it('drops the Windows ConPTY noise from agy stderr and keeps every other line', async () => {
    const lane = await startLane(TOOL_USE, () => 'hold', { mcpPort: undefined });
    await settle();
    const lines = [
      'Error: conpty_console_list_agent.js:12',
      'at a',
      'at b',
      'at c',
      'at d',
      'at e',
      'kept one',
      'AttachConsole failed',
      'x',
      'y',
      'z',
      'kept two',
    ];
    for (const line of lines) lane.spawn().onStderrLine?.(line);
    await settle();
    const shown = lane.segments
      .map((segment) => segment.content)
      .filter((content) => content !== undefined && lines.includes(content));
    expect(shown).toEqual(['kept one', 'kept two']);
    lane.handle.abort.abort();
  });

  describe('version floor', () => {
    const production = { probe: undefined };

    it('runs ACP at or above 1.5.1 from one --version read and no --help spawn', async () => {
      mockProbeCliVersion.mockResolvedValue('1.5.13');
      const rig = laneRig(TOOL_USE, () => 'result', { seam: production });
      const lane = await runLane(rig, { mcpPort: undefined });
      await expect(lane.handle.done).resolves.toBe(0);
      lane.handle.abort.abort();
      expect(lane.spawn().args).toEqual([
        'acp',
        '--dangerously-skip-permissions',
        '--add-dir',
        join(home, 'work'),
      ]);
      expect(mockProbeCliVersion).toHaveBeenCalledTimes(1);
      expect(mockProbeCliVersion.mock.calls[0][0]).toBe('agy');
      // The only other spawn is the `agy models` read; the beforeEach mock
      // throws on any other argv (`--help`, `--print`, stream-json flags).
      for (const [, args] of mockSpawnCli.mock.calls as Array<[string, string[]]>) {
        expect(args).toEqual(['models']);
      }

      // A definite answer is cached per binary.
      await finishLane(rig, { mcpPort: undefined });
      expect(mockProbeCliVersion).toHaveBeenCalledTimes(1);
    });

    it('rejects below the floor with the upgrade message, before any spawn or folder write', async () => {
      mockProbeCliVersion.mockResolvedValue('1.4.2');
      const logger = createMockLogger();
      const rig = laneRig(TOOL_USE, () => 'result', {
        seam: production,
        logger: logger as unknown as Logger,
      });
      await expect(runLane(rig)).rejects.toThrow(
        'Antigravity lanes need agy 1.5.1 or later (installed: 1.4.2). Update agy and try again.',
      );
      expect(rig.spawns).toHaveLength(0);
      expect(mockSpawnCli).not.toHaveBeenCalled();
      expect(existsSync(join(home, '.gemini'))).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        '[AntigravityCliAdapter] agy is below the ACP floor',
        { version: '1.4.2', minVersion: '1.5.1' },
      );
    });

    it('does not cache an unreadable version, and the lane runs ACP', async () => {
      mockProbeCliVersion.mockResolvedValue(undefined);
      const logger = createMockLogger();
      const rig = laneRig(TOOL_USE, () => 'result', {
        seam: production,
        logger: logger as unknown as Logger,
      });
      const lane = await runLane(rig, { mcpPort: undefined });
      await expect(lane.handle.done).resolves.toBe(0);
      lane.handle.abort.abort();
      expect(lane.spawn().args[0]).toBe('acp');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('could not read the agy version'),
        { version: null },
      );

      await finishLane(rig, { mcpPort: undefined });
      expect(mockProbeCliVersion).toHaveBeenCalledTimes(2);
      expect(rig.spawns).toHaveLength(2);
      // Detection polls: only the first unreadable read per binary warns.
      const unreadable = (calls: unknown[][]): number =>
        calls.filter(([message]) => String(message).includes('could not read the agy version'))
          .length;
      expect(unreadable(logger.warn.mock.calls)).toBe(1);
      expect(unreadable(logger.debug.mock.calls)).toBe(1);
    });

    it('lets the next lane run once agy is upgraded in place after a below-floor answer', async () => {
      mockProbeCliVersion.mockResolvedValueOnce('1.5.0').mockResolvedValue('1.5.2');
      const rig = laneRig(TOOL_USE, () => 'result', { seam: production });
      await expect(runLane(rig, { mcpPort: undefined })).rejects.toThrow(
        'Antigravity lanes need agy 1.5.1 or later (installed: 1.5.0). Update agy and try again.',
      );
      expect(rig.spawns).toHaveLength(0);

      await finishLane(rig, { mcpPort: undefined });
      expect(rig.spawns).toHaveLength(1);
      expect(mockProbeCliVersion).toHaveBeenCalledTimes(2);

      // The passing answer is cached.
      await finishLane(rig, { mcpPort: undefined });
      expect(rig.spawns).toHaveLength(2);
      expect(mockProbeCliVersion).toHaveBeenCalledTimes(2);
    });

    it('re-runs an injected probe that answered undefined, and shares one in flight', async () => {
      let answers = 0;
      const probe = jest.fn(async () => (answers++ === 0 ? undefined : true));
      const rig = laneRig(TOOL_USE, () => 'result', { seam: { probe } });
      await finishLane(rig, { mcpPort: undefined });
      expect(probe).toHaveBeenCalledTimes(1);
      expect(rig.spawns).toHaveLength(1);

      const concurrent = await Promise.all([
        runLane(rig, { mcpPort: undefined }),
        runLane(rig, { mcpPort: undefined }),
      ]);
      expect(probe).toHaveBeenCalledTimes(2);
      for (const lane of concurrent) {
        await lane.handle.done;
        lane.handle.abort.abort();
      }

      await finishLane(rig, { mcpPort: undefined });
      expect(probe).toHaveBeenCalledTimes(2);
    });
  });

  it('a session that never opens fails the lane with one ACP error and no stream-json spawn', async () => {
    const lane = await startLane(TOOL_USE, () => 'result', { mcpPort: undefined }, {
      script: failInitialize,
    });
    await expect(lane.handle.done).resolves.toBe(1);
    lane.handle.abort.abort();
    expect(lane.segments.filter((segment) => segment.type === 'error')).toHaveLength(1);
    expect(rigSpawnArgs()).toEqual([['models']]);
  });

  /** Every `spawnCli` argv: only `agy models` reads are allowed on an ACP lane. */
  function rigSpawnArgs(): string[][] {
    return (mockSpawnCli.mock.calls as Array<[string, string[]]>).map(([, args]) => args);
  }

  it('an unknown resume id starts a new session with one info', async () => {
    const notFound = (): { error: { code: number; message: string; data: string } } => ({
      error: { code: -32002, message: 'Resource not found', data: 'no such session' },
    });
    const lane = await startLane(
      TOOL_USE,
      () => 'result',
      { mcpPort: undefined, resumeSessionId: 'stream-json-conversation-7' },
      {
        script: (agent) => {
          agent.handle('session/resume', notFound);
          agent.handle('session/load', notFound);
        },
      },
    );
    await expect(lane.handle.done).resolves.toBe(0);
    lane.handle.abort.abort();
    const infos = lane.segments
      .filter((segment) => segment.type === 'info' && !segment.turnTelemetry)
      .map((segment) => segment.content);
    expect(infos).toEqual([
      expect.stringMatching(
        /^could not resume stream-json-conversation-7: .*; started a new session$/,
      ),
    ]);
    expect(lane.agent().received.some((message) => message.method === 'session/new')).toBe(true);
    expect(lane.handle.getSessionId?.()).toBe(
      String(recordedResult(TOOL_USE, 'session/new')['sessionId']),
    );
    expect(lane.segments.filter((segment) => segment.type === 'error')).toEqual([]);
  });

  it('runs the task on agy acp with Ptah MCP as an http entry and no mcp_config.json write', async () => {
    const lane = await startLane(TOOL_USE, () => 'result');
    await expect(lane.handle.done).resolves.toBe(0);

    expect(lane.spawn().args).toEqual([
      'acp',
      '--dangerously-skip-permissions',
      '--add-dir',
      join(home, 'work'),
    ]);
    const created = lane.agent().received.find((message) => message.method === 'session/new');
    expect((created?.params as Record<string, unknown>)['mcpServers']).toEqual([
      {
        type: 'http',
        // Not `ptah`: agy also loads the persistent `ptah` entry of its shared
        // mcp_config.json, which has no lane bearer.
        name: 'ptah_lane',
        url: expect.stringMatching(/^http:\/\/localhost:51820\/agent\/agent-1\/workspace\//),
        headers: [{ name: 'Authorization', value: 'Bearer lane-token' }],
      },
    ]);
    expect(existsSync(join(home, '.gemini', 'config', 'mcp_config.json'))).toBe(false);
    const settings = JSON.parse(
      readFileSync(join(home, '.gemini', 'antigravity-cli', 'settings.json'), 'utf8'),
    ) as { trustedWorkspaces: string[] };
    expect(settings.trustedWorkspaces).toHaveLength(1);

    expect(
      lane.segments.some(
        (segment) => segment.type === 'tool-call' && /ptah_echo_token/.test(segment.toolName ?? ''),
      ),
    ).toBe(true);
    expect(lane.stream.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['message_start', 'tool_start', 'tool_result', 'text_delta']),
    );
    expect(lane.handle.getSessionId?.()).toBe(
      String(recordedResult(TOOL_USE, 'session/new')['sessionId']),
    );
    // agy's protocol usage carries no model: the lane's model is the actual one.
    expect(lane.segments.find((segment) => segment.usage)?.usage).toMatchObject({
      model: 'gemini-3.8-flash-low',
      inputTokens: 12618,
      outputTokens: 37,
    });
    expect(
      lane.stream.find((event) => event.eventType === 'message_complete'),
    ).toMatchObject({ model: 'gemini-3.8-flash-low' });
    lane.handle.abort.abort();
  });

  it('sends a retired saved id as a live id of the closest base', async () => {
    const lane = await startLane(TOOL_USE, () => 'result', { model: 'claude-sonnet-4-6' });
    await lane.handle.done;
    // Only an id `agy models` lists is derived: the pinned output has no bare
    // `claude-sonnet-5-5`, so the middle effort variant is sent (the full id
    // carries the effort, so no `thought_level` is needed).
    expect(sentModel(lane.agent())).toBe('claude-sonnet-5-5-medium');
    lane.handle.abort.abort();
  });

  it('sends the saved id unchanged when agy lists no models', async () => {
    servedModels = '';
    const lane = await startLane(TOOL_USE, () => 'result', { model: 'claude-sonnet-4-6' });
    await lane.handle.done;
    expect(sentModel(lane.agent())).toBe('claude-sonnet-4-6');
    lane.handle.abort.abort();
  });

  describe('the `agy models` id cache behind the ACP model option', () => {
    const noMcp = { mcpPort: undefined };

    it('replaces a retired saved id with a live variant of the closest base, from `id<TAB>name`', async () => {
      const logger = createMockLogger();
      const rig = laneRig(TOOL_USE, () => 'result', { logger: logger as unknown as Logger });
      const model = await finishLane(rig, {
        ...noMcp,
        model: 'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)',
      });
      expect(model).toBe('claude-sonnet-5-5-medium');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('closest live model'),
        { saved: 'claude-sonnet-4-6', model: 'claude-sonnet-5-5-medium' },
      );
    });

    it('keeps the effort of a retired saved id when the closest base lists it', async () => {
      const rig = laneRig(TOOL_USE, () => 'result');
      expect(await finishLane(rig, { ...noMcp, model: 'claude-sonnet-4-6-high' })).toBe(
        'claude-sonnet-5-5-high',
      );
    });

    it('applies the chosen effort to a retired id through its closest live base', async () => {
      const rig = laneRig(TOOL_USE, () => 'result');
      expect(
        await finishLane(rig, { ...noMcp, model: 'claude-opus-4-8', reasoningEffort: 'high' }),
      ).toBe('claude-opus-5-5-high');
    });

    it('does not re-probe agy models for every spawn after a failed probe', async () => {
      servedModels = '';
      const rig = laneRig(TOOL_USE, () => 'result');
      for (let i = 0; i < 2; i++) {
        expect(await finishLane(rig, { ...noMcp, model: 'm-1' })).toBe('m-1');
      }
      expect(modelProbeCount()).toBe(1);
    });

    it('scopes the live ids to the binary: another binary probes its own', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const rig = laneRig(TOOL_USE, () => 'result');
      await rig.adapter.listModels();
      expect(modelProbeCount()).toBe(1);

      for (const binaryPath of ['/usr/local/bin/agy', '/opt/other/agy']) {
        await finishLane(rig, { ...noMcp, model: 'm-1', binaryPath });
      }

      // The same binary reuses the listing's ids; the other one probes.
      const probes = (mockSpawnCli.mock.calls as Array<[string, string[]]>).filter(
        ([, args]) => args[0] === 'models',
      );
      expect(probes.map(([binary]) => binary)).toEqual(['/usr/local/bin/agy', '/opt/other/agy']);
    });

    it('a clean empty refresh drops the earlier ids for the next spawn', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const rig = laneRig(TOOL_USE, () => 'result');
      await rig.adapter.listModels();
      servedModels = '';
      expect(await rig.adapter.listModels()).toEqual([]);

      // The earlier list would map the retired id to its live base; the empty
      // answer leaves no ids, and its retry window spares the spawn a third probe.
      const model = await finishLane(rig, {
        ...noMcp,
        model: 'claude-opus-4-8',
        reasoningEffort: 'high',
        binaryPath: '/usr/local/bin/agy',
      });
      expect(model).toBe('claude-opus-4-8');
      expect(modelProbeCount()).toBe(2);
    });

    it('probes `agy models` at most once per freshness window and shares one probe', async () => {
      const rig = laneRig(TOOL_USE, () => 'result');
      const lanes = await Promise.all([
        runLane(rig, { ...noMcp, model: 'claude-sonnet-5-5-low' }),
        runLane(rig, { ...noMcp, model: 'claude-opus-5-5-low' }),
      ]);
      expect(modelProbeCount()).toBe(1);
      for (const lane of lanes) {
        await lane.handle.done;
        lane.handle.abort.abort();
      }
      await finishLane(rig, { ...noMcp, model: 'claude-sonnet-5-5-high' });
      expect(modelProbeCount()).toBe(1);
    });

    it('re-probes once the last ids are older than 10 minutes', async () => {
      const clock = { now: 1_000_000 };
      const rig = laneRig(TOOL_USE, () => 'result', { seam: { now: () => clock.now } });
      await finishLane(rig, { ...noMcp, model: 'claude-sonnet-5-5-low' });
      clock.now += 10 * 60_000 - 1;
      await finishLane(rig, { ...noMcp, model: 'claude-sonnet-5-5-low' });
      expect(modelProbeCount()).toBe(1);
      clock.now += 1;
      await finishLane(rig, { ...noMcp, model: 'claude-sonnet-5-5-low' });
      expect(modelProbeCount()).toBe(2);
    });

    it('does not probe `agy models` when no model is chosen', async () => {
      const rig = laneRig(TOOL_USE, () => 'result');
      expect(
        await finishLane(rig, { ...noMcp, model: undefined, reasoningEffort: 'high' }),
      ).toBeUndefined();
      expect(modelProbeCount()).toBe(0);
    });
  });

  it('interrupts mid-turn on the same process and continues the session', async () => {
    const lane = await startLane(CANCEL, (nth) => (nth === 1 ? 'hold' : 'result'), {
      mcpPort: undefined,
      mcpToken: undefined,
    });
    await expect(lane.handle.done).resolves.toBe(0);
    expect(lane.handle.supportsInterrupt?.()).toBe(true);

    const long = await (lane.handle.continue as NonNullable<SdkHandle['continue']>)('run ping');
    for (let wait = 0; wait < 50; wait++) {
      if (lane.segments.some((segment) => segment.type === 'tool-call')) break;
      await settle();
    }
    await lane.handle.interrupt?.();
    await expect(long.done).resolves.toBe(0);
    expect(lane.transport().killCount).toBe(0);

    const before = lane.stream.length;
    const next = await (lane.handle.continue as NonNullable<SdkHandle['continue']>)(
      'Reply with exactly AFTER-INTERRUPT',
    );
    await expect(next.done).resolves.toBe(0);
    // The cancelled turn left its tool open; the next turn projects afresh.
    const after = lane.stream.slice(before);
    expect(after[0]).toMatchObject({ eventType: 'message_start', role: 'assistant' });
    expect(after.find((event) => event.eventType === 'text_delta')).toMatchObject({
      delta: 'AFTER-INTERRUPT',
      blockIndex: 0,
    });
    expect(after.some((event) => event.eventType === 'tool_result')).toBe(false);
    expect(new Set(after.map((event) => event.messageId)).size).toBe(1);
    expect(
      lane.segments.some(
        (segment) => segment.type === 'text' && segment.content.includes('AFTER-INTERRUPT'),
      ),
    ).toBe(true);
    expect(lane.handle.getPid?.()).toBe(4242);
    lane.handle.abort.abort();
  });

  describe('tool approvals follow the profile rule (S1)', () => {
    const PERMISSION_OPTIONS = [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ];

    const EXEC_CALL = { toolCallId: 'call-1', title: 'run_command rm -rf build', kind: 'execute' };

    async function answerFor(
      options: Partial<CliCommandOptions>,
      toolCall: Record<string, unknown> = EXEC_CALL,
    ): Promise<{ answer: unknown; args: readonly string[]; output: string; infos: string[] }> {
      let answer: unknown;
      const chunks: string[] = [];
      const lane = await startLane(TOOL_USE, () => 'result', { mcpPort: undefined, ...options }, {
        script: (agent) =>
          agent.handle('session/prompt', async (params, fake) => {
            const reply = await fake.request('session/request_permission', {
              sessionId: params['sessionId'],
              toolCall,
              options: PERMISSION_OPTIONS,
            });
            answer = reply.result;
            return { result: { stopReason: 'end_turn' } };
          }),
      });
      lane.handle.onOutput((chunk) => chunks.push(chunk));
      await lane.handle.done;
      lane.handle.abort.abort();
      return {
        answer,
        args: lane.spawn().args,
        output: chunks.join(''),
        infos: lane.segments
          .filter((segment) => segment.type === 'info' && !segment.turnTelemetry)
          .map((segment) => segment.content),
      };
    }

    const ALLOW = { outcome: { outcome: 'selected', optionId: 'allow' } };
    const REJECT = { outcome: { outcome: 'selected', optionId: 'reject' } };
    const MODE_CASES: ReadonlyArray<[string, Record<string, unknown>, unknown, unknown]> = [
      // label, toolCall, plan answer, auto-edit answer
      ['read-only', { toolCallId: 'c', kind: 'read', title: 'Read README.md' }, ALLOW, ALLOW],
      [
        'ptah_lane MCP',
        {
          toolCallId: 'c',
          kind: 'other',
          name: 'mcp_ptah_lane_ptah_search_files',
          title: 'Run mcp_ptah_lane_ptah_search_files',
        },
        ALLOW,
        ALLOW,
      ],
      ['edit', { toolCallId: 'c', kind: 'edit', title: 'Edit src/a.ts' }, REJECT, ALLOW],
      ['exec', EXEC_CALL, REJECT, REJECT],
    ];

    it.each(MODE_CASES)('%s request: plan and auto-edit answers (live F1)', async (_label, toolCall, plan, autoEdit) => {
      expect((await answerFor({ permission: 'plan' }, toolCall)).answer).toEqual(plan);
      expect((await answerFor({ permission: 'auto-edit' }, toolCall)).answer).toEqual(autoEdit);
    });

    it.each(MODE_CASES)('%s request: yolo grants', async (_label, toolCall) => {
      expect((await answerFor({ permission: 'yolo' }, toolCall)).answer).toEqual(ALLOW);
    });

    it('shows a refusal in the lane output and segments, naming the tool and mode', async () => {
      const { output, infos } = await answerFor({ permission: 'plan' });
      const line = 'Refused permission for run_command rm -rf build in plan mode: auto-approve is off';
      expect(infos).toContain(line);
      expect(output).toContain(`[Antigravity] ${line}`);
    });

    it.each(['auto-edit', 'plan'] as const)(
      'refuses a shell request on a %s lane, without the skip flag',
      async (permission) => {
        const { answer, args } = await answerFor({ permission });
        expect(args).toEqual(['acp', '--add-dir', join(home, 'work')]);
        expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'reject' } });
      },
    );

    it('refuses when auto-approve is off', async () => {
      const { answer } = await answerFor({ autoApprove: false });
      expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'reject' } });
    });

    it.each([
      ['yolo', { permission: 'yolo' as const }],
      ['unattended default', {}],
    ])('grants on a %s lane', async (_label, options) => {
      const { answer, args } = await answerFor(options);
      expect(args).toEqual(['acp', '--dangerously-skip-permissions', '--add-dir', join(home, 'work')]);
      expect(answer).toEqual({ outcome: { outcome: 'selected', optionId: 'allow' } });
    });
  });

  describe('ACP quota and rate-limit errors keep their wording', () => {
    async function failedLane(data: unknown): Promise<string[]> {
      const lane = await startLane(TOOL_USE, () => 'result', { mcpPort: undefined }, {
        script: (agent) =>
          agent.handle('session/prompt', () => ({
            error: { code: -32603, message: 'Internal error', data },
          })),
      });
      await expect(lane.handle.done).resolves.toBe(1);
      lane.handle.abort.abort();
      return lane.segments
        .filter((segment) => segment.type === 'error')
        .map((segment) => segment.content);
    }

    it('keeps the RESOURCE_EXHAUSTED wording, so the quota classifier reads it', async () => {
      const wording = 'Error 429 RESOURCE_EXHAUSTED: quota exceeded, reset after 144h24m50s.';
      const errors = await failedLane({ message: wording });
      expect(errors).toEqual([expect.stringContaining(wording)]);
      const observedAt = Date.UTC(2026, 10, 21);
      const viaAcp = classifyLaneLimit({ cliOrProvider: 'antigravity', texts: errors, observedAt });
      const fromWording = classifyLaneLimit({
        cliOrProvider: 'antigravity',
        texts: [wording],
        observedAt,
      });
      expect(viaAcp).toMatchObject({ failureKind: 'quota' });
      expect(viaAcp).toEqual(fromWording);
    });

    it('keeps a 429 rate-limit wording, so the rate-limit matcher reads it', async () => {
      const wording = 'HTTP 429 Too Many Requests: rate limit exceeded';
      const errors = await failedLane(wording);
      expect(matchesApiRateLimit(errors)).toBe(true);
      expect(
        classifyLaneLimit({ cliOrProvider: 'antigravity', texts: errors, observedAt: 0 }),
      ).toBeNull();
    });
  });

  it('refuses the ask permission on a lane (no approval route)', async () => {
    await expect(startLane(TOOL_USE, () => 'result', { permission: 'ask' })).rejects.toThrow(
      /approval route/,
    );
  });
});
