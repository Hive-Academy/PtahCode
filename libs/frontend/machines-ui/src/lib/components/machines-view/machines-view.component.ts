import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type OnInit,
} from '@angular/core';
import { ArrowLeft, LucideAngularModule } from 'lucide-angular';
import { ClockService } from '@ptah-extension/core';
import { InboxLayoutComponent, PtahButtonDirective } from '@ptah-extension/ui';
import {
  MachinesStore,
  type MachinesOutcome,
  type RemoteMachine,
} from '../../services/machines-store';
import { displayText } from '../../utils/display-text';
import {
  machineBanners,
  type MachineBanner,
} from '../../utils/machine-banners';
import { errorSentence } from '../../utils/remote-session-copy';
import { AddMachinePaneComponent } from '../add-machine-pane/add-machine-pane.component';
import { MachineListComponent } from '../machine-list/machine-list.component';
import { ReadinessPanelComponent } from '../readiness-panel/readiness-panel.component';
import type { RemoteSessionOpenRequest } from '../remote-session-list/remote-session-list.component';
import { RemoteSessionViewComponent } from '../remote-session-view/remote-session-view.component';
import {
  MachineOverviewComponent,
  type MachinesActionError,
} from './machine-overview.component';
import { MachinesIntroComponent } from './machines-intro.component';
import { MachinesPageHeaderComponent } from './machines-page-header.component';

/** What the detail pane shows. */
export type MachinesPaneMode =
  'detail' | 'add' | 'repair' | 'readiness' | 'session';

/**
 * The Machines page (approved option A): the page header, then the shared
 * `ptah-inbox-layout` inbox — the machine list with its search on the left,
 * the selected machine's overview (or the add/pair, readiness or session
 * pane) on the right. The shell owns the pane surfaces and the below-768 px
 * single-pane switch; `detailOpen` opens the detail pane on narrow screens
 * while a machine is selected or a pane other than the plain list is open.
 *
 * Machine state is read only from {@link MachinesStore} (`machines:state`),
 * never from session state (3.4). One clock ticks per second only while the
 * selected machine is offline or reconnecting, for "Lost contact" and "Next
 * attempt"; it stops otherwise and on destroy.
 */
