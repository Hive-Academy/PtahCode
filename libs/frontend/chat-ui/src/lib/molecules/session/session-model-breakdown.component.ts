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
    @if (usableSnapshot() || tokenSource) {
      <div class="mt-1.5 overflow-hidden rounded border bg-base-200/50"
        [class.border-surface-border]="tokenSource" [class.border-purple-600/20]="!tokenSource">
        @if (usableSnapshot(); as stats) {
          <div
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
                  @if (currentModel(); as current) {
                    <!-- Which row runs now: a model used only in earlier turns must not look current. -->
                    <span class="block truncate text-[10.5px] font-normal text-base-content-muted" data-testid="model-usage-when">{{
                      usage.model === current ? 'current' : 'earlier in this session'
                    }}</span>
                  }
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
              [class.sr-only]="!showSubtotal()"
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
          <div class="space-y-1 border-surface-border px-2 py-1.5 text-[11px] text-base-content-muted"
            [class.border-t]="usableSnapshot()">
            @if (tokenSource.laneCount) {
              <p class="tabular-nums" data-testid="model-cli-coverage">
                <span class="whitespace-nowrap">CLI {{ tokenSource.cliLabel }} tokens · {{ costSource.cliLabel }}</span>
                · <span class="whitespace-nowrap">Tokens {{ tokenSource.reported }}/{{ tokenSource.laneCount }}</span>
                · <span class="whitespace-nowrap">Cost {{ costSource.reported }}/{{ costSource.laneCount }}</span>
              </p>
            }
            <dl>
              <div class="flex gap-1">
                <dt>Cost basis</dt>
                <dd class="text-base-content">{{ costBasis() }}</dd>
              </div>
            </dl>
          </div>
        }
      </div>
    }
    @if (tokenSource && costSource) {
      <div class="sr-only" data-testid="model-source-details">
        <p>{{ tokenSource.sourceText }}</p>
        <p>{{ costSource.sourceText }}</p>
        @if (tokenSource.laneCount) {
          <p>Lanes with tokens: {{ tokenSource.reported }} of {{ tokenSource.laneCount }}.
            Lanes with cost: {{ costSource.reported }} of {{ costSource.laneCount }}.</p>
        }
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
  /** The session's current model id; each row then says "current" or "earlier in this session". */
  readonly currentModel = input<string | null>(null);

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
