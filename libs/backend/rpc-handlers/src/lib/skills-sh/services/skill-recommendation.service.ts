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
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import type {
  DeepProjectAnalysis,
  SkillRecommendation,
  SkillShEntry,
} from '@ptah-extension/shared';

/** Search function for the skills.sh catalog. */
export type SkillCatalogSearch = (query: string) => Promise<SkillShEntry[]>;

export interface SkillRecommendationInput {
  analysis: DeepProjectAnalysis;
  /** Names of the dependencies the project declares (package.json keys). */
  dependencies: readonly string[];
  search: SkillCatalogSearch;
}

/** Derive the technology keyword from a dependency name. */
export function dependencyKeyword(dependency: string): string {
  const scoped = dependency.startsWith('@')
    ? dependency.slice(1).split('/')[0]
    : dependency;
  return scoped.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

@injectable()
export class SkillRecommendationService {
  constructor(@inject(TOKENS.LOGGER) private readonly logger: Logger) {}

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
            results[index] = await input.search(keyword);
          } catch (error) {
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
      for (const entry of entries) {
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
