import type {
  ModelPair,
  SkillJudgeCandidate,
  SkillJudgeItem,
  SkillJudgeOutcome,
  SkillJudgeResult,
  SkillRecommendation,
  SkillShEntry,
  StackSummaryItem,
} from '@ptah-extension/shared';
import type { SkillVerdictFilterValue } from './skill-verdict-filter.component';
import type { SkillDraftMode } from './skill-draft-preview.component';

export type SkillDraftKind = 'proposal' | 'manual';

export type DraftReplaceTrigger =
  | 'preview-draft'
  | 'manual-draft'
  | 'item-search'
  | 'retry-generation'
  | 'close';

export interface SkillDraftSubmittedSnapshot {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly slug: string;
}

export interface SkillDraftGenerationError {
  readonly category:
    | 'no-model'
    | 'empty-output'
    | 'timed-out'
    | 'provider-error'
    | 'invalid-output'
    | 'invalid-pair'
    | 'rpc-error';
  readonly message: string;
  readonly retryable: boolean;
}

export interface OpenSkillDraft {
  readonly key: string;
  readonly kind: SkillDraftKind;
  readonly itemId: string | null;
  readonly proposalId: string | null;
  readonly coveredItemIds: readonly string[];
  readonly mode: SkillDraftMode;
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly previewLoading: boolean;
  readonly revision: number;
  readonly previewRequestSeq: number;
  readonly submitted: SkillDraftSubmittedSnapshot | null;
  readonly generationError: SkillDraftGenerationError | null;
  readonly createError: string | null;
  readonly pairUsed: Readonly<ModelPair> | null;
}

export type DraftTransitionResult =
  | { readonly status: 'ok'; readonly draft: OpenSkillDraft }
  | { readonly status: 'closed' }
  | { readonly status: 'blocked'; readonly reason: string }
  | { readonly status: 'busy' }
  | { readonly status: 'confirm-dirty'; readonly trigger: DraftReplaceTrigger }
  | { readonly status: 'already-created'; readonly path: string };

export type RecommendationApplyResult =
  | { readonly status: 'ok' }
  | { readonly status: 'busy' }
  | { readonly status: 'confirm-dirty' };

export interface SkillVerdictCounts {
  readonly all: number;
  readonly install: number;
  readonly build: number;
  readonly buildProposals: number;
  readonly noSkill: number;
  readonly notJudged: number;
}

export type StackCoverageVerdict =
  'install' | 'build' | 'install-and-build' | 'no-skill' | 'not-judged';

export interface StackCoverageItem {
  /** Stable judge item ID when derived from a SkillJudgeResult. */
  itemId?: string;
  name: string;
  kind: StackSummaryItem['kind'];
  evidence: string;
  state: 'covered' | 'available' | 'none' | 'failed';
  selectedCount: number;
  totalCount: number;
  /** True when the original registry search for this item failed (preserved alongside covered state per R19). */
  originalSearchFailed?: boolean;
  /** Judged registry fact, present when built from SkillJudgeResult. */
  registry?: SkillJudgeItem['registry'];
  /** Judged verdict summary, present when built from SkillJudgeResult. */
  verdict?: StackCoverageVerdict;
}

export interface JudgeItemCandidateView {
  readonly candidate: SkillJudgeCandidate;
  readonly eligible: boolean;
  readonly rejection?: {
    readonly reason: string;
    readonly stage: 'decision' | 'normal';
  };
  readonly installedOutcomeReason: string | null;
}

