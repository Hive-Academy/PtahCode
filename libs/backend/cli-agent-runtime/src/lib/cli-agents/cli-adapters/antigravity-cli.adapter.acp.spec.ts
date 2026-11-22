/**
 * AntigravityCliAdapter — the ACP lane (TASK_2026_2291, P3): transport
 * choice, then `runSdk` on `agy acp` against the fake ACP agent scripted with
 * the agy 1.5.13 recordings (`antigravity-p3-*`). The stream-json lane keeps
 * its own specs (`antigravity-cli.adapter.spec.ts`, `.mcp.spec.ts`).
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
  AGY_ACP_FAILURE_COOLDOWN_MS,
  AGY_TRANSPORT_ENV,
  meetsAgyAcpFloor,
  readAgyTransportOverride,
  type AntigravityAcpSeam,
} from './antigravity-acp-lane';
import { AntigravityCliAdapter } from './antigravity-cli.adapter';

const TOOL_USE = readAcpFixture('antigravity-p3-ptah-mcp-tool-use.ndjson');
const CANCEL = readAcpFixture('antigravity-p3-cancel-then-continue.ndjson');
const AGY_HELP = [
  'Usage of agy.exe:',
  '  --input-format                  Input format for print mode (text, stream-json)',
  '',
  'Available subcommands:',
  '  acp             Start the Agent Client Protocol (ACP) stdio server',
  '  models          List available models',
].join('\n');

/**
 * Lines of the `agy models` stdout agy 1.5.14 printed on 2026-11-22 (the full
 * output is pinned in `antigravity-cli.adapter.spec.ts`). The ACP lane derives
 * its `model` option from these ids.
 */
const AGY_MODELS_STDOUT = [
  'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
  'claude-sonnet-5-5-low\tClaude Sonnet 5.5 (Low)',
  'claude-sonnet-5-5-medium\tClaude Sonnet 5.5 (Medium)',
  'claude-sonnet-5-5-high\tClaude Sonnet 5.5 (High)',
  '',
].join('\r\n');

/** A `spawnCli` child that prints `stdout` and closes. */
function helpChild(stdout: string): EventEmitter & {
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

/** A `spawnCli` child that never answers and reports no pid (nothing to kill). */
function hangingChild(): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  whenSpawned: Promise<number | undefined>;
  killed: boolean;
} {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    whenSpawned: Promise.resolve(undefined),
    killed: false,
  });
}

/** A `spawnCli` child whose spawn fails. */
function failingChild(): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  whenSpawned: Promise<number | undefined>;
  killed: boolean;
} {
  const child = hangingChild();
  setImmediate(() => child.emit('error', new Error('spawn EBUSY')));
  return child;
}

const fakeSpawner: IProcessSpawner = {
  spawnProcess: () => {
    throw new Error('the ACP specs use an in-memory transport');
  },
};

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

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

