import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { Clock, LucideAngularModule } from 'lucide-angular';
import type { SessionActivityOverduePayload } from '@ptah-extension/shared';

/** Advice under the host text. Ptah reports the delay; it never stops the session. */
export const SESSION_OVERDUE_ADVICE =
  'Wait, check the running task, or stop the session yourself. Ptah does not stop it.';

/**
 * SessionOverdueBannerComponent - the host's "no activity" notice for a session.
 *
 * Dumb, display-only component: shows the host `text` and the advice. It has
 * no action: Ptah never stops or aborts the session from here. The parent
 * decides when to show it (the active tab only).
 */
@Component({
  selector: 'ptah-session-overdue-banner',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notice(); as current) {
      <section
        class="relative block px-4 py-2 border-t border-warning/30 bg-warning/5 text-xs"
        data-glass-surface="plate"
        role="status"
        aria-live="polite"
        data-testid="session-overdue-banner"
      >
        <div class="flex items-start gap-2">
          <lucide-angular
            [img]="ClockIcon"
            class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-warning"
            aria-hidden="true"
          />
          <span class="sr-only">Warning: </span>
          <p class="min-w-0 flex-1 text-base-content">
            <span data-testid="session-overdue-text">{{ current.text }}</span>
            <span
              class="block text-base-content-muted"
              data-testid="session-overdue-advice"
              >{{ advice }}</span
            >
          </p>
        </div>
      </section>
    }
  `,
})
export class SessionOverdueBannerComponent {
  /** The overdue notice to show, or `null` for none. */
  readonly notice = input<SessionActivityOverduePayload | null>(null);

  protected readonly ClockIcon = Clock;
  protected readonly advice = SESSION_OVERDUE_ADVICE;
}
