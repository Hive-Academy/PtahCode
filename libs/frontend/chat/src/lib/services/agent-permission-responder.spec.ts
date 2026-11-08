import { TestBed } from '@angular/core/testing';
import {
  AgentMonitorStore,
  PermissionHandlerService,
} from '@ptah-extension/chat-streaming';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { PermissionRequest } from '@ptah-extension/shared';
import { AgentPermissionResponder } from './agent-permission-responder';
import { ActionBannerService } from './action-banner.service';

describe('AgentPermissionResponder', () => {
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const queue = [{ requestId: 'first' }, { requestId: 'second' }];
  const call = jest.fn().mockResolvedValue({ success: true, data: { success: true } });
  const clearPermission = jest.fn<void, [string, string]>((_, requestId) => {
    const index = queue.findIndex((entry) => entry.requestId === requestId);
    if (index >= 0) queue.splice(index, 1);
  });
  const handlePermissionResponse = jest.fn<boolean, [unknown, string?]>(() => true);
  const showError = jest.fn();
  let responder: AgentPermissionResponder;

  beforeEach(() => {
    queue.splice(
      0,
      queue.length,
      { requestId: 'first' },
      { requestId: 'second' },
    );
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: ClaudeRpcService, useValue: { call } },
        { provide: ActionBannerService, useValue: { showError } },
        { provide: AgentMonitorStore, useValue: {
          clearPermission,
          permissionBelongsToAgent: () => true,
          pendingPermissions: () => [{ agentId: 'agent', permissionQueue: queue }],
        } },
        {
          provide: PermissionHandlerService,
          useValue: { handlePermissionResponse, permissionRequests: () => [{ id: 'session-perm' }] },
        },
      ],
    });
    responder = TestBed.inject(AgentPermissionResponder);
  });

  it('clears only after a positive RPC acknowledgement', async () => {
    expect(responder.respondLane('agent', 'first', 'deny')).toBe(true);
    expect(call).toHaveBeenCalledWith('agent:permissionResponse',
      { requestId: 'first', decision: 'deny', reason: 'User denied' });
    expect(clearPermission).not.toHaveBeenCalled();
    await settle();
    expect(clearPermission).toHaveBeenCalledWith('agent', 'first');
    expect(queue).toEqual([{ requestId: 'second' }]);
  });

  it('keeps a request when the RPC rejects it', async () => {
    call.mockResolvedValueOnce({ success: true, data: { success: false } });
    expect(responder.respondLane('agent', 'first', 'allow')).toBe(true);
    await settle();
    expect(clearPermission).not.toHaveBeenCalled();
    expect(queue).toHaveLength(2);
    expect(showError).toHaveBeenCalledWith('This permission request is no longer pending. Refresh the lane to see its current state.');
    expect(responder.respondLane('agent', 'first', 'deny')).toBe(true);
  });

  it('shows a retryable error when the answer cannot be delivered', async () => {
    call.mockRejectedValueOnce(new Error('transport unavailable'));
    call.mockResolvedValueOnce({ success: true, data: [{ requestId: 'first' }] });
    expect(responder.respondLane('agent', 'first', 'allow')).toBe(true);
    await settle();
    expect(clearPermission).not.toHaveBeenCalled();
    await settle();
    expect(call).toHaveBeenCalledWith('agent:pendingPermissions', undefined);
    expect(showError).toHaveBeenCalledWith('The permission is still pending. Retry your answer.');
  });

  it('reconciles a lost acknowledgement before clearing the card', async () => {
    call.mockRejectedValueOnce(new Error('ack lost'));
    call.mockResolvedValueOnce({ success: true, data: [] });
    expect(responder.respondLane('agent', 'first', 'allow')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(clearPermission).toHaveBeenCalledWith('agent', 'first');
    expect(showError).not.toHaveBeenCalled();
  });

  it('blocks retry while the pending snapshot cannot be read', async () => {
    call.mockRejectedValueOnce(new Error('ack lost'));
    call.mockRejectedValueOnce(new Error('replay unavailable'));
    expect(responder.respondLane('agent', 'first', 'allow')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(responder.respondLane('agent', 'first', 'deny')).toBe(false);
    expect(call).toHaveBeenCalledTimes(3); // answer, failed snapshot, retry snapshot
    expect(call).not.toHaveBeenCalledWith('agent:permissionResponse',
      expect.objectContaining({ decision: 'deny' }));
  });

  it('unlocks a hung acknowledgement after bounded reconciliation', async () => {
    jest.useFakeTimers();
    try {
      call.mockImplementationOnce(() => new Promise(() => undefined));
      call.mockResolvedValueOnce({ success: true, data: [{ requestId: 'first' }] });
      expect(responder.respondLane('agent', 'first', 'allow')).toBe(true);
      expect(responder.respondLane('agent', 'first', 'deny')).toBe(false);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(call).toHaveBeenCalledWith('agent:pendingPermissions', undefined);
      await jest.advanceTimersByTimeAsync(0);
      expect(responder.respondLane('agent', 'first', 'deny')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('submits a lane request only once while the RPC is pending', async () => {
    expect(responder.respondLane('agent', 'first', 'allow')).toBe(true);
    expect(responder.respondLane('agent', 'first', 'deny', 'User denied')).toBe(
      false,
    );
    expect(call).toHaveBeenCalledTimes(1);
    await settle();
    expect(clearPermission).toHaveBeenCalledTimes(1);
  });

  it('refuses a lane request withdrawn before an answer', () => {
    queue.splice(0, queue.length);
    expect(responder.respondLane('agent', 'first', 'allow')).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });

  it('forwards the deciding tab for session permissions', () => {
    const request = { id: 'session-perm' } as PermissionRequest;
    responder.respondSession(request, 'allow', 'tab-2');
    expect(handlePermissionResponse).toHaveBeenCalledWith(
      { id: 'session-perm', decision: 'allow', reason: undefined },
      'tab-2',
    );
  });

  it.each(['allow', 'always_allow', 'deny'] as const)('answers a queued permission without a tab using the badge response path: %s', decision => {
    const request = { id: 'session-perm' } as PermissionRequest;
    expect(responder.respondSession(request, decision)).toBe(true);
    expect(handlePermissionResponse).toHaveBeenCalledWith(
      { id: 'session-perm', decision, reason: undefined }, undefined,
    );
  });

  it('passes typed denial feedback in the old card response shape', () => {
    const request = { id: 'session-perm' } as PermissionRequest;
    expect(responder.respondSession(request, 'deny_with_message', undefined, 'Please narrow the command')).toBe(true);
    expect(handlePermissionResponse).toHaveBeenCalledWith(
      { id: 'session-perm', decision: 'deny_with_message', reason: 'Please narrow the command' }, undefined,
    );
  });

  it('refuses a session permission withdrawn before dispatch', () => {
    const request = { id: 'withdrawn' } as PermissionRequest;
    expect(responder.respondSession(request, 'allow', 'tab-2')).toBe(false);
    expect(handlePermissionResponse).not.toHaveBeenCalled();
  });
});
