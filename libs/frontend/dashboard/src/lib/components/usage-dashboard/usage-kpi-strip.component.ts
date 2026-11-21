import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PtahSparklineComponent, PtahSurfaceDirective } from '@ptah-extension/ui';
import type { KpiDeltas } from '../../services/kpi-delta';
import { type UsageKpis } from './usage-summary.view-model';
import { formatCompactTokens, formatCostCell, formatCount, formatPercent } from './usage-formatting';

@Component({
  selector: 'ptah-usage-kpi-strip',
  standalone: true,
  imports: [PtahSparklineComponent, PtahSurfaceDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    @container (min-width: 900px) {
      .usage-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @container (min-width: 1300px) {
      .usage-kpi-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    }
  `],
  template: `
    <div class="usage-kpi-grid grid grid-cols-2 gap-ptah-field" data-testid="usage-kpis" role="group" aria-label="Usage totals for the selected range">
      <div ptahSurface variant="inset" padding="sm" data-testid="usage-kpi-cost">
        <p class="text-[11px] text-base-content-muted">Raw token cost</p>
        <p class="mt-1 text-xl font-semibold tabular-nums" data-testid="usage-total-cost" [attr.title]="costTooltip()">{{ costLabel() }}</p>
        <p class="mt-0.5 text-[11px] text-base-content-muted">{{ savingsSub() }}</p>
        @if (costDeltaText(); as delta) {
          <p class="text-[11px] text-base-content-muted tabular-nums" data-testid="usage-kpi-cost-delta">{{ delta }}</p>
        }
        @if (costTrend().length > 1) {
          <ptah-sparkline class="mt-1 block" size="xs" [values]="costTrend()" label="Daily cost" tone="accent" [area]="true" />
        }
      </div>
      <div ptahSurface variant="inset" padding="sm" data-testid="usage-kpi-processed">
        <p class="text-[11px] text-base-content-muted">Processed tokens</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">{{ compact(kpis().processedTokens) }}</p>
        <p class="mt-0.5 text-[11px] text-base-content-muted">{{ processedSub() }}</p>
        <p class="text-[11px] text-base-content-muted" data-testid="usage-kpi-output">{{ outputSub() }}</p>
        @if (tokenDeltaText(); as delta) {
          <p class="text-[11px] text-base-content-muted tabular-nums" data-testid="usage-kpi-tokens-delta">{{ delta }}</p>
        }
        @if (tokenTrend().length > 1) {
          <ptah-sparkline class="mt-1 block" size="xs" [values]="tokenTrend()" label="Daily tokens" tone="accent" [area]="true" />
        }
      </div>
      <div ptahSurface variant="inset" padding="sm" data-testid="usage-kpi-cached">
        <p class="text-[11px] text-base-content-muted">Cached %</p>
        <p class="mt-1 text-xl font-semibold tabular-nums" [attr.title]="cachedShareNote()">{{ cachedShareLabel() }}</p>
        <p class="mt-0.5 text-[11px] text-base-content-muted">Cached input {{ compact(kpis().cachedInputTokens) }}</p>
        <p class="text-[11px] text-base-content-muted" data-testid="usage-kpi-uncached">Uncached input {{ compact(kpis().uncachedInputTokens) }} · {{ compact(kpis().cacheWriteTokens) }} cache writes</p>
      </div>
      <div ptahSurface variant="inset" padding="sm" title="Counts include usage sources with session identity in this range">
        <p class="text-[11px] text-base-content-muted">Sessions</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">{{ count(kpis().sessionCount) }}</p>
      </div>
      <div ptahSurface variant="inset" padding="sm" title="Counts include usage sources with session identity in this range">
        <p class="text-[11px] text-base-content-muted">Messages</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">{{ count(kpis().messageCount) }}</p>
      </div>
      <div ptahSurface variant="inset" padding="sm" title="Counts include usage sources with session identity in this range">
        <p class="text-[11px] text-base-content-muted">Subagents</p>
        <p class="mt-1 text-xl font-semibold tabular-nums">{{ count(kpis().subagentCount) }}</p>
      </div>
    </div>
    <p class="mt-1.5 text-[11px] text-base-content-muted">* estimated at API rates; not your bill</p>
  `,
})
export class UsageKpiStripComponent {
  readonly kpis = input.required<UsageKpis>();
  readonly totalCostUsd = input<number | null>(null);
  readonly totalUnpricedFactCount = input(0);
  readonly totalUnpricedTokens = input(0);
  /** Daily cost for the selected range (sparkline). */
  readonly costTrend = input<readonly number[]>([]);
  /** Daily processed tokens for the selected range (sparkline). */
  readonly tokenTrend = input<readonly number[]>([]);
  /** Change against the previous equal range; null hides the line (never "0%"). */
  readonly deltas = input<KpiDeltas | null>(null);
  readonly rangeDays = input<number>(30);
  protected readonly compact = formatCompactTokens;
  protected readonly count = formatCount;

  /** Same money path as the cost quality panel, so $0.0034 never reads as $0.00. */
  protected readonly costLabel = computed(() =>
    formatCostCell(this.totalCostUsd(), this.totalUnpricedFactCount() > 0, 'Unknown'),
  );

  protected readonly costTooltip = computed(() => {
    const count = this.totalUnpricedFactCount();
    const unpriced = count > 0 ? `${count} ${count === 1 ? 'fact' : 'facts'} unpriced, ${formatCompactTokens(this.totalUnpricedTokens())} tokens. ` : '';
    const savings = this.kpis().cacheSavingsUsd === null ? 'No savings data' : `Cache savings ${this.savingsValue()}`;
    return `${unpriced}${savings}`;
  });

  protected readonly processedSub = computed(() => {
    const perDay = this.kpis().processedPerActiveDay;
    return perDay === null ? 'No active days' : `~${formatCompactTokens(perDay)} per active day`;
  });

  protected readonly cachedShareLabel = computed(() => {
    const share = this.kpis().cachedShareOfInput;
    return share === null ? '—' : formatPercent(share);
  });

  protected readonly cachedShareNote = computed(() =>
    this.kpis().cachedShareOfInput === null ? 'No input observed' : `${this.cachedShareLabel()} of observed input`,
  );

  protected readonly savingsValue = computed(() => {
    const kpis = this.kpis();
    return formatCostCell(kpis.cacheSavingsUsd, kpis.cacheSavingsUnknownFactCount > 0);
  });

  protected readonly savingsSub = computed(() => {
    const kpis = this.kpis();
    if (kpis.savingsMultiple !== null) return `Cost before cache savings: ${kpis.savingsMultiple.toFixed(1)}x raw cost`;
    if (kpis.cacheSavingsUsd === null) return 'No savings data';
    return kpis.cacheSavingsUnknownFactCount > 0 ? 'a lower bound' : 'vs raw token cost';
  });

  protected readonly costDeltaText = computed(() => deltaText(this.deltas()?.spend ?? null, this.rangeDays()));
  protected readonly tokenDeltaText = computed(() => deltaText(this.deltas()?.tokens ?? null, this.rangeDays()));

  protected readonly outputSub = computed(() => `Output ${formatCompactTokens(this.kpis().outputTokens)} tokens`);
}

/** "+12% vs previous 7d"; null when there is no trustworthy previous period. */
export function deltaText(delta: number | null, rangeDays: number): string | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  const percent = Math.round(delta * 100);
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '±';
  return `${sign}${Math.abs(percent)}% vs previous ${rangeDays}d`;
}
