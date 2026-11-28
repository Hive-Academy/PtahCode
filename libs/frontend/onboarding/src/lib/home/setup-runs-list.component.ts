import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  computed,
  inject,
  linkedSignal,
  output,
  viewChildren,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  SetupRunStore,
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunWorkflow,
} from '@ptah-extension/setup-wizard';
import { PtahButtonDirective } from '@ptah-extension/ui';
import {
  RunStatusChipComponent,
  type OnboardingRunChipState,
} from '../shared/run-status-chip.component';
import { setupRunStepLink } from '../shell/onboarding-step-link';
import { OnboardingWorkspaceStore } from '../shell/onboarding-workspace.store';

/** Rows shown before the "Show all" action (plan component 4). */
const VISIBLE_ROWS = 5;

const TITLES: Readonly<Record<SetupRunWorkflow, string>> = {
  analysis: 'Workspace analysis',
  'skill-review': 'Skill review',
  'agent-generation': 'Agent generation',
  'project-guidance': 'Project guidance',
  'team-builder': 'AI team builder',
};

/**
 * The chip state of a record. `cancelled` and `interrupted` map to the same
 * "Interrupted" chip as `chipStateFor` does for the workflow store;
 * `needs-input` names the decision that waits for the user.
 */
function chipStateOf(record: SetupRunRecord): OnboardingRunChipState {
  switch (record.status) {
    case 'running':
      return 'running';
    case 'needs-input':
      return 'needs-input';
    case 'completed':
      return 'done';
    case 'failed':
      return 'failed';
    case 'cancelled':
    case 'interrupted':
      return 'resumable';
  }
}

/** The row's visible identity: when the run started, locally formatted. */
function startedAtLabel(createdAt: number): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `started ${date.getFullYear()}-${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function progressOf(record: SetupRunRecord): string | null {
  if (record.workflow === 'skill-review' && record.selection) {
    const count = record.selection.skillIds.length;
    return `${count} ${count === 1 ? 'skill' : 'skills'} selected`;
  }
  if (record.workflow === 'team-builder' && record.teamBuilder) {
    const count = record.teamBuilder.installed.length;
    if (count === 0) return null;
    return `${count} ${count === 1 ? 'agent' : 'agents'} installed`;
  }
  return null;
}

/** One rendered run. */
interface SetupRunRow {
  readonly record: SetupRunRecord;
  readonly title: string;
  readonly chipState: OnboardingRunChipState;
  /** The primary action's visible text. */
  readonly actionLabel: string;
  /** The primary action's accessible name; includes title and identity. */
  readonly actionName: string;
  readonly canRerun: boolean;
  readonly rerunName: string;
  readonly canDismiss: boolean;
  readonly dismissName: string;
  /** The run's readable start time, shown in the row. */
  readonly startedLabel: string;
  readonly progress: string | null;
}

/**
 * The Setup runs of the active workspace, on Setup Home (plan component 4).
 *
 * The store owns discovery and reconciliation; this list only renders
 * `runsFor(activePath)` through signals. It never refreshes, polls or reads
 * RPC on mount.
 */
@Component({
  selector: 'ptah-setup-runs-list',
  standalone: true,
  imports: [RunStatusChipComponent, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (rows().length > 0) {
      <ul
        class="grid gap-3"
        aria-label="Setup runs"
        data-testid="setup-runs-list"
      >
        @for (row of visibleRows(); track row.record.id) {
          <li
            class="flex flex-wrap items-center gap-3 rounded-[14px] border p-4"
            [class.border-state-run]="row.chipState === 'running'"
            [class.border-state-need]="row.chipState !== 'running'"
            [attr.data-run-id]="row.record.id"
            data-glass-surface="chrome"
            data-testid="setup-run-row"
          >
            <ptah-run-status-chip [state]="row.chipState" />
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ row.title }}</p>
              <p class="text-xs text-base-content-muted">
                {{ row.startedLabel }}
              </p>
              @if (row.progress; as progress) {
                <p class="text-sm text-base-content-muted">{{ progress }}</p>
              }
              @if (row.record.error; as error) {
                <p class="text-sm text-base-content-muted">{{ error }}</p>
              }
            </div>
            <button
              #rowPrimary
              ptahButton
              type="button"
              [attr.aria-label]="row.actionName"
              data-testid="setup-run-open"
              (click)="open(row)"
            >
              {{ row.actionLabel }}
            </button>
            @if (row.canRerun) {
              <button
                ptahButton
                variant="outline"
                type="button"
                [attr.aria-label]="row.rerunName"
                data-testid="setup-run-rerun"
                (click)="rerun(row)"
              >
                Re-run
              </button>
            }
            @if (row.canDismiss) {
              <button
                ptahButton
                variant="ghost"
                type="button"
                [attr.aria-label]="row.dismissName"
                data-testid="setup-run-dismiss"
                (click)="dismiss(row)"
              >
                Dismiss
              </button>
            }
          </li>
        }
      </ul>
      @if (hiddenCount() > 0 && !expanded()) {
        <button
          ptahButton
          variant="link"
          size="xs"
          class="mt-2"
          type="button"
          data-testid="setup-runs-show-all"
          (click)="showAll()"
        >
          {{ hiddenCount() }} more {{ hiddenCount() === 1 ? 'run' : 'runs' }}
          - Show all
        </button>
      }
    }
  `,
})
export class SetupRunsListComponent {
  public readonly lastRunDismissed = output<void>();

