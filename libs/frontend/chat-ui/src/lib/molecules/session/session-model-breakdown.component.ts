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
    <p class="text-xs text-base-content-muted">SDK scope — orchestrator and SDK subagents, no CLI lanes</p>
    @let tokenSource = sources()[0];
    @let costSource = sources()[1];
    @if (usableSnapshot(); as stats) {
      <div
        class="mt-1.5 bg-base-200/50 rounded border border-purple-600/20 overflow-hidden"
        [class.inspector-model-table]="tokenSource !== undefined"
        role="table"
        aria-label="Per-model usage"
        data-testid="model-usage-table"
      >
        <div
          class="model-usage-row px-2 py-1 border-b border-base-content/10"
          [class.sr-only]="tokenSource !== undefined"
          role="row"
          data-testid="model-usage-header"
        >
          <div
            class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted"
            role="columnheader"
          >
            Model
          </div>
          <div
            class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right"
            role="columnheader"
            title="Uncached input tokens"
          >
            In
          </div>
          <div
            class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right"
            role="columnheader"
            title="Output tokens"
          >
            Out
          </div>
          <div
            class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right"
            role="columnheader"
            title="Cache read tokens"
          >
            Cache Read
          </div>
          <div
            class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right"
            role="columnheader"
            title="Cache creation tokens"
          >
            Cache Creation
          </div>
          <div
            class="text-[10px] leading-tight uppercase tracking-wider text-base-content-muted text-right"
            role="columnheader"
          >
            Cost
          </div>
        </div>
        @for (usage of modelRows(); track usage.model) {
          <div
            class="model-usage-row px-2 py-1.5 border-b border-base-content/5 last:border-b-0"
            role="row"
            data-testid="model-usage-row"
          >
            <div
              class="text-xs font-semibold text-base-content truncate"
              role="cell"
              [title]="usage.model"
            >
              {{ formatModelName(usage.model) }}
            </div>
            <div
              class="text-xs text-right tabular-nums text-base-content-muted"
              role="cell"
            >
              @if (tokenSource) { <span>In</span> }
              {{ formatTokens(usage.inputTokens) }}
            </div>
            <div
              class="text-xs text-right tabular-nums text-base-content-muted"
              role="cell"
            >
              @if (tokenSource) { <span>Out</span> }
              {{ formatTokens(usage.outputTokens) }}
            </div>
            <div
              class="text-xs text-right tabular-nums text-base-content-muted"
              role="cell"
            >
              @if (tokenSource) { <span>Cache read</span> }
              {{ formatOptionalTokens(usage.cacheRead) }}
            </div>
            <div
              class="text-xs text-right tabular-nums text-base-content-muted"
              role="cell"
            >
              @if (tokenSource) { <span>Cache creation</span> }
              {{ formatOptionalTokens(usage.cacheCreation) }}
            </div>
            <div
              class="text-xs text-right tabular-nums"
              [class.text-success]="isKnownCost(usage.costUSD)"
              [class.text-base-content-muted]="!isKnownCost(usage.costUSD)"
              [attr.title]="isKnownCost(usage.costUSD) ? null : notReported"
              role="cell"
            >
              {{ formatModelCost(usage.costUSD, stats) }}
            </div>
          </div>
        }
        <!-- Totals row: the snapshot's own totals, never a sum of rows -->
        <div
          class="model-usage-row px-2 py-1.5 border-t border-base-content/10 bg-base-300/30"
          role="row"
          data-testid="model-usage-total"
        >
          <div class="text-xs font-semibold" role="cell">{{ tokenSource ? 'SDK subtotal' : 'Total' }}</div>
          <div
            class="text-xs text-right tabular-nums font-semibold"
            role="cell"
          >
            @if (tokenSource) { <span>In</span> }
              {{ formatTokens(stats.tokens.input) }}
          </div>
          <div
            class="text-xs text-right tabular-nums font-semibold"
            role="cell"
          >
            @if (tokenSource) { <span>Out</span> }
              {{ formatTokens(stats.tokens.output) }}
          </div>
          <div
            class="text-xs text-right tabular-nums font-semibold"
            role="cell"
          >
            @if (tokenSource) { <span>Cache read</span> }
              {{ formatTokens(stats.tokens.cacheRead) }}
          </div>
          <div
            class="text-xs text-right tabular-nums font-semibold"
            role="cell"
          >
            @if (tokenSource) { <span>Cache creation</span> }
              {{ formatTokens(stats.tokens.cacheCreation) }}
          </div>
          <div
            class="text-xs text-right tabular-nums font-semibold"
            [class.text-success]="costSource ? costSource.sdkLabel !== '—' : isKnownCost(stats.totalCost)"
            [class.text-base-content-muted]="costSource ? costSource.sdkLabel === '—' : !isKnownCost(stats.totalCost)"
            role="cell"
          >
            @if (costSource) {
              {{ costSource.sdkLabel }}
            } @else {
              {{ formatModelTotal(stats) }}
            }
          </div>
        </div>
      </div>
    }
    @if (tokenSource && costSource) {
      <dl class="flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs">
        <div>
          <dt class="text-base-content-muted">SDK subtotal</dt>
          <dd class="tabular-nums">{{ tokenSource.sdkLabel }} tokens · {{ costSource.sdkLabel }}</dd>
        </div>
        @if (tokenSource.laneCount) {
          <div>
            <dt class="text-base-content-muted">CLI lanes</dt>
            <dd class="tabular-nums">{{ tokenSource.cliLabel }} tokens · {{ costSource.cliLabel }}</dd>
          </div>
          <div>
            <dt class="text-base-content-muted">Lanes with tokens</dt>
            <dd>{{ tokenSource.reported }}/{{ tokenSource.laneCount }}</dd>
          </div>
          <div>
            <dt class="text-base-content-muted">Lanes with cost</dt>
            <dd>{{ costSource.reported }}/{{ costSource.laneCount }}</dd>
          </div>
        }
        <div>
          <dt class="text-base-content-muted">Cost basis</dt>
          <dd>{{ costBasis() }}</dd>
        </div>
      </dl>
      <div class="mt-1 space-y-1 text-xs text-base-content-muted">
        <p>{{ tokenSource.sourceText }}</p>
        <p>{{ costSource.sourceText }}</p>
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
    .inspector-model-table .model-usage-row {
      grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.2fr) max-content;
      row-gap: 0.125rem;
    }
    .inspector-model-table [role='cell']:first-child { grid-column: 1 / -2; }
    .inspector-model-table [role='cell']:last-child { grid-area: 1 / -2; }
    .inspector-model-table [role='cell']:nth-child(n+2):nth-child(-n+5) {
      text-align: start;
      font-size: 0.6875rem;
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
