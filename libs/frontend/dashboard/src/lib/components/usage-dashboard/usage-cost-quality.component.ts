/**
 * UsageCostQualityComponent
 *
 * Cost-quality panel (requirement 6): how much of the observed tokens is
 * backed by provider-reported spend, priced from the model rate card, or
 * unpriced — plus the cache-savings dollar figure when it is computable.
 * Shares are shares of tokens by `costSource`; `null` renders as "—".
 * Laid out for a full-width row: two cells per line, four from 640 px.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { PtahSectionHeaderComponent, PtahSurfaceDirective } from '@ptah-extension/ui';
import { type UsageCostQuality } from './usage-summary.view-model';
import { formatCostCell, formatShare } from './usage-formatting';

/** One hue plus a pattern: status colors stay reserved for state. */
type SegmentKind = 'reported' | 'priced' | 'unpriced';

let nextQualityId = 0;

@Component({
  selector: 'ptah-usage-cost-quality',
  standalone: true,
  imports: [PtahSectionHeaderComponent, PtahSurfaceDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      ptahSurface
      padding="md"
      class="usage-cost-quality flex flex-col gap-ptah-heading"
      aria-label="Cost quality"
      data-testid="usage-cost-quality"
    >
      <ptah-section-header heading="Cost quality" [level]="3" description="How each token was priced" />
      @if (segments().length > 0) {
        <div class="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden="true" data-testid="usage-quality-bar">
          @for (segment of segments(); track segment.kind) {
            <span class="h-full first:rounded-s-full last:rounded-e-full" [class]="segment.kind === 'reported' ? 'bg-primary' : segment.kind === 'priced' ? 'bg-primary/45' : 'usage-quality-hatch'" [style.width.%]="segment.percent"></span>
          }
        </div>
      }
      <div class="usage-quality-cells grid grid-cols-2 gap-ptah-field">
        <div class="usage-quality-cell" data-testid="usage-quality-reported">
          <p class="flex items-center gap-1.5 text-xs text-base-content-muted">
            <span class="h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" aria-hidden="true"></span>Provider reported
          </p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ shareLabel(quality().providerReportedTokenShare) }}</p>
          <p class="text-[11px] text-base-content-muted">share of tokens</p>
        </div>
        <div class="usage-quality-cell" data-testid="usage-quality-priced">
          <p class="flex items-center gap-1.5 text-xs text-base-content-muted">
            <span class="h-2.5 w-2.5 shrink-0 rounded-sm bg-primary/45" aria-hidden="true"></span>Model priced
          </p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ shareLabel(quality().modelPricedTokenShare) }}</p>
          <p class="text-[11px] text-base-content-muted">share of tokens</p>
        </div>
        <div class="usage-quality-cell" data-testid="usage-quality-unpriced">
          <p class="flex items-center gap-1.5 text-xs text-base-content-muted">
            <span class="h-2.5 w-2.5 shrink-0 rounded-sm usage-quality-hatch" aria-hidden="true"></span>Unpriced
          </p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ shareLabel(quality().unpricedTokenShare) }}</p>
          <p class="text-[11px] text-base-content-muted">share of tokens</p>
        </div>
        <div
          class="usage-quality-cell rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          data-testid="usage-quality-savings"
          [class.tooltip]="savingsTooltip() !== null"
          [attr.data-tip]="savingsTooltip()"
          [attr.tabindex]="savingsTooltip() !== null ? 0 : null"
          [attr.aria-describedby]="savingsTooltip() !== null ? savingsNoteId : null"
        >
          <p class="flex items-center gap-1.5 text-xs text-base-content-muted">
            <span class="h-2.5 w-2.5 shrink-0 rounded-sm border border-success" aria-hidden="true"></span>Cache savings
          </p>
          <p class="mt-1 text-xl font-semibold tabular-nums">{{ savingsLabel() }}</p>
          <p class="text-[11px] text-base-content-muted">vs raw token cost</p>
          @if (savingsTooltip(); as note) {
            <span class="sr-only" [id]="savingsNoteId">{{ note }}</span>
          }
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; container-type: inline-size; }
    .usage-quality-hatch {
      background-image: repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 4px);
      color: var(--surface-border-strong);
    }
    @container (min-width: 640px) {
      .usage-quality-cells { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .usage-quality-cell + .usage-quality-cell {
        border-inline-start: 1px solid var(--surface-border);
        padding-inline-start: var(--ptah-gap-field);
      }
    }
  `],
})
export class UsageCostQualityComponent {
  readonly quality = input.required<UsageCostQuality>();

  protected readonly savingsNoteId = `usage-quality-savings-note-${nextQualityId++}`;
  protected readonly shareLabel = formatShare;

  /** Composition segments in fixed order; empty hides the bar. */
  protected readonly segments = computed(() => {
    const quality = this.quality();
    const parts: readonly { kind: SegmentKind; share: number | null }[] = [
      { kind: 'reported', share: quality.providerReportedTokenShare },
      { kind: 'priced', share: quality.modelPricedTokenShare },
      { kind: 'unpriced', share: quality.unpricedTokenShare },
    ];
    return parts
      .filter((part): part is { kind: SegmentKind; share: number } => part.share !== null && part.share > 0)
      .map((part) => ({ kind: part.kind, percent: Math.min(100, part.share * 100) }));
  });

  /** "—", "$12.40", or "≥ $12.40" while some facts withhold savings. */
  protected readonly savingsLabel = computed(() => {
    const quality = this.quality();
    return formatCostCell(quality.cacheSavingsUsd, quality.cacheSavingsUnknownFactCount > 0);
  });

  /** Tooltip text while the figure is a lower bound; `null` hides it. */
  protected readonly savingsTooltip = computed(() => {
    const unknown = this.quality().cacheSavingsUnknownFactCount;
    return unknown > 0
      ? `${unknown} ${unknown === 1 ? 'fact' : 'facts'} without savings data`
      : null;
  });
}
