import { effect, inject, Injectable } from '@angular/core';
import {
  AgentMonitorStore,
  PermissionHandlerService,
} from '@ptah-extension/chat-streaming';
import { ClaudeRpcService } from '@ptah-extension/core';
import type {
  PermissionRequest,
  PermissionResponse,
} from '@ptah-extension/shared';
import { ActionBannerService } from './action-banner.service';

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

  respondLane(
    agentId: string,
    requestId: string,
    decision: 'allow' | 'deny',
    reason?: string,
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
    void this.withTimeout(this.rpc.call('agent:permissionResponse', {
          requestId,
          decision,
          ...(decision === 'deny'
            ? { reason: reason ?? 'User denied' }
            : reason === undefined
              ? {}
              : { reason }),
    }), AgentPermissionResponder.ACK_TIMEOUT_MS).then((result) => {
      if (result.success && result.data?.success) {
        this.agentStore.clearPermission(agentId, requestId);
      } else {
        this.answeredRequestIds.delete(requestId);
        this.actionBanner.showError('This permission request is no longer pending. Refresh the lane to see its current state.');
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
