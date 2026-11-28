import type { PtahChartSegment } from './chart.types';

export function segmentGeometry(segments: readonly PtahChartSegment[]) {
  const valid = segments.filter(({ value }) => Number.isFinite(value) && value >= 0);
  const total = valid.reduce((sum, { value }) => sum + value, 0);
  // Scale before summing if the original values exceed the numeric range.
  const scale = Number.isFinite(total)
    ? 1
    : valid.reduce((max, { value }) => Math.max(max, value), 1);
  const scaledTotal = Number.isFinite(total)
    ? total
    : valid.reduce((sum, { value }) => sum + value / scale, 0);

  let cumulative = 0;
  const marks = valid.filter(({ value }) => value > 0).map((segment) => {
    const start = cumulative / scaledTotal * 100;
    cumulative += segment.value / scale;
    return { ...segment, start, length: cumulative / scaledTotal * 100 - start };
  });

  return { total, marks, summary: valid.map(({ label, value }) => `${label}: ${value}`).join(', ') };
}
