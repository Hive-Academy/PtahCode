import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  Directive,
  DestroyRef,
  ElementRef,
  forwardRef,
  computed,
  inject,
  Injector,
  input,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { PTAH_TABLE_CONTEXT, PtahTableContext } from './table-detail';
import { PtahTableColumn, resolveHiddenColumns } from './table-columns';

/**
 * The overflow guard keeps its extra hidden columns until the host grows by more
 * than this many px. The margin stops a loop when a scrollbar comes and goes.
 */
const GUARD_HYSTERESIS_PX = 32;

@Component({
  selector: 'ptah-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: PTAH_TABLE_CONTEXT,
      useExisting: forwardRef(() => PtahTableComponent),
    },
  ],
  host: {
    class: 'ptah-table block',
    'data-ptah-pattern': 'table',
    '[attr.data-density]': 'density() ?? null',
    '[attr.data-collapsed]': 'collapsed()',
    '[attr.data-reflow]': 'columnsMode() ? "columns" : null',
    '[attr.data-overflow]': 'overflowFallback() ? "scroll" : null',
  },
  template: `
    <div
      #wrapper
      [class.overflow-x-auto]="!columnsMode() || overflowFallback()"
      [class.ptah-table-reflow]="columnsMode()"
    >
      <table
        #grid
        class="table ptah-table-grid"
        [class.table-xs]="size() === 'xs'"
        [class.table-sm]="size() === 'sm'"
        [attr.aria-label]="label()"
      >
        <ng-content />
      </table>
    </div>
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {{ announcement() }}
    </div>
  `,
  styles: [
    `
      .ptah-table[data-density] .ptah-table-grid {
        width: 100%;
        border-collapse: collapse;
      }
      .ptah-table-collapsible[hidden],
      .ptah-table-column[hidden],
      .ptah-table-detail-row[hidden],
      .ptah-table-row-expander[hidden] {
        display: none;
      }
      .ptah-table-reflow {
        max-width: 100%;
      }
      .ptah-table-reflow > .ptah-table-grid {
        width: 100%;
      }
      .ptah-table-reflow > .ptah-table-grid th,
      .ptah-table-reflow > .ptah-table-grid td {
        overflow-wrap: break-word;
      }
      .ptah-table-detail-cell dl {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        gap: var(--ptah-gap-inline) var(--ptah-gap-controls);
        margin: 0;
      }
      .ptah-table-detail-cell dt {
        color: var(--ptah-section-description-color);
      }
      .ptah-table-detail-cell dd {
        margin: 0;
      }
      .ptah-table[data-density] .ptah-table-grid thead th {
        height: 2.25rem;
        border-bottom: var(--ptah-border-width) solid
          var(--ptah-card-border-faint);
      }
      .ptah-table[data-density] .ptah-table-grid tbody th,
      .ptah-table[data-density] .ptah-table-grid tbody td {
        height: 3rem;
        border-bottom: var(--ptah-border-width) solid
          var(--ptah-card-border-faint);
      }
      .ptah-table[data-density='compact'] .ptah-table-grid tbody th,
      .ptah-table[data-density='compact'] .ptah-table-grid tbody td {
        height: 2.75rem;
      }
      .ptah-table[data-density] .ptah-table-grid thead {
        background: var(--ptah-card-bg-subtle);
      }
      .ptah-table[data-density] .ptah-table-grid tbody tr:hover {
        background: var(--ptah-card-bg-subtle);
      }
      .ptah-table-control-cell {
        white-space: nowrap;
      }
      .ptah-table-control-cell select,
      .ptah-table-control-cell [ptahSelect] {
        min-height: var(--ptah-control-h-sm);
        height: var(--ptah-control-h-sm);
        width: auto;
        font-size: var(--ptah-text-hint-size);
      }
      .ptah-table-control-cell [ptahToggle] {
        min-height: var(--ptah-control-h-sm);
        height: var(--ptah-control-h-sm);
        font-size: var(--ptah-text-hint-size);
      }
      .ptah-table-actions-cell {
        text-align: end;
        white-space: nowrap;
      }
      .ptah-table-actions-cell > * {
        margin-inline-start: var(--ptah-gap-inline);
      }
      .ptah-table-row-state[data-state='muted'] td {
        color: var(--ptah-section-description-color);
      }
      .ptah-table-row-state[data-state='selected'] {
        background: var(--ptah-btn-selected-bg);
      }
      .ptah-table-row-state[data-state='disabled'] td {
        color: var(--ptah-section-description-color);
      }
      .ptah-table-message-cell {
        text-align: center;
      }
      .ptah-table-group-row th {
        text-align: start;
        background: var(--ptah-card-bg-raised);
      }
      .ptah-table-group-title {
        display: inline-flex;
        align-items: center;
        gap: var(--ptah-gap-inline);
      }
      .ptah-table-bar-cell {
        min-width: 8rem;
      }
      .ptah-table-sticky-header {
        position: sticky;
        inset-inline-start: 0;
        z-index: 1;
        background: var(--ptah-table-sticky-bg, var(--surface-1));
        border-inline-end: 1px solid var(--ptah-card-border);
      }
      .ptah-table[data-density]
        .ptah-table-grid
        tbody
        tr:hover
        > .ptah-table-sticky-header {
        background: var(--ptah-card-bg-subtle);
      }
      .ptah-table-score {
        display: flex;
        flex-direction: column;
        gap: var(--ptah-gap-inline);
      }
      .ptah-table-score-unrated,
      .ptah-table-score-stale {
        color: var(--ptah-section-description-color);
        font-size: var(--ptah-text-hint-size);
      }
      .ptah-table-cell-button {
        cursor: pointer;
        background: transparent;
        border: 0;
        padding: 0;
        color: inherit;
        font: inherit;
      }
      .ptah-table-cell-button:focus-visible {
        outline: var(--ptah-focus-ring-width) solid var(--ptah-focus-ring-color);
        outline-offset: var(--ptah-focus-ring-offset);
      }
    `,
  ],
})
export class PtahTableComponent implements PtahTableContext {
  readonly label = input.required<string>();
  readonly size = input<'xs' | 'sm'>('xs');
  readonly density = input<'default' | 'compact'>();
  readonly collapseBelow = input(0);
  /**
   * Column definitions. An empty list (default) keeps the legacy behavior: no
   * column hides by priority, and the grid scrolls sideways when it is too wide.
   * A non-empty list turns on columns mode: optional columns hide one at a time,
   * cells wrap, and the grid scrolls sideways only as a last resort.
   */
  readonly columns = input<readonly PtahTableColumn[]>([]);
  /** Show the row expanders and detail rows also when no column is hidden. */
  readonly wideDetail = input(false, { transform: booleanAttribute });
  readonly announcement = signal('');

