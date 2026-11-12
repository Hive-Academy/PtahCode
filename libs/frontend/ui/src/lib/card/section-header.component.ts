import {
  ChangeDetectionStrategy,
  Component,
  input,
  numberAttribute,
} from '@angular/core';
import { PtahSectionLevel, PtahSectionSize } from './card.types';

function toSectionLevel(value: unknown): PtahSectionLevel {
  const level = numberAttribute(value, 3);
  return level === 2 || level === 4 ? level : 3;
}

/**
 * Section header owner (TASK_2026_1012_b1dc). A title row for a card or a
 * page section: an optional eyebrow, the heading, an optional description,
 * a `[status]` slot next to the heading and an `[actions]` slot at the end.
 * The look is in `ptah-card.css` and does not depend on the heading level.
 * Page titles stay with `ptah-page-header`.
 *
 * @example
 * ```html
 * <ptah-section-header heading="Providers" description="Connected model routes">
 *   <span ptahBadge status>3</span>
 *   <button ptahButton actions>Add</button>
 * </ptah-section-header>
 * ```
 */
@Component({
  selector: 'ptah-section-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-ptah-section-header': '',
    '[attr.data-size]': 'size()',
  },
  template: `
    <div class="ptah-section-text">
      @if (eyebrow(); as eyebrowText) {
        <span class="ptah-section-eyebrow" data-testid="section-header-eyebrow">{{
          eyebrowText
        }}</span>
      }
      <div class="ptah-section-title-row">
        @switch (level()) {
          @case (2) {
            <h2 class="ptah-section-title">{{ heading() }}</h2>
          }
          @case (4) {
            <h4 class="ptah-section-title">{{ heading() }}</h4>
          }
          @default {
            <h3 class="ptah-section-title">{{ heading() }}</h3>
          }
        }
        <ng-content select="[status]" />
      </div>
      @if (description(); as descriptionText) {
        <p class="ptah-section-description" data-testid="section-header-description">
          {{ descriptionText }}
        </p>
      }
    </div>
    <div class="ptah-section-actions" data-testid="section-header-actions"><ng-content select="[actions]" /></div>
  `,
})
export class PtahSectionHeaderComponent {
  /** The heading text. */
  readonly heading = input.required<string>();
  /** The heading tag (h2, h3 or h4). It does not change the look. */
  readonly level = input<PtahSectionLevel, unknown>(3, {
    transform: toSectionLevel,
  });
  /** group: 14 px title (default). section: 16 px title. */
  readonly size = input<PtahSectionSize>('group');
  /** Small uppercase label above the heading. */
  readonly eyebrow = input<string | null>(null);
  /** Muted hint text below the heading. */
  readonly description = input<string | null>(null);
}
