import { isOnboardingIdentityValue } from '@ptah-extension/core';
import type { WizardGetResumableRunResponse } from '@ptah-extension/shared';
import {
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunStatus,
} from '../setup-run.types';
import type { SetupWizardStateService } from '../setup-wizard-state.service';
import type { WizardAnalysisRunner } from '../wizard-analysis-runner.service';
import type { WizardRpcService } from '../wizard-rpc.service';
import {
  FAILURE_COPY,
  isLive,
  newRunId,
  type SetupRunRecordHost,
} from './setup-run-host';

export class SetupRunAnalysisCoordinator {
  private readonly runnerSeen = new Set<string>();

  public constructor(
    private readonly host: SetupRunRecordHost,
    private readonly runner: WizardAnalysisRunner,
    private readonly wizardState: SetupWizardStateService,
    private readonly rpc: WizardRpcService,
  ) {}

  public reconcile(
    workspace: string,
    resumable: WizardGetResumableRunResponse,
  ): void {
    const manifest = resumable.analysis?.manifest ?? null;
    const active =
      resumable.analysisActive === true ||
      this.runner.isRunningForWorkspace(workspace);
    const live = this.host
      .runsFor(workspace)
      .filter((record) => record.workflow === 'analysis' && isLive(record));
    if (active) {
      if (live.length === 0) {
        this.adopt(workspace, 'running', manifest?.runId ?? null);
      }
      return;
    }
    for (const record of live) {
      if (this.host.isLiveThisSession(record.id)) continue;
      if (
        !manifest ||
        (record.backendRunId !== null && record.backendRunId !== manifest.runId)
      ) {
        // No evidence about this run: keep the last known status.
        continue;
      }
      this.host.apply(record.id, {
        status:
          manifest.lifecycle === 'completed' ? 'completed' : 'interrupted',
        backendRunId: manifest.runId,
        analysisRunId: manifest.runId,
      });
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
  ): void {
    const now = Date.now();
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
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Map the runner's signals onto the analysis records it ran here. */
  public syncFromRunner(running: boolean, canceling: boolean): void {
    const workspace = this.host.workspacePath();
    if (!workspace) return;
    const live = this.host
      .runsFor(workspace)
      .filter((record) => record.workflow === 'analysis' && isLive(record));
    if (running && this.runner.isRunningForWorkspace(workspace)) {
      for (const record of live) {
        this.runnerSeen.add(record.id);
        if (canceling) this.host.setCancelling(record.id, true);
      }
      return;
    }
    for (const record of live) {
      if (!this.runnerSeen.has(record.id)) continue;
      this.runnerSeen.delete(record.id);
      const result = this.wizardState.multiPhaseResult();
      const ownsResult = this.runner.isResultForWorkspace(workspace);
      if (this.host.isCancelling(record.id)) {
        this.host.setCancelling(record.id, false);
        this.host.apply(record.id, { status: 'cancelled' });
      } else if (ownsResult && this.runner.errorMessage()) {
        this.host.apply(record.id, {
          status: 'failed',
          error: FAILURE_COPY.analysis,
        });
      } else if (
        ownsResult &&
        result &&
        result.manifest.lifecycle === 'completed' &&
        isOnboardingIdentityValue(result.manifest.runId)
      ) {
        this.host.apply(record.id, {
          status: 'completed',
          backendRunId: result.manifest.runId,
          analysisRunId: result.manifest.runId,
        });
      } else {
        this.host.apply(record.id, { status: 'interrupted' });
      }
    }
  }

  public run(record: SetupRunRecord, resume: boolean): void {
    this.host.markLiveThisSession(record.id);
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
