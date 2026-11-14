import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { PhaseScorecard } from '@ptah-extension/shared';

interface PhaseRow {
  key: string;
  phaseKind: string;
  legacy: boolean;
  legacyLabel: string;
  graded: number;
  passed: number;
  rate: string;
}

/**
 * PhaseScorecardsComponent — compact list of phase scorecards.
 *
 * Phase rows and legacy role-alias rows are separate entries; the two are
 * never added into one total. A `null` rate renders "No grade", never 0%.
 * Presentational only: `input()` signal and OnPush.
 */
@Component({
  selector: 'ptah-phase-scorecards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length > 0) {
      <section class="mb-3 text-xs" data-testid="phase-scorecards">
        <h3 class="mb-1 font-medium">Phase scorecards</h3>
        <ul class="flex flex-col gap-1">
          @for (row of rows(); track row.key) {
            <li
              class="flex flex-wrap items-center gap-x-3 tabular-nums"
              data-testid="phase-scorecard-row"
            >
              <span class="font-medium">{{ row.phaseKind }}</span>
              @if (row.legacy) {
                <span
                  class="text-base-content-muted"
                  data-testid="phase-scorecard-legacy"
                  >{{ row.legacyLabel }}</span
                >
              }
              <span class="text-base-content-muted"
                >graded {{ row.graded }}</span
              >
              <span class="text-base-content-muted"
                >passed {{ row.passed }}</span
              >
              <span data-testid="phase-scorecard-rate">{{ row.rate }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class PhaseScorecardsComponent {
  public readonly scorecards = input<readonly PhaseScorecard[]>([]);

  protected readonly rows = computed<PhaseRow[]>(() =>
    this.scorecards().map((card) => ({
      key: `${card.phaseKind}:${card.source}`,
      phaseKind: card.phaseKind,
      legacy: card.legacy,
      legacyLabel: `legacy (role alias: ${card.aliasedRoles.join(', ')})`,
      graded: card.gradedCount,
      passed: card.passedCount,
      rate:
        card.gradedSuccessRate === null
          ? 'No grade'
          : `${Math.round(card.gradedSuccessRate * 100)}%`,
    })),
  );
}
