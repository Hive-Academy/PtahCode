import { formatElapsed } from './format-elapsed';

describe('formatElapsed', () => {
  const now = Date.UTC(2026, 10, 18, 12, 0, 0);

  it('reads "just now" for an age under a minute', () => {
    expect(formatElapsed(now - 20_000, now)).toBe('just now');
  });

  it('never renders a past observation as a future time', () => {
    // The snapshot can be newer than the last `now` tick.
    expect(formatElapsed(now + 25_000, now)).toBe('just now');
    expect(formatElapsed(now + 25_000, now)).not.toContain('in ');
  });

  it('keeps the shared relative format for older ages', () => {
    expect(formatElapsed(now - 4 * 60_000, now)).toBe('4m ago');
    expect(formatElapsed(now - (2 * 60 + 5) * 60_000, now)).toBe('2h 5m ago');
  });

  it('passes invalid instants to the shared formatter', () => {
    expect(formatElapsed(Number.NaN, now)).not.toBe('just now');
  });
});
