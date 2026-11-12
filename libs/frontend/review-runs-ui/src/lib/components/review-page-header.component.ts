import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';

/**
 * Header of the Reviews page (approved Inbox design, TASK_2026_UX_REVIEWS_MACHINES
 * option A): title, publication state chip, and the page actions.
 *
 * The Pause/Resume button keeps the pause logic of the old "Pause all publication"
 * toggle: the disabled rule is `!settings || pauseSaving`, resume needs the page's
 * confirm dialog, and `pauseError` is the page's banner. The page owns the dialog,
 * so this component only reports the two intents.
 */
@Component({
  selector: 'ptah-review-page-header',
  standalone: true,
  imports: [PtahBadgeDirective, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-wrap items-center gap-3">
      <div class="mr-auto min-w-0">
        <h1 class="text-lg font-semibold tracking-tight text-base-content">
          Reviews
        </h1>
        <p class="text-xs text-base-content-muted">
          Review runs across connected repositories
        </p>
        @if (lastRefreshedAt(); as refreshed) {
          <p class="mt-1 text-xs text-base-content-muted">
            Last refreshed {{ refreshed.toLocaleString() }}
          </p>
        }
      </div>
      <span
        ptahBadge
        appearance="outline"
        class="gap-2 text-xs"
        [class.text-state-done]="!paused()"
        [class.text-state-need]="paused()"
      >
        <span
          class="inline-block h-2 w-2 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        ></span>{{ paused() ? 'Publishing paused' : 'Publishing live' }}
      </span>
      <button
        type="button"
        ptahButton variant="ghost"
        [disabled]="!pauseAvailable() || pauseSaving()"
        (click)="paused() ? resumeRequested.emit() : pauseRequested.emit()"
      >
        {{ paused() ? 'Resume' : 'Pause' }}
      </button>
      <button
        type="button"
        ptahButton variant="ghost"
        aria-label="Refresh review runs"
        [disabled]="refreshing()"
        (click)="refresh.emit()"
      >
        Refresh
      </button>
      <button
        type="button"
        ptahButton variant="ghost"
        (click)="openSettings.emit()"
      >
        Review settings
      </button>
    </header>
  `,
})
export class ReviewPageHeaderComponent {
  /** Global publication pause of the operator settings. */
  readonly paused = input(false);
  /** Settings are loaded; the pause action may call the RPC. */
  readonly pauseAvailable = input(false);
  readonly pauseSaving = input(false);
  readonly refreshing = input(false);
  readonly lastRefreshedAt = input<Date | null>(null);
  readonly pauseRequested = output<void>();
  readonly resumeRequested = output<void>();
  readonly refresh = output<void>();
  readonly openSettings = output<void>();
}
