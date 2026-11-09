/**
 * End-to-end integration spec (plan Component 12): the real SQLite store
 * (migrations through `MIGRATIONS`), the real detector, worker and step
 * runners, wired through `connectTaskEndHook`. Only the host ports (curation,
 * harvest, census, session links, activity, PR status, git) are doubles.
 * No real LLM, git or network call is made.
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { container as rootContainer } from 'tsyringe';
import { MemoryTriggerService } from '@ptah-extension/memory-curator';
import {
  MIGRATIONS,
  SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import {
  createEvent,
  normalizeWorkspaceRoot,
} from '@ptah-extension/platform-core';
import type {
  TaskEndCurationResult,
  TaskEndRunRecord,
  TaskEndStepKind,
  TaskSpecSummary,
  TaskStatus,
} from '@ptah-extension/shared';
import type {
  IndexListResult,
  TaskIndexChangeEvent,
} from '@ptah-extension/task-specs';
import { Logger } from '@ptah-extension/vscode-core';
import type { TaskEndHookSettings } from './config/task-end-hook-config';
import { TASK_END_TOKENS } from './di/tokens';
import { connectTaskEndHook, type TaskEndHookHandle } from './di/register';
import {
  SqliteTaskEndStore,
  type TaskEndStoreFaultPoint,
} from './persistence/sqlite-task-end.store';
import type { TaskEndRunPolicy } from './persistence/task-end-store.interface';
import type { ActivityPort } from './ports/activity.port';
import type { CensusPort } from './ports/census.port';
import type { CurationPort } from './ports/curation.port';
import type {
  GitReadResult,
  GitReadRunner,
} from './ports/git-read-runner.port';
import type { HarvestPort } from './ports/harvest.port';
import type { PrStatusPort } from './ports/pr-status.port';
import {
  assertReadOnlyGitVector,
  READ_ONLY_GIT_VECTORS,
} from './ports/read-only-git';
import type { SessionLinkPort } from './ports/session-link.port';
import { CensusCoordinator } from './steps/census-coordinator';
import { CloseCurateStep } from './steps/close-curate.step';
import { DisposeEvaluateStep } from './steps/dispose-evaluate.step';
import { HarvestStep } from './steps/harvest.step';
import { IndexRequestStep } from './steps/index-request.step';
import {
  OBSERVE_DEBOUNCE_MS,
  TaskEndTransitionDetector,
  type TaskEndIndexSource,
} from './trigger/task-end-transition-detector';
import { TaskEndRunWorker } from './worker/task-end-run-worker';

const TASK = 'TASK_2026_001_abcd';
const SHA = 'a'.repeat(40);
const SETTLE_MS = 5_000;
const POLICY: TaskEndRunPolicy = {
  hookEnabled: true,
  settleWindowMs: SETTLE_MS,
  queueCap: 10,
};
const SETTINGS: TaskEndHookSettings = {
  enabled: true,
  disposalMode: 'off',
  settleWindowMs: SETTLE_MS,
  queueCap: 10,
  censusCooldownMs: 0,
  maxWorktreesPerRun: 8,
  archive: { maxBytes: 1_000_000, maxFiles: 100 },
  memory: { enabled: true, sessionEndEnabled: true, bootScanIdleBackoffMs: 0 },
};
const RAN: TaskEndCurationResult = {
  kind: 'ran',
  counts: { extracted: 2, merged: 1, created: 1 },
  transcript: 'read',
};

const ok = <T>(value: T) => ({ kind: 'ok', value }) as const;

// --- Fixtures --------------------------------------------------------------

let tmp: string;
let seq = 0;

function writeCarrier(root: string, taskId: string, status: TaskStatus): void {
  const dir = path.join(root, '.ptah', 'specs', taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'task.md'),
    `---\nid: ${taskId}\nstatus: ${status}\ntitle: Fixture ${taskId}\n---\n\nBody.\n`,
  );
}

function summary(id: string, status: TaskStatus): TaskSpecSummary {
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
    frontmatterValid: true,
    validationIssues: [],
  };
}

class FakeIndex implements TaskEndIndexSource {
  private readonly rows = new Map<string, Map<string, TaskSpecSummary>>();
  private readonly fireChange: (event: TaskIndexChangeEvent) => void;
  readonly onDidChangeIndex: TaskEndIndexSource['onDidChangeIndex'];

  constructor() {
    const [event, fire] = createEvent<TaskIndexChangeEvent>();
    this.onDidChangeIndex = event;
    this.fireChange = fire;
  }

  set(root: string, id: string, status: TaskStatus): void {
    const key = normalizeWorkspaceRoot(root);
    const rows = this.rows.get(key) ?? new Map<string, TaskSpecSummary>();
    rows.set(id, summary(id, status));
    this.rows.set(key, rows);
  }

  fire(root: string, folderNames: string[]): void {
    this.fireChange({
      workspaceRoot: normalizeWorkspaceRoot(root),
      folderNames,
      reason: 'watcher',
    });
  }

  async ensureStarted(): Promise<null> {
    return null;
  }

  async list(root: string): Promise<IndexListResult> {
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
 * Fake git for one repository: rows 1 to 6 of the plan's command table,
 * answered from the declared worktrees. Every vector is recorded.
 */
