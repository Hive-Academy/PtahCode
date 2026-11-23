/**
 * First-turn detection for a child session (TASK_2026_932 E).
 *
 * The host can open a stream before the first turn shows any progress.
 * A probe can settle when there is no evidence of a live attempt. A typed
 * provider end owns recovery when it is available.
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
