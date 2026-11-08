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
import type {
  MachinesError,
  RemoteMachine,
} from '../../services/machines-store';
import { DisplayTextPipe, displayText } from '../../utils/display-text';
import { durationText } from '../../utils/machine-copy';
import { MachineStatusComponent } from '../machine-status/machine-status.component';

interface MachineRow {
  readonly machineId: string;
  readonly machine: RemoteMachine;
  /** Accessible name and visible name, display-safe. */
  readonly name: string;
  readonly meta: string;
}

/**
 * Left list of the Machines view (design 4.1, 4.5): a `<ul>` of rows with a
 * name, the alias in mono, the state marker, and a meta line (last seen or
 * the machine's Ptah version).
 *
 * Keyboard (design 5): the list is one Tab stop. Up/Down/Home/End move focus
 * between rows (roving `tabindex`); Enter or click selects. The selected row
 * carries `aria-current="true"` and a background step.
 */
@Component({
  selector: 'ptah-machine-list',
  standalone: true,
  imports: [LucideAngularModule, MachineStatusComponent, DisplayTextPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col bg-base-100' },
  template: `
    <div
      class="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-2"
    >
      <h2 class="text-sm font-semibold text-base-content">Machines</h2>
      <button
        type="button"
        class="btn btn-sm gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
        [class.btn-primary]="rows().length > 0"
        [class.btn-ghost]="rows().length === 0"
        data-testid="machine-list-add"
        (click)="add.emit()"
      >
        <lucide-angular [img]="PlusIcon" class="h-4 w-4" aria-hidden="true" />
        Add machine
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      @if (loading() && rows().length === 0) {
        <p
          class="flex items-center gap-2 px-3 py-3 text-xs text-base-content-muted"
          role="status"
          aria-busy="true"
          data-testid="machine-list-loading"
        >
          <span
            class="loading loading-spinner loading-xs motion-reduce:animate-none"
            aria-hidden="true"
          ></span>
          Loading machines…
        </p>
      } @else if (error(); as failure) {
        <div
          class="m-3 rounded-box border border-state-err p-3 text-xs"
          role="alert"
          data-testid="machine-list-error"
        >
          <p class="font-semibold text-base-content">
            Machines could not be loaded
          </p>
          <p class="mt-1 text-base-content-muted">
            {{ failure.message | displayText }}
          </p>
          <button
            type="button"
            class="btn btn-ghost btn-xs mt-2 border border-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
            data-testid="machine-list-retry"
            (click)="retryLoad.emit()"
          >
            Try again
          </button>
        </div>
      } @else if (rows().length === 0) {
        <p
          class="px-3 py-3 text-xs text-base-content-muted"
          data-testid="machine-list-empty"
        >
          No machines yet.
        </p>
      }

      @if (rows().length > 0) {
        <ul class="flex flex-col gap-0.5 p-1.5" aria-label="Machines">
          @for (row of rows(); track row.machineId; let i = $index) {
            <li>
              <button
                #rowButton
                type="button"
                class="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                [class.bg-base-300]="row.machineId === selectedId()"
                [class.ring-1]="row.machineId === selectedId()"
                [class.ring-inset]="row.machineId === selectedId()"
                [class.ring-base-content/60]="row.machineId === selectedId()"
                [attr.aria-current]="
                  row.machineId === selectedId() ? 'true' : null
                "
                [attr.tabindex]="i === focusIndex() ? 0 : -1"
                [attr.data-machine-id]="row.machineId"
                data-testid="machine-row"
                (focus)="activeIndex.set(i)"
                (keydown)="onKeydown($event)"
                (click)="selected.emit(row.machineId)"
              >
                <span class="flex min-w-0 items-center justify-between gap-2">
                  <span class="flex min-w-0 items-baseline gap-1.5">
                    <span
                      class="truncate text-sm font-semibold text-base-content"
                      >{{ row.name }}</span
                    >
                    <span
                      class="truncate font-mono text-xs text-base-content-muted"
                      >{{ row.machine.alias | displayText }}</span
                    >
                  </span>
                  <ptah-machine-status [state]="row.machine.state" />
                </span>
                @if (row.meta) {
                  <span
                    class="truncate text-xs text-base-content-muted"
                    data-testid="machine-row-meta"
                    >{{ row.meta }}</span
                  >
                }
              </button>
            </li>
          }
        </ul>
      }
    </div>

    <p
      class="border-t border-surface-border px-3 py-2 text-xs text-base-content-muted"
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
  protected readonly activeIndex = signal<number | null>(null);

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

  /** The row holding the list's single Tab stop. */
  protected readonly focusIndex = computed(() => {
    const count = this.rows().length;
    if (count === 0) return -1;
    const active = this.activeIndex();
    if (active !== null && active < count) return active;
    const selected = this.rows().findIndex(
      (row) => row.machineId === this.selectedId(),
    );
    return selected === -1 ? 0 : selected;
  });

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.rows().length;
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
