/**
 * Task-end hook vocabulary (TASK_2026_886).
 *
 * The single closed vocabulary for task-end runs, their steps, the states
 * they move through and the reason codes they record. The recording API
 * accepts only {@link TaskEndStepOutcome}, so a (step, state, reason) pair
 * that is not listed here is a compile error.
 *
 * In this task the hook is report-only: dispose never removes, moves or
 * archives anything. `effectiveMode` is therefore the literal `'off'`, and the
 * removal outcomes (`removed`, `archive-failed`, ...) are not members.
 *
 * Plain types and `const` tables only. NO Zod, NO I/O: the zod schemas for
 * stored `extra_json` live in the backend library that owns the tables.
 */

import type { TaskStatus } from './task-spec.types';

// ---------------------------------------------------------------------------
// States, kinds and sources
// ---------------------------------------------------------------------------

export const TASK_END_RUN_STATES = [
  'settling',
  'queued',
  'running',
  'completed',
  'cancelled',
  'skipped',
] as const;
export type TaskEndRunState = (typeof TASK_END_RUN_STATES)[number];

export const TASK_END_STEP_STATES = [
  'pending',
  'running',
  'succeeded',
  'skipped',
  'deferred',
  'blocked',
  'failed',
] as const;
export type TaskEndStepState = (typeof TASK_END_STEP_STATES)[number];

/** Step kinds in execution order; the tuple index is the stored `ordinal`. */
export const TASK_END_STEP_KINDS = [
  'close-curate',
  'harvest',
  'dispose',
  'index',
] as const;
export type TaskEndStepKind = (typeof TASK_END_STEP_KINDS)[number];

export const TASK_END_TRIGGER_SOURCES = [
  'write',
  'watcher',
  'reindex',
  'startup-reconcile',
] as const;
export type TaskEndTriggerSource = (typeof TASK_END_TRIGGER_SOURCES)[number];

/**
 * Why an observed terminal entry created no run. `duplicate` is never stored:
 * it exists only for the `duplicate-ignored` log line.
 */
export const TASK_END_NO_RUN_REASONS = [
  'baseline',
  'hook-disabled',
  'duplicate',
] as const;
export type TaskEndNoRunReason = (typeof TASK_END_NO_RUN_REASONS)[number];

/** The no-run reasons that are persisted on a transition row. */
export type TaskEndStoredNoRunReason = Exclude<TaskEndNoRunReason, 'duplicate'>;

// ---------------------------------------------------------------------------
// Curator codes
// ---------------------------------------------------------------------------

/**
 * Mirrors memory-curator's `CuratorRunReason` exactly (11 codes).
 * `libs/shared` cannot import memory-curator; the Electron adapter proves the
 * equality with a typed identity map.
 */
export const TASK_END_CURATOR_REASONS = [
  'provider-cooling-down',
  'provider-unreachable',
  'provider-unsupported',
  'concurrency-slot-timeout',
  'curator-queue-wait-timeout',
  'caller-aborted',
  'network-backoff',
  'host-shutdown',
  'no-output',
  'curator-error',
  'auth-required',
] as const;
export type TaskEndCuratorReason = (typeof TASK_END_CURATOR_REASONS)[number];

/** The eight curator codes the hook retries once (`deferred`, then `failed`). */
export const TASK_END_RETRYABLE_CURATOR_REASONS = [
  'provider-cooling-down',
  'provider-unreachable',
  'concurrency-slot-timeout',
  'curator-queue-wait-timeout',
  'network-backoff',
  'no-output',
  'caller-aborted',
  'host-shutdown',
] as const satisfies readonly TaskEndCuratorReason[];
export type TaskEndRetryableCuratorReason =
  (typeof TASK_END_RETRYABLE_CURATOR_REASONS)[number];

/**
 * The nine retryable close-curate reasons: the eight retryable curator codes
 * plus the session-end trigger's own `hourly-limit` gate, which is not a
 * curator code.
 */
export type TaskEndCurateRetryReason =
  | TaskEndRetryableCuratorReason
  | 'hourly-limit';

/** Terminal curator codes that carry the engine's observation handling. */
export type TaskEndCuratorFailureReason = 'curator-error' | 'auth-required';

// ---------------------------------------------------------------------------
// Dispose block codes and mode fields
// ---------------------------------------------------------------------------

