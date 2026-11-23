import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';
import { createAcpEventHub } from './acp-event-hub';

const event = (sequence: number): ProviderSessionEvent => ({
  contextId: 'c',
  processGeneration: 1,
  sequence,
  type: 'info',
  message: `m${sequence}`,
});

describe('createAcpEventHub', () => {
  it('fans each event out to every live subscription, in order', async () => {
    const hub = createAcpEventHub();
    const first = hub.subscribe(new AbortController().signal)[Symbol.asyncIterator]();
    const second = hub.subscribe(new AbortController().signal)[Symbol.asyncIterator]();
    hub.publish(event(1));
    hub.publish(event(2));
    await expect(first.next()).resolves.toEqual({ done: false, value: event(1) });
    await expect(first.next()).resolves.toEqual({ done: false, value: event(2) });
    await expect(second.next()).resolves.toEqual({ done: false, value: event(1) });
    hub.end();
    await expect(second.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it('buffers nothing for a later subscriber', async () => {
    const hub = createAcpEventHub();
    hub.publish(event(1));
    const late = hub.subscribe(new AbortController().signal)[Symbol.asyncIterator]();
    const pending = late.next();
    hub.publish(event(2));
    await expect(pending).resolves.toEqual({ done: false, value: event(2) });
  });

  it('ends a subscription when its signal aborts, waking a pending read', async () => {
    const hub = createAcpEventHub();
    const abort = new AbortController();
    const iterator = hub.subscribe(abort.signal)[Symbol.asyncIterator]();
    const pending = iterator.next();
    abort.abort();
    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    hub.publish(event(1));
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it('ends a subscription made after the hub ended', async () => {
    const hub = createAcpEventHub();
    hub.end();
    const iterator = hub.subscribe(new AbortController().signal)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });
});
