import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  input,
} from '@angular/core';
import { PtahMeterTone } from '../../charts/chart.types';
import { PtahMeterComponent } from '../../charts/meter.component';

/**
 * Group row: one row header that spans all columns, with an optional count.
 * Use one `tbody` for each group. A screen reader reads the `th` as the
 * header of the rows in that `tbody`.
 *
 * ```html
 * <tbody>
 *   <tr ptahGroupRow>
 *     <th ptahGroupHeader [columns]="4">
 *       <ptah-table-group-title name="Installed"><span ptahGroupCount>3</span></ptah-table-group-title>
 *     </th>
 *   </tr>
 *   <tr>...</tr>
 * </tbody>
 * ```
 */
@Directive({
  selector: 'tr[ptahGroupRow]',
  standalone: true,
  host: { class: 'ptah-table-group-row' },
})
export class PtahTableGroupRowDirective {}

@Directive({
  selector: 'th[ptahGroupHeader]',
  standalone: true,
  host: {
    scope: 'rowgroup',
    '[attr.colspan]': 'columns()',
  },
})
export class PtahTableGroupHeaderDirective {
  readonly columns = input.required<number>();
}

@Component({
  selector: 'ptah-table-group-title',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ptah-table-group-title' },
  template: `
    <span class="ptah-table-group-name">{{ name() }}</span>
    <ng-content select="[ptahGroupCount]" />
  `,
})
export class PtahTableGroupTitleComponent {
  readonly name = input.required<string>();
}

/** Cell that holds a score. It keeps a minimum width so the bar stays readable. */
@Directive({
  selector: 'td[ptahBarCell]',
  standalone: true,
  host: { class: 'ptah-table-bar-cell' },
})
export class PtahTableBarCellDirective {}

/**
 * Score from 0 to 100 as a `ptah-meter` with the number visible.
 * No score, or a score outside 0 to 100, shows the unrated text and no bar.
 * `stale` adds a visible text mark, so the state is not only a color.
 *
 * ```html
 * <td ptahBarCell><ptah-table-score label="Quality for Quill" [score]="72" stale /></td>
 * ```
 */
@Component({
  selector: 'ptah-table-score',
  standalone: true,
  imports: [PtahMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ptah-table-score' },
  template: `
    @if (rated()) {
      <ptah-meter
        [value]="score()!"
        [max]="100"
        [label]="label()"
        [hideLabel]="true"
        [valueText]="'' + score()"
        [tone]="tone()"
      />
    } @else {
      <span class="ptah-table-score-unrated">{{ unratedText() }}</span>
    }
    @if (stale()) {
      <span class="ptah-table-score-stale"
        ><span aria-hidden="true">&#9201; </span>{{ staleText() }}</span
      >
    }
  `,
})
export class PtahTableScoreComponent {
  readonly label = input.required<string>();
  readonly score = input<number | null | undefined>();
  /** Fixed tone. High is good for a score, so it never uses the usage rule `auto`. */
  readonly tone = input<Exclude<PtahMeterTone, 'auto'>>('gold');
  readonly stale = input(false, { transform: booleanAttribute });
  readonly unratedText = input('Unrated');
  readonly staleText = input('Stale');
  readonly rated = computed(() => {
    const v = this.score();
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  });
}

/**
 * Row header that stays at the inline start edge when the table scrolls sideways.
 * Use it as a fallback when a table cannot collapse columns.
 */
@Directive({
  selector: 'th[ptahStickyHeader]',
  standalone: true,
  host: { class: 'ptah-table-sticky-header' },
})
export class PtahTableStickyHeaderDirective {}

/**
 * Button inside a cell that opens a popover. Set `aria-label` with `ptahCellLabel`.
 * `expanded` mirrors the popover state to `aria-expanded`.
 */
@Directive({
  selector: 'button[ptahCellButton]',
  standalone: true,
  host: {
    class: 'ptah-table-cell-button',
    type: 'button',
    'aria-haspopup': 'dialog',
    '[attr.aria-expanded]': 'expanded()',
  },
})
export class PtahTableCellButtonDirective {
  readonly expanded = input(false, { alias: 'ptahCellButton' });
}

/**
 * Status cell for loading, empty and error rows. Put it in a row of its own.
 * The `td` stays a table cell and spans all columns. An inner element carries
 * the live role: error uses `role="alert"`, the others use `role="status"`.
 * Loading adds `aria-busy`.
 *
 * ```html
 * <tr><td ptahStatusCell="loading" [columns]="4">Loading lanes</td></tr>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- attribute on td keeps the cell role
  selector: 'td[ptahStatusCell]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ptah-table-message-cell',
    '[attr.data-status]': 'ptahStatusCell()',
    '[attr.colspan]': 'columns()',
  },
  template: `<div
    class="ptah-table-status-live"
    [attr.role]="ptahStatusCell() === 'error' ? 'alert' : 'status'"
    [attr.aria-busy]="ptahStatusCell() === 'loading' ? 'true' : null"
  >
    <ng-content />
  </div>`,
})
export class PtahTableStatusCellComponent {
  readonly ptahStatusCell = input.required<'loading' | 'empty' | 'error'>();
  readonly columns = input.required<number>();
}
