import { inject, injectable } from 'tsyringe';
import { createEvent, type IEvent } from '@ptah-extension/platform-core';
import type { TaskEndIndexOutcome } from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { TASK_END_TOKENS } from '../di/tokens';
import type {
  ITaskEndStore,
  TaskEndPendingCensus,
} from '../persistence/task-end-store.interface';
import type { CensusPort } from '../ports/census.port';

/**
 * Census coordinator (plan Component 6.4: completion, cooldown end, restart).
 *
 * Owns the one hook census per main root. `IndexRequestStep` persists
 * `running/census-requested` and hands the census to {@link start}, which does
 * not block the caller: the run's slot is released while the census runs
 * (AC 5.8). When the census resolves, the requesting step alone records the
 * result (AC 5.6); coalesced steps are never updated (AC 5.2).
 *
 * In-memory state is the in-flight census per main root and its
 * `AbortController`; both are rebuilt from SQLite at start by
 * {@link reconcileAfterRestart}, which runs before any census is requested.
 */

/** A hook census that ended and the outcome its requesting step recorded. */
export interface TaskEndCensusSettled {
  readonly runId: string;
  readonly mainRoot: string;
  /** `null` when the requesting step no longer held `running/census-requested`. */
  readonly outcome: TaskEndCensusResultOutcome | null;
}

/** The three results a requesting step can record (AC 5.6, pre-878). */
export type TaskEndCensusResultOutcome = Extract<
  TaskEndIndexOutcome,
  {
    readonly reason:
      'census-completed' | 'census-failed' | 'census-interrupted';
  }
>;

const STEP = 'index' as const;

const CENSUS_COMPLETED: TaskEndCensusResultOutcome = {
  step: STEP,
  state: 'succeeded',
  reason: 'census-completed',
};
const CENSUS_FAILED: TaskEndCensusResultOutcome = {
  step: STEP,
  state: 'failed',
  reason: 'census-failed',
};
const CENSUS_INTERRUPTED: TaskEndCensusResultOutcome = {
  step: STEP,
  state: 'failed',
  reason: 'census-interrupted',
};

/**
 * Classifies a census that resolved (plan 6.4 "Completion", pre-878): an
 * engine error gives `census-failed`; an index completed at or after the
 * request gives `census-completed`; anything else (for example `start()`
 * ignored because a user run was active) gives `census-interrupted`.
 */
export function classifyCensusCompletion(
  lastError: string | null,
  lastIndexedAt: number | null,
  requestedAt: number,
): TaskEndCensusResultOutcome {
  if (lastError !== null) return CENSUS_FAILED;
  if (lastIndexedAt !== null && lastIndexedAt >= requestedAt) {
    return CENSUS_COMPLETED;
  }
  return CENSUS_INTERRUPTED;
}

interface InFlightCensus {
  readonly runId: string;
  readonly requestedAt: number;
  readonly controller: AbortController;
  readonly done: Promise<void>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

@injectable()
export class CensusCoordinator {
  private readonly inFlight = new Map<string, InFlightCensus>();
  private readonly fireSettled: (event: TaskEndCensusSettled) => void;
  private disposed = false;

  /** Fires once per hook census that ended, after its outcome is recorded. */
  readonly onDidSettleCensus: IEvent<TaskEndCensusSettled>;

  constructor(
    @inject(TASK_END_TOKENS.STORE) private readonly store: ITaskEndStore,
    @inject(TASK_END_TOKENS.CENSUS_PORT) private readonly census: CensusPort,
    @inject(TOKENS.LOGGER)
    private readonly logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
  ) {
    const [event, fire] = createEvent<TaskEndCensusSettled>();
    this.onDidSettleCensus = event;
    this.fireSettled = fire;
  }

  /**
   * The hook census that owns `mainRoot` now: the durable
   * `running/census-requested` step, else the census this process is running.
   * Index decision step 2 coalesces onto it.
   */
  activeHookCensus(mainRoot: string): TaskEndPendingCensus | null {
    const pending = this.store.pendingCensus(mainRoot);
    if (pending !== null) return pending;
    const local = this.inFlight.get(mainRoot);
    return local === undefined
      ? null
      : { runId: local.runId, requestedAt: local.requestedAt };
  }

  /**
   * Starts the census the step `runId` already persisted as
   * `running/census-requested`, and returns without waiting for it. A second
   * call for a root whose census is still in flight starts nothing (one
   * census per main root, AC 5.2) and returns `false`.
   */
  start(runId: string, mainRoot: string, requestedAt: number): boolean {
    if (this.disposed || this.inFlight.has(mainRoot)) return false;
    const controller = new AbortController();
    const entry: InFlightCensus = {
      runId,
      requestedAt,
      controller,
      done: this.runCensus(runId, mainRoot, requestedAt, controller.signal),
    };
    this.inFlight.set(mainRoot, entry);
    return true;
  }

