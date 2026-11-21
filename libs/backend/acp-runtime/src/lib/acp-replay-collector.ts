/**
 * The history an agent replays during `session/load`, kept as
 * `ProviderSessionEvent`s flagged `replayed` (instead of being dropped) so a
 * consumer can rebuild the scrollback, user turns included.
 *
 * - Each user turn opens a replay turn (`<sessionId>:replay:<n>`), so the
 *   assistant reply that follows it projects to its own message.
 * - Consecutive user chunks of one turn (same item id) merge into one
 *   `userText`, so a chunked user message is one message.
 * - Bounded: at most {@link ACP_MAX_REPLAY_EVENTS} events and at most
 *   {@link ACP_MAX_REPLAY_TEXT_CHARS} characters of text across them, merged
 *   user chunks included (one long chunked message is still one event).
 *   Beyond either bound the oldest events are dropped, and text that still
 *   does not fit is cut; one leading `info` says the history was truncated.
 */
import type {
  ProviderSessionEvent,
  ProviderSessionEventBody,
} from '@ptah-extension/provider-session-contracts';

export const ACP_MAX_REPLAY_EVENTS = 5_000;
/** Text budget of one replay (user text, agent text, reasoning, tool output). */
export const ACP_MAX_REPLAY_TEXT_CHARS = 2_000_000;

export interface AcpReplayCollectorIds {
  readonly contextId: string;
  readonly processGeneration: number;
  readonly sessionId: string;
}

export interface AcpReplayCollectorLimits {
  readonly maxEvents?: number;
  readonly maxTextChars?: number;
}

export interface AcpReplayCollector {
  add(bodies: readonly ProviderSessionEventBody[]): void;
  /** The collected history, oldest first. */
  events(): readonly ProviderSessionEvent[];
}

/** The characters of text an event carries, counted against the budget. */
function textLength(body: ProviderSessionEventBody): number {
  switch (body.type) {
    case 'userText':
    case 'reasoning':
      return body.text.length;
    case 'textDelta':
      return body.delta.length;
    case 'toolCompleted':
      return body.output.length;
    default:
      return 0;
  }
}

/** `body` with its text cut to `chars` characters. */
function cutText(
  body: ProviderSessionEventBody,
  chars: number,
): ProviderSessionEventBody {
  switch (body.type) {
    case 'userText':
    case 'reasoning':
      return { ...body, text: body.text.slice(0, chars) };
    case 'textDelta':
      return { ...body, delta: body.delta.slice(0, chars) };
    case 'toolCompleted':
      return { ...body, output: body.output.slice(0, chars) };
    default:
      return body;
  }
}

export function createAcpReplayCollector(
  ids: AcpReplayCollectorIds,
  limits: AcpReplayCollectorLimits = {},
): AcpReplayCollector {
  const maxEvents = limits.maxEvents ?? ACP_MAX_REPLAY_EVENTS;
  const maxTextChars = limits.maxTextChars ?? ACP_MAX_REPLAY_TEXT_CHARS;
  const collected: ProviderSessionEvent[] = [];
  let sequence = 0;
  let turn = 0;
  let dropped = 0;
  /** Text characters held by {@link collected}. */
  let textChars = 0;
  /** Text characters cut because they did not fit the budget. */
  let cutChars = 0;
  let lastUserItem: string | undefined;

  const turnId = (): string => `${ids.sessionId}:replay:${turn}`;

  const dropOldest = (): void => {
    const oldest = collected.shift();
    if (!oldest) return;
    textChars -= textLength(oldest);
    dropped++;
  };

  /**
   * Drop the oldest events until `extra` more characters fit, never the last
   * `keep` events. Returns how many of the `extra` characters fit; the rest
   * is counted as cut.
   */
  const makeRoom = (extra: number, keep: number): number => {
    while (collected.length > keep && textChars + extra > maxTextChars) {
      dropOldest();
    }
    const room = Math.max(0, Math.min(extra, maxTextChars - textChars));
    cutChars += extra - room;
    return room;
  };

  const push = (body: ProviderSessionEventBody): void => {
    const length = textLength(body);
    const room = makeRoom(length, 0);
    const fitted = room < length ? cutText(body, room) : body;
    collected.push({
      contextId: ids.contextId,
      processGeneration: ids.processGeneration,
      sessionId: ids.sessionId,
      turnId: turnId(),
      sequence: ++sequence,
      replayed: true,
      ...fitted,
    } as ProviderSessionEvent);
    textChars += room;
    while (collected.length > maxEvents) dropOldest();
  };

  /** Append a chunk to the user turn that is the last event. */
  const merge = (
    last: ProviderSessionEvent & { readonly type: 'userText' },
    text: string,
  ): void => {
    const room = makeRoom(text.length, 1);
    collected[collected.length - 1] = {
      ...last,
      text: last.text + text.slice(0, room),
    };
    textChars += room;
  };

  const notice = (): string => {
    const parts = [
      ...(dropped > 0 ? [`the oldest ${dropped} events were dropped`] : []),
      ...(cutChars > 0
        ? [
            `${cutChars} characters of text over the ${maxTextChars} character limit were cut`,
          ]
        : []),
    ];
    return `The replayed history was truncated: ${parts.join(' and ')}`;
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
            merge(last, body.text);
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
      if (dropped === 0 && cutChars === 0) return [...collected];
      const truncated: ProviderSessionEvent = {
        contextId: ids.contextId,
        processGeneration: ids.processGeneration,
        sessionId: ids.sessionId,
        sequence: 0,
        replayed: true,
        type: 'info',
        message: notice(),
      };
      return [truncated, ...collected];
    },
  };
}
