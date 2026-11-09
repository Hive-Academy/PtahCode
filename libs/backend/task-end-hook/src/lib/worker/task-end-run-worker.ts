import { inject, injectable } from 'tsyringe';
import type { IDisposable } from '@ptah-extension/platform-core';
import {
  isTerminalStep,
  type TaskEndRunRecord,
  type TaskEndRunStatus,
  type TaskEndStepKind,
  type TaskEndStepOutcome,
  type TaskEndStepRecord,
} from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { TaskEndHookSettingsReader } from '../config/task-end-hook-config';
import { TASK_END_TOKENS } from '../di/tokens';
import type { ITaskEndStore } from '../persistence/task-end-store.interface';
import type { CensusCoordinator } from '../steps/census-coordinator';
import {
  isRetryableCloseCurateOutcome,
  retryableCloseCurateSessions,
  type CloseCurateGates,
  type CloseCurateStep,
} from '../steps/close-curate.step';
import {
  modeFields,
  type DisposeEvaluateStep,
} from '../steps/dispose-evaluate.step';
import type { HarvestStep } from '../steps/harvest.step';
import type { IndexRequestStep } from '../steps/index-request.step';
import { CarrierReader } from './carrier-reader';

/**
 * Task-end run worker (plan Component 5): runs hook runs one at a time, in
 * durable FIFO order (`queue_seq`), within the caps.
 *
 * - One `unref`'d timer for the whole worker, set to the earliest of the next
 *   `settle_until`, the next deferred index resume time, the store-failure
 *   back-off and a {@link wake} request. No timer per run.
 * - Steps run in the order close-curate, harvest, dispose, index. The carrier
 *   is re-read from disk before each step that has work; a non-terminal
 *   status cancels the run (`cancelled/status-reverted`, AC 1.2) and no
 *   further step starts. An unreadable carrier lets the run continue.
 * - A run whose only unfinished steps are index steps waiting on a census
 *   (`running/census-requested`, `deferred/*`) releases the slot (AC 5.8): the
 *   worker moves on to the next run and comes back when the census settles or
 *   the resume time passes.
 * - Retryable deferred close-curate entries get one retry once the index step
 *   has been dispatched (R11); the step maps a second deferral to `failed`.
 *
 * Report-only: the worker writes nothing but run and step rows through
 * `ITaskEndStore`. A thrown step runner is recorded with the step's fallback
 * reason, its error text kept to a debug line (AC 6.3). A store failure stops
 * the tick, logs an error and retries after {@link STORE_FAILURE_BACKOFF_MS};
 * the state stays the last committed row.
 */

/** Back-off after a store failure while recording (plan Component 5). */
export const STORE_FAILURE_BACKOFF_MS = 60_000;

/** Largest delay `setTimeout` honours; a later due time re-arms on firing. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const STEP_ORDER: readonly TaskEndStepKind[] = [
  'close-curate',
  'harvest',
  'dispose',
  'index',
];

const RUNNING: TaskEndRunStatus = { state: 'running', reason: null };
const QUEUED: TaskEndRunStatus = { state: 'queued', reason: null };
const STATUS_REVERTED: TaskEndRunStatus = {
  state: 'cancelled',
  reason: 'status-reverted',
};
const STEPS_TERMINAL: TaskEndRunStatus = {
  state: 'completed',
  reason: 'steps-terminal',
};

type EntrySelector = (entry: TaskEndStepRecord) => boolean;

const isPending: EntrySelector = (entry) => entry.outcome.state === 'pending';
const isPendingOrDeferred: EntrySelector = (entry) =>
  entry.outcome.state === 'pending' || entry.outcome.state === 'deferred';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function entriesOf(
  run: TaskEndRunRecord,
  kind: TaskEndStepKind,
): readonly TaskEndStepRecord[] {
  return run.steps.filter((entry) => entry.step === kind);
}

/** The index step recorded a decision (any outcome, deferral included). */
function indexDispatched(run: TaskEndRunRecord): boolean {
  const entries = entriesOf(run, 'index');
  return (
    entries.length > 0 &&
    entries.every((entry) => entry.outcome.state !== 'pending')
  );
}

