import { promises as fs } from 'fs';
import * as path from 'path';
import { inject, injectable } from 'tsyringe';
import type {
  TaskEndIndexOutcome,
  TaskEndRunRecord,
} from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { TaskEndHookSettingsReader } from '../config/task-end-hook-config';
import { TASK_END_TOKENS } from '../di/tokens';
import type { ITaskEndStore } from '../persistence/task-end-store.interface';
import type { ActivityPort } from '../ports/activity.port';
import type { CensusPort } from '../ports/census.port';
import type { CensusCoordinator } from './census-coordinator';

/**
 * Index request step (plan Component 6.4, decision order 0-6; AC 5.1-5.5).
 *
 * Brings the main root's symbol index up to date with at most one hook census
 * per main root, spaced by `censusCooldownMs` and started only when the app
 * is idle. Every outcome is recorded before `run` returns. A requested census
 * is handed to {@link CensusCoordinator.start} and is not awaited, so the run
 * releases the slot while it runs (AC 5.8).
 */

/** What one pass through the decision order produced. */
export interface IndexStepResult {
  readonly outcome: TaskEndIndexOutcome;
  /**
   * For `deferred` outcomes, the epoch ms at which the worker re-enters the
   * decision order (cooldown end, or the idle re-check); otherwise `null`.
   */
  readonly resumeAt: number | null;
}

const STEP = 'index' as const;

/**
 * Floor for the idle re-check after `deferred/foreground-active`. A
 * `bootScanIdleBackoffMs` of 0 still defers a turn in flight, and the worker
 * must not re-check it in a tight loop.
 */
export const FOREGROUND_RECHECK_MIN_MS = 60_000;

const CENSUS_FAILED: TaskEndIndexOutcome = {
  step: STEP,
  state: 'failed',
  reason: 'census-failed',
};

/**
 * Real path of `p` for comparison. Only a confirmed missing path (`ENOENT` or
 * `ENOTDIR`) falls back to its lexical resolution, so a missing root still
 * compares by its spelling. Any other `realpath` failure (permission, I/O)
 * returns `null`: the real path is not established and gate 0 fails closed.
 * Case is folded on win32 only.
 */
async function comparablePath(p: string): Promise<string | null> {
  let resolved: string;
  try {
    resolved = await fs.realpath(p);
  } catch (error: unknown) {
    // degradation-audit: reported - a non-missing failure returns `null`,
    // which fails gate 0 closed (the caller warns); never a real path.
    if (!isMissingPathError(error)) return null;
    resolved = path.resolve(p);
  }
  const slashed = resolved.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed;
}

