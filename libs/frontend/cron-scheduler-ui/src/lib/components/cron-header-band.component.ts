import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarClock, LucideAngularModule, RefreshCw } from 'lucide-angular';
import {
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInstrumentBandComponent,
  PtahSurfaceDirective,
  type PtahInstrumentBandSegment,
} from '@ptah-extension/ui';

import type {
  CronAggregateStats,
  CronScopeFilter,
} from '../services/cron-state.service';
import { formatRelative, formatTime } from './cron-format';

/** DOM id of the job list region. The instrument band moves focus to it. */
export const CRON_JOB_LIST_ID = 'cron-job-list';

/**
 * Page header of the Schedules surface: title, scope switch, refresh, the one
 * primary action, and the four-segment instrument band (total, enabled,
 * paused, next run). Presentational: every action is an output.
 */
@Component({
  selector: 'ptah-cron-header-band',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LucideAngularModule,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInstrumentBandComponent,
    PtahSurfaceDirective,
  ],
  host: { class: 'flex flex-col gap-[var(--ptah-gap-field)]' },
  template: `
    <header
      ptahSurface
      variant="surface-1"
      padding="lg"
      class="flex flex-wrap items-start justify-between gap-[var(--ptah-gap-group)] rounded-xl"
    >
      <div class="flex items-start gap-3">
        <span
          class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface-2 text-base-content-muted"
        >
          <lucide-angular
            [img]="CalendarClockIcon"
            class="size-5"
            aria-hidden="true"
          />
        </span>
        <div>
          <h1 class="text-xl font-semibold tracking-tight">Schedules</h1>
          <p class="mt-0.5 text-sm text-base-content-muted">
            Cron jobs that run headless PtahCode sessions on a schedule.
          </p>
        </div>
      </div>
      <div
        class="flex flex-wrap items-center justify-end gap-[var(--ptah-gap-controls)] ml-auto"
      >
        @if (reviewAvailable()) {
          <a
            routerLink="/review-runs"
            ptahButton
            variant="ghost"
            size="xs"
            aria-label="Open review runs"
            data-testid="cron-review-runs-link"
            >Review runs</a
          >
        }
        <div
          class="flex items-center gap-0.5 rounded-lg border border-surface-border p-0.5"
          role="group"
          aria-label="Schedule workspace scope"
        >
          <button
            type="button"
            ptahButton
            variant="ghost"
            size="xs"
            data-testid="cron-scope-workspace"
            [selected]="scope() === 'workspace'"
            (click)="scopeChange.emit('workspace')"
          >
            This workspace
          </button>
          <button
            type="button"
            ptahButton
            variant="ghost"
            size="xs"
            data-testid="cron-scope-all"
            [selected]="scope() === 'all'"
            (click)="scopeChange.emit('all')"
          >
            All workspaces
          </button>
        </div>
        <button
          type="button"
          ptahIconButton
          label="Refresh jobs"
          [disabled]="loading()"
          (click)="refresh.emit()"
        >
          <lucide-angular
            [img]="RefreshCwIcon"
            class="size-4"
            [class.animate-spin]="loading()"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          ptahButton
          variant="primary"
          data-testid="cron-new-job-btn"
          (click)="newJob.emit()"
        >
          New job
        </button>
      </div>
    </header>

    <ptah-instrument-band
      ariaLabel="Cron statistics"
      data-testid="cron-instrument-band"
      [segments]="segments()"
      [loading]="loading() && stats().total === 0"
    />
  `,
})
export class CronHeaderBandComponent {
  public readonly stats = input.required<CronAggregateStats>();
  public readonly scope = input.required<CronScopeFilter>();
  public readonly loading = input<boolean>(false);
  public readonly reviewAvailable = input<boolean>(false);

  public readonly scopeChange = output<CronScopeFilter>();
  public readonly refresh = output<void>();
  public readonly newJob = output<void>();

  protected readonly CalendarClockIcon = CalendarClock;
  protected readonly RefreshCwIcon = RefreshCw;

  /**
   * Tones follow the state-colour rule: `ok` only while jobs are enabled,
   * `info` only while a run is actually due; everything else stays idle.
   */
  protected readonly segments = computed<readonly PtahInstrumentBandSegment[]>(
    () => {
      const stats = this.stats();
      return [
        {
          id: 'total',
          label: 'Jobs',
          value: String(stats.total),
          meta:
            this.scope() === 'workspace'
              ? 'In this workspace'
              : 'Across all workspaces',
          tone: 'idle',
          targetId: CRON_JOB_LIST_ID,
        },
        {
          id: 'enabled',
          label: 'Enabled',
          value: String(stats.enabled),
          meta: stats.enabled > 0 ? 'Running on schedule' : 'Nothing scheduled',
          tone: stats.enabled > 0 ? 'ok' : 'idle',
          targetId: CRON_JOB_LIST_ID,
        },
        {
          id: 'paused',
          label: 'Paused',
          value: String(stats.disabled),
          meta: stats.disabled > 0 ? 'Not running' : 'None paused',
          tone: 'idle',
          targetId: CRON_JOB_LIST_ID,
        },
        {
          id: 'next-run',
          label: 'Next run',
          value: formatTime(stats.nextRunAt),
          meta:
            stats.nextRunAt === null
              ? 'No upcoming run'
              : formatRelative(stats.nextRunAt),
          tone: stats.nextRunAt === null ? 'idle' : 'info',
          targetId: CRON_JOB_LIST_ID,
        },
      ];
    },
  );
}
