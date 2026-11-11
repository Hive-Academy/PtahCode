/**
 * TaskIndexService — unit specs.
 *
 * Uses a purpose-built in-memory `IFileSystemProvider` fake with a FIREABLE
 * watcher (the shared platform-core mock exposes no fire handle) plus the real
 * `InMemoryTaskIndexStore` and `TaskScannerService`. Covers: lazy start,
 * debounce coalescing (N events → 1 flush + 1 event, NFR-2), write-order
 * (`applyFolderChange` → 'write' event), rebuild equivalence, and detail read.
 */
import 'reflect-metadata';
import * as path from 'path';
import { container } from 'tsyringe';
import {
  FileType,
  PLATFORM_TOKENS,
  createEvent,
  type IFileSystemProvider,
  type IFileWatcher,
  type DirectoryEntry,
} from '@ptah-extension/platform-core';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { createMockFileSystemProvider } from '@ptah-extension/platform-core/testing';
import {
  SPECS_README_FILE,
  EMPTY_TASK_FILTER,
  renderSpecsReadme,
  roundJudgeFile,
} from '@ptah-extension/shared';
import { normalizeWorkspaceRoot } from './normalize-workspace-root';
import { TaskScannerService } from './task-scanner.service';
import { TASK_SPECS_TOKENS } from './di/tokens';
import {
  InMemoryTaskIndexStore,
  type ITaskIndexStore,
} from './task-index.store';
import {
  TaskIndexService,
  type TaskIndexChangeEvent,
} from './task-index.service';

function makeLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

const ROOT = 'd:/tmp/ws-index-svc';

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Minimal fireable in-memory file system. */
class FakeFs implements Partial<IFileSystemProvider> {
  private readonly files = new Map<string, string>();
  /** Every path passed to `writeFile`, in order — lets specs assert on writes. */
  readonly writes: string[] = [];
  fireChange!: (p: string) => void;
  fireCreate!: (p: string) => void;
  fireDelete!: (p: string) => void;

  setFile(p: string, content: string): void {
    this.files.set(norm(p), content);
  }

  deleteFile(p: string): void {
    this.files.delete(norm(p));
  }

  async writeFile(p: string, content: string): Promise<void> {
    this.writes.push(norm(p));
    this.files.set(norm(p), content);
  }

  async exists(p: string): Promise<boolean> {
    const n = norm(p);
    if (this.files.has(n)) return true;
    for (const key of this.files.keys()) {
      if (key.startsWith(`${n}/`)) return true;
    }
    return false;
  }

