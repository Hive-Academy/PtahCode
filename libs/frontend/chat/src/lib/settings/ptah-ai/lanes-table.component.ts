import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  PTAH_CLI_PERMISSION_CAPABILITIES,
  resolveCliLaneDefaultPair,
  type CliAdapterManifest,
  type CliLaneDefaults,
  type CliType,
} from '@ptah-extension/shared';
import {
  PtahTableComponent,
  PtahTableRowDirective,
  PtahCollapsibleCellDirective,
  PtahDetailCellDirective,
  PtahDetailRowDirective,
  PtahRowExpanderComponent,
  PtahTableRowActionsComponent,
  PtahTableControlCellDirective,
  PtahTableMessageCellDirective,
  PtahToggleDirective,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInlineConfirmComponent,
} from '@ptah-extension/ui';
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Inbox,
  Link2,
  Loader2,
  LogIn,
  LucideAngularModule,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Terminal,
  Trash2,
  TriangleAlert,
} from 'lucide-angular';
import { LaneRowIdentityComponent } from './lane-row-identity.component';
import type { CliMatrixCellField, CliMatrixRow } from './cli-matrix-rows';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';
import {
  LaneModelEffortCellComponent,
  laneModelDisplay,
} from './lane-model-effort-cell.component';
import { LanesTableStatusComponent } from './lanes-table-status.component';
import { LanesTableDeleteFocus } from './lanes-table-delete-focus';
import type { CliProviderInfoKind } from './cli-provider-card-popovers.component';
import { LanesTableDetailComponent } from './lanes-table-detail.component';
import { LanesRedetectButtonComponent } from './lanes-redetect-button.component';
import {
  LANE_NETWORK_LABELS,
  LANE_PERMISSION_LABELS,
} from './lane-option-labels';
import {
  LaneOrderDrag,
  type LaneOrderMove,
  type LaneOrderSettlement,
} from './lane-order-drag';

