import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_TEXT } from './chart-geometry';
import { PtahChartSize, PtahChartTone, PtahStatTrend } from './chart.types';

const GLYPH: Readonly<Record<PtahStatTrend, string>> = { up: '▲', down: '▼', flat: '▬' };
const VALUE_TEXT: Readonly<Record<PtahChartSize, string>> = { xs: 'text-sm', sm: 'text-lg', md: 'text-2xl' };

/**
 * Stat owner (TASK_2026_976_2421). A label, a value as text, and an optional
 * delta. The trend glyph is hidden from assistive tech and a visually hidden
 * word ("up", "down", "flat") carries it, so color is never the only cue.
 * An empty or non-finite value shows `Unavailable`.
 */
@Component({
  selector: 'ptah-stat', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="flex flex-col gap-0.5">
    <span class="text-xs text-base-content-muted">{{ label() }}</span>
    <span class="flex items-baseline gap-2">
      <span class="font-semibold tabular-nums" [class]="valueClass()">{{ display() }}</span>
      @if (delta() || trend()) {
        <span class="inline-flex items-baseline gap-1 text-xs tabular-nums" [class]="toneClass()">
          @if (trend(); as t) { <span aria-hidden="true">{{ glyph(t) }}</span><span class="sr-only">{{ t }}</span> }
          @if (delta()) { <span>{{ delta() }}</span> }
        </span>
      }
    </span>
    @if (hint()) { <span class="text-xs text-base-content-muted">{{ hint() }}</span> }
  </div>`,
})
export class PtahStatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly delta = input<string | undefined>(undefined);
  readonly trend = input<PtahStatTrend | undefined>(undefined);
  readonly tone = input<PtahChartTone>('neutral');
  readonly hint = input<string | undefined>(undefined);
  readonly size = input<PtahChartSize>('sm');

  readonly display = computed(() => {
    const v = this.value();
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'Unavailable';
    return v.trim() ? v : 'Unavailable';
  });
  readonly valueClass = computed(() => VALUE_TEXT[this.size()]);
  readonly toneClass = computed(() => CHART_TEXT[this.tone()]);

  glyph(trend: PtahStatTrend): string {
    return GLYPH[trend];
  }
}
