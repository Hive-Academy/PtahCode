import { chartGeometry } from './chart-geometry';

describe('chartGeometry', () => {
  it('falls back to categorical spacing for mixed numeric and categorical line x values', () => {
    const geometry = chartGeometry([{ name: 'Mixed', points: [{ x: 100, y: 1 }, { x: '100', y: 2 }, { x: 'Tue', y: 3 }] }], 'line-chart');
    expect(geometry.rows.map(point => point.px)).toEqual([140, 300, 460]);
    expect(geometry.firstX).toBe(100);
    expect(geometry.lastX).toBe('Tue');
  });
  it('uses categorical slots for numeric bar x values', () => {
    const geometry = chartGeometry([{ name: 'Numeric', points: [{ x: 0, y: 1 }, { x: 2, y: 2 }, { x: 100, y: 3 }] }], 'bar-chart');
    expect(geometry.rows.map(point => point.px)).toEqual([140, 300, 460]);
    expect(geometry.rows.map(point => point.barX)).toEqual([76, 236, 396]);
    expect(geometry.rows.map(point => point.barWidth)).toEqual([128, 128, 128]);
  });
  it('scales numeric x values proportionally and negative y around zero', () => {
    const geometry = chartGeometry([{ name: 'A', points: [{ x: 0, y: -10 }, { x: 2, y: 0 }, { x: 10, y: 10 }] }], 'line-chart');
    expect(geometry.rows.map(point => point.px)).toEqual([60, 156, 540]);
    expect(geometry.rows.map(point => point.py)).toEqual([220, 130, 40]);
    expect(geometry.baseline).toBe(130);
  });
  it('aligns shared categories and groups bars across series', () => {
    const geometry = chartGeometry([
      { name: 'A', points: [{ x: 'Mon', y: -2 }, { x: 'Tue', y: 4 }] },
      { name: 'B', points: [{ x: 'Tue', y: 2 }] },
    ], 'bar-chart');
    expect(geometry.rows[1].px).toBe(geometry.rows[2].px);
    expect(geometry.rows[2].barX).toBe(geometry.rows[1].barX + geometry.rows[1].barWidth);
    expect(geometry.rows[0].barY).toBe(geometry.baseline);
    expect(geometry.rows.every(point => point.barHeight >= 0)).toBe(true);
    expect(geometry.series[0].dash).not.toBe(geometry.series[1].dash);
  });
  it('handles empty, singleton, all-zero and extreme finite values', () => {
    expect(chartGeometry([], 'line-chart').rows).toEqual([]);
    for (const ys of [[0], [Number.MAX_VALUE, -Number.MAX_VALUE]]) {
      const geometry = chartGeometry([{ name: 'A', points: ys.map(y => ({ x: y, y })) }], 'line-chart');
      expect(geometry.rows.every(point => Number.isFinite(point.px) && Number.isFinite(point.py))).toBe(true);
    }
  });
  it('labels numeric axis bounds even when points arrive out of order', () => {
    const geometry = chartGeometry([{ name: 'A', points: [{ x: 8, y: 1 }, { x: 2, y: 3 }] }], 'line-chart');
    expect(geometry.firstX).toBe(2);
    expect(geometry.lastX).toBe(8);
  });
  it('places evenly spaced compact ticks from the lower to the upper bound', () => {
    const geometry = chartGeometry([{ name: 'A', points: [{ x: 'a', y: -1500 }, { x: 'b', y: 3000 }] }], 'bar-chart');
    const expected = [[-1500, 220], [0, 160], [1500, 100], [3000, 40]];
    expect(geometry.ticks).toHaveLength(4);
    geometry.ticks.forEach((tick, index) => {
      expect(tick.value).toBeCloseTo(expected[index][0]);
      expect(tick.y).toBeCloseTo(expected[index][1]);
    });
    expect(geometry.ticks.map(tick => tick.label)).toEqual(['-1.5K', '0', '1.5K', '3K']);
    expect(geometry.ticks[1].y).toBeCloseTo(geometry.baseline);
  });
  it('uses one tick for a flat range and keeps extreme ticks finite', () => {
    expect(chartGeometry([{ name: 'A', points: [{ x: 'a', y: 0 }] }], 'bar-chart').ticks)
      .toEqual([{ value: 0, label: '0', y: 130 }]);
    const extreme = chartGeometry([{ name: 'A', points: [{ x: 1, y: Number.MAX_VALUE }, { x: 2, y: -Number.MAX_VALUE }] }], 'line-chart');
    expect(extreme.ticks).toHaveLength(4);
    expect(extreme.ticks.every(tick => Number.isFinite(tick.value) && Number.isFinite(tick.y))).toBe(true);
  });
  it('centres one label per category and truncates labels that overflow their slot', () => {
    const long = 'a-very-long-category-name';
    const geometry = chartGeometry([{ name: 'A', points: [{ x: 'Mon', y: 1 }, { x: long, y: 2 }, { x: 'Wed', y: 3 }] }], 'bar-chart');
    expect(geometry.categories.map(category => category.x)).toEqual([140, 300, 460]);
    expect(geometry.categories.map(category => category.label)).toEqual(['Mon', long, 'Wed']);
    // 160-unit slots hold 17 characters at 9 units each.
    expect(geometry.categories[0].shortLabel).toBe('Mon');
    expect(geometry.categories[1].shortLabel).toBe(`${long.slice(0, 16)}…`);
    expect(geometry.categories[1].shortLabel).toHaveLength(17);
  });
  it('keeps every one of 5000 points and its original index', () => {
    const points = Array.from({ length: 5000 }, (_, x) => ({ x, y: x }));
    const geometry = chartGeometry([{ name: 'A', points }], 'line-chart');
    expect(geometry.series[0].polyline.split(' ')).toHaveLength(5000);
    expect(geometry.rows[4999].pointIndex).toBe(4999);
    expect(points[4999]).toEqual({ x: 4999, y: 4999 });
  });
});