export const TASK_END_DISPOSE_BLOCK_REASONS = [
  'status-not-eligible',
  'no-linked-worktree',
  'linked-to-other-task',
  'not-listed',
  'is-main-worktree',
  'outside-agent-dir',
  'locked',
  'dirty-tracked',
  'untracked-files',
  'archive-exists',
  'archive-too-large',
  'not-merged',
  'merge-unverified',
  'open-pr',
  'in-use',
  'in-use-unverifiable',
  'harvest-pending',
  'harvest-failed',
  'harvest-no-carrier',
  'precondition-unverifiable',
] as const;
export type TaskEndDisposeBlockReason =
  (typeof TASK_END_DISPOSE_BLOCK_REASONS)[number];

export type TaskEndDisposeRequestedMode = 'off' | 'auto' | 'confirm';
export type TaskEndDisposeModeReason =
  | 'none'
  | 'auto-unavailable'
  | 'confirm-unavailable';

/** Carried by every dispose outcome. `effectiveMode` is `'off'` in this task. */
export interface TaskEndDisposeModeFields {
  readonly requestedMode: TaskEndDisposeRequestedMode;
  readonly effectiveMode: 'off';
  readonly modeReason: TaskEndDisposeModeReason;
  readonly activityScope: 'in-process';
}

// ---------------------------------------------------------------------------
// Step outcomes (the closed union the recording API accepts)
// ---------------------------------------------------------------------------

export type TaskEndTranscriptRead = 'read' | 'read-failed';
export type TaskEndObservationsHandling = 'kept' | 'marked-uncurated';

export interface TaskEndCurationCounts {
  readonly extracted: number;
  readonly merged: number;
  readonly created: number;
}

export type TaskEndCloseCurateOutcome =
  | {
      readonly step: 'close-curate';
      readonly state: 'succeeded';
      readonly reason: 'curated';
      readonly counts: TaskEndCurationCounts;
      readonly transcript: TaskEndTranscriptRead;
    }
  | {
      readonly step: 'close-curate';
      readonly state: 'deferred';
      readonly reason: 'session-active';
      readonly handedOffTo: 'session-end-trigger';
    }
  | {
      readonly step: 'close-curate';
      readonly state: 'skipped';
      readonly reason:
        | 'memory-disabled'
        | 'session-end-disabled'
        | 'no-linked-sessions'
        | 'curation-in-flight';
    }
  | {
      readonly step: 'close-curate';
      readonly state: 'deferred';
      readonly reason: TaskEndCurateRetryReason;
    }
  | {
      readonly step: 'close-curate';
      readonly state: 'failed';
      readonly reason:
        | TaskEndCurateRetryReason
        | 'provider-unsupported'
        | 'curator-failed';
    }
  | {
      readonly step: 'close-curate';
      readonly state: 'failed';
      readonly reason: TaskEndCuratorFailureReason;
      readonly observations: TaskEndObservationsHandling;
    };

export type TaskEndHarvestOutcome =
  | {
      readonly step: 'harvest';
      readonly state: 'succeeded';
      readonly reason: 'harvested' | 'already-harvested';
    }
  | {
      readonly step: 'harvest';
      readonly state: 'skipped';
      readonly reason: 'no-carrier' | 'manual-only';
    }
  | {
      readonly step: 'harvest';
      readonly state: 'failed';
      readonly reason: 'harvest-failed';
    };

export type TaskEndDisposeOutcome =
  | ({
      readonly step: 'dispose';
      readonly state: 'skipped';
      readonly reason: 'eligible-report-only' | 'pending-user-approval';
    } & TaskEndDisposeModeFields)
  | ({
      readonly step: 'dispose';
      readonly state: 'blocked';
      readonly reason: TaskEndDisposeBlockReason;
    } & TaskEndDisposeModeFields);

/** Who ran the census an index step joined instead of requesting its own. */
export type TaskEndCensusJoin =
  | { readonly source: 'hook-run'; readonly runId: string }
  | { readonly source: 'external' };

