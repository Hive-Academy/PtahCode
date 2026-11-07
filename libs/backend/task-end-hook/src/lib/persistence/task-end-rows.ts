import { z } from 'zod';
import {
  TASK_END_DISPOSE_BLOCK_REASONS,
  TASK_END_RETRYABLE_CURATOR_REASONS,
  TASK_END_RUN_STATES,
  TASK_END_STEP_KINDS,
  TASK_END_STEP_STATES,
  TASK_END_TRIGGER_SOURCES,
  TASK_STATUSES,
} from '@ptah-extension/shared';

/**
 * Zod schemas for the migration 0072 rows and for the closed step outcomes
 * stored in `task_end_steps` (plan Component 3, TASK_2026_886).
 *
 * Every row the store reads is parsed here, as `sqlite-review.repository.ts`
 * parses its rows. Outcome schemas are strict: a field outside the closed
 * vocabulary of `@ptah-extension/shared` is rejected, so `extra_json` can
 * never carry free text.
 */

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const taskStatus = z.enum(TASK_STATUSES);

export const journalRow = z.object({
  last_status: taskStatus,
  episode: z.number().int(),
});
export type JournalRow = z.infer<typeof journalRow>;

/** A committed terminal transition that has neither a run nor a reason. */
export const orphanTransitionRow = z.object({
  transition_id: z.string().min(1),
  repo_id: z.string().min(1),
  task_id: z.string().min(1),
  episode: z.number().int(),
  from_status: taskStatus.nullable(),
  to_status: taskStatus,
  source: z.enum(TASK_END_TRIGGER_SOURCES),
  seen_root: z.string(),
});
export type OrphanTransitionRow = z.infer<typeof orphanTransitionRow>;

export const runRow = z.object({
  run_id: z.string().min(1),
  repo_id: z.string().min(1),
  task_id: z.string().min(1),
  episode: z.number().int(),
  source: z.enum(TASK_END_TRIGGER_SOURCES),
  from_status: taskStatus.nullable(),
  to_status: taskStatus,
  seen_root: z.string(),
  main_root: z.string().nullable(),
  state: z.enum(TASK_END_RUN_STATES),
  reason: z.string().nullable(),
  queue_seq: z.number().int(),
  settle_until: z.number().int(),
  created_at: z.number().int(),
  started_at: z.number().int().nullable(),
  ended_at: z.number().int().nullable(),
  updated_at: z.number().int(),
});
export type RunRow = z.infer<typeof runRow>;

export const stepRow = z.object({
  run_id: z.string().min(1),
  step: z.enum(TASK_END_STEP_KINDS),
  subject: z.string(),
  ordinal: z.number().int(),
  state: z.enum(TASK_END_STEP_STATES),
  reason: z.string().nullable(),
  extra_json: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  updated_at: z.number().int(),
});
export type StepRow = z.infer<typeof stepRow>;

export const pendingCensusRow = z.object({
  run_id: z.string().min(1),
  requested_at: z.number().int(),
});

export const deferredCensusRow = z.object({
  run_id: z.string().min(1),
  reason: z.enum(['census-cooldown', 'foreground-active']),
  queue_seq: z.number().int(),
});

export const countRow = z.object({ count: z.number().int() });
export const attemptsRow = z.object({ attempts: z.number().int() });
export const maxUpdatedRow = z.object({
  updated_at: z.number().int().nullable(),
});
export const runIdRow = z.object({ run_id: z.string().min(1) });
export const mainRootRow = z.object({ main_root: z.string().nullable() });
export const subjectRow = z.object({ subject: z.string() });

// ---------------------------------------------------------------------------
// Run status (the closed state/reason pairs of TaskEndRunStatus)
// ---------------------------------------------------------------------------

export const runStatusSchema = z.union([
  z.strictObject({
    state: z.enum(['settling', 'queued', 'running']),
    reason: z.null(),
  }),
  z.strictObject({
    state: z.literal('cancelled'),
    reason: z.literal('status-reverted'),
  }),
  z.strictObject({
    state: z.literal('skipped'),
    reason: z.literal('queue-full'),
  }),
  z.strictObject({
    state: z.literal('completed'),
    reason: z.literal('steps-terminal'),
  }),
]);

// ---------------------------------------------------------------------------
// Step outcomes (the closed TaskEndStepOutcome union)
// ---------------------------------------------------------------------------

