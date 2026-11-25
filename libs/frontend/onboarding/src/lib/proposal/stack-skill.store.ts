import { Injectable, computed, signal } from '@angular/core';
import {
  skillDocumentSlug,
  validateSkillDocument,
  type ModelPair,
  type ProjectGuidance,
  type SkillBuildProposal,
  type SkillJudgeCandidate,
  type SkillJudgeOutcome,
  type SkillJudgeResult,
  type SkillRecommendation,
  type SkillShEntry,
  type StackSummaryItem,
  type WizardGenerateSkillDraftResult,
  type WizardRecommendAnalysisSkillsResult,
  type WizardSkillConsentPreview,
} from '@ptah-extension/shared';
import {
  buildJudgeItemRows,
  buildJudgedStackCoverage,
  buildManualDraftEvidenceBody,
  buildProposalFallbackEvidenceBody,
  canonicalCandidateId,
  cloneSkillJudgeResult,
  computeHiddenPoolCandidateCount,
  computeJudgeResidualCandidates,
  freezeModelPair,
  itemMatchesVerdictFilter,
  skillSelectionKey,
  type DraftReplaceTrigger,
  type DraftTransitionResult,
  type JudgeItemCandidateView,
  type JudgeItemRowView,
  type OpenSkillDraft,
  type RecommendationApplyResult,
  type ResidualCandidateView,
  type SkillDraftGenerationError,
  type SkillDraftKind,
  type SkillDraftSubmittedSnapshot,
  type SkillVerdictCounts,
  type StackCoverageItem,
} from './stack-coverage';
import type {
  SkillVerdictFilterOption,
  SkillVerdictFilterValue,
} from './skill-verdict-filter.component';
import { normalizeSkillDraft, type SkillDraftMode } from './skill-draft-preview.component';

export {
  buildManualDraftEvidenceBody,
  buildProposalFallbackEvidenceBody,
};
export type {
  DraftReplaceTrigger,
  DraftTransitionResult,
  JudgeItemCandidateView,
  JudgeItemRowView,
  OpenSkillDraft,
  RecommendationApplyResult,
  ResidualCandidateView,
  SkillDraftGenerationError,
  SkillDraftKind,
  SkillDraftMode,
  SkillDraftSubmittedSnapshot,
  SkillVerdictCounts,
  SkillVerdictFilterOption,
  SkillVerdictFilterValue,
};

export type StackSkillStage =
  | 'intent'
  | 'review'
  | 'consent'
  | 'installing'
  | 'launching';

/** Alias kept for store consumers; canonical type is SkillVerdictFilterValue. */
export type SkillVerdictFilter = SkillVerdictFilterValue;

export const INSTALL_BLOCKED_BY_DRAFT_REASON =
  'Finish or cancel the open skill draft before installing';

export const DRAFT_BLOCKED_BY_CONSENT_REASON =
  'Close the install consent dialog before opening a skill draft';

@Injectable({ providedIn: 'root' })
export class StackSkillStore {
  private readonly intentState = signal('');
  public readonly intent = this.intentState.asReadonly();
  private readonly stageState = signal<StackSkillStage>('intent');
  public readonly stage = this.stageState.asReadonly();
  private readonly selectedCandidateIdsState = signal<ReadonlySet<string>>(
    new Set(),
  );
  public readonly selectedCandidateIds =
    this.selectedCandidateIdsState.asReadonly();
  private readonly customSelectionKeysState = signal<
    ReadonlyMap<string, string>
  >(new Map());
  private readonly previewingState = signal(false);
  public readonly previewing = this.previewingState.asReadonly();
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

  // --- Judged state (immutable analysisPair & judge, filters, drafts, C5 slugs) ---
  private readonly analysisPairState = signal<Readonly<ModelPair> | null>(null);
  public readonly analysisPair = this.analysisPairState.asReadonly();
  private readonly judgeState = signal<SkillJudgeResult | null>(null);
  public readonly judge = this.judgeState.asReadonly();
  public readonly judgedMode = computed(() => this.judge() !== null);
  private readonly verdictFilterState = signal<SkillVerdictFilterValue>('all');
  public readonly verdictFilter = this.verdictFilterState.asReadonly();
  private readonly activeItemIdState = signal<string | null>(null);
  public readonly activeItemId = this.activeItemIdState.asReadonly();
  private readonly itemSearchResultsState = signal<
    ReadonlyMap<string, readonly SkillShEntry[]>
  >(new Map());
  public readonly itemSearchResultsByItemId =
    this.itemSearchResultsState.asReadonly();
  private readonly retainedItemSearchResultsState = signal<
    ReadonlyMap<string, readonly SkillShEntry[]>
  >(new Map());
  public readonly retainedItemSearchResultsByItemId =
    this.retainedItemSearchResultsState.asReadonly();
  private readonly openDraftState = signal<OpenSkillDraft | null>(null);
  public readonly openDraft = this.openDraftState.asReadonly();
  private readonly createdPathsByKeyState = signal<ReadonlyMap<string, string>>(
    new Map(),
  );
  public readonly createdPathsByKey = this.createdPathsByKeyState.asReadonly();
  /** C5 (D35): slugs created by Create in this run. */
  private readonly createdSkillSlugsState = signal<readonly string[]>([]);
  public readonly createdSkillSlugs = this.createdSkillSlugsState.asReadonly();

