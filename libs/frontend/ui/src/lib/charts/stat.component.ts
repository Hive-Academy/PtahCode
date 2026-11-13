import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PtahButtonDirective } from '../button/button.directive';
import { CHART_TEXT } from './chart-geometry';
import { PtahChartSize, PtahChartTone, PtahStatTrend } from './chart.types';

export type PtahStatAppearance = 'card' | 'plain' | 'surface';
export type PtahStatIconPlacement = 'top-end' | 'center-end';
export type PtahStatValueWeight = 'semibold' | 'medium';
export type PtahStatValueWrap = 'none' | 'break-words';
export type PtahStatRadius = 'none' | 'xl' | '2xl';
export type PtahStatHintStyle = 'default' | 'stat-desc';
/** Colour for the value text. `PtahChartTone` uses state tokens. The rest use the theme colours. */
export type PtahStatValueTone =
  | PtahChartTone
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error'
  | 'muted';

/** Whole class names, so Tailwind can see them. */
const VALUE_TONE: Readonly<Record<'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'muted', string>> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  muted: 'text-base-content-muted',
};
type ThemeValueTone = keyof typeof VALUE_TONE;
function isThemeTone(t: PtahStatValueTone): t is ThemeValueTone {
  return t in VALUE_TONE;
}
/** Whether a change is good, bad or neutral for the user. Maps to a tone. */
export type PtahStatPolarity = 'good' | 'bad' | 'neutral';

const POLARITY_TONE: Readonly<Record<PtahStatPolarity, PtahChartTone>> = { good: 'ok', bad: 'err', neutral: 'neutral' };

const GLYPH: Readonly<Record<PtahStatTrend, string>> = { up: '▲', down: '▼', flat: '▬' };
const VALUE_TEXT: Readonly<Record<PtahChartSize, string>> = { xs: 'text-sm', sm: 'text-lg', md: 'text-2xl' };

/**
 * Stat owner (TASK_2026_976_2421). A label, a value as text, and an optional
 * delta. The trend glyph is hidden from assistive tech and a visually hidden
 * word ("up", "down", "flat") carries it, so color is never the only cue.
 * An empty or non-finite value shows `Unavailable` (see `placeholder`).
 * A test hook: put `data-testid` on the `ptah-stat` host element. This is the
 * supported hook. The inner markup is not a stable contract.
 */
