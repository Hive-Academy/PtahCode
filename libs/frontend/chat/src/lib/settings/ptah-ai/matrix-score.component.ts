import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PtahTableScoreComponent } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-matrix-score',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahTableScoreComponent],
  template: `
    @if (score() !== null) {
      <span class="flex items-center gap-[var(--ptah-gap-label)]">
        <ptah-table-score
          class="min-w-12 flex-1"
          [label]="label()"
          [score]="score()"
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
