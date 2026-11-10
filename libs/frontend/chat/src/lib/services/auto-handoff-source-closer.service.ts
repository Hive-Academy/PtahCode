import { Injectable, inject } from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import { QueuedFollowUpStore, TabManagerService } from '@ptah-extension/chat-state';
import type { TabState } from '@ptah-extension/chat-types';
import type { HandoffCloseBlockerCode } from '@ptah-extension/shared';
import { z } from 'zod';
import { MessageDispatchService } from './chat-store/message-dispatch.service';

const LOG_CONTEXT = '[SessionAutoHandoff]';
const closeRequestSchema = z.object({
  requestId: z.string().min(1),
  predecessorTabId: z.string().min(1),
  predecessorSdkId: z.string().min(1).nullable(),
  predecessorStopped: z.boolean().optional(),
});

/** Closes a predecessor only after the host acknowledges its successor. */
@Injectable({ providedIn: 'root' })
export class AutoHandoffSourceCloserService {
  private readonly tabManager = inject(TabManagerService);
  private readonly followUps = inject(QueuedFollowUpStore);
  private readonly messageDispatch = inject(MessageDispatchService);
  private readonly logger = inject(LoggingService);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly answeredRequests = new Set<string>();
  private readonly processingRequests = new Set<string>();

  async closePredecessor(payload: unknown): Promise<void> {
    const parsed = closeRequestSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(LOG_CONTEXT, 'invalid predecessor close request');
      if (payload && typeof payload === 'object' && 'requestId' in payload &&
          typeof payload.requestId === 'string' && payload.requestId.length > 0 &&
          !this.processingRequests.has(payload.requestId)) {
        await this.replyOnce(payload.requestId, 'blocked', 'invalid-request');
      }
      return;
    }
    const { requestId, predecessorTabId, predecessorSdkId, predecessorStopped } = parsed.data;
    if (this.answeredRequests.has(requestId) || this.processingRequests.has(requestId)) return;
    this.processingRequests.add(requestId);
    try {
      let outcome: 'closed' | 'absent' | 'blocked' = 'blocked';
      let blockerCode: HandoffCloseBlockerCode | undefined;
      try {
        const lookup = this.tabManager.findTabByIdAcrossWorkspaces(predecessorTabId);
        if (!lookup) {
          outcome = 'absent';
        } else if (predecessorSdkId === null
          ? lookup.tab.claudeSessionId == null
          : lookup.tab.claudeSessionId === predecessorSdkId) {
          const blocker = this.closeBlocker(lookup.tab, predecessorStopped === true);
          if (blocker) {
            blockerCode = blocker;
            this.logger.info(LOG_CONTEXT, `the handed-off source tab stays open: ${blocker}`, { tabId: predecessorTabId });
          } else {
            outcome = await this.tabManager.closeHandoffPredecessor(predecessorTabId, predecessorSdkId, predecessorStopped === true) ? 'closed' : 'blocked';
            if (outcome === 'blocked') blockerCode = 'close-rejected';
          }
        } else {
          blockerCode = 'sdk-mismatch';
        }
      } catch (error: unknown) {
        this.logger.warn(LOG_CONTEXT, 'predecessor close failed', { requestId, error });
        blockerCode = 'close-error';
      }
      await this.replyOnce(requestId, outcome, blockerCode);
    } finally {
      this.processingRequests.delete(requestId);
    }
  }

  private closeBlocker(tab: TabState, stopped: boolean): HandoffCloseBlockerCode | null {
    if (tab.status === 'streaming' || tab.status === 'resuming' || tab.status === 'switching') return tab.status;
    if (tab.status !== 'loaded' && !(stopped && (tab.status === 'awaiting-background' || tab.status === 'sleeping'))) return tab.status === 'awaiting-background' ? 'background' : tab.status === 'sleeping' ? 'sleeping' : 'other-status';
    if (tab.isDirty) return 'unsent-input';
    if (this.followUps.forTab(tab.id).length > 0) return 'queued-message';
    if (!stopped && tab.pendingBackgroundTasks?.length) return 'pending-background-tasks';
    if (this.messageDispatch.hasPendingPermissionForTab(tab.id)) return 'permission-prompt';
    if (tab.commandCenterOrigin) return 'command-center';
    return null;
  }

  private async replyOnce(requestId: string, outcome: 'closed' | 'absent' | 'blocked', blockerCode?: HandoffCloseBlockerCode): Promise<void> {
    if (this.answeredRequests.has(requestId)) return;
    if (this.answeredRequests.size >= 128) {
      const oldest = this.answeredRequests.values().next().value;
      if (oldest !== undefined) this.answeredRequests.delete(oldest);
    }
    this.answeredRequests.add(requestId);
    try {
      const result = await this.rpc.call('session:handoffCloseResult', { requestId, outcome, ...(blockerCode ? { blockerCode } : {}) });
      if (!result.success) {
        this.logger.warn(LOG_CONTEXT, 'predecessor close reply failed', { requestId, error: result.error });
      }
    } catch (error: unknown) {
      this.logger.warn(LOG_CONTEXT, 'predecessor close reply failed', { requestId, error });
    }
  }
}
