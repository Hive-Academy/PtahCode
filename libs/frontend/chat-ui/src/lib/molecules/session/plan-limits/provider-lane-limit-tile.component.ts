import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PtahBadgeDirective, PtahMeterComponent, PtahTooltipDirective } from '@ptah-extension/ui';
import { Clock, Info, OctagonAlert, TriangleAlert, LucideAngularModule } from 'lucide-angular';
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
  imports: [LucideAngularModule, PtahBadgeDirective, PtahMeterComponent, PtahTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = provider();
    <div class="provider-card grid min-w-0 gap-1" role="group" [attr.aria-label]="p.label + ' plan limits'" [attr.data-provider-id]="p.id">
      <div class="flex min-w-0 items-center gap-1.5 text-xs">
        <span class="min-w-0 truncate font-semibold text-base-content" [attr.title]="p.label">{{ p.label }}</span>
        <span class="account-chip shrink-0 font-mono"
          [attr.aria-label]="p.accountId ? 'Account ' + p.accountId : 'Account unknown'">{{ p.accountId ? '#' + p.accountId : '—' }}</span>
        @if (p.indicator; as indicator) {
          <span ptahBadge size="xs" [tone]="indicator.tone === 'error' ? 'err' : 'warn'"
            class="inline-flex shrink-0 items-center gap-0.5 focus-visible:outline focus-visible:outline-base-content"
            role="group" tabindex="0" [attr.aria-label]="indicator.text" [ptahTooltip]="indicator.text">
            <lucide-angular [img]="indicator.state === 'at-limit' ? LimitIcon : NearIcon" class="size-2.5" aria-hidden="true" />
            {{ indicator.state === 'at-limit' ? 'Limit reached' : 'Near limit' }}
          </span>
        }
        <span class="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
          @if (p.source; as source) {
            <span ptahBadge size="xs" data-testid="provider-source" [attr.title]="sources[source][1]">
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
        <p class="flex items-start gap-1 break-words text-[11px] text-base-content-muted focus-visible:outline focus-visible:outline-base-content"
          data-testid="provider-limit-message" tabindex="0" [ptahTooltip]="failure.detail">
          <lucide-angular [img]="InfoIcon" class="mt-px size-3 shrink-0" aria-hidden="true" />
          <span class="min-w-0">{{ failure.reason }}</span>
        </p>
      } @else if (p.message || p.windows.length === 0) {
        <p class="flex items-center gap-1 text-[11px] text-base-content-muted" data-testid="provider-limit-message">
          <lucide-angular [img]="InfoIcon" class="size-3 shrink-0" aria-hidden="true" />
          <span class="min-w-0">{{ p.ownerState === 'untracked' ? 'Usage not tracked' : p.message || 'Limits not tracked' }}</span>
        </p>
      }
      @for (group of groups(); track group.label) {
        @if (group.label; as label) {
          <div class="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-base-content-muted" data-testid="plan-window-group">{{ label }}</div>
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
            <span class="inline-flex min-w-0 items-center justify-end gap-0.5 text-base-content-muted">
              <lucide-angular [img]="ResetIcon" class="size-2.5 shrink-0" aria-hidden="true" />
              <span class="truncate" data-testid="plan-window-reset">{{ tile.window?.reset?.short ?? '—' }}</span>
            </span>
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
    .provider-card {
      border-radius: 0.5rem;
      padding: 0.45rem 0.6rem 0.5rem;
      background: color-mix(in srgb, currentColor 3.5%, transparent);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.2), inset 0 0 0 1px color-mix(in srgb, currentColor 6%, transparent);
    }
    .account-chip {
      border-radius: 9999px;
      padding: 0 0.3rem;
      font-size: 10px;
      line-height: 1rem;
      color: var(--bcm, oklch(var(--bc) / 0.6));
      background: color-mix(in srgb, currentColor 7%, transparent);
    }
    .plan-window-row { grid-template-columns: 3rem minmax(0, 1fr) 3rem 4rem; }
    .plan-window-row.stacked-label { grid-template-columns: minmax(0, 1fr) 3rem 4rem; }
    .stacked-label .plan-window-label { grid-column: 1 / -1; }
  `,
})
export class ProviderLaneLimitTileComponent {
  readonly provider = input.required<ProviderLaneLimitModel>();
  protected readonly sources = SOURCES;
  protected readonly InfoIcon = Info;
  protected readonly ResetIcon = Clock;
  protected readonly NearIcon = TriangleAlert;
  protected readonly LimitIcon = OctagonAlert;
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
