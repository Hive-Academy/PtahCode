import { Injectable, inject, signal } from '@angular/core';
import {
  TabManagerService,
  isActiveWorkspaceTabSet,
} from '@ptah-extension/chat-state';
import {
  SETUP_RUN_ENTRY,
  SurfaceRouterService,
  VSCodeService,
  type MessageHandler,
} from '@ptah-extension/core';
import {
  MESSAGE_TYPES,
  type SetupGenerationOpenPayload,
  type SetupGenerationWorkflow,
} from '@ptah-extension/shared';

const OPEN_FAILURE_NOTICE = 'Setup could not open. Try Continue again.';

@Injectable({ providedIn: 'root' })
export class SetupGenerationOpenHandler implements MessageHandler {
  private readonly tabs = inject(TabManagerService);
  private readonly entry = inject(SETUP_RUN_ENTRY, { optional: true });
  private readonly router = inject(SurfaceRouterService);
  private readonly vscode = inject(VSCodeService);
  public readonly launchNotice = signal<string | null>(null);
  public readonly handledMessageTypes = [
    MESSAGE_TYPES.SETUP_GENERATION_OPEN,
  ] as const;

  public handleMessage(message: { type: string; payload?: unknown }): void {
    if (
      message.type !== MESSAGE_TYPES.SETUP_GENERATION_OPEN ||
      !this.isPayload(message.payload)
    )
      return;
    if (
      !isActiveWorkspaceTabSet(
        message.payload.workspacePath,
        this.tabs.activeWorkspacePath,
        this.vscode.config().workspaceRoot,
        this.vscode.config().isVSCode,
      )
    ) {
      console.debug(
        '[SetupGenerationOpenHandler] Ignored a generation open for another workspace',
      );
      return;
    }
    void this.open(message.payload.workflow);
  }

  private async open(workflow: SetupGenerationWorkflow): Promise<void> {
    this.launchNotice.set(null);
    if (workflow === 'setup-agent-generation' && !this.entry) return;

    try {
      const result = await (this.entry
        ? this.entry.openWorkflow(workflow, 'host')
        : this.router.navigateToSurface('onboarding'));
      if (result === 'failed') this.launchNotice.set(OPEN_FAILURE_NOTICE);
    } catch {
      this.launchNotice.set(OPEN_FAILURE_NOTICE);
    }
  }

  private isPayload(payload: unknown): payload is SetupGenerationOpenPayload {
    if (!payload || typeof payload !== 'object') return false;
    const value = payload as Record<string, unknown>;
    return (
      typeof value['workspacePath'] === 'string' &&
      value['workspacePath'].trim().length > 0 &&
      (value['workflow'] === 'setup-agent-generation' ||
        value['workflow'] === 'setup-project-prompt') &&
      (value['origin'] === 'analysis-result-continue' ||
        value['origin'] === 'independent-start')
    );
  }
}
