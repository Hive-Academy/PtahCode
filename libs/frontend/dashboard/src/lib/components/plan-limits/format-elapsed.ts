import { formatRelative } from '@ptah-extension/shared';

const JUST_NOW_MS = 60_000;

/**
 * Relative age of a past instant ("observed 4m ago", "Updated just now").
 * The shared `formatRelative` renders anything under a minute, and any
 * instant slightly ahead of a stale `now` tick, as "in 0m". An observation
 * is never in the future, so ages under a minute (or ahead of `now`) read
 * "just now".
 */
export function formatElapsed(instant: number, now: number): string {
  if (
    Number.isFinite(instant) &&
    Number.isFinite(now) &&
    now - instant < JUST_NOW_MS
  ) {
    return 'just now';
  }
  return formatRelative(instant, now);
}
