import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type {
  ReviewLaneListing,
  ReviewLanePins,
  ReviewLaneRole,
} from '@ptah-extension/review-contracts';
import { PtahRichSelectComponent, PtahStatusComponent } from '@ptah-extension/ui';
import {
  announce,
  entryState,
  isLensRole,
  laneLabel,
  modelOptions,
  NO_CHOICE,
  pinLaneOptions,
  REVIEW_LANE_ROLES,
  roleLabel,
  toModel,
} from './review-lane-options';

/**
 * The six role pins (Triage, the four lenses, Verifier). Presentational: it emits the whole next
 * pins object and never mutates its input. A role without a pin follows the pool.
 */
@Component({
  selector: 'ptah-review-lane-pins',
  standalone: true,
  imports: [PtahRichSelectComponent, PtahStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h4 id="review-lane-pins-h" class="mt-4 text-xs font-semibold">Pins</h4>
    <p class="text-xs text-base-content-muted">
      Force one lane for a role. Roles without a pin follow the pool, or the global agent order when the pool is
      empty.
    </p>
    <div class="mt-1.5 rounded-box border border-base-300 bg-base-200">
      @for (row of rows(); track row.role) {
        <div
          role="group"
          class="grid grid-cols-2 items-center gap-x-2 gap-y-1 px-2 py-1.5 min-[520px]:grid-cols-[1fr_1.2fr_1.2fr]"
          [class.border-t]="!$first"
          [class.border-base-300]="!$first"
          [class.bg-warning/10]="row.state?.unavailable"
          [attr.aria-label]="row.name + ' pin'"
        >
          <span class="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 text-sm min-[520px]:col-span-1">
            <span [class.font-mono]="row.isLens" [class.text-xs]="row.isLens">{{ row.name }}</span>
            @for (mark of row.state?.marks ?? []; track mark.label) {
              <ptah-status [status]="mark.status" [label]="mark.label" size="xs" />
            }
          </span>
          <ptah-select
            class="block min-w-0"
            size="xs"
            [label]="row.name + ' lane'"
            [options]="row.laneOptions"
            [value]="row.laneValue"
            (valueChange)="setLane(row.role, $event)"
          />
          <ptah-select
            class="block min-w-0"
            size="xs"
            [label]="row.name + ' model'"
            [options]="row.modelOptions"
            [value]="row.modelValue"
            [disabled]="row.laneValue === noChoice"
            (valueChange)="setModel(row.role, $event)"
          />
          @for (hint of row.state?.hints ?? []; track hint) {
            <p class="col-span-full text-xs text-base-content-muted">{{ hint }}</p>
          }
          @if (row.state?.reason) {
            <p class="col-span-full text-xs text-base-content-muted">{{ row.state?.reason }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class ReviewLanePinsComponent {
  readonly pins = input.required<ReviewLanePins>();
  /** The listing to check pins against; `null` when it is missing or failed. */
  readonly listing = input<ReviewLaneListing | null>(null);
  readonly pinsChanged = output<ReviewLanePins>();
  readonly announced = output<string>();

  protected readonly noChoice = NO_CHOICE;

  protected readonly rows = computed(() => {
    const listing = this.listing();
    const pins = this.pins();
    return REVIEW_LANE_ROLES.map((role) => {
      const pin = pins[role] ?? null;
      return {
        role,
        name: roleLabel(role),
        isLens: isLensRole(role),
        laneOptions: pinLaneOptions(listing, pin?.lane ?? null),
        laneValue: pin?.lane ?? NO_CHOICE,
        modelOptions: modelOptions(listing, pin?.lane ?? null, pin?.model ?? null),
        modelValue: pin?.model ?? NO_CHOICE,
        state: pin ? entryState(listing, pin, 'pin') : null,
      };
    });
  });

  setLane(role: ReviewLaneRole, value: string | null): void {
    const pins = this.pins();
    const lane = value === null || value === NO_CHOICE ? null : value;
    if ((pins[role]?.lane ?? null) === lane) return;
    const next: ReviewLanePins = { ...pins };
    if (lane === null) {
      delete next[role];
      this.pinsChanged.emit(next);
      this.announced.emit(announce.pinCleared(role));
      return;
    }
    next[role] = { lane, model: null };
    this.pinsChanged.emit(next);
    this.announced.emit(announce.pinned(role, laneLabel(this.listing(), lane)));
  }

  setModel(role: ReviewLaneRole, value: string | null): void {
    const pins = this.pins();
    const pin = pins[role];
    const model = toModel(value);
    if (!pin || pin.model === model) return;
    this.pinsChanged.emit({ ...pins, [role]: { lane: pin.lane, model } });
  }
}
