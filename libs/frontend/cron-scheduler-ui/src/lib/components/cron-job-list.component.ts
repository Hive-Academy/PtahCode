import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ScheduledJobDto } from '@ptah-extension/shared';
import {
  PtahBadgeDirective,
  PtahSectionHeaderComponent,
  PtahSkeletonComponent,
  PtahStatePanelComponent,
  PtahSurfaceDirective,
  PtahToolbarComponent,
} from '@ptah-extension/ui';

import { CronExpressionService } from '../services/cron-expression.service';
import { CRON_JOB_LIST_ID } from './cron-header-band.component';
import { CronJobCardComponent } from './cron-job-card.component';

/** The search field appears only above this many jobs. */
export const CRON_JOB_SEARCH_THRESHOLD = 6;

const SKELETON_ROWS: readonly number[] = [0, 1, 2];

/**
 * The "Scheduled jobs" region: one surface holding the section header, search
 * (large lists only), loading skeletons, empty state, and the job rows.
 * Presentational: it re-emits each row action with the job (or its id)
 * attached.
 */
@Component({
  selector: 'ptah-cron-job-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CronJobCardComponent,
    PtahBadgeDirective,
    PtahSectionHeaderComponent,
    PtahSkeletonComponent,
    PtahStatePanelComponent,
    PtahSurfaceDirective,
    PtahToolbarComponent,
  ],
  host: { class: 'block' },
  template: `
    <section
      ptahSurface
      variant="surface-1"
      padding="lg"
      class="flex flex-col gap-[var(--ptah-gap-heading)] rounded-xl"
      [id]="listId"
    >
      <div class="flex items-start justify-between gap-[var(--ptah-gap-field)]">
        <div class="min-w-0">
          <ptah-section-header
            heading="Scheduled jobs"
            level="2"
            size="section"
          />
          <p class="text-sm text-base-content-muted">
            Each job starts a headless session with its prompt. Select a job to
            see runs and edit it.
          </p>
        </div>
        @if (jobs().length > 0) {
          <span
            ptahBadge
            tone="neutral"
            class="shrink-0"
            data-testid="cron-job-count"
            >{{ countLabel() }}</span
          >
        }
      </div>

      @if (searchVisible()) {
        <ptah-toolbar
          placeholder="Search jobs by name, schedule or prompt"
          data-testid="cron-job-search"
          [query]="query()"
          [count]="resultCount()"
          (queryChange)="query.set($event)"
        />
      }

      @if (jobs().length === 0) {
        @if (loading()) {
          <div
            class="flex flex-col gap-[var(--ptah-gap-field)]"
            role="status"
            data-testid="cron-job-skeletons"
          >
            <span class="sr-only">Loading scheduled jobs</span>
            @for (row of skeletonRows; track row) {
              <ptah-skeleton shape="block" size="md" />
            }
          </div>
        } @else {
          <ptah-state-panel
            state="empty"
            title="No scheduled jobs yet"
            body="Cron jobs run a prompt on a recurring schedule as a headless PtahCode session — perfect for nightly builds, digests, or maintenance."
            actionLabel="New job"
            data-testid="cron-empty-state"
            (action)="newJob.emit()"
          />
        }
      } @else if (visibleJobs().length === 0) {
        <p
          class="text-sm text-base-content-muted"
          role="status"
          data-testid="cron-no-matches"
        >
          No jobs match “{{ query().trim() }}”.
        </p>
      } @else {
        <div
          class="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-[var(--ptah-gap-field)] px-[var(--ptah-gap-controls)] text-xs text-base-content-muted lg:grid"
          aria-hidden="true"
        >
          <span>Job</span>
          <span>Schedule</span>
          <span>Next run</span>
          <span>Last run</span>
          <span class="w-56"></span>
        </div>
        <ul class="divide-y divide-surface-border" aria-label="Scheduled jobs">
          @for (job of visibleJobs(); track job.id) {
            <li>
              <ptah-cron-job-card
                [job]="job"
                [description]="describe(job.cronExpr)"
                [selected]="selectedJobId() === job.id"
                (opened)="opened.emit(job.id)"
                (runNow)="runNow.emit(job.id)"
                (edit)="edit.emit(job)"
                (toggled)="toggled.emit(job)"
                (removed)="removed.emit(job.id)"
              />
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class CronJobListComponent {
  private readonly cronExpr = inject(CronExpressionService);

  public readonly jobs = input.required<readonly ScheduledJobDto[]>();
  public readonly loading = input<boolean>(false);
  public readonly selectedJobId = input<string | null>(null);

  public readonly opened = output<string>();
  public readonly runNow = output<string>();
  public readonly edit = output<ScheduledJobDto>();
  public readonly toggled = output<ScheduledJobDto>();
  /** The row confirms the delete inline; this fires only after the confirm. */
  public readonly removed = output<string>();
  public readonly newJob = output<void>();

  protected readonly listId = CRON_JOB_LIST_ID;
  protected readonly skeletonRows = SKELETON_ROWS;

  protected readonly query = signal<string>('');

  protected readonly countLabel = computed(() => {
    const count = this.jobs().length;
    return count === 1 ? '1 job' : `${count} jobs`;
  });

  protected readonly searchVisible = computed(
    () => this.jobs().length > CRON_JOB_SEARCH_THRESHOLD,
  );

  /**
   * The query applies only while the search field is on screen, so a list
   * that shrinks under the threshold never stays filtered by a hidden field.
   */
  protected readonly visibleJobs = computed<readonly ScheduledJobDto[]>(() => {
    const jobs = this.jobs();
    const needle = this.query().trim().toLowerCase();
    if (!this.searchVisible() || needle.length === 0) return jobs;
    return jobs.filter(
      (job) =>
        job.name.toLowerCase().includes(needle) ||
        job.cronExpr.toLowerCase().includes(needle) ||
        job.prompt.toLowerCase().includes(needle),
    );
  });

  protected readonly resultCount = computed<number | null>(() =>
    this.query().trim().length === 0 ? null : this.visibleJobs().length,
  );

  protected describe(expr: string): string {
    return this.cronExpr.describe(expr);
  }
}
