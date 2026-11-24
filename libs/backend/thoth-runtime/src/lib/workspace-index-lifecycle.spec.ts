import type { Stats } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import { posix } from 'node:path';
import type {
  WorkspaceChangeBatch,
  WorkspaceChangeListener,
} from '@ptah-extension/platform-core';
import { CODE_INDEX_EXCLUDES } from '@ptah-extension/workspace-intelligence';

import {
  WorkspaceIndexLifecycleService,
  workspaceSymbolIndexFrom,
  type WorkspaceSymbolIndex,
} from './workspace-index-lifecycle';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  access: jest.fn(jest.requireActual('node:fs/promises').access),
  readdir: jest.fn(jest.requireActual('node:fs/promises').readdir),
  stat: jest.fn(jest.requireActual('node:fs/promises').stat),
}));

const readDirectoryNames: (path: string) => Promise<string[]> = readdir;
const statTwin: (path: string) => Promise<Stats> = stat;

interface Release {
  resolve: () => void;
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function makeIndexer(): WorkspaceSymbolIndex & {
  indexWorkspace: jest.Mock;
  reindexFile: jest.Mock;
  deleteFileSymbols: jest.Mock;
  releases: Release[];
} {
  const releases: Release[] = [];
  const indexer = {
    releases,
    indexWorkspace: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push({ resolve });
        }),
    ),
    reindexFile: jest.fn().mockResolvedValue(undefined),
    deleteFileSymbols: jest.fn().mockReturnValue(1),
  };
  return indexer;
}

