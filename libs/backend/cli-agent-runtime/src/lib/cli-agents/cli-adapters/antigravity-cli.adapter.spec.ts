/**
 * AntigravityCliAdapter Unit Tests
 *
 * The adapter spawns the `agy` binary in print mode with
 * `--output-format stream-json` and parses the resulting JSONL event stream.
 * Tests mock cli-adapter.utils (spawnCli / resolveCliPath / probeCliVersion)
 * and fs so no real `agy` process or disk write happens.
 * Covers: detect() (installed/not), listModels() parsing of `agy models`,
 * runSdk() arg construction (stream-json/print/model/effort/skip-permissions/
 * conversation/add-dir), the stream-json → segment mapping, the non-JSON
 * fallback, and session-id capture from the `init` event.
 *
 * Every stream-json fixture below is copied from output captured by running the
 * real binary (agy 1.1.11) — see `.ptah/specs/TASK_2026_199/stream-json-capture.md`.
 */
// The adapter reaches the MCP facet through the `harness-sync` barrel, which
// pulls in `vscode-core`'s tsyringe decorators. Same reason the other DI-touching
// specs in this lib import it first.
import 'reflect-metadata';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

interface FakeChildControls {
  stdout: PassThrough;
  stderr: PassThrough;
  emitClose: (code: number | null, signal?: NodeJS.Signals | null) => void;
  emitError: (err: Error) => void;
  emitStdinError: (err: Error) => void;
  killed: boolean;
  kill: jest.Mock;
  child: EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: EventEmitter & { end: jest.Mock; write: jest.Mock };
    kill: jest.Mock;
    killed: boolean;
    pid: number;
    whenSpawned: Promise<number | null>;
  };
}

/** A stable fake PID so abort handlers route through killProcessTree(pid). */
const FAKE_PID = 4242;

function createFakeChild(): FakeChildControls {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.setEncoding('utf8');
  stderr.setEncoding('utf8');

  const emitter = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: EventEmitter & { end: jest.Mock; write: jest.Mock };
    kill: jest.Mock;
    killed: boolean;
    pid: number;
    whenSpawned: Promise<number | null>;
  };
  emitter.stdout = stdout;
  emitter.stderr = stderr;
  emitter.stdin = Object.assign(new EventEmitter(), {
    end: jest.fn(),
    write: jest.fn(),
  });
  emitter.pid = FAKE_PID;
  emitter.whenSpawned = Promise.resolve(FAKE_PID);
  emitter.killed = false;
  emitter.kill = jest.fn((_signal?: string) => {
    emitter.killed = true;
    return true;
  });

  return {
    stdout,
    stderr,
    emitClose: (code, signal) => emitter.emit('close', code, signal ?? null),
    emitError: (err) => emitter.emit('error', err),
    emitStdinError: (err) => emitter.stdin.emit('error', err),
    get killed() {
      return emitter.killed;
    },
    kill: emitter.kill,
    child: emitter,
  };
}

let currentChild: FakeChildControls | null = null;

/**
 * `agy models` stdout as agy 1.5.14 printed it on 2026-11-22 (A7: suffixed
 * ids, `id<TAB>name`; the "Fetching available models..." status line goes to
 * stderr). The spawn derives `--model` from these ids.
 */
const AGY_MODELS_STDOUT = [
  'gemini-4-neon-high\tGemini 4 Neon (High)',
  'gemini-4-neon-xhigh\tGemini 4 Neon (XHigh)',
  'gemini-4-neon-medium\tGemini 4 Neon (Medium)',
  'gemini-4-neon-low\tGemini 4 Neon (Low)',
  'gemini-4-carbon-medium\tGemini 4 Carbon (Medium)',
  'gemini-4-carbon-high\tGemini 4 Carbon (High)',
  'gemini-4-carbon-low\tGemini 4 Carbon (Low)',
  'gemini-4-argon-medium\tGemini 4 Argon (Medium)',
  'gemini-4-argon-high\tGemini 4 Argon (High)',
  'gemini-4-argon-low\tGemini 4 Argon (Low)',
  'gemini-4-hydrogen-high\tGemini 4 Hydrogen (High)',
  'gemini-4-hydrogen-xhigh\tGemini 4 Hydrogen (XHigh)',
  'gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)',
  'gemini-4-hydrogen-low\tGemini 4 Hydrogen (Low)',
  'gemini-pro-orchestrator-neon\tOrchestrator (Neon)',
  'gemini-pro-orchestrator\tOrchestrator (Carbon)',
  'gemini-pro-orchestrator-argon\tOrchestrator (Argon)',
  'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
  'claude-opus-5-5-low\tClaude Opus 5.5 (Low)',
  'claude-opus-5-5-medium\tClaude Opus 5.5 (Medium)',
  'claude-opus-5-5-high\tClaude Opus 5.5 (High)',
  'claude-sonnet-5-5-low\tClaude Sonnet 5.5 (Low)',
  'claude-sonnet-5-5-medium\tClaude Sonnet 5.5 (Medium)',
  'claude-sonnet-5-5-high\tClaude Sonnet 5.5 (High)',
  'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)',
  '',
].join('\r\n');

/**
 * What an `agy models` spawn prints in the runSdk specs; `undefined` routes the
 * probe to `currentChild` like any other spawn (the listModels specs drive it).
 */
let servedModels: string | undefined;

/** A child that prints `stdout` and closes, outside `currentChild`. */
function servingChild(stdout: string): FakeChildControls['child'] {
  const fake = createFakeChild();
  setImmediate(() => {
    fake.stdout.end(stdout);
    setImmediate(() => fake.emitClose(0));
  });
  return fake.child;
}

/** The spawnCli calls other than the `agy models` probe. */
function runSpawnCalls(): Array<[string, string[]]> {
  return (mockSpawnCli.mock.calls as Array<[string, string[]]>).filter(
    ([, args]) => args[0] !== 'models',
  );
}

/** How many `agy models` probes were spawned. */
function modelProbeCount(): number {
  return mockSpawnCli.mock.calls.filter(([, args]) => (args as string[])[0] === 'models')
    .length;
}

const mockSpawnCli = jest.fn();
const mockResolveCliPath = jest.fn();
const mockProbeCliVersion = jest.fn();
const mockKillProcessTree = jest.fn();

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

jest.mock('@ptah-extension/platform-core', () => {
  const actual = jest.requireActual<
    typeof import('@ptah-extension/platform-core')
  >('@ptah-extension/platform-core');
  return {
    ...actual,
    killProcessTree: (...args: unknown[]) => mockKillProcessTree(...args),
  };
});

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockRejectedValue(new Error('missing')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

import { AntigravityCliAdapter, agyModelId } from './antigravity-cli.adapter';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SdkHandle } from './cli-adapter.interface';
import type {
  AgentRoleDefinition,
  CliOutputSegment,
} from '@ptah-extension/shared';
import {
  buildTaskPrompt,
  CliCommandLineTooLongError,
  renderRoleBlock,
} from './cli-adapter.utils';

