import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import type {
  ProjectGuidance,
  SkillRecommendation,
  SkillShEntry,
  StackSummaryItem,
} from '@ptah-extension/shared';
import {
  PtahAlertComponent,
  PtahBadgeDirective,
  PtahSkeletonComponent,
  PtahButtonDirective,
  PtahCheckboxDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahStatePanelComponent,
} from '@ptah-extension/ui';

import { SkillPickCardComponent } from './skill-pick-card.component';
import { StackCoverageStripComponent } from './stack-coverage-strip.component';
import { SkillSelectionRailComponent } from './skill-selection-rail.component';
import { UnmatchedStackListComponent } from './unmatched-stack-list.component';
import { buildStackCoverage, splitStackEvidence } from './stack-coverage';

@Component({
  selector: 'ptah-stack-skill-review',
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    SkillPickCardComponent,
    StackCoverageStripComponent,
    SkillSelectionRailComponent,
    UnmatchedStackListComponent,
    PtahAlertComponent,
    PtahBadgeDirective,
    PtahSkeletonComponent,
    PtahButtonDirective,
    PtahCheckboxDirective,
    PtahFieldComponent,
    PtahInputDirective,
    PtahStatePanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stack-skill-review.component.html',
  styleUrl: './stack-skill-review.component.css',
})
export class StackSkillReviewComponent {
  public readonly recommendations = input.required<SkillRecommendation[]>();
  public readonly searchResults = input.required<SkillShEntry[]>();
  public readonly guidanceFacts = input.required<ProjectGuidance[]>();
  public readonly ownerDecisionPrompt = input('');
  public readonly decisionRequired = input(false);
  public readonly ownerDecision = input<'match' | 'raise' | null>(null);
  public readonly ownerDecisionError = input(false);
  public readonly guidanceNote = input('');
  public readonly busy = input(false);
  public readonly showOwnerDecision = input(true);
  public readonly ownerDecisionChange = output<'match' | 'raise'>();
  public readonly selectedIds = input.required<ReadonlySet<string>>();
  public readonly loading = input(false);
  public readonly searching = input(false);
  public readonly error = input<string | null>(null);
  public readonly loadError = input(false);
  public readonly backOnLoadError = input(false);
  public readonly searchError = input<string | null>(null);
  public readonly selectionToggled = output<string>();
  public readonly searchRequested = output<string>();
  public readonly searchCleared = output<void>();
  public readonly query = input.required<string>();
  public readonly queryChange = output<string>();
  public readonly continueRequested = output<void>();
  public readonly skip = output<void>();
  public readonly back = output<void>();
  public readonly recommendationIds = computed(
    () => new Set(this.recommendations().map(({ skill }) => this.key(skill))),
  );
  public readonly stackLoading = input(false);
  public readonly detectedItems = input<StackSummaryItem[]>([]);
  public readonly unmatchedItems = input<StackSummaryItem[]>([]);
  public readonly searchFailures = input<{ item: string; reason: string }[]>(
    [],
  );
  public readonly summarySource = input<
    'structured' | 'legacy' | 'none' | null
  >(null);
  public readonly warning = input<string | null>(null);
  public readonly selectionReset = input(false);
  public readonly selectionResetDismissed = output<void>();
  public readonly previewing = input(false);
  public readonly previewScriptCount = input<number | null>(null);
  public readonly headingLevel = input<1 | 2>(2);
  public readonly retryRequested = output<void>();
  private readonly activeItemState = signal<string | null>(null);
  protected readonly activeItem = computed(() =>
    this.detectedItems().some(
      (item) => item.kind + ':' + item.name === this.activeItemState(),
    )
      ? this.activeItemState()
      : null,
  );
  protected readonly activeItemName = computed(
    () =>
      this.detectedItems().find(
        (item) => item.kind + ':' + item.name === this.activeItem(),
      )?.name ?? null,
  );
  private readonly submittedQueryState = signal('');
  protected readonly submittedQuery = this.submittedQueryState.asReadonly();
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly skeletons = [1, 2, 3, 4, 5, 6];
  protected readonly blocked = computed(
    () => this.busy() || this.previewing() || this.loading(),
  );
  protected readonly initialLoading = computed(
    () => this.loading() && !this.recommendations().length,
  );
  protected readonly coverage = computed(() =>
    buildStackCoverage(
      this.detectedItems(),
      this.unmatchedItems(),
      this.searchFailures(),
      this.recommendations(),
      this.selectedIds(),
    ),
  );
  protected readonly coveredCount = computed(
    () => this.coverage().filter((item) => item.selectedCount > 0).length,
  );
  protected readonly filteredRecommendations = computed(() =>
    [...this.recommendations()]
      .sort((a, b) => b.score - a.score)
      .filter(
        (row) =>
          !this.activeItem() ||
          this.evidence(row.evidence).coveredItems.includes(
            this.activeItemName() ?? '',
          ),
      ),
  );
  protected readonly otherResults = computed(() =>
    this.searchResults().filter(
      (skill) => !this.recommendationIds().has(this.key(skill)),
    ),
  );
  protected readonly selectedSkills = computed(() => {
    const skills = new Map(
      [
        ...this.recommendations().map((row) => row.skill),
        ...this.searchResults(),
      ].map((skill) => [this.key(skill), skill]),
    );
    return [...this.selectedIds()].map((key) => ({
      key,
      name: skills.get(key)?.name ?? key,
    }));
  });
  protected readonly totalSkills = computed(
    () =>
      new Set([
        ...this.recommendations().map((row) => this.key(row.skill)),
        ...this.searchResults().map((skill) => this.key(skill)),
        ...this.selectedIds(),
      ]).size,
  );
  protected evidence(value: string): {
    coveredItems: string[];
    rawEvidence: string | null;
  } {
    return splitStackEvidence(value, this.detectedItems());
  }
  protected setFilter(name: string | null): void {
    this.activeItemState.set(name);
  }
  protected focusSearch(): void {
    this.searchInput()?.nativeElement.focus();
  }
  protected searchItem(name: string): void {
    this.queryChange.emit(name);
    this.submittedQueryState.set(name);
    this.searchRequested.emit(name);
  }
  public key(skill: SkillShEntry): string {
    return `${skill.source}/${skill.skillId}`;
  }
  public selected(skill: SkillShEntry): boolean {
    return this.selectedIds().has(this.key(skill));
  }
  public label(value: ProjectGuidance['label']): string {
    return value === 'do_not_copy'
      ? 'Do not copy'
      : value === 'tolerate'
        ? 'Tolerate'
        : 'Follow';
  }
  protected clearSearch(): void {
    this.submittedQueryState.set('');
    this.queryChange.emit('');
    this.searchCleared.emit();
    this.focusSearch();
  }
  public submitSearch(event: Event): void {
    event.preventDefault();
    this.submittedQueryState.set(this.query().trim());
    this.searchRequested.emit(this.query().trim());
  }
}
