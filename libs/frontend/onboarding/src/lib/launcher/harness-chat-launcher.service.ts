import { computed, inject, Injectable } from '@angular/core';
import {
  ActionBannerService,
  ChatStore,
  ComposerRestoreService,
  type ComposerAttachmentsService,
} from '@ptah-extension/chat';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AppStateManager,
  ClaudeRpcService,
  LoggingService,
  VSCodeService,
} from '@ptah-extension/core';
import type { NewProjectIntake } from '@ptah-extension/shared';
import {
  formatIntakeSummary,
  isNewProjectIntakeValid,
} from '../proposal/new-project-intake.model';

export type LauncherAttachmentSnapshot = ReturnType<
  ComposerAttachmentsService['snapshotForSend']
>;

export interface HarnessChatLaunchResult {
  readonly tabId: string;
}

type HarnessWorkflowKind = 'harness-new-project' | 'harness-configure';

/**
 * Thin launcher for Setup Hub's "New project" and "AI team builder" flows.
 *
 * Runs backend preparation via `ClaudeRpcService`, creates a standard chat tab
 * with `firstMessagePreamble`, adopts it on the Orchestra Canvas, switches to
 * the chat surface, and dispatches the visible first user turn with any form
 * attachments.
 */
@Injectable({ providedIn: 'root' })
export class HarnessChatLauncherService {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly tabs = inject(TabManagerService);
  private readonly appState = inject(AppStateManager);
  private readonly chatStore = inject(ChatStore);
  private readonly actionBanner = inject(ActionBannerService);
  private readonly composerRestore = inject(ComposerRestoreService);
  private readonly vscode = inject(VSCodeService);
  private readonly logger = inject(LoggingService);

  readonly workspaceRoot = computed(
    () =>
      this.tabs.activeWorkspacePath ?? this.vscode.config().workspaceRoot ?? '',
  );

  async checkFolderEmpty(workspaceRoot?: string): Promise<boolean> {
    const targetRoot = workspaceRoot ?? this.workspaceRoot();
    const result = await this.rpc.call(
      'harness:initialize',
      targetRoot ? { workspaceRoot: targetRoot } : {},
    );
    if (!result.isSuccess() || !result.data) {
      throw new Error(result.error || 'Could not check this folder. Try again.');
    }
    return result.data.workspaceEffectivelyEmpty;
  }

  async launchNewProject(
    intake: NewProjectIntake,
    attachmentSnapshot: LauncherAttachmentSnapshot,
  ): Promise<HarnessChatLaunchResult> {
    const root = this.workspaceRoot();
    if (!root) {
      throw new Error('Open a workspace before starting a new project.');
    }
    if (!isNewProjectIntakeValid(intake)) {
      throw new Error('Complete the project brief before starting.');
    }
    const result = await this.rpc.call('harness:start-new-project', { intake });
    if (!result.isSuccess() || !result.data) {
      const error = new Error(
        result.error || 'Could not start New Project. Try again.',
      );
      this.logger.error(
        'HarnessChatLauncherService',
        'harness:start-new-project RPC failed',
        error,
      );
      throw error;
    }
    if (!result.data.success) {
      const error = new Error(
        result.data.error || 'Could not start New Project. Try again.',
      );
      this.logger.error(
        'HarnessChatLauncherService',
        'harness:start-new-project returned failure',
        error,
      );
      throw error;
    }

    return this.openChatTab({
      title: 'New Project',
      workflow: 'harness-new-project',
      preamble: result.data.seedPrompt,
      visibleMessage: formatIntakeSummary(intake),
      attachmentSnapshot,
    });
  }

  async launchTeamBuilder(
    intent: string,
    attachmentSnapshot: LauncherAttachmentSnapshot,
  ): Promise<HarnessChatLaunchResult> {
    const root = this.workspaceRoot();
    if (!root) {
      throw new Error('Open a workspace before starting the team builder.');
    }
    const trimmedIntent = intent.trim();
    if (!trimmedIntent) {
      throw new Error('Describe the team you want before starting.');
    }
    const result = await this.rpc.call('harness:workflow-prompt', {
      mode: 'configure-harness',
      contextOnly: true,
    });
    if (!result.isSuccess() || !result.data?.prompt) {
      const error = new Error(
        result.error || 'Could not prepare the team builder prompt. Try again.',
      );
      this.logger.error(
        'HarnessChatLauncherService',
        'harness:workflow-prompt RPC failed',
        error,
      );
      throw error;
    }

    return this.openChatTab({
      title: 'AI Team Builder',
      workflow: 'harness-configure',
      preamble: result.data.prompt,
      visibleMessage: trimmedIntent,
      attachmentSnapshot,
    });
  }

  private async openChatTab(params: {
    readonly title: string;
    readonly workflow: HarnessWorkflowKind;
    readonly preamble: string;
    readonly visibleMessage: string;
    readonly attachmentSnapshot: LauncherAttachmentSnapshot;
  }): Promise<HarnessChatLaunchResult> {
    const workspacePath = this.workspaceRoot() || null;
    const tabId = this.tabs.createTab(params.title);
    this.tabs.setWorkflow(tabId, params.workflow);
    this.tabs.setFirstMessagePreamble(tabId, params.preamble);
    void this.appState.requestCanvasTab(
      tabId,
      workspacePath,
      params.title,
      true,
    );
    this.appState.setCurrentView('chat');

    try {
      const outcome = await this.chatStore.sendOrQueueMessage(
        params.visibleMessage,
        {
          ...params.attachmentSnapshot.options,
          tabId,
        },
      );
      if (!outcome.success) {
        throw new Error(
          outcome.error || 'Could not send the first message. Try again.',
        );
      }
    } catch (cause: unknown) {
      const error =
        cause instanceof Error
          ? cause
          : new Error('Could not send the first message. Try again.');
      this.logger.error(
        'HarnessChatLauncherService',
        `Initial chat send failed for ${params.workflow}`,
        error,
      );
      this.composerRestore.restore(tabId, [params.visibleMessage]);
      this.actionBanner.showError(error.message, tabId);
      throw error;
    }

    params.attachmentSnapshot.removeSent();
    return { tabId };
  }
}