/** Drain a handle's raw output + structured segments into arrays. */
function collect(handle: SdkHandle): {
  output: string[];
  segments: CliOutputSegment[];
} {
  const output: string[] = [];
  const segments: CliOutputSegment[] = [];
  handle.onOutput((data) => output.push(data));
  handle.onSegment?.((seg) => segments.push(seg));
  return { output, segments };
}

describe('AntigravityCliAdapter', () => {
  let adapter: AntigravityCliAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    currentChild = null;
    servedModels = AGY_MODELS_STDOUT;
    mockSpawnCli.mockImplementation((_binary: string, args: string[]) => {
      if (args[0] === 'models' && servedModels !== undefined) {
        return servingChild(servedModels);
      }
      currentChild = createFakeChild();
      return currentChild.child;
    });
    adapter = new AntigravityCliAdapter(undefined, async () => true);
  });

  describe('detect()', () => {
    it('tree-kills a timed-out help probe', async () => {
      // The worker has not forwarded exit; the fake child deliberately emits no exit event.
      jest.useFakeTimers();
      const realPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      try {
        mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
        mockProbeCliVersion.mockResolvedValue('agy future-version');
        const detecting = new AntigravityCliAdapter().detect();
        await jest.advanceTimersByTimeAsync(8000);
        await detecting;
        expect(mockKillProcessTree).toHaveBeenCalledTimes(1);
        expect(mockKillProcessTree).toHaveBeenCalledWith(
          FAKE_PID,
          'SIGTERM',
          undefined,
          { groupOnly: process.platform !== 'win32' },
        );
        expect(mockSpawnCli).toHaveBeenCalledWith('/usr/local/bin/agy', ['--help'],
          expect.objectContaining({ detached: true }));
        expect(currentChild?.kill).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
        jest.useRealTimers();
      }
    });
    it('reports installed when resolveCliPath finds the binary', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      mockProbeCliVersion.mockResolvedValue('agy 1.1.3');

      const result = await adapter.detect();
      expect(result.cli).toBe('antigravity');
      expect(result.installed).toBe(true);
      expect(result.path).toBe('/usr/local/bin/agy');
      expect(result.version).toBe('agy 1.1.3');
      expect(result.messagingMode).toBe('queue');
    });

    it('reports NOT installed when resolveCliPath returns null', async () => {
      mockResolveCliPath.mockResolvedValue(null);
      const result = await adapter.detect();
      expect(result.installed).toBe(false);
    });

    it('capability-probes --help instead of comparing version strings', async () => {
      const probedAdapter = new AntigravityCliAdapter();
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      mockProbeCliVersion.mockResolvedValue('agy future-version');

      const detecting = probedAdapter.detect();
      await Promise.resolve();
      await Promise.resolve();
      currentChild?.stdout.write(
        '  --input-format  Input format for print mode\n',
      );
      currentChild?.emitClose(0);

      await expect(detecting).resolves.toMatchObject({
        messagingMode: 'queue',
      });
      expect(mockSpawnCli).toHaveBeenCalledWith(
        '/usr/local/bin/agy',
        ['--help'],
        {
          spawner: undefined,
          detached: true,
        },
      );
    });
  });

  describe('listModels()', () => {
    beforeEach(() => {
      servedModels = undefined;
    });

    it('parses the pinned agy 1.5.14 `agy models` output (A7)', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      servedModels = AGY_MODELS_STDOUT;
      const models = await adapter.listModels();
      expect(models).toHaveLength(27);
      expect(models[0]).toEqual({ id: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)' });
      expect(models).toContainEqual({ id: 'gemini-pro-orchestrator', name: 'Orchestrator (Carbon)' });
    });

    it('tree-kills the model probe once on timeout and throws a timeout', async () => {
      // The worker has not forwarded exit; the fake child deliberately emits no exit event.
      jest.useFakeTimers();
      const realPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      try {
        mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
        const models = adapter.listModels().catch((error: unknown) => error);
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(8000);
        // A timeout is a failure, not an empty answer: the code lets the
        // model-list classifier report `timeout`.
        expect(await models).toMatchObject({ code: 'ETIMEDOUT' });
        expect(mockKillProcessTree).toHaveBeenCalledTimes(1);
        expect(mockKillProcessTree).toHaveBeenCalledWith(
          FAKE_PID,
          'SIGTERM',
          undefined,
          { groupOnly: process.platform !== 'win32' },
        );
        expect(mockSpawnCli).toHaveBeenCalledWith('/usr/local/bin/agy', ['models'],
          expect.objectContaining({ detached: true }));
        expect(currentChild?.kill).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
        jest.useRealTimers();
      }
    });
    it('old format: one spaced label per line still lists models', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();

      // probeModels spawns `agy models`; feed it labels then close.
      await Promise.resolve();
      currentChild?.stdout.write(
        'Gemini 3.1 Pro (High)\nClaude Sonnet 4.6 (Thinking)\n\n',
      );
      currentChild?.emitClose(0);

      expect(await models).toEqual([
        { id: 'Gemini 3.1 Pro (High)', name: 'Gemini 3.1 Pro (High)' },
        {
          id: 'Claude Sonnet 4.6 (Thinking)',
          name: 'Claude Sonnet 4.6 (Thinking)',
        },
      ]);
      const [, argsArg] = mockSpawnCli.mock.calls[0] as [string, string[]];
      expect(argsArg).toEqual(['models']);
    });

    it('old format: status and error lines on stdout are ignored (final review M-4)', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();
      await Promise.resolve();
      currentChild?.stdout.write(
        [
          'Fetching available models...',
          'Error: not signed in',
          'warning: cache is stale',
          'Loading models',
          'Loading…',
          'Usage limit reached',
          'Failed to refresh token',
          'Models:',
          'Gemini 3.1 Pro (High)',
          '',
        ].join('\n'),
      );
      currentChild?.emitClose(0);

      expect(await models).toEqual([
        { id: 'Gemini 3.1 Pro (High)', name: 'Gemini 3.1 Pro (High)' },
      ]);
    });

    it('an error-only stdout with a non-zero exit throws instead of listing nothing', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();
      await Promise.resolve();
      currentChild?.stdout.write('Error: not signed in. Run agy login.\n');
      currentChild?.emitClose(1);
      await expect(models).rejects.toThrow('agy models exited with code 1');
    });

    it('rows printed before a failing exit are not a catalog', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();
      await Promise.resolve();
      currentChild?.stdout.write('gemini-3-pro-medium\tGemini 3 Pro (Medium)\n');
      currentChild?.emitClose(1);
      await expect(models).rejects.toThrow('agy models exited with code 1');
    });

    it('rows printed before a signal termination are not a catalog', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();
      await Promise.resolve();
      currentChild?.stdout.write('gemini-3-pro-medium\tGemini 3 Pro (Medium)\n');
      // A signal-terminated child closes with a null exit code.
      currentChild?.emitClose(null, 'SIGKILL');
      await expect(models).rejects.toThrow('agy models was terminated by a signal');
    });

    it('throws with the spawn error code when agy cannot start', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();
      await Promise.resolve();
      currentChild?.emitError(
        Object.assign(new Error('spawn agy ENOENT'), { code: 'ENOENT' }),
      );
      await expect(models).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('new format: when any line has a tab, only tab lines are models (final review M-4)', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();
      await Promise.resolve();
      currentChild?.stdout.write(
        [
          'Fetching available models...',
          'Gemini 3.1 Pro (High)',
          'Note this list may change',
          'claude-sonnet-4-6\tClaude Sonnet 4.6',
          '',
        ].join('\n'),
      );
      currentChild?.emitClose(0);

      expect(await models).toEqual([
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      ]);
    });

    it('agy 1.2 format: skips the status line and splits `id<TAB>name` (TASK_2026_555 Batch 52.2)', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();
      await Promise.resolve();
      currentChild?.stdout.write(
        'Fetching available models...\r\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\r\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\r\n',
      );
      currentChild?.emitClose(0);

      expect(await models).toEqual([
        { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
      ]);
    });

    it('returns an empty list when the probe produces no output', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      const models = adapter.listModels();
      await Promise.resolve();
      currentChild?.emitClose(0);
      expect(await models).toEqual([]);
    });
  });

  describe('runSdk() — argument construction', () => {
    const baseOptions = { task: 'Do the thing', workingDirectory: '/proj' };

    it('spawns stream-json input mode with attached empty print and skip-permissions', async () => {
      const handle = await adapter.runSdk(baseOptions);
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [binaryArg, argsArg] = runSpawnCalls()[0] as [
        string,
        string[],
      ];
      expect(binaryArg).toBe('agy');
      expect(argsArg[argsArg.indexOf('--output-format') + 1]).toBe(
        'stream-json',
      );
      expect(argsArg).toContain('--dangerously-skip-permissions');
      expect(argsArg).toContain('--add-dir');
      expect(argsArg[argsArg.indexOf('--add-dir') + 1]).toBe('/proj');
      // Direct spawn receives the shell's quote-free form of `--print=''`.
      expect(argsArg[0]).toBe('--print=');
      expect(argsArg.slice(1, 5)).toEqual([
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
      ]);
    });

    it('uses the attached empty --print value and sends the task as validated NDJSON', async () => {
      const handle = await adapter.runSdk(baseOptions);

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg).toContain('--print=');
      expect(argsArg).toContain('--input-format');
      expect(argsArg[argsArg.indexOf('--input-format') + 1]).toBe(
        'stream-json',
      );
      expect(argsArg).not.toContain('--print');
      expect(currentChild?.child.stdin.write).toHaveBeenCalledWith(
        `${JSON.stringify({
          event: 'user',
          message: { content: buildTaskPrompt(baseOptions, 'antigravity') },
        })}\n`,
      );
      expect(currentChild?.child.stdin.end).not.toHaveBeenCalled();
      expect(buildTaskPrompt(baseOptions, 'antigravity').match(/Lane policy id: ptah-lane-policy-v1/g)).toHaveLength(1);

      currentChild?.emitClose(0);
      await handle.done;
    });

    it('settles the active turn when stdin emits an error', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.emitStdinError(new Error('write EPIPE'));

      await expect(handle.done).resolves.toBe(1);
      expect(handle.supportsContinuation?.()).toBe(false);
      expect(segments).toContainEqual({
        type: 'error',
        content: 'Antigravity CLI Error: write EPIPE',
      });
      currentChild?.emitClose(1);
    });

    it('adds --model when a model is provided', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        model: 'Gemini 3.1 Pro (High)',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--model') + 1]).toBe(
        'Gemini 3.1 Pro (High)',
      );
    });

    it('replaces a retired saved id with a live variant of the closest base, from `id<TAB>name`', async () => {
      const warn = jest.fn();
      const logged = new AntigravityCliAdapter(undefined, async () => true, {
        debug: jest.fn(),
        info: jest.fn(),
        warn,
        error: jest.fn(),
      } as unknown as Logger);
      const handle = await logged.runSdk({
        ...baseOptions,
        model: 'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      // The pinned output lists only `claude-sonnet-5-5-{low,medium,high}`:
      // the bare base is not live, so the middle effort is chosen.
      expect(argsArg[argsArg.indexOf('--model') + 1]).toBe(
        'claude-sonnet-5-5-medium',
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('closest live model'),
        { saved: 'claude-sonnet-4-6', model: 'claude-sonnet-5-5-medium' },
      );
    });

    it('keeps the effort of a retired saved id when the closest base lists it', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        model: 'claude-sonnet-4-6-high',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--model') + 1]).toBe('claude-sonnet-5-5-high');
    });

    it('does not re-probe agy models for every spawn after a failed probe', async () => {
      servedModels = '';
      for (let i = 0; i < 2; i++) {
        const handle = await adapter.runSdk({ ...baseOptions, model: 'm-1' });
        collect(handle);
        currentChild?.emitClose(0);
        await handle.done;
      }
      const probes = mockSpawnCli.mock.calls.filter(
        ([, args]) => (args as string[])[0] === 'models',
      );
      expect(probes).toHaveLength(1);
    });

    it('scopes the live ids to the binary: another binary probes its own', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      await adapter.listModels();
      expect(modelProbeCount()).toBe(1);

      for (const binaryPath of ['/usr/local/bin/agy', '/opt/other/agy']) {
        const handle = await adapter.runSdk({
          ...baseOptions,
          model: 'm-1',
          binaryPath,
        });
        collect(handle);
        currentChild?.emitClose(0);
        await handle.done;
      }

      // The same binary reuses the listing's ids; the other one probes.
      const probes = (
        mockSpawnCli.mock.calls as Array<[string, string[]]>
      ).filter(([, args]) => args[0] === 'models');
      expect(probes.map(([binary]) => binary)).toEqual([
        '/usr/local/bin/agy',
        '/opt/other/agy',
      ]);
    });

    it('a clean empty refresh drops the earlier ids for the next spawn', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      await adapter.listModels();
      servedModels = '';
      expect(await adapter.listModels()).toEqual([]);

      const handle = await adapter.runSdk({
        ...baseOptions,
        model: 'claude-opus-4-8',
        reasoningEffort: 'high',
        binaryPath: '/usr/local/bin/agy',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      // The earlier list would map the retired id to its live base; the empty
      // answer leaves no ids, and its cooldown spares the spawn a third probe.
      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--model') + 1]).not.toBe('claude-opus-5-5-high');
      expect(modelProbeCount()).toBe(2);
    });

    it('applies the effort to a retired id through its closest live base', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        model: 'claude-opus-4-8',
        reasoningEffort: 'high',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--model') + 1]).toBe('claude-opus-5-5-high');
    });

    it('passes the model unchanged and appends no effort when agy lists no ids', async () => {
      servedModels = '';
      const handle = await adapter.runSdk({
        ...baseOptions,
        model: 'claude-sonnet-4-6',
        reasoningEffort: 'high',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--model') + 1]).toBe('claude-sonnet-4-6');
      expect(argsArg).not.toContain('--effort');
    });

    it('does not append an effort agy does not list for that base, and warns', async () => {
      const warn = jest.fn();
      const logged = new AntigravityCliAdapter(undefined, async () => true, {
        debug: jest.fn(),
        info: jest.fn(),
        warn,
        error: jest.fn(),
      } as unknown as Logger);
      const handle = await logged.runSdk({
        ...baseOptions,
        model: 'gemini-pro-orchestrator',
        reasoningEffort: 'high',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--model') + 1]).toBe('gemini-pro-orchestrator');
      expect(argsArg).not.toContain('--effort');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('no effort variant'),
        { model: 'gemini-pro-orchestrator', effort: 'high' },
      );
    });

    it('probes `agy models` at most once per freshness window and shares one probe', async () => {
      const first = adapter.runSdk({ ...baseOptions, model: 'claude-sonnet-5-5' });
      const second = adapter.runSdk({ ...baseOptions, model: 'claude-opus-5-5' });
      const handles = await Promise.all([first, second]);
      expect(modelProbeCount()).toBe(1);
      const third = await adapter.runSdk({ ...baseOptions, model: 'claude-sonnet-5-5-low' });
      expect(modelProbeCount()).toBe(1);
      for (const handle of [...handles, third]) handle.abort.abort();
    });

    it('re-probes once the last ids are older than 10 minutes', async () => {
      const clock = { now: 1_000_000 };
      const timed = new AntigravityCliAdapter(undefined, async () => true, undefined, {
        now: () => clock.now,
      });
      (await timed.runSdk({ ...baseOptions, model: 'claude-sonnet-5-5' })).abort.abort();
      clock.now += 10 * 60_000 - 1;
      (await timed.runSdk({ ...baseOptions, model: 'claude-sonnet-5-5' })).abort.abort();
      expect(modelProbeCount()).toBe(1);
      clock.now += 1;
      (await timed.runSdk({ ...baseOptions, model: 'claude-sonnet-5-5' })).abort.abort();
      expect(modelProbeCount()).toBe(2);
    });

    it('does not probe `agy models` when no model is chosen', async () => {
      const handle = await adapter.runSdk({ ...baseOptions, reasoningEffort: 'high' });
      handle.abort.abort();
      expect(modelProbeCount()).toBe(0);
    });

    it('adds --effort for a value agy accepts when no model is set', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        reasoningEffort: 'high',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--effort') + 1]).toBe('high');
    });

    it('keeps an effort-suffixed model and omits conflicting --effort', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        model: 'claude-sonnet-5-5-low',
        reasoningEffort: 'high',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--model') + 1]).toBe(
        'claude-sonnet-5-5-low',
      );
      expect(argsArg).not.toContain('--effort');
    });

    it('encodes requested effort when agy lists `<model>-<effort>`', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        model: 'claude-sonnet-5-5',
        reasoningEffort: 'high',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--model') + 1]).toBe(
        'claude-sonnet-5-5-high',
      );
      expect(argsArg).not.toContain('--effort');
    });

    it('drops an effort agy does not accept', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        reasoningEffort: 'minimal',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg).not.toContain('--effort');
    });

    it('passes through xhigh effort supported by agy', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        reasoningEffort: 'xhigh',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--effort') + 1]).toBe('xhigh');
    });

    it('adds --conversation when resuming a session', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        resumeSessionId: 'abc-123',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg[argsArg.indexOf('--conversation') + 1]).toBe('abc-123');
    });

    it('omits skip-permissions when autoApprove is false', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        autoApprove: false,
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];
      expect(argsArg).not.toContain('--dangerously-skip-permissions');
    });

    it('passes binaryPath through to spawnCli when provided', async () => {
      const handle = await adapter.runSdk({
        ...baseOptions,
        binaryPath: 'C:/agy/bin/agy.exe',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const [binaryArg] = runSpawnCalls()[0] as [string, string[]];
      expect(binaryArg).toBe('C:/agy/bin/agy.exe');
    });

    it('caches stream-json support separately for each binary path', async () => {
      const probe = jest
        .fn<Promise<boolean>, [string]>()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const binaryAwareAdapter = new AntigravityCliAdapter(undefined, probe);

      const supported = await binaryAwareAdapter.runSdk({
        ...baseOptions,
        binaryPath: 'C:/agy/new/agy.exe',
      });
      currentChild?.emitClose(0);
      await supported.done;

      const unsupported = await binaryAwareAdapter.runSdk({
        ...baseOptions,
        binaryPath: 'C:/agy/old/agy.exe',
      });
      expect(unsupported.continue).toBeUndefined();
      currentChild?.emitClose(0);
      await unsupported.done;

      expect(probe).toHaveBeenNthCalledWith(1, 'C:/agy/new/agy.exe');
      expect(probe).toHaveBeenNthCalledWith(2, 'C:/agy/old/agy.exe');
    });
  });

  describe('runSdk() — role delivery (task-prompt)', () => {
    const role: AgentRoleDefinition = {
      name: 'reviewer',
      body: 'Review the diff before approving.',
      sourcePath: '/proj/.claude/agents/reviewer.md',
      bytes: 33,
    };
    const baseOptions = {
      task: 'Do the thing',
      workingDirectory: '/proj',
      projectGuidance: 'HARNESS CONTEXT',
      model: 'Gemini 3.1 Pro (High)',
      reasoningEffort: 'high',
    };

    it('declares the task-prompt channel', () => {
      expect(adapter.roleChannel).toBe('task-prompt');
    });

    it('puts the role block in the first stream-json input message', async () => {
      const handle = await adapter.runSdk({ ...baseOptions, role });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      const written = currentChild?.child.stdin.write.mock
        .calls[0]?.[0] as string;
      const prompt = (JSON.parse(written) as { message: { content: string } })
        .message.content;
      expect(prompt).toBe(
        buildTaskPrompt({ ...baseOptions, role }, 'antigravity'),
      );
      expect(prompt).toContain(renderRoleBlock(role, 'antigravity'));
    });

    it('rejects an oversized role-carrying prompt before spawning', async () => {
      const legacy = new AntigravityCliAdapter(undefined, async () => false);
      // The role block is capped (TASK_2026_597), so the oversized part of
      // this role-carrying prompt is the task text.
      const hugeTask = 'x'.repeat(1_100_000);

      await expect(
        legacy.runSdk({
          ...baseOptions,
          task: hugeTask,
          mcpPort: 51820,
          role,
        }),
      ).rejects.toBeInstanceOf(CliCommandLineTooLongError);
      // Only the `agy models` probe ran; the lane itself never spawned.
      expect(runSpawnCalls()).toHaveLength(0);
    });

    it('keeps every argument except the prompt identical when a role is set', async () => {
      const first = await adapter.runSdk(baseOptions);
      collect(first);
      currentChild?.emitClose(0);
      await first.done;

      const second = await adapter.runSdk({ ...baseOptions, role });
      collect(second);
      currentChild?.emitClose(0);
      await second.done;

      const [, roleless] = runSpawnCalls()[0] as [string, string[]];
      const [, withRole] = runSpawnCalls()[1] as [string, string[]];
      expect(withRole).toEqual(roleless);
    });
  });

  describe('runSdk() — stream-json → segment parsing', () => {
    const baseOptions = { task: 'Do the thing', workingDirectory: '/proj' };
    const CONV_ID = '917bf234-79d8-496b-88b0-c3d7e376d066';

    /** `init` line as emitted by agy 1.1.11 (tool list truncated). */
    const initLine = JSON.stringify({
      event: 'init',
      conversation_id: CONV_ID,
      init: {
        cwd: 'D:\\projects\\ptah-extension',
        tools: ['list_dir', 'view_file', 'run_command'],
        permission_mode: 'always-proceed',
      },
    });

    const stepLine = (step: Record<string, unknown>): string =>
      JSON.stringify({
        event: 'step_update',
        step_update: { conversation_id: CONV_ID, ...step },
      });

    it('settles once per result, writes a continuation on the same stdin, and then closes stdin', async () => {
      const handle = await adapter.runSdk({ ...baseOptions, model: 'agy-model' });
      const { segments } = collect(handle);
      const firstDone = handle.done;

      currentChild?.stdout.write(
        JSON.stringify({
          event: 'result',
          result: {
            conversation_id: CONV_ID,
            status: 'SUCCESS',
            response: 'first',
            num_turns: 1,
            usage: { input_tokens: 100, output_tokens: 20, cache_read_tokens: 30 },
          },
        }) + '\n',
      );
      await expect(firstDone).resolves.toBe(0);

      const continuation = await handle.continue?.('second turn');
      expect(continuation).toBeDefined();
      expect(currentChild?.child.stdin.write).toHaveBeenLastCalledWith(
        `${JSON.stringify({
          event: 'user',
          message: { content: 'second turn' },
        })}\n`,
      );

      currentChild?.stdout.write(stepLine({
        step_index: 8, state: 'DONE', step_type: 'agent_response',
        usage: { input_tokens: 150, output_tokens: 30, cache_read_tokens: 45 },
      }) + '\n');

      currentChild?.stdout.write(
        JSON.stringify({
          event: 'result',
          result: {
            conversation_id: CONV_ID,
            status: 'SUCCESS',
            response: 'second',
            num_turns: 2,
            usage: { input_tokens: 250, output_tokens: 50, cache_read_tokens: 75 },
          },
        }) + '\n',
      );
      await expect(continuation?.done).resolves.toBe(0);
      const telemetry = segments.flatMap((item) => item.turnTelemetry?.status === 'reported' ? [item.turnTelemetry.usage] : []);
      expect(telemetry.map((usage) => [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens])).toEqual([
        [100, 20, { status: 'reported', value: 30, source: 'stream' }],
        [150, 30, { status: 'reported', value: 45, source: 'stream' }],
      ]);
      expect(telemetry[0]?.turnId).toBeTruthy();
      expect(telemetry[1]?.turnId).not.toBe(telemetry[0]?.turnId);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(currentChild?.child.stdin.end).toHaveBeenCalledTimes(1);

      currentChild?.emitClose(0);
    });

    it('emits stdout following a result before settling the turn and still continues', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const order: string[] = [];
      handle.onOutput((data) => {
        if (data.includes('trailing stdout')) order.push('output');
      });
      void handle.done.then(() => order.push('done'));

      currentChild?.stdout.write(
        `${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'first' } })}\n`,
      );
      await Promise.resolve();
      currentChild?.stdout.write('trailing stdout\n');
      await expect(handle.done).resolves.toBe(0);
      expect(order).toEqual(['output', 'done']);

      const continuation = await handle.continue?.('second turn');
      expect(continuation).toBeDefined();
      currentChild?.stdout.write(
        `${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'second' } })}\n`,
      );
      await expect(continuation?.done).resolves.toBe(0);
      currentChild?.emitClose(0);
    });

    it('refuses an invalid queued message before writing it to stdin', async () => {
      const handle = await adapter.runSdk(baseOptions);
      collect(handle);
      currentChild?.stdout.write(
        JSON.stringify({
          event: 'result',
          result: { status: 'SUCCESS', response: 'first' },
        }) + '\n',
      );
      await handle.done;
      const writesBefore = currentChild?.child.stdin.write.mock.calls.length;

      await expect(
        handle.continue?.(undefined as unknown as string),
      ).rejects.toThrow(
        'Refusing to send an invalid Antigravity stream-json message',
      );
      expect(currentChild?.child.stdin.write).toHaveBeenCalledTimes(
        writesBefore ?? 0,
      );
      currentChild?.emitClose(0);
    });

    it('settles a malformed terminal result with exit code 1', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);
      currentChild?.stdout.write(`${JSON.stringify({ event: 'result' })}\n`);

      await expect(handle.done).resolves.toBe(1);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(currentChild?.child.stdin.end).toHaveBeenCalledTimes(1);

      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'error',
            content: expect.stringContaining(
              'Invalid Antigravity stream-json event',
            ),
          }),
        ]),
      );
      currentChild?.emitClose(1);
    });

    it('maps a tool step to a tool-call then a tool-result', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stdout.write(initLine + '\n');
      currentChild?.stdout.write(
        stepLine({
          step_index: 3,
          state: 'ACTIVE',
          step_type: 'tool',
          tool_name: 'list_dir',
          tool_info: {
            name: 'list_dir',
            parameters: { DirectoryPath: 'D:\\projects\\ptah-extension' },
          },
        }) + '\n',
      );
      currentChild?.stdout.write(
        stepLine({
          step_index: 3,
          state: 'DONE',
          step_type: 'tool',
          tool_name: 'list_dir',
          duration_seconds: 0.2881932,
          tool_info: {
            name: 'list_dir',
            parameters: { DirectoryPath: 'D:\\projects\\ptah-extension' },
            output: 'apps/\nlibs/\npackage.json',
          },
        }) + '\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      const call = segments.find((s) => s.type === 'tool-call');
      const result = segments.find((s) => s.type === 'tool-result');
      expect(call).toMatchObject({
        toolName: 'list_dir',
        toolCallId: '3',
        toolInput: { DirectoryPath: 'D:\\projects\\ptah-extension' },
      });
      expect(result).toMatchObject({
        toolName: 'list_dir',
        toolCallId: '3',
        content: 'apps/\nlibs/\npackage.json',
      });
    });

    it('closes an ERROR tool step with a tool-result-error for the same toolCallId', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stdout.write(
        stepLine({
          step_index: 4,
          state: 'ACTIVE',
          step_type: 'tool',
          tool_name: 'run_command',
        }) + '\n',
      );
      currentChild?.stdout.write(
        stepLine({
          step_index: 4,
          state: 'ERROR',
          step_type: 'tool',
          tool_name: 'run_command',
          tool_info: { name: 'run_command', output: 'permission denied' },
        }) + '\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      expect(segments.find((s) => s.type === 'tool-call')).toMatchObject({
        toolName: 'run_command',
        toolCallId: '4',
      });
      expect(segments.find((s) => s.type === 'tool-result-error')).toMatchObject({
        toolName: 'run_command',
        toolCallId: '4',
        content: 'permission denied',
      });
    });

    it('emits incremental agent_response text_deltas as text segments', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { output, segments } = collect(handle);

      currentChild?.stdout.write(initLine + '\n');
      currentChild?.stdout.write(
        stepLine({
          step_index: 5,
          state: 'ACTIVE',
          step_type: 'agent_response',
          text_delta: 'Here are the files ',
        }) + '\n',
      );
      currentChild?.stdout.write(
        stepLine({
          step_index: 5,
          state: 'DONE',
          step_type: 'agent_response',
          text_delta: 'in the repo root.\n',
          duration_seconds: 4.43,
          usage: { input_tokens: 5112, output_tokens: 2390 },
        }) + '\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      const text = segments.filter((s) => s.type === 'text');
      expect(text.map((s) => s.content)).toEqual([
        'Here are the files ',
        'in the repo root.\n',
      ]);
      expect(output.join('')).toContain('Here are the files in the repo root.');
    });

    it('ignores structural steps but reports per-turn agent_response usage', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stdout.write(initLine + '\n');
      currentChild?.stdout.write(
        stepLine({ step_index: 0, state: 'DONE', step_type: 'user_input' }) +
          '\n',
      );
      currentChild?.stdout.write(
        stepLine({
          step_index: 1,
          state: 'DONE',
          step_type: 'unknown',
          duration_seconds: 0.0009982,
        }) + '\n',
      );
      currentChild?.stdout.write(
        stepLine({
          step_index: 4,
          state: 'DONE',
          step_type: 'checkpoint',
          usage: { input_tokens: 103, output_tokens: 4 },
        }) + '\n',
      );
      // An agent_response that only produced thinking carries usage but no
      // text_delta — agy never streams reasoning text, so nothing is emitted.
      currentChild?.stdout.write(
        stepLine({
          step_index: 2,
          state: 'DONE',
          step_type: 'agent_response',
          usage: { output_tokens: 168, thinking_tokens: 125 },
        }) + '\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      expect(segments).toEqual([
        expect.objectContaining({ type: 'info', content: expect.stringContaining('telemetry unavailable') }),
        expect.objectContaining({ turnTelemetry: expect.objectContaining({ status: 'unavailable', reason: 'no-usage-event' }) }),
      ]);
    });

    it('reports total usage without inventing zero input or output tokens', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stdout.write(
        stepLine({
          step_index: 2,
          state: 'DONE',
          step_type: 'agent_response',
          usage: { total_tokens: 11867 },
        }) + '\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      expect(segments).toEqual([
        expect.objectContaining({ type: 'info', content: expect.stringContaining('telemetry unavailable') }),
        expect.objectContaining({ turnTelemetry: expect.objectContaining({ status: 'unavailable', reason: 'no-usage-event' }) }),
      ]);
    });

    it('does not emit cumulative result usage or repeat the response', async () => {
      const handle = await adapter.runSdk({ ...baseOptions, model: 'agy-model' });
      const { segments } = collect(handle);

      currentChild?.stdout.write(initLine + '\n');
      currentChild?.stdout.write(
        JSON.stringify({
          event: 'result',
          result: {
            conversation_id: CONV_ID,
            status: 'SUCCESS',
            response: 'Here are the files in the repo root.',
            duration_seconds: 6.72,
            num_turns: 1,
            model: 'agy-billed',
            usage: { input_tokens: 25269, output_tokens: 2562 },
          },
        }) + '\n',
      );
      currentChild?.stdout.write(JSON.stringify({
        event: 'result', result: {
          conversation_id: CONV_ID, status: 'SUCCESS', num_turns: 1,
          usage: { input_tokens: 25269, output_tokens: 2562 },
        },
      }) + '\n');
      currentChild?.emitClose(0);
      await handle.done;

      expect(segments).toEqual([expect.objectContaining({
        turnTelemetry: expect.objectContaining({
          status: 'reported', usage: expect.objectContaining({ turnId: `${CONV_ID}:1`, inputTokens: 25269, outputTokens: 2562, modelId: 'agy-billed' }),
        }),
      })]);
    });

    it('emits an error segment for a non-SUCCESS result', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stdout.write(
        JSON.stringify({
          event: 'result',
          result: {
            conversation_id: CONV_ID,
            status: 'ERROR',
            response: 'model quota exceeded',
          },
        }) + '\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      const errors = segments.filter((s) => s.type === 'error');
      expect(errors[0].content).toBe('ERROR: model quota exceeded');
    });

    it('settles a failed result before the child closes and diagnoses an unknown error shape', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);
      currentChild?.stdout.write(JSON.stringify({ event: 'result', result: { status: 'ERROR', error: 123 } }) + '\n');

      await expect(handle.done).resolves.toBe(1);
      expect(handle.supportsContinuation?.()).toBe(false);
      expect(segments.some((s) => s.type === 'error' && s.content.includes('status ERROR'))).toBe(true);
      expect(segments.some((s) => s.content.includes('Invalid Antigravity stream-json event'))).toBe(false);
      currentChild?.emitClose(3);
    });

    it('logs a redacted failed result and failed steps, and reports the AGY_ERROR exit', async () => {
      const logError = jest.fn();
      const loggedAdapter = new AntigravityCliAdapter(
        undefined,
        async () => true,
        { error: logError } as unknown as Logger,
      );
      const handle = await loggedAdapter.runSdk(baseOptions);
      const { output, segments } = collect(handle);
      currentChild?.stdout.write(stepLine({
        step_index: 1,
        state: 'ERROR',
        status: 'ERROR',
        step_type: 'tool',
        api_key: 'step-secret',
        nested: { cookie: 'nested-cookie-secret', session: 'nested-session-secret' },
      }) + '\n');
      currentChild?.stderr.write('AGY_ERROR: Cookie: header-cookie-secret; token=stderr-secret');
      currentChild?.stderr.write('\n');
      currentChild?.stdout.write(JSON.stringify({
        event: 'result',
        result: {
          conversation_id: CONV_ID,
          status: 'ERROR',
          response: 'retry failed',
          error: { code: 'MODEL_FAILED', message: 'Bearer message-secret failed', secret: 'result-secret' },
          api_key: 'payload-secret',
        },
      }) + '\n');
      await new Promise<void>((resolve) => setImmediate(resolve));
      currentChild?.emitClose(3);
      expect(await handle.done).toBe(1);
      const errors = segments.filter((s) => s.type === 'error').map((s) => s.content);
      expect(errors[0]).toContain('MODEL_FAILED');
      expect(errors[0]).toContain('Bearer [REDACTED] failed');
      expect(errors.join(' ')).toContain('code 3');
      expect(errors.join(' ')).toContain('AGY_ERROR');
      expect(output.join('')).toContain('[Error]');
      expect(logError).toHaveBeenCalledTimes(1);
      const logged = String(logError.mock.calls[0][0]);
      expect(logged).toContain('MODEL_FAILED');
      expect(logged).toContain('errorSteps');
      for (const secret of ['step-secret', 'stderr-secret', 'result-secret', 'payload-secret', 'message-secret', 'nested-cookie-secret', 'nested-session-secret', 'header-cookie-secret']) {
        expect(logged).not.toContain(secret);
        expect(output.join('')).not.toContain(secret);
      }
    });

    it('does not log a SUCCESS result and preserves exit 0', async () => {
      const logError = jest.fn();
      const loggedAdapter = new AntigravityCliAdapter(undefined, async () => true, { error: logError } as unknown as Logger);
      const handle = await loggedAdapter.runSdk(baseOptions);
      const { segments } = collect(handle);
      currentChild?.stdout.write(JSON.stringify({ event: 'result', result: { conversation_id: CONV_ID, status: 'SUCCESS', response: 'OK' } }) + '\n');
      currentChild?.emitClose(0);
      expect(await handle.done).toBe(0);
      expect(segments.some((s) => s.type === 'error')).toBe(false);
      expect(logError).not.toHaveBeenCalled();
    });

    it('accepts a SUCCESS result with error null', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);
      currentChild?.stdout.write(JSON.stringify({ event: 'result', result: { status: 'SUCCESS', error: null } }) + '\n');
      expect(await handle.done).toBe(0);
      expect(segments.some((s) => s.type === 'error')).toBe(false);
      currentChild?.emitClose(0);
    });

    it('keeps a successful final result clear of earlier failure state and warns for AGY_ERROR', async () => {
      const logError = jest.fn();
      const logWarn = jest.fn();
      const loggedAdapter = new AntigravityCliAdapter(undefined, async () => true, { error: logError, warn: logWarn } as unknown as Logger);
      const handle = await loggedAdapter.runSdk(baseOptions);
      const { output } = collect(handle);
      currentChild?.stdout.write(JSON.stringify({ event: 'result', result: { status: 'ERROR' } }) + '\n');
      expect(await handle.done).toBe(1);
      currentChild?.stdout.write(JSON.stringify({ event: 'result', result: { status: 'SUCCESS' } }) + '\n');
      currentChild?.stderr.write('AGY_ERROR: Cookie: private-cookie\n');
      currentChild?.emitClose(0);
      expect(logError).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledTimes(1);
      expect(output.join('')).not.toContain('private-cookie');
      expect(output.join('')).not.toContain('process exited with code 0');
    });

    it('falls back to verbatim text for a line that is not JSON', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { output, segments } = collect(handle);

      currentChild?.stdout.write('Warning: update available\n');
      currentChild?.stdout.write('{"event":"step_update",\n'); // truncated JSON
      currentChild?.emitClose(0);
      await handle.done;

      const text = segments.filter((s) => s.type === 'text');
      expect(text.map((s) => s.content)).toEqual([
        'Warning: update available',
        '{"event":"step_update",',
      ]);
      expect(output.join('')).toContain('Warning: update available');
    });

    it('surfaces an unrecognized event name as info rather than dropping it', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stdout.write(
        JSON.stringify({ event: 'future_event', payload: 1 }) + '\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      expect(segments).toEqual([
        {
          type: 'info',
          content: '{"event":"future_event","payload":1}',
        },
        expect.objectContaining({ turnTelemetry: expect.objectContaining({ status: 'unavailable', reason: 'no-usage-event' }) }),
      ]);
    });

    it('flushes a trailing partial line on close', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stdout.write(
        stepLine({
          step_index: 5,
          state: 'DONE',
          step_type: 'agent_response',
          text_delta: 'Final answer',
        }),
      );
      currentChild?.emitClose(0);
      await handle.done;

      const text = segments.filter((s) => s.type === 'text');
      expect(text).toHaveLength(1);
      expect(text[0].content).toBe('Final answer');
    });

    it('settles an unterminated malformed result as failure even when the process exits zero', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);
      currentChild?.stdout.write(JSON.stringify({ event: 'result' }));
      currentChild?.emitClose(0);
      expect(await handle.done).toBe(1);
      expect(segments.some((s) => s.content.includes('Invalid Antigravity stream-json event'))).toBe(true);
    });

    it('emits an error segment for stderr and a non-zero exit', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stderr.write('fatal: authentication failed\n');
      currentChild?.emitClose(1);
      await handle.done;

      const errors = segments.filter((s) => s.type === 'error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(
        errors.some((e) => e.content.includes('authentication failed')),
      ).toBe(true);
      expect(errors.some((e) => e.content.includes('exited with code 1'))).toBe(
        true,
      );
    });

    it('redacts secrets on stderr lines that are not AGY_ERROR', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { output, segments } = collect(handle);

      currentChild?.stderr.write(
        'HTTP debug Authorization: Bearer super-secret-token api_key=abc123\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      const rendered = output.join('') + segments.map((s) => s.content).join('\n');
      expect(rendered).toContain('[stderr]');
      expect(rendered).toContain('[REDACTED]');
      expect(rendered).not.toContain('super-secret-token');
      expect(rendered).not.toContain('abc123');
    });

    it('emits one exit error when a failed result already reported the failure', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { segments } = collect(handle);

      currentChild?.stdout.write(
        JSON.stringify({
          event: 'result',
          result: { status: 'ERROR', response: 'boom' },
        }) + '\n',
      );
      currentChild?.emitClose(2);
      await handle.done;

      const exitErrors = segments.filter(
        (s) => s.type === 'error' && s.content.includes('exited with code'),
      );
      expect(exitErrors).toHaveLength(1);
      expect(exitErrors[0].content).toContain('code 2');
    });

    it('does not emit an error segment when the user aborts', async () => {
      const handle = await adapter.runSdk(baseOptions);
      const { output, segments } = collect(handle);

      handle.abort.abort();
      currentChild?.emitClose(null, 'SIGTERM');
      await handle.done;

      expect(segments.filter((s) => s.type === 'error')).toEqual([]);
      expect(output.join('')).not.toContain('[Error]');
    });

    it('resolves done with the child exit code', async () => {
      const handle = await adapter.runSdk(baseOptions);
      collect(handle);
      currentChild?.emitClose(0);
      expect(await handle.done).toBe(0);
    });

    it('tree-kills the child process group and resolves 1 on abort', async () => {
      const handle = await adapter.runSdk(baseOptions);
      collect(handle);

      handle.abort.abort();
      currentChild?.emitClose(null, 'SIGTERM');
      const code = await handle.done;

      expect(mockKillProcessTree).toHaveBeenCalledWith(FAKE_PID);
      expect(code).toBe(1);
    });

    it('tree-kills with the pid whenSpawned reports, not the synchronous one', async () => {
      // Off-thread the child is created on a worker, so `pid` is still
      // undefined when abort fires. The tree kill has to read `whenSpawned`
      // instead, or the whole subtree is orphaned (TASK_2026_367).
      const OFF_THREAD_PID = 7777;
      mockSpawnCli.mockImplementationOnce(() => {
        currentChild = createFakeChild();
        const child = currentChild.child as unknown as {
          pid: number | undefined;
          whenSpawned: Promise<number | null>;
        };
        child.pid = undefined;
        child.whenSpawned = Promise.resolve(OFF_THREAD_PID);
        return currentChild.child;
      });

      const handle = await adapter.runSdk(baseOptions);
      collect(handle);

      handle.abort.abort();
      currentChild?.emitClose(null, 'SIGTERM');
      await handle.done;

      expect(mockKillProcessTree).toHaveBeenCalledWith(OFF_THREAD_PID);
    });
  });

  describe('runSdk() — session id capture', () => {
    const CONV_ID = '917bf234-79d8-496b-88b0-c3d7e376d066';

    it('captures the conversation id from the init event, mid-run', async () => {
      const handle = await adapter.runSdk({
        task: 'X',
        workingDirectory: '/proj',
      });
      collect(handle);

      currentChild?.stdout.write(
        JSON.stringify({
          event: 'init',
          conversation_id: CONV_ID,
          init: { cwd: '/proj', tools: [], permission_mode: 'always-proceed' },
        }) + '\n',
      );
      // Available before the process exits — no post-run mtime scan.
      expect(handle.getSessionId?.()).toBe(CONV_ID);

      currentChild?.emitClose(0);
      await handle.done;
      expect(handle.getSessionId?.()).toBe(CONV_ID);
    });

    it('falls back to the id on a step_update when init was missed', async () => {
      const handle = await adapter.runSdk({
        task: 'X',
        workingDirectory: '/proj',
      });
      collect(handle);

      currentChild?.stdout.write(
        JSON.stringify({
          event: 'step_update',
          step_update: {
            conversation_id: CONV_ID,
            step_index: 0,
            state: 'DONE',
            step_type: 'user_input',
          },
        }) + '\n',
      );
      currentChild?.emitClose(0);
      await handle.done;

      expect(handle.getSessionId?.()).toBe(CONV_ID);
    });

    it('returns undefined when the stream carried no conversation id', async () => {
      const handle = await adapter.runSdk({
        task: 'X',
        workingDirectory: '/proj',
      });
      collect(handle);
      currentChild?.emitClose(0);
      await handle.done;

      expect(handle.getSessionId?.()).toBeUndefined();
    });
  });

  describe('capabilities() / parseOutput()', () => {
    it('reports continuation after the capability probe succeeds', async () => {
      const handle = await adapter.runSdk({
        task: 'X',
        workingDirectory: '/proj',
      });
      expect(adapter.capabilities().messaging.continuation.state).toBe('supported');
      currentChild?.emitClose(0);
      await handle.done;
    });

    it('keeps the one-shot path and unsupported capability when --input-format is absent', async () => {
      const legacy = new AntigravityCliAdapter(undefined, async () => false);
      const handle = await legacy.runSdk({
        task: 'legacy',
        workingDirectory: '/proj',
      });
      const [, argsArg] = runSpawnCalls()[0] as [string, string[]];

      expect(argsArg).not.toContain('--input-format');
      expect(argsArg.slice(-2)).toEqual([
        '--print',
        buildTaskPrompt(
          { task: 'legacy', workingDirectory: '/proj' },
          'antigravity',
        ),
      ]);
      expect(handle.continue).toBeUndefined();
      expect(legacy.capabilities().messaging.continuation.state).toBe('unsupported');
      expect(currentChild?.child.stdin.end).toHaveBeenCalledTimes(1);

      currentChild?.emitClose(0);
      await handle.done;
    });

    it('strips ANSI escape codes', () => {
      expect(adapter.parseOutput('\x1b[32mok\x1b[0m')).toBe('ok');
    });
  });
});

