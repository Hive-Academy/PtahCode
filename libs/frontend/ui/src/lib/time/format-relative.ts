import { PtahTimeInput, toEpochMs } from './time-input';

const DAY_MS = 86_400_000;
const UNITS: readonly (readonly [number, string])[] = [
  [360 * DAY_MS, 'y'],
  [30 * DAY_MS, 'mo'],
  [DAY_MS, 'd'],
  [3_600_000, 'h'],
  [60_000, 'm'],
  [1_000, 's'],
];

/**
 * "just now" (|d| < 10 s), "45s ago", "5m ago", "3h ago", "2d ago", "2mo ago",
 * "1y ago", "in 5m". Uses the largest unit, one unit only, floored.
 * A month is 30 days and a year is 12 months (360 days), as in the old
 * dashboard copy. Invalid -> "".
 */
export function formatRelative(at: PtahTimeInput, now: number): string {
  const ms = toEpochMs(at);
  if (!Number.isFinite(ms) || !Number.isFinite(now)) return '';
  const delta = now - ms;
  const abs = Math.abs(delta);
  if (abs < 10_000) return 'just now';
  const [size, unit] =
    UNITS.find(([unitMs]) => abs >= unitMs) ?? UNITS[UNITS.length - 1];
  const text = `${Math.floor(abs / size)}${unit}`;
  return delta > 0 ? `${text} ago` : `in ${text}`;
}

/** Absolute text for a title: new Date(ms).toLocaleString(). Invalid -> "". */
export function formatAbsolute(at: PtahTimeInput): string {
  const ms = toEpochMs(at);
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : '';
}