  async readFile(p: string): Promise<string> {
    const n = norm(p);
    const content = this.files.get(n);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT ${n}`), { code: 'ENOENT' });
    }
    return content;
  }

  async readDirectory(dir: string): Promise<DirectoryEntry[]> {
    const d = norm(dir);
    const children = new Map<string, FileType>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(`${d}/`)) continue;
      const rest = key.slice(d.length + 1);
      const seg = rest.split('/')[0];
      const isFile = rest.indexOf('/') === -1;
      children.set(seg, isFile ? FileType.File : FileType.Directory);
    }
    return [...children.entries()].map(([name, type]) => ({ name, type }));
  }

  async lstat(p: string) {
    const n = norm(p);
    if (this.files.has(n)) return { type: FileType.File, size: Buffer.byteLength(this.files.get(n)!), ctime: 0, mtime: 0 };
    if (await this.exists(p)) return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  }

  async realpath(p: string): Promise<string> { return norm(p); }

  async readFileBoundedNoFollow(p: string, maxBytes: number) {
    const bytes = new TextEncoder().encode(await this.readFile(p));
    return { bytes: bytes.slice(0, maxBytes), truncated: bytes.length > maxBytes };
  }

  createFileWatcher(): IFileWatcher {
    const [onDidChange, fireChange] = createEvent<string>();
    const [onDidCreate, fireCreate] = createEvent<string>();
    const [onDidDelete, fireDelete] = createEvent<string>();
    this.fireChange = fireChange;
    this.fireCreate = fireCreate;
    this.fireDelete = fireDelete;
    return { onDidChange, onDidCreate, onDidDelete, dispose: jest.fn() };
  }
}

function specsDir(): string {
  return path.join(normalizeWorkspaceRoot(ROOT), '.ptah', 'specs');
}

function carrier(folder: string): string {
  return path.join(specsDir(), folder, 'task.md');
}

function validTask(id: string): string {
  return `---\nstatus: backlog\ntype: FEATURE\ntitle: ${id}\ncreated: 2026-07-14T10:00:00.000Z\nupdated: 2026-07-14T10:00:00.000Z\n---\nbody of ${id}`;
}

function buildServiceWithParts(fs: FakeFs): {
  service: TaskIndexService;
  scanner: TaskScannerService;
} {
  const logger = makeLogger();
  const scanner = new TaskScannerService(
    fs as unknown as IFileSystemProvider,
    logger,
  );
  const store = new InMemoryTaskIndexStore(logger);
  const service = new TaskIndexService(
    logger,
    fs as unknown as IFileSystemProvider,
    scanner,
    store,
  );
  return { service, scanner };
}

function buildService(fs: FakeFs): TaskIndexService {
  return buildServiceWithParts(fs).service;
}

/** Same wiring, but with a caller-owned logger + store so both can be asserted on. */
function buildServiceWith(
  fs: FakeFs,
  logger: Logger,
  store: ITaskIndexStore,
): TaskIndexService {
  const scanner = new TaskScannerService(
    fs as unknown as IFileSystemProvider,
    logger,
  );
  return new TaskIndexService(
    logger,
    fs as unknown as IFileSystemProvider,
    scanner,
    store,
  );
}

function seedTwoValidOneExcluded(fs: FakeFs): void {
  fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
  fs.setFile(carrier('TASK_2026_002'), validTask('TASK_2026_002'));
  // Folder present but no task.md carrier → excluded (no_carrier).
  fs.setFile(path.join(specsDir(), 'TASK_2026_003', 'context.md'), 'notes');
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('TaskIndexService.ensureStarted', () => {
  it('lazily indexes the workspace and exposes it via list()', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const service = buildService(fs);

    await service.ensureStarted(ROOT);
    const result = await service.list(ROOT);

    expect(result.specsDirExists).toBe(true);
    expect(result.tasks.map((t) => t.id).sort()).toEqual([
      'TASK_2026_001',
      'TASK_2026_002',
    ]);
    expect(result.excludedCount).toBe(1);
    service.dispose();
  });

  it('collapses two CONCURRENT calls into one rebuild and one README write', async () => {
    // Since step 11 the host warms the index at activation while `tasks:*`
    // RPCs still call `ensureStarted` themselves — the two now race on the
    // very first call (R4).
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const { service, scanner } = buildServiceWithParts(fs);
    const scanSpy = jest.spyOn(scanner, 'scan');

    await Promise.all([
      service.ensureStarted(ROOT),
      service.ensureStarted(ROOT),
    ]);

    expect(scanSpy).toHaveBeenCalledTimes(1);
    expect(fs.writes).toEqual([norm(path.join(specsDir(), SPECS_README_FILE))]);
    service.dispose();
  });

  it('the joining caller sees a WARMED index, not an empty one', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const service = buildService(fs);

    const first = service.ensureStarted(ROOT);
    // Second caller starts while the first is still warming.
    await service.ensureStarted(ROOT);
    const result = await service.list(ROOT);
    await first;

    expect(result.tasks).toHaveLength(2);
    service.dispose();
  });

  it('does not latch `started` when the index write fails, so a later call retries', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const scanner = new TaskScannerService(
      fs as unknown as IFileSystemProvider,
      logger,
    );
    const store = new InMemoryTaskIndexStore(logger);
    // Mirrors an Electron/CLI boot where the SQLite connection is not open yet.
    const replace = jest
      .spyOn(store, 'replaceWorkspace')
      .mockImplementationOnce(() => {
        throw new Error('PERSISTENCE_UNAVAILABLE');
      });
    const service = new TaskIndexService(
      logger,
      fs as unknown as IFileSystemProvider,
      scanner,
      store,
    );

    await service.ensureStarted(ROOT);
    expect(replace).toHaveBeenCalledTimes(1);

    // The store is healthy now — the next call must actually warm up.
    await service.ensureStarted(ROOT);
    expect(replace).toHaveBeenCalledTimes(2);
    expect((await service.list(ROOT)).tasks).toHaveLength(2);

    service.dispose();
  });

  it('does not emit an event for the silent warm-up', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const service = buildService(fs);
    const events: TaskIndexChangeEvent[] = [];
    service.onDidChangeIndex((e) => events.push(e));

    await service.ensureStarted(ROOT);

    expect(events).toHaveLength(0);
    service.dispose();
  });
});

/**
 * TASK_2026_306 task 4.4 — the offline-store guard.
 *
 * Electron and the CLI both register the store in the same DI pass as the
 * activation warm-up and open the SQLite connection hundreds of log lines later,
 * so the first warm-up is GUARANTEED to be running against a store that cannot
 * accept a write. Asking `isReady()` first turns that from a caught failure
 * (WARN on every clean boot) into a skipped write (DEBUG), without touching the
 * scan, the README, or the recovery latch — and without covering for a store
 * that claimed readiness and failed anyway.
 */
describe('TaskIndexService rebuild — offline-store guard', () => {
  function offlineStore(logger: Logger): {
    store: InMemoryTaskIndexStore;
    isReady: jest.SpyInstance<boolean, []>;
    replace: jest.SpyInstance;
  } {
    const store = new InMemoryTaskIndexStore(logger);
    return {
      store,
      isReady: jest.spyOn(store, 'isReady').mockReturnValue(false),
      replace: jest.spyOn(store, 'replaceWorkspace'),
    };
  }

  it('skips the write ENTIRELY when the store is not ready', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const { store, replace } = offlineStore(logger);
    const service = buildServiceWith(fs, logger, store);

    await service.ensureStarted(ROOT);

    expect(replace).not.toHaveBeenCalled();
    service.dispose();
  });

  /**
   * The whole point of 4.4: `Persistence is offline` was a PREDICTED failure
   * being reported in the channel reserved for unpredicted ones. Nothing on a
   * clean boot may reach `logger.warn` any more.
   */
  it('emits no WARN at all on the too-early first warm-up', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const { store } = offlineStore(logger);
    const service = buildServiceWith(fs, logger, store);

    await service.ensureStarted(ROOT);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('index rebuild write skipped'),
    );
    service.dispose();
  });

  /**
   * The reason this fix was chosen over deferring the whole warm-up: on a host
   * where the connection NEVER opens (ABI mismatch, missing native binary) the
   * contract doc must still land. Skipping only the write keeps that free.
   */
  it('still writes the specs README when the store is not ready', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const { store } = offlineStore(logger);
    const service = buildServiceWith(fs, logger, store);

    await service.ensureStarted(ROOT);

    expect(fs.writes).toEqual([norm(path.join(specsDir(), SPECS_README_FILE))]);
    expect(await fs.readFile(path.join(specsDir(), SPECS_README_FILE))).toBe(
      renderSpecsReadme(),
    );
    service.dispose();
  });

  /**
   * `specsDirExists` is written by `rebuild` from the scan, and
   * `ensureSpecsReadme` early-returns on it. A guard that skipped the scan too
   * would silently take the README with it — this is the assertion that proves
   * it did not.
   */
  it('still records specsDirExists from the scan when the store is not ready', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const { store } = offlineStore(logger);
    const service = buildServiceWith(fs, logger, store);

    await service.ensureStarted(ROOT);

    expect((await service.list(ROOT)).specsDirExists).toBe(true);
    service.dispose();
  });

  it('performs the real rebuild once the store reports ready', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const { store, isReady, replace } = offlineStore(logger);
    const service = buildServiceWith(fs, logger, store);

    await service.ensureStarted(ROOT);
    expect(replace).not.toHaveBeenCalled();

    // What `startTaskSpecsIndex`'s `onDidOpen` subscription triggers.
    isReady.mockReturnValue(true);
    await service.ensureStarted(ROOT);

    expect(replace).toHaveBeenCalledTimes(1);
    expect((await service.list(ROOT)).tasks).toHaveLength(2);
    expect(logger.warn).not.toHaveBeenCalled();
    service.dispose();
  });

  it('writes without a skip log when the store is ready from the start', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const store = new InMemoryTaskIndexStore(logger);
    const replace = jest.spyOn(store, 'replaceWorkspace');
    const service = buildServiceWith(fs, logger, store);

    await service.ensureStarted(ROOT);

    expect(replace).toHaveBeenCalledTimes(1);
    expect([
      ...jest.mocked(logger.debug).mock.calls,
      ...jest.mocked(logger.info).mock.calls,
    ]).toContainEqual([
      '[task-specs] index rebuild timing',
      expect.objectContaining({ trigger: 'activation', rows: 2 }),
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
    expect((await service.list(ROOT)).tasks).toHaveLength(2);
    service.dispose();
  });

  /**
   * The guard removes ONE predicted failure from the warn channel. A store that
   * reported readiness and then failed — closed connection, full disk, corrupt
   * page — is unpredicted and must still be loud.
   */
  it('still WARNs when a store that reported READY fails the write anyway', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const store = new InMemoryTaskIndexStore(logger);
    jest.spyOn(store, 'replaceWorkspace').mockImplementation(() => {
      throw new Error('SQLITE_FULL: database or disk is full');
    });
    const service = buildServiceWith(fs, logger, store);

    await service.ensureStarted(ROOT);

    expect(logger.warn).toHaveBeenCalledWith(
      '[task-specs] index rebuild write failed',
      { error: 'SQLITE_FULL: database or disk is full' },
    );
    service.dispose();
  });
});

describe('TaskIndexService specs README (self-write suppression)', () => {
  function readmePath(): string {
    return path.join(specsDir(), SPECS_README_FILE);
  }

  it('writes the README with EXACTLY ONE rebuild (no self-triggered loop)', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const { service, scanner } = buildServiceWithParts(fs);
    const scanSpy = jest.spyOn(scanner, 'scan');

    await service.ensureStarted(ROOT);

    // The README lands in the very directory this service watches. If the
    // write re-entered the watcher we would see a second scan here.
    expect(scanSpy).toHaveBeenCalledTimes(1);
    expect(fs.writes).toEqual([norm(readmePath())]);
    expect(await fs.readFile(readmePath())).toBe(renderSpecsReadme());
    service.dispose();
  });

  it('performs ZERO writes on a later start when the content already matches', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const first = buildService(fs);
    await first.ensureStarted(ROOT);
    first.dispose();
    expect(fs.writes).toHaveLength(1);

    fs.writes.length = 0;
    const second = buildService(fs);
    await second.ensureStarted(ROOT);

    expect(fs.writes).toEqual([]);
    second.dispose();
  });

  it('ignores watcher events for the generated README', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const service = buildService(fs);
      const events: TaskIndexChangeEvent[] = [];
      service.onDidChangeIndex((e) => events.push(e));

      await service.ensureStarted(ROOT);
      fs.fireChange(readmePath());
      fs.fireCreate(readmePath());

      jest.advanceTimersByTime(300);
      await flush();

      expect(events).toHaveLength(0);
      service.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not materialize .ptah/specs when the workspace has no specs dir', async () => {
    const fs = new FakeFs();
    const service = buildService(fs);

    await service.ensureStarted(ROOT);

    expect(fs.writes).toEqual([]);
    expect(await fs.exists(readmePath())).toBe(false);
    service.dispose();
  });
});

describe('TaskIndexService watcher debounce', () => {
  it('coalesces a burst of N events into ONE flush + ONE event', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const service = buildService(fs);
      const events: TaskIndexChangeEvent[] = [];
      service.onDidChangeIndex((e) => events.push(e));

      await service.ensureStarted(ROOT);
      fs.setFile(carrier('TASK_2026_004'), validTask('TASK_2026_004'));

      fs.fireChange(carrier('TASK_2026_004'));
      fs.fireChange(carrier('TASK_2026_004'));
      fs.fireCreate(carrier('TASK_2026_004'));
      expect(events).toHaveLength(0); // still debouncing

      jest.advanceTimersByTime(300);
      await flush();
      await flush();

      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('watcher');
      expect(events[0].folderNames).toEqual(['TASK_2026_004']);
      service.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores registry.md and .archive/ watcher events', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const service = buildService(fs);
      const events: TaskIndexChangeEvent[] = [];
      service.onDidChangeIndex((e) => events.push(e));

      await service.ensureStarted(ROOT);
      fs.fireChange(path.join(specsDir(), 'registry.md'));
      fs.fireChange(path.join(specsDir(), '.archive', 'TASK_OLD', 'task.md'));

      jest.advanceTimersByTime(300);
      await flush();

      expect(events).toHaveLength(0);
      service.dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('TaskIndexService write-order (applyFolderChange)', () => {
  it('commits and pushes once for a writer notification plus its watcher echo', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const logger = makeLogger();
      const store = new InMemoryTaskIndexStore(logger);
      const replace = jest.spyOn(store, 'replaceWorkspace');
      const service = buildServiceWith(fs, logger, store);
      const events: TaskIndexChangeEvent[] = [];
      service.onDidChangeIndex((event) => events.push(event));
      await service.ensureStarted(ROOT);
      replace.mockClear();
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
      await service.applyFolderChange(ROOT, 'TASK_2026_007');
      fs.fireCreate(carrier('TASK_2026_007'));
      jest.advanceTimersByTime(300);
      await flush();
      await flush();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect((await service.list(ROOT)).tasks.map((task) => task.id)).toContain('TASK_2026_007');
      service.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('runs one trailing rebuild when another request arrives during a scan', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const { service, scanner } = buildServiceWithParts(fs);
    await service.ensureStarted(ROOT);
    const original = scanner.scan.bind(scanner);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scan = jest.spyOn(scanner, 'scan').mockImplementationOnce(async (root) => {
      await gate;
      return original(root);
    });
    fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
    const first = service.applyFolderChange(ROOT, 'TASK_2026_007');
    await flush();
    const second = service.applyFolderChange(ROOT, 'TASK_2026_007');
    const third = service.applyFolderChange(ROOT, 'TASK_2026_007');
    await flush();
    release?.();
    await Promise.all([first, second, third]);
    expect(scan).toHaveBeenCalledTimes(2);
    service.dispose();
  });

  it('merges every overlapping folder and settles callers after their run', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const { service, scanner } = buildServiceWithParts(fs);
    await service.ensureStarted(ROOT);
    const events: TaskIndexChangeEvent[] = [];
    service.onDidChangeIndex((event) => events.push(event));
    const original = scanner.scan.bind(scanner);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scan = jest.spyOn(scanner, 'scan').mockImplementationOnce(async (root) => {
      await gate;
      return original(root);
    });
    for (const name of ['TASK_2026_007', 'TASK_2026_008', 'TASK_2026_009']) {
      fs.setFile(carrier(name), validTask(name));
    }
    const settled: string[] = [];
    const first = service.applyFolderChange(ROOT, 'TASK_2026_007').then(() => { settled.push('first'); });
    await flush();
    const second = service.applyFolderChange(ROOT, 'TASK_2026_008').then(() => { settled.push('second'); });
    const third = service.applyFolderChange(ROOT, 'TASK_2026_009').then(() => { settled.push('third'); });
    await flush();
    release?.();
    await Promise.all([first, second, third]);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(events[1].folderNames).toEqual(['TASK_2026_008', 'TASK_2026_009']);
    expect(settled).toEqual(expect.arrayContaining(['first', 'second', 'third']));
    service.dispose();
  });

  it('runs the trailing rebuild after a rejected first run and accepts later requests', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const { service, scanner } = buildServiceWithParts(fs);
    await service.ensureStarted(ROOT);
    let rejectScan: ((error: Error) => void) | undefined;
    const gate = new Promise<never>((_resolve, reject) => { rejectScan = reject; });
    const original = scanner.scan.bind(scanner);
    const scan = jest.spyOn(scanner, 'scan').mockImplementationOnce(() => gate);
    fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
    const first = service.applyFolderChange(ROOT, 'TASK_2026_007');
    await flush();
    fs.setFile(carrier('TASK_2026_008'), validTask('TASK_2026_008'));
    const second = service.applyFolderChange(ROOT, 'TASK_2026_008');
    await flush();
    rejectScan?.(new Error('scan failed'));
    await expect(first).rejects.toThrow('scan failed');
    await second;
    fs.setFile(carrier('TASK_2026_009'), validTask('TASK_2026_009'));
    await service.applyFolderChange(ROOT, 'TASK_2026_009');
    expect(scan).toHaveBeenCalledTimes(3);
    expect((await original(ROOT)).tasks).toHaveLength(5);
    service.dispose();
  });

  it('runs one later trailing rebuild when two callers overlap after a rejected run', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const { service, scanner } = buildServiceWithParts(fs);
    await service.ensureStarted(ROOT);
    const original = scanner.scan.bind(scanner);
    let rejectFirst: ((error: Error) => void) | undefined;
    let releaseSecond: (() => void) | undefined;
    const firstGate = new Promise<never>((_resolve, reject) => { rejectFirst = reject; });
    const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const scan = jest.spyOn(scanner, 'scan')
      .mockImplementationOnce(() => firstGate)
      .mockImplementationOnce(async (root) => { await secondGate; return original(root); });
    for (const name of ['TASK_2026_007', 'TASK_2026_008', 'TASK_2026_009', 'TASK_2026_010']) {
      fs.setFile(carrier(name), validTask(name));
    }
    const first = service.applyFolderChange(ROOT, 'TASK_2026_007');
    await flush();
    const second = service.applyFolderChange(ROOT, 'TASK_2026_008');
    await flush();
    rejectFirst?.(new Error('first run failed'));
    await expect(first).rejects.toThrow('first run failed');
    await flush();
    expect(scan).toHaveBeenCalledTimes(2);
    const third = service.applyFolderChange(ROOT, 'TASK_2026_009');
    const fourth = service.applyFolderChange(ROOT, 'TASK_2026_010');
    await flush();
    releaseSecond?.();
    await Promise.all([second, third, fourth]);
    expect(scan).toHaveBeenCalledTimes(3);
    service.dispose();
  });

  it('rebuilds for a real edit and a delete after writer notifications', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const { service, scanner } = buildServiceWithParts(fs);
      await service.ensureStarted(ROOT);
      const scan = jest.spyOn(scanner, 'scan');
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
      await service.applyFolderChange(ROOT, 'TASK_2026_007');
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007').replace('backlog', 'active'));
      fs.fireChange(carrier('TASK_2026_007'));
      jest.advanceTimersByTime(300);
      await flush(); await flush();
      expect(scan).toHaveBeenCalledTimes(2);
      fs.deleteFile(carrier('TASK_2026_007'));
      fs.fireDelete(carrier('TASK_2026_007'));
      jest.advanceTimersByTime(300);
      await flush(); await flush();
      expect(scan).toHaveBeenCalledTimes(3);
      expect((await service.list(ROOT)).tasks.map((task) => task.id)).not.toContain('TASK_2026_007');
      service.dispose();
    } finally { jest.useRealTimers(); }
  });

  it('requeues a watcher change when its rebuild fails', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const { service, scanner } = buildServiceWithParts(fs);
      await service.ensureStarted(ROOT);
      const original = scanner.scan.bind(scanner);
      const scan = jest.spyOn(scanner, 'scan')
        .mockRejectedValueOnce(new Error('transient scan failure'))
        .mockImplementation(original);
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
      fs.fireCreate(carrier('TASK_2026_007'));
      jest.advanceTimersByTime(300);
      await flush(); await flush();
      expect(scan).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1000);
      await flush(); await flush();
      expect(scan).toHaveBeenCalledTimes(2);
      expect((await service.list(ROOT)).tasks.map((task) => task.id)).toContain('TASK_2026_007');
      service.dispose();
    } finally { jest.useRealTimers(); }
  });

  it('keeps the debounce timer of a newer event when a failed flush arms its retry', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const { service, scanner } = buildServiceWithParts(fs);
      await service.ensureStarted(ROOT);
      const original = scanner.scan.bind(scanner);
      let failFirstScan: (error: Error) => void = () => undefined;
      const scan = jest.spyOn(scanner, 'scan')
        .mockImplementationOnce(() => new Promise((_resolve, reject) => { failFirstScan = reject; }))
        .mockImplementation(original);
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
      fs.fireCreate(carrier('TASK_2026_007'));
      jest.advanceTimersByTime(300);
      await flush(); await flush();
      expect(scan).toHaveBeenCalledTimes(1);
      // A newer event arrives while the first flush is in progress.
      fs.setFile(carrier('TASK_2026_008'), validTask('TASK_2026_008'));
      fs.fireCreate(carrier('TASK_2026_008'));
      failFirstScan(new Error('transient scan failure'));
      await flush(); await flush();
      // The 300 ms debounce of the newer event is not replaced by the 1 s retry.
      jest.advanceTimersByTime(300);
      await flush(); await flush();
      expect(scan).toHaveBeenCalledTimes(2);
      const ids = (await service.list(ROOT)).tasks.map((task) => task.id);
      expect(ids).toEqual(expect.arrayContaining(['TASK_2026_007', 'TASK_2026_008']));
      service.dispose();
    } finally { jest.useRealTimers(); }
  });

  it('stops watcher retries after 1s, 5s and 30s backoff', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const { service, scanner } = buildServiceWithParts(fs);
      await service.ensureStarted(ROOT);
      const scan = jest.spyOn(scanner, 'scan').mockRejectedValue(new Error('permanent failure'));
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
      fs.fireCreate(carrier('TASK_2026_007'));
      for (const [index, delay] of [300, 1000, 5000, 30000].entries()) {
        jest.advanceTimersByTime(delay);
        await flush(); await flush();
        expect(scan).toHaveBeenCalledTimes(index + 1);
      }
      jest.advanceTimersByTime(60000);
      await flush();
      expect(scan).toHaveBeenCalledTimes(4);
      service.dispose();
    } finally { jest.useRealTimers(); }
  });

  it('does not retry a watcher rebuild when a change listener throws', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const logger = makeLogger();
      const store = new InMemoryTaskIndexStore(logger);
      const replace = jest.spyOn(store, 'replaceWorkspace');
      const service = buildServiceWith(fs, logger, store);
      await service.ensureStarted(ROOT);
      replace.mockClear();
      service.onDidChangeIndex(() => { throw new Error('listener failure'); });
      const later = jest.fn();
      service.onDidChangeIndex(later);
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
      fs.fireCreate(carrier('TASK_2026_007'));
      jest.advanceTimersByTime(300);
      await flush(); await flush();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith('[task-specs] index change listener failed', {
        error: expect.any(Error),
        errorClass: 'Error',
      });
      // A listener that throws does not stop the listeners after it.
      expect(later).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(60000);
      await flush();
      expect(replace).toHaveBeenCalledTimes(1);
      service.dispose();
    } finally { jest.useRealTimers(); }
  });

  it('does not suppress the watcher echo after a writer rebuild skips its write', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const logger = makeLogger();
      const store = new InMemoryTaskIndexStore(logger);
      const service = buildServiceWith(fs, logger, store);
      await service.ensureStarted(ROOT);
      const original = store.replaceWorkspace.bind(store);
      const replace = jest.spyOn(store, 'replaceWorkspace')
        .mockImplementationOnce(() => { throw new Error('transient SQLite failure'); })
        .mockImplementation(original);
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
      await service.applyFolderChange(ROOT, 'TASK_2026_007');
      expect(replace).toHaveBeenCalledTimes(1);
      fs.fireCreate(carrier('TASK_2026_007'));
      jest.advanceTimersByTime(300);
      await flush(); await flush();
      expect(replace).toHaveBeenCalledTimes(2);
      expect((await service.list(ROOT)).tasks.map((task) => task.id)).toContain('TASK_2026_007');
      service.dispose();
    } finally { jest.useRealTimers(); }
  });

  it('suppresses one watcher flush after two writer updates to the same carrier', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const fs = new FakeFs();
      seedTwoValidOneExcluded(fs);
      const { service, scanner } = buildServiceWithParts(fs);
      await service.ensureStarted(ROOT);
      const scan = jest.spyOn(scanner, 'scan');
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
      await service.applyFolderChange(ROOT, 'TASK_2026_007');
      fs.fireCreate(carrier('TASK_2026_007'));
      fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007').replace('backlog', 'active'));
      await service.applyFolderChange(ROOT, 'TASK_2026_007');
      fs.fireChange(carrier('TASK_2026_007'));
      jest.advanceTimersByTime(300);
      await flush(); await flush();
      expect(scan).toHaveBeenCalledTimes(2);
      service.dispose();
    } finally { jest.useRealTimers(); }
  });

  it('logs separate private phase durations without carrier content or paths', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const logger = makeLogger();
    const service = buildServiceWith(fs, logger, new InMemoryTaskIndexStore(logger));
    await service.ensureStarted(ROOT);
    const calls = [
      ...jest.mocked(logger.debug).mock.calls,
      ...jest.mocked(logger.info).mock.calls,
    ];
    const timing = calls.find(([message]) => message === '[task-specs] index rebuild timing');
    expect(timing?.[1]).toEqual(expect.objectContaining({
      trigger: 'activation', carriers: 3, rows: 2,
      enumerateMs: expect.any(Number),
      readMs: expect.any(Number),
      parseValidateMs: expect.any(Number),
      sqliteReplaceMs: expect.any(Number),
      listenerMs: expect.any(Number),
      waitedMs: expect.any(Number),
      totalMs: expect.any(Number),
    }));
    expect(JSON.stringify(timing)).not.toContain(ROOT);
    expect(JSON.stringify(timing)).not.toContain('body of');
    service.dispose();
  });

  it('reparses the changed folder and emits a write event', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const service = buildService(fs);
    const events: TaskIndexChangeEvent[] = [];
    service.onDidChangeIndex((e) => events.push(e));

    await service.ensureStarted(ROOT);
    fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
    await service.applyFolderChange(ROOT, 'TASK_2026_007');

    const list = await service.list(ROOT);
    expect(list.tasks.map((t) => t.id)).toContain('TASK_2026_007');
    const writeEvents = events.filter((e) => e.reason === 'write');
    expect(writeEvents).toHaveLength(1);
    expect(writeEvents[0].folderNames).toEqual(['TASK_2026_007']);
    service.dispose();
  });
});

describe('TaskIndexService.reindex', () => {
  it('serializes reindex behind a scheduled write and keeps the latest rows', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const { service, scanner } = buildServiceWithParts(fs);
    await service.ensureStarted(ROOT);
    const original = scanner.scan.bind(scanner);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scan = jest.spyOn(scanner, 'scan').mockImplementationOnce(async (root) => {
      await gate;
      return original(root);
    });
    fs.setFile(carrier('TASK_2026_007'), validTask('TASK_2026_007'));
    const write = service.applyFolderChange(ROOT, 'TASK_2026_007');
    await flush();
    fs.setFile(carrier('TASK_2026_008'), validTask('TASK_2026_008'));
    const reindex = service.reindex(ROOT);
    await flush();
    expect(scan).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([write, reindex]);
    expect(scan).toHaveBeenCalledTimes(2);
    expect((await service.list(ROOT)).tasks.map((task) => task.id)).toEqual(
      expect.arrayContaining(['TASK_2026_007', 'TASK_2026_008']),
    );
    service.dispose();
  });
  it('reuses a successful first-start rebuild and still emits reindex', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const { service, scanner } = buildServiceWithParts(fs);
    const scanSpy = jest.spyOn(scanner, 'scan');
    const events: TaskIndexChangeEvent[] = [];
    service.onDidChangeIndex((event) => events.push(event));

    const result = await service.reindex(ROOT);

    expect(scanSpy).toHaveBeenCalledTimes(1);
    expect(result.indexedCount).toBe(2);
    expect(result.excludedCount).toBe(1);
    expect(events).toEqual([
      {
        workspaceRoot: normalizeWorkspaceRoot(ROOT),
        folderNames: [],
        reason: 'reindex',
      },
    ]);
    service.dispose();
  });

  it('is equivalent to the watch-updated index (rebuild equivalence)', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const service = buildService(fs);

    await service.ensureStarted(ROOT);
    fs.setFile(carrier('TASK_2026_008'), validTask('TASK_2026_008'));
    await service.applyFolderChange(ROOT, 'TASK_2026_008');
    const afterWatch = (await service.list(ROOT)).tasks;

    const res = await service.reindex(ROOT);
    const afterReindex = (await service.list(ROOT)).tasks;

    expect(res.indexedCount).toBe(3);
    expect(res.excludedCount).toBe(1);
    expect(afterReindex).toEqual(afterWatch);
    service.dispose();
  });
});

describe('TaskIndexService DI', () => {
  it('resolves without a clock registration', () => {
    const child = container.createChildContainer();
    const logger = makeLogger();
    const fs = createMockFileSystemProvider();
    const scanner = new TaskScannerService(fs, logger);
    const store = new InMemoryTaskIndexStore(logger);
    child.registerInstance(TOKENS.LOGGER, logger);
    child.registerInstance(PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER, fs);
    child.registerInstance(TASK_SPECS_TOKENS.TASK_SCANNER, scanner);
    child.registerInstance(TASK_SPECS_TOKENS.TASK_INDEX_STORE, store);
    const service = child.resolve(TaskIndexService);
    expect(service).toBeInstanceOf(TaskIndexService);
    service.dispose();
    child.clearInstances();
  });
});

describe('TaskIndexService.getDetail', () => {
  it('projects merged status in list, detail, and effective status filters', async () => {
    const fs = new FakeFs();
    const id = 'TASK_2026_001';
    fs.setFile(carrier(id), validTask(id).replace('status: backlog', 'status: in_review'));
    const logger = makeLogger();
    const service = new TaskIndexService(logger, fs as unknown as IFileSystemProvider,
      new TaskScannerService(fs as unknown as IFileSystemProvider, logger),
      new InMemoryTaskIndexStore(logger), undefined,
      { mergedTaskIds: () => new Set([id]) });
    expect((await service.list(ROOT)).tasks[0]).toMatchObject({ status: 'done', carrierStatus: 'in_review' });
    expect((await service.list(ROOT, { status: ['done'] })).tasks).toHaveLength(1);
    expect((await service.list(ROOT, { status: ['in_review'] })).tasks).toHaveLength(0);
    expect((await service.list(ROOT, { filter: { ...EMPTY_TASK_FILTER, statuses: ['done'] } })).tasks).toHaveLength(1);
    expect(await service.getDetail(ROOT, id)).toMatchObject({ status: 'done', carrierStatus: 'in_review' });
    service.dispose();
  });
  it.each(['TASK_2026_123_ABC', 'TASK_2026_123_ab_cd'])(
    'reads every board-listed folder %s',
    async (folder) => {
      const fs = new FakeFs();
      fs.setFile(carrier(folder), validTask(folder));
      const service = buildService(fs);

      const board = await service.list(ROOT);
      expect(board.tasks.map((task) => task.id)).toContain(folder);
      expect(await service.readFolderMarkdown(ROOT, folder, 'task.md')).toMatchObject({
        state: 'ready', content: validTask(folder),
      });
      expect(await service.listFolderEntries(ROOT, folder, '')).toMatchObject({
        state: 'ready', entries: [{ name: 'task.md', kind: 'file' }],
      });
      expect(await service.getDetail(ROOT, folder)).toMatchObject({
        id: folder, body: `body of ${folder}`,
      });
      service.dispose();
    },
  );

  it.each(['', '..', 'a/b', 'a\\b', 'C:work'])(
    'rejects unsafe task folder %j in contained reads',
    async (folder) => {
      const fs = new FakeFs();
      const service = buildService(fs);
      expect((await service.readFolderMarkdown(ROOT, folder, 'task.md')).state).toBe('rejected');
      expect((await service.listFolderEntries(ROOT, folder, '')).state).toBe('rejected');
      await expect(service.getDetail(ROOT, folder)).rejects.toThrow('rejected');
      service.dispose();
    },
  );

  it('reports a scanned but unreadable folder name as excluded', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_123:stream'), validTask('TASK_2026_123:stream'));
    const service = buildService(fs);

    const board = await service.list(ROOT);
    expect(board.tasks).toEqual([]);
    expect(board.excluded).toContainEqual({
      folderName: 'TASK_2026_123:stream', reason: 'unreadable',
    });
    expect(board.excludedCount).toBe(1);
    service.dispose();
  });

  it('returns body + folder artifacts for a valid task', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const service = buildService(fs);

    const detail = await service.getDetail(ROOT, 'TASK_2026_001');

    expect(detail).not.toBeNull();
    expect(detail?.body).toContain('body of TASK_2026_001');
    expect(detail?.artifacts).toContain('task.md');
    service.dispose();
  });

  it('returns null for a missing task', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const service = buildService(fs);

    expect(await service.getDetail(ROOT, 'TASK_2026_999')).toBeNull();
    service.dispose();
  });
});

describe('TaskIndexService.readRoundJudge', () => {
  function seedJudge(fs: FakeFs, folder: string, round: number): void {
    fs.setFile(carrier(folder), validTask(folder));
    fs.setFile(
      path.join(specsDir(), folder, roundJudgeFile(round)),
      `## VERDICT\n\nREVISE (round ${round})`,
    );
  }

  it('reads the report for the requested round', async () => {
    const fs = new FakeFs();
    seedJudge(fs, 'TASK_2026_001', 1);
    const service = buildService(fs);

    await expect(
      service.readRoundJudge(ROOT, 'TASK_2026_001', 1),
    ).resolves.toBe('## VERDICT\n\nREVISE (round 1)');
    service.dispose();
  });

  /**
   * The path must be COMPOSED from the shared contract, never hand-written —
   * Duty 1 of the contract guard permits the literal only in
   * `task-spec.contract.ts`. Asserting against `roundJudgeFile()` rather than
   * against a string here is what makes a drift in the contract fail this test
   * instead of silently reading a file that no longer exists.
   */
  it('composes the filename via roundJudgeFile(), not a literal', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    fs.setFile(
      path.join(specsDir(), 'TASK_2026_001', roundJudgeFile(2)),
      'round two',
    );
    const service = buildService(fs);

    await expect(
      service.readRoundJudge(ROOT, 'TASK_2026_001', 2),
    ).resolves.toBe('round two');
    // Round 1 shares the folder but not the name — proves `round` selects.
    await expect(
      service.readRoundJudge(ROOT, 'TASK_2026_001', 1),
    ).resolves.toBeNull();
    service.dispose();
  });

  /**
   * An unjudged round is the ORDINARY state of a run in progress, not a fault.
   * Round 2 has no report while round 1 is still being revised.
   */
  it('returns null for an unjudged round rather than throwing', async () => {
    const fs = new FakeFs();
    seedJudge(fs, 'TASK_2026_001', 1);
    const service = buildService(fs);

    await expect(
      service.readRoundJudge(ROOT, 'TASK_2026_001', 3),
    ).resolves.toBeNull();
    service.dispose();
  });

  it('returns null for a folder that does not exist', async () => {
    const fs = new FakeFs();
    seedTwoValidOneExcluded(fs);
    const service = buildService(fs);

    await expect(
      service.readRoundJudge(ROOT, 'TASK_2026_999', 1),
    ).resolves.toBeNull();
    service.dispose();
  });
});

