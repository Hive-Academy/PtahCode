import type {
  MachinesEventPayload,
  MachinesSessionAttachResult,
  PermissionRequest,
} from '@ptah-extension/shared';
import {
  EMPTY_TRANSCRIPT_EVENTS,
  appendTranscriptEvent,
  parseFlatStreamEvent,
  toTranscriptEvents,
  type TranscriptEvents,
} from './transcript-events';
import { REMOTE_PERMISSION_TIMEOUT_BY } from '../utils/remote-session-copy';

/**
 * Renderer-side reducer for one remote session's `machines:event` stream.
 * Pure: no I/O, no timers, no clock. `MachinesStore` feeds it pushes and RPC
 * outcomes and sends the replay each step returns.
 *
 * Applying events, keyed by (epoch, seq):
 *
 * - Apply only `seq === last + 1`. `seq <= last` is a duplicate (a replay
 *   overlapping live events) and is dropped.
 * - `worker:baseline` replaces the transcript and applies past a gap.
 * - An event past a gap is held (at most {@link MAX_HELD_EVENTS}) and applies
 *   once the gap closes. The first gap asks for one replay from `last`.
 * - An event of another epoch means the log was replaced: the cursor and the
 *   transcript reset, then the event is applied as the first of its epoch.
 *
 * Attach outcomes (`machines:session.attach` / `machines:session.replay`):
 *
 * - `log`: a new epoch resets like an event does; the same epoch keeps the
 *   cursor unless the log no longer reaches it (`fromSeq > last + 1`), which
 *   restarts from `fromSeq`. Events stream from `fromSeq` up to `headSeq`.
 * - `snapshot`: the session cannot be streamed here (not logged, or another
 *   process drives it). The saved transcript is shown watch-only (design 4.9,
 *   Q1 (a)); events are ignored until the next attach.
 *
 * Nothing here knows the machine's connection state: an offline machine
 * leaves this state as it was (design 3.4).
 */

/** Events held past a gap. Beyond this they are dropped; the replay resends them. */
export const MAX_HELD_EVENTS = 1_000;

/** Timed-out requests kept for their notice; older ones are dropped. */
export const MAX_TIMED_OUT_PERMISSIONS = 20;

/**
 * - `attaching` — an attach is outstanding; events are held for it.
 * - `log` — following the session's event log.
 * - `snapshot` — showing a saved transcript, watch-only; events are ignored.
 * - `detached` — the last attach failed; any cached transcript stays and
 *   events are ignored until the next attach.
 */
export type RemoteSessionMode = 'attaching' | 'log' | 'snapshot' | 'detached';

/**
 * - `none` — nothing outstanding.
 * - `requested` — a replay was asked for and has not answered.
 * - `streaming` — an attach or replay answered; its events are arriving.
 */
export type RemoteSessionRecovery = 'none' | 'requested' | 'streaming';

export interface SessionEventState {
  readonly sessionId: string;
  readonly mode: RemoteSessionMode;
  /** Epoch of the followed log; `null` before the first and for a snapshot. */
  readonly epoch: string | null;
  /** Highest `seq` applied; 0 before any. */
  readonly last: number;
  /** Highest `seq` known to exist in this epoch; never below `last`. */
  readonly target: number;
  /** Events past a gap, ascending by `seq`, one per `seq`. */
  readonly held: readonly MachinesEventPayload[];
  readonly events: TranscriptEvents;
  /** The turn the worker reported as begun and not yet ended. */
  readonly turnId: string | null;
  /** Permission requests the log shows unanswered, in arrival order. */
  readonly pendingPermissions: readonly PermissionRequest[];
  /**
   * Requests of the current turn the worker denied because nobody answered
   * within its deadline (a `worker:permission.answered` with
   * `by: 'Worker timeout'`, decision 27), kept so the view can say so. A new
   * turn, a baseline or a new log clears them.
   */
  readonly timedOutPermissions: readonly PermissionRequest[];
  /** Holder label of a snapshot another process drives (`drivenBy`). */
  readonly drivenBy: string | null;
  readonly recovery: RemoteSessionRecovery;
}

export interface SessionReplayRequest {
  readonly afterSeq: number;
}

export type SessionEventAction =
  | { readonly kind: 'attach-started' }
  | {
      readonly kind: 'attach-succeeded';
      readonly result: MachinesSessionAttachResult;
    }
  | { readonly kind: 'attach-failed' }
  | { readonly kind: 'replay-failed' }
  | { readonly kind: 'event'; readonly event: MachinesEventPayload }
  /**
   * The machine's connection came back. Asks for a replay when the view had
   * not reached `target`, or always with `force` (Electron main reported that
   * its own re-attach failed).
   */
  | { readonly kind: 'connected'; readonly force: boolean };

