import { Injectable, signal } from '@angular/core';
import type {
  ProjectGuidance,
  SkillRecommendation,
  SkillShEntry,
  WizardSkillConsentPreview,
} from '@ptah-extension/shared';

export type TeamBuilderStage =
  'intent' | 'review' | 'consent' | 'installing' | 'launching';

@Injectable({ providedIn: 'root' })
export class TeamBuilderSkillStore {
  readonly intent = signal('');
  readonly stage = signal<TeamBuilderStage>('intent');
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly recommendations = signal<SkillRecommendation[]>([]);
  readonly searchResults = signal<SkillShEntry[]>([]);
  readonly searchQuery = signal('');
  readonly searching = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly guidanceFacts = signal<ProjectGuidance[]>([]);
  readonly ownerDecisionPrompt = signal('');
  readonly ownerDecision = signal<'match' | 'raise' | null>(null);
  readonly guidanceNote = signal('');
  readonly preview = signal<WizardSkillConsentPreview[]>([]);
  readonly approvedIds = signal<ReadonlySet<string>>(new Set());
  readonly installed = signal<string[]>([]);

  reset(): void {
    this.intent.set('');
    this.stage.set('intent');
    this.selectedIds.set(new Set());
    this.loading.set(false);
    this.error.set(null);
    this.recommendations.set([]);
    this.searchResults.set([]);
    this.searchQuery.set('');
    this.searching.set(false);
    this.searchError.set(null);
    this.guidanceFacts.set([]);
    this.ownerDecisionPrompt.set('');
    this.ownerDecision.set(null);
    this.guidanceNote.set('');
    this.preview.set([]);
    this.approvedIds.set(new Set());
    this.installed.set([]);
  }

  toggle(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  approve(id: string): void {
    this.approvedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
}