@injectable()
export class TaskEndRunWorker {
  private readonly carriers = new CarrierReader();
  private readonly abort = new AbortController();
  /** Resume time per run whose index step is deferred (rebuilt as "due"). */
  private readonly resumeAt = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerAt = Number.POSITIVE_INFINITY;
  private active: Promise<void> | null = null;
  private rerun = false;
  private backoffUntil = 0;
  private reconciled = false;
  private started = false;
  private disposed = false;
  private censusSubscription: IDisposable | null = null;

  constructor(
    @inject(TASK_END_TOKENS.STORE) private readonly store: ITaskEndStore,
    @inject(TASK_END_TOKENS.CLOSE_CURATE_STEP)
    private readonly closeCurate: Pick<CloseCurateStep, 'run' | 'retry'>,
    @inject(TASK_END_TOKENS.HARVEST_STEP)
    private readonly harvest: Pick<HarvestStep, 'run'>,
    @inject(TASK_END_TOKENS.DISPOSE_EVALUATE_STEP)
    private readonly disposeEvaluate: Pick<DisposeEvaluateStep, 'run'>,
    @inject(TASK_END_TOKENS.INDEX_REQUEST_STEP)
    private readonly indexRequest: Pick<IndexRequestStep, 'run'>,
    @inject(TASK_END_TOKENS.CENSUS_COORDINATOR)
    private readonly coordinator: Pick<
      CensusCoordinator,
      'reconcileAfterRestart' | 'onDidSettleCensus' | 'dispose' | 'settled'
    >,
    @inject(TASK_END_TOKENS.SETTINGS_READER)
    private readonly settings: Pick<TaskEndHookSettingsReader, 'read'>,
    @inject(TOKENS.LOGGER)
    private readonly logger: Pick<Logger, 'debug' | 'info' | 'error'>,
  ) {}

