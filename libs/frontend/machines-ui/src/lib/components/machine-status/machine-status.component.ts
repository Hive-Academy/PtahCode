import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { MachineConnectionState } from '@ptah-extension/shared';
import { MACHINE_STATE_LABELS } from '../../utils/machine-copy';

/**
 * Ink of each machine state (approved state map, machines-ux.md): Connected
 * done, Reconnecting run, Offline idle, Version mismatch need, Not paired err.
 * One map serves the list rows and the detail header.
 */
export const MACHINE_STATE_INK: Readonly<
  Record<MachineConnectionState, string>
> = {
  connected: 'text-state-done',
  offline: 'text-state-idle',
  reconnecting: 'text-state-run',
  'version-mismatch': 'text-state-need',
  unpaired: 'text-state-err',
};

/**
 * Machine state marker: a shape plus a text label, in the state's ink
 * (design 4.5, D5). Never colour alone, and never a button.
 *
 * Shapes: Connected filled circle, Offline hollow circle, Reconnecting open
 * ring that turns (static under reduced motion), Version mismatch filled
 * triangle, Not paired dashed circle.
 */
@Component({
  selector: 'ptah-machine-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex min-w-0' },
  template: `
    <span
      class="inline-flex items-center gap-1.5 text-xs font-medium"
      [class]="ink()"
      [attr.data-state]="state()"
      data-testid="machine-status"
    >
      <svg
        class="h-2.5 w-2.5 shrink-0 motion-reduce:animate-none"
        [class.animate-spin]="state() === 'reconnecting'"
        viewBox="0 0 10 10"
        aria-hidden="true"
        [attr.data-marker]="state()"
      >
        @switch (state()) {
          @case ('connected') {
            <circle cx="5" cy="5" r="4.5" fill="currentColor" />
          }
          @case ('offline') {
            <circle
              cx="5"
              cy="5"
              r="3.75"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            />
          }
          @case ('reconnecting') {
            <path
              d="M5 1.25 A3.75 3.75 0 1 1 1.25 5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          }
          @case ('version-mismatch') {
            <path d="M5 0.5 L9.5 9.5 L0.5 9.5 Z" fill="currentColor" />
          }
          @case ('unpaired') {
            <circle
              cx="5"
              cy="5"
              r="3.75"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-dasharray="2 1.5"
            />
          }
        }
      </svg>
      <span class="truncate">{{ text() }}</span>
    </span>
  `,
})
export class MachineStatusComponent {
  public readonly state = input.required<MachineConnectionState>();
  /** Overrides the default label, e.g. "Running (last known)". */
  public readonly label = input<string | null>(null);

  protected readonly ink = computed(() => MACHINE_STATE_INK[this.state()]);
  protected readonly text = computed(
    () => this.label() ?? MACHINE_STATE_LABELS[this.state()],
  );
}
