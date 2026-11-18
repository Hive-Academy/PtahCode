/**
 * CronJobDetailDrawerComponent — the detail surface for one scheduled job.
 *
 * Card grids answer "what schedules exist"; this drawer answers "what is this
 * one doing". Run outcomes come from `cron:runs`, which is fetched for the
 * selected job alone, so the run list lives here (`ptah-cron-run-history`).
 *
 * Control contract mirrors `NativeDrawerComponent`: the parent owns visibility
 * (here implied by `job !== null`) and the drawer only requests closure.
 *
 * NG8011: every projected slot node gets its own single-root `@if`. Putting
 * `[drawer-header]`, the body and `[drawer-footer]` inside one shared `@if`
 * would silently collapse them all into the default slot.
 *
 * State colour reaches the screen only through `ptah-status`. "Run now" is the
 * one primary action. Delete asks for confirmation in place
 * (`ptah-inline-confirm`); `removed` is emitted only after the user confirms.
 */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import {
  LucideAngularModule,
  Pencil,
  Play,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-angular';
import type { JobRunDto, ScheduledJobDto } from '@ptah-extension/shared';
import {
  NativeDrawerComponent,
  PtahButtonDirective,
  PtahInlineConfirmComponent,
  PtahSectionHeaderComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';

import { formatExactTime, formatRelative, formatTime } from './cron-format';
import { CronRunHistoryComponent } from './cron-run-history.component';
import { runStatusView } from './cron-run-status';

@Component({
  selector: 'ptah-cron-job-detail-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CronRunHistoryComponent,
    LucideAngularModule,
    NativeDrawerComponent,
    PtahButtonDirective,
    PtahInlineConfirmComponent,
    PtahSectionHeaderComponent,
    PtahStatusComponent,
  ],
  template: `
    <ptah-native-drawer
      [isOpen]="job() !== null"
      ariaLabel="Schedule details"
      widthClass="w-full max-w-xl"
      (closed)="closed.emit()"
    >
      @if (job(); as j) {
        <div drawer-header class="min-w-0">
          <h2 class="truncate text-sm font-semibold" [title]="j.name">
            {{ j.name }}
          </h2>
          <div
            class="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content-muted"
          >
            <ptah-status
              [status]="j.enabled ? 'online' : 'offline'"
              [label]="j.enabled ? 'Enabled' : 'Paused'"
              appearance="inline"
              size="xs"
              data-testid="cron-drawer-state"
            />
            <span class="truncate font-mono">{{ j.timezone }}</span>
          </div>
        </div>
      }

      @if (job(); as j) {
        <div class="flex flex-col gap-ptah-section">
          <dl class="grid gap-3 text-xs sm:grid-cols-2">
            <div class="min-w-0" data-testid="cron-drawer-schedule">
              <dt class="text-xs text-base-content-muted">Schedule</dt>
              @if (description()) {
                <dd class="break-words">{{ description() }}</dd>
              }
              <dd class="break-words font-mono">{{ j.cronExpr }}</dd>
            </div>

            <div class="min-w-0" data-testid="cron-drawer-next-run">
              <dt class="text-xs text-base-content-muted">Next run</dt>
              @if (j.enabled) {
                <dd class="break-words" [title]="exact(j.nextRunAt)">
                  {{ time(j.nextRunAt) }}
                </dd>
                @if (relative(j.nextRunAt); as nextRelative) {
                  <dd class="text-base-content-muted">{{ nextRelative }}</dd>
                }
              } @else {
                <dd>Paused</dd>
              }
            </div>

            <div class="min-w-0" data-testid="cron-drawer-last-run">
              <dt class="text-xs text-base-content-muted">Last run</dt>
              @if (j.lastRunAt === null) {
                <dd>Never</dd>
              } @else {
                <dd class="break-words" [title]="exact(j.lastRunAt)">
                  {{ time(j.lastRunAt) }}
                </dd>
                @if (relative(j.lastRunAt); as lastRelative) {
                  <dd class="text-base-content-muted">{{ lastRelative }}</dd>
                }
              }
              @if (lastRunView(); as lastRun) {
                <dd class="mt-1">
                  <ptah-status
                    [status]="lastRun.status"
                    [label]="lastRun.label"
                    appearance="pill"
                    size="xs"
                    data-testid="cron-drawer-last-run-status"
                  />
                </dd>
              }
            </div>

            <div class="min-w-0" data-testid="cron-drawer-creator">
              <dt class="text-xs text-base-content-muted">Created</dt>
              @if (creatorSessionId(); as sessionId) {
                <dd>Created by agent session</dd>
                <dd
                  class="break-all select-all font-mono text-base-content-muted"
                >
                  {{ sessionId }}
                </dd>
              } @else {
                <dd>Created by you</dd>
              }
            </div>
          </dl>

          <section aria-label="Prompt" class="flex flex-col gap-ptah-heading">
            <ptah-section-header heading="Prompt" />
            <p
              class="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-surface-border bg-surface-2 p-3 text-xs"
              tabindex="0"
              data-testid="cron-drawer-prompt"
            >
              {{ j.prompt }}
            </p>
          </section>

          @if (j.workspaceRoot) {
            <section
              aria-label="Workspace"
              class="flex flex-col gap-ptah-heading"
            >
              <ptah-section-header heading="Workspace" />
              <p
                class="break-all font-mono text-xs text-base-content-muted"
                data-testid="cron-drawer-workspace"
              >
                {{ j.workspaceRoot }}
              </p>
            </section>
          }

          <ptah-cron-run-history [runs]="runs()" />
        </div>
      }

      @if (job(); as j) {
        <div
          drawer-footer
          class="flex flex-wrap items-center gap-2 border-t border-surface-border px-4 py-3"
        >
          <button
            type="button"
            ptahButton
            variant="primary"
            data-testid="cron-drawer-run-now"
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
            ptahButton
            variant="ghost"
            data-testid="cron-drawer-edit"
            (click)="edit.emit()"
          >
            <lucide-angular
              [img]="PencilIcon"
              class="size-3.5"
              aria-hidden="true"
            />
            Edit
          </button>
          <button
            type="button"
            ptahButton
            variant="ghost"
            data-testid="cron-drawer-toggle"
            (click)="toggled.emit()"
          >
            <lucide-angular
              [img]="j.enabled ? PowerOffIcon : PowerIcon"
              class="size-3.5"
              aria-hidden="true"
            />
            {{ j.enabled ? 'Disable' : 'Enable' }}
          </button>

          @if (confirmingDelete()) {
            <ptah-inline-confirm
              class="ml-auto"
              message="Delete this schedule?"
              detail="This cannot be undone."
              ariaLabel="Confirm delete schedule"
              confirmLabel="Delete"
              tone="danger"
              confirmTestId="cron-drawer-delete-confirm"
              cancelTestId="cron-drawer-delete-cancel"
              (confirm)="confirmDelete()"
              (cancelled)="cancelDelete()"
            />
          } @else {
            <button
              #deleteButton
              type="button"
              ptahButton
              variant="ghost"
              size="sm"
              density="compact"
              tone="danger"
              class="ml-auto"
              data-testid="cron-drawer-delete"
              (click)="confirmingDelete.set(true)"
            >
              <lucide-angular
                [img]="Trash2Icon"
                class="size-3.5"
                aria-hidden="true"
              />
              Delete
            </button>
          }
        </div>
      }
    </ptah-native-drawer>
  `,
})
export class CronJobDetailDrawerComponent {
  /** Selected job, or `null` when the drawer should stay closed. */
  public readonly job = input<ScheduledJobDto | null>(null);

  /** Run history for {@link job}, newest first. */
  public readonly runs = input<readonly JobRunDto[]>([]);

  /** Human rendering of `job.cronExpr`, resolved by the parent tab. */
  public readonly description = input<string>('');

  /** Drawer requests closure (Escape, backdrop, close button). */
  public readonly closed = output<void>();

  /** "Run now" pressed. */
  public readonly runNow = output<void>();

  /** "Edit" pressed. */
  public readonly edit = output<void>();

  /** Enable/disable pressed. */
  public readonly toggled = output<void>();

  /** Delete confirmed by the user. Never emitted by the first "Delete" press. */
  public readonly removed = output<void>();

  protected readonly PlayIcon = Play;
  protected readonly PencilIcon = Pencil;
  protected readonly PowerIcon = Power;
  protected readonly PowerOffIcon = PowerOff;
  protected readonly Trash2Icon = Trash2;

  private readonly injector = inject(Injector);
  private readonly deleteButton =
    viewChild<ElementRef<HTMLButtonElement>>('deleteButton');

  /**
   * Whether the delete confirmation is showing. It resets when another job is
   * selected or the drawer closes, so a confirmation never carries over to a
   * job the user did not ask to delete.
   */
  protected readonly confirmingDelete = linkedSignal({
    source: () => this.job()?.id ?? null,
    computation: () => false,
  });

  /** Outcome of the most recent run, or `null` when the job never ran. */
  protected readonly lastRunView = computed(() => {
    const status = this.job()?.lastRunStatus ?? null;
    return status === null ? null : runStatusView(status);
  });

  /** Session id of the agent that created the job, or `null` for a user job. */
  protected readonly creatorSessionId = computed(() => {
    const creator = this.job()?.createdBy;
    return creator?.kind === 'session' ? creator.sessionId : null;
  });

  protected exact(epochMs: number | null): string {
    return formatExactTime(epochMs);
  }

  protected time(epochMs: number | null): string {
    return formatTime(epochMs);
  }

  protected relative(epochMs: number | null): string {
    return formatRelative(epochMs);
  }

  protected confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.removed.emit();
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
    // The confirm replaced the Delete button, so the element that opened it no
    // longer exists; put focus on the button that takes its place.
    afterNextRender(
      { write: () => this.deleteButton()?.nativeElement.focus() },
      { injector: this.injector },
    );
  }
}
