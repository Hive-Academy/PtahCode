import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChildren,
  type ElementRef,
} from '@angular/core';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { InboxRowDirective, SetupActionDirective } from '@ptah-extension/ui';
import type {
  MachinesError,
  RemoteMachine,
} from '../../services/machines-store';
import { DisplayTextPipe, displayText } from '../../utils/display-text';
import { durationText } from '../../utils/machine-copy';
import { MACHINE_STATE_INK } from '../machine-status/machine-status.component';
import { MachineStatusComponent } from '../machine-status/machine-status.component';

interface MachineRow {
  readonly machineId: string;
  readonly machine: RemoteMachine;
  /** Accessible name and visible name, display-safe. */
  readonly name: string;
  readonly meta: string;
}

/**
 * The list pane of the Machines page (approved option A): the pane heading
 * with "Add machine", the client-side search, and the machine rows inside a
 * `role="listbox"`. The `ptah-inbox-layout` shell owns the pane surface,
 * padding and scroll; this component only fills the `[inboxList]` slot.
 *
 * Each row (design 4.5, D5) is a `ptahInboxRow` option: the machine name with
 * its alias in mono, then a second line in the state's ink that carries the
 * state marker with its label and a meta line (last seen or the machine's
 * Ptah version). State is never shown by colour alone.
 *
 * Keyboard (design 5): the list is one Tab stop. Up/Down/Home/End move focus
 * between the rows that match the search (roving `tabindex`); Enter or click
 * selects. The selected row carries `aria-selected` (from the row directive)
 * and `aria-current="true"`.
 */
