import type { FlatStreamEventUnion } from '@ptah-extension/shared';
import { displayBlockValue } from '../utils/display-text';

/**
 * The flat events a remote session's transcript is built from, in display
 * order. Pure helpers; the reducer owns the list.
 *
 * One remote stream can carry the same message twice: once as `history`
 * (inside a `worker:baseline`) and once as live `stream` deltas followed by
 * the `complete` events of that message (plan A5). The local accumulator
 * resolves this by letting `complete`/`history` replace by message and block.
 * The rules here do the same on the flat list so applying both copies yields
 * the list one copy yields:
 *
 * - Each slot (a message's start or completion, a text or thinking block, a
 *   tool's start, input or result) holds one event.
 * - A definitive event (`complete` or `history`) replaces a `stream` event in
 *   its slot, in place.
 * - The first definitive event of a slot wins; a later definitive copy of it
 *   is dropped. Both copies come from the same completed message.
 * - A `stream` event never overrides a definitive one. `stream` deltas of a
 *   slot accumulate into the slot's one event, so the list grows with blocks,
 *   not with chunks.
 * - Events without a slot are kept once per `id`.
 */
export type TranscriptEvents = readonly FlatStreamEventUnion[];

export const EMPTY_TRANSCRIPT_EVENTS: TranscriptEvents = Object.freeze([]);

function isDefinitive(event: FlatStreamEventUnion): boolean {
  return event.source === 'complete' || event.source === 'history';
}

/** The slot an event fills, or `null` when it is kept per `id`. */
function slotKey(event: FlatStreamEventUnion): string | null {
  switch (event.eventType) {
    case 'message_start':
      return `message_start:${event.messageId}`;
    case 'message_complete':
      return `message_complete:${event.messageId}`;
    case 'text_delta':
      return `text:${event.messageId}:${event.blockIndex}`;
    case 'thinking_start':
      return `thinking_start:${event.messageId}:${event.blockIndex}`;
    case 'thinking_delta':
      return `thinking:${event.messageId}:${event.blockIndex}`;
    case 'tool_start':
      return `tool_start:${event.toolCallId}`;
    case 'tool_delta':
      return `tool_input:${event.toolCallId}`;
    case 'tool_result':
      return `tool_result:${event.toolCallId}`;
    default:
      return null;
  }
}

/** `existing` and `next` share a slot and are both `stream`: merge or replace. */
function mergeStream(
  existing: FlatStreamEventUnion,
  next: FlatStreamEventUnion,
): FlatStreamEventUnion {
  if (
    (existing.eventType === 'text_delta' && next.eventType === 'text_delta') ||
    (existing.eventType === 'thinking_delta' &&
      next.eventType === 'thinking_delta') ||
    (existing.eventType === 'tool_delta' && next.eventType === 'tool_delta')
  ) {
    return { ...existing, delta: existing.delta + next.delta };
  }
  return next;
}

/** Add one event under the rules above. Returns `events` itself when nothing changes. */
export function appendTranscriptEvent(
  events: TranscriptEvents,
  event: FlatStreamEventUnion,
): TranscriptEvents {
  const key = slotKey(event);
  const index =
    key === null
      ? events.findIndex(
          (candidate) =>
            slotKey(candidate) === null && candidate.id === event.id,
        )
      : events.findIndex((candidate) => slotKey(candidate) === key);

  if (index === -1) return [...events, event];

  const existing = events[index];
  if (isDefinitive(existing)) return events;
  const replacement = isDefinitive(event)
    ? event
    : key === null
      ? event
      : mergeStream(existing, event);
  const next = [...events];
  next[index] = replacement;
  return next;
}

/** Build a list from scratch (a baseline or a snapshot). */
export function toTranscriptEvents(
  events: readonly FlatStreamEventUnion[],
): TranscriptEvents {
  let result: TranscriptEvents = EMPTY_TRANSCRIPT_EVENTS;
  for (const event of events) result = appendTranscriptEvent(result, event);
  return result;
}

/**
 * The one ingestion boundary for worker-supplied transcript events (S6):
 * every event a remote transcript shows, from a baseline, a `chat:chunk` or
 * a snapshot, passes through here.
 *
 * Narrows an untrusted value to a flat stream event: an object with string
 * `id`, `eventType` and `messageId`, a numeric `timestamp`, and the slot
 * fields its type needs. The rest of its shape belongs to the backend that
 * produced it and is kept. Returns a copy in which every string (text,
 * thinking, tool input and output, names, keys) has had control, bidi and
 * zero-width characters removed by {@link displayBlockValue}; nothing is cut.
 */
export function parseFlatStreamEvent(
  value: unknown,
): FlatStreamEventUnion | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw['id'] !== 'string' ||
    typeof raw['eventType'] !== 'string' ||
    typeof raw['messageId'] !== 'string' ||
    typeof raw['timestamp'] !== 'number'
  ) {
    return null;
  }
  switch (raw['eventType']) {
    case 'text_delta':
    case 'thinking_delta':
      if (typeof raw['delta'] !== 'string') return null;
      if (typeof raw['blockIndex'] !== 'number') return null;
      break;
    case 'thinking_start':
      if (typeof raw['blockIndex'] !== 'number') return null;
      break;
    case 'tool_delta':
      if (typeof raw['delta'] !== 'string') return null;
      if (typeof raw['toolCallId'] !== 'string') return null;
      break;
    case 'tool_start':
    case 'tool_result':
      if (typeof raw['toolCallId'] !== 'string') return null;
      break;
    default:
      break;
  }
  return displayBlockValue(value) as FlatStreamEventUnion;
}

/** {@link parseFlatStreamEvent} over a list; events that do not parse are left out. */
export function parseFlatStreamEvents(
  values: readonly unknown[],
): FlatStreamEventUnion[] {
  const parsed: FlatStreamEventUnion[] = [];
  for (const value of values) {
    const event = parseFlatStreamEvent(value);
    if (event !== null) parsed.push(event);
  }
  return parsed;
}