export type TaskEndIndexOutcome =
  | {
      readonly step: 'index';
      readonly state: 'running';
      readonly reason: 'census-requested';
    }
  | {
      readonly step: 'index';
      readonly state: 'succeeded';
      readonly reason: 'census-completed';
    }
  | {
      readonly step: 'index';
      readonly state: 'succeeded';
      readonly reason: 'coalesced';
      readonly joined: TaskEndCensusJoin;
    }
  | {
      readonly step: 'index';
      readonly state: 'failed';
      readonly reason: 'census-failed' | 'census-interrupted';
    }
  | {
      readonly step: 'index';
      readonly state: 'deferred';
      readonly reason: 'census-cooldown' | 'foreground-active';
    }
  | {
      readonly step: 'index';
      readonly state: 'skipped';
      readonly reason:
        | 'pipeline-disabled'
        | 'main-root-unresolved'
        | 'main-root-not-open';
    };

export type TaskEndStepOutcome =
  | TaskEndCloseCurateOutcome
  | TaskEndHarvestOutcome
  | TaskEndDisposeOutcome
  | TaskEndIndexOutcome;

/** A step entry that has not recorded an outcome yet. */
export interface TaskEndPendingOutcome {
  readonly state: 'pending';
}

/** Every reason a step outcome can carry. */
export type TaskEndStepReason = TaskEndStepOutcome['reason'];

// ---------------------------------------------------------------------------
// Run outcomes
// ---------------------------------------------------------------------------

export type TaskEndRunStatus =
  | { readonly state: 'settling' | 'queued' | 'running'; readonly reason: null }
  | { readonly state: 'cancelled'; readonly reason: 'status-reverted' }
  | { readonly state: 'skipped'; readonly reason: 'queue-full' }
  | { readonly state: 'completed'; readonly reason: 'steps-terminal' };

export type TaskEndRunReason = Exclude<TaskEndRunStatus['reason'], null>;

/** Every reason code that has a fixed display sentence. */
export type TaskEndReasonCode =
  | TaskEndStepReason
  | TaskEndRunReason
  | TaskEndStoredNoRunReason;

// ---------------------------------------------------------------------------
// Outcome table and its completeness proof
// ---------------------------------------------------------------------------

/**
 * One (step, state, reason) key per union member, distributed over every
 * reason literal, so a member whose `reason` is a union yields one key each.
 */
type OutcomeKeyOf<T> = T extends {
  readonly step: infer S;
  readonly state: infer St;
  readonly reason: infer R;
}
  ? KeyPerReason<S, St, R>
  : never;

type KeyPerReason<S, St, R> = R extends string
  ? { readonly step: S; readonly state: St; readonly reason: R }
  : never;

/** A single allowed (step, state, reason) pair. */
export type TaskEndOutcomeKey = OutcomeKeyOf<TaskEndStepOutcome>;

/** `step/state/reason` as one string, e.g. `dispose/blocked/locked`. */
export type TaskEndOutcomeId<K extends TaskEndOutcomeKey = TaskEndOutcomeKey> =
  K extends TaskEndOutcomeKey ? `${K['step']}/${K['state']}/${K['reason']}` : never;

/**
 * Every allowed (step, state, reason) pair, in step order. Extra fields are
 * per-record data and are not part of the key. `satisfies` rejects a pair
 * that is not a member; {@link TaskEndOutcomeTableComplete} rejects a member
 * that is missing.
 */
