/**
 * Skills Service DI Registration
 *
 * Registers the skill recommendation, guidance, selection and consent services
 * owned by the skills.sh RPC surface.
 */

import {
  DependencyContainer,
  Lifecycle,
} from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
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
 * This must be called after vscode-core services are registered,
 * as skill services depend on Logger.
 *
 * @param container - TSyringe DI container
 * @param logger - Logger instance for debugging
 */
export function registerSkillServices(
  container: DependencyContainer,
  logger: Logger,
): void {
  logger.info('[SkillServices] Registering skill services...');

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

  logger.info('[SkillServices] Skill services registered');
}