  private draftRevision = 0;
  private previewRequestSeq = 0;

  // --- Identity & consent boundary ---
  public readonly candidateById = computed<
    ReadonlyMap<string, SkillJudgeCandidate>
  >(() => {
    const judge = this.judge();
    return judge
      ? new Map(
          judge.candidates.map((c) => [canonicalCandidateId(c.candidateId), c]),
        )
      : new Map();
  });

  public readonly selectionKeyByCandidateId = computed<
    ReadonlyMap<string, string>
  >(() => {
    const map = new Map<string, string>(this.customSelectionKeysState());
    for (const rec of this.recommendations()) {
      map.set(canonicalCandidateId(rec.skill), skillSelectionKey(rec.skill));
    }
    for (const skill of [
      ...this.retainedSearchResults(),
      ...this.searchResults(),
    ]) {
      map.set(canonicalCandidateId(skill), skillSelectionKey(skill));
    }
    for (const list of [
      ...this.retainedItemSearchResultsByItemId().values(),
      ...this.itemSearchResultsByItemId().values(),
    ]) {
      for (const skill of list) {
        map.set(canonicalCandidateId(skill), skillSelectionKey(skill));
      }
    }
    for (const c of this.judge()?.candidates ?? []) {
      map.set(canonicalCandidateId(c.candidateId), c.selectionKey);
    }
    return map;
  });

  /** Consent-boundary selection keys (`source/skillId`), preserving team-builder compatibility. */
  public readonly selectedIds = computed<ReadonlySet<string>>(() => {
    const keyMap = this.selectionKeyByCandidateId();
    return new Set(
      [...this.selectedCandidateIds()].map((cid) => keyMap.get(cid) ?? cid),
    );
  });
  public readonly selectedSelectionKeys = computed<readonly string[]>(() => [
    ...this.selectedIds(),
  ]);
  public readonly previewScriptCount = computed(() => {
    const previews = this.preview();
    const ids = this.selectedIds();
    if (
      !previews.length ||
      previews.length !== ids.size ||
      previews.some((item) => !ids.has(item.skillName))
    ) {
      return null;
    }
    return previews.filter((item) => item.hasScripts).length;
  });

  // --- F29 / R17 mutual exclusion ---
  public readonly draftOpen = computed(() => this.openDraft() !== null);
  public readonly consentOpen = computed(
    () => this.stage() === 'consent' || this.stage() === 'installing',
  );
  public readonly canOpenConsent = computed(() => !this.draftOpen());
  public readonly canOpenDraft = computed(
    () => !this.consentOpen() && !this.previewing(),
  );
  public readonly installBlockedReason = computed<string | null>(() =>
    this.draftOpen() ? INSTALL_BLOCKED_BY_DRAFT_REASON : null,
  );
  public readonly draftBlockedReason = computed<string | null>(() =>
    this.consentOpen() || this.previewing()
      ? DRAFT_BLOCKED_BY_CONSENT_REASON
      : null,
  );

  // --- R19 unified coverage ---
  public readonly manualCandidateIdsByItemId = computed<
    ReadonlyMap<string, ReadonlySet<string>>
  >(() => {
    const map = new Map<string, Set<string>>();
    const add = (id: string, list: readonly SkillShEntry[]): void => {
      const bucket = map.get(id) ?? new Set<string>();
      for (const s of list) bucket.add(canonicalCandidateId(s));
      map.set(id, bucket);
    };
    for (const [id, list] of this.retainedItemSearchResultsByItemId()) {
      add(id, list);
    }
    for (const [id, list] of this.itemSearchResultsByItemId()) add(id, list);
    return map;
  });

