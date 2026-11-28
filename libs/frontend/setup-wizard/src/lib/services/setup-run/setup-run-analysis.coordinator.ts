import { isOnboardingIdentityValue } from '@ptah-extension/core';
import type { WizardGetResumableRunResponse } from '@ptah-extension/shared';
import { sameSetupWorkspacePath } from '../setup-run-persistence';
import {
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunStatus,
} from '../setup-run.types';
import type { SetupWizardStateService } from '../setup-wizard-state.service';
import type { WizardAnalysisRunner } from '../wizard-analysis-runner.service';
import type { WizardRpcService } from '../wizard-rpc.service';
import type { SetupRunSavedAnalysis } from './setup-run-saved-analysis';
import {
  FAILURE_COPY,
  isLive,
  newRunId,
  type SetupRunRecordHost,
} from './setup-run-host';

export class SetupRunAnalysisCoordinator {
  private readonly runnerSeen = new Map<string, boolean>();

  public constructor(
    private readonly host: SetupRunRecordHost,
    private readonly runner: WizardAnalysisRunner,
    private readonly wizardState: SetupWizardStateService,
    private readonly rpc: WizardRpcService,
    private readonly saved: SetupRunSavedAnalysis,
  ) {}

  public async reconcile(
    workspace: string,
    resumable: WizardGetResumableRunResponse,
  ): Promise<void> {
    const manifest = resumable.analysis?.manifest ?? null;
    const live = this.host
      .runsFor(workspace)
      .filter((record) => record.workflow === 'analysis' && isLive(record));
    if (
      resumable.analysisActive === true ||
      this.runner.isRunningForWorkspace(workspace)
    ) {
      if (live.length === 0) {
        const startedAt = Date.parse(resumable.activeAnalysisStartedAt ?? '');
        this.adopt(
          workspace,
          'running',
          manifest?.lifecycle === 'running' ? manifest.runId : null,
          Number.isFinite(startedAt) ? startedAt : undefined,
        );
      }
      if (
        resumable.analysisActive === true &&
        !this.runner.isRunningForWorkspace(workspace)
      ) {
        this.runner.syncBackendActive(true, {
          startedAt: resumable.activeAnalysisStartedAt,
          workspacePath: workspace,
        });
      }
      if (this.runner.isRunningForWorkspace(workspace)) {
        this.syncFromRunner(true, this.runner.isCanceling());
      }
      return;
    }
    if (resumable.analysisActive === false) {
      await Promise.all(
        live.map(async (record) => {
          if (this.host.isLiveThisSession(record.id)) return;
          if (
            manifest &&
            (record.backendRunId === manifest.runId ||
              (!record.backendRunId &&
                Date.parse(manifest.updatedAt ?? manifest.analyzedAt) >=
                  record.createdAt))
          ) {
            this.host.apply(record.id, {
              status:
                manifest.lifecycle === 'completed'
                  ? 'completed'
                  : 'interrupted',
              backendRunId: manifest.runId,
              analysisRunId: manifest.runId,
            });
          } else {
            await this.recoverSaved(record);
          }
        }),
      );
      if (
        this.host.workspacePath() !== workspace ||
        this.runner.isRunningForWorkspace(workspace)
      )
        return;
    }
    if (
      manifest &&
      manifest.lifecycle !== 'completed' &&
      !this.host
        .runsFor(workspace)
        .some(
          (record) =>
            record.workflow === 'analysis' &&
            (record.backendRunId === manifest.runId || isLive(record)),
        )
    ) {
      this.adopt(workspace, 'interrupted', manifest.runId);
    }
  }

  private adopt(
    workspace: string,
    status: SetupRunStatus,
    runId: string | null,
    createdAt = Date.now(),
  ): void {
    if (
      runId !== null &&
      (!isOnboardingIdentityValue(runId) ||
        this.host.wasDismissed(workspace, 'analysis', runId))
    )
      return;
    this.host.insert({
      id: newRunId(),
      workspacePath: workspace,
      workflow: 'analysis',
      status,
      step: 'analyzing',
      backendRunId: runId,
      analysisRunId: runId,
      parentId: null,
      unseen: isTerminalSetupRunStatus(status),
      createdAt,
      updatedAt: Date.now(),
    });
  }