describe('task folder read and listing', () => {
  it('rejects a linked recognized document and a linked carrier', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    const document = path.join(specsDir(), 'TASK_2026_001', 'context.md');
    fs.setFile(document, 'outside');
    const original = fs.lstat.bind(fs);
    fs.lstat = jest.fn(async (p) => norm(p) === norm(document)
      ? { type: FileType.SymbolicLink, size: 0, ctime: 0, mtime: 0 }
      : original(p));
    const service = buildService(fs);
    await expect(service.readArtifact(ROOT, 'TASK_2026_001', 'context.md')).rejects.toThrow('rejected');
    fs.lstat = jest.fn(async (p) => norm(p) === norm(carrier('TASK_2026_001'))
      ? { type: FileType.SymbolicLink, size: 0, ctime: 0, mtime: 0 }
      : original(p));
    await expect(service.getDetail(ROOT, 'TASK_2026_001')).rejects.toThrow('rejected');
    service.dispose();
  });

  it('rejects an oversized recognized document before reading it', async () => {
    const fs = new FakeFs();
    const document = path.join(specsDir(), 'TASK_2026_001', 'context.md');
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    fs.setFile(document, 'x'.repeat(1048577));
    const read = jest.spyOn(fs, 'readFileBoundedNoFollow');
    const service = buildService(fs);
    await expect(service.readArtifact(ROOT, 'TASK_2026_001', 'context.md')).rejects.toThrow('too_large');
    expect(read).not.toHaveBeenCalled();
    service.dispose();
  });

  it('rejects a directory swapped during enumeration', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    const directory = norm(path.join(specsDir(), 'TASK_2026_001'));
    const original = fs.realpath.bind(fs);
    let swapped = false;
    const read = fs.readDirectory.bind(fs);
    fs.readDirectory = jest.fn(async (p) => { const entries = await read(p); swapped = true; return entries; });
    fs.realpath = jest.fn(async (p) => swapped && norm(p) === directory ? '/outside' : original(p));
    const service = buildService(fs);
    expect((await service.listFolderEntries(ROOT, 'TASK_2026_001', '')).state).toBe('rejected');
    service.dispose();
  });

  it('accepts a child write during listing even when directory timestamps change', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    const directory = norm(path.join(specsDir(), 'TASK_2026_001'));
    const originalStat = fs.lstat.bind(fs);
    const originalRead = fs.readDirectory.bind(fs);
    let wrote = false;
    fs.readDirectory = jest.fn(async (p) => {
      const entries = await originalRead(p);
      wrote = true;
      return entries;
    });
    fs.lstat = jest.fn(async (p) => {
      const stat = await originalStat(p);
      return norm(p) === directory && wrote ? { ...stat, mtime: 10, ctime: 10 } : stat;
    });
    const service = buildService(fs);
    expect((await service.listFolderEntries(ROOT, 'TASK_2026_001', '')).state).toBe('ready');
    service.dispose();
  });

  it('rejects a swapped directory before classifying more than 200 names', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    const directory = norm(path.join(specsDir(), 'TASK_2026_001'));
    const originalRealpath = fs.realpath.bind(fs);
    let swapped = false;
    fs.readDirectory = jest.fn(async () => {
      swapped = true;
      return Array.from({ length: 201 }, (_, i) => ({ name: `item-${i}`, type: FileType.File }));
    });
    fs.realpath = jest.fn(async (p) => {
      if (swapped && norm(p) === directory) return '/outside';
      return originalRealpath(p);
    });
    const service = buildService(fs);
    expect((await service.listFolderEntries(ROOT, 'TASK_2026_001', '')).state).toBe('rejected');
    service.dispose();
  });

  it('fails detail when folder enumeration exceeds the 200-name cap', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    fs.readDirectory = jest.fn(async () => Array.from({ length: 201 }, (_, i) => ({ name: `item-${i}`, type: FileType.File })));
    const service = buildService(fs);
    expect((await service.listFolderEntries(ROOT, 'TASK_2026_001', '')).state).toBe('too_many');
    await expect(service.getDetail(ROOT, 'TASK_2026_001')).rejects.toThrow('too_many');
    service.dispose();
  });

  it('fails detail if folder enumeration fails or the folder changes', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    const service = buildService(fs);
    fs.readDirectory = jest.fn(async () => { throw new Error('access denied'); });
    await expect(service.getDetail(ROOT, 'TASK_2026_001')).rejects.toThrow('unreadable');
    const directory = norm(path.join(specsDir(), 'TASK_2026_001'));
    const originalRealpath = fs.realpath.bind(fs);
    let swapped = false;
    fs.readDirectory = jest.fn(async () => { swapped = true; return [{ name: 'foreign.md', type: FileType.File }]; });
    fs.realpath = jest.fn(async (p) => swapped && norm(p) === directory ? '/outside' : originalRealpath(p));
    await expect(service.getDetail(ROOT, 'TASK_2026_001')).rejects.toThrow('rejected');
    service.dispose();
  });

  it('discards document bytes if the parent or file canonical path changes during read', async () => {
    for (const changed of ['parent', 'file'] as const) {
      const fs = new FakeFs();
      const document = path.join(specsDir(), 'TASK_2026_001', 'context.md');
      const directory = norm(path.dirname(document));
      fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
      fs.setFile(document, 'safe');
      const originalRead = fs.readFileBoundedNoFollow.bind(fs);
      const originalRealpath = fs.realpath.bind(fs);
      let swapped = false;
      fs.readFileBoundedNoFollow = jest.fn(async (p, max) => {
        const result = await originalRead(p, max);
        swapped = true;
        return result;
      });
      fs.realpath = jest.fn(async (p) => swapped && norm(p) === (changed === 'parent' ? directory : norm(document))
        ? '/outside' : originalRealpath(p));
      const service = buildService(fs);
      expect((await service.readFolderMarkdown(ROOT, 'TASK_2026_001', 'context.md')).state).toBe('rejected');
      service.dispose();
    }
  });

  it('reads a direct markdown child and rejects traversal as a result', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    fs.setFile(path.join(specsDir(), 'TASK_2026_001', 'decisions.md'), '# Decisions');
    const service = buildService(fs);
    expect(await service.readFolderMarkdown(ROOT, 'TASK_2026_001', 'decisions.md')).toMatchObject({ state: 'ready', content: '# Decisions' });
    expect(await service.readFolderMarkdown(ROOT, 'TASK_2026_001', '../secret.md')).toMatchObject({ state: 'rejected', content: null });
    expect(await service.listFolderEntries(ROOT, 'TASK_2026_001', '')).toMatchObject({ state: 'ready' });
    service.dispose();
  });

  it('rejects a linked task folder and a canonical escape', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    const originalLstat = fs.lstat.bind(fs);
    fs.lstat = jest.fn(async (p) => norm(p).endsWith('TASK_2026_001')
      ? { type: FileType.SymbolicLink, size: 0, ctime: 0, mtime: 0 }
      : originalLstat(p));
    const service = buildService(fs);
    expect((await service.readFolderMarkdown(ROOT, 'TASK_2026_001', 'task.md')).state).toBe('rejected');
    expect((await service.listFolderEntries(ROOT, 'TASK_2026_001', '')).state).toBe('rejected');
    service.dispose();

    fs.lstat = originalLstat;
    const originalRealpath = fs.realpath.bind(fs);
    fs.realpath = jest.fn(async (p) => norm(p).endsWith('TASK_2026_001') ? path.resolve(ROOT, '..', 'outside') : originalRealpath(p));
    const escaped = buildService(fs);
    expect((await escaped.readFolderMarkdown(ROOT, 'TASK_2026_001', 'task.md')).state).toBe('rejected');
    escaped.dispose();
  });

  it('returns unreadable if the file changes during a bounded read', async () => {
    const fs = new FakeFs();
    fs.setFile(carrier('TASK_2026_001'), validTask('TASK_2026_001'));
    fs.readFileBoundedNoFollow = jest.fn(async () => { throw Object.assign(new Error('changed'), { code: 'ELOOP' }); });
    const service = buildService(fs);
    expect((await service.readFolderMarkdown(ROOT, 'TASK_2026_001', 'task.md')).state).toBe('unreadable');
    service.dispose();
  });
});