  public readonly selectedCandidateIdsByItemId = computed<
    ReadonlyMap<string, ReadonlySet<string>>
  >(() => {
    const judge = this.judge();
    if (!judge) return new Map();
    const selected = this.selectedCandidateIds();
    const manualByItem = this.manualCandidateIdsByItemId();
    const result = new Map<string, ReadonlySet<string>>();
    for (const judgeItem of judge.items) {
      const covered = new Set<string>();
      for (const o of judgeItem.outcomes) {
        if (o.verdict === 'install') {
          const cid = canonicalCandidateId(o.candidateId);
          if (selected.has(cid)) covered.add(cid);
        }
      }
      for (const rawId of judgeItem.candidateIds) {
        const cid = canonicalCandidateId(rawId);
        if (selected.has(cid)) covered.add(cid);
      }
      for (const cid of manualByItem.get(judgeItem.itemId) ?? []) {
        if (selected.has(cid)) covered.add(cid);
      }
      result.set(judgeItem.itemId, covered);
    }
    return result;
  });

  public readonly stackCoverage = computed<readonly StackCoverageItem[]>(() => {
    const judge = this.judge();
    return judge
      ? buildJudgedStackCoverage(
          judge,
          this.selectedCandidateIdsByItemId(),
          this.manualCandidateIdsByItemId(),
        )
      : [];
  });
  public readonly coveredItemCount = computed(
    () => this.stackCoverage().filter((item) => item.state === 'covered').length,
  );

  // --- R16 item rows, verdict counts, residual pool & F28 hidden count ---
  public readonly verdictCounts = computed<SkillVerdictCounts>(() => {
    const judge = this.judge();
    if (!judge) {
      return {
        all: 0,
        install: 0,
        build: 0,
        buildProposals: 0,
        noSkill: 0,
        notJudged: 0,
      };
    }
    let install = 0;
    let build = 0;
    let noSkill = 0;
    let notJudged = 0;
    for (const item of judge.items) {
      const hasInstall = item.outcomes.some((o) => o.verdict === 'install');
      const hasBuild = item.outcomes.some((o) => o.verdict === 'build');
      const isNotJudged =
        item.judgedBy === 'none' || item.outcomes.length === 0;
      if (hasInstall) install++;
      if (hasBuild) build++;
      if (isNotJudged) notJudged++;
      else if (
        !hasInstall &&
        !hasBuild &&
        item.outcomes.some((o) => o.verdict === 'no-skill')
      ) {
        noSkill++;
      }
    }
    return {
      all: judge.items.length,
      install,
      build,
      buildProposals: judge.proposals.length,
      noSkill,
      notJudged,
    };
  });

  public readonly verdictFilterOptions = computed<
    readonly SkillVerdictFilterOption[]
  >(() => {
    const c = this.verdictCounts();
    return [
      { value: 'all', count: c.all },
      ...(c.install > 0 ? [{ value: 'install' as const, count: c.install }] : []),
      ...(c.build > 0 ? [{ value: 'build' as const, count: c.build }] : []),
      ...(c.noSkill > 0 ? [{ value: 'no-skill' as const, count: c.noSkill }] : []),
      ...(c.notJudged > 0 ? [{ value: 'not-judged' as const, count: c.notJudged }] : []),
    ];
  });

  public readonly pinnedDraftProposalId = computed<string | null>(
    () => this.openDraft()?.proposalId ?? null,
  );
  public readonly pinnedDraftItemId = computed<string | null>(
    () => this.openDraft()?.itemId ?? null,
  );

  public readonly itemRows = computed<readonly JudgeItemRowView[]>(() => {
    const judge = this.judge();
    return judge
      ? buildJudgeItemRows(
          judge,
          this.candidateById(),
          this.selectedCandidateIdsByItemId(),
          this.itemSearchResultsByItemId(),
          this.retainedItemSearchResultsByItemId(),
          this.openDraft(),
        )
      : [];
  });

  public readonly visibleItemRows = computed<readonly JudgeItemRowView[]>(() => {
    const judge = this.judge();
    if (!judge) return [];
    const filter = this.verdictFilter();
    const activeItemId = this.activeItemId();
    const itemById = new Map(judge.items.map((item) => [item.itemId, item]));
    return this.itemRows().filter((row) => {
      if (row.pinned) return true;
      if (activeItemId && row.itemId !== activeItemId) return false;
      const source = itemById.get(row.itemId);
      return source ? itemMatchesVerdictFilter(source, filter) : false;
    });
  });