  /**
   * Starts the worker: subscribes to census settlements and schedules the
   * first tick, which reconciles interrupted censuses (AC 5.7) before any
   * run is claimed and resumes `running` runs at their first unfinished step
   * (AC 6.2). Calling it again does nothing.
   */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.censusSubscription = this.coordinator.onDidSettleCensus(() =>
      this.wake(),
    );
    this.schedule(Date.now());
  }

  /** Asks for a tick now (a new run was journaled, a census settled). */
  wake(): void {
    if (!this.started || this.disposed) return;
    this.schedule(Date.now());
  }

  /**
   * Aborts the in-flight step's signal, clears the timer, unsubscribes and
   * aborts every hook census. Unfinished entries stay as committed and are
   * resumed by the next {@link start}.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.clearTimer();
    this.censusSubscription?.dispose();
    this.censusSubscription = null;
    this.coordinator.dispose();
  }

  /**
   * Resolves when the current tick (and so the current step) has settled and
   * every hook census this process started has recorded its result. Never
   * rejects; the shutdown path races it against its budget.
   */
  async awaitStopped(): Promise<void> {
    await this.active;
    await this.coordinator.settled();
  }

  // --- Scheduling ----------------------------------------------------------

  private schedule(at: number): void {
    if (this.disposed) return;
    const due = Math.max(at, this.backoffUntil);
    if (this.timer !== null && this.timerAt <= due) return;
    this.clearTimer();
    this.timerAt = due;
    const delay = Math.min(Math.max(0, due - Date.now()), MAX_TIMER_DELAY_MS);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerAt = Number.POSITIVE_INFINITY;
      this.beginTick();
    }, delay);
    this.timer.unref();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.timerAt = Number.POSITIVE_INFINITY;
  }

  /** One tick at a time; a request during a tick runs one more after it. */
  private beginTick(): void {
    if (this.disposed) return;
    if (this.active !== null) {
      this.rerun = true;
      return;
    }
    this.rerun = false;
    this.active = this.tick().finally(() => {
      this.active = null;
      if (this.rerun) this.schedule(Date.now());
    });
  }

  private async tick(): Promise<void> {
    try {
      if (!this.reconciled) {
        this.coordinator.reconcileAfterRestart();
        this.reconciled = true;
      }
      await this.promoteSettled();
      await this.advanceRunning();
      await this.claimQueued();
      this.scheduleNext();
    } catch (error: unknown) {
      // A store failure while recording: the state is the last committed
      // row, so nothing is lost; the next tick retries after the back-off.
      this.logger.error(
        '[task-end-hook] worker tick failed; retrying after back-off',
        asError(error),
      );
      this.backoffUntil = Date.now() + STORE_FAILURE_BACKOFF_MS;
      this.schedule(this.backoffUntil);
    }
  }

  /** Arms the timer for the next settle end or deferred index resume. */
  private scheduleNext(): void {
    let next = Number.POSITIVE_INFINITY;
    const open = new Set<string>();
    for (const run of this.store.listOpenRuns()) {
      open.add(run.runId);
      if (run.state === 'settling') next = Math.min(next, run.settleUntil);
    }
    for (const [runId, at] of this.resumeAt) {
      if (open.has(runId)) next = Math.min(next, at);
      else this.resumeAt.delete(runId);
    }
    if (Number.isFinite(next)) this.schedule(next);
  }

  // --- Run states ----------------------------------------------------------

  /**
   * Settle end: a `settling` run whose window passed becomes `queued`, or
   * `cancelled/status-reverted` when its carrier is no longer terminal.
   */
  private async promoteSettled(): Promise<void> {
    const now = Date.now();
    for (const run of this.store.listOpenRuns()) {
      if (this.disposed) return;
      if (run.state !== 'settling' || run.settleUntil > now) continue;
      const carrier = await this.carriers.read(run.seenRoot, run.taskId);
      // Re-read after the await: the detector may have cancelled the run.
      const current = this.store.getRun(run.runId);
      if (current === null || current.state !== 'settling') continue;
      const status = carrier.kind === 'non-terminal' ? STATUS_REVERTED : QUEUED;
      this.setRunState(current, status);
    }
  }

  /** Runs that already hold `running` (resumed, or waiting on a census). */
  private async advanceRunning(): Promise<void> {
    for (const run of this.store.listOpenRuns()) {
      if (this.disposed) return;
      if (run.state === 'running') await this.advance(run.runId);
    }
  }

  /** Claims queued runs in FIFO order while the slot is free. */
  private async claimQueued(): Promise<void> {
    while (!this.disposed) {
      const next = this.store.claimNext();
      if (next === null) return;
      this.setRunState(next, RUNNING);
      await this.advance(next.runId);
    }
  }

  private setRunState(run: TaskEndRunRecord, status: TaskEndRunStatus): void {
    this.store.setRunState(run.runId, status);
    if (status.state !== 'running') this.resumeAt.delete(run.runId);
    this.logger.info('[task-end-hook] run', {
      runId: run.runId,
      taskId: run.taskId,
      state: status.state,
      reason: status.reason,
    });
  }

  /** The run while it is still `running`, else `null` (cancelled meanwhile). */
  private runningRun(runId: string): TaskEndRunRecord | null {
    const run = this.store.getRun(runId);
    return run !== null && run.state === 'running' ? run : null;
  }

  // --- Steps ---------------------------------------------------------------

  /**
   * Runs every step of the run that has work now, in order, then the
   * close-curate retries, then completes the run when every entry is
   * terminal. Returns when the run is done, cancelled, or waiting.
   */
  private async advance(runId: string): Promise<void> {
    for (const kind of STEP_ORDER) {
      const run = this.runningRun(runId);
      if (run === null || this.disposed) return;
      if (!this.hasWork(run, kind)) continue;
      if (!(await this.carrierStillTerminal(runId))) return;
      if (kind === 'harvest') {
        // Task status observations carry no confirmed PR merge or explicit
        // harvest request. The close-out service owns those harvests.
        this.store.markStepRunning(runId, 'harvest', '');
        this.recordOutcome(run, '', {
          step: 'harvest',
          state: 'skipped',
          reason: 'manual-only',
        });
        continue;
      }
      await this.runStep(runId, kind);
    }

    const run = this.runningRun(runId);
    if (run === null || this.disposed) return;
    if (indexDispatched(run) && retryableCloseCurateSessions(run).length > 0) {
      if (!(await this.carrierStillTerminal(runId))) return;
      await this.runRetries(runId);
      if (this.disposed) return;
    }
    this.completeIfTerminal(runId);
  }

  private hasWork(run: TaskEndRunRecord, kind: TaskEndStepKind): boolean {
    const entries = entriesOf(run, kind);
    if (kind !== 'index') return entries.some(isPending);
    const due = (this.resumeAt.get(run.runId) ?? 0) <= Date.now();
    return entries.some(
      (entry) =>
        entry.outcome.state === 'pending' ||
        (entry.outcome.state === 'deferred' && due),
    );
  }

  /**
   * Re-reads the carrier (AC 1.2). A non-terminal status cancels the run;
   * terminal and unreadable carriers let it continue. Returns whether the
   * run is still `running`.
   */
  private async carrierStillTerminal(runId: string): Promise<boolean> {
    const before = this.runningRun(runId);
    if (before === null) return false;
    const carrier = await this.carriers.read(before.seenRoot, before.taskId);
    const current = this.runningRun(runId);
    if (current === null) return false;
    if (carrier.kind !== 'non-terminal') return true;
    this.setRunState(current, STATUS_REVERTED);
    return false;
  }

  private async runStep(runId: string, kind: TaskEndStepKind): Promise<void> {
    const run = this.runningRun(runId);
    if (run === null) return;
    const signal = this.abort.signal;
    try {
      switch (kind) {
        case 'close-curate':
          for (const recorded of await this.closeCurate.run(
            run,
            this.curateGates(),
            signal,
          )) {
            this.logStep(run, recorded.subject, recorded.outcome);
          }
          break;
        case 'harvest':
          await this.runHarvest(run);
          break;
        case 'dispose':
          for (const recorded of await this.disposeEvaluate.run(run, signal)) {
            this.logStep(run, recorded.subject, recorded.outcome);
          }
          break;
        case 'index':
          await this.runIndex(run);
          break;
      }
    } catch (error: unknown) {
      // AC 6.3: the step is recorded with its fallback reason and the other
      // steps continue. A store failure here rethrows from recordFallback.
      this.recoverFromThrow(
        run,
        kind,
        error,
        kind === 'index' ? isPendingOrDeferred : isPending,
      );
    }
  }

  /**
   * `not-completed` (the engine saw a non-completed carrier) is never
   * recorded as such: the carrier is re-read, giving `status-reverted` when
   * it is no longer terminal and `failed/harvest-failed` otherwise.
   */
  private async runHarvest(run: TaskEndRunRecord): Promise<void> {
    const result = await this.harvest.run(run);
    if (result.kind === 'recorded') {
      this.logStep(run, '', result.outcome);
      return;
    }
    if (!(await this.carrierStillTerminal(run.runId))) return;
    this.recordOutcome(run, '', this.fallbackOutcome('harvest'));
  }

  private async runIndex(run: TaskEndRunRecord): Promise<void> {
    const result = await this.indexRequest.run(run);
    if (result.outcome.state === 'deferred') {
      this.resumeAt.set(
        run.runId,
        result.resumeAt ?? Date.now() + STORE_FAILURE_BACKOFF_MS,
      );
    } else {
      this.resumeAt.delete(run.runId);
    }
    this.logStep(run, '', result.outcome);
  }

  /** The single retry (attempt 2) of each retryable deferred entry. */
  private async runRetries(runId: string): Promise<void> {
    const start = this.runningRun(runId);
    if (start === null) return;
    for (const sessionId of retryableCloseCurateSessions(start)) {
      const run = this.runningRun(runId);
      if (run === null || this.disposed) return;
      try {
        const recorded = await this.closeCurate.retry(
          run,
          sessionId,
          this.abort.signal,
        );
        if (recorded !== null) {
          this.logStep(run, recorded.subject, recorded.outcome);
        }
      } catch (error: unknown) {
        // The retry threw: this entry alone records failed/curator-failed.
        this.recoverFromThrow(
          run,
          'close-curate',
          error,
          (entry) =>
            entry.step === 'close-curate' &&
            entry.subject === sessionId &&
            isRetryableCloseCurateOutcome(entry.outcome),
        );
      }
    }
  }

  private completeIfTerminal(runId: string): void {
    const run = this.runningRun(runId);
    if (run === null) return;
    if (run.steps.every((entry) => isTerminalStep(entry.outcome))) {
      this.setRunState(run, STEPS_TERMINAL);
    }
  }

  private curateGates(): CloseCurateGates {
    const { memory } = this.settings.read();
    return {
      memoryEnabled: memory.enabled,
      sessionEndEnabled: memory.sessionEndEnabled,
    };
  }

  // --- Failure recording ---------------------------------------------------

  /**
   * A step runner threw. During shutdown the entries stay as committed for
   * the resume. Otherwise the error text goes to a debug line only and each
   * selected entry records the step's fallback outcome; a store failure while
   * recording propagates to the tick (back-off).
   */
  private recoverFromThrow(
    run: TaskEndRunRecord,
    kind: TaskEndStepKind,
    error: unknown,
    select: EntrySelector,
  ): void {
    if (this.abort.signal.aborted) return;
    this.logger.debug('[task-end-hook] step runner threw', {
      runId: run.runId,
      step: kind,
      error: errorText(error),
    });
    const current = this.store.getRun(run.runId);
    if (current === null) return;
    const outcome = this.fallbackOutcome(kind);
    for (const entry of entriesOf(current, kind)) {
      if (select(entry)) this.recordOutcome(current, entry.subject, outcome);
    }
    if (kind === 'index') this.resumeAt.delete(run.runId);
  }

  /** The fallback outcome of a step whose runner failed (AC 6.3). */
  private fallbackOutcome(kind: TaskEndStepKind): TaskEndStepOutcome {
    switch (kind) {
      case 'close-curate':
        return { step: kind, state: 'failed', reason: 'curator-failed' };
      case 'harvest':
        return { step: kind, state: 'failed', reason: 'harvest-failed' };
      case 'dispose':
        return {
          step: kind,
          state: 'blocked',
          reason: 'precondition-unverifiable',
          ...modeFields(this.settings.read().disposalMode),
        };
      case 'index':
        return { step: kind, state: 'failed', reason: 'census-failed' };
    }
  }

  private recordOutcome(
    run: TaskEndRunRecord,
    subject: string,
    outcome: TaskEndStepOutcome,
  ): void {
    this.store.upsertStep(run.runId, outcome.step, subject, outcome);
    this.logStep(run, subject, outcome);
  }

  /** One info line per step outcome (AC 6.4); codes only, never error text. */
  private logStep(
    run: TaskEndRunRecord,
    subject: string,
    outcome: TaskEndStepOutcome,
  ): void {
    this.logger.info('[task-end-hook] step', {
      runId: run.runId,
      taskId: run.taskId,
      step: outcome.step,
      subject,
      state: outcome.state,
      reason: outcome.reason,
    });
  }
}
