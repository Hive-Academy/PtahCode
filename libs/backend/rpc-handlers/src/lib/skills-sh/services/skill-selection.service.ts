/**
 * Skill Selection Service
 *
 * Applies the relevance gate to skill recommendations. Only recommended
 * skills can be selected. A user selection can only narrow the set.
 *
 * @module @ptah-extension/agent-generation/services
 */

import { injectable, inject } from 'tsyringe';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import type { SkillRecommendation, SkillShEntry } from '@ptah-extension/shared';

export interface SelectedSkill {
  skill: SkillShEntry;
  evidence: string;
  score: number;
  /** 1-based install order. */
  installOrder: number;
}

@injectable()
export class SkillSelectionService {
  constructor(@inject(TOKENS.LOGGER) private readonly logger: Logger) {}

  /**
   * @param recommendations - Output of the recommendation service
   * @param userSelections - Optional skill ids chosen by the user
   */
  select(
    recommendations: readonly SkillRecommendation[],
    userSelections?: readonly string[],
  ): SelectedSkill[] {
    const wanted = userSelections ? new Set(userSelections) : undefined;
    const seen = new Set<string>();
    const gated = recommendations
      .filter((r) => r.score > 0 && r.evidence.length > 0)
      .filter((r) => !wanted || wanted.has(r.skill.skillId))
      .filter((r) => {
        const key = `${r.skill.source}/${r.skill.skillId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          b.score - a.score || a.skill.skillId.localeCompare(b.skill.skillId),
      );

    if (wanted && gated.length < wanted.size) {
      this.logger.debug('[SkillSelection] ignored non-recommended skills', {
        requested: wanted.size,
        selected: gated.length,
      });
    }

    return gated.map((r, i) => ({
      skill: r.skill,
      evidence: r.evidence,
      score: r.score,
      installOrder: i + 1,
    }));
  }
}
