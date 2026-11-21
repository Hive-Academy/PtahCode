import {
  PLOT_W,
  SINGLE_DAY_BAR_W,
  barWidth,
  peakDayIndex,
  peakSummary,
  roundedTopPath,
  sanitizeSeriesValue,
} from './stacked-bar-chart.geometry';

describe('stacked bar chart geometry', () => {
  const day = (index: number): string => `D${index}`;
  const usd = (value: number): string => `$${value}`;

  it('names the peak day when every day is priced', () => {
    expect(peakSummary([10, 4], [], day, usd)).toBe('; peak D0: $10');
    expect(peakSummary([10, 4], [false, false], day, usd)).toBe('; peak D0: $10');
    expect(peakSummary([0, 0], [], day, usd)).toBe('');
  });

  it('names the highest known cost when any day is unpriced', () => {
    expect(peakSummary([10, 0], [false, true], day, usd)).toBe(
      '; highest known cost D0: $10',
    );
    expect(peakSummary([2, 5], [false, true], day, usd)).toBe(
      '; highest known cost D1: at least $5',
    );
  });

  it('keeps a single day at the fixed centered width', () => {
    expect(barWidth(1)).toBe(SINGLE_DAY_BAR_W);
  });

  it('uses 64% of the day slot within the 2..28 clamp', () => {
    expect(barWidth(30)).toBeCloseTo((PLOT_W / 30) * 0.64);
    expect(barWidth(7)).toBe(28);
    expect(barWidth(1000)).toBe(2);
  });

  it('rounds only the top corners of a segment', () => {
    expect(roundedTopPath(10, 20, 12, 40)).toBe(
      'M10,60V23Q10,20 13,20H19Q22,20 22,23V60Z',
    );
  });

  it('caps the radius at half the width and the full height', () => {
    expect(roundedTopPath(0, 0, 2, 10)).toBe('M0,10V1Q0,0 1,0H1Q2,0 2,1V10Z');
    expect(roundedTopPath(0, 0, 10, 1)).toBe('M0,1V1Q0,0 1,0H9Q10,0 10,1V1Z');
  });

  it('finds the peak day and ignores an all-zero range', () => {
    expect(peakDayIndex([1, 5, 3, 5])).toBe(1);
    expect(peakDayIndex([0, 0])).toBeNull();
    expect(peakDayIndex([])).toBeNull();
  });

  it('falls back to the single-day width for zero or invalid day counts', () => {
    expect(barWidth(0)).toBe(SINGLE_DAY_BAR_W);
    expect(barWidth(Number.NaN)).toBe(SINGLE_DAY_BAR_W);
  });

  it('draws a flat, valid path for a zero, negative or NaN segment', () => {
    expect(roundedTopPath(5, 50, 10, 0)).toBe('M5,50V50Q5,50 5,50H15Q15,50 15,50V50Z');
    expect(roundedTopPath(5, 50, 10, -4)).toBe(roundedTopPath(5, 50, 10, 0));
    expect(roundedTopPath(5, 50, Number.NaN, 8)).not.toContain('NaN');
  });

  it('finds a peak on a single day and a range with one non-zero day', () => {
    expect(peakDayIndex([7])).toBe(0);
    expect(peakDayIndex([0, 0, 2, 0])).toBe(2);
  });

  it('drops negative, NaN and infinite series values to zero', () => {
    expect(sanitizeSeriesValue(-1)).toBe(0);
    expect(sanitizeSeriesValue(Number.NaN)).toBe(0);
    expect(sanitizeSeriesValue(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizeSeriesValue(4)).toBe(4);
  });
});
