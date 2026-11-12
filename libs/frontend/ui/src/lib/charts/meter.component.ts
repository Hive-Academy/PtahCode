import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_BG, CHART_TEXT, isValidRange, percentOf, resolveInk } from './chart-geometry';
import { PtahChartSize, PtahMeterRole, PtahMeterTone } from './chart.types';

const TRACK_H: Readonly<Record<PtahChartSize, string>> = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' };
const TEXT: Readonly<Record<PtahChartSize, string>> = { xs: 'text-xs', sm: 'text-xs', md: 'text-sm' };

/** Same recipe as the plan window stripes: 45deg, bar and gap sizes come from tokens. */
const STRIPES =
  'repeating-linear-gradient(45deg, currentColor 0 var(--ptah-meter-stripe-bar), ' +
  'transparent var(--ptah-meter-stripe-bar) ' +
  'calc(var(--ptah-meter-stripe-bar) + var(--ptah-meter-stripe-gap)))';

/**
 * Meter owner (TASK_2026_976_2421). A labelled bar with its value as text, so
 * color is never the only cue. Invalid data shows `Unavailable` and no ARIA
 * value. A value over the max fills the bar and keeps the real value in text.
 * `indeterminate` is a `progressbar` without `aria-valuenow`.
 *
 * `hideLabel` hides the label visually (it stays in the DOM and as `aria-label`).
 * `valueText` replaces the visible value text and `aria-valuetext`. `barRole`
 * picks `meter` or `progressbar` for a determinate bar. The input is not
 * named `role`: a static `role="..."` would also land on the host element.
 *
 * Test hook: put `data-testid` on the host `<ptah-meter>`. There is no input
 * for it and no inner-element hook.
 */
@Component({
  selector: 'ptah-meter', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="textClass()"><div class="mb-1 flex justify-between gap-2"><span [class.sr-only]="hideLabel()">{{ label() }}</span><span class="tabular-nums" [class.sr-only]="!showValue()">@if (indeterminate()) { {{ valueText() ?? 'In progress' }} } @else if (valid()) { {{ visibleText() }} } @else { Unavailable }</span></div>
    <div class="overflow-hidden rounded-full bg-[var(--ptah-meter-track,var(--surface-border-strong))]" [class]="trackClass()" [attr.role]="ariaRole()" [attr.aria-label]="ariaRole() ? label() : null" [attr.aria-valuemin]="ranged() ? 0 : null" [attr.aria-valuemax]="ranged() ? max() : null" [attr.aria-valuenow]="ranged() ? ariaNow() : null" [attr.aria-valuetext]="ariaValueText()">
      @if (indeterminate()) { <div class="h-full w-1/3 animate-pulse rounded-full motion-reduce:animate-none" [class]="fillClass()"></div> } @else if (valid()) { <div class="h-full rounded-full transition-[width] motion-reduce:transition-none" [class]="fillClass()" [style.width.%]="width()" [style.background-image]="stripeImage()"></div> }
      @if (markerPercent() !== null) { <div class="absolute top-0 h-full w-px bg-[var(--ptah-meter-marker,var(--ptah-badge-neutral-ink))]" [style.left]="markerLeft()" aria-hidden="true" data-meter-marker></div> }
    </div>
  </div>`,
})
export class PtahMeterComponent {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly label = input.required<string>();
  readonly unit = input('');
  readonly tone = input<PtahMeterTone>('auto');
  readonly size = input<PtahChartSize>('sm');
  readonly indeterminate = input(false);
  readonly showValue = input(true);
  /** Hide the label visually. It stays in the DOM and as the bar `aria-label`. */
  readonly hideLabel = input(false);
  /** Replaces the visible value text and `aria-valuetext` when set. */
  readonly valueText = input<string | undefined>(undefined);
  /** ARIA role of the inner bar when determinate. Indeterminate is always `progressbar`. */
  readonly barRole = input<PtahMeterRole>('meter');
  /** Percent 0..100 of a thin tick on the track (for example a near-limit mark). Decoration only. */
  readonly marker = input<number | undefined>(undefined);
  /** Draws the fill as diagonal stripes in the tone ink over the track color. */
  readonly stripes = input(false);

  readonly valid = computed(() => isValidRange(this.value(), this.max()));
  readonly ranged = computed(() => this.valid() && !this.indeterminate());
  readonly ariaRole = computed(() => (this.indeterminate() ? 'progressbar' : this.valid() ? this.barRole() : null));
  readonly clampedValue = computed(() => Math.max(0, this.value()));
  readonly ariaNow = computed(() => Math.min(this.max(), this.clampedValue()));
  readonly percent = computed(() => percentOf(this.value(), this.max()));
  readonly width = computed(() => Math.min(100, this.percent()));
  /** Over the max or negative: `aria-valuenow` is clamped, so the real value goes in `aria-valuetext`. */
  readonly outOfRange = computed(() => this.value() < 0 || this.percent() > 100);
  readonly customText = computed(() => this.valueText() !== undefined);
  readonly ariaValueText = computed(() => {
    if (this.indeterminate()) return this.valueText() ?? null;
    return this.ranged() && (this.customText() || this.outOfRange()) ? this.visibleText() : null;
  });
  readonly visibleText = computed(
    () => this.valueText() ?? `${this.value()}${this.unit()} / ${this.max()}${this.unit()}`,
  );
  /** Percent (0..100) of the marker tick, or null when none is drawn. Not a value: ARIA ignores it. */
  readonly markerPercent = computed(() => {
    const m = this.marker();
    return m === undefined || !Number.isFinite(m) || !this.ranged() ? null : Math.min(100, Math.max(0, m));
  });
  private readonly ink = computed(() => resolveInk(this.tone(), this.indeterminate() ? 0 : this.percent()));
  readonly fillClass = computed(() =>
    this.stripes() ? CHART_TEXT[this.ink()] : CHART_BG[this.ink()],
  );
  /** Left edge of the tick: the tick stays inside the clipped track at 100%. */
  readonly markerLeft = computed(() => {
    const m = this.markerPercent();
    return m === null ? null : `calc(${m}% - ${m / 100}px)`;
  });
  /** Diagonal stripes in the tone ink (`currentColor`) over the track color. */
  readonly stripeImage = computed(() => (this.stripes() ? STRIPES : null));
  readonly trackClass = computed(() =>
    this.markerPercent() === null ? TRACK_H[this.size()] : `relative ${TRACK_H[this.size()]}`,
  );
  readonly textClass = computed(() => TEXT[this.size()]);
}