export { splitModelId } from './lane-model-effort-cell.component';
export type LaneTableRow = CliMatrixRow & {
  /**
   * Position in the try order; uninstalled agents have no position.
   * Stored values are 1-based (shown as rank). The order buttons use the
   * 0-based index among positioned rows only.
   */
  readonly order?: number;
};
@Component({
  selector: 'ptah-lanes-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahTableComponent,
    PtahTableRowDirective,
    PtahCollapsibleCellDirective,
    PtahDetailCellDirective,
    PtahDetailRowDirective,
    PtahRowExpanderComponent,
    PtahTableRowActionsComponent,
    PtahTableControlCellDirective,
    PtahTableMessageCellDirective,
    PtahToggleDirective,
    PtahButtonDirective,
    PtahIconButtonDirective,
    LucideAngularModule,
    CliLaneDefaultCellComponent,
    LaneModelEffortCellComponent,
    LaneRowIdentityComponent,
    LanesTableStatusComponent,
    PtahInlineConfirmComponent,
    LanesTableDetailComponent,
    LanesRedetectButtonComponent,
  ],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './lanes-table.component.css',
  templateUrl: './lanes-table.component.html',
})
export class LanesTableComponent {
  protected readonly GripIcon = GripVertical;
  protected readonly UpIcon = ChevronUp;
  protected readonly DownIcon = ChevronDown;
  protected readonly CliGroupIcon = Terminal;
  protected readonly PtahGroupIcon = Boxes;
  protected readonly AddIcon = Plus;
  protected readonly InheritedIcon = Link2;
  protected readonly TestIcon = Play;
  protected readonly SignInIcon = LogIn;
  protected readonly EditIcon = Pencil;
  protected readonly DeleteIcon = Trash2;
  protected readonly ResetIcon = RotateCcw;
  protected readonly LoadingIcon = Loader2;
  protected readonly AlertIcon = TriangleAlert;
  protected readonly RetryIcon = RotateCcw;
  protected readonly EmptyIcon = Inbox;
  protected readonly skeletonRows = [0, 1, 2] as const;
  /** Middle tier is based on the actual pane, never the app viewport. */
  protected readonly modelColumn = signal(false);
  /** "Sign in" of a row that needs a key (status cell and kebab): its detail opens with Credentials. */
  protected recover(row: LaneTableRow): void {
    this.showDetail(row, 'credentials');
    this.signIn.emit(row);
  }
  protected resetDefaultLabel(row: LaneTableRow): string {
    if (!row.manifest) return 'Reset to default';
    const pair = resolveCliLaneDefaultPair(row.manifest);
    const permission = 'permission' in pair ? pair.permission : undefined;
    const description =
      permission === 'yolo'
        ? 'Auto \u2014 full access'
        : (permission ?? 'Auto');
    return `Reset to default (${description})`;
  }
  readonly rows = input.required<readonly LaneTableRow[]>();
  /** Index among positioned rows; uninstalled system rows have no entry. */
  protected readonly positions = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.rows()) {
      if (row.kind === 'system' && !row.installed) continue;
      map.set(row.id, map.size);
    }
    return map;
  });
  /**
   * The table bodies: Reorder mode shows one flat list in global order (decision 18); otherwise the CLI agents
   * group (installed, then recovery rows) and the Ptah CLI instances group. Numbers stay global.
   */
  protected readonly groups = computed(
    (): readonly {
      readonly key: 'flat' | 'cli' | 'ptah';
      readonly rows: readonly LaneTableRow[];
    }[] =>
      this.orderMode()
        ? [{ key: 'flat', rows: this.rows() }]
        : [
            {
              key: 'cli',
              rows: this.rows().filter((row) => row.kind === 'system'),
            },
            {
              key: 'ptah',
              rows: this.rows().filter((row) => row.kind === 'instance'),
            },
          ],
  );
  /** Visible column count, for group headers, message rows and the detail cell. */
  protected readonly columnCount = computed(() =>
    this.table()?.collapsed() ? (this.modelColumn() ? 6 : 5) : 8,
  );
  /** The value a Ptah CLI row inherits from the group defaults (P20, P-35). */
  protected readonly inherited = computed(() => {
    const pair = resolveCliLaneDefaultPair(
      this.ptahDefaults()?.manifest ?? PTAH_CLI_PERMISSION_CAPABILITIES,
      this.ptahDefaults()?.saved ?? this.defaults()?.['ptah-cli'] ?? {},
    );
    return 'unsupported' in pair
      ? { permission: 'Default', network: 'Default' }
      : {
          permission: pair.permission
            ? LANE_PERMISSION_LABELS[pair.permission]
            : 'Default',
          network: pair.network ? LANE_NETWORK_LABELS[pair.network] : 'Default',
        };
  });
  /** The numbered rows in display order: the ids that Reorder mode moves. */
  protected readonly orderIds = computed(() =>
    this.rows()
      .filter((row) => this.positions().has(row.id))
      .map((row) => row.id),
  );
  readonly defaults = input<CliLaneDefaults>();
  /** The Ptah CLI group defaults (manifest + saved pair); null hides the defaults cell of the group header. */
  readonly ptahDefaults = input<{
    readonly manifest: CliAdapterManifest;
    readonly saved: CliLaneDefaults['ptah-cli'];
  } | null>(null);
  readonly orderMode = input(false);
  readonly busy = input(false);
  /** A Re-detect (any entry) runs, read-backs included: the install guide's Re-detect waits. */
  readonly detecting = input(false);
  readonly canWrite = input(true);
  /** `false` while the saved order is not verified (failed, partial or running read): no move is requested. */
  readonly canReorder = input(true);
  readonly busyRows = input<Readonly<Record<string, boolean>>>({});
  readonly testingRows = input<Readonly<Record<string, boolean>>>({});
  readonly testResults = input<Readonly<Record<string, string>>>({});
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly guides = input<
    Readonly<
      Partial<
        Record<
          CliType,
          { readonly command: string | null; readonly note: string }
        >
      >
    >
  >({});
  protected readonly testAnnouncement = computed(() =>
    this.rows()
      .map((row) =>
        this.testingRows()[row.id]
          ? 'Running test for ' + row.name
          : (this.testResults()[row.id] ?? ''),
      )
      .filter(Boolean)
      .join('. '),
  );
  private readonly table = viewChild(PtahTableComponent);
  protected readonly pendingDelete = signal<LaneTableRow | null>(null);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderFocusReturning = signal(false);
  private readonly deleteFocus = new LanesTableDeleteFocus();
  private readonly openCell = signal<{
    row: LaneTableRow;
    field: CliMatrixCellField;
    place: 'cell' | 'detail';
  } | null>(null);
  readonly toggled = output<{ row: LaneTableRow; event: Event }>();
  /** Reorder mode: the displayed numbered ids in their new order (the matrix keeps undisplayed saved ids). */
  readonly reordered = output<LaneOrderMove>();
  readonly test = output<LaneTableRow>();
  readonly edit = output<LaneTableRow>();
  readonly delete = output<LaneTableRow>();
  /** The one Add of the Ptah CLI group: its header button, or the primary button of the empty group row. */
  readonly addRequested = output<'header' | 'empty'>();
  readonly ptahDefaultSelected = output<
    NonNullable<CliLaneDefaults['ptah-cli']>
  >();
  readonly ptahDefaultResetRequested = output<void>();
  readonly signIn = output<LaneTableRow>();
  readonly retry = output<void>();
  readonly redetect = output<string>();
  readonly codexSettings = output<void>();
  readonly tiers = output<LaneTableRow>();
  readonly defaultSelected = output<{
    row: LaneTableRow;
    choice: NonNullable<CliLaneDefaults[CliType]>;
  }>();
  readonly defaultResetRequested = output<LaneTableRow>();
  protected readonly detailRowId = signal<string | null>(null);
  protected readonly infoOpen = signal<{
    readonly rowId: string;
    readonly kind: CliProviderInfoKind | 'credentials';
  } | null>(null);
  closeGuide(rowId: string): void {
    if (
      this.infoOpen()?.rowId === rowId &&
      this.infoOpen()?.kind === 'install'
    ) {
      this.infoOpen.set(null);
    }
  }
  protected detailExpanded(row: LaneTableRow, expanded: boolean): void {
    this.detailRowId.set(expanded ? row.id : null);
    if (!expanded) this.infoOpen.set(null);
  }
  protected showDetail(
    row: LaneTableRow,
    kind?: CliProviderInfoKind | 'credentials',
  ): void {
    this.detailRowId.set(row.id);
    this.infoOpen.set(kind ? { rowId: row.id, kind } : null);
  }
  protected infoIsOpen(
    row: LaneTableRow,
    kind: CliProviderInfoKind | 'credentials',
  ): boolean {
    return this.infoOpen()?.rowId === row.id && this.infoOpen()?.kind === kind;
  }
  protected toggleInfo(
    row: LaneTableRow,
    kind: CliProviderInfoKind | 'credentials',
  ): void {
    this.infoOpen.set(
      this.infoIsOpen(row, kind) ? null : { rowId: row.id, kind },
    );
  }
  constructor() {
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(([entry]) => {
        this.modelColumn.set(entry.contentRect.width >= 640);
      });
      observer.observe(this.element.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
    // Focus returns to the moved row's order button after a move. Suppress its focus
    // tooltip for that return, as the policy order editor does when its popover closes.
    const onOrderFocus = (event: FocusEvent): void => {
      if (
        this.orderFocusReturning() &&
        event.target instanceof Element &&
        event.target.matches('[data-order-up], [data-order-down]')
      ) {
        event.stopImmediatePropagation();
      }
    };
    this.element.nativeElement.addEventListener('focus', onOrderFocus, true);
    this.destroyRef.onDestroy(() =>
      this.element.nativeElement.removeEventListener(
        'focus',
        onOrderFocus,
        true,
      ),
    );
    effect(() => {
      const announcement = this.testAnnouncement();
      if (announcement) this.table()?.announce(announcement);
    });
    effect(() => {
      const open = this.openCell();
      if (!open) return;
      const currentRow = this.rows().find((r) => r.id === open.row.id);
      if (
        !currentRow ||
        !open.row.interactive ||
        (open.place === 'detail' && this.detailRowId() !== open.row.id)
      ) {
        this.openCell.set(null);
      } else if (currentRow !== open.row) {
        this.openCell.set({ ...open, row: currentRow });
      }
    });
    effect(() => this.deleteFocus.onRowsChanged(this.rows()));
    // The Delete confirmation lives in the detail footer: closing that detail drops the pending confirmation.
    effect(() => {
      const pending = this.pendingDelete();
      if (pending && this.detailRowId() !== pending.id)
        untracked(() => {
          this.pendingDelete.set(null);
          this.deleteOrigin = null;
          this.deleteFocus.dismiss();
        });
    });
    // Decision 26: Reorder mode shows one flat list; an expanded detail and its popovers close.
    effect(() => {
      if (!this.orderMode()) return;
      untracked(() => {
        this.detailRowId.set(null);
        this.infoOpen.set(null);
        this.openCell.set(null);
        this.pendingDelete.set(null);
        this.drag.endDrag();
      });
    });
  }
  /** Drag and up / down of Reorder mode (decisions 14, 18). */
  protected readonly drag = new LaneOrderDrag({
    ids: () => this.orderIds(),
    name: (id) => this.rows().find((row) => row.id === id)?.name ?? id,
    canReorder: () =>
      this.orderMode() && !this.busy() && this.canWrite() && this.canReorder(),
    move: (move) => this.reordered.emit(move),
  });
  protected orderUp(row: LaneTableRow, index: number): void {
    if (this.rowBusy(row)) return;
    this.drag.moveUp(index);
  }
  protected orderDown(row: LaneTableRow, index: number): void {
    if (this.rowBusy(row)) return;
    this.drag.moveDown(index);
  }
  protected orderDragStart(row: LaneTableRow, event: DragEvent, index: number): void {
    if (this.rowBusy(row)) {
      event.preventDefault();
      return;
    }
    this.drag.startDrag(event, index);
  }
  /**
   * Called by the host once the save of a move ends, with its outcome and the confirmed numbered order. A saved
   * move announces its new position from that order. Focus returns after the rows render, to the same button of
   * the moved row (or its other one at an end); a failed save restores it with no announcement.
   */
  orderSettled(result: LaneOrderSettlement): void {
    const { id, direction } = result;
    this.drag.settled(result, () =>
      afterNextRender(
        () => {
          const host = this.element.nativeElement;
          const other = direction === 'up' ? 'down' : 'up';
          this.orderFocusReturning.set(true);
          [direction, other]
            .map((which) =>
              host.querySelector<HTMLButtonElement>(
                `[data-testid="policy-order-${which}-${id}"]`,
              ),
            )
            .find((button) => button && button.getAttribute('aria-disabled') !== 'true')
            ?.focus();
          setTimeout(() => this.orderFocusReturning.set(false));
        },
        { injector: this.injector },
      ),
    );
  }
  protected rowBusy(row: LaneTableRow): boolean {
    return this.busy() || !!this.busyRows()[row.id];
  }
  protected enabledShown(row: LaneTableRow): boolean {
    return row.enabled && (row.kind === 'instance' || row.installed);
  }
  protected toggleRow(row: LaneTableRow, event: Event): void {
    const control = event.target as HTMLInputElement;
    if (
      (row.kind === 'system' && !row.installed) ||
      this.rowBusy(row) ||
      !this.canWrite()
    ) {
      control.checked = this.enabledShown(row);
      return;
    }
    this.toggled.emit({ row, event });
  }
  /** The Delete button in the detail footer that opened the inline confirm; Cancel returns focus to it. */
  private deleteOrigin: HTMLElement | null = null;
  protected requestDelete(row: LaneTableRow, event: Event): void {
    // `currentTarget` is the bound footer button; `target` is its SVG icon when the click lands on the icon.
    const origin =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.deleteOrigin = origin;
    // After a confirmed delete, focus goes to the next row's actions trigger: capture from this row's trigger.
    const trigger = this.element.nativeElement.querySelector<HTMLElement>(
      `tr[data-testid="${row.kind === 'system' ? 'cli-provider-card-' : 'cli-matrix-row-'}${row.id}"] ptah-table-row-actions button[aria-haspopup="menu"]`,
    );
    this.deleteFocus.capture(row, { target: trigger ?? origin } as Pick<Event, 'target'> as Event);
    this.pendingDelete.set(row);
  }
  protected confirmDelete(row: LaneTableRow): void {
    if (this.rowBusy(row) || !this.canWrite()) return;
    this.deleteFocus.confirm(row, this.rows());
    this.delete.emit(row);
    // Confirm: focus waits on this row's actions trigger, then moves on when the row is removed.
    this.pendingDelete.set(null);
    this.deleteOrigin = null;
    this.deleteFocus.cancel();
  }
  protected cancelDelete(): void {
    this.pendingDelete.set(null);
    const origin = this.deleteOrigin;
    this.deleteOrigin = null;
    if (origin?.isConnected) queueMicrotask(() => origin.focus());
    else this.deleteFocus.cancel();
  }
  protected isOpen(
    row: LaneTableRow,
    field: CliMatrixCellField,
    place: 'cell' | 'detail',
  ): boolean {
    const open = this.openCell();
    return (
      open?.row === row &&
      open.field === field &&
      open.place === place &&
      (place === 'cell' || this.detailRowId() === row.id)
    );
  }
  /** The open field of a row at one place, for `ptah-lane-model-effort-cell`. */
  protected openFieldOf(
    row: LaneTableRow,
    place: 'cell' | 'detail',
  ): CliMatrixCellField | null {
    const field = this.openCell()?.field;
    return field && this.isOpen(row, field, place) ? field : null;
  }
  protected togglePopover(
    row: LaneTableRow,
    field: CliMatrixCellField,
    place: 'cell' | 'detail',
  ): void {
    if (!row.interactive || this.rowBusy(row) || !this.canWrite()) return;
    this.openCell.update((open) =>
      open?.row === row && open.field === field && open.place === place
        ? null
        : { row, field, place },
    );
  }
  protected closePopover(): void {
    const open = this.openCell();
    this.openCell.set(null);
    if (open) {
      afterNextRender(
        () => {
          const scope =
            open.place === 'detail'
              ? this.element.nativeElement.querySelector<HTMLElement>(
                  `#lane-detail-${open.row.id}`,
                )
              : this.element.nativeElement.querySelector<HTMLElement>(
                  `[data-testid="cli-matrix-row-${open.row.id}"]`,
                );
          scope
            ?.querySelector<HTMLElement>(`[data-popover-kind="${open.field}"]`)
            ?.focus();
        },
        { injector: this.injector },
      );
    }
  }
  /** Title of the Model cell; the cell component renders the same text. */
  protected modelOf(row: LaneTableRow): { label: string; title: string } {
    return laneModelDisplay(row);
  }
}
