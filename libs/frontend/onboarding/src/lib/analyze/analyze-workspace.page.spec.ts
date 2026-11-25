import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  AppStateManager,
  ClaudeRpcService,
  ClockService,
  type ViewType,
} from '@ptah-extension/core';
import type { SetupPairState } from '@ptah-extension/shared';
import {
  SetupWizardStateService,
  WizardAnalysisRunner,
  WizardRpcService,
} from '@ptah-extension/setup-wizard';
import { AnalysisStepStore } from './analysis-step.store';
import { AnalyzeWorkspacePage } from './analyze-workspace.page';

describe('AnalyzeWorkspacePage', () => {
  const selected = signal<string | null>(null);
  const loaded = signal<{
    manifest: { slug: string; totalDurationMs: number; model?: string };
    phaseContents: Record<string, string>;
  } | null>(null);
  const saved = signal([
    {
      filename: 'saved',
      projectType: 'Angular',
      savedAt: '',
      durationMs: 1000,
    },
  ]);
  const store = {
    selected,
    loaded,
    saved,
    hidden: signal(new Set<string>()),
    phaseRows: signal([]),
    phaseHeader: signal(null),
    streamCounts: signal(null),
    listAnalyses: jest.fn(),
    selectAnalysis: jest.fn(),
    clearSelection: jest.fn(),
    hideAnalysis: jest.fn(),
    attachStream: jest.fn(),
    detachStream: jest.fn(),
  };
  const rpc = { getResumableRun: jest.fn() };
  const claudeRpcCall = jest.fn();
  const currentView = signal<ViewType>('onboarding');
  const requestSettingsTab = jest.fn();
  const setCurrentView = jest.fn();
  const runner = {
    isRunning: signal(false),
    isCanceling: signal(false),
    errorMessage: signal<string | null>(null),
    statusText: signal(''),
    reset: jest.fn(),
    startFreshAnalysis: jest.fn().mockResolvedValue(undefined),
    resumeAnalysis: jest.fn().mockResolvedValue(undefined),
  };
  const wizard = { reset: jest.fn() };
  const navigate = jest.fn();
  let setupStateResponse: SetupPairState;

  beforeEach(() => {
    jest.clearAllMocks();
    selected.set(null);
    loaded.set(null);
    currentView.set('onboarding');
    setupStateResponse = {
      kind: 'unset',
      effective: { provider: 'claude', model: 'claude-sonnet-4' },
    };
    store.listAnalyses.mockResolvedValue(undefined);
    store.selectAnalysis.mockResolvedValue('loaded');
    rpc.getResumableRun.mockResolvedValue({ analysis: null, generation: null });
    claudeRpcCall.mockImplementation((method: string) => {
      if (method === 'wizard:get-setup-model') {
        return Promise.resolve({
          isSuccess: () => true,
          data: { state: setupStateResponse },
        });
      }
      return Promise.resolve({ isSuccess: () => true, data: {} });
    });
    navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ClockService,
          useValue: { now: signal(Date.now()), acquire: () => () => undefined },
        },
        { provide: AnalysisStepStore, useValue: store },
        { provide: WizardRpcService, useValue: rpc },
        { provide: ClaudeRpcService, useValue: { call: claudeRpcCall } },
        {
          provide: AppStateManager,
          useValue: { currentView, requestSettingsTab, setCurrentView },
        },
        { provide: WizardAnalysisRunner, useValue: runner },
        { provide: SetupWizardStateService, useValue: wizard },
        { provide: Router, useValue: { navigate } },
      ],
    });
  });

  describe('lifecycle and routing', () => {
    beforeEach(() => {
      TestBed.overrideComponent(AnalyzeWorkspacePage, {
        set: { template: '' },
      });
    });

    it('selects a saved analysis from the query without substituting a resumable run', async () => {
      rpc.getResumableRun.mockResolvedValue({
        analysis: { manifest: { lifecycle: 'paused' } },
        generation: null,
      });
      const fixture = TestBed.createComponent(AnalyzeWorkspacePage);
      fixture.componentRef.setInput('analysis', 'saved');
      fixture.detectChanges();
      await fixture.componentInstance.ngOnInit();
      expect(store.selectAnalysis).toHaveBeenCalledWith('saved');
      expect(navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ queryParams: { analysis: 'saved' } }),
      );
      fixture.destroy();
    });

    it('carries the selected analysis and clears explicitBack on forward navigation', async () => {
      selected.set('saved');
      const fixture = TestBed.createComponent(AnalyzeWorkspacePage);
      await fixture.componentInstance['reviewSkills']();
      expect(navigate).toHaveBeenCalledWith(
        ['/onboarding', 'analyze', 'skills'],
        expect.objectContaining({
          queryParams: { analysis: 'saved' },
          state: { explicitBack: false },
        }),
      );
      fixture.destroy();
    });

    it('does not turn a saved-analysis navigation failure into a list error', async () => {
      navigate.mockRejectedValueOnce(new Error('navigation failed'));
      const fixture = TestBed.createComponent(AnalyzeWorkspacePage);
      fixture.componentRef.setInput('analysis', 'saved');
      await expect(
        fixture.componentInstance.ngOnInit(),
      ).resolves.toBeUndefined();
      expect(store.listAnalyses).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance['savedError']()).toBe(false);
      expect(fixture.componentInstance['selectError']()).toBeTruthy();
      expect(rpc.getResumableRun).toHaveBeenCalledTimes(1);
      fixture.destroy();
    });

    it('consumes a Re-run intent and starts a fresh analysis without loading the saved one', async () => {
      selected.set('saved');
      const fixture = TestBed.createComponent(AnalyzeWorkspacePage);
      fixture.componentRef.setInput('rerun', '1');
      await fixture.componentInstance.ngOnInit();
      expect(navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          queryParams: { rerun: null },
          replaceUrl: true,
        }),
      );
      expect(wizard.reset).toHaveBeenCalledTimes(1);
      expect(runner.reset).toHaveBeenCalledTimes(1);
      expect(store.clearSelection).toHaveBeenCalledTimes(1);
      expect(runner.startFreshAnalysis).toHaveBeenCalledTimes(1);
      expect(store.selectAnalysis).not.toHaveBeenCalled();
      expect(rpc.getResumableRun).not.toHaveBeenCalled();
      fixture.destroy();
    });
  });

  describe('Setup model card', () => {
    it('renders the default effective workspace pair and opens Settings at the Setup row', async () => {
      const fixture = TestBed.createComponent(AnalyzeWorkspacePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const card = element.querySelector('[data-testid="setup-model-card"]');
      expect(card).not.toBeNull();
      expect(
        card?.querySelector('[data-testid="setup-model-badge"]')?.textContent,
      ).toContain('Default');
      expect(
        card?.querySelector('[data-testid="setup-model-pair"]')?.textContent,
      ).toContain('claude-sonnet-4');
      expect(card?.textContent).toContain('workspace provider');
      const startBtn = element.querySelector<HTMLButtonElement>(
        '[data-testid="start-analysis-button"]',
      );
      expect(startBtn?.disabled).toBe(false);
      card
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="setup-model-settings-link"]',
        )
        ?.click();
      expect(requestSettingsTab).toHaveBeenCalledWith({
        tab: 'providers',
        section: 'setup',
      });
      expect(setCurrentView).toHaveBeenCalledWith('settings');
      fixture.destroy();
    });

    it('renders Set badge for an explicit Setup pair', async () => {
      setupStateResponse = {
        kind: 'set',
        pair: { provider: 'openai', model: 'gpt-5' },
      };
      const fixture = TestBed.createComponent(AnalyzeWorkspacePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="setup-model-badge"]')?.textContent,
      ).toContain('Set');
      expect(
        element.querySelector('[data-testid="setup-model-pair"]')?.textContent,
      ).toContain('OpenAI / gpt-5');
      fixture.destroy();
    });

    it('disables Start and honors source: setup vs workspace on invalid states', async () => {
      setupStateResponse = {
        kind: 'invalid',
        source: 'setup',
        provider: 'claude',
        model: 'claude-retired',
        cause: 'model-stale',
      };
      const fixture = TestBed.createComponent(AnalyzeWorkspacePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="setup-model-badge"]')?.textContent,
      ).toContain('Needs attention');
      const alert = element.querySelector('[data-testid="setup-model-alert"]');
      expect(alert?.textContent).toContain('claude-retired');
      expect(alert?.textContent?.toLowerCase()).not.toContain(
        'the workspace model',
      );
      expect(
        element.querySelector<HTMLButtonElement>(
          '[data-testid="start-analysis-button"]',
        )?.disabled,
      ).toBe(true);
      expect(
        element.querySelector('[data-testid="setup-start-hint"]')?.textContent,
      ).toContain('Choose a valid Setup model to start.');
      await fixture.componentInstance['startFresh']();
      expect(runner.startFreshAnalysis).not.toHaveBeenCalled();

      // Explicit "Use workspace model" clears Setup via wizard:set-setup-model
      claudeRpcCall.mockImplementationOnce((method: string, params: unknown) => {
        expect(method).toBe('wizard:set-setup-model');
        expect(params).toEqual({ provider: '', model: '' });
        return Promise.resolve({
          isSuccess: () => true,
          data: {
            committed: null,
            commitSeq: 2,
            state: {
              kind: 'unset',
              effective: { provider: 'claude', model: 'claude-sonnet-4' },
            },
          },
        });
      });
      element
        .querySelector<HTMLButtonElement>(
          '[data-testid="setup-model-use-workspace"]',
        )
        ?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="setup-model-badge"]')?.textContent,
      ).toContain('Default');
      expect(
        element.querySelector<HTMLButtonElement>(
          '[data-testid="start-analysis-button"]',
        )?.disabled,
      ).toBe(false);

      // Workspace-sourced invalid state omits "Use workspace model" and routes Sign in with providerId
      setupStateResponse = {
        kind: 'invalid',
        source: 'workspace',
        provider: 'openai',
        model: 'gpt-5',
        cause: 'not-signed-in',
      };
      await fixture.componentInstance['refreshSetupModel']();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="setup-model-use-workspace"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="setup-model-alert"]')?.textContent,
      ).toContain('the workspace model');
      const issueAction = element.querySelector<HTMLButtonElement>(
        '[data-testid="setup-model-issue-action"]',
      );
      expect(issueAction?.textContent?.trim()).toBe('Sign in');
      issueAction?.click();
      expect(requestSettingsTab).toHaveBeenCalledWith({
        tab: 'providers',
        section: 'setup',
        providerId: 'openai',
      });
      fixture.destroy();
    });

    it('refreshes on return from Settings and window focus, cleans up listener on destroy, and never rewrites run records', async () => {
      const completedRun = {
        manifest: {
          slug: 'saved',
          totalDurationMs: 2000,
          model: 'claude-opus-4',
        },
        phaseContents: { 'project-profile': 'Done' },
      };
      loaded.set(completedRun);
      const fixture = TestBed.createComponent(AnalyzeWorkspacePage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(claudeRpcCall).toHaveBeenCalledTimes(1);

      // Return from Settings refreshes preview without mutating loaded run record
      setupStateResponse = {
        kind: 'set',
        pair: { provider: 'openai', model: 'gpt-5' },
      };
      currentView.set('settings');
      fixture.detectChanges();
      currentView.set('onboarding');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(claudeRpcCall).toHaveBeenCalledTimes(2);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="setup-model-pair"]',
        )?.textContent,
      ).toContain('OpenAI / gpt-5');
      expect(loaded()).toBe(completedRun);
      expect(loaded()?.manifest.model).toBe('claude-opus-4');

      // Window focus refreshes preview
      setupStateResponse = {
        kind: 'unset',
        effective: { provider: 'claude', model: 'claude-sonnet-4' },
      };
      window.dispatchEvent(new Event('focus'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(claudeRpcCall).toHaveBeenCalledTimes(3);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="setup-model-pair"]',
        )?.textContent,
      ).toContain('claude-sonnet-4');

      // Listener is removed on destroy
      fixture.destroy();
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      expect(claudeRpcCall).toHaveBeenCalledTimes(3);
    });
  });
});
