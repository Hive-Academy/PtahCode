import { inject, injectable } from 'tsyringe';
import { ulid } from 'ulid';
import { z } from 'zod';
import {
  PERSISTENCE_TOKENS,
  SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import {
  TASK_END_STEP_KINDS,
  type TaskEndRunRecord,
  type TaskEndRunStatus,
  type TaskEndStepKind,
  type TaskEndStepOutcome,
  type TaskStatus,
} from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type {
  ITaskEndStore,
  ITaskCloseOutStore,
  CloseOutIdentity,
  CloseOutRunRecord,
  CloseOutStep,
  CloseOutStepState,
  TaskEndBaselineEntry,
  TaskEndDeferredCensusStep,
  TaskEndExpandableStep,
  TaskEndObservation,
  TaskEndObservationClass,
  TaskEndPendingCensus,
  TaskEndRunLookup,
  TaskEndRunPolicy,
} from './task-end-store.interface';
import {
  attemptsRow,
  countRow,
  journalRow,
  mainRootRow,
  maxUpdatedRow,
  orphanTransitionRow,
  runIdRow,
  runStatusSchema,
  subjectRow,
  type JournalRow,
} from './task-end-rows';
import {
  orphanRunFields,
  TaskEndRowMapper,
  toDeferredCensusStep,
  toPendingCensus,
  toStoredStepOutcome,
  type RunFields,
  type TransitionFields,
} from './task-end-row.mapper';

/** Where the test-only fault hook fires inside a store transaction. */
export type TaskEndStoreFaultPoint =
  /** `journalObservation`: after the transition row, before the run row. */
  | 'after-transition-insert'
  /** Run creation: after the run row, before its four step rows. */
  | 'after-run-insert'
  /** `expandStep`: after the placeholder delete, before the subject rows. */
  | 'after-placeholder-delete';

export interface SqliteTaskEndStoreOptions {
  /**
   * Test-only (AC 1.12a): called at each {@link TaskEndStoreFaultPoint}
   * inside the transaction. A throw rolls the whole transaction back.
   */
  readonly faultAfterTransitionInsert?: (point: TaskEndStoreFaultPoint) => void;
  /** Clock for stored timestamps; defaults to `Date.now`. */
  readonly now?: () => number;
}

const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'done',
  'cancelled',
]);

const isTerminalStatus = (status: TaskStatus): boolean =>
  TERMINAL_TASK_STATUSES.has(status);

/** Run creation states: admitted, refused by the queue cap, or superseded. */
type CreatedRunStatus =
  | { readonly state: 'settling'; readonly reason: null }
  | Extract<TaskEndRunStatus, { readonly state: 'skipped' | 'cancelled' }>;

const SETTLING: CreatedRunStatus = { state: 'settling', reason: null };
const QUEUE_FULL: CreatedRunStatus = { state: 'skipped', reason: 'queue-full' };
const REVERTED: CreatedRunStatus = {
  state: 'cancelled',
  reason: 'status-reverted',
};

const ENDED_RUN_STATES: ReadonlySet<TaskEndRunStatus['state']> = new Set([
  'completed',
  'cancelled',
  'skipped',
]);

const RUN_COLUMNS = `run_id, repo_id, task_id, episode, source, from_status,
  to_status, seen_root, main_root, state, reason, queue_seq, settle_until,
  created_at, started_at, ended_at, updated_at`;

const STEP_COLUMNS = `run_id, step, subject, ordinal, state, reason,
  extra_json, attempts, updated_at`;

/** A dispose entry that has not reached a final outcome. */
const DISPOSE_NOT_TERMINAL = `EXISTS (SELECT 1 FROM task_end_steps s
  WHERE s.run_id = r.run_id AND s.step = 'dispose'
    AND s.state NOT IN ('succeeded', 'skipped', 'blocked', 'failed'))`;

const ordinalOf = (step: TaskEndStepKind): number =>
  TASK_END_STEP_KINDS.indexOf(step);

