import { ChangeDetectorRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SkillSelectionRailComponent } from '../proposal/skill-selection-rail.component';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { TabManagerService } from '@ptah-extension/chat-state';
import { ClaudeRpcService, VSCodeService } from '@ptah-extension/core';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import { AnalysisStepStore } from './analysis-step.store';
import { AnalyzeSkillsPage } from './analyze-skills.page';
import type { SkillShEntry } from '@ptah-extension/shared';

jest.mock('@ptah-extension/setup-wizard', () => ({
  WizardRpcService: class WizardRpcService {},
}));

describe('AnalyzeSkillsPage', () => {
  afterEach(() => jest.restoreAllMocks());
  const loaded = signal<{ manifest: { runId: string } } | null>({
    manifest: { runId: 'run-1' },
  });
  const root = signal({ workspaceRoot: '/ws' });
  const call = jest.fn();
  beforeEach(() => {
    loaded.set({ manifest: { runId: 'run-1' } });
    root.set({ workspaceRoot: '/ws' });
    call.mockReset();
    call.mockResolvedValue({
      isSuccess: () => true,
      data: {
        skills: [],
        detectedItems: [
          {
            kind: 'framework',
            name: 'Angular',
            evidence: 'package.json',
            sourcePhase: 'project-profile',
          },
        ],
        unmatchedItems: [],
        searchFailures: [],
        summarySource: 'structured',
      },
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: ClaudeRpcService, useValue: { call } },
        { provide: WizardRpcService, useValue: { getResumableRun: jest.fn() } },
        { provide: VSCodeService, useValue: { config: root } },
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
    const button = element.querySelector('button[variant="primary"]');
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
    async (state) => {
      if (state === 'error') call.mockRejectedValue(new Error('offline'));
      const fixture = TestBed.createComponent(AnalyzeSkillsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      if (state === 'nothing selected') {
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
    const skill: SkillShEntry = {
      source: 'owner/repo',
      skillId: 'angular',
      name: 'Angular',
      description: 'Patterns',
      installs: 1,
      isInstalled: false,
    };
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: {
        skills: [{ skill, evidence: 'Angular', score: 100 }],
        detectedItems: [],
        unmatchedItems: [],
        searchFailures: [],
        summarySource: 'structured',
      },
    });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const button = primaryButton(element);
    expect(button.disabled).toBe(false);
    call.mockResolvedValueOnce({
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
    button.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.state.stage()).toBe('consent');
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: { success: true, installed: ['owner/repo/angular'] },
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
    expect(call).toHaveBeenCalledTimes(2);
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
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.state.setRecommendations([
      {
        skill: {
          source: 'owner/repo',
          skillId: 'one',
          name: 'One skill',
          description: 'Guidance',
          installs: 1,
          isInstalled: false,
        },
        evidence: 'Angular',
        score: 1,
      },
    ]);
    page.state.setSelectedIds(new Set(['owner/repo/one']));
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
                    skillName: 'owner/repo/one',
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
    expect(element.querySelectorAll('ptah-skill-pick-card')).toHaveLength(1);
    expect(primaryButton(element).textContent).toContain(
      'Preparing install\u2026',
    );
    finish();
    await pending;
    fixture.detectChanges();
    expect(page.state.previewing()).toBe(false);
    expect(page.state.previewScriptCount()).toBe(1);
    page.state.setStage('review');
    page.toggleSelection('owner/repo/one');
    expect(page.state.previewScriptCount()).toBeNull();
  });
  it('runs a registry search for an unmatched item and clears the reset notice on selection change', async () => {
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: {
        skills: [],
        detectedItems: [
          {
            kind: 'library',
            name: 'Unmatched',
            evidence: 'package.json',
            sourcePhase: 'profile',
          },
        ],
        unmatchedItems: [
          {
            kind: 'library',
            name: 'Unmatched',
            evidence: 'package.json',
            sourcePhase: 'profile',
          },
        ],
        searchFailures: [],
        summarySource: 'structured',
      },
    });
    const fixture = TestBed.createComponent(AnalyzeSkillsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    [...element.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Search for Unmatched'))
      ?.click();
    await fixture.whenStable();
    expect(call).toHaveBeenCalledWith('wizard:search-skills', {
      query: 'Unmatched',
    });
    expect(fixture.componentInstance.state.searchQuery()).toBe('Unmatched');
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
    const first = {
      source: 'owner/repo',
      skillId: 'first',
      name: 'First search skill',
      description: '',
      installs: 0,
      isInstalled: false,
    };
    const second = { ...first, skillId: 'second', name: 'Second search skill' };
    page.state.setSearchResults([first]);
    page.toggleSelection('owner/repo/first');
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: { skills: [second] },
    });
    await page.search('second');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const rail = fixture.debugElement.query(
      By.directive(SkillSelectionRailComponent),
    );
    const selection = rail.injector.get(SkillSelectionRailComponent);
    jest.spyOn(selection, 'responsive').mockReturnValue(false);
    jest.spyOn(selection, 'layout').mockReturnValue('rail');
    rail.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
    expect(root.querySelector('[data-selected-list]')?.textContent).toContain(
      'First search skill',
    );
    expect(
      root.querySelector('[aria-label="Search results skills"]')?.textContent,
    ).not.toContain('First search skill');
    page.clearSearch();
    fixture.detectChanges();
    expect(
      root.querySelector('[aria-label="Search results skills"]'),
    ).toBeNull();
    expect(root.querySelector('[data-selected-list]')?.textContent).toContain(
      'First search skill',
    );
    root
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
      page.state.setPreview([
        {
          skillName: 'owner/repo/one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash',
        },
      ]);
      page.state.setStage('consent');
      fixture.detectChanges();
      const button = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLElement>('[data-testid="skill-install-primary"]');
      if (!button) throw new Error('Missing primary');
      const dialog = (fixture.nativeElement as HTMLElement).querySelector(
        'dialog',
      );
      if (!dialog) throw new Error('Missing consent dialog');
      // Model the native modal's inert background, which jsdom does not implement.
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
            data: { success: scenario === 'navigation', installed: [] },
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
      page.state.setPreview([
        {
          skillName: 'owner/repo/one',
          files: [],
          scriptFiles: [],
          hasScripts: false,
          contentHash: 'hash',
        },
      ]);
      page.state.setStage('consent');
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
      const root = fixture.nativeElement as HTMLElement;
      expect(page.state.installed()).toEqual(['owner/repo/one']);
      expect(page.state.stage()).toBe('review');
      expect(root.querySelector('dialog')?.open).toBe(false);
      expect(root.textContent).toContain(
        'Skills are installed. Could not open the next step. Try again.',
      );
      expect(
        root.querySelector('[data-testid="skill-install-primary"]'),
      ).toBeNull();
      const callsAfterInstall = call.mock.calls.length;
      await page.install();
      expect(call).toHaveBeenCalledTimes(callsAfterInstall);
      navigate.mockResolvedValueOnce(true);
      const retry = [...root.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Continue to Project guidance'),
      );
      expect(retry).toBeDefined();
      retry?.click();
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
  it('recovers from preview failure without a load retry or selection loss', async () => {
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
    expect(page.state.selectedIds().size).toBe(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'ptah-state-panel[state="error"]',
      ),
    ).toBeNull();
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
      { timeout: 75000 },
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
  it('reuses a guidance tab after navigation fails and ignores stale failures', async () => {
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
});
