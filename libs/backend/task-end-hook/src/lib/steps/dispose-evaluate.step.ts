import { inject, injectable } from 'tsyringe';
import type {
  TaskEndDisposeBlockReason,
  TaskEndDisposeModeFields,
  TaskEndDisposeModeReason,
  TaskEndDisposeOutcome,
  TaskEndDisposeRequestedMode,
  TaskEndRunRecord,
} from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { TaskEndHookSettingsReader } from '../config/task-end-hook-config';
import { TASK_END_TOKENS } from '../di/tokens';
import { decideDisposal } from '../dispose/decide-disposal';
import {
  DISPOSAL_PROBE_ERRORS,
  DisposalInputCollector,
  type DisposalCollectorSettings,
  type DisposalRunSurvey,
  type DisposalSurveyRun,
} from '../dispose/disposal-input.collector';
import type { ITaskEndStore } from '../persistence/task-end-store.interface';
import type { ActivityPort } from '../ports/activity.port';
import type { GitReadRunner } from '../ports/git-read-runner.port';
import type { PrStatusPort } from '../ports/pr-status.port';
import { ReadOnlyGit } from '../ports/read-only-git';
import type { SessionLinkPort } from '../ports/session-link.port';

/**
 * Dispose-evaluate step (plan Component 6.3). Report-only: it evaluates P2 to
 * P11 for every candidate worktree of the task and records one outcome per
 * worktree. It deletes, moves, archives and writes nothing on disk (C1); the
 * only writes are the step rows through `ITaskEndStore`.
 *
 * The run's `dispose/''` placeholder is replaced by one entry per discovered
 * candidate (`expandStep`). Zero candidates keep the placeholder, which
 * records `blocked/no-linked-worktree` (or `precondition-unverifiable` when a
 * link source could not be read). A run without a main root runs no probe at
 * all: the placeholder records `blocked/precondition-unverifiable`
 * (`probeErrors: ['main-root-unresolved']`, Decision A16).
 */

/** One step entry the step recorded during a call. */
export interface DisposeEvaluateRecorded {
  /** `''` for the placeholder entry, otherwise the worktree path. */
  readonly subject: string;
  readonly outcome: TaskEndDisposeOutcome;
}

const STEP = 'dispose' as const;

/** P1: `auto` and `confirm` are not reachable in this build (C1). */
const MODE_REASONS = {
  off: 'none',
  auto: 'auto-unavailable',
  confirm: 'confirm-unavailable',
} as const satisfies Readonly<
  Record<TaskEndDisposeRequestedMode, TaskEndDisposeModeReason>
>;

/**
 * P1 mode fields for a dispose outcome: the effective mode is always `off`
 * (C1). Also used by the run worker for its dispose fallback (D36).
 */
export function modeFields(
  requestedMode: TaskEndDisposeRequestedMode,
): TaskEndDisposeModeFields {
  return {
    requestedMode,
    effectiveMode: 'off',
    modeReason: MODE_REASONS[requestedMode],
    activityScope: 'in-process',
  };
}

function blocked(
  reason: TaskEndDisposeBlockReason,
  mode: TaskEndDisposeModeFields,
): TaskEndDisposeOutcome {
  return { step: STEP, state: 'blocked', reason, ...mode };
}

function hasMainRoot(run: TaskEndRunRecord): run is DisposalSurveyRun {
  return run.mainRoot !== null;
}

@injectable()
export class DisposeEvaluateStep {
  private readonly collector: DisposalInputCollector;

  constructor(
    @inject(TASK_END_TOKENS.STORE) private readonly store: ITaskEndStore,
    @inject(TASK_END_TOKENS.SESSION_LINK_PORT)
    sessionLinks: SessionLinkPort,
    @inject(TASK_END_TOKENS.ACTIVITY_PORT) activity: ActivityPort,
    @inject(TASK_END_TOKENS.PR_STATUS_PORT) prStatus: PrStatusPort,
    @inject(TASK_END_TOKENS.GIT_READ_RUNNER) gitRunner: GitReadRunner,
    @inject(TASK_END_TOKENS.SETTINGS_READER)
    private readonly settings: Pick<TaskEndHookSettingsReader, 'read'>,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'debug'>,
  ) {
    this.collector = new DisposalInputCollector({
      git: new ReadOnlyGit(gitRunner),
      sessionLinks,
      activity,
      prStatus,
      logger,
    });
  }

