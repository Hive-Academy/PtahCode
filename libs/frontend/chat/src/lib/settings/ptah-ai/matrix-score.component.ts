import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PtahMeterComponent } from '@ptah-extension/ui';

/**
 * One decision-matrix score cell: the value and a short bar on one line (prototype rev 2), plus a
 * stale icon whose text is in a tooltip. The meter keeps the label and value for assistive tech.
 */
@Component({
  selector: 'ptah-matrix-score',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahMeterComponent],
  template: `
    @if (score() !== null) {
      <span class="flex items-center gap-[var(--ptah-gap-label)]">
        <span class="w-7 text-right tabular-nums" aria-hidden="true">{{ score() }}</span>
        <ptah-meter
          class="w-10 shrink-0"
          [value]="score() ?? 0"
          [max]="100"
          [label]="label()"
          [hideLabel]="true"
          [showValue]="false"
          [valueText]="'' + score()"
          tone="gold"
        />
        @if (stale()) {
          <span
            [title]="'Stale: rated ' + date()"
            [attr.aria-label]="'Stale: rated ' + date()"
            >&#9201;</span
          >
        }
      </span>
    } @else {
      <span class="text-base-content-muted" aria-label="Unrated">&#8212;</span>
    }
  `,
})
export class MatrixScoreComponent {
  readonly score = input<number | null>(null);
  readonly label = input.required<string>();
  readonly stale = input(false);
  readonly date = input('');
}
