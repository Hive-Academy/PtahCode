import { booleanAttribute, Directive, input } from '@angular/core';
import { PtahBadgeAppearance, PtahBadgeSize, PtahBadgeTone } from './badge.types';

/**
 * Badge owner (TASK_2026_957_fda3). A static label for metadata, a count or a
 * state word. The look is in `ptah-badge.css` and uses `--ptah-*` tokens only.
 * The text of the badge carries the meaning: the tone only supports it.
 */
@Directive({
  selector: 'span[ptahBadge]',
  standalone: true,
  host: {
    'data-ptah-badge': '',
    '[attr.data-tone]': 'tone()',
    '[attr.data-appearance]': 'appearance()',
    '[attr.data-size]': 'size()',
    '[attr.data-count]': 'count() ? "" : null',
  },
})
export class PtahBadgeDirective {
  readonly tone = input<PtahBadgeTone>('neutral');
  readonly appearance = input<PtahBadgeAppearance>('soft');
  readonly size = input<PtahBadgeSize>('sm');
  /** A number badge: tabular figures and a minimum width equal to the height. */
  readonly count = input(false, { transform: booleanAttribute });
}
