import { computed, Directive, input } from '@angular/core';

/**
 * Each track is at least the minimum width (or the full width when the grid is narrower) and at
 * least one third of the row less two gaps, so a wide grid never shows more than three columns.
 */
const COLUMN_CLASS = {
  sm: 'grid-cols-[repeat(auto-fit,minmax(min(100%,max(var(--ptah-field-grid-min-sm),calc((100%_-_2*var(--ptah-gap-field))/3))),1fr))]',
  md: 'grid-cols-[repeat(auto-fit,minmax(min(100%,max(var(--ptah-field-grid-min-md),calc((100%_-_2*var(--ptah-gap-field))/3))),1fr))]',
};

/** Related short fields fill the available column, wrap at their minimum width and stop at three columns. */
@Directive({
  selector: '[ptahFieldGrid]',
  standalone: true,
  host: {
    'data-ptah-pattern': 'field-grid',
    '[class]': 'hostClass()',
  },
})
export class PtahFieldGridDirective {
  readonly minColumn = input<'sm' | 'md'>('sm');
  protected readonly hostClass = computed(() =>
    `grid min-w-0 items-start gap-[var(--ptah-gap-field)] ${COLUMN_CLASS[this.minColumn()]}`,
  );
}
