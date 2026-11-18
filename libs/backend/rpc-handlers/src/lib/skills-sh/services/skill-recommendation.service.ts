/**
 * Skill Recommendation Service
 *
 * Ranks skills.sh entries against the dependencies a project declares.
 * A skill is recommended only when a declared dependency proves its
 * technology. The evidence field names that dependency.
 *
 * @module @ptah-extension/agent-generation/services
 */

import { injectable, inject } from 'tsyringe';
import { z } from 'zod';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import type {
  DeepProjectAnalysis,
  SkillRecommendation,
  SkillShEntry,
  StackSummaryItem,
  WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';

import type { SkillRankingService } from './skill-ranking.service';
import { SKILL_RANKING_SERVICE } from '../../di/tokens';
import type { SkillRankingRequest } from './skill-ranking.types';

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
}

const SEARCH_TIMEOUT_MS = 8_000;
const MAX_TERMS = 30;

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
  a: SkillRecommendation,
  b: SkillRecommendation,
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
): Promise<SkillShEntry[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Search timed out')),
      SEARCH_TIMEOUT_MS,
    );
    search(query).then(
      (entries) => {
        clearTimeout(timer);
        resolve(entries);
      },
      (error: unknown) => {
        clearTimeout(timer);
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

@injectable()
export class SkillRecommendationService {
  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(SKILL_RANKING_SERVICE, { isOptional: true })
    private readonly ranker?: SkillRankingService,
  ) {}

  async recommendAnalysis(
    input: AnalysisSkillRecommendationInput,
  ): Promise<WizardRecommendAnalysisSkillsResult> {
    const needs = new Map<string, StackSummaryItem>();
    for (const item of input.items) {
      const term = dependencyKeyword(technologyName(item.name));
      if (!needs.has(term)) needs.set(term, item);
    }
    const detectedItems = [...needs.values()].slice(0, MAX_TERMS);
    const results: SkillShEntry[][] = new Array(detectedItems.length);
    const failures: { item: string; reason: string }[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, detectedItems.length) }, async () => {
        while (next < detectedItems.length) {
          const index = next++;
          const item = detectedItems[index];
          try {
            results[index] = await searchWithTimeout(
              input.search,
              dependencyKeyword(technologyName(item.name)),
            );
          } catch (error: unknown) {
            const reason =
              error instanceof Error && error.message === 'Search timed out'
                ? 'Search timed out'
                : 'Search failed';
            failures.push({ item: item.name, reason });
            this.logger.warn('[SkillRecommendation] skills.sh search failed', {
              item: item.name,
              reason,
            });
            results[index] = [];
          }
        }
      }),
    );

    const usedIds = new Set<string>();
    const usedNames = new Set<string>();
    const skills: SkillRecommendation[] = [];
    const unmatchedItems: StackSummaryItem[] = [];
    const collected: (SkillRecommendation & { described: boolean })[][] = [];
    for (const [index, item] of detectedItems.entries()) {
      const term = dependencyKeyword(technologyName(item.name));
      const candidates: (SkillRecommendation & { described: boolean })[] = [];
      for (const rawEntry of results[index] ?? []) {
        const parsed = recommendationEntrySchema.safeParse(rawEntry);
        if (!parsed.success) {
          this.logger.debug(
            '[SkillRecommendation] Invalid registry row dropped',
            { item: item.name },
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
        )
          continue;
        const score = 100 + Math.log10(1 + Math.max(0, entry.installs));
        candidates.push({
          skill: {
            ...entry,
            description:
              entry.description.trim() ||
              `${entry.source} - ${entry.installs} installs`,
          },
          evidence: item.name,
          score,
          described: Boolean(entry.description.trim()),
        });
      }
      candidates.sort(
        (a, b) =>
          Number(b.described) - Number(a.described) ||
          compareRecommendations(a, b),
      );
      collected.push(candidates);
    }
    const rankingItems: SkillRankingRequest['items'] = Object.fromEntries(
      detectedItems.map((item, index) => [
        String(index),
        {
          kind: item.kind,
          name: item.name,
          candidates: collected[index].map((candidate, candidateIndex) => ({
            label: String(candidateIndex),
            name: candidate.skill.name,
            source: candidate.skill.source,
            skillId: candidate.skill.skillId,
            installs: candidate.skill.installs,
            description: candidate.described ? candidate.skill.description : '',
          })),
        },
      ]),
    );
    let ranking: Awaited<ReturnType<SkillRankingService['rank']>> | undefined;
    if (this.ranker && input.workspaceRoot) {
      try {
        ranking = await this.ranker.rank({
          workspaceRoot: input.workspaceRoot,
          items: rankingItems,
        });
      } catch (error: unknown) {
        // degradation-audit: reported - unexpected ranker failures preserve the existing selection flow.
        this.logger.debug('[SkillRecommendation] Ranking unavailable', {
          error: String(error),
        });
      }
    }
    for (const [index, item] of detectedItems.entries()) {
      const candidates = collected[index];
      const order = ranking?.items[String(index)]?.order;
      const ordered = order
        ? order
            .map((label) => candidates[Number(label)])
            .filter(
              (candidate): candidate is (typeof candidates)[number] =>
                candidate !== undefined,
            )
        : candidates;
      const identity = (candidate: SkillRecommendation) => ({
        id: `${candidate.skill.source}/${candidate.skill.skillId}`.toLowerCase(),
        name: candidate.skill.name.toLowerCase(),
      });
      // Use the highest-ranked candidate not already selected for an earlier item.
      const best = ordered.find((candidate) => {
        const { id, name } = identity(candidate);
        return !usedIds.has(id) && !usedNames.has(name);
      });
      if (best) {
        const { id, name } = identity(best);
        usedIds.add(id);
        usedNames.add(name);
        const itemRanking = ranking?.items[String(index)];
        skills.push({
          skill: best.skill,
          evidence: best.evidence,
          score: best.score,
          rankedBy: itemRanking?.rankedBy ?? 'heuristic',
          ...(itemRanking?.reason === undefined
            ? {}
            : { reason: itemRanking.reason }),
        });
      } else if (candidates.length) {
        const covering = skills.find((chosen) =>
          candidates.some((candidate) => {
            const left = identity(chosen);
            const right = identity(candidate);
            return left.id === right.id || left.name === right.name;
          }),
        );
        if (covering) covering.evidence += `, ${item.name}`;
      } else if (
        candidates.length === 0 &&
        !failures.some((failure) => failure.item === item.name)
      ) {
        unmatchedItems.push(item);
      }
    }
    skills.sort(compareRecommendations);
    skills.forEach((skill, index) => {
      skill.rank = index + 1;
    });
    return {
      skills,
      detectedItems,
      unmatchedItems,
      searchFailures: failures,
      rankedBy: ranking?.rankedBy ?? 'heuristic',
      summarySource: input.summarySource,
    };
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
