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

export interface HarnessChatLaunchOptions {
  /** Aborted when the start page is left; a pending launch then stops before it opens chat. */
  readonly signal?: AbortSignal;
}

/** The user left the start page before preparation finished. Not a failure to show. */
export class HarnessChatLaunchCancelledError extends Error {
  constructor() {
    super('The chat launch was cancelled.');
    this.name = 'HarnessChatLaunchCancelledError';
  }
}

type HarnessWorkflowKind = 'harness-new-project' | 'harness-configure';

/** Bounds the wait for the canvas to adopt the new tab. */
const CANVAS_ADOPT_TIMEOUT_MS = 10_000;

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
    options: HarnessChatLaunchOptions = {},
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
    this.assertLaunchCurrent(root, options.signal);

    return this.openChatTab({
      workspacePath: root,
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
    options: HarnessChatLaunchOptions = {},
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
    this.assertLaunchCurrent(root, options.signal);

    return this.openChatTab({
      workspacePath: root,
      title: 'AI Team Builder',
      workflow: 'harness-configure',
      preamble: result.data.prompt,
      visibleMessage: trimmedIntent,
      attachmentSnapshot,
    });
  }

  /** Rejects a preparation result that no longer belongs to the start page or workspace. */
  private assertLaunchCurrent(root: string, signal?: AbortSignal): void {
    if (signal?.aborted) throw new HarnessChatLaunchCancelledError();
    if (this.workspaceRoot() !== root) {
      throw new Error(
        'The workspace changed while the chat was being prepared. Start again.',
      );
    }
  }

  private async openChatTab(params: {
    readonly workspacePath: string;
    readonly title: string;
    readonly workflow: HarnessWorkflowKind;
    readonly preamble: string;
    readonly visibleMessage: string;
    readonly attachmentSnapshot: LauncherAttachmentSnapshot;
  }): Promise<HarnessChatLaunchResult> {
    const tabId = this.tabs.createTab(params.title);
    this.tabs.setWorkflow(tabId, params.workflow);
    this.tabs.setFirstMessagePreamble(tabId, params.preamble);
    const adoption = this.appState.requestCanvasTab(
      tabId,
      params.workspacePath,
      params.title,
      true,
      { timeoutMs: CANVAS_ADOPT_TIMEOUT_MS },
    );
    this.appState.setCurrentView('chat');
    if (!(await adoption)) {
      await this.discardUnadoptedTab(tabId, params.workflow);
    }

    try {
      const outcome = await this.chatStore.sendOrQueueMessage(
        params.visibleMessage,
        {
          ...params.attachmentSnapshot.options,
          tabId,
          workspacePath: params.workspacePath,
        },
      );
      if (outcome.cancelled) return { tabId };
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
      this.composerRestore.restoreAttachments(
        tabId,
        params.attachmentSnapshot.attachments.files,
        params.attachmentSnapshot.attachments.images,
      );
      this.actionBanner.showError(error.message, tabId);
      throw error;
    }

    params.attachmentSnapshot.removeSent();
    return { tabId };
  }

  /**
   * The canvas refused, dropped or did not drain the tab. Nothing is sent and
   * the attachments stay with the start page. Always throws.
   */
  private async discardUnadoptedTab(
    tabId: string,
    workflow: HarnessWorkflowKind,
  ): Promise<never> {
    const error = new Error(
      'Could not show the new chat on the canvas. Try again.',
    );
    this.logger.error(
      'HarnessChatLauncherService',
      `Canvas did not adopt the chat tab for ${workflow}`,
      error,
    );
    try {
      await this.tabs.closeTab(tabId, true);
    } catch (cause: unknown) {
      this.logger.error(
        'HarnessChatLauncherService',
        'Could not close the chat tab that the canvas did not adopt',
        cause instanceof Error ? cause : new Error(String(cause)),
      );
    }
    this.actionBanner.showError(error.message);
    throw error;
  }
}
