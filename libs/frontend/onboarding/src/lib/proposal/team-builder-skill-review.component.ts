import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  ProjectGuidance,
  SkillRecommendation,
  SkillShEntry,
} from '@ptah-extension/shared';
import {
  NativeCardComponent,
  PtahButtonDirective,
  PtahCheckboxDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahStatePanelComponent,
} from '@ptah-extension/ui';

@Component({
  selector: 'ptah-team-builder-skill-review',
  standalone: true,
  imports: [
    FormsModule,
    NativeCardComponent,
    PtahButtonDirective,
    PtahCheckboxDirective,
    PtahFieldComponent,
    PtahInputDirective,
    PtahStatePanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team-builder-skill-review.component.html',
})
export class TeamBuilderSkillReviewComponent {
  readonly recommendations = input.required<SkillRecommendation[]>();
  readonly searchResults = input.required<SkillShEntry[]>();
  readonly guidanceFacts = input.required<ProjectGuidance[]>();
  readonly ownerDecisionPrompt = input('');
  readonly decisionRequired = input(false);
  readonly ownerDecision = input<'match' | 'raise' | null>(null);
  readonly ownerDecisionError = input(false);
  readonly guidanceNote = input('');
  readonly busy = input(false);
  readonly ownerDecisionChange = output<'match' | 'raise'>();
  readonly selectedIds = input.required<ReadonlySet<string>>();
  readonly loading = input(false);
  readonly searching = input(false);
  readonly error = input<string | null>(null);
  readonly searchError = input<string | null>(null);
  readonly selectionToggled = output<string>();
  readonly searchRequested = output<string>();
  readonly query = input.required<string>();
  readonly queryChange = output<string>();
  readonly continueRequested = output<void>();
  readonly skip = output<void>();
  readonly back = output<void>();
  readonly recommendationIds = computed(
    () => new Set(this.recommendations().map(({ skill }) => this.key(skill))),
  );
  key(skill: SkillShEntry): string {
    return `${skill.source}/${skill.skillId}`;
  }
  selected(skill: SkillShEntry): boolean {
    return this.selectedIds().has(this.key(skill));
  }
  label(value: ProjectGuidance['label']): string {
    return value === 'do_not_copy'
      ? 'Do not copy'
      : value === 'tolerate'
        ? 'Tolerate'
        : 'Follow';
  }
  submitSearch(event: Event): void {
    event.preventDefault();
    this.searchRequested.emit(this.query().trim());
  }
}