const closeOutIdentitySchema = z.object({
  repoId: z.string().min(1), taskId: z.string().min(1),
  prNumber: z.number().int().positive(), prUrl: z.string().url(),
  mainRoot: z.string().min(1), worktreePath: z.string().min(1),
  branch: z.string().min(1),
});
const closeOutRunRow = closeOutIdentitySchema.extend({ runId: z.string().min(1) });
const closeOutStepRow = z.object({
  step: z.enum(['memory', 'learning', 'worktree', 'branch']),
  state: z.enum(['pending', 'running', 'ok', 'failed', 'refused', 'skipped']),
  reason: z.string().nullable(), attempts: z.number().int().nonnegative(),
});
const CLOSE_OUT_STEPS = ['memory', 'learning', 'worktree', 'branch'] as const;

/**
 * SQLite implementation of {@link ITaskEndStore} over the migration 0072
 * tables (plan Component 3). The only writer of those tables.
 *
 * Every statement is parameterised; every row read is parsed with zod. A
 * malformed row is logged and skipped. Storage failures throw.
 */
@injectable()
export class SqliteTaskEndStore implements ITaskEndStore, ITaskCloseOutStore {
  private readonly fault: (point: TaskEndStoreFaultPoint) => void;
  private readonly now: () => number;
  private readonly mapper: TaskEndRowMapper;

  constructor(
    @inject(PERSISTENCE_TOKENS.SQLITE_CONNECTION)
    private readonly sqlite: SqliteConnectionService,
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    options: SqliteTaskEndStoreOptions = {},
  ) {
    this.fault =
      options.faultAfterTransitionInsert ??
      ((): void => {
        // No fault injection outside tests.
      });
    this.now = options.now ?? Date.now;
    this.mapper = new TaskEndRowMapper(logger);
  }

  private get db(): SqliteDatabase {
    return this.sqlite.db;
  }