class FakeGit implements GitReadRunner {
  readonly calls: { args: readonly string[]; cwd: string }[] = [];

  constructor(
    private readonly main: string,
    private readonly linked: { path: string; branch: string }[],
  ) {}

  async run(args: readonly string[], cwd: string): Promise<GitReadResult> {
    this.calls.push({ args, cwd });
    const out = (stdout: string, exitCode = 0): GitReadResult => ({
      stdout,
      stderr: '',
      exitCode,
    });
    const line = args.join(' ');
    if (line === READ_ONLY_GIT_VECTORS.commonDir().join(' ')) {
      return out(cwd === this.main ? '.git\n' : `${this.main}/.git\n`);
    }
    if (line === READ_ONLY_GIT_VECTORS.worktreeList().join(' ')) {
      const blocks = [
        `worktree ${this.main}\0HEAD ${SHA}\0branch refs/heads/main\0`,
        ...this.linked.map(
          (wt) =>
            `worktree ${wt.path}\0HEAD ${SHA}\0branch refs/heads/${wt.branch}\0`,
        ),
      ];
      return out(blocks.map((block) => `${block}\0`).join(''));
    }
    if (args[0] === 'status') return out('');
    if (args[0] === 'rev-parse') return out(`${SHA}\n`);
    if (args[0] === 'merge-base') return out('', 0);
    throw new Error(`unexpected git call ${line}`);
  }
}

interface Ports {
  readonly curation: jest.Mocked<CurationPort>;
  readonly harvest: jest.Mocked<HarvestPort>;
  readonly census: jest.Mocked<CensusPort>;
  readonly sessionLinks: jest.Mocked<SessionLinkPort>;
  readonly activity: jest.Mocked<ActivityPort>;
  readonly prStatus: jest.Mocked<PrStatusPort>;
}

function makePorts(root: string): Ports {
  let indexedAt: number | null = null;
  return {
    curation: { curateEndedSession: jest.fn().mockResolvedValue(RAN) },
    harvest: {
      harvestTask: jest
        .fn()
        .mockResolvedValue({ outcome: 'harvested', reconciled: 1 }),
    },
    census: {
      symbolsEnabled: jest.fn().mockResolvedValue(true),
      isCensusActive: jest.fn().mockReturnValue(false),
      lastIndexedAt: jest.fn().mockImplementation(async () => indexedAt),
      lastError: jest.fn().mockResolvedValue(null),
      requestCensus: jest.fn().mockImplementation(async () => {
        indexedAt = Date.now();
      }),
    },
    sessionLinks: {
      linkedSessions: jest.fn().mockReturnValue([]),
      worktreePathForSession: jest.fn().mockReturnValue(null),
      taskIdsInWorktreeName: jest.fn().mockReturnValue([]),
    },
    activity: {
      isSessionLive: jest.fn().mockReturnValue(ok(false)),
      liveSessionRoots: jest.fn().mockReturnValue(ok([])),
      trackedLaneDirs: jest.fn().mockReturnValue(ok([])),
      registeredWorkspaceRoots: jest.fn().mockReturnValue(ok([root])),
      foregroundActive: jest.fn().mockReturnValue(ok(false)),
    },
    prStatus: { openPrStatus: jest.fn().mockResolvedValue({ kind: 'none' }) },
  };
}

