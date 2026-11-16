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
  collapsed: Signal<boolean>;
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
  },
  template: `<button
    ptahIconButton
    type="button"
    [label]="label()"
    [attr.aria-expanded]="expanded()"
    [attr.aria-controls]="controls()"
    [hidden]="context !== null && !context.collapsed()"
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
    '[hidden]': '!open() || (context !== null && !context.collapsed())',
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
 * value adds phantom columns and can cause sideways scroll.
 */
@Directive({
  selector: 'td[ptahDetailCell]',
  standalone: true,
  host: { class: 'ptah-table-detail-cell', '[attr.colspan]': 'colspan()' },
})
export class PtahDetailCellDirective {
  readonly colspan = input.required<number>();
}