  private readonly width = signal(Number.POSITIVE_INFINITY);
  private readonly guardExtra = signal(0);
  /** The guard found no column left to hide, so the grid scrolls sideways. */
  readonly overflowFallback = signal(false);

  readonly columnsMode = computed(() => this.columns().length > 0);
  readonly collapsed = computed(
    () => this.collapseBelow() > 0 && this.width() < this.collapseBelow(),
  );
  readonly hiddenColumns = computed<ReadonlySet<string>>(() =>
    resolveHiddenColumns(this.columns(), this.width(), {
      collapseBelow: this.collapseBelow(),
      guardExtra: this.guardExtra(),
    }),
  );
  /** Number of declared columns that show. Use it for the detail cell colspan. */
  readonly visibleColumnCount = computed(
    () => this.columns().length - this.hiddenColumns().size,
  );
  private readonly optionalColumnCount = computed(
    () => this.columns().filter((column) => typeof column.priority === 'number').length,
  );
  readonly detailEnabled = computed(
    () => this.collapsed() || this.hiddenColumns().size > 0 || this.wideDetail(),
  );
  readonly narrow = computed(
    () =>
      this.collapsed() ||
      (this.optionalColumnCount() > 0 &&
        this.hiddenColumns().size >= this.optionalColumnCount()),
  );

  private readonly wrapper = viewChild.required<ElementRef<HTMLElement>>('wrapper');
  private readonly grid = viewChild.required<ElementRef<HTMLTableElement>>('grid');
  private readonly injector = inject(Injector);
  private readonly observer: ResizeObserver | null;
  private guardWidth = 0;
  private checkScheduled = false;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    if (typeof ResizeObserver === 'undefined') {
      this.observer = null;
    } else {
      const observer = new ResizeObserver((entries) => {
        let measured = false;
        for (const entry of entries) {
          // An entry without a target (test doubles) counts as the host.
          if (!entry.target || entry.target === host) {
            this.onHostWidth(entry.contentRect.width);
            measured = true;
          }
        }
        if (!measured) this.scheduleOverflowCheck();
      });
      observer.observe(host);
      this.observer = observer;
      afterNextRender(() => observer.observe(this.grid().nativeElement));
    }
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  isColumnHidden(id: string): boolean {
    return this.hiddenColumns().has(id);
  }

  announce(message: string): void {
    // Clear first so a repeated message is read again by the live region.
    this.announcement.set('');
    queueMicrotask(() => this.announcement.set(message));
  }

  private onHostWidth(width: number): void {
    this.width.set(width);
    const guarded = this.guardExtra() > 0 || this.overflowFallback();
    if (guarded && width > this.guardWidth + GUARD_HYSTERESIS_PX) {
      this.guardExtra.set(0);
      this.overflowFallback.set(false);
    }
    this.scheduleOverflowCheck();
  }

  private scheduleOverflowCheck(): void {
    if (!this.columnsMode() || this.checkScheduled) return;
    this.checkScheduled = true;
    afterNextRender(
      () => {
        this.checkScheduled = false;
        this.checkOverflow();
      },
      { injector: this.injector },
    );
  }

  /**
   * Guard: when the cells cannot wrap enough and the grid is wider than its
   * wrapper, hide one more optional column. With no optional column left, let
   * the grid scroll sideways.
   */
  private checkOverflow(): void {
    if (!this.columnsMode()) return;
    const available = this.wrapper().nativeElement.clientWidth;
    const needed = this.grid().nativeElement.offsetWidth;
    if (available <= 0 || needed <= available + 1) return;
    this.guardWidth = this.width();
    if (this.hiddenColumns().size < this.optionalColumnCount()) {
      this.guardExtra.update((count) => count + 1);
      this.scheduleOverflowCheck();
    } else {
      this.overflowFallback.set(true);
    }
  }
}

@Directive({
  selector: 'th[ptahNumeric], td[ptahNumeric]',
  standalone: true,
  host: { class: 'text-right tabular-nums' },
})
export class PtahNumericCellDirective {}

export * from './table-cells';
export * from './table-row-actions.component';
export * from './table-detail';
export * from './table-detail-layout';
export * from './table-columns';
export * from './table-order';
export * from './table-matrix';
