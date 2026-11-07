import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MIGRATIONS,
  SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import {
  createEvent,
  normalizeWorkspaceRoot,
} from '@ptah-extension/platform-core';
import {
  createMockFileSystemProvider,
  createMockWorkspaceProvider,
  type MockFileSystemProvider,
} from '@ptah-extension/platform-core/testing';
import {
  CARRIER_FILE,
  renderTaskMd,
  type TaskSpecSummary,
  type TaskStatus,
} from '@ptah-extension/shared';
import {
  NoOpTaskFolderVisibility,
  TaskWriterService,
  type IndexListResult,
  type ITaskIndexNotifier,
  type TaskIndexChangeEvent,
} from '@ptah-extension/task-specs';
import { Logger } from '@ptah-extension/vscode-core';
import {
  readTaskEndHookSettings,
  type TaskEndHookSettings,
} from '../config/task-end-hook-config';
import { SqliteTaskEndStore } from '../persistence/sqlite-task-end.store';
import type {
  GitReadResult,
  GitReadRunner,
} from '../ports/git-read-runner.port';
import { READ_ONLY_GIT_VECTORS } from '../ports/read-only-git';
import {
  OBSERVE_DEBOUNCE_MS,
  TaskEndTransitionDetector,
  type TaskEndIndexSource,
  type TaskEndRunsChanged,
} from './task-end-transition-detector';

const TASK_1 = 'TASK_2026_601';
const TASK_2 = 'TASK_2026_602';
const TASK_3 = 'TASK_2026_603';

// --- Fixtures --------------------------------------------------------------

let tmpBase: string;

beforeAll(() => {
  tmpBase = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'task-end-detector-')),
  );
});

