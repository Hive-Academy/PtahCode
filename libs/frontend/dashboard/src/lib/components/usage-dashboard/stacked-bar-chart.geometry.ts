/** Pure geometry and scale helpers for the daily stacked bar chart. */
interface Gridline { readonly y: number; readonly label: string; }
interface XLabel { readonly x: number; readonly label: string; }
interface DayColumn { readonly index: number; readonly x: number; readonly width: number; readonly day: string; readonly aria: string; }
interface ReadoutItem { readonly id: string; readonly label: string; readonly color: string; readonly valueLabel: string; }
export const VIEW_W = 640;
export const VIEW_H = 240;
export const PAD_L = 48;
const PAD_R = 8;
export const PAD_T = 10;
const PAD_B = 26;
export const PLOT_W = VIEW_W - PAD_L - PAD_R;
export const PLOT_H = VIEW_H - PAD_T - PAD_B;
export const SINGLE_DAY_BAR_W = 48;
const MAX_SERIES_VALUE = 1e15;
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(value)));
  for (const multiple of [1, 2, 5, 10]) {
    if (value <= multiple * base) return multiple * base;
  }
  return 10 * base;
}
export function sanitizeSeriesValue(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.min(value, MAX_SERIES_VALUE) : 0;
}
/** Thin marks: a bar takes about 64% of its day slot, between 2 and 28 view units. */
export function barWidth(dayCount: number): number {
  if (!Number.isFinite(dayCount) || dayCount <= 1) return SINGLE_DAY_BAR_W;
  return Math.max(2, Math.min(28, (PLOT_W / dayCount) * 0.64));
}
const TOP_RADIUS = 3;
/**
 * SVG path of a bar segment whose two top corners are rounded and whose
 * bottom stays square, so a stack reads as one bar anchored to the baseline.
 * The radius never exceeds half the width or the full height.
 */
export function roundedTopPath(x: number, y: number, width: number, height: number): string {
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  const r = Math.min(TOP_RADIUS, w / 2, h);
  const right = x + w;
  const bottom = y + h;
  return (
    `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}` +
    `H${right - r}Q${right},${y} ${right},${y + r}V${bottom}Z`
  );
}
/** Index of the day with the largest total, or null when every day is zero. */
export function peakDayIndex(totals: readonly number[]): number | null {
  let peak: number | null = null;
  totals.forEach((total, i) => {
    if (total > 0 && (peak === null || total > (totals[peak] ?? 0))) peak = i;
  });
  return peak;
}
/**
 * The peak clause of the chart's accessible label, e.g. "; peak Oct 18: $10".
 * When any day in the range has unpriced usage the true peak cannot be
 * established, so it names the highest known cost instead.
 */
export function peakSummary(
  totals: readonly number[],
  unknownDays: readonly boolean[],
  dayLabel: (index: number) => string,
  format: (value: number) => string,
): string {
  const peak = peakDayIndex(totals);
  if (peak === null) return '';
  const anyUnknown = unknownDays.some((flag) => flag === true);
  const lead = anyUnknown ? 'highest known cost' : 'peak';
  const lowerBound = unknownDays[peak] === true ? 'at least ' : '';
  return `; ${lead} ${dayLabel(peak)}: ${lowerBound}${format(totals[peak] ?? 0)}`;
}
export type { DayColumn, Gridline, ReadoutItem, XLabel };
