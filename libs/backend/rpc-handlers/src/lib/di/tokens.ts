/**
 * DI Token Registry - RPC Handlers Tokens
 *
 * Skill service tokens owned by the skills.sh RPC surface.
 *
 * CONVENTION: All DI tokens MUST use Symbol.for('DescriptiveName')
 *
 * Why Symbol.for():
 * - Symbol.for() creates globally shared symbols (same description = same symbol)
 * - String tokens ('Name') and Symbol.for('Name') are different — causes silent DI failures
 * - Plain Symbol('Name') !== Symbol('Name') — creates unique symbols per call
 * - Symbol.for('Name') === Symbol.for('Name') — always matches, even across modules
 */

/** SkillRecommendationService - dependency-proven skills.sh recommendations */
export const SKILL_RECOMMENDATION_SERVICE = Symbol.for(
  'SkillRecommendationService',
);

/** SkillRankingService - model ranking with heuristic fallback. */
export const SKILL_RANKING_SERVICE = Symbol.for('SkillRankingService');

/** SkillJudgeService - two-stage AI judge for stack skill verdicts */
export const SKILL_JUDGE_SERVICE = Symbol.for('SkillJudgeService');

/** SkillDraftGenerationService - Setup-backed SKILL.md draft generation */
export const SKILL_DRAFT_GENERATION_SERVICE = Symbol.for(
  'SkillDraftGenerationService',
);

/** ProjectGuidanceService - labeled project facts and owner decision prompt */
export const SKILL_PROJECT_GUIDANCE_SERVICE = Symbol.for(
  'ProjectGuidanceService',
);

/** SkillSelectionService - relevance gate for skill selection */
export const SKILL_SELECTION_SERVICE = Symbol.for('SkillSelectionService');

/** SkillConsentService - script detection and content-hash consent */
export const SKILL_CONSENT_SERVICE = Symbol.for('SkillConsentService');
