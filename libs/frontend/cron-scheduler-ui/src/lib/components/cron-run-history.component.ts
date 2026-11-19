/**
 * CronRunHistoryComponent — the run list of one scheduled job.
 *
 * Each row answers four questions in reading order: how the run ended
 * (`ptah-status`, the only place a state colour appears), when it was due,
 * how long it took, and what it produced. The result summary and the error
 * message are plain text: the status pill already carries the state.
 *
 * The session id is the handle a user needs to open or grep the headless run,
 * so it is shown in mono with a copy button. One `copyFeedback` signal and one
 * component-level timer serve every row; no timer exists per row.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { Check, Copy, LucideAngularModule } from 'lucide-angular';
import type { JobRunDto } from '@ptah-extension/shared';
import {
  PtahButtonDirective,
  PtahSectionHeaderComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';

import { formatExactTime, formatTime } from './cron-format';
import {
  formatRunDuration,
  runStatusView,
  type RunStatusView,
} from './cron-run-status';
import type { CronRunsState } from '../services/cron-state.service';

/** How long the "Copied" / "Copy failed" feedback stays on a row. */
export const COPY_FEEDBACK_MS = 2000;

interface RunRow {
  readonly id: string;
  readonly view: RunStatusView;
  readonly scheduled: string;
  readonly timing: string;
  readonly scheduledExact: string;
  readonly timingExact: string;
  readonly detail: string;
  readonly sessionId: string | null;
}

interface CopyFeedback {
  readonly runId: string;
  readonly copied: boolean;
}

function toTiming(run: JobRunDto): string {
  if (run.startedAt === null) return 'Not started';
  const started = `Started ${formatTime(run.startedAt)}`;
  if (run.endedAt === null) return started;
  const duration = formatRunDuration(run.startedAt, run.endedAt);
  const ended = `ended ${formatTime(run.endedAt)}`;
  return duration === ''
    ? `${started} · ${ended}`
    : `${started} · ${ended} · took ${duration}`;
}

function toTimingExact(run: JobRunDto): string {
  const started = formatExactTime(run.startedAt);
  const ended = formatExactTime(run.endedAt);
  if (started === '') return '';
  return ended === ''
    ? `Started ${started}`
    : `Started ${started} · ended ${ended}`;
}

function toRow(run: JobRunDto): RunRow {
  return {
    id: run.id,
    view: runStatusView(run.status),
    scheduled: formatTime(run.scheduledFor),
    timing: toTiming(run),
    scheduledExact: formatExactTime(run.scheduledFor),
    timingExact: toTimingExact(run),
    // A failed run leads with its error; a run that left both must not hide
    // the reason it failed behind a partial summary.
    detail:
      run.status === 'failed'
        ? run.errorMessage || run.resultSummary || ''
        : run.resultSummary || run.errorMessage || '',
    sessionId: run.sessionId,
  };
}

