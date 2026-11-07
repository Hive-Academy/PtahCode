import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  type ElementRef,
  type OnInit,
} from '@angular/core';
import { ArrowLeft, LucideAngularModule, Plus } from 'lucide-angular';
import {
  MachinesStore,
  type MachinesError,
  type MachinesOutcome,
  type RemoteMachine,
} from '../../services/machines-store';
import { DisplayTextPipe, displayText } from '../../utils/display-text';
import {
  MACHINE_REASON_COPY,
  durationText,
  noWorkerModeCopy,
  reasonNeedsRepair,
  versionMismatchCopy,
} from '../../utils/machine-copy';
import { AddMachinePaneComponent } from '../add-machine-pane/add-machine-pane.component';
import { MachineListComponent } from '../machine-list/machine-list.component';
import { MachineStatusComponent } from '../machine-status/machine-status.component';
import { ReadinessPanelComponent } from '../readiness-panel/readiness-panel.component';

/** What the right pane shows. */
export type MachinesPaneMode = 'detail' | 'add' | 'repair' | 'readiness';

interface MachineBanner {
  readonly role: 'alert' | 'status';
  readonly tone: 'err' | 'need';
  readonly label: string;
  readonly text: string;
  readonly action: 'repair' | 'retry' | null;
}

const CLOCK_TICK_MS = 1000;

/** The worker's Phase 1 checks, named for the empty state's "What is checked?". */
const CHECKED_ITEMS: readonly string[] = [
  'Operating system',
  'Node 22 or newer, and the session database loads',
  'Ptah and protocol versions are compatible',
  'The worker service listens on loopback only',
  'At least one workspace folder is registered and readable',
  'At least one provider is signed in',
  'The session driver lock works and none is stranded',
];

/**
 * The Machines surface (design 3, 4.1-4.5): the machine list on the left and,
 * on the right, the empty introduction, the add/pair form, the readiness
 * check, or the selected machine's header with its state banner.
 *
 * Machine state is read only from {@link MachinesStore} (`machines:state`),
 * never from session state (3.4). One clock ticks per second only while the
 * selected machine is offline or reconnecting, for "Lost contact" and "Next
 * attempt"; it stops otherwise and on destroy.
 *
 * Remote sessions of the selected machine are Batch 25 (C10c).
 */