export const TASK_END_OUTCOME_TABLE = [
  // close-curate
  { step: 'close-curate', state: 'succeeded', reason: 'curated' },
  { step: 'close-curate', state: 'deferred', reason: 'session-active' },
  { step: 'close-curate', state: 'skipped', reason: 'memory-disabled' },
  { step: 'close-curate', state: 'skipped', reason: 'session-end-disabled' },
  { step: 'close-curate', state: 'skipped', reason: 'no-linked-sessions' },
  { step: 'close-curate', state: 'skipped', reason: 'curation-in-flight' },
  { step: 'close-curate', state: 'deferred', reason: 'provider-cooling-down' },
  { step: 'close-curate', state: 'deferred', reason: 'provider-unreachable' },
  { step: 'close-curate', state: 'deferred', reason: 'concurrency-slot-timeout' },
  { step: 'close-curate', state: 'deferred', reason: 'curator-queue-wait-timeout' },
  { step: 'close-curate', state: 'deferred', reason: 'network-backoff' },
  { step: 'close-curate', state: 'deferred', reason: 'no-output' },
  { step: 'close-curate', state: 'deferred', reason: 'caller-aborted' },
  { step: 'close-curate', state: 'deferred', reason: 'host-shutdown' },
  { step: 'close-curate', state: 'deferred', reason: 'hourly-limit' },
  { step: 'close-curate', state: 'failed', reason: 'provider-cooling-down' },
  { step: 'close-curate', state: 'failed', reason: 'provider-unreachable' },
  { step: 'close-curate', state: 'failed', reason: 'concurrency-slot-timeout' },
  { step: 'close-curate', state: 'failed', reason: 'curator-queue-wait-timeout' },
  { step: 'close-curate', state: 'failed', reason: 'network-backoff' },
  { step: 'close-curate', state: 'failed', reason: 'no-output' },
  { step: 'close-curate', state: 'failed', reason: 'caller-aborted' },
  { step: 'close-curate', state: 'failed', reason: 'host-shutdown' },
  { step: 'close-curate', state: 'failed', reason: 'hourly-limit' },
  { step: 'close-curate', state: 'failed', reason: 'provider-unsupported' },
  { step: 'close-curate', state: 'failed', reason: 'curator-error' },
  { step: 'close-curate', state: 'failed', reason: 'auth-required' },
  { step: 'close-curate', state: 'failed', reason: 'curator-failed' },
  // harvest
  { step: 'harvest', state: 'succeeded', reason: 'harvested' },
  { step: 'harvest', state: 'succeeded', reason: 'already-harvested' },
  { step: 'harvest', state: 'skipped', reason: 'no-carrier' },
  { step: 'harvest', state: 'skipped', reason: 'manual-only' },
  { step: 'harvest', state: 'failed', reason: 'harvest-failed' },
  // dispose
  { step: 'dispose', state: 'skipped', reason: 'eligible-report-only' },
  { step: 'dispose', state: 'skipped', reason: 'pending-user-approval' },
  { step: 'dispose', state: 'blocked', reason: 'status-not-eligible' },
  { step: 'dispose', state: 'blocked', reason: 'no-linked-worktree' },
  { step: 'dispose', state: 'blocked', reason: 'linked-to-other-task' },
  { step: 'dispose', state: 'blocked', reason: 'not-listed' },
  { step: 'dispose', state: 'blocked', reason: 'is-main-worktree' },
  { step: 'dispose', state: 'blocked', reason: 'outside-agent-dir' },
  { step: 'dispose', state: 'blocked', reason: 'locked' },
  { step: 'dispose', state: 'blocked', reason: 'dirty-tracked' },
  { step: 'dispose', state: 'blocked', reason: 'untracked-files' },
  { step: 'dispose', state: 'blocked', reason: 'archive-exists' },
  { step: 'dispose', state: 'blocked', reason: 'archive-too-large' },
  { step: 'dispose', state: 'blocked', reason: 'not-merged' },
  { step: 'dispose', state: 'blocked', reason: 'merge-unverified' },
  { step: 'dispose', state: 'blocked', reason: 'open-pr' },
  { step: 'dispose', state: 'blocked', reason: 'in-use' },
  { step: 'dispose', state: 'blocked', reason: 'in-use-unverifiable' },
  { step: 'dispose', state: 'blocked', reason: 'harvest-pending' },
  { step: 'dispose', state: 'blocked', reason: 'harvest-failed' },
  { step: 'dispose', state: 'blocked', reason: 'harvest-no-carrier' },
  { step: 'dispose', state: 'blocked', reason: 'precondition-unverifiable' },
  // index
  { step: 'index', state: 'running', reason: 'census-requested' },
  { step: 'index', state: 'succeeded', reason: 'census-completed' },
  { step: 'index', state: 'succeeded', reason: 'coalesced' },
  { step: 'index', state: 'failed', reason: 'census-failed' },
  { step: 'index', state: 'failed', reason: 'census-interrupted' },
  { step: 'index', state: 'deferred', reason: 'census-cooldown' },
  { step: 'index', state: 'deferred', reason: 'foreground-active' },
  { step: 'index', state: 'skipped', reason: 'pipeline-disabled' },
  { step: 'index', state: 'skipped', reason: 'main-root-unresolved' },
  { step: 'index', state: 'skipped', reason: 'main-root-not-open' },
] as const satisfies readonly TaskEndOutcomeKey[];

type MissingOutcomeIds = Exclude<
  TaskEndOutcomeId,
  TaskEndOutcomeId<(typeof TASK_END_OUTCOME_TABLE)[number]>
>;

/**
 * Completeness proof: resolves to `true` only while every member of
 * {@link TaskEndStepOutcome} has a row in {@link TASK_END_OUTCOME_TABLE}.
 * A missing row makes the constraint `never` fail to compile, naming the
 * missing `step/state/reason` id.
 */
