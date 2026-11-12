/** Epoch ms, a Date, or an ISO string. */
export type PtahTimeInput = number | Date | string;

/**
 * Epoch ms of a time input. NaN for an invalid value.
 * Strings use `Date.parse` semantics: a date-time string without `Z` or a
 * numeric offset (for example "2026-01-10T12:00:00") is parsed as LOCAL time,
 * so pass an explicit `Z` or offset for a host-independent instant.
 */
export function toEpochMs(value: PtahTimeInput): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim() !== '') return Date.parse(value);
  return NaN;
}

/** ISO 8601 text of a time input, or null for an invalid value. */
export function toIsoString(value: PtahTimeInput): string | null {
  const ms = toEpochMs(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
