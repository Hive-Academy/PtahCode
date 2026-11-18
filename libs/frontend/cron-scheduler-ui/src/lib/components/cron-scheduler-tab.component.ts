import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CalendarClock, LucideAngularModule } from 'lucide-angular';
import {
  AppStateManager,
  isReviewSurfaceAvailable,
  VSCodeService,
} from '@ptah-extension/core';
import type { ScheduledJobDto } from '@ptah-extension/shared';
import { PtahAlertComponent, PtahButtonDirective } from '@ptah-extension/ui';

import { CronExpressionService } from '../services/cron-expression.service';
import {
  CronStateService,
  type CronScopeFilter,
} from '../services/cron-state.service';
import { CronHeaderBandComponent } from './cron-header-band.component';
import { CronJobDetailDrawerComponent } from './cron-job-detail-drawer.component';
import { CronJobFormComponent } from './cron-job-form.component';
import { CronJobListComponent } from './cron-job-list.component';

/**
 * Shell of the Schedules surface. It owns no markup of its own beyond the
 * layout: the header band, the job list, the form and the detail drawer are
 * child components, and every action goes to `CronStateService`.
 */
@Component({
  selector: 'ptah-cron-scheduler-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    CronHeaderBandComponent,
    CronJobDetailDrawerComponent,
    CronJobFormComponent,
    CronJobListComponent,
    PtahAlertComponent,
    PtahButtonDirective,
  ],
  template: `
    @if (!isElectron()) {
      <div
        class="flex flex-col items-center gap-2 px-6 py-16 text-center"
        data-testid="cron-empty-state"
      >
        <lucide-angular
          [img]="CalendarClockIcon"
          class="size-8 text-base-content-muted"
          aria-hidden="true"
        />
        <p class="text-sm font-medium">Schedules need the desktop app</p>
        <p class="text-xs text-base-content-muted">
          Cron jobs run headless PtahCode sessions in the background, which is
          only available in the PtahCode desktop app.
        </p>
        <a
          ptahButton
          variant="link"
          size="xs"
          href="https://github.com/Hive-Academy/PtahCode/releases"
          target="_blank"
          rel="noopener noreferrer"
          >Download PtahCode desktop</a
        >
      </div>
    } @else {
      <div
        class="flex flex-col gap-[var(--ptah-gap-section)]"
        data-testid="cron-scheduler-section"
      >
        <ptah-cron-header-band
          [stats]="stats()"
          [scope]="scopeFilter()"
          [loading]="loading()"
          [reviewAvailable]="reviewAvailable()"
          (scopeChange)="onScopeChange($event)"
          (refresh)="refresh()"
          (newJob)="newJob()"
        />

        @if (error(); as message) {
          <ptah-alert
            tone="error"
            live="assertive"
            [compact]="true"
            data-testid="cron-error"
          >
            {{ message }}
            <button
              alertAction
              type="button"
              ptahButton
              variant="ghost"
              size="xs"
              [disabled]="loading()"
              (click)="refresh()"
            >
              Retry
            </button>
          </ptah-alert>
        }

        <ptah-cron-job-list
          [jobs]="jobs()"
          [loading]="loading()"
          [selectedJobId]="selectedJobId()"
          (opened)="selectJob($event)"
          (runNow)="runNow($event)"
          (edit)="editJob($event)"
          (toggled)="toggleEnabled($event)"
          (removed)="deleteJob($event)"
          (newJob)="newJob()"
        />

        <ptah-cron-job-detail-drawer
          [job]="selectedJob()"
          [runs]="runs()"
          [description]="selectedDescription()"
          (closed)="closeDetail()"
          (runNow)="runSelected()"
          (edit)="editSelected()"
          (toggled)="toggleSelected()"
          (removed)="deleteSelected()"
        />

        <ptah-cron-job-form
          [open]="formOpen()"
          [job]="editingJob()"
          [defaultWorkspaceRoot]="defaultWorkspaceRoot()"
          (saved)="onFormSaved()"
          (cancelled)="closeForm()"
        />

        <p class="text-xs text-base-content-muted">
          Cron settings live in
          <span class="font-mono">~/.ptah/settings.json</span> under
          <span class="font-mono">cron.*</span>. Edit that file and restart
          PtahCode desktop to change defaults.
        </p>
      </div>
    }
  `,
})
export class CronSchedulerTabComponent implements OnInit {
  private readonly vscodeService = inject(VSCodeService);
  private readonly state = inject(CronStateService);
  private readonly cronExpr = inject(CronExpressionService);
  private readonly appState = inject(AppStateManager);

