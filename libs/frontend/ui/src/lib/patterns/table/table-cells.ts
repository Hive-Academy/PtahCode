import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  Directive,
  input,
} from '@angular/core';

/**
 * Usage: a row with a row title, a compact select, a toggle and the actions cell.
 *
 * ```html
 * <ptah-table label="Lanes" density="compact">
 *   <thead><tr><th scope="col">Lane</th><th scope="col">Permission</th>
 *     <th scope="col">Enabled</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
 *   <tbody>
 *     <tr [ptahRowState]="lane.installed ? 'default' : 'muted'">
 *       <th scope="row">
 *         <ptah-table-row-title [name]="lane.name" kind="CLI agent" [secondary]="lane.version" mono />
 *       </th>
 *       <td ptahControlCell>
 *         <select ptahSelect [attr.aria-label]="cellLabel('Permission', lane.name)">...</select>
 *       </td>
 *       <td ptahControlCell>
 *         <input ptahToggle type="checkbox" [attr.aria-label]="cellLabel('Enabled', lane.name)" />
 *       </td>
 *       <td ptahActionsCell>
 *         <button ptahInlineAction>Sign in</button>
 *         <ptah-table-row-actions [rowLabel]="lane.name">
 *           <button role="menuitem">Test</button>
 *         </ptah-table-row-actions>
 *       </td>
 *     </tr>
 *   </tbody>
 * </ptah-table>
 * ```
 * Build the control names with `ptahCellLabel(column, row)`.
 */
export function ptahCellLabel(column: string, row: string): string {
  return `${column} for ${row}`;
}

@Component({
  selector: 'ptah-table-row-title',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ptah-table-row-title' },
  template: `
    <span class="ptah-table-row-title-primary">
      <ng-content select="[ptahRowMark]" />
      <span class="ptah-table-row-title-name">{{ name() }}</span>
      @if (kind()) {
        <span class="ptah-table-row-title-kind">{{ kind() }}</span>
      }
      <ng-content select="[ptahRowInfo]" />
    </span>
    @if (secondary()) {
      <span
        class="ptah-table-row-title-secondary"
        [class.ptah-table-row-title-mono]="mono()"
        >{{ secondary() }}</span
      >
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-direction: column;
        gap: var(--ptah-gap-inline);
        text-align: start;
      }
      .ptah-table-row-title-primary {
        display: inline-flex;
        align-items: center;
        gap: var(--ptah-gap-inline);
      }
      .ptah-table-row-title-name {
        font-size: var(--ptah-text-body-size);
        font-weight: var(--ptah-text-group-title-weight);
      }
      .ptah-table-row-title-kind {
        padding: 0 var(--ptah-gap-inline);
        border: 1px solid var(--ptah-card-border);
        border-radius: var(--ptah-radius-chip);
        font-size: var(--ptah-text-caption-size);
      }
      .ptah-table-row-title-secondary {
        color: var(--ptah-section-description-color);
        font-size: var(--ptah-text-hint-size);
      }
      .ptah-table-row-title-mono {
        font-family: var(--ptah-font-mono);
      }
    `,
  ],
})
export class PtahTableRowTitleComponent {
  readonly name = input.required<string>();
  readonly kind = input<string>();
  readonly secondary = input<string>();
  readonly mono = input(false, { transform: booleanAttribute });
}

@Directive({
  selector: 'td[ptahControlCell]',
  standalone: true,
  host: { class: 'ptah-table-control-cell' },
})
export class PtahTableControlCellDirective {}

@Directive({
  selector: 'td[ptahActionsCell]',
  standalone: true,
  host: { class: 'ptah-table-actions-cell' },
})
export class PtahTableActionsCellDirective {}

@Directive({
  selector: 'tr[ptahRowState]',
  standalone: true,
  host: {
    class: 'ptah-table-row-state',
    '[attr.data-state]': 'ptahRowState()',
    '[attr.aria-disabled]': 'ptahRowState() === "disabled" ? "true" : null',
    '[attr.inert]': 'ptahRowState() === "disabled" ? "" : null',
  },
})
export class PtahTableRowDirective {
  readonly ptahRowState = input<'default' | 'muted' | 'disabled' | 'selected'>(
    'default',
  );
}

@Directive({
  selector: 'td[ptahMessageCell]',
  standalone: true,
  host: {
    class: 'ptah-table-message-cell',
    '[attr.colspan]': 'ptahMessageCell()',
  },
})
export class PtahTableMessageCellDirective {
  readonly ptahMessageCell = input.required<number>();
}
