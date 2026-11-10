import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { InboxRowDirective } from '@ptah-extension/ui';
import type { RepositorySettings } from '@ptah-extension/review-contracts';

/**
 * Ink of each publication state (approved option A): Live done, Dry run run,
 * Paused need, Disabled idle. The app has no standalone `state-*` classes, so
 * the badge takes its ink from the `text-state-*` Tailwind color utilities.
 */
const REPOSITORY_BADGE_INK = {
  live: 'text-state-done',
  dryRun: 'text-state-run',
  paused: 'text-state-need',
  disabled: 'text-state-idle',
} as const;

/**
 * Repository list of the Reviews page leading pane (approved option A). The
 * rows are options of a `role="listbox"`: the shared `ptahInboxRow` directive
 * owns the option semantics, the focus ring and the gold active line. The
 * first option is "All repositories"; the pane itself comes from
 * `ptah-inbox-layout`, so no second surface wrapper belongs here.
 */
@Component({
  selector: 'ptah-review-repositories',
  standalone: true,
  imports: [InboxRowDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">Repositories</h2>
      <span class="text-xs text-base-content-muted">{{ repositories().length }}</span>
    </div>
    @if (repositories().length) {
      <div role="listbox" aria-label="Repositories" class="space-y-1">
        <button
          type="button"
          ptahInboxRow
          [selected]="selected() === 'all'"
          (click)="choose.emit('all')"
        >
          <span class="flex w-full items-center justify-between gap-2">
            <span class="truncate text-sm font-medium">All repositories</span>
            <span class="shrink-0 text-xs text-base-content-muted">{{ runCount() }}</span>
          </span>
        </button>
        @for (repo of repositories(); track repo.owner + '/' + repo.name) {
          <button
            type="button"
            ptahInboxRow
            [selected]="selected() === repo.owner + '/' + repo.name"
            (click)="choose.emit(repo.owner + '/' + repo.name)"
          >
            <span class="flex w-full items-center justify-between gap-2">
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{{ repo.owner }}/{{ repo.name }}</span>
                <span class="block text-xs text-base-content-muted">{{ repo.enabled ? 'Review enabled' : 'Review disabled' }}</span>
              </span>
              <span class="badge badge-outline shrink-0 text-xs" [class]="ink(repo)">
                {{ badgeLabel(repo) }}
              </span>
            </span>
          </button>
        }
      </div>
    } @else {
      <div class="py-8 text-center">
        <p class="font-medium">No repositories</p>
        <p class="mt-1 text-sm text-base-content-muted">Add an allowed repository in review settings.</p>
      </div>
    }
  `,
})
export class ReviewRepositoriesComponent {
  readonly repositories = input.required<readonly RepositorySettings[]>();
  readonly selected = input.required<string>();
  /** Loaded review runs; shown as the count of the "All repositories" row. */
  readonly runCount = input(0);
  readonly choose = output<string>();

  protected ink(repo: RepositorySettings): string {
    if (!repo.enabled) return REPOSITORY_BADGE_INK.disabled;
    if (repo.publicationPaused) return REPOSITORY_BADGE_INK.paused;
    return repo.dryRun ? REPOSITORY_BADGE_INK.dryRun : REPOSITORY_BADGE_INK.live;
  }

  protected badgeLabel(repo: RepositorySettings): string {
    if (!repo.enabled) return 'Disabled';
    if (repo.publicationPaused) return 'Paused';
    return repo.dryRun ? 'Dry run' : 'Live';
  }
}