  getOrCreateCloseOut(identity: CloseOutIdentity): CloseOutRunRecord {
    const value = closeOutIdentitySchema.parse(identity);
    return this.db.transaction(() => {
      const now = this.now();
      const runId = ulid();
      this.db.prepare(`INSERT OR IGNORE INTO task_close_out_runs
        (run_id, repo_id, task_id, pr_number, pr_url, main_root,
         worktree_path, branch, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(runId, value.repoId, value.taskId, value.prNumber, value.prUrl,
          value.mainRoot, value.worktreePath, value.branch, now, now);
      const row = closeOutRunRow.parse(this.db.prepare(`SELECT run_id AS runId,
        repo_id AS repoId, task_id AS taskId, pr_number AS prNumber,
        pr_url AS prUrl, main_root AS mainRoot, worktree_path AS worktreePath,
        branch FROM task_close_out_runs
        WHERE repo_id = ? AND task_id = ? AND pr_number = ?`)
        .get(value.repoId, value.taskId, value.prNumber));
      if (row.prUrl !== value.prUrl || row.mainRoot !== value.mainRoot ||
          row.worktreePath !== value.worktreePath || row.branch !== value.branch) {
        throw new Error('close-out identity conflict');
      }
      for (const step of CLOSE_OUT_STEPS) {
        this.db.prepare(`INSERT OR IGNORE INTO task_close_out_steps
          (run_id, step, state, reason, attempts, updated_at)
          VALUES (?, ?, 'pending', NULL, 0, ?)`)
          .run(row.runId, step, now);
      }
      const record = this.getCloseOut(row.runId);
      if (record === null) throw new Error('close-out run disappeared');
      return record;
    })();
  }

  getCloseOut(runId: string): CloseOutRunRecord | null {
    const raw = this.db.prepare(`SELECT run_id AS runId, repo_id AS repoId,
      task_id AS taskId, pr_number AS prNumber, pr_url AS prUrl,
      main_root AS mainRoot, worktree_path AS worktreePath, branch
      FROM task_close_out_runs WHERE run_id = ?`).get(runId);
    if (raw === undefined) return null;
    const row = closeOutRunRow.parse(raw);
    const steps = this.db.prepare(`SELECT step, state, reason, attempts
      FROM task_close_out_steps WHERE run_id = ? ORDER BY rowid`).all(runId)
      .map((step) => closeOutStepRow.parse(step));
    return { ...row, steps };
  }

  getCloseOutForTask(repoId: string, taskId: string): CloseOutRunRecord | null {
    const row = this.db.prepare(`SELECT run_id AS runId FROM task_close_out_runs
      WHERE repo_id = ? AND task_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(repoId, taskId);
    const parsed = z.object({ runId: z.string() }).safeParse(row);
    return parsed.success ? this.getCloseOut(parsed.data.runId) : null;
  }

  mergedTaskIds(repoId: string): ReadonlySet<string> {
    const rows = this.db.prepare(`SELECT task_id AS taskId FROM task_close_out_runs WHERE repo_id = ?`)
      .all(repoId) as Array<{ taskId: string }>;
    return new Set(rows.map((row) => row.taskId));
  }

  startCloseOutStep(runId: string, step: CloseOutStep): void {
    const result = this.db.prepare(`UPDATE task_close_out_steps
      SET state = 'running', reason = NULL, attempts = attempts + 1,
          updated_at = ? WHERE run_id = ? AND step = ?
          AND state IN ('pending', 'running', 'failed', 'refused')`)
      .run(this.now(), runId, step);
    if (result.changes !== 1) throw new Error('close-out step unavailable');
  }

  finishCloseOutStep(runId: string, step: CloseOutStep,
    state: Exclude<CloseOutStepState, 'pending' | 'running'>,
    reason: string | null): void {
    const result = this.db.prepare(`UPDATE task_close_out_steps
      SET state = ?, reason = ?, updated_at = ?
      WHERE run_id = ? AND step = ? AND state = 'running'`)
      .run(state, reason, this.now(), runId, step);
    if (result.changes !== 1) throw new Error('close-out step unavailable');
  }

  // --- Journal -------------------------------------------------------------

  journalObservation(
    observation: TaskEndObservation,
    policy: TaskEndRunPolicy,
  ): TaskEndObservationClass {
    return this.db.transaction(() =>
      this.journalInTransaction(observation, policy),
    )();
  }

  createRunForOrphans(policy: TaskEndRunPolicy): readonly string[] {
    const orphans = this.db
      .prepare(
        `SELECT t.transition_id, t.repo_id, t.task_id, t.episode,
           t.from_status, t.to_status, t.source, t.seen_root
         FROM task_end_transitions t
         WHERE t.to_status IN ('done', 'cancelled')
           AND t.no_run_reason IS NULL
           AND t.source <> 'baseline'
           AND NOT EXISTS (SELECT 1 FROM task_end_runs r
             WHERE r.transition_id = t.transition_id
               OR (r.repo_id = t.repo_id AND r.task_id = t.task_id
                   AND r.episode = t.episode))
         ORDER BY t.observed_at, t.rowid`,
      )
      .all()
      .map((row) => orphanTransitionRow.parse(row));

    const created: string[] = [];
    for (const orphan of orphans) {
      const runId = this.db.transaction(() => {
        const now = this.now();
        if (!policy.hookEnabled) {
          this.db
            .prepare(
              `UPDATE task_end_transitions SET no_run_reason = 'hook-disabled'
               WHERE transition_id = ? AND no_run_reason IS NULL`,
            )
            .run(orphan.transition_id);
          return null;
        }
        const journal = this.readJournal(orphan.repo_id, orphan.task_id);
        // The task left the terminal set after this episode: the run is
        // recorded as reverted, so it never runs and is never re-reconciled.
        const superseded =
          journal === null ||
          journal.episode !== orphan.episode ||
          !isTerminalStatus(journal.last_status);
        // The main root is the last validated one of the repository.
        return this.insertRun(
          orphanRunFields(orphan, this.storedMainRoot(orphan.repo_id)),
          superseded ? REVERTED : this.admission(policy),
          now + policy.settleWindowMs,
          now,
        );
      })();
      if (runId !== null) created.push(runId);
    }
    return created;
  }

  isBaselined(repoId: string): boolean {
    return (
      this.db
        .prepare('SELECT 1 AS found FROM task_end_repo_state WHERE repo_id = ?')
        .get(repoId) !== undefined
    );
  }

  recordBaseline(
    repoId: string,
    mainRoot: string | null,
    entries: readonly TaskEndBaselineEntry[],
  ): void {
    this.db.transaction(() => {
      const now = this.now();
      const inserted = this.db
        .prepare(
          `INSERT INTO task_end_repo_state (repo_id, baseline_at, main_root, updated_at)
           VALUES (?, ?, ?, ?) ON CONFLICT(repo_id) DO NOTHING`,
        )
        .run(repoId, now, mainRoot, now);
      // A baseline is taken once per repository identity (Decision A7).
      if (inserted.changes === 0) return;
      for (const entry of entries) {
        const current = this.readJournal(repoId, entry.taskId);
        const enters =
          isTerminalStatus(entry.status) &&
          (current === null || !isTerminalStatus(current.last_status));
        const episode = (current?.episode ?? 0) + (enters ? 1 : 0);
        this.writeJournal(repoId, entry.taskId, entry.status, episode, now);
        if (!enters) continue;
        this.insertTransition(
          {
            repoId,
            taskId: entry.taskId,
            episode,
            fromStatus: current?.last_status ?? null,
            toStatus: entry.status,
            source: 'baseline',
            seenRoot: entry.seenRoot,
            noRunReason: 'baseline',
          },
          now,
        );
      }
    })();
  }

  rememberMainRoot(repoId: string, mainRoot: string | null): void {
    this.db
      .prepare(
        `UPDATE task_end_repo_state SET main_root = ?, updated_at = ?
         WHERE repo_id = ? AND main_root IS NOT ?`,
      )
      .run(mainRoot, this.now(), repoId, mainRoot);
  }

  // --- Runs ----------------------------------------------------------------

  getRun(runId: string): TaskEndRunRecord | null {
    return this.firstRun(
      this.db
        .prepare(`SELECT ${RUN_COLUMNS} FROM task_end_runs WHERE run_id = ?`)
        .all(runId),
    );
  }

  latestRun(lookup: TaskEndRunLookup, taskId: string): TaskEndRunRecord | null {
    const [column, value] =
      'repoId' in lookup
        ? (['repo_id', lookup.repoId] as const)
        : (['seen_root', lookup.seenRoot] as const);
    return this.firstRun(
      this.db
        .prepare(
          `SELECT ${RUN_COLUMNS} FROM task_end_runs
           WHERE ${column} = ? AND task_id = ?
           ORDER BY created_at DESC, queue_seq DESC LIMIT 1`,
        )
        .all(value, taskId),
    );
  }

  listOpenRuns(): readonly TaskEndRunRecord[] {
    return this.loadRuns(
      this.db
        .prepare(
          `SELECT ${RUN_COLUMNS} FROM task_end_runs
           WHERE state IN ('settling', 'queued', 'running')
           ORDER BY queue_seq`,
        )
        .all(),
    );
  }

  countQueuedOrSettling(): number {
    return countRow.parse(
      this.db
        .prepare(
          `SELECT COUNT(*) AS count FROM task_end_runs
           WHERE state IN ('settling', 'queued')`,
        )
        .get(),
    ).count;
  }

  claimNext(): TaskEndRunRecord | null {
    return this.firstRun(
      this.db
        .prepare(
          `SELECT ${RUN_COLUMNS} FROM task_end_runs
           WHERE state = 'queued' ORDER BY queue_seq LIMIT 1`,
        )
        .all(),
    );
  }

  setRunState(runId: string, status: TaskEndRunStatus): void {
    const parsed = runStatusSchema.parse(status);
    const now = this.now();
    const result = this.db
      .prepare(
        `UPDATE task_end_runs SET state = ?, reason = ?,
           started_at = CASE WHEN ? THEN COALESCE(started_at, ?) ELSE started_at END,
           ended_at = CASE WHEN ? THEN ? ELSE ended_at END,
           updated_at = ?
         WHERE run_id = ?`,
      )
      .run(
        parsed.state,
        parsed.reason,
        Number(parsed.state === 'running'),
        now,
        Number(ENDED_RUN_STATES.has(parsed.state)),
        now,
        now,
        runId,
      );
    if (result.changes === 0) {
      throw new Error(`task-end run ${runId} does not exist`);
    }
  }

  // --- Steps ---------------------------------------------------------------

  markStepRunning(
    runId: string,
    step: TaskEndStepKind,
    subject: string,
  ): number {
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          `UPDATE task_end_steps SET state = 'running', reason = NULL,
             extra_json = NULL, attempts = attempts + 1, updated_at = ?
           WHERE run_id = ? AND step = ? AND subject = ?`,
        )
        .run(this.now(), runId, step, subject);
      if (result.changes === 0) throw this.missingEntry(runId, step);
      return attemptsRow.parse(
        this.db
          .prepare(
            `SELECT attempts FROM task_end_steps
             WHERE run_id = ? AND step = ? AND subject = ?`,
          )
          .get(runId, step, subject),
      ).attempts;
    })();
  }

