import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_BG, CHART_TEXT, isValidRange, percentOf, resolveInk } from './chart-geometry';
import { PtahChartSize, PtahMeterRole, PtahMeterSegment, PtahMeterTone } from './chart.types';

const TRACK_H: Readonly<Record<PtahChartSize, string>> = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' };
const TRACK_OVERRIDE = { hairline: 'h-0.5', thin: 'h-[0.1875rem]' } as const;
const FILL_TRANSITION = 'transition-[width] motion-reduce:transition-none';
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
  template: `<div [class]="textClass()" [class.ptah-meter-partial]="unreported() === 'partial'">
    <div [class]="rowClass()" [class.col-span-2]="unreported() === 'partial'" data-meter-row><span [class.sr-only]="hideLabel()">{{ label() }}</span><span class="tabular-nums" [class.sr-only]="!showValue() && !missing()">
      @if (missing()) {
        <span [attr.aria-hidden]="customText() ? 'true' : null">No usage reported</span>
        @if (customText()) { <span class="sr-only">{{ valueText() }}</span> }
      } @else if (indeterminate()) { {{ valueText() ?? 'In progress' }} } @else if (valid()) { {{ visibleText() }} } @else { Unavailable }
    </span></div>
    @if (!missing()) {
    <div class="overflow-hidden rounded-full bg-[var(--ptah-meter-track,var(--surface-border-strong))] shadow-[inset_0_0_0_0.0625rem_var(--ptah-meter-track-edge,transparent)]" [class]="trackClass()" [attr.role]="ariaRole()" [attr.aria-label]="ariaRole() && !ariaLabelledby() ? label() : null" [attr.aria-labelledby]="ariaRole() ? ariaLabelledby() : null" [attr.aria-valuemin]="ranged() ? 0 : null" [attr.aria-valuemax]="ranged() ? max() : null" [attr.aria-valuenow]="ranged() ? ariaNow() : null" [attr.aria-valuetext]="ariaValueText()">
      @if (indeterminate()) { @if (indeterminateStyle() === 'sweep') { <div class="ptah-meter-sweep h-full rounded-full" [class]="fillClass()"></div> } @else { <div class="h-full w-1/3 animate-pulse rounded-full motion-reduce:animate-none" [class]="fillClass()"></div> } } @else if (valid()) {
        @if (segments() === null) { <div class="h-full rounded-full" [class]="determinateFillClass()" [style.width.%]="width()" [style.background-image]="stripeImage()"></div> }
        @else {
          <div class="flex h-full" aria-hidden="true">
            @for (segment of segmentFills(); track $index) {
              <div class="h-full shrink-0" [class]="segment.fillClass" [style.width.%]="segment.width"></div>
            }
          </div>
        }
      }
      @if (markerPercent() !== null) { <div class="absolute top-0 h-full w-0.5 bg-[var(--ptah-meter-marker,var(--ptah-badge-neutral-ink))]" [style.left]="markerLeft()" aria-hidden="true" data-meter-marker></div> }
    </div>
    }
    @if (unreported() !== 'none') {
      <div class="ptah-meter-unreported rounded-full bg-[var(--ptah-meter-track,var(--surface-border-strong))] text-base-content-muted"
        [class]="trackHeight()" [style.background-image]="unreportedImage" aria-hidden="true"></div>
    }
  </div>`,
  styles: [`
    .ptah-meter-partial { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 0.25rem; }
    .ptah-meter-unreported { width: 0.75rem; }
    .ptah-meter-sweep { width: 40%; }
    @media (prefers-reduced-motion: no-preference) {
      .ptah-meter-sweep { animation: ptah-meter-sweep 1.4s ease-in-out infinite; }
    }
    @media (prefers-reduced-motion: reduce) {
      .ptah-meter-sweep { width: 100%; opacity: 0.35; }
    }
    @keyframes ptah-meter-sweep {
      from { transform: translateX(-100%); }
      to { transform: translateX(250%); }
    }
  `],
})
export class PtahMeterComponent {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly label = input.required<string>();
  readonly unit = input('');
  readonly tone = input<PtahMeterTone>('auto');
  readonly size = input<PtahChartSize>('sm');
  readonly indeterminate = input(false);
  /** Disable the determinate fill's width transition when matching a static bar. */
  readonly animate = input(true);
  /** Moving 40% segment, or the original pulse, for indeterminate bars. */
  readonly indeterminateStyle = input<'pulse' | 'sweep'>('pulse');
  readonly showValue = input(true);
  /** Hide the label visually. It stays in the DOM and as the bar `aria-label`. */
  readonly hideLabel = input(false);
  /** Replaces the visible value text and `aria-valuetext` when set. */
  readonly valueText = input<string | undefined>(undefined);
  /** ARIA role of the inner bar when determinate. Indeterminate is always `progressbar`. */
  readonly barRole = input<PtahMeterRole>('meter');
  /** ID of an external element naming the inner bar; overrides its aria-label. */
  readonly ariaLabelledby = input<string | null>(null);
  /** Percent 0..100 of a thin tick on the track (for example a near-limit mark). Decoration only. */
  readonly marker = input<number | undefined>(undefined);
  /** Draws the fill as diagonal stripes in the tone ink over the track color. */
  readonly stripes = input(false);
  /** Known parts of the subtotal. Null keeps the single fill. */
  readonly segments = input<readonly PtahMeterSegment[] | null>(null);
  readonly unreported = input<'none' | 'partial' | 'missing'>('none');
  readonly track = input<'hairline' | 'thin' | undefined>(undefined);