@Component({
  selector: 'ptah-machine-list',
  standalone: true,
  imports: [
    LucideAngularModule,
    MachineStatusComponent,
    DisplayTextPipe,
    InboxRowDirective,
    SetupActionDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-base-content">Machines</h2>
      <button
        type="button"
        [ptahSetupAction]="'ghost'"
        class="gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
        [class.btn-primary]="rows().length > 0"
        [class.btn-ghost]="rows().length === 0"
        data-testid="machine-list-add"
        (click)="add.emit()"
      >
        <lucide-angular [img]="PlusIcon" class="h-4 w-4" aria-hidden="true" />
        Add machine
      </button>
    </div>

    <input
      type="search"
      class="input input-bordered input-sm w-full rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
      aria-label="Search machines"
      placeholder="Search machines"
      data-testid="machine-list-search"
      [value]="query()"
      (input)="onSearch($event)"
    />

    @if (loading() && rows().length === 0) {
      <p
        class="flex flex-col gap-2"
        role="status"
        aria-busy="true"
        data-testid="machine-list-loading"
      >
        <span class="sr-only">Loading machines…</span>
        <span class="skeleton h-10 rounded-xl" aria-hidden="true"></span>
        <span class="skeleton h-10 rounded-xl" aria-hidden="true"></span>
        <span class="skeleton h-10 rounded-xl" aria-hidden="true"></span>
      </p>
    } @else if (error(); as failure) {
      <div
        class="rounded-box border border-state-err p-3 text-xs"
        role="alert"
        data-testid="machine-list-error"
      >
        <p class="text-sm font-semibold text-state-err">
          Machines could not be loaded
        </p>
        <p class="mt-1 text-base-content-muted">
          {{ failure.message | displayText }}
        </p>
        <button
          type="button"
          class="btn btn-primary btn-sm mt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
          data-testid="machine-list-retry"
          (click)="retryLoad.emit()"
        >
          Try again
        </button>
      </div>
    } @else if (rows().length === 0) {
      <p
        class="text-xs text-base-content-muted"
        data-testid="machine-list-empty"
      >
        No machines yet.
      </p>
    } @else if (visibleRows().length === 0) {
      <p
        class="text-xs text-base-content-muted"
        data-testid="machine-list-no-match"
      >
        No machine matches "{{ query() }}".
      </p>
    }

    @if (visibleRows().length > 0) {
      <div class="flex flex-col gap-1" role="listbox" aria-label="Machine list">
        @for (row of visibleRows(); track row.machineId; let i = $index) {
          <button
            #rowButton
            ptahInboxRow
            [selected]="row.machineId === selectedId()"
            [attr.aria-current]="row.machineId === selectedId() ? 'true' : null"
            [attr.tabindex]="i === focusIndex() ? 0 : -1"
            [attr.data-machine-id]="row.machineId"
            data-testid="machine-row"
            (focus)="activeIndex.set(i)"
            (keydown)="onKeydown($event)"
            (click)="selected.emit(row.machineId)"
          >
            <span class="flex min-w-0 items-baseline justify-between gap-2">
              <span
                class="block truncate text-sm font-medium text-base-content"
                >{{ row.name }}</span
              >
              <span
                class="truncate font-mono text-xs text-base-content-muted"
                >{{ row.machine.alias | displayText }}</span
              >
            </span>
            <span
              class="flex min-w-0 items-center gap-2 text-xs"
              [class]="stateInk[row.machine.state]"
            >
              <ptah-machine-status [state]="row.machine.state" />
              @if (row.meta) {
                <span class="truncate" data-testid="machine-row-meta"
                  >· {{ row.meta }}</span
                >
              }
            </span>
          </button>
        }
      </div>
    }

    <p
      class="border-t border-surface-border pt-2 text-xs text-base-content-muted"
    >
      This machine stays in Chat.
    </p>
  `,
})
export class MachineListComponent {
  public readonly machines = input.required<readonly RemoteMachine[]>();
  public readonly selectedId = input<string | null>(null);
  public readonly loading = input(false);
  public readonly error = input<MachinesError | null>(null);
  /** Epoch ms used for "last seen"; the view owns the clock. */
  public readonly now = input(0);

  public readonly selected = output<string>();
  public readonly add = output<void>();
  public readonly retryLoad = output<void>();

  protected readonly PlusIcon = Plus;
  protected readonly stateInk = MACHINE_STATE_INK;
  protected readonly activeIndex = signal<number | null>(null);

  /** The client-side filter text over name and SSH alias. */
  protected readonly query = signal('');

  private readonly rowButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('rowButton');

  protected readonly rows = computed<readonly MachineRow[]>(() =>
    this.machines().map((machine) => ({
      machineId: machine.machineId,
      machine,
      name: displayText(machine.displayName) || displayText(machine.alias),
      meta: this.metaLine(machine),
    })),
  );

  protected readonly visibleRows = computed<readonly MachineRow[]>(() => {
    const needle = this.query().trim().toLowerCase();
    if (needle === '') return this.rows();
    return this.rows().filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        displayText(row.machine.alias).toLowerCase().includes(needle),
    );
  });

  /** The row holding the list's single Tab stop. */
  protected readonly focusIndex = computed(() => {
    const count = this.visibleRows().length;
    if (count === 0) return -1;
    const active = this.activeIndex();
    if (active !== null && active < count) return active;
    const selected = this.visibleRows().findIndex(
      (row) => row.machineId === this.selectedId(),
    );
    return selected === -1 ? 0 : selected;
  });

  protected onSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.query.set(target.value);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.visibleRows().length;
    const current = this.focusIndex();
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(current + 1, count - 1);
        break;
      case 'ArrowUp':
        next = Math.max(current - 1, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.activeIndex.set(next);
    this.rowButtons()[next]?.nativeElement.focus();
  }

  private metaLine(machine: RemoteMachine): string {
    const version = machine.versions?.remote?.ptahVersion;
    const versionText = version ? `ptah ${displayText(version, 24)}` : '';
    let status = '';
    switch (machine.state) {
      case 'offline':
      case 'reconnecting':
        status =
          machine.lastSeenAt !== undefined && this.now() > 0
            ? `Last seen ${durationText(machine.lastSeenAt, this.now())} ago`
            : 'Not connected';
        break;
      case 'version-mismatch':
        status = 'Not connected';
        break;
      case 'unpaired':
        status = 'Pair to connect';
        break;
      case 'connected':
        break;
    }
    return [status, versionText].filter(Boolean).join(' · ');
  }
}