afterAll(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

let repoSeq = 0;

/** A main checkout on disk: `<tmp>/<name>/.git` (realpath must resolve). */
function makeMainCheckout(name = `repo-${++repoSeq}`): string {
  const root = path.join(tmpBase, name);
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function makeLinkedWorktree(main: string, name: string): string {
  const root = path.join(main, '.claude-worktrees', name);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function summary(
  id: string,
  status: TaskStatus,
  frontmatterValid = true,
): TaskSpecSummary {
  return {
    id,
    folderName: id,
    status,
    type: 'FEATURE',
    title: `Task ${id}`,
    dependsOn: [],
    labels: [],
    duplicates: [],
    relatesTo: [],
    created: null,
    updated: null,
    frontmatterValid,
    validationIssues: [],
  };
}

/** Index fake: rows per root, a fireable change event, `list()` calls logged. */
class FakeIndex implements TaskEndIndexSource {
  readonly listCalls: string[] = [];
  private readonly rows = new Map<string, Map<string, TaskSpecSummary>>();
  private readonly fireChange: (event: TaskIndexChangeEvent) => void;
  readonly onDidChangeIndex: TaskEndIndexSource['onDidChangeIndex'];

  constructor() {
    const [event, fire] = createEvent<TaskIndexChangeEvent>();
    this.onDidChangeIndex = event;
    this.fireChange = fire;
  }

  set(root: string, id: string, status: TaskStatus, valid = true): void {
    const key = normalizeWorkspaceRoot(root);
    let rows = this.rows.get(key);
    if (rows === undefined) {
      rows = new Map();
      this.rows.set(key, rows);
    }
    rows.set(id, summary(id, status, valid));
  }

  fire(
    root: string,
    folderNames: string[],
    reason: TaskIndexChangeEvent['reason'],
  ): void {
    this.fireChange({
      workspaceRoot: normalizeWorkspaceRoot(root),
      folderNames,
      reason,
    });
  }

  async ensureStarted(): Promise<null> {
    return null;
  }

  async list(root: string): Promise<IndexListResult> {
    this.listCalls.push(root);
    const rows = this.rows.get(normalizeWorkspaceRoot(root));
    return {
      tasks: rows === undefined ? [] : [...rows.values()],
      excluded: [],
      excludedCount: 0,
      specsDirExists: true,
    };
  }
}

/**
 * Git fake answering rows 1 and 2 for the repositories a spec declares:
 * the main checkout reports `.git`, a linked worktree the absolute common
 * dir, and every worktree lists the main checkout first.
 */
const HEAD = '0123456789abcdef0123456789abcdef01234567';

class FakeGit implements GitReadRunner {
  private readonly worktreesOf = new Map<string, string[]>();
  readonly calls: { args: readonly string[]; cwd: string }[] = [];

  addRepo(main: string, ...linked: string[]): void {
    this.worktreesOf.set(main, [main, ...linked]);
  }

  async run(args: readonly string[], cwd: string): Promise<GitReadResult> {
    this.calls.push({ args, cwd });
    for (const [main, worktrees] of this.worktreesOf) {
      if (!worktrees.includes(cwd)) continue;
      if (args.join(' ') === READ_ONLY_GIT_VECTORS.commonDir().join(' ')) {
        const out = cwd === main ? '.git' : path.join(main, '.git');
        return { stdout: `${out}\n`, stderr: '', exitCode: 0 };
      }
      if (args.join(' ') === READ_ONLY_GIT_VECTORS.worktreeList().join(' ')) {
        const blocks = worktrees.map((wt) => `worktree ${wt}\0HEAD ${HEAD}`);
        const stdout = `${blocks.join('\0\0')}\0\0`;
        return { stdout, stderr: '', exitCode: 0 };
      }
    }
    return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 };
  }
}

/**
 * Notifier whose `applyFolderChange` synchronously fires the index event for
 * the folder with the carrier now `done`, then (when `hold` is set) waits
 * until the test releases it.
 */
class HeldNotifier implements ITaskIndexNotifier {
  private readonly releases: (() => void)[] = [];
  hold = false;

  constructor(private readonly index: FakeIndex) {}

  applyFolderChange(workspaceRoot: string, folderName: string): Promise<void> {
    this.index.set(workspaceRoot, folderName, 'done');
    this.index.fire(workspaceRoot, [folderName], 'write');
    if (!this.hold) return Promise.resolve();
    return new Promise<void>((resolve) => this.releases.push(resolve));
  }

  get held(): number {
    return this.releases.length;
  }

  releaseNext(): void {
    const next = this.releases.shift();
    if (next === undefined) throw new Error('no held notification');
    next();
  }
}

function makeLogger(): Logger {
  const logger = Object.create(Logger.prototype) as Logger;
  logger.info = jest.fn();
  logger.debug = jest.fn();
  logger.warn = jest.fn();
  logger.error = jest.fn();
  return logger;
}

function settingsWith(enabled: boolean): TaskEndHookSettings {
  return {
    ...readTaskEndHookSettings(createMockWorkspaceProvider()),
    enabled,
    queueCap: 500,
  };
}

interface Harness {
  readonly db: SqliteDatabase;
  readonly store: SqliteTaskEndStore;
  readonly index: FakeIndex;
  readonly git: FakeGit;
  readonly logger: Logger;
  readonly mockFs: MockFileSystemProvider;
  readonly writer: TaskWriterService;
  readonly notifier: HeldNotifier;
  readonly folders: string[];
  readonly settings: { enabled: boolean };
  detector(): TaskEndTransitionDetector;
  count(table: string): number;
}

function setup(db?: SqliteDatabase): Harness {
  const Database = require('better-sqlite3') as new (
    file: string,
  ) => SqliteDatabase;
  const database = db ?? new Database(':memory:');
  if (db === undefined) {
    database.pragma('foreign_keys = ON');
    for (const migration of MIGRATIONS) {
      if (migration.sql) database.exec(migration.sql);
    }
  }
  const logger = makeLogger();
  const connection = new SqliteConnectionService(':memory:', logger);
  Object.defineProperty(connection, 'db', { value: database });
  const store = new SqliteTaskEndStore(connection, logger, {
    now: () => Date.now(),
  });
  const index = new FakeIndex();
  const git = new FakeGit();
  const mockFs = createMockFileSystemProvider();
  const folders: string[] = [];
  const settings = { enabled: true };
  const notifier = new HeldNotifier(index);
  const writer = new TaskWriterService(
    mockFs,
    logger,
    notifier,
    new NoOpTaskFolderVisibility(),
  );
  return {
    db: database,
    store,
    index,
    git,
    logger,
    mockFs,
    writer,
    notifier,
    folders,
    settings,
    detector: () => {
      const [workspaceEvent] = createEvent<void>();
      return new TaskEndTransitionDetector(
        store,
        index,
        writer,
        {
          getWorkspaceFolders: () => [...folders],
          onDidChangeWorkspaceFolders: workspaceEvent,
        },
        git,
        { read: () => settingsWith(settings.enabled) },
        logger,
      );
    },
    count: (table) =>
      (
        database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
          n: number;
        }
      ).n,
  };
}

async function seedCarrier(
  h: Harness,
  root: string,
  taskId: string,
): Promise<void> {
  await h.mockFs.writeFile(
    path.join(root, '.ptah', 'specs', taskId, CARRIER_FILE),
    renderTaskMd({
      id: taskId,
      title: 'Detector under test',
      type: 'FEATURE',
      status: 'in_progress',
      now: '2026-11-01T00:00:00.000Z',
    }),
  );
}

/** Lets the commit timer fire, then waits for the serial flush to finish. */
async function commit(
  detector: TaskEndTransitionDetector,
  ms = OBSERVE_DEBOUNCE_MS,
): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  await detector.whenIdle();
}

