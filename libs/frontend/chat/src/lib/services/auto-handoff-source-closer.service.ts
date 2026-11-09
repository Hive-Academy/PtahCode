import { Injectable, inject } from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import { QueuedFollowUpStore, TabManagerService } from '@ptah-extension/chat-state';
import type { TabState } from '@ptah-extension/chat-types';
import { z } from 'zod';
import { MessageDispatchService } from './chat-store/message-dispatch.service';

const LOG_CONTEXT = '[SessionAutoHandoff]';
const closeRequestSchema = z.object({
  requestId: z.string().min(1),
  predecessorTabId: z.string().min(1),
  predecessorSdkId: z.string().min(1).nullable(),
});
const WAIT_STATUSES: ReadonlySet<TabState['status']> = new Set([
  'streaming', 'resuming', 'switching',
]);

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
        await this.replyOnce(payload.requestId, 'blocked');
      }
      return;
    }
    const { requestId, predecessorTabId, predecessorSdkId } = parsed.data;
    if (this.answeredRequests.has(requestId) || this.processingRequests.has(requestId)) return;
    this.processingRequests.add(requestId);
    try {
      let outcome: 'closed' | 'absent' | 'blocked' = 'blocked';
      try {
        const lookup = this.tabManager.findTabByIdAcrossWorkspaces(predecessorTabId);
        if (!lookup) {
          outcome = 'absent';
        } else if (predecessorSdkId === null
          ? lookup.tab.claudeSessionId == null
          : lookup.tab.claudeSessionId === predecessorSdkId) {
          const blocker = this.closeBlocker(lookup.tab);
          if (blocker) {
            this.logger.info(LOG_CONTEXT, `the handed-off source tab stays open: ${blocker}`, { tabId: predecessorTabId });
          } else {
            outcome = await this.tabManager.closeHandoffPredecessor(predecessorTabId, predecessorSdkId) ? 'closed' : 'blocked';
          }
        }
      } catch (error: unknown) {
        this.logger.warn(LOG_CONTEXT, 'predecessor close failed', { requestId, error });
      }
      await this.replyOnce(requestId, outcome);
    } finally {
      this.processingRequests.delete(requestId);
    }
  }

  private closeBlocker(tab: TabState): string | null {
    if (WAIT_STATUSES.has(tab.status)) return `its state is '${tab.status}'`;
    if (tab.status !== 'loaded') return `its state is '${tab.status}' (background work or sleep)`;
    if (tab.isDirty) return 'it has unsent input';
    if (this.followUps.forTab(tab.id).length > 0) return 'it still has a queued message';
    if (tab.pendingBackgroundTasks?.length) return 'it has background work in flight';
    if (this.messageDispatch.hasPendingPermissionForTab(tab.id)) return 'a permission prompt is open on it';
    if (tab.commandCenterOrigin) return 'it is a Command Center tab';
    return null;
  }

  private async replyOnce(requestId: string, outcome: 'closed' | 'absent' | 'blocked'): Promise<void> {
    if (this.answeredRequests.has(requestId)) return;
    if (this.answeredRequests.size >= 128) {
      const oldest = this.answeredRequests.values().next().value;
      if (oldest !== undefined) this.answeredRequests.delete(oldest);
    }
    this.answeredRequests.add(requestId);
    try {
      const result = await this.rpc.call('session:handoffCloseResult', { requestId, outcome });
      if (!result.success) {
        this.logger.warn(LOG_CONTEXT, 'predecessor close reply failed', { requestId, error: result.error });
      }
    } catch (error: unknown) {
      this.logger.warn(LOG_CONTEXT, 'predecessor close reply failed', { requestId, error });
    }
  }
}