  /**
   * Cooldown end (AC 5.3): once the step of `ownerRunId` has requested the
   * census for `mainRoot`, every other `deferred/census-cooldown` or
   * `deferred/foreground-active` index step of that root becomes
   * `succeeded/coalesced` joined to the owner. Returns the coalesced run ids.
   */
  coalesceDeferredInto(
    mainRoot: string,
    ownerRunId: string,
  ): readonly string[] {
    const coalesced: string[] = [];
    for (const deferred of this.store.listDeferredCensusSteps(mainRoot)) {
      if (deferred.runId === ownerRunId) continue;
      this.store.upsertStep(deferred.runId, STEP, '', {
        step: STEP,
        state: 'succeeded',
        reason: 'coalesced',
        joined: { source: 'hook-run', runId: ownerRunId },
      });
      coalesced.push(deferred.runId);
    }
    return coalesced;
  }

  /**
   * Restart (AC 5.7, pre-878): every index step still in
   * `running/census-requested` belongs to a census of a process that is gone,
   * so it becomes `failed/census-interrupted`. Coalesced steps are terminal
   * and are not touched (AC 5.2). Returns the reconciled run ids.
   */
  reconcileAfterRestart(): readonly string[] {
    const reconciled: string[] = [];
    for (const run of this.store.listOpenRuns()) {
      // A census this process started is still live, not lost.
      if (
        run.mainRoot !== null &&
        this.inFlight.get(run.mainRoot)?.runId === run.runId
      ) {
        continue;
      }
      const requesting = run.steps.some(
        (entry) =>
          entry.step === STEP &&
          entry.outcome.state === 'running' &&
          entry.outcome.reason === 'census-requested',
      );
      if (!requesting) continue;
      this.store.upsertStep(run.runId, STEP, '', CENSUS_INTERRUPTED);
      reconciled.push(run.runId);
      this.logger.info('[task-end-hook] step', {
        runId: run.runId,
        taskId: run.taskId,
        step: STEP,
        subject: '',
        state: CENSUS_INTERRUPTED.state,
        reason: CENSUS_INTERRUPTED.reason,
      });
    }
    return reconciled;
  }

  /** Resolves when every census this process started has recorded its result. */
  async settled(): Promise<void> {
    await Promise.all([...this.inFlight.values()].map((entry) => entry.done));
  }

  /**
   * Aborts every in-flight census; each records `census-interrupted` when its
   * request settles. No census starts afterwards.
   */
  dispose(): void {
    this.disposed = true;
    for (const entry of this.inFlight.values()) entry.controller.abort();
  }

  private async runCensus(
    runId: string,
    mainRoot: string,
    requestedAt: number,
    signal: AbortSignal,
  ): Promise<void> {
    let outcome: TaskEndCensusResultOutcome;
    try {
      await this.census.requestCensus(mainRoot, signal);
      outcome = signal.aborted
        ? CENSUS_INTERRUPTED
        : classifyCensusCompletion(
            await this.census.lastError(mainRoot),
            await this.census.lastIndexedAt(mainRoot),
            requestedAt,
          );
    } catch (error: unknown) {
      // The engine threw or the request was aborted at shutdown. The text
      // stays in a debug line; the stored row holds only the reason code.
      this.logger.debug('[task-end-hook] census request failed', {
        runId,
        error: errorText(error),
      });
      outcome = signal.aborted ? CENSUS_INTERRUPTED : CENSUS_FAILED;
    }

    let recorded: TaskEndCensusResultOutcome | null = null;
    try {
      recorded = this.recordIfStillRequesting(runId, outcome);
    } catch (error: unknown) {
      // Store failure: the step keeps `running/census-requested`, which the
      // next restart reconciles to `census-interrupted` (AC 5.7).
      this.logger.error(
        '[task-end-hook] census result not recorded',
        asError(error),
      );
    } finally {
      if (this.inFlight.get(mainRoot)?.runId === runId) {
        this.inFlight.delete(mainRoot);
      }
    }
    this.fireSettled({ runId, mainRoot, outcome: recorded });
  }

  /**
   * Records `outcome` only when the step still holds
   * `running/census-requested`; a run cancelled meanwhile keeps its row.
   */
  private recordIfStillRequesting(
    runId: string,
    outcome: TaskEndCensusResultOutcome,
  ): TaskEndCensusResultOutcome | null {
    const run = this.store.getRun(runId);
    const entry = run?.steps.find((candidate) => candidate.step === STEP);
    if (
      run === null ||
      entry === undefined ||
      entry.outcome.state !== 'running' ||
      entry.outcome.reason !== 'census-requested'
    ) {
      this.logger.debug('[task-end-hook] census result dropped', { runId });
      return null;
    }
    this.store.upsertStep(runId, STEP, '', outcome);
    this.logger.info('[task-end-hook] step', {
      runId,
      taskId: run.taskId,
      step: STEP,
      subject: '',
      state: outcome.state,
      reason: outcome.reason,
    });
    return outcome;
  }
}
