import { Directive, inject, input } from '@angular/core';
import { PTAH_TABLE_CONTEXT } from './table-detail';

/**
 * One column of a `ptah-table` in columns mode (`[columns]`).
 *
 * - `priority` makes the column optional. A column without a priority never hides.
 *   A lower number is more important: the highest number hides first, and of two
 *   equal numbers the later column hides first.
 * - `minWidth` is the width in px that the column needs before its cells wrap
 *   badly. The table hides optional columns until the sum of the visible
 *   `minWidth` values fits the host width. Default: `PTAH_TABLE_COLUMN_MIN_WIDTH`.
 */
export interface PtahTableColumn {
  readonly id: string;
  readonly priority?: number;
  readonly minWidth?: number;
}

/** Default `minWidth` of a `PtahTableColumn`, in px. */
export const PTAH_TABLE_COLUMN_MIN_WIDTH = 96;

export interface PtahTableColumnResolveOptions {
  /** When > 0 and the width is below it, every optional column hides. */
  readonly collapseBelow?: number;
  /** Number of optional columns to hide in addition, set by the overflow guard. */
  readonly guardExtra?: number;
}

/** Optional columns in the order in which they hide (first entry hides first). */
export function columnHideOrder(
  columns: readonly PtahTableColumn[],
): readonly PtahTableColumn[] {
  return columns
    .map((column, index) => ({ column, index }))
    .filter(
      (item): item is { column: PtahTableColumn & { priority: number }; index: number } =>
        typeof item.column.priority === 'number',
    )
    .sort((a, b) => b.column.priority - a.column.priority || b.index - a.index)
    .map((item) => item.column);
}

/**
 * Ids of the columns to hide at `width`. A pure function, so that the priority
 * rules have one source and can be tested without a DOM.
 */
export function resolveHiddenColumns(
  columns: readonly PtahTableColumn[],
  width: number,
  options: PtahTableColumnResolveOptions = {},
): ReadonlySet<string> {
  const order = columnHideOrder(columns);
  const hidden = new Set<string>();
  if (order.length === 0) return hidden;

  const collapseBelow = options.collapseBelow ?? 0;
  if (collapseBelow > 0 && width < collapseBelow) {
    for (const column of order) hidden.add(column.id);
    return hidden;
  }

  let total = columns.reduce((sum, column) => sum + columnMinWidth(column), 0);
  let extra = Math.max(0, Math.floor(options.guardExtra ?? 0));
  for (const column of order) {
    if (total > width) {
      hidden.add(column.id);
      total -= columnMinWidth(column);
    } else if (extra > 0) {
      hidden.add(column.id);
      extra -= 1;
    } else {
      break;
    }
  }
  return hidden;
}

function columnMinWidth(column: PtahTableColumn): number {
  const value = column.minWidth ?? PTAH_TABLE_COLUMN_MIN_WIDTH;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Marks a header or body cell as part of a declared column:
 * `<th ptahColumn="model">`. The cell hides when the table hides the column.
 */
@Directive({
  selector: 'th[ptahColumn], td[ptahColumn]',
  standalone: true,
  host: {
    class: 'ptah-table-column',
    '[attr.data-column]': 'id()',
    '[hidden]': 'context?.isColumnHidden(id()) ?? false',
  },
})
export class PtahTableColumnDirective {
  readonly id = input.required<string>({ alias: 'ptahColumn' });
  protected readonly context = inject(PTAH_TABLE_CONTEXT, { optional: true });
}