const curateRetryReason = z.enum([
  ...TASK_END_RETRYABLE_CURATOR_REASONS,
  'hourly-limit',
]);
const curatorFailureReason = z.enum(['curator-error', 'auth-required']);
const nonNegativeCount = z.number().int().nonnegative();

const closeCurateOutcome = z.union([
  z.strictObject({
    step: z.literal('close-curate'),
    state: z.literal('succeeded'),
    reason: z.literal('curated'),
    counts: z.strictObject({
      extracted: nonNegativeCount,
      merged: nonNegativeCount,
      created: nonNegativeCount,
    }),
    transcript: z.enum(['read', 'read-failed']),
  }),
  z.strictObject({
    step: z.literal('close-curate'),
    state: z.literal('deferred'),
    reason: z.literal('session-active'),
    handedOffTo: z.literal('session-end-trigger'),
  }),
  z.strictObject({
    step: z.literal('close-curate'),
    state: z.literal('skipped'),
    reason: z.enum([
      'memory-disabled',
      'session-end-disabled',
      'no-linked-sessions',
      'curation-in-flight',
    ]),
  }),
  z.strictObject({
    step: z.literal('close-curate'),
    state: z.literal('deferred'),
    reason: curateRetryReason,
  }),
  z.strictObject({
    step: z.literal('close-curate'),
    state: z.literal('failed'),
    reason: z.enum([
      ...curateRetryReason.options,
      'provider-unsupported',
      'curator-failed',
    ]),
  }),
  z.strictObject({
    step: z.literal('close-curate'),
    state: z.literal('failed'),
    reason: curatorFailureReason,
    observations: z.enum(['kept', 'marked-uncurated']),
  }),
]);

const harvestOutcome = z.union([
  z.strictObject({
    step: z.literal('harvest'),
    state: z.literal('succeeded'),
    reason: z.enum(['harvested', 'already-harvested']),
  }),
  z.strictObject({
    step: z.literal('harvest'),
    state: z.literal('skipped'),
    reason: z.literal('no-carrier'),
  }),
  z.strictObject({
    step: z.literal('harvest'),
    state: z.literal('failed'),
    reason: z.literal('harvest-failed'),
  }),
]);

const disposeModeFields = {
  requestedMode: z.enum(['off', 'auto', 'confirm']),
  effectiveMode: z.literal('off'),
  modeReason: z.enum(['none', 'auto-unavailable', 'confirm-unavailable']),
  activityScope: z.literal('in-process'),
};

const disposeOutcome = z.union([
  z.strictObject({
    step: z.literal('dispose'),
    state: z.literal('skipped'),
    reason: z.literal('eligible-report-only'),
    ...disposeModeFields,
  }),
  z.strictObject({
    step: z.literal('dispose'),
    state: z.literal('blocked'),
    reason: z.enum(TASK_END_DISPOSE_BLOCK_REASONS),
    ...disposeModeFields,
  }),
]);

const indexOutcome = z.union([
  z.strictObject({
    step: z.literal('index'),
    state: z.literal('running'),
    reason: z.literal('census-requested'),
  }),
  z.strictObject({
    step: z.literal('index'),
    state: z.literal('succeeded'),
    reason: z.literal('census-completed'),
  }),
  z.strictObject({
    step: z.literal('index'),
    state: z.literal('succeeded'),
    reason: z.literal('coalesced'),
    joined: z.union([
      z.strictObject({
        source: z.literal('hook-run'),
        runId: z.string().min(1),
      }),
      z.strictObject({ source: z.literal('external') }),
    ]),
  }),
  z.strictObject({
    step: z.literal('index'),
    state: z.literal('failed'),
    reason: z.enum(['census-failed', 'census-interrupted']),
  }),
  z.strictObject({
    step: z.literal('index'),
    state: z.literal('deferred'),
    reason: z.enum(['census-cooldown', 'foreground-active']),
  }),
  z.strictObject({
    step: z.literal('index'),
    state: z.literal('skipped'),
    reason: z.enum([
      'pipeline-disabled',
      'main-root-unresolved',
      'main-root-not-open',
    ]),
  }),
]);

/** Every member of `TaskEndStepOutcome`, strict (no extra fields). */
export const stepOutcomeSchema = z.union([
  closeCurateOutcome,
  harvestOutcome,
  disposeOutcome,
  indexOutcome,
]);
