import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { NEAR_LIMIT_PERCENT } from '@ptah-extension/shared';
import type {
  LocalTimeOptions,
  PlanLimitOwnerSnapshot,
} from '@ptah-extension/shared';
import {
  ProviderMarkComponent,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahMeterComponent,
  type PtahMeterTone,
} from '@ptah-extension/ui';
import {
  buildPlanTile,
  type PlanTileActionView,
  type Tone,
} from '../provider-account-card/plan-tile-view.model';

/**
 * One compact plan-limit cell for every owner. The card passes one owner
 * snapshot and the shared clock value, and the tile never fetches and never
 * starts a timer of its own. All derived text comes from the pure
 * `buildPlanTile` mapping, so the whole tile stays testable without a DOM.
 */
@Component({
  selector: 'ptah-provider-account-tile',
  standalone: true,
  imports: [ProviderMarkComponent, PtahButtonDirective, PtahIconButtonDirective, PtahMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-account-tile.component.html',
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
    `,
  ],
})
export class ProviderAccountTileComponent {
  /** The one owner this tile presents. */
  readonly owner = input.required<PlanLimitOwnerSnapshot>();
  /** The shared clock value from `PlanLimitsStore.now()`; no tile timer. */
  readonly now = input.required<number>();
  readonly refreshing = input(false);

  /** Refresh this owner's usage; the card routes it to the store. */
  readonly refresh = output<void>();
  /** An inline action (go to chat, add key); the card navigates. */
  readonly actionClick = output<PlanTileActionView>();

  private readonly locale = inject(LOCALE_ID);

  /** Local times with the zone abbreviation in the UI locale. */
  private readonly timeOptions: LocalTimeOptions = {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    zoneNameLocale: this.locale,
  };

  /** The near-limit threshold each tile's bar tick marks. */
  protected readonly nearLimitPercent = NEAR_LIMIT_PERCENT;

  protected readonly view = computed(() =>
    buildPlanTile(this.owner(), this.now(), this.timeOptions),
  );

  protected readonly detailLines = computed(() => {
    const view = this.view();
    return [
      view.statusNotice,
      view.cooldown,
      ...view.evidence.map((item) =>
        item.key === '__more-evidence' ? item.title : item.text,
      ),
    ]
      .filter((line): line is string => line !== null);
  });

  protected readonly accessibleLabel = computed(() =>
    [this.view().accessibleLabel, ...this.detailLines()].join(', '),
  );

  /** Label + identity subtitle, plus hidden-window notes as the tooltip. */
  protected readonly headerTitle = computed(() => {
    const view = this.view();
    const notes = [...view.hiddenWindowNotes, ...this.detailLines()];
    return notes.length > 0
      ? `${view.headerTitle}\n\n${notes.join('\n')}`
      : view.headerTitle;
  });

  /** Maps the view tone to the meter owner tone; the owner sets the colors. */
  protected meterTone(tone: Tone): PtahMeterTone {
    switch (tone) {
      case 'error':
        return 'err';
      case 'warning':
        return 'warn';
      case 'success':
        return 'ok';
      case 'info':
        return 'info';
      default:
        return 'neutral';
    }
  }
}
