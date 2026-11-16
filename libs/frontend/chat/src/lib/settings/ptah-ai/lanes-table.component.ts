import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { CliLaneDefaults, CliType } from '@ptah-extension/shared';
import {
  PtahTableComponent,
  PtahTableRowTitleComponent,
  PtahTableRowDirective,
  PtahCollapsibleCellDirective,
  PtahDetailRowDirective,
  PtahDetailCellDirective,
  PtahRowExpanderComponent,
  PtahTableOrderButtonsComponent,
  PtahTableRowActionsComponent,
  PtahTableControlCellDirective,
  PtahTableMessageCellDirective,
  PtahToggleDirective,
  PtahButtonDirective,
  NativePopoverComponent,
  ProviderMarkComponent,
  PtahInlineConfirmComponent,
} from '@ptah-extension/ui';
import { cliMarkFor } from '@ptah-extension/chat-ui';
import {
  cliModelDisplay,
  type CliMatrixCellField,
  type CliMatrixRow,
} from './cli-matrix-rows';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';
import { CliCapabilityCellsComponent } from './cli-capability-cells.component';
import { CliModelEffortPopoverComponent } from './cli-model-effort-popover.component';
import { LanesTableStatusComponent } from './lanes-table-status.component';
import { LanesTableDeleteFocus } from './lanes-table-delete-focus';

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
    PtahTableRowTitleComponent,
    PtahTableRowDirective,
    PtahCollapsibleCellDirective,
    PtahDetailRowDirective,
    PtahDetailCellDirective,
    PtahRowExpanderComponent,
    PtahTableOrderButtonsComponent,
    PtahTableRowActionsComponent,
    PtahTableControlCellDirective,
    PtahTableMessageCellDirective,
    PtahToggleDirective,
    PtahButtonDirective,
    NativePopoverComponent,
    ProviderMarkComponent,
    CliLaneDefaultCellComponent,
    CliCapabilityCellsComponent,
    CliModelEffortPopoverComponent,
    LanesTableStatusComponent,
    PtahInlineConfirmComponent,
    NgTemplateOutlet,
  ],
  template: `
    <ptah-table
      #table
      label="Lanes"
      density="compact"
      [collapseBelow]="900"
      data-testid="cli-provider-grid"
    >
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Lane</th>
          <th scope="col">Status</th>
          <th scope="col" ptahCollapsible>Permission</th>
          <th scope="col" ptahCollapsible>Network</th>
          <th scope="col" ptahCollapsible>Model</th>
          <th scope="col" ptahCollapsible>Actions</th>
          <th scope="col">Enabled</th>
          <th scope="col" class="sr-only">Details</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.id) {
          @let position = positions().get(row.id);
          <tr
            [ptahRowState]="
              row.kind === 'system' && !row.installed ? 'muted' : 'default'
            "
            [attr.data-testid]="
              row.kind === 'system'
                ? 'cli-provider-card-' + row.id
                : 'cli-matrix-row-' + row.id
            "
          >
            <td>
              @if (row.kind === 'system' && !row.installed) {
                <span>—</span>
              } @else if (orderMode()) {
                <fieldset class="contents" [disabled]="rowBusy(row) || !canWrite()">
                  <ptah-table-order-buttons
                    [rowLabel]="row.name"
                    [index]="position ?? 0"
                    [count]="positions().size"
                    (moveUp)="moveRow(row, -1)"
                    (moveDown)="moveRow(row, 1)"
                  />
                </fieldset>
              } @else {
                {{ row.order ?? (position ?? 0) + 1 }}
              }
            </td>
            <th scope="row">
              <ptah-table-row-title
                [attr.data-testid]="
                  row.kind === 'system' && row.versionLabel
                    ? 'cli-matrix-version'
                    : null
                "
                [attr.title]="row.kind === 'system' ? row.versionLabel : null"
                [name]="row.name"
                [kind]="row.kind === 'system' ? 'CLI agent' : 'Ptah CLI'"
                [secondary]="
                  row.kind === 'system'
                    ? (row.versionLabel ?? '')
                    : row.provider
                "
                [mono]="row.kind === 'system'"
              >
                <ptah-provider-mark
                  ptahRowMark
                  [providerId]="
                    row.kind === 'system' ? row.cli : markId(row.providerId)
                  "
                  fallback="Terminal"
                  size="sm"
                />
              </ptah-table-row-title>
            </th>
            <td>
              <ptah-lanes-table-status
                [row]="row"
                [testing]="!!testingRows()[row.id]"
                [testResult]="testResults()[row.id] ?? ''"
                (installGuide)="installGuide.emit($event)"
                (signIn)="signIn.emit($event)"
              />
            </td>
            <td ptahCollapsible ptahControlCell>
              @if (row.kind === 'system') {
                <ptah-cli-lane-default-cell
                  [cli]="row.cli"
                  [name]="row.name"
                  [manifest]="row.manifest"
                  [saved]="defaults()?.[row.cli]"
                  [disabled]="!row.installed || rowBusy(row) || !canWrite()"
                  field="permission"
                  [showCaption]="false"
                  (selected)="defaultSelected.emit({ row, choice: $event })"
                  (resetRequested)="defaultResetRequested.emit(row)"
                />
              } @else {
                <span title="Managed by connection">Unavailable</span>
              }
            </td>
            <td ptahCollapsible ptahControlCell>
              @if (row.kind === 'system') {
                <ptah-cli-lane-default-cell
                  [cli]="row.cli"
                  [name]="row.name"
                  [manifest]="row.manifest"
                  [saved]="defaults()?.[row.cli]"
                  [disabled]="!row.installed || rowBusy(row) || !canWrite()"
                  field="network"
                  [showCaption]="false"
                  (selected)="defaultSelected.emit({ row, choice: $event })"
                  (resetRequested)="defaultResetRequested.emit(row)"
                />
              } @else {
                <span title="Managed by connection">Unavailable</span>
              }
            </td>
            <td
              ptahCollapsible
              [attr.title]="modelOf(row).title"
              data-testid="cli-matrix-model"
            >
              <ng-template #modelEffort let-row let-place="place">
                <span
                  class="inline-flex min-w-0 items-center gap-ptah-inline text-xs"
                >
                  @if (row.kind === 'instance' && row.selectedModel === null) {
                    <span class="font-mono" [title]="modelOf(row).title">{{
                      modelOf(row).label
                    }}</span>
                  } @else {
                    <ptah-native-popover
                      [isOpen]="isOpen(row, 'model', place)"
                      [keepInViewport]="true"
                      placement="bottom-start"
                      [hasBackdrop]="true"
                      backdropClass="transparent"
                      (closed)="closePopover()"
                    >
                      <button
                        trigger
                        type="button"
                        ptahButton
                        variant="ghost"
                        size="xs"
                        density="compact"
                        class="min-w-0 font-mono"
                        data-popover-kind="model"
                        [disabled]="
                          !row.interactive || rowBusy(row) || !canWrite()
                        "
                        [attr.data-busy]="busy() ? '' : null"
                        [attr.aria-disabled]="busy() ? 'true' : null"
                        [attr.aria-busy]="busy() ? 'true' : null"
                        [attr.aria-label]="'Model default for ' + row.name"
                        [attr.aria-expanded]="isOpen(row, 'model', place)"
                        [title]="modelOf(row).title"
                        (click)="togglePopover(row, 'model', place)"
                      >
                        {{ modelOf(row).label }}
                      </button>
                      @if (isOpen(row, 'model', place)) {
                        <ptah-cli-model-effort-popover
                          content
                          [row]="row"
                          field="model"
                          (closed)="closePopover()"
                        />
                      }
                    </ptah-native-popover>
                  }
                  @if (row.kind === 'instance' || row.effort) {
                    <span aria-hidden="true">·</span>
                    <ptah-native-popover
                      [isOpen]="isOpen(row, 'effort', place)"
                      [keepInViewport]="true"
                      placement="bottom-start"
                      [hasBackdrop]="true"
                      backdropClass="transparent"
                      (closed)="closePopover()"
                    >
                      <button
                        trigger
                        type="button"
                        ptahButton
                        variant="ghost"
                        size="xs"
                        density="compact"
                        data-popover-kind="effort"
                        [disabled]="
                          !row.interactive || rowBusy(row) || !canWrite()
                        "
                        [attr.data-busy]="busy() ? '' : null"
                        [attr.aria-disabled]="busy() ? 'true' : null"
                        [attr.aria-busy]="busy() ? 'true' : null"
                        [attr.aria-label]="'Effort default for ' + row.name"
                        [attr.aria-expanded]="isOpen(row, 'effort', place)"
                        [title]="effortOf(row)"
                        (click)="togglePopover(row, 'effort', place)"
                      >
                        {{ effortOf(row) }}
                      </button>
                      @if (isOpen(row, 'effort', place)) {
                        <ptah-cli-model-effort-popover
                          content
                          [row]="row"
                          field="effort"
                          (closed)="closePopover()"
                        />
                      }
                    </ptah-native-popover>
                  }
                </span>
              </ng-template>
              <ng-container
                [ngTemplateOutlet]="modelEffort"
                [ngTemplateOutletContext]="{ $implicit: row, place: 'cell' }"
              />
            </td>
            <td ptahCollapsible>
              <ptah-table-row-actions [rowLabel]="row.name">
                <button
                  role="menuitem"
                  type="button"
                  [disabled]="
                    rowBusy(row) ||
                    testingRows()[row.id] ||
                    (row.kind === 'system' && !row.installed)
                  "
                  (click)="test.emit(row)"
                  [attr.data-testid]="
                    row.kind === 'instance' ? 'cli-matrix-test-' + row.id : null
                  "
                >
                  Test
                </button>
                <button
                  role="menuitem"
                  type="button"
                  (click)="capabilities.emit(row)"
                >
                  All capabilities
                </button>
                @if (row.kind === 'instance') {
                  <button
                    role="menuitem"
                    type="button"
                    [disabled]="rowBusy(row) || !canWrite()"
                    (click)="edit.emit(row)"
                    [attr.data-testid]="'cli-matrix-edit-' + row.id"
                  >
                    Edit
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    [disabled]="rowBusy(row) || !canWrite()"
                    (click)="requestDelete(row, $event)"
                    [attr.data-testid]="'cli-matrix-delete-' + row.id"
                  >
                    Delete
                  </button>
                }
              </ptah-table-row-actions>
              @if (pendingDelete()?.id === row.id) {
                <ptah-inline-confirm
                  [message]="'Delete ' + row.name + '?'"
                  tone="danger"
                  (confirm)="confirmDelete(row)"
                  (cancelled)="cancelDelete()"
                />
              }
            </td>
            <td ptahControlCell>
              <input
                ptahToggle
                type="checkbox"
                [checked]="
                  row.enabled && (row.kind === 'instance' || row.installed)
                "
                [disabled]="
                  (row.kind === 'system' && !row.installed) ||
                  rowBusy(row) ||
                  !canWrite()
                "
                [attr.aria-label]="row.name + ' enabled'"
                [attr.data-testid]="
                  row.kind === 'instance' ? 'cli-matrix-toggle-' + row.id : null
                "
                (change)="toggleRow(row, $event)"
              />
            </td>
            <td>
              <ptah-table-row-expander
                [label]="'Details for ' + row.name"
                [controls]="'lane-detail-' + row.id"
                #expander
                (expandedChange)="closePopover()"
              />
            </td>
          </tr>
          <tr
            [ptahDetailRow]="expander.expanded()"
            [id]="'lane-detail-' + row.id"
          >
            <td ptahDetailCell [colspan]="5">
              @if (table.collapsed() && expander.expanded()) {
                <dl>
                  <dt>Permission</dt>
                  <dd>
                    @if (row.kind === 'system') {
                      <ptah-cli-lane-default-cell
                        [cli]="row.cli"
                        [name]="row.name"
                        [manifest]="row.manifest"
                        [saved]="defaults()?.[row.cli]"
                        [disabled]="
                          !row.installed || rowBusy(row) || !canWrite()
                        "
                        field="permission"
                        [showCaption]="false"
                        (selected)="
                          defaultSelected.emit({ row, choice: $event })
                        "
                        (resetRequested)="defaultResetRequested.emit(row)"
                      />
                    } @else {
                      Unavailable
                    }
                  </dd>
                  <dt>Network</dt>
                  <dd>
                    @if (row.kind === 'system') {
                      <ptah-cli-lane-default-cell
                        [cli]="row.cli"
                        [name]="row.name"
                        [manifest]="row.manifest"
                        [saved]="defaults()?.[row.cli]"
                        [disabled]="
                          !row.installed || rowBusy(row) || !canWrite()
                        "
                        field="network"
                        [showCaption]="false"
                        (selected)="
                          defaultSelected.emit({ row, choice: $event })
                        "
                        (resetRequested)="defaultResetRequested.emit(row)"
                      />
                    } @else {
                      Unavailable
                    }
                  </dd>
                  <dt>Model</dt>
                  <dd>
                    <ng-container
                      [ngTemplateOutlet]="modelEffort"
                      [ngTemplateOutletContext]="{
                        $implicit: row,
                        place: 'detail',
                      }"
                    />
                  </dd>
                  <dt>Actions</dt>
                  <dd>
                    <ptah-table-row-actions [rowLabel]="row.name">
                      <button
                        role="menuitem"
                        type="button"
                        [disabled]="
                          rowBusy(row) ||
                          testingRows()[row.id] ||
                          (row.kind === 'system' && !row.installed)
                        "
                        (click)="test.emit(row)"
                      >
                        Test
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        (click)="capabilities.emit(row)"
                      >
                        All capabilities
                      </button>
                      @if (row.kind === 'instance') {
                        <button
                          role="menuitem"
                          type="button"
                          [disabled]="rowBusy(row) || !canWrite()"
                          (click)="edit.emit(row)"
                        >
                          Edit
                        </button>
                        <button
                          role="menuitem"
                          type="button"
                          [disabled]="rowBusy(row) || !canWrite()"
                          (click)="requestDelete(row, $event)"
                        >
                          Delete
                        </button>
                      }
                    </ptah-table-row-actions>
                    @if (pendingDelete()?.id === row.id) {
                      <ptah-inline-confirm
                        [message]="'Delete ' + row.name + '?'"
                        tone="danger"
                        (confirm)="confirmDelete(row)"
                        (cancelled)="cancelDelete()"
                      />
                    }
                  </dd>
                  <dt>Capabilities</dt>
                  <dd>
                    <ptah-cli-capability-cells
                      [manifest]="row.manifest"
                      [compact]="true"
                    />
                  </dd>
                </dl>
              }
            </td>
          </tr>
        } @empty {
          <tr>
            <td [ptahMessageCell]="9">
              @if (loading()) {
                Loading lanes…
              } @else if (error()) {
                {{ error() }}
                <button
                  ptahButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  (click)="retry.emit()"
                >
                  Retry
                </button>
              } @else {
                No lanes available.
              }
            </td>
          </tr>
        }
      </tbody>
    </ptah-table>
  `,
})
export class LanesTableComponent {
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
  readonly defaultSelected = output<{
    row: LaneTableRow;
    choice: NonNullable<CliLaneDefaults[CliType]>;
  }>();
  readonly defaultResetRequested = output<LaneTableRow>();

