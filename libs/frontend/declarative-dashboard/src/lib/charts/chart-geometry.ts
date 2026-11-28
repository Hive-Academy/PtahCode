import type { DashboardSeries } from '@ptah-extension/shared';

export interface ChartPoint {
  readonly seriesIndex: number;
  readonly pointIndex: number;
  readonly name: string;
  readonly x: string | number;
  readonly y: number;
  readonly px: number;
  readonly py: number;
  readonly barX: number;
  readonly barY: number;
  readonly barWidth: number;
  readonly barHeight: number;
}

/** One y-axis gridline: its value, compact label and SVG y. */
export interface ChartTick {
  readonly value: number;
  readonly label: string;
  readonly y: number;
}

/** One x-axis category: the full label, the label shortened to fit its slot, and the slot centre. */
export interface ChartCategory {
  readonly label: string;
  readonly shortLabel: string;
  readonly x: number;
}

/** SVG user units per label character at the chart's 15-unit label size (about 0.6 em). */
const LABEL_CHAR_WIDTH = 9;
const TICK_COUNT = 4;

/** Compact, locale-stable number text ("1.2K", "-3", "0.5"). */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Shortens a label to `max` characters with a trailing ellipsis. */
function fitLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  return max <= 1 ? '…' : `${label.slice(0, max - 1)}…`;
}

/** Fixed SVG coordinates; attributes only, with no DOM or style dependencies. */
export function chartGeometry(series: readonly DashboardSeries[], kind: 'line-chart' | 'bar-chart') {
  const points = series.flatMap(item => item.points);
  const categories = [...new Set(points.map(point => point.x))];
  const categoryIndex = new Map(categories.map((value, index) => [value, index]));
  const numeric = kind === 'line-chart' && points.every(point => typeof point.x === 'number');
  const xs = points.map(point => typeof point.x === 'number' ? point.x : 0);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = Math.min(0, ...points.map(point => point.y));
  const maxY = Math.max(0, ...points.map(point => point.y));
  // Divide first so finite contract values near Number.MAX_VALUE cannot overflow.
  const ratio = (value: number, min: number, max: number) => {
    const scale = Math.max(Math.abs(min), Math.abs(max), 1);
    return min === max ? 0.5 : (value / scale - min / scale) / (max / scale - min / scale);
  };
  const y = (value: number) => 220 - ratio(value, minY, maxY) * 180;
  const baseline = y(0);
  const slot = 480 / Math.max(categories.length, 1);
  const barWidth = slot * 0.8 / Math.max(series.length, 1);
  const rows: ChartPoint[] = [];
  const geometry = series.map((item, seriesIndex) => {
    const mapped = item.points.map((point, pointIndex): ChartPoint => {
      const category = categoryIndex.get(point.x) ?? 0;
      const px = numeric ? 60 + ratio(Number(point.x), minX, maxX) * 480
        : 60 + (category + 0.5) * slot;
      const py = y(point.y);
      const result = { ...point, name: item.name, seriesIndex, pointIndex, px, py,
        barX: 60 + category * slot + slot * 0.1 + seriesIndex * barWidth,
        barY: Math.min(baseline, py), barWidth, barHeight: Math.abs(py - baseline) };
      rows.push(result);
      return result;
    });
    return { name: item.name, points: mapped,
      polyline: mapped.map(point => `${point.px},${point.py}`).join(' '),
      dash: seriesIndex === 0 ? 'none' : `${seriesIndex * 3 + 2} 3` };
  });
  const ticks: ChartTick[] = minY === maxY
    ? [{ value: minY, label: compactNumber(minY), y: y(minY) }]
    : Array.from({ length: TICK_COUNT }, (_, index) => {
      // Weighted sum, not `minY + (maxY - minY) * t`, so extreme finite bounds cannot overflow.
      const t = index / (TICK_COUNT - 1);
      const raw = minY * (1 - t) + maxY * t;
      // Snap rounding noise to zero so a tick never reads "-0".
      const value = Math.abs(raw) < Math.max(Math.abs(minY), Math.abs(maxY)) * 1e-12 ? 0 : raw;
      return { value, label: compactNumber(value), y: y(value) };
    });
  const maxChars = Math.max(1, Math.floor(slot / LABEL_CHAR_WIDTH));
  const labelledCategories: ChartCategory[] = categories.map((value, index) => ({
    label: String(value), shortLabel: fitLabel(String(value), maxChars), x: 60 + (index + 0.5) * slot,
  }));
  return { series: geometry, rows, baseline, minY, maxY, ticks, categories: labelledCategories,
    firstX: numeric && points.length ? minX : categories[0] ?? '',
    lastX: numeric && points.length ? maxX : categories.at(-1) ?? '' };
}
