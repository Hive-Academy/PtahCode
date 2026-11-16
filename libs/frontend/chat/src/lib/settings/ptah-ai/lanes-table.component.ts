import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
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
  PtahBadgeDirective,
  ProviderMarkComponent,
} from '@ptah-extension/ui';
import { cliMarkFor } from '@ptah-extension/chat-ui';
import { cliModelDisplay, type CliMatrixRow } from './cli-matrix-rows';
import { CliLaneDefaultCellComponent } from './cli-lane-default-cell.component';
import { CliCapabilityCellsComponent } from './cli-capability-cells.component';

export type LaneTableRow = CliMatrixRow & {
  /**
   * Position in the try order; uninstalled agents have no position.
   * Stored values are 1-based (shown as rank). The order buttons use the
   * 0-based index among positioned rows only.
   */
  readonly order?: number;
  /** Name of the connection used by a Ptah CLI instance. */
  readonly connectionName?: string;
  /** Path hint shown as an info glyph next to the lane name. */
  readonly configFileHint?: string;
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
    PtahBadgeDirective,
    ProviderMarkComponent,
    CliLaneDefaultCellComponent,
    CliCapabilityCellsComponent,
  ],
  template: `
    <ptah-table
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
                <ptah-table-order-buttons
                  [rowLabel]="row.name"
                  [index]="position ?? 0"
                  [count]="positions().size"
                  (moveUp)="moved.emit({ row, direction: -1 })"
                  (moveDown)="moved.emit({ row, direction: 1 })"
                />
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
                    : (row.connectionName ?? row.provider)
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
                @if (row.configFileHint) {
                  <span
                    ptahRowInfo
                    [title]="row.configFileHint"
                    role="img"
                    [attr.aria-label]="row.configFileHint"
                    >ⓘ</span
                  >
                }
              </ptah-table-row-title>
            </th>
            <td>
              <span
                ptahBadge
                appearance="outline"
                [tone]="badgeTone(row.status.tone)"
                [attr.data-testid]="
                  row.kind === 'instance' ? 'cli-matrix-status' : null
                "
                >{{ row.status.label }}</span
              >
              @if (row.kind === 'instance') {
                @if (row.runtimeStatus) {
                  <span
                    ptahBadge
                    appearance="outline"
                    [tone]="row.runtimeStatus === 'Error' ? 'err' : 'info'"
                    data-testid="cli-matrix-runtime-status"
                    >{{ row.runtimeStatus }}</span
                  >
                }
                @if (row.keyStatus.kind === 'missing') {
                  <span
                    ptahBadge
                    appearance="outline"
                    tone="warn"
                    data-testid="cli-matrix-key-status"
                    >{{ row.keyStatus.label }}</span
                  >
                }
              }
              @if (
                row.status.kind === 'needs-key' ||
                row.status.kind === 'not-installed'
              ) {
                <button
                  type="button"
                  class="ms-ptah-inline underline"
                  (click)="attention.emit(row)"
                >
                  {{
                    row.status.kind === 'not-installed'
                      ? 'Install guide'
                      : 'Sign in'
                  }}
                </button>
              }
            </td>
            <td ptahCollapsible ptahControlCell>
              @if (row.kind === 'system') {
                <ptah-cli-lane-default-cell
                  [cli]="row.cli"
                  [name]="row.name"
                  [manifest]="row.manifest"
                  [saved]="defaults()?.[row.cli]"
                  [disabled]="!row.installed"
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
                  [disabled]="!row.installed"
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
              class="font-mono text-xs"
              [attr.title]="modelOf(row).title"
              data-testid="cli-matrix-model"
            >
              {{ modelOf(row).label }}
            </td>
            <td ptahCollapsible>
              <ptah-table-row-actions [rowLabel]="row.name">
                <button
                  role="menuitem"
                  type="button"
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
                    (click)="edit.emit(row)"
                    [attr.data-testid]="'cli-matrix-edit-' + row.id"
                  >
                    Edit
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    (click)="delete.emit(row)"
                    [attr.data-testid]="'cli-matrix-delete-' + row.id"
                  >
                    Delete
                  </button>
                }
              </ptah-table-row-actions>
            </td>
            <td ptahControlCell>
              <input
                ptahToggle
                type="checkbox"
                [checked]="
                  row.enabled && (row.kind === 'instance' || row.installed)
                "
                [disabled]="row.kind === 'system' && !row.installed"
                [attr.aria-label]="row.name + ' enabled'"
                [attr.data-testid]="
                  row.kind === 'instance' ? 'cli-matrix-toggle-' + row.id : null
                "
                (change)="toggled.emit({ row, event: $event })"
              />
            </td>
            <td>
              <ptah-table-row-expander
                [label]="'Details for ' + row.name"
                [controls]="'lane-detail-' + row.id"
                #expander
              />
            </td>
          </tr>
          <tr
            [ptahDetailRow]="expander.expanded()"
            [id]="'lane-detail-' + row.id"
          >
            <td ptahDetailCell [colspan]="5">
              <dl>
                <dt>Permission</dt>
                <dd>
                  @if (row.kind === 'system') {
                    <ptah-cli-lane-default-cell
                      [cli]="row.cli"
                      [name]="row.name"
                      [manifest]="row.manifest"
                      [saved]="defaults()?.[row.cli]"
                      [disabled]="!row.installed"
                      field="permission"
                      [showCaption]="false"
                      (selected)="defaultSelected.emit({ row, choice: $event })"
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
                      [disabled]="!row.installed"
                      field="network"
                      [showCaption]="false"
                      (selected)="defaultSelected.emit({ row, choice: $event })"
                      (resetRequested)="defaultResetRequested.emit(row)"
                    />
                  } @else {
                    Unavailable
                  }
                </dd>
                <dt>Model</dt>
                <dd>
                  <span [attr.title]="modelOf(row).title">{{
                    modelOf(row).label
                  }}</span>
                </dd>
                <dt>Actions</dt>
                <dd>
                  <ptah-table-row-actions [rowLabel]="row.name">
                    <button
                      role="menuitem"
                      type="button"
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
                        (click)="edit.emit(row)"
                      >
                        Edit
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        (click)="delete.emit(row)"
                      >
                        Delete
                      </button>
                    }
                  </ptah-table-row-actions>
                </dd>
                <dt>Capabilities</dt>
                <dd>
                  <ptah-cli-capability-cells
                    [manifest]="row.manifest"
                    [compact]="true"
                  />
                </dd>
              </dl>
            </td>
          </tr>
        } @empty {
          <tr>
            <td [ptahMessageCell]="9">No lanes available.</td>
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
  readonly toggled = output<{ row: LaneTableRow; event: Event }>();
  readonly moved = output<{ row: LaneTableRow; direction: -1 | 1 }>();
  readonly test = output<LaneTableRow>();
  readonly edit = output<LaneTableRow>();
  readonly delete = output<LaneTableRow>();
  readonly capabilities = output<LaneTableRow>();
  readonly attention = output<LaneTableRow>();
  readonly defaultSelected = output<{
    row: LaneTableRow;
    choice: NonNullable<CliLaneDefaults[CliType]>;
  }>();
  readonly defaultResetRequested = output<LaneTableRow>();

  protected badgeTone(
    tone: LaneTableRow['status']['tone'],
  ): 'ok' | 'warn' | 'err' | 'info' | 'neutral' {
    switch (tone) {
      case 'success':
        return 'ok';
      case 'warning':
        return 'warn';
      case 'error':
        return 'err';
      case 'info':
        return 'info';
      default:
        return 'neutral';
    }
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
