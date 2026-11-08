import type {
  EventSource,
  FlatStreamEventUnion,
  MachinesEventPayload,
} from '@ptah-extension/shared';

/** Spec-only builders for remote session events. */

export const MACHINE_ID = 'm1';
export const SESSION_ID = 's1';

export function messageStart(
  id: string,
  messageId: string,
  source: EventSource,
): FlatStreamEventUnion {
  return {
    id,
    eventType: 'message_start',
    timestamp: 1,
    messageId,
    role: 'assistant',
    source,
  };
}

export function textDelta(
  id: string,
  messageId: string,
  delta: string,
  source: EventSource,
  blockIndex = 0,
): FlatStreamEventUnion {
  return {
    id,
    eventType: 'text_delta',
    timestamp: 1,
    messageId,
    delta,
    blockIndex,
    source,
  };
}

export function messageComplete(
  id: string,
  messageId: string,
  source: EventSource,
): FlatStreamEventUnion {
  return {
    id,
    eventType: 'message_complete',
    timestamp: 1,
    messageId,
    stopReason: 'end_turn',
    source,
  };
}

export function sessionEvent(
  seq: number,
  type: string,
  payload: unknown,
  epoch = 'e1',
): MachinesEventPayload {
  return {
    machineId: MACHINE_ID,
    sessionId: SESSION_ID,
    epoch,
    seq,
    type,
    payload,
  };
}

export function chunk(
  seq: number,
  event: FlatStreamEventUnion,
  epoch = 'e1',
): MachinesEventPayload {
  return sessionEvent(
    seq,
    'chat:chunk',
    { tabId: 'tab', sessionId: SESSION_ID, event },
    epoch,
  );
}

export function baseline(
  seq: number,
  events: readonly FlatStreamEventUnion[],
  epoch = 'e1',
): MachinesEventPayload {
  return sessionEvent(
    seq,
    'worker:baseline',
    { events, historyMark: { count: events.length, lastEventId: null } },
    epoch,
  );
}

/** A complete `permission:request` payload, as the worker logs it. */
export function permissionPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'p1',
    toolName: 'Bash',
    toolInput: { command: 'ls' },
    timestamp: 1_700_000_000_000,
    description: 'Run ls',
    timeoutAt: 1_700_000_060_000,
    ...overrides,
  };
}

/** History copy of message `h1`: what a baseline carries for it. */
export const HISTORY_MESSAGE: readonly FlatStreamEventUnion[] = [
  messageStart('h-start', 'msg-1', 'history'),
  textDelta('h-text', 'msg-1', 'Hello world', 'history'),
  messageComplete('h-done', 'msg-1', 'history'),
];

/** Live copy of the same message: stream deltas, then its complete events. */
export const LIVE_MESSAGE: readonly FlatStreamEventUnion[] = [
  messageStart('l-start', 'msg-1', 'stream'),
  textDelta('l-t1', 'msg-1', 'Hello ', 'stream'),
  textDelta('l-t2', 'msg-1', 'world', 'stream'),
  messageStart('c-start', 'msg-1', 'complete'),
  textDelta('c-text', 'msg-1', 'Hello world', 'complete'),
  messageComplete('c-done', 'msg-1', 'complete'),
];

/**
 * A ten-event log: a baseline holding message 1 (history), a turn that
 * streams message 1 again (A5 overlap) and a second message, and a
 * permission request that is then answered.
 */
export function referenceLog(epoch = 'e1'): readonly MachinesEventPayload[] {
  return [
    baseline(1, HISTORY_MESSAGE, epoch),
    sessionEvent(2, 'worker:turn.begin', { turnId: 't1' }, epoch),
    chunk(3, LIVE_MESSAGE[0], epoch),
    chunk(4, LIVE_MESSAGE[1], epoch),
    chunk(5, LIVE_MESSAGE[2], epoch),
    chunk(6, LIVE_MESSAGE[4], epoch),
    sessionEvent(7, 'permission:request', permissionPayload(), epoch),
    sessionEvent(
      8,
      'worker:permission.answered',
      { requestId: 'p1', decision: 'allow', by: 'Horus' },
      epoch,
    ),
    chunk(9, textDelta('l2-t1', 'msg-2', 'Second', 'stream'), epoch),
    sessionEvent(10, 'worker:turn.end', { turnId: 't1' }, epoch),
  ];
}
