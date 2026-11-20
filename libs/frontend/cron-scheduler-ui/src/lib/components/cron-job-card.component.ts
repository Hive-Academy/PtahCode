/**
 * CronJobCardComponent — one scheduled job as a row of the jobs list.
 *
 * Pure presentation: it reads nothing from the store and emits an event for
 * every action, so the tab stays the single place that talks to
 * `CronStateService`. The row uses the "stretched button" pattern: the root is
 * a plain, non-focusable `div`, the job name is a native `<button>` whose
 * `::after` covers the whole row (so a click anywhere opens the details), and
 * the action buttons sit above that layer (`relative z-10`) as siblings, never
 * nested inside a control. The only state it owns is whether the
 * delete confirmation is open: `removed` is emitted after the user confirms,
 * so the parent must not ask a second time. `edit` stays part of the contract
 * for the parent, but the row no longer renders an Edit button.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  LucideAngularModule,
  Pause,
  Play,
  Power,
  Trash2,
} from 'lucide-angular';
import type { ScheduledJobDto } from '@ptah-extension/shared';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInlineConfirmComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';

import { formatRelative, formatTime, nextRunMetric } from './cron-format';
import { runStatusView } from './cron-run-status';

/** Characters of an agent session id shown on the row. */
const SESSION_ID_PREVIEW_LENGTH = 8;

@Component({
  selector: 'ptah-cron-job-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInlineConfirmComponent,
    PtahStatusComponent,
  ],
  host: { class: 'block' },
  template: `
    <div
      class="relative flex cursor-pointer flex-wrap items-center gap-x-[var(--ptah-gap-field)] gap-y-[var(--ptah-gap-label)] px-[var(--ptah-gap-controls)] py-[var(--ptah-gap-heading)] hover:bg-base-content/5 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"
      [class.bg-base-content/5]="selected()"
      data-testid="cron-job-card"
      [attr.aria-current]="selected() ? 'true' : null"
    >
      <div class="order-1 min-w-0 flex-1 lg:order-none lg:flex-none">
        <div class="flex min-w-0 items-center gap-ptah-controls">
          <button
            type="button"
            class="min-w-0 truncate text-left font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
            data-testid="cron-job-open"
            [title]="job().name"
            [attr.aria-label]="'Open details for ' + job().name"
            (click)="opened.emit()"
          >
            {{ job().name }}
          </button>
          @if (!job().enabled) {
            <span
              ptahBadge
              tone="neutral"
              class="shrink-0"
              data-testid="cron-job-paused"
              >Paused</span
            >
          }
        </div>
        <p
          class="min-w-0 truncate text-xs text-base-content-muted"
          data-testid="cron-job-creator"
        >
          @if (creatorSession(); as session) {
            Created by agent session
            <span class="font-mono" [title]="session.id">{{
              session.preview
            }}</span>
          } @else {
            Created by you
          }
        </p>
      </div>

      <div
        class="order-3 flex basis-full flex-wrap gap-x-[var(--ptah-gap-field)] gap-y-[var(--ptah-gap-label)] text-xs lg:contents lg:text-sm"
      >
        <div class="min-w-0 lg:order-none" data-testid="cron-job-schedule">
          <span class="text-base-content-muted lg:hidden">Schedule </span>
          @if (description(); as text) {
            <span class="lg:block">{{ text }}</span>
          }
          <span class="font-mono text-base-content-muted lg:block">{{
            job().cronExpr
          }}</span>
        </div>

        <div class="min-w-0 lg:order-none" data-testid="cron-job-next-run">
          <span class="text-base-content-muted lg:hidden">Next </span>
          <span class="lg:block">{{ nextRun().value }}</span>
          @if (nextRun().hint; as hint) {
            <span class="text-base-content-muted lg:block"> {{ hint }}</span>
          }
        </div>

        <div
          class="flex min-w-0 items-center gap-ptah-controls lg:order-none"
          data-testid="cron-job-last-run"
        >
          <span class="text-base-content-muted lg:hidden">Last</span>
          @if (lastRun(); as run) {
            <ptah-status
              [status]="run.status"
              [label]="run.label"
              size="xs"
              data-testid="cron-job-last-status"
            />
            @if (lastRunRelative(); as relative) {
              <span
                class="min-w-0 truncate text-base-content-muted"
                [title]="lastRunTime()"
                >{{ relative }}</span
              >
            }
          } @else {
            <span class="text-base-content-muted">No runs yet</span>
          }
        </div>
      </div>

      <div
        class="relative z-10 order-2 flex items-center justify-end gap-ptah-label lg:order-none"
        data-row-actions
      >
        @if (confirmingDelete()) {
          <ptah-inline-confirm
            [message]="'Delete ' + job().name + '?'"
            detail="This cannot be undone."
            confirmLabel="Delete"
            tone="danger"
            confirmTestId="cron-job-delete-confirm"
            cancelTestId="cron-job-delete-cancel"
            (confirm)="confirmRemoval()"
            (cancelled)="cancelRemoval()"
          />
        } @else {
          <button
            type="button"
            ptahButton
            variant="ghost"
            size="xs"
            (click)="runNow.emit()"
          >
            <lucide-angular
              [img]="PlayIcon"
              class="size-3.5"
              aria-hidden="true"
            />
            Run now
          </button>
          <button
            type="button"
            ptahIconButton
            size="xs"
            [label]="job().enabled ? 'Pause job' : 'Resume job'"
            (click)="toggled.emit()"
          >
            <lucide-angular
              [img]="job().enabled ? PauseIcon : PowerIcon"
              class="size-3.5"
              aria-hidden="true"
            />
          </button>
          <button
            #deleteButton
            type="button"
            ptahIconButton
            size="xs"
            tone="muted-danger"
            label="Delete job"
            [attr.aria-expanded]="confirmingDelete()"
            (click)="confirmingDelete.set(true)"
          >
            <lucide-angular
              [img]="Trash2Icon"
              class="size-3.5"
              aria-hidden="true"
            />
          </button>
        }
      </div>
    </div>
  `,
})
export class CronJobCardComponent {
  private readonly injector = inject(Injector);

