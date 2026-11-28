import { computed, effect, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TabManagerService } from '@ptah-extension/chat-state';
import * as chatState from '@ptah-extension/chat-state';
import {
  SurfaceRoutePersistence,
  SurfaceRouterService,
  VSCodeService,
} from '@ptah-extension/core';
import {
  WEBVIEW_ROUTE_STATE_KEY,
  type SetupGenerationRunLifecycle,
  type SetupGenerationRunState,
  type SetupGenerationTabBinding,
} from '@ptah-extension/shared';

import {
  MAX_SETUP_RUNS_PER_WORKSPACE,
  SETUP_RUNS_STORAGE_KEY,
  serializeSetupRunIndex,
  type StoredSetupRunRecord,
} from './setup-run-persistence';
import { SETUP_RUN_POLL_INTERVAL_MS, SetupRunStore } from './setup-run.store';
import type { SetupRunRecord } from './setup-run.types';
import { SetupWizardStateService } from './setup-wizard-state.service';
import { WizardAnalysisRunner } from './wizard-analysis-runner.service';
import { WizardRpcError, WizardRpcService } from './wizard-rpc.service';
import { GenerationWorkflowStore } from './generation-workflow.store';
import { GenerationHandoffStore } from './generation-handoff.store';
import { GuidanceGenerationStore } from './guidance-generation.store';

jest.mock('@ptah-extension/chat-state', () => ({
  ...jest.requireActual('@ptah-extension/chat-state'),
  consumeLegacySetupTabs: jest.fn(() => []),
}));

const WS = '/ws/a';
const OTHER_WS = '/ws/b';