  /** Map the runner's state to the records that actually owned its work. */
  public syncFromRunner(running: boolean, canceling: boolean): void {
    if (running) {
      const workspace =
        this.runner.activeWorkspacePath() ?? this.host.workspacePath();
      if (!workspace || !this.runner.isRunningForWorkspace(workspace)) return;
      for (const id of this.runnerSeen.keys()) {
        if (
          !sameSetupWorkspacePath(this.host.get(id)?.workspacePath, workspace)
        ) {
          this.runnerSeen.delete(id);
        }
      }
      for (const record of this.host.runsFor(workspace)) {
        if (record.workflow !== 'analysis' || !isLive(record)) continue;
        this.runnerSeen.set(record.id, this.runner.backendActive());
        if (canceling) this.host.setCancelling(record.id, true);
      }
      return;
    }
    for (const [id, hydrated] of this.runnerSeen) {
      const record = this.host.get(id);
      if (record && this.runner.isRunningForWorkspace(record.workspacePath))
        continue;
      this.runnerSeen.delete(id);
      if (!record || !isLive(record)) continue;
      const result = this.wizardState.multiPhaseResult();
      const ownsResult = this.runner.isResultForWorkspace(record.workspacePath);
      if (this.host.isCancelling(id)) {
        this.host.setCancelling(id, false);
        this.host.apply(id, { status: 'cancelled' });
      } else if (hydrated) {
        void this.recoverSaved(record);
      } else if (ownsResult && this.runner.errorMessage()) {
        this.host.apply(id, {
          status: 'failed',
          error: FAILURE_COPY.analysis,
        });
      } else if (
        ownsResult &&
        result &&
        result.manifest.lifecycle === 'completed' &&
        isOnboardingIdentityValue(result.manifest.runId)
      ) {
        this.host.apply(id, {
          status: 'completed',
          backendRunId: result.manifest.runId,
          analysisRunId: result.manifest.runId,
        });
        void this.saved.discoverAfterCompletion(record.workspacePath);
      } else {
        this.host.apply(id, { status: 'interrupted' });
      }
    }
  }

  private async recoverSaved(record: SetupRunRecord): Promise<void> {
    const workspacePath = this.host.workspacePath();
    if (
      !workspacePath ||
      !sameSetupWorkspacePath(workspacePath, record.workspacePath)
    )
      return;
    const isCurrent = () =>
      sameSetupWorkspacePath(this.host.workspacePath(), workspacePath) &&
      this.host.get(record.id) === record &&
      !this.runner.isRunningForWorkspace(workspacePath);
    let runId: string | null = null;
    try {
      runId = await this.saved.recover(record, isCurrent);
    } catch {
      console.warn('[setup-run-analysis] Saved analysis recovery failed.');
    }
    if (!isCurrent()) return;
    this.host.apply(
      record.id,
      runId
        ? { status: 'completed', backendRunId: runId, analysisRunId: runId }
        : { status: 'interrupted' },
    );
  }

  public run(record: SetupRunRecord, resume: boolean): void {
    this.host.markLiveThisSession(record.id);
    this.runnerSeen.set(record.id, false);
    const run = resume
      ? this.runner.resumeAnalysis(record.workspacePath)
      : this.runner.startFreshAnalysis(record.workspacePath);
    // The runner effect maps the outcome; a rejection is already in its signals.
    run.catch(() => {
      // degradation-audit: optional-capability - the runner records the failure in errorMessage
    });
  }

  public async cancel(record: SetupRunRecord): Promise<boolean> {
    if (this.runner.isRunningForWorkspace(record.workspacePath)) {
      this.runnerSeen.delete(record.id);
      await this.runner.cancel();
    } else {
      await this.rpc.cancelAnalysis();
    }
    const resumable = await this.rpc.getResumableRun();
    if (resumable.analysisActive === true) return false;
    this.host.apply(record.id, { status: 'cancelled' });
    return true;
  }
}
