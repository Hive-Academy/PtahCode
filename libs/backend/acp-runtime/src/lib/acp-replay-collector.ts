/**
 * The history an agent replays during `session/load`, kept as
 * `ProviderSessionEvent`s flagged `replayed` (instead of being dropped) so a
 * consumer can rebuild the scrollback, user turns included.
 *
 * - Each user turn opens a replay turn (`<sessionId>:replay:<n>`), so the
 *   assistant reply that follows it projects to its own message.
 * - Consecutive user chunks of one turn (same item id) merge into one
 *   `userText`, so a chunked user message is one message.
 * - Bounded: at most {@link ACP_MAX_REPLAY_EVENTS} events, the truncation
 *   notice included, and at most {@link ACP_MAX_REPLAY_TEXT_CHARS} characters
 *   of payload across them: text (merged user chunks included, so one long
 *   chunked message is still one event), serialized tool input and plan
 *   entries. A tool input over {@link ACP_MAX_REPLAY_TOOL_INPUT_CHARS} is
 *   compacted to its short top-level fields first, except that Edit and
 *   FileChange presentations are kept whole within the replay text budget.
 *   Beyond either bound the oldest events are dropped as needed, and payload
 *   that still does not fit is cut;
 *   one leading `info` says the history was truncated.
 */
import type {
  ProviderSessionEvent,
  ProviderSessionEventBody,
} from '@ptah-extension/provider-session-contracts';

export const ACP_MAX_REPLAY_EVENTS = 5_000;
/**
 * Payload budget of one replay: user text, agent text, reasoning, tool
 * output, serialized tool input and plan entries.
 */
export const ACP_MAX_REPLAY_TEXT_CHARS = 2_000_000;
/** A replayed tool input whose JSON is longer than this is compacted. */
export const ACP_MAX_REPLAY_TOOL_INPUT_CHARS = 4_096;
/** A string field a compacted tool input keeps is cut to this length. */
const COMPACTED_INPUT_FIELD_CHARS = 256;

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

/** The JSON length of a tool input; one that cannot be serialized counts as oversized. */
function serializedLength(input: Record<string, unknown>): number {
  try {
    return JSON.stringify(input)?.length ?? 0;
  } catch {
    // degradation-audit: optional-capability -- an input that cannot be
    // serialized is compacted to its primitive fields instead of retained.
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * The input's top-level primitive fields, strings cut to
 * {@link COMPACTED_INPUT_FIELD_CHARS}; nested values are left out. `undefined`
 * when even that does not fit {@link ACP_MAX_REPLAY_TOOL_INPUT_CHARS}.
 */
function compactInput(
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      compact[key] =
        value.length > COMPACTED_INPUT_FIELD_CHARS
          ? `${value.slice(0, COMPACTED_INPUT_FIELD_CHARS)}…`
          : value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      compact[key] = value;
    }
  }
  return serializedLength(compact) <= ACP_MAX_REPLAY_TOOL_INPUT_CHARS
    ? compact
    : undefined;
}

/** The characters of payload an event carries, counted against the budget. */
function textLength(body: ProviderSessionEventBody): number {
  switch (body.type) {
    case 'userText':
    case 'reasoning':
      return body.text.length;
    case 'textDelta':
      return body.delta.length;
    case 'toolCompleted':
      return body.output.length;
    case 'toolStarted':
      return (
        (body.input ? serializedLength(body.input) : 0) +
        (body.presentation?.input ? serializedLength(body.presentation.input) : 0)
      );
    case 'toolUpdated':
      return body.presentation?.input ? serializedLength(body.presentation.input) : 0;
    case 'plan':
      return body.entries.reduce((sum, entry) => sum + entry.content.length, 0);
    default:
      return 0;
  }
}

