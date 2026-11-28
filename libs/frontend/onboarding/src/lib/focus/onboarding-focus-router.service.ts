import { Injectable, inject } from '@angular/core';
import {
  SurfaceRouterService,
  WORKSPACE_COORDINATOR,
  surfaceNavigationLanded,
  type NotificationFocusResult,
  type SurfaceFocusRouter,
} from '@ptah-extension/core';
import {
  SetupRunStore,
  stepTarget,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';

/** Routes a notification to the onboarding step that owns its Setup run. */
@Injectable({ providedIn: 'root' })
export class OnboardingFocusRouter implements SurfaceFocusRouter {
  readonly kind = 'onboarding' as const;
  private readonly runs = inject(SetupRunStore);
  private readonly router = inject(SurfaceRouterService);
  private readonly workspaceCoordinator = inject(WORKSPACE_COORDINATOR);

  canFocus(sessionId: string): boolean {
    return this.generationRun(sessionId) !== null;
  }

  async focus(sessionId: string): Promise<NotificationFocusResult> {
    const record = this.generationRun(sessionId);
    if (!record) return { success: false, outcome: 'missing' };
    if (record.workspacePath !== this.runs.workspacePath()) {
      await this.workspaceCoordinator.switchWorkspace(record.workspacePath);
    }
    const target = stepTarget(record);
    const result = await this.router.navigateToSurface(
      'onboarding',
      target.subPath,
      { queryParams: target.queryParams },
    );
    return surfaceNavigationLanded(result)
      ? { success: true, outcome: 'focused' }
      : { success: false, outcome: 'missing' };
  }

  private generationRun(id: string): SetupRunRecord | null {
    const record = this.runs.get(id);
    return record?.workflow === 'agent-generation' ||
      record?.workflow === 'project-guidance'
      ? record
      : null;
  }
}