  protected readonly unreportedImage = STRIPES;
  protected readonly missing = computed(() => this.unreported() === 'missing');

  readonly valid = computed(() => isValidRange(this.value(), this.max()));
  readonly ranged = computed(() => this.valid() && !this.indeterminate() && !this.missing());
  readonly ariaRole = computed(() => (this.missing() ? null : this.indeterminate() ? 'progressbar' : this.valid() ? this.barRole() : null));
  readonly clampedValue = computed(() => Math.max(0, this.value()));
  readonly ariaNow = computed(() => Math.min(this.max(), this.clampedValue()));
  readonly percent = computed(() => percentOf(this.value(), this.max()));
  readonly width = computed(() => Math.min(100, this.percent()));
  /** Over the max or negative: `aria-valuenow` is clamped, so the real value goes in `aria-valuetext`. */
  readonly outOfRange = computed(() => this.value() < 0 || this.percent() > 100);
  readonly customText = computed(() => this.valueText() !== undefined);
  readonly ariaValueText = computed(() => {
    if (this.missing()) return null;
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
  readonly determinateFillClass = computed(() =>
    this.animate() ? `${this.fillClass()} ${FILL_TRANSITION}` : this.fillClass(),
  );
  protected readonly segmentFills = computed(() => {
    const width = this.width();
    if (width <= 0) return [];
    const segments = this.segments()?.filter(({ value }) => Number.isFinite(value) && value > 0) ?? [];
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    let remaining = width;
    return segments.map((segment, index) => {
      const share = index === segments.length - 1 ? remaining : Math.min(remaining, width * (segment.value / total));
      remaining -= share;
      const ink = CHART_BG[resolveInk(segment.tone, this.percent())];
      return { width: share, fillClass: this.animate() ? `${ink} ${FILL_TRANSITION}` : ink };
    });
  });
  /** Left edge of the tick: the tick stays inside the clipped track at 100%. */
  readonly markerLeft = computed(() => {
    const m = this.markerPercent();
    return m === null ? null : `calc(${m}% - ${m / 50}px)`;
  });
  /** Diagonal stripes in the tone ink (`currentColor`) over the track color. */
  readonly stripeImage = computed(() => (this.stripes() ? STRIPES : null));
  protected readonly trackHeight = computed(() => {
    const track = this.track();
    return track === undefined ? TRACK_H[this.size()] : TRACK_OVERRIDE[track];
  });
  readonly trackClass = computed(() =>
    this.markerPercent() === null ? this.trackHeight() : `relative ${this.trackHeight()}`,
  );
  readonly textClass = computed(() => TEXT[this.size()]);
  /** Label and value both hidden: the row is visually removed (no height, no margin), text stays for AT. */
  readonly rowClass = computed(() =>
    this.hideLabel() && !this.showValue() && !this.missing() ? 'sr-only' : 'mb-1 flex justify-between gap-2',
  );
}