export interface JudgeItemRowView {
  readonly itemId: string;
  readonly item: StackSummaryItem;
  readonly registry: SkillJudgeItem['registry'];
  readonly registryFailure?: SkillJudgeItem['registryFailure'];
  readonly judgedBy: SkillJudgeItem['judgedBy'];
  readonly outcomes: readonly SkillJudgeOutcome[];
  readonly verdict: StackCoverageVerdict;
  readonly installOutcomes: readonly Extract<
    SkillJudgeOutcome,
    { verdict: 'install' }
  >[];
  readonly buildOutcomes: readonly Extract<
    SkillJudgeOutcome,
    { verdict: 'build' }
  >[];
  readonly noSkillOutcomes: readonly Extract<
    SkillJudgeOutcome,
    { verdict: 'no-skill' }
  >[];
  readonly candidates: readonly JudgeItemCandidateView[];
  readonly manualCandidates: readonly SkillShEntry[];
  readonly selectedCandidateIds: ReadonlySet<string>;
  readonly covered: boolean;
  readonly originalSearchFailed: boolean;
  readonly showSearchFailedDisclosure: boolean;
  readonly pinned: boolean;
}

export interface ResidualCandidateView {
  readonly candidate: SkillJudgeCandidate;
  readonly rejections: readonly {
    readonly itemId: string;
    readonly itemName: string;
    readonly reason: string;
  }[];
  readonly itemIds: readonly string[];
  readonly itemNames: readonly string[];
}

/** Return the consent-boundary selection key (`source/skillId`, preserving case). */
export function skillSelectionKey(
  skill: Pick<SkillShEntry, 'source' | 'skillId'>,
): string {
  return `${skill.source}/${skill.skillId}`;
}

/** Return the canonical lowercased candidate identity (`source/skillId`). */
export function canonicalCandidateId(
  keyOrSkill: string | Pick<SkillShEntry, 'source' | 'skillId'>,
): string {
  const raw =
    typeof keyOrSkill === 'string' ? keyOrSkill : skillSelectionKey(keyOrSkill);
  return raw.trim().toLowerCase();
}

function normalizeInstalls(installs: number): number {
  return Number.isFinite(installs) && installs > 0 ? installs : 0;
}

/** Deterministic descending download-count comparator with stable tie-breakers. */
export function compareSkillsByInstallsDesc(
  a: SkillShEntry,
  b: SkillShEntry,
): number {
  const installsDiff =
    normalizeInstalls(b.installs) - normalizeInstalls(a.installs);
  if (installsDiff !== 0) return installsDiff;
  return (
    a.skillId.localeCompare(b.skillId) ||
    a.source.localeCompare(b.source) ||
    a.name.localeCompare(b.name)
  );
}

/** Summarize an item's judge outcomes into a single coverage verdict status. */
export function deriveCoverageVerdict(
  item: Pick<SkillJudgeItem, 'outcomes' | 'judgedBy'>,
): StackCoverageVerdict {
  if (item.judgedBy === 'none' || item.outcomes.length === 0) {
    return 'not-judged';
  }
  const hasInstall = item.outcomes.some(
    (outcome) => outcome.verdict === 'install',
  );
  const hasBuild = item.outcomes.some((outcome) => outcome.verdict === 'build');
  if (hasInstall && hasBuild) return 'install-and-build';
  if (hasInstall) return 'install';
  if (hasBuild) return 'build';
  return 'no-skill';
}

/** Return the visible registry/coverage status phrase for a stack coverage chip. */
export function coverageSummaryText(item: StackCoverageItem): string {
  if (item.state === 'covered' && item.originalSearchFailed) {
    return 'Covered - original search failed';
  }
  if (item.state === 'failed') return 'search failed';
  if (item.state === 'none') {
    return item.registry === 'not-searched' ? 'not searched' : 'no match';
  }
  if (item.state === 'available') return `${item.totalCount} available`;
  return `${item.selectedCount} selected`;
}

/** Return the visible judged verdict status word for a stack coverage chip. */
export function coverageVerdictLabel(verdict: StackCoverageVerdict): string {
  switch (verdict) {
    case 'install':
      return 'Install';
    case 'build':
      return 'Build';
    case 'install-and-build':
      return 'Install + Build';
    case 'no-skill':
      return 'No skill needed';
    case 'not-judged':
      return 'Not judged';
  }
}