type AssertNoneMissing<T extends never> = [T] extends [never] ? true : never;
export type TaskEndOutcomeTableComplete = AssertNoneMissing<MissingOutcomeIds>;

// ---------------------------------------------------------------------------
// Display sentences
// ---------------------------------------------------------------------------

/**
 * One fixed sentence per reason code. The reader looks `message` up here; it
 * is never stored and never comes from an engine, so no engine text, path or
 * error message reaches a record.
 */
export const TASK_END_REASON_MESSAGES: Readonly<Record<TaskEndReasonCode, string>> = {
  // close-curate
  curated: 'The linked session was curated into memory.',
  'session-active':
    'The session is still active; the session-end trigger will curate it when it ends.',
  'memory-disabled': 'Memory is turned off, so no curation ran.',
  'session-end-disabled':
    'The session-end memory trigger is turned off, so no curation ran.',
  'no-linked-sessions': 'The task has no linked sessions to curate.',
  'curation-in-flight': 'A curation pass for this session was already running.',
  'provider-cooling-down': 'The curation provider is cooling down after recent errors.',
  'provider-unreachable': 'The curation provider could not be reached.',
  'provider-unsupported': 'The configured provider cannot run curation passes.',
  'concurrency-slot-timeout': 'No curation slot became free in time.',
  'curator-queue-wait-timeout': 'The curation request waited too long in the queue.',
  'caller-aborted': 'The curation pass was aborted before it finished.',
  'network-backoff': 'Curation is paused while the network recovers.',
  'host-shutdown': 'The app shut down before the curation pass finished.',
  'no-output': 'The curation pass produced no output.',
  'curator-error': 'The curation pass failed with an error.',
  'auth-required': 'The curation provider needs you to sign in again.',
  'hourly-limit': 'The hourly curation limit was reached.',
  'curator-failed': 'The curation pass failed unexpectedly.',
  // harvest
  harvested: 'The task folder was harvested.',
  'already-harvested': 'The task folder had already been harvested.',
  'no-carrier': 'The task has no task folder to harvest.',
  'manual-only': 'Task learning runs after a confirmed merge or an explicit request.',
  'harvest-failed': 'Harvesting the task folder failed.',
  // dispose
  'eligible-report-only':
    'The worktree is eligible for removal; this version only reports it.',
  'pending-user-approval': 'The worktree is eligible, but automatic removal is off.',
  'status-not-eligible': 'The task status does not allow worktree removal.',
  'no-linked-worktree': 'The task has no linked worktree.',
  'linked-to-other-task': 'The worktree is linked to another task.',
  'not-listed': 'Git does not list this worktree.',
  'is-main-worktree': 'This is the main worktree, which is never removed.',
  'outside-agent-dir': 'The worktree is outside the agent worktree directory.',
  locked: 'The worktree is locked.',
  'dirty-tracked': 'The worktree has uncommitted changes to tracked files.',
  'untracked-files': 'The worktree has untracked files.',
  'archive-exists': 'An archive for this worktree already exists.',
  'archive-too-large': 'The worktree is too large to archive.',
  'not-merged': 'The worktree branch is not merged.',
  'merge-unverified': 'Whether the worktree branch is merged could not be verified.',
  'open-pr': 'The worktree branch has an open pull request.',
  'in-use': 'The worktree is in use.',
  'in-use-unverifiable': 'Whether the worktree is in use could not be verified.',
  'harvest-pending': 'The task folder has not been harvested yet.',
  'harvest-no-carrier': 'The task had no task folder to harvest before removal.',
  'precondition-unverifiable': 'A removal precondition could not be verified.',
  // index
  'census-requested': 'A code index census was requested.',
  'census-completed': 'The code index census completed.',
  coalesced: 'The step joined a code index census that was already running.',
  'census-failed': 'The code index census failed.',
  'census-interrupted': 'The code index census was interrupted.',
  'census-cooldown': 'The code index census is cooling down after a recent run.',
  'foreground-active': 'The census waits while foreground indexing is active.',
  'pipeline-disabled': 'The code index pipeline is turned off.',
  'main-root-unresolved': 'The main worktree of the repository could not be resolved.',
  'main-root-not-open': 'The main worktree is not an open workspace folder.',
  // runs
  'status-reverted': 'The task left the done or cancelled status, so the run stopped.',
  'queue-full': 'The task-end queue was full, so the run did not start.',
  'steps-terminal': 'Every step reached a final outcome.',
  // no-run transitions
  baseline: 'The status was recorded as the starting point; no run was created.',
  'hook-disabled': 'The task-end hook is turned off; no run was created.',
};

