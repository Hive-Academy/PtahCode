/**
 * Skill Recommendation Service
 *
 * Searches skills.sh for detected stack items within an entry-anchored
 * deadline schedule, preserves stable per-item identity and the full
 * candidate pool, and delegates per-item verdicts to SkillJudgeService.
 *
 * @module @ptah-extension/rpc-handlers/skills-sh/services
 */

import { injectable, inject } from 'tsyringe';
import { z } from 'zod';
import type { ResolvedSetupSnapshot } from '@ptah-extension/agent-sdk';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import type {
  DeepProjectAnalysis,
  ModelPair,
  SkillJudgeCandidate,
  SkillJudgeItem,
  SkillJudgeResult,
  SkillJudgeStageCategory,
  SkillJudgeStageRecord,
  SkillRecommendation,
  SkillShEntry,
  StackSummaryItem,
  WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';

import { SKILL_JUDGE_SERVICE } from '../../di/tokens';
import type { SkillJudgeService } from './skill-judge.service';
import type { SkillJudgeInputItem } from './skill-judge.types';

/** Search function for the skills.sh catalog. */
export type SkillCatalogSearch = (query: string) => Promise<SkillShEntry[]>;

export interface SkillRecommendationInput {
  analysis: DeepProjectAnalysis;
  /** Names of the dependencies the project declares (package.json keys). */
  dependencies: readonly string[];
  search: SkillCatalogSearch;
}

export interface AnalysisSkillRecommendationInput {
  workspaceRoot?: string;
  items: readonly StackSummaryItem[];
  search: SkillCatalogSearch;
  summarySource: 'structured' | 'legacy' | 'none';
  /** Entry timestamp (Date.now() ms) captured before Setup resolution and search. */
  rpcEntry?: number;
  /** Strict Setup snapshot resolved before registry search. */
  resolved?: ResolvedSetupSnapshot;
  /** Immutable analysis model pair from the saved analysis manifest, or null. */
  analysisPair?: ModelPair | null;
}

const HARD_DEADLINE_MS = 70_000;
const SEARCH_DEADLINE_MS = 26_000;
const SEARCH_TIMEOUT_MS = 8_000;
const MIN_SEARCH_REMAINING_MS = 500;
const SEARCH_WORKERS = 4;
const MAX_TERMS = 30;

const BUDGET_FAILURE = { kind: 'budget-exceeded' as const, reason: 'Search budget reached' };
const TIMED_OUT_FAILURE = { kind: 'timed-out' as const, reason: 'Search timed out' };

const recommendationEntrySchema = z.object({
  source: z.string().trim().min(1),
  skillId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  installs: z.number().finite().nonnegative(),
  isInstalled: z.boolean(),
  id: z.string().optional(),
  slug: z.string().optional(),
  sourceType: z.string().optional(),
  url: z.string().optional(),
  installUrl: z.string().optional(),
});

interface PreparedStackItem {
  itemId: string;
  item: StackSummaryItem;
  term: string;
}

interface TermBucket {
  term: string;
  firstItemName: string;
  started: boolean;
  status: 'not-searched' | 'searched' | 'failed';
  entries: SkillShEntry[];
  failure?: SkillJudgeItem['registryFailure'];
}

interface ScoredCandidate {
  skill: SkillShEntry;
  score: number;
  described: boolean;
}

/** Use the primary technology in composite names, without version annotations. */
function technologyName(name: string): string {
  return name
    .split(/\s+\+\s+|\s+\/\s+|,/)[0]
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+[~^v]?\d[\w.*+~-]*(?=\s|$)/gi, '')
    .trim()
    .toLowerCase();
}

function compareRecommendations(
  a: Pick<SkillRecommendation, 'skill' | 'score'>,
  b: Pick<SkillRecommendation, 'skill' | 'score'>,
): number {
  return (
    b.score - a.score ||
    a.skill.skillId.localeCompare(b.skill.skillId) ||
    a.skill.source.localeCompare(b.skill.source) ||
    a.skill.name.localeCompare(b.skill.name)
  );
}