@Component({
  selector: 'ptah-stat', standalone: true,
  imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-appearance]': 'appearance()',
    '[class.surface-2]': "appearance() === 'surface'",
    '[class.rounded-xl]': "appearance() === 'surface' && radius() === 'xl'",
    '[class.rounded-2xl]': "appearance() === 'surface' && radius() === '2xl'",
    '[class.p-4]': "appearance() === 'surface'",
    '[class.min-w-0]': "appearance() === 'surface'",
    '[class.overflow-hidden]': "appearance() === 'surface'",
    '[attr.data-icon-placement]': "iconPlacement() === 'center-end' ? 'center-end' : null",
  },
  styles: `
    :host { display: block; }
    :host([data-appearance='card']) {
      padding: var(--ptah-stat-pad-y) var(--ptah-stat-pad-x);
      border: var(--ptah-border-width) solid var(--ptah-stat-border);
      border-radius: var(--ptah-stat-radius);
      background-color: var(--ptah-stat-bg);
    }
    :host { position: relative; }
    :host ::ng-deep [ptahStatIcon] { position: absolute; top: 0.5rem; right: 0.5rem; }
    :host ::ng-deep [ptahStatIcon] + span { padding-right: 1.75rem; }
    :host([data-icon-placement='center-end']) ::ng-deep [ptahStatIcon] {
      top: 50%; right: 1rem; transform: translateY(-50%);
    }
    :host([data-icon-placement='center-end']) > div { padding-right: 2rem; }
  `,
  template: `<div [class]="iconPlacement() === 'center-end' ? 'flex flex-col gap-0' : 'flex flex-col gap-0.5'" [attr.aria-busy]="loading() && !error() ? 'true' : null">
    <ng-content select="[ptahStatIcon]" />
    @switch (headingLevel()) {
      @case (2) { <h2 class="text-xs text-base-content-muted">{{ label() }}</h2> }
      @case (3) { <h3 class="text-xs text-base-content-muted">{{ label() }}</h3> }
      @case (4) { <h4 class="text-xs text-base-content-muted">{{ label() }}</h4> }
      @case (5) { <h5 class="text-xs text-base-content-muted">{{ label() }}</h5> }
      @case (6) { <h6 class="text-xs text-base-content-muted">{{ label() }}</h6> }
      @default { <span class="text-xs text-base-content-muted">{{ label() }}</span> }
    }
    @if (error()) {
      <span class="flex flex-col items-start gap-1" role="alert" data-testid="stat-error">
        <span class="text-xs text-state-err">{{ errorCopy() }}</span>
        <button type="button" ptahButton variant="ghost" size="xs" [attr.aria-label]="'Retry ' + label()"
          data-testid="stat-retry" (click)="retry.emit()">Retry</button>
      </span>
    } @else if (loading()) {
      <span class="flex flex-col gap-1" data-testid="stat-skeleton">
        <span class="sr-only">Loading</span>
        <span class="skeleton h-7 w-16 rounded" aria-hidden="true"></span>
      </span>
    } @else {
    <span class="flex items-baseline gap-2">
      <ng-content select="[ptahStatMedia]" />
      <span class="tabular-nums" [class]="valueClass()">{{ display() }}</span>
      @if (unit() && hasValue()) { <span class="-ml-1 text-xs text-base-content-muted" data-testid="stat-unit">{{ unit() }}</span> }
      @if (polarity(); as p) {
        @if (delta() || trend()) {
          <span class="inline-flex items-baseline gap-1 rounded-full border border-current px-2 text-xs tabular-nums"
            [class]="pillClass()" data-testid="stat-pill">
            @if (trend(); as t) { <span aria-hidden="true">{{ glyph(t) }}</span><span>{{ t }}</span> }
            @if (delta()) { <span>{{ delta() }}</span> }
            <span class="sr-only">, {{ p }}</span>
          </span>
        }
      } @else if (delta() || trend()) {
        <span class="inline-flex items-baseline gap-1 text-xs tabular-nums" [class]="toneClass()">
          @if (trend(); as t) { <span aria-hidden="true">{{ glyph(t) }}</span><span class="sr-only">{{ t }}</span> }
          @if (delta()) { <span>{{ delta() }}</span> }
        </span>
      }
    </span>
    @if (hint()) { <span class="text-xs text-base-content-muted" [class.stat-desc]="hintStyle() === 'stat-desc'">{{ hint() }}</span> }
    <ng-content />
    }
  </div>`,
})
export class PtahStatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly delta = input<string | undefined>(undefined);
  readonly trend = input<PtahStatTrend | undefined>(undefined);
  readonly tone = input<PtahChartTone>('neutral');
  readonly hint = input<string | undefined>(undefined);
  readonly size = input<PtahChartSize>('sm');
  readonly iconPlacement = input<PtahStatIconPlacement>('top-end');
  readonly valueWeight = input<PtahStatValueWeight>('semibold');
  readonly valueWrap = input<PtahStatValueWrap>('none');
  readonly radius = input<PtahStatRadius>('xl');
  readonly hintStyle = input<PtahStatHintStyle>('default');
  /**
   * `card` (default) draws a small card around the stat. `plain` draws none.
   * `surface` uses the `surface-2` class with `rounded-xl` and `p-4`, as the
   * stat tiles of the settings pages do.
   */
  readonly appearance = input<PtahStatAppearance>('card');

  /** Text after the value ("ms"). Shown only when the value is available. */
  readonly unit = input<string | undefined>(undefined);
  /** Draws a skeleton in place of the value. */
  readonly loading = input<boolean>(false);
  /**
   * Safe presentation copy only (for example "Could not load."). The stat shows
   * this text and nothing else. Never pass a raw Error, a message from a
   * server, or a stack or file path: log those elsewhere. A value that is not
   * a string shows generic copy. The text replaces the value and shows a Retry
   * button.
   */
  readonly error = input<string | undefined>(undefined);
  /**
   * Heading level (2 to 6) for the label. By default the label is a `span`.
   * When set, the label is the matching heading element with the same classes.
   */
  readonly headingLevel = input<2 | 3 | 4 | 5 | 6 | undefined>(undefined);
  /**
   * Formats the value. Pass a function, or `Intl.NumberFormat` options that
   * apply to numeric values. By default the value shows as `String(value)`.
   */
  readonly valueFormat = input<((value: string | number) => string) | Intl.NumberFormatOptions | undefined>(undefined);
  /**
   * Colour of the value text. By default the value keeps the body colour.
   * A media element (a ring or a chart) goes in the `[ptahStatMedia]` slot, before the value.
   */
  readonly valueTone = input<PtahStatValueTone | undefined>(undefined);
  /** Text shown when the value is unavailable. */
  readonly placeholder = input<string>('Unavailable');
  /** Polarity of the change. When set, the delta and trend show as a pill. */
  readonly polarity = input<PtahStatPolarity | undefined>(undefined);
  /** The user pressed Retry in the error state. */
  readonly retry = output<void>();

  readonly hasValue = computed(() => {
    const v = this.value();
    return typeof v === 'number' ? Number.isFinite(v) : v.trim() !== '';
  });
  readonly display = computed(() => {
    if (!this.hasValue()) return this.placeholder();
    const v = this.value();
    const fmt = this.valueFormat();
    if (typeof fmt === 'function') return fmt(v);
    if (fmt && typeof v === 'number') return new Intl.NumberFormat(undefined, fmt).format(v);
    return String(v);
  });
  /** The error text to show. Only a string passes. Any other value gives generic copy. */
  readonly errorCopy = computed(() => {
    const e: unknown = this.error();
    return typeof e === 'string' ? e : 'Something went wrong.';
  });
  readonly pillClass = computed(() => CHART_TEXT[POLARITY_TONE[this.polarity() ?? 'neutral']]);
  readonly valueClass = computed(() => {
    const t = this.valueTone();
    const color = t === undefined ? '' : isThemeTone(t) ? VALUE_TONE[t] : CHART_TEXT[t];
    const weight = this.valueWeight() === 'medium' ? 'font-medium' : 'font-semibold';
    const wrap = this.valueWrap() === 'break-words' ? 'min-w-0 break-words' : '';
    return [weight, VALUE_TEXT[this.size()], color, wrap].filter(Boolean).join(' ');
  });
  readonly toneClass = computed(() => CHART_TEXT[this.tone()]);

  glyph(trend: PtahStatTrend): string {
    return GLYPH[trend];
  }
}
