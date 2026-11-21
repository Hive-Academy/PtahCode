import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ProviderMarkComponent } from '@ptah-extension/ui';
import { type ProviderUsageRow } from './usage-summary.view-model';
import { barWidthPercent, formatCompactTokens, formatCostCell, formatShare } from './usage-formatting';

@Component({
  selector: 'ptah-usage-cost-summary',
  standalone: true,
  imports: [ProviderMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-w-0" data-testid="usage-cost-summary">
      <ul class="flex flex-col gap-ptah-heading" aria-label="By provider">
        @for (row of providers(); track row.providerId) {
          <li class="min-w-0" data-testid="usage-provider-row" [attr.data-provider]="row.providerId">
            <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
              <ptah-provider-mark [providerId]="row.providerId" size="sm" class="h-4 w-4 shrink-0" />
              <span class="truncate text-xs" [attr.title]="row.displayName">{{ row.displayName }}</span>
              <span class="text-xs font-semibold tabular-nums" [attr.title]="rowTitle(row)">{{ costLabel(row) }}</span>
            </div>
            @if (row.costUsd !== null) {
              <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--ptah-meter-track,var(--surface-border-strong))]" aria-hidden="true">
                <span class="block h-full rounded-full" [style.width.%]="barWidth(row)" [style.background]="row.accent"></span>
              </div>
            }
            <p class="mt-1 text-right text-[11px] text-base-content-muted tabular-nums">{{ shareLabel(row) }}</p>
          </li>
        }
      </ul>
    </div>
  `,
})
export class UsageCostSummaryComponent {
  readonly providers = input<readonly ProviderUsageRow[]>([]);
  readonly totalUnpricedFactCount = input(0);

  protected costLabel(row: ProviderUsageRow): string {
    return formatCostCell(row.costUsd, row.unpricedFactCount > 0);
  }

  protected rowTitle(row: ProviderUsageRow): string | null {
    if (row.costUsd === null) return 'No price for this provider';
    if (row.unpricedFactCount === 0) return null;
    return `${row.unpricedFactCount} ${row.unpricedFactCount === 1 ? 'fact' : 'facts'} unpriced, ${formatCompactTokens(row.unpricedTokens)} tokens`;
  }

  protected shareLabel(row: ProviderUsageRow): string {
    const denominator = this.totalUnpricedFactCount() > 0 ? 'of known cost' : 'of cost';
    return `${formatShare(row.shareOfCost)} ${denominator} · ${formatCompactTokens(row.tokens)} tokens`;
  }

  /** Bar width is the row's share of cost, the same number as its caption. */
  protected barWidth(row: ProviderUsageRow): number {
    return barWidthPercent(row.shareOfCost, 1);
  }
}