function searchWithTimeout(
  search: SkillCatalogSearch,
  query: string,
  timeoutMs = SEARCH_TIMEOUT_MS,
): Promise<SkillShEntry[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Search timed out'));
    }, Math.max(0, timeoutMs));
    Promise.resolve()
      .then(() => search(query))
      .then(
        (entries) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          resolve(entries);
        },
        (error: unknown) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          reject(error);
        },
      );
  });
}

/** Derive the technology keyword from a dependency name. */
export function dependencyKeyword(dependency: string): string {
  if (dependency.trim().toLowerCase() === 'c++') return 'cpp';
  const scoped = dependency.startsWith('@')
    ? dependency.slice(1).split('/')[0]
    : dependency;
  return scoped.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/c\+\+/g, 'cpp')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function assignStableItemIds(
  items: readonly StackSummaryItem[],
): PreparedStackItem[] {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const baseId = `${item.kind}:${item.name.trim().toLowerCase()}`;
    const count = (occurrences.get(baseId) ?? 0) + 1;
    occurrences.set(baseId, count);
    return {
      itemId: count === 1 ? baseId : `${baseId}#${count}`,
      item,
      term: dependencyKeyword(technologyName(item.name)),
    };
  });
}

function legacyRankedBy(
  counts: SkillJudgeResult['counts'],
): 'decision-model' | 'session-model' | 'heuristic' {
  if (counts.decision > 0) return 'decision-model';
  if (counts.normal > 0) return 'session-model';
  return 'heuristic';
}

function makeStage(
  stage: SkillJudgeStageRecord['stage'],
  status: 'failed' | 'skipped',
  category: SkillJudgeStageCategory,
  pairConfigured?: ModelPair,
): SkillJudgeStageRecord {
  return { stage, status, category, ...(pairConfigured && { pairConfigured }), itemsJudged: 0, invalidItemIds: [] };
}

function buildFallbackJudgeResult(
  inputItems: readonly SkillJudgeInputItem[],
  stages: SkillJudgeStageRecord[],
): SkillJudgeResult {
  const candidates = new Map<string, SkillJudgeCandidate>();
  const ambiguous = new Set<string>();
  for (const { candidates: skills } of inputItems) {
    for (const skill of skills) {
      const selectionKey = `${skill.source}/${skill.skillId}`;
      const candidateId = selectionKey.toLowerCase();
      const deprecated = /\bdeprecated\b/i.test(skill.description);
      const existing = candidates.get(candidateId);
      if (existing && existing.selectionKey !== selectionKey) ambiguous.add(candidateId);
      if (!existing || (deprecated && !existing.deprecated)) {
        candidates.set(candidateId, { candidateId, selectionKey, skill, deprecated });
      }
    }
  }

  const items: SkillJudgeItem[] = inputItems.map(({ candidates: skills, ...item }) => {
    const candidateIds = [...new Set(skills.map((s) => `${s.source}/${s.skillId}`.toLowerCase()))];
    return {
      ...item,
      candidateIds,
      candidateAssessments: candidateIds.map((candidateId) => {
        const deprecated = candidates.get(candidateId)?.deprecated === true;
        const eligible = !deprecated && !ambiguous.has(candidateId);
        return {
          candidateId,
          eligible,
          ...(!eligible && {
            rejection: {
              reason: deprecated ? 'Marked deprecated by its description' : 'Candidate identity is ambiguous',
              stage: 'decision' as const,
            },
          }),
        };
      }),
      outcomes: [],
      judgedBy: 'none',
    };
  });

  return {
    method: 'none',
    counts: { decision: 0, normal: 0, notJudged: items.length },
    items,
    candidates: [...candidates.values()],
    proposals: [],
    stages,
  };
}

