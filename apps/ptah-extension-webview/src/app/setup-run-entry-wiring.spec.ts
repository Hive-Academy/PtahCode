import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SETUP_RUN_ENTRY } from '@ptah-extension/core';
import {
  SetupRunEntryService,
  SetupRunStore,
} from '@ptah-extension/setup-wizard/app';
import { appConfig } from './app.config';

@Component({ template: '' })
class SetupRouteComponent {}

describe('webview Setup run entry wiring', () => {
  const runningCount = signal(0);
  const activeRun = jest.fn();
  const targetOf = jest.fn();

  beforeEach(() => {
    runningCount.set(0);
    activeRun.mockReset().mockReturnValue(null);
    targetOf.mockReset();
    TestBed.configureTestingModule({
      providers: [
        // Load the app's registration without starting host-specific initializers.
        ...appConfig.providers.filter(
          (provider) =>
            'provide' in provider && provider.provide === SETUP_RUN_ENTRY,
        ),
        provideRouter([
          { path: 'onboarding', component: SetupRouteComponent },
          { path: 'onboarding/analyze/skills', component: SetupRouteComponent },
          { path: 'onboarding/analyze/generate', component: SetupRouteComponent },
        ]),
        {
          provide: SetupRunStore,
          useValue: {
            activeRun,
            targetOf,
            attentionCount: signal(0),
            runningCount,
          },
        },
      ],
    });
  });

  it('resolves the real renderer provider to the Setup run entry singleton', () => {
    const entry = TestBed.inject(SETUP_RUN_ENTRY);
    expect(entry).toBe(TestBed.inject(SetupRunEntryService));
    runningCount.set(1);
    expect(entry.runningCount()).toBe(1);
  });

  it('reopens the active run step from a different Setup child route', async () => {
    activeRun.mockReturnValue({ id: 'agents-1' });
    targetOf.mockReturnValue({
      subPath: ['analyze', 'generate'],
      queryParams: { tab: 'agents-1' },
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/onboarding/analyze/skills');

    expect(await TestBed.inject(SETUP_RUN_ENTRY).openSetup()).toBe('navigated');
    expect(router.url).toBe('/onboarding/analyze/generate?tab=agents-1');
  });
});
