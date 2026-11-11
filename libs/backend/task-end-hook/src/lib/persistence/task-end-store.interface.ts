import type {
  TaskEndRunRecord,
  TaskEndRunStatus,
  TaskEndStepKind,
  TaskEndStepOutcome,
  TaskEndStoredNoRunReason,
  TaskEndTriggerSource,
  TaskStatus,
} from '@ptah-extension/shared';

/**
 * The persistence contract of the task-end hook (plan Component 3,
 * batches.md Decision D3).
 *
 * Steps, the detector, the worker and the reader depend on this interface;
 * `SqliteTaskEndStore` implements it over the migration 0072 tables, and step
 * specs use an in-memory fake. Every method is synchronous (better-sqlite3)
 * and throws on a storage failure; callers log and never surface the failure
 * to the status write.
 *
 * No method takes free text: step outcomes are the closed
 * {@link TaskEndStepOutcome} union, whose extra fields the store validates
 * with zod before writing `extra_json`. The displayed sentence is looked up
 * from `TASK_END_REASON_MESSAGES` at read time.
 */

/** The dedupe key of one terminal episode of a task in one repository. */
export interface TaskEndDedupeKey {
  readonly repoId: string;
  readonly taskId: string;
  readonly episode: number;
}

/** One carrier status seen by the detector at commit time. */
export interface TaskEndObservation {
  /** Repository identity: real git common dir, or `nogit:<realpath(root)>`. */
  readonly repoId: string;
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly source: TaskEndTriggerSource;
  /** The registered workspace root the carrier was read from. */
  readonly seenRoot: string;
  /** Validated main worktree root; `null` when it could not be derived. */
  readonly mainRoot: string | null;
}

/** Settings the store applies when an observation creates a run. */
export interface TaskEndRunPolicy {
  /** `false` journals the terminal entry with `noRunReason: hook-disabled`. */
  readonly hookEnabled: boolean;
  /** A new run settles until `now + settleWindowMs`. */
  readonly settleWindowMs: number;
  /**
   * Runs in `settling` or `queued` at creation time; a run that would exceed
   * it is created directly as `skipped/queue-full`, its journal entry kept.
   */
  readonly queueCap: number;
}

/** What a terminal entry produced inside the observation's transaction. */
export type TaskEndEntryResult =
  | {
      readonly kind: 'run';
      readonly runId: string;
      /** `settling`, or `skipped` when the queue was full. */
      readonly state: 'settling' | 'skipped';
    }
  | { readonly kind: 'no-run'; readonly noRunReason: TaskEndStoredNoRunReason };

/** How `journalObservation` classified an observation. */
export type TaskEndObservationClass =
  /** Same non-terminal status as the last journaled one: nothing written. */
  | { readonly kind: 'no-op' }
  /** A non-terminal status after a non-terminal or absent one. */
  | {
      readonly kind: 'non-terminal-update';
      readonly fromStatus: TaskStatus | null;
      readonly toStatus: TaskStatus;
    }
  /**
   * A terminal status while the last journaled status is already terminal
   * (a watcher echo, the merged carrier seen from another root, or
   * `done → cancelled`). No new episode and no run; the detector logs
   * `duplicate-ignored` with this key.
   */
  | { readonly kind: 'duplicate'; readonly dedupeKey: TaskEndDedupeKey }
  /** A terminal status after a non-terminal or absent one: a new episode. */
  | {
      readonly kind: 'terminal-entry';
      readonly dedupeKey: TaskEndDedupeKey;
      readonly transitionId: string;
      readonly entry: TaskEndEntryResult;
    }
  /**
   * A non-terminal status after a terminal one. Every open run of the task
   * whose dispose step is not terminal became `cancelled/status-reverted`.
   */
  | {
      readonly kind: 'reversion';
      readonly transitionId: string;
      readonly fromStatus: TaskStatus;
      readonly toStatus: TaskStatus;
      readonly cancelledRunIds: readonly string[];
    };

/** One carrier visible when a repository is baselined. */
export interface TaskEndBaselineEntry {
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly seenRoot: string;
}

/** Selects the repository for {@link ITaskEndStore.latestRun}. */
export type TaskEndRunLookup =
  | { readonly repoId: string }
  /** When the repository identity is not cached: runs first seen here. */
  | { readonly seenRoot: string };

/** An index step in `running/census-requested` for a main root. */
export interface TaskEndPendingCensus {
  readonly runId: string;
  /** Epoch ms persisted when the step entered `running/census-requested`. */
  readonly requestedAt: number;
}

/** An index step waiting for a census window. */
export interface TaskEndDeferredCensusStep {
  readonly runId: string;
  readonly reason: 'census-cooldown' | 'foreground-active';
  /** The run's FIFO position; lists are ordered by it, oldest first. */
  readonly queueSeq: number;
}

/** Step kinds whose subjects are discovered at run time. */
export type TaskEndExpandableStep = Extract<
  TaskEndStepKind,
  'close-curate' | 'dispose'
>;

export type CloseOutStep = 'memory' | 'learning' | 'worktree' | 'branch';
export type CloseOutStepState = 'pending' | 'running' | 'ok' | 'failed' | 'refused' | 'skipped';

export interface CloseOutIdentity {
  readonly repoId: string;
  readonly taskId: string;
  readonly prNumber: number;
  readonly prUrl: string;
  readonly mainRoot: string;
  readonly worktreePath: string;
  readonly branch: string;
}

