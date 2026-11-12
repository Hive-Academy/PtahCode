import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { PtahMeterTone, PtahRingComponent, PtahRingSize } from '@ptah-extension/ui';

/**
 * ContextRingComponent: the decorative context-window ring. It passes data
 * and a tone to the `ptah-ring` owner (bare mode: no text, hidden from
 * assistive tech). Size 44 maps to the `sm` ring and size 28 to the `xs` ring.
 * Without a tone, the ring turns `warn` from 80 percent and `err` from 95.
 */
@Component({
  selector: 'ptah-context-ring',
  standalone: true,
  imports: [PtahRingComponent],
  host: { 'aria-hidden': 'true' },
  template: `
    <ptah-ring
      [value]="clamped()"
      [max]="100"
      label="Context"
      [bare]="true"
      [size]="ringSize()"
      [tone]="ringTone()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextRingComponent {
  readonly percent = input.required<number>();
  readonly size = input<44 | 28>(44);
  readonly tone = input<'normal' | 'warning'>();
  protected readonly clamped = computed(() =>
    Math.max(0, Math.min(100, this.percent())),
  );
  protected readonly ringSize = computed<PtahRingSize>(() =>
    this.size() === 44 ? 'sm' : 'xs',
  );
  protected readonly ringTone = computed<PtahMeterTone>(() => {
    const tone = this.tone();
    if (tone === 'normal') return 'ok';
    if (tone === 'warning') return 'warn';
    const percent = this.clamped();
    if (percent >= 95) return 'err';
    return percent >= 80 ? 'warn' : 'auto';
  });
}