/** The sentence shown for a step entry that has not recorded an outcome. */
export const TASK_END_PENDING_STEP_MESSAGE = 'The step has not run yet.';

/** The display sentence for a step entry, looked up from the fixed tables. */
export function taskEndStepMessage(
  outcome: TaskEndStepOutcome | TaskEndPendingOutcome,
): string {
  return outcome.state === 'pending'
    ? TASK_END_PENDING_STEP_MESSAGE
    : TASK_END_REASON_MESSAGES[outcome.reason];
}

// ---------------------------------------------------------------------------
// Terminality
// ---------------------------------------------------------------------------

/**
 * Step states that are always final. `deferred` is final only for
 * `close-curate`/`session-active` (see {@link isTerminalStep}).
 */
export const TASK_END_TERMINAL_STEP_STATES = [
  'succeeded',
  'skipped',
  'blocked',
  'failed',
] as const satisfies readonly TaskEndStepState[];

const TERMINAL_STATES: ReadonlySet<TaskEndStepState> = new Set(
  TASK_END_TERMINAL_STEP_STATES,
);

/** Whether a step entry has reached a final outcome. */
export function isTerminalStep(
  outcome: TaskEndStepOutcome | TaskEndPendingOutcome,
): boolean {
  if (outcome.state === 'deferred') {
    return outcome.reason === 'session-active';
  }
  return TERMINAL_STATES.has(outcome.state);
}

// ---------------------------------------------------------------------------
// Records read back by the reader
// ---------------------------------------------------------------------------

type StepRecordFor<K extends TaskEndStepKind> = {
  readonly step: K;
  /**
   * `''` for harvest and index, and for the placeholder entry of close-curate
   * and dispose before their subjects are known; otherwise the session id
   * (close-curate) or the worktree path (dispose).
   */
  readonly subject: string;
  readonly outcome:
    | Extract<TaskEndStepOutcome, { readonly step: K }>
    | TaskEndPendingOutcome;
  /** Looked up from {@link TASK_END_REASON_MESSAGES}; never stored. */
  readonly message: string;
  readonly updatedAt: number;
  readonly attempts: number;
};

export type TaskEndStepRecord = {
  [K in TaskEndStepKind]: StepRecordFor<K>;
}[TaskEndStepKind];

interface TaskEndRunRecordFields {
  readonly runId: string;
  readonly repoId: string;
  readonly taskId: string;
  readonly episode: number;
  readonly source: TaskEndTriggerSource;
  readonly fromStatus: TaskStatus | null;
  readonly toStatus: TaskStatus;
  readonly seenRoot: string;
  /** `null` when the main worktree root could not be derived and validated. */
  readonly mainRoot: string | null;
  readonly createdAt: number;
  readonly settleUntil: number;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly updatedAt: number;
  /** At least one entry per step kind from the moment the run exists. */
  readonly steps: readonly TaskEndStepRecord[];
}

export type TaskEndRunRecord = TaskEndRunRecordFields & TaskEndRunStatus;

// ---------------------------------------------------------------------------
// Curation port result
// ---------------------------------------------------------------------------

/** The closed result of the curation port's `curateEndedSession`. */
export type TaskEndCurationResult =
  | {
      readonly kind: 'ran';
      readonly counts: TaskEndCurationCounts;
      readonly transcript: TaskEndTranscriptRead;
    }
  | {
      readonly kind: 'gated';
      readonly gate:
        | 'memory-disabled'
        | 'session-end-disabled'
        | 'in-flight'
        | 'hourly-limit';
    }
  | {
      readonly kind: 'stalled';
      readonly reason: TaskEndCuratorReason | null;
      readonly transcript: TaskEndTranscriptRead | 'not-read';
    }
  | {
      readonly kind: 'failed';
      readonly reason: TaskEndCuratorReason | null;
      readonly observations: TaskEndObservationsHandling;
      readonly transcript: TaskEndTranscriptRead;
    }
  | { readonly kind: 'threw'; readonly stage: 'pass' | 'unexpected' };