describe('agyModelId', () => {
  const live = new Set([
    'claude-sonnet-5-5',
    'claude-sonnet-5-5-low',
    'claude-sonnet-5-5-high',
    'claude-opus-5-5-low',
    'claude-opus-5-5-high',
  ]);

  it('prefers the chosen effort, then the unsuffixed base', () => {
    expect(agyModelId('claude-sonnet-4-6-high', live)).toBe('claude-sonnet-5-5-high');
    expect(agyModelId('claude-sonnet-4-6', live, undefined, 'low')).toBe('claude-sonnet-5-5-low');
    expect(agyModelId('claude-sonnet-4-6', live)).toBe('claude-sonnet-5-5');
    // `medium` is not live for this base: the bare base wins over the effort.
    expect(agyModelId('claude-sonnet-4-6-medium', live)).toBe('claude-sonnet-5-5');
  });

  it('falls back to a listed effort variant when the bare base is not live', () => {
    expect(agyModelId('claude-opus-4-8', live)).toBe('claude-opus-5-5-high');
    expect(agyModelId('claude-opus-4-8-medium', live)).toBe('claude-opus-5-5-high');
  });

  it('never derives an id the live list does not hold', () => {
    for (const saved of ['claude-sonnet-4-6', 'claude-opus-4-8-xhigh', 'claude-sonnet-1-0-max']) {
      expect(live.has(agyModelId(saved, live))).toBe(true);
    }
    // No close base: the saved id passes unchanged (agy reports it).
    expect(agyModelId('glm-5', live)).toBe('glm-5');
  });
});