  public readonly visibleProposals = computed<readonly SkillBuildProposal[]>(
    () => {
      const judge = this.judge();
      if (!judge) return [];
      const filter = this.verdictFilter();
      const activeItemId = this.activeItemId();
      const pinnedProposalId = this.pinnedDraftProposalId();
      return judge.proposals.filter(
        (p) =>
          pinnedProposalId === p.proposalId ||
          ((filter === 'all' || filter === 'build') &&
            (!activeItemId || p.itemIds.includes(activeItemId))),
      );
    },
  );

  public readonly displayedCandidateIdsInVerdictOrItemRows = computed<
    ReadonlySet<string>
  >(() => {
    const judge = this.judge();
    if (!judge) return new Set();
    // Deduplicate selectable cards globally. Each item row retains its own assessments.
    const shown = new Set<string>();
    for (const item of judge.items) {
      if (
        judge.method === 'none' ||
        item.judgedBy === 'none' ||
        item.outcomes.length === 0
      ) {
        for (const cid of item.candidateIds) shown.add(canonicalCandidateId(cid));
      } else {
        for (const o of item.outcomes) {
          if (o.verdict === 'install') shown.add(canonicalCandidateId(o.candidateId));
        }
      }
    }
    return shown;
  });

  public readonly residualCandidates = computed<
    readonly ResidualCandidateView[]
  >(() =>
    this.computeResidualCandidates(
      this.displayedCandidateIdsInVerdictOrItemRows(),
    ),
  );
  public readonly showOtherCandidatesSection = computed(() => {
    const judge = this.judge();
    return (
      judge !== null &&
      judge.method !== 'none' &&
      this.verdictFilter() === 'all' &&
      this.residualCandidates().length > 0
    );
  });
  public readonly hiddenPoolCandidateCount = computed(() => {
    const judge = this.judge();
    return judge
      ? computeHiddenPoolCandidateCount(
          judge,
          this.verdictFilter(),
          this.activeItemId(),
          this.visibleItemRows(),
          this.showOtherCandidatesSection() ? this.residualCandidates() : [],
        )
      : 0;
  });

  public computeResidualCandidates(
    displayedCandidateIds: ReadonlySet<string>,
  ): readonly ResidualCandidateView[] {
    const judge = this.judge();
    return judge
      ? computeJudgeResidualCandidates(judge, displayedCandidateIds)
      : [];
  }

  // --- State setters ---
  public setPreviewing(value: boolean): void {
    if (value && this.draftOpen()) return;
    this.previewingState.set(value);
  }
  public setIntent(value: string): void { this.intentState.set(value); }
  public setStage(value: StackSkillStage): void {
    if (value === 'consent' && this.draftOpen()) return;
    this.stageState.set(value);
  }
  public setSelectedIds(value: ReadonlySet<string>): void {
    const nextCustom = new Map(this.customSelectionKeysState());
    const nextCanonical = new Set<string>();
    for (const raw of value) {
      const cid = canonicalCandidateId(raw);
      nextCanonical.add(cid);
      nextCustom.set(cid, raw);
    }
    this.customSelectionKeysState.set(nextCustom);
    this.selectedCandidateIdsState.set(nextCanonical);
  }
  public setSelectedCandidateIds(value: ReadonlySet<string>): void {
    this.selectedCandidateIdsState.set(
      new Set([...value].map((raw) => canonicalCandidateId(raw))),
    );
  }
  public isCandidateSelected(
    keyOrSkill: string | Pick<SkillShEntry, 'source' | 'skillId'>,
  ): boolean {
    return this.selectedCandidateIds().has(canonicalCandidateId(keyOrSkill));
  }
  public setLoading(value: boolean): void { this.loadingState.set(value); }
  public setError(value: string | null): void { this.errorState.set(value); }
  public setRecommendations(value: SkillRecommendation[]): void {
    this.recommendationsState.set([...value]);
  }
  public setSearchResults(value: SkillShEntry[]): void {
    const selected = this.selectedCandidateIds();
    const retained = [
      ...this.retainedSearchResults(),
      ...this.searchResults(),
    ].filter((skill) => selected.has(canonicalCandidateId(skill)));
    this.retainedSearchResultsState.set([
      ...new Map(
        retained.map((skill) => [canonicalCandidateId(skill), skill]),
      ).values(),
    ]);
    this.searchResultsState.set([...value]);
  }
  public setItemSearchResults(
    itemId: string,
    value: readonly SkillShEntry[],
  ): void {
    const selected = this.selectedCandidateIds();
    const deduped = [
      ...new Map(
        [
          ...(this.retainedItemSearchResultsState().get(itemId) ?? []),
          ...(this.itemSearchResultsState().get(itemId) ?? []),
        ]
          .filter((skill) => selected.has(canonicalCandidateId(skill)))
          .map((skill) => [canonicalCandidateId(skill), skill]),
      ).values(),
    ];
    const nextRetained = new Map(this.retainedItemSearchResultsState());
    if (deduped.length > 0) nextRetained.set(itemId, deduped);
    else nextRetained.delete(itemId);
    this.retainedItemSearchResultsState.set(nextRetained);
    const nextResults = new Map(this.itemSearchResultsState());
    nextResults.set(itemId, [...value]);
    this.itemSearchResultsState.set(nextResults);
  }
  public clearItemSearchResults(itemId?: string): void {
    if (itemId === undefined) {
      this.itemSearchResultsState.set(new Map());
      return;
    }
    const next = new Map(this.itemSearchResultsState());
    next.delete(itemId);
    this.itemSearchResultsState.set(next);
  }
  public setSearchQuery(value: string): void { this.searchQueryState.set(value); }
  public setSearching(value: boolean): void { this.searchingState.set(value); }
  public setSearchError(value: string | null): void { this.searchErrorState.set(value); }
  public setGuidanceFacts(value: ProjectGuidance[]): void { this.guidanceFactsState.set([...value]); }
  public setOwnerDecisionPrompt(value: string): void { this.ownerDecisionPromptState.set(value); }
  public setOwnerDecision(value: 'match' | 'raise' | null): void { this.ownerDecisionState.set(value); }
  public setGuidanceNote(value: string): void { this.guidanceNoteState.set(value); }
  public setPreview(value: WizardSkillConsentPreview[]): void { this.previewState.set([...value]); }
  public setApprovedIds(value: ReadonlySet<string>): void { this.approvedIdsState.set(new Set(value)); }
  public setInstalled(value: string[]): void { this.installedState.set([...value]); }
  public setAnalysisPair(pair: ModelPair | null): void { this.analysisPairState.set(freezeModelPair(pair)); }
  public setJudge(judge: SkillJudgeResult | null): void {
    this.judgeState.set(judge ? cloneSkillJudgeResult(judge) : null);
  }

