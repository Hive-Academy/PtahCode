import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PtahBadgeDirective, PtahMeterComponent, PtahTooltipDirective } from '@ptah-extension/ui';
import { windowMeter } from './plan-limit-tiles';
import type { PlanLimitTileModel, ProviderLaneLimitModel } from './stats-limit-view-model.types';

const SHORT_LABEL_LENGTH = 6;

const SOURCES = {
  'provider-api': ['API', 'Provider API'],
  'cli-command': ['CLI', 'CLI report'],
  'local-state': ['Local', 'Local state'],
  'session-sdk': ['SDK', 'Session SDK'],
  'local-rpc': ['RPC', 'Local RPC'],
} as const;

@Component({
  selector: 'ptah-provider-lane-limit-tile',
  standalone: true,
  imports: [PtahBadgeDirective, PtahMeterComponent, PtahTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = provider();
    <div class="min-w-0" role="group" [attr.aria-label]="p.label + ' plan limits'" [attr.data-provider-id]="p.id">
      <div class="flex items-baseline gap-2 text-xs">
        <span class="min-w-0 break-words font-semibold text-base-content">{{ p.label }}</span>
        <span class="shrink-0 font-mono text-[11px] text-base-content-muted"
          [attr.aria-label]="p.accountId ? 'Account ' + p.accountId : 'Account unknown'">{{ p.accountId ?? '—' }}</span>
        @if (p.indicator; as indicator) {
          <span class="min-w-0 truncate text-[11px] font-semibold focus-visible:outline focus-visible:outline-base-content"
            [class.text-error]="indicator.tone === 'error'" [class.text-warning]="indicator.tone === 'warning'"
            role="group" tabindex="0" [attr.aria-label]="indicator.text" [ptahTooltip]="indicator.text">
            {{ indicator.state === 'at-limit' ? 'Limit reached' : 'Near limit' }}
          </span>
        }
        <span class="ml-auto flex max-w-[50%] flex-wrap justify-end gap-1">
          @if (p.source; as source) {
            <span ptahBadge size="xs" [attr.title]="sources[source][1]">
              <span aria-hidden="true">{{ sources[source][0] }}</span>
              <span class="sr-only">{{ sources[source][1] }}</span>
            </span>
          } @else {
            @for (source of sourceChips(); track source) {
              <span ptahBadge size="xs">{{ source }}</span>
            }
          }
        </span>
      </div>
      @if (failure(); as failure) {
        <p class="break-words text-[11px] text-base-content-muted focus-visible:outline focus-visible:outline-base-content"
          data-testid="provider-limit-message" tabindex="0" [ptahTooltip]="failure.detail">
          {{ failure.reason }}
        </p>
      } @else if (p.message || p.windows.length === 0) {
        <p class="text-[11px] text-base-content-muted" data-testid="provider-limit-message">
          {{ p.ownerState === 'untracked' ? 'Usage not tracked' : p.message || 'Limits not tracked' }}
        </p>
      }
      @for (group of groups(); track group.label) {
        @if (group.label; as label) {
          <div class="mt-1 text-[11px] text-base-content-muted" data-testid="plan-window-group">{{ label }}</div>
        }
        @for (tile of group.tiles; track tile.id) {
          @let row = windowRowModel(tile);
          <div class="grid min-w-0 plan-window-row items-center gap-x-2 text-[11px] leading-[18px] focus-visible:outline focus-visible:outline-base-content"
            [class.stacked-label]="stackWindowLabels() || row.longLabel"
            [attr.data-tile-id]="tile.id" data-testid="plan-window-row" role="group" tabindex="0"
            [attr.aria-label]="row.description" [ptahTooltip]="row.description">
            <span class="plan-window-label min-w-0 break-words text-base-content-muted" [attr.title]="tile.label">{{ tile.label }}</span>
            <span>
              @if (row.range; as range) {
                <ptah-meter [value]="range.value" [max]="range.max" [label]="p.label + ' ' + tile.label + ' usage'"
                  [valueText]="row.valueText" [tone]="row.tone" track="thin" [showValue]="false" [hideLabel]="true" />
              }
            </span>
            <span class="text-right text-xs font-semibold tabular-nums"
              [class.whitespace-nowrap]="!tile.window?.amount" [class.break-words]="tile.window?.amount"
              [class.text-base-content-muted]="row.displayValue === '—'">
              @if (tile.chip; as chip) {
                <span aria-hidden="true" [attr.title]="row.markerTitle">{{ chip.glyph }}</span>
              }
              {{ row.displayValue }}
            </span>
            <span class="truncate text-right text-base-content-muted" data-testid="plan-window-reset">{{ tile.window?.reset?.short ?? '—' }}</span>
          </div>
        }
      }
      @for (tile of otherTiles(); track tile.id) {
        <div class="text-[11px] text-base-content-muted" [attr.data-tile-id]="tile.id" data-testid="plan-extra-tile">
          <div class="flex flex-wrap items-baseline justify-between gap-x-2">
            <span>{{ tile.label }}</span>
            <span class="font-semibold tabular-nums">{{ tile.value }}</span>
          </div>
          @if (tile.chip; as chip) {
            @if (chip.text !== tile.value) { <p>{{ chip.text }}</p> }
          }
          @if (tile.resetLine) { <p>{{ tile.resetLine }}</p> }
          @for (line of tile.detailLines; track $index) {
            @if (line !== tile.value) { <p class="break-words">{{ line }}</p> }
          }
        </div>
      }
    </div>
  `,
  styles: `
    .plan-window-row { grid-template-columns: 3rem minmax(0, 1fr) 3.25rem 3.75rem; }
    .plan-window-row.stacked-label { grid-template-columns: minmax(0, 1fr) 3.25rem 3.75rem; }
    .stacked-label .plan-window-label { grid-column: 1 / -1; }
  `,
})
export class ProviderLaneLimitTileComponent {
  readonly provider = input.required<ProviderLaneLimitModel>();
  protected readonly sources = SOURCES;
  protected readonly failure = computed(() => {
    const tile = this.provider().windows.find(window => window.unavailableReason);
    if (!tile?.unavailableReason) return null;
    return {
      reason: tile.unavailableReason,
      detail: tile.detailLines.filter(line => line !== tile.unavailableReason).join(' ') || tile.unavailableReason,
    };
  });
  protected readonly sourceChips = computed(() => [...new Set(this.provider().windows.flatMap(tile => tile.sourceChips))]);
  protected readonly otherTiles = computed(() => this.provider().windows.filter(tile =>
    tile.kind !== 'window' && !tile.unavailableReason));
  private readonly windows = computed(() => this.provider().windows.filter(tile => tile.kind === 'window'));
  protected readonly stackWindowLabels = computed(() =>
    this.windows().some(tile => !tile.window?.group && tile.label.length > SHORT_LABEL_LENGTH),
  );
  protected readonly groups = computed(() => {
    const groups = new Map<string | null, PlanLimitTileModel[]>();
    for (const tile of this.windows()) {
      const label = tile.window?.group ?? null;
      const group = groups.get(label) ?? [];
      group.push(tile);
      groups.set(label, group);
    }
    return [...groups].map(([label, tiles]) => {
      if (label) return { label, tiles };
      const primary = tiles.reduce((best, tile) => (tile.window?.percent ?? -1) > (best.window?.percent ?? -1) ? tile : best);
      return { label, tiles: [primary, ...tiles.filter(tile => tile !== primary)] };
    });
  });

  protected windowRowModel(tile: PlanLimitTileModel) {
    const window = tile.window;
    const range = windowMeter(window);
    const displayValue = range && window
      ? window.amount ? tile.value : `${window.percent}%`
      : '—';
    const usage = displayValue === '—' ? 'Usage unknown'
      : window?.amount ? displayValue : `${displayValue} used`;
    const valueText = [tile.label, usage, tile.chip?.text, tile.resetLine || 'Reset unknown', window?.reset?.full]
      .filter(Boolean).join(' · ');
    const description = [window?.group, valueText, window?.note, ...tile.sourceChips].filter(Boolean).join(' · ');
    return {
      range,
      longLabel: tile.label.length > SHORT_LABEL_LENGTH,
      markerTitle: window?.state === 'not-confirmed' && window.note
        ? `Not confirmed: ${window.note}`
        : tile.chip?.text,
      displayValue,
      description,
      valueText,
      tone: window?.state === 'limit-reached' ? 'err' : window?.state === 'near-limit' ? 'warn'
        : window?.state === 'ok' ? 'ok' : 'neutral',
    } as const;
  }
}
