import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { Info, LucideAngularModule, Shield } from 'lucide-angular';
import { ComposerGatedControlDirective } from './composer-gated-control.directive';

/**
 * A lane's approval chip (D11): main chat's approval-chip look (shield, mode
 * label, `h-7 px-2 rounded-md text-xs`), but read-only. A lane's permission
 * mode is set at spawn, so the chip is always `aria-disabled`, shows the
 * lane's effective mode ("Auto" on a lane that never asks, never a claimed
 * "Ask") and carries the backend's reason through the gated-control rule.
 * While the lane options load it reads "Checking" with a spinner.
 */
@Component({
  selector: 'ptah-lane-approval-chip',
  standalone: true,
  imports: [LucideAngularModule, ComposerGatedControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="approval-chip inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium min-w-0 text-state-idle transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))]"
      [ptahComposerGated]="effectiveReason()"
      (reasonRevealed)="reasonRevealed.emit($event)"
      (reasonCleared)="reasonCleared.emit()"
      [attr.aria-label]="'Approval mode: ' + label()"
      data-testid="lane-approval-chip"
    >
      @if (pending()) {
        <span
          class="loading loading-spinner loading-xs"
          aria-hidden="true"
        ></span>
      } @else {
        <lucide-angular
          [img]="ShieldIcon"
          class="w-3.5 h-3.5 flex-shrink-0"
          aria-hidden="true"
        />
      }
      <span class="ptah-composer-label truncate">{{ label() }}</span>
      <lucide-angular
        [img]="InfoIcon"
        class="w-3 h-3 flex-shrink-0 text-base-content-muted"
        aria-hidden="true"
      />
    </button>
  `,
})
export class LaneApprovalChipComponent {
  /** The lane's effective mode label from the capability statement, e.g. "Auto". */
  readonly label = input.required<string>();
  /** Why the mode cannot change here (backend copy). */
  readonly reason = input<string | null | undefined>(null);
  /** The lane options are still loading: spinner in place of the shield. */
  readonly pending = input<boolean>(false);

  /** For the status line: the chip was clicked, focused or hovered. */
  readonly reasonRevealed = output<string>();
  /** Focus or the pointer left the chip. */
  readonly reasonCleared = output<void>();

  /**
   * The chip is never actionable on a lane, so it is always gated. Without a
   * backend reason it still says why, from the label it shows.
   */
  protected readonly effectiveReason = computed(() => {
    const reason = this.reason()?.trim();
    return reason
      ? reason
      : `Approval mode: ${this.label()}. Set when the lane starts.`;
  });

  protected readonly ShieldIcon = Shield;
  protected readonly InfoIcon = Info;
}
