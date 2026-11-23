import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PtahBadgeDirective, PtahMeterComponent, PtahTooltipDirective } from '@ptah-extension/ui';
import { windowMeter } from './plan-limit-tiles';
import type { PlanLimitTileModel, ProviderLaneLimitModel } from './stats-limit-view-model.types';

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
        @if (failure(); as tile) {
          <span class="ml-auto text-right text-[11px] italic text-base-content-muted focus-visible:outline focus-visible:outline-base-content"
            role="group" tabindex="0" [attr.aria-label]="'Usage unavailable: ' + tile.detailLines[0]"
            [ptahTooltip]="tile.detailLines[0]">usage unavailable</span>
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
      @if (!failure() && (p.message || p.windows.length === 0)) {
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
          <div class="grid min-w-0 grid-cols-[30px_minmax(0,1fr)_46px_60px] items-center gap-x-2 text-[11px] leading-[18px] focus-visible:outline focus-visible:outline-base-content"
            [attr.data-tile-id]="tile.id" data-testid="plan-window-row" role="group" tabindex="0"
            [attr.aria-label]="row.description" [ptahTooltip]="row.description">
            <span class="truncate text-base-content-muted">{{ tile.label }}</span>
            <span>
              @if (row.range; as range) {
                <ptah-meter [value]="range.value" [max]="range.max" [label]="p.label + ' ' + tile.label + ' usage'"
                  [valueText]="row.valueText" [tone]="row.tone" track="3px" [showValue]="false" [hideLabel]="true" />
              }
            </span>
            <span class="text-right text-xs font-semibold tabular-nums"
              [class.truncate]="!tile.window?.amount" [class.break-words]="tile.window?.amount"
              [class.text-base-content-muted]="row.displayValue === '—'">
              @if (tile.chip; as chip) { <span aria-hidden="true">{{ chip.glyph }}</span> }
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
})
export class ProviderLaneLimitTileComponent {
  readonly provider = input.required<ProviderLaneLimitModel>();
  protected readonly sources = SOURCES;
  protected readonly failure = computed(() => this.provider().windows.find(tile => tile.usageUnavailable));
  protected readonly sourceChips = computed(() => [...new Set(this.provider().windows.flatMap(tile => tile.sourceChips))]);
  protected readonly otherTiles = computed(() => this.provider().windows.filter(tile =>
    tile.kind !== 'window' && !tile.usageUnavailable));
  protected readonly groups = computed(() => {
    const windows = this.provider().windows.filter(tile => tile.kind === 'window');
    if (windows.length === 0) return [];
    if (!windows.every(tile => tile.window?.group)) {
      const primary = windows.reduce((best, tile) => (tile.window?.percent ?? -1) > (best.window?.percent ?? -1) ? tile : best);
      return [{ label: null, tiles: [primary, ...windows.filter(tile => tile !== primary)] }];
    }
    const groups = new Map<string, PlanLimitTileModel[]>();
    for (const tile of windows) {
      const label = tile.window?.group;
      if (!label) continue;
      const group = groups.get(label) ?? [];
      group.push(tile);
      groups.set(label, group);
    }
    return [...groups].map(([label, tiles]) => ({ label, tiles }));
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
    const description = [valueText, window?.note, ...tile.sourceChips].filter(Boolean).join(' · ');
    return {
      range,
      displayValue,
      description,
      valueText,
      tone: window?.state === 'limit-reached' ? 'err' : window?.state === 'near-limit' ? 'warn'
        : window?.state === 'ok' ? 'ok' : 'neutral',
    } as const;
  }
}