/** `body` with its payload cut to `chars` characters. */
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
    case 'toolStarted':
    case 'toolUpdated':
      // JSON cannot be cut in part: an input that does not fit is left out.
      return {
        ...body,
        ...(body.type === 'toolStarted' ? { input: undefined } : {}),
        ...(body.presentation
          ? { presentation: { toolName: body.presentation.toolName } }
          : {}),
      };
    case 'plan': {
      let left = chars;
      return {
        ...body,
        entries: body.entries.map((entry) => {
          const content = entry.content.slice(0, left);
          left -= content.length;
          return { ...entry, content };
        }),
      };
    }
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
  /** Payload characters cut because they did not fit the budget. */
  let cutChars = 0;
  /** Tool inputs compacted because they were over the per-input bound. */
  let compactedInputs = 0;
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
   * `keep` events. Returns how many of the `extra` characters fit.
   */
  const makeRoom = (extra: number, keep: number): number => {
    while (collected.length > keep && textChars + extra > maxTextChars) {
      dropOldest();
    }
    return Math.max(0, Math.min(extra, maxTextChars - textChars));
  };

  /** A tool input over the per-input bound is compacted before it is counted. */
  const compacted = (body: ProviderSessionEventBody): ProviderSessionEventBody => {
    if (body.type !== 'toolStarted' && body.type !== 'toolUpdated') return body;
    if (
      body.type === 'toolStarted' &&
      body.input &&
      serializedLength(body.input) > ACP_MAX_REPLAY_TOOL_INPUT_CHARS
    ) {
      compactedInputs++;
      body = { ...body, input: compactInput(body.input) };
    }
    const presentation = body.presentation;
    if (
      presentation?.input &&
      presentation.toolName !== 'Edit' &&
      presentation.toolName !== 'FileChange' &&
      serializedLength(presentation.input) > ACP_MAX_REPLAY_TOOL_INPUT_CHARS
    ) {
      compactedInputs++;
      body = {
        ...body,
        presentation: { ...presentation, input: compactInput(presentation.input) },
      };
    }
    return body;
  };

  const push = (incoming: ProviderSessionEventBody): void => {
    const body = compacted(incoming);
    const length = textLength(body);
    // Tool input is atomic. If it could never fit, keep older events and
    // retain the tool metadata so an oversized update cannot evict its start.
    const room =
      length > maxTextChars &&
      (body.type === 'toolStarted' || body.type === 'toolUpdated')
        ? 0
        : makeRoom(length, 0);
    const fitted = room < length ? cutText(body, room) : body;
    const kept = room < length ? textLength(fitted) : length;
    cutChars += length - kept;
    collected.push({
      contextId: ids.contextId,
      processGeneration: ids.processGeneration,
      sessionId: ids.sessionId,
      turnId: turnId(),
      sequence: ++sequence,
      replayed: true,
      ...fitted,
    } as ProviderSessionEvent);
    textChars += kept;
    while (collected.length > maxEvents) dropOldest();
  };

  /** Append a chunk to the user turn that is the last event. */
  const merge = (
    last: ProviderSessionEvent & { readonly type: 'userText' },
    text: string,
  ): void => {
    const room = makeRoom(text.length, 1);
    cutChars += text.length - room;
    collected[collected.length - 1] = {
      ...last,
      text: last.text + text.slice(0, room),
    };
    textChars += room;
  };

  const notice = (droppedEvents: number): string => {
    const parts = [
      ...(droppedEvents > 0
        ? [`the oldest ${droppedEvents} events were dropped`]
        : []),
      ...(cutChars > 0
        ? [
            `${cutChars} characters of text over the ${maxTextChars} character limit were cut`,
          ]
        : []),
      ...(compactedInputs > 0
        ? [
            `${compactedInputs} tool inputs over ${ACP_MAX_REPLAY_TOOL_INPUT_CHARS} characters were shortened`,
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
      if (dropped === 0 && cutChars === 0 && compactedInputs === 0) {
        return [...collected];
      }
      // The notice takes one of the `maxEvents` slots (PR #1450 review).
      const kept = collected.slice(
        Math.max(0, collected.length - Math.max(0, maxEvents - 1)),
      );
      const truncated: ProviderSessionEvent = {
        contextId: ids.contextId,
        processGeneration: ids.processGeneration,
        sessionId: ids.sessionId,
        sequence: 0,
        replayed: true,
        type: 'info',
        message: notice(dropped + collected.length - kept.length),
      };
      return [truncated, ...kept];
    },
  };
}