  upsertStep<K extends TaskEndStepKind>(
    runId: string,
    step: K,
    subject: string,
    outcome: Extract<TaskEndStepOutcome, { readonly step: K }>,
  ): void {
    // A caller holding a widened step kind gets the plain union (D12).
    if (outcome.step !== step) {
      throw new Error(
        `task-end outcome for step ${outcome.step} recorded on step ${step}`,
      );
    }
    // Strict schema: a field outside the closed vocabulary throws here.
    const { outcome: parsed, extraJson } = toStoredStepOutcome(outcome);
    const censusRequested =
      parsed.state === 'running' && parsed.reason === 'census-requested';
    const now = this.now();
    const result = this.db
      .prepare(
        `UPDATE task_end_steps SET state = ?, reason = ?, extra_json = ?,
           requested_at = CASE WHEN ? THEN ? ELSE requested_at END,
           updated_at = ?
         WHERE run_id = ? AND step = ? AND subject = ?`,
      )
      .run(
        parsed.state,
        parsed.reason,
        extraJson,
        Number(censusRequested),
        now,
        now,
        runId,
        step,
        subject,
      );
    if (result.changes === 0) throw this.missingEntry(runId, step);
  }

  expandStep(
    runId: string,
    step: TaskEndExpandableStep,
    subjects: readonly string[],
  ): void {
    if (subjects.some((subject) => subject === '')) {
      throw new Error(`task-end ${step} subject must not be empty`);
    }
    const unique = [...new Set(subjects)];
    // No subjects: the placeholder stays, to record the step's "none" outcome.
    if (unique.length === 0) return;
    this.db.transaction(() => {
      const existing = this.db
        .prepare(
          'SELECT subject FROM task_end_steps WHERE run_id = ? AND step = ?',
        )
        .all(runId, step)
        .map((row) => subjectRow.parse(row).subject);
      if (existing.length === 0) throw this.missingEntry(runId, step);
      if (existing.includes('')) {
        this.db
          .prepare(
            `DELETE FROM task_end_steps
             WHERE run_id = ? AND step = ? AND subject = ''`,
          )
          .run(runId, step);
        this.fault('after-placeholder-delete');
      }
      const now = this.now();
      const insert = this.db.prepare(
        `INSERT INTO task_end_steps
           (run_id, step, subject, ordinal, state, attempts, updated_at)
         VALUES (?, ?, ?, ?, 'pending', 0, ?)
         ON CONFLICT(run_id, step, subject) DO NOTHING`,
      );
      for (const subject of unique) {
        insert.run(runId, step, subject, ordinalOf(step), now);
      }
    })();
  }

