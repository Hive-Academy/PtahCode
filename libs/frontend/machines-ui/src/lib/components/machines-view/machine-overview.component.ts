import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { ArrowLeft, LucideAngularModule, MoreHorizontal } from 'lucide-angular';
import type { RemoteMachine } from '../../services/machines-store';
import type { MachineBanner } from '../../utils/machine-banners';
import { DisplayTextPipe, displayText } from '../../utils/display-text';
import { MachineApprovalsComponent } from './machine-approvals.component';
import { MachineStatusComponent } from '../machine-status/machine-status.component';
import {
  ReadinessPanelComponent,
  type ReadinessCounts,
} from '../readiness-panel/readiness-panel.component';
import {
  RemoteSessionListComponent,
  type RemoteSessionOpenRequest,
} from '../remote-session-list/remote-session-list.component';

/** A failed store action as the overview reports it. */
export interface MachinesActionError {
  readonly label: string;
  readonly text: string;
}

/**
 * The selected machine's overview in the detail pane (approved option A):
 * header with name, meta line, state badge, "Readiness check" and the
 * overflow with the destructive remove, the waiting-approval notice, the
 * state banners, the collapsible readiness tile and the sessions.
 *
 * Presentational only: the page keeps the store calls, the selection and the
 * pane modes; this component reports every action through its outputs. The
 * remove confirm keeps its alertdialog role and focuses Cancel when it opens.
 */