export interface SessionEventStep {
  readonly state: SessionEventState;
  /** A `machines:session.replay` the store should send now, or `null`. */
  readonly replay: SessionReplayRequest | null;
}

export function initialSessionEventState(sessionId: string): SessionEventState {
  return {
    sessionId,
    mode: 'attaching',
    epoch: null,
    last: 0,
    target: 0,
    held: [],
    events: EMPTY_TRANSCRIPT_EVENTS,
    turnId: null,
    pendingPermissions: [],
    timedOutPermissions: [],
    drivenBy: null,
    recovery: 'none',
  };
}

/** Whether every event known to exist has been applied. */
export function isCaughtUp(state: SessionEventState): boolean {
  return state.last >= state.target && state.held.length === 0;
}

export function reduceSessionEvent(
  state: SessionEventState,
  action: SessionEventAction,
): SessionEventStep {
  switch (action.kind) {
    case 'attach-started':
      // Keep what is shown (a cached view) until the attach answers.
      return none({ ...state, mode: 'attaching', recovery: 'none' });
    case 'attach-succeeded':
      return none(attachSucceeded(state, action.result));
    case 'attach-failed':
      return none({ ...state, mode: 'detached', held: [], recovery: 'none' });
    case 'replay-failed':
      return none(
        state.recovery === 'requested' ? { ...state, recovery: 'none' } : state,
      );
    case 'connected':
      if (state.mode !== 'log') return none(state);
      if (!action.force && isCaughtUp(state)) return none(state);
      return requestReplay(state);
    case 'event':
      return onEvent(state, action.event);
  }
}

function none(state: SessionEventState): SessionEventStep {
  return { state, replay: null };
}

function requestReplay(state: SessionEventState): SessionEventStep {
  return {
    state: { ...state, recovery: 'requested' },
    replay: { afterSeq: state.last },
  };
}

/** The state of a log that starts over (a new epoch, or a truncated log). */
function restartLog(
  state: SessionEventState,
  epoch: string,
  last: number,
): SessionEventState {
  return {
    ...state,
    mode: 'log',
    epoch,
    last,
    target: last,
    held: state.held.filter((held) => held.epoch === epoch),
    events: EMPTY_TRANSCRIPT_EVENTS,
    turnId: null,
    pendingPermissions: [],
    timedOutPermissions: [],
    drivenBy: null,
  };
}

function attachSucceeded(
  state: SessionEventState,
  result: MachinesSessionAttachResult,
): SessionEventState {
  if (result.mode === 'snapshot') {
    return {
      ...state,
      mode: 'snapshot',
      epoch: null,
      last: 0,
      target: 0,
      held: [],
      events: toTranscriptEvents(result.events),
      turnId: null,
      pendingPermissions: [],
      timedOutPermissions: [],
      drivenBy: result.drivenBy ?? null,
      recovery: 'none',
    };
  }

  const firstSeq = Math.max(1, result.fromSeq);
  const continues =
    state.epoch === result.epoch &&
    (state.mode === 'log' || state.mode === 'attaching') &&
    firstSeq <= state.last + 1;
  const base: SessionEventState = continues
    ? { ...state, mode: 'log', drivenBy: null }
    : restartLog(state, result.epoch, firstSeq - 1);
  const drained = drainHeld({
    ...base,
    target: Math.max(base.target, result.headSeq, base.last),
  });
  return { ...drained, recovery: isCaughtUp(drained) ? 'none' : 'streaming' };
}

function onEvent(
  state: SessionEventState,
  event: MachinesEventPayload,
): SessionEventStep {
  if (event.sessionId !== state.sessionId) return none(state);
  if (state.mode === 'snapshot' || state.mode === 'detached') {
    return none(state);
  }
  if (state.mode === 'attaching') {
    // The cursor is unknown until the attach answers; keep the event for it.
    return none({ ...state, held: insertHeld(state.held, event) });
  }

  let current =
    state.epoch === event.epoch ? state : restartLog(state, event.epoch, 0);
  current = { ...current, target: Math.max(current.target, event.seq) };

  if (event.seq <= current.last) return none(current);

  if (event.seq === current.last + 1 || event.type === 'worker:baseline') {
    const applied = drainHeld(applyEvent(current, event));
    return none(
      applied.recovery !== 'none' && isCaughtUp(applied)
        ? { ...applied, recovery: 'none' }
        : applied,
    );
  }

  const held = { ...current, held: insertHeld(current.held, event) };
  return held.recovery === 'none' ? requestReplay(held) : none(held);
}