/** Registers `root`, baselines it with `rows`, subscribes. */
async function started(
  h: Harness,
  root: string,
  rows: Record<string, TaskStatus>,
): Promise<TaskEndTransitionDetector> {
  for (const [id, status] of Object.entries(rows))
    h.index.set(root, id, status);
  if (!h.folders.includes(root)) h.folders.push(root);
  const detector = h.detector();
  await detector.reconcileStartup();
  detector.subscribe();
  return detector;
}

function runsOf(
  h: Harness,
  taskId: string,
): { main_root: string | null; source: string }[] {
  return h.db
    .prepare('SELECT main_root, source FROM task_end_runs WHERE task_id = ?')
    .all(taskId) as { main_root: string | null; source: string }[];
}

function duplicateLogs(h: Harness): number {
  return (h.logger.info as jest.Mock).mock.calls.filter(
    (call) => call[0] === '[task-end-hook] duplicate-ignored',
  ).length;
}

/** Waits until the held notifier has a write parked at its notification. */
async function waitForHeld(h: Harness): Promise<void> {
  for (let i = 0; i < 100 && h.notifier.held === 0; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** A main checkout the fake git knows. */
function gitRepo(h: Harness): string {
  const root = makeMainCheckout();
  h.git.addRepo(root);
  return root;
}

describe('TaskEndTransitionDetector', () => {
  let detectors: TaskEndTransitionDetector[];
  let h: Harness;

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    h = setup();
    detectors = [];
  });

  afterEach(async () => {
    for (const detector of detectors) detector.dispose();
    jest.useRealTimers();
    h.db.close();
  });

  async function start(
    root: string,
    rows: Record<string, TaskStatus>,
  ): Promise<TaskEndTransitionDetector> {
    const detector = await started(h, root, rows);
    detectors.push(detector);
    return detector;
  }

  describe('post-write boundary (AC 1.8)', () => {
    it('held writer: commits only after the write has returned', async () => {
      const root = gitRepo(h);
      await seedCarrier(h, root, TASK_1);
      const detector = await start(root, { [TASK_1]: 'in_progress' });
      const order: string[] = [];
      const journal = jest.spyOn(h.store, 'journalObservation');
      journal.mockImplementation((...args) => {
        order.push('journal-commit');
        return SqliteTaskEndStore.prototype.journalObservation.apply(
          h.store,
          args,
        );
      });
      const listsBefore = h.index.listCalls.length;
      const runsBefore = h.count('task_end_runs');
      const transitionsBefore = h.count('task_end_transitions');

      h.notifier.hold = true;
      const write = h.writer.updateMetadata(root, TASK_1, { status: 'done' });
      let returned = false;
      void write.then(() => {
        returned = true;
      });
      await waitForHeld(h);
      expect(h.notifier.held).toBe(1);

      // 10 s = 40 debounce periods with the write held at its notification.
      await jest.advanceTimersByTimeAsync(10_000);
      await detector.whenIdle();
      expect(returned).toBe(false);
      expect(journal).not.toHaveBeenCalled();
      expect(h.index.listCalls).toHaveLength(listsBefore);
      expect(h.count('task_end_transitions')).toBe(transitionsBefore);
      expect(h.count('task_end_runs')).toBe(runsBefore);

      h.notifier.releaseNext();
      const result = await write;
      expect(result.success).toBe(true);
      order.push('write-returned');

      await commit(detector);
      expect(order).toEqual(['write-returned', 'journal-commit']);
      expect(runsOf(h, TASK_1)).toEqual([{ main_root: root, source: 'write' }]);
    });

    it('settle re-check: a write starting before the timer delays the commit to its settle', async () => {
      const root = gitRepo(h);
      await seedCarrier(h, root, TASK_1);
      await seedCarrier(h, root, TASK_2);
      const detector = await start(root, {
        [TASK_1]: 'in_progress',
        [TASK_2]: 'in_progress',
      });
      const journal = jest.spyOn(h.store, 'journalObservation');

      h.notifier.hold = true;
      const first = h.writer.updateMetadata(root, TASK_1, { status: 'done' });
      await waitForHeld(h);
      h.notifier.releaseNext();
      await first;
      expect(h.writer.hasWriteInFlight(root)).toBe(false);

      // The second write starts inside the 250 ms window.
      await jest.advanceTimersByTimeAsync(100);
      const second = h.writer.updateMetadata(root, TASK_2, { status: 'done' });
      await waitForHeld(h);
      await jest.advanceTimersByTimeAsync(5_000);
      await detector.whenIdle();
      expect(journal).not.toHaveBeenCalled();

      h.notifier.releaseNext();
      await second;
      await commit(detector);
      expect(journal).toHaveBeenCalledTimes(2);
      expect(h.count('task_end_runs')).toBe(2);
    });

    it('bulk path: deferred writes then one index change give one commit and three runs', async () => {
      const root = gitRepo(h);
      for (const id of [TASK_1, TASK_2, TASK_3]) await seedCarrier(h, root, id);
      const detector = await start(root, {
        [TASK_1]: 'in_progress',
        [TASK_2]: 'in_progress',
        [TASK_3]: 'in_progress',
      });
      const listsBefore = h.index.listCalls.length;

      for (const id of [TASK_1, TASK_2, TASK_3]) {
        const result = await h.writer.updateMetadata(
          root,
          id,
          { status: 'done' },
          { deferNotify: true },
        );
        expect(result.success).toBe(true);
        h.index.set(root, id, 'done');
      }
      await commit(detector);
      expect(h.count('task_end_runs')).toBe(0);

      // The bulk handler's single index notification after every write.
      h.index.fire(root, [TASK_1, TASK_2, TASK_3], 'write');
      await commit(detector);

      expect(h.index.listCalls).toHaveLength(listsBefore + 1);
      expect(h.count('task_end_runs')).toBe(3);
    });

    it('watcher path: commits 250 ms after the event when no write is in flight', async () => {
      const root = gitRepo(h);
      const detector = await start(root, { [TASK_1]: 'in_progress' });

      h.index.set(root, TASK_1, 'done');
      h.index.fire(root, [TASK_1], 'watcher');
      await jest.advanceTimersByTimeAsync(OBSERVE_DEBOUNCE_MS - 1);
      await detector.whenIdle();
      expect(h.count('task_end_runs')).toBe(0);

      await commit(detector, 1);
      expect(runsOf(h, TASK_1)).toEqual([
        { main_root: root, source: 'watcher' },
      ]);
    });

    it('the listener does no I/O: no list() and no git call until the timer fires', async () => {
      const root = gitRepo(h);
      await start(root, { [TASK_1]: 'in_progress' });
      const lists = h.index.listCalls.length;
      const gitCalls = h.git.calls.length;

      h.index.set(root, TASK_1, 'done');
      h.index.fire(root, [TASK_1], 'watcher');

      expect(h.index.listCalls).toHaveLength(lists);
      expect(h.git.calls).toHaveLength(gitCalls);
    });
  });

  describe('deduplication and episodes', () => {
    it("the writer's own watcher echo gives one run and one duplicate-ignored (AC 1.3)", async () => {
      const root = gitRepo(h);
      await seedCarrier(h, root, TASK_1);
      const detector = await start(root, { [TASK_1]: 'in_progress' });

      await h.writer.updateMetadata(root, TASK_1, { status: 'done' });
      await commit(detector);
      h.index.fire(root, [TASK_1], 'watcher');
      await commit(detector);

      expect(h.count('task_end_runs')).toBe(1);
      expect(duplicateLogs(h)).toBe(1);
    });

    it('watcher then write for the same change gives one run and one duplicate-ignored (AC 1.3)', async () => {
      const root = gitRepo(h);
      await seedCarrier(h, root, TASK_1);
      const detector = await start(root, { [TASK_1]: 'in_progress' });

      h.index.set(root, TASK_1, 'done');
      h.index.fire(root, [TASK_1], 'watcher');
      await commit(detector);
      await h.writer.updateMetadata(root, TASK_1, { status: 'done' });
      await commit(detector);

      expect(runsOf(h, TASK_1)).toEqual([
        { main_root: root, source: 'watcher' },
      ]);
      expect(duplicateLogs(h)).toBe(1);
    });

    it('the worktree root then the main root after merge gives one run (AC 1.3)', async () => {
      const main = makeMainCheckout();
      const wt = makeLinkedWorktree(main, 'wt-merge');
      h.git.addRepo(main, wt);
      h.folders.push(main);
      h.index.set(main, TASK_1, 'in_progress');
      const detector = await start(wt, { [TASK_1]: 'in_progress' });

      h.index.set(wt, TASK_1, 'done');
      h.index.fire(wt, [TASK_1], 'watcher');
      await commit(detector);
      h.index.set(main, TASK_1, 'done');
      h.index.fire(main, [TASK_1], 'watcher');
      await commit(detector);

      expect(runsOf(h, TASK_1)).toEqual([
        { main_root: main, source: 'watcher' },
      ]);
      expect(duplicateLogs(h)).toBe(1);
    });

    it('reopen and re-terminal gives episode 2 (AC 1.4)', async () => {
      const root = gitRepo(h);
      const detector = await start(root, { [TASK_1]: 'in_progress' });

      for (const status of ['done', 'in_progress', 'done'] as const) {
        h.index.set(root, TASK_1, status);
        h.index.fire(root, [TASK_1], 'watcher');
        await commit(detector);
      }

      const episodes = h.db
        .prepare('SELECT episode, state FROM task_end_runs ORDER BY episode')
        .all() as { episode: number; state: string }[];
      expect(episodes.map((e) => e.episode)).toEqual([1, 2]);
      expect(episodes[0]?.state).toBe('cancelled');
    });

    it('two repositories with the same task id do not collide (AC 1.5)', async () => {
      const a = gitRepo(h);
      const b = gitRepo(h);
      h.folders.push(a);
      h.index.set(a, TASK_1, 'in_progress');
      const detector = await start(b, { [TASK_1]: 'in_progress' });

      h.index.set(a, TASK_1, 'done');
      h.index.set(b, TASK_1, 'done');
      h.index.fire(a, [TASK_1], 'watcher');
      h.index.fire(b, [TASK_1], 'watcher');
      await commit(detector);

      const runs = runsOf(h, TASK_1)
        .map((r) => r.main_root)
        .sort();
      expect(runs).toEqual([a, b].sort());
    });
  });

  describe('startup and settings', () => {
    it('300 terminal fixtures at baseline give 0 runs (AC 1.6)', async () => {
      const root = gitRepo(h);
      const rows: Record<string, TaskStatus> = {};
      for (let i = 0; i < 300; i++) {
        rows[`TASK_2026_${String(700 + i).padStart(3, '0')}`] =
          i % 2 === 0 ? 'done' : 'cancelled';
      }
      await start(root, rows);

      expect(h.count('task_end_runs')).toBe(0);
      expect(h.count('task_end_journal')).toBe(300);
      expect(h.count('task_end_repo_state')).toBe(1);
    });

    it('disabled gives hook-disabled and no runs (AC 1.7)', async () => {
      const root = gitRepo(h);
      const detector = await start(root, { [TASK_1]: 'in_progress' });
      h.settings.enabled = false;

      h.index.set(root, TASK_1, 'done');
      h.index.fire(root, [TASK_1], 'watcher');
      await commit(detector);

      expect(h.count('task_end_runs')).toBe(0);
      expect(
        h.db
          .prepare(
            'SELECT no_run_reason FROM task_end_transitions WHERE task_id = ?',
          )
          .all(TASK_1),
      ).toEqual([{ no_run_reason: 'hook-disabled' }]);
    });

    it('startup with a stale journal gives one run (AC 1.9)', async () => {
      const root = gitRepo(h);
      const first = await start(root, { [TASK_1]: 'in_progress' });
      first.dispose();

      // The carrier ended while the app was closed.
      h.index.set(root, TASK_1, 'done');
      const second = h.detector();
      detectors.push(second);
      await second.reconcileStartup();

      expect(runsOf(h, TASK_1)).toEqual([
        { main_root: root, source: 'startup-reconcile' },
      ]);
    });

    it('a kill between the carrier write and the journal write gives one run (AC 1.9)', async () => {
      const root = gitRepo(h);
      await seedCarrier(h, root, TASK_1);
      const first = await start(root, { [TASK_1]: 'in_progress' });

      // The write lands and is seen, but the process dies before the commit.
      await h.writer.updateMetadata(root, TASK_1, { status: 'done' });
      first.dispose();
      await jest.advanceTimersByTimeAsync(10_000);
      expect(h.count('task_end_runs')).toBe(0);

      const reborn = setup(h.db);
      reborn.git.addRepo(root);
      reborn.folders.push(root);
      reborn.index.set(root, TASK_1, 'done');
      const second = reborn.detector();
      detectors.push(second);
      await second.reconcileStartup();
      await second.reconcileStartup();

      expect(runsOf(h, TASK_1)).toHaveLength(1);
    });

    it('a first-seen terminal carrier after the baseline gives a run (AC 1.10)', async () => {
      const root = gitRepo(h);
      const detector = await start(root, { [TASK_1]: 'in_progress' });

      h.index.set(root, TASK_2, 'done');
      h.index.fire(root, [TASK_2], 'watcher');
      await commit(detector);

      expect(runsOf(h, TASK_2)).toHaveLength(1);
    });

    it('an invalid carrier gives no run and no journal row (AC 1.11)', async () => {
      const root = gitRepo(h);
      const detector = await start(root, { [TASK_1]: 'in_progress' });
      const journalRows = h.count('task_end_journal');

      h.index.set(root, TASK_2, 'done', false);
      h.index.fire(root, [TASK_2], 'watcher');
      await commit(detector);

      expect(h.count('task_end_runs')).toBe(0);
      expect(h.count('task_end_journal')).toBe(journalRows);
    });

    it('a reindex event commits every row of the root', async () => {
      const root = gitRepo(h);
      const detector = await start(root, {
        [TASK_1]: 'in_progress',
        [TASK_2]: 'in_progress',
      });

      h.index.set(root, TASK_1, 'done');
      h.index.set(root, TASK_2, 'cancelled');
      h.index.fire(root, [], 'reindex');
      await commit(detector);

      expect(runsOf(h, TASK_1)).toEqual([
        { main_root: root, source: 'reindex' },
      ]);
      expect(runsOf(h, TASK_2)).toEqual([
        { main_root: root, source: 'reindex' },
      ]);
    });

    it('worktree-only startup: the run and repo state hold the unregistered main checkout', async () => {
      const main = makeMainCheckout();
      const wt = makeLinkedWorktree(main, 'wt-a');
      h.git.addRepo(main, wt);
      const detector = await start(wt, { [TASK_1]: 'in_progress' });
      expect(h.folders).toEqual([wt]);

      h.index.set(wt, TASK_1, 'done');
      h.index.fire(wt, [TASK_1], 'watcher');
      await commit(detector);

      expect(runsOf(h, TASK_1)).toEqual([
        { main_root: main, source: 'watcher' },
      ]);
      expect(
        h.db.prepare('SELECT main_root FROM task_end_repo_state').all(),
      ).toEqual([{ main_root: main }]);
    });

    it('skips a root whose identity cannot be resolved, without throwing', async () => {
      const root = path.join(tmpBase, 'missing-root');
      h.folders.push(root);
      h.index.set(root, TASK_1, 'done');
      const detector = h.detector();
      detectors.push(detector);

      await expect(detector.reconcileStartup()).resolves.toBeUndefined();
      expect(h.count('task_end_repo_state')).toBe(0);
      expect(h.logger.warn).toHaveBeenCalledWith(
        '[task-end-hook] repository identity unresolved',
        { error: 'root-realpath-failed' },
      );
    });
  });

  describe('run notifications', () => {
    it('announces created and cancelled runs to subscribers', async () => {
      const root = gitRepo(h);
      const detector = await start(root, { [TASK_1]: 'in_progress' });
      // cachedRepoId: the resolved root hits the cache, an unseen root does not.
      expect(detector.cachedRepoId(root)).toBe(path.join(root, '.git'));
      expect(detector.cachedRepoId(makeMainCheckout())).toBeNull();
      const events: TaskEndRunsChanged[] = [];
      detector.onDidChangeRuns((event) => events.push(event));

      h.index.set(root, TASK_1, 'done');
      h.index.fire(root, [TASK_1], 'watcher');
      await commit(detector);
      h.index.set(root, TASK_1, 'in_progress');
      h.index.fire(root, [TASK_1], 'watcher');
      await commit(detector);

      expect(events).toHaveLength(2);
      expect(events[0]?.createdRunIds).toHaveLength(1);
      expect(events[1]?.cancelledRunIds).toEqual(events[0]?.createdRunIds);
    });

    it('stops observing after dispose', async () => {
      const root = gitRepo(h);
      const detector = await start(root, { [TASK_1]: 'in_progress' });
      detector.dispose();

      h.index.set(root, TASK_1, 'done');
      h.index.fire(root, [TASK_1], 'watcher');
      await commit(detector);

      expect(h.count('task_end_runs')).toBe(0);
    });
  });
});
