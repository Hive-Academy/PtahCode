import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { PTAH_TABLE_CONTEXT, PtahTableContext } from './table-detail';

@Component({
  selector: 'ptah-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: PTAH_TABLE_CONTEXT,
      useFactory: () => inject(PtahTableComponent),
    },
  ],
  host: {
    class: 'ptah-table block',
    'data-ptah-pattern': 'table',
    '[attr.data-density]': 'density() ?? null',
    '[attr.data-collapsed]': 'collapsed()',
  },
  template: `
    <div class="overflow-x-auto">
      <table
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
      .ptah-table-detail-row[hidden],
      .ptah-table-row-expander[hidden] {
        display: none;
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
      .ptah-table-control-cell [ptahSelect],
      .ptah-table-control-cell [ptahToggle] {
        min-height: var(--ptah-control-h-sm);
        height: var(--ptah-control-h-sm);
        width: auto;
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
    `,
  ],
})
export class PtahTableComponent implements PtahTableContext {
  readonly label = input.required<string>();
  readonly size = input<'xs' | 'sm'>('xs');
  readonly density = input<'default' | 'compact'>();
  readonly collapseBelow = input(0);
  readonly announcement = signal('');
  private readonly width = signal(Number.POSITIVE_INFINITY);
  readonly collapsed = computed(
    () => this.collapseBelow() > 0 && this.width() < this.collapseBelow(),
  );
  private readonly observer: ResizeObserver | null;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    if (typeof ResizeObserver === 'undefined') {
      this.observer = null;
    } else {
      this.observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) this.width.set(entry.contentRect.width);
      });
      this.observer.observe(host.nativeElement);
    }
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  announce(message: string): void {
    this.announcement.set(message);
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
