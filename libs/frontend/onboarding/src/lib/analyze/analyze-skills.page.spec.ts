import { ChangeDetectorRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AppStateManager,
  ClaudeRpcService,
  VSCodeService,
} from '@ptah-extension/core';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import type {
  ModelPair,
  SetupPairState,
  SkillJudgeResult,
  SkillShEntry,
  WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';
import { SkillSelectionRailComponent } from '../proposal/skill-selection-rail.component';
import { StackSkillReviewComponent } from '../proposal/stack-skill-review.component';
import { OnboardingRunPillService } from '../shell/onboarding-run-pill.service';
import { AnalysisStepStore } from './analysis-step.store';
import { AnalyzeSkillsPage } from './analyze-skills.page';

jest.mock('@ptah-extension/setup-wizard', () => ({
  WizardRpcService: class WizardRpcService {},
}));

const DEFAULT_PAIR: ModelPair = { provider: 'claude', model: 'claude-sonnet-4' };

function emptyJudge(
  overrides: Partial<SkillJudgeResult> = {},
): SkillJudgeResult {
  return {
    method: 'decision',
    counts: { decision: 0, normal: 0, notJudged: 0 },
    items: [],
    candidates: [],
    proposals: [],
    stages: [],
    ...overrides,
  };
}

function makeRecommendResult(
  overrides: Partial<WizardRecommendAnalysisSkillsResult> = {},
): WizardRecommendAnalysisSkillsResult {
  const detectedItems = overrides.detectedItems ?? [
    {
      kind: 'framework',
      name: 'Angular',
      evidence: 'package.json',
      sourcePhase: 'project-profile',
    },
  ];
  return {
    skills: [],
    analysisPair: DEFAULT_PAIR,
    judge: emptyJudge({
      counts: { decision: detectedItems.length, normal: 0, notJudged: 0 },
      items: detectedItems.map((item, idx) => ({
        itemId: `${item.kind}:${item.name}:${idx}`,
        item,
        registry: 'no-match',
        candidateIds: [],
        candidateAssessments: [],
        outcomes: [
          {
            verdict: 'no-skill',
            reason: 'Covered by repo conventions.',
            stage: 'decision',
          },
        ],
        judgedBy: 'decision',
      })),
      stages: [
        {
          stage: 'decision',
          status: 'used',
          pairUsed: DEFAULT_PAIR,
          itemsJudged: detectedItems.length,
          invalidItemIds: [],
        },
      ],
    }),
    detectedItems,
    unmatchedItems: [],
    searchFailures: [],
    summarySource: 'structured',
    ...overrides,
  };
}

function makeJudgedResultWithInstallAndBuild(): WizardRecommendAnalysisSkillsResult {
  const angularSkill: SkillShEntry = {
    source: 'owner/repo',
    skillId: 'angular',
    name: 'Angular Patterns',
    description: 'Standalone Angular guidance',
    installs: 42,
    isInstalled: false,
  };
  const rejectedSkill: SkillShEntry = {
    source: 'owner/repo',
    skillId: 'legacy-ng',
    name: 'Legacy Angular',
    description: 'Outdated NgModule patterns',
    installs: 3,
    isInstalled: false,
  };
  const angularItem = {
    kind: 'framework' as const,
    name: 'Angular',
    evidence: 'package.json',
    sourcePhase: 'project-profile',
  };
  const nxItem = {
    kind: 'pattern' as const,
    name: 'Nx Boundaries',
    evidence: 'nx.json',
    sourcePhase: 'architecture-assessment',
  };
  return {
    skills: [
      { skill: angularSkill, evidence: 'Angular', score: 100 },
      { skill: rejectedSkill, evidence: 'Angular', score: 50 },
    ],
    analysisPair: { provider: 'claude', model: 'claude-opus-4' },
    judge: {
      method: 'decision',
      counts: { decision: 2, normal: 0, notJudged: 0 },
      items: [
        {
          itemId: 'item-angular',
          item: angularItem,
          registry: 'matched',
          candidateIds: ['owner/repo/angular', 'owner/repo/legacy-ng'],
          candidateAssessments: [
            { candidateId: 'owner/repo/angular', eligible: true },
            {
              candidateId: 'owner/repo/legacy-ng',
              eligible: false,
              rejection: { reason: 'Targets legacy NgModules', stage: 'decision' },
            },
          ],
          outcomes: [
            {
              verdict: 'install',
              candidateId: 'owner/repo/angular',
              reason: 'Matches standalone signals architecture.',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
        {
          itemId: 'item-nx',
          item: nxItem,
          registry: 'no-match',
          candidateIds: [],
          candidateAssessments: [],
          outcomes: [
            {
              verdict: 'build',
              proposalId: 'prop-nx',
              reason: 'Project has custom Nx boundary tags.',
              stage: 'decision',
            },
          ],
          judgedBy: 'decision',
        },
      ],
      candidates: [
        {
          candidateId: 'owner/repo/angular',
          selectionKey: 'owner/repo/angular',
          skill: angularSkill,
          deprecated: false,
        },
        {
          candidateId: 'owner/repo/legacy-ng',
          selectionKey: 'owner/repo/legacy-ng',
          skill: rejectedSkill,
          deprecated: false,
        },
      ],
      proposals: [
        {
          proposalId: 'prop-nx',
          name: 'nx-boundaries',
          description: 'Enforce workspace library boundaries',
          itemIds: ['item-nx'],
        },
      ],
      stages: [
        {
          stage: 'decision',
          status: 'used',
          pairUsed: { provider: 'claude', model: 'claude-haiku-4' },
          itemsJudged: 2,
          invalidItemIds: [],
        },
      ],
    },
    detectedItems: [angularItem, nxItem],
    unmatchedItems: [nxItem],
    searchFailures: [],
    summarySource: 'structured',
  };
}

describe('AnalyzeSkillsPage', () => {
  afterEach(() => jest.restoreAllMocks());
  const loaded = signal<{ manifest: { runId: string } } | null>({
    manifest: { runId: 'run-1' },
  });
  const root = signal({ workspaceRoot: '/ws' });
  const call = jest.fn();
  let setupStateResponse: SetupPairState;
  let recommendResponse: () => Promise<unknown>;
  const requestSettingsTab = jest.fn();
  const setCurrentView = jest.fn();

  function defaultRpcImpl(method: string): Promise<unknown> {
    if (method === 'wizard:get-setup-model') {
      return Promise.resolve({
        isSuccess: () => true,
        data: { state: setupStateResponse },
      });
    }
    if (method === 'wizard:recommend-analysis-skills') {
      return recommendResponse();
    }
    return Promise.resolve({ isSuccess: () => true, data: {} });
  }

  beforeEach(() => {
    loaded.set({ manifest: { runId: 'run-1' } });
    root.set({ workspaceRoot: '/ws' });
    setupStateResponse = { kind: 'unset', effective: DEFAULT_PAIR };
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeRecommendResult(),
      });
    call.mockReset();
    call.mockImplementation((method: string) => defaultRpcImpl(method));
    requestSettingsTab.mockReset();
    setCurrentView.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: ClaudeRpcService, useValue: { call } },
        { provide: WizardRpcService, useValue: { getResumableRun: jest.fn() } },
        { provide: VSCodeService, useValue: { config: root } },
        {
          provide: AppStateManager,
          useValue: { requestSettingsTab, setCurrentView },
        },
        {
          provide: AnalysisStepStore,
          useValue: {
            loaded,
            selected: signal('saved'),
            useAnalysis: jest.fn(),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ analysis: 'saved' }),
            },
            queryParamMap: of(convertToParamMap({ analysis: 'saved' })),
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: TabManagerService,
          useValue: { createTab: jest.fn(), setWorkflow: jest.fn() },
        },
      ],
    });
  });

  function primaryButton(element: HTMLElement): HTMLButtonElement {
    const button = element.querySelector(
      '[data-testid="skill-install-primary"], button[variant="primary"]',
    );
    if (!(button instanceof HTMLButtonElement))
      throw new Error('Missing primary continue button');
    return button;
  }

  it('invalidates a pending manual search on rerun without leaving searching stuck', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    let finish: () => void = () => {
      throw new Error('Search was not started');
    };
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              isSuccess: () => true,
              data: { skills: [{ source: 'stale' }] },
            });
        }),
    );
    const pending = page.search('angular');
    expect(page.state.searching()).toBe(true);
    page.retry();
    expect(page.state.searching()).toBe(false);
    finish();
    await pending;
    await fixture.whenStable();
    expect(page.state.searchResults()).toEqual([]);
    expect(page.state.searching()).toBe(false);
  });

  it('opens only one guidance tab while navigation is pending', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    let finish: () => void = () => {
      throw new Error('Navigation was not started');
    };
    jest.mocked(router.navigate).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = () => resolve(true);
        }),
    );
    const first = fixture.componentInstance.preview();
    await fixture.componentInstance.preview();
    fixture.detectChanges();
    expect(primaryButton(fixture.nativeElement).disabled).toBe(true);
    expect(TestBed.inject(TabManagerService).createTab).toHaveBeenCalledTimes(
      1,
    );
    expect(router.navigate).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(fixture.componentInstance.leaving()).toBe(false);
  });

  it('announces selection reset after a successful rerun', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Skill selection was reset to the new recommendations.',
    );
  });

  it.each(['empty', 'error', 'nothing selected'])(
    'continues to guidance with %s',
    async (scenario) => {
      if (scenario === 'error') {
        recommendResponse = () => Promise.reject(new Error('offline'));
      }
      const fixture = TestBed.createComponent(AnalyzeSkillsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      if (scenario === 'nothing selected') {
        fixture.componentInstance.state.setRecommendations([
          {
            skill: {
              source: 'owner/repo',
              skillId: 'angular',
              name: 'Angular',
              description: 'Patterns',
              installs: 1,
              isInstalled: false,
            },
            evidence: 'Angular',
            score: 100,
          },
        ]);
        fixture.componentInstance.state.setSelectedIds(new Set());
      }
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      const button = primaryButton(element);
      expect(button.disabled).toBe(false);
      expect(button.textContent).toContain('Continue without skills');
      expect(element.textContent).toContain('Re-run skill search');
      button.click();
      await fixture.whenStable();
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
        ['/onboarding/analyze/guidance'],
        expect.objectContaining({
          queryParams: expect.objectContaining({ analysis: 'saved' }),
        }),
      );
    },
  );

  it('reviews selected skills, installs with consent, and continues to guidance', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect([...fixture.componentInstance.state.selectedIds()]).toEqual([
      'owner/repo/angular',
    ]);
    const element: HTMLElement = fixture.nativeElement;
    const button = primaryButton(element);
    expect(button.disabled).toBe(false);
    call.mockImplementationOnce((method: string) => {
      expect(method).toBe('wizard:preview-skills-for-consent');
      return Promise.resolve({
        isSuccess: () => true,
        data: {
          skills: [
            {
              skillName: 'owner/repo/angular',
              contentHash: 'hash',
              hasScripts: false,
            },
          ],
        },
      });
    });
    button.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.state.stage()).toBe('consent');
    call.mockImplementationOnce((method: string) => {
      expect(method).toBe('wizard:install-skills-with-consent');
      return Promise.resolve({
        isSuccess: () => true,
        data: { success: true, installed: ['owner/repo/angular'] },
      });
    });
    await fixture.componentInstance.install();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['/onboarding/analyze/guidance'],
      expect.anything(),
    );
  });

  it('loads recommendations for the completed run and drops responses after workspace change', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(call).toHaveBeenCalledWith('wizard:get-setup-model', {});
    expect(call).toHaveBeenCalledWith(
      'wizard:recommend-analysis-skills',
      { runId: 'run-1' },
      { timeout: 75_000 },
    );
    expect(fixture.componentInstance.summary()?.detectedItems[0].name).toBe(
      'Angular',
    );
    root.set({ workspaceRoot: '/other' });
    fixture.detectChanges();
    await fixture.whenStable();
    const recommendCalls = call.mock.calls.filter(
      ([method]) => method === 'wizard:recommend-analysis-skills',
    );
    expect(recommendCalls).toHaveLength(2);
  });

  it('shows the error when no analysis is loaded', async () => {
    loaded.set(null);
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.state.error()).toBe(
      'Choose a completed analysis first.',
    );
    expect(call).not.toHaveBeenCalled();
    const buttons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('button');
    const rerun = Array.from(buttons).find((button) =>
      button.textContent?.includes('Re-run skill search'),
    );
    expect(rerun?.disabled).toBe(true);
    loaded.set({ manifest: { runId: 'run-1' } });
  });

  it('restores the analysis directory for a resumed generation route', async () => {
    loaded.set(null);
    const useAnalysis = jest.fn().mockResolvedValue('loaded');
    const query = convertToParamMap({ run: 'generation-1' });
    TestBed.overrideProvider(AnalysisStepStore, {
      useValue: { loaded, selected: signal(null), useAnalysis },
    });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: { queryParamMap: query },
        queryParamMap: of(query),
      },
    });
    TestBed.overrideProvider(WizardRpcService, {
      useValue: {
        getResumableRun: jest.fn().mockResolvedValue({
          generation: {
            runId: 'generation-1',
            analysisDirectory: '/ws/.ptah/analysis/saved',
          },
        }),
      },
    });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(useAnalysis).toHaveBeenCalledWith('saved');
    loaded.set({ manifest: { runId: 'run-1' } });
  });

  it('keeps cards visible while preparing consent and resets preview helper on selection changes', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    let finish: () => void = () => {
      throw new Error('Preview not started');
    };
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              isSuccess: () => true,
              data: {
                skills: [
                  {
                    skillName: 'owner/repo/angular',
                    files: ['SKILL.md'],
                    scriptFiles: ['run.sh'],
                    hasScripts: true,
                    contentHash: 'abc',
                  },
                ],
              },
            });
        }),
    );
    const pending = page.preview();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(page.state.previewing()).toBe(true);
    expect(page.state.loading()).toBe(false);
    expect(
      element.querySelectorAll('ptah-skill-pick-card').length,
    ).toBeGreaterThanOrEqual(1);
    expect(primaryButton(element).textContent).toContain(
      'Preparing install\u2026',
    );
    finish();
    await pending;
    fixture.detectChanges();
    expect(page.state.previewing()).toBe(false);
    expect(page.state.previewScriptCount()).toBe(1);
    page.toggleSelection('owner/repo/angular');
    expect(page.state.previewScriptCount()).toBeNull();
  });

  it('runs a registry search for an unmatched item and clears the reset notice on selection change', async () => {
    const unmatchedItem = {
      kind: 'library' as const,
      name: 'Unmatched',
      evidence: 'package.json',
      sourcePhase: 'profile',
    };
    const foundSkill: SkillShEntry = {
      source: 'owner/repo',
      skillId: 'unmatched-helper',
      name: 'Unmatched Helper',
      description: 'Found via item search',
      installs: 5,
      isInstalled: false,
    };
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeRecommendResult({
          detectedItems: [unmatchedItem],
          unmatchedItems: [unmatchedItem],
        }),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    call.mockImplementationOnce((method: string, params: unknown) => {
      if (method === 'wizard:search-skills') {
        expect(params).toEqual({ query: 'Unmatched' });
        return Promise.resolve({
          isSuccess: () => true,
          data: { skills: [foundSkill] },
        });
      }
      return defaultRpcImpl(method);
    });
    [...element.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Search for Unmatched'))
      ?.click();
    await fixture.whenStable();
    expect(call).toHaveBeenCalledWith('wizard:search-skills', {
      query: 'Unmatched',
    });
    expect(
      fixture.componentInstance.state
        .itemSearchResultsByItemId()
        .get('library:Unmatched:0'),
    ).toEqual([foundSkill]);
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Skill selection was reset');
    fixture.componentInstance.toggleSelection('owner/repo/one');
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Skill selection was reset');
  });

  it('keeps selected metadata editable in the compact disclosure across searches and Clear', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    const first: SkillShEntry = {
      source: 'owner/repo',
      skillId: 'first',
      name: 'First search skill',
      description: '',
      installs: 0,
      isInstalled: false,
    };
    const second: SkillShEntry = {
      ...first,
      skillId: 'second',
      name: 'Second search skill',
    };
    page.state.setSearchResults([first]);
    page.toggleSelection('owner/repo/first');
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: { skills: [second] },
    });
    await page.search('second');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const rail = fixture.debugElement.query(
      By.directive(SkillSelectionRailComponent),
    );
    const selection = rail.injector.get(SkillSelectionRailComponent);
    jest.spyOn(selection, 'responsive').mockReturnValue(false);
    jest.spyOn(selection, 'layout').mockReturnValue('rail');
    rail.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
    expect(
      element.querySelector('[data-selected-list]')?.textContent,
    ).toContain('First search skill');
    expect(
      element.querySelector('[aria-label="Search results skills"]')
        ?.textContent,
    ).not.toContain('First search skill');
    page.clearSearch();
    fixture.detectChanges();
    expect(
      element.querySelector('[aria-label="Search results skills"]'),
    ).toBeNull();
    expect(
      element.querySelector('[data-selected-list]')?.textContent,
    ).toContain('First search skill');
    element
      .querySelector<HTMLButtonElement>(
        '[aria-label="Remove First search skill"]',
      )
      ?.click();
    expect(page.state.selectedIds().size).toBe(0);
  });

  it.each(['cancel', 'partial', 'throw'])(
    'closes consent and returns focus on %s',
    async (scenario) => {
      const fixture = TestBed.createComponent(AnalyzeSkillsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      const page = fixture.componentInstance;
      page.state.setSelectedIds(new Set(['owner/repo/one']));
      page.state.openConsent([
        {
          skillName: 'owner/repo/one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash',
        },
      ]);
      fixture.detectChanges();
      const button = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLElement>('[data-testid="skill-install-primary"]');
      if (!button) throw new Error('Missing primary');
      const dialog = (fixture.nativeElement as HTMLElement).querySelector(
        'dialog:not(.discard-draft-dialog)',
      ) as HTMLDialogElement | null;
      if (!dialog) throw new Error('Missing consent dialog');
      const nativeFocus = HTMLElement.prototype.focus;
      const focus = jest
        .spyOn(HTMLElement.prototype, 'focus')
        .mockImplementation(function (
          this: HTMLElement,
          options?: FocusOptions,
        ) {
          if (dialog.open && !dialog.contains(this)) return;
          nativeFocus.call(this, options);
        });
      dialog.querySelector<HTMLButtonElement>('button')?.focus();
      if (scenario === 'cancel') page.closeConsent();
      else {
        if (scenario === 'throw')
          call.mockRejectedValueOnce(new Error('offline'));
        else
          call.mockResolvedValueOnce({
            isSuccess: () => true,
            data: { success: false, installed: [] },
          });
        TestBed.inject(Router).navigate = jest.fn().mockResolvedValue(false);
        await page.install();
      }
      await fixture.whenStable();
      fixture.detectChanges();
      expect(page.state.stage()).toBe('review');
      expect(page.state.selectedIds().has('owner/repo/one')).toBe(true);
      expect(dialog.open).toBe(false);
      expect(document.activeElement).toBe(button);
      focus.mockRestore();
    },
  );

  it.each(['reject', 'false'])(
    'retries navigation after successful installation without reinstalling (%s)',
    async (failure) => {
      const fixture = TestBed.createComponent(AnalyzeSkillsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      const page = fixture.componentInstance;
      page.state.setSelectedIds(new Set(['owner/repo/one']));
      page.state.openConsent([
        {
          skillName: 'owner/repo/one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash',
        },
      ]);
      fixture.detectChanges();
      call.mockResolvedValueOnce({
        isSuccess: () => true,
        data: { success: true, installed: ['owner/repo/one'] },
      });
      const navigate = jest.spyOn(TestBed.inject(Router), 'navigate');
      if (failure === 'reject')
        navigate.mockRejectedValueOnce(new Error('guard failed'));
      else navigate.mockResolvedValueOnce(false);
      await page.install();
      await fixture.whenStable();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(page.state.installed()).toEqual(['owner/repo/one']);
      expect(page.state.stage()).toBe('review');
      expect(element.querySelector('dialog')?.open).toBe(false);
      expect(element.textContent).toContain(
        'Skills are installed. Could not open the next step. Try again.',
      );
      expect(
        element.querySelector('[data-testid="skill-install-primary"]'),
      ).toBeNull();
      const callsAfterInstall = call.mock.calls.length;
      await page.install();
      expect(call).toHaveBeenCalledTimes(callsAfterInstall);
      navigate.mockResolvedValueOnce(true);
      const retryBtn = [...element.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Continue to Project guidance'),
      );
      expect(retryBtn).toBeDefined();
      retryBtn?.click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledTimes(2);
      expect(call).toHaveBeenCalledTimes(callsAfterInstall);
    },
  );

  it('handles rejected navigation when continuing without skills', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    jest
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockRejectedValueOnce(new Error('guard failed'));
    await fixture.componentInstance.continueToGuidance();
    fixture.detectChanges();
    expect(fixture.componentInstance.state.error()).toBe(
      'Could not open Project guidance. Try again.',
    );
    expect(fixture.componentInstance.leaving()).toBe(false);
  });

  it('recovers from preview failure without a load retry or selection loss (GAP 58)', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.state.setSelectedIds(new Set(['owner/repo/one']));
    call.mockRejectedValueOnce(new Error('offline'));
    await page.preview();
    fixture.detectChanges();
    expect(page.state.previewing()).toBe(false);
    expect(page.loadError()).toBe(false);
    expect(page.state.error()).toBe('Could not preview skills. Try again.');
    expect(page.state.selectedIds().size).toBe(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'ptah-state-panel[state="error"]',
      ),
    ).toBeNull();
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: {
        skills: [
          {
            skillName: 'owner/repo/one',
            files: [],
            scriptFiles: [],
            hasScripts: false,
            contentHash: 'hash',
          },
        ],
      },
    });
    await page.preview();
    expect(page.state.stage()).toBe('consent');
  });

  it('exposes read-only store signals with methods as the only public writers', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect('set' in fixture.componentInstance.loadError).toBe(false);
    const state = fixture.componentInstance.state;
    expect('set' in state.stage).toBe(false);
    expect('set' in state.selectedIds).toBe(false);
    expect('set' in state.searchResults).toBe(false);
    state.setIntent('A team');
    expect(state.intent()).toBe('A team');
  });

  it('requires a workspace and loads automatically when one becomes available', async () => {
    root.set({ workspaceRoot: '' });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.canRetry()).toBe(false);
    expect(fixture.componentInstance.state.error()).toBe(
      'Open a workspace to find skills.',
    );
    fixture.componentInstance.retry();
    expect(call).not.toHaveBeenCalled();
    root.set({ workspaceRoot: '/ws' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(call).toHaveBeenCalledWith(
      'wizard:recommend-analysis-skills',
      { runId: 'run-1' },
      { timeout: 75_000 },
    );
  });

  it('clears old matches on failed searches and retains selected metadata separately', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    const skill: SkillShEntry = {
      source: 'owner/repo',
      skillId: 'eslint',
      name: 'ESLint',
      description: '',
      installs: 0,
      isInstalled: false,
    };
    page.state.setSearchResults([skill]);
    page.state.toggle('owner/repo/eslint');
    call.mockRejectedValueOnce(new Error('offline'));
    await page.search('pytest');
    expect(page.state.searchResults()).toEqual([]);
    expect(page.state.retainedSearchResults()).toEqual([skill]);
    page.state.toggle('owner/repo/eslint');
    page.state.setSearchResults([]);
    expect(page.state.retainedSearchResults()).toEqual([]);
  });

  it('reuses a guidance tab after navigation fails and ignores stale failures (GAP 63)', async () => {
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const tabs = TestBed.inject(TabManagerService);
    jest.spyOn(tabs, 'createTab').mockReturnValue('guidance-tab');
    jest.spyOn(router, 'navigate').mockResolvedValue(false);
    await fixture.componentInstance.continueToGuidance();
    await fixture.componentInstance.continueToGuidance();
    expect(tabs.createTab).toHaveBeenCalledTimes(1);
    let finish: (value: boolean) => void = () => {
      throw new Error('navigation not started');
    };
    jest.spyOn(router, 'navigate').mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = fixture.componentInstance.continueToGuidance();
    loaded.set({ manifest: { runId: 'run-2' } });
    fixture.detectChanges();
    await fixture.whenStable();
    finish(false);
    await pending;
    expect(fixture.componentInstance.state.error()).toBeNull();
  });

  it('pre-selects only valid install verdicts via applyRecommendationResult and records/clears the run pill', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const runPill = TestBed.inject(OnboardingRunPillService);
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect([...page.state.selectedIds()]).toEqual(['owner/repo/angular']);
    expect(page.state.selectedIds().has('owner/repo/legacy-ng')).toBe(false);
    expect(runPill.badges()).toEqual([
      {
        key: 'analysis',
        label: 'Analysis',
        pair: 'claude / claude-opus-4',
        status: 'used',
      },
      {
        key: 'decision',
        label: 'Decision stage',
        pair: 'claude / claude-haiku-4',
        status: 'used',
      },
    ]);
    // Re-run preserves immutable analysisPair (R14) while updating stages
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: {
          ...makeJudgedResultWithInstallAndBuild(),
          analysisPair: { provider: 'openai', model: 'gpt-5' },
        },
      });
    page.retry();
    await fixture.whenStable();
    expect(runPill.badges()[0]).toEqual({
      key: 'analysis',
      label: 'Analysis',
      pair: 'claude / claude-opus-4',
      status: 'used',
    });
    fixture.destroy();
    expect(runPill.badges()).toEqual([]);
  });

  it('keeps the previous judged grid visible without loading skeletons during Re-run (GAP 25)', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Angular Patterns');
    let finishRerun: () => void = () => {
      throw new Error('Rerun did not start');
    };
    recommendResponse = () =>
      new Promise((resolve) => {
        finishRerun = () =>
          resolve({
            isSuccess: () => true,
            data: makeJudgedResultWithInstallAndBuild(),
          });
      });
    fixture.componentInstance.retry();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.state.loading()).toBe(true);
    expect(element.textContent).toContain('Angular Patterns');
    expect(element.querySelectorAll('ptah-skeleton')).toHaveLength(0);
    finishRerun();
    await fixture.whenStable();
  });

  it('settles draft preview by revision/seq, handles generation failure safely, and drops stale preview responses', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const review = fixture.debugElement.query(
      By.directive(StackSkillReviewComponent),
    ).componentInstance as StackSkillReviewComponent;
    const opened = page.state.openProposalDraft('prop-nx');
    if (opened.status !== 'ok') throw new Error('Draft failed to open');
    const firstRev = opened.draft.revision;
    const firstSeq = opened.draft.previewRequestSeq;
    let resolveStale!: (value: unknown) => void;
    call.mockImplementationOnce(
      (method: string) =>
        new Promise((resolve) => {
          expect(method).toBe('wizard:generate-skill-draft');
          resolveStale = resolve;
        }),
    );
    review.draftPreviewRequested.emit({
      params: {
        runId: 'run-1',
        proposalId: 'prop-nx',
        proposalName: 'nx-boundaries',
        items: [
          {
            itemId: 'item-nx',
            name: 'Nx Boundaries',
            kind: 'pattern',
            evidence: 'nx.json',
            buildReasons: ['Project has custom Nx boundary tags.'],
          },
        ],
      },
      revision: firstRev,
      previewRequestSeq: firstSeq,
    });
    // Close and reopen -> stale response must be ignored
    page.state.closeDraft({ forceDiscardDirty: true });
    const reopened = page.state.openProposalDraft('prop-nx');
    if (reopened.status !== 'ok') throw new Error('Draft failed to reopen');
    resolveStale({
      isSuccess: () => true,
      data: {
        ok: true,
        name: 'stale-skill',
        description: 'stale',
        body: 'stale body',
        content: 'stale',
        destinationSlug: 'stale-skill',
        pairUsed: DEFAULT_PAIR,
      },
    });
    await fixture.whenStable();
    expect(page.state.openDraft()?.name).toBe('nx-boundaries');

    // Fresh response settles the current revision/seq
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: {
        ok: true,
        name: 'nx-boundaries',
        description: 'Enforce Nx tags',
        body: '## Rules\n\nRespect Nx tags.',
        content: '---\nname: nx-boundaries\n---\n## Rules\n\nRespect Nx tags.',
        destinationSlug: 'nx-boundaries',
        pairUsed: DEFAULT_PAIR,
      },
    });
    await page.generateDraftPreview({
      params: {
        runId: 'run-1',
        proposalId: 'prop-nx',
        proposalName: 'nx-boundaries',
        items: [],
      },
      revision: reopened.draft.revision,
      previewRequestSeq: reopened.draft.previewRequestSeq,
    });
    expect(page.state.openDraft()?.mode).toBe('preview');
    expect(page.state.openDraft()?.body).toContain('Respect Nx tags.');

    // RPC error enters edit fallback with safe copy (no raw provider message)
    const retried = page.state.beginRetryDraftGeneration();
    if (retried.status !== 'ok') throw new Error('Retry failed');
    call.mockResolvedValueOnce({
      isSuccess: () => false,
      error: 'RAW_PROVIDER_STACK_TRACE_401',
    });
    await page.generateDraftPreview({
      params: {
        runId: 'run-1',
        proposalId: 'prop-nx',
        proposalName: 'nx-boundaries',
        items: [],
      },
      revision: retried.draft.revision,
      previewRequestSeq: retried.draft.previewRequestSeq,
    });
    expect(page.state.openDraft()?.mode).toBe('edit');
    expect(page.state.openDraft()?.generationError?.message).not.toContain(
      'RAW_PROVIDER_STACK_TRACE_401',
    );
  });

  it('settles draft creation via harness:create-skill and handles create failure without leaking raw errors', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    const opened = page.state.openManualDraft('item-nx');
    if (opened.status !== 'ok') throw new Error('Manual draft failed');
    page.state.updateDraftFields({
      name: 'nx-rules',
      description: 'Nx rules',
      body: '## Guidance\n\nUse public barrels.',
    });

    // Failure keeps editor open and clears busy with safe error
    const firstCreate = page.state.beginCreateDraft();
    if (!firstCreate) throw new Error('beginCreateDraft failed');
    call.mockResolvedValueOnce({
      isSuccess: () => false,
      error: 'EACCES raw fs stack',
    });
    await page.createDraft(firstCreate);
    expect(page.state.openDraft()?.busy).toBe(false);
    expect(page.state.openDraft()?.createError).toBe(
      'Could not create this skill. Your draft is still here.',
    );
    expect(page.state.openDraft()?.body).toContain('Use public barrels.');

    // Success records path, closes draft, and updates createdSkillSlugs
    const secondCreate = page.state.beginCreateDraft();
    if (!secondCreate) throw new Error('second beginCreateDraft failed');
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: {
        skillPath:
          '~/.ptah/plugins/ptah-harness-nx-rules/skills/nx-rules/SKILL.md',
      },
    });
    await page.createDraft(secondCreate);
    expect(call).toHaveBeenCalledWith('harness:create-skill', {
      name: 'nx-rules',
      description: 'Nx rules',
      content: '## Guidance\n\nUse public barrels.',
    });
    expect(page.state.openDraft()).toBeNull();
    expect(page.state.createdPathFor('manual:item-nx')).toBe(
      '~/.ptah/plugins/ptah-harness-nx-rules/skills/nx-rules/SKILL.md',
    );
  });

  it('continues to guidance with zero build skills created', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    expect(page.state.createdSkillSlugs()).toEqual([]);
    // Unselect the pre-selected install skill so Continue proceeds with zero installs and zero builds
    page.toggleSelection('owner/repo/angular');
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    jest.mocked(router.navigate).mockResolvedValueOnce(true);
    await page.preview();
    expect(page.state.error()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/onboarding/analyze/guidance'],
      expect.anything(),
    );
  });

  it('enforces F29 blocking with visible reasons in both orders and clears consent preview and approvals on selection toggle', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;

    // Order 1: Draft open blocks consent preview and shows visible reason in rail
    const opened = page.state.openManualDraft('item-nx');
    expect(opened.status).toBe('ok');
    fixture.detectChanges();
    expect(element.textContent).toContain(
      'Finish or cancel the open skill draft before installing',
    );
    const callsBeforePreview = call.mock.calls.length;
    await page.preview();
    expect(call).toHaveBeenCalledTimes(callsBeforePreview);
    expect(page.state.consentOpen()).toBe(false);

    // Close draft, open consent -> Order 2: Consent open keeps review mounted with visible blocker and blocks drafts
    page.state.closeDraft({ forceDiscardDirty: true });
    page.state.openConsent([
      {
        skillName: 'owner/repo/angular',
        files: ['SKILL.md'],
        scriptFiles: ['setup.sh'],
        hasScripts: true,
        contentHash: 'hash-1',
      },
    ]);
    page.state.approve('owner/repo/angular');
    fixture.detectChanges();
    expect(element.querySelector('ptah-stack-skill-review')).not.toBeNull();
    expect(element.textContent).toContain(
      'Close the install consent dialog before opening a skill draft',
    );
    expect(page.state.openManualDraft('item-nx').status).toBe('blocked');
    const callsBeforeDraft = call.mock.calls.length;
    await page.generateDraftPreview({
      params: {
        runId: 'run-1',
        proposalId: 'prop-nx',
        proposalName: 'nx-boundaries',
        items: [],
      },
      revision: 99,
      previewRequestSeq: 99,
    });
    expect(call).toHaveBeenCalledTimes(callsBeforeDraft);

    // Selection toggle clears consent preview and approvals and closes consent
    page.toggleSelection('owner/repo/angular');
    expect(page.state.preview()).toEqual([]);
    expect(page.state.approvedIds().size).toBe(0);
    expect(page.state.consentOpen()).toBe(false);
  });

  it('blocked initial load hides skeleton and prior-result copy; blocked Re-run retains prior result; clicking Choose/Sign-in/Retry invokes settings deep link or retries', async () => {
    // 1. Blocked initial load (model-stale on Setup)
    setupStateResponse = {
      kind: 'invalid',
      source: 'setup',
      provider: 'claude',
      model: 'claude-old',
      cause: 'model-stale',
    };
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      call.mock.calls.filter(
        ([method]) => method === 'wizard:recommend-analysis-skills',
      ),
    ).toHaveLength(0);
    expect(element.querySelectorAll('ptah-skeleton')).toHaveLength(0);
    const alertText =
      element.querySelector('[data-testid="setup-model-blocked"]')
        ?.textContent ?? '';
    expect(alertText).toContain('claude-old');
    expect(alertText.toLowerCase()).not.toContain('previous');
    expect(alertText.toLowerCase()).not.toContain('workspace model');
    const actionBtn = element.querySelector<HTMLButtonElement>(
      '[data-testid="setup-model-recovery-action"]',
    );
    expect(actionBtn?.textContent?.trim()).toBe('Choose a model');
    actionBtn?.click();
    expect(requestSettingsTab).toHaveBeenCalledWith({
      tab: 'providers',
      section: 'setup',
    });
    expect(setCurrentView).toHaveBeenCalledWith('settings');

    // 2. Provider becomes valid -> retry loads judged result
    setupStateResponse = { kind: 'set', pair: DEFAULT_PAIR };
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Angular Patterns');

    // 3. Blocked Re-run (not-signed-in on Setup) retains prior result and opens Sign in with providerId
    requestSettingsTab.mockClear();
    setCurrentView.mockClear();
    setupStateResponse = {
      kind: 'invalid',
      source: 'setup',
      provider: 'openai',
      model: 'gpt-5',
      cause: 'not-signed-in',
    };
    const recCallsBeforeBlockedRerun = call.mock.calls.filter(
      ([method]) => method === 'wizard:recommend-analysis-skills',
    ).length;
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      call.mock.calls.filter(
        ([method]) => method === 'wizard:recommend-analysis-skills',
      ),
    ).toHaveLength(recCallsBeforeBlockedRerun);
    expect(element.textContent).toContain('Angular Patterns');
    const signInText =
      element.querySelector('[data-testid="setup-model-blocked"]')
        ?.textContent ?? '';
    expect(signInText).toContain('OpenAI');
    expect(signInText.toLowerCase()).not.toContain('workspace model');
    const signInBtn = element.querySelector<HTMLButtonElement>(
      '[data-testid="setup-model-recovery-action"]',
    );
    expect(signInBtn?.textContent?.trim()).toBe('Sign in');
    signInBtn?.click();
    expect(requestSettingsTab).toHaveBeenCalledWith({
      tab: 'providers',
      section: 'setup',
      providerId: 'openai',
    });
    expect(setCurrentView).toHaveBeenCalledWith('settings');

    // 4. Blocked Re-run (provider-unknown -> Choose a provider)
    requestSettingsTab.mockClear();
    setupStateResponse = {
      kind: 'invalid',
      source: 'setup',
      provider: 'removed-provider',
      model: 'm1',
      cause: 'provider-unknown',
    };
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    const chooseProvBtn = element.querySelector<HTMLButtonElement>(
      '[data-testid="setup-model-recovery-action"]',
    );
    expect(chooseProvBtn?.textContent?.trim()).toBe('Choose a provider');
    chooseProvBtn?.click();
    expect(requestSettingsTab).toHaveBeenCalledWith({
      tab: 'providers',
      section: 'setup',
    });

    // 5. Blocked Re-run (provider-unavailable -> Retry re-runs F27 guard + request)
    setupStateResponse = {
      kind: 'unavailable',
      source: 'setup',
      provider: 'claude',
      model: 'claude-sonnet-4',
      cause: 'provider-unavailable',
    };
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    const retryBtn = element.querySelector<HTMLButtonElement>(
      '[data-testid="setup-model-recovery-action"]',
    );
    expect(retryBtn?.textContent?.trim()).toBe('Retry');
    setupStateResponse = { kind: 'set', pair: DEFAULT_PAIR };
    retryBtn?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      call.mock.calls.filter(
        ([method]) => method === 'wizard:recommend-analysis-skills',
      ),
    ).toHaveLength(recCallsBeforeBlockedRerun + 1);
    expect(element.querySelector('[data-testid="setup-model-blocked"]')).toBeNull();
  });

  it('maps SETUP_MODEL_INVALID race from recommend RPC into R13 Setup-error banner retaining prior result', async () => {
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: makeJudgedResultWithInstallAndBuild(),
      });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Pre-flight passes, then recommend returns SETUP_MODEL_INVALID race
    let getSetupCalls = 0;
    call.mockImplementation((method: string) => {
      if (method === 'wizard:get-setup-model') {
        getSetupCalls++;
        return Promise.resolve({
          isSuccess: () => true,
          data: {
            state:
              getSetupCalls === 1
                ? { kind: 'set', pair: DEFAULT_PAIR }
                : {
                    kind: 'invalid',
                    source: 'setup',
                    provider: 'claude',
                    model: 'stale-race',
                    cause: 'model-stale',
                  },
          },
        });
      }
      if (method === 'wizard:recommend-analysis-skills') {
        return Promise.resolve({
          isSuccess: () => false,
          error: 'raw backend error',
          errorCode: 'SETUP_MODEL_INVALID',
        });
      }
      return defaultRpcImpl(method);
    });
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      element.querySelector('[data-testid="setup-model-blocked"]')?.textContent,
    ).toContain('stale-race');
    expect(element.textContent).toContain('Angular Patterns');
    expect(element.querySelector('ptah-state-panel[state="error"]')).toBeNull();
  });

  it('ANALYSIS_LOAD_FAILED and SKILLS_RECOMMEND_FAILED open loadError panel with Try again and Back', async () => {
    for (const [errorCode, expectedMessage] of [
      ['ANALYSIS_LOAD_FAILED', 'Could not read the saved analysis.'],
      ['SKILLS_RECOMMEND_FAILED', 'Could not load skill recommendations.'],
    ] as const) {
      recommendResponse = () =>
        Promise.resolve({
          isSuccess: () => false,
          error: 'RAW_INTERNAL_ERROR_DO_NOT_LEAK',
          errorCode,
        });
      const fixture = TestBed.createComponent(AnalyzeSkillsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(fixture.componentInstance.loadError()).toBe(true);
      expect(fixture.componentInstance.backOnLoadError()).toBe(true);
      const panel = element.querySelector('ptah-state-panel[state="error"]');
      expect(panel).not.toBeNull();
      expect(panel?.textContent).toContain(expectedMessage);
      expect(panel?.textContent).not.toContain('RAW_INTERNAL_ERROR_DO_NOT_LEAK');
      const tryAgainBtn = [...(panel?.querySelectorAll('button') ?? [])].find(
        (btn) => btn.textContent?.trim() === 'Try again',
      );
      expect(tryAgainBtn).toBeDefined();
      const getSetupBeforeTryAgain = call.mock.calls.filter(
        ([method]) => method === 'wizard:get-setup-model',
      ).length;
      tryAgainBtn?.click();
      await fixture.whenStable();
      expect(
        call.mock.calls.filter(
          ([method]) => method === 'wizard:get-setup-model',
        ).length,
      ).toBe(getSetupBeforeTryAgain + 1);
      const backBtn = [...element.querySelectorAll('button')].find(
        (btn) => btn.textContent?.trim() === 'Back',
      );
      expect(backBtn).toBeDefined();
      backBtn?.click();
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([
        '/onboarding/analyze',
      ]);
      fixture.destroy();
    }
  });

  it('renders loadError with Try again and Back on whole-request failure and keeps all actions working in no-judge/both-failed', async () => {
    // Whole-request failure -> loadError panel with Try again and Back
    recommendResponse = () => Promise.reject(new Error('network down'));
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('ptah-state-panel[state="error"]')).not.toBeNull();
    expect(element.textContent).toContain('Try again');
    expect(element.textContent).toContain('Back');

    // Recover into both-failed (method === 'none' + search-failed): search, manual draft, skip, back remain active
    const angularItem = {
      kind: 'framework' as const,
      name: 'Angular',
      evidence: 'package.json',
      sourcePhase: 'project-profile',
    };
    recommendResponse = () =>
      Promise.resolve({
        isSuccess: () => true,
        data: {
          skills: [],
          analysisPair: DEFAULT_PAIR,
          judge: {
            method: 'none',
            counts: { decision: 0, normal: 0, notJudged: 1 },
            items: [
              {
                itemId: 'item-ng',
                item: angularItem,
                registry: 'search-failed',
                registryFailure: { kind: 'timed-out', reason: 'Timed out' },
                candidateIds: [],
                candidateAssessments: [],
                outcomes: [],
                judgedBy: 'none',
              },
            ],
            candidates: [],
            proposals: [],
            stages: [
              {
                stage: 'normal',
                status: 'failed',
                category: 'provider-error',
                pairAttempted: DEFAULT_PAIR,
                itemsJudged: 0,
                invalidItemIds: [],
              },
            ],
          },
          detectedItems: [angularItem],
          unmatchedItems: [],
          searchFailures: [{ item: 'Angular', reason: 'Timed out' }],
          summarySource: 'structured',
        },
      });
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.state.selectedIds().size).toBe(0);
    expect(element.textContent).toContain('Search failed for 1 stack item');
    expect(element.textContent).toContain('AI review is unavailable');
    expect(element.textContent).toContain('Search for Angular');
    expect(element.textContent).toContain('Write a skill by hand');
    expect(element.textContent).toContain('Back');
  });
});
