import {
  windowObservedAt,
  type PlanLimitsSnapshot,
} from '@ptah-extension/shared';
import { formatElapsed } from './format-elapsed';

/**
 * Notice for a failed refresh that still has earlier readings. The age is
 * relative ("observed 4m ago"); absolute times belong in card Details.
 */
export function refreshFailedNotice(
  snapshot: PlanLimitsSnapshot,
  now: number,
): string | null {
  if (snapshot.owners.length === 0) return null;
  let newest: number | undefined;
  for (const owner of snapshot.owners) {
    const instants = [
      ...owner.windows.map(windowObservedAt),
      ...owner.ownerEvidence.map((evidence) => evidence.observedAt),
    ];
    for (const instant of instants) {
      if (
        Number.isFinite(instant) &&
        (newest === undefined || instant > newest)
      ) {
        newest = instant;
      }
    }
  }
  return newest === undefined
    ? 'Refresh failed — showing last observed data'
    : `Refresh failed — showing last observed data (observed ${formatElapsed(newest, now)})`;
}