@Component({
  selector: 'ptah-machines-view',
  standalone: true,
  imports: [
    LucideAngularModule,
    DisplayTextPipe,
    MachineListComponent,
    MachineStatusComponent,
    AddMachinePaneComponent,
    ReadinessPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 min-w-0 flex-1 bg-base-100' },
  template: `
    <div
      class="flex min-h-0 min-w-0 flex-1 flex-col min-[760px]:flex-row"
      data-testid="machines-view"
    >
      <ptah-machine-list
        class="max-h-[45%] shrink-0 border-b border-surface-border min-[760px]:max-h-none min-[760px]:w-[300px] min-[760px]:border-b-0 min-[760px]:border-r"
        [machines]="store.machines()"
        [selectedId]="selected()?.machineId ?? null"
        [loading]="store.loading()"
        [error]="store.error()"
        [now]="now()"
        (selected)="select($event)"
        (add)="openAdd()"
        (retryLoad)="reload()"
      />

      <section
        class="min-h-0 min-w-0 flex-1 overflow-y-auto"
        aria-label="Machine details"
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
              <div class="px-5 pt-4">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
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
              </div>
              <ptah-readiness-panel [machine]="machine" />
            }
          }
          @default {
            @if (selected(); as machine) {
              <div class="flex flex-col gap-4 p-5" data-testid="machine-detail">
                <header
                  class="flex flex-wrap items-start justify-between gap-3"
                >
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex min-w-0 items-center gap-2">
                      <h2
                        class="truncate text-base font-semibold text-base-content"
                      >
                        {{ machineName(machine) }}
                      </h2>
                      <ptah-machine-status [state]="machine.state" />
                    </div>
                    <p
                      class="text-xs text-base-content-muted"
                      data-testid="machine-detail-meta"
                    >
                      via SSH alias
                      <span class="font-mono">{{
                        machine.alias | displayText
                      }}</span>
                      @if (machine.versions?.remote; as remote) {
                        · ptah {{ remote.ptahVersion | displayText: 24 }} ·
                        protocol {{ remote.protocol.max }}
                      }
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                      data-testid="machine-readiness"
                      (click)="paneMode.set('readiness')"
                    >
                      Readiness check
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm text-state-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                      data-testid="machine-remove"
                      [disabled]="busy()"
                      (click)="askRemove()"
                    >
                      Remove machine
                    </button>
                  </div>
                </header>

                @if (confirmingRemove()) {
                  <div
                    class="flex flex-col gap-2 rounded-box border border-state-err bg-base-200 px-4 py-3"
                    role="alertdialog"
                    aria-labelledby="ptah-remove-title"
                    aria-describedby="ptah-remove-text"
                    data-testid="machine-remove-confirm"
                    (keydown.escape)="confirmingRemove.set(false)"
                  >
                    <span
                      id="ptah-remove-title"
                      class="text-sm font-bold text-base-content"
                      >Remove {{ machineName(machine) }}?</span
                    >
                    <span
                      id="ptah-remove-text"
                      class="text-sm text-base-content"
                      >Deletes the stored token and stops the tunnel. Sessions
                      on {{ machineName(machine) }} keep running there.</span
                    >
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm text-state-err border border-state-err focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                        data-testid="machine-remove-confirm-yes"
                        [disabled]="busy()"
                        (click)="remove(machine)"
                      >
                        Remove machine
                      </button>
                      <button
                        #removeCancel
                        type="button"
                        class="btn btn-ghost btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                        data-testid="machine-remove-confirm-no"
                        (click)="confirmingRemove.set(false)"
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
                    <span class="font-bold text-base-content">{{
                      failure.label
                    }}</span>
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
                      <span class="font-bold text-base-content">{{
                        banner.label
                      }}</span>
                      <span class="text-base-content">{{ banner.text }}</span>
                    </span>
                    @switch (banner.action) {
                      @case ('repair') {
                        <button
                          type="button"
                          class="btn btn-primary btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                          data-testid="machine-repair"
                          (click)="paneMode.set('repair')"
                        >
                          {{ machine.reason ? 'Re-pair' : 'Pair' }}
                        </button>
                      }
                      @case ('retry') {
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                          data-testid="machine-retry"
                          [disabled]="busy()"
                          (click)="retry(machine)"
                        >
                          Retry now
                        </button>
                      }
                    }
                  </div>
                }
              </div>
            } @else if (!store.loading() && store.machines().length === 0) {
              <div
                class="mx-auto flex max-w-[52ch] flex-col items-center gap-3 p-8 text-center"
                data-testid="machines-empty"
              >
                <h2 class="text-base font-semibold text-base-content">
                  Control Ptah on your other machines
                </h2>
                <p class="text-sm text-base-content-muted">
                  Ptah reaches each machine through your own SSH login, so
                  nothing is opened on your network.
                </p>
                <button
                  type="button"
                  class="btn btn-primary btn-sm gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                  data-testid="machines-empty-add"
                  (click)="openAdd()"
                >
                  <lucide-angular
                    [img]="PlusIcon"
                    class="h-4 w-4"
                    aria-hidden="true"
                  />
                  Add machine
                </button>
                <details class="text-left text-xs text-base-content-muted">
                  <summary
                    class="cursor-pointer text-center underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                  >
                    What is checked?
                  </summary>
                  <ol
                    class="mt-2 list-decimal pl-5"
                    data-testid="machines-checked"
                  >
                    @for (item of checkedItems; track item) {
                      <li>{{ item }}</li>
                    }
                  </ol>
                </details>
              </div>
            }
          }
        }
      </section>
    </div>
  `,
})
export class MachinesViewComponent implements OnInit {
  protected readonly store = inject(MachinesStore);
  private readonly injector = inject(Injector);

  protected readonly paneMode = signal<MachinesPaneMode>('detail');
  private readonly selectedId = signal<string | null>(null);
  protected readonly confirmingRemove = signal(false);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<{
    readonly label: string;
    readonly text: string;
  } | null>(null);
  protected readonly now = signal(Date.now());

  protected readonly checkedItems = CHECKED_ITEMS;
  protected readonly PlusIcon = Plus;
  protected readonly ArrowLeftIcon = ArrowLeft;

  private readonly removeCancel =
    viewChild<ElementRef<HTMLButtonElement>>('removeCancel');
  private clock: ReturnType<typeof setInterval> | undefined;

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

  public constructor() {
    effect(() => {
      // A new list or selection refreshes "last seen"; the clock runs only
      // while the selected machine is not connected.
      this.store.machines();
      const state = this.selected()?.state;
      untracked(() => {
        this.now.set(Date.now());
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
      this.confirmingRemove.set(false);
      this.actionError.set(null);
    }
    this.selectedId.set(machineId);
    this.paneMode.set('detail');
  }

  protected openAdd(): void {
    this.confirmingRemove.set(false);
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
    // Design 4.2: a successful pairing goes straight to the readiness check.
    this.paneMode.set('readiness');
  }

  protected askRemove(): void {
    this.confirmingRemove.set(true);
    afterNextRender(() => this.removeCancel()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected async remove(machine: RemoteMachine): Promise<void> {
    await this.act('Remove failed', () => this.store.remove(machine.machineId));
    if (this.actionError() === null) {
      this.confirmingRemove.set(false);
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
      clearInterval(this.clock);
      this.clock = undefined;
      return;
    }
    if (this.clock !== undefined) return;
    this.clock = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
  }
}

function errorSentence(error: MachinesError): string {
  const text = displayText(error.message, 200);
  if (text === '') return 'The request failed.';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The 4.3/4.5 banners for one machine, most actionable first. */
export function machineBanners(
  machine: RemoteMachine,
  now: number,
): readonly MachineBanner[] {
  const name = displayText(machine.displayName) || displayText(machine.alias);
  const banners: MachineBanner[] = [];

  if (machine.reason !== undefined) {
    const repair = reasonNeedsRepair(machine.reason);
    banners.push({
      role: repair ? 'alert' : 'status',
      tone: repair ? 'err' : 'need',
      label: repair ? 'Re-pair needed' : 'Session not re-attached',
      text: MACHINE_REASON_COPY[machine.reason],
      action: repair ? 'repair' : 'retry',
    });
  }

  switch (machine.state) {
    case 'unpaired':
      if (!reasonNeedsRepair(machine.reason)) {
        banners.push({
          role: 'status',
          tone: 'need',
          label: 'Not paired',
          text: `${name} has no pairing token on this machine. Pair it to connect.`,
          action: 'repair',
        });
      }
      break;
    case 'offline':
    case 'reconnecting': {
      const lost =
        machine.lastSeenAt !== undefined
          ? `Lost contact ${durationText(machine.lastSeenAt, now)} ago.`
          : `No contact with ${name}.`;
      const next =
        machine.nextRetryAt !== undefined && machine.nextRetryAt > now
          ? ` Next attempt in ${durationText(now, machine.nextRetryAt)}.`
          : '';
      banners.push({
        role: 'status',
        tone: 'need',
        label: machine.state === 'offline' ? 'Offline' : 'Reconnecting',
        text: `${lost} Sessions on ${name} keep running; they are shown as unknown, not failed.${next}`,
        action: 'retry',
      });
      break;
    }
    case 'version-mismatch':
      banners.push({
        role: 'alert',
        tone: 'err',
        label: 'Version mismatch',
        text:
          versionMismatchCopy(name, machine.versions, (v) =>
            displayText(v, 24),
          ) ?? noWorkerModeCopy(name),
        action: 'retry',
      });
      break;
    case 'connected':
      break;
  }
  return banners;
}
