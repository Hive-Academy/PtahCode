import { onboardingStepLink } from './onboarding-step-link';

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
