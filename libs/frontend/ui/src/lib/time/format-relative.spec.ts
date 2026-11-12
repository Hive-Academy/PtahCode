import { formatAbsolute, formatRelative } from './format-relative';
import { toEpochMs, toIsoString } from './time-input';

const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);

describe('formatRelative', () => {
  it.each([
    [NOW - 9_000, 'just now'],
    [NOW + 9_000, 'just now'],
    [NOW - 45_000, '45s ago'],
    [NOW - 5 * 60_000 - 59_000, '5m ago'],
    [NOW - 3 * 3_600_000, '3h ago'],
    [NOW - 2 * 86_400_000, '2d ago'],
    [NOW + 5 * 60_000, 'in 5m'],
    [NOW + 30_000, 'in 30s'],
  ])('%d -> %s', (at, text) => {
    expect(formatRelative(at, NOW)).toBe(text);
  });

  it('accepts a Date and an ISO string', () => {
    expect(formatRelative(new Date(NOW - 60_000), NOW)).toBe('1m ago');
    expect(formatRelative(new Date(NOW - 7_200_000).toISOString(), NOW)).toBe('2h ago');
  });

  it('returns empty text for an invalid value', () => {
    expect(formatRelative('not a date', NOW)).toBe('');
    expect(formatRelative('', NOW)).toBe('');
    expect(formatRelative(Number.NaN, NOW)).toBe('');
    expect(formatRelative(NOW, Number.NaN)).toBe('');
  });
});

describe('formatAbsolute and time input', () => {
  it('formats with toLocaleString and returns empty text for an invalid value', () => {
    expect(formatAbsolute(NOW)).toBe(new Date(NOW).toLocaleString());
    expect(formatAbsolute('nope')).toBe('');
  });

  it('converts each input kind to epoch ms', () => {
    expect(toEpochMs(NOW)).toBe(NOW);
    expect(toEpochMs(new Date(NOW))).toBe(NOW);
    expect(toEpochMs(new Date(NOW).toISOString())).toBe(NOW);
    expect(toEpochMs(Number.POSITIVE_INFINITY)).toBeNaN();
    expect(toEpochMs('  ')).toBeNaN();
    expect(toIsoString(NOW)).toBe(new Date(NOW).toISOString());
    expect(toIsoString('bad')).toBeNull();
  });

  it('pins an explicit Z string to its UTC epoch value on any host', () => {
    expect(toEpochMs('2026-01-10T12:00:00Z')).toBe(NOW);
    expect(toEpochMs('2026-01-10T14:00:00+02:00')).toBe(NOW);
  });
});
