import { isOnboardingIdentityValue } from '@ptah-extension/core';
import type { SetupGenerationRunBinding } from '@ptah-extension/shared';
import {
  normalizeSetupWorkspacePath,
  type SetupRunDismissal,
} from '../setup-run-persistence';
import type { SetupRunRecord, SetupRunWorkflow } from '../setup-run.types';
import { workflowOfBinding } from './setup-run-binding';

function keyOf(
  workspacePath: string,
  workflow: SetupRunWorkflow,
  backendRunId: string,
): string {
  return JSON.stringify([
    normalizeSetupWorkspacePath(workspacePath),
    workflow,
    backendRunId,
  ]);
}

/** Local passive-adoption exclusions, persisted with the run index. */
export class SetupRunDismissals {
  private readonly markers = new Map<string, SetupRunDismissal>();

  public restore(dismissals: readonly SetupRunDismissal[] = []): void {
    for (const marker of dismissals) {
      this.markers.set(
        keyOf(marker.workspacePath, marker.workflow, marker.backendRunId),
        marker,
      );
    }
  }

  public remember(record: SetupRunRecord): void {
    const workspacePath = normalizeSetupWorkspacePath(record.workspacePath);
    const { workflow } = record;
    const backendRunId =
      record.backendRunId ??
      (workflow === 'analysis' ? record.analysisRunId : null);
    if (!workspacePath || !isOnboardingIdentityValue(backendRunId)) return;
    this.restore([{ workspacePath, workflow, backendRunId }]);
  }

  public has(
    workspace: string,
    workflow: SetupRunWorkflow,
    runId: string,
  ): boolean {
    return this.markers.has(keyOf(workspace, workflow, runId));
  }

  public hasPushedBinding(binding: SetupGenerationRunBinding): boolean {
    return this.has(
      binding.workspacePath,
      workflowOfBinding(binding.workflow),
      binding.runId,
    );
  }

  public snapshot(): SetupRunDismissal[] {
    return [...this.markers.values()];
  }
}
