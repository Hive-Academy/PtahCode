/**
 * Unit and native integration tests for `createGlobFileWatcher`,
 * `createRecursiveFileWatcher`, `shouldUseRecursiveWatch`, `watcherModeFor`,
 * and `classifyWatchBurst`.
 *
 * All unit cases inject `platform` and `fsWatch` so the recursive path and the
 * chokidar path both execute deterministically on Linux CI and on Windows.
 * Real-filesystem `fs.watch({ recursive: true })` cases run on `win32`/`darwin`
 * and are skipped elsewhere.
 */

import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { IFileWatcher } from '../types/platform.types';
import { planGlobWatch } from './glob-watch-plan';
import {
  COALESCE_MS,
  createGlobFileWatcher,
  createRecursiveFileWatcher,
  shouldUseRecursiveWatch,
  watcherModeFor,
  type FsWatchFn,
  type FsWatchListener,
  type GlobFileWatcherOptions,
  type WatcherLogger,
} from './recursive-file-watcher';
import {
  classifyWatchBurst,
  type WatchedPathState,
} from './recursive-watch-events';

const ROOT = path.resolve('/ws');
const SPECS = path.join(ROOT, '.ptah', 'specs');
const specPath = (...segments: string[]): string =>
  path.join(SPECS, ...segments);

const stubWatcher: IFileWatcher = {
  onDidChange: () => ({ dispose: () => undefined }),
  onDidCreate: () => ({ dispose: () => undefined }),
  onDidDelete: () => ({ dispose: () => undefined }),
  dispose: () => undefined,
};

interface Harness {
  emit(
    eventType: string,
    filename: string | Buffer | null | undefined,
  ): void;
  fail(error: Error): void;
  fsWatch: jest.Mock<ReturnType<FsWatchFn>, Parameters<FsWatchFn>>;
  fallback: jest.Mock<IFileWatcher, [ReturnType<typeof planGlobWatch>]>;
  close: jest.Mock<void, []>;
  states: Map<string, WatchedPathState>;
  statCalls: string[];
  logger: WatcherLogger & { debug: jest.Mock; warn: jest.Mock };
  events: { kind: 'create' | 'change' | 'delete'; path: string }[];
  watcher: IFileWatcher;
}

function setup(
  pattern = '.ptah/specs/**',
  overrides: Partial<GlobFileWatcherOptions> & {
    fsWatchThrows?: Error;
    closeThrows?: Error;
  } = {},
): Harness {
  let listener: FsWatchListener = () => undefined;
  let errorListener: (error: Error) => void = () => undefined;
  const close = jest.fn<void, []>(() => {
    if (overrides.closeThrows) throw overrides.closeThrows;
  });
  const fsWatch = jest.fn<ReturnType<FsWatchFn>, Parameters<FsWatchFn>>(
    (_target, _options, onEvent) => {
      if (overrides.fsWatchThrows) throw overrides.fsWatchThrows;
      listener = onEvent;
      return {
        close,
        on: (_event, onError) => {
          errorListener = onError;
        },
      };
    },
  );
  const fallback = jest.fn<IFileWatcher, [ReturnType<typeof planGlobWatch>]>(
    () => stubWatcher,
  );
  const states = new Map<string, WatchedPathState>();
  const statCalls: string[] = [];
  const logger = { debug: jest.fn(), warn: jest.fn() };

  const watcher = createGlobFileWatcher(
    pattern,
    {
      cwd: ROOT,
      exists: overrides.exists ?? (() => true),
      platform: overrides.platform ?? 'win32',
      fsWatch: overrides.fsWatch ?? fsWatch,
      stat:
        overrides.stat ??
        (async (target: string): Promise<WatchedPathState> => {
          statCalls.push(target);
          return states.get(target) ?? 'missing';
        }),
      getLogger:
        'getLogger' in overrides ? overrides.getLogger : () => logger,
      coalesceMs: overrides.coalesceMs,
      exclude: overrides.exclude,
    },
    fallback,
  );

  const events: { kind: 'create' | 'change' | 'delete'; path: string }[] = [];
  watcher.onDidCreate((p) => events.push({ kind: 'create', path: p }));
  watcher.onDidChange((p) => events.push({ kind: 'change', path: p }));
  watcher.onDidDelete((p) => events.push({ kind: 'delete', path: p }));

  return {
    emit: (eventType, filename) => listener(eventType, filename),
    fail: (error) => errorListener(error),
    fsWatch,
    fallback,
    close,
    states,
    statCalls,
    logger,
    events,
    watcher,
  };
}

