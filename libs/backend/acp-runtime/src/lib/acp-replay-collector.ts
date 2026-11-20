/**
 * The history an agent replays during `session/load`, kept as
 * `ProviderSessionEvent`s flagged `replayed` (instead of being dropped) so a
 * consumer can rebuild the scrollback, user turns included.
 *
 * - Each user turn opens a replay turn (`<sessionId>:replay:<n>`), so the
 *   assistant reply that follows it projects to its own message.
 * - Consecutive user chunks of one turn (same item id) merge into one
 *   `userText`, so a chunked user message is one message.
 * - Bounded: at most {@link ACP_MAX_REPLAY_EVENTS} events. Beyond that the
 *   oldest are dropped and one leading `info` says the history was truncated.
 */
import type {
  ProviderSessionEvent,
  ProviderSessionEventBody,
} from '@ptah-extension/provider-session-contracts';

export const ACP_MAX_REPLAY_EVENTS = 5_000;

export interface AcpReplayCollectorIds {
  readonly contextId: string;
  readonly processGeneration: number;
  readonly sessionId: string;
}

export interface AcpReplayCollector {
  add(bodies: readonly ProviderSessionEventBody[]): void;
  /** The collected history, oldest first. */
  events(): readonly ProviderSessionEvent[];
}

export function createAcpReplayCollector(
  ids: AcpReplayCollectorIds,
  maxEvents: number = ACP_MAX_REPLAY_EVENTS,
): AcpReplayCollector {
  const collected: ProviderSessionEvent[] = [];
  let sequence = 0;
  let turn = 0;
  let dropped = 0;
  let lastUserItem: string | undefined;

  const turnId = (): string => `${ids.sessionId}:replay:${turn}`;

  const push = (body: ProviderSessionEventBody): void => {
    collected.push({
      contextId: ids.contextId,
      processGeneration: ids.processGeneration,
      sessionId: ids.sessionId,
      turnId: turnId(),
      sequence: ++sequence,
      replayed: true,
      ...body,
    } as ProviderSessionEvent);
    if (collected.length > maxEvents) {
      collected.shift();
      dropped++;
    }
  };

  return {
    add(bodies) {
      for (const body of bodies) {
        if (body.type === 'userText') {
          const last = collected[collected.length - 1];
          if (
            body.itemId === lastUserItem &&
            last?.type === 'userText' &&
            last.itemId === body.itemId
          ) {
            collected[collected.length - 1] = {
              ...last,
              text: last.text + body.text,
            };
            continue;
          }
          turn++;
          lastUserItem = body.itemId;
        } else {
          lastUserItem = undefined;
        }
        push(body);
      }
    },
    events() {
      if (dropped === 0) return [...collected];
      const notice: ProviderSessionEvent = {
        contextId: ids.contextId,
        processGeneration: ids.processGeneration,
        sessionId: ids.sessionId,
        sequence: 0,
        replayed: true,
        type: 'info',
        message: `The replayed history was truncated: the oldest ${dropped} events were dropped`,
      };
      return [notice, ...collected];
    },
  };
}
