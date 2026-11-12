import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  PtahChartSize,
  PtahChartTone,
  PtahMeterTone,
  PtahMeterComponent,
  PtahRingComponent,
  PtahSparklineComponent,
  PtahStatComponent,
  PtahStatTrend,
} from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

@Component({
  selector: 'ptah-gallery-charts-family',
  standalone: true,
  imports: [
    GallerySectionComponent,
    PtahMeterComponent,
    PtahRingComponent,
    PtahSparklineComponent,
    PtahStatComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-gallery-section id="family-meter" title="Meter family">
      <p class="text-ptah-hint text-base-content-muted">Values, limits and indeterminate progress.</p>
      <div data-testid="meter-family-reference" class="flex flex-col gap-ptah-group">
        @for (size of sizes; track size) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">{{ size }}</span>
            @for (tone of meterTones; track tone) {
              <ptah-meter [value]="62" [max]="100" [label]="tone + size" [tone]="tone" [size]="size" />
            }
          </div>
        }
        @for (sample of meterStates; track sample.label) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">{{ sample.label }}</span>
            <ptah-meter [value]="sample.value" [max]="sample.max" [label]="sample.label"
              [indeterminate]="sample.indeterminate" />
          </div>
        }
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="family-ring" title="Ring family">
      <p class="text-ptah-hint text-base-content-muted">The arc clamps at the limit while text keeps the actual value.</p>
      <div data-testid="ring-family-reference" class="flex flex-col gap-ptah-group">
        @for (size of sizes; track size) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">{{ size }}</span>
            @for (tone of meterTones; track tone) {
              <ptah-ring [value]="62" [max]="100" [label]="tone + size" [tone]="tone" [size]="size" />
            }
          </div>
        }
        @for (sample of ringStates; track sample.label) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">{{ sample.label }}</span>
            <ptah-ring [value]="sample.value" [max]="sample.max" [label]="sample.label" />
          </div>
        }
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="family-sparkline" title="Sparkline family">
      <p class="text-ptah-hint text-base-content-muted">Direction and area are visible at each supported size.</p>
      <div data-testid="sparkline-family-reference" class="flex flex-col gap-ptah-group">
        @for (size of sizes; track size) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">{{ size }}</span>
            @for (tone of chartTones; track tone) {
              <ptah-sparkline [values]="rising" label="Rising trend" [tone]="tone" [size]="size" />
            }
          </div>
        }
        @for (sample of sparklineStates; track sample.label) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">{{ sample.label }}</span>
            <ptah-sparkline [values]="sample.values" [label]="sample.label" [area]="sample.area" />
          </div>
        }
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="family-stat" title="Stat family">
      <p class="text-ptah-hint text-base-content-muted">Delta text and trend words carry the meaning.</p>
      <div data-testid="stat-family-reference" class="flex flex-col gap-ptah-group">
        @for (size of sizes; track size) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">{{ size }}</span>
            @for (tone of chartTones; track tone) {
              <ptah-stat label="Requests" value="1,248" delta="+12%" trend="up" [tone]="tone" [size]="size" />
            }
          </div>
        }
        @for (sample of statStates; track sample.label) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">{{ sample.label }}</span>
            <ptah-stat [label]="sample.label" [value]="sample.value" [delta]="sample.delta"
              [trend]="sample.trend" [hint]="sample.hint" />
          </div>
        }
      </div>
    </ptah-gallery-section>
  `,
})
export class GalleryChartsFamilyComponent {
  public readonly sizes: readonly PtahChartSize[] = ['xs', 'sm', 'md'];
  public readonly chartTones: readonly PtahChartTone[] = ['neutral', 'accent', 'info', 'ok', 'warn', 'err'];
  public readonly meterTones: readonly PtahMeterTone[] = ['auto', ...this.chartTones];

  public readonly meterStates = [
    { label: 'normal', value: 62, max: 100, indeterminate: false },
    { label: 'below limit', value: 89, max: 100, indeterminate: false },
    { label: 'near limit', value: 90, max: 100, indeterminate: false },
    { label: 'almost full', value: 99, max: 100, indeterminate: false },
    { label: 'at limit', value: 100, max: 100, indeterminate: false },
    { label: 'over max', value: 125, max: 100, indeterminate: false },
    { label: 'zero', value: 0, max: 100, indeterminate: false },
    { label: 'invalid value', value: NaN, max: 100, indeterminate: false },
    { label: 'invalid max', value: 20, max: 0, indeterminate: false },
    { label: 'indeterminate', value: 0, max: 100, indeterminate: true },
  ] as const;
  public readonly ringStates = [
    { label: 'normal', value: 62, max: 100 },
    { label: 'near limit', value: 88, max: 100 },
    { label: 'over max', value: 125, max: 100 },
    { label: 'zero', value: 0, max: 100 },
    { label: 'invalid value', value: NaN, max: 100 },
    { label: 'invalid max', value: 20, max: 0 },
  ] as const;
  public readonly rising: readonly number[] = [2, 4, 3, 6, 7, 9];
  public readonly sparklineStates: readonly { label: string; values: readonly number[]; area: boolean }[] = [
    { label: 'rising / line', values: this.rising, area: false },
    { label: 'falling / line', values: [9, 7, 8, 5, 3, 2], area: false },
    { label: 'flat / line', values: [4, 4, 4, 4], area: false },
    { label: 'rising / area', values: this.rising, area: true },
    { label: 'no trend data', values: [4], area: false },
  ];
  public readonly statStates: readonly {
    label: string; value: string | number; delta?: string; trend?: PtahStatTrend; hint?: string;
  }[] = [
    { label: 'up', value: 1248, delta: '+12%', trend: 'up' },
    { label: 'down', value: 86, delta: '-8%', trend: 'down' },
    { label: 'flat', value: 42, delta: '0%', trend: 'flat' },
    { label: 'no delta', value: 21 },
    { label: 'with hint', value: 95, delta: '+5%', trend: 'up', hint: 'Compared with last week' },
  ];
}