  /** The schedule this row renders. */
  public readonly job = input.required<ScheduledJobDto>();

  /** Human rendering of `job.cronExpr`, resolved by the parent tab. */
  public readonly description = input<string>('');

  /** True when this job is the one open in the detail drawer. */
  public readonly selected = input<boolean>(false);

  /** Row activated — the parent should open the detail drawer. */
  public readonly opened = output<void>();

  /** "Run now" pressed. */
  public readonly runNow = output<void>();

  /** Kept for the parent's binding; the row renders no Edit button. */
  public readonly edit = output<void>();

  /** Pause/resume pressed. */
  public readonly toggled = output<void>();

  /** Deletion confirmed in the row's inline confirmation. */
  public readonly removed = output<void>();

  protected readonly PlayIcon = Play;
  protected readonly PauseIcon = Pause;
  protected readonly PowerIcon = Power;
  protected readonly Trash2Icon = Trash2;

  private readonly deleteButton =
    viewChild<ElementRef<HTMLButtonElement>>('deleteButton');

  /** True while the inline delete confirmation is shown. */
  protected readonly confirmingDelete = signal(false);

  protected readonly nextRun = computed(() => nextRunMetric(this.job()));

  /** Status of the most recent run, or `null` when the job never ran. */
  protected readonly lastRun = computed(() => {
    const status = this.job().lastRunStatus;
    return status === null ? null : runStatusView(status);
  });

  protected readonly lastRunRelative = computed(() =>
    formatRelative(this.job().lastRunAt),
  );

  protected readonly lastRunTime = computed(() =>
    formatTime(this.job().lastRunAt),
  );

  /** The creating agent session, or `null` when the user created the job. */
  protected readonly creatorSession = computed(() => {
    const creator = this.job().createdBy;
    if (creator.kind !== 'session') return null;
    return {
      id: creator.sessionId,
      preview: creator.sessionId.slice(0, SESSION_ID_PREVIEW_LENGTH),
    };
  });

  protected confirmRemoval(): void {
    this.confirmingDelete.set(false);
    this.removed.emit();
  }

  /** Close the confirmation and put focus back on the Delete button. */
  protected cancelRemoval(): void {
    this.confirmingDelete.set(false);
    afterNextRender(() => this.deleteButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }
}
