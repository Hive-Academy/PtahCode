import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CHART_TEXT } from './chart-geometry';
import { PtahChartSize, PtahChartTone, PtahStatTrend } from './chart.types';

export type PtahStatAppearance = 'card' | 'plain';
/** Whether a change is good, bad or neutral for the user. Maps to a tone. */
export type PtahStatPolarity = 'good' | 'bad' | 'neutral';

const POLARITY_TONE: Readonly<Record<PtahStatPolarity, PtahChartTone>> = { good: 'ok', bad: 'err', neutral: 'neutral' };

const GLYPH: Readonly<Record<PtahStatTrend, string>> = { up: '▲', down: '▼', flat: '▬' };
const VALUE_TEXT: Readonly<Record<PtahChartSize, string>> = { xs: 'text-sm', sm: 'text-lg', md: 'text-2xl' };

/**
 * Stat owner (TASK_2026_976_2421). A label, a value as text, and an optional
 * delta. The trend glyph is hidden from assistive tech and a visually hidden
 * word ("up", "down", "flat") carries it, so color is never the only cue.
 * An empty or non-finite value shows `Unavailable`.
 */
@Component({
  selector: 'ptah-stat', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-appearance]': 'appearance()' },
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
  `,
  template: `<div class="flex flex-col gap-0.5" [attr.aria-busy]="loading() && !error() ? 'true' : null">
    <ng-content select="[ptahStatIcon]" />
    <span class="text-xs text-base-content-muted">{{ label() }}</span>
    @if (error(); as message) {
      <span class="flex flex-col items-start gap-1" role="alert" data-testid="stat-error">
        <span class="text-xs text-state-err">{{ message }}</span>
        <button type="button" class="btn btn-ghost btn-xs" [attr.aria-label]="'Retry ' + label()"
          data-testid="stat-retry" (click)="retry.emit()">Retry</button>
      </span>
    } @else if (loading()) {
      <span class="flex flex-col gap-1" data-testid="stat-skeleton">
        <span class="sr-only">Loading</span>
        <span class="skeleton h-7 w-16 rounded" aria-hidden="true"></span>
      </span>
    } @else {
    <span class="flex items-baseline gap-2">
      <span class="font-semibold tabular-nums" [class]="valueClass()">{{ display() }}</span>
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
    @if (hint()) { <span class="text-xs text-base-content-muted">{{ hint() }}</span> }
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
  /** `card` (default) draws a small card around the stat. `plain` draws none. */
  readonly appearance = input<PtahStatAppearance>('card');

  /** Text after the value ("ms"). Shown only when the value is available. */
  readonly unit = input<string | undefined>(undefined);
  /** Draws a skeleton in place of the value. */
  readonly loading = input<boolean>(false);
  /** Error message. Replaces the value and shows a Retry button. */
  readonly error = input<string | undefined>(undefined);
  /** Polarity of the change. When set, the delta and trend show as a pill. */
  readonly polarity = input<PtahStatPolarity | undefined>(undefined);
  /** The user pressed Retry in the error state. */
  readonly retry = output<void>();

  readonly hasValue = computed(() => {
    const v = this.value();
    return typeof v === 'number' ? Number.isFinite(v) : v.trim() !== '';
  });
  readonly display = computed(() => (this.hasValue() ? String(this.value()) : 'Unavailable'));
  readonly pillClass = computed(() => CHART_TEXT[POLARITY_TONE[this.polarity() ?? 'neutral']]);
  readonly valueClass = computed(() => VALUE_TEXT[this.size()]);
  readonly toneClass = computed(() => CHART_TEXT[this.tone()]);

  glyph(trend: PtahStatTrend): string {
    return GLYPH[trend];
  }
}