  public applyRecommendationResult(
    result: WizardRecommendAnalysisSkillsResult,
    options?: { discardDirtyDraft?: boolean },
  ): RecommendationApplyResult {
    const openDraft = this.openDraftState();
    if (openDraft?.busy || openDraft?.previewLoading) {
      return { status: 'busy' };
    }
    if (openDraft?.dirty && options?.discardDirtyDraft !== true) {
      return { status: 'confirm-dirty' };
    }

    if (this.analysisPairState() === null && result.analysisPair) {
      this.analysisPairState.set(freezeModelPair(result.analysisPair));
    }
    const clonedJudge = cloneSkillJudgeResult(result.judge);
    this.judgeState.set(clonedJudge);
    this.recommendationsState.set([...result.skills]);
    const candidateById = new Map(
      clonedJudge.candidates.map((c) => [canonicalCandidateId(c.candidateId), c]),
    );
    const preselected = new Set<string>();
    if (clonedJudge.method !== 'none') {
      for (const item of clonedJudge.items) {
        for (const outcome of item.outcomes) {
          if (outcome.verdict !== 'install') continue;
          const cid = canonicalCandidateId(outcome.candidateId);
          const candidate = candidateById.get(cid);
          if (candidate && !candidate.deprecated) preselected.add(cid);
        }
      }
    }
    this.selectedCandidateIdsState.set(preselected);
    this.itemSearchResultsState.set(new Map());
    this.retainedItemSearchResultsState.set(new Map());
    this.retainedSearchResultsState.set([]);
    this.customSelectionKeysState.set(new Map());
    this.previewState.set([]);
    this.approvedIdsState.set(new Set());
    if (this.stageState() === 'consent') this.stageState.set('review');
    this.resetFilters();
    if (openDraft) {
      this.draftRevision++;
      this.previewRequestSeq++;
      this.openDraftState.set(null);
    }
    return { status: 'ok' };
  }

  public setVerdictFilter(filter: SkillVerdictFilterValue): void { this.verdictFilterState.set(filter); }
  public setActiveItemId(itemId: string | null): void { this.activeItemIdState.set(itemId); }
  public resetVerdictFilter(): void { this.verdictFilterState.set('all'); }
  public resetFilters(): void {
    this.verdictFilterState.set('all');
    this.activeItemIdState.set(null);
  }