interface Boot {
  readonly detector: TaskEndTransitionDetector;
  readonly worker: TaskEndRunWorker;
  readonly handle: TaskEndHookHandle;
}

interface Harness {
  readonly root: string;
  readonly worktree: string;
  readonly db: SqliteDatabase;
  readonly logger: Logger;
  readonly index: FakeIndex;
  readonly git: FakeGit;
  readonly ports: Ports;
  readonly boots: Boot[];
  /** One "process start" over the shared database, ports and index. */
  boot(fault?: (point: TaskEndStoreFaultPoint) => void): Boot;
  count(sql: string): number;
}

const harnesses: Harness[] = [];

function setup(): Harness {
  const root = path.join(tmp, `repo-${++seq}`);
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  const worktree = path.join(root, '.claude-worktrees', `a-${TASK}`);
  fs.mkdirSync(worktree, { recursive: true });

  const Database = require('better-sqlite3') as new (
    file: string,
  ) => SqliteDatabase;
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    if (migration.sql) db.exec(migration.sql);
  }
  const logger = Object.create(Logger.prototype) as Logger;
  logger.info = jest.fn();
  logger.debug = jest.fn();
  logger.warn = jest.fn();
  logger.error = jest.fn();
  const connection = new SqliteConnectionService(':memory:', logger);
  Object.defineProperty(connection, 'db', { value: db });

  const index = new FakeIndex();
  const git = new FakeGit(root, [{ path: worktree, branch: `feat/${TASK}` }]);
  const ports = makePorts(root);
  const boots: Boot[] = [];
  const settings = { read: () => SETTINGS };

  const h: Harness = {
    root,
    worktree,
    db,
    logger,
    index,
    git,
    ports,
    boots,
    count: (sql) => (db.prepare(sql).get() as { n: number }).n,
    boot: (fault) => {
      const store = new SqliteTaskEndStore(connection, logger, {
        now: () => Date.now(),
        faultAfterTransitionInsert: fault,
      });
      const coordinator = new CensusCoordinator(store, ports.census, logger);
      const worker = new TaskEndRunWorker(
        store,
        new CloseCurateStep(
          store,
          ports.curation,
          ports.sessionLinks,
          ports.activity,
          logger,
        ),
        new HarvestStep(store, ports.harvest, logger),
        new DisposeEvaluateStep(
          store,
          ports.sessionLinks,
          ports.activity,
          ports.prStatus,
          git,
          settings,
          logger,
        ),
        new IndexRequestStep(
          store,
          ports.census,
          ports.activity,
          coordinator,
          settings,
          logger,
        ),
        coordinator,
        settings,
        logger,
      );
      const [folderEvent] = createEvent<void>();
      const detector = new TaskEndTransitionDetector(
        store,
        index,
        {
          hasWriteInFlight: () => false,
          onDidSettleWrites: createEvent<never>()[0],
        },
        {
          getWorkspaceFolders: () => [root],
          onDidChangeWorkspaceFolders: folderEvent,
        },
        git,
        settings,
        logger,
      );
      const child = rootContainer.createChildContainer();
      child.registerInstance(TASK_END_TOKENS.DETECTOR, detector);
      child.registerInstance(TASK_END_TOKENS.WORKER, worker);
      const boot = { detector, worker, handle: connectTaskEndHook(child) };
      boots.push(boot);
      return boot;
    },
  };
  harnesses.push(h);
  return h;
}

function runIds(h: Harness, taskId: string): string[] {
  return (
    h.db
      .prepare('SELECT run_id FROM task_end_runs WHERE task_id = ?')
      .all(taskId) as { run_id: string }[]
  ).map((row) => row.run_id);
}

function runOf(h: Harness, runId: string): TaskEndRunRecord {
  const record = new SqliteTaskEndStore(
    Object.defineProperty(
      Object.create(SqliteConnectionService.prototype),
      'db',
      { value: h.db },
    ) as SqliteConnectionService,
    h.logger,
  ).getRun(runId);
  if (record === null) throw new Error(`no run ${runId}`);
  return record;
}

/** `state/reason` of every entry of one step kind, in stored order. */
function outcomes(h: Harness, runId: string, step: TaskEndStepKind): string[] {
  return runOf(h, runId)
    .steps.filter((entry) => entry.step === step)
    .map((entry) =>
      entry.outcome.state === 'pending'
        ? 'pending'
        : `${entry.outcome.state}/${entry.outcome.reason}`,
    );
}

