import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_BG, isValidRange, percentOf, resolveInk } from './chart-geometry';
import { PtahChartSize, PtahMeterTone } from './chart.types';

const TRACK_H: Readonly<Record<PtahChartSize, string>> = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' };
const TEXT: Readonly<Record<PtahChartSize, string>> = { xs: 'text-xs', sm: 'text-xs', md: 'text-sm' };

/**
 * Meter owner (TASK_2026_976_2421). A labelled bar with its value as text, so
 * color is never the only cue. Invalid data shows `Unavailable` and no ARIA
 * value. A value over the max fills the bar and keeps the real value in text.
 * `indeterminate` is a `progressbar` without `aria-valuenow`.
 */
@Component({
  selector: 'ptah-meter', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="textClass()"><div class="mb-1 flex justify-between gap-2"><span>{{ label() }}</span><span class="tabular-nums" [class.sr-only]="!showValue()">@if (indeterminate()) { In progress } @else if (valid()) { {{ valueText() }} } @else { Unavailable }</span></div>
    <div class="overflow-hidden rounded-full bg-[var(--surface-border-strong)]" [class]="trackClass()" [attr.role]="role()" [attr.aria-label]="role() ? label() : null" [attr.aria-valuemin]="ranged() ? 0 : null" [attr.aria-valuemax]="ranged() ? max() : null" [attr.aria-valuenow]="ranged() ? ariaNow() : null" [attr.aria-valuetext]="ranged() && outOfRange() ? valueText() : null">
      @if (indeterminate()) { <div class="h-full w-1/3 animate-pulse rounded-full motion-reduce:animate-none" [class]="fillClass()"></div> } @else if (valid()) { <div class="h-full rounded-full transition-[width] motion-reduce:transition-none" [class]="fillClass()" [style.width.%]="width()"></div> }
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

  readonly valid = computed(() => isValidRange(this.value(), this.max()));
  readonly ranged = computed(() => this.valid() && !this.indeterminate());
  readonly role = computed(() => (this.indeterminate() ? 'progressbar' : this.valid() ? 'meter' : null));
  readonly clampedValue = computed(() => Math.max(0, this.value()));
  readonly ariaNow = computed(() => Math.min(this.max(), this.clampedValue()));
  readonly percent = computed(() => percentOf(this.value(), this.max()));
  readonly width = computed(() => Math.min(100, this.percent()));
  /** Over the max or negative: `aria-valuenow` is clamped, so the real value goes in `aria-valuetext`. */
  readonly outOfRange = computed(() => this.value() < 0 || this.percent() > 100);
  readonly valueText = computed(() => `${this.value()}${this.unit()} / ${this.max()}${this.unit()}`);
  readonly fillClass = computed(() => CHART_BG[resolveInk(this.tone(), this.indeterminate() ? 0 : this.percent())]);
  readonly trackClass = computed(() => TRACK_H[this.size()]);
  readonly textClass = computed(() => TEXT[this.size()]);
}