function isMissingPathError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { readonly code: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@injectable()
export class IndexRequestStep {
  constructor(
    @inject(TASK_END_TOKENS.STORE) private readonly store: ITaskEndStore,
    @inject(TASK_END_TOKENS.CENSUS_PORT) private readonly census: CensusPort,
    @inject(TASK_END_TOKENS.ACTIVITY_PORT)
    private readonly activity: ActivityPort,
    @inject(TASK_END_TOKENS.CENSUS_COORDINATOR)
    private readonly coordinator: Pick<
      CensusCoordinator,
      'activeHookCensus' | 'start' | 'coalesceDeferredInto'
    >,
    @inject(TASK_END_TOKENS.SETTINGS_READER)
    private readonly settings: Pick<TaskEndHookSettingsReader, 'read'>,
    @inject(TOKENS.LOGGER)
    private readonly logger: Pick<Logger, 'debug' | 'warn'>,
  ) {}

  /**
   * Runs the decision order for the run's index step and records the
   * outcome. A terminal entry, or one already in `running/census-requested`,
   * is returned as it is without a second request. Store failures propagate
   * to the worker.
   */
  async run(run: TaskEndRunRecord): Promise<IndexStepResult> {
    const entry = run.steps.find((candidate) => candidate.step === STEP);
    if (
      entry !== undefined &&
      entry.step === STEP &&
      entry.outcome.state !== 'pending' &&
      entry.outcome.state !== 'deferred'
    ) {
      return { outcome: entry.outcome, resumeAt: null };
    }

    const decided = await this.decide(run);
    if (decided.outcome.state !== 'running') {
      this.store.upsertStep(run.runId, STEP, '', decided.outcome);
    }
    return decided;
  }

  private async decide(run: TaskEndRunRecord): Promise<IndexStepResult> {
    // 0. Main root gate (D6).
    const mainRoot = run.mainRoot;
    if (mainRoot === null) {
      return this.done({
        step: STEP,
        state: 'skipped',
        reason: 'main-root-unresolved',
      });
    }
    if (!(await this.isOpenWorkspace(run.runId, mainRoot))) {
      return this.done({
        step: STEP,
        state: 'skipped',
        reason: 'main-root-not-open',
      });
    }

    try {
      // 1. Symbols pipeline (Decision A11: the census requests symbols only).
      if (!(await this.census.symbolsEnabled(mainRoot))) {
        return this.done({
          step: STEP,
          state: 'skipped',
          reason: 'pipeline-disabled',
        });
      }

      // 2. A hook run already requested a census of this root.
      const owner = this.coordinator.activeHookCensus(mainRoot);
      if (owner !== null && owner.runId === run.runId) {
        // This run's own census is pending (a stale record was passed in):
        // keep waiting on it rather than requesting a second one.
        return this.done({
          step: STEP,
          state: 'running',
          reason: 'census-requested',
        });
      }
      if (owner !== null) {
        return this.done({
          step: STEP,
          state: 'succeeded',
          reason: 'coalesced',
          joined: { source: 'hook-run', runId: owner.runId },
        });
      }

      // 3. A census started outside the hook is running (finding 19).
      if (this.census.isCensusActive(mainRoot)) {
        return this.done({
          step: STEP,
          state: 'succeeded',
          reason: 'coalesced',
          joined: { source: 'external' },
        });
      }

      const settings = this.settings.read();
      const now = Date.now();

      // 4. Cooldown after the later of the engine's and the hook's completion.
      const lastCompletion = this.lastCompletion(
        await this.census.lastIndexedAt(mainRoot),
        this.store.lastHookCensusCompletedAt(mainRoot),
      );
      if (
        lastCompletion !== null &&
        now - lastCompletion < settings.censusCooldownMs
      ) {
        return {
          outcome: { step: STEP, state: 'deferred', reason: 'census-cooldown' },
          resumeAt: lastCompletion + settings.censusCooldownMs,
        };
      }

      // 5. Foreground activity; `unavailable` defers, never passes.
      const backoffMs = settings.memory.bootScanIdleBackoffMs;
      const foreground = this.activity.foregroundActive(backoffMs);
      if (foreground.kind === 'unavailable' || foreground.value) {
        if (foreground.kind === 'unavailable') {
          this.logger.debug(
            '[task-end-hook] index foreground probe unavailable',
            {
              runId: run.runId,
            },
          );
        }
        return {
          outcome: {
            step: STEP,
            state: 'deferred',
            reason: 'foreground-active',
          },
          resumeAt: now + Math.max(backoffMs, FOREGROUND_RECHECK_MIN_MS),
        };
      }
    } catch (error: unknown) {
      // A census probe threw: recorded as failed/census-failed; the text
      // stays in a debug line and never reaches the stored row.
      this.logger.debug('[task-end-hook] index probe failed', {
        runId: run.runId,
        error: errorText(error),
      });
      return { outcome: CENSUS_FAILED, resumeAt: null };
    }

    // 6. Persist the request, then start the census without awaiting it.
    return this.requestCensus(run.runId, mainRoot);
  }

  private requestCensus(runId: string, mainRoot: string): IndexStepResult {
    const requested: TaskEndIndexOutcome = {
      step: STEP,
      state: 'running',
      reason: 'census-requested',
    };
    this.store.markStepRunning(runId, STEP, '');
    this.store.upsertStep(runId, STEP, '', requested);
    const persisted = this.store.pendingCensus(mainRoot);
    const requestedAt =
      persisted !== null && persisted.runId === runId
        ? persisted.requestedAt
        : Date.now();

    if (!this.coordinator.start(runId, mainRoot, requestedAt)) {
      // The coordinator is shut down: nothing will report this census, so
      // `run` records it interrupted now instead of leaving it to a restart.
      // The other waiting steps stay deferred: no census exists to join.
      return {
        outcome: { step: STEP, state: 'failed', reason: 'census-interrupted' },
        resumeAt: null,
      };
    }

    // Cooldown end (AC 5.3, D22): only once the census has actually started
    // do the other waiting steps of this root join it.
    this.coordinator.coalesceDeferredInto(mainRoot, runId);
    return { outcome: requested, resumeAt: null };
  }

  /**
   * Gate 0: whether `mainRoot` is a registered workspace root, by real path.
   * An `unavailable` probe cannot prove it is open, so no census starts.
   */
  private async isOpenWorkspace(
    runId: string,
    mainRoot: string,
  ): Promise<boolean> {
    const roots = this.activity.registeredWorkspaceRoots();
    if (roots.kind === 'unavailable') {
      this.logger.warn('[task-end-hook] index workspace roots unavailable', {
        runId,
      });
      return false;
    }
    const target = await comparablePath(mainRoot);
    if (target === null) {
      this.logger.warn('[task-end-hook] index main root path unverifiable', {
        runId,
      });
      return false;
    }
    for (const root of roots.value) {
      if ((await comparablePath(root)) === target) return true;
    }
    return false;
  }

  private lastCompletion(
    engine: number | null,
    hook: number | null,
  ): number | null {
    if (engine === null) return hook;
    if (hook === null) return engine;
    return Math.max(engine, hook);
  }

  private done(outcome: TaskEndIndexOutcome): IndexStepResult {
    return { outcome, resumeAt: null };
  }
}
