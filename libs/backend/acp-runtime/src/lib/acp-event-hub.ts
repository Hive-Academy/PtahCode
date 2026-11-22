/**
 * The event fan-out of one provider session: every event the ACP session
 * emits goes to each live subscription, in order. Nothing is buffered for a
 * later subscriber, so a turn that subscribes before its prompt sees exactly
 * its own events. A subscription ends when its signal aborts or the hub ends
 * (session closed), and then releases its queue.
 */
import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';

export interface AcpEventHub {
  publish(event: ProviderSessionEvent): void;
  subscribe(signal: AbortSignal): AsyncIterable<ProviderSessionEvent>;
  /** End every subscription; later subscriptions end at once. */
  end(): void;
}

interface Subscription {
  readonly queue: ProviderSessionEvent[];
  wake?: () => void;
  done: boolean;
}

export function createAcpEventHub(): AcpEventHub {
  const subscriptions = new Set<Subscription>();
  let ended = false;

  const finish = (subscription: Subscription): void => {
    subscription.done = true;
    subscription.queue.length = 0;
    subscriptions.delete(subscription);
    subscription.wake?.();
  };

  return {
    publish(event) {
      for (const subscription of subscriptions) {
        subscription.queue.push(event);
        subscription.wake?.();
      }
    },
    end() {
      ended = true;
      for (const subscription of [...subscriptions]) finish(subscription);
    },
    subscribe(signal) {
      return {
        [Symbol.asyncIterator](): AsyncIterator<ProviderSessionEvent> {
          const subscription: Subscription = { queue: [], done: false };
          const onAbort = (): void => finish(subscription);
          if (ended || signal.aborted) {
            subscription.done = true;
          } else {
            subscriptions.add(subscription);
            signal.addEventListener('abort', onAbort, { once: true });
          }
          const close = (): IteratorReturnResult<undefined> => {
            signal.removeEventListener('abort', onAbort);
            finish(subscription);
            return { done: true, value: undefined };
          };
          return {
            async next() {
              for (;;) {
                const event = subscription.queue.shift();
                if (event) return { done: false, value: event };
                if (subscription.done) return close();
                await new Promise<void>((resolve) => {
                  subscription.wake = resolve;
                });
                subscription.wake = undefined;
              }
            },
            async return() {
              return close();
            },
          };
        },
      };
    },
  };
}
