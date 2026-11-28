import { ONBOARDING_QUERY } from '@ptah-extension/core';
import {
  stepTarget,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';


export type OnboardingStepId =
  | 'analyze' | 'skills' | 'guidance' | 'done'
  | 'guidance-only' | 'new-project' | 'team-builder';

const STEP_PATHS: Readonly<Record<OnboardingStepId, readonly string[]>> = {
  analyze: ['analyze'],
  skills: ['analyze', 'skills'],
  guidance: ['analyze', 'guidance'],
  done: ['analyze', 'done'],
  'guidance-only': ['guidance'],
  'new-project': ['new-project'],
  'team-builder': ['team-builder'],
};

export interface OnboardingStepLink {
  readonly commands: readonly string[];
  readonly queryParams: Readonly<Record<string, string>>;
}


export function onboardingStepLink(
  from: OnboardingStepId,
  to: OnboardingStepId,
  identity: Readonly<Record<string, unknown>>,
): OnboardingStepLink {
  const sameAnalyzeFlow =
    ['analyze', 'skills', 'guidance', 'done'].includes(from) &&
    ['analyze', 'skills', 'guidance', 'done'].includes(to);
  const keys = sameAnalyzeFlow
    ? [ONBOARDING_QUERY.analysis, ONBOARDING_QUERY.tab, ONBOARDING_QUERY.run]
    : from === 'guidance-only' && to === 'guidance-only'
      ? [ONBOARDING_QUERY.tab]
      : [];
  const queryParams: Record<string, string> = {};

  for (const key of keys) {
    const value = identity[key];
    if (typeof value === 'string' && value) queryParams[key] = value;
  }
  return { commands: ['/onboarding', ...STEP_PATHS[to]], queryParams };
}

/**
 * Where Setup opens a run record: `stepTarget` (setup-run-steps) as router
 * commands. Every run entry point that holds a `SetupRunRecord` navigates
 * through this, so a run always re-opens at the same place.
 */
export function setupRunStepLink(record: SetupRunRecord): OnboardingStepLink {
  const target = stepTarget(record);
  return {
    commands: ['/onboarding', ...target.subPath],
    queryParams: target.queryParams,
  };
}
