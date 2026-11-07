import { inject, injectable } from 'tsyringe';
import type {
  TaskEndHarvestOutcome,
  TaskEndRunRecord,
} from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { TASK_END_TOKENS } from '../di/tokens';
import type { ITaskEndStore } from '../persistence/task-end-store.interface';
import type {
  HarvestPort,
  TaskEndHarvestPortResult,
} from '../ports/harvest.port';

/**
 * Harvest step (plan Component 6.2): harvests this task's spec folder only,
 * from the root the carrier was seen in.
 *
 * The outcome is recorded before the call returns, so dispose (P11) reads it.
 * `not-completed` is never recorded: it is returned to the worker, which
 * re-reads the carrier and records `status-reverted` when it is no longer
 * terminal, `harvest-failed` otherwise.
 */

/** What one harvest call produced. */
export type HarvestStepResult =
  | { readonly kind: 'recorded'; readonly outcome: TaskEndHarvestOutcome }
  /** Nothing recorded; the harvest entry stays `running` for the worker. */
  | { readonly kind: 'not-completed' };

const STEP = 'harvest' as const;

const HARVEST_FAILED: TaskEndHarvestOutcome = {
  step: STEP,
  state: 'failed',
  reason: 'harvest-failed',
};

/** Port outcomes that are recorded, keyed by port outcome. */
const RECORDED_OUTCOMES = {
  harvested: { step: STEP, state: 'succeeded', reason: 'harvested' },
  'already-harvested': {
    step: STEP,
    state: 'succeeded',
    reason: 'already-harvested',
  },
  'no-carrier': { step: STEP, state: 'skipped', reason: 'no-carrier' },
  'harvest-failed': HARVEST_FAILED,
} as const satisfies Readonly<
  Record<
    Exclude<TaskEndHarvestPortResult['outcome'], 'not-completed'>,
    TaskEndHarvestOutcome
  >
>;

/** Maps a port result to the step result; total over the port outcomes. */
export function mapHarvestResult(
  result: TaskEndHarvestPortResult,
): HarvestStepResult {
  const outcome = result.outcome;
  switch (outcome) {
    case 'not-completed':
      return { kind: 'not-completed' };
    case 'harvested':
    case 'already-harvested':
    case 'no-carrier':
    case 'harvest-failed':
      return { kind: 'recorded', outcome: RECORDED_OUTCOMES[outcome] };
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}

@injectable()
export class HarvestStep {
  constructor(
    @inject(TASK_END_TOKENS.STORE) private readonly store: ITaskEndStore,
    @inject(TASK_END_TOKENS.HARVEST_PORT)
    private readonly harvest: HarvestPort,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'debug'>,
  ) {}

  /**
   * Harvests the run's task from its seen root. A harvest entry that already
   * holds a terminal outcome is returned as it is, without a second call.
   * Store failures propagate to the worker.
   */
  async run(run: TaskEndRunRecord): Promise<HarvestStepResult> {
    const entry = run.steps.find((candidate) => candidate.step === STEP);
    if (
      entry !== undefined &&
      entry.step === STEP &&
      entry.outcome.state !== 'pending'
    ) {
      return { kind: 'recorded', outcome: entry.outcome };
    }

    this.store.markStepRunning(run.runId, STEP, '');
    let mapped: HarvestStepResult;
    try {
      mapped = mapHarvestResult(
        await this.harvest.harvestTask(run.seenRoot, run.taskId),
      );
    } catch (error: unknown) {
      // The engine threw: recorded as failed/harvest-failed; the error text
      // stays in a debug line and never reaches the stored row.
      this.logger.debug('[task-end-hook] harvest port failed', {
        runId: run.runId,
        error: error instanceof Error ? error.message : String(error),
      });
      mapped = { kind: 'recorded', outcome: HARVEST_FAILED };
    }

    if (mapped.kind === 'recorded') {
      this.store.upsertStep(run.runId, STEP, '', mapped.outcome);
    }
    return mapped;
  }
}
