import { mcpAttachmentObserver } from './mcp-attachment-observer';

describe('MCP attachment attempt attribution', () => {
  afterEach(() => mcpAttachmentObserver.clear());

  it('waits past tools/list responses for initialize', async () => {
    const waiting = mcpAttachmentObserver.waitFor('lane-a', 4888, 1000);
    mcpAttachmentObserver.record({
      agentId: 'lane-a',
      port: 4888,
      method: 'tools/list',
      time: Date.now(),
    });
    expect(mcpAttachmentObserver.get('lane-a', 4888)).toBeUndefined();
    mcpAttachmentObserver.record({
      agentId: 'lane-a',
      port: 4888,
      method: 'tools/list',
      time: Date.now(),
    });
    expect(mcpAttachmentObserver.get('lane-a', 4888)).toBeUndefined();
    mcpAttachmentObserver.record({
      agentId: 'lane-a',
      port: 4888,
      method: 'initialize',
      time: Date.now(),
    });
    expect((await waiting)?.method).toBe('initialize');
  });

  it('ignores tools/list without a tool count but accepts initialize', () => {
    const time = Date.now();
    mcpAttachmentObserver.record({
      agentId: 'lane-b',
      port: 4888,
      method: 'tools/list',
      time,
    });
    expect(mcpAttachmentObserver.get('lane-b', 4888)).toBeUndefined();
    mcpAttachmentObserver.record({
      agentId: 'lane-b',
      port: 4888,
      method: 'initialize',
      time,
    });
    expect(mcpAttachmentObserver.get('lane-b', 4888)?.method).toBe(
      'initialize',
    );
  });

  it('keeps an authenticated lane observation when the same URL is rejected later', () => {
    mcpAttachmentObserver.recordAttempt({
      agentId: 'lane-a',
      port: 4888,
      reason: 'seen',
      method: 'initialize',
      time: Date.now(),
    });
    mcpAttachmentObserver.recordRejectedAttempt({
      agentId: 'lane-a',
      port: 4888,
      reason: 'forbidden',
      method: 'POST',
      time: Date.now(),
    });
    expect(mcpAttachmentObserver.getAttempt('lane-a', 4888)?.reason).toBe(
      'seen',
    );
  });

  it('retains only 512 rejected attempts', () => {
    for (let index = 0; index < 513; index++)
      mcpAttachmentObserver.recordRejectedAttempt({
        agentId: `lane-${index}`,
        port: 4888,
        reason: 'auth-required',
        method: 'POST',
        time: Date.now(),
      });
    expect(mcpAttachmentObserver.getAttempt('lane-0', 4888)).toBeUndefined();
    expect(mcpAttachmentObserver.getAttempt('lane-512', 4888)?.reason).toBe(
      'auth-required',
    );
  });

  it('falls back to a fresh rejected attempt after an authenticated attempt expires', () => {
    mcpAttachmentObserver.recordAttempt({
      agentId: 'lane-a',
      port: 4888,
      reason: 'seen',
      method: 'initialize',
      time: 0,
    });
    mcpAttachmentObserver.recordRejectedAttempt({
      agentId: 'lane-a',
      port: 4888,
      reason: 'forbidden',
      method: 'POST',
      time: Date.now(),
    });
    expect(mcpAttachmentObserver.getAttempt('lane-a', 4888)?.reason).toBe(
      'forbidden',
    );
  });
});