/** Fires due timers, then waits until detectors and workers are idle. */
async function flush(h: Harness, ms = 0): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 8; i++) {
    for (const boot of h.boots) await boot.handle.awaitStopped();
    await new Promise((resolve) => setImmediate(resolve));
    await jest.advanceTimersByTimeAsync(0);
  }
}

/** Polls (carrier reads are real I/O) until `condition` holds. */
async function until(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 10_000;
  while (!condition() && performance.now() < deadline) {
    await jest.advanceTimersByTimeAsync(0);
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(condition()).toBe(true);
}

/** Baselines the repository with TASK in progress, then subscribes. */
async function baseline(h: Harness, boot: Boot): Promise<void> {
  writeCarrier(h.root, TASK, 'in_progress');
  h.index.set(h.root, TASK, 'in_progress');
  await boot.detector.reconcileStartup();
  boot.detector.subscribe();
}

/** The carrier ends: written on disk, seen by the index, committed after the debounce. */
async function endTask(
  h: Harness,
  boot: Boot,
  afterFixtures: () => void = () => undefined,
): Promise<void> {
  // Fixtures first; `afterFixtures` lets a spec start observing before detection.
  writeCarrier(h.root, TASK, 'done');
  afterFixtures();
  h.index.set(h.root, TASK, 'done');
  h.index.fire(h.root, [TASK]);
  await jest.advanceTimersByTimeAsync(OBSERVE_DEBOUNCE_MS);
  await boot.detector.whenIdle();
}

const MUTATING_ASYNC = [
  'writeFile',
  'appendFile',
  'rename',
  'rm',
  'rmdir',
  'unlink',
  'mkdir',
  'mkdtemp',
  'copyFile',
  'cp',
  'symlink',
  'link',
  'truncate',
] as const;
const MUTATING_SYNC = [
  'writeFileSync',
  'appendFileSync',
  'renameSync',
  'rmSync',
  'rmdirSync',
  'unlinkSync',
  'mkdirSync',
  'copyFileSync',
  'cpSync',
  'symlinkSync',
  'truncateSync',
] as const;

function spyMutatingFs(): jest.SpyInstance[] {
  // The real module object: a `import * as` namespace is not configurable.
  const realFs = require('node:fs') as Record<string, () => unknown>;
  const spies: jest.SpyInstance[] = [];
  for (const name of MUTATING_ASYNC) {
    spies.push(
      jest.spyOn(
        realFs['promises'] as unknown as Record<string, () => unknown>,
        name,
      ),
    );
  }
  for (const name of MUTATING_SYNC) {
    spies.push(jest.spyOn(realFs, name));
  }
  return spies;
}

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teh-int-')));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  jest.useFakeTimers({
    doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask', 'performance'],
    now: 1_700_000_000_000,
  });
});

afterEach(async () => {
  try {
    for (const h of harnesses.splice(0)) {
      const boots = h.boots.splice(0);
      try {
        for (const boot of boots) boot.handle.dispose();
        for (const boot of boots) await boot.handle.awaitStopped();
      } finally {
        h.db.close();
      }
    }
  } finally {
    jest.useRealTimers();
  }
});