  constructor() {
    effect(() => {
      const announcement = this.testAnnouncement();
      if (announcement) this.table()?.announce(announcement);
    });
    effect(() => {
      const open = this.openCell();
      if (!open) return;
      if (
        !this.rows().includes(open.row) ||
        !open.row.interactive ||
        (open.place === 'detail' && !this.table()?.collapsed())
      ) {
        this.openCell.set(null);
      }
    });
    effect(() => this.deleteFocus.onRowsChanged(this.rows()));
  }

  protected rowBusy(row: LaneTableRow): boolean {
    return this.busy() || !!this.busyRows()[row.id];
  }

  protected moveRow(row: LaneTableRow, direction: -1 | 1): void {
    if (this.rowBusy(row) || !this.canWrite()) return;
    this.moved.emit({ row, direction });
  }

  protected toggleRow(row: LaneTableRow, event: Event): void {
    const control = event.target as HTMLInputElement;
    if (this.rowBusy(row) || !this.canWrite()) {
      control.checked = row.enabled;
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
    this.openCell.set(null);
  }

  protected effortOf(row: LaneTableRow): string {
    return (
      (row.kind === 'system' ? row.effort?.value : row.effort) || 'default'
    );
  }

  /** Provider mark of a Ptah CLI instance; the Ptah `P` when it has none. */
  protected markId(providerId: string): string {
    const mark = cliMarkFor('ptah-cli', providerId);
    return mark.kind === 'provider' ? mark.providerId : 'ptah-cli';
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
    const label = row.selectedModel || 'provider default';
    return { label, title: label };
  }
}
