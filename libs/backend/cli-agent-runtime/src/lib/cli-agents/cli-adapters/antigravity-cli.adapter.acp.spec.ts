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

import { meetsAgyAcpFloor } from './antigravity-acp-lane';
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
});

describe('AntigravityCliAdapter — ACP lane', () => {
  const realHome = process.env['HOME'];
  const realProfile = process.env['USERPROFILE'];
  let home: string;
  const live: FakeAcpAgent[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
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

  async function startLane(
    fixture: ReturnType<typeof readAcpFixture>,
    prompt: (nth: number) => 'result' | 'hold',
    options: Partial<CliCommandOptions> = {},
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
        transport = createFakeAcpTransport(agent);
        return transport;
      },
    });
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

    expect(lane.spawn().args).toEqual(['acp', '--dangerously-skip-permissions']);
    const created = lane.agent().received.find((message) => message.method === 'session/new');
    expect((created?.params as Record<string, unknown>)['mcpServers']).toEqual([
      {
        type: 'http',
        name: 'ptah',
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
    lane.handle.abort.abort();
  });

  it('sends a saved legacy model id normalised, as the stream-json lane does', async () => {
    const lane = await startLane(TOOL_USE, () => 'result', { model: 'claude-sonnet-4-6' });
    await lane.handle.done;
    const config = lane.agent().received.find(
      (message) => message.method === 'session/set_config_option',
    );
    expect(config?.params).toEqual(
      expect.objectContaining({ configId: 'model', value: 'claude-sonnet-5-5-medium' }),
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

    const next = await (lane.handle.continue as NonNullable<SdkHandle['continue']>)(
      'Reply with exactly AFTER-INTERRUPT',
    );
    await expect(next.done).resolves.toBe(0);
    expect(
      lane.segments.some(
        (segment) => segment.type === 'text' && segment.content.includes('AFTER-INTERRUPT'),
      ),
    ).toBe(true);
    expect(lane.handle.getPid?.()).toBe(4242);
    lane.handle.abort.abort();
  });

  it('refuses the ask permission on a lane (no approval route)', async () => {
    await expect(startLane(TOOL_USE, () => 'result', { permission: 'ask' })).rejects.toThrow(
      /approval route/,
    );
  });
});
