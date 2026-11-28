import type { SetupRunRecord } from '@ptah-extension/setup-wizard';
import { onboardingStepLink, setupRunStepLink } from './onboarding-step-link';

describe('onboardingStepLink', () => {
  it('links Analyze to Review skills with the saved analysis identity', () => {
    expect(onboardingStepLink('analyze', 'skills', {
      analysis: 'saved', tab: 'tab', run: 'run',
    })).toEqual({
      commands: ['/onboarding', 'analyze', 'skills'],
      queryParams: { analysis: 'saved', tab: 'tab', run: 'run' },
    });
  });
  it('drops unrelated query values', () => {
    expect(onboardingStepLink('new-project', 'team-builder', {
      analysis: 'saved', tab: 'tab',
    }).queryParams).toEqual({});
  });
});

describe('setupRunStepLink', () => {
  function record(
    overrides: Partial<SetupRunRecord> = {},
  ): SetupRunRecord {
    return {
      id: 'setup-1',
      workspacePath: '/workspace',
      workflow: 'analysis',
      status: 'running',
      step: 'analyzing',
      backendRunId: 'run-1',
      analysisRunId: null,
      parentId: null,
      unseen: false,
      createdAt: 1,
      updatedAt: 1,
      ...overrides,
    };
  }
  it('derives a running analysis from stepTarget', () => {
    expect(setupRunStepLink(record())).toEqual({
      commands: ['/onboarding', 'analyze'],
      queryParams: { tab: 'setup-1', analysis: 'run-1' },
    });
  });
  it('carries the analysis id for a completed analysis', () => {
    expect(
      setupRunStepLink(
        record({
          status: 'completed',
          analysisRunId: 'run-1',
        }),
      ),
    ).toEqual({
      commands: ['/onboarding', 'analyze', 'skills'],
      queryParams: { tab: 'setup-1', analysis: 'run-1' },
    });
  });
});
