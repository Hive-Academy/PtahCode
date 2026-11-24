/**
 * AntigravityCliAdapter Unit Tests
 *
 * The adapter is ACP-only: its lanes are covered by
 * `antigravity-cli.adapter.acp.spec.ts` (fake ACP transport). This spec
 * covers what needs no lane: detect() (installed/not, version, no `--help`
 * read), capabilities(), listModels() parsing of `agy models`, parseOutput()
 * and agyModelId(). It mocks cli-adapter.utils (spawnCli / resolveCliPath /
 * probeCliVersion) and fs, so no real `agy` process or disk write happens.
 */
// Imported first, like the other specs in this lib whose imports may load
// tsyringe decorators.
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
 * stderr). The ACP lane derives its `model` option from these ids.
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
 * What an `agy models` spawn prints; `undefined` routes the probe to
 * `currentChild` like any other spawn (the listModels specs drive it).
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
import { antigravityAcpManifest } from './antigravity-acp-lane';

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
    adapter = new AntigravityCliAdapter();
  });

  describe('detect()', () => {
    it('reports installed when resolveCliPath finds the binary', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      mockProbeCliVersion.mockResolvedValue('agy 1.1.3');

      const result = await adapter.detect();
      expect(result.cli).toBe('antigravity');
      expect(result.installed).toBe(true);
      expect(result.path).toBe('/usr/local/bin/agy');
      expect(result.version).toBe('agy 1.1.3');
      expect(result.messagingMode).toBe('interrupt');
    });

    it('reports NOT installed when resolveCliPath returns null', async () => {
      mockResolveCliPath.mockResolvedValue(null);
      const result = await adapter.detect();
      expect(result.installed).toBe(false);
    });

    it('reads the version only: no --help spawn at detection', async () => {
      mockResolveCliPath.mockResolvedValue('/usr/local/bin/agy');
      mockProbeCliVersion.mockResolvedValue('agy 1.5.14');
      await expect(adapter.detect()).resolves.toMatchObject({ installed: true });
      expect(mockProbeCliVersion).toHaveBeenCalledTimes(1);
      expect(mockSpawnCli).not.toHaveBeenCalled();
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

  describe('capabilities() / parseOutput()', () => {
    it('declares the ACP manifest on a fresh adapter, with no probe', () => {
      expect(new AntigravityCliAdapter().capabilities()).toEqual(
        antigravityAcpManifest('task-prompt'),
      );
      expect(mockProbeCliVersion).not.toHaveBeenCalled();
      expect(mockSpawnCli).not.toHaveBeenCalled();
    });

    it('strips ANSI escape codes', () => {
      expect(adapter.parseOutput('\x1b[32mok\x1b[0m')).toBe('ok');
    });

    it('serves a stopped lane its thought levels, none for a model with an effort suffix', () => {
      expect(adapter.laneEfforts('gemini-3-pro')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
      expect(adapter.laneEfforts('gemini-3-pro-high')).toEqual([]);
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
