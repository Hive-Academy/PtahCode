import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppStateManager, VSCodeService } from '@ptah-extension/core';
import { OnboardingFlagService } from './first-run/onboarding-flag.service';
import { ONBOARDING_ROUTES } from './onboarding.routes';

function stubPage(selector: string) {
  @Component({ selector, standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, template: '<p>Page</p>' })
  class StubPage {}
  return StubPage;
}
jest.mock('./home/onboarding-home.component', () => ({ OnboardingHomeComponent: stubPage('ptah-onboarding-home') }));
jest.mock('./ready/ready-connection-step.page', () => ({ ReadyConnectionStepPage: stubPage('ptah-ready-connection-step') }));
jest.mock('./ready/ready-settings-step.page', () => ({ READY_SETTINGS_PROVIDERS: [], ReadySettingsStepPage: stubPage('ptah-ready-settings-step') }));
jest.mock('./analyze/analyze-workspace.page', () => ({ AnalyzeWorkspacePage: stubPage('ptah-analyze-workspace-page') }));
jest.mock('./analyze/analyze-skills.page', () => ({ AnalyzeSkillsPage: stubPage('ptah-analyze-skills-page') }));
jest.mock('./analyze/project-guidance.page', () => ({ ProjectGuidancePage: stubPage('ptah-project-guidance-page') }));
jest.mock('./analyze/analyze-done.page', () => ({ AnalyzeDonePage: stubPage('ptah-analyze-done-page') }));
jest.mock('./proposal/new-project-intake.page', () => ({ NewProjectIntakePage: stubPage('ptah-new-project-intake-page') }));
jest.mock('./proposal/team-builder-start.page', () => ({ TeamBuilderStartPage: stubPage('ptah-team-builder-start-page') }));


describe('ONBOARDING_ROUTES', () => {
  function configure(): Router {
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'onboarding', children: ONBOARDING_ROUTES }]),
      { provide: VSCodeService, useValue: { isElectron: true } },
      { provide: OnboardingFlagService, useValue: { markDismissed: jest.fn() } },
      { provide: AppStateManager, useValue: { setCurrentView: jest.fn() } },
    ] });
    return TestBed.inject(Router);
  }
  afterEach(() => TestBed.resetTestingModule());
  it.each(['/onboarding/analyze/agents?tab=t', '/onboarding/analyze/generate?tab=t'])(
    'redirects %s to Review skills and keeps tab', async (url) => {
      const router = configure();
      await router.navigateByUrl(url);
      expect(router.url).toBe('/onboarding/analyze/skills?tab=t');
    },
  );
  it('resolves the Review skills page', async () => {
    const router = configure();
    await router.navigateByUrl('/onboarding/analyze/skills');
    expect(router.url).toBe('/onboarding/analyze/skills');

  });
});