function record(
  over: Partial<StoredSetupRunRecord> & { id: string },
): StoredSetupRunRecord {
  return {
    workspacePath: WS,
    workflow: 'agent-generation',
    status: 'running',
    step: 'generating',
    backendRunId: null,
    analysisRunId: null,
    parentId: null,
    unseen: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

function runState(
  status: SetupGenerationRunLifecycle,
  extra: Partial<SetupGenerationRunState> = {},
): SetupGenerationRunState {
  return {
    status,
    binding: { ...binding('setup-g1'), runId: 'run-1' },
    source: { kind: 'workspace-discovery', reason: 'missing' },
    effectiveProvider: 'p',
    effectiveModel: 'm',
    ...extra,
  };
}

function binding(
  tabId: string,
  workflow: SetupGenerationTabBinding['workflow'] = 'setup-agent-generation',
  workspacePath = WS,
): SetupGenerationTabBinding {
  return { tabId, workflow, workspacePath };
}

describe('SetupRunStore', () => {
  let workspace: ReturnType<typeof signal<string | null>>;
  let runnerWorkspace: ReturnType<typeof signal<string | null>>;
  let runnerRunning: ReturnType<typeof signal<boolean>>;
  let runnerCanceling: ReturnType<typeof signal<boolean>>;
  let runnerGeneration: ReturnType<typeof signal<number>>;
  let runnerError: ReturnType<typeof signal<string | null>>;
  let multiPhaseResult: ReturnType<typeof signal<unknown>>;
  let rpc: Record<string, jest.Mock>;
  let runner: Record<string, jest.Mock | unknown>;
  let legacyTabs: jest.Mock;

  function seed(...records: SetupRunRecord[]): void {
    const index: Record<string, SetupRunRecord[]> = {};
    for (const r of records) (index[r.workspacePath] ??= []).push(r);
    localStorage.setItem(SETUP_RUNS_STORAGE_KEY, serializeSetupRunIndex(index));
  }

  function mockBoundStatus(status: SetupGenerationRunLifecycle): void {
    rpc['getBoundRunState'].mockImplementation(
      async (tab: SetupGenerationTabBinding, runId = 'run-1') =>
        runState(status, { binding: { ...tab, runId } }),
    );
  }

  function stored(): Record<string, { id: string }[]> | null {
    const raw = localStorage.getItem(SETUP_RUNS_STORAGE_KEY);
    return raw ? JSON.parse(raw).byWorkspace : null;
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      for (let j = 0; j < 12; j++) await Promise.resolve();
    }
  }

  async function create(): Promise<SetupRunStore> {
    const store = TestBed.inject(SetupRunStore);
    await flush();
    return store;
  }

  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
    workspace = signal<string | null>(WS);
    runnerWorkspace = signal<string | null>(null);
    runnerRunning = signal(false);
    runnerCanceling = signal(false);
    runnerGeneration = signal(0);
    runnerError = signal<string | null>(null);
    multiPhaseResult = signal<unknown>(null);
    legacyTabs = chatState.consumeLegacySetupTabs as unknown as jest.Mock;
    legacyTabs.mockReset().mockReturnValue([]);

    rpc = {
      getResumableRun: jest
        .fn()
        .mockResolvedValue({ analysis: null, generation: null }),
      getBoundRunState: jest.fn().mockResolvedValue(null),
      cancelBoundRun: jest.fn().mockResolvedValue(true),
      cancelAnalysis: jest.fn().mockResolvedValue(undefined),
      getAnalysisStatus: jest
        .fn()
        .mockResolvedValue({ state: 'missing', reason: 'no-analysis' }),
      listAnalyses: jest.fn().mockResolvedValue([]),
      loadAnalysis: jest.fn(),
      startBoundAgents: jest
        .fn()
        .mockResolvedValue({ accepted: { runId: 'run-9' } }),
      startBoundGuidance: jest
        .fn()
        .mockResolvedValue({ accepted: { runId: 'run-8' } }),
      regenerateBoundGuidance: jest
        .fn()
        .mockResolvedValue({ accepted: { runId: 'run-7' } }),
      getEnhancedPromptsStatus: jest.fn().mockResolvedValue({}),
      getSkillReview: jest.fn().mockResolvedValue({ review: null }),
      recommendAnalysisSkills: jest.fn().mockResolvedValue({ skills: [] }),
    };
    runner = {
      isRunning: runnerRunning.asReadonly(),
      activeWorkspacePath: runnerWorkspace.asReadonly(),
      backendActive: jest.fn(() => false),
      syncBackendActive: jest.fn(),
      setCurrentWorkspacePath: jest.fn(),
      isCanceling: runnerCanceling.asReadonly(),
      runGeneration: runnerGeneration.asReadonly(),
      errorMessage: runnerError.asReadonly(),
      isRunningForWorkspace: jest.fn(() => false),
      isResultForWorkspace: jest.fn(() => false),
      resumableAnalysis: jest.fn(() => null),
      resumeAnalysis: jest.fn().mockResolvedValue(undefined),
      startFreshAnalysis: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    configureProviders();
  });

  function configureProviders(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: WizardRpcService, useValue: rpc },
        { provide: WizardAnalysisRunner, useValue: runner },
        {
          provide: SurfaceRouterService,
          useValue: { navigateToSurface: jest.fn() },
        },
        {
          provide: SetupWizardStateService,
          useValue: { multiPhaseResult: multiPhaseResult.asReadonly() },
        },
        {
          provide: TabManagerService,
          useValue: {
            get activeWorkspacePath() {
              return workspace();
            },
          },
        },
        {
          provide: VSCodeService,
          useValue: { config: signal({ workspaceRoot: '' }) },
        },
      ],
    });
  }

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('restores and reconciles a running Windows guidance route without chat tabs', async () => {
    workspace.set('c:/ptah-e2e-ws-a/');
    const guidanceBinding = binding(
      'e2e-guidance-tab',
      'setup-project-prompt',
      'C:\\ptah-e2e-ws-a',
    );
    const runId = 'e2e-guidance-run';
    const running = runState('running', {
      binding: { ...guidanceBinding, runId },
    });
    rpc['getBoundRunState'].mockResolvedValue(running);
    seed(
      record({
        id: guidanceBinding.tabId,
        workspacePath: guidanceBinding.workspacePath,
        workflow: 'project-guidance',
        backendRunId: runId,
      }),
      record({
        id: 'e2e-agent-tab',
        workspacePath: 'C:\\ptah-e2e-ws-a',
        status: 'completed',
      }),
    );
    const setState = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'onboarding/analyze/guidance', children: [] },
          { path: 'onboarding/guidance', children: [] },
          { path: 'onboarding/analyze/generate', children: [] },
        ]),
        SurfaceRouterService,
        {
          provide: VSCodeService,
          useValue: {
            config: signal({ workspaceRoot: '', panelId: 'electron-main' }),
            isConnected: () => true,
            setState,
          },
        },
        {
          provide: SurfaceRouterService.generationRouteTabValidatorToken,
          useFactory: (runs: SetupRunStore) =>
            runs.canRestoreGenerationRoute.bind(runs),
          deps: [SetupRunStore],
        },
      ],
    });
    const surface = TestBed.inject(SurfaceRouterService);
    const router = TestBed.inject(Router);
    TestBed.inject(SurfaceRoutePersistence).start(null);
    const route =
      '/onboarding/analyze/guidance?tab=e2e-guidance-tab&run=e2e-guidance-run';

    expect(await surface.navigateToUrl(route)).toBe('navigated');
    expect(router.url).toBe(route);
    const runs = TestBed.inject(SetupRunStore);
    const workflow = TestBed.inject(GenerationWorkflowStore);
    const guidance = TestBed.inject(GuidanceGenerationStore);
    // Same projection as the mounted guidance page.
    let adoptions = 0;
    TestBed.runInInjectionContext(() =>
      effect(() => {
        const run = workflow.run();
        if (run?.binding.tabId !== guidanceBinding.tabId) return;
        if (++adoptions > 3)
          throw new Error('Guidance adoption did not settle');
        guidance.adopt(run);
      }),
    );
    workflow.bind(guidanceBinding, runId);
    await flush();
    expect(workflow.run()).toEqual(running);
    expect(guidance.run()).toBeNull();

    // The existing workflow state must be adopted even without a new RPC result.
    jest.spyOn(guidance, 'refresh').mockResolvedValueOnce(undefined);
    guidance.bind(guidanceBinding);
    await flush();
    expect(rpc['getBoundRunState']).toHaveBeenCalledWith(
      guidanceBinding,
      runId,
    );
    expect(guidance.status()).toBe('running');
    expect(runs.get(guidanceBinding.tabId)?.status).toBe('running');

    rpc['getBoundRunState'].mockResolvedValue({
      ...running,
      status: 'completed',
      committedState: 'committed',
    });
    await workflow.refresh();
    await flush();
    expect(guidance.status()).toBe('completed');
    expect(runs.get(guidanceBinding.tabId)?.status).toBe('completed');

    const standalone = '/onboarding/guidance?tab=e2e-guidance-tab';
    expect(await surface.navigateToUrl(standalone)).toBe('navigated');
    expect(router.url).toBe(standalone);

    expect(
      await surface.navigateToUrl('/onboarding/guidance?tab=missing'),
    ).toBe('failed');
    expect(
      await surface.navigateToUrl(
        '/onboarding/analyze/generate?tab=e2e-guidance-tab',
      ),
    ).toBe('failed');
    expect(
      await surface.navigateToUrl('/onboarding/guidance?tab=e2e-agent-tab'),
    ).toBe('failed');
    const agent = '/onboarding/analyze/generate?tab=e2e-agent-tab';
    expect(await surface.navigateToUrl(agent)).toBe('navigated');
    expect(setState).toHaveBeenLastCalledWith(WEBVIEW_ROUTE_STATE_KEY, {
      v: 1,
      route: agent,
      seed: null,
      panelId: 'electron-main',
    });

    workspace.set('C:\\other-workspace');
    expect(await surface.navigateToUrl(route)).toBe('failed');
    workspace.set(null);
    expect(await surface.navigateToUrl(route)).toBe('failed');
    expect(router.url).toBe(agent);

    setState.mockClear();
    expect(await router.navigateByUrl(route)).toBe(true);
    expect(setState).not.toHaveBeenCalled();
  });

  describe('status mapping: agent generation and guidance', () => {
    const cases: [SetupGenerationRunLifecycle, string][] = [
      ['starting', 'running'],
      ['running', 'running'],
      ['cancelling', 'running'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['timed-out', 'failed'],
      ['cancelled', 'cancelled'],
    ];

    it.each(cases)('maps backend %s to %s', async (lifecycle, expected) => {
      seed(record({ id: 'setup-g1' }));
      rpc['getBoundRunState'].mockResolvedValue(runState(lifecycle));
      const store = await create();

      const result = store.get('setup-g1');
      expect(result?.status).toBe(expected);
      expect(result?.backendRunId).toBe('run-1');
      if (expected === 'failed') {
        expect(result?.error).toBe('Agent generation did not finish.');
      }
    });

    it('maps an interrupted run state to interrupted', async () => {
      seed(record({ id: 'setup-g1' }));
      rpc['getBoundRunState'].mockResolvedValue(
        runState('running', { interrupted: true }),
      );
      const store = await create();
      expect(store.get('setup-g1')?.status).toBe('interrupted');
      expect(store.get('setup-g1')?.unseen).toBe(true);
    });

    it('marks a generation with no backend run as interrupted', async () => {
      seed(record({ id: 'setup-g1' }));
      const store = await create();
      expect(store.get('setup-g1')?.status).toBe('interrupted');
    });

    it('leaves a generation waiting at its preview alone', async () => {
      seed(record({ id: 'setup-g1', status: 'needs-input', step: 'preview' }));
      const store = await create();
      expect(store.get('setup-g1')?.status).toBe('needs-input');
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
    });

    it('keeps the last known status when the run state is unavailable', async () => {
      seed(record({ id: 'setup-g1' }));
      rpc['getBoundRunState'].mockRejectedValue(new Error('rpc down'));
      const store = await create();
      expect(store.get('setup-g1')?.status).toBe('running');
    });

    it('completes guidance whose output is newer than the record (R2)', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          createdAt: 1000,
        }),
      );
      rpc['getEnhancedPromptsStatus'].mockResolvedValue({
        generatedAt: new Date(5000).toISOString(),
      });
      const store = await create();
      expect(store.get('setup-p1')?.status).toBe('completed');
    });

    it('interrupts guidance whose output predates the record (R2)', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          createdAt: 9000,
        }),
      );
      rpc['getEnhancedPromptsStatus'].mockResolvedValue({
        generatedAt: new Date(5000).toISOString(),
      });
      const store = await create();
      expect(store.get('setup-p1')?.status).toBe('interrupted');
    });

    it('keeps guidance running when its status is unavailable', async () => {
      seed(record({ id: 'setup-p1', workflow: 'project-guidance' }));
      rpc['getEnhancedPromptsStatus'].mockResolvedValue({ error: 'x' });
      const store = await create();
      expect(store.get('setup-p1')?.status).toBe('running');
    });
  });

  describe('status mapping: analysis', () => {
    const manifest = (lifecycle: string) => ({
      analysis: {
        manifest: {
          runId: 'an-1',
          lifecycle,
          analyzedAt: new Date().toISOString(),
        },
      },
      analysisActive: false,
      generation: null,
    });

    it('completes a live record whose backend manifest completed', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      rpc['getResumableRun'].mockResolvedValue(manifest('completed'));
      const store = await create();
      const r = store.get('setup-a1');
      expect(r?.status).toBe('completed');
      expect(r?.analysisRunId).toBe('an-1');
    });

    it('interrupts a live record whose backend manifest paused', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      rpc['getResumableRun'].mockResolvedValue(manifest('paused'));
      const store = await create();
      expect(store.get('setup-a1')?.status).toBe('interrupted');
    });

    it('keeps the status when there is no evidence about the run', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      const store = await create();
      expect(store.get('setup-a1')?.status).toBe('running');
    });

    it('interrupts a restored analysis when the backend is inactive and no matching result exists', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      rpc['getResumableRun'].mockResolvedValue({
        analysisActive: false,
        analysis: null,
        generation: null,
      });
      rpc['listAnalyses'].mockResolvedValue([
        {
          filename: 'older',
          lifecycle: 'completed',
          savedAt: new Date(0).toISOString(),
        },
      ]);
      rpc['loadAnalysis'].mockResolvedValue({
        manifest: {
          runId: 'an-older',
          lifecycle: 'completed',
          analyzedAt: new Date(0).toISOString(),
        },
      });
      const store = await create();
      expect(store.get('setup-a1')?.status).toBe('interrupted');
      expect(rpc['loadAnalysis']).toHaveBeenCalledWith('older', WS);
    });

    it('reports a failed recovery read and leaves the inactive record retryable', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      rpc['getResumableRun'].mockResolvedValue({
        analysisActive: false,
        analysis: null,
      });
      rpc['listAnalyses'].mockRejectedValue(new Error('private path'));
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        const store = await create();
        expect(store.get('setup-a1')?.status).toBe('interrupted');
        expect(warn).toHaveBeenCalledWith(
          '[setup-run-analysis] Saved analysis recovery failed.',
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('recovers a resumed result with an older start date and no recorded backend ID', async () => {
      const createdAt = 2000;
      const analyzedAt = new Date(1000).toISOString();
      const updatedAt = new Date(3000).toISOString();
      seed(
        record({
          id: 'setup-a1',
          workflow: 'analysis',
          step: 'analyzing',
          createdAt,
          updatedAt: createdAt,
        }),
      );
      rpc['getResumableRun'].mockResolvedValue({
        analysisActive: false,
        analysis: null,
      });
      rpc['listAnalyses'].mockResolvedValue([
        { filename: 'older', lifecycle: 'completed', savedAt: analyzedAt },
        { filename: 'resumed', lifecycle: 'completed', savedAt: analyzedAt },
      ]);
      rpc['loadAnalysis']
        .mockResolvedValueOnce({
          manifest: { runId: 'an-older', lifecycle: 'completed', analyzedAt },
        })
        .mockResolvedValueOnce({
          manifest: {
            runId: 'an-resumed',
            lifecycle: 'completed',
            analyzedAt,
            updatedAt,
          },
        });
      const store = await create();
      expect(store.get('setup-a1')).toMatchObject({
        status: 'completed',
        analysisRunId: 'an-resumed',
        backendRunId: 'an-resumed',
      });
      expect(rpc['loadAnalysis']).toHaveBeenLastCalledWith('resumed', WS);
    });

    it('uses listed manifest identities and skips an unreadable legacy candidate', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      rpc['getResumableRun'].mockResolvedValue({
        analysisActive: false,
        analysis: null,
        generation: null,
      });
      const updatedAt = new Date().toISOString();
      rpc['listAnalyses'].mockResolvedValue([
        { filename: 'unreadable', lifecycle: 'completed' },
        {
          filename: 'known',
          lifecycle: 'completed',
          runId: 'an-known',
          updatedAt,
        },
      ]);
      rpc['loadAnalysis'].mockRejectedValue(new Error('private filename'));
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      try {
        const store = await create();
        expect(store.get('setup-a1')).toMatchObject({
          status: 'completed',
          analysisRunId: 'an-known',
        });
        expect(rpc['loadAnalysis']).toHaveBeenCalledTimes(1);
        expect(rpc['loadAnalysis']).toHaveBeenCalledWith('unreadable', WS);
        expect(warn).toHaveBeenCalledWith(
          '[setup-run-analysis] A saved analysis could not be read during recovery.',
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('recovers a recent saved result when the inactive backend returns no resumable manifest', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      rpc['getResumableRun'].mockResolvedValue({
        analysisActive: false,
        analysis: null,
        generation: null,
      });
      const analyzedAt = new Date().toISOString();
      rpc['listAnalyses'].mockResolvedValue([
        {
          filename: 'saved-analysis',
          lifecycle: 'completed',
          savedAt: analyzedAt,
        },
      ]);
      rpc['loadAnalysis'].mockResolvedValue({
        manifest: { runId: 'an-saved', lifecycle: 'completed', analyzedAt },
      });
      const store = await create();
      expect(rpc['loadAnalysis']).toHaveBeenCalledWith('saved-analysis', WS);
      expect(store.get('setup-a1')).toMatchObject({
        status: 'completed',
        analysisRunId: 'an-saved',
      });
    });

    it('hydrates an active backend analysis without the Analyze page and settles it when the watcher finishes', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      const startedAt = new Date().toISOString();
      rpc['getResumableRun'].mockResolvedValue({
        analysis: null,
        generation: null,
        analysisActive: true,
        activeAnalysisStartedAt: startedAt,
      });
      (runner['syncBackendActive'] as jest.Mock).mockImplementation(() => {
        runnerWorkspace.set(WS);
        runnerRunning.set(true);
      });
      (runner['backendActive'] as jest.Mock).mockImplementation(runnerRunning);
      (runner['isRunningForWorkspace'] as jest.Mock).mockImplementation(
        (path: string) => path === WS && runnerRunning(),
      );
      const store = await create();
      expect(runner['syncBackendActive']).toHaveBeenCalledWith(true, {
        startedAt,
        workspacePath: WS,
      });
      expect(store.runningCount()).toBe(1);

      rpc['listAnalyses'].mockResolvedValue([
        {
          filename: 'finished-analysis',
          lifecycle: 'completed',
          savedAt: startedAt,
        },
      ]);
      rpc['loadAnalysis'].mockResolvedValue({
        manifest: {
          runId: 'an-finished',
          lifecycle: 'completed',
          analyzedAt: startedAt,
        },
      });
      runnerRunning.set(false);
      runnerWorkspace.set(null);
      await flush();
      expect(store.get('setup-a1')).toMatchObject({
        status: 'completed',
        analysisRunId: 'an-finished',
      });
      expect(store.runningCount()).toBe(0);
    });

    it('settles the originating analysis after switching workspaces mid-run', async () => {
      const store = await create();
      const rec = store.start('analysis', WS);
      (runner['isRunningForWorkspace'] as jest.Mock).mockImplementation(
        (path: string) => path === WS && runnerRunning(),
      );
      runnerWorkspace.set(WS);
      runnerRunning.set(true);
      await flush();
      workspace.set(OTHER_WS);
      await flush();
      expect(store.get(rec!.id)?.status).toBe('running');

      (runner['isResultForWorkspace'] as jest.Mock).mockImplementation(
        (path: string) => path === WS,
      );
      multiPhaseResult.set({
        manifest: { lifecycle: 'completed', runId: 'an-2' },
      });
      runnerRunning.set(false);
      await flush();

      const done = store.get(rec!.id);
      expect(done?.status).toBe('completed');
      expect(done?.analysisRunId).toBe('an-2');
      expect(done?.unseen).toBe(true);
    });

    it('maps a runner error to failed with fixed copy', async () => {
      const store = await create();
      const rec = store.start('analysis', WS);
      (runner['isRunningForWorkspace'] as jest.Mock).mockReturnValue(true);
      runnerRunning.set(true);
      await flush();

      (runner['isRunningForWorkspace'] as jest.Mock).mockReturnValue(false);
      (runner['isResultForWorkspace'] as jest.Mock).mockReturnValue(true);
      runnerError.set('secret /home/x stack');
      runnerRunning.set(false);
      await flush();

      const failed = store.get(rec!.id);
      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('The analysis did not finish.');
    });
  });

  describe('status mapping: skill review and team builder', () => {
    it('moves a running review to needs-input when a review is stored', async () => {
      seed(
        record({
          id: 'setup-s1',
          workflow: 'skill-review',
          step: 'reviewing',
          analysisRunId: 'an-1',
        }),
      );
      rpc['getSkillReview'].mockResolvedValue({ review: { skills: [] } });
      const store = await create();
      expect(store.get('setup-s1')?.status).toBe('needs-input');
      expect(store.get('setup-s1')?.step).toBe('selecting');
    });

    it('interrupts a running review that stored nothing', async () => {
      seed(
        record({
          id: 'setup-s1',
          workflow: 'skill-review',
          step: 'reviewing',
          analysisRunId: 'an-1',
        }),
      );
      const store = await create();
      expect(store.get('setup-s1')?.status).toBe('interrupted');
    });

    it('interrupts a team builder cut during install after a reload', async () => {
      seed(
        record({
          id: 'setup-t1',
          workflow: 'team-builder',
          step: 'installing',
        }),
      );
      const store = await create();
      expect(store.get('setup-t1')?.status).toBe('interrupted');
    });

    it('keeps a team builder waiting at review', async () => {
      seed(
        record({
          id: 'setup-t1',
          workflow: 'team-builder',
          step: 'review',
          status: 'needs-input',
        }),
      );
      const store = await create();
      expect(store.get('setup-t1')?.status).toBe('needs-input');
    });
  });

  describe('saved analysis discovery', () => {
    const saved = {
      state: 'stale',
      reason: 'workspace-changed',
      analyzedAt: '2026-11-26T10:00:00.000Z',
      savedRun: {
        runId: 'analysis-on-disk',
        lifecycle: 'completed',
        updatedAt: '2026-11-26T10:10:00.000Z',
      },
    };

    it('adopts a completed disk analysis once per workspace and opens its skill review', async () => {
      rpc['getAnalysisStatus'].mockResolvedValue(saved);
      const store = await create();
      const [discovered] = store.runs();
      expect(discovered).toMatchObject({
        workflow: 'analysis',
        status: 'completed',
        analysisRunId: 'analysis-on-disk',
        analysisFreshness: { state: 'stale', reason: 'workspace-changed' },
      });
      expect(store.targetOf(discovered)).toEqual({
        subPath: ['analyze', 'skills'],
        queryParams: { tab: discovered.id, analysis: 'analysis-on-disk' },
      });
      expect(rpc['loadAnalysis']).not.toHaveBeenCalled();
      await store.refresh();
      expect(store.runs()).toEqual([discovered]);

      workspace.set(OTHER_WS);
      await flush();
      expect(store.runs()[0].id).not.toBe(discovered.id);
      expect(rpc['getAnalysisStatus']).toHaveBeenLastCalledWith(OTHER_WS);
    });

    it('surfaces initial failure, retains cached data on later failure, and retries per workspace', async () => {
      rpc['getAnalysisStatus'].mockRejectedValue(new Error('private filename'));
      const store = await create();
      expect(store.runs()).toEqual([]);
      expect(store.savedAnalysisError(WS)).toBe(
        'Could not check for saved workspace analyses.',
      );
      expect(store.savedAnalysisError(OTHER_WS)).toBeNull();

      rpc['getAnalysisStatus'].mockResolvedValue(saved);
      const retry = store.retrySavedAnalysis(WS);
      expect(store.isDiscoveringSavedAnalysis(WS)).toBe(true);
      expect(store.retrySavedAnalysis(WS)).toBe(retry);
      await retry;
      expect(store.savedAnalysisError(WS)).toBeNull();
      expect(store.isDiscoveringSavedAnalysis(WS)).toBe(false);

      const [discovered] = store.runs();
      rpc['getAnalysisStatus'].mockResolvedValue({
        ...saved,
        reason: 'unreadable',
      });
      await store.refresh();
      expect(store.savedAnalysisError(WS)).toBeTruthy();
      expect(store.runs()).toEqual([discovered]);

      rpc['getAnalysisStatus'].mockResolvedValue({
        ...saved,
        state: 'fresh',
        reason: 'ok',
      });
      await store.retrySavedAnalysis(WS);
      expect(store.savedAnalysisError(WS)).toBeNull();
      expect(store.get(discovered.id)?.analysisFreshness).toEqual({
        state: 'fresh',
        reason: 'ok',
      });
    });

    it('loads the latest completed manifest by filename on an older host', async () => {
      rpc['getAnalysisStatus'].mockResolvedValue({
        state: 'fresh',
        reason: 'ok',
        analyzedAt: saved.analyzedAt,
      });
      rpc['listAnalyses'].mockResolvedValue([
        { filename: 'old-project', lifecycle: 'completed' },
      ]);
      rpc['loadAnalysis'].mockResolvedValue({
        manifest: {
          runId: 'legacy-run',
          lifecycle: 'completed',
          analyzedAt: saved.analyzedAt,
        },
      });
      const store = await create();
      expect(store.savedAnalysisError(WS)).toBeNull();
      expect(rpc['loadAnalysis']).toHaveBeenCalledWith('old-project', WS);
      expect(store.runs()).toMatchObject([
        {
          analysisRunId: 'legacy-run',
          status: 'completed',
          analysisFreshness: { state: 'fresh', reason: 'ok' },
        },
      ]);
    });

    it('skips a legacy manifest with no stable identity without an error', async () => {
      rpc['getAnalysisStatus'].mockResolvedValue({
        state: 'stale',
        reason: 'legacy-v3',
        analyzedAt: saved.analyzedAt,
      });
      rpc['listAnalyses'].mockResolvedValue([
        { filename: 'legacy-project', lifecycle: 'completed' },
      ]);
      rpc['loadAnalysis'].mockResolvedValue({
        manifest: {
          runId: '',
          lifecycle: 'completed',
          analyzedAt: saved.analyzedAt,
        },
      });
      const store = await create();
      expect(store.savedAnalysisError(WS)).toBeNull();
      expect(store.runs()).toEqual([]);
    });

    it('reattaches freshness when Retry reads status before reconcile inserts the checkpoint', async () => {
      const store = await create();
      let finishList!: (entries: unknown[]) => void;
      rpc['listAnalyses'].mockReturnValueOnce(
        new Promise((resolve) => {
          finishList = resolve;
        }),
      );
      rpc['getAnalysisStatus'].mockResolvedValue({
        ...saved,
        reason: 'incomplete',
        savedRun: {
          ...saved.savedRun,
          runId: 'paused-analysis',
          lifecycle: 'paused',
        },
      });
      const retry = store.retrySavedAnalysis(WS);
      await flush();
      expect(rpc['listAnalyses']).toHaveBeenCalled();
      rpc['getResumableRun'].mockResolvedValue({
        analysis: {
          manifest: { runId: 'paused-analysis', lifecycle: 'paused' },
        },
        analysisActive: false,
        generation: null,
      });
      const refresh = store.refresh();
      await flush();
      expect(store.runs()[0]?.analysisFreshness).toBeUndefined();
      finishList([]);
      await Promise.all([retry, refresh]);
      expect(store.runs()[0]?.analysisFreshness).toEqual({
        state: 'stale',
        reason: 'incomplete',
      });
    });

    it('attaches incomplete freshness to its checkpoint and discovers the older completed analysis', async () => {
      rpc['getResumableRun'].mockResolvedValue({
        analysis: {
          manifest: { runId: 'incomplete-analysis', lifecycle: 'paused' },
        },
        generation: null,
        analysisActive: false,
      });
      rpc['getAnalysisStatus'].mockResolvedValue({
        ...saved,
        reason: 'incomplete',
        savedRun: {
          ...saved.savedRun,
          runId: 'incomplete-analysis',
          lifecycle: 'paused',
        },
      });
      rpc['listAnalyses'].mockResolvedValue([
        {
          runId: 'analysis-on-disk',
          lifecycle: 'completed',
          savedAt: saved.analyzedAt,
        },
      ]);
      const store = await create();
      expect(store.runs()).toMatchObject([
        {
          analysisRunId: 'incomplete-analysis',
          status: 'interrupted',
          analysisFreshness: { state: 'stale', reason: 'incomplete' },
        },
        { analysisRunId: 'analysis-on-disk', status: 'completed' },
      ]);
      expect(store.runs()[1].analysisFreshness).toBeUndefined();
      expect(rpc['listAnalyses']).toHaveBeenCalledWith({
        workspacePath: WS,
        throwOnError: true,
      });

      expect(store.dismiss(store.runs()[0].id)).toBe(true);
      expect(store.dismiss(store.runs()[0].id)).toBe(true);
      await store.refresh();
      expect(store.runs()).toEqual([]);
    });
  });

  it('clears dismissal when an explicit analysis resume claims the saved identity', async () => {
    seed(
      record({
        id: 'setup-analysis',
        workflow: 'analysis',
        step: 'analyzing',
        status: 'interrupted',
        backendRunId: 'saved-analysis',
        analysisRunId: 'saved-analysis',
      }),
    );
    const store = await create();
    expect(store.dismiss('setup-analysis')).toBe(true);
    const resumed = store.start('analysis', WS);
    if (!resumed) throw new Error('Expected an analysis record');
    store.report(resumed.id, {
      backendRunId: 'saved-analysis',
      analysisRunId: 'saved-analysis',
    });
    await flush();
    expect(localStorage.getItem(SETUP_RUNS_STORAGE_KEY)).not.toContain(
      '"dismissals"',
    );
    expect(store.get(resumed.id)?.backendRunId).toBe('saved-analysis');
  });

  it('keeps verified written counts through live and terminal generation state', async () => {
    const store = await create();
    store.adopt(binding('setup-g1'));
    const counts = {
      total: 2,
      written: 1,
      unchanged: 0,
      failed: 0,
      skipped: 0,
      rejected: 0,
    };
    store.reportRun('setup-g1', runState('running', { agentsWritten: 1 }));
    expect(store.get('setup-g1')?.agentsWritten).toBe(1);
    store.reportRun(
      'setup-g1',
      runState('completed', {
        result: {
          status: 'completed',
          success: true,
          source: { kind: 'workspace-discovery', reason: 'missing' },
          effectiveProvider: 'p',
          effectiveModel: 'm',
          counts: { ...counts, written: 2 },
        },
      }),
    );
    expect(store.get('setup-g1')).toMatchObject({
      status: 'completed',
      agentsWritten: 2,
    });
  });

  it('clears previous metadata when report identities change', async () => {
    seed(
      record({
        id: 'setup-generation',
        status: 'interrupted',
        backendRunId: 'old-gen',
        agentsWritten: 2,
      }),
      record({
        id: 'setup-analysis',
        workflow: 'analysis',
        step: 'analyzing',
        status: 'interrupted',
        analysisRunId: 'old-analysis',
        analysisFreshness: { state: 'stale', reason: 'incomplete' },
      }),
    );
    const store = await create();
    expect(
      store.report('setup-generation', { backendRunId: 'new-gen' })
        ?.agentsWritten,
    ).toBeUndefined();
    expect(
      store.report('setup-analysis', { analysisRunId: 'new-analysis' })
        ?.analysisFreshness,
    ).toBeUndefined();
  });

  describe('checkpoint dismissal', () => {
    it('survives a workspace switch and reload, while explicit generation resume still works', async () => {
      const checkpoint = {
        analysis: null,
        generation: {
          runId: 'gen-1',
          ownerTabId: 'setup-original',
          lifecycle: 'paused',
          agents: [
            { status: 'written' },
            { status: 'failed' },
            { status: 'written' },
          ],
        },
      };
      let discoveryFails = false;
      rpc['getResumableRun'].mockImplementation(async (root: string) => {
        if (root === OTHER_WS) return { analysis: null, generation: null };
        if (discoveryFails) throw new Error('offline');
        return checkpoint;
      });
      rpc['startBoundAgents'].mockImplementation(
        async ({ tabId }: SetupGenerationTabBinding) =>
          tabId === checkpoint.generation.ownerTabId
            ? { accepted: { runId: checkpoint.generation.runId } }
            : {
                rejection: {
                  reason: 'blocked',
                  ownerTabId: checkpoint.generation.ownerTabId,
                },
              },
      );
      let store = await create();
      const [adopted] = store.runs();
      const canReopen = computed(() => store.hasDismissedGeneration(WS));
      expect(canReopen()).toBe(false);
      expect(adopted).toMatchObject({
        status: 'interrupted',
        agentsWritten: 2,
      });
      expect(store.dismiss(adopted.id)).toBe(true);
      expect(canReopen()).toBe(true);
      workspace.set(OTHER_WS);
      await flush();
      expect(store.runs()).toEqual([]);
      expect(store.hasDismissedGeneration(OTHER_WS)).toBe(false);

      discoveryFails = true;
      workspace.set(WS);
      await flush();
      await store.refresh();
      expect(store.runs()).toEqual([]);
      expect(store.hasDismissedGeneration(WS)).toBe(true);
      discoveryFails = false;
      TestBed.resetTestingModule();
      configureProviders();
      store = await create();
      expect(store.runs()).toEqual([]);
      expect(store.hasDismissedGeneration(WS)).toBe(true);
      expect(store.reopenDismissedGeneration(OTHER_WS)).toBeNull();

      const reopened = store.reopenDismissedGeneration(WS);
      expect(reopened).toMatchObject({
        id: 'setup-original',
        backendRunId: 'gen-1',
        status: 'interrupted',
        unseen: false,
        agentsWritten: 2,
      });
      expect(store.hasDismissedGeneration(WS)).toBe(false);
      if (!reopened) throw new Error('Expected a reopened generation record');
      await expect(store.retry(reopened.id)).resolves.toMatchObject({
        id: 'setup-original',
        status: 'running',
        backendRunId: 'gen-1',
      });
      expect(store.runs()).toHaveLength(1);
      await flush();
      expect(localStorage.getItem(SETUP_RUNS_STORAGE_KEY)).not.toContain(
        '"dismissals"',
      );
      expect(rpc['startBoundAgents']).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: reopened.id, workspacePath: WS }),
        [],
        true,
      );
    });
    it('can reopen a locally interrupted run before discovery and shows a refusal without inventing a running owner', async () => {
      seed(
        record({
          id: 'setup-local',
          status: 'interrupted',
          backendRunId: 'gen-local',
          agentsWritten: 1,
        }),
      );
      const store = await create();
      expect(store.dismiss('setup-local')).toBe(true);
      expect(store.hasDismissedGeneration(WS)).toBe(true);
      expect(store.reopenDismissedGeneration(WS)).toMatchObject({
        id: 'setup-local',
        status: 'interrupted',
        agentsWritten: 1,
      });
      rpc['startBoundAgents'].mockResolvedValue({
        rejection: { reason: 'blocked', ownerTabId: 'different-owner' },
      });
      rpc['getBoundRunState'].mockResolvedValue(
        runState('starting', {
          binding: { ...binding('different-owner'), runId: 'gen-local' },
        }),
      );
      await expect(store.retry('setup-local')).resolves.toMatchObject({
        id: 'setup-local',
        status: 'interrupted',
        error: 'Could not resume the saved agent generation.',
      });
      expect(store.runs()).toHaveLength(1);
      expect(store.runningCount()).toBe(0);
    });
  });

  it('retains explicitly reported team builder recovery fields through later updates and reload', async () => {
    let store = await create();
    const run = store.start('team-builder', WS);
    if (!run) throw new Error('Expected a Team Builder record');
    const selectedIds = ['owner/agent'];
    store.report(run.id, {
      teamBuilder: {
        intent: 'Build the team',
        installed: [],
        selectedIds,
        ownerDecision: null,
        installCompleted: false,
        hadAttachments: true,
      },
    });
    selectedIds.push('changed-after-report');
    store.report(run.id, {
      teamBuilder: {
        intent: 'Build the team',
        installed: ['owner/agent'],
        ownerDecision: undefined,
        installCompleted: undefined,
        hadAttachments: undefined,
      },
    });
    await flush();
    TestBed.resetTestingModule();
    configureProviders();
    store = await create();

    expect(store.get(run.id)?.teamBuilder).toEqual({
      intent: 'Build the team',
      installed: ['owner/agent'],
      selectedIds: ['owner/agent'],
      ownerDecision: null,
      installCompleted: false,
      hadAttachments: true,
    });
  });

  describe('adoption', () => {
    it('adopts a running generation checkpoint from get-resumable-run', async () => {
      mockBoundStatus('running');
      rpc['getResumableRun'].mockResolvedValue({
        analysis: null,
        generation: { runId: 'gen-1', lifecycle: 'running' },
      });
      const store = await create();
      const [adopted] = store.runs();
      expect(adopted.workflow).toBe('agent-generation');
      expect(adopted.status).toBe('running');
      expect(adopted.backendRunId).toBe('gen-1');
    });

    it('adopts a paused generation checkpoint as an unseen interrupted run', async () => {
      rpc['getResumableRun'].mockResolvedValue({
        analysis: null,
        generation: { runId: 'gen-1', lifecycle: 'paused' },
      });
      const store = await create();
      const [adopted] = store.runs();
      expect(adopted.status).toBe('interrupted');
      expect(adopted.unseen).toBe(true);
    });

    it('does not adopt a completed checkpoint or one that has a record', async () => {
      rpc['getResumableRun'].mockResolvedValue({
        analysis: null,
        generation: { runId: 'gen-1', lifecycle: 'completed' },
      });
      const store = await create();
      expect(store.runs()).toHaveLength(0);

      rpc['getResumableRun'].mockResolvedValue({
        analysis: null,
        generation: { runId: 'gen-1', lifecycle: 'paused' },
      });
      await store.refresh();
      await store.refresh();
      expect(store.runs()).toHaveLength(1);
    });

    it('adopts an active analysis as a running record', async () => {
      rpc['getResumableRun'].mockResolvedValue({
        analysis: { manifest: { runId: 'an-1', lifecycle: 'running' } },
        analysisActive: true,
        generation: null,
      });
      const store = await create();
      const [adopted] = store.runs();
      expect(adopted.workflow).toBe('analysis');
      expect(adopted.status).toBe('running');
      expect(adopted.backendRunId).toBe('an-1');
    });

    it('adopts a paused analysis as an interrupted record', async () => {
      rpc['getResumableRun'].mockResolvedValue({
        analysis: { manifest: { runId: 'an-1', lifecycle: 'paused' } },
        generation: null,
      });
      const store = await create();
      expect(store.runs()[0].status).toBe('interrupted');
    });

    it.each([
      [1_000, 'completed'],
      [-1_000, 'interrupted'],
    ])(
      'reconciles legacy guidance with an output timestamp offset of %i ms',
      async (offset, status) => {
        workspace.set('c:/ptah-e2e-ws-a/');
        const legacy = binding(
          'legacy-tab-1',
          'setup-project-prompt',
          'C:\\ptah-e2e-ws-a',
        );
        const lastActivityAt = Date.now() - 2_000;
        legacyTabs.mockReturnValueOnce([{ ...legacy, lastActivityAt }]);
        rpc['getEnhancedPromptsStatus'].mockResolvedValue({
          generatedAt: new Date(lastActivityAt + offset).toISOString(),
        });
        const store = TestBed.inject(SetupRunStore);
        const canRestore = computed(() =>
          store.canRestoreGenerationRoute(legacy.tabId, legacy.workflow),
        );
        expect(canRestore()).toBe(true);
        expect(store.get(legacy.tabId)).toMatchObject({
          workflow: 'project-guidance',
          status: 'running',
          createdAt: lastActivityAt,
        });

        await flush();
        expect(store.get(legacy.tabId)?.status).toBe(status);
        workspace.set('C:\\other-workspace');
        expect(canRestore()).toBe(false);
      },
    );

    it.each([undefined, 0, -1, NaN, Date.now() + 60_000])(
      'uses the migration time for an invalid legacy activity timestamp (%s)',
      async (lastActivityAt) => {
        const now = Date.now();
        const legacy = binding('legacy-tab-1', 'setup-project-prompt');
        legacyTabs.mockReturnValueOnce([{ ...legacy, lastActivityAt }]);
        rpc['getEnhancedPromptsStatus'].mockResolvedValue({
          generatedAt: new Date(now - 1).toISOString(),
        });

        const store = await create();
        expect(store.get(legacy.tabId)).toMatchObject({
          createdAt: now,
          status: 'interrupted',
        });
      },
    );

    it('adopts a push for an unknown id and returns the existing record', async () => {
      const store = await create();
      const first = store.adopt(binding('owner-1'));
      expect(first?.id).toBe('owner-1');
      expect(first?.workflow).toBe('agent-generation');
      expect(store.adopt(binding('owner-1'))).toBe(store.get('owner-1'));
      expect(store.runs()).toHaveLength(1);
    });

    it('refuses to adopt a binding with an invalid id or workspace', async () => {
      const store = await create();
      expect(store.adopt(binding('bad/id'))).toBeNull();
      expect(
        store.adopt(binding('ok-id', 'setup-agent-generation', '')),
      ).toBeNull();
    });

    it('adopts the ownerTabId of a blocked retry (R1)', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          status: 'failed',
          error: 'old',
        }),
      );
      rpc['startBoundGuidance'].mockResolvedValue({
        rejection: { reason: 'blocked', ownerTabId: 'owner-9' },
      });
      const store = await create();
      const result = await store.retry('setup-p1');
      expect(result?.id).toBe('owner-9');
      expect(store.get('owner-9')?.workflow).toBe('project-guidance');
      expect(store.get('setup-p1')?.status).toBe('failed');
    });
  });

  describe('persistence', () => {
    it('caps a workspace at 20 and evicts the oldest terminal run first', async () => {
      const records: SetupRunRecord[] = [
        record({
          id: 'setup-live',
          workflow: 'analysis',
          step: 'analyzing',
          createdAt: 1,
        }),
      ];
      for (let i = 0; i < MAX_SETUP_RUNS_PER_WORKSPACE - 1; i++) {
        records.push(
          record({
            id: `setup-done-${i}`,
            workflow: 'skill-review',
            step: 'selecting',
            status: 'completed',
            createdAt: 10 + i,
          }),
        );
      }
      seed(...records);
      rpc['getResumableRun'].mockResolvedValue({
        analysis: { manifest: { runId: 'x', lifecycle: 'running' } },
        analysisActive: true,
        generation: null,
      });
      const store = await create();
      expect(store.runs()).toHaveLength(MAX_SETUP_RUNS_PER_WORKSPACE);

      store.start('project-guidance', WS);

      const ids = store.runs().map((r) => r.id);
      expect(ids).toHaveLength(MAX_SETUP_RUNS_PER_WORKSPACE);
      expect(ids).toContain('setup-live');
      expect(ids).not.toContain('setup-done-0');
      expect(ids).toContain('setup-done-1');
    });

    it('starts empty and rewrites storage when the payload is corrupt', async () => {
      localStorage.setItem(SETUP_RUNS_STORAGE_KEY, '{not json');
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const store = await create();

      expect(store.runs()).toEqual([]);
      expect(warn).toHaveBeenCalled();
      const raw = JSON.parse(
        localStorage.getItem(SETUP_RUNS_STORAGE_KEY) ?? 'null',
      );
      expect(raw).toEqual({ version: 1, byWorkspace: {} });
    });

    it('discards an invalid stored record and keeps the valid ones', async () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      localStorage.setItem(
        SETUP_RUNS_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          byWorkspace: {
            [WS]: [record({ id: 'setup-ok', status: 'completed' }), { id: 5 }],
          },
        }),
      );
      const store = await create();
      expect(store.runs().map((r) => r.id)).toEqual(['setup-ok']);
      expect(warn).toHaveBeenCalled();
    });

    it('writes once per microtask however many changes happen', async () => {
      const store = await create();
      const setItem = jest.spyOn(Storage.prototype, 'setItem');
      setItem.mockClear();

      const rec = store.start('skill-review', WS, { analysisRunId: 'an-1' });
      store.setStep(rec!.id, 'selecting');
      store.setSelection(rec!.id, ['a', 'b']);
      store.report(rec!.id, { status: 'needs-input' });
      expect(setItem).not.toHaveBeenCalled();

      await Promise.resolve();
      const writes = setItem.mock.calls.filter(
        ([key]) => key === SETUP_RUNS_STORAGE_KEY,
      );
      expect(writes).toHaveLength(1);
      expect(stored()?.[WS]).toHaveLength(1);
      expect(
        JSON.parse(localStorage.getItem(SETUP_RUNS_STORAGE_KEY) ?? '{}')
          .byWorkspace[WS][0].selection,
      ).toEqual({ skillIds: ['a', 'b'] });
    });

    it('restores records written by an earlier store', async () => {
      seed(
        record({
          id: 'setup-old',
          status: 'completed',
          workflow: 'skill-review',
          step: 'selecting',
        }),
      );
      const store = await create();
      expect(store.get('setup-old')?.status).toBe('completed');
    });
  });

  describe('shared poll', () => {
    function boundRunning(
      id: string,
      workflow: SetupRunRecord['workflow'],
      ws = WS,
    ) {
      return record({ id, workflow, workspacePath: ws, backendRunId: 'run-1' });
    }

    beforeEach(() => {
      mockBoundStatus('running');
    });

    it('polls every 2.5 s with one timer for all running bound runs', async () => {
      seed(
        boundRunning('setup-g1', 'agent-generation'),
        boundRunning('setup-p1', 'project-guidance'),
      );
      await create();
      rpc['getBoundRunState'].mockClear();

      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS - 1);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(4);
    });

    it('does not poll when no bound run is running', async () => {
      seed(
        record({
          id: 'setup-s1',
          workflow: 'skill-review',
          step: 'selecting',
          status: 'needs-input',
        }),
      );
      await create();
      rpc['getBoundRunState'].mockClear();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 3);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
    });

    it('stops polling a run once it is terminal', async () => {
      seed(boundRunning('setup-g1', 'agent-generation'));
      await create();
      rpc['getBoundRunState'].mockClear();
      mockBoundStatus('completed');
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 3);
      expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(1);
    });

    it('pauses on a workspace switch and resumes when switching back', async () => {
      seed(boundRunning('setup-g1', 'agent-generation'));
      const store = await create();
      workspace.set(OTHER_WS);
      await flush();
      rpc['getBoundRunState'].mockClear();

      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 3);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
      expect(store.runs()).toEqual([]);

      workspace.set(WS);
      await flush();
      rpc['getBoundRunState'].mockClear();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(1);
    });

    it('skips a run whose pushes arrive', async () => {
      seed(boundRunning('setup-g1', 'agent-generation'));
      const store = await create();
      store.reportStream({ ...binding('setup-g1'), runId: 'run-1' });
      await flush();
      rpc['getBoundRunState'].mockClear();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 2);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('creates a record with the workflow defaults', async () => {
      const store = await create();
      const rec = store.start('skill-review', `${WS}/`, {
        analysisRunId: 'an-1',
        origin: 'chat',
      });
      expect(rec).toMatchObject({
        workspacePath: `${WS}/`,
        workflow: 'skill-review',
        status: 'running',
        step: 'reviewing',
        analysisRunId: 'an-1',
        origin: 'chat',
        unseen: false,
      });
      expect(rec?.id).toMatch(/^setup-/);
    });

    it('attaches to the live record of the same workflow (rule 1)', async () => {
      const store = await create();
      const first = store.start('agent-generation', WS, {
        status: 'needs-input',
        step: 'preview',
      });
      const second = store.start('agent-generation', WS);
      expect(second?.id).toBe(first?.id);
      expect(store.runs()).toHaveLength(1);
    });

    it('retains the native Windows path through updates in the shared workspace bucket', async () => {
      const nativePath = 'C:\\Work\\Repo';
      const alias = 'c:/work/repo';
      workspace.set(nativePath);
      const store = await create();
      const run = store.start('agent-generation', nativePath);
      if (!run) throw new Error('Expected a Windows Setup run');
      expect(store.start('agent-generation', alias)?.id).toBe(run.id);
      expect(store.workspacePath()).toBe(nativePath);
      expect(store.bindingFor(run)?.workspacePath).toBe(nativePath);

      store.report(run.id, { status: 'completed' });
      expect(store.runsFor(alias)).toEqual([
        expect.objectContaining({
          status: 'completed',
          workspacePath: nativePath,
        }),
      ]);
      expect(store.dismiss(run.id)).toBe(true);
      expect(store.runsFor(nativePath)).toEqual([]);
    });

    it('creates a second record in another workspace or after a terminal one', async () => {
      const store = await create();
      const first = store.start('analysis', WS)!;
      expect(store.start('analysis', OTHER_WS)?.id).not.toBe(first.id);
      store.report(first.id, { status: 'completed' });
      expect(store.start('analysis', WS)?.id).not.toBe(first.id);
    });

    it('ignores a step that does not belong to the workflow and rejects an empty workspace', async () => {
      const store = await create();
      expect(store.start('analysis', '  ')).toBeNull();
      expect(store.start('analysis', null)).toBeNull();
      expect(store.start('analysis', WS, { step: 'preview' })?.step).toBe(
        'analyzing',
      );
    });
  });

  describe('cancel', () => {
    it('waits for the backend confirmation before cancelling a bound run', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      mockBoundStatus('running');
      let confirm!: (value: boolean) => void;
      rpc['cancelBoundRun'].mockReturnValue(
        new Promise<boolean>((resolve) => (confirm = resolve)),
      );
      const store = await create();

      const pending = store.cancel('setup-g1');
      await flush();
      expect(store.isCancelling('setup-g1')).toBe(true);
      expect(store.get('setup-g1')?.status).toBe('running');

      confirm(true);
      expect(await pending).toBe(true);
      expect(store.get('setup-g1')?.status).toBe('cancelled');
      expect(store.isCancelling('setup-g1')).toBe(false);
    });

    it('stays running when the backend refuses and the run is still active', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      mockBoundStatus('running');
      rpc['cancelBoundRun'].mockResolvedValue(false);
      const store = await create();
      expect(await store.cancel('setup-g1')).toBe(false);
      expect(store.get('setup-g1')?.status).toBe('running');
      expect(store.isCancelling('setup-g1')).toBe(false);
    });

    it('stays running when the cancel request fails', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      mockBoundStatus('running');
      rpc['cancelBoundRun'].mockRejectedValue(new Error('down'));
      const store = await create();
      expect(await store.cancel('setup-g1')).toBe(false);
      expect(store.get('setup-g1')?.status).toBe('running');
    });

    it('does not cancel an analysis the backend still reports active', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      rpc['getResumableRun'].mockResolvedValue({
        analysis: null,
        analysisActive: true,
        generation: null,
      });
      const store = await create();
      expect(await store.cancel('setup-a1')).toBe(false);
      expect(rpc['cancelAnalysis']).toHaveBeenCalled();
      expect(store.get('setup-a1')?.status).toBe('running');
    });

    it('checks the cancelled analysis workspace even after a switch', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      let finishCancel!: () => void;
      rpc['cancelAnalysis'].mockReturnValue(
        new Promise<void>((resolve) => {
          finishCancel = resolve;
        }),
      );
      rpc['getResumableRun'].mockImplementation(async (root: string) => ({
        analysis: null,
        generation: null,
        analysisActive: root === WS,
      }));
      const store = await create();
      const cancel = store.cancel('setup-a1');
      expect(rpc['cancelAnalysis']).toHaveBeenCalledTimes(1);
      workspace.set(OTHER_WS);
      await flush();
      finishCancel();
      expect(await cancel).toBe(false);
      expect(rpc['getResumableRun']).toHaveBeenLastCalledWith(WS, {
        throwOnError: true,
      });
      expect(store.get('setup-a1')?.status).toBe('running');
    });

    it('cancels an analysis once the backend is no longer active', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      const store = await create();
      rpc['getResumableRun'].mockResolvedValue({
        analysis: null,
        generation: null,
        analysisActive: false,
      });
      expect(await store.cancel('setup-a1')).toBe(true);
      expect(store.get('setup-a1')?.status).toBe('cancelled');
    });

    it('does nothing for a terminal or unknown run', async () => {
      seed(record({ id: 'setup-g1', status: 'completed' }));
      const store = await create();
      expect(await store.cancel('setup-g1')).toBe(false);
      expect(await store.cancel('missing')).toBe(false);
      expect(rpc['cancelBoundRun']).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('reuses the record and starts a fresh analysis', async () => {
      seed(
        record({
          id: 'setup-a1',
          workflow: 'analysis',
          step: 'analyzing',
          status: 'failed',
          error: 'x',
        }),
      );
      const store = await create();
      const result = await store.retry('setup-a1');
      expect(result?.id).toBe('setup-a1');
      expect(result?.status).toBe('running');
      expect(result?.error).toBeUndefined();
      expect(runner['startFreshAnalysis']).toHaveBeenCalledWith(WS);
    });

    it('resumes the analysis when the runner has a resumable one', async () => {
      seed(
        record({
          id: 'setup-a1',
          workflow: 'analysis',
          step: 'analyzing',
          status: 'interrupted',
        }),
      );
      (runner['resumableAnalysis'] as jest.Mock).mockReturnValue({
        runId: 'an-1',
      });
      const store = await create();
      await store.retry('setup-a1');
      expect(runner['resumeAnalysis']).toHaveBeenCalledWith(WS);
    });

    it('resumes a generation from its checkpoint and records the new run id', async () => {
      seed(record({ id: 'setup-g1', status: 'failed' }));
      const store = await create();
      const result = await store.retry('setup-g1');
      expect(rpc['startBoundAgents']).toHaveBeenCalledWith(
        {
          tabId: 'setup-g1',
          workflow: 'setup-agent-generation',
          workspacePath: WS,
        },
        [],
        true,
      );
      expect(result?.status).toBe('running');
      expect(result?.backendRunId).toBe('run-9');
    });

    it('marks the retry failed with fixed copy when the start is rejected', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          status: 'failed',
        }),
      );
      rpc['startBoundGuidance'].mockResolvedValue({
        rejection: { reason: 'invalid', message: 'secret' },
      });
      const store = await create();
      const result = await store.retry('setup-p1');
      expect(result?.status).toBe('failed');
      expect(result?.error).toBe('The run could not be started.');
    });

    it('returns a team builder to its review step', async () => {
      seed(
        record({
          id: 'setup-t1',
          workflow: 'team-builder',
          step: 'installing',
          status: 'interrupted',
        }),
      );
      const store = await create();
      const result = await store.retry('setup-t1');
      expect(result?.status).toBe('needs-input');
      expect(result?.step).toBe('review');
    });

    it('does nothing for a run that is not failed or interrupted', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      mockBoundStatus('running');
      const store = await create();
      expect(await store.retry('setup-g1')).toBeNull();
      expect(rpc['startBoundAgents']).not.toHaveBeenCalled();
    });
  });

  describe('rerun', () => {
    it('creates a new record and keeps the old one (rule 4)', async () => {
      seed(
        record({
          id: 'setup-a1',
          workflow: 'analysis',
          step: 'analyzing',
          status: 'completed',
          parentId: 'setup-parent',
          analysisRunId: 'old-analysis-output',
        }),
      );
      const store = await create();
      const next = store.rerun('setup-a1');
      expect(next?.id).not.toBe('setup-a1');
      expect(next?.parentId).toBe('setup-parent');
      expect(next?.analysisRunId).toBeNull();
      expect(store.get('setup-a1')?.analysisRunId).toBe('old-analysis-output');
      expect(next?.status).toBe('running');
      expect(store.get('setup-a1')?.status).toBe('completed');
      expect(store.runs()).toHaveLength(2);
      expect(runner['startFreshAnalysis']).toHaveBeenCalledWith(WS);
    });

    it('starts a judged review for a skill-review rerun', async () => {
      seed(
        record({
          id: 'setup-s1',
          workflow: 'skill-review',
          step: 'selecting',
          status: 'completed',
          analysisRunId: 'an-1',
        }),
      );
      const store = await create();
      const next = store.rerun('setup-s1');
      await flush();
      expect(rpc['recommendAnalysisSkills']).toHaveBeenCalledWith('an-1');
      expect(next?.analysisRunId).toBe('an-1');
      expect(store.get('setup-s1')?.status).toBe('completed');
      expect(store.get(next!.id)?.status).toBe('needs-input');
    });

    it('waits at needs-input for a generation rerun without starting backend work', async () => {
      seed(record({ id: 'setup-g1', status: 'cancelled' }));
      const store = await create();
      const next = store.rerun('setup-g1');
      expect(next?.status).toBe('needs-input');
      expect(rpc['startBoundAgents']).not.toHaveBeenCalled();
    });

    it('regenerates guidance for a guidance rerun', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          status: 'completed',
        }),
      );
      const store = await create();
      const next = store.rerun('setup-p1');
      await flush();
      expect(rpc['regenerateBoundGuidance']).toHaveBeenCalledWith(
        expect.objectContaining({
          tabId: next!.id,
          workflow: 'setup-project-prompt',
        }),
      );
      expect(store.get(next!.id)?.backendRunId).toBe('run-7');
    });

    it('attaches to a live run of the workflow instead of creating another', async () => {
      seed(
        record({ id: 'setup-old', status: 'completed', createdAt: 1 }),
        record({
          id: 'setup-live',
          status: 'needs-input',
          step: 'preview',
          createdAt: 2,
        }),
      );
      const store = await create();
      expect(store.rerun('setup-old')?.id).toBe('setup-live');
      expect(store.runs()).toHaveLength(2);
    });

    it('refuses to rerun a failed or running record', async () => {
      seed(
        record({ id: 'setup-f', status: 'failed', createdAt: 1 }),
        record({
          id: 'setup-r',
          workflow: 'skill-review',
          step: 'selecting',
          status: 'needs-input',
          createdAt: 2,
        }),
      );
      const store = await create();
      expect(store.rerun('setup-f')).toBeNull();
      expect(store.rerun('setup-r')).toBeNull();
    });
  });

  describe('reviewSkills', () => {
    function reviewRecord(over: Partial<SetupRunRecord> = {}): SetupRunRecord {
      return record({
        id: 'setup-s1',
        workflow: 'skill-review',
        step: 'reviewing',
        analysisRunId: 'an-1',
        status: 'needs-input',
        ...over,
      });
    }

    it('returns the stored review without a judged call', async () => {
      seed(reviewRecord());
      const review = { skills: [{ id: 'a' }] };
      rpc['getSkillReview'].mockResolvedValue({ review });
      const store = await create();
      expect(await store.reviewSkills('setup-s1')).toBe(review);
      expect(rpc['recommendAnalysisSkills']).not.toHaveBeenCalled();
      expect(store.get('setup-s1')?.step).toBe('selecting');
    });

    it('runs the judged call when none is stored', async () => {
      seed(reviewRecord());
      const store = await create();
      await store.reviewSkills('setup-s1');
      expect(rpc['recommendAnalysisSkills']).toHaveBeenCalledWith('an-1');
      expect(store.get('setup-s1')?.status).toBe('needs-input');
    });

    it('shares one in-flight call between callers', async () => {
      seed(reviewRecord());
      let resolve!: (value: unknown) => void;
      rpc['recommendAnalysisSkills'].mockReturnValue(
        new Promise((r) => (resolve = r)),
      );
      const store = await create();
      const a = store.reviewSkills('setup-s1', { force: true });
      const b = store.reviewSkills('setup-s1', { force: true });
      expect(store.get('setup-s1')?.status).toBe('running');
      resolve({ skills: [] });
      await Promise.all([a, b]);
      expect(rpc['recommendAnalysisSkills']).toHaveBeenCalledTimes(1);
    });

    it('fails the record with fixed copy and rethrows when there was no review', async () => {
      seed(reviewRecord({ status: 'running' }));
      const failure = new Error('boom');
      rpc['recommendAnalysisSkills'].mockRejectedValue(failure);
      const store = await create();
      await expect(store.reviewSkills('setup-s1')).rejects.toBe(failure);
      expect(store.get('setup-s1')?.status).toBe('failed');
      expect(store.get('setup-s1')?.error).toBe(
        'Could not load skill recommendations.',
      );
    });

    it('keeps the earlier review state when a forced review fails', async () => {
      seed(reviewRecord());
      rpc['recommendAnalysisSkills'].mockRejectedValue(new Error('boom'));
      const store = await create();
      await expect(
        store.reviewSkills('setup-s1', { force: true }),
      ).rejects.toThrow('boom');
      expect(store.get('setup-s1')?.status).toBe('needs-input');
      expect(store.get('setup-s1')?.step).toBe('selecting');
    });

    it('returns null for a record without an analysis or of another workflow', async () => {
      seed(
        reviewRecord({ analysisRunId: null }),
        record({ id: 'setup-g1', createdAt: 5 }),
      );
      const store = await create();
      expect(await store.reviewSkills('setup-s1')).toBeNull();
      expect(await store.reviewSkills('setup-g1')).toBeNull();
    });
  });

  describe('dismiss', () => {
    it('removes terminal records only (rule 6)', async () => {
      seed(
        record({ id: 'setup-live', createdAt: 1 }),
        record({
          id: 'setup-wait',
          workflow: 'skill-review',
          step: 'selecting',
          status: 'needs-input',
          createdAt: 2,
        }),
        record({
          id: 'setup-done',
          workflow: 'project-guidance',
          status: 'completed',
          createdAt: 3,
        }),
      );
      mockBoundStatus('running');
      const store = await create();

      expect(store.dismiss('setup-live')).toBe(false);
      expect(store.dismiss('setup-wait')).toBe(false);
      expect(store.dismiss('missing')).toBe(false);
      expect(store.dismiss('setup-done')).toBe(true);
      expect(store.get('setup-done')).toBeNull();
      expect(
        store
          .runs()
          .map((r) => r.id)
          .sort(),
      ).toEqual(['setup-live', 'setup-wait']);
      await flush();
      expect(
        stored()
          ?.[WS].map((r) => r.id)
          .sort(),
      ).toEqual(['setup-live', 'setup-wait']);
    });
  });

  describe('attach and release (rule 7)', () => {
    it('marks a completion without a view as unseen and counts it', async () => {
      const store = await create();
      const rec = store.start('skill-review', WS, { analysisRunId: 'an-1' })!;
      expect(store.runningCount()).toBe(1);
      store.report(rec.id, { status: 'completed' });
      expect(store.get(rec.id)?.unseen).toBe(true);
      expect(store.attentionCount()).toBe(1);
      expect(store.runningCount()).toBe(0);
    });

    it('does not mark a completion unseen while a view is attached', async () => {
      const store = await create();
      const rec = store.start('skill-review', WS, { analysisRunId: 'an-1' })!;
      store.attach(rec.id);
      store.report(rec.id, { status: 'completed' });
      expect(store.get(rec.id)?.unseen).toBe(false);
      expect(store.attentionCount()).toBe(0);
    });

    it('marks a completion unseen after release and clears it on attach', async () => {
      const store = await create();
      const rec = store.start('skill-review', WS, { analysisRunId: 'an-1' })!;
      store.attach(rec.id);
      store.release(rec.id);
      store.report(rec.id, { status: 'failed', error: 'x' });
      expect(store.get(rec.id)?.unseen).toBe(true);
      store.attach(rec.id);
      expect(store.get(rec.id)?.unseen).toBe(false);
    });

    it('counts needs-input runs as attention', async () => {
      const store = await create();
      store.start('agent-generation', WS, {
        status: 'needs-input',
        step: 'preview',
      });
      expect(store.attentionCount()).toBe(1);
    });

    it('release never cancels the run (rule 5)', async () => {
      const store = await create();
      const rec = store.start('skill-review', WS, { analysisRunId: 'an-1' })!;
      store.attach(rec.id);
      store.release(rec.id);
      expect(store.get(rec.id)?.status).toBe('running');
      expect(rpc['cancelBoundRun']).not.toHaveBeenCalled();
    });

    it('returns null when attaching an unknown id', async () => {
      const store = await create();
      expect(store.attach('missing')).toBeNull();
    });
  });

  describe('reportRun, whenStarted and bindingFor', () => {
    function boundRun(
      status: SetupGenerationRunLifecycle,
      tabId = 'setup-g1',
      runId = 'run-1',
      extra: Partial<SetupGenerationRunState> = {},
    ): SetupGenerationRunState {
      return runState(status, {
        binding: { ...binding(tabId), runId },
        ...extra,
      });
    }

    beforeEach(() => {
      mockBoundStatus('running');
    });

    function completeAgent(store: SetupRunStore, id: string): void {
      store.adopt(binding(id));
      store.reportRun(id, boundRun('completed', id));
    }

    function acceptGuidance(): void {
      rpc['startBoundGuidance'].mockResolvedValue({
        accepted: {
          runId: 'guidance-1',
          source: boundRun('completed').source,
          effectiveProvider: 'p',
          effectiveModel: 'm',
        },
      });
    }

    async function reload(): Promise<SetupRunStore> {
      await flush();
      TestBed.resetTestingModule();
      configureProviders();
      return create();
    }

    it('restores the remaining countdown after reload and starts guidance once', async () => {
      acceptGuidance();
      let store = await create();
      completeAgent(store, 'setup-g1');
      const deadline = TestBed.inject(GenerationHandoffStore).pendingFor(
        'setup-g1',
      )?.guidanceStartDeadline;
      await jest.advanceTimersByTimeAsync(2_000);
      store = await reload();
      const restored = TestBed.inject(GenerationHandoffStore);
      expect(restored.pendingFor('setup-g1')?.guidanceStartDeadline).toBe(
        deadline,
      );
      expect(restored.remainingSeconds('setup-g1')).toBe(3);

      await jest.advanceTimersByTimeAsync(2_999);
      expect(rpc['startBoundGuidance']).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(store.runsFor(WS)).toContainEqual(
        expect.objectContaining({
          workflow: 'project-guidance',
          parentId: 'setup-g1',
        }),
      );
      await reload();
      await jest.advanceTimersByTimeAsync(5_000);
      expect(rpc['startBoundGuidance']).toHaveBeenCalledTimes(1);
    });

    it('leaves a legacy completion without a deadline for manual guidance', async () => {
      seed(record({ id: 'setup-g1', status: 'completed' }));
      const handoff = TestBed.inject(GenerationHandoffStore);
      const schedule = jest.spyOn(handoff, 'schedule');

      const store = await create();
      await jest.advanceTimersByTimeAsync(5_000);

      expect(store.get('setup-g1')?.guidanceHandoff).toBeUndefined();
      expect(schedule).not.toHaveBeenCalled();
      expect(rpc['startBoundGuidance']).not.toHaveBeenCalled();
    });

    it('consumes a restored deadline when the parent already has a guidance child', async () => {
      seed(
        record({
          id: 'setup-g1',
          status: 'completed',
          guidanceHandoff: Date.now() + 5_000,
        }),
        record({
          id: 'guidance-child',
          workflow: 'project-guidance',
          status: 'completed',
          parentId: 'setup-g1',
        }),
      );
      const handoff = TestBed.inject(GenerationHandoffStore);
      const schedule = jest.spyOn(handoff, 'schedule');
      const store = await create();
      expect(handoff.pendingFor('setup-g1')).toBeNull();
      expect(store.get('setup-g1')?.guidanceHandoff).toBe('consumed');
      await jest.advanceTimersByTimeAsync(5_000);
      expect(schedule).not.toHaveBeenCalled();
      expect(rpc['startBoundGuidance']).not.toHaveBeenCalled();
    });

    it('schedules a restored deadline without a guidance child exactly once', async () => {
      acceptGuidance();
      const deadline = Date.now() + 2_000;
      seed(
        record({
          id: 'setup-g1',
          status: 'completed',
          guidanceHandoff: deadline,
        }),
      );
      const handoff = TestBed.inject(GenerationHandoffStore);
      const schedule = jest.spyOn(handoff, 'schedule');
      await create();
      expect(handoff.pendingFor('setup-g1')?.guidanceStartDeadline).toBe(
        deadline,
      );

      workspace.set(OTHER_WS);
      await flush();
      workspace.set(WS);
      await flush();
      await jest.advanceTimersByTimeAsync(2_000);

      expect(schedule).toHaveBeenCalledTimes(1);
      expect(schedule).toHaveBeenCalledWith('setup-g1', WS);
      expect(rpc['startBoundGuidance']).toHaveBeenCalledTimes(1);
    });

    it('persists Skip and never re-arms that agent on reload', async () => {
      const store = await create();
      completeAgent(store, 'setup-g1');
      TestBed.inject(GenerationHandoffStore).skip('setup-g1');
      const restored = await reload();
      expect(restored.get('setup-g1')?.guidanceHandoff).toBe('skipped');
      expect(
        TestBed.inject(GenerationHandoffStore).pendingFor('setup-g1'),
      ).toBeNull();
      await jest.advanceTimersByTimeAsync(5_000);
      expect(rpc['startBoundGuidance']).not.toHaveBeenCalled();
    });

    it('keeps both hand-offs when two agents finish inside the same countdown window', async () => {
      acceptGuidance();
      const store = await create();
      completeAgent(store, 'setup-g1');
      await jest.advanceTimersByTimeAsync(1_000);
      completeAgent(store, 'setup-g2');
      const handoff = TestBed.inject(GenerationHandoffStore);
      expect(handoff.pendingFor('setup-g1')).not.toBeNull();
      expect(handoff.pendingFor('setup-g2')).not.toBeNull();

      await jest.advanceTimersByTimeAsync(5_000);
      expect(rpc['startBoundGuidance']).toHaveBeenCalledTimes(1);
      const first = store
        .runsFor(WS)
        .find(
          (run) =>
            run.workflow === 'project-guidance' && run.parentId === 'setup-g1',
        );
      if (!first) throw new Error('The first guidance child was not created');
      expect(handoff.pendingFor('setup-g2')).not.toBeNull();
      store.report(first.id, { status: 'completed' });
      await flush();
      await jest.advanceTimersByTimeAsync(1);

      expect(store.runsFor(WS)).toContainEqual(
        expect.objectContaining({
          workflow: 'project-guidance',
          parentId: 'setup-g2',
        }),
      );
      expect(rpc['startBoundGuidance']).toHaveBeenCalledTimes(2);
    });

    it('schedules and starts guidance on verified completion after the view closes', async () => {
      const store = await create();
      store.adopt(binding('setup-g1'));
      store.attach('setup-g1');
      store.release('setup-g1');
      const completed = boundRun('completed');
      rpc['getBoundRunState'].mockResolvedValueOnce(completed);
      rpc['startBoundGuidance'].mockResolvedValueOnce({
        accepted: {
          runId: 'guidance-1',
          source: completed.source,
          effectiveProvider: 'p',
          effectiveModel: 'm',
        },
      });

      await store.verifyTerminal(completed.binding);

      expect(store.get('setup-g1')).toMatchObject({
        status: 'completed',
        unseen: true,
      });
      expect(TestBed.inject(GenerationHandoffStore).pending()).toMatchObject({
        agentRunId: 'setup-g1',
        workspacePath: WS,
      });
      await jest.advanceTimersByTimeAsync(5_000);
      expect(store.runsFor(WS)).toContainEqual(
        expect.objectContaining({
          workflow: 'project-guidance',
          parentId: 'setup-g1',
          backendRunId: 'guidance-1',
        }),
      );
      expect(rpc['startBoundGuidance']).toHaveBeenCalledTimes(1);
    });

    it('schedules a completed record only once across repeated reports and reconciliation', async () => {
      const store = await create();
      const schedule = jest.spyOn(
        TestBed.inject(GenerationHandoffStore),
        'schedule',
      );
      store.adopt(binding('setup-g1'));
      const completed = boundRun('completed');
      rpc['getBoundRunState'].mockResolvedValue(completed);

      await Promise.all([
        store.verifyTerminal(completed.binding),
        store.verifyTerminal(completed.binding),
      ]);
      store.reportRun('setup-g1', completed);
      store.report('setup-g1', { status: 'completed' });
      await store.refresh();

      expect(schedule).toHaveBeenCalledTimes(1);
      expect(schedule).toHaveBeenCalledWith('setup-g1', WS);
    });

    it('maps a verified run state onto the record and records its run id', async () => {
      seed(record({ id: 'setup-g1', step: 'preview', status: 'needs-input' }));
      const store = await create();
      const result = store.reportRun('setup-g1', boundRun('running'));
      expect(result).toMatchObject({
        status: 'running',
        step: 'generating',
        backendRunId: 'run-1',
      });
      store.reportRun('setup-g1', boundRun('completed'));
      expect(store.get('setup-g1')?.status).toBe('completed');
      expect(store.get('setup-g1')?.unseen).toBe(true);
    });

    it('maps failed and interrupted states with fixed copy', async () => {
      seed(record({ id: 'setup-g1' }), record({ id: 'setup-g2' }));
      const store = await create();
      store.reportRun('setup-g1', boundRun('timed-out'));
      store.reportRun(
        'setup-g2',
        boundRun('running', 'setup-g2', 'run-1', { interrupted: true }),
      );
      expect(store.get('setup-g1')).toMatchObject({
        status: 'failed',
        error: 'Agent generation did not finish.',
      });
      expect(store.get('setup-g2')?.status).toBe('interrupted');
    });

    it('ignores a terminal state of a run other than the record run', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-2' }));
      const store = await create();
      store.reportRun('setup-g1', boundRun('failed', 'setup-g1', 'run-1'));
      expect(store.get('setup-g1')).toMatchObject({
        status: 'running',
        backendRunId: 'run-2',
      });
    });

    it('ignores an unsolicited live state for a settled record', async () => {
      seed(record({ id: 'setup-g1', status: 'failed', backendRunId: 'run-1' }));
      const store = await create();
      const before = store.get('setup-g1');
      expect(
        store.reportRun('setup-g1', boundRun('running', 'setup-g1', 'run-2')),
      ).toBe(before);
    });

    it('ignores a state that names another binding', async () => {
      seed(record({ id: 'setup-g1' }), record({ id: 'setup-g2' }));
      const store = await create();
      store.reportRun('setup-g1', boundRun('completed', 'setup-g2'));
      store.reportRun(
        'setup-g1',
        runState('completed', {
          binding: {
            ...binding('setup-g1', 'setup-project-prompt'),
            runId: 'run-1',
          },
        }),
      );
      store.reportRun(
        'setup-g1',
        runState('completed', {
          binding: {
            ...binding('setup-g1', 'setup-agent-generation', OTHER_WS),
            runId: 'run-1',
          },
        }),
      );
      expect(store.get('setup-g1')?.status).toBe('running');
      expect(store.reportRun('missing', boundRun('completed'))).toBeNull();
    });

    it('ignores a run state for a record that is not bound', async () => {
      seed(
        record({ id: 'setup-r1', workflow: 'skill-review', step: 'reviewing' }),
      );
      const store = await create();
      store.reportRun('setup-r1', boundRun('completed', 'setup-r1'));
      expect(store.get('setup-r1')?.status).toBe('running');
    });

    it('completes through the shared poll after the bound view reads and closes without a push', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      mockBoundStatus('running');
      const store = await create();
      const view = TestBed.inject(GenerationWorkflowStore);
      store.attach('setup-g1');
      view.bind(binding('setup-g1'));
      await flush();
      expect(view.run()?.status).toBe('running');
      view.unbind();
      store.release('setup-g1');

      rpc['getBoundRunState'].mockClear();
      mockBoundStatus('completed');
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(1);
      expect(store.get('setup-g1')).toMatchObject({
        status: 'completed',
        unseen: true,
      });
    });

    it.each([
      ['agents', 'agent-generation', 'startBoundAgents'],
      ['guidance', 'project-guidance', 'startBoundGuidance'],
    ] as const)(
      'keeps an initial %s start running across null polls and records the accepted run',
      async (kind, workflow, startMethod) => {
        rpc['getBoundRunState'].mockResolvedValue(null);
        const store = await create();
        const record = store.start(workflow, WS, { step: 'generating' });
        const tabBinding = record && store.bindingFor(record);
        if (!record || !tabBinding) throw new Error('Expected a bound run');
        const view = TestBed.inject(GenerationWorkflowStore);
        view.bindRecord(record);
        await flush();
        rpc['getBoundRunState'].mockClear();

        const running = runState('running', {
          binding: { ...tabBinding, runId: 'accepted-run' },
        });
        const accepted = {
          runId: running.binding.runId,
          status: 'starting' as const,
          source: running.source,
          effectiveProvider: running.effectiveProvider,
          effectiveModel: running.effectiveModel,
        };
        let resolveStart!: (response: { accepted: typeof accepted }) => void;
        rpc[startMethod].mockReturnValue(
          new Promise((resolve) => {
            resolveStart = resolve;
          }),
        );
        const start =
          kind === 'agents'
            ? view.startAgents(['agent'])
            : view.startGuidance();

        for (let poll = 1; poll <= 4; poll++) {
          await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
          expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(poll);
          expect(store.get(record.id)).toMatchObject({
            status: 'running',
            backendRunId: null,
          });
        }

        rpc['getBoundRunState'].mockResolvedValue(running);
        resolveStart({ accepted });
        await start;
        expect(view.state()).toBe('running');
        expect(store.get(record.id)).toMatchObject({
          status: 'running',
          backendRunId: accepted.runId,
        });
      },
    );

    it('interrupts only after a fresh grace when an initial start resolves without run evidence', async () => {
      rpc['getBoundRunState'].mockResolvedValue(null);
      const store = await create();
      const record = store.start('project-guidance', WS);
      if (!record) throw new Error('Expected a guidance run');
      const view = TestBed.inject(GenerationWorkflowStore);
      view.bindRecord(record);
      await flush();

      let resolveStart!: (response: { success: false }) => void;
      rpc['startBoundGuidance'].mockReturnValue(
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
      );
      const start = view.startGuidance();
      await jest.advanceTimersByTimeAsync(4 * SETUP_RUN_POLL_INTERVAL_MS);
      expect(store.get(record.id)?.status).toBe('running');
      resolveStart({ success: false });
      await start;

      await jest.advanceTimersByTimeAsync(2 * SETUP_RUN_POLL_INTERVAL_MS);
      expect(store.get(record.id)?.status).toBe('running');
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(store.get(record.id)).toMatchObject({
        status: 'interrupted',
        backendRunId: null,
      });
    });

    it.each(['agents', 'guidance'] as const)(
      'attaches the same-ID owner after an initial %s start is blocked',
      async (workflow) => {
        const isAgent = workflow === 'agents';
        const owner = binding(
          'setup-owned',
          isAgent ? 'setup-agent-generation' : 'setup-project-prompt',
        );
        const store = await create();
        const view = TestBed.inject(GenerationWorkflowStore);
        rpc['getBoundRunState'].mockResolvedValue(null);
        view.bind(owner);
        await flush();
        const startRpc =
          rpc[isAgent ? 'startBoundAgents' : 'startBoundGuidance'];
        startRpc.mockResolvedValue({
          rejection: { reason: 'blocked', ownerTabId: owner.tabId },
        });
        mockBoundStatus('running');
        rpc['getBoundRunState'].mockClear();

        if (isAgent) await view.startAgents(['agent']);
        else await view.startGuidance();

        expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(1);
        expect(rpc['getBoundRunState']).toHaveBeenCalledWith(owner, undefined);
        expect(view.state()).toBe('running');
        expect(view.rejection()).toBeNull();
        expect(store.get(owner.tabId)).toMatchObject({
          status: 'running',
          backendRunId: 'run-1',
        });
        expect(store.runs()).toHaveLength(1);
      },
    );

    it('interrupts an initial same-ID blocked owner after two poll intervals of null lookups', async () => {
      rpc['getBoundRunState'].mockResolvedValue(null);
      const store = await create();
      const owner = binding('setup-owned');
      const view = TestBed.inject(GenerationWorkflowStore);
      view.bind(owner);
      await flush();
      rpc['startBoundAgents'].mockResolvedValue({
        rejection: { reason: 'blocked', ownerTabId: owner.tabId },
      });
      await view.startAgents(['agent']);
      expect(view.state()).toBe('idle');
      view.unbind();

      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(store.get(owner.tabId)?.status).toBe('running');
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(store.get(owner.tabId)).toMatchObject({
        status: 'interrupted',
        unseen: true,
      });
      rpc['getBoundRunState'].mockClear();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 3);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
    });

    it('restarts the orphan grace after valid stream evidence and stops polling after interruption', async () => {
      rpc['getBoundRunState'].mockResolvedValue(null);
      const store = await create();
      const owned = { ...binding('setup-owned'), runId: 'run-1' };
      store.adopt(owned);
      store.reportStream(owned);
      await store.refresh();
      await flush();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(store.get(owned.tabId)?.status).toBe('running');
      store.reportStream(owned);
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 2);
      expect(store.get(owned.tabId)?.status).toBe('running');
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(store.get(owned.tabId)).toMatchObject({
        status: 'interrupted',
        unseen: true,
      });
      rpc['getBoundRunState'].mockClear();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 3);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
    });

    it('corrects only a proved finalization failure for the same run in the real record', async () => {
      seed(record({ id: 'setup-g1', status: 'failed', backendRunId: 'run-1' }));
      const store = await create();
      const view = TestBed.inject(GenerationWorkflowStore);
      const failed = boundRun('failed');
      const previous: SetupGenerationRunState = {
        ...failed,
        result: {
          ...failed,
          status: 'failed',
          success: false,
          finalizationFailed: true,
        },
      };
      const verified: SetupGenerationRunState = {
        ...failed,
        status: 'completed',
        result: {
          ...failed,
          status: 'completed',
          success: true,
          counts: {
            total: 1,
            written: 1,
            unchanged: 0,
            failed: 0,
            skipped: 0,
            rejected: 0,
          },
          agentOutcomes: [],
        },
      };
      rpc['startBoundAgents'].mockResolvedValue({
        accepted: { runId: 'run-1' },
      });
      rpc['getBoundRunState'].mockResolvedValue(previous);
      await store.retry('setup-g1');
      await flush();
      view.bind(binding('setup-g1'));
      await flush();
      expect(view.state()).toBe('failed');

      for (const observation of [
        boundRun('running'),
        boundRun('cancelled'),
        { ...verified, result: undefined },
        { ...verified, binding: { ...verified.binding, runId: 'other-run' } },
      ]) {
        store.reportRun('setup-g1', observation);
        expect(store.get('setup-g1')?.status).toBe('failed');
      }
      rpc['getBoundRunState'].mockResolvedValue(verified);
      await view.refresh();
      expect(view.state()).toBe('completed');
      expect(store.get('setup-g1')).toMatchObject({
        status: 'completed',
        backendRunId: 'run-1',
      });
      expect(store.get('setup-g1')?.error).toBeUndefined();
    });

    it('ignores an earlier view lookup with finalization proof after retry reuses the checkpoint', async () => {
      seed(record({ id: 'setup-g1', status: 'failed', backendRunId: 'run-1' }));
      const store = await create();
      const view = TestBed.inject(GenerationWorkflowStore);
      const failed = boundRun('failed');
      const previous: SetupGenerationRunState = {
        ...failed,
        result: {
          ...failed,
          status: 'failed',
          success: false,
          finalizationFailed: true,
        },
      };
      rpc['startBoundAgents'].mockResolvedValue({
        accepted: { runId: 'run-1' },
      });
      rpc['getBoundRunState'].mockResolvedValue(previous);
      await store.retry('setup-g1');
      await flush();
      view.bind(binding('setup-g1'));
      await flush();

      let resolveOldLookup!: (run: SetupGenerationRunState) => void;
      rpc['getBoundRunState'].mockReturnValueOnce(
        new Promise((resolve) => (resolveOldLookup = resolve)),
      );
      const oldLookup = view.refresh();
      await store.retry('setup-g1');
      await flush();
      resolveOldLookup({
        ...failed,
        status: 'completed',
        result: {
          ...failed,
          status: 'completed',
          success: true,
          counts: {
            total: 1,
            written: 1,
            unchanged: 0,
            failed: 0,
            skipped: 0,
            rejected: 0,
          },
          agentOutcomes: [],
        },
      });
      await oldLookup;
      expect(store.get('setup-g1')).toMatchObject({
        status: 'failed',
        backendRunId: 'run-1',
      });
    });

    it.each(['view', 'poll', 'terminal push'] as const)(
      'settles a guidance trace-write failure as failed via %s',
      async (route) => {
        const store = await create();
        const owner = {
          ...binding('setup-p1', 'setup-project-prompt'),
          runId: 'run-1',
        };
        store.adopt(owner);
        mockBoundStatus('running');
        const view = TestBed.inject(GuidanceGenerationStore);
        if (route === 'view') {
          view.bind(owner);
          await flush();
          expect(view.status()).toBe('running');
        }
        rpc['getBoundRunState'].mockResolvedValue(
          runState('completed', { binding: owner, committedState: 'unknown' }),
        );
        if (route === 'view') {
          await view.refresh();
          expect(view.status()).toBe('failed');
        } else if (route === 'terminal push') {
          await store.verifyTerminal(owner);
        } else {
          await flush();
          await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
        }
        expect(store.get(owner.tabId)).toMatchObject({
          status: 'failed',
          error: 'Project guidance did not finish.',
        });
      },
    );

    it.each(['invalid-binding', 'workspace-mismatch'] as const)(
      'uses workspace mismatch copy for retry and rerun rejected with %s',
      async (reason) => {
        seed(
          record({
            id: 'setup-retry',
            status: 'failed',
            workflow: 'project-guidance',
          }),
          record({
            id: 'setup-rerun',
            status: 'completed',
            workflow: 'project-guidance',
          }),
        );
        rpc['startBoundGuidance'].mockResolvedValue({ rejection: { reason } });
        rpc['regenerateBoundGuidance'].mockResolvedValue({
          rejection: { reason },
        });
        const store = await create();
        const expected = {
          status: 'failed',
          error: 'This run belongs to another workspace.',
        };
        await expect(store.retry('setup-retry')).resolves.toMatchObject(
          expected,
        );
        const next = store.rerun('setup-rerun');
        await expect(
          store.whenStarted(next?.id ?? 'missing'),
        ).resolves.toMatchObject(expected);
      },
    );

    it('uses fixed actionable copy for a coded guidance start error', async () => {
      seed(
        record({
          id: 'setup-p1',
          status: 'failed',
          workflow: 'project-guidance',
        }),
      );
      rpc['startBoundGuidance'].mockRejectedValue(
        new WizardRpcError('/private/backend/message', 'SETUP_MODEL_INVALID'),
      );
      const store = await create();
      await expect(store.retry('setup-p1')).resolves.toMatchObject({
        status: 'failed',
        error:
          'The Setup model could not be resolved. Update Background models and retry.',
      });
    });

    it('clears settled delivery and attempt state and drops redirects on cap eviction', async () => {
      seed(
        record({ id: 'setup-retry', status: 'failed' }),
        record({ id: 'setup-blocked', status: 'failed' }),
      );
      const store = await create();
      const owned = { ...binding('setup-retry'), runId: 'run-9' };
      rpc['getBoundRunState'].mockResolvedValue(
        runState('running', { binding: owned }),
      );
      await store.retry(owned.tabId);
      store.reportStream(owned);
      store.reportRun(owned.tabId, runState('completed', { binding: owned }));
      expect(store['attempts'].get(owned.tabId)).toBeUndefined();
      expect(store['attempts']['delivery']().has(owned.tabId)).toBe(false);

      rpc['startBoundAgents'].mockResolvedValue({
        rejection: { reason: 'blocked', ownerTabId: 'setup-owner' },
      });
      rpc['getBoundRunState'].mockResolvedValue(
        runState('running', {
          binding: { ...binding('setup-owner'), runId: 'run-active' },
        }),
      );
      await store.retry('setup-blocked');
      await expect(store.whenStarted('setup-blocked')).resolves.toMatchObject({
        id: 'setup-owner',
      });
      store.attach('setup-blocked');
      store.report(owned.tabId, { status: 'completed' });
      for (let i = 0; i < MAX_SETUP_RUNS_PER_WORKSPACE; i++) {
        jest.setSystemTime(Date.now() + 1);
        const next = store.adopt(binding(`setup-cap-${i}`));
        if (next) store.report(next.id, { status: 'completed' });
      }
      expect(store.get('setup-blocked')).toBeNull();
      expect(store['attempts'].get('setup-blocked')).toBeUndefined();
      expect(store['viewing'].has('setup-blocked')).toBe(false);
      await expect(store.whenStarted('setup-blocked')).resolves.toBeNull();
    });

    it('resolves the in-flight start of a rerun', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          status: 'completed',
        }),
      );
      let accept!: (value: { accepted: { runId: string } }) => void;
      rpc['regenerateBoundGuidance'].mockReturnValue(
        new Promise((resolve) => (accept = resolve)),
      );
      const store = await create();
      const next = store.rerun('setup-p1');
      const started = store.whenStarted(next?.id ?? 'missing');
      accept({ accepted: { runId: 'run-7' } });
      await expect(started).resolves.toMatchObject({
        id: next?.id,
        backendRunId: 'run-7',
      });
    });

    it('redirects a blocked rerun before and after settlement', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          status: 'completed',
        }),
      );
      let block!: (value: unknown) => void;
      rpc['regenerateBoundGuidance'].mockReturnValue(
        new Promise((resolve) => (block = resolve)),
      );
      const store = await create();
      const attempted = store.rerun('setup-p1');
      if (!attempted) throw new Error('Expected a rerun record');
      const waiting = store.whenStarted(attempted.id);
      block({ rejection: { reason: 'blocked', ownerTabId: 'owner-9' } });
      await expect(waiting).resolves.toMatchObject({ id: 'owner-9' });
      store.reportRun(
        'owner-9',
        runState('completed', {
          committedState: 'committed',
          binding: {
            ...binding('owner-9', 'setup-project-prompt'),
            runId: 'owner-run',
          },
        }),
      );
      await expect(store.whenStarted(attempted.id)).resolves.toMatchObject({
        id: 'owner-9',
        status: 'completed',
      });
    });

    it.each([
      { workflow: 'agent-generation' as const, workspacePath: WS },
      { workflow: 'project-guidance' as const, workspacePath: OTHER_WS },
    ])(
      'refuses a blocked owner with a foreign binding (%j)',
      async (foreign) => {
        seed(
          record({
            id: 'setup-p1',
            workflow: 'project-guidance',
            status: 'failed',
          }),
          record({ id: 'owner-9', status: 'completed', ...foreign }),
        );
        rpc['startBoundGuidance'].mockResolvedValue({
          rejection: { reason: 'blocked', ownerTabId: 'owner-9' },
        });
        const store = await create();
        await expect(store.retry('setup-p1')).resolves.toMatchObject({
          id: 'setup-p1',
          status: 'failed',
        });
        await expect(store.whenStarted('setup-p1')).resolves.toMatchObject({
          id: 'setup-p1',
        });
      },
    );

    it('tracks a same-id blocked owner as the existing run', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          status: 'interrupted',
          backendRunId: 'old-run',
        }),
      );
      rpc['startBoundGuidance'].mockResolvedValue({
        rejection: { reason: 'blocked', ownerTabId: 'setup-p1' },
      });
      const store = await create();
      let confirmOwner!: (run: SetupGenerationRunState) => void;
      rpc['getBoundRunState'].mockReturnValueOnce(
        new Promise((resolve) => (confirmOwner = resolve)),
      );
      const retry = store.retry('setup-p1');
      await flush();
      const ownerBinding = binding('setup-p1', 'setup-project-prompt');
      expect(store.reportStream({ ...ownerBinding, runId: 'old-run' })).toBe(
        false,
      );
      confirmOwner(
        runState('cancelling', {
          binding: { ...ownerBinding, runId: 'owner-run' },
        }),
      );
      await expect(store.whenStarted('setup-p1')).resolves.toMatchObject({
        id: 'setup-p1',
        status: 'running',
        backendRunId: 'owner-run',
      });
      await retry;
      await flush();
      await expect(store.whenStarted('setup-p1')).resolves.toMatchObject({
        id: 'setup-p1',
        backendRunId: 'owner-run',
        status: 'running',
      });
      expect(store.runs()).toHaveLength(1);
    });

    it('resolves the current record when no start is in flight', async () => {
      seed(record({ id: 'setup-g1' }));
      const store = await create();
      await expect(store.whenStarted('setup-g1')).resolves.toMatchObject({
        id: 'setup-g1',
      });
      await expect(store.whenStarted('missing')).resolves.toBeNull();
    });

    it('returns the binding of a bound record only', async () => {
      const store = await create();
      expect(
        store.bindingFor(
          record({ id: 'setup-p1', workflow: 'project-guidance' }),
        ),
      ).toEqual(binding('setup-p1', 'setup-project-prompt'));
      expect(store.bindingFor(record({ id: 'setup-g1' }))).toEqual(
        binding('setup-g1'),
      );
      expect(
        store.bindingFor(record({ id: 'setup-a1', workflow: 'analysis' })),
      ).toBeNull();
    });
  });
});
