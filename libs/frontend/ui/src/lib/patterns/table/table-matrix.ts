import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  input,
} from '@angular/core';
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
 * It spans all columns. Error uses `role="alert"`. Loading uses `role="status"`
 * with `aria-busy`.
 *
 * ```html
 * <tr><td ptahStatusCell="loading" [columns]="4">Loading lanes</td></tr>
 * ```
 */
@Directive({
  selector: 'td[ptahStatusCell]',
  standalone: true,
  host: {
    class: 'ptah-table-message-cell',
    '[attr.data-status]': 'ptahStatusCell()',
    '[attr.colspan]': 'columns()',
    '[attr.role]': 'ptahStatusCell() === "error" ? "alert" : "status"',
    '[attr.aria-busy]': 'ptahStatusCell() === "loading" ? "true" : null',
  },
})
export class PtahTableStatusCellDirective {
  readonly ptahStatusCell = input.required<'loading' | 'empty' | 'error'>();
  readonly columns = input.required<number>();
}
