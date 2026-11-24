import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NEAR_LIMIT_PERCENT } from '@ptah-extension/shared';
import { PtahMeterComponent, type PtahMeterTone } from '@ptah-extension/ui';
import { windowMeter } from './plan-limit-tiles';
import { chipClass, sourceChipClass } from './stats-tile.styles';
import type { PlanWindowDetailModel } from './stats-limit-view-model.types';

/**
 * Full detail of one plan window (design §3.2 expansion, §3.3 different or
 * unknown owner): the used value with a meter, the reset facts with the passed
 * and the next reset kept apart, the aged / not-confirmed note and the
 * per-field source chips.
 *
 * Used by the plan-limit row panel and by a lane subgroup that shows a
 * window in full. The plan row passes `showSummary="false"` because its own
 * face already shows the label, usage bar, chip, used value and source
 * chips, so its panel adds only the reset facts and the note; a lane
 * subgroup keeps the default and shows everything. Unknown is never 0:
 * without a reported value no meter is drawn and the full row reads "Used: unknown".
 */
@Component({
  selector: 'ptah-plan-window-detail',
  standalone: true,
  imports: [PtahMeterComponent],
  template: `
    @let w = window();
    <div class="py-1" data-testid="plan-window-detail">
      @if (showSummary()) {
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <span class="font-semibold text-xs">{{ w.label }}</span>
          @if (w.chip; as chip) {
            <span [class]="chipClass(chip.tone)">
              @if (chip.glyph) {
                <span aria-hidden="true">{{ chip.glyph }}</span>
              }
              {{ chip.text }}
            </span>
          }
        </div>
      }
      @if (showSummary() && meter(); as range) {
        <div class="flex items-center gap-2 mt-1">
          <ptah-meter
            class="block flex-1"
            [value]="range.value"
            [max]="range.max"
            [label]="w.label + ' used'"
            [valueText]="w.usedText"
            [tone]="meterTone()"
            [stripes]="hot()"
            [marker]="w.amount ? undefined : nearLimitPercent"
            size="sm"
            [showValue]="false"
            [hideLabel]="true"
          />
          <span class="text-xs font-semibold tabular-nums whitespace-nowrap">{{
            w.usedText
          }}</span>
        </div>
      } @else if (showSummary()) {
        <div class="text-xs mt-1 font-semibold">Used: {{ w.usedText }}</div>
      }
      @for (fact of w.resetFacts; track $index) {
        <div class="text-[11px] text-base-content-muted mt-0.5">{{ fact }}</div>
      }
      @if (w.note) {
        <div class="text-[11px] text-base-content-muted mt-0.5">
          {{ w.note }}
        </div>
      }
      @if (showSummary()) {
        @if (w.sourceChips.length > 0) {
          <div class="flex flex-wrap gap-1 mt-1">
            @for (source of w.sourceChips; track source) {
              <span [class]="sourceChipClass(source)">{{ source }}</span>
            }
          </div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanWindowDetailComponent {
  readonly window = input.required<PlanWindowDetailModel>();
  /**
   * False from the plan row panel, whose face already shows the label, usage
   * bar, chip, used value and source chips. True (default) from a lane
   * subgroup, which shows the window in full.
   */
  readonly showSummary = input<boolean>(true);

  protected readonly nearLimitPercent = NEAR_LIMIT_PERCENT;
  protected readonly chipClass = chipClass;
  protected readonly sourceChipClass = sourceChipClass;

  protected readonly meter = computed(() => windowMeter(this.window()));

  protected readonly meterTone = computed<PtahMeterTone>(() => {
    const state = this.window().state;
    return state === 'limit-reached' ? 'err' : state === 'near-limit' ? 'warn' : 'neutral';
  });

  /** Stripes decorate a window that is near or at its limit. */
  protected readonly hot = computed(() => this.meterTone() !== 'neutral');
}
