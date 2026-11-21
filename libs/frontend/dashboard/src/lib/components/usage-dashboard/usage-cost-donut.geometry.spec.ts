import {
  buildCostSlices,
  DONUT_ARC_GAP,
  DONUT_CIRCUMFERENCE,
  DONUT_RADIUS,
  type CostSliceInput,
} from './usage-cost-donut.geometry';

const item = (id: string, costUsd: number | null, unpriced = false): CostSliceInput => ({
  id,
  label: id,
  costUsd,
  color: '#000',
  unpriced: unpriced || costUsd === null,
});

const drawnLength = (dash: string): number => Number(dash.split(' ')[0]);

describe('buildCostSlices', () => {
  it('derives the circumference from the 62-unit radius', () => {
    expect(DONUT_RADIUS).toBe(62);
    expect(DONUT_CIRCUMFERENCE).toBeCloseTo(2 * Math.PI * 62);
  });

  it('returns no slices for no items', () => {
    expect(buildCostSlices([])).toEqual([]);
  });

  it('draws one slice as a full ring without a gap', () => {
    const [slice] = buildCostSlices([item('a', 4)]);
    expect(slice.percent).toBe(1);
    expect(drawnLength(slice.dash)).toBeCloseTo(DONUT_CIRCUMFERENCE);
    expect(slice.offset).toBe(0);
  });

  it('leaves a gap after each arc when there are two or more slices', () => {
    const slices = buildCostSlices([item('small', 1), item('big', 3)]);
    expect(slices.map((s) => s.id)).toEqual(['big', 'small']);
    expect(slices[0].percent).toBeCloseTo(0.75);
    expect(slices[1].percent).toBeCloseTo(0.25);
    expect(drawnLength(slices[0].dash)).toBeCloseTo(0.75 * DONUT_CIRCUMFERENCE - DONUT_ARC_GAP);
    expect(drawnLength(slices[1].dash)).toBeCloseTo(0.25 * DONUT_CIRCUMFERENCE - DONUT_ARC_GAP);
    // Offsets advance by the full share, so drawn arcs plus gaps close the ring.
    expect(slices[1].offset).toBeCloseTo(-0.75 * DONUT_CIRCUMFERENCE);
    const total = slices.reduce((sum, s) => sum + drawnLength(s.dash) + DONUT_ARC_GAP, 0);
    expect(total).toBeCloseTo(DONUT_CIRCUMFERENCE);
  });

  it('never gives a tiny slice a negative length', () => {
    const slices = buildCostSlices([item('big', 1000), item('tiny', 0.0001)]);
    const tiny = slices.find((s) => s.id === 'tiny');
    if (!tiny) throw new Error('tiny slice missing');
    expect(drawnLength(tiny.dash)).toBe(0);
    expect(tiny.dash).toBe(`0 ${DONUT_CIRCUMFERENCE}`);
    expect(tiny.percent).toBeGreaterThan(0);
  });

  it('lists unpriced items without an arc and folds the tail into Other', () => {
    const slices = buildCostSlices([
      item('a', 6), item('b', 5), item('c', 4), item('d', 3), item('e', 2), item('f', 1), item('x', null),
    ]);
    expect(slices.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'other', 'x']);
    expect(slices[5].costUsd).toBe(1);
    const unpriced = slices[6];
    expect(unpriced.percent).toBeNull();
    expect(unpriced.dash).toBe(`0 ${DONUT_CIRCUMFERENCE}`);
    expect(slices.every((s) => !Number.isNaN(drawnLength(s.dash)))).toBe(true);
  });
});
