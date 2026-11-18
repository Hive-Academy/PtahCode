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
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  resolveCliLaneDefaultPair,
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
  PtahTableOrderButtonsComponent,
  PtahTableRowActionsComponent,
  PtahTableControlCellDirective,
  PtahTableMessageCellDirective,
  PtahToggleDirective,
  PtahButtonDirective,
  NativePopoverComponent,
  PtahInlineConfirmComponent,
} from '@ptah-extension/ui';
import { LaneRowIdentityComponent } from './lane-row-identity.component';
import {
  cliModelDisplay,
  type CliMatrixCellField,
  type CliMatrixRow,
} from './cli-matrix-rows';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';
import { CliModelEffortPopoverComponent } from './cli-model-effort-popover.component';
import { LanesTableStatusComponent } from './lanes-table-status.component';
import { LanesTableDeleteFocus } from './lanes-table-delete-focus';
import type { CliProviderInfoKind } from './cli-provider-card-popovers.component';
import { LanesTableDetailComponent } from './lanes-table-detail.component';
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
    PtahTableOrderButtonsComponent,
    PtahTableRowActionsComponent,
    PtahTableControlCellDirective,
    PtahTableMessageCellDirective,
    PtahToggleDirective,
    PtahButtonDirective,
    NativePopoverComponent,
    CliLaneDefaultCellComponent,
    CliModelEffortPopoverComponent,
    LaneRowIdentityComponent,
    LanesTableStatusComponent,
    PtahInlineConfirmComponent,
    LanesTableDetailComponent,
    NgTemplateOutlet,
  ],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './lanes-table.component.css',
  templateUrl: './lanes-table.component.html',
})
export class LanesTableComponent {
  protected recover(row: LaneTableRow): void {
    if (row.status.kind === 'not-installed') {
      this.showDetail(row, 'install');
      this.installGuide.emit(row);
    } else {
      this.showDetail(row, 'credentials');
      this.signIn.emit(row);
    }
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
  readonly defaults = input<CliLaneDefaults>();
  readonly orderMode = input(false);
  readonly busy = input(false);
  readonly canWrite = input(true);
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
  readonly moved = output<{ row: LaneTableRow; direction: -1 | 1 }>();
  readonly test = output<LaneTableRow>();
  readonly edit = output<LaneTableRow>();
  readonly delete = output<LaneTableRow>();
  readonly capabilities = output<LaneTableRow>();
  readonly installGuide = output<LaneTableRow>();
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
    // The UI order component restores focus after a move. Suppress its focus tooltip
    // for that return, as the policy order editor does when its popover closes.
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
        (open.place === 'detail' && !this.table()?.collapsed())
      ) {
        this.openCell.set(null);
      } else if (currentRow !== open.row) {
        this.openCell.set({ ...open, row: currentRow });
      }
    });
    effect(() => this.deleteFocus.onRowsChanged(this.rows()));
  }
  protected rowBusy(row: LaneTableRow): boolean {
    return this.busy() || !!this.busyRows()[row.id];
  }
  protected enabledShown(row: LaneTableRow): boolean {
    return row.enabled && (row.kind === 'instance' || row.installed);
  }
  protected moveRow(row: LaneTableRow, direction: -1 | 1): void {
    if (this.rowBusy(row) || !this.canWrite()) return;
    this.orderFocusReturning.set(true);
    setTimeout(() => this.orderFocusReturning.set(false));
    this.moved.emit({ row, direction });
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
  protected requestDelete(row: LaneTableRow, event: Event): void {
    this.deleteFocus.capture(row, event);
    this.pendingDelete.set(row);
  }
  protected confirmDelete(row: LaneTableRow): void {
    if (this.rowBusy(row) || !this.canWrite()) return;
    this.deleteFocus.confirm(row, this.rows());
    this.delete.emit(row);
    this.cancelDelete();
  }
  protected cancelDelete(): void {
    this.pendingDelete.set(null);
    this.deleteFocus.cancel();
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
      (place === 'cell' || !!this.table()?.collapsed())
    );
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
  protected effortOf(row: LaneTableRow): string {
    return (
      (row.kind === 'system' ? row.effort?.value : row.effort) || 'default'
    );
  }
  /**
   * The lane has an effort setting: instances always, a system lane when its CLI has one
   * (`effort` is null otherwise). An unset effort keeps the trigger ("default"), because
   * the trigger is the only way to choose an effort. An instance whose model is not
   * loaded yet (`selectedModel` null) shows no trigger.
   */
  protected hasEffort(row: LaneTableRow): boolean {
    if (row.kind === 'instance') return row.selectedModel !== null;
    return row.effort != null;
  }
  protected hasModelId(row: LaneTableRow): boolean {
    return !!(row.kind === 'system' ? row.model.value : row.selectedModel);
  }
  /** Model text. Instance: null = not loaded, '' = the tier mappings decide. */
  protected modelOf(row: LaneTableRow): { label: string; title: string } {
    if (row.kind === 'system') {
      if (!row.model.value) {
        return { label: 'CLI default', title: 'CLI default' };
      }
      return cliModelDisplay(row.model.value);
    }
    if (row.selectedModel === null) return { label: '—', title: 'Not loaded' };
    const label = row.selectedModel || 'Provider default';
    return { label, title: label };
  }
}