/** Only exact, case-insensitive comma-separated names constitute coverage. */
export function splitStackEvidence(
  evidence: string,
  detected: readonly StackSummaryItem[],
): { coveredItems: string[]; rawEvidence: string | null } {
  let remaining = evidence.trim().toLowerCase();
  const coveredItems: string[] = [];
  const names = [...detected].sort(
    (a, b) => b.name.trim().length - a.name.trim().length,
  );
  for (const item of names) {
    const name = item.name.trim().toLowerCase();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(^|,\\s*)${escaped}(?=\\s*,|$)`);
    if (match.test(remaining)) {
      coveredItems.push(item.name);
      remaining = remaining.replace(match, '$1').trim();
    }
  }
  return {
    coveredItems,
    rawEvidence: coveredItems.length ? null : evidence.trim() || null,
  };
}

export function formatInstallCount(installs: number): string {
  if (installs <= 0) return 'New';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
    .format(installs)
    .toLowerCase();
}

export function buildStackCoverage(
  detected: readonly StackSummaryItem[],
  unmatched: readonly StackSummaryItem[],
  failures: readonly { item: string; reason: string }[],
  recommendations: readonly SkillRecommendation[],
  selectedIds: ReadonlySet<string>,
): StackCoverageItem[] {
  const canonicalSelected = new Set(
    [...selectedIds].map((id) => canonicalCandidateId(id)),
  );
  const items = new Map<string, StackSummaryItem>();
  for (const item of [...detected, ...unmatched]) {
    const key = `${item.kind}:${item.name.toLowerCase()}`;
    if (!items.has(key)) items.set(key, item);
  }
  const allItems = [...items.values()];
  const candidateIdsByItemName = new Map<string, Set<string>>();
  for (const row of recommendations) {
    const candidateId = canonicalCandidateId(row.skill);
    for (const coveredName of splitStackEvidence(row.evidence, allItems)
      .coveredItems) {
      let bucket = candidateIdsByItemName.get(coveredName);
      if (!bucket) {
        bucket = new Set<string>();
        candidateIdsByItemName.set(coveredName, bucket);
      }
      bucket.add(candidateId);
    }
  }
  return allItems.map((item) => {
    const matchIds = candidateIdsByItemName.get(item.name);
    let selectedCount = 0;
    if (matchIds) {
      for (const key of matchIds) {
        if (canonicalSelected.has(key)) selectedCount++;
      }
    }
    const totalCount = matchIds?.size ?? 0;
    const failed = failures.some(
      (failure) =>
        failure.item.trim().toLowerCase() === item.name.toLowerCase(),
    );
    const state: StackCoverageItem['state'] =
      selectedCount > 0
        ? 'covered'
        : failed
          ? 'failed'
          : totalCount > 0
            ? 'available'
            : 'none';
    return {
      name: item.name,
      kind: item.kind,
      evidence: item.evidence,
      selectedCount,
      totalCount,
      state,
      ...(failed ? { originalSearchFailed: true } : {}),
    };
  });
}

/**
 * Build stack coverage items from a judged skills result using the single R19
 * selectedCandidateIdsByItemId map (judge, registry and manual search unified).
 */
export function buildJudgedStackCoverage(
  judge: SkillJudgeResult,
  selectedCandidateIdsByItemId: ReadonlyMap<string, ReadonlySet<string>>,
  manualCandidateIdsByItemId?: ReadonlyMap<string, ReadonlySet<string>>,
): StackCoverageItem[] {
  return judge.items.map((judgeItem) => {
    const selected = selectedCandidateIdsByItemId.get(judgeItem.itemId);
    const selectedCount = selected?.size ?? 0;
    const availableIds = new Set<string>();
    for (const candidateId of judgeItem.candidateIds) {
      availableIds.add(canonicalCandidateId(candidateId));
    }
    const manual = manualCandidateIdsByItemId?.get(judgeItem.itemId);
    if (manual) {
      for (const candidateId of manual) {
        availableIds.add(canonicalCandidateId(candidateId));
      }
    }
    if (selected) {
      for (const candidateId of selected) {
        availableIds.add(canonicalCandidateId(candidateId));
      }
    }
    const totalCount = availableIds.size;
    const originalSearchFailed = judgeItem.registry === 'search-failed';
    const state: StackCoverageItem['state'] =
      selectedCount > 0
        ? 'covered'
        : originalSearchFailed
          ? 'failed'
          : totalCount > 0
            ? 'available'
            : 'none';
    return {
      itemId: judgeItem.itemId,
      name: judgeItem.item.name,
      kind: judgeItem.item.kind,
      evidence: judgeItem.item.evidence,
      selectedCount,
      totalCount,
      state,
      registry: judgeItem.registry,
      verdict: deriveCoverageVerdict(judgeItem),
      ...(originalSearchFailed ? { originalSearchFailed: true } : {}),
    };
  });
}

export function freezeModelPair(
  pair: ModelPair | null,
): Readonly<ModelPair> | null {
  if (!pair) return null;
  return Object.freeze({ provider: pair.provider, model: pair.model });
}

export function cloneSkillJudgeResult(
  judge: SkillJudgeResult,
): SkillJudgeResult {
  return {
    method: judge.method,
    counts: { ...judge.counts },
    items: judge.items.map((item) => ({
      ...item,
      item: { ...item.item },
      ...(item.registryFailure
        ? { registryFailure: { ...item.registryFailure } }
        : {}),
      candidateIds: [...item.candidateIds],
      candidateAssessments: item.candidateAssessments.map((assessment) => ({
        ...assessment,
        ...(assessment.rejection
          ? { rejection: { ...assessment.rejection } }
          : {}),
      })),
      outcomes: item.outcomes.map((outcome) => ({ ...outcome })),
    })),
    candidates: judge.candidates.map((candidate) => ({
      ...candidate,
      skill: { ...candidate.skill },
    })),
    proposals: judge.proposals.map((proposal) => ({
      ...proposal,
      itemIds: [...proposal.itemIds],
    })),
    stages: judge.stages.map((stage) => ({
      ...stage,
      ...(stage.pairConfigured
        ? { pairConfigured: { ...stage.pairConfigured } }
        : {}),
      ...(stage.pairAttempted
        ? { pairAttempted: { ...stage.pairAttempted } }
        : {}),
      ...(stage.pairUsed ? { pairUsed: { ...stage.pairUsed } } : {}),
      invalidItemIds: [...stage.invalidItemIds],
    })),
  };
}

export function itemMatchesVerdictFilter(
  item: SkillJudgeItem,
  filter: SkillVerdictFilterValue,
): boolean {
  if (filter === 'all') return true;
  const hasInstall = item.outcomes.some((o) => o.verdict === 'install');
  const hasBuild = item.outcomes.some((o) => o.verdict === 'build');
  const isNotJudged = item.judgedBy === 'none' || item.outcomes.length === 0;
  switch (filter) {
    case 'install':
      return hasInstall;
    case 'build':
      return hasBuild;
    case 'no-skill':
      return (
        !isNotJudged &&
        !hasInstall &&
        !hasBuild &&
        item.outcomes.some((o) => o.verdict === 'no-skill')
      );
    case 'not-judged':
      return isNotJudged;
  }
}

export function buildManualDraftEvidenceBody(item: StackSummaryItem): string {
  const evidence = item.evidence.trim();
  const detail = evidence
    ? `- ${item.name} (${item.kind}): ${evidence}`
    : `- ${item.name} (${item.kind})`;
  return `## Project evidence\n\n${detail}\n\n`;
}

export function buildProposalFallbackEvidenceBody(
  entries: readonly {
    readonly item: StackSummaryItem;
    readonly buildReasons: readonly string[];
  }[],
): string {
  const lines: string[] = [];
  for (const entry of entries) {
    const evidence = entry.item.evidence.trim();
    const base = evidence
      ? `- ${entry.item.name} (${entry.item.kind}): ${evidence}`
      : `- ${entry.item.name} (${entry.item.kind})`;
    lines.push(base);
    for (const reason of entry.buildReasons) {
      const trimmed = reason.trim();
      if (trimmed) lines.push(`  - Build reason: ${trimmed}`);
    }
  }
  return `## Project evidence\n\n${lines.join('\n')}\n\n`;
}

export function buildJudgeItemRows(
  judge: SkillJudgeResult,
  candidatesById: ReadonlyMap<string, SkillJudgeCandidate>,
  selectedByItem: ReadonlyMap<string, ReadonlySet<string>>,
  itemSearch: ReadonlyMap<string, readonly SkillShEntry[]>,
  retainedItemSearch: ReadonlyMap<string, readonly SkillShEntry[]>,
  pinnedDraft: {
    readonly kind: 'proposal' | 'manual';
    readonly itemId: string | null;
    readonly proposalId: string | null;
    readonly coveredItemIds: readonly string[];
  } | null,
): readonly JudgeItemRowView[] {
  return judge.items.map((judgeItem) => {
    const installOutcomes = judgeItem.outcomes.filter(
      (o): o is Extract<SkillJudgeOutcome, { verdict: 'install' }> =>
        o.verdict === 'install',
    );
    const buildOutcomes = judgeItem.outcomes.filter(
      (o): o is Extract<SkillJudgeOutcome, { verdict: 'build' }> =>
        o.verdict === 'build',
    );
    const noSkillOutcomes = judgeItem.outcomes.filter(
      (o): o is Extract<SkillJudgeOutcome, { verdict: 'no-skill' }> =>
        o.verdict === 'no-skill',
    );
    const assessmentById = new Map(
      judgeItem.candidateAssessments.map((a) => [
        canonicalCandidateId(a.candidateId),
        a,
      ]),
    );
    const installReasonById = new Map(
      installOutcomes.map((o) => [
        canonicalCandidateId(o.candidateId),
        o.reason,
      ]),
    );
    const candidates: JudgeItemCandidateView[] = [];
    for (const rawId of judgeItem.candidateIds) {
      const cid = canonicalCandidateId(rawId);
      const candidate = candidatesById.get(cid);
      if (!candidate) continue;
      const assessment = assessmentById.get(cid);
      candidates.push({
        candidate,
        eligible: assessment ? assessment.eligible : !candidate.deprecated,
        ...(assessment?.rejection ? { rejection: assessment.rejection } : {}),
        installedOutcomeReason: installReasonById.get(cid) ?? null,
      });
    }
    candidates.sort((a, b) =>
      compareSkillsByInstallsDesc(a.candidate.skill, b.candidate.skill),
    );

    const combinedManual = new Map<string, SkillShEntry>();
    for (const skill of retainedItemSearch.get(judgeItem.itemId) ?? []) {
      combinedManual.set(canonicalCandidateId(skill), skill);
    }
    for (const skill of itemSearch.get(judgeItem.itemId) ?? []) {
      combinedManual.set(canonicalCandidateId(skill), skill);
    }

    const selectedForItem = selectedByItem.get(judgeItem.itemId) ?? new Set();
    const originalSearchFailed = judgeItem.registry === 'search-failed';
    const showSearchFailedDisclosure =
      originalSearchFailed &&
      (buildOutcomes.length > 0 || noSkillOutcomes.length > 0);
    const pinned =
      pinnedDraft !== null &&
      ((pinnedDraft.kind === 'manual' &&
        pinnedDraft.itemId === judgeItem.itemId) ||
        (pinnedDraft.proposalId !== null &&
          pinnedDraft.coveredItemIds.includes(judgeItem.itemId)));

    return {
      itemId: judgeItem.itemId,
      item: judgeItem.item,
      registry: judgeItem.registry,
      ...(judgeItem.registryFailure
        ? { registryFailure: judgeItem.registryFailure }
        : {}),
      judgedBy: judgeItem.judgedBy,
      outcomes: judgeItem.outcomes,
      verdict: deriveCoverageVerdict(judgeItem),
      installOutcomes,
      buildOutcomes,
      noSkillOutcomes,
      candidates,
      manualCandidates: [...combinedManual.values()].sort(
        compareSkillsByInstallsDesc,
      ),
      selectedCandidateIds: selectedForItem,
      covered: selectedForItem.size > 0,
      originalSearchFailed,
      showSearchFailedDisclosure,
      pinned,
    };
  });
}

export function computeJudgeResidualCandidates(
  judge: SkillJudgeResult,
  displayedCandidateIds: ReadonlySet<string>,
): readonly ResidualCandidateView[] {
  if (judge.method === 'none') return [];
  const normalizedDisplayed = new Set(
    [...displayedCandidateIds].map((id) => canonicalCandidateId(id)),
  );
  const residual: ResidualCandidateView[] = [];
  for (const candidate of judge.candidates) {
    const cid = canonicalCandidateId(candidate.candidateId);
    if (normalizedDisplayed.has(cid)) continue;
    const itemIds: string[] = [];
    const itemNames: string[] = [];
    const rejections: ResidualCandidateView['rejections'][number][] = [];
    for (const item of judge.items) {
      const hasInPool = item.candidateIds.some(
        (id) => canonicalCandidateId(id) === cid,
      );
      const assessment = item.candidateAssessments.find(
        (entry) => canonicalCandidateId(entry.candidateId) === cid,
      );
      if (hasInPool || assessment) {
        itemIds.push(item.itemId);
        itemNames.push(item.item.name);
      }
      if (assessment?.rejection) {
        rejections.push({
          itemId: item.itemId,
          itemName: item.item.name,
          reason: assessment.rejection.reason,
        });
      }
    }
    residual.push({
      candidate,
      rejections,
      itemIds,
      itemNames,
    });
  }
  residual.sort((a, b) =>
    compareSkillsByInstallsDesc(a.candidate.skill, b.candidate.skill),
  );
  return residual;
}

export function computeHiddenPoolCandidateCount(
  judge: SkillJudgeResult,
  filter: SkillVerdictFilterValue,
  activeItemId: string | null,
  visibleRows: readonly Pick<
    JudgeItemRowView,
    'verdict' | 'installOutcomes' | 'candidates' | 'manualCandidates'
  >[],
  residualCandidates: readonly Pick<ResidualCandidateView, 'candidate'>[] = [],
): number {
  if (judge.candidates.length === 0) return 0;
  if (filter === 'all' && !activeItemId) return 0;

  const poolIds = new Set(
    judge.candidates.map((c) => canonicalCandidateId(c.candidateId)),
  );
  const visiblePoolIds = new Set<string>();
  const addIfInPool = (
    rawId: string | Pick<SkillShEntry, 'source' | 'skillId'>,
  ): void => {
    const cid = canonicalCandidateId(rawId);
    if (poolIds.has(cid)) visiblePoolIds.add(cid);
  };

  if (filter === 'all' || filter === 'install') {
    for (const row of visibleRows) {
      for (const outcome of row.installOutcomes) {
        addIfInPool(outcome.candidateId);
      }
    }
  }

  if (filter === 'all' || filter === 'not-judged') {
    for (const row of visibleRows) {
      if (row.verdict === 'not-judged') {
        for (const entry of row.candidates) {
          addIfInPool(entry.candidate.candidateId);
        }
      }
    }
  }

  for (const row of visibleRows) {
    for (const skill of row.manualCandidates) {
      addIfInPool(skill);
    }
  }

  if (judge.method !== 'none' && filter === 'all') {
    for (const entry of residualCandidates) {
      addIfInPool(entry.candidate.candidateId);
    }
  }

  return Math.max(0, poolIds.size - visiblePoolIds.size);
}
