import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_TEXT, isValidRange, percentOf, resolveInk } from './chart-geometry';
import { PtahMeterTone, PtahRingSize } from './chart.types';

const BOX: Readonly<Record<PtahRingSize, string>> = {
  xs: 'h-6 w-6',
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-[var(--ptah-ring-size-lg,6rem)] w-[var(--ptah-ring-size-lg,6rem)]',
  xl: 'h-[var(--ptah-ring-size-xl,7rem)] w-[var(--ptah-ring-size-xl,7rem)]',
};
const CENTER: Readonly<Record<PtahRingSize, string>> = {
  xs: 'hidden',
  sm: 'text-[0.625rem]',
  md: 'text-sm',
  lg: 'text-[length:var(--ptah-ring-center-lg,1.125rem)]',
  xl: 'text-[length:var(--ptah-ring-center-xl,1.375rem)]',
};
/** Sub text is too small for xs and sm. */
const SUB: Readonly<Record<PtahRingSize, string>> = {
  xs: 'hidden',
  sm: 'hidden',
  md: 'text-[0.5rem]',
  lg: 'text-[0.625rem]',
  xl: 'text-xs',
};

/**
 * Ring owner (TASK_2026_976_2421). A circular meter: the arc uses a path
 * length of 100, so the dash length is the percent. The value is always
 * text beside the ring, and `showValue` adds the percent in the center.
 *
 * `bare` renders the SVG only: no text, `aria-hidden="true"`, no role.
 * `centerText` replaces the center percent. `subText` is a small second line
 * below it, in the center. It shows at md and larger. Custom text is also the
 * `aria-valuetext` of a ranged ring. `valueText` replaces the side text and
 * `aria-valuetext`. `indeterminate` is a pulsing `progressbar` without
 * `aria-valuenow`.
 *
 * Sizes are a named scale. `xs`, `sm` and `md` are 24, 40 and 64 px. `lg` and
 * `xl` read `--ptah-ring-size-*` (96 and 112 px). The SVG geometry is a fixed
 * viewBox and scales with the box.
 *
 * Test hook: put `data-testid` on the host `<ptah-ring>`. There is no input for it.
 */
@Component({
  selector: 'ptah-ring', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="inline-flex items-center gap-2 text-xs" [attr.aria-hidden]="bare() ? 'true' : null" [attr.role]="ariaRole()" [attr.aria-label]="ariaRole() ? label() : null" [attr.aria-valuemin]="ranged() ? 0 : null" [attr.aria-valuemax]="ranged() ? max() : null" [attr.aria-valuenow]="ranged() ? ariaNow() : null" [attr.aria-valuetext]="ariaValueText()">
    <span class="relative inline-flex shrink-0 items-center justify-center" [class]="boxClass()">
      <svg class="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle class="text-[var(--ptah-ring-track,var(--surface-border-strong))]" cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="4" />
        @if (indeterminate()) { <circle class="animate-pulse motion-reduce:animate-none" [class]="inkClass()" cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="25 100" /> }
        @else if (valid()) { <circle class="transition-[stroke-dasharray] motion-reduce:transition-none" [class]="inkClass()" cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" pathLength="100" [attr.stroke-dasharray]="arc() + ' 100'" /> }
      </svg>
      @if (!bare() && showValue() && (centerLabel() !== null || subText())) {
        <span class="absolute inset-0 flex flex-col items-center justify-center tabular-nums" [class.leading-none]="!!subText()" [class]="centerClass()" aria-hidden="true">
          @if (centerLabel() !== null) { <span>{{ centerLabel() }}</span> }
          @if (subText()) { <span [class]="subClass()">{{ subText() }}</span> }
        </span>
      }
    </span>
    @if (!bare()) {
      <span class="flex flex-col"><span>{{ label() }}</span><span class="tabular-nums">@if (indeterminate()) { {{ valueText() ?? 'In progress' }} } @else if (valid()) { {{ visibleText() }} } @else { Unavailable }</span></span>
    }
  </div>`,
})
export class PtahRingComponent {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly label = input.required<string>();
  readonly unit = input('');
  readonly tone = input<PtahMeterTone>('auto');
  readonly size = input<PtahRingSize>('sm');
  readonly showValue = input(true);
  /** Ring only: no text, `aria-hidden`, no role. For decorative rings. */
  readonly bare = input(false);
  /** Replaces the center percent. */
  readonly centerText = input<string | undefined>(undefined);
  /** Small second line in the center, below the center text. */
  readonly subText = input<string | undefined>(undefined);
  /** Pulsing ring with no value. A `progressbar` without `aria-valuenow`. */
  readonly indeterminate = input(false);
  /** Replaces the side value text and `aria-valuetext` when set. */
  readonly valueText = input<string | undefined>(undefined);

  readonly valid = computed(() => isValidRange(this.value(), this.max()));
  readonly ranged = computed(() => !this.bare() && this.valid() && !this.indeterminate());
  readonly ariaRole = computed(() => {
    if (this.bare()) return null;
    if (this.indeterminate()) return 'progressbar';
    return this.valid() ? 'meter' : null;
  });
  readonly percent = computed(() => percentOf(this.value(), this.max()));
  readonly arc = computed(() => Math.min(100, this.percent()));
  readonly rounded = computed(() => Math.round(this.percent()));
  readonly ariaNow = computed(() => Math.min(this.max(), Math.max(0, this.value())));
  /** Over the max or negative: `aria-valuenow` is clamped, so the real value goes in `aria-valuetext`. */
  readonly outOfRange = computed(() => this.value() < 0 || this.percent() > 100);
  readonly defaultText = computed(() => `${this.value()}${this.unit()} / ${this.max()}${this.unit()}`);
  readonly visibleText = computed(() => this.valueText() ?? this.defaultText());
  readonly centerLabel = computed(
    () => this.centerText() ?? (this.valid() && !this.indeterminate() ? `${this.rounded()}%` : null),
  );
  /** Custom center text and sub text as one string, or null. */
  readonly customCenter = computed(() => {
    const parts = [this.centerText(), this.subText()].filter((t): t is string => !!t);
    return parts.length > 0 ? parts.join(' ') : null;
  });
  readonly ariaValueText = computed(() => {
    if (this.bare()) return null;
    if (this.indeterminate()) return this.valueText() ?? null;
    if (!this.ranged()) return null;
    return this.valueText() ?? this.customCenter() ?? (this.outOfRange() ? this.defaultText() : null);
  });
  readonly inkClass = computed(() => CHART_TEXT[resolveInk(this.tone(), this.indeterminate() ? 0 : this.percent())]);
  readonly boxClass = computed(() => BOX[this.size()]);
  readonly centerClass = computed(() => CENTER[this.size()]);
  readonly subClass = computed(() => SUB[this.size()]);
}
