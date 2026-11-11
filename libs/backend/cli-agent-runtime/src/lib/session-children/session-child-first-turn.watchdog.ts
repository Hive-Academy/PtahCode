/**
 * First-turn detection for a child session (TASK_2026_932 E).
 *
 * A host start settles when the chat stream exists, not when the first turn
 * runs. A child whose first turn never starts would otherwise sit `idle` with
 * no SDK id, no transcript and no signal to its parent. These pure helpers
 * decide when such a child is a failed start and render the evidence the
 * spawner records on it.
 */
import type { SessionTurnPhase } from '@ptah-extension/shared';

/** How long after a successful start the first turn may take to show itself. */
export const SESSION_CHILD_FIRST_TURN_TIMEOUT_MS = 120_000;

/** Base reason recorded on a child whose first turn did not start. */
export const SESSION_CHILD_FIRST_TURN_FAILURE = 'first turn did not start';

/** What the watchdog and the session-end path know about a child. */
export interface FirstTurnProbe {
  readonly sdkSessionId?: string;
  readonly turnsSettled: number;
  readonly phase?: SessionTurnPhase;
  readonly awaitingPermission: boolean;
  readonly lifecycleRecordPresent: boolean;
}

/** The first turn never showed itself: no SDK id and no settled turn. */
export function firstTurnNotStarted(probe: FirstTurnProbe): boolean {
  return !probe.sdkSessionId && probe.turnsSettled === 0;
}

/** What the watchdog does when it fires. */
export type FirstTurnVerdict = 'started' | 'fail' | 'rearm' | 'give-up';

/**
 * The watchdog's decision. `rearm` only once while the child generates;
 * a child that still generates after the re-arm is left alone (`give-up`),
 * because a running turn is evidence the start worked.
 */
export function firstTurnVerdict(
  probe: FirstTurnProbe,
  alreadyRearmed: boolean,
): FirstTurnVerdict {
  if (!firstTurnNotStarted(probe) || probe.awaitingPermission) return 'started';
  if (probe.phase === 'generating') return alreadyRearmed ? 'give-up' : 'rearm';
  return 'fail';
}

/** Failure text with the evidence: turn phase, lifecycle record, SDK id. */
export function firstTurnFailureText(
  probe: FirstTurnProbe,
  trigger: string,
): string {
  return (
    `${SESSION_CHILD_FIRST_TURN_FAILURE} (${trigger}): ` +
    `turn phase ${probe.phase ?? 'none'}, ` +
    `lifecycle record present: ${probe.lifecycleRecordPresent ? 'yes' : 'no'}, ` +
    'SDK session id absent'
  );
}