function insertHeld(
  held: readonly MachinesEventPayload[],
  event: MachinesEventPayload,
): readonly MachinesEventPayload[] {
  if (held.length >= MAX_HELD_EVENTS) return held;
  let index = held.length;
  while (index > 0 && compareHeld(held[index - 1], event) > 0) index -= 1;
  const previous = index > 0 ? held[index - 1] : undefined;
  if (
    previous !== undefined &&
    previous.epoch === event.epoch &&
    previous.seq === event.seq
  ) {
    return held;
  }
  return [...held.slice(0, index), event, ...held.slice(index)];
}

function compareHeld(a: MachinesEventPayload, b: MachinesEventPayload): number {
  if (a.epoch !== b.epoch) return a.epoch < b.epoch ? -1 : 1;
  return a.seq - b.seq;
}

/** Apply held events of the current epoch that are now contiguous. */
function drainHeld(state: SessionEventState): SessionEventState {
  if (state.held.length === 0) return state;
  let current: SessionEventState = {
    ...state,
    held: state.held.filter((held) => held.epoch === state.epoch),
  };
  let index = 0;
  while (index < current.held.length) {
    const next = current.held[index];
    if (next.seq <= current.last) {
      index += 1;
      continue;
    }
    if (next.seq === current.last + 1 || next.type === 'worker:baseline') {
      current = applyEvent(current, next);
      index += 1;
      continue;
    }
    break;
  }
  return { ...current, held: current.held.slice(index) };
}

function applyEvent(
  state: SessionEventState,
  event: MachinesEventPayload,
): SessionEventState {
  const advanced: SessionEventState = { ...state, last: event.seq };
  const payload = asRecord(event.payload);
  switch (event.type) {
    case 'worker:baseline': {
      const events = payload?.['events'];
      if (!Array.isArray(events)) return advanced;
      const parsed = events.map(parseFlatStreamEvent);
      if (parsed.some((parsedEvent) => parsedEvent === null)) return advanced;
      return {
        ...advanced,
        events: toTranscriptEvents(
          parsed.filter((parsedEvent) => parsedEvent !== null),
        ),
        pendingPermissions: [],
        timedOutPermissions: [],
      };
    }
    case 'worker:turn.begin': {
      const turnId = payload?.['turnId'];
      return typeof turnId === 'string'
        ? { ...advanced, turnId, timedOutPermissions: [] }
        : advanced;
    }
    case 'worker:turn.end':
    case 'worker:turn.interrupted':
      return { ...advanced, turnId: null };
    case 'worker:permission.answered': {
      const requestId = payload?.['requestId'];
      if (typeof requestId !== 'string') return advanced;
      const answered = advanced.pendingPermissions.find(
        (request) => request.id === requestId,
      );
      const timedOut =
        answered !== undefined &&
        payload?.['by'] === REMOTE_PERMISSION_TIMEOUT_BY;
      return {
        ...advanced,
        pendingPermissions: advanced.pendingPermissions.filter(
          (request) => request.id !== requestId,
        ),
        ...(timedOut
          ? {
              timedOutPermissions: [
                ...advanced.timedOutPermissions,
                answered,
              ].slice(-MAX_TIMED_OUT_PERMISSIONS),
            }
          : {}),
      };
    }
    case 'permission:request': {
      const request = parsePermissionRequest(payload);
      if (
        request === null ||
        advanced.pendingPermissions.some((pending) => pending.id === request.id)
      ) {
        return advanced;
      }
      return {
        ...advanced,
        pendingPermissions: [...advanced.pendingPermissions, request],
      };
    }
    case 'chat:chunk': {
      const flat = parseFlatStreamEvent(payload?.['event']);
      if (flat === null) return advanced;
      return {
        ...advanced,
        events: appendTranscriptEvent(advanced.events, flat),
      };
    }
    default:
      // Logged types without a transcript effect still advance the cursor.
      return advanced;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePermissionRequest(
  payload: Record<string, unknown> | null,
): PermissionRequest | null {
  if (payload === null) return null;
  if (
    typeof payload['id'] !== 'string' ||
    typeof payload['toolName'] !== 'string' ||
    asRecord(payload['toolInput']) === null
  ) {
    return null;
  }
  return payload as unknown as PermissionRequest;
}
