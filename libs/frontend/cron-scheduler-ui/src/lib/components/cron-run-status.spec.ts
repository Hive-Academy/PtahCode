import type { JobRunStatusDto } from '@ptah-extension/shared';

import { formatRunDuration, runStatusView } from './cron-run-status';

describe('runStatusView', () => {
  it.each<[JobRunStatusDto, string, string]>([
    ['pending', 'pending', 'Pending'],
    ['running', 'running', 'Running'],
    ['succeeded', 'completed', 'Succeeded'],
    ['failed', 'failed', 'Failed'],
    ['skipped', 'warning', 'Skipped'],
  ])('maps %s to %s / %s', (status, expectedStatus, expectedLabel) => {
    expect(runStatusView(status)).toEqual({
      status: expectedStatus,
      label: expectedLabel,
    });
  });
});

describe('formatRunDuration', () => {
  const start = 1_700_000_000_000;

  it('returns an empty string while the run has not started or not ended', () => {
    expect(formatRunDuration(null, null)).toBe('');
    expect(formatRunDuration(start, null)).toBe('');
    expect(formatRunDuration(null, start)).toBe('');
  });

  it('returns an empty string when the end is before the start', () => {
    expect(formatRunDuration(start, start - 1)).toBe('');
  });

  it.each<[number, string]>([
    [0, '<1s'],
    [999, '<1s'],
    [1_000, '1s'],
    [59_999, '59s'],
    [60_000, '1m 00s'],
    [185_000, '3m 05s'],
    [3_599_000, '59m 59s'],
    [3_600_000, '1h 00m'],
    [3_725_000, '1h 02m'],
  ])('formats %d ms as %s', (elapsedMs, expected) => {
    expect(formatRunDuration(start, start + elapsedMs)).toBe(expected);
  });
});
