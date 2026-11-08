import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { LucideAngularModule, X } from 'lucide-angular';
import type { ReplaySummary } from './session-sync';

/**
 * The 4.8 "Reconnected" banner. It stays until the user closes it; the
 * numbers help debugging. "No gaps, duplicates removed" is said only once the
 * replay finished in order.
 */
@Component({
  selector: 'ptah-reconnect-banner',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex items-start justify-between gap-3 rounded-box border border-state-done px-4 py-3 text-sm"
      role="status"
      data-testid="reconnect-banner"
    >
      <span class="flex min-w-0 flex-col gap-1">
        <span class="font-bold text-base-content">Reconnected</span>
        <span class="text-base-content" data-testid="reconnect-banner-text">{{
          text()
        }}</span>
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
        aria-label="Close reconnect notice"
        data-testid="reconnect-banner-close"
        (click)="dismissed.emit()"
      >
        <lucide-angular [img]="XIcon" class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  `,
})
export class ReconnectBannerComponent {
  public readonly summary = input.required<ReplaySummary>();
  public readonly dismissed = output<void>();

  protected readonly XIcon = X;

  protected readonly text = computed(() => {
    const { fromSeq, toSeq, complete } = this.summary();
    const count = toSeq - fromSeq;
    if (!complete) {
      return `Replaying events from #${fromSeq} while the link was down…`;
    }
    if (count === 0) return 'No events were missed while the link was down.';
    const events = count === 1 ? 'event' : 'events';
    return `Replayed ${count} ${events} from #${fromSeq} to #${toSeq} while the link was down. No gaps, duplicates removed.`;
  });
}