function makeWatcher() {
  let listener: WorkspaceChangeListener | undefined;
  const dispose = jest.fn();
  const watch = jest.fn(
    (_root: string, _options: unknown, next: WorkspaceChangeListener) => {
      listener = next;
      return { dispose };
    },
  );
  return {
    watch,
    dispose,
    emit(
      batch: Partial<WorkspaceChangeBatch> &
        Pick<WorkspaceChangeBatch, 'changes'>,
    ): void {
      listener?.({
        root: '/ws',
        overflow: false,
        truncated: false,
        droppedCount: 0,
        ...batch,
      });
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

/** Deep enough for a batch's twin probes, which chain several awaits. */
async function flushProbes(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

function batchPaths(
  paths: readonly string[],
  kind: 'create' | 'update' | 'delete' = 'update',
) {
  return paths.map((path) => ({ path, kind }));
}

describe('WorkspaceIndexLifecycleService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // No test path exists on disk. A mocked rejection settles in microtasks,
    // where a real probe would wait on I/O that fake timers do not drive.
    jest.mocked(access).mockRejectedValue(new Error('absent'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest
      .mocked(access)
      .mockReset()
      .mockImplementation(jest.requireActual('node:fs/promises').access);
    jest
      .mocked(readDirectoryNames)
      .mockReset()
      .mockImplementation(jest.requireActual('node:fs/promises').readdir);
    jest
      .mocked(statTwin)
      .mockReset()
      .mockImplementation(jest.requireActual('node:fs/promises').stat);
  });

  function start(opts?: {
    indexer?: ReturnType<typeof makeIndexer>;
    watcher?: ReturnType<typeof makeWatcher>;
    onError?: jest.Mock;
    stormThreshold?: number;
    debounceMs?: number;
    workspaceRoot?: string;
    databasePath?: string;
  }) {
    const indexer = opts?.indexer ?? makeIndexer();
    const watcher = opts?.watcher ?? makeWatcher();
    const onError = opts?.onError ?? jest.fn();
    const service = new WorkspaceIndexLifecycleService({
      indexer,
      watcher,
      workspaceRoot: opts?.workspaceRoot ?? '/ws',
      onError,
      ...(opts?.stormThreshold !== undefined
        ? { stormThreshold: opts.stormThreshold }
        : {}),
      ...(opts?.debounceMs !== undefined
        ? { debounceMs: opts.debounceMs }
        : {}),
      ...(opts?.databasePath !== undefined
        ? { databasePath: opts.databasePath }
        : {}),
    });
    service.start();
    return { service, indexer, watcher, onError };
  }

  it('returns from start before the boot run settles and does not mark it user-initiated', async () => {
    const { indexer } = start();

    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    const options = indexer.indexWorkspace.mock.calls[0]?.[1] as {
      signal: AbortSignal;
      userInitiated?: boolean;
    };
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.userInitiated).toBeUndefined();
    expect(indexer.releases).toHaveLength(1);

    let settled = false;
    void indexer.indexWorkspace.mock.results[0]?.value.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);
  });

  it('logs a failed boot run once', async () => {
    const indexer = makeIndexer();
    indexer.indexWorkspace.mockRejectedValue(new Error('disk'));
    const { onError } = start({ indexer });
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe(
      '[WorkspaceIndexLifecycle] indexWorkspace failed (non-fatal)',
    );
    expect(onError.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        message: 'disk',
      }),
    );
  });

  it('replaces and reports when a census owned by another caller aborts', async () => {
    let rejectJoined!: (error: unknown) => void;
    const joined = new Promise<void>((_resolve, reject) => {
      rejectJoined = reject;
    });
    const replacement = new Promise<void>(() => undefined);
    const indexer = {
      indexWorkspace: jest
        .fn()
        .mockReturnValueOnce(joined)
        .mockReturnValueOnce(replacement),
      reindexFile: jest.fn().mockResolvedValue(undefined),
      deleteFileSymbols: jest.fn().mockReturnValue(0),
    } as unknown as ReturnType<typeof makeIndexer>;
    const { onError } = start({ indexer });

    rejectJoined(abortError());
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(2);
  });

  it('keeps one replacement when a storm was already waiting on another caller abort', async () => {
    let rejectJoined!: (error: unknown) => void;
    const joined = new Promise<void>((_resolve, reject) => {
      rejectJoined = reject;
    });
    const replacement = new Promise<void>(() => undefined);
    const indexer = {
      indexWorkspace: jest
        .fn()
        .mockReturnValueOnce(joined)
        .mockReturnValueOnce(replacement),
      reindexFile: jest.fn().mockResolvedValue(undefined),
      deleteFileSymbols: jest.fn().mockReturnValue(0),
    } as unknown as ReturnType<typeof makeIndexer>;
    const { onError, watcher } = start({ indexer, stormThreshold: 1 });

    watcher.emit({ changes: batchPaths(['/ws/a.ts']) });
    rejectJoined(abortError());
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(2);
  });

  it('disposes a joined lifecycle run without leaving an unhandled join rejection', async () => {
    let rejectJoined!: (error: unknown) => void;
    const joined = new Promise<void>((_resolve, reject) => {
      rejectJoined = reject;
    });
    const indexer = {
      indexWorkspace: jest.fn(() => joined),
      reindexFile: jest.fn().mockResolvedValue(undefined),
      deleteFileSymbols: jest.fn().mockReturnValue(0),
    } as unknown as ReturnType<typeof makeIndexer>;
    const { service } = start({ indexer });
    const namespaceJoin = joined.catch((error: unknown) => error);

    service.dispose();
    rejectJoined(abortError());

    await expect(namespaceJoin).resolves.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
  });

  it('coalesces repeated events on one file into one reindex', async () => {
    const { indexer, watcher } = start();
    indexer.releases[0]?.resolve();
    await flush();

    const path = String.raw`C:\repo\src\a.ts`;
    watcher.emit({ changes: batchPaths([path]) });
    watcher.emit({ changes: batchPaths([path]) });
    watcher.emit({ changes: batchPaths([path, path]) });
    jest.advanceTimersByTime(499);
    expect(indexer.reindexFile).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flush();
    expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).toHaveBeenCalledWith('C:/repo/src/a.ts', '/ws');
  });

  it('turns a storm into one full run', async () => {
    const { indexer, watcher } = start({ stormThreshold: 3 });
    indexer.releases[0]?.resolve();
    await flush();
    indexer.indexWorkspace.mockClear();

    watcher.emit({
      changes: batchPaths(['/ws/a.ts', '/ws/b.ts', '/ws/c.ts']),
    });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).not.toHaveBeenCalled();
    indexer.releases[1]?.resolve();
    await flush();

    indexer.indexWorkspace.mockClear();
    watcher.emit({ changes: [], overflow: true, droppedCount: 400 });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).not.toHaveBeenCalled();
  });

  it('reindexes an update and a create during a held full run and does not queue a follow-up', async () => {
    const { indexer, watcher } = start();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    watcher.emit({
      changes: [
        { path: '/ws/src/a.ts', kind: 'update' },
        { path: '/ws/src/b.ts', kind: 'create' },
      ],
    });
    await flushProbes();
    jest.advanceTimersByTime(499);
    expect(indexer.reindexFile).not.toHaveBeenCalled();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await flush();
    expect(indexer.reindexFile).toHaveBeenCalledTimes(2);
    expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/a.ts', '/ws');
    expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/b.ts', '/ws');
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.releases).toHaveLength(1);

    indexer.releases[0]?.resolve();
    await flush();
    jest.advanceTimersByTime(500);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).toHaveBeenCalledTimes(2);
  });

  it('subscribes with the symbol index exclude globs', () => {
    const { watcher } = start();
    expect(watcher.watch).toHaveBeenCalledWith(
      '/ws',
      expect.objectContaining({ excludeGlobs: CODE_INDEX_EXCLUDES }),
      expect.any(Function),
    );
  });

  it('filters harness source events before counting changes toward a full run', async () => {
    const { indexer, watcher } = start({ stormThreshold: 2 });
    indexer.releases[0]?.resolve();
    await flush();

    watcher.emit({ changes: batchPaths(['/ws/.claude/x.ts', '/ws/src/a.ts']) });
    jest.advanceTimersByTime(500);
    await flush();

    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/a.ts', '/ws');
  });

  it('keeps lone JavaScript updates and forwards deletes of JavaScript with twins', async () => {
    const probe = jest.mocked(access);
    probe.mockImplementation(async (path) => {
      if (path !== '/ws/src/x.ts') throw new Error('absent');
    });
    jest.mocked(readDirectoryNames).mockResolvedValue(['x.ts']);
    jest.mocked(statTwin).mockResolvedValue({ isFile: () => true } as Stats);
    const { indexer, watcher } = start({ stormThreshold: 2 });
    indexer.releases[0]?.resolve();
    await flush();

    watcher.emit({
      changes: batchPaths(['/ws/src/x.js', '/ws/src/y.js']),
    });
    await jest.advanceTimersByTimeAsync(500);

    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/y.js', '/ws');
    expect(probe).toHaveBeenCalledWith('/ws/src/x.ts');
    probe.mockClear();

    watcher.emit({ changes: batchPaths(['/ws/src/x.js'], 'delete') });
    await jest.advanceTimersByTimeAsync(500);

    expect(indexer.deleteFileSymbols).toHaveBeenCalledWith(
      '/ws/src/x.js',
      '/ws',
    );
    expect(probe).not.toHaveBeenCalled();
  });

  it('uses the platform stem case rule even if access accepts a different case', async () => {
    jest
      .mocked(access)
      .mockRejectedValue(new Error('absent'))
      .mockResolvedValueOnce(undefined);
    jest.mocked(readDirectoryNames).mockResolvedValue(['X.ts']);
    jest.mocked(statTwin).mockResolvedValue({ isFile: () => true } as Stats);
    const { indexer, watcher } = start();

    watcher.emit({ changes: batchPaths(['/ws/src/x.js'], 'create') });
    await jest.advanceTimersByTimeAsync(500);

    expect(indexer.reindexFile).toHaveBeenCalledTimes(
      process.platform === 'win32' ? 0 : 1,
    );
  });

  it('keeps JavaScript when the sibling name denotes a directory', async () => {
    jest
      .mocked(access)
      .mockRejectedValue(new Error('absent'))
      .mockResolvedValueOnce(undefined);
    jest.mocked(readDirectoryNames).mockResolvedValue(['x.ts']);
    jest.mocked(statTwin).mockResolvedValue({ isFile: () => false } as Stats);
    const { indexer, watcher } = start();

    watcher.emit({ changes: batchPaths(['/ws/src/x.js']) });
    await jest.advanceTimersByTimeAsync(500);

    expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/x.js', '/ws');
  });

  it('preserves event order when a delete arrives during an earlier JS probe', async () => {
    const probe = jest.mocked(access);
    let finishProbe!: () => void;
    probe.mockRejectedValue(new Error('absent')).mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          finishProbe = () => reject(new Error('absent'));
        }),
    );
    const { indexer, watcher } = start();
    watcher.emit({ changes: batchPaths(['/ws/src/x.js']) });
    watcher.emit({ changes: batchPaths(['/ws/src/x.js'], 'delete') });
    finishProbe();
    await jest.advanceTimersByTimeAsync(500);

    expect(indexer.reindexFile).not.toHaveBeenCalled();
    expect(indexer.deleteFileSymbols).toHaveBeenCalledWith(
      '/ws/src/x.js',
      '/ws',
    );
  });

  it('deletes a supported file during a held full run through the indexer lock', async () => {
    const { indexer, watcher } = start();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    watcher.emit({
      changes: [{ path: String.raw`D:\ws\gone.ts`, kind: 'delete' }],
    });
    await flushProbes();
    jest.advanceTimersByTime(500);
    await flush();

    expect(indexer.deleteFileSymbols).toHaveBeenCalledTimes(1);
    expect(indexer.deleteFileSymbols).toHaveBeenCalledWith(
      'D:/ws/gone.ts',
      '/ws',
    );
    expect(indexer.reindexFile).not.toHaveBeenCalled();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    indexer.releases[0]?.resolve();
    await flush();
    jest.advanceTimersByTime(500);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
  });

  it('still coalesces a storm during a held full run into one follow-up', async () => {
    const { indexer, watcher } = start({ stormThreshold: 3 });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    watcher.emit({
      changes: batchPaths(['/ws/a.ts', '/ws/b.ts', '/ws/c.ts']),
    });
    jest.advanceTimersByTime(500);
    await flush();
    expect(indexer.reindexFile).not.toHaveBeenCalled();
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    indexer.releases[0]?.resolve();
    await flush();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(2);

    indexer.releases[1]?.resolve();
    await flush();
    jest.advanceTimersByTime(500);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(2);
  });

  it('queues at most one follow-up while a full run is in flight', async () => {
    const { indexer, watcher } = start();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    watcher.emit({ changes: batchPaths(['/ws/a.ts']) });
    watcher.emit({ changes: batchPaths(['/ws/b.ts', '/ws/c.ts']) });
    watcher.emit({ changes: [], overflow: true, droppedCount: 80 });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    indexer.releases[0]?.resolve();
    await flush();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(2);
    expect(indexer.reindexFile).not.toHaveBeenCalled();

    indexer.releases[1]?.resolve();
    await flush();
    jest.advanceTimersByTime(500);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(2);
  });

  it('removes rows for a delete and keeps the last kind across a burst', async () => {
    const { indexer, watcher } = start();
    indexer.releases[0]?.resolve();
    await flush();

    watcher.emit({
      changes: [{ path: String.raw`D:\ws\gone.ts`, kind: 'update' }],
    });
    watcher.emit({
      changes: [{ path: String.raw`D:\ws\gone.ts`, kind: 'delete' }],
    });
    await flushProbes();
    jest.advanceTimersByTime(500);
    expect(indexer.deleteFileSymbols).toHaveBeenCalledTimes(1);
    expect(indexer.deleteFileSymbols).toHaveBeenCalledWith(
      'D:/ws/gone.ts',
      '/ws',
    );
    expect(indexer.reindexFile).not.toHaveBeenCalled();
  });

  it('dispose is idempotent and stops the timer, the subscription and the run', () => {
    const { service, indexer, watcher } = start();
    const signal = (
      indexer.indexWorkspace.mock.calls[0]?.[1] as { signal: AbortSignal }
    ).signal;

    watcher.emit({ changes: batchPaths(['/ws/a.ts']) });
    service.dispose();
    service.dispose();

    expect(watcher.dispose).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(true);
    jest.advanceTimersByTime(1_000);
    expect(indexer.reindexFile).not.toHaveBeenCalled();

    watcher.emit({ changes: batchPaths(['/ws/b.ts']) });
    jest.advanceTimersByTime(1_000);
    expect(indexer.reindexFile).not.toHaveBeenCalled();
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
  });

  it('treats a directory delete as one full run and coalesces a burst', async () => {
    const { indexer, watcher } = start();
    indexer.releases[0]?.resolve();
    await flush();
    indexer.indexWorkspace.mockClear();

    watcher.emit({
      changes: [{ path: '/ws/src/lib', kind: 'delete' }],
    });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
    indexer.releases[indexer.releases.length - 1]?.resolve();
    await flush();
    jest.advanceTimersByTime(30_000);

    indexer.indexWorkspace.mockClear();
    watcher.emit({
      changes: [
        { path: '/ws/src/lib', kind: 'delete' },
        { path: '/ws/src/app', kind: 'delete' },
        { path: String.raw`D:\ws\packages\ui`, kind: 'delete' },
      ],
    });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    expect(indexer.reindexFile).not.toHaveBeenCalled();
  });

  it('ignores database sidecars and non-source edits, and reindexes a ts change', async () => {
    const databasePath = String.raw`D:\ws\.ptah\ptah.sqlite`;
    const { indexer, watcher } = start({ databasePath, stormThreshold: 3 });
    indexer.releases[0]?.resolve();
    await flush();
    indexer.indexWorkspace.mockClear();

    watcher.emit({
      changes: [
        { path: String.raw`D:\ws\.ptah\ptah.sqlite`, kind: 'update' },
        { path: String.raw`D:\ws\.ptah\ptah.sqlite-wal`, kind: 'update' },
        { path: String.raw`D:\ws\.ptah\ptah.sqlite-shm`, kind: 'create' },
        { path: String.raw`D:\ws\.ptah\ptah.sqlite-journal`, kind: 'update' },
        { path: String.raw`D:\ws\.ptah\ptah.sqlite`, kind: 'delete' },
        { path: '/ws/README.md', kind: 'update' },
        { path: '/ws/notes.md', kind: 'update' },
        { path: '/ws/docs/guide.md', kind: 'update' },
      ],
    });
    jest.advanceTimersByTime(1_000);
    await flush();
    expect(indexer.indexWorkspace).not.toHaveBeenCalled();
    expect(indexer.reindexFile).not.toHaveBeenCalled();
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();

    watcher.emit({
      changes: [{ path: String.raw`D:\ws\src\a.ts`, kind: 'update' }],
    });
    jest.advanceTimersByTime(500);
    await flush();
    expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).toHaveBeenCalledWith('D:/ws/src/a.ts', '/ws');
    expect(indexer.indexWorkspace).not.toHaveBeenCalled();
  });

  it('drops a non-source file delete and censuses an extension-less delete', async () => {
    const { indexer, watcher } = start();
    indexer.releases[0]?.resolve();
    await flush();
    indexer.indexWorkspace.mockClear();

    watcher.emit({
      changes: [
        { path: '/ws/README.md', kind: 'delete' },
        { path: '/ws/notes.json', kind: 'delete' },
      ],
    });
    jest.advanceTimersByTime(30_000);
    expect(indexer.indexWorkspace).not.toHaveBeenCalled();
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
    expect(indexer.reindexFile).not.toHaveBeenCalled();

    watcher.emit({
      changes: [{ path: '/ws/.gitignore', kind: 'delete' }],
    });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
  });

  it('coalesces extension-less deletes inside the cooldown into one trailing run', async () => {
    const { indexer, watcher } = start();
    indexer.releases[0]?.resolve();
    await flush();
    indexer.indexWorkspace.mockClear();

    watcher.emit({ changes: [{ path: '/ws/src', kind: 'delete' }] });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    indexer.releases[indexer.releases.length - 1]?.resolve();
    await flush();

    watcher.emit({ changes: [{ path: '/ws/lib', kind: 'delete' }] });
    watcher.emit({ changes: [{ path: '/ws/app', kind: 'delete' }] });
    jest.advanceTimersByTime(29_999);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(2);
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
  });

  it('does not fire the trailing delete run after dispose', async () => {
    const { service, indexer, watcher } = start();
    indexer.releases[0]?.resolve();
    await flush();
    indexer.indexWorkspace.mockClear();

    watcher.emit({ changes: [{ path: '/ws/src', kind: 'delete' }] });
    watcher.emit({ changes: [{ path: '/ws/lib', kind: 'delete' }] });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);

    service.dispose();
    jest.advanceTimersByTime(30_000);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
  });

  it('reindexes a source edit that shares a batch with a cooled-down directory delete', async () => {
    const { indexer, watcher } = start();
    indexer.releases[0]?.resolve();
    await flush();
    indexer.indexWorkspace.mockClear();

    watcher.emit({ changes: [{ path: '/ws/src', kind: 'delete' }] });
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    indexer.releases[indexer.releases.length - 1]?.resolve();
    await flush();
    indexer.indexWorkspace.mockClear();

    watcher.emit({
      changes: [
        { path: '/ws/lib', kind: 'delete' },
        { path: '/ws/src/a.ts', kind: 'update' },
      ],
    });
    jest.advanceTimersByTime(500);
    await flush();
    expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
    expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/a.ts', '/ws');
    expect(indexer.indexWorkspace).not.toHaveBeenCalled();

    jest.advanceTimersByTime(29_500);
    expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
    expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
  });

  describe('TypeScript twin transitions', () => {
    it('turns a TypeScript storm into one full run without probing the disk', async () => {
      const { indexer, watcher } = start({ stormThreshold: 3 });
      indexer.releases[0]?.resolve();
      await flush();
      indexer.indexWorkspace.mockClear();
      jest.mocked(access).mockClear();
      jest.mocked(readdir).mockClear();

      watcher.emit({
        changes: batchPaths(['/ws/a.ts', '/ws/b.ts', '/ws/c.ts'], 'create'),
      });
      expect(indexer.indexWorkspace).toHaveBeenCalledTimes(1);
      expect(indexer.reindexFile).not.toHaveBeenCalled();
      expect(access).not.toHaveBeenCalled();
      expect(readdir).not.toHaveBeenCalled();
    });

    const itPosix = process.platform === 'win32' ? it.skip : it;

    /** Only `files` exist; each is a regular file listed by its folder. */
    function useFiles(files: readonly string[]): void {
      const present = new Set(files);
      jest.mocked(access).mockImplementation(async (path) => {
        if (!present.has(String(path))) throw new Error('absent');
      });
      jest
        .mocked(statTwin)
        .mockImplementation(async () => ({ isFile: () => true }) as Stats);
      jest
        .mocked(readDirectoryNames)
        .mockImplementation(async (directory) =>
          files
            .filter((file) => posix.dirname(file) === directory)
            .map((file) => posix.basename(file)),
        );
    }

    async function settle(): Promise<void> {
      await flushProbes();
      await jest.advanceTimersByTimeAsync(500);
    }

    it('purges the JavaScript twin when its TypeScript source is created', async () => {
      useFiles(['/ws/src/x.ts', '/ws/src/x.js']);
      const { indexer, watcher } = start();

      watcher.emit({ changes: batchPaths(['/ws/src/x.ts'], 'create') });
      await settle();

      expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
      expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/x.ts', '/ws');
      expect(indexer.deleteFileSymbols).toHaveBeenCalledTimes(1);
      expect(indexer.deleteFileSymbols).toHaveBeenCalledWith(
        '/ws/src/x.js',
        '/ws',
      );
    });

    it('reindexes the JavaScript twin when its TypeScript source is deleted', async () => {
      useFiles(['/ws/src/x.js']);
      const { indexer, watcher } = start();

      watcher.emit({ changes: batchPaths(['/ws/src/x.ts'], 'delete') });
      await settle();

      expect(indexer.deleteFileSymbols).toHaveBeenCalledTimes(1);
      expect(indexer.deleteFileSymbols).toHaveBeenCalledWith(
        '/ws/src/x.ts',
        '/ws',
      );
      // Absent candidates (`x.jsx`, `x.mjs`, `x.cjs`) are not scheduled.
      expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
      expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/x.js', '/ws');
    });

    it('keeps the JavaScript twin out when another TypeScript twin remains', async () => {
      useFiles(['/ws/src/x.tsx', '/ws/src/x.js']);
      const { indexer, watcher } = start();

      watcher.emit({ changes: batchPaths(['/ws/src/x.ts'], 'delete') });
      await settle();

      expect(indexer.reindexFile).not.toHaveBeenCalled();
      expect(indexer.deleteFileSymbols).toHaveBeenCalledTimes(1);
      expect(indexer.deleteFileSymbols).toHaveBeenCalledWith(
        '/ws/src/x.ts',
        '/ws',
      );
    });

    it('ignores declaration files', async () => {
      useFiles(['/ws/src/x.d.ts', '/ws/src/x.d.js', '/ws/src/x.js']);
      const { indexer, watcher } = start();

      watcher.emit({ changes: batchPaths(['/ws/src/x.d.ts'], 'create') });
      watcher.emit({ changes: batchPaths(['/ws/src/x.d.ts'], 'delete') });
      await settle();

      expect(jest.mocked(access)).not.toHaveBeenCalled();
      expect(indexer.reindexFile).not.toHaveBeenCalledWith(
        expect.stringMatching(/\.js$/),
        '/ws',
      );
      expect(indexer.deleteFileSymbols).not.toHaveBeenCalledWith(
        expect.stringMatching(/\.js$/),
        '/ws',
      );
    });

    it('does not probe twins for a TypeScript modification', async () => {
      useFiles(['/ws/src/x.ts', '/ws/src/x.js']);
      const { indexer, watcher } = start();

      watcher.emit({ changes: batchPaths(['/ws/src/x.ts'], 'update') });
      await settle();

      expect(jest.mocked(access)).not.toHaveBeenCalled();
      expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
      expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/x.ts', '/ws');
      expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
    });

    it('dedupes a twin that is already in the batch', async () => {
      useFiles(['/ws/src/x.js']);
      const { indexer, watcher } = start();

      watcher.emit({
        changes: [
          { path: '/ws/src/x.ts', kind: 'delete' },
          { path: '/ws/src/x.js', kind: 'update' },
        ],
      });
      await settle();

      expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
      expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/x.js', '/ws');
    });

    it('replaces a shadowed twin update with the purge in the same batch', async () => {
      useFiles(['/ws/src/x.ts', '/ws/src/x.js']);
      const { indexer, watcher } = start();

      watcher.emit({
        changes: [
          { path: '/ws/src/x.js', kind: 'update' },
          { path: '/ws/src/x.ts', kind: 'create' },
        ],
      });
      await settle();

      expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
      expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/x.ts', '/ws');
      expect(indexer.deleteFileSymbols).toHaveBeenCalledTimes(1);
      expect(indexer.deleteFileSymbols).toHaveBeenCalledWith(
        '/ws/src/x.js',
        '/ws',
      );
    });

    it('counts derived twins toward the storm threshold', async () => {
      useFiles([
        '/ws/src/a.ts',
        '/ws/src/a.js',
        '/ws/src/b.ts',
        '/ws/src/b.js',
      ]);
      const { indexer, watcher } = start({ stormThreshold: 4 });
      indexer.releases[0]?.resolve();
      await flush();

      watcher.emit({
        changes: batchPaths(['/ws/src/a.ts', '/ws/src/b.ts'], 'create'),
      });
      await settle();

      expect(indexer.indexWorkspace).toHaveBeenCalledTimes(2);
      expect(indexer.reindexFile).not.toHaveBeenCalled();
      expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
    });

    itPosix('reads each directory once per batch', async () => {
      const stems = ['a', 'b', 'c', 'd', 'e'];
      useFiles(
        stems.flatMap((stem) => [`/ws/src/${stem}.ts`, `/ws/src/${stem}.js`]),
      );
      const { indexer, watcher } = start();

      watcher.emit({
        changes: batchPaths(
          stems.map((stem) => `/ws/src/${stem}.ts`),
          'create',
        ),
      });
      await settle();

      expect(jest.mocked(readDirectoryNames)).toHaveBeenCalledTimes(1);
      expect(jest.mocked(readDirectoryNames)).toHaveBeenCalledWith('/ws/src');
      expect(indexer.deleteFileSymbols).toHaveBeenCalledTimes(stems.length);
    });

    itPosix('schedules no twin when the directory read fails', async () => {
      useFiles(['/ws/src/x.ts', '/ws/src/x.js']);
      jest.mocked(readDirectoryNames).mockRejectedValue(new Error('EACCES'));
      const { indexer, watcher, onError } = start();

      watcher.emit({ changes: batchPaths(['/ws/src/x.ts'], 'create') });
      await settle();

      expect(jest.mocked(readDirectoryNames)).toHaveBeenCalledTimes(1);
      expect(indexer.deleteFileSymbols).not.toHaveBeenCalled();
      expect(indexer.reindexFile).toHaveBeenCalledTimes(1);
      expect(indexer.reindexFile).toHaveBeenCalledWith('/ws/src/x.ts', '/ws');
      expect(onError).not.toHaveBeenCalled();
    });
  });
});

describe('workspaceSymbolIndexFrom', () => {
  it('forwards a supported delete to the indexer lock', async () => {
    const indexer = {
      indexWorkspace: jest.fn(),
      reindexFile: jest.fn(),
      deleteFileSymbols: jest.fn().mockResolvedValue(2),
    };
    const port = workspaceSymbolIndexFrom(indexer);

    await expect(
      port.deleteFileSymbols(String.raw`C:\ws\a.ts`, '/ws'),
    ).resolves.toBe(2);
    expect(indexer.deleteFileSymbols).toHaveBeenCalledWith('C:/ws/a.ts', '/ws');
  });

  it('forwards a posix delete to the indexer unchanged', async () => {
    const indexer = {
      indexWorkspace: jest.fn(),
      reindexFile: jest.fn(),
      deleteFileSymbols: jest.fn().mockResolvedValue(1),
    };
    const port = workspaceSymbolIndexFrom(indexer);
    await expect(port.deleteFileSymbols('/ws/a.ts', '/ws')).resolves.toBe(1);
    expect(indexer.deleteFileSymbols).toHaveBeenCalledWith('/ws/a.ts', '/ws');
  });
});
