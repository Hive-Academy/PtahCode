import { NEAR_LIMIT_PERCENT } from '@ptah-extension/shared';
import { isValidRange, percentOf, resolveInk, sparklinePoints } from './chart-geometry';

describe('chart geometry', () => {
  it('accepts only finite values with a positive max', () => {
    expect(isValidRange(5, 10)).toBe(true);
    expect(isValidRange(5, 0)).toBe(false);
    expect(isValidRange(Number.NaN, 10)).toBe(false);
    expect(isValidRange(5, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('clamps negative values and keeps values over the max', () => {
    expect(percentOf(-5, 100)).toBe(0);
    expect(percentOf(150, 100)).toBe(150);
    expect(percentOf(5, 0)).toBe(0);
  });

  it('keeps the percent finite when finite inputs overflow division or scaling', () => {
    expect(percentOf(1e308, 1e-320)).toBe(Number.MAX_VALUE);
    expect(percentOf(Number.MAX_VALUE, 1)).toBe(Number.MAX_VALUE);
  });

  it('returns zero for invalid or negative ranges', () => {
    expect(percentOf(Number.POSITIVE_INFINITY, 10)).toBe(0);
    expect(percentOf(Number.NaN, 10)).toBe(0);
    expect(percentOf(5, Number.POSITIVE_INFINITY)).toBe(0);
    expect(percentOf(5, Number.NaN)).toBe(0);
    expect(percentOf(-5, 1e-320)).toBe(0);
    expect(percentOf(5, 0)).toBe(0);
  });

  it('resolves the auto tone with the near-limit rule', () => {
    expect(resolveInk('auto', NEAR_LIMIT_PERCENT - 1)).toBe('gold');
    expect(resolveInk('auto', NEAR_LIMIT_PERCENT)).toBe('warn');
    expect(resolveInk('auto', 100)).toBe('err');
    expect(resolveInk('info', 100)).toBe('info');
  });

  it('maps a series into the box', () => {
    expect(sparklinePoints([0, 10], 100, 24, 2)).toBe('0,22 100,2');
    expect(sparklinePoints([3, 3, 3], 100, 24, 2)).toBe('0,12 50,12 100,12');
    expect(sparklinePoints([1], 100, 24, 2)).toBe('');
  });

  it('maps a series of 200000 points without a stack overflow', () => {
    const values = Array.from({ length: 200000 }, (_, i) => i % 1000);
    const points = sparklinePoints(values, 100, 24, 2).split(' ');
    expect(points).toHaveLength(200000);
    expect(points[0]).toBe('0,22');
    expect(points[999]).toBe('0.5,2');
  });

  it.each([
    [[-1e308, 1e308]],
    [[-Number.MAX_VALUE, 0, Number.MAX_VALUE]],
    [[Number.MAX_VALUE, -Number.MAX_VALUE, 1]],
  ])('keeps every coordinate finite for %p', (values) => {
    const coords = sparklinePoints(values, 100, 24, 2).split(/[ ,]/).map(Number);
    expect(coords).toHaveLength(values.length * 2);
    expect(coords.every((n) => Number.isFinite(n))).toBe(true);
    expect(sparklinePoints([-1e308, 1e308], 100, 24, 2)).toBe('0,22 100,2');
  });
});