function finalizeRecommendations(
  skills: SkillRecommendation[],
): SkillRecommendation[] {
  skills.sort(compareRecommendations);
  skills.forEach((skill, index) => {
    skill.rank = index + 1;
  });
  return skills;
}

function buildInstallRecommendations(
  judge: SkillJudgeResult,
): SkillRecommendation[] {
  const candidateById = new Map(
    judge.candidates.map((c) => [c.candidateId, c]),
  );
  const selectedById = new Map<
    string,
    { rec: SkillRecommendation; evidenceNames: string[] }
  >();

  for (const judgeItem of judge.items) {
    for (const outcome of judgeItem.outcomes) {
      if (outcome.verdict !== 'install') continue;
      const candidate = candidateById.get(outcome.candidateId);
      if (!candidate) continue;

      const existing = selectedById.get(outcome.candidateId);
      if (existing) {
        if (!existing.evidenceNames.includes(judgeItem.item.name)) {
          existing.evidenceNames.push(judgeItem.item.name);
          existing.rec.evidence = existing.evidenceNames.join(', ');
        }
        continue;
      }

      const rec: SkillRecommendation = {
        skill: candidate.skill,
        evidence: judgeItem.item.name,
        score: 100 + Math.log10(1 + Math.max(0, candidate.skill.installs)),
        rankedBy:
          outcome.stage === 'decision' ? 'decision-model' : 'session-model',
        reason: outcome.reason,
      };
      selectedById.set(outcome.candidateId, {
        rec,
        evidenceNames: [judgeItem.item.name],
      });
    }
  }

  return finalizeRecommendations(
    [...selectedById.values()].map(({ rec }) => rec),
  );
}

function buildHeuristicRecommendations(
  judge: SkillJudgeResult,
  termByItemId: ReadonlyMap<string, string>,
): SkillRecommendation[] {
  const candidateById = new Map(
    judge.candidates.map((c) => [c.candidateId, c]),
  );
  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  const skills: SkillRecommendation[] = [];
  const evidenceNames = new Map<SkillRecommendation, string[]>();
  const skillByTerm = new Map<string, SkillRecommendation>();

  const identity = (skill: SkillShEntry) => ({
    id: `${skill.source}/${skill.skillId}`.toLowerCase(),
    name: skill.name.toLowerCase(),
  });
  const appendEvidence = (rec: SkillRecommendation, name: string): void => {
    const names = evidenceNames.get(rec);
    if (!names || names.includes(name)) return;
    names.push(name);
    rec.evidence = names.join(', ');
  };

  for (const judgeItem of judge.items) {
    const eligible = judgeItem.candidateAssessments.flatMap((a) => {
      if (!a.eligible) return [];
      const c = candidateById.get(a.candidateId);
      return c ? [c] : [];
    });
    if (!eligible.length) continue;

    const term = termByItemId.get(judgeItem.itemId);
    const sameTermChoice = term ? skillByTerm.get(term) : undefined;
    if (sameTermChoice) {
      appendEvidence(sameTermChoice, judgeItem.item.name);
      continue;
    }

    const best = eligible.find((c) => {
      const { id, name } = identity(c.skill);
      return !usedIds.has(id) && !usedNames.has(name);
    });
    if (best) {
      const { id, name } = identity(best.skill);
      usedIds.add(id);
      usedNames.add(name);
      const rec: SkillRecommendation = {
        skill: best.skill,
        evidence: judgeItem.item.name,
        score: 100 + Math.log10(1 + Math.max(0, best.skill.installs)),
        rankedBy: 'heuristic',
      };
      skills.push(rec);
      evidenceNames.set(rec, [judgeItem.item.name]);
      if (term) skillByTerm.set(term, rec);
      continue;
    }

    const covering = skills.find((chosen) =>
      eligible.some((c) => {
        const left = identity(chosen.skill);
        const right = identity(c.skill);
        return left.id === right.id || left.name === right.name;
      }),
    );
    if (covering) {
      appendEvidence(covering, judgeItem.item.name);
      if (term) skillByTerm.set(term, covering);
    }
  }

  return finalizeRecommendations(skills);
}

