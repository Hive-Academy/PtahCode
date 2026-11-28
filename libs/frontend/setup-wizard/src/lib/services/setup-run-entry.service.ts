import { Injectable, inject } from '@angular/core';
import {
  SurfaceRouterService,
  type SetupRunEntry,
  type SurfaceNavigationResult,
} from '@ptah-extension/core';
import type { SetupGenerationWorkflow } from '@ptah-extension/shared';
import { workflowOfBinding } from './setup-run-attempt';
import { SetupRunStore } from './setup-run.store';
import {
  isTerminalSetupRunStatus,
  type SetupRunRecord,
} from './setup-run.types';

@Injectable({ providedIn: 'root' })
export class SetupRunEntryService implements SetupRunEntry {
  private readonly runs = inject(SetupRunStore);
  private readonly router = inject(SurfaceRouterService);

  public readonly attentionCount = this.runs.attentionCount;
  public readonly runningCount = this.runs.runningCount;

  public openSetup(): Promise<SurfaceNavigationResult> {
    const active = this.runs.activeRun();
    return active
      ? this.openRun(active)
      : this.router.navigateToSurface('onboarding');
  }

  public openWorkflow(
    workflow: SetupGenerationWorkflow,
    _origin: string,
  ): Promise<SurfaceNavigationResult> {
    const requested = workflowOfBinding(workflow);
    const active = this.runs
      .runs()
      .find(
        (record) =>
          record.workflow === requested &&
          !isTerminalSetupRunStatus(record.status),
      );
    if (active) return this.openRun(active);

    const entry =
      requested === 'agent-generation' ? ['analyze', 'skills'] : ['guidance'];
    return this.router.navigateToSurface('onboarding', entry);
  }

  private openRun(record: SetupRunRecord): Promise<SurfaceNavigationResult> {
    const { subPath, queryParams } = this.runs.targetOf(record);
    return this.router.navigateToSurface('onboarding', subPath, {
      queryParams,
    });
  }
}
