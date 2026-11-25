import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { PtahButtonDirective } from '@ptah-extension/ui';

/** Verdict filter values owned by the skills step store (plan line 177). */
export type SkillVerdictFilterValue =
  | 'all'
  | 'install'
  | 'build'
  | 'no-skill'
  | 'not-judged';

/** One filter option with its item count (design-spec 3.6: the counting unit is the item). */
export interface SkillVerdictFilterOption {
  readonly value: SkillVerdictFilterValue;
  readonly count: number;
}

const FILTER_LABELS: Record<SkillVerdictFilterValue, string> = {
  all: 'All',
  install: 'Install',
  build: 'Build',
  'no-skill': 'No skill needed',
  'not-judged': 'Not judged',
};

interface FilterButtonView {
  readonly value: SkillVerdictFilterValue;
  readonly label: string;
  readonly countText: string;
}

/**
 * Verdict filter of the judged skills step. Presentational: the store owns the
 * active value; this component renders options with counts and the F28
 * "N more candidates - Show all" action for the parent to clear both filters.
 */
@Component({
  selector: 'ptah-skill-verdict-filter',
  standalone: true,
  imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="group"
      aria-label="Filter items by verdict"
      class="flex min-w-0 flex-wrap items-center gap-x-[var(--ptah-gap-controls)] gap-y-[var(--ptah-gap-label)]"
    >
      @for (option of buttons(); track option.value) {
        <button
          type="button"
          ptahButton
          variant="outline"
          size="xs"
          [selected]="active() === option.value"
          (click)="select(option.value)"
        >
          {{ option.label }} {{ option.countText }}
        </button>
      }
    </div>
    @if (hiddenCountText(); as hiddenText) {
      <button
        type="button"
        ptahButton
        variant="link"
        size="xs"
        class="mt-[var(--ptah-gap-label)]"
        (click)="showAllRequested.emit()"
      >
        {{ hiddenText }} - Show all
      </button>
    }
  `,
})
export class SkillVerdictFilterComponent {
  public readonly active = input.required<SkillVerdictFilterValue>();
  public readonly options = input.required<readonly SkillVerdictFilterOption[]>();
  /** Distinct hidden pool candidates under the active filter (F28), given by the parent. */
  public readonly hiddenCandidateCount = input(0);

  public readonly filterChange = output<SkillVerdictFilterValue>();
  public readonly showAllRequested = output<void>();

  protected readonly buttons = computed<readonly FilterButtonView[]>(() =>
    this.options().map((option) => ({
      value: option.value,
      label: FILTER_LABELS[option.value],
      countText:
        option.count === 1 ? '(1 item)' : `(${option.count} items)`,
    })),
  );

  /** F28 line text; rendered only when a filter hides candidates. */
  protected readonly hiddenCountText = computed<string | null>(() => {
    if (this.hiddenCandidateCount() <= 0) {
      return null;
    }
    const count = this.hiddenCandidateCount();
    return count === 1 ? '1 more candidate' : `${count} more candidates`;
  });

  protected select(value: SkillVerdictFilterValue): void {
    this.filterChange.emit(value);
  }
}