@Component({
  selector: 'ptah-machines-view',
  standalone: true,
  imports: [
    PtahButtonDirective,
    LucideAngularModule,
    InboxLayoutComponent,
    MachinesPageHeaderComponent,
    MachineListComponent,
    MachineOverviewComponent,
    AddMachinePaneComponent,
    ReadinessPanelComponent,
    RemoteSessionViewComponent,
    MachinesIntroComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 min-w-0 flex-1 bg-base-100' },
  template: `
    <div
      class="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 p-4 md:p-6"
      data-testid="machines-view"
    >
      <ptah-machines-page-header
        [pendingApprovals]="store.pendingApprovalCount()"
        (add)="openAdd()"
      />

      <ptah-inbox-layout
        class="min-h-0 flex-1"
        listLabel="Machines"
        detailLabel="Machine details"
        [listWidth]="280"
        [detailOpen]="detailOpen()"
      >
        <ptah-machine-list
          inboxList
          [machines]="store.machines()"
          [selectedId]="selected()?.machineId ?? null"
          [loading]="store.loading()"
          [error]="store.error()"
          [now]="now()"
          (selected)="select($event)"
          (retryLoad)="reload()"
        />

        <div
          class="flex min-h-0 flex-col gap-3"
          [class.h-full]="paneMode() === 'session'"
          data-testid="machines-pane"
        >
          @switch (paneMode()) {
            @case ('add') {
              <ptah-add-machine-pane
                (paired)="onPaired($event)"
                (cancelled)="closePane()"
              />
            }
            @case ('repair') {
              @if (selected(); as machine) {
                <ptah-add-machine-pane
                  [machine]="machine"
                  (paired)="onPaired($event)"
                  (cancelled)="closePane()"
                />
              }
            }
            @case ('readiness') {
              @if (selected(); as machine) {
                <button
                  type="button"
                  ptahButton
                  variant="ghost"
                  size="xs"
                  class="self-start"
                  data-testid="machines-back"
                  (click)="closePane()"
                >
                  <lucide-angular
                    [img]="ArrowLeftIcon"
                    class="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  Back to {{ machineName(machine) }}
                </button>
                <ptah-readiness-panel [machine]="machine" />
              }
            }
            @case ('session') {
              @if (selected(); as machine) {
                @if (openSession(); as session) {
                  <button
                    type="button"
                    ptahButton
                    variant="ghost"
                    size="xs"
                    class="self-start"
                    data-testid="machines-session-back"
                    (click)="closeSession()"
                  >
                    <lucide-angular
                      [img]="ArrowLeftIcon"
                      class="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    Back to {{ machineName(machine) }}
                  </button>
                  <ptah-remote-session-view
                    [machineId]="machine.machineId"
                    [sessionId]="session.sessionId"
                    [title]="session.title"
                    [workspacePath]="session.workspacePath"
                  />
                }
              }
            }
            @default {
              @if (selected(); as machine) {
                <ptah-machine-overview
                  [machine]="machine"
                  [banners]="banners()"
                  [busy]="busy()"
                  [confirmingRemove]="confirmingRemove()"
                  [actionError]="actionError()"
                  (openReadiness)="paneMode.set('readiness')"
                  (askRemove)="askRemove()"
                  (cancelRemove)="cancelRemove()"
                  (removeMachine)="remove(machine)"
                  (retry)="retry(machine)"
                  (repair)="paneMode.set('repair')"
                  (opened)="showSession($event)"
                  (backToList)="narrowDetailOpen.set(false)"
                />
              } @else if (
                !store.loading() &&
                store.machines().length === 0 &&
                !store.error()
              ) {
                <ptah-machines-intro (add)="openAdd()" />
              } @else if (store.loading()) {
                <div
                  class="flex flex-col gap-2"
                  role="status"
                  aria-busy="true"
                  data-testid="machines-detail-loading"
                >
                  <span class="sr-only">Loading machines…</span>
                  <span
                    class="skeleton h-10 rounded-xl"
                    aria-hidden="true"
                  ></span>
                  <span
                    class="skeleton h-10 rounded-xl"
                    aria-hidden="true"
                  ></span>
                  <span
                    class="skeleton h-10 rounded-xl"
                    aria-hidden="true"
                  ></span>
                </div>
              }
            }
          }
        </div>
      </ptah-inbox-layout>
    </div>
  `,
})
export class MachinesViewComponent implements OnInit {
  protected readonly store = inject(MachinesStore);

  protected readonly paneMode = signal<MachinesPaneMode>('detail');
  private readonly selectedId = signal<string | null>(null);
  /** Narrow (< 768 px) only: the user opened the detail pane. */
  protected readonly narrowDetailOpen = signal(false);
  /** The machine whose removal waits for confirmation. */
  private readonly removeTargetId = signal<string | null>(null);
  /** True only while the confirmed machine is still the selected machine. */
  protected readonly confirmingRemove = computed(() => {
    const target = this.removeTargetId();
    return target !== null && target === this.selected()?.machineId;
  });
  protected readonly busy = signal(false);
  protected readonly actionError = signal<MachinesActionError | null>(null);
  private readonly clockService = inject(ClockService);
  protected readonly now = this.clockService.now;
  protected readonly openSession = signal<RemoteSessionOpenRequest | null>(
    null,
  );

  protected readonly ArrowLeftIcon = ArrowLeft;
  /** Releases the shared clock; `null` while no clock is held. */
  private releaseClock: (() => void) | null = null;

  /** The selected machine; the first one when none (or a removed one) is selected. */
  protected readonly selected = computed<RemoteMachine | null>(() => {
    const machines = this.store.machines();
    const id = this.selectedId();
    return machines.find((m) => m.machineId === id) ?? machines[0] ?? null;
  });

  protected readonly banners = computed<readonly MachineBanner[]>(() => {
    const machine = this.selected();
    if (machine === null) return [];
    return machineBanners(machine, this.now());
  });

  /** Below 768 px the shell shows one pane: the detail while this is true. */
  protected readonly detailOpen = computed(
    () => this.paneMode() !== 'detail' || this.narrowDetailOpen(),
  );

  public constructor() {
    effect(() => {
      // A new list or selection refreshes "last seen"; the clock runs only
      // while the selected machine is not connected.
      this.store.machines();
      const state = this.selected()?.state;
      untracked(() => {
        this.setClock(state === 'offline' || state === 'reconnecting');
      });
    });
    inject(DestroyRef).onDestroy(() => this.setClock(false));
  }

  public ngOnInit(): void {
    void this.store.loadMachines();
  }

  protected machineName(machine: RemoteMachine): string {
    return displayText(machine.displayName) || displayText(machine.alias);
  }

  protected select(machineId: string): void {
    if (machineId !== this.selected()?.machineId) {
      this.removeTargetId.set(null);
      this.actionError.set(null);
    }
    this.selectedId.set(machineId);
    this.openSession.set(null);
    this.paneMode.set('detail');
    this.narrowDetailOpen.set(true);
  }

  protected showSession(session: RemoteSessionOpenRequest): void {
    this.openSession.set(session);
    this.paneMode.set('session');
  }

  protected closeSession(): void {
    this.openSession.set(null);
    this.paneMode.set('detail');
  }

  protected openAdd(): void {
    this.removeTargetId.set(null);
    this.paneMode.set('add');
  }

  protected closePane(): void {
    this.paneMode.set('detail');
  }

  protected reload(): void {
    void this.store.loadMachines();
  }

  protected onPaired(machine: RemoteMachine): void {
    this.selectedId.set(machine.machineId);
    this.actionError.set(null);
    this.narrowDetailOpen.set(true);
    // Design 4.2: a successful pairing goes straight to the readiness check.
    this.paneMode.set('readiness');
  }

  protected askRemove(): void {
    this.removeTargetId.set(this.selected()?.machineId ?? null);
  }

  protected cancelRemove(): void {
    this.removeTargetId.set(null);
  }

  protected async remove(machine: RemoteMachine): Promise<void> {
    // The confirmation belongs to one machine. Reject a removal of another one.
    if (this.removeTargetId() !== machine.machineId) {
      this.removeTargetId.set(null);
      return;
    }
    await this.act('Remove failed', () => this.store.remove(machine.machineId));
    if (this.actionError() === null) {
      this.removeTargetId.set(null);
      this.selectedId.set(null);
    }
  }

  protected async retry(machine: RemoteMachine): Promise<void> {
    await this.act('Retry failed', () => this.store.retry(machine.machineId));
  }

  private async act(
    label: string,
    call: () => Promise<MachinesOutcome<unknown>>,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const outcome = await call();
      if (!outcome.ok) {
        this.actionError.set({
          label,
          text:
            'error' in outcome
              ? errorSentence(outcome.error)
              : 'The request was refused.',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }

  private setClock(running: boolean): void {
    if (!running) {
      this.releaseClock?.();
      this.releaseClock = null;
      return;
    }
    // The banner text counts seconds, so hold the one-second clock.
    this.releaseClock ??= this.clockService.acquire();
  }
}
