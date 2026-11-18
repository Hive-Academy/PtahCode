import { Injectable, computed, signal } from '@angular/core';
import type {
  ProjectGuidance,
  SkillRecommendation,
  SkillShEntry,
  WizardSkillConsentPreview,
} from '@ptah-extension/shared';

export type StackSkillStage =
  'intent' | 'review' | 'consent' | 'installing' | 'launching';

@Injectable({ providedIn: 'root' })
export class StackSkillStore {
  private readonly intentState = signal('');
  public readonly intent = this.intentState.asReadonly();
  private readonly stageState = signal<StackSkillStage>('intent');
  public readonly stage = this.stageState.asReadonly();
  private readonly selectedIdsState = signal<ReadonlySet<string>>(new Set());
  public readonly selectedIds = this.selectedIdsState.asReadonly();
  private readonly previewingState = signal(false);
  public readonly previewing = this.previewingState.asReadonly();
  public setPreviewing(value: boolean): void {
    this.previewingState.set(value);
  }
  private readonly loadingState = signal(false);
  public readonly loading = this.loadingState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  public readonly error = this.errorState.asReadonly();
  private readonly recommendationsState = signal<SkillRecommendation[]>([]);
  public readonly recommendations = this.recommendationsState.asReadonly();
  private readonly searchResultsState = signal<SkillShEntry[]>([]);
  public readonly searchResults = this.searchResultsState.asReadonly();
  private readonly retainedSearchResultsState = signal<SkillShEntry[]>([]);
  public readonly retainedSearchResults =
    this.retainedSearchResultsState.asReadonly();
  private readonly searchQueryState = signal('');
  public readonly searchQuery = this.searchQueryState.asReadonly();
  private readonly searchingState = signal(false);
  public readonly searching = this.searchingState.asReadonly();
  private readonly searchErrorState = signal<string | null>(null);
  public readonly searchError = this.searchErrorState.asReadonly();
  private readonly guidanceFactsState = signal<ProjectGuidance[]>([]);
  public readonly guidanceFacts = this.guidanceFactsState.asReadonly();
  private readonly ownerDecisionPromptState = signal('');
  public readonly ownerDecisionPrompt =
    this.ownerDecisionPromptState.asReadonly();
  private readonly ownerDecisionState = signal<'match' | 'raise' | null>(null);
  public readonly ownerDecision = this.ownerDecisionState.asReadonly();
  private readonly guidanceNoteState = signal('');
  public readonly guidanceNote = this.guidanceNoteState.asReadonly();
  private readonly previewState = signal<WizardSkillConsentPreview[]>([]);
  public readonly preview = this.previewState.asReadonly();
  private readonly approvedIdsState = signal<ReadonlySet<string>>(new Set());
  public readonly approvedIds = this.approvedIdsState.asReadonly();
  private readonly installedState = signal<string[]>([]);
  public readonly installed = this.installedState.asReadonly();

  public readonly previewScriptCount = computed(() => {
    const previews = this.preview();
    const ids = this.selectedIds();
    if (
      !previews.length ||
      previews.length !== ids.size ||
      previews.some((item) => !ids.has(item.skillName))
    )
      return null;
    return previews.filter((item) => item.hasScripts).length;
  });

  public setIntent(value: string): void {
    this.intentState.set(value);
  }

  public setStage(value: StackSkillStage): void {
    this.stageState.set(value);
  }

  public setSelectedIds(value: ReadonlySet<string>): void {
    this.selectedIdsState.set(value);
  }

  public setLoading(value: boolean): void {
    this.loadingState.set(value);
  }

  public setError(value: string | null): void {
    this.errorState.set(value);
  }

  public setRecommendations(value: SkillRecommendation[]): void {
    this.recommendationsState.set(value);
  }

  public setSearchResults(value: SkillShEntry[]): void {
    const retained = [
      ...this.retainedSearchResults(),
      ...this.searchResults(),
    ].filter((skill) =>
      this.selectedIds().has(`${skill.source}/${skill.skillId}`),
    );
    this.retainedSearchResultsState.set([
      ...new Map(
        retained.map((skill) => [`${skill.source}/${skill.skillId}`, skill]),
      ).values(),
    ]);
    this.searchResultsState.set(value);
  }

  public setSearchQuery(value: string): void {
    this.searchQueryState.set(value);
  }

  public setSearching(value: boolean): void {
    this.searchingState.set(value);
  }

  public setSearchError(value: string | null): void {
    this.searchErrorState.set(value);
  }

  public setGuidanceFacts(value: ProjectGuidance[]): void {
    this.guidanceFactsState.set(value);
  }

  public setOwnerDecisionPrompt(value: string): void {
    this.ownerDecisionPromptState.set(value);
  }

  public setOwnerDecision(value: 'match' | 'raise' | null): void {
    this.ownerDecisionState.set(value);
  }

  public setGuidanceNote(value: string): void {
    this.guidanceNoteState.set(value);
  }

  public setPreview(value: WizardSkillConsentPreview[]): void {
    this.previewState.set(value);
  }

  public setApprovedIds(value: ReadonlySet<string>): void {
    this.approvedIdsState.set(value);
  }

  public setInstalled(value: string[]): void {
    this.installedState.set(value);
  }

  public reset(): void {
    this.setPreviewing(false);
    this.intentState.set('');
    this.stageState.set('intent');
    this.selectedIdsState.set(new Set());
    this.loadingState.set(false);
    this.errorState.set(null);
    this.recommendationsState.set([]);
    this.searchResultsState.set([]);
    this.retainedSearchResultsState.set([]);
    this.searchQueryState.set('');
    this.searchingState.set(false);
    this.searchErrorState.set(null);
    this.guidanceFactsState.set([]);
    this.ownerDecisionPromptState.set('');
    this.ownerDecisionState.set(null);
    this.guidanceNoteState.set('');
    this.previewState.set([]);
    this.approvedIdsState.set(new Set());
    this.installedState.set([]);
  }

  public toggle(id: string): void {
    this.previewState.set([]);
    this.approvedIdsState.set(new Set());
    this.selectedIdsState.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  public approve(id: string): void {
    this.approvedIdsState.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
}
