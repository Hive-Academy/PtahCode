import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { InboxRowDirective } from '@ptah-extension/ui';
import type { ReviewRun } from '@ptah-extension/review-contracts';

/**
 * Ink of each run state (approved option A): Completed done, In progress run,
 * Waiting idle, Partial / Superseded / Interrupted need, Failed err. The app
 * has no standalone `state-*` classes, so the status takes its ink from the
 * `text-state-*` Tailwind color utilities and the dot from `bg-current`.
 */
const RUN_STATUS_INK: Readonly<Record<ReviewRun['status'], string>> = {
  queued: 'text-state-idle',
  running: 'text-state-run',
  succeeded: 'text-state-done',
  partial: 'text-state-need',
  failed: 'text-state-err',
  superseded: 'text-state-need',
  skipped: 'text-state-idle',
  interrupted: 'text-state-need',
};

/**
 * Run list of the Reviews page list pane (approved option A). The rows are
 * options of a `role="listbox"`: the shared `ptahInboxRow` directive owns the
 * option semantics, the focus ring and the gold active line. Each row keeps
 * the failure and head-retry lines of the old table row.
 */
@Component({
  selector: 'ptah-review-runs-list',
  standalone: true,
  imports: [InboxRowDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="listbox" aria-label="Review runs">
      @for (run of runs(); track run.attemptId) {
        <button
          type="button"
          ptahInboxRow
          [selected]="run.attemptId === selectedAttemptId()"
          [attr.aria-label]="'PR ' + run.prNumber + ', ' + run.status + ', ' + run.repo.owner + '/' + run.repo.name + ', ' + progressLabel(run)"
          (click)="open.emit(run.attemptId)"
          (keydown.arrowdown)="moveFocus($event, 1)"
          (keydown.arrowup)="moveFocus($event, -1)"
        >
          <span class="block truncate text-sm font-semibold"><span class="sr-only">PR </span>#{{ run.prNumber }}@if (run.prTitle) { <span class="ml-1">{{ run.prTitle }}</span> }</span>
          <span class="block truncate text-xs text-base-content-muted">
            {{ run.repo.owner }}/{{ run.repo.name }} · <span class="font-mono">{{ run.headSha.slice(0, 10) }}</span>
          </span>
          <span class="mt-1 flex items-center gap-2 text-xs" [class]="ink(run.status)" [title]="progressLabel(run)">
            <span class="inline-block h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
            <span class="truncate">{{ statusLabel(run.status) }} · {{ titleCase(run.trigger) }}</span>
          </span>
          @if (run.status === 'failed') {
            @if (run.failure; as failure) {
              <span class="block truncate text-xs text-error" [title]="failure.message">{{ failure.stage }}: {{ failure.message }}</span>
            }
          }
          @if (run.headRetry?.automaticRetriesStopped) {
            <span class="block text-xs text-warning">Automatic retries stopped</span>
          } @else if (run.headRetry?.nextEligibleAt; as retryAt) {
            <span class="block text-xs text-warning">Retry after {{ retryTime(retryAt) }}</span>
          }
        </button>
      }
    </div>
  `,
})
export class ReviewRunsListComponent {
  readonly runs = input.required<readonly ReviewRun[]>();
  /** Attempt id of the open run; marks its row as the selected option. */
  readonly selectedAttemptId = input<string | null>(null);
  readonly open = output<string>();

  protected ink(status: ReviewRun['status']): string {
    return RUN_STATUS_INK[status];
  }

  protected statusLabel(status: ReviewRun['status']): string {
    if (status === 'succeeded') return 'Completed';
    if (status === 'partial') return 'Partial coverage';
    return this.titleCase(status);
  }

  protected titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /** Progress of the run; the row gives it to assistive technology and as a tooltip. */
  protected progressLabel(run: ReviewRun): string {
    return run.completedAt ? 'Finished' : run.startedAt ? 'In progress' : 'Waiting';
  }

  protected retryTime(value: string): string {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  protected moveFocus(event: Event, direction: number): void {
    event.preventDefault();
    const current = event.currentTarget;
    if (!(current instanceof HTMLButtonElement)) return;
    const buttons = Array.from(
      current
        .closest('[role="listbox"]')
        ?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? [],
    );
    buttons[buttons.indexOf(current) + direction]?.focus();
  }
}