const flushBurst = async (ms = COALESCE_MS): Promise<void> => {
  jest.advanceTimersByTime(ms + 1);
  await Promise.resolve();
  await Promise.resolve();
};

describe('platform selection (shouldUseRecursiveWatch / watcherModeFor)', () => {
  it.each([
    ['win32', true, 'recursive'],
    ['darwin', true, 'recursive'],
    ['linux', false, 'chokidar'],
    ['freebsd', false, 'chokidar'],
  ] as const)('%s -> recursive=%s (%s)', (platform, expectedBool, mode) => {
    expect(shouldUseRecursiveWatch(platform)).toBe(expectedBool);
    expect(watcherModeFor(platform)).toBe(mode);
  });

  it('uses chokidar fallback on linux and never calls fsWatch', () => {
    const h = setup('.ptah/specs/**', { platform: 'linux' });
    expect(h.watcher).toBe(stubWatcher);
    expect(h.fallback).toHaveBeenCalledTimes(1);
    expect(h.fsWatch).not.toHaveBeenCalled();
    expect(h.logger.debug).toHaveBeenCalledWith(
      '[file-watcher] created',
      expect.objectContaining({
        root: SPECS,
        mode: 'chokidar',
        durationMs: expect.any(Number),
      }),
    );
    const loggedMeta = h.logger.debug.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(loggedMeta['handles']).toBeUndefined();
  });

  it.each(['win32', 'darwin'] as const)(
    'uses one recursive fs.watch handle on %s and skips chokidar fallback',
    (platform) => {
      const h = setup('.ptah/specs/**', { platform });
      expect(h.fsWatch).toHaveBeenCalledTimes(1);
      expect(h.fsWatch).toHaveBeenCalledWith(
        SPECS,
        { recursive: true, persistent: true },
        expect.any(Function),
      );
      expect(h.fallback).not.toHaveBeenCalled();
      h.watcher.dispose();
    },
  );
});