  protected readonly CalendarClockIcon = CalendarClock;

  public readonly isElectron = computed(
    () => this.vscodeService.config()?.isElectron === true,
  );
  public readonly reviewAvailable = computed(() => {
    this.vscodeService.config();
    return isReviewSurfaceAvailable(this.vscodeService);
  });

  public readonly jobs = this.state.jobs;
  public readonly runs = this.state.runs;
  public readonly loading = this.state.loading;
  public readonly error = this.state.error;
  public readonly selectedJobId = this.state.selectedJobId;
  public readonly selectedJob = this.state.selectedJob;
  public readonly stats = this.state.stats;
  public readonly scopeFilter = this.state.scopeFilter;

  public readonly formOpen = signal<boolean>(false);
  /** The job the form edits; `null` while the form creates a new job. */
  public readonly editingJob = signal<ScheduledJobDto | null>(null);

  /**
   * New jobs are stamped with the active workspace so they surface under the
   * default 'workspace' scope. The form keeps the field editable.
   */
  public readonly defaultWorkspaceRoot = computed<string | null>(
    () => this.appState.workspaceInfo()?.path ?? null,
  );

  /**
   * Human rendering of the selected job's cron expression, resolved once here
   * rather than inside the drawer so the drawer stays free of Angular DI.
   */
  public readonly selectedDescription = computed<string>(() => {
    const job = this.selectedJob();
    return job === null ? '' : this.cronExpr.describe(job.cronExpr);
  });

  public ngOnInit(): void {
    if (this.isElectron()) {
      void this.state.refresh();
    }
  }

  public refresh(): void {
    void this.state.refresh();
  }

  public onScopeChange(scope: CronScopeFilter): void {
    this.state.setScopeFilter(scope);
  }

  public newJob(): void {
    this.state.select(null);
    this.editingJob.set(null);
    this.formOpen.set(true);
  }

  public editJob(job: ScheduledJobDto): void {
    // Close the detail drawer first — it is a modal overlay, and leaving it up
    // while the inline editor opens behind it would stack two surfaces and
    // trap focus in the wrong one.
    this.state.select(null);
    this.editingJob.set(job);
    this.formOpen.set(true);
  }

  /** After a save: close the form; an edited job is selected again to show its update. */
  public onFormSaved(): void {
    const edited = this.editingJob();
    this.closeForm();
    if (edited) this.state.select(edited.id);
  }

  public closeForm(): void {
    this.formOpen.set(false);
    this.editingJob.set(null);
  }

  public async toggleEnabled(job: ScheduledJobDto): Promise<void> {
    await this.state.toggle(job.id, !job.enabled);
  }

  public async runNow(id: string): Promise<void> {
    this.state.select(id);
    await this.state.runNow(id);
  }

  /** The card and the drawer confirm inline, so this deletes without a prompt. */
  public deleteJob(id: string): void {
    void this.state.delete(id);
  }

  public selectJob(id: string): void {
    this.state.select(id);
  }

  /** Drawer asked to close — clearing the selection is what closes it. */
  public closeDetail(): void {
    this.state.select(null);
  }

  public runSelected(): void {
    const job = this.selectedJob();
    if (job) void this.runNow(job.id);
  }

  public editSelected(): void {
    const job = this.selectedJob();
    if (job) this.editJob(job);
  }

  public toggleSelected(): void {
    const job = this.selectedJob();
    if (job) void this.toggleEnabled(job);
  }

  public deleteSelected(): void {
    const job = this.selectedJob();
    if (job) this.deleteJob(job.id);
  }
}
