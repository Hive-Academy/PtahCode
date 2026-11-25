import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import type { LaneRoutingLogger } from '../lane-routing-logger';

/** Reads the effective performance routing setting for each routing decision. */
export class PerformanceRoutingSetting {
  private warned = false;

  constructor(
    private readonly workspace: IWorkspaceProvider,
    private readonly logger: LaneRoutingLogger,
  ) {}

  isEnabled(): boolean {
    try {
      return this.workspace.getConfiguration<unknown>(
        'ptah',
        'agentOrchestration.performanceRouting',
      ) !== false;
    } catch (error: unknown) {
      // degradation-audit: reported - an unreadable setting preserves the default.
      if (!this.warned) {
        this.warned = true;
        this.logger.warn('Performance routing setting read failed', {
          code: error instanceof Error ? error.name : 'UNKNOWN',
        });
      }
      return true;
    }
  }
}
