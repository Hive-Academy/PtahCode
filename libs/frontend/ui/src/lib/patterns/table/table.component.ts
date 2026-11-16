import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  input,
  ViewEncapsulation,
} from '@angular/core';

@Component({
  selector: 'ptah-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ptah-table block',
    'data-ptah-pattern': 'table',
    '[attr.data-density]': 'density() ?? null',
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
  `,
  styles: [
    `
      .ptah-table[data-density] .ptah-table-grid {
        width: 100%;
        border-collapse: collapse;
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
export class PtahTableComponent {
  readonly label = input.required<string>();
  readonly size = input<'xs' | 'sm'>('xs');
  readonly density = input<'default' | 'compact'>();
}

@Directive({
  selector: 'th[ptahNumeric], td[ptahNumeric]',
  standalone: true,
  host: { class: 'text-right tabular-nums' },
})
export class PtahNumericCellDirective {}

export * from './table-cells';
export * from './table-row-actions.component';
