import { Directive, input } from '@angular/core';
import type {
  PtahCardBorder,
  PtahCardFill,
  PtahCardPadding,
  PtahCardShadow,
  PtahCardTone,
  PtahCardVariant,
} from './card.types';

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
    '[attr.data-tone]': "tone() === 'neutral' ? null : tone()",
    '[attr.data-tone-border]': "toneBorder() ? '' : null",
    '[attr.data-fill]': "translucent() === 50 ? '50' : null",
    '[attr.data-shadow]': "shadow() === 'sm' ? 'sm' : null",
    '[attr.data-border]': "border() === 'faint' ? 'faint' : null",
  },
})
export class PtahSurfaceDirective {
  readonly variant = input<PtahCardVariant>('card');
  readonly padding = input<PtahCardPadding>('md');
  /** Tone used by `toneBorder`; the directive never adds a spine. */
  readonly tone = input<PtahCardTone>('neutral');
  /** Use the tone color for the border when the tone is not neutral. */
  readonly toneBorder = input(false);
  /** Fill opacity: 50 matches `bg-base-200/50`; 100 preserves the default. */
  readonly translucent = input<PtahCardFill>(100);
  /** Optional `shadow-sm` look. */
  readonly shadow = input<PtahCardShadow>('none');
  /** Faint matches `border-base-content/10`. */
  readonly border = input<PtahCardBorder>('default');
}
