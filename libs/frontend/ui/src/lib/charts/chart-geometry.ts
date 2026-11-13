import { NEAR_LIMIT_PERCENT } from '@ptah-extension/shared';
import { PtahChartTone, PtahMeterTone } from './chart.types';

/** A resolved ink. `gold` is the brand ink of the `auto` tone below the near limit. */
export type PtahChartInk = PtahChartTone | 'gold';

/** Fill classes. The `auto` inks keep the classes of the original meter. */
export const CHART_BG: Readonly<Record<PtahChartInk, string>> = {
  gold: 'bg-[var(--ptah-gold)]',
  neutral: 'bg-[var(--ptah-badge-neutral-ink)]',
  accent: 'bg-[var(--ptah-badge-accent-ink)]',
  info: 'bg-state-run',
  ok: 'bg-state-done',
  warn: 'bg-state-need',
  err: 'bg-state-err',
};

/** Text classes, for SVG marks that paint with `currentColor`. */
export const CHART_TEXT: Readonly<Record<PtahChartInk, string>> = {
  gold: 'text-[var(--ptah-gold)]',
  neutral: 'text-[var(--ptah-badge-neutral-ink)]',
  accent: 'text-[var(--ptah-badge-accent-ink)]',
  info: 'text-state-run',
  ok: 'text-state-done',
  warn: 'text-state-need',
  err: 'text-state-err',
};

/** A value and a max that a meter or a ring can show. */
export function isValidRange(value: number, max: number): boolean {
  return Number.isFinite(value) && Number.isFinite(max) && max > 0;
}

/** Percent of the max, clamped to [0, Number.MAX_VALUE], not to 100. */
export function percentOf(value: number, max: number): number {
  if (!isValidRange(value, max)) return 0;
  return Math.min((Math.max(0, value) / max) * 100, Number.MAX_VALUE);
}

/** The ink of a tone. `auto` follows the near-limit rule of the original meter. */
export function resolveInk(tone: PtahMeterTone, percent: number): PtahChartInk {
  if (tone !== 'auto') return tone;
  if (percent >= 100) return 'err';
  return percent >= NEAR_LIMIT_PERCENT ? 'warn' : 'gold';
}

/**
 * SVG polyline points for a series, in a `width` x `height` box with `pad`
 * units of space at the top and the bottom. Fewer than 2 values give ''.
 * A flat series draws a line at mid height.
 */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  pad: number,
): string {
  if (values.length < 2) return '';
  const [min, max] = extent(values);
  const span = max - min;
  const inner = height - 2 * pad;
  // `max - min` overflows to Infinity for extreme finite values; halving both
  // ends first keeps every intermediate finite.
  const ratio = Number.isFinite(span)
    ? (v: number) => (v - min) / span
    : (v: number) => (v / 2 - min / 2) / (max / 2 - min / 2);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = span === 0 ? height / 2 : pad + (1 - ratio(v)) * inner;
      return `${round(x)},${round(y)}`;
    })
    .join(' ');
}

/** Min and max in one pass. No spread, so long series do not overflow the call stack. */
function extent(values: readonly number[]): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
