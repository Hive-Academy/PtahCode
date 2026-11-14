import { mcpAttachmentObserver as observer } from './mcp-attachment-observer';

describe('MCP attachment observer', () => {
  afterEach(() => observer.clear());

  it('cancels an attachment waiter on abort', async () => {
    const abort = new AbortController();
    const waiting = observer.waitFor('lane', 51821, 15_000, abort.signal);
    abort.abort();
    await expect(waiting).resolves.toBeUndefined();
    observer.record({
      agentId: 'lane',
      port: 51821,
      method: 'initialize',
      time: Date.now(),
    });
  });

  it('resolves old waiters as misses when the server port clears', async () => {
    const waiting = observer.waitFor('lane', 51821, 15_000);
    observer.clearPort(51821);
    await expect(waiting).resolves.toBeUndefined();
  });

  it('stores only sanitized rejected attempts under the agent and port', () => {
    const attempt = { agentId: 'lane', port: 51821, method: 'POST', reason: 'forbidden' as const, time: Date.now() };
    observer.recordAttempt(attempt);
    expect(observer.getAttempt('lane', 51821)).toEqual(attempt);
    expect(observer.getAttempt('other', 51821)).toBeUndefined();
    expect(Object.keys(observer.getAttempt('lane', 51821) ?? {})).toEqual(['agentId', 'port', 'method', 'reason', 'time']);
    observer.clearPort(51821);
    expect(observer.getAttempt('lane', 51821)).toBeUndefined();
  });
});
