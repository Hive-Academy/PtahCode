export type DurationStyle = 'clock' | 'compact';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * 'clock': "0:05", "12:34", "1:02:03" (h:mm:ss, m:ss below 1 h).
 * 'compact': "45s", "5m 3s", "1h 2m", "2d 3h" (a zero second unit is left out).
 * Negative -> 0. NaN -> "--". Default 'compact'.
 */
export function formatDuration(ms: number, style: DurationStyle = 'compact'): string {
  if (Number.isNaN(ms)) return '--';
  const total = Math.floor(Math.max(0, ms) / SECOND);
  if (style === 'clock') {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  const value = total * SECOND;
  const pair = (bigMs: number, big: string, smallMs: number, small: string): string => {
    const a = Math.floor(value / bigMs);
    const b = Math.floor((value % bigMs) / smallMs);
    return b > 0 ? `${a}${big} ${b}${small}` : `${a}${big}`;
  };
  if (value >= DAY) return pair(DAY, 'd', HOUR, 'h');
  if (value >= HOUR) return pair(HOUR, 'h', MINUTE, 'm');
  if (value >= MINUTE) return pair(MINUTE, 'm', SECOND, 's');
  return `${total}s`;
}

/** ISO 8601 duration ("PT75S") for a `<time datetime>`. Negative -> PT0S. NaN -> null. */
export function toIsoDuration(ms: number): string | null {
  if (Number.isNaN(ms)) return null;
  return `PT${Math.floor(Math.max(0, ms) / SECOND)}S`;
}
