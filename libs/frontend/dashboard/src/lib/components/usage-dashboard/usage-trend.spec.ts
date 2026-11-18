import { deltaText } from './usage-kpi-strip.component';
import { dailyTotals, downsample } from './usage-trend';

describe('usage-trend', () => {
  it('sums aligned daily series and ignores invalid values', () => {
    expect(dailyTotals([[1, 2, 3], [4, Number.NaN, -1]])).toEqual([5, 2, 3]);
    expect(dailyTotals([])).toEqual([]);
  });

  it('keeps short series and averages long ones to 12 points', () => {
    expect(downsample([1, 2, 3])).toEqual([1, 2, 3]);
    const long = Array.from({ length: 30 }, (_, i) => i);
    const out = downsample(long);
    expect(out).toHaveLength(12);
    expect(out[0]).toBeLessThan(out[11] ?? 0);
  });
});

describe('deltaText', () => {
  it('hides the line when there is no trustworthy previous period', () => {
    expect(deltaText(null, 30)).toBeNull();
    expect(deltaText(Number.POSITIVE_INFINITY, 30)).toBeNull();
  });

  it('formats signed percent changes against the range', () => {
    expect(deltaText(0.124, 7)).toBe('+12% vs previous 7d');
    expect(deltaText(-0.5, 30)).toBe('−50% vs previous 30d');
  });
});