export interface CloseOutStepRecord {
  readonly step: CloseOutStep;
  readonly state: CloseOutStepState;
  readonly reason: string | null;
  readonly attempts: number;
}

export interface CloseOutRunRecord extends CloseOutIdentity {
  readonly runId: string;
  readonly steps: readonly CloseOutStepRecord[];
}

export interface ITaskCloseOutStore {
  /** Task IDs with a verified merged PR identity for this repository. */
  mergedTaskIds(repoId: string): ReadonlySet<string>;
  /** Atomic identity lookup/create; concurrent callers join the same run. */
  getOrCreateCloseOut(identity: CloseOutIdentity): CloseOutRunRecord;
  getCloseOut(runId: string): CloseOutRunRecord | null;
  getCloseOutForTask(repoId: string, taskId: string): CloseOutRunRecord | null;
  /** A step is checkpointed before its side effect. */
  startCloseOutStep(runId: string, step: CloseOutStep): void;
  finishCloseOutStep(
    runId: string,
    step: CloseOutStep,
    state: Exclude<CloseOutStepState, 'pending' | 'running'>,
    reason: string | null,
  ): void;
}

export interface ITaskEndStore {
  // --- Journal -------------------------------------------------------------

  /**
   * Journals one observation in a single transaction: reads the journal row,
   * classifies, writes the journal row and, for a terminal entry, the
   * transition plus either the run (state `settling`, `main_root` from the
   * observation) with its four pending placeholder steps (ordinals 0-3,
   * subject `''`), or the stored no-run reason. A reversion writes its
   * transition and cancels the open runs it reverts. Nothing persists when
   * any write fails.
   */
  journalObservation(
    observation: TaskEndObservation,
    policy: TaskEndRunPolicy,
  ): TaskEndObservationClass;

  /**
   * Creates a run (with its four placeholder steps) for every committed
   * terminal transition that has neither a run nor a no-run reason, applying
   * `policy` as `journalObservation` does. Returns the created run ids.
   */
  createRunForOrphans(policy: TaskEndRunPolicy): readonly string[];

  /** Whether the repository has a baseline (`task_end_repo_state` row). */
  isBaselined(repoId: string): boolean;

  /**
   * Journals every visible carrier of a repository in one transaction and
   * marks it baselined. Terminal entries get `noRunReason: baseline`; no run
   * is created.
   */
  recordBaseline(
    repoId: string,
    mainRoot: string | null,
    entries: readonly TaskEndBaselineEntry[],
  ): void;

  /** Stores a freshly derived main root when it differs from the stored one. */
  rememberMainRoot(repoId: string, mainRoot: string | null): void;

  // --- Runs ----------------------------------------------------------------

  /** One run with all its steps, or `null` when there is none. */
  getRun(runId: string): TaskEndRunRecord | null;

  /** The most recently created run of `taskId` in the selected repository. */
  latestRun(lookup: TaskEndRunLookup, taskId: string): TaskEndRunRecord | null;

  /** Runs in `settling`, `queued` or `running`, oldest `queue_seq` first. */
  listOpenRuns(): readonly TaskEndRunRecord[];

  /** Runs in `settling` or `queued` now (the queue-cap measure). */
  countQueuedOrSettling(): number;

  /** The oldest `queued` run by `queue_seq`, or `null`. Does not change it. */
  claimNext(): TaskEndRunRecord | null;

  /**
   * Moves a run to `status`. Entering `running` sets `started_at` once;
   * entering `completed`, `cancelled` or `skipped` sets `ended_at`.
   */
  setRunState(runId: string, status: TaskEndRunStatus): void;

  // --- Steps ---------------------------------------------------------------

  /**
   * Persists `running` for one step entry before its side effect and
   * increments its `attempts`. Returns the new attempt count.
   */
  markStepRunning(
    runId: string,
    step: TaskEndStepKind,
    subject: string,
  ): number;

  /**
   * Records an outcome on one step entry; the type ties `outcome.step` to
   * `step`. Extra fields are validated with zod before the write; anything
   * outside the closed schema is rejected (throws).
   * `index/running/census-requested` also sets `requested_at`. `attempts` is
   * unchanged.
   */
  upsertStep<K extends TaskEndStepKind>(
    runId: string,
    step: K,
    subject: string,
    outcome: Extract<TaskEndStepOutcome, { readonly step: K }>,
  ): void;

  /**
   * In one transaction: for non-empty `subjects`, replaces the step's `''`
   * placeholder with one pending entry per subject (stable order,
   * de-duplicated); for empty `subjects`, keeps the placeholder. Calling it
   * again with the same subjects changes nothing.
   */
  expandStep(
    runId: string,
    step: TaskEndExpandableStep,
    subjects: readonly string[],
  ): void;

  // --- Census lookups (plan Component 6.4) ---------------------------------

  /** The hook census in `running/census-requested` for `mainRoot`, if any. */
  pendingCensus(mainRoot: string): TaskEndPendingCensus | null;

  /** `updated_at` of the latest hook `census-completed` step for `mainRoot`. */
  lastHookCensusCompletedAt(mainRoot: string): number | null;

  /**
   * Index steps of open runs for `mainRoot` in `deferred/census-cooldown`
   * or `deferred/foreground-active`, oldest `queue_seq` first.
   */
  listDeferredCensusSteps(
    mainRoot: string,
  ): readonly TaskEndDeferredCensusStep[];
}
