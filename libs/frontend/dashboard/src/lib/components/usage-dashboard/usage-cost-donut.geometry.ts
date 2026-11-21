/** Pure cost-share geometry. Unknown cost never contributes to an arc. */
export interface CostSliceInput {
  readonly id: string;
  readonly label: string;
  readonly costUsd: number | null;
  readonly color: string;
  readonly unpriced: boolean;
}

export interface CostSlice extends CostSliceInput {
  readonly percent: number | null;
  readonly dash: string;
  readonly offset: number;
}

/** Ring radius in the 140-unit viewBox (stroke 16 keeps it inside). */
export const DONUT_RADIUS = 62;
export const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
/** Surface gap between neighbouring arcs, in viewBox units. */
export const DONUT_ARC_GAP = 2;

export function buildCostSlices(items: readonly CostSliceInput[], maxSlices = 5): readonly CostSlice[] {
  const priced = items
    .filter((item) => item.costUsd !== null && Number.isFinite(item.costUsd) && item.costUsd > 0)
    .sort((a, b) => b.costUsd! - a.costUsd!);
  const total = priced.reduce((sum, item) => sum + item.costUsd!, 0);
  const visible: CostSliceInput[] = priced.slice(0, maxSlices);
  if (priced.length > maxSlices) {
    visible.push({
      id: 'other', label: 'Other', color: 'currentColor', unpriced: false,
      costUsd: priced.slice(maxSlices).reduce((sum, item) => sum + item.costUsd!, 0),
    });
  }
  // A single arc is a full ring; two or more leave a gap after each arc.
  const gap = visible.length >= 2 ? DONUT_ARC_GAP : 0;
  // A partly priced item keeps its known arc and is also labeled as partial.
  // Entirely unpriced items appear in the legend without an arc.
  const unpriced = items.filter((item) => item.costUsd === null);
  let offset = 0;
  const slices = visible.map((item): CostSlice => {
    const fraction = total > 0 ? item.costUsd! / total : 0;
    const length = fraction * DONUT_CIRCUMFERENCE;
    const drawn = Math.max(0, length - gap);
    const slice = { ...item, percent: fraction, dash: `${drawn} ${DONUT_CIRCUMFERENCE - drawn}`, offset };
    offset -= length;
    return slice;
  });
  return [...slices, ...unpriced.map((item): CostSlice => ({ ...item, percent: null, dash: `0 ${DONUT_CIRCUMFERENCE}`, offset: 0 }))];
}