@Component({
  selector: 'ptah-cron-run-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    PtahButtonDirective,
    PtahSectionHeaderComponent,
    PtahStatusComponent,
  ],
  template: `
    <section aria-label="Run history" class="flex flex-col gap-ptah-heading">
      <ptah-section-header heading="Run history" [description]="countLabel()" />

      @if (state() === 'error') {
        <p class="text-xs text-error" role="alert" data-testid="cron-run-error">
          @if (rows().length === 0) {
            The run history did not load. Open the job again to retry.
          } @else {
            The run history did not update. The runs below can be out of date.
          }
        </p>
      }
      @if (rows().length === 0) {
        @switch (state()) {
          @case ('loading') {
            <p
              class="text-xs text-base-content-muted"
              role="status"
              data-testid="cron-run-loading"
            >
              Loading runs…
            </p>
          }
          @case ('loaded') {
            <p
              class="text-xs text-base-content-muted"
              data-testid="cron-run-empty"
            >
              No runs recorded yet.
            </p>
          }
        }
      } @else {
        <ul
          class="divide-y divide-surface-border overflow-hidden rounded-lg border border-surface-border"
        >
          @for (row of rows(); track row.id) {
            <li
              class="flex flex-col gap-1 px-3 py-2 text-xs"
              data-testid="cron-run-row"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <ptah-status
                  [status]="row.view.status"
                  [label]="row.view.label"
                  appearance="pill"
                  size="xs"
                />
                <span
                  class="text-base-content-muted"
                  [attr.title]="row.scheduledExact || null"
                >
                  Scheduled {{ row.scheduled }}
                </span>
              </div>

              <p
                class="text-base-content-muted"
                [attr.title]="row.timingExact || null"
                data-testid="cron-run-timing"
              >
                {{ row.timing }}
              </p>

              @if (row.detail) {
                <p
                  class="whitespace-pre-wrap break-words"
                  data-testid="cron-run-detail"
                >
                  {{ row.detail }}
                </p>
              }

              @if (row.sessionId; as sessionId) {
                <div class="flex min-w-0 items-center gap-2">
                  <span class="shrink-0 text-base-content-muted">Session</span>
                  <span
                    class="min-w-0 break-all select-all font-mono"
                    [title]="sessionId"
                    data-testid="cron-run-session"
                    >{{ sessionId }}</span
                  >
                  <button
                    type="button"
                    ptahButton
                    variant="ghost"
                    size="xs"
                    class="shrink-0"
                    data-testid="cron-run-copy-session"
                    [attr.aria-label]="'Copy session id ' + sessionId"
                    (click)="copySessionId(row.id, sessionId)"
                  >
                    <lucide-angular
                      [img]="copiedRunId() === row.id ? CheckIcon : CopyIcon"
                      class="size-3"
                      aria-hidden="true"
                    />
                    {{ copyLabel(row.id) }}
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }

      <span class="sr-only" role="status" data-testid="cron-run-copy-status">{{
        announcement()
      }}</span>
    </section>
  `,
})
export class CronRunHistoryComponent {
  /** Runs of the selected job, newest first. */
  public readonly runs = input<readonly JobRunDto[]>([]);

  /**
   * State of the request that fills {@link runs}. "No runs" shows only for
   * `'loaded'`: an open or failed request is not an empty history.
   */
  public readonly state = input<CronRunsState>('loaded');

  protected readonly CopyIcon = Copy;
  protected readonly CheckIcon = Check;

  protected readonly rows = computed(() => this.runs().map(toRow));

  protected readonly countLabel = computed(() => {
    const count = this.runs().length;
    if (count === 0) return null;
    return count === 1 ? 'Last run' : `Last ${count} runs`;
  });

  private readonly copyFeedback = signal<CopyFeedback | null>(null);

  /** Id of the run whose session id was just copied, or `null`. */
  protected readonly copiedRunId = computed(() => {
    const feedback = this.copyFeedback();
    return feedback !== null && feedback.copied ? feedback.runId : null;
  });

  /** Screen-reader text for the last copy attempt. */
  protected readonly announcement = computed(() => {
    const feedback = this.copyFeedback();
    if (feedback === null) return '';
    return feedback.copied
      ? 'Session id copied'
      : 'Could not copy the session id';
  });

  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private copyAttempt = 0;

  public constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.clearFeedbackTimer();
    });
  }

  protected copyLabel(runId: string): string {
    const feedback = this.copyFeedback();
    if (feedback === null || feedback.runId !== runId) return 'Copy';
    return feedback.copied ? 'Copied' : 'Copy failed';
  }

  protected async copySessionId(
    runId: string,
    sessionId: string,
  ): Promise<void> {
    const attempt = ++this.copyAttempt;
    let copied = true;
    try {
      await navigator.clipboard.writeText(sessionId);
    } catch {
      // The clipboard can be denied or missing; the row says so instead of
      // claiming a copy that did not happen.
      copied = false;
    }
    // A slower, older write must not overwrite the feedback of a newer one.
    if (attempt !== this.copyAttempt) return;
    this.showFeedback({ runId, copied });
  }

  private showFeedback(feedback: CopyFeedback): void {
    // The clipboard write can settle after the drawer closed; a timer started
    // then would have no release path.
    if (this.destroyed) return;
    this.clearFeedbackTimer();
    this.copyFeedback.set(feedback);
    this.feedbackTimer = setTimeout(() => {
      this.feedbackTimer = null;
      this.copyFeedback.set(null);
    }, COPY_FEEDBACK_MS);
  }

  private clearFeedbackTimer(): void {
    if (this.feedbackTimer === null) return;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
  }
}
