import {
  COPILOT_EDIT_REFUSED,
  COPILOT_PERMISSION_DELIVERY_TIMEOUT_MS,
  COPILOT_PERMISSION_OWNED_TIMEOUT_MS,
  CopilotPermissionBridge,
} from './copilot-permission-bridge';

describe('CopilotPermissionBridge pending requests', () => {
  afterEach(() => jest.useRealTimers());

  function request(bridge: CopilotPermissionBridge) {
    bridge.setAutoApprove(false);
    return bridge.requestToolPermission({ agentId: 'lane', toolName: 'Write', toolArgs: {} });
  }

  it('denies immediately when no renderer listener is registered', async () => {
    const bridge = new CopilotPermissionBridge();
    await expect(request(bridge)).resolves.toMatchObject({ permissionDecision: 'deny' });
    expect(bridge.pendingCount).toBe(0);
  });

  it('denies an undelivered request at the delivery deadline and rejects a late answer', async () => {
    jest.useFakeTimers();
    const bridge = new CopilotPermissionBridge();
    let requestId = '';
    bridge.events.on('permission-request', (payload: { requestId: string; timeoutAt: number; timestamp: number }) => {
      requestId = payload.requestId;
      expect(payload.timeoutAt).toBe(payload.timestamp + COPILOT_PERMISSION_DELIVERY_TIMEOUT_MS);
    });
    const pending = request(bridge);
    expect(bridge.pendingCount).toBe(1);
    expect(bridge.hasPendingRequest(requestId)).toBe(true);
    jest.advanceTimersByTime(COPILOT_PERMISSION_DELIVERY_TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ permissionDecision: 'deny' });
    expect(bridge.pendingCount).toBe(0);
    expect(bridge.hasPendingRequest(requestId)).toBe(false);
    bridge.resolvePermission(requestId, { requestId, decision: 'allow' });
    expect(bridge.hasPendingRequest(requestId)).toBe(false);
  });

  it('denies a routed request whose delivery was never confirmed', async () => {
    jest.useFakeTimers();
    const bridge = new CopilotPermissionBridge();
    bridge.events.on('permission-request', (payload: { requestId: string }) => {
      bridge.setRequestRoute(payload.requestId, 'parent', '2026-11-07T10:00:00.000Z');
    });
    const pending = request(bridge);
    jest.advanceTimersByTime(COPILOT_PERMISSION_DELIVERY_TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ permissionDecision: 'deny' });
  });

  it('keeps a delivered owned request past delivery timeout and denies at its visible deadline', async () => {
    jest.useFakeTimers();
    const bridge = new CopilotPermissionBridge();
    let requestId = '';
    bridge.events.on('permission-request', (payload: { requestId: string }) => { requestId = payload.requestId; });
    const pending = request(bridge);
    expect(bridge.markDelivered(requestId)).toBe(false);
    const routed = bridge.setRequestRoute(requestId, 'parent', '2026-11-07T10:00:00.000Z');
    expect(routed?.timeoutAt).toBe(Date.now() + COPILOT_PERMISSION_OWNED_TIMEOUT_MS);
    expect(bridge.markDelivered(requestId)).toBe(true);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(COPILOT_PERMISSION_DELIVERY_TIMEOUT_MS);
    expect(bridge.hasPendingRequest(requestId)).toBe(true);
    expect(bridge.pendingPermissions()).toEqual([expect.objectContaining({ requestId, timeoutAt: routed?.timeoutAt })]);
    jest.advanceTimersByTime(COPILOT_PERMISSION_OWNED_TIMEOUT_MS - COPILOT_PERMISSION_DELIVERY_TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ permissionDecision: 'deny' });
    expect(bridge.hasPendingRequest(requestId)).toBe(false);
  });

  it('settles a delivered request with deny when the lane stops', async () => {
    const bridge = new CopilotPermissionBridge();
    let requestId = '';
    bridge.events.on('permission-request', (payload: { requestId: string }) => { requestId = payload.requestId; });
    const pending = request(bridge);
    bridge.setRequestRoute(requestId, 'parent', '2026-11-07T10:00:00.000Z');
    bridge.markDelivered(requestId);
    bridge.cleanup();
    await expect(pending).resolves.toMatchObject({ permissionDecision: 'deny', permissionDecisionReason: 'Agent stopped' });
    expect(bridge.markDelivered(requestId)).toBe(false);
  });

  it('consumes one answer and clears the deadline', async () => {
    jest.useFakeTimers();
    const bridge = new CopilotPermissionBridge();
    let requestId = '';
    bridge.events.on('permission-request', (payload: { requestId: string }) => { requestId = payload.requestId; });
    const pending = request(bridge);
    expect(bridge.hasPendingRequest(requestId)).toBe(true);
    bridge.resolvePermission(requestId, { requestId, decision: 'allow' });
    await expect(pending).resolves.toMatchObject({ permissionDecision: 'allow' });
    bridge.resolvePermission(requestId, { requestId, decision: 'deny' });
    expect(bridge.hasPendingRequest(requestId)).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('snapshots only routed live requests for renderer rehydration', async () => {
    const bridge = new CopilotPermissionBridge();
    let requestId = '';
    bridge.events.on('permission-request', (payload: { requestId: string }) => { requestId = payload.requestId; });
    const pending = request(bridge);
    expect(bridge.pendingPermissions()).toEqual([]);
    const routed = bridge.setRequestRoute(requestId, 'parent', '2026-11-07T10:00:00.000Z');
    expect(bridge.pendingPermissions()).toEqual([routed]);
    bridge.resolvePermission(requestId, { requestId, decision: 'allow' });
    await pending;
    expect(bridge.pendingPermissions()).toEqual([]);
  });
});

