import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, viewChild, type InputSignal } from '@angular/core';
import type { DashboardTableCell } from '@ptah-extension/shared';
import type { SurfaceSelection } from '@ptah-extension/shared/mcp-apps-contracts/surface';
import { PtahButtonDirective, PtahSectionHeaderComponent, PtahSurfaceDirective, PtahTableComponent } from '@ptah-extension/ui';
import type { SurfaceComponentViewState } from '../surface-view-state';
import { cellText, nextTableSort, tableRows, type TableNode } from '../table/table-rows';
import { DashboardCollectionFilterComponent } from './dashboard-collection-filter.component';
import { DashboardPagerComponent } from './dashboard-pager.component';

interface TableColumn {
  readonly key: string;
  readonly label: string;
  readonly align: 'left' | 'center' | 'right';
  /** Every non-empty cell reads as a number: right-aligned, tabular, bold. */
  readonly numeric: boolean;
}
type AriaSort = 'ascending' | 'descending' | 'none';

let nextTableInstance = 0;
/** Above this many rows the table shows its filter and expand controls. */
const COLLAPSIBLE_ROWS = 10;
/** A number with an optional sign, currency, thousands separators and unit: `5.2k`, `45%`, `$1.20`, `-3 ms`. */
const NUMERIC_TEXT = /^(?:[-+]?\s?[$€£¥]|[$€£¥]\s?[-+]?|[-+])?\s?(?:[1-9]\d{0,2}(?:,\d{3})+|0|[1-9]\d*)(?:\.\d+)?\s?(?:%|[kKmMbBtT]|ms|s|x)?$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function plainText(value: unknown): string | undefined {
  return record(value) && typeof value['text'] === 'string' ? value['text'] : undefined;
}
function scalarCell(value: unknown): DashboardTableCell {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
}
/** True when the column has at least one non-empty cell and every non-empty cell looks like a number. */
function isNumericColumn(rows: readonly (readonly DashboardTableCell[])[], index: number): boolean {
  let seen = false;
  for (const row of rows) {
    const cell = row[index] ?? null;
    if (cell === null || (typeof cell === 'string' && cell.trim() === '')) continue;
    if (typeof cell === 'boolean') return false;
    if (typeof cell === 'string' && !NUMERIC_TEXT.test(cell.trim())) return false;
    if (typeof cell === 'number' && !Number.isFinite(cell)) return false;
    seen = true;
  }
  return seen;
}

