import {
  afterRenderEffect,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
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
  SkillJudgeCandidate,
  SkillJudgeItem,
  SkillRecommendation,
  SkillShEntry,
  StackSummaryItem,
  WizardGenerateSkillDraftParams,
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
import {
  type ManualDraftRequest,
  UnmatchedStackListComponent,
} from './unmatched-stack-list.component';
import {
  buildStackCoverage,
  canonicalCandidateId,
  compareSkillsByInstallsDesc,
  splitStackEvidence,
} from './stack-coverage';
import {
  type SkillBuildPreviewRequest,
  SkillBuildRowComponent,
} from './skill-build-row.component';
import { SkillDraftPreviewComponent } from './skill-draft-preview.component';
import { SkillMethodBannerComponent } from './skill-method-banner.component';
import { SkillNotJudgedRowComponent } from './skill-not-judged-row.component';
import { SkillVerdictFilterComponent } from './skill-verdict-filter.component';
import type {
  DraftTransitionResult,
  OpenSkillDraft,
  SkillDraftSubmittedSnapshot,
  StackSkillStore,
} from './stack-skill.store';

export interface SkillDraftPreviewAction {
  readonly params: WizardGenerateSkillDraftParams;
  readonly revision: number;
  readonly previewRequestSeq: number;
}

export interface SkillDraftCreateAction {
  readonly revision: number;
  readonly submitted: SkillDraftSubmittedSnapshot;
}

interface InstallCard {
  candidate: SkillJudgeCandidate;
  coveredItems: string[];
  reasons: Set<string>;
}

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
    SkillBuildRowComponent,
    SkillDraftPreviewComponent,
    SkillMethodBannerComponent,
    SkillNotJudgedRowComponent,
    SkillVerdictFilterComponent,
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
  public readonly store = input<StackSkillStore | null>(null);
  public readonly runId = input('');
  public readonly draftPreviewRequested = output<SkillDraftPreviewAction>();
  public readonly draftCreateRequested = output<SkillDraftCreateAction>();
  public readonly itemSearchRequested = output<{
    itemId: string;
    query: string;
  }>();
  public readonly recommendations = input.required<SkillRecommendation[]>();
  public readonly searchResults = input.required<SkillShEntry[]>();
  public readonly retainedSearchResults = input<SkillShEntry[]>([]);
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
  protected readonly judgedMode = computed(
    () => this.store()?.judgedMode() ?? false,
  );
  protected readonly judgeItemsById = computed(
    () =>
      new Map(
        this.store()
          ?.judge()
          ?.items.map((item) => [item.itemId, item]),
      ),
  );
  protected readonly installCards = computed(() => {
    const store = this.store();
    const cards = new Map<string, InstallCard>();
    if (!store || !['all', 'install'].includes(store.verdictFilter()))
      return [];
    for (const row of store.visibleItemRows()) {
      for (const outcome of row.installOutcomes) {
        const id = canonicalCandidateId(outcome.candidateId);
        const candidate = store.candidateById().get(id);
        if (!candidate) continue;
        const card = cards.get(id) ?? {
          candidate,
          coveredItems: [],
          reasons: new Set<string>(),
        };
        card.coveredItems.push(row.item.name);
        const model =
          outcome.stage === 'decision' ? 'Decision model' : 'Normal model';
        card.reasons.add(`${model}: ${outcome.reason}`);
        cards.set(id, card);
      }
    }
    return [...cards.values()]
      .sort((a, b) =>
        compareSkillsByInstallsDesc(a.candidate.skill, b.candidate.skill),
      )
      .map(({ candidate, coveredItems, reasons }) => ({
        candidate,
        coveredItems: [...new Set(coveredItems)],
        reason: [...reasons].join(' · '),
      }));
  });
  protected readonly residualCards = computed(() =>
    [...(this.store()?.residualCandidates() ?? [])]
      .sort((a, b) =>
        compareSkillsByInstallsDesc(a.candidate.skill, b.candidate.skill),
      )
      .map((entry) => ({
        ...entry,
        coveredItems: [...entry.itemNames],
        reason: entry.rejections.length
          ? entry.rejections
              .map(
                ({ itemName, reason }) => `Rejected for ${itemName}. ${reason}`,
              )
              .join(' · ')
          : 'No verdict',
      })),
  );
  protected readonly judgedUnmatchedItems = computed(() => {
    const items = this.judgeItemsById();
    return (this.store()?.visibleItemRows() ?? []).flatMap((row) => {
      const item = items.get(row.itemId);
      return item && row.verdict !== 'not-judged' && !row.installOutcomes.length
        ? [item]
        : [];
    });
  });
  protected readonly createdManualItemIds = computed(() => {
    const store = this.store();
    return new Set(
      this.judgedUnmatchedItems()
        .filter(({ itemId }) => store?.createdPathFor('manual:' + itemId))
        .map(({ itemId }) => itemId),
    );
  });
  protected readonly draftDisabledReason = computed(
    () =>
      this.store()?.draftBlockedReason() ??
      (this.store()?.openDraft()?.busy
        ? 'Wait for skill creation to finish.'
        : null),
  );
  protected readonly lastBlankCreatedPath = computed(() => {
    let path: string | null = null;
    for (const [key, value] of this.store()?.createdPathsByKey() ?? []) {
      if (key.startsWith('manual-blank:')) path = value;
    }
    return path;
  });
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly discardDialog =
    viewChild<ElementRef<HTMLDialogElement>>('discardDialog');
  private readonly title = viewChild<ElementRef<HTMLElement>>('reviewTitle');
  private draftOpener: HTMLButtonElement | null = null;
  private previewParams: WizardGenerateSkillDraftParams | null = null;
  private discardAction: (() => void) | null = null;
  private focusedDraft: Pick<OpenSkillDraft, 'key' | 'mode'> | null = null;
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
    () =>
      this.loading() && !this.judgedMode() && !this.recommendations().length,
  );
  protected readonly coverage = computed(() => {
    const store = this.store();
    if (store?.judgedMode()) return [...store.stackCoverage()];
    return buildStackCoverage(
      this.detectedItems(),
      this.unmatchedItems(),
      this.searchFailures(),
      this.recommendations(),
      this.selectedIds(),
    );
  });
  protected readonly coveredCount = computed(
    () => this.coverage().filter((item) => item.state === 'covered').length,
  );
  protected readonly filteredRecommendations = computed(() =>
    [...this.recommendations()]
      .sort((a, b) => compareSkillsByInstallsDesc(a.skill, b.skill))
      .filter(
        (row) =>
          !this.activeItem() ||
          this.evidence(row.evidence).coveredItems.includes(
            this.activeItemName() ?? '',
          ),
      ),
  );
  protected readonly otherResults = computed(() =>
    this.searchResults()
      .filter((skill) => !this.recommendationIds().has(this.key(skill)))
      .sort(compareSkillsByInstallsDesc),
  );
  protected readonly selectedSkills = computed(() => {
    const store = this.store();
    const skills = new Map(
      [
        ...this.recommendations().map((row) => row.skill),
        ...this.retainedSearchResults(),
        ...this.searchResults(),
        ...(store?.judge()?.candidates.map(({ skill }) => skill) ?? []),
        ...[...(store?.itemSearchResultsByItemId().values() ?? [])].flat(),
        ...[
          ...(store?.retainedItemSearchResultsByItemId().values() ?? []),
        ].flat(),
      ].map((skill) => [this.key(skill), skill]),
    );
    const selected = store?.judgedMode()
      ? store.selectedSelectionKeys()
      : this.selectedIds();
    return [...selected]
      .sort((a, b) => {
        const skillA = skills.get(a);
        const skillB = skills.get(b);
        if (skillA && skillB) {
          return compareSkillsByInstallsDesc(skillA, skillB);
        }
        if (skillA) return -1;
        if (skillB) return 1;
        return a.localeCompare(b);
      })
      .map((key) => ({
        key,
        name: skills.get(key)?.name ?? key,
      }));
  });
  protected readonly totalSkills = computed(() => {
    const store = this.store();
    if (store?.judgedMode()) return store.selectionKeyByCandidateId().size;
    return new Set([
      ...this.recommendations().map((row) => this.key(row.skill)),
      ...this.searchResults().map((skill) => this.key(skill)),
      ...this.selectedIds(),
    ]).size;
  });

  public constructor() {
    afterRenderEffect(() => {
      const draft = this.store()?.openDraft();
      const previous = this.focusedDraft;
      if (
        draft &&
        (draft.key !== previous?.key || draft.mode !== previous.mode)
      ) {
        this.focusOpenDraft(draft);
      } else if (!draft) {
        this.focusedDraft = null;
        const opener = this.draftOpener;
        this.draftOpener = null;
        this.previewParams = null;
        if (!opener) return;
        if (opener.isConnected) opener.focus();
        else this.title()?.nativeElement.focus();
      }
    });
  }

  private focusOpenDraft(draft: OpenSkillDraft): void {
    const selector = draft.mode === 'edit' ? 'input' : 'h4';
    const target = this.host.querySelector<HTMLElement>(
      `ptah-skill-draft-preview ${selector}`,
    );
    if (!target) return;
    this.focusedDraft = { key: draft.key, mode: draft.mode };
    if (draft.mode === 'preview') target.tabIndex = -1;
    target.focus();
  }

  private rememberDraftOpener(
    opener: HTMLButtonElement,
    draft: OpenSkillDraft,
  ): void {
    this.draftOpener = opener;
    afterNextRender(
      () => {
        if (
          this.store()?.openDraft()?.revision === draft.revision &&
          this.focusedDraft?.key !== draft.key
        )
          this.focusOpenDraft(draft);
      },
      { injector: this.injector },
    );
  }

  protected openProposalDraft(
    store: StackSkillStore,
    request: SkillBuildPreviewRequest,
  ): void {
    const proposalId = request.params.proposalId;
    if (
      this.draftDisabledReason() ||
      !request.params.runId ||
      store.openDraft()?.key === `proposal:${proposalId}`
    )
      return;
    this.transitionDraft(
      store,
      (forceDiscardDirty) =>
        store.openProposalDraft(proposalId, { forceDiscardDirty }),
      (result) => {
        if (result.status !== 'ok') return;
        this.rememberDraftOpener(request.opener, result.draft);
        this.previewParams = request.params;
        this.emitDraftPreview(result.draft, request.params);
      },
    );
  }

  protected openManualDraft(
    store: StackSkillStore,
    request: ManualDraftRequest,
  ): void {
    const { item, opener } = request;
    const itemId = request.itemId ?? `${item.kind}:${item.name}`;
    if (
      this.draftDisabledReason() ||
      store.openDraft()?.key === `manual:${itemId}`
    )
      return;
    this.transitionDraft(
      store,
      (forceDiscardDirty) =>
        store.openManualDraft(itemId, { item, forceDiscardDirty }),
      (result) => {
        if (result.status === 'ok')
          this.rememberDraftOpener(opener, result.draft);
      },
    );
  }

  protected openNotJudgedDraft(
    store: StackSkillStore,
    item: SkillJudgeItem,
    row: HTMLFieldSetElement,
  ): void {
    const opener = row.querySelector<HTMLButtonElement>('button');
    if (opener)
      this.openManualDraft(store, {
        itemId: item.itemId,
        item: item.item,
        opener,
      });
  }

  protected openBlankDraft(
    store: StackSkillStore,
    opener: HTMLButtonElement,
  ): void {
    const draft = store.openDraft();
    if (
      this.draftDisabledReason() ||
      (draft?.kind === 'manual' && draft.itemId === null)
    )
      return;
    this.transitionDraft(
      store,
      (forceDiscardDirty) => store.openBlankManualDraft({ forceDiscardDirty }),
      (result) => {
        if (result.status === 'ok')
          this.rememberDraftOpener(opener, result.draft);
      },
    );
  }

  protected closeDraft(store: StackSkillStore): void {
    this.transitionDraft(store, (forceDiscardDirty) =>
      store.closeDraft({ forceDiscardDirty }),
    );
  }

  protected retryDraft(store: StackSkillStore): void {
    const params = this.previewParams;
    if (!params || this.draftDisabledReason()) return;
    this.transitionDraft(
      store,
      (forceDiscardDirty) =>
        store.beginRetryDraftGeneration({ forceDiscardDirty }),
      (result) => {
        if (result.status === 'ok') this.emitDraftPreview(result.draft, params);
      },
    );
  }

  protected createDraft(store: StackSkillStore): void {
    if (this.draftDisabledReason()) return;
    const action = store.beginCreateDraft();
    if (action) this.draftCreateRequested.emit(action);
  }

  protected searchJudgedItem(
    store: StackSkillStore,
    itemId: string,
    query: string,
  ): void {
    if (this.searching()) return;
    this.transitionDraft(
      store,
      (forceDiscardDirty) =>
        store.requestCloseDraftForItemSearch({ forceDiscardDirty }),
      (result) => {
        if (result.status === 'closed')
          this.itemSearchRequested.emit({ itemId, query });
      },
    );
  }

  protected settleDiscard(confirmed: boolean): void {
    const action = this.discardAction;
    this.discardAction = null;
    this.discardDialog()?.nativeElement.close();
    if (confirmed) action?.();
  }

  private emitDraftPreview(
    draft: OpenSkillDraft,
    params: WizardGenerateSkillDraftParams,
  ): void {
    this.draftPreviewRequested.emit({
      params,
      revision: draft.revision,
      previewRequestSeq: draft.previewRequestSeq,
    });
  }

  private transitionDraft(
    store: StackSkillStore,
    transition: (forceDiscardDirty: boolean) => DraftTransitionResult,
    complete?: (result: DraftTransitionResult) => void,
  ): void {
    const result = transition(false);
    if (result.status !== 'confirm-dirty') {
      complete?.(result);
      return;
    }
    const dialog = this.discardDialog()?.nativeElement;
    if (!dialog || dialog.open) return;
    const revision = store.openDraft()?.revision;
    this.discardAction = () => {
      if (this.store() === store && store.openDraft()?.revision === revision) {
        const confirmed = transition(true);
        complete?.(confirmed);
      }
    };
    dialog.showModal();
  }
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
    if (this.searching()) return;
    this.queryChange.emit(name);
    this.submittedQueryState.set(name);
    this.searchRequested.emit(name);
  }
  public key(skill: SkillShEntry): string {
    return `${skill.source}/${skill.skillId}`;
  }
  public selected(skill: SkillShEntry): boolean {
    const store = this.store();
    return store?.judgedMode()
      ? store.isCandidateSelected(skill)
      : this.selectedIds().has(this.key(skill));
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
