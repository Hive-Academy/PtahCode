/** Chart family types (TASK_2026_976_2421, design-system epic 3A.3). */

/** Meaning of a chart mark. `neutral` is metadata; the other tones carry state. */
export type PtahChartTone = 'neutral' | 'accent' | 'info' | 'ok' | 'warn' | 'err';

/** `gold` stays gold; `auto` switches from gold to warn, then err at 100 %. */
export type PtahMeterTone = PtahChartTone | 'gold' | 'primary' | 'auto';

/** A known contribution to the meter subtotal. */
export interface PtahMeterSegment {
  readonly value: number;
  readonly tone: PtahMeterTone;
  readonly label: string;
}

/** ARIA role of a determinate meter bar. */
export type PtahMeterRole = 'meter' | 'progressbar';

/** Footprint of a chart owner. The geometry inside stays internal. */
export type PtahChartSize = 'xs' | 'sm' | 'md';

/** Footprint of a ring. Meter and sparkline keep `PtahChartSize`. */
export type PtahRingSize = PtahChartSize | 'dot' | 'inline' | 'stat' | 'row' | 'tile' | 'lg' | 'xl';

/** Percent cut-offs for the ring's automatic warn and danger inks. */
export interface PtahRingThresholds {
  readonly warn: number;
  readonly danger: number;
}

/** Direction of a stat delta. Each trend has a glyph and a hidden word. */
export type PtahStatTrend = 'up' | 'down' | 'flat';