@Component({
  selector: 'ptah-dashboard-table',
  standalone: true,
  imports: [DashboardCollectionFilterComponent, DashboardPagerComponent, PtahButtonDirective, PtahSectionHeaderComponent,
    PtahSurfaceDirective, PtahTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section ptahSurface variant="inset" padding="sm" class="flex flex-col gap-2 text-base-content"
      [attr.aria-label]="accessibleName()" (keydown.escape)="collapse($event)">
      @if (title(); as title) { <ptah-section-header [heading]="title" /> }
      @if (description(); as description) { <p class="text-sm text-base-content-muted">{{ description }}</p> }
      <div [id]="contentId" class="flex flex-col gap-2">
        @if (node().data; as data) {
          <p role="status">Data is not available in this view.@if (data.rowCount !== undefined) { {{ data.rowCount }} rows. }</p>
        } @else {
          @if (showFilter()) {
            <div class="flex items-center gap-2">
              <ptah-dashboard-collection-filter class="min-w-0 flex-1" [inputId]="filterId" [accessibleName]="accessibleName()"
                placeholder="Filter rows" [value]="viewState().filter ?? ''" [focusKey]="focusKey('filter')"
                (valueChange)="setFilter($event)" />
              @if (collapsible()) {
                <button #expandButton type="button" ptahButton variant="ghost" size="xs"
                  [attr.aria-label]="(viewState().expanded ? 'Collapse ' : 'Expand ') + accessibleName()"
                  [attr.aria-expanded]="!!viewState().expanded" [attr.aria-controls]="contentId"
                  [attr.data-apps-focus-key]="focusKey('expand')" (click)="toggleExpanded()">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
                    <path [attr.d]="viewState().expanded ? 'M7 14l5-5 5 5' : 'M7 10l5 5 5-5'" />
                  </svg>
                </button>
              }
            </div>
          }
          @if (showCount()) {
            <p role="status" class="text-xs text-base-content-muted">{{ page().total }} results</p>
          }
          <div data-testid="table-viewport" class="overflow-auto" [class.max-h-96]="collapsible() && !viewState().expanded">
            <ptah-table [label]="accessibleName()" size="xs" density="compact">
              <thead>
                <tr>
                  @for (column of columns(); track $index) {
                    <th scope="col" [class.text-right]="column.align === 'right'" [class.text-center]="column.align === 'center'"
                      [class.tabular-nums]="column.numeric" [attr.aria-sort]="ariaSort(column)">
                      <button type="button" ptahButton variant="ghost" size="xs"
                        [attr.data-apps-focus-key]="focusKey('sort-' + $index)" (click)="sortBy(column)">{{ column.label }}</button>
                    </th>
                  }
                  @if (node().selectable) { <th scope="col">Selection</th> }
                </tr>
              </thead>
              <tbody>
                @for (row of page().items; track row.originalIndex) {
                  <tr>
                    @for (column of columns(); track $index) {
                      <td [class.text-right]="column.align === 'right'" [class.text-center]="column.align === 'center'"
                        [class.tabular-nums]="column.numeric" [class.font-semibold]="column.numeric">{{ cell(row.cells, $index) }}</td>
                    }
                    @if (node().selectable) {
                      <td><button type="button" ptahButton variant="ghost" size="xs"
                        [attr.aria-label]="'Select row ' + (row.originalIndex + 1)"
                        [attr.aria-pressed]="isSelected(row.originalIndex)"
                        [attr.data-apps-focus-key]="focusKey('row-' + row.originalIndex)"
                        (click)="selectRow(row.originalIndex)">Select</button></td>
                    }
                  </tr>
                }
              </tbody>
            </ptah-table>
          </div>
          @if (page().pageCount > 1) {
            <ptah-dashboard-pager [pagination]="page()" [surfaceId]="surfaceId()" [componentId]="node().id"
              (pageChange)="setPage($event)" />
          }
        }
      </div>
    </section>
  `,
})
export class DashboardTableComponent {
  public readonly node: InputSignal<TableNode> = input.required<TableNode>();
  public readonly surfaceId = input('');
  public readonly viewState = input<SurfaceComponentViewState>({});
  public readonly selection = input<SurfaceSelection | null>(null);
  public readonly viewStateChange = output<SurfaceComponentViewState>();
  public readonly selectionChange = output<SurfaceSelection>();
  public readonly contentId = `ptah-table-content-${nextTableInstance++}`;
  public readonly filterId = `${this.contentId}-filter`;
  public readonly title = computed(() => plainText(this.node().title)?.trim() || undefined);
  /** Names the section, the grid and the controls; the visible heading appears only for a real title. */
  public readonly accessibleName = computed(() => this.title() ?? 'Table');
  public readonly description = computed(() => plainText(this.node().description));
  /** Malformed columns keep their position so cells stay aligned; they never render "[object Object]". */
  public readonly columns = computed((): readonly TableColumn[] => {
    const columns: unknown = this.node().columns;
    if (!Array.isArray(columns)) return [];
    return columns.map((column: unknown, index): TableColumn => {
      const key = record(column) && typeof column['key'] === 'string' ? column['key'] : `#${index}`;
      const explicit = record(column) && (column['align'] === 'left' || column['align'] === 'center' || column['align'] === 'right')
        ? column['align'] : undefined;
      const numeric = explicit === undefined && isNumericColumn(this.normalisedRows(), index);
      const label = plainText(record(column) ? column['label'] : undefined) ?? key;
      return { key, label, align: explicit ?? (numeric ? 'right' : 'left'), numeric };
    });
  });
  /** Rows normalised to scalar cells; indices stay those of the spec. */
  private readonly normalisedRows = computed((): DashboardTableCell[][] => {
    const rows: unknown = this.node().rows;
    return Array.isArray(rows) ? rows.map((row: unknown) => Array.isArray(row) ? row.map(scalarCell) : []) : [];
  });
  private readonly safeNode = computed((): TableNode => ({
    ...this.node(),
    columns: this.columns().map(column => ({ key: column.key, label: { text: column.label }, align: column.align })),
    rows: this.normalisedRows(),
  }));
  public readonly page = computed(() => tableRows(this.safeNode(), this.viewState()));
  public readonly collapsible = computed(() => this.normalisedRows().length > COLLAPSIBLE_ROWS);
  public readonly showFilter = computed(() => this.collapsible() || (this.viewState().filter ?? '') !== '');
  /** The count is noise for a short static table: show it while filtering or when there is more than one page. */
  public readonly showCount = computed(() => (this.viewState().filter ?? '') !== '' || this.page().pageCount > 1);
  private readonly expandButton = viewChild<ElementRef<HTMLButtonElement>>('expandButton');

  public focusKey(control: string): string { return `${this.surfaceId()}:${this.node().id}:${control}`; }
  public cell(cells: readonly DashboardTableCell[], index: number): string { return cellText(cells[index] ?? null); }
  public ariaSort(column: TableColumn): AriaSort {
    const sort = this.viewState().sort;
    if (sort?.columnKey !== column.key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }
  public sortBy(column: TableColumn): void {
    this.viewStateChange.emit({ ...this.viewState(), sort: nextTableSort(this.viewState().sort, column.key), page: 0 });
  }
  public setFilter(filter: string): void { this.viewStateChange.emit({ ...this.viewState(), filter, page: 0 }); }
  public setPage(page: number): void { this.viewStateChange.emit({ ...this.viewState(), page }); }
  public toggleExpanded(): void { this.viewStateChange.emit({ ...this.viewState(), expanded: !this.viewState().expanded }); }
  public collapse(event: Event): void {
    if (!this.viewState().expanded) return;
    event.stopPropagation();
    this.viewStateChange.emit({ ...this.viewState(), expanded: false });
    this.expandButton()?.nativeElement.focus();
  }
  public isSelected(rowIndex: number): boolean {
    const selection = this.selection();
    return selection?.componentId === this.node().id && selection.target.kind === 'table-row' && selection.target.rowIndex === rowIndex;
  }
  public selectRow(rowIndex: number): void {
    const rows = this.safeNode().rows ?? [];
    if (this.node().selectable && Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < rows.length) {
      this.selectionChange.emit({ componentId: this.node().id, target: { kind: 'table-row', rowIndex } });
    }
  }
}
