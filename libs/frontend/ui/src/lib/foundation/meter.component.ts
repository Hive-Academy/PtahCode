import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NEAR_LIMIT_PERCENT } from '@ptah-extension/shared';

@Component({
  selector: 'ptah-meter', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="text-xs"><div class="mb-1 flex justify-between gap-2"><span>{{ label() }}</span><span class="tabular-nums">@if (valid()) { {{ value() }}{{ unit() }} / {{ max() }}{{ unit() }} } @else { Unavailable }</span></div>
    <div class="h-1.5 overflow-hidden rounded-full bg-[var(--surface-border-strong)]" [attr.role]="valid() ? 'meter' : null" [attr.aria-label]="valid() ? label() : null" [attr.aria-valuemin]="valid() ? 0 : null" [attr.aria-valuemax]="valid() ? max() : null" [attr.aria-valuenow]="valid() ? clampedValue() : null">
      @if (valid()) { <div class="h-full rounded-full transition-[width] motion-reduce:transition-none" [class]="percent() >= 100 ? 'bg-state-err' : percent() >= NEAR_LIMIT_PERCENT ? 'bg-state-need' : 'bg-[var(--ptah-gold)]'" [style.width.%]="width()"></div> }
    </div>
  </div>`,
})
export class PtahMeterComponent {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly label = input.required<string>();
  readonly unit = input('');
  readonly NEAR_LIMIT_PERCENT = NEAR_LIMIT_PERCENT;
  readonly valid = computed(() => Number.isFinite(this.value()) && Number.isFinite(this.max()) && this.max() > 0);
  readonly clampedValue = computed(() => Math.max(0, this.value()));
  readonly percent = computed(() => this.valid() ? (this.clampedValue() / this.max()) * 100 : 0);
  readonly width = computed(() => Math.min(100, this.percent()));
}