@injectable()
export class SkillRecommendationService {
  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(SKILL_JUDGE_SERVICE, { isOptional: true })
    private readonly skillJudge?: Pick<SkillJudgeService, 'judge'>,
  ) {}

  async recommendAnalysis(
    input: AnalysisSkillRecommendationInput,
  ): Promise<WizardRecommendAnalysisSkillsResult> {
    const rpcEntry = input.rpcEntry ?? Date.now();
    const searchDeadlineAt = rpcEntry + SEARCH_DEADLINE_MS;
    const hardDeadlineAt = rpcEntry + HARD_DEADLINE_MS;

    const prepared = assignStableItemIds(input.items);
    const termByItemId = new Map<string, string>();
    const bucketByTerm = new Map<string, TermBucket>();
    const buckets: TermBucket[] = [];

    for (const entry of prepared) {
      termByItemId.set(entry.itemId, entry.term);
      if (!bucketByTerm.has(entry.term)) {
        const bucket: TermBucket = {
          term: entry.term,
          firstItemName: entry.item.name,
          started: false,
          status: 'not-searched',
          entries: [],
          failure: BUDGET_FAILURE,
        };
        bucketByTerm.set(entry.term, bucket);
        buckets.push(bucket);
      }
    }

    await this.runBoundedSearch(buckets, input.search, searchDeadlineAt);

    const candidatesByTerm = new Map<string, SkillShEntry[]>();
    for (const bucket of buckets) {
      if (bucket.status !== 'searched') continue;
      candidatesByTerm.set(
        bucket.term,
        this.filterAndSortCandidates(bucket.entries, bucket.term, bucket.firstItemName),
      );
    }

    const unmatchedItems: StackSummaryItem[] = [];
    const searchFailures: { item: string; reason: string }[] = [];
    const judgeInputItems: SkillJudgeInputItem[] = prepared.map(({ itemId, item, term }) => {
      const bucket = bucketByTerm.get(term);
      if (!bucket || bucket.status === 'not-searched') {
        return { itemId, item, registry: 'not-searched', registryFailure: bucket?.failure ?? BUDGET_FAILURE, candidates: [] };
      }
      if (bucket.status === 'failed') {
        const failure = bucket.failure ?? { kind: 'registry-error' as const, reason: 'Search failed' };
        searchFailures.push({ item: item.name, reason: failure.reason });
        return { itemId, item, registry: 'search-failed', registryFailure: failure, candidates: [] };
      }
      const matched = candidatesByTerm.get(term) ?? [];
      if (matched.length === 0) {
        unmatchedItems.push(item);
        return { itemId, item, registry: 'no-match', candidates: [] };
      }
      return { itemId, item, registry: 'matched', candidates: matched };
    });

    const judge = await this.runJudgeWithDeadline(input, rpcEntry, hardDeadlineAt, judgeInputItems);
    const skills =
      judge.method === 'none'
        ? buildHeuristicRecommendations(judge, termByItemId)
        : buildInstallRecommendations(judge);

    return {
      skills,
      judge,
      analysisPair: input.analysisPair
        ? { provider: input.analysisPair.provider, model: input.analysisPair.model }
        : null,
      rankedBy: legacyRankedBy(judge.counts),
      detectedItems: input.items.slice(),
      unmatchedItems,
      searchFailures,
      summarySource: input.summarySource,
    };
  }

  private async runBoundedSearch(
    buckets: TermBucket[],
    search: SkillCatalogSearch,
    searchDeadlineAt: number,
  ): Promise<void> {
    const searchableCount = Math.min(buckets.length, MAX_TERMS);
    if (searchableCount === 0) return;

    let searchSettled = false;
    let next = 0;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const workerCount = Math.min(SEARCH_WORKERS, searchableCount);
    const workers = Array.from({ length: workerCount }, async () => {
      while (!searchSettled && next < searchableCount) {
        const remainingMs = searchDeadlineAt - Date.now();
        if (remainingMs < MIN_SEARCH_REMAINING_MS) break;
        const bucket = buckets[next++];
        bucket.started = true;
        const timeoutMs = Math.min(
          SEARCH_TIMEOUT_MS,
          Math.max(0, remainingMs),
        );
        try {
          const entries = await searchWithTimeout(
            search,
            bucket.term,
            timeoutMs,
          );
          if (searchSettled) return;
          bucket.status = 'searched';
          bucket.entries = entries;
          bucket.failure = undefined;
        } catch (error: unknown) {
          if (searchSettled) return;
          const timedOut =
            error instanceof Error && error.message === 'Search timed out';
          const reason = timedOut ? 'Search timed out' : 'Search failed';
          bucket.status = 'failed';
          bucket.entries = [];
          bucket.failure = timedOut
            ? TIMED_OUT_FAILURE
            : { kind: 'registry-error', reason };
          this.logger.warn('[SkillRecommendation] skills.sh search failed', {
            item: bucket.firstItemName,
            reason,
          });
        }
      }
    });

    try {
      await Promise.race([
        Promise.all(workers),
        new Promise<void>((resolve) => {
          deadlineTimer = setTimeout(
            resolve,
            Math.max(0, searchDeadlineAt - Date.now()),
          );
        }),
      ]);
    } finally {
      searchSettled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }

    for (let i = 0; i < searchableCount; i++) {
      const bucket = buckets[i];
      if (bucket.started && bucket.status === 'not-searched') {
        bucket.status = 'failed';
        bucket.entries = [];
        bucket.failure = TIMED_OUT_FAILURE;
        this.logger.warn('[SkillRecommendation] skills.sh search failed', {
          item: bucket.firstItemName,
          reason: TIMED_OUT_FAILURE.reason,
        });
      }
    }
  }

  private filterAndSortCandidates(
    rawEntries: readonly SkillShEntry[],
    term: string,
    logItemName: string,
  ): SkillShEntry[] {
    const scored: ScoredCandidate[] = [];
    for (const rawEntry of rawEntries) {
      const parsed = recommendationEntrySchema.safeParse(rawEntry);
      if (!parsed.success) {
        this.logger.debug(
          '[SkillRecommendation] Invalid registry row dropped',
          { item: logItemName },
        );
        continue;
      }
      const entry = parsed.data;
      const words = [...tokenize(entry.skillId), ...tokenize(entry.name)];
      const pairs = words
        .slice(0, -1)
        .map((word, position) => word + words[position + 1]);
      const complete = [entry.skillId, entry.name].some(
        (value) => dependencyKeyword(value) === term,
      );
      if (
        term.length < 2 ||
        (!complete &&
          !words.includes(term) &&
          (term.length < 3 || !pairs.includes(term)))
      ) {
        continue;
      }
      const trimmed = entry.description.trim();
      scored.push({
        skill: {
          ...entry,
          description:
            trimmed || `${entry.source} - ${entry.installs} installs`,
        },
        score: 100 + Math.log10(1 + Math.max(0, entry.installs)),
        described: Boolean(trimmed),
      });
    }

    scored.sort(
      (a, b) =>
        Number(b.described) - Number(a.described) ||
        compareRecommendations(a, b),
    );
    return scored.map(({ skill }) => skill);
  }

  private async runJudgeWithDeadline(
    input: AnalysisSkillRecommendationInput,
    rpcEntry: number,
    hardDeadlineAt: number,
    judgeInputItems: readonly SkillJudgeInputItem[],
  ): Promise<SkillJudgeResult> {
    const pairConfigured = input.resolved
      ? { provider: input.resolved.providerId, model: input.resolved.model }
      : undefined;
    const fallback = (
      decisionCategory: SkillJudgeStageCategory,
      normalStatus: 'failed' | 'skipped',
      normalCategory: SkillJudgeStageCategory,
    ) =>
      buildFallbackJudgeResult(judgeInputItems, [
        makeStage('decision', 'skipped', decisionCategory),
        makeStage('normal', normalStatus, normalCategory, pairConfigured),
      ]);

    if (!this.skillJudge || !input.resolved) {
      return fallback('unavailable', 'skipped', 'unavailable');
    }

    const remainingHardMs = hardDeadlineAt - Date.now();
    if (remainingHardMs <= 0) {
      return fallback('timed-out', 'failed', 'timed-out');
    }

    const timedOut = Symbol('Skill judge hard deadline');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        this.skillJudge.judge({
          workspaceRoot: input.workspaceRoot,
          rpcEntry,
          resolved: input.resolved,
          items: judgeInputItems,
        }),
        new Promise<typeof timedOut>((resolve) => {
          timer = setTimeout(() => resolve(timedOut), remainingHardMs);
        }),
      ]);
      if (outcome !== timedOut) return outcome;
      this.logger.warn('[SkillRecommendation] Skill judge hit hard deadline');
      return fallback('timed-out', 'failed', 'timed-out');
    } catch {
      // degradation-audit: reported - unexpected judge errors preserve registry candidates.
      this.logger.warn('[SkillRecommendation] Skill judge failed unexpectedly');
      return fallback('unavailable', 'failed', 'provider-error');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async recommend(
    input: SkillRecommendationInput,
  ): Promise<SkillRecommendation[]> {
    // Map each keyword to the first dependency that proves it.
    const proof = new Map<string, string>();
    for (const dep of input.dependencies) {
      const keyword = dependencyKeyword(dep);
      if (keyword.length >= 2 && !proof.has(keyword)) proof.set(keyword, dep);
    }

    const keywords = [...proof.keys()].slice(0, 25);
    if (proof.size > keywords.length)
      this.logger.debug('[SkillRecommendation] keyword list cut to 25');
    const results: SkillShEntry[][] = new Array(keywords.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, keywords.length) }, async () => {
        while (next < keywords.length) {
          const index = next++;
          const keyword = keywords[index];
          try {
            results[index] = await searchWithTimeout(input.search, keyword);
          } catch (error: unknown) {
            this.logger.warn('[SkillRecommendation] skills.sh search failed', {
              keyword,
              error: error instanceof Error ? error.message : String(error),
            });
            results[index] = [];
          }
        }
      }),
    );
    const byKey = new Map<string, SkillRecommendation>();
    for (const [index, keyword] of keywords.entries()) {
      const entries = results[index];
      for (const rawEntry of entries) {
        const parsed = recommendationEntrySchema.safeParse(rawEntry);
        if (!parsed.success) {
          this.logger.debug(
            '[SkillRecommendation] Invalid registry row dropped',
            { keyword },
          );
          continue;
        }
        const entry = parsed.data;
        const tokens = new Set([
          ...tokenize(entry.skillId),
          ...tokenize(entry.name),
        ]);
        if (!tokens.has(keyword)) continue;
        const dep = proof.get(keyword) as string;
        const key = `${entry.source}/${entry.skillId}`;
        const score = 100 + Math.log10(1 + Math.max(0, entry.installs));
        const existing = byKey.get(key);
        if (!existing || existing.score < score) {
          byKey.set(key, {
            skill: entry,
            evidence: `Declared dependency "${dep}" matches skill "${entry.skillId}"`,
            score,
          });
        }
      }
    }

    return [...byKey.values()].sort(
      (a, b) =>
        b.score - a.score || a.skill.skillId.localeCompare(b.skill.skillId),
    );
  }
}