describe('createGlobFileWatcher / createRecursiveFileWatcher', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens O(1) ONE fs.watch handle for a tree of 2,000 files and emits no initial scan events', async () => {
    const h = setup();
    for (let i = 0; i < 2000; i++) {
      h.states.set(specPath(`TASK_${i}`, 'task.md'), 'file');
    }
    expect(h.fsWatch).toHaveBeenCalledTimes(1);
    await flushBurst();
    expect(h.events).toEqual([]);
    expect(h.statCalls).toEqual([]);
    h.watcher.dispose();
  });

  it('maps rename+file to create, change+file and rename+known-file to change, and missing to delete with path.resolve paths', async () => {
    const h = setup();
    const created = specPath('T1', 'task.md');
    const preExisting = specPath('T0', 'task.md');
    h.states.set(created, 'file');
    h.states.set(preExisting, 'file');

    // New file created -> rename + stat 'file' -> onDidCreate
    h.emit('rename', path.join('T1', 'task.md'));
    await flushBurst();

    // Known file modified -> change -> onDidChange
    h.emit('change', path.join('T1', 'task.md'));
    await flushBurst();

    // Known file overwritten via rename -> onDidChange
    h.emit('rename', path.join('T1', 'task.md'));
    await flushBurst();

    // Pre-existing file modified in place (unseen before start) -> onDidChange
    h.emit('change', Buffer.from(path.join('T0', 'task.md')));
    await flushBurst();

    // File deleted -> missing -> onDidDelete
    h.states.delete(created);
    h.emit('rename', path.join('T1', 'task.md'));
    await flushBurst();

    // Pre-existing unseen file deleted directly -> missing -> onDidDelete
    const unseenDeleted = specPath('T9', 'old.md');
    h.emit('rename', path.join('T9', 'old.md'));
    await flushBurst();

    expect(h.events).toEqual([
      { kind: 'create', path: path.resolve(created) },
      { kind: 'change', path: path.resolve(created) },
      { kind: 'change', path: path.resolve(created) },
      { kind: 'change', path: path.resolve(preExisting) },
      { kind: 'delete', path: path.resolve(created) },
      { kind: 'delete', path: path.resolve(unseenDeleted) },
    ]);
    h.watcher.dispose();
  });

  it('ignores directories and null, undefined, or empty filenames', async () => {
    const h = setup();
    h.states.set(specPath('T1'), 'directory');
    h.emit('rename', 'T1');
    h.emit('change', null);
    h.emit('rename', undefined);
    h.emit('change', '');
    await flushBurst();
    expect(h.events).toEqual([]);
    h.watcher.dispose();
  });

  it('coalesces duplicate events per path into one stat and one event, using unref timers', async () => {
    const unrefCalls: number[] = [];
    const realSetTimeout = global.setTimeout;
    const timeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((...args: Parameters<typeof setTimeout>) => {
        const timer = realSetTimeout(...args);
        const origUnref = timer.unref.bind(timer);
        timer.unref = () => {
          unrefCalls.push(1);
          return origUnref();
        };
        return timer;
      }) as typeof setTimeout);

    try {
      const h = setup();
      const file = specPath('T1', 'task.md');
      h.states.set(file, 'file');

      h.emit('change', 'T1/task.md');
      h.emit('change', 'T1/task.md');
      h.emit('rename', 'T1/task.md');
      await flushBurst();

      expect(unrefCalls).toHaveLength(1);
      expect(h.statCalls).toEqual([file]);
      expect(h.events).toEqual([{ kind: 'create', path: file }]);
      h.watcher.dispose();
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('normalizes Windows backslash separators and applies plan.ignores and plan.matches', async () => {
    const h = setup('**/*.md', {
      // Watch from ROOT, excluding node_modules (both dir name and glob).
      exists: (candidate) => path.resolve(candidate) === ROOT,
      exclude: ['node_modules', '**/ignored/**'],
    });
    const wanted = path.join(ROOT, 'docs', 'sub', 'guide.md');
    const excludedNodeModules = path.join(
      ROOT,
      'node_modules',
      'pkg',
      'README.md',
    );
    const excludedGlob = path.join(ROOT, 'docs', 'ignored', 'skip.md');
    const nonMatchingExt = path.join(ROOT, 'docs', 'sub', 'script.ts');

    h.states.set(wanted, 'file');
    h.states.set(excludedNodeModules, 'file');
    h.states.set(excludedGlob, 'file');
    h.states.set(nonMatchingExt, 'file');

    // Literal Windows backslashes — exercises normalization even on Linux CI.
    h.emit('rename', '\\docs\\sub\\guide.md');
    h.emit('rename', 'node_modules\\pkg\\README.md');
    h.emit('rename', 'docs\\ignored\\skip.md');
    h.emit('rename', 'docs\\sub\\script.ts');
    await flushBurst();

    // A non-matching rename is stat-ed once (it may be a directory) but never emits.
    expect(h.statCalls).toEqual([wanted, nonMatchingExt]);
    expect(h.events).toEqual([{ kind: 'create', path: wanted }]);
    h.watcher.dispose();
  });

  it('prunes unrelated workspace branches when watchRoot walked up above a not-yet-created target dir', async () => {
    // .ptah/specs does not exist at start -> planGlobWatch walks up to ROOT.
    const h = setup('.ptah/specs/**', {
      exists: (candidate) => path.resolve(candidate) === ROOT,
    });
    expect(h.fsWatch).toHaveBeenCalledWith(
      ROOT,
      { recursive: true, persistent: true },
      expect.any(Function),
    );

    const unrelated = path.join(ROOT, 'src', 'app.ts');
    const createdSpec = specPath('TASK_1', 'task.md');
    h.states.set(unrelated, 'file');
    h.states.set(createdSpec, 'file');

    h.emit('change', 'src\\app.ts');
    h.emit('rename', '.ptah\\specs\\TASK_1\\task.md');
    await flushBurst();

    expect(h.statCalls).toEqual([createdSpec]);
    expect(h.events).toEqual([{ kind: 'create', path: createdSpec }]);
    h.watcher.dispose();
  });

  it('yields ONE event for the final path on an atomic write (temp file -> rename onto final)', async () => {
    const h = setup('**/*.md', {
      exists: (candidate) => path.resolve(candidate) === ROOT,
    });
    const finalPath = path.join(ROOT, '.ptah', 'specs', 'T1', 'task.md');
    h.states.set(finalPath, 'file');

    // 1) Initial atomic creation: temp written (.tmp ignored by *.md) then renamed onto task.md
    h.emit('rename', '.ptah\\specs\\T1\\task.md.tmp');
    h.emit('rename', '.ptah\\specs\\T1\\task.md');
    h.emit('change', '.ptah\\specs\\T1\\task.md');
    await flushBurst();

    expect(h.events).toEqual([{ kind: 'create', path: finalPath }]);

    // 2) Subsequent atomic overwrite of the already-known finalPath -> ONE change event
    h.events.length = 0;
    h.emit('rename', '.ptah\\specs\\T1\\task.md.tmp');
    h.emit('rename', '.ptah\\specs\\T1\\task.md');
    h.emit('rename', '.ptah\\specs\\T1\\task.md');
    h.emit('change', '.ptah\\specs\\T1\\task.md');
    await flushBurst();

    expect(h.events).toEqual([{ kind: 'change', path: finalPath }]);
    h.watcher.dispose();
  });

  it('returns a safe no-op watcher and logs warn once when root is missing at start', () => {
    const enoent = Object.assign(new Error('ENOENT: no such file'), {
      code: 'ENOENT',
    });
    const h = setup('.ptah/specs/**', { fsWatchThrows: enoent });

    expect(h.logger.warn).toHaveBeenCalledTimes(1);
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[file-watcher] watch unavailable, no-op watcher',
      expect.objectContaining({ root: SPECS }),
    );
    expect(h.logger.debug).toHaveBeenCalledWith(
      '[file-watcher] created',
      expect.objectContaining({ root: SPECS, mode: 'recursive', handles: 0 }),
    );
    expect(() => h.watcher.dispose()).not.toThrow();
    expect(() => h.watcher.dispose()).not.toThrow();
    expect(h.close).not.toHaveBeenCalled();
  });

  it('closes handle, clears pending timers, and logs warn without throwing on watcher error (Windows EPERM)', async () => {
    const h = setup();
    const file = specPath('T1', 'task.md');
    h.states.set(file, 'file');
    h.emit('rename', 'T1\\task.md');
    expect(jest.getTimerCount()).toBe(1);

    expect(() =>
      h.fail(Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })),
    ).not.toThrow();
    // Duplicate error is ignored once closed.
    expect(() => h.fail(new Error('EPERM'))).not.toThrow();

    expect(jest.getTimerCount()).toBe(0);
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.logger.warn).toHaveBeenCalledTimes(1);

    await flushBurst();
    expect(h.events).toEqual([]);

    // Subsequent dispose is a safe no-op.
    h.watcher.dispose();
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('swallows and logs handle.close() failure without throwing', () => {
    const h = setup('.ptah/specs/**', { closeThrows: new Error('EBADF') });
    expect(() => h.watcher.dispose()).not.toThrow();
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[file-watcher] close failed',
      expect.objectContaining({ root: SPECS }),
    );
  });

  it('dispose is idempotent, clears timers, and suppresses both queued and in-flight events', async () => {
    let resolveStat: ((state: WatchedPathState) => void) | undefined;
    const h = setup('.ptah/specs/**', {
      stat: () =>
        new Promise<WatchedPathState>((resolve) => {
          resolveStat = resolve;
        }),
    });

    // Trigger one burst and advance timer so async stat() is in flight.
    h.emit('rename', 'T1\\in-flight.md');
    jest.advanceTimersByTime(COALESCE_MS + 1);
    expect(resolveStat).toBeDefined();

    // Queue a second burst whose timer has not fired yet.
    h.emit('rename', 'T1\\queued.md');
    expect(jest.getTimerCount()).toBe(1);

    h.watcher.dispose();
    h.watcher.dispose();
    expect(jest.getTimerCount()).toBe(0);
    expect(h.close).toHaveBeenCalledTimes(1);

    // Finish in-flight stat AFTER dispose -> must emit nothing.
    resolveStat?.('file');
    await Promise.resolve();
    await Promise.resolve();

    // Emit another raw event AFTER dispose -> must emit nothing.
    h.emit('change', 'T1\\after.md');
    await flushBurst();

    expect(h.events).toEqual([]);
  });

  it('logs creation timing via lazy getLogger and stays silent when getLogger is omitted or returns undefined', () => {
    // Default (no logger): no throw, no console usage.
    const consoleDebug = jest.spyOn(console, 'debug').mockImplementation();
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    try {
      const noLogger = setup('.ptah/specs/**', { getLogger: undefined });
      noLogger.watcher.dispose();
      const undefLogger = setup('.ptah/specs/**', {
        getLogger: () => undefined,
      });
      undefLogger.watcher.dispose();
      expect(consoleDebug).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleDebug.mockRestore();
      consoleWarn.mockRestore();
    }

    // Lazy getter: logger registered after options creation is still invoked on error.
    const late: {
      logger?: WatcherLogger & { debug: jest.Mock; warn: jest.Mock };
    } = {};
    const h = setup('.ptah/specs/**', { getLogger: () => late.logger });
    expect(late.logger).toBeUndefined();
    const lateLogger = { debug: jest.fn(), warn: jest.fn() };
    late.logger = lateLogger;
    h.fail(new Error('EPERM'));
    expect(lateLogger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('defaultStat async-only guarantee', () => {
  it('uses async fs.promises.stat and never calls sync statSync or lstatSync', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ptah-rw-stat-'));
    const filePath = path.join(tmpDir, 'item.md');
    await fsp.writeFile(filePath, 'hello');

    let emitRaw: FsWatchListener = () => undefined;

    const plan = planGlobWatch('**/*.md', {
      cwd: tmpDir,
      exists: () => true,
    });
    const watcher = createRecursiveFileWatcher({
      plan,
      coalesceMs: 5,
      fsWatch: (_target, _opts, listener) => {
        emitRaw = listener;
        return { close: () => undefined, on: () => undefined };
      },
    });
    const created: string[] = [];
    const deleted: string[] = [];
    watcher.onDidCreate((p) => created.push(p));
    watcher.onDidDelete((p) => deleted.push(p));

    try {
      emitRaw('rename', 'item.md');
      await new Promise((r) => setTimeout(r, 40));
      expect(created).toEqual([path.resolve(filePath)]);

      await fsp.rm(filePath);
      emitRaw('rename', 'item.md');
      await new Promise((r) => setTimeout(r, 40));
      expect(deleted).toEqual([path.resolve(filePath)]);

      // The helper source must not use the blocking sync stat calls.
      const source = await fsp.readFile(
        path.join(__dirname, 'recursive-file-watcher.ts'),
        'utf-8',
      );
      expect(source).not.toMatch(/\b(statSync|lstatSync)\b/);
    } finally {
      watcher.dispose();
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('moved-in directories and stale stat results', () => {
  it('emits created for matching files inside a moved-in directory, skipping ignored ones', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ptah-rw-dir-'));
    const moved = path.join(tmpDir, 'TASK_1');
    await fsp.mkdir(path.join(moved, 'sub'), { recursive: true });
    await fsp.mkdir(path.join(moved, 'node_modules'), { recursive: true });
    await fsp.writeFile(path.join(moved, 'task.md'), 'a');
    await fsp.writeFile(path.join(moved, 'sub', 'deep.md'), 'b');
    await fsp.writeFile(path.join(moved, 'notes.txt'), 'c');
    await fsp.writeFile(path.join(moved, 'node_modules', 'skip.md'), 'd');

    let emitRaw: FsWatchListener = () => undefined;
    const plan = planGlobWatch('**/*.md', {
      cwd: tmpDir,
      exists: () => true,
      exclude: ['**/node_modules', '**/node_modules/**'],
    });
    const watcher = createRecursiveFileWatcher({
      plan,
      coalesceMs: 5,
      fsWatch: (_target, _opts, listener) => {
        emitRaw = listener;
        return { close: () => undefined, on: () => undefined };
      },
    });
    const created: string[] = [];
    watcher.onDidCreate((p) => created.push(p));

    try {
      // Windows and macOS report only the directory itself on a move.
      emitRaw('rename', 'TASK_1');
      await new Promise((r) => setTimeout(r, 80));
      expect(created.sort()).toEqual(
        [
          path.join(moved, 'task.md'),
          path.join(moved, 'sub', 'deep.md'),
        ].sort(),
      );
    } finally {
      watcher.dispose();
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('drops an older stat result that finishes after a newer one', async () => {
    const resolvers: Array<(state: WatchedPathState) => void> = [];
    const stat = (): Promise<WatchedPathState> =>
      new Promise((resolve) => resolvers.push(resolve));
    let emitRaw: FsWatchListener = () => undefined;
    const plan = planGlobWatch('**/*.md', {
      cwd: path.resolve('stale-root'),
      exists: () => true,
    });
    const watcher = createRecursiveFileWatcher({
      plan,
      coalesceMs: 5,
      stat,
      fsWatch: (_target, _opts, listener) => {
        emitRaw = listener;
        return { close: () => undefined, on: () => undefined };
      },
    });
    const events: string[] = [];
    watcher.onDidChange(() => events.push('changed'));
    watcher.onDidCreate(() => events.push('created'));
    watcher.onDidDelete(() => events.push('deleted'));

    try {
      emitRaw('change', 'a.md');
      await new Promise((r) => setTimeout(r, 30));
      emitRaw('rename', 'a.md');
      await new Promise((r) => setTimeout(r, 30));
      expect(resolvers).toHaveLength(2);
      resolvers[1]('missing');
      await new Promise((r) => setTimeout(r, 10));
      resolvers[0]('file');
      await new Promise((r) => setTimeout(r, 10));
      expect(events).toEqual(['deleted']);
    } finally {
      watcher.dispose();
    }
  });
});

describe('classifyWatchBurst', () => {
  it.each([
    [{ sawRename: true, state: 'directory', known: false }, null],
    [{ sawRename: false, state: 'directory', known: true }, null],
    [{ sawRename: true, state: 'missing', known: true }, 'deleted'],
    [{ sawRename: false, state: 'missing', known: false }, 'deleted'],
    [{ sawRename: true, state: 'file', known: false }, 'created'],
    [{ sawRename: true, state: 'file', known: true }, 'changed'],
    [{ sawRename: false, state: 'file', known: false }, 'changed'],
    [{ sawRename: false, state: 'file', known: true }, 'changed'],
  ] as const)('%o -> %s', (burst, expected) => {
    expect(classifyWatchBurst(burst)).toBe(expected);
  });
});

// Real native recursive fs.watch runs on Windows and macOS; skipped on Linux CI.
const describeNative = shouldUseRecursiveWatch(process.platform)
  ? describe
  : describe.skip;

describeNative('createRecursiveFileWatcher (real native fs.watch)', () => {
  const waitFor = async (predicate: () => boolean, timeoutMs = 4000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  it('delivers create, atomic-rename overwrite, and delete through one native handle', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ptah-rw-native-'));
    const plan = planGlobWatch('**/*.md', { cwd: dir });
    const watcher = createRecursiveFileWatcher({ plan });
    const events: { kind: string; path: string }[] = [];
    watcher.onDidCreate((p) => events.push({ kind: 'create', path: p }));
    watcher.onDidChange((p) => events.push({ kind: 'change', path: p }));
    watcher.onDidDelete((p) => events.push({ kind: 'delete', path: p }));

    try {
      await new Promise((r) => setTimeout(r, 40));
      const subDir = path.join(dir, 'TASK_1');
      await fsp.mkdir(subDir, { recursive: true });
      const target = path.resolve(subDir, 'task.md');
      await fsp.writeFile(target, 'v1');
      await waitFor(() =>
        events.some((e) => e.kind === 'create' && e.path === target),
      );
      await new Promise((r) => setTimeout(r, COALESCE_MS * 2));
      // The OS may add one trailing `change` for the data write (chokidar did too).
      const first = events.filter((e) => e.path === target);
      expect(first[0]).toEqual({ kind: 'create', path: target });
      expect(first.filter((e) => e.kind === 'create')).toHaveLength(1);
      expect(first.some((e) => e.kind === 'delete')).toBe(false);

      // Atomic write: temp (.tmp ignored by **/*.md) renamed onto target -> ONE change
      events.length = 0;
      const tmp = path.join(subDir, 'task.md.tmp');
      await fsp.writeFile(tmp, 'v2');
      await fsp.rename(tmp, target);
      await waitFor(() =>
        events.some((e) => e.kind === 'change' && e.path === target),
      );
      await new Promise((r) => setTimeout(r, COALESCE_MS * 2));
      expect(events.filter((e) => e.path === target)).toEqual([
        { kind: 'change', path: target },
      ]);

      // Delete
      events.length = 0;
      await fsp.rm(target);
      await waitFor(() =>
        events.some((e) => e.kind === 'delete' && e.path === target),
      );
      expect(events.filter((e) => e.path === target)).toEqual([
        { kind: 'delete', path: target },
      ]);
    } finally {
      watcher.dispose();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('handles a non-existent root directory without throwing', () => {
    const missingRoot = path.join(
      os.tmpdir(),
      `ptah-rw-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const warn = jest.fn();
    const watcher = createGlobFileWatcher(
      '**/*',
      {
        cwd: missingRoot,
        platform: process.platform,
        getLogger: () => ({ debug: jest.fn(), warn }),
      },
      () => stubWatcher,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => watcher.dispose()).not.toThrow();
  });
});
