import { Directive, input } from '@angular/core';
import { PtahCardPadding, PtahCardVariant } from './card.types';

/**
 * Panel surface owner (TASK_2026_1012_b1dc). Puts the card look on a raw
 * panel and keeps its DOM: no wrapper, no layout, no behavior. The look is in
 * `ptah-card.css` and uses `--ptah-card-*` tokens only. For a card with slots
 * or activation, use `ptah-surface-card`.
 *
 * @example
 * ```html
 * <div ptahSurface padding="sm">...</div>
 * <section ptahSurface variant="inset">...</section>
 * ```
 */
@Directive({
  selector: '[ptahSurface]',
  standalone: true,
  host: {
    class: 'ptah-card',
    'data-ptah-surface': '',
    '[attr.data-variant]': 'variant()',
    '[attr.data-padding]': 'padding()',
  },
})
export class PtahSurfaceDirective {
  readonly variant = input<PtahCardVariant>('card');
  readonly padding = input<PtahCardPadding>('md');
}
