import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Brain } from 'lucide-angular';
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
          <ptah-ring [value]="62" [max]="100" label="Large" size="lg" />
          <ptah-ring [value]="62" [max]="100" label="Extra large" size="xl" />
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
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="stat-new-inputs">
        <div data-testid="stat-value-tone"><span>Value tone</span><ptah-stat label="Healthy" [value]="42" valueTone="success" /></div>
        <div data-testid="stat-appearance"><span>Surface appearance</span><ptah-stat label="Surface" [value]="42" appearance="surface" /></div>
        <div data-testid="stat-media"><span>Media slot</span><ptah-stat label="With media" [value]="42"><span ptahStatMedia aria-hidden="true">●</span></ptah-stat></div>
        <div data-testid="stat-icon-placement"><span>Centered icon</span><ptah-stat label="Centered" [value]="42" iconPlacement="center-end"><span ptahStatIcon aria-hidden="true">◆</span></ptah-stat></div>
        <div data-testid="stat-value-weight"><span>Medium weight</span><ptah-stat label="Medium" [value]="42" valueWeight="medium" /></div>
        <div data-testid="stat-value-wrap"><span>Wrapped value</span><ptah-stat label="Long value" value="A long descriptive value" valueWrap="break-words" /></div>
        <div data-testid="stat-radius"><span>Large radius</span><ptah-stat label="Rounded" [value]="42" appearance="surface" radius="2xl" /></div>
        <div data-testid="stat-hint-style"><span>Description hint</span><ptah-stat label="Hint" [value]="42" hint="Updated now" hintStyle="stat-desc" /></div>
        <div data-testid="stat-layout"><span>Tile layout</span><ptah-stat label="Code index" [value]="42" layout="tile" size="md" valueTone="secondary"><span ptahStatIcon aria-hidden="true">◆</span></ptah-stat></div>
        <div data-testid="stat-title"><span>Tooltip title</span><ptah-stat label="Code index" [value]="42" title="Indexed code symbols" /></div>
        <div data-testid="stat-heading-level"><span>Heading label</span><ptah-stat label="Heading" [value]="42" [headingLevel]="3" /></div>
        <div data-testid="stat-value-format"><span>Formatted value</span><ptah-stat label="Percent" [value]="0.42" [valueFormat]="percentFormat" /></div>
        <div data-testid="stat-placeholder"><span>Placeholder</span><ptah-stat label="Missing" value="" placeholder="N/A" /></div>
        <div data-testid="stat-polarity"><span>Polarity pill</span><ptah-stat label="Increase" [value]="42" delta="+4" polarity="good" /></div>
        <div data-testid="stat-card-hint"><span>Card hint</span><ptah-stat-card label="Card hint" [value]="42" hint="Updated now" /></div>
        <div data-testid="stat-card-direction"><span>Card direction</span><ptah-stat-card label="Card direction" [value]="42" direction="up" /></div>
        <div data-testid="stat-card-loading"><span>Card loading</span><ptah-stat-card label="Loading" [value]="42" [loading]="true" /></div>
        <div data-testid="stat-card-error-retry"><span>Card error and retry</span><ptah-stat-card label="Unavailable" [value]="42" error="Could not load." /></div>
        <div data-testid="stat-card-icon"><span>Card icon</span><ptah-stat-card label="With icon" [value]="42" [icon]="brainIcon" /></div>
        <div data-testid="stat-card-tone"><span>Card icon tone</span><ptah-stat-card label="Primary icon" [value]="42" [icon]="brainIcon" tone="primary" /></div>
      </div>
    </ptah-gallery-section>
  `,
})
export class GalleryChartsFamilyComponent {
  public readonly brainIcon = Brain;
  public readonly percentFormat: Intl.NumberFormatOptions = { style: 'percent' };
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