describe('task-end hook (integration)', () => {
  it('runs every step report-only from detection to completion, with no mutating fs or git call (AC 6.1, R12, C1, C3)', async () => {
    const h = setup();
    h.ports.sessionLinks.linkedSessions.mockReturnValue(['s1']);
    h.ports.sessionLinks.worktreePathForSession.mockReturnValue(h.worktree);
    h.ports.sessionLinks.taskIdsInWorktreeName.mockReturnValue([TASK]);
    const boot = h.boot();
    boot.worker.start();
    await baseline(h, boot);

    // The spies watch detection, debounce, settle and every step.
    let spies: jest.SpyInstance[] = [];
    let runId = '';
    try {
      await endTask(h, boot, () => {
        spies = spyMutatingFs();
      });
      [runId] = runIds(h, TASK);
      expect(runIds(h, TASK)).toHaveLength(1);
      await flush(h, SETTLE_MS);
      await until(() => runOf(h, runId).state === 'completed');

      const mutating = spies
        .map((spy, i) => [i, spy.mock.calls.length] as const)
        .filter(([, calls]) => calls > 0)
        .map(([i]) => (MUTATING_ASYNC as readonly string[])[i] ?? `sync#${i}`);
      expect(mutating).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }

    const record = runOf(h, runId);
    expect([record.state, record.reason]).toEqual([
      'completed',
      'steps-terminal',
    ]);
    expect(outcomes(h, runId, 'close-curate')).toEqual(['succeeded/curated']);
    expect(outcomes(h, runId, 'harvest')).toEqual(['skipped/manual-only']);
    expect(outcomes(h, runId, 'dispose')).toEqual([
      'skipped/pending-user-approval',
    ]);
    expect(outcomes(h, runId, 'index')).toEqual(['succeeded/census-completed']);
    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
    expect(h.ports.census.requestCensus).toHaveBeenCalledTimes(1);

    // C1: the removal outcome cannot be recorded; the mode is the literal off.
    const dispose = record.steps.find((entry) => entry.step === 'dispose');
    expect(dispose?.outcome).toMatchObject({
      requestedMode: 'off',
      effectiveMode: 'off',
    });
    expect(fs.existsSync(h.worktree)).toBe(true);

    // R12 / C3: every git vector is on the read-only allow-list, none fetches.
    expect(h.git.calls.length).toBeGreaterThan(0);
    for (const { args } of h.git.calls) {
      expect(() => assertReadOnlyGitVector(args)).not.toThrow();
    }
    const verbs = new Set(h.git.calls.map(({ args }) => args[0]));
    expect([...verbs].sort()).toEqual(
      ['merge-base', 'rev-parse', 'status', 'worktree'].sort(),
    );
    for (const { args } of h.git.calls.filter(
      (c) => c.args[0] === 'worktree',
    )) {
      expect(args[1]).toBe('list');
    }
  });

  describe('atomic journal and run (AC 1.12a)', () => {
    it.each<TaskEndStoreFaultPoint>([
      'after-transition-insert',
      'after-run-insert',
    ])(
      'a fault at %s leaves neither row; the restart gives exactly one run (AC 1.9)',
      async (point) => {
        const h = setup();
        const first = h.boot();
        await baseline(h, first);
        first.handle.dispose();

        const faulty = h.boot((at) => {
          if (at === point) throw new Error(`fault ${at}`);
        });
        faulty.detector.subscribe();
        await endTask(h, faulty);
        expect(
          h.count(
            `SELECT COUNT(*) AS n FROM task_end_transitions WHERE to_status = 'done'`,
          ),
        ).toBe(0);
        expect(h.count('SELECT COUNT(*) AS n FROM task_end_runs')).toBe(0);
        expect(h.count('SELECT COUNT(*) AS n FROM task_end_steps')).toBe(0);
        faulty.handle.dispose();

        const restarted = h.boot();
        await restarted.detector.reconcileStartup();
        expect(runIds(h, TASK)).toHaveLength(1);
        await restarted.detector.reconcileStartup();
        expect(runIds(h, TASK)).toHaveLength(1);
        expect(
          h.count(
            `SELECT COUNT(*) AS n FROM task_end_transitions WHERE to_status = 'done'`,
          ),
        ).toBe(1);
      },
    );
  });

  it('gives one run for a seeded orphan and none after a second restart (AC 1.12b)', async () => {
    const h = setup();
    h.db
      .prepare(
        `INSERT INTO task_end_journal (repo_id, task_id, last_status, episode, updated_at)
         VALUES ('repo-orphan', 'TASK_O', 'done', 1, 1)`,
      )
      .run();
    h.db
      .prepare(
        `INSERT INTO task_end_transitions
           (transition_id, repo_id, task_id, episode, from_status, to_status,
            source, seen_root, observed_at)
         VALUES ('tr-orphan', 'repo-orphan', 'TASK_O', 1, 'in_review', 'done',
                 'watcher', ?, 1)`,
      )
      .run(h.root);
    writeCarrier(h.root, 'TASK_O', 'done');
    h.index.set(h.root, 'TASK_O', 'done');

    const first = h.boot();
    await first.detector.reconcileStartup();
    expect(runIds(h, 'TASK_O')).toHaveLength(1);
    first.handle.dispose();

    const second = h.boot();
    await second.detector.reconcileStartup();
    expect(runIds(h, 'TASK_O')).toHaveLength(1);
  });

  describe('resume after a kill at each step boundary (AC 6.2)', () => {
    // Boundary n: the first n steps were terminal when the process died; for
    // n = 3 the dispose entry was `running` and is re-probed (never trusted).
    it.each([0, 1, 2, 3])(
      'resumes at the first unfinished step after boundary %i without redoing finished work',
      async (boundary) => {
        const h = setup();
        const first = h.boot();
        writeCarrier(h.root, TASK, 'done');
        const journaled = new SqliteTaskEndStore(
          Object.defineProperty(
            Object.create(SqliteConnectionService.prototype),
            'db',
            { value: h.db },
          ) as SqliteConnectionService,
          h.logger,
        );
        const result = journaled.journalObservation(
          {
            repoId: 'repo-1',
            taskId: TASK,
            status: 'done',
            source: 'write',
            seenRoot: h.root,
            mainRoot: h.root,
          },
          POLICY,
        );
        if (result.kind !== 'terminal-entry' || result.entry.kind !== 'run') {
          throw new Error('expected a run');
        }
        const runId = result.entry.runId;
        first.handle.dispose();

        journaled.setRunState(runId, { state: 'running', reason: null });
        if (boundary >= 1) {
          journaled.upsertStep(runId, 'close-curate', '', {
            step: 'close-curate',
            state: 'skipped',
            reason: 'no-linked-sessions',
          });
        }
        if (boundary >= 2) {
          journaled.markStepRunning(runId, 'harvest', '');
          journaled.upsertStep(runId, 'harvest', '', {
            step: 'harvest',
            state: 'succeeded',
            reason: 'harvested',
          });
        }
        if (boundary >= 3) journaled.markStepRunning(runId, 'dispose', '');

        const restarted = h.boot();
        restarted.worker.start();
        await flush(h);
        await until(() => runOf(h, runId).state === 'completed');

        expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
        expect(h.ports.curation.curateEndedSession).not.toHaveBeenCalled();
        expect(h.git.calls.length).toBeGreaterThan(0);
        const record = runOf(h, runId);
        expect([record.state, record.reason]).toEqual([
          'completed',
          'steps-terminal',
        ]);
        expect(record.steps).toHaveLength(4);
        expect(outcomes(h, runId, 'close-curate')).toEqual([
          'skipped/no-linked-sessions',
        ]);
        expect(outcomes(h, runId, 'harvest')).toEqual([
          boundary >= 2 ? 'succeeded/harvested' : 'skipped/manual-only',
        ]);
        expect(outcomes(h, runId, 'dispose')).toHaveLength(1);
        expect(outcomes(h, runId, 'index')).toEqual([
          'succeeded/census-completed',
        ]);
        expect(h.ports.census.requestCensus).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('live-session hand-off against the real MemoryTriggerService (AC 2.2)', () => {
    type Callbacks<T> = {
      register: (cb: (payload: T) => void) => () => void;
      notifyAll: (payload: T) => void;
      fire: (payload: T) => void;
    };

    function registry<T>(): Callbacks<T> {
      const subscribers = new Set<(payload: T) => void>();
      const fire = (payload: T): void => {
        for (const cb of subscribers) cb(payload);
      };
      return {
        register: (cb) => {
          subscribers.add(cb);
          return () => {
            subscribers.delete(cb);
          };
        },
        notifyAll: fire,
        fire,
      };
    }

    function buildTriggerService() {
      const config: Record<string, unknown> = {
        'memory.triggers.idleMs': 0,
        'memory.triggers.turnThreshold': 0,
        'memory.triggers.bootScan': false,
        'memory.triggers.maxCuratesPerHour': 12,
      };
      const curator = {
        curate: jest.fn().mockResolvedValue({
          outcome: 'ran',
          extracted: 0,
          merged: 0,
          created: 0,
          skipped: 0,
        }),
        networkDeferralMs: jest.fn(() => 0),
        pushEvent: jest.fn(),
        recentEvents: jest.fn(() => []),
        lastRunInfo: jest.fn(() => ({ at: null, stats: null })),
        forgetSession: jest.fn(),
        rekeySession: jest.fn(),
      };
      const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      const stop = registry<unknown>();
      const sessionEndHook = registry<unknown>();
      const workspace = {
        getWorkspaceRoot: jest.fn(() => '/ws'),
        getWorkspaceFolders: jest.fn(() => ['/ws']),
        getConfiguration: jest.fn(
          (_section: string, key: string, def: unknown) => config[key] ?? def,
        ),
        setConfiguration: jest.fn().mockResolvedValue(undefined),
        onDidChangeConfiguration: jest.fn(),
        onDidChangeWorkspaceFolders: jest.fn(),
      };
      const queue = {
        flush: jest.fn(),
        enqueue: jest.fn(),
        drainForSession: jest.fn(() => []),
        markProcessed: jest.fn(),
        countUnprocessed: jest.fn(() => 0),
        backfillSessionId: jest.fn(() => 0),
      };
      const rateLimiter = {
        tryAcquire: jest.fn(() => ({
          allowed: true,
          limit: 12,
          resetAt: 0,
          usedThisWindow: 1,
        })),
      };
      const args = [
        logger,
        curator,
        registry<unknown>(), // activity
        registry<unknown>(), // in-process session end
        workspace,
        {}, // file system
        {
          db: { prepare: jest.fn(() => ({ get: jest.fn(), run: jest.fn() })) },
        },
        { findSessionsDirectory: jest.fn().mockResolvedValue(null) },
        registry<unknown>(), // user prompt submit
        registry<unknown>(), // post tool use
        stop,
        registry<unknown>(), // tool failure
        sessionEndHook,
        rateLimiter,
        queue,
        registry<unknown>(), // session start
        { read: jest.fn().mockResolvedValue('') },
        registry<unknown>(), // session id resolved
      ] as unknown as ConstructorParameters<typeof MemoryTriggerService>;
      return {
        service: new MemoryTriggerService(...args),
        curator,
        stop,
        sessionEndHook,
      };
    }

    it('makes exactly one curation request, from the session-end trigger, and leaves the run record unchanged', async () => {
      const h = setup();
      h.ports.sessionLinks.linkedSessions.mockReturnValue(['s1']);
      h.ports.activity.isSessionLive.mockReturnValue(ok(true));
      const trigger = buildTriggerService();
      trigger.service.start();
      try {
        const boot = h.boot();
        boot.worker.start();
        await baseline(h, boot);
        await endTask(h, boot);
        const [runId] = runIds(h, TASK);
        await flush(h, SETTLE_MS);
        await until(() => runOf(h, runId).state === 'completed');

        const record = runOf(h, runId);
        expect([record.state, record.reason]).toEqual([
          'completed',
          'steps-terminal',
        ]);
        const closeEntry = record.steps.find(
          (entry) => entry.step === 'close-curate',
        );
        expect(closeEntry?.outcome).toEqual({
          step: 'close-curate',
          state: 'deferred',
          reason: 'session-active',
          handedOffTo: 'session-end-trigger',
        });
        // The run made no curation request.
        expect(h.ports.curation.curateEndedSession).not.toHaveBeenCalled();
        expect(trigger.curator.curate).not.toHaveBeenCalled();
        const before = JSON.stringify(record);

        // The session ends after the run completed.
        trigger.stop.fire({
          sessionId: 's1',
          workspaceRoot: '/ws',
          lastAssistantMessage: 'Did some work this turn.',
          effortLevel: null,
          hasBackgroundWork: false,
          timestamp: 1000,
        });
        trigger.sessionEndHook.fire({
          sessionId: 's1',
          workspaceRoot: '/ws',
          reason: 'clear',
          timestamp: 2000,
        });
        for (let i = 0; i < 8; i++) await Promise.resolve();

        expect(trigger.curator.pushEvent).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'session-end-trigger' }),
        );
        expect(trigger.curator.curate).toHaveBeenCalledTimes(1);

        // Nothing resumes the hand-off: the worker re-run and a restart
        // leave the record and the curation count as they were.
        boot.worker.wake();
        await flush(h, 60_000);
        boot.handle.dispose();
        const restarted = h.boot();
        restarted.worker.start();
        await flush(h);

        expect(JSON.stringify(runOf(h, runId))).toBe(before);
        expect(h.ports.curation.curateEndedSession).not.toHaveBeenCalled();
        expect(trigger.curator.curate).toHaveBeenCalledTimes(1);
      } finally {
        trigger.service.stop();
      }
    });
  });
});