@Component({
  selector: 'ptah-machine-overview',
  standalone: true,
  imports: [
    LucideAngularModule,
    DisplayTextPipe,
    MachineApprovalsComponent,
    MachineStatusComponent,
    ReadinessPanelComponent,
    RemoteSessionListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4', 'data-testid': 'machine-detail' },
  template: `
    <button
      type="button"
      class="btn btn-ghost btn-sm hidden gap-1 self-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content max-[767px]:inline-flex"
      data-testid="machines-narrow-back"
      (click)="backToList.emit()"
    >
      <lucide-angular
        [img]="ArrowLeftIcon"
        class="h-3.5 w-3.5"
        aria-hidden="true"
      />
      All machines
    </button>

    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="mr-auto flex min-w-0 flex-col gap-1">
        <h2
          class="truncate text-lg font-semibold tracking-tight text-base-content"
        >
          {{ machineName() }}
        </h2>
        <p
          class="text-xs text-base-content-muted"
          data-testid="machine-detail-meta"
        >
          via SSH alias
          <span class="font-mono">{{ machine().alias | displayText }}</span>
          @if (machine().versions?.remote; as remote) {
            · ptah {{ remote.ptahVersion | displayText: 24 }} · protocol
            {{ remote.protocol.max }}
          }
        </p>
      </div>
      <span class="badge badge-outline badge-sm shrink-0">
        <ptah-machine-status [state]="machine().state" />
      </span>
      <div class="flex shrink-0 gap-2">
        <button
          type="button"
          class="btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
          data-testid="machine-readiness"
          (click)="openReadiness.emit()"
        >
          Readiness check
        </button>
        <div class="dropdown dropdown-end">
          <button
            type="button"
            class="btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
            aria-label="More machine actions"
            data-testid="machine-actions"
          >
            <lucide-angular
              [img]="MoreIcon"
              class="h-4 w-4"
              aria-hidden="true"
            />
          </button>
          <ul
            class="dropdown-content menu z-10 w-52 rounded-box border border-surface-border bg-base-200 p-1 text-sm"
          >
            <li>
              <button
                type="button"
                class="text-state-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                data-testid="machine-remove"
                [disabled]="busy()"
                (click)="askRemove.emit()"
              >
                Remove machine
              </button>
            </li>
          </ul>
        </div>
      </div>
    </header>

    <ptah-machine-approvals
      [machineId]="machine().machineId"
      [machineName]="machineName()"
    />

    @if (confirmingRemove()) {
      <div
        class="flex flex-col gap-2 rounded-box border border-state-err bg-base-200 px-4 py-3"
        role="alertdialog"
        aria-labelledby="ptah-remove-title"
        aria-describedby="ptah-remove-text"
        data-testid="machine-remove-confirm"
        (keydown.escape)="cancelRemove.emit()"
      >
        <span id="ptah-remove-title" class="text-sm font-bold text-base-content"
          >Remove {{ machineName() }}?</span
        >
        <span id="ptah-remove-text" class="text-sm text-base-content"
          >Deletes the stored token and stops the tunnel. Sessions on
          {{ machineName() }} keep running there.</span
        >
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-sm text-state-err border border-state-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
            data-testid="machine-remove-confirm-yes"
            [disabled]="busy()"
            (click)="removeMachine.emit()"
          >
            Remove machine
          </button>
          <button
            #removeCancel
            type="button"
            class="btn btn-ghost btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
            data-testid="machine-remove-confirm-no"
            (click)="cancelRemove.emit()"
          >
            Cancel
          </button>
        </div>
      </div>
    }

    @if (actionError(); as failure) {
      <div
        class="flex flex-col gap-1 rounded-box border border-state-err px-4 py-3 text-sm"
        role="alert"
        data-testid="machine-action-error"
      >
        <span class="font-bold text-base-content">{{ failure.label }}</span>
        <span class="text-base-content">{{ failure.text }}</span>
      </div>
    }

    @for (banner of banners(); track banner.label) {
      <div
        class="flex flex-wrap items-start justify-between gap-3 rounded-box border px-4 py-3 text-sm"
        [class.border-state-err]="banner.tone === 'err'"
        [class.border-state-need]="banner.tone === 'need'"
        [attr.role]="banner.role"
        data-testid="machine-banner"
      >
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="font-bold text-base-content">{{ banner.label }}</span>
          <span class="text-base-content">{{ banner.text }}</span>
        </span>
        @switch (banner.action) {
          @case ('repair') {
            <button
              type="button"
              class="btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
              data-testid="machine-repair"
              (click)="repair.emit()"
            >
              {{ machine().reason ? 'Re-pair' : 'Pair' }}
            </button>
          }
          @case ('retry') {
            <button
              type="button"
              class="btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
              data-testid="machine-retry"
              [disabled]="busy()"
              (click)="retry.emit()"
            >
              Retry now
            </button>
          }
        }
      </div>
    }

    <details
      class="surface-2 rounded-box p-4"
      data-testid="machine-readiness-tile"
      (toggle)="onReadinessToggle($event)"
    >
      <summary
        class="cursor-pointer text-sm font-semibold text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
      >
        Readiness
        @if (readinessCounts(); as counts) {
          <span
            class="ml-1 text-xs font-normal"
            [class.text-base-content-muted]="counts.failed === 0"
            [class.text-state-need]="counts.failed > 0"
            data-testid="machine-readiness-result"
            >{{ counts.passed }} of {{ counts.total }} passed{{
              counts.failed > 0 ? ' · ' + counts.failed + ' failed' : ''
            }}</span
          >
        } @else {
          <span class="ml-1 text-xs font-normal text-base-content-muted"
            >Checks this machine before sessions run</span
          >
        }
      </summary>
      @if (readinessOpen()) {
        <ptah-readiness-panel
          [machine]="machine()"
          class="mt-3"
          (counted)="onReadinessCounted($event)"
        />
      }
    </details>

    <ptah-remote-session-list
      [machine]="machine()"
      (opened)="opened.emit($event)"
    />
  `,
})
export class MachineOverviewComponent {
  public readonly machine = input.required<RemoteMachine>();
  public readonly banners = input.required<readonly MachineBanner[]>();
  public readonly busy = input(false);
  public readonly confirmingRemove = input(false);
  public readonly actionError = input<MachinesActionError | null>(null);

  public readonly openReadiness = output<void>();
  public readonly askRemove = output<void>();
  public readonly cancelRemove = output<void>();
  public readonly removeMachine = output<void>();
  public readonly retry = output<void>();
  public readonly repair = output<void>();
  public readonly opened = output<RemoteSessionOpenRequest>();
  public readonly backToList = output<void>();

  protected readonly ArrowLeftIcon = ArrowLeft;
  protected readonly MoreIcon = MoreHorizontal;

  /** The readiness tile mounts the panel only once it was expanded. */
  protected readonly readinessOpen = signal(false);

  /** The last check result, kept for the machine that it belongs to. */
  private readonly lastCounts = signal<{
    readonly machineId: string;
    readonly counts: ReadinessCounts;
  } | null>(null);
  protected readonly readinessCounts = computed(() => {
    const last = this.lastCounts();
    return last !== null && last.machineId === this.machine().machineId
      ? last.counts
      : null;
  });

  private readonly injector = inject(Injector);
  private readonly removeCancel =
    viewChild<ElementRef<HTMLButtonElement>>('removeCancel');

  protected readonly machineName = computed(
    () =>
      displayText(this.machine().displayName) ||
      displayText(this.machine().alias),
  );

  public constructor() {
    effect(() => {
      if (!this.confirmingRemove()) return;
      afterNextRender(() => this.removeCancel()?.nativeElement.focus(), {
        injector: this.injector,
      });
    });
  }

  protected onReadinessCounted(counts: ReadinessCounts): void {
    this.lastCounts.set({ machineId: this.machine().machineId, counts });
  }

  protected onReadinessToggle(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLDetailsElement) {
      this.readinessOpen.set(target.open);
    }
  }
}