  private readonly runs = inject(SetupRunStore);
  private readonly workspace = inject(OnboardingWorkspaceStore);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly primaryButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('rowPrimary');

  protected readonly expanded = linkedSignal({
    source: this.workspace.activePath,
    computation: () => false,
  });

  /** The rows of the active workspace; empty while no folder is resolved. */
  protected readonly rows = computed<readonly SetupRunRow[]>(() => {
    if (!this.workspace.readyForActivePath()) return [];
    const records = this.runs.runsFor(this.workspace.activePath());
    return records.map((record) => this.rowFor(record, records));
  });

  protected readonly visibleRows = computed(() =>
    this.expanded() ? this.rows() : this.rows().slice(0, VISIBLE_ROWS),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.rows().length - VISIBLE_ROWS),
  );

  /** Open a run at its step target; opening marks it seen. */
  protected open(row: SetupRunRow): void {
    this.runs.markSeen(row.record.id);
    const link = setupRunStepLink(row.record);
    void this.router.navigate([...link.commands], {
      queryParams: { ...link.queryParams },
    });
  }

  /** Re-run a completed analysis: Analyze restarts it through `?rerun=1`. */
  protected rerun(row: SetupRunRow): void {
    this.runs.markSeen(row.record.id);
    void this.router.navigate(['/onboarding', 'analyze'], {
      queryParams: { rerun: '1' },
    });
  }

  protected dismiss(row: SetupRunRow): void {
    const index = this.visibleRows().findIndex(
      (candidate) => candidate.record.id === row.record.id,
    );
    if (index < 0 || !this.runs.dismiss(row.record.id)) return;

    this.cdr.detectChanges();
    const buttons = this.primaryButtons();
    if (buttons.length === 0) {
      this.lastRunDismissed.emit();
      return;
    }
    buttons[Math.min(index, buttons.length - 1)].nativeElement.focus();
  }

  protected showAll(): void {
    this.expanded.set(true);
    this.cdr.detectChanges();
    this.primaryButtons()[VISIBLE_ROWS]?.nativeElement.focus();
  }

  private rowFor(
    record: SetupRunRecord,
    records: readonly SetupRunRecord[],
  ): SetupRunRow {
    const title = TITLES[record.workflow];
    const startedLabel = startedAtLabel(record.createdAt);
    const identity = `${title} (${startedLabel})`;
    const actionLabel =
      record.workflow === 'analysis' &&
      record.status === 'completed' &&
      !records.some((other) => other.parentId === record.id)
        ? 'Review skills'
        : 'Open';
    const chipState =
      record.status === 'running' && this.runs.isCancelling(record.id)
        ? ('cancelling' as const)
        : chipStateOf(record);
    return {
      record,
      title,
      chipState,
      actionLabel,
      actionName: `${actionLabel}: ${identity}`,
      canRerun: record.workflow === 'analysis' && record.status === 'completed',
      rerunName: `Re-run: ${identity}`,
      canDismiss: isTerminalSetupRunStatus(record.status),
      dismissName: `Dismiss: ${identity}`,
      startedLabel,
      progress: progressOf(record),
    };
  }
}