describe('CopilotPermissionBridge lane responses', () => {
  function pendingRequest() {
    const bridge = new CopilotPermissionBridge();
    bridge.setAutoApprove(false);
    let requestId = '';
    bridge.events.on('permission-request', (payload: { requestId: string }) => {
      requestId = payload.requestId;
    });
    const tool = bridge.requestToolPermission({ agentId: 'lane', toolName: 'Write', toolArgs: {} });
    const file = () => bridge.requestFilePermission({ agentId: 'lane', kind: 'shell', details: {} });
    return { bridge, tool, file, id: () => requestId };
  }

  it('allows the call for always_allow', async () => {
    const { bridge, tool, id } = pendingRequest();
    expect(bridge.resolveLaneResponse({ requestId: id(), decision: 'always_allow' })).toBe('resolved');
    await expect(tool).resolves.toMatchObject({ permissionDecision: 'allow' });
  });

  it('approves a file permission for always_allow', async () => {
    const { bridge, file, id } = pendingRequest();
    const answer = file();
    expect(bridge.resolveLaneResponse({ requestId: id(), decision: 'always_allow' })).toBe('resolved');
    await expect(answer).resolves.toEqual({ kind: 'approved' });
  });

  it('denies with the message for deny_with_message', async () => {
    const { bridge, tool, id } = pendingRequest();
    bridge.resolveLaneResponse({ requestId: id(), decision: 'deny_with_message', reason: 'Use the other file' });
    await expect(tool).resolves.toEqual({ permissionDecision: 'deny', permissionDecisionReason: 'Use the other file' });
  });

  it('refuses an approval with edited input and keeps the request pending', async () => {
    const { bridge, tool, id } = pendingRequest();
    expect(bridge.resolveLaneResponse({ requestId: id(), decision: 'allow', modifiedInput: { path: 'b.ts' } }))
      .toBe('edit-refused');
    expect(bridge.hasPendingRequest(id())).toBe(true);
    expect(COPILOT_EDIT_REFUSED).toMatch(/cannot run a tool with edited input/);
    bridge.resolveLaneResponse({ requestId: id(), decision: 'deny', modifiedInput: { path: 'b.ts' } });
    await expect(tool).resolves.toMatchObject({ permissionDecision: 'deny' });
  });

  it('reports an unknown request as not pending', () => {
    expect(new CopilotPermissionBridge().resolveLaneResponse({ requestId: 'nope', decision: 'allow' })).toBe('not-pending');
  });
});
