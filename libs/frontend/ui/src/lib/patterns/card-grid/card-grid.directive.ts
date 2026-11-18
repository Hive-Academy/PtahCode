import { computed, Directive, input } from '@angular/core';

/** Track-minimum variants of the card grid. */
export type PtahCardGridVariant = 'default' | 'tight' | 'pair' | 'wide';

const BASE_CLASS = 'grid items-start gap-[var(--ptah-card-grid-gap)]';

/**
 * One literal class string per variant, so Tailwind finds each one in the
 * source. `min(…, 100%)` keeps one card from overflowing a narrow container.
 */
const VARIANT_CLASS: Readonly<Record<PtahCardGridVariant, string>> = {
  default:
    'grid-cols-[repeat(auto-fill,minmax(min(var(--ptah-card-grid-min),100%),1fr))]',
  tight:
    'grid-cols-[repeat(auto-fill,minmax(min(var(--ptah-card-grid-min-tight),100%),1fr))]',
  pair: 'grid-cols-[repeat(auto-fill,minmax(min(var(--ptah-card-grid-min-pair),100%),1fr))]',
  wide: 'grid-cols-[repeat(auto-fill,minmax(min(var(--ptah-card-grid-min-wide),100%),1fr))]',
};

/**
 * Card grid pattern (TASK_2026_2256_159f). An `auto-fill` grid of cards for a
 * settings section that uses the full content width. The number of columns
 * follows the width of the container: one column on a narrow window, two at
 * about 1440px and three at about 1920px with the default variant.
 *
 * Variants set the track minimum: `default` (16.5rem), `tight` (14rem) for
 * small option cards, `pair` (20rem) for wide cards and `wide` (27rem) for
 * row cards with a name, status and badges on one line (two columns at about
 * 1440px, three at about 1920px). All values come from the `--ptah-card-grid-*`
 * tokens.
 *
 * @example
 * ```html
 * <div ptahCardGrid variant="tight" role="radiogroup" aria-label="Styles">...</div>
 * ```
 */
@Directive({
  selector: '[ptahCardGrid]',
  standalone: true,
  host: {
    'data-ptah-pattern': 'card-grid',
    '[attr.data-variant]': 'variant()',
    '[class]': 'hostClass()',
  },
})
export class PtahCardGridDirective {
  /** The track minimum. Default `default` (16.5rem). */
  readonly variant = input<PtahCardGridVariant>('default');

  protected readonly hostClass = computed(() => `${BASE_CLASS} ${VARIANT_CLASS[this.variant()]}`);
}
