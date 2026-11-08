import 'reflect-metadata';
import {
  MIGRATIONS,
  SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import type {
  TaskEndDisposeOutcome,
  TaskEndStepKind,
  TaskEndStepOutcome,
  TaskStatus,
} from '@ptah-extension/shared';
import { Logger } from '@ptah-extension/vscode-core';
import {
  SqliteTaskEndStore,
  type SqliteTaskEndStoreOptions,
  type TaskEndStoreFaultPoint,
} from './sqlite-task-end.store';
import type {
  TaskEndObservation,
  TaskEndRunPolicy,
} from './task-end-store.interface';

const POLICY: TaskEndRunPolicy = {
  hookEnabled: true,
  settleWindowMs: 5_000,
  queueCap: 10,
};
const T0 = 1_700_000_000_000;

const observe = (
  status: TaskStatus,
  overrides: Partial<TaskEndObservation> = {},
): TaskEndObservation => ({
  repoId: 'repo-1',
  taskId: 'TASK_2026_001',
  status,
  source: 'write',
  seenRoot: '/repo',
  mainRoot: '/repo',
  ...overrides,
});

const REPORT_ONLY = {
  requestedMode: 'off',
  effectiveMode: 'off',
  modeReason: 'none',
  activityScope: 'in-process',
} as const;

const blocked = (
  reason: Extract<TaskEndDisposeOutcome, { state: 'blocked' }>['reason'],
): TaskEndDisposeOutcome => ({
  step: 'dispose',
  state: 'blocked',
  reason,
  ...REPORT_ONLY,
});

interface Harness {
  readonly db: SqliteDatabase;
  readonly logger: Logger;
  readonly clock: { now: number };
  store(options?: SqliteTaskEndStoreOptions): SqliteTaskEndStore;
  count(table: string): number;
}

function setup(): Harness {
  const Database = require('better-sqlite3') as new (
    path: string,
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
  const clock = { now: T0 };
  return {
    db,
    logger,
    clock,
    store: (options = {}) =>
      new SqliteTaskEndStore(connection, logger, {
        now: () => clock.now,
        ...options,
      }),
    count: (table) =>
      (
        db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
          n: number;
        }
      ).n,
  };
}

function runIdOf(
  result: ReturnType<SqliteTaskEndStore['journalObservation']>,
): string {
  if (result.kind !== 'terminal-entry' || result.entry.kind !== 'run') {
    throw new Error(`expected a run, got ${JSON.stringify(result)}`);
  }
  return result.entry.runId;
}

describe('SqliteTaskEndStore', () => {
  let h: Harness;
  beforeEach(() => {
    h = setup();
  });
  afterEach(() => h.db.close());

  describe('journalObservation classification', () => {
    it('classifies first sight, repeats, terminal entry, echoes and reversion', () => {
      const store = h.store();
      expect(store.journalObservation(observe('in_progress'), POLICY)).toEqual({
        kind: 'non-terminal-update',
        fromStatus: null,
        toStatus: 'in_progress',
      });
      expect(store.journalObservation(observe('in_progress'), POLICY)).toEqual({
        kind: 'no-op',
      });
      expect(store.journalObservation(observe('in_review'), POLICY)).toEqual({
        kind: 'non-terminal-update',
        fromStatus: 'in_progress',
        toStatus: 'in_review',
      });

      const entry = store.journalObservation(observe('done'), POLICY);
      expect(entry).toMatchObject({
        kind: 'terminal-entry',
        dedupeKey: { repoId: 'repo-1', taskId: 'TASK_2026_001', episode: 1 },
        entry: { kind: 'run', state: 'settling' },
      });

      const key = { repoId: 'repo-1', taskId: 'TASK_2026_001', episode: 1 };
      expect(
        store.journalObservation(
          observe('done', { source: 'watcher' }),
          POLICY,
        ),
      ).toEqual({ kind: 'duplicate', dedupeKey: key });
      expect(store.journalObservation(observe('cancelled'), POLICY)).toEqual({
        kind: 'duplicate',
        dedupeKey: key,
      });
      expect(h.count('task_end_runs')).toBe(1);

      const reverted = store.journalObservation(observe('in_progress'), POLICY);
      expect(reverted).toMatchObject({
        kind: 'reversion',
        fromStatus: 'cancelled',
        toStatus: 'in_progress',
        cancelledRunIds: [runIdOf(entry)],
      });

      const second = store.journalObservation(observe('done'), POLICY);
      expect(second).toMatchObject({
        kind: 'terminal-entry',
        dedupeKey: { episode: 2 },
      });
      // Transitions: entry 1, reversion, entry 2. Echoes write none.
      expect(h.count('task_end_transitions')).toBe(3);
    });

    it('a terminal first sight is a terminal entry with no from-status', () => {
      const store = h.store();
      const result = store.journalObservation(observe('done'), POLICY);
      const run = store.getRun(runIdOf(result));
      expect(run).toMatchObject({
        fromStatus: null,
        toStatus: 'done',
        episode: 1,
      });
    });

    it('records hook-disabled on the transition and creates no run', () => {
      const store = h.store();
      const result = store.journalObservation(observe('done'), {
        ...POLICY,
        hookEnabled: false,
      });
      expect(result).toMatchObject({
        kind: 'terminal-entry',
        entry: { kind: 'no-run', noRunReason: 'hook-disabled' },
      });
      expect(h.count('task_end_runs')).toBe(0);
      expect(
        h.db.prepare('SELECT no_run_reason FROM task_end_transitions').get(),
      ).toEqual({ no_run_reason: 'hook-disabled' });
    });

    it('cancels only open runs whose dispose step is not terminal', () => {
      const store = h.store();
      const first = runIdOf(
        store.journalObservation(observe('done', { taskId: 'TASK_A' }), POLICY),
      );
      const second = runIdOf(
        store.journalObservation(observe('done', { taskId: 'TASK_B' }), POLICY),
      );
      store.upsertStep(second, 'dispose', '', blocked('no-linked-worktree'));

      const a = store.journalObservation(
        observe('in_progress', { taskId: 'TASK_A' }),
        POLICY,
      );
      const b = store.journalObservation(
        observe('in_progress', { taskId: 'TASK_B' }),
        POLICY,
      );
      expect(a).toMatchObject({ kind: 'reversion', cancelledRunIds: [first] });
      expect(b).toMatchObject({ kind: 'reversion', cancelledRunIds: [] });
      expect(store.getRun(first)).toMatchObject({
        state: 'cancelled',
        reason: 'status-reverted',
        endedAt: T0,
      });
      expect(store.getRun(second)).toMatchObject({ state: 'settling' });
    });
  });

  describe('read immediately after creation (finding 4)', () => {
    it('returns the settling run with exactly four pending steps in order', () => {
      const store = h.store();
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      const run = store.latestRun({ repoId: 'repo-1' }, 'TASK_2026_001');
      expect(run).toMatchObject({
        runId,
        state: 'settling',
        reason: null,
        settleUntil: T0 + POLICY.settleWindowMs,
        createdAt: T0,
        startedAt: null,
        endedAt: null,
        mainRoot: '/repo',
        source: 'write',
      });
      expect(
        run?.steps.map((entry) => [entry.step, entry.subject, entry.outcome]),
      ).toEqual([
        ['close-curate', '', { state: 'pending' }],
        ['harvest', '', { state: 'pending' }],
        ['dispose', '', { state: 'pending' }],
        ['index', '', { state: 'pending' }],
      ]);
      expect(run?.steps.every((entry) => entry.attempts === 0)).toBe(true);
      expect(run?.steps[0]?.message).toBe('The step has not run yet.');
    });

    it('creates a skipped/queue-full run with the same four pending steps', () => {
      const store = h.store();
      const policy = { ...POLICY, queueCap: 1 };
      store.journalObservation(observe('done', { taskId: 'TASK_A' }), policy);
      const result = store.journalObservation(
        observe('done', { taskId: 'TASK_B' }),
        policy,
      );
      expect(result).toMatchObject({
        entry: { kind: 'run', state: 'skipped' },
      });
      const run = store.getRun(runIdOf(result));
      expect(run).toMatchObject({
        state: 'skipped',
        reason: 'queue-full',
        endedAt: T0,
      });
      expect(
        run?.steps.map((entry) => [entry.step, entry.outcome.state]),
      ).toEqual([
        ['close-curate', 'pending'],
        ['harvest', 'pending'],
        ['dispose', 'pending'],
        ['index', 'pending'],
      ]);
      expect(store.countQueuedOrSettling()).toBe(1);
    });

    it('persists a null main root as SQL NULL and reads it back as null', () => {
      const store = h.store();
      const runId = runIdOf(
        store.journalObservation(observe('done', { mainRoot: null }), POLICY),
      );
      expect(
        h.db
          .prepare(
            'SELECT main_root IS NULL AS is_null FROM task_end_runs WHERE run_id = ?',
          )
          .get(runId),
      ).toEqual({ is_null: 1 });
      expect(store.getRun(runId)?.mainRoot).toBeNull();
    });
  });

  describe('atomic rollback on fault (AC 1.12a)', () => {
    it.each<TaskEndStoreFaultPoint>([
      'after-transition-insert',
      'after-run-insert',
    ])(
      'a fault at %s persists no journal, transition, run or step row',
      (point) => {
        const faulty = h.store({
          faultAfterTransitionInsert: (at) => {
            if (at === point) throw new Error(`fault ${at}`);
          },
        });
        faulty.journalObservation(observe('in_review'), POLICY);
        expect(() =>
          faulty.journalObservation(observe('done'), POLICY),
        ).toThrow(`fault ${point}`);
        expect(h.count('task_end_transitions')).toBe(0);
        expect(h.count('task_end_runs')).toBe(0);
        expect(h.count('task_end_steps')).toBe(0);
        expect(
          h.db
            .prepare('SELECT last_status, episode FROM task_end_journal')
            .get(),
        ).toEqual({ last_status: 'in_review', episode: 0 });

        // Restart: the same observation now creates exactly one run.
        const healthy = h.store();
        healthy.journalObservation(observe('done'), POLICY);
        expect(h.count('task_end_runs')).toBe(1);
        expect(h.count('task_end_steps')).toBe(4);
      },
    );
  });

  describe('createRunForOrphans (AC 1.12b)', () => {
    function seedOrphan(episode = 1, status: TaskStatus = 'done'): void {
      h.db
        .prepare(
          `INSERT INTO task_end_journal (repo_id, task_id, last_status, episode, updated_at)
           VALUES ('repo-1', 'TASK_O', ?, ?, 1)`,
        )
        .run(status, episode);
      h.db
        .prepare(
          `INSERT INTO task_end_transitions
             (transition_id, repo_id, task_id, episode, from_status, to_status,
              source, seen_root, observed_at)
           VALUES ('tr-orphan', 'repo-1', 'TASK_O', 1, 'in_review', 'done',
                   'watcher', '/repo', 1)`,
        )
        .run();
    }

    it('creates one run for a seeded orphan, and none on a second pass', () => {
      seedOrphan();
      h.db
        .prepare(
          `INSERT INTO task_end_repo_state (repo_id, baseline_at, main_root, updated_at)
           VALUES ('repo-1', 1, '/main', 1)`,
        )
        .run();
      const store = h.store();
      const created = store.createRunForOrphans(POLICY);
      expect(created).toHaveLength(1);
      expect(store.getRun(created[0] ?? '')).toMatchObject({
        state: 'settling',
        source: 'watcher',
        mainRoot: '/main',
        episode: 1,
      });
      expect(store.getRun(created[0] ?? '')?.steps).toHaveLength(4);
      expect(h.store().createRunForOrphans(POLICY)).toEqual([]);
      expect(h.count('task_end_runs')).toBe(1);
    });

    it('marks the orphan hook-disabled when the hook is off', () => {
      seedOrphan();
      const store = h.store();
      expect(
        store.createRunForOrphans({ ...POLICY, hookEnabled: false }),
      ).toEqual([]);
      expect(
        h.db.prepare('SELECT no_run_reason FROM task_end_transitions').get(),
      ).toEqual({ no_run_reason: 'hook-disabled' });
      expect(store.createRunForOrphans(POLICY)).toEqual([]);
    });

    it('records an orphan of a reverted task as a cancelled run', () => {
      seedOrphan(1, 'in_progress');
      const created = h.store().createRunForOrphans(POLICY);
      expect(h.store().getRun(created[0] ?? '')).toMatchObject({
        state: 'cancelled',
        reason: 'status-reverted',
      });
    });
  });

  describe('runs', () => {
    it('claims queued runs in FIFO order and lists open runs by queue_seq', () => {
      const store = h.store();
      const ids = ['TASK_A', 'TASK_B', 'TASK_C'].map((taskId) =>
        runIdOf(store.journalObservation(observe('done', { taskId }), POLICY)),
      );
      expect(store.claimNext()).toBeNull();
      store.setRunState(ids[2] ?? '', { state: 'queued', reason: null });
      store.setRunState(ids[0] ?? '', { state: 'queued', reason: null });
      expect(store.claimNext()?.runId).toBe(ids[0]);
      // claimNext does not change the run.
      expect(store.claimNext()?.runId).toBe(ids[0]);
      expect(store.listOpenRuns().map((run) => run.runId)).toEqual(ids);
      expect(store.countQueuedOrSettling()).toBe(3);
    });

    it('sets started_at once and ended_at on a final state', () => {
      const store = h.store();
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      h.clock.now = T0 + 10;
      store.setRunState(runId, { state: 'running', reason: null });
      h.clock.now = T0 + 20;
      store.setRunState(runId, { state: 'running', reason: null });
      expect(store.getRun(runId)).toMatchObject({
        startedAt: T0 + 10,
        endedAt: null,
      });
      h.clock.now = T0 + 30;
      store.setRunState(runId, {
        state: 'completed',
        reason: 'steps-terminal',
      });
      expect(store.getRun(runId)).toMatchObject({
        state: 'completed',
        reason: 'steps-terminal',
        startedAt: T0 + 10,
        endedAt: T0 + 30,
      });
      expect(store.listOpenRuns()).toEqual([]);
      expect(() =>
        store.setRunState('missing', { state: 'queued', reason: null }),
      ).toThrow('does not exist');
    });

    it('enforces one run per (repo, task, episode)', () => {
      const store = h.store();
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      h.db
        .prepare(
          `INSERT INTO task_end_transitions
             (transition_id, repo_id, task_id, episode, to_status, source, seen_root, observed_at)
           VALUES ('tr-dup', 'repo-1', 'TASK_2026_001', 1, 'done', 'write', '/repo', 1)`,
        )
        .run();
      expect(() =>
        h.db
          .prepare(
            `INSERT INTO task_end_runs
               (run_id, transition_id, repo_id, task_id, episode, source, to_status,
                seen_root, state, queue_seq, settle_until, created_at, updated_at)
             VALUES ('run-dup', 'tr-dup', 'repo-1', 'TASK_2026_001', 1, 'write', 'done',
                     '/repo', 'settling', 99, 1, 1, 1)`,
          )
          .run(),
      ).toThrow(/UNIQUE/);
      // The duplicate-episode transition is not an orphan either.
      expect(store.createRunForOrphans(POLICY)).toEqual([]);
      expect(
        store.latestRun({ seenRoot: '/repo' }, 'TASK_2026_001')?.runId,
      ).toBe(runId);
    });

    it('returns the latest run of a task by repo or by seen root', () => {
      const store = h.store();
      runIdOf(store.journalObservation(observe('done'), POLICY));
      store.journalObservation(observe('in_progress'), POLICY);
      h.clock.now = T0 + 1;
      const latest = runIdOf(
        store.journalObservation(observe('done', { seenRoot: '/wt' }), POLICY),
      );
      expect(
        store.latestRun({ repoId: 'repo-1' }, 'TASK_2026_001')?.runId,
      ).toBe(latest);
      expect(store.latestRun({ seenRoot: '/wt' }, 'TASK_2026_001')?.runId).toBe(
        latest,
      );
      expect(store.latestRun({ repoId: 'repo-2' }, 'TASK_2026_001')).toBeNull();
      expect(store.getRun('missing')).toBeNull();
    });
  });

  describe('steps', () => {
    it('round-trips closed extra fields and looks the message up', () => {
      const store = h.store();
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      store.expandStep(runId, 'close-curate', ['session-1']);
      store.upsertStep(runId, 'close-curate', 'session-1', {
        step: 'close-curate',
        state: 'succeeded',
        reason: 'curated',
        counts: { extracted: 3, merged: 1, created: 2 },
        transcript: 'read',
      });
      store.upsertStep(runId, 'dispose', '', {
        step: 'dispose',
        state: 'skipped',
        reason: 'eligible-report-only',
        ...REPORT_ONLY,
      });
      store.upsertStep(runId, 'index', '', {
        step: 'index',
        state: 'succeeded',
        reason: 'coalesced',
        joined: { source: 'hook-run', runId: 'run-x' },
      });
      store.upsertStep(runId, 'harvest', '', {
        step: 'harvest',
        state: 'succeeded',
        reason: 'harvested',
      });
      const steps = store.getRun(runId)?.steps ?? [];
      expect(steps.map((entry) => entry.outcome)).toEqual([
        {
          step: 'close-curate',
          state: 'succeeded',
          reason: 'curated',
          counts: { extracted: 3, merged: 1, created: 2 },
          transcript: 'read',
        },
        { step: 'harvest', state: 'succeeded', reason: 'harvested' },
        {
          step: 'dispose',
          state: 'skipped',
          reason: 'eligible-report-only',
          ...REPORT_ONLY,
        },
        {
          step: 'index',
          state: 'succeeded',
          reason: 'coalesced',
          joined: { source: 'hook-run', runId: 'run-x' },
        },
      ]);
      expect(steps[1]?.message).toBe('The task folder was harvested.');
      expect(
        h.db
          .prepare(
            `SELECT extra_json FROM task_end_steps WHERE run_id = ? AND step = 'harvest'`,
          )
          .get(runId),
      ).toEqual({ extra_json: null });
    });

    it('rejects an outcome field outside the closed schema (no free text)', () => {
      const store = h.store();
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      const withMessage = {
        step: 'harvest',
        state: 'failed',
        reason: 'harvest-failed',
        message: 'ENOENT /home/user/secret',
      } as const;
      expect(() =>
        store.upsertStep(runId, 'harvest', '', withMessage),
      ).toThrow();
      // Untyped input, as a corrupted caller would pass it.
      const unknownCode: unknown = {
        step: 'harvest',
        state: 'failed',
        reason: 'not-a-code',
      };
      expect(() =>
        store.upsertStep<TaskEndStepKind>(
          runId,
          'harvest',
          '',
          unknownCode as TaskEndStepOutcome,
        ),
      ).toThrow();
      // A caller holding a widened step kind (D12).
      const widened: TaskEndStepOutcome = {
        step: 'index',
        state: 'succeeded',
        reason: 'census-completed',
      };
      expect(() =>
        store.upsertStep<TaskEndStepKind>(runId, 'harvest', '', widened),
      ).toThrow('recorded on step harvest');
      expect(() =>
        store.upsertStep(runId, 'harvest', 'other', {
          step: 'harvest',
          state: 'failed',
          reason: 'harvest-failed',
        }),
      ).toThrow('has no harvest entry');
      expect(store.getRun(runId)?.steps[1]?.outcome).toEqual({
        state: 'pending',
      });
    });

    it('marks running with an attempt count; a crashed running entry reads as pending', () => {
      const store = h.store();
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      expect(store.markStepRunning(runId, 'harvest', '')).toBe(1);
      expect(store.markStepRunning(runId, 'harvest', '')).toBe(2);
      expect(
        h.db
          .prepare(
            `SELECT state FROM task_end_steps WHERE run_id = ? AND step = 'harvest'`,
          )
          .get(runId),
      ).toEqual({ state: 'running' });
      const harvest = store.getRun(runId)?.steps[1];
      expect(harvest).toMatchObject({
        outcome: { state: 'pending' },
        attempts: 2,
      });
      store.upsertStep(runId, 'harvest', '', {
        step: 'harvest',
        state: 'skipped',
        reason: 'no-carrier',
      });
      expect(store.getRun(runId)?.steps[1]?.attempts).toBe(2);
      expect(() => store.markStepRunning(runId, 'dispose', '/nope')).toThrow(
        'has no dispose entry',
      );
    });

    it('expandStep replaces the placeholder atomically and is idempotent', () => {
      const store = h.store();
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      const disposeEntries = () =>
        (store.getRun(runId)?.steps ?? [])
          .filter((entry) => entry.step === 'dispose')
          .map((entry) => [entry.subject, entry.outcome.state]);

      store.expandStep(runId, 'dispose', []);
      expect(disposeEntries()).toEqual([['', 'pending']]);

      store.markStepRunning(runId, 'dispose', '');
      store.expandStep(runId, 'dispose', ['/wt/b', '/wt/a', '/wt/b']);
      expect(disposeEntries()).toEqual([
        ['/wt/b', 'pending'],
        ['/wt/a', 'pending'],
      ]);
      store.upsertStep(runId, 'dispose', '/wt/a', blocked('locked'));
      const before = h.db
        .prepare('SELECT * FROM task_end_steps ORDER BY rowid')
        .all();
      store.expandStep(runId, 'dispose', ['/wt/b', '/wt/a']);
      expect(
        h.db.prepare('SELECT * FROM task_end_steps ORDER BY rowid').all(),
      ).toEqual(before);
      // Steps keep their ordinal order around the expanded subjects.
      expect(store.getRun(runId)?.steps.map((entry) => entry.step)).toEqual([
        'close-curate',
        'harvest',
        'dispose',
        'dispose',
        'index',
      ]);
      expect(() => store.expandStep(runId, 'close-curate', [''])).toThrow();
    });

    it('a fault inside expandStep leaves the placeholder in place', () => {
      const store = h.store({
        faultAfterTransitionInsert: (at) => {
          if (at === 'after-placeholder-delete') throw new Error('fault');
        },
      });
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      expect(() =>
        store.expandStep(runId, 'close-curate', ['s-1', 's-2']),
      ).toThrow('fault');
      expect(
        (store.getRun(runId)?.steps ?? [])
          .filter((entry) => entry.step === 'close-curate')
          .map((entry) => entry.subject),
      ).toEqual(['']);
    });

    it('logs and skips a malformed step row', () => {
      const store = h.store();
      const runId = runIdOf(store.journalObservation(observe('done'), POLICY));
      h.db
        .prepare(
          `UPDATE task_end_steps SET state = 'failed', reason = 'harvest-failed',
             extra_json = '{"message":"free text"}' WHERE run_id = ? AND step = 'harvest'`,
        )
        .run(runId);
      h.db
        .prepare(
          `UPDATE task_end_steps SET state = 'blocked', reason = 'locked',
             extra_json = 'not json' WHERE run_id = ? AND step = 'dispose'`,
        )
        .run(runId);
      expect(store.getRun(runId)?.steps.map((entry) => entry.step)).toEqual([
        'close-curate',
        'index',
      ]);
      expect(h.logger.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('census lookups', () => {
    it('tracks the pending census, its completion and deferred steps by main root', () => {
      const store = h.store();
      const [a, b, c] = ['TASK_A', 'TASK_B', 'TASK_C'].map((taskId) =>
        runIdOf(store.journalObservation(observe('done', { taskId }), POLICY)),
      ) as [string, string, string];
      runIdOf(
        store.journalObservation(
          observe('done', { taskId: 'TASK_D', mainRoot: '/other' }),
          POLICY,
        ),
      );

      expect(store.pendingCensus('/repo')).toBeNull();
      expect(store.lastHookCensusCompletedAt('/repo')).toBeNull();

      h.clock.now = T0 + 100;
      store.markStepRunning(a, 'index', '');
      store.upsertStep(a, 'index', '', {
        step: 'index',
        state: 'running',
        reason: 'census-requested',
      });
      expect(store.pendingCensus('/repo')).toEqual({
        runId: a,
        requestedAt: T0 + 100,
      });
      expect(store.pendingCensus('/other')).toBeNull();
      expect(store.getRun(a)?.steps[3]?.outcome).toEqual({
        step: 'index',
        state: 'running',
        reason: 'census-requested',
      });

      store.upsertStep(c, 'index', '', {
        step: 'index',
        state: 'deferred',
        reason: 'foreground-active',
      });
      store.upsertStep(b, 'index', '', {
        step: 'index',
        state: 'deferred',
        reason: 'census-cooldown',
      });
      expect(store.listDeferredCensusSteps('/repo')).toEqual([
        { runId: b, reason: 'census-cooldown', queueSeq: 2 },
        { runId: c, reason: 'foreground-active', queueSeq: 3 },
      ]);
      // A run whose only non-terminal step is index stays listed (D25).
      expect(store.listOpenRuns().map((run) => run.runId)).toContain(b);

      h.clock.now = T0 + 200;
      store.upsertStep(a, 'index', '', {
        step: 'index',
        state: 'succeeded',
        reason: 'census-completed',
      });
      expect(store.pendingCensus('/repo')).toBeNull();
      expect(store.lastHookCensusCompletedAt('/repo')).toBe(T0 + 200);

      store.setRunState(c, { state: 'cancelled', reason: 'status-reverted' });
      expect(
        store.listDeferredCensusSteps('/repo').map((s) => s.runId),
      ).toEqual([b]);
    });
  });

  describe('baseline and repository state', () => {
    it('journals every visible carrier once, with baseline transitions and no run', () => {
      const store = h.store();
      expect(store.isBaselined('repo-1')).toBe(false);
      store.recordBaseline('repo-1', '/repo', [
        { taskId: 'TASK_A', status: 'done', seenRoot: '/repo' },
        { taskId: 'TASK_B', status: 'in_progress', seenRoot: '/repo' },
        { taskId: 'TASK_A', status: 'done', seenRoot: '/wt' },
      ]);
      expect(store.isBaselined('repo-1')).toBe(true);
      expect(h.count('task_end_runs')).toBe(0);
      expect(
        h.db
          .prepare(
            'SELECT task_id, episode, source, no_run_reason FROM task_end_transitions',
          )
          .all(),
      ).toEqual([
        {
          task_id: 'TASK_A',
          episode: 1,
          source: 'baseline',
          no_run_reason: 'baseline',
        },
      ]);
      // A baselined terminal task is a duplicate, not a new episode.
      expect(
        store.journalObservation(observe('done', { taskId: 'TASK_A' }), POLICY),
      ).toMatchObject({ kind: 'duplicate' });
      // The baseline is taken once.
      store.recordBaseline('repo-1', '/repo', [
        { taskId: 'TASK_C', status: 'done', seenRoot: '/repo' },
      ]);
      expect(h.count('task_end_transitions')).toBe(1);
      expect(store.createRunForOrphans(POLICY)).toEqual([]);
    });

    it('remembers a changed main root, including null', () => {
      const store = h.store();
      store.rememberMainRoot('repo-1', '/ignored');
      expect(h.count('task_end_repo_state')).toBe(0);
      store.recordBaseline('repo-1', '/repo', []);
      h.clock.now = T0 + 5;
      store.rememberMainRoot('repo-1', '/repo');
      const read = () =>
        h.db
          .prepare('SELECT main_root, updated_at FROM task_end_repo_state')
          .get();
      expect(read()).toEqual({ main_root: '/repo', updated_at: T0 });
      store.rememberMainRoot('repo-1', null);
      expect(read()).toEqual({ main_root: null, updated_at: T0 + 5 });
      store.rememberMainRoot('repo-1', '/moved');
      expect(read()).toEqual({ main_root: '/moved', updated_at: T0 + 5 });
    });
  });
});
