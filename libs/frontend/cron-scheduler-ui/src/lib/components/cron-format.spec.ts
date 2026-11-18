import { formatExactTime, formatTime } from './cron-format';

describe('cron-format time', () => {
  const NOW = new Date(2026, 10, 18, 18, 47, 12).getTime();

  it('renders the current year without a year or seconds', () => {
    const expected = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(NOW);
    expect(formatTime(NOW)).toBe(expected);
    expect(formatTime(NOW)).not.toMatch(/:\d{2}:\d{2}/);
  });

  it('adds the year for another year', () => {
    const old = new Date(2020, 0, 5, 9, 3, 7).getTime();
    expect(formatTime(old)).toContain('2020');
  });

  it('uses a dash for an unknown time', () => {
    expect(formatTime(null)).toBe('—');
  });

  it('formatExactTime keeps seconds and is empty for null', () => {
    expect(formatExactTime(NOW)).toBe(new Date(NOW).toLocaleString());
    expect(formatExactTime(null)).toBe('');
    expect(formatExactTime(undefined)).toBe('');
  });
});