  // --- Census lookups ------------------------------------------------------

  pendingCensus(mainRoot: string): TaskEndPendingCensus | null {
    const row = this.db
      .prepare(
        `SELECT s.run_id, s.requested_at FROM task_end_steps s
         JOIN task_end_runs r ON r.run_id = s.run_id
         WHERE s.step = 'index' AND s.state = 'running'
           AND s.reason = 'census-requested' AND s.requested_at IS NOT NULL
           AND r.main_root = ?
         ORDER BY s.requested_at DESC LIMIT 1`,
      )
      .get(mainRoot);
    if (row === undefined) return null;
    return toPendingCensus(row);
  }

  lastHookCensusCompletedAt(mainRoot: string): number | null {
    return maxUpdatedRow.parse(
      this.db
        .prepare(
          `SELECT MAX(s.updated_at) AS updated_at FROM task_end_steps s
           JOIN task_end_runs r ON r.run_id = s.run_id
           WHERE s.step = 'index' AND s.state = 'succeeded'
             AND s.reason = 'census-completed' AND r.main_root = ?`,
        )
        .get(mainRoot),
    ).updated_at;
  }

  listDeferredCensusSteps(
    mainRoot: string,
  ): readonly TaskEndDeferredCensusStep[] {
    return this.db
      .prepare(
        `SELECT s.run_id, s.reason, r.queue_seq FROM task_end_steps s
         JOIN task_end_runs r ON r.run_id = s.run_id
         WHERE s.step = 'index' AND s.state = 'deferred'
           AND s.reason IN ('census-cooldown', 'foreground-active')
           AND r.main_root = ?
           AND r.state IN ('settling', 'queued', 'running')
         ORDER BY r.queue_seq`,
      )
      .all(mainRoot)
      .map(toDeferredCensusStep);
  }