  public openConsent(previews: readonly WizardSkillConsentPreview[]): boolean {
    if (!this.canOpenConsent()) return false;
    this.previewState.set([...previews]);
    this.approvedIdsState.set(new Set());
    this.stageState.set('consent');
    return true;
  }
  public closeConsent(): void {
    if (this.stageState() === 'consent') this.stageState.set('review');
  }

  public toggle(id: string): void {
    const cid = canonicalCandidateId(id);
    if (!this.selectionKeyByCandidateId().has(cid)) {
      const nextCustom = new Map(this.customSelectionKeysState());
      nextCustom.set(cid, id);
      this.customSelectionKeysState.set(nextCustom);
    }
    this.toggleCandidate(cid);
  }
  public toggleCandidate(candidateId: string): void {
    const cid = canonicalCandidateId(candidateId);
    this.previewState.set([]);
    this.approvedIdsState.set(new Set());
    if (this.stageState() === 'consent') this.stageState.set('review');
    this.selectedCandidateIdsState.update((current) => {
      const next = new Set(current);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
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

  // --- Draft lifecycle (TD 3.8, R18, R23, F25, F29, F30, C5) ---
  public createdPathFor(key: string): string | null {
    return this.createdPathsByKeyState().get(key) ?? null;
  }
  public recordCreatedSkillSlug(slugOrName: string): void {
    const normalized = skillDocumentSlug(slugOrName);
    if (!normalized) return;
    this.createdSkillSlugsState.update((current) =>
      current.includes(normalized) ? current : [...current, normalized],
    );
  }

  private checkDraftGuard(
    trigger: DraftReplaceTrigger,
    forceDiscardDirty: boolean,
  ):
    | { readonly status: 'busy' }
    | { readonly status: 'confirm-dirty'; readonly trigger: DraftReplaceTrigger }
    | null {
    const current = this.openDraftState();
    if (!current) return null;
    if (current.busy) return { status: 'busy' };
    return current.dirty && !forceDiscardDirty
      ? { status: 'confirm-dirty', trigger }
      : null;
  }

  private closeDraftWithTrigger(
    trigger: DraftReplaceTrigger,
    forceDiscardDirty: boolean,
  ): DraftTransitionResult {
    if (!this.openDraftState()) return { status: 'closed' };
    const guard = this.checkDraftGuard(trigger, forceDiscardDirty);
    if (guard) return guard;
    this.draftRevision++;
    this.previewRequestSeq++;
    this.openDraftState.set(null);
    return { status: 'closed' };
  }

  public openProposalDraft(
    proposalId: string,
    options?: { readonly forceDiscardDirty?: boolean },
  ): DraftTransitionResult {
    if (!this.canOpenDraft()) {
      return { status: 'blocked', reason: DRAFT_BLOCKED_BY_CONSENT_REASON };
    }
    const key = `proposal:${proposalId}`;
    const existingPath = this.createdPathsByKeyState().get(key);
    if (existingPath) return { status: 'already-created', path: existingPath };
    const guard = this.checkDraftGuard(
      'preview-draft',
      Boolean(options?.forceDiscardDirty),
    );
    if (guard) return guard;
    const proposal = this.judge()?.proposals.find(
      (p) => p.proposalId === proposalId,
    );
    if (!proposal) return { status: 'blocked', reason: 'Build proposal not found.' };
    const draft: OpenSkillDraft = {
      key,
      kind: 'proposal',
      itemId: proposal.itemIds[0] ?? null,
      proposalId: proposal.proposalId,
      coveredItemIds: [...proposal.itemIds],
      mode: 'preview',
      name: skillDocumentSlug(proposal.name) || proposal.name,
      description: proposal.description,
      body: '',
      dirty: false,
      busy: false,
      previewLoading: true,
      revision: ++this.draftRevision,
      previewRequestSeq: ++this.previewRequestSeq,
      submitted: null,
      generationError: null,
      createError: null,
      pairUsed: null,
    };
    this.openDraftState.set(draft);
    return { status: 'ok', draft };
  }

  public openManualDraft(
    itemId: string,
    options?: {
      readonly item?: StackSummaryItem;
      readonly forceDiscardDirty?: boolean;
    },
  ): DraftTransitionResult {
    return this.openManualDraftFor(itemId, options);
  }

  public openBlankManualDraft(options?: {
    readonly forceDiscardDirty?: boolean;
  }): DraftTransitionResult {
    return this.openManualDraftFor(null, options);
  }

  private openManualDraftFor(
    itemId: string | null,
    options?: {
      readonly item?: StackSummaryItem;
      readonly forceDiscardDirty?: boolean;
    },
  ): DraftTransitionResult {
    if (!this.canOpenDraft()) {
      return { status: 'blocked', reason: DRAFT_BLOCKED_BY_CONSENT_REASON };
    }
    const key = itemId === null
      ? `manual-blank:${this.draftRevision + 1}`
      : `manual:${itemId}`;
    const existingPath = this.createdPathsByKeyState().get(key);
    if (existingPath) return { status: 'already-created', path: existingPath };
    const guard = this.checkDraftGuard(
      'manual-draft',
      Boolean(options?.forceDiscardDirty),
    );
    if (guard) return guard;
    const item =
      options?.item ??
      this.judge()?.items.find((entry) => entry.itemId === itemId)?.item;
    if (itemId !== null && !item) {
      return { status: 'blocked', reason: 'Stack item not found.' };
    }
    const draft: OpenSkillDraft = {
      key,
      kind: 'manual',
      itemId,
      proposalId: null,
      coveredItemIds: itemId === null ? [] : [itemId],
      mode: 'edit',
      name: item ? skillDocumentSlug(item.name) : '',
      description: '',
      body: item ? buildManualDraftEvidenceBody(item) : '',
      dirty: false,
      busy: false,
      previewLoading: false,
      revision: ++this.draftRevision,
      previewRequestSeq: ++this.previewRequestSeq,
      submitted: null,
      generationError: null,
      createError: null,
      pairUsed: null,
    };
    this.openDraftState.set(draft);
    return { status: 'ok', draft };
  }

  public requestCloseDraftForItemSearch(options?: {
    readonly forceDiscardDirty?: boolean;
  }): DraftTransitionResult {
    return this.closeDraftWithTrigger(
      'item-search',
      Boolean(options?.forceDiscardDirty),
    );
  }

  public closeDraft(options?: {
    readonly forceDiscardDirty?: boolean;
  }): DraftTransitionResult {
    return this.closeDraftWithTrigger(
      'close',
      Boolean(options?.forceDiscardDirty),
    );
  }

  public beginRetryDraftGeneration(options?: {
    readonly forceDiscardDirty?: boolean;
  }): DraftTransitionResult {
    const current = this.openDraftState();
    if (!current || current.kind !== 'proposal') {
      return { status: 'blocked', reason: 'No proposal draft is open.' };
    }
    const guard = this.checkDraftGuard(
      'retry-generation',
      Boolean(options?.forceDiscardDirty),
    );
    if (guard) return guard;
    const proposal = this.judge()?.proposals.find(
      (p) => p.proposalId === current.proposalId,
    );
    if (!proposal) return { status: 'blocked', reason: 'Build proposal not found.' };
    const next: OpenSkillDraft = {
      ...current,
      mode: 'preview',
      name: skillDocumentSlug(proposal.name) || proposal.name,
      description: proposal.description,
      body: '',
      dirty: false,
      previewLoading: true,
      revision: ++this.draftRevision,
      previewRequestSeq: ++this.previewRequestSeq,
      generationError: null,
      createError: null,
    };
    this.openDraftState.set(next);
    return { status: 'ok', draft: next };
  }

  public setDraftMode(mode: SkillDraftMode): boolean {
    const current = this.openDraftState();
    if (!current || current.busy) return false;
    if (current.mode !== mode) this.openDraftState.set({ ...current, mode });
    return true;
  }

  public updateDraftFields(
    patch: Partial<Pick<OpenSkillDraft, 'name' | 'description' | 'body'>>,
  ): boolean {
    const current = this.openDraftState();
    if (!current || current.busy) return false;
    const nextName = patch.name ?? current.name;
    const nextDescription = patch.description ?? current.description;
    const nextBody = patch.body ?? current.body;
    if (
      nextName === current.name &&
      nextDescription === current.description &&
      nextBody === current.body
    ) {
      return true;
    }
    this.openDraftState.set({
      ...current,
      name: nextName,
      description: nextDescription,
      body: nextBody,
      dirty: true,
      createError: null,
    });
    return true;
  }

  private enterDraftGenerationFallback(
    current: OpenSkillDraft,
    error: SkillDraftGenerationError,
  ): void {
    const judge = this.judge();
    const fallbackBody = current.body.trim()
      ? current.body
      : judge && current.proposalId
        ? buildProposalFallbackEvidenceBody(
            current.coveredItemIds
              .map((itemId) => judge.items.find((e) => e.itemId === itemId))
              .filter((e): e is NonNullable<typeof e> => Boolean(e))
              .map((judgeItem) => ({
                item: judgeItem.item,
                buildReasons: judgeItem.outcomes
                  .filter(
                    (
                      o,
                    ): o is Extract<SkillJudgeOutcome, { verdict: 'build' }> =>
                      o.verdict === 'build' &&
                      o.proposalId === current.proposalId,
                  )
                  .map((o) => o.reason),
              })),
          )
        : '';
    this.openDraftState.set({
      ...current,
      mode: 'edit',
      body: fallbackBody,
      dirty: false,
      previewLoading: false,
      generationError: error,
    });
  }

  public applyDraftPreviewResult(
    request: { readonly revision: number; readonly previewRequestSeq: number },
    result: WizardGenerateSkillDraftResult,
  ): boolean {
    const current = this.openDraftState();
    if (
      !current ||
      current.busy ||
      current.revision !== request.revision ||
      current.previewRequestSeq !== request.previewRequestSeq
    ) {
      return false;
    }
    if (result.ok) {
      const resolvedName =
        skillDocumentSlug(result.destinationSlug || result.name) || result.name;
      this.openDraftState.set({
        ...current,
        mode: 'preview',
        name: resolvedName,
        description: result.description,
        body: result.body,
        dirty: false,
        previewLoading: false,
        generationError: null,
        pairUsed: freezeModelPair(result.pairUsed),
      });
      return true;
    }
    this.enterDraftGenerationFallback(current, {
      category: result.category,
      message: result.message,
      retryable:
        result.category !== 'no-model' && result.category !== 'invalid-pair',
    });
    return true;
  }

  public applyDraftPreviewError(
    request: { readonly revision: number; readonly previewRequestSeq: number },
    message: string,
  ): boolean {
    const current = this.openDraftState();
    if (
      !current ||
      current.busy ||
      current.revision !== request.revision ||
      current.previewRequestSeq !== request.previewRequestSeq
    ) {
      return false;
    }
    this.enterDraftGenerationFallback(current, {
      category: 'rpc-error',
      message,
      retryable: true,
    });
    return true;
  }

  public beginCreateDraft(): {
    readonly revision: number;
    readonly submitted: SkillDraftSubmittedSnapshot;
  } | null {
    const current = this.openDraftState();
    if (
      !current ||
      current.busy ||
      this.createdPathsByKeyState().has(current.key) ||
      !validateSkillDocument({ name: current.name, body: current.body })
    ) {
      return null;
    }
    const draft = normalizeSkillDraft(current);
    const submitted: SkillDraftSubmittedSnapshot = Object.freeze({
      ...draft,
      slug: skillDocumentSlug(draft.name),
    });
    this.openDraftState.set({
      ...current,
      busy: true,
      submitted,
      createError: null,
    });
    return { revision: current.revision, submitted };
  }

  public completeCreateDraft(
    revision: number,
    skillPath?: string,
  ): string | null {
    const current = this.openDraftState();
    if (!current || current.revision !== revision || !current.submitted) {
      return null;
    }
    const resolvedPath = typeof skillPath === 'string' ? skillPath.trim() : '';
    if (!resolvedPath) {
      this.failCreateDraft(
        revision,
        'The host did not return a path for this skill. Check the destination before trying again.',
      );
      return null;
    }
    const nextPaths = new Map(this.createdPathsByKeyState());
    nextPaths.set(current.key, resolvedPath);
    this.createdPathsByKeyState.set(nextPaths);
    this.recordCreatedSkillSlug(current.submitted.slug);
    this.draftRevision++;
    this.previewRequestSeq++;
    this.openDraftState.set(null);
    return resolvedPath;
  }

  public failCreateDraft(revision: number, message: string): boolean {
    const current = this.openDraftState();
    if (!current || current.revision !== revision) return false;
    this.openDraftState.set({
      ...current,
      busy: false,
      submitted: null,
      createError: message,
    });
    return true;
  }

  public reset(): void {
    this.draftRevision++;
    this.previewRequestSeq++;
    this.previewingState.set(false);
    this.intentState.set('');
    this.stageState.set('intent');
    this.selectedCandidateIdsState.set(new Set());
    this.customSelectionKeysState.set(new Map());
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
    this.analysisPairState.set(null);
    this.judgeState.set(null);
    this.verdictFilterState.set('all');
    this.activeItemIdState.set(null);
    this.itemSearchResultsState.set(new Map());
    this.retainedItemSearchResultsState.set(new Map());
    this.openDraftState.set(null);
    this.createdPathsByKeyState.set(new Map());
    this.createdSkillSlugsState.set([]);
  }
}
