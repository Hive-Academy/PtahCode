import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NEAR_LIMIT_PERCENT } from '@ptah-extension/shared';
import { CHART_TEXT, isValidRange, percentOf, resolveInk } from './chart-geometry';
import { PtahMeterTone, PtahRingSize, PtahRingThresholds } from './chart.types';

const BOX: Readonly<Record<PtahRingSize, string>> = {
  xs: 'h-6 w-6',
  stat: 'h-8 w-8',
  row: 'h-14 w-14',
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-[var(--ptah-ring-size-lg,6rem)] w-[var(--ptah-ring-size-lg,6rem)]',
  xl: 'h-[var(--ptah-ring-size-xl,7rem)] w-[var(--ptah-ring-size-xl,7rem)]',
};
const CENTER: Readonly<Record<PtahRingSize, string>> = {
  xs: 'hidden',
  stat: 'text-[0.625rem]',
  row: 'text-sm',
  sm: 'text-[0.625rem]',
  md: 'text-sm',
  lg: 'text-[length:var(--ptah-ring-center-lg,1.125rem)]',
  xl: 'text-[length:var(--ptah-ring-center-xl,1.375rem)]',
};
/** Sub text is too small for xs, stat and sm. */
const SUB: Readonly<Record<PtahRingSize, string>> = {
  xs: 'hidden',
  stat: 'hidden',
  row: 'text-xs',
  sm: 'hidden',
  md: 'text-[0.5rem]',
  lg: 'text-[0.625rem]',
  xl: 'text-xs',
};
const TEXT_WEIGHT = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
} as const;
type RingTextWeight = keyof typeof TEXT_WEIGHT;

/**
 * Ring owner (TASK_2026_976_2421). A circular meter: the arc uses a path
 * length of 100, so the dash length is the percent. The value is always
 * text beside the ring, and `showValue` adds the percent in the center.
 *
 * `bare` renders the SVG only: no text, `aria-hidden="true"`, no role.
 * `centerOnly` hides the side text while keeping the ring role and center text.
 * `centerText` replaces the center percent. `subText` is a small second line
 * below it, in the center. It shows at md and larger. Custom text is also the
 * `aria-valuetext` of a ranged ring. `valueText` replaces the side text and
 * `aria-valuetext`. `indeterminate` is a pulsing `progressbar` without
 * `aria-valuenow`.
 *
 * Sizes are a named scale. `xs`, `stat`, `sm`, `row` and `md` are 24, 32, 40, 56 and 64 px. `lg` and
 * `xl` read `--ptah-ring-size-*` (96 and 112 px). The SVG geometry is a fixed
 * viewBox and scales with the box. At `stat`, percent labels wider than two
 * digits are omitted; custom center text should be short enough to fit 32 px.
 *
 * Test hook: put `data-testid` on the host `<ptah-ring>`. There is no input for it.
 */
