import { formatDuration, splitDuration, toIsoDuration } from './format-duration';

describe('formatDuration', () => {
  it.each([
    [5_000, '0:05'],
    [754_000, '12:34'],
    [3_723_000, '1:02:03'],
    [90_000_000, '25:00:00'],
    [999, '0:00'],
  ])('clock %d -> %s', (ms, text) => {
    expect(formatDuration(ms, 'clock')).toBe(text);
  });

  it.each([
    [0, '0s'],
    [45_000, '45s'],
    [303_000, '5m 3s'],
    [60_000, '1m'],
    [3_720_000, '1h 2m'],
    [3_600_000, '1h'],
    [183_600_000, '2d 3h'],
    [172_800_000, '2d'],
  ])('compact %d -> %s', (ms, text) => {
    expect(formatDuration(ms, 'compact')).toBe(text);
  });

  it('uses compact by default', () => {
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('shows a negative value as zero and NaN as --', () => {
    expect(formatDuration(-5_000, 'clock')).toBe('0:00');
    expect(formatDuration(-5_000)).toBe('0s');
    expect(formatDuration(Number.NaN)).toBe('--');
  });

  it('shows Infinity and -Infinity as --', () => {
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('--');
    expect(formatDuration(Number.NEGATIVE_INFINITY, 'clock')).toBe('--');
  });

  it('gives an ISO duration for a datetime attribute', () => {
    expect(toIsoDuration(75_400)).toBe('PT75S');
    expect(toIsoDuration(-1)).toBe('PT0S');
    expect(toIsoDuration(Number.NaN)).toBeNull();
    expect(toIsoDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toIsoDuration(Number.NEGATIVE_INFINITY)).toBeNull();
  });
});

describe('splitDuration', () => {
  it('splits into whole days, hours, minutes and seconds', () => {
    expect(splitDuration(93_784_900)).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4 });
  });

  it('gives zeros for a negative value and null for NaN', () => {
    expect(splitDuration(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(splitDuration(Number.NaN)).toBeNull();
    expect(splitDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(splitDuration(Number.NEGATIVE_INFINITY)).toBeNull();
  });
});
