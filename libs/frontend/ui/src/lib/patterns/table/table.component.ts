import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  input,
} from '@angular/core';

@Component({
  selector: 'ptah-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-ptah-pattern': 'table' },
  template: `
    <div class="overflow-x-auto">
      <table
        class="table"
        [class.table-xs]="size() === 'xs'"
        [class.table-sm]="size() === 'sm'"
        [attr.aria-label]="label()"
      >
        <ng-content />
      </table>
    </div>
  `,
})
export class PtahTableComponent {
  readonly label = input.required<string>();
  readonly size = input<'xs' | 'sm'>('xs');
}

@Directive({
  selector: 'th[ptahNumeric], td[ptahNumeric]',
  standalone: true,
  host: { class: 'text-right tabular-nums' },
})
export class PtahNumericCellDirective {}
