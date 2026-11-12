import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CHART_TEXT, isValidRange, percentOf, resolveInk } from './chart-geometry';
import { PtahChartSize, PtahMeterTone } from './chart.types';

const BOX: Readonly<Record<PtahChartSize, string>> = { xs: 'h-6 w-6', sm: 'h-10 w-10', md: 'h-16 w-16' };
const CENTER: Readonly<Record<PtahChartSize, string>> = { xs: 'hidden', sm: 'text-[0.625rem]', md: 'text-sm' };

/**
 * Ring owner (TASK_2026_976_2421). A circular meter: the arc uses a path
 * length of 100, so the dash length is the percent. The value is always
 * text beside the ring, and `showValue` adds the percent in the center.
 */
@Component({
  selector: 'ptah-ring', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="inline-flex items-center gap-2 text-xs" [attr.role]="valid() ? 'meter' : null" [attr.aria-label]="valid() ? label() : null" [attr.aria-valuemin]="valid() ? 0 : null" [attr.aria-valuemax]="valid() ? max() : null" [attr.aria-valuenow]="valid() ? ariaNow() : null" [attr.aria-valuetext]="valid() && outOfRange() ? valueText() : null">
    <span class="relative inline-flex shrink-0 items-center justify-center" [class]="boxClass()">
      <svg class="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle class="text-[var(--surface-border-strong)]" cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="4" />
        @if (valid()) { <circle class="transition-[stroke-dasharray] motion-reduce:transition-none" [class]="inkClass()" cx="18" cy="18" r="15" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" pathLength="100" [attr.stroke-dasharray]="arc() + ' 100'" /> }
      </svg>
      @if (showValue() && valid()) { <span class="absolute inset-0 flex items-center justify-center tabular-nums" [class]="centerClass()" aria-hidden="true">{{ rounded() }}%</span> }
    </span>
    <span class="flex flex-col"><span>{{ label() }}</span><span class="tabular-nums">@if (valid()) { {{ valueText() }} } @else { Unavailable }</span></span>
  </div>`,
})
export class PtahRingComponent {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly label = input.required<string>();
  readonly unit = input('');
  readonly tone = input<PtahMeterTone>('auto');
  readonly size = input<PtahChartSize>('sm');
  readonly showValue = input(true);

  readonly valid = computed(() => isValidRange(this.value(), this.max()));
  readonly percent = computed(() => percentOf(this.value(), this.max()));
  readonly arc = computed(() => Math.min(100, this.percent()));
  readonly rounded = computed(() => Math.round(this.percent()));
  readonly ariaNow = computed(() => Math.min(this.max(), Math.max(0, this.value())));
  /** Over the max or negative: `aria-valuenow` is clamped, so the real value goes in `aria-valuetext`. */
  readonly outOfRange = computed(() => this.value() < 0 || this.percent() > 100);
  readonly valueText = computed(() => `${this.value()}${this.unit()} / ${this.max()}${this.unit()}`);
  readonly inkClass = computed(() => CHART_TEXT[resolveInk(this.tone(), this.percent())]);
  readonly boxClass = computed(() => BOX[this.size()]);
  readonly centerClass = computed(() => CENTER[this.size()]);
}
