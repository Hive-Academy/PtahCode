import {
  taskEndStepMessage,
  type TaskEndPendingOutcome,
  type TaskEndRunRecord,
  type TaskEndStepOutcome,
  type TaskEndStepRecord,
  type TaskEndStoredNoRunReason,
  type TaskEndTriggerSource,
  type TaskStatus,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type {
  TaskEndDeferredCensusStep,
  TaskEndPendingCensus,
} from './task-end-store.interface';
import {
  deferredCensusRow,
  pendingCensusRow,
  runRow,
  runStatusSchema,
  stepOutcomeSchema,
  stepRow,
  type OrphanTransitionRow,
  type RunRow,
  type StepRow,
} from './task-end-rows';

/** The columns of a new `task_end_runs` row taken from its transition. */
export interface RunFields {
  readonly transitionId: string;
  readonly repoId: string;
  readonly taskId: string;
  readonly episode: number;
  readonly source: TaskEndTriggerSource;
  readonly fromStatus: TaskStatus | null;
  readonly toStatus: TaskStatus;
  readonly seenRoot: string;
  readonly mainRoot: string | null;
}

/** The columns of a new `task_end_transitions` row. */
export interface TransitionFields {
  readonly repoId: string;
  readonly taskId: string;
  readonly episode: number;
  readonly fromStatus: TaskStatus | null;
  readonly toStatus: TaskStatus;
  readonly source: TaskEndTriggerSource | 'baseline';
  readonly seenRoot: string;
  readonly noRunReason: TaskEndStoredNoRunReason | null;
}

/** A reconciled orphan transition as the fields of its new run. */
export function orphanRunFields(
  orphan: OrphanTransitionRow,
  mainRoot: string | null,
): RunFields {
  return {
    transitionId: orphan.transition_id,
    repoId: orphan.repo_id,
    taskId: orphan.task_id,
    episode: orphan.episode,
    source: orphan.source,
    fromStatus: orphan.from_status,
    toStatus: orphan.to_status,
    seenRoot: orphan.seen_root,
    mainRoot,
  };
}

export function toPendingCensus(row: unknown): TaskEndPendingCensus {
  const parsed = pendingCensusRow.parse(row);
  return { runId: parsed.run_id, requestedAt: parsed.requested_at };
}

export function toDeferredCensusStep(row: unknown): TaskEndDeferredCensusStep {
  const parsed = deferredCensusRow.parse(row);
  return {
    runId: parsed.run_id,
    reason: parsed.reason,
    queueSeq: parsed.queue_seq,
  };
}

const PENDING: TaskEndPendingOutcome = { state: 'pending' };

/** Columns of `task_end_steps` that are not `extra_json`. */
const OUTCOME_COLUMNS: ReadonlySet<string> = new Set([
  'step',
  'state',
  'reason',
]);

/** A validated outcome split into its `task_end_steps` columns. */
export interface StoredStepOutcome {
  readonly outcome: TaskEndStepOutcome;
  readonly extraJson: string | null;
}

/**
 * Validates an outcome against the strict closed schema (a field outside it
 * throws) and splits the fields that are not `step`, `state` or `reason`
 * into `extra_json`.
 */
export function toStoredStepOutcome(outcome: unknown): StoredStepOutcome {
  const parsed = stepOutcomeSchema.parse(outcome);
  const extra = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !OUTCOME_COLUMNS.has(key)),
  );
  return {
    outcome: parsed,
    extraJson: Object.keys(extra).length === 0 ? null : JSON.stringify(extra),
  };
}

/**
 * Maps migration 0072 rows to the shared run records (plan Component 3).
 * Pure mapping, no SQL: every row is parsed with zod, and a malformed row is
 * logged and skipped. Built by `SqliteTaskEndStore` from its logger.
 */
export class TaskEndRowMapper {
  constructor(private readonly logger: Logger) {}