  // --- Journal internals ---------------------------------------------------

  private journalInTransaction(
    observation: TaskEndObservation,
    policy: TaskEndRunPolicy,
  ): TaskEndObservationClass {
    const { repoId, taskId, status } = observation;
    const now = this.now();
    const current = this.readJournal(repoId, taskId);
    const terminal = isTerminalStatus(status);
    const wasTerminal =
      current !== null && isTerminalStatus(current.last_status);

    if (current !== null && current.last_status === status) {
      return terminal
        ? {
            kind: 'duplicate',
            dedupeKey: { repoId, taskId, episode: current.episode },
          }
        : { kind: 'no-op' };
    }

    if (!terminal) {
      this.writeJournal(repoId, taskId, status, current?.episode ?? 0, now);
      if (current === null || !wasTerminal) {
        return {
          kind: 'non-terminal-update',
          fromStatus: current?.last_status ?? null,
          toStatus: status,
        };
      }
      const transitionId = this.insertTransition(
        {
          repoId,
          taskId,
          episode: current.episode,
          fromStatus: current.last_status,
          toStatus: status,
          source: observation.source,
          seenRoot: observation.seenRoot,
          noRunReason: null,
        },
        now,
      );
      return {
        kind: 'reversion',
        transitionId,
        fromStatus: current.last_status,
        toStatus: status,
        cancelledRunIds: this.cancelRevertedRuns(repoId, taskId, now),
      };
    }

    if (wasTerminal) {
      // `done → cancelled` (or the reverse): same episode, no run.
      this.writeJournal(repoId, taskId, status, current.episode, now);
      return {
        kind: 'duplicate',
        dedupeKey: { repoId, taskId, episode: current.episode },
      };
    }

    const episode = (current?.episode ?? 0) + 1;
    const fromStatus = current?.last_status ?? null;
    this.writeJournal(repoId, taskId, status, episode, now);
    const noRunReason = policy.hookEnabled ? null : 'hook-disabled';
    const transitionId = this.insertTransition(
      {
        repoId,
        taskId,
        episode,
        fromStatus,
        toStatus: status,
        source: observation.source,
        seenRoot: observation.seenRoot,
        noRunReason,
      },
      now,
    );
    this.fault('after-transition-insert');
    const dedupeKey = { repoId, taskId, episode };
    if (noRunReason !== null) {
      return {
        kind: 'terminal-entry',
        dedupeKey,
        transitionId,
        entry: { kind: 'no-run', noRunReason },
      };
    }
    const admission = this.admission(policy);
    const runId = this.insertRun(
      {
        transitionId,
        repoId,
        taskId,
        episode,
        source: observation.source,
        fromStatus,
        toStatus: status,
        seenRoot: observation.seenRoot,
        mainRoot: observation.mainRoot,
      },
      admission,
      now + policy.settleWindowMs,
      now,
    );
    return {
      kind: 'terminal-entry',
      dedupeKey,
      transitionId,
      entry: {
        kind: 'run',
        runId,
        state: admission.state === 'skipped' ? 'skipped' : 'settling',
      },
    };
  }

  private readJournal(repoId: string, taskId: string): JournalRow | null {
    const row = this.db
      .prepare(
        `SELECT last_status, episode FROM task_end_journal
         WHERE repo_id = ? AND task_id = ?`,
      )
      .get(repoId, taskId);
    return row === undefined ? null : journalRow.parse(row);
  }

  private writeJournal(
    repoId: string,
    taskId: string,
    status: TaskStatus,
    episode: number,
    now: number,
  ): void {
    this.db
      .prepare(
        `INSERT INTO task_end_journal (repo_id, task_id, last_status, episode, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(repo_id, task_id) DO UPDATE SET
           last_status = excluded.last_status,
           episode = excluded.episode,
           updated_at = excluded.updated_at`,
      )
      .run(repoId, taskId, status, episode, now);
  }

