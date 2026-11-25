import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppStateManager } from '@ptah-extension/core';
import type { ModelPair, SkillJudgeStageRecord } from '@ptah-extension/shared';
import { OnboardingFlagService } from '../first-run/onboarding-flag.service';
import { OnboardingAnnouncerService } from './onboarding-announcer.service';
import { OnboardingRunPillService } from './onboarding-run-pill.service';
import { OnboardingShellComponent } from './onboarding-shell.component';
import { OnboardingWorkspaceStore } from './onboarding-workspace.store';
import { signal } from '@angular/core';

@Component({
  selector: 'ptah-test-home-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 tabindex="-1">Home title</h1>`,
})
class HomePageStubComponent {}

@Component({
  selector: 'ptah-test-step-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 tabindex="-1">Step title</h1>`,
})
class StepPageStubComponent {}

describe('OnboardingShellComponent', () => {
  let markDismissed: jest.Mock<void, []>;
  let setCurrentView: jest.Mock<void, [string]>;

  async function open(url: string): Promise<RouterTestingHarness> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    await harness.fixture.whenStable();
    return harness;
  }

  function query<T extends Element>(
    harness: RouterTestingHarness,
    selector: string,
  ): T | null {
    return (harness.fixture.nativeElement as HTMLElement).querySelector<T>(
      selector,
    );
  }

  function queryAll<T extends Element>(
    harness: RouterTestingHarness,
    selector: string,
  ): T[] {
    return Array.from(
      (harness.fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector),
    );
  }

  function badgeTexts(harness: RouterTestingHarness): string[] {
    return queryAll(harness, '[data-testid="onboarding-run-pill-badge"]').map(
      (badge) => badge.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  beforeEach(() => {
    markDismissed = jest.fn<void, []>();
    setCurrentView = jest.fn<void, [string]>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'onboarding',
            component: OnboardingShellComponent,
            children: [
              { path: '', component: HomePageStubComponent },
              { path: 'analyze', component: StepPageStubComponent },
              {
                path: 'new-project',
                component: StepPageStubComponent,
                data: { crumb: 'New project' },
              },
              {
                path: 'team-builder',
                component: StepPageStubComponent,
                data: { crumb: 'AI team builder' },
              },
              {
                path: 'ready',
                data: { crumb: 'Get ready' },
                children: [
                  {
                    path: '',
                    component: StepPageStubComponent,
                    data: { layout: 'wide' },
                  },
                  { path: 'settings', component: StepPageStubComponent },
                ],
              },
            ],
          },
        ]),
        { provide: OnboardingFlagService, useValue: { markDismissed } },
        { provide: AppStateManager, useValue: { setCurrentView } },
        { provide: OnboardingWorkspaceStore, useValue: { isElectron: false, active: signal(null), activePath: signal('/workspace'), folders: signal([]), activeIndex: signal(-1) } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('offers Back to chat on Home, which dismisses onboarding', async () => {
    const harness = await open('/onboarding');
    const back = query<HTMLButtonElement>(
      harness,
      '[data-testid="onboarding-back-to-chat"]',
    );

    expect(back?.textContent?.trim()).toBe('Back to chat');
    expect(query(harness, '[data-testid="onboarding-crumb-home"]')).toBeNull();

    back?.click();
    expect(markDismissed).toHaveBeenCalledTimes(1);
    expect(setCurrentView).toHaveBeenCalledWith('chat');
  });

  it.each([
    ['/onboarding/ready', true],
    ['/onboarding/ready/settings', false],
    ['/onboarding/analyze', false],
  ] as const)(
    'widens the column only for a wide page route (%s)',
    async (url, wide) => {
      const harness = await open(url);
      const column = query<HTMLElement>(
        harness,
        '[data-testid="onboarding-column"]',
      );
      expect(column?.classList.contains('max-w-[1440px]')).toBe(wide);
      expect(column?.classList.contains('max-w-[1120px]')).toBe(!wide);
    },
  );

  it('returns to Home through the first crumb on any other page', async () => {
    const harness = await open('/onboarding/analyze');
    const crumb = query<HTMLAnchorElement>(
      harness,
      '[data-testid="onboarding-crumb-home"]',
    );

    expect(crumb?.getAttribute('href')).toBe('/onboarding');
    expect(
      query(harness, '[data-testid="onboarding-back-to-chat"]'),
    ).toBeNull();
    expect(query(harness, 'nav[aria-label="Breadcrumb"]')).not.toBeNull();
  });

  it.each(['/onboarding/ready', '/onboarding/ready/settings'])(
    'renders the route crumb as the second crumb on %s ("Onboarding / Get ready")',
    async (url) => {
      const harness = await open(url);
      expect(
        query(
          harness,
          '[data-testid="onboarding-crumb-home"]',
        )?.textContent?.trim(),
      ).toBe('Onboarding');
      const page = query<HTMLElement>(
        harness,
        '[data-testid="onboarding-crumb-page"]',
      );
      expect(page?.textContent?.trim()).toBe('Get ready');
      expect(page?.getAttribute('aria-current')).toBe('page');
    },
  );

  it('shows no second crumb for a page without one and renders the shell workspace header', async () => {
    const harness = await open('/onboarding/analyze');
    expect(query(harness, '[data-testid="onboarding-crumb-page"]')).toBeNull();
    expect(query(harness, 'ptah-workspace-header')).not.toBeNull();
  });

  it.each([
    ['/onboarding/new-project', 'New project'],
    ['/onboarding/team-builder', 'AI team builder'],
  ])(
    'omits the shell workspace header on flat launcher route %s while showing crumb "%s"',
    async (url, expectedCrumb) => {
      const harness = await open(url);
      expect(query(harness, 'ptah-workspace-header')).toBeNull();
      expect(
        query(
          harness,
          '[data-testid="onboarding-crumb-page"]',
        )?.textContent?.trim(),
      ).toBe(expectedCrumb);
    },
  );

  it('moves focus to the page h1 when a page activates', async () => {
    const harness = await open('/onboarding');
    TestBed.tick();
    expect(document.activeElement?.textContent).toBe('Home title');

    await harness.navigateByUrl('/onboarding/analyze');
    TestBed.tick();
    expect(document.activeElement?.textContent).toBe('Step title');
  });

  it('renders announcements in one polite status region', async () => {
    // Navigate on real timers: fake ones can stall the harness's whenStable.
    const harness = await open('/onboarding');
    jest.useFakeTimers();
    try {
      TestBed.inject(OnboardingAnnouncerService).announce(
        'Revision 4 received',
      );
      jest.runOnlyPendingTimers();
      harness.detectChanges();

      const region = query<HTMLElement>(
        harness,
        '[data-testid="onboarding-announcer"]',
      );
      expect(region?.getAttribute('role')).toBe('status');
      expect(region?.getAttribute('aria-live')).toBe('polite');
      expect(region?.textContent?.trim()).toBe('Revision 4 received');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the run pill only while a page sets it', async () => {
    const harness = await open('/onboarding');
    const pill = TestBed.inject(OnboardingRunPillService);
    expect(query(harness, '[data-testid="onboarding-run-pill"]')).toBeNull();

    pill.show('Claude · sonnet');
    harness.detectChanges();
    expect(
      query(
        harness,
        '[data-testid="onboarding-run-pill"]',
      )?.textContent?.trim(),
    ).toBe('Claude · sonnet');

    pill.clear();
    harness.detectChanges();
    expect(query(harness, '[data-testid="onboarding-run-pill"]')).toBeNull();
  });

  it('renders immutable analysisPair and deduplicated stage badges', async () => {
    const harness = await open('/onboarding');
    const pill = TestBed.inject(OnboardingRunPillService);

    const analysisPair: ModelPair = {
      provider: 'Anthropic',
      model: 'claude-sonnet-4-5',
    };
    const decisionPairUsed: ModelPair = {
      provider: 'Anthropic',
      model: 'claude-sonnet-4-5',
    };
    const normalPairUsed: ModelPair = {
      provider: 'Anthropic',
      model: 'claude-sonnet-4-5',
    };
    const stages: SkillJudgeStageRecord[] = [
      {
        stage: 'decision',
        status: 'used',
        pairUsed: decisionPairUsed,
        itemsJudged: 3,
        invalidItemIds: [],
      },
      {
        stage: 'normal',
        status: 'used',
        pairUsed: normalPairUsed,
        itemsJudged: 2,
        invalidItemIds: [],
      },
    ];

    expect(query(harness, '[data-testid="onboarding-run-pill"]')).toBeNull();

    pill.recordRun({ analysisPair, stages });
    harness.detectChanges();

    // Mutating the caller's snapshots after recording must not alter the pill.
    analysisPair.provider = 'OpenAI';
    analysisPair.model = 'gpt-5';
    decisionPairUsed.model = 'gpt-5';
    normalPairUsed.provider = 'OpenAI';
    stages[0].status = 'failed';

    // The equal Decision and Normal pairs collapse into one badge.
    expect(badgeTexts(harness)).toEqual([
      'Analysis: Anthropic / claude-sonnet-4-5',
      'Decision + Normal stage: Anthropic / claude-sonnet-4-5',
    ]);

    pill.clear();
    harness.detectChanges();
    expect(query(harness, '[data-testid="onboarding-run-pill"]')).toBeNull();
  });

  it('shows one badge per stage when the stage pairs differ, and the attempted pair for a failed stage', async () => {
    const harness = await open('/onboarding');
    const pill = TestBed.inject(OnboardingRunPillService);

    pill.recordRun({
      analysisPair: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
      stages: [
        {
          stage: 'decision',
          status: 'used',
          pairUsed: { provider: 'Anthropic', model: 'claude-opus-4-5' },
          itemsJudged: 3,
          invalidItemIds: [],
        },
        {
          stage: 'normal',
          status: 'used',
          pairUsed: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
          itemsJudged: 2,
          invalidItemIds: [],
        },
      ],
    });
    harness.detectChanges();

    expect(badgeTexts(harness)).toEqual([
      'Analysis: Anthropic / claude-sonnet-4-5',
      'Decision stage: Anthropic / claude-opus-4-5',
      'Normal stage: Anthropic / claude-sonnet-4-5',
    ]);

    pill.recordRun({
      analysisPair: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
      stages: [
        {
          stage: 'decision',
          status: 'skipped',
          itemsJudged: 0,
          invalidItemIds: [],
        },
        {
          stage: 'normal',
          status: 'failed',
          pairAttempted: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
          itemsJudged: 0,
          invalidItemIds: [],
        },
      ],
    });
    harness.detectChanges();

    // The failed stage shows the attempted pair; the skipped stage no badge.
    expect(badgeTexts(harness)).toEqual([
      'Analysis: Anthropic / claude-sonnet-4-5',
      'Normal stage: attempted Anthropic / claude-sonnet-4-5',
    ]);
  });

  it('shows no badge for a run without pairs and keeps the plain label flow', async () => {
    const harness = await open('/onboarding');
    const pill = TestBed.inject(OnboardingRunPillService);

    pill.recordRun({ analysisPair: null, stages: [] });
    harness.detectChanges();
    expect(query(harness, '[data-testid="onboarding-run-pill"]')).toBeNull();

    pill.recordRun({
      analysisPair: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
      stages: [],
    });
    harness.detectChanges();
    expect(badgeTexts(harness)).toEqual([
      'Analysis: Anthropic / claude-sonnet-4-5',
    ]);

    // A plain label replaces recorded badges; clear hides everything.
    pill.show('Claude · sonnet');
    harness.detectChanges();
    expect(queryAll(harness, '[data-testid="onboarding-run-pill-badge"]')).toHaveLength(0);
    expect(
      query(harness, '[data-testid="onboarding-run-pill"]')?.textContent?.trim(),
    ).toBe('Claude · sonnet');

    pill.clear();
    harness.detectChanges();
    expect(query(harness, '[data-testid="onboarding-run-pill"]')).toBeNull();
  });
});
