import { effect, inject, Injectable } from '@angular/core';
import {
  AgentMonitorStore,
  PermissionHandlerService,
} from '@ptah-extension/chat-streaming';
import { ClaudeRpcService } from '@ptah-extension/core';
import type {
  LanePermissionResponse,
  PermissionRequest,
  PermissionResponse,
} from '@ptah-extension/shared';
import { ActionBannerService } from './action-banner.service';

/** Backend reply when the request id is unknown: already answered, expired or never ours. */
const NOT_PENDING_ERROR = 'No pending permission request matched this response';

/** Banner for a request that left the queue before the answer arrived. */
export const LANE_PERMISSION_NOT_PENDING_TEXT =
  'This permission request is no longer pending. Refresh the lane to see its current state.';

@Injectable({ providedIn: 'root' })
export class AgentPermissionResponder {
  private static readonly ACK_TIMEOUT_MS = 5_000;
  private readonly rpc = inject(ClaudeRpcService);
  private readonly agentStore = inject(AgentMonitorStore);
  private readonly permissionHandler = inject(PermissionHandlerService);
  private readonly actionBanner = inject(ActionBannerService);
  private readonly answeredRequestIds = new Set<string>();
  private readonly reconciliationRequired = new Set<string>();
  private readonly reconcilingRequestIds = new Set<string>();

  constructor() {
    effect(() => {
      const pending = new Set(this.agentStore.pendingPermissions().flatMap(agent =>
        agent.permissionQueue.map(request => request.requestId)));
      for (const id of this.answeredRequestIds) if (!pending.has(id)) this.answeredRequestIds.delete(id);
      for (const id of this.reconciliationRequired) if (!pending.has(id)) this.reconciliationRequired.delete(id);
    });
  }

  /**
   * Send a lane user's answer as a `LanePermissionResponse`. Every decision of
   * main chat's permission card is accepted, with the edited tool input.
   * Returns false when the answer was not sent: already answered, awaiting
   * reconciliation, or no longer pending for this lane.
   *
   * When the host refuses the answer for a reason other than "not pending"
   * (a Copilot edit refusal, a schema rejection), the request stays pending
   * and answerable: the refusal text is shown in the banner and passed to
   * `onRefused` so the surface can show it next to the card.
   */
  respondLane(
    agentId: string,
    requestId: string,
    decision: LanePermissionResponse['decision'],
    reason?: string,
    modifiedInput?: LanePermissionResponse['modifiedInput'],
    onRefused?: (message: string) => void,
  ): boolean {
    if (this.answeredRequestIds.has(requestId)) return false;
    if (this.reconciliationRequired.has(requestId)) {
      void this.reconcileLane(agentId, requestId);
      return false;
    }
    if (!this.agentStore.pendingPermissions().some(agent =>
      agent.agentId === agentId && agent.permissionQueue.some(request =>
        request.requestId === requestId && this.agentStore.permissionBelongsToAgent(request, agent))
    )) return false;
    this.answeredRequestIds.add(requestId);
    const response: LanePermissionResponse = {
      requestId,
      decision,
      ...(decision === 'deny'
        ? { reason: reason ?? 'User denied' }
        : reason === undefined
          ? {}
          : { reason }),
      ...(modifiedInput === undefined ? {} : { modifiedInput }),
    };
    void this.withTimeout(
      this.rpc.call('agent:permissionResponse', response),
      AgentPermissionResponder.ACK_TIMEOUT_MS,
    ).then((result) => {
      if (result.success && result.data?.success) {
        this.agentStore.clearPermission(agentId, requestId);
      } else {
        this.answeredRequestIds.delete(requestId);
        // Only the handler's own reply says the request is still pending; a
        // transport failure keeps the generic "no longer pending" banner.
        const refusal = result.success ? result.data?.error : undefined;
        if (refusal === undefined || refusal === NOT_PENDING_ERROR) {
          this.actionBanner.showError(LANE_PERMISSION_NOT_PENDING_TEXT);
        } else {
          this.actionBanner.showError(refusal);
          onRefused?.(refusal);
        }
      }
    }).catch(() => {
      this.reconciliationRequired.add(requestId);
      this.answeredRequestIds.delete(requestId);
      void this.reconcileLane(agentId, requestId);
    });
    return true;
  }

  private async reconcileLane(agentId: string, requestId: string): Promise<void> {
    if (this.reconcilingRequestIds.has(requestId)) return;
    this.reconcilingRequestIds.add(requestId);
    try {
      const pending = await this.withTimeout(
        this.rpc.call('agent:pendingPermissions', undefined),
        AgentPermissionResponder.ACK_TIMEOUT_MS,
      );
      if (!pending.success || !Array.isArray(pending.data)) throw new Error('Pending snapshot unavailable');
      if (!pending.data.some(request => request.requestId === requestId)) {
        this.agentStore.clearPermission(agentId, requestId);
      } else {
        this.actionBanner.showError('The permission is still pending. Retry your answer.');
      }
      this.reconciliationRequired.delete(requestId);
    } catch {
      this.actionBanner.showError('Could not confirm the permission answer. Refresh the lane before retrying.');
    } finally {
      this.reconcilingRequestIds.delete(requestId);
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Permission acknowledgement timed out')), ms);
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }

  respondSession(
    request: PermissionRequest,
    decision: PermissionResponse['decision'],
    tabId?: string,
    reason?: string,
  ): boolean {
    if (!this.isSessionPending(request.id)) return false;
    return this.permissionHandler.handlePermissionResponse(
      { id: request.id, decision, reason },
      tabId,
    );
  }

  isSessionPending(requestId: string): boolean {
    return this.permissionHandler.permissionRequests().some(pending => pending.id === requestId);
  }
}
