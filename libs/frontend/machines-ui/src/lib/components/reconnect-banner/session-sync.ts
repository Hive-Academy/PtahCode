import type { RemoteSessionView } from '../../services/machines-store';
import { isCaughtUp } from '../../services/session-event-reducer';

/**
 * Where an open remote session is in following its log (design 4.8):
 *
 * - `fetching` — a gap was found (events are held) and a replay is out:
 *   "Fetching missing events". Nothing past the gap renders meanwhile.
 * - `catching-up` — an attach or replay is outstanding without a known gap.
 * - `caught-up` — every known event applied.
 * - `null` — nothing to say (a snapshot, a failed attach, no view).
 */
export type SessionSyncState = 'fetching' | 'catching-up' | 'caught-up';

export const SESSION_SYNC_LABELS: Readonly<Record<SessionSyncState, string>> = {
  fetching: 'Fetching missing events',
  'catching-up': 'Catching up...',
  'caught-up': 'Caught up',
};

export function sessionSyncState(
  view: RemoteSessionView | null,
): SessionSyncState | null {
  if (view === null) return null;
  if (view.mode === 'attaching') return 'catching-up';
  if (view.mode !== 'log') return null;
  if (view.held.length > 0) return 'fetching';
  if (view.catchingUp) return 'catching-up';
  return 'caught-up';
}

/** Events applied since the link came back (design 4.8 banner). */
export interface ReplaySummary {
  /** `last` when the machine reconnected. */
  readonly fromSeq: number;
  /** `last` now. */
  readonly toSeq: number;
  /** No gap is open and nothing is held: the replay finished in order. */
  readonly complete: boolean;
}

export function replaySummary(
  fromSeq: number,
  view: RemoteSessionView,
): ReplaySummary {
  return {
    fromSeq,
    toSeq: Math.max(fromSeq, view.last),
    complete: isCaughtUp(view) && !view.catchingUp,
  };
}
