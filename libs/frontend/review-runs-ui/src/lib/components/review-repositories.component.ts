import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { InboxRowDirective, PtahBadgeDirective, type PtahBadgeTone } from '@ptah-extension/ui';
import type { RepositorySettings } from '@ptah-extension/review-contracts';

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
  imports: [InboxRowDirective, PtahBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="mb-4 text-sm font-semibold">Repositories</h2>
    @if (repositories().length) {
      <div role="listbox" aria-label="Repositories" class="space-y-1">
        <button
          type="button"
          ptahInboxRow
          [selected]="selected() === 'all'"
          (click)="choose.emit('all')"
        >
          <span class="flex w-full items-center gap-2">
            <span class="truncate text-sm font-semibold">All repositories</span>
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
            <span class="flex w-full items-center gap-2">
              <span class="truncate text-sm font-semibold">{{ repo.owner }}/{{ repo.name }}</span>
              <span ptahBadge appearance="outline" size="xs" class="shrink-0" [tone]="tone(repo)">
                <span class="ptah-badge-text">{{ badgeLabel(repo) }}</span>
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

  protected tone(repo: RepositorySettings): PtahBadgeTone {
    if (!repo.enabled) return 'neutral';
    if (repo.publicationPaused) return 'warn';
    return repo.dryRun ? 'info' : 'ok';
  }

  protected badgeLabel(repo: RepositorySettings): string {
    if (!repo.enabled) return 'Disabled';
    if (repo.publicationPaused) return 'Paused';
    return repo.dryRun ? 'Dry run' : 'Live';
  }
}
