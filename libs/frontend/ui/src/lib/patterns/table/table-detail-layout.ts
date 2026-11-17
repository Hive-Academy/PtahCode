import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { PTAH_TABLE_CONTEXT } from './table-detail';

export type PtahTableDetailLayoutMode = 'auto' | 'list' | 'wide';

/**
 * Slot layout for the content of a `td[ptahDetailCell]`.
 *
 * Slots (the consumer fills them, an empty slot takes no space):
 * - `[ptahDetailFacts]` — a `<dl>` with one `<div><dt/><dd/></div>` per fact.
 * - `[ptahDetailChips]` — a row of chips or badges.
 * - default content — free content below the facts.
 * - `[ptahDetailActions]` — buttons. On the right in the wide mode.
 *
 * `mode="auto"` (default) uses the list mode when the table is narrow (collapsed, or
 * every optional column hidden): facts in a `7rem 1fr` grid, then chips, then the
 * actions. Otherwise it uses the wide mode: facts in 2 columns (3 columns at a
 * layout width of 48rem or more), chips below them, actions on the right.
 */
@Component({
  selector: 'ptah-table-detail-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ptah-table-detail-layout',
    '[attr.data-mode]': 'resolvedMode()',
  },
  template: `
    <div class="ptah-table-detail-facts"><ng-content select="[ptahDetailFacts]" /></div>
    <div class="ptah-table-detail-chips"><ng-content select="[ptahDetailChips]" /></div>
    <div class="ptah-table-detail-body"><ng-content /></div>
    <div class="ptah-table-detail-actions"><ng-content select="[ptahDetailActions]" /></div>
  `,
  styles: [
    `
      .ptah-table-detail-layout {
        display: flex;
        flex-direction: column;
        gap: var(--ptah-gap-controls);
        min-width: 0;
      }
      .ptah-table-detail-layout > :empty {
        display: none;
      }
      .ptah-table-detail-layout .ptah-table-detail-facts > [ptahDetailFacts] {
        display: grid;
        grid-template-columns: 7rem minmax(0, 1fr);
        gap: var(--ptah-gap-inline) var(--ptah-gap-controls);
        margin: 0;
      }
      .ptah-table-detail-layout .ptah-table-detail-facts > [ptahDetailFacts] > div {
        display: contents;
      }
      .ptah-table-detail-layout .ptah-table-detail-facts dt {
        color: var(--ptah-section-description-color);
      }
      .ptah-table-detail-layout .ptah-table-detail-facts dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .ptah-table-detail-layout .ptah-table-detail-chips > [ptahDetailChips],
      .ptah-table-detail-layout .ptah-table-detail-actions > [ptahDetailActions] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ptah-gap-inline);
      }
      .ptah-table-detail-layout[data-mode='wide'] {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
          'facts actions'
          'chips actions'
          'body actions';
        align-items: start;
        column-gap: var(--ptah-gap-controls);
        row-gap: 0;
        container-type: inline-size;
      }
      .ptah-table-detail-layout[data-mode='wide'] > .ptah-table-detail-facts {
        grid-area: facts;
      }
      .ptah-table-detail-layout[data-mode='wide'] > .ptah-table-detail-chips {
        grid-area: chips;
        margin-block-start: var(--ptah-gap-controls);
      }
      .ptah-table-detail-layout[data-mode='wide'] > .ptah-table-detail-body {
        grid-area: body;
        margin-block-start: var(--ptah-gap-controls);
      }
      .ptah-table-detail-layout[data-mode='wide'] > .ptah-table-detail-actions {
        grid-area: actions;
      }
      .ptah-table-detail-layout[data-mode='wide']
        .ptah-table-detail-actions
        > [ptahDetailActions] {
        justify-content: flex-end;
      }
      .ptah-table-detail-layout[data-mode='wide']
        .ptah-table-detail-facts
        > [ptahDetailFacts] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .ptah-table-detail-layout[data-mode='wide']
        .ptah-table-detail-facts
        > [ptahDetailFacts]
        > div {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 0;
      }
      @container (min-width: 48rem) {
        .ptah-table-detail-layout[data-mode='wide']
          .ptah-table-detail-facts
          > [ptahDetailFacts] {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class PtahTableDetailLayoutComponent {
  readonly mode = input<PtahTableDetailLayoutMode>('auto');
  private readonly context = inject(PTAH_TABLE_CONTEXT, { optional: true });

  readonly resolvedMode = computed<'list' | 'wide'>(() => {
    const mode = this.mode();
    if (mode !== 'auto') return mode;
    if (this.context === null) return 'list';
    return this.context.narrow() ? 'list' : 'wide';
  });
}