@Component({
  selector: 'ptah-ring', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="inline-flex items-center gap-2 text-xs" [attr.aria-hidden]="bare() ? 'true' : null" [attr.role]="ariaRole()" [attr.aria-label]="ariaRole() ? (ariaLabel() ?? label()) : null" [attr.aria-valuemin]="ranged() ? 0 : null" [attr.aria-valuemax]="ranged() ? max() : null" [attr.aria-valuenow]="ranged() ? ariaNow() : null" [attr.aria-valuetext]="ariaValueText()">
    <span class="relative inline-flex shrink-0 items-center justify-center" [class]="boxClass()" [style.width]="boxSize()" [style.height]="boxSize()">
      <svg class="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle class="text-[var(--ptah-ring-track,var(--surface-border-strong))]" [style.color]="trackColor()" cx="18" cy="18" [attr.r]="radius()" fill="none" stroke="currentColor" [attr.stroke-width]="stroke()" />
        @if (indeterminate() && pulseStyle() === 'arc') { <circle class="animate-pulse motion-reduce:animate-none" [class]="inkClass()" [style.color]="arcColor()" cx="18" cy="18" [attr.r]="radius()" fill="none" stroke="currentColor" [attr.stroke-width]="stroke()" stroke-linecap="round" pathLength="100" stroke-dasharray="25 100" /> }
        @else if (!indeterminate() && valid()) { <circle class="transition-[stroke-dasharray] motion-reduce:transition-none" [class]="inkClass()" [class.fade-arc]="fadeArc()" [style.color]="arcColor()" cx="18" cy="18" [attr.r]="radius()" fill="none" stroke="currentColor" [attr.stroke-width]="stroke()" stroke-linecap="round" pathLength="100" [attr.stroke-dasharray]="arc() + ' 100'" [attr.opacity]="hideZeroArc() && arc() === 0 ? 0 : null" /> }
      </svg>
      @if (indeterminate() && pulseStyle() === 'core') { <span class="ring-pulse" [class.has-sub]="!!subText()" [class]="inkClass()" [style.color]="arcColor()" aria-hidden="true"></span> }
      @if (!bare() && (showValue() || centerOnly()) && (centerLabel() !== null || subText())) {
        <span class="absolute inset-0 flex flex-col items-center justify-center tabular-nums" [class.leading-none]="!!subText()" [class]="centerClass()" [class.core-pulse-center]="indeterminate() && pulseStyle() === 'core'" aria-hidden="true">
          @if (centerLabel() !== null) { <span [class]="centerWeightClass()" [style.font-size]="centerTextSize()" [style.color]="centerTextColor()">{{ centerLabel() }}</span> }
          @if (subText()) { <span [class]="subClass()" [style.font-size]="subTextSize()" [style.color]="subTextColor()" [style.margin-top]="subTextGap()">{{ subText() }}</span> }
        </span>
      }
    </span>
    @if (!bare() && !centerOnly()) {
      <span class="flex flex-col"><span>{{ label() }}</span><span class="tabular-nums">@if (indeterminate()) { {{ valueText() ?? 'In progress' }} } @else if (valid()) { {{ visibleText() }} } @else { Unavailable }</span></span>
    }
  </div>`,
  styles: [`
    .ring-pulse { position: absolute; inset: 0; margin: auto; width: 0.75rem; height: 0.75rem; pointer-events: none; }
    .ring-pulse::before { content: ''; position: absolute; inset: 22%; border-radius: 9999px; background: currentColor; }
    .ring-pulse::after { content: ''; position: absolute; inset: 0; border: 1.5px solid currentColor; border-radius: 9999px; }
    @media (prefers-reduced-motion: no-preference) {
      .ring-pulse::before { animation: ptah-pulse-core 1.4s ease-in-out infinite; }
      .ring-pulse::after { animation: ptah-pulse-ring 1.4s ease-out infinite; }
    }
    @media (prefers-reduced-motion: reduce) { .ring-pulse::after { display: none; } .ring-pulse::before { opacity: 0.8; } }
    .core-pulse-center > span:last-child { transform: translateY(16px); }
    .ring-pulse.has-sub { transform: translateY(-14px); }
    @media (prefers-reduced-motion: no-preference) { .fade-arc { animation: ptah-ring-fade 600ms var(--ptah-ease-soft, ease-out) both; } }
    @keyframes ptah-ring-fade { from { opacity: 0; } }
  `],
})
export class PtahRingComponent {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly label = input.required<string>();
  readonly unit = input('');
  readonly tone = input<PtahMeterTone>('auto');
  readonly size = input<PtahRingSize>('sm');
  readonly boxSize = input<string | null>(null);
  /** SVG stroke width and radius in the 36 unit viewBox. */
  readonly stroke = input(4);
  readonly radius = input(15);
  /** Optional CSS colors for consumer token equivalence. */
  readonly trackColor = input<string | null>(null);
  readonly arcColor = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly semanticRole = input<'meter' | 'img'>('meter');
  /** Preserve an image role for a consumer's indeterminate core pulse. */
  readonly indeterminateRole = input<'progressbar' | 'img'>('progressbar');
  readonly centerTextSize = input<string | null>(null);
  /** Null preserves the existing inherited weight and class list. */
  readonly centerTextWeight = input<RingTextWeight | null>(null);
  readonly subTextWeight = input<RingTextWeight | null>(null);
  readonly subTextSize = input<string | null>(null);
  readonly centerTextColor = input<string | null>(null);
  readonly subTextColor = input<string | null>(null);
  readonly subTextGap = input<string | null>(null);
  readonly hideZeroArc = input(false);
  readonly fadeArc = input(false);
  /** `core` shows the vitals center pulse; default keeps the quarter arc. */
  readonly pulseStyle = input<'arc' | 'core'>('arc');
  readonly showValue = input(true);
  /** Keep the center text and semantics, but omit the side label and value. */
  readonly centerOnly = input(false);
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
  /** Automatic ink cut-offs in percent; explicit tones ignore them. */
  readonly thresholds = input<PtahRingThresholds>({ warn: NEAR_LIMIT_PERCENT, danger: 100 });

  readonly valid = computed(() => isValidRange(this.value(), this.max()));
  readonly ranged = computed(() => !this.bare() && this.semanticRole() === 'meter' && this.valid() && !this.indeterminate());
  readonly ariaRole = computed(() => {
    if (this.bare()) return null;
    if (this.indeterminate()) return this.indeterminateRole();
    return this.semanticRole() === 'img' || this.valid() ? this.semanticRole() : null;
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
    () => this.centerText() ?? (this.valid() && !this.indeterminate() && (this.size() !== 'stat' || this.rounded() < 10) ? `${this.rounded()}%` : null),
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
  readonly inkClass = computed(() => {
    const tone = this.tone();
    const percent = this.indeterminate() ? 0 : this.percent();
    if (tone !== 'auto') return CHART_TEXT[resolveInk(tone, percent)];
    const provided = this.thresholds();
    const danger = Number.isFinite(provided.danger) ? provided.danger : 100;
    const warn = Math.min(Number.isFinite(provided.warn) ? provided.warn : NEAR_LIMIT_PERCENT, danger);
    return CHART_TEXT[percent >= danger ? 'err' : percent >= warn ? 'warn' : 'gold'];
  });
  readonly boxClass = computed(() => BOX[this.size()]);
  readonly centerClass = computed(() => CENTER[this.size()]);
  readonly centerWeightClass = computed(() => this.centerTextWeight() === null ? '' : TEXT_WEIGHT[this.centerTextWeight()!]);
  readonly subClass = computed(() => this.subTextWeight() === null ? SUB[this.size()] : `${SUB[this.size()]} ${TEXT_WEIGHT[this.subTextWeight()!]}`);
}
