/**
 * Skills.sh Setup Services
 *
 * Services for skill recommendation, guidance, selection and consent.
 * Owned by the skills.sh RPC surface, independent of agent-generation.
 */

export { SkillRecommendationService } from './skill-recommendation.service';
export { SkillRankingService } from './skill-ranking.service';
export type { SkillRankingRequest, SkillRankingResult, SkillRankingMethod } from './skill-ranking.types';
export { ProjectGuidanceService } from './project-guidance.service';
export { SkillSelectionService } from './skill-selection.service';
export { SkillConsentService } from './skill-consent.service';
