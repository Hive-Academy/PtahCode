import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { PtahButtonDirective, PtahSectionHeaderComponent } from '@ptah-extension/ui';
import type { ModelBreakdownRow, ProviderUsageRow } from './usage-summary.view-model';
import { formatCostCell, formatShare } from './usage-formatting';
import { buildCostSlices, DONUT_RADIUS, type CostSliceInput } from './usage-cost-donut.geometry';

const MODEL_COLORS = ['#b583ed', '#56bfc1', '#e8aa67', '#7b9aeb', '#d77fa8'];

@Component({
  selector: 'ptah-usage-cost-donut',
  standalone: true,
  imports: [PtahButtonDirective, PtahSectionHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-ptah-heading" data-testid="usage-cost-donut">
      <div class="flex items-center justify-between gap-2">
        <ptah-section-header heading="Cost share" [level]="3" />
        <div class="flex gap-[var(--ptah-gap-controls)]" role="group" aria-label="Cost share view">
          <button type="button" ptahButton size="xs" [variant]="mode() === 'provider' ? 'primary' : 'ghost'" [selected]="mode() === 'provider'" (click)="mode.set('provider')">Provider</button>
          <button type="button" ptahButton size="xs" [variant]="mode() === 'model' ? 'primary' : 'ghost'" [selected]="mode() === 'model'" (click)="mode.set('model')">Model</button>
        </div>
      </div>
      <div class="usage-share-body flex flex-col items-center gap-ptah-field">
        <div class="relative h-[148px] w-[148px] shrink-0">
          <svg viewBox="0 0 140 140" class="h-full w-full" role="img" [attr.aria-label]="ariaLabel()" data-testid="usage-donut-svg">
            <circle cx="70" cy="70" [attr.r]="radius" fill="none" class="text-[var(--ptah-meter-track,var(--surface-border-strong))]" stroke="currentColor" stroke-width="16" />
            @for (slice of slices(); track slice.id) {
              @if (slice.percent !== null) {
                <circle cx="70" cy="70" [attr.r]="radius" fill="none" [attr.stroke]="slice.color" stroke-width="16"
                  [attr.stroke-dasharray]="slice.dash" [attr.stroke-dashoffset]="slice.offset"
                  transform="rotate(-90 70 70)" data-testid="usage-donut-arc" />
              }
            }
          </svg>
          <!-- Decorative repeat of the SVG label: the svg aria-label carries it for AT. -->
          <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
            <span class="text-[11px] text-base-content-muted">Known cost</span>
            <span class="text-base font-semibold tabular-nums">{{ centerLabel() }}</span>
            @if (dayCount() !== null) {
              <span class="text-[11px] text-base-content-muted">{{ dayCaption() }}</span>
            }
          </div>
        </div>
        <ul class="flex w-full min-w-0 flex-col gap-1 text-xs" aria-label="Cost share legend">
          @for (slice of slices(); track slice.id) {
            <li tabindex="0" class="flex items-center gap-1.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              [attr.aria-label]="legendLabel(slice.label, slice.costUsd, slice.percent, slice.unpriced)"
              [attr.title]="legendLabel(slice.label, slice.costUsd, slice.percent, slice.unpriced)">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background]="slice.color" aria-hidden="true"></span>
              <span class="min-w-0 flex-1 truncate">{{ slice.label }}</span>
              <span class="font-semibold tabular-nums">{{ costLabel(slice.costUsd, slice.unpriced) }}</span>
              <span class="w-12 text-right tabular-nums text-base-content-muted">{{ shareLabel(slice.percent) }}</span>
            </li>
          }
        </ul>
      </div>
      @if (hasUnpriced()) {
        <p class="text-[11px] text-base-content-muted">Unpriced usage is excluded from cost share; shown totals are lower bounds.</p>
      }
    </section>
  `,
  // Donut beside the legend while the card is wide but the legend still fits.
  styles: [`
    :host { display: block; container-type: inline-size; }
    @container (min-width: 560px) and (max-width: 959px) {
      .usage-share-body { flex-direction: row; align-items: center; gap: var(--ptah-gap-group); }
    }
  `],
})
export class UsageCostDonutComponent {
  readonly providers = input<readonly ProviderUsageRow[]>([]);
  readonly models = input<readonly ModelBreakdownRow[]>([]);
  readonly totalCostUsd = input<number | null>(null);
  readonly unpricedFactCount = input(0);
  /** Days in the range for the center caption; `null` hides the caption. */
  readonly dayCount = input<number | null>(null);
  readonly mode = signal<'provider' | 'model'>('provider');
  protected readonly radius = DONUT_RADIUS;

  readonly slices = computed(() => {
    const items: CostSliceInput[] = this.mode() === 'provider'
      ? this.providers().map((row) => ({ id: row.providerId, label: row.displayName, costUsd: row.costUsd, color: row.accent, unpriced: row.hasUnpricedFacts }))
      : this.models().map((row, i) => ({ id: `${row.providerId}:${row.modelId}`, label: row.modelDisplayName, costUsd: row.costUsd, color: MODEL_COLORS[i % MODEL_COLORS.length]!, unpriced: row.unpriced }));
    return buildCostSlices(items);
  });
  readonly hasUnpriced = computed(() => this.unpricedFactCount() > 0);
  readonly centerLabel = computed(() => formatCostCell(this.totalCostUsd(), this.hasUnpriced(), 'unpriced'));
  readonly dayCaption = computed(() => {
    const days = this.dayCount() ?? 0;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  });
  readonly ariaLabel = computed(() => `Cost share by ${this.mode()}. ${this.totalCostUsd() === null ? 'Cost unpriced.' : `${this.centerLabel()} known cost.`} ${this.hasUnpriced() ? 'Unpriced usage excluded from arcs.' : ''}`);
  readonly shareLabel = formatShare;
  readonly costLabel = (cost: number | null, unpriced: boolean): string => formatCostCell(cost, unpriced, 'unpriced');
  readonly legendLabel = (label: string, cost: number | null, percent: number | null, unpriced: boolean): string =>
    `${label}: ${this.costLabel(cost, unpriced)}${percent === null ? '' : `, ${formatShare(percent)} of known cost`}`;
}
