import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { SESSION_SYNC_LABELS, type SessionSyncState } from './session-sync';

/**
 * The header chip of 4.8: "Caught up", "Catching up..." with the
 * reconnecting marker, or "Fetching missing events" while a gap's replay is
 * out. A hint, never a button.
 */
@Component({
  selector: 'ptah-session-sync-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="badge badge-outline badge-sm gap-1 text-base-content"
      [class.text-state-done]="state() === 'caught-up'"
      data-testid="session-sync-chip"
      [attr.data-state]="state()"
    >
      @if (state() !== 'caught-up') {
        <span
          class="inline-block h-2 w-2 animate-spin rounded-full border border-current border-t-transparent motion-reduce:animate-none"
          aria-hidden="true"
        ></span>
      }
      {{ label() }}
    </span>
  `,
})
export class SessionSyncChipComponent {
  public readonly state = input.required<SessionSyncState>();
  protected readonly label = computed(() => SESSION_SYNC_LABELS[this.state()]);
}