  /**
   * Evaluates every dispose entry of the run that has not recorded an
   * outcome yet (a resumed run skips finished entries). Store failures
   * propagate to the worker. An aborted `signal` stops before the next
   * entry; the remaining entries stay pending for the resume.
   */
  async run(
    run: TaskEndRunRecord,
    signal: AbortSignal,
  ): Promise<readonly DisposeEvaluateRecorded[]> {
    const start = this.currentRun(run.runId);
    const placeholder = start.steps.find(
      (entry) => entry.step === STEP && entry.subject === '',
    );
    if (placeholder !== undefined && placeholder.outcome.state !== 'pending') {
      return [];
    }

    const snapshot = this.settings.read();
    const mode = modeFields(snapshot.disposalMode);
    const collectorSettings: DisposalCollectorSettings = {
      requestedMode: snapshot.disposalMode,
      archiveMaxBytes: snapshot.archive.maxBytes,
      archiveMaxFiles: snapshot.archive.maxFiles,
    };

    if (!hasMainRoot(start)) {
      // No validated main root: no git call and no filesystem probe runs.
      this.logger.debug('[task-end-hook] dispose without a main root', {
        runId: start.runId,
        probeErrors: [DISPOSAL_PROBE_ERRORS.mainRootUnresolved],
      });
      return this.recordPending(
        start,
        blocked('precondition-unverifiable', mode),
      );
    }

    if (placeholder !== undefined) {
      this.store.markStepRunning(start.runId, STEP, '');
    }
    let survey: DisposalRunSurvey;
    try {
      survey = await this.collector.survey(start, signal);
    } catch (error: unknown) {
      if (signal.aborted) return [];
      throw error;
    }

    if (placeholder !== undefined) {
      if (survey.candidates.length === 0) {
        const reason = survey.linksComplete
          ? 'no-linked-worktree'
          : 'precondition-unverifiable';
        return [this.record(start.runId, '', blocked(reason, mode))];
      }
      this.store.expandStep(
        start.runId,
        STEP,
        survey.candidates.map((candidate) => candidate.worktreePath),
      );
    }

    const current = this.currentRun(start.runId);
    const subjects = current.steps.filter(
      (entry) => entry.step === STEP && entry.subject !== '',
    );
    const recorded: DisposeEvaluateRecorded[] = [];
    for (const [index, entry] of subjects.entries()) {
      if (entry.outcome.state !== 'pending') continue;
      if (signal.aborted) break;
      this.store.markStepRunning(current.runId, STEP, entry.subject);
      if (index >= snapshot.maxWorktreesPerRun) {
        // Beyond `maxWorktreesPerRun`: not probed, so nothing is proved.
        recorded.push(
          this.record(
            current.runId,
            entry.subject,
            blocked('precondition-unverifiable', mode),
          ),
        );
        continue;
      }
      let outcome: TaskEndDisposeOutcome;
      try {
        outcome = decideDisposal(
          await this.collector.collect(
            survey,
            entry.subject,
            collectorSettings,
            signal,
          ),
        );
      } catch (error: unknown) {
        // Only an abort of `signal` reaches here from the collector: the
        // entry stays `running`, which the worker re-runs as pending.
        if (signal.aborted) break;
        throw error;
      }
      recorded.push(this.record(current.runId, entry.subject, outcome));
    }
    return recorded;
  }

  /** Records `outcome` on every entry still pending (the placeholder first). */
  private recordPending(
    run: TaskEndRunRecord,
    outcome: TaskEndDisposeOutcome,
  ): DisposeEvaluateRecorded[] {
    const recorded: DisposeEvaluateRecorded[] = [];
    for (const entry of run.steps) {
      if (entry.step !== STEP || entry.outcome.state !== 'pending') continue;
      this.store.markStepRunning(run.runId, STEP, entry.subject);
      recorded.push(this.record(run.runId, entry.subject, outcome));
    }
    return recorded;
  }

  private record(
    runId: string,
    subject: string,
    outcome: TaskEndDisposeOutcome,
  ): DisposeEvaluateRecorded {
    this.store.upsertStep(runId, STEP, subject, outcome);
    return { subject, outcome };
  }

  private currentRun(runId: string): TaskEndRunRecord {
    const current = this.store.getRun(runId);
    if (current === null) {
      throw new Error(`task-end run ${runId} disappeared during dispose`);
    }
    return current;
  }
}
