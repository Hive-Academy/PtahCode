import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PtahMeterComponent } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-step-meter',
  standalone: true,
  imports: [PtahMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ptah-meter
      [value]="value()"
      [max]="100"
      [label]="label()"
      [valueText]="valueText()"
      tone="accent"
      size="md"
      barRole="progressbar"
    />
  `,
})
export class StepMeterComponent {
  readonly label = input.required<string>();
  readonly percent = input.required<number>();
  protected readonly value = computed(() => Math.max(0, Math.min(100, Number.isFinite(this.percent()) ? Math.round(this.percent()) : 0)));
  protected readonly valueText = computed(() => `${this.value()}%`);
}
