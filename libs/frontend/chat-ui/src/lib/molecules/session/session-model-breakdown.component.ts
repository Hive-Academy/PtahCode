import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  resolveModelDisplayName,
  type SessionStatsEntry,
} from '@ptah-extension/shared';
import { ModelStateService } from '@ptah-extension/core';
import {
  formatOptionalTokens,
  formatTokens,
} from './session-stats-format';
import {
  formatModelCost,
  formatModelTotal,
  isKnownCost,
} from './session-stats-view';

/** One per-model row of the backend snapshot. */
type ModelUsageRow = NonNullable<SessionStatsEntry['modelUsageList']>[number];

interface ModelUsageSource {
  readonly id: 'tokens' | 'cost';
  readonly sdkLabel: string;
  readonly cliLabel: string;
  readonly sourceText: string;
  readonly reported: number;
  readonly laneCount: number;
}

/** SDK token categories with optional whole-session source details. */
@Component({
  selector: 'ptah-session-model-breakdown',
  standalone: true,
  template: `
    @let tokenSource = sources()[0];
    @let costSource = sources()[1];
    <p class="text-xs text-base-content-muted" [class.sr-only]="tokenSource !== undefined">SDK scope — orchestrator and SDK subagents, no CLI lanes</p>
    @if (tokenSource && costSource) {
      <div class="grid gap-2 p-1" data-testid="model-usage-list">
        <div class="flex items-baseline justify-between gap-2 px-0.5" aria-hidden="true">
          <span class="text-[10.5px] font-semibold uppercase tracking-wider text-base-content-muted">Usage by model</span>
          <span class="text-[10.5px] text-base-content-muted">SDK scope</span>
        </div>
        @if (usableSnapshot(); as stats) {
          <ul class="grid gap-1.5" aria-label="Per-model usage" data-testid="model-usage-table">
            @for (usage of modelRows(); track usage.model) {
              <li class="model-item" data-testid="model-usage-row">
                <div class="flex min-w-0 items-baseline justify-between gap-2">
                  <span class="min-w-0 truncate text-xs font-semibold text-base-content" [title]="usage.model">{{ formatModelName(usage.model) }}</span>
                  <span
                    class="shrink-0 text-xs font-semibold tabular-nums"
                    [class.text-success]="isKnownCost(usage.costUSD)"
                    [class.text-base-content-muted]="!isKnownCost(usage.costUSD)"
                    [attr.title]="isKnownCost(usage.costUSD) ? null : notReported"
                    data-testid="model-usage-cost"
                  >{{ formatModelCost(usage.costUSD, stats) }}</span>
                </div>
                <div class="model-kv">
                  <span><span class="kv-label">In</span> {{ formatTokens(usage.inputTokens) }}</span>
                  <span><span class="kv-label">Out</span> {{ formatTokens(usage.outputTokens) }}</span>
                  <span><span class="kv-label">Cache read</span> {{ formatOptionalTokens(usage.cacheRead) }}</span>
                  <span><span class="kv-label">Cache creation</span> {{ formatOptionalTokens(usage.cacheCreation) }}</span>
                </div>
              </li>
            }
            <!-- The snapshot's own totals, never a sum of rows -->
            <li class="model-item model-item-total" [class.sr-only]="!showSubtotal()" data-testid="model-usage-total">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-xs font-semibold text-base-content">SDK subtotal</span>
                <span
                  class="text-xs font-semibold tabular-nums"
                  [class.text-success]="costSource.sdkLabel !== '—'"
                  [class.text-base-content-muted]="costSource.sdkLabel === '—'"
                  data-testid="model-usage-cost"
                >{{ costSource.sdkLabel }}</span>
              </div>
              <div class="model-kv">
                <span><span class="kv-label">In</span> {{ formatTokens(stats.tokens.input) }}</span>
                <span><span class="kv-label">Out</span> {{ formatTokens(stats.tokens.output) }}</span>
                <span><span class="kv-label">Cache read</span> {{ formatTokens(stats.tokens.cacheRead) }}</span>
                <span><span class="kv-label">Cache creation</span> {{ formatTokens(stats.tokens.cacheCreation) }}</span>
              </div>
            </li>
          </ul>
        } @else {
          <p class="px-0.5 text-[11px] text-base-content-muted" data-testid="model-usage-empty">No per-model SDK usage reported</p>
        }
        <div class="grid gap-1 border-t border-surface-border px-0.5 pt-1.5 text-[11px] text-base-content-muted">
          @if (tokenSource.laneCount) {
            <p class="tabular-nums" data-testid="model-cli-coverage">
              <span class="whitespace-nowrap">CLI {{ tokenSource.cliLabel }} tokens · {{ costSource.cliLabel }}</span>
              · <span class="whitespace-nowrap">Tokens {{ tokenSource.reported }}/{{ tokenSource.laneCount }}</span>
              · <span class="whitespace-nowrap">Cost {{ costSource.reported }}/{{ costSource.laneCount }}</span>
            </p>
          }
          <dl>
            <div class="flex items-center justify-between gap-2">
              <dt>Cost basis</dt>
              <dd class="rounded-full bg-base-content/[0.06] px-1.5 text-[10.5px] font-medium text-base-content">{{ costBasis() }}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div class="sr-only" data-testid="model-source-details">
        <p>{{ tokenSource.sourceText }}</p>
        <p>{{ costSource.sourceText }}</p>
        @if (tokenSource.laneCount) {
          <p>Lanes with tokens: {{ tokenSource.reported }} of {{ tokenSource.laneCount }}.
            Lanes with cost: {{ costSource.reported }} of {{ costSource.laneCount }}.</p>
        }
      </div>
    } @else if (usableSnapshot(); as stats) {
      <div class="mt-1.5 overflow-hidden rounded border border-purple-600/20 bg-base-200/50">
        <div role="table" aria-label="Per-model usage" data-testid="model-usage-table">
          <div class="model-usage-row px-2 py-1 border-b border-base-content/10" role="row" data-testid="model-usage-header">
            <div class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted" role="columnheader">Model</div>
            <div class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right" role="columnheader" title="Uncached input tokens">In</div>
            <div class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right" role="columnheader" title="Output tokens">Out</div>
            <div class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right" role="columnheader" title="Cache read tokens">Cache Read</div>
            <div class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right" role="columnheader" title="Cache creation tokens">Cache Creation</div>
            <div class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right" role="columnheader">Cost</div>
          </div>
          @for (usage of modelRows(); track usage.model) {
            <div class="model-usage-row px-2 py-1.5 border-b border-base-content/5 last:border-b-0" role="row" data-testid="model-usage-row">
              <div class="text-xs font-semibold text-base-content truncate" role="cell" [title]="usage.model">{{ formatModelName(usage.model) }}</div>
              <div class="text-xs text-right tabular-nums text-base-content-muted" role="cell">{{ formatTokens(usage.inputTokens) }}</div>
              <div class="text-xs text-right tabular-nums text-base-content-muted" role="cell">{{ formatTokens(usage.outputTokens) }}</div>
              <div class="text-xs text-right tabular-nums text-base-content-muted" role="cell">{{ formatOptionalTokens(usage.cacheRead) }}</div>
              <div class="text-xs text-right tabular-nums text-base-content-muted" role="cell">{{ formatOptionalTokens(usage.cacheCreation) }}</div>
              <div
                class="text-xs text-right tabular-nums"
                [class.text-success]="isKnownCost(usage.costUSD)"
                [class.text-base-content-muted]="!isKnownCost(usage.costUSD)"
                [attr.title]="isKnownCost(usage.costUSD) ? null : notReported"
                role="cell"
              >{{ formatModelCost(usage.costUSD, stats) }}</div>
            </div>
          }
          <!-- Totals row: the snapshot's own totals, never a sum of rows -->
          <div class="model-usage-row px-2 py-1.5 border-t border-base-content/10 bg-base-300/30" role="row" data-testid="model-usage-total">
            <div class="text-xs font-semibold" role="cell">Total</div>
            <div class="text-xs text-right tabular-nums font-semibold" role="cell">{{ formatTokens(stats.tokens.input) }}</div>
            <div class="text-xs text-right tabular-nums font-semibold" role="cell">{{ formatTokens(stats.tokens.output) }}</div>
            <div class="text-xs text-right tabular-nums font-semibold" role="cell">{{ formatTokens(stats.tokens.cacheRead) }}</div>
            <div class="text-xs text-right tabular-nums font-semibold" role="cell">{{ formatTokens(stats.tokens.cacheCreation) }}</div>
            <div
              class="text-xs text-right tabular-nums font-semibold"
              [class.text-success]="isKnownCost(stats.totalCost)"
              [class.text-base-content-muted]="!isKnownCost(stats.totalCost)"
              role="cell"
            >{{ formatModelTotal(stats) }}</div>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .model-usage-row {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) repeat(5, minmax(0, 1fr));
      gap: 0.25rem;
      align-items: end;
    }
    .model-item {
      display: grid;
      gap: 0.25rem;
      min-width: 0;
      border-radius: 0.5rem;
      padding: 0.4rem 0.55rem;
      background: color-mix(in srgb, currentColor 4%, transparent);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.18), inset 0 0 0 1px color-mix(in srgb, currentColor 6%, transparent);
    }
    .model-item-total {
      background: color-mix(in srgb, var(--ptah-gold, currentColor) 9%, transparent);
    }
    .model-kv {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.25rem;
      font-size: 0.6875rem;
      font-variant-numeric: tabular-nums;
    }
    .model-kv > span { display: grid; min-width: 0; line-height: 1.25; }
    .kv-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.625rem;
      color: var(--bcm, oklch(var(--bc) / 0.6));
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionModelBreakdownComponent {
  private readonly modelState = inject(ModelStateService);

  readonly snapshot = input<SessionStatsEntry | null>(null);
  readonly sources = input<readonly [ModelUsageSource, ModelUsageSource] | readonly []>([]);

  protected readonly costBasis = computed(() => {
    const snapshot = this.snapshot();
    if (snapshot?.pricingCoverage === 'partial') return 'Partial pricing';
    if (snapshot?.totalCost == null || snapshot.status === 'error') {
      return snapshot?.costUnavailableReason === 'rate-missing' ? 'Not priced' : 'SDK cost unavailable';
    }
    if (snapshot.costBasis === 'covered-by-subscription') return 'Covered by subscription';
    if (snapshot.costBasis === 'estimated' || snapshot.provisional) return 'Estimated';
    return 'Reported';
  });

  protected readonly usableSnapshot = computed(() => {
    const snapshot = this.snapshot();
    return this.sources().length && snapshot?.status === 'error' ? null : snapshot;
  });
  readonly modelRows = computed<readonly ModelUsageRow[]>(
    () => this.usableSnapshot()?.modelUsageList ?? [],
  );

  protected readonly showSubtotal = computed(() => !this.sources().length || this.modelRows().length > 1);

  protected readonly formatModelCost = formatModelCost;
  protected readonly formatModelTotal = formatModelTotal;
  protected readonly isKnownCost = isKnownCost;
  protected readonly notReported = 'not reported';
  protected readonly formatTokens = formatTokens;
  protected readonly formatOptionalTokens = formatOptionalTokens;

  protected formatModelName(modelId: string): string {
    return resolveModelDisplayName(modelId, this.modelState.availableModels());
  }
}
