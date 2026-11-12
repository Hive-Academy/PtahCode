import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {
  InboxLayoutComponent,
  PtahButtonDirective,
  PtahInputDirective,
  PtahSelectDirective,
} from '@ptah-extension/ui';
import { ReviewStateSchema } from '@ptah-extension/review-contracts';
import { ReviewRunsStore } from '../review-runs.store';
import { ReviewPageHeaderComponent } from './review-page-header.component';
import { ReviewRepositoriesComponent } from './review-repositories.component';
import { ReviewRunsListComponent } from './review-runs-list.component';
import { ReviewRunDetailComponent } from './review-run-detail.component';
import { ReviewSettingsDrawerComponent } from './review-settings-drawer.component';
import { ReviewConfirmDialogComponent } from './review-confirm-dialog.component';

/**
 * Reviews page shell (approved option A): header, banners and the shared
 * three-pane `ptah-inbox-layout` — repositories 240 px, runs 340 px, fluid
 * detail. Below 768 px exactly one pane shows; closing the detail returns to
 * the list. The run detail is a plain pane (a labelled region,
 * no drawer chrome, no focus trap); PR #1040 owns its findings content.
 */
@Component({
  selector: 'ptah-review-runs-page',
  standalone: true,
  imports: [
    InboxLayoutComponent,
    ReviewPageHeaderComponent,
    ReviewRepositoriesComponent,
    ReviewRunsListComponent,
    ReviewRunDetailComponent,
    ReviewSettingsDrawerComponent,
    ReviewConfirmDialogComponent,
    PtahButtonDirective,
    PtahInputDirective,
    PtahSelectDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <main
      class="mx-auto flex h-full w-full max-w-[1600px] min-h-0 flex-col gap-4 p-4 min-[768px]:p-6"
    >
      <ptah-review-page-header
        [paused]="store.settings()?.globalPublicationPaused ?? false"
        [pauseAvailable]="store.settings() !== null"
        [pauseSaving]="store.pauseSaving()"
        [refreshing]="store.isRefreshing()"
        [lastRefreshedAt]="store.lastRefreshedAt()"
        (pauseRequested)="pausePublication()"
        (resumeRequested)="pauseOffConfirmation.set(true)"
        (refresh)="store.refresh()"
        (openSettings)="openSettings()"
      />
      @if (store.pauseError()) {
        <div class="alert alert-error" role="alert">
          Publication pause could not be updated.
        </div>
      }
      @if (store.poll()?.status === 'failed' || store.refreshError()) {
        <div class="alert alert-warning" role="alert">
          <span
            >{{ store.refreshErrorMessage() ?? 'The last review poll failed. Review runs may be out of date.' }}</span
          ><button
            type="button"
            class="btn btn-ghost btn-sm"
            aria-label="Retry with Refresh"
            (click)="store.refresh()"
          >
            Retry with Refresh
          </button>
        </div>
      }
      @if (store.state() === 'offline') {
        <div class="alert alert-warning" role="alert">
          <span
            >Review service is unavailable. Showing cached runs from
            {{ store.lastRefreshedAt()?.toLocaleString() }}. Live publication
            status is unavailable.</span
          ><button class="btn btn-ghost btn-sm" (click)="store.load()">
            Retry connection
          </button>
        </div>
      } @else if (store.state() === 'error') {
        <div class="alert alert-error" role="alert">
          <span>Review history could not be loaded.</span
          ><button class="btn btn-ghost btn-sm" (click)="store.load()">
            Retry
          </button>
        </div>
      } @else if (store.state() === 'no-lanes') {
        <div class="alert alert-warning" role="alert">
          No lanes available. Review has not produced a clean result.
        </div>
      }
      <ptah-inbox-layout
        class="min-h-0 flex-1"
        listLabel="Runs"
        detailLabel="Review run detail"
        leadingLabel="Repositories"
        [hasLeading]="true"
        [leadingWidth]="240"
        [listWidth]="340"
        [detailOpen]="store.selectedRun() !== null"
      >
        <ng-container inboxLeading>
          <ptah-review-repositories
            [repositories]="store.repositories()"
            [selected]="store.repoFilter()"
            [runCount]="store.runs().length"
            (choose)="store.setRepoFilter($event)"
          />
        </ng-container>
        <ng-container inboxList>
          <section
            aria-label="Review runs list"
            [attr.aria-busy]="store.isRefreshing()"
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Runs</h2>
              <span class="text-xs text-base-content-muted">
                {{ store.queuedCount() }} queued
              </span>
            </div>
            <div class="mb-3 min-[1200px]:hidden">
              <label class="sr-only" for="review-repo-filter">Repository</label>
              <select
                id="review-repo-filter"
                ptahSelect class="w-full"
                [value]="store.repoFilter()"
                (change)="setRepo($event)"
              >
                <option value="all">All repositories</option>
                @for (
                  repo of store.repositories();
                  track repo.owner + '/' + repo.name
                ) {
                  <option [value]="repo.owner + '/' + repo.name">
                    {{ repo.owner }}/{{ repo.name }}
                  </option>
                }
              </select>
            </div>
            <div class="mb-3">
              <label class="sr-only" for="review-state-filter">State</label>
              <select
                id="review-state-filter"
                ptahSelect class="w-full"
                [value]="store.stateFilter()"
                (change)="setState($event)"
              >
                <option value="all">All states</option>
                @for (status of statuses; track status) {
                  <option [value]="status">{{ status }}</option>
                }
              </select>
            </div>
            <input
              type="text"
              ptahInput
              class="mb-4 w-full"
              aria-label="Search runs"
              placeholder="Search runs"
              [value]="store.searchQuery()"
              (input)="setSearch($event)"
            />
            @if (store.state() === 'loading' && !store.hasCache()) {
              <div
                class="space-y-3"
                role="status"
                aria-label="Loading review runs"
              >
                <div class="skeleton h-12 w-full"></div>
                <div class="skeleton h-12 w-full"></div>
                <div class="skeleton h-12 w-full"></div>
              </div>
            } @else if (store.state() === 'no-lanes') {
              <div class="py-8 text-center text-sm text-base-content-muted">
                Check lane availability in settings.
              </div>
            } @else if (store.filteredRuns().length) {
              <ptah-review-runs-list
                [runs]="store.filteredRuns()"
                [selectedAttemptId]="store.selectedAttemptId()"
                (open)="store.selectRun($event)"
              />
            } @else if (store.runs().length) {
              <div class="py-8 text-center">
                <p class="font-semibold">No matching runs</p>
                <p class="text-sm text-base-content-muted">
                  Try another repository or state.
                </p>
                <button
                  ptahButton
                  variant="ghost"
                  class="mt-3"
                  (click)="store.clearFilters()"
                >
                  Clear filters
                </button>
              </div>
            } @else if (store.state() !== 'error') {
              <div class="py-8 text-center">
                <p class="font-semibold">No review runs yet</p>
                <p class="text-sm text-base-content-muted">
                  Runs will appear after the next poll.
                </p>
                <button
                  ptahButton
                  variant="ghost"
                  class="mt-3"
                  (click)="store.load()"
                >
                  Refresh
                </button>
              </div>
            }
            @if (
              store.runs().length &&
              store.nextCursor() !== null &&
              store.state() !== 'no-lanes'
            ) {
              <!-- Also shown with "No matching runs": a later page can hold a match. -->
              <button
                type="button"
                ptahButton
                variant="ghost"
                class="mt-4 w-full"
                data-testid="review-runs-load-more"
                [disabled]="store.loadingMore()"
                (click)="loadMore()"
              >
                Load more
              </button>
              @if (store.loadMoreError()) {
                <p class="mt-2 text-xs text-base-content-muted" role="alert">
                  More runs could not be loaded.
                </p>
              }
            }
          </section>
        </ng-container>
        @if (store.selectedRun(); as run) {
          <div>
            <ptah-review-run-detail
              [run]="run"
              [loadState]="store.detailState()"
              [findings]="store.findings()"
              [findingsState]="store.findingsState()"
              (retry)="store.loadRun(run.attemptId)"
              (retryFindings)="store.reloadFindings()"
              (closed)="store.closeRun()"
            />
          </div>
        } @else {
          <div
            class="flex min-h-48 items-center justify-center text-sm text-base-content-muted"
          >
            Select a run to see its findings.
          </div>
        }
      </ptah-inbox-layout>
      @if (settingsOpen()) {
        <ptah-review-settings-drawer
          [repository]="store.repositories()[0] ?? null"
          [settings]="store.settings()"
          [draft]="store.draftSettings()"
          [hasToken]="store.hasToken()"
          [saving]="store.settingsSaving()"
          [saveError]="store.settingsSaveError()"
          [loadState]="store.settingsState()"
          (changed)="store.updateDraft($event)"
          (save)="store.saveSettings()"
          (retry)="store.loadSettings()"
          (closed)="settingsOpen.set(false)"
        />
      }
      @if (pauseOffConfirmation()) {
        <ptah-review-confirm-dialog
          dialogId="review-page-resume-confirm"
          title="Resume live publication?"
          description="Turning pause off can allow eligible pull requests to receive comments. CodeRabbit remains enabled."
          confirmLabel="Resume publication"
          (cancelled)="pauseOffConfirmation.set(false)"
          (confirmed)="confirmPauseOff()"
        />
      }
    </main>
  `,
})
export class ReviewRunsPageComponent implements OnInit {
  readonly store = inject(ReviewRunsStore);
  readonly settingsOpen = signal(false);
  readonly pauseOffConfirmation = signal(false);
  readonly statuses = ReviewStateSchema.options;
  openSettings(): void {
    this.settingsOpen.set(true);
    void this.store.loadSettings();
  }
  ngOnInit(): void {
    void this.store.load();
    void this.store.loadSettings();
  }
  pausePublication(): void {
    void this.store.setPublicationPause(true);
  }
  confirmPauseOff(): void {
    this.pauseOffConfirmation.set(false);
    void this.store.setPublicationPause(false, true);
  }
  setRepo(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement)
      this.store.setRepoFilter(target.value);
  }
  setState(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.value === 'all') this.store.setStateFilter('all');
    else {
      const state = ReviewStateSchema.safeParse(target.value);
      if (state.success) this.store.setStateFilter(state.data);
    }
  }
  setSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.store.setSearch(target.value);
  }
  loadMore(): void {
    void this.store.loadMore();
  }
}