describe('AntigravityCliAdapter — transport choice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
  });

  it('uses ACP when agy >= 1.5.1 lists `acp` and a spawner exists, from one --help spawn', async () => {
    mockProbeCliVersion.mockResolvedValue('1.5.13');
    mockSpawnCli.mockImplementation(() => helpChild(AGY_HELP));
    const adapter = new AntigravityCliAdapter(fakeSpawner);
    await adapter.detect();
    const manifest = adapter.capabilities();
    expect(manifest.messaging.interrupt.state).toBe('supported');
    expect(manifest.messaging.continuation.state).toBe('supported');
    expect(manifest.permissionModes.ask?.state).toBe('unsupported');
    expect(mockSpawnCli).toHaveBeenCalledTimes(1);
    expect(mockSpawnCli.mock.calls[0][1]).toEqual(['--help']);
  });

  it('falls back to stream-json below the version floor', async () => {
    mockProbeCliVersion.mockResolvedValue('1.4.2');
    mockSpawnCli.mockImplementation(() => helpChild(AGY_HELP));
    const adapter = new AntigravityCliAdapter(fakeSpawner);
    await adapter.detect();
    expect(adapter.capabilities().messaging.interrupt.state).toBe('unsupported');
    expect(adapter.capabilities().messaging.continuation.state).toBe('supported');
  });

  it('falls back to stream-json when `acp` is not listed', async () => {
    mockProbeCliVersion.mockResolvedValue('1.5.13');
    mockSpawnCli.mockImplementation(() =>
      helpChild('  --input-format  Input format for print mode\n'),
    );
    const adapter = new AntigravityCliAdapter(fakeSpawner);
    await adapter.detect();
    expect(adapter.capabilities().messaging.interrupt.state).toBe('unsupported');
  });

  it('never chooses ACP without a spawner (the ACP runtime cannot start one)', async () => {
    mockProbeCliVersion.mockResolvedValue('1.5.13');
    mockSpawnCli.mockImplementation(() => helpChild(AGY_HELP));
    const adapter = new AntigravityCliAdapter();
    await adapter.detect();
    expect(adapter.capabilities().messaging.interrupt.state).toBe('unsupported');
  });

  describe('a probe that could not tell is not cached (S2)', () => {
    afterEach(() => jest.useRealTimers());

    it('probes again after `agy --help` timed out, then chooses ACP', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      mockProbeCliVersion.mockResolvedValue('1.5.13');
      mockSpawnCli
        .mockImplementationOnce(() => hangingChild())
        .mockImplementationOnce(() => hangingChild())
        .mockImplementation(() => helpChild(AGY_HELP));
      const adapter = new AntigravityCliAdapter(fakeSpawner);

      const first = adapter.detect();
      await jest.advanceTimersByTimeAsync(8_000);
      await jest.advanceTimersByTimeAsync(8_000);
      await first;
      expect(adapter.capabilities().messaging.interrupt.state).toBe('unsupported');

      jest.useRealTimers();
      await adapter.detect();
      expect(adapter.capabilities().messaging.interrupt.state).toBe('supported');
    });

    it('probes again after a spawn error or an unreadable version', async () => {
      // detect() reads the version, and the ACP probe reads it again when
      // detect() got none: both fail on the first detect.
      mockProbeCliVersion
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue('1.5.13');
      mockSpawnCli
        .mockImplementationOnce(() => failingChild())
        .mockImplementation(() => helpChild(AGY_HELP));
      const adapter = new AntigravityCliAdapter(fakeSpawner);
      await adapter.detect();
      expect(adapter.capabilities().messaging.interrupt.state).toBe('unsupported');
      await adapter.detect();
      expect(adapter.capabilities().messaging.interrupt.state).toBe('supported');
    });

    it('logs why --help could not be read (round-2 minor)', async () => {
      mockProbeCliVersion.mockResolvedValue('1.5.13');
      mockSpawnCli.mockImplementation(() => failingChild());
      const logger = createMockLogger();
      const adapter = new AntigravityCliAdapter(
        fakeSpawner,
        undefined,
        logger as unknown as Logger,
      );
      await adapter.detect();
      expect(logger.warn).toHaveBeenCalledWith(
        '[AntigravityCliAdapter] agy --help could not be spawned',
        { error: 'spawn EBUSY' },
      );
    });

    it('caches a definite "not listed" answer', async () => {
      mockProbeCliVersion.mockResolvedValue('1.5.13');
      mockSpawnCli.mockImplementation(() => helpChild('  --input-format  x\n'));
      const adapter = new AntigravityCliAdapter(fakeSpawner);
      await adapter.detect();
      await adapter.detect();
      // One --help per binary: the stream-json and ACP answers are both cached.
      expect(mockSpawnCli).toHaveBeenCalledTimes(1);
      expect(adapter.capabilities().messaging.interrupt.state).toBe('unsupported');
    });

    it('re-runs an injected probe that answered undefined, shares one in flight', async () => {
      let answers = 0;
      const probe = jest.fn(async () => (answers++ === 0 ? undefined : true));
      const adapter = new AntigravityCliAdapter(undefined, async () => true, undefined, {
        probe,
      });
      mockProbeCliVersion.mockResolvedValue('1.5.13');
      await adapter.detect();
      expect(adapter.capabilities().messaging.interrupt.state).toBe('unsupported');
      await Promise.all([adapter.detect(), adapter.detect()]);
      expect(probe).toHaveBeenCalledTimes(2);
      expect(adapter.capabilities().messaging.interrupt.state).toBe('supported');
    });
  });

  describe('transport override (S3)', () => {
    it.each([
      [undefined, 'auto'],
      ['acp', 'acp'],
      [' STREAM-JSON ', 'stream-json'],
      ['bogus', 'auto'],
    ])('%s reads as %s', (value, expected) => {
      expect(
        readAgyTransportOverride(value === undefined ? {} : { [AGY_TRANSPORT_ENV]: value }),
      ).toBe(expected);
    });

    it('stream-json skips the probe and keeps the stream-json manifest', async () => {
      mockProbeCliVersion.mockResolvedValue('1.5.13');
      mockSpawnCli.mockImplementation(() => helpChild(AGY_HELP));
      const probe = jest.fn(async () => true);
      const adapter = new AntigravityCliAdapter(fakeSpawner, undefined, undefined, {
        probe,
        transport: 'stream-json',
      });
      await adapter.detect();
      expect(probe).not.toHaveBeenCalled();
      expect(adapter.capabilities().messaging.interrupt.state).toBe('unsupported');
    });

    it('acp forces the ACP manifest even when the probe says no', async () => {
      mockProbeCliVersion.mockResolvedValue('1.4.0');
      mockSpawnCli.mockImplementation(() => helpChild(AGY_HELP));
      const probe = jest.fn(async () => false);
      const adapter = new AntigravityCliAdapter(fakeSpawner, undefined, undefined, {
        probe,
        transport: 'acp',
      });
      await adapter.detect();
      expect(probe).not.toHaveBeenCalled();
      expect(adapter.capabilities().messaging.interrupt.state).toBe('supported');
    });

    it('reports an unknown value through onUnknown, but not auto or blank', () => {
      const unknown: string[] = [];
      for (const value of ['acpp', 'auto', '  ', 'ACP']) {
        readAgyTransportOverride({ [AGY_TRANSPORT_ENV]: value }, (raw) => unknown.push(raw));
      }
      expect(unknown).toEqual(['acpp']);
    });

    it('warns once about an unknown environment value (round-2 minor)', () => {
      const real = process.env[AGY_TRANSPORT_ENV];
      process.env[AGY_TRANSPORT_ENV] = 'acpp';
      const logger = createMockLogger();
      try {
        const adapter = new AntigravityCliAdapter(
          undefined,
          undefined,
          logger as unknown as Logger,
        );
        adapter.capabilities();
        adapter.capabilities();
        const warned = logger.warn.mock.calls.filter(([message]) =>
          /unknown PTAH_AGY_TRANSPORT/.test(String(message)),
        );
        expect(warned).toHaveLength(1);
        expect(warned[0][1]).toMatchObject({ value: 'acpp' });
      } finally {
        if (real === undefined) delete process.env[AGY_TRANSPORT_ENV];
        else process.env[AGY_TRANSPORT_ENV] = real;
      }
    });

    it('is read from the environment by default', () => {
      const real = process.env[AGY_TRANSPORT_ENV];
      process.env[AGY_TRANSPORT_ENV] = 'acp';
      try {
        expect(new AntigravityCliAdapter().capabilities().messaging.interrupt.state).toBe(
          'supported',
        );
      } finally {
        if (real === undefined) delete process.env[AGY_TRANSPORT_ENV];
        else process.env[AGY_TRANSPORT_ENV] = real;
      }
    });
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
      return helpChild(servedModels);
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
    readonly adapter?: (adapter: AntigravityCliAdapter) => void;
  }

  async function startLane(
    fixture: ReturnType<typeof readAcpFixture>,
    prompt: (nth: number) => 'result' | 'hold',
    options: Partial<CliCommandOptions> = {},
    setup: LaneSetup = {},
  ): Promise<Lane> {
    let agent: FakeAcpAgent | undefined;
    let transport: FakeAcpTransport | undefined;
    let spawn: AcpSpawnOptions | undefined;
    let prompts = 0;
    const adapter = new AntigravityCliAdapter(undefined, undefined, undefined, {
      probe: async () => true,
      transportFactory: (spawnOptions) => {
        spawn = spawnOptions;
        agent = createFakeAcpAgent();
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
        transport = createFakeAcpTransport(agent);
        return transport;
      },
      ...setup.seam,
    });
    setup.adapter?.(adapter);
    const handle = await adapter.runSdk({
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
      agent: () => agent as FakeAcpAgent,
      transport: () => transport as FakeAcpTransport,
      spawn: () => spawn as AcpSpawnOptions,
      segments,
      stream,
    };
  }

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

  it('sends a retired saved id as a live id of the closest base, as the stream-json lane does', async () => {
    const lane = await startLane(TOOL_USE, () => 'result', { model: 'claude-sonnet-4-6' });
    await lane.handle.done;
    const config = lane.agent().received.find(
      (message) =>
        message.method === 'session/set_config_option' &&
        (message.params as { configId?: unknown } | undefined)?.configId === 'model',
    );
    // Only an id `agy models` lists is derived: the pinned output has no bare
    // `claude-sonnet-5-5`, so the middle effort variant is sent (the full id
    // carries the effort, so no `thought_level` is needed).
    expect(config?.params).toEqual(
      expect.objectContaining({ configId: 'model', value: 'claude-sonnet-5-5-medium' }),
    );
    lane.handle.abort.abort();
  });

  it('sends the saved id unchanged when agy lists no models', async () => {
    servedModels = '';
    const lane = await startLane(TOOL_USE, () => 'result', { model: 'claude-sonnet-4-6' });
    await lane.handle.done;
    const config = lane.agent().received.find(
      (message) =>
        message.method === 'session/set_config_option' &&
        (message.params as { configId?: unknown } | undefined)?.configId === 'model',
    );
    expect(config?.params).toEqual(
      expect.objectContaining({ configId: 'model', value: 'claude-sonnet-4-6' }),
    );
    lane.handle.abort.abort();
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

  describe('ACP quota and rate-limit errors classify as on stream-json', () => {
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
      const viaStreamJson = classifyLaneLimit({
        cliOrProvider: 'antigravity',
        texts: [wording],
        observedAt,
      });
      expect(viaAcp).toMatchObject({ failureKind: 'quota' });
      expect(viaAcp).toEqual(viaStreamJson);
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

  describe('a session that never opens falls back to stream-json (S3)', () => {
    type StreamJsonRun = (options: CliCommandOptions) => Promise<SdkHandle>;

    function stubStreamJson(adapter: AntigravityCliAdapter): jest.Mock {
      const run = jest.fn<ReturnType<StreamJsonRun>, Parameters<StreamJsonRun>>(async () => ({
        abort: new AbortController(),
        done: Promise.resolve(0),
        onOutput: () => undefined,
        onSegment: (callback: (segment: CliOutputSegment) => void) =>
          callback({ type: 'text', content: 'stream-json ran' }),
      }));
      (adapter as unknown as { runStreamJson: StreamJsonRun }).runStreamJson = run;
      return run;
    }

    const failInitialize = (agent: FakeAcpAgent): void =>
      agent.handle('initialize', () => ({
        error: { code: -32603, message: 'agent runtime unpack failed' },
      }));

    it('runs the stream-json lane with the same options when initialize fails', async () => {
      let run: jest.Mock | undefined;
      const lane = await startLane(TOOL_USE, () => 'result', { permission: 'auto-edit' }, {
        script: failInitialize,
        adapter: (adapter) => {
          run = stubStreamJson(adapter);
        },
      });
      await expect(lane.handle.done).resolves.toBe(0);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run?.mock.calls[0][0]).toMatchObject({ permission: 'auto-edit', agentId: 'agent-1' });
      expect(lane.segments.filter((segment) => segment.type === 'error')).toEqual([]);
      expect(lane.segments).toContainEqual({ type: 'text', content: 'stream-json ran' });
      expect(lane.segments).toContainEqual({
        type: 'info',
        content: expect.stringMatching(/this lane runs on stream-json instead\.$/),
      });
    });

    it('starts a fresh conversation instead of resuming an id on stream-json (round-2 M3)', async () => {
      let run: jest.Mock | undefined;
      const lane = await startLane(TOOL_USE, () => 'result', { resumeSessionId: 'acp-session-7' }, {
        script: (agent) => {
          failInitialize(agent);
        },
        adapter: (adapter) => {
          run = stubStreamJson(adapter);
        },
      });
      await expect(lane.handle.done).resolves.toBe(0);
      expect(run?.mock.calls[0][0].resumeSessionId).toBeUndefined();
      expect(run?.mock.calls[0][0]).toMatchObject({ agentId: 'agent-1', task: expect.any(String) });
      expect(lane.segments).toContainEqual({
        type: 'info',
        content: expect.stringMatching(/cannot resume the earlier session on stream-json.*fresh conversation\.$/),
      });
    });

    it('does not fall back when the transport is forced to acp', async () => {
      let run: jest.Mock | undefined;
      const lane = await startLane(TOOL_USE, () => 'result', {}, {
        script: failInitialize,
        seam: { transport: 'acp' },
        adapter: (adapter) => {
          run = stubStreamJson(adapter);
        },
      });
      await expect(lane.handle.done).resolves.toBe(1);
      expect(run).not.toHaveBeenCalled();
      expect(lane.segments.filter((segment) => segment.type === 'error')).toHaveLength(1);
    });

    it('runs stream-json directly when the transport is forced to it', async () => {
      let run: jest.Mock | undefined;
      const lane = await startLane(TOOL_USE, () => 'result', {}, {
        seam: { transport: 'stream-json' },
        adapter: (adapter) => {
          run = stubStreamJson(adapter);
        },
      });
      await expect(lane.handle.done).resolves.toBe(0);
      expect(run).toHaveBeenCalledTimes(1);
      expect(lane.spawn()).toBeUndefined();
    });
  });

  describe('ACP failure cooldown (round-2 M2)', () => {
    type StreamJsonRun = (options: CliCommandOptions) => Promise<SdkHandle>;

    function cooldownAdapter(seam: Partial<AntigravityAcpSeam> = {}): {
      adapter: AntigravityCliAdapter;
      spawns: () => number;
      streamJson: jest.Mock;
      clock: { now: number };
    } {
      const clock = { now: 1_000_000 };
      let spawns = 0;
      const adapter = new AntigravityCliAdapter(undefined, undefined, undefined, {
        probe: async () => true,
        now: () => clock.now,
        transportFactory: () => {
          spawns++;
          const agent = createFakeAcpAgent();
          live.push(agent);
          agent.handle('initialize', () => ({
            error: { code: -32603, message: 'agent runtime unpack failed' },
          }));
          return createFakeAcpTransport(agent);
        },
        ...seam,
      });
      const streamJson = jest.fn<ReturnType<StreamJsonRun>, Parameters<StreamJsonRun>>(
        async () => ({
          abort: new AbortController(),
          done: Promise.resolve(0),
          onOutput: () => undefined,
          onSegment: () => undefined,
        }),
      );
      (adapter as unknown as { runStreamJson: StreamJsonRun }).runStreamJson = streamJson;
      return { adapter, spawns: () => spawns, streamJson, clock };
    }

    const run = async (adapter: AntigravityCliAdapter): Promise<CliOutputSegment[]> => {
      const handle = await adapter.runSdk({
        task: 'Say hi',
        workingDirectory: join(home, 'work'),
        agentId: 'agent-1',
      });
      const segments: CliOutputSegment[] = [];
      handle.onSegment?.((segment) => segments.push(segment));
      await handle.done;
      handle.abort.abort();
      return segments;
    };

    it('sends later lanes straight to stream-json, with one info, until it expires', async () => {
      const h = cooldownAdapter();
      await run(h.adapter);
      expect(h.spawns()).toBe(1);
      expect(h.streamJson).toHaveBeenCalledTimes(1);

      h.clock.now += AGY_ACP_FAILURE_COOLDOWN_MS - 1;
      const cooled = await run(h.adapter);
      expect(h.spawns()).toBe(1);
      expect(h.streamJson).toHaveBeenCalledTimes(2);
      expect(cooled.filter((segment) => segment.type === 'info')).toEqual([
        {
          type: 'info',
          content:
            'Antigravity runs this lane on stream-json: an earlier ACP session failed to start within the last 10 minutes.',
        },
      ]);
      expect(h.adapter.capabilities().messaging.interrupt.state).toBe('unsupported');

      h.clock.now += 1;
      await run(h.adapter);
      expect(h.spawns()).toBe(2);
    });

    it('is bypassed by PTAH_AGY_TRANSPORT=acp', async () => {
      const forced = cooldownAdapter({ transport: 'acp' });
      // A forced lane never records a failure itself, so seed one directly.
      (forced.adapter as unknown as { acpFailedAtByBinary: Map<string, number> }).acpFailedAtByBinary.set(
        'agy',
        forced.clock.now,
      );
      const segments = await run(forced.adapter);
      expect(forced.spawns()).toBe(1);
      expect(forced.streamJson).not.toHaveBeenCalled();
      expect(segments.filter((segment) => segment.type === 'error')).toHaveLength(1);
    });
  });

  it('refuses the ask permission on a lane (no approval route)', async () => {
    await expect(startLane(TOOL_USE, () => 'result', { permission: 'ask' })).rejects.toThrow(
      /approval route/,
    );
  });
});
