import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_TEXT, sparklinePoints } from './chart-geometry';
import { PtahChartSize, PtahChartTone } from './chart.types';

const W = 100;
const H = 24;
const PAD = 2;
const BOX: Readonly<Record<PtahChartSize, string>> = { xs: 'h-4 w-16', sm: 'h-6 w-24', md: 'h-10 w-40' };

/**
 * Sparkline owner (TASK_2026_976_2421). A trend line without axes. The SVG is
 * an image whose accessible name states the first and the last value and the
 * number of points. Values that are not finite are dropped. Fewer than two
 * points show the text "No trend data".
 */
@Component({
  selector: 'ptah-sparkline', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (points()) {
    <svg class="block overflow-visible" [class]="svgClass()" [attr.viewBox]="viewBox" preserveAspectRatio="none" role="img" [attr.aria-label]="description()" focusable="false">
      @if (area()) { <polygon class="opacity-20" [attr.points]="areaPoints()" fill="currentColor" stroke="none" /> }
      <polyline [attr.points]="points()" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </svg>
  } @else { <span class="text-xs text-base-content-muted" role="img" [attr.aria-label]="label() + ': no trend data'">No trend data</span> }`,
})
export class PtahSparklineComponent {
  readonly values = input.required<readonly number[]>();
  readonly label = input.required<string>();
  readonly tone = input<PtahChartTone>('accent');
  readonly area = input(false);
  readonly size = input<PtahChartSize>('sm');
  readonly valueFormat = input<((n: number) => string) | undefined>(undefined);

  readonly viewBox = `0 0 ${W} ${H}`;
  readonly series = computed(() => this.values().filter((v) => Number.isFinite(v)));
  readonly points = computed(() => sparklinePoints(this.series(), W, H, PAD));
  readonly areaPoints = computed(() => `0,${H} ${this.points()} ${W},${H}`);
  readonly svgClass = computed(() => `${BOX[this.size()]} ${CHART_TEXT[this.tone()]}`);
  readonly description = computed(() => {
    const s = this.series();
    const fmt = this.valueFormat() ?? String;
    return `${this.label()}: trend from ${fmt(s[0])} to ${fmt(s[s.length - 1])}, ${s.length} points`;
  });
}
