import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  PtahChartSize,
  PtahChartTone,
  PtahMeterTone,
  PtahMeterComponent,
  PtahRingComponent,
  PtahSparklineComponent,
  PtahStatCardComponent,
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
    PtahStatCardComponent,
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
        <div class="flex flex-wrap items-center gap-ptah-inline" data-testid="meter-family-variants">
          <ptah-meter [value]="45" [max]="100" label="Hidden label" [hideLabel]="true" />
          <ptah-meter [value]="45" [max]="100" label="Custom text" valueText="45%" />
          <ptah-meter [value]="45" [max]="100" label="Progressbar" barRole="progressbar" valueText="45%" />
          <ptah-meter [value]="0" [max]="0" label="Indeterminate" barRole="progressbar" [indeterminate]="true" />
        </div>
        <div class="flex flex-wrap items-center gap-ptah-inline" data-testid="meter-family-marker-stripes">
          <ptah-meter [value]="45" [max]="100" label="Marker at 80" [marker]="80" />
          <ptah-meter [value]="92" [max]="100" label="Stripes warn" tone="warn" [stripes]="true" [marker]="80" />
          <ptah-meter [value]="100" [max]="100" label="Stripes err" tone="err" [stripes]="true" />
          <ptah-meter [value]="45" [max]="100" label="Neutral stripes" tone="neutral" [stripes]="true" />
        </div>
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
        <div class="flex flex-wrap items-center gap-ptah-inline" data-testid="ring-family-variants">
          <ptah-ring [value]="62" [max]="100" label="Bare" [bare]="true" />
          <ptah-ring [value]="62" [max]="100" label="Center text" centerText="3/5" size="md" />
          <ptah-ring [value]="62" [max]="100" label="Sub text" centerText="62" subText="pts" size="lg" />
          <ptah-ring [value]="0" [max]="0" label="Indeterminate" [indeterminate]="true" valueText="Indexing" size="md" />
          <ptah-ring data-testid="ring-family-pulse" [value]="0" [max]="0" label="Pulse" [indeterminate]="true" [centerOnly]="true" size="stat" />
          <ptah-ring [value]="62" [max]="100" label="Large" size="lg" />
          <ptah-ring [value]="62" [max]="100" label="Extra large" size="xl" />
        </div>
        <div data-testid="ring-new-inputs" class="grid gap-ptah-field sm:grid-cols-2">
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-thresholds">
            <span class="text-ptah-caption text-base-content-muted">thresholds: warn 50%, danger 80%</span>
            <ptah-ring [value]="60" [max]="100" label="Custom warn threshold" [thresholds]="{ warn: 50, danger: 80 }" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-size-stat">
            <span class="text-ptah-caption text-base-content-muted">size: stat (32px)</span>
            <ptah-ring [value]="8" [max]="100" label="Stat size" size="stat" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-size-row">
            <span class="text-ptah-caption text-base-content-muted">size: row (56px)</span>
            <ptah-ring [value]="62" [max]="100" label="Row size" size="row" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-geometry">
            <span class="text-ptah-caption text-base-content-muted">stroke: 7; radius: 12</span>
            <ptah-ring [value]="72" [max]="100" label="Thick, compact arc" size="md" [stroke]="7" [radius]="12" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-colors">
            <span class="text-ptah-caption text-base-content-muted">trackColor: violet; arcColor: cyan</span>
            <ptah-ring [value]="72" [max]="100" label="Custom arc colors" size="md" trackColor="#8b5cf6" arcColor="#06b6d4" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-semantics">
            <span class="text-ptah-caption text-base-content-muted">ariaLabel: Completion image; semanticRole: img</span>
            <ptah-ring [value]="72" [max]="100" label="Completion" size="md" ariaLabel="Completion image" semanticRole="img" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-core-pulse">
            <span class="text-ptah-caption text-base-content-muted">pulseStyle: core; indeterminateRole: img</span>
            <ptah-ring [value]="0" [max]="0" label="Core pulse image" size="md" [indeterminate]="true" pulseStyle="core" indeterminateRole="img" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-center-typography">
            <span class="text-ptah-caption text-base-content-muted">centerTextSize: 20px; centerTextWeight: semibold; centerTextColor: violet; subTextSize: 10px; subTextWeight: medium; subTextColor: cyan; subTextGap: 4px</span>
            <ptah-ring [value]="72" [max]="100" label="Custom center typography" size="lg" centerText="72" subText="pts" centerTextSize="20px" centerTextWeight="semibold" centerTextColor="#8b5cf6" subTextSize="10px" subTextWeight="medium" subTextColor="#06b6d4" subTextGap="4px" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-box-size">
            <span class="text-ptah-caption text-base-content-muted">boxSize: 80px</span>
            <ptah-ring [value]="72" [max]="100" label="Custom box size" boxSize="80px" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-hide-zero-arc">
            <span class="text-ptah-caption text-base-content-muted">hideZeroArc: true (empty track)</span>
            <ptah-ring [value]="0" [max]="100" label="Hidden zero arc" size="md" [hideZeroArc]="true" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-fade-arc">
            <span class="text-ptah-caption text-base-content-muted">fadeArc: true</span>
            <ptah-ring [value]="72" [max]="100" label="Fading arc" size="md" [fadeArc]="true" />
          </div>
          <div class="flex flex-col items-start gap-ptah-inline" data-testid="ring-input-center-only">
            <span class="text-ptah-caption text-base-content-muted">centerOnly: true (no side text)</span>
            <ptah-ring [value]="72" [max]="100" label="Center only" size="md" [centerOnly]="true" />
          </div>
        </div>
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
        <div class="grid gap-ptah-field sm:grid-cols-2">
          <ptah-stat-card label="Review runs" [value]="24" trend="This month" />
          <ptah-stat-card label="Connected machines" [value]="3" size="dense" trend="2 online" />
        </div>
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
