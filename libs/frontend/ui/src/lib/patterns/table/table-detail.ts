import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  Directive,
  inject,
  InjectionToken,
  input,
  model,
  Signal,
} from '@angular/core';
import { PtahIconButtonDirective } from '../../button/icon-button.directive';

export interface PtahTableContext {
  /** `collapseBelow` is set and the host is narrower. Drives `ptahCollapsible`. */
  collapsed: Signal<boolean>;
  /** Expanders and detail rows show: collapsed, a column hidden, or `wideDetail`. */
  detailEnabled: Signal<boolean>;
  /** The detail layout uses the list mode: collapsed, or every optional column hidden. */
  narrow: Signal<boolean>;
  isColumnHidden(id: string): boolean;
  announce(message: string): void;
}

export const PTAH_TABLE_CONTEXT = new InjectionToken<PtahTableContext>(
  'PTAH_TABLE_CONTEXT',
);

@Directive({
  selector: 'th[ptahCollapsible], td[ptahCollapsible]',
  standalone: true,
  host: {
    class: 'ptah-table-collapsible',
    '[hidden]': 'context?.collapsed() ?? false',
  },
})
export class PtahCollapsibleCellDirective {
  protected readonly context = inject(PTAH_TABLE_CONTEXT, { optional: true });
}

@Component({
  selector: 'ptah-table-row-expander',
  standalone: true,
  imports: [PtahIconButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ptah-table-row-expander',
    '[hidden]': 'context !== null && !context.detailEnabled()',
  },
  template: `<button
    ptahIconButton
    type="button"
    [label]="label()"
    [attr.aria-expanded]="expanded()"
    [attr.aria-controls]="controls()"
    (click)="expanded.set(!expanded())"
  >
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      [class.rotate-180]="expanded()"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  </button>`,
})
export class PtahRowExpanderComponent {
  readonly label = input.required<string>();
  readonly controls = input.required<string>();
  readonly expanded = model(false);
  protected readonly context = inject(PTAH_TABLE_CONTEXT, { optional: true });
}

@Directive({
  selector: 'tr[ptahDetailRow]',
  standalone: true,
  host: {
    class: 'ptah-table-detail-row',
    '[hidden]': '!open() || (context !== null && !context.detailEnabled())',
  },
})
export class PtahDetailRowDirective {
  readonly open = input(false, {
    alias: 'ptahDetailRow',
    transform: booleanAttribute,
  });
  protected readonly context = inject(PTAH_TABLE_CONTEXT, { optional: true });
}

/**
 * Detail cell of a `tr[ptahDetailRow]`. Set `colspan` to the number of cells that stay
 * visible when the table is collapsed (row header, priority cells, expander). A larger
 * value adds phantom columns and can cause sideways scroll. In columns mode, bind
 * `[colspan]="table.visibleColumnCount()"`.
 */
@Directive({
  selector: 'td[ptahDetailCell]',
  standalone: true,
  host: { class: 'ptah-table-detail-cell', '[attr.colspan]': 'colspan()' },
})
export class PtahDetailCellDirective {
  readonly colspan = input.required<number>();
}
