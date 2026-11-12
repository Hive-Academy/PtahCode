import { formatRelative } from '@ptah-extension/ui';

/** A clock-driven freshness label from the shared owner. Invalid dates are unknown (null). */
export function relativeTime(timestamp: number | undefined, now: number): string | null {
  if (timestamp === undefined) return null;
  return formatRelative(timestamp, now) || null;
}