  private insertTransition(fields: TransitionFields, now: number): string {
    const transitionId = ulid();
    this.db
      .prepare(
        `INSERT INTO task_end_transitions
           (transition_id, repo_id, task_id, episode, from_status, to_status,
            source, seen_root, observed_at, no_run_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        transitionId,
        fields.repoId,
        fields.taskId,
        fields.episode,
        fields.fromStatus,
        fields.toStatus,
        fields.source,
        fields.seenRoot,
        now,
        fields.noRunReason,
      );
    return transitionId;
  }

  /** The queue cap counts runs in `settling` or `queued` at creation time. */
  private admission(policy: TaskEndRunPolicy): CreatedRunStatus {
    return this.countQueuedOrSettling() >= policy.queueCap
      ? QUEUE_FULL
      : SETTLING;
  }

  /**
   * Inserts a run and its four pending placeholder steps (ordinals 0-3,
   * subject `''`) inside the caller's transaction (AC 6.1).
   */
  private insertRun(
    fields: RunFields,
    status: CreatedRunStatus,
    settleUntil: number,
    now: number,
  ): string {
    const runId = ulid();
    const queueSeq = countRow.parse(
      this.db
        .prepare(
          'SELECT COALESCE(MAX(queue_seq), 0) + 1 AS count FROM task_end_runs',
        )
        .get(),
    ).count;
    const ended = status.state === 'settling' ? null : now;
    this.db
      .prepare(
        `INSERT INTO task_end_runs
           (run_id, transition_id, repo_id, task_id, episode, source,
            from_status, to_status, seen_root, main_root, state, reason,
            queue_seq, settle_until, created_at, started_at, ended_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        runId,
        fields.transitionId,
        fields.repoId,
        fields.taskId,
        fields.episode,
        fields.source,
        fields.fromStatus,
        fields.toStatus,
        fields.seenRoot,
        fields.mainRoot,
        status.state,
        status.reason,
        queueSeq,
        settleUntil,
        now,
        ended,
        now,
      );
    this.fault('after-run-insert');
    const insertStep = this.db.prepare(
      `INSERT INTO task_end_steps
         (run_id, step, subject, ordinal, state, attempts, updated_at)
       VALUES (?, ?, '', ?, 'pending', 0, ?)`,
    );
    for (const step of TASK_END_STEP_KINDS) {
      insertStep.run(runId, step, ordinalOf(step), now);
    }
    return runId;
  }

  /** Cancels the open runs of a task whose dispose step is not terminal. */
  private cancelRevertedRuns(
    repoId: string,
    taskId: string,
    now: number,
  ): readonly string[] {
    const runIds = this.db
      .prepare(
        `SELECT r.run_id FROM task_end_runs r
         WHERE r.repo_id = ? AND r.task_id = ?
           AND r.state IN ('settling', 'queued', 'running')
           AND ${DISPOSE_NOT_TERMINAL}
         ORDER BY r.queue_seq`,
      )
      .all(repoId, taskId)
      .map((row) => runIdRow.parse(row).run_id);
    const cancel = this.db.prepare(
      `UPDATE task_end_runs SET state = 'cancelled', reason = 'status-reverted',
         ended_at = ?, updated_at = ? WHERE run_id = ?`,
    );
    for (const runId of runIds) cancel.run(now, now, runId);
    return runIds;
  }

  private storedMainRoot(repoId: string): string | null {
    const row = this.db
      .prepare('SELECT main_root FROM task_end_repo_state WHERE repo_id = ?')
      .get(repoId);
    if (row === undefined) return null;
    return mainRootRow.parse(row).main_root;
  }

  // --- Read internals ------------------------------------------------------

  private firstRun(rows: readonly unknown[]): TaskEndRunRecord | null {
    return this.loadRuns(rows)[0] ?? null;
  }

  /** Maps run rows plus one steps query for all of them (no N+1). */
  private loadRuns(rows: readonly unknown[]): TaskEndRunRecord[] {
    const runs = this.mapper.parseRuns(rows);
    if (runs.length === 0) return [];
    const stepRows = this.db
      .prepare(
        `SELECT ${STEP_COLUMNS} FROM task_end_steps
         WHERE run_id IN (SELECT value FROM json_each(?))
         ORDER BY ordinal, rowid`,
      )
      .all(JSON.stringify(runs.map((run) => run.run_id)));
    return this.mapper.toRunRecords(runs, stepRows);
  }

  private missingEntry(runId: string, step: TaskEndStepKind): Error {
    return new Error(
      `task-end run ${runId} has no ${step} entry for that subject`,
    );
  }
}