  /** Parses run rows, skipping (and logging) malformed ones. */
  parseRuns(rows: readonly unknown[]): RunRow[] {
    const runs: RunRow[] = [];
    for (const raw of rows) {
      const parsed = runRow.safeParse(raw);
      if (parsed.success) runs.push(parsed.data);
      else this.logMalformed('run', parsed.error);
    }
    return runs;
  }

  /**
   * Builds one record per run from its parsed row and the step rows of all
   * the runs (ordered by ordinal, then insertion).
   */
  toRunRecords(
    runs: readonly RunRow[],
    stepRows: readonly unknown[],
  ): TaskEndRunRecord[] {
    const stepsByRun = new Map<string, TaskEndStepRecord[]>();
    for (const raw of stepRows) {
      const parsed = stepRow.safeParse(raw);
      if (!parsed.success) {
        this.logMalformed('step', parsed.error);
        continue;
      }
      const record = this.toStepRecord(parsed.data);
      if (record === null) continue;
      const list = stepsByRun.get(parsed.data.run_id) ?? [];
      list.push(record);
      stepsByRun.set(parsed.data.run_id, list);
    }

    const records: TaskEndRunRecord[] = [];
    for (const run of runs) {
      const status = runStatusSchema.safeParse({
        state: run.state,
        reason: run.reason,
      });
      if (!status.success) {
        this.logMalformed('run', status.error);
        continue;
      }
      records.push({
        runId: run.run_id,
        repoId: run.repo_id,
        taskId: run.task_id,
        episode: run.episode,
        source: run.source,
        fromStatus: run.from_status,
        toStatus: run.to_status,
        seenRoot: run.seen_root,
        mainRoot: run.main_root,
        createdAt: run.created_at,
        settleUntil: run.settle_until,
        startedAt: run.started_at,
        endedAt: run.ended_at,
        updatedAt: run.updated_at,
        steps: stepsByRun.get(run.run_id) ?? [],
        ...status.data,
      });
    }
    return records;
  }

  /**
   * Rebuilds the closed outcome of one step row. A row left `running`
   * without a reason (a crash mid-step) reads as pending, so the worker
   * re-runs it (D16). Returns `null` for a malformed row (logged).
   */
  private toStepRecord(row: StepRow): TaskEndStepRecord | null {
    const base = {
      subject: row.subject,
      updatedAt: row.updated_at,
      attempts: row.attempts,
    };
    if (
      row.state === 'pending' ||
      (row.state === 'running' && row.reason === null)
    ) {
      return {
        step: row.step,
        outcome: PENDING,
        message: taskEndStepMessage(PENDING),
        ...base,
      };
    }
    const outcome = this.parseOutcome(row);
    if (outcome === null) return null;
    const message = taskEndStepMessage(outcome);
    switch (outcome.step) {
      case 'close-curate':
        return { step: outcome.step, outcome, message, ...base };
      case 'harvest':
        return { step: outcome.step, outcome, message, ...base };
      case 'dispose':
        return { step: outcome.step, outcome, message, ...base };
      case 'index':
        return { step: outcome.step, outcome, message, ...base };
    }
  }

  private parseOutcome(row: StepRow): TaskEndStepOutcome | null {
    let extra: unknown = {};
    if (row.extra_json !== null) {
      try {
        extra = JSON.parse(row.extra_json);
      } catch (error: unknown) {
        // A malformed row is logged and skipped by the reader (Component 3).
        this.logger.error(
          '[task-end-hook] malformed step row skipped',
          error instanceof Error ? error : new Error('extra_json is not JSON'),
        );
        return null;
      }
    }
    if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) {
      this.logMalformed('step', new Error('extra_json is not an object'));
      return null;
    }
    const parsed = stepOutcomeSchema.safeParse({
      ...extra,
      step: row.step,
      state: row.state,
      reason: row.reason,
    });
    if (!parsed.success) {
      this.logMalformed('step', parsed.error);
      return null;
    }
    return parsed.data;
  }

  private logMalformed(kind: 'run' | 'step', error: Error): void {
    this.logger.error(`[task-end-hook] malformed ${kind} row skipped`, error);
  }
}
