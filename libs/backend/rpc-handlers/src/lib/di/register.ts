/**
 * Skills Service DI Registration
 *
 * Registers the skill recommendation, guidance, selection and consent services
 * owned by the skills.sh RPC surface.
 */

import { DependencyContainer, Lifecycle } from 'tsyringe';
import {
  SKILL_RECOMMENDATION_SERVICE,
  SKILL_PROJECT_GUIDANCE_SERVICE,
  SKILL_SELECTION_SERVICE,
  SKILL_CONSENT_SERVICE,
} from './tokens';
import {
  SkillRecommendationService,
  ProjectGuidanceService,
  SkillSelectionService,
  SkillConsentService,
} from '../skills-sh/services';

/**
 * Register all skill services in DI container
 *
 * @param container - TSyringe DI container
 */
export function registerSkillServices(container: DependencyContainer): void {
  container.register(
    SKILL_RECOMMENDATION_SERVICE,
    { useClass: SkillRecommendationService },
    { lifecycle: Lifecycle.Singleton },
  );

  container.register(
    SKILL_PROJECT_GUIDANCE_SERVICE,
    { useClass: ProjectGuidanceService },
    { lifecycle: Lifecycle.Singleton },
  );

  container.register(
    SKILL_SELECTION_SERVICE,
    { useClass: SkillSelectionService },
    { lifecycle: Lifecycle.Singleton },
  );

  container.register(
    SKILL_CONSENT_SERVICE,
    { useClass: SkillConsentService },
    { lifecycle: Lifecycle.Singleton },
  );
}
