import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import { VSCodeService } from '@ptah-extension/core';
import {
  WizardAnalysisRunner,
  WizardRpcService,
} from '@ptah-extension/setup-wizard';
import { OnboardingResumeStore } from './onboarding-resume.store';

describe('OnboardingResumeStore', () => {
  const rpc = { getResumableRun: jest.fn(), getBoundRunState: jest.fn() };
  const tabs = { activeWorkspacePath: '/work', getWorkspaceTabs: jest.fn() };
  const runnerIsRunning = signal(false);
  const runnerBackendActive = signal(false);
  const runnerIsCanceling = signal(false);
  const runnerActiveWorkspace = signal<string | null>(null);
  const syncBackendActive = jest.fn(
    (
      active: boolean,
      options?: {
        startedAt?: string | number | null;
        workspacePath?: string | null;
      },
    ) => {
      runnerBackendActive.set(active);
      runnerIsRunning.set(active);
      runnerActiveWorkspace.set(
        active ? (options?.workspacePath ?? null) : null,
      );
    },
  );
  const runner = {
    backendActive: runnerBackendActive,
    isRunning: runnerIsRunning,
    isCanceling: runnerIsCanceling,
    isRunningForWorkspace: (path: string | null | undefined) => {
      if (!runnerIsRunning() && !runnerIsCanceling()) return false;
      const active = runnerActiveWorkspace();
      return active === null || active === path;
    },
    syncBackendActive,
  };
  let store: OnboardingResumeStore;

  beforeEach(() => {
    jest.clearAllMocks();
    tabs.activeWorkspacePath = '/work';
    tabs.getWorkspaceTabs.mockReturnValue([]);
    runnerIsRunning.set(false);
    runnerBackendActive.set(false);
    runnerIsCanceling.set(false);
    runnerActiveWorkspace.set(null);
    rpc.getResumableRun.mockResolvedValue({ analysis: null, generation: null });
    rpc.getBoundRunState.mockResolvedValue(null);
    TestBed.configureTestingModule({
      providers: [
        OnboardingResumeStore,
        { provide: WizardRpcService, useValue: rpc },
        { provide: WizardAnalysisRunner, useValue: runner },
        { provide: TabManagerService, useValue: tabs },
        {
          provide: VSCodeService,
          useValue: { config: () => ({ workspaceRoot: '/work' }) },
        },
      ],
    });
    store = TestBed.inject(OnboardingResumeStore);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows the latest analysis and generation checkpoint pair with a bound tab', async () => {
    tabs.getWorkspaceTabs.mockReturnValue([
      { id: 'tab-generation', workflow: 'setup-agent-generation' },
    ]);
    rpc.getResumableRun.mockResolvedValue({
      analysis: { manifest: { lifecycle: 'paused' } },
      generation: {
        lifecycle: 'paused',
        runId: 'latest-run',
        agents: [{ status: 'written' }],
      },
    });
    await store.refresh();
    expect(store.items().map((item) => item.id)).toEqual([
      'analysis',
      'generation:tab-generation',
    ]);
    expect(store.items()[0]).toMatchObject({
      state: 'resumable',
      title: 'Continue workspace analysis',
    });
    expect(store.items()[1]).toMatchObject({
      state: 'resumable',
      title: 'Continue agent generation',
      target: {
        subPath: ['analyze', 'skills'],
        queryParams: { tab: 'tab-generation', run: 'latest-run' },
      },
    });
  });

  it('limits bound generation tabs to one item per workflow and ignores harness chat tabs', async () => {
    tabs.getWorkspaceTabs.mockReturnValue([
      { id: 'agent-1', workflow: 'setup-agent-generation' },
      { id: 'agent-2', workflow: 'setup-agent-generation' },
      { id: 'guidance-1', workflow: 'setup-project-prompt' },
      { id: 'harness-1', workflow: 'harness-new-project' },
      { id: 'harness-2', workflow: 'harness-configure' },
    ]);
    rpc.getBoundRunState.mockImplementation(
      async ({ tabId }: { tabId: string }) => ({
        status: 'running',
        binding: { runId: `run-${tabId}` },
      }),
    );
    await store.refresh();
    expect(store.items().map((item) => item.id)).toEqual([
      'generation:agent-1',
      'generation:guidance-1',
    ]);
    expect(store.items()[0]).toMatchObject({
      state: 'running',
      title: 'Agent generation in progress',
    });
    expect(store.items()[1]).toMatchObject({
      state: 'running',
      title: 'Project guidance in progress',
    });
  });

  it('maps cancelling and paused bound runs to accurate banner states and titles', async () => {
    tabs.getWorkspaceTabs.mockReturnValue([
      { id: 'agent-1', workflow: 'setup-agent-generation' },
      { id: 'guidance-1', workflow: 'setup-project-prompt' },
    ]);
    rpc.getBoundRunState
      .mockResolvedValueOnce({
        status: 'cancelling',
        binding: { runId: 'run-agent' },
      })
      .mockResolvedValueOnce({
        status: 'failed',
        binding: { runId: 'run-guidance' },
      });
    await store.refresh();
    expect(store.items()).toMatchObject([
      {
        id: 'generation:agent-1',
        state: 'cancelling',
        title: 'Stopping agent generation',
      },
      {
        id: 'generation:guidance-1',
        state: 'resumable',
        title: 'Continue project guidance',
      },
    ]);
  });

  it('reactively reflects active and cancelling analysis runs before refresh settles and clears when idle', async () => {
    runnerActiveWorkspace.set('/work');
    runnerIsRunning.set(true);
    expect(store.items()).toEqual([
      {
        id: 'analysis',
        state: 'running',
        title: 'Workspace analysis in progress',
        detail: null,
        target: { subPath: ['analyze'], queryParams: {} },
      },
    ]);

    runnerIsCanceling.set(true);
    expect(store.items()).toMatchObject([
      {
        id: 'analysis',
        state: 'cancelling',
        title: 'Stopping workspace analysis',
      },
    ]);

    runnerIsCanceling.set(false);
    runnerIsRunning.set(false);
    expect(store.items()).toEqual([]);
  });

  it('does not show an active analysis banner for a different workspace', () => {
    runnerActiveWorkspace.set('/other');
    runnerIsRunning.set(true);
    expect(store.items()).toEqual([]);
  });

  it('hydrates backend-active analysis into the runner and emits a running banner', async () => {
    rpc.getResumableRun.mockResolvedValue({
      analysis: { manifest: { lifecycle: 'running' } },
      generation: null,
      analysisActive: true,
      activeAnalysisStartedAt: '2026-11-26T17:00:00.000Z',
    });

    await store.refresh();

    expect(syncBackendActive).toHaveBeenCalledWith(true, {
      startedAt: '2026-11-26T17:00:00.000Z',
      workspacePath: '/work',
    });
    expect(store.items()).toEqual([
      {
        id: 'analysis',
        state: 'running',
        title: 'Workspace analysis in progress',
        detail: null,
        target: { subPath: ['analyze'], queryParams: {} },
      },
    ]);

    runnerIsRunning.set(false);
    expect(store.items()).toEqual([]);
  });

  it('[B2] clears hydrated backendActive when getResumableRun reports analysisActive false for the active workspace', async () => {
    rpc.getResumableRun.mockResolvedValueOnce({
      analysis: { manifest: { lifecycle: 'running' } },
      generation: null,
      analysisActive: true,
      activeAnalysisStartedAt: '2026-11-26T17:00:00.000Z',
    });
    await store.refresh();
    expect(runnerBackendActive()).toBe(true);
    expect(store.items()).toHaveLength(1);

    // Switching to another workspace does NOT clear /work's backendActive
    tabs.activeWorkspacePath = '/other';
    rpc.getResumableRun.mockResolvedValueOnce({
      analysis: null,
      generation: null,
      analysisActive: false,
    });
    await store.refresh();
    expect(syncBackendActive).not.toHaveBeenCalledWith(false);
    expect(runnerBackendActive()).toBe(true);

    // Returning to /work when backend reports analysisActive: false clears it
    tabs.activeWorkspacePath = '/work';
    rpc.getResumableRun.mockResolvedValueOnce({
      analysis: null,
      generation: null,
      analysisActive: false,
    });
    await store.refresh();
    expect(syncBackendActive).toHaveBeenCalledWith(false);
    expect(runnerBackendActive()).toBe(false);
    expect(store.items()).toEqual([]);
  });

  it('[N2] does not clear hydrated backendActive when getResumableRun returns the error fallback (analysisActive undefined)', async () => {
    rpc.getResumableRun.mockResolvedValueOnce({
      analysis: { manifest: { lifecycle: 'running' } },
      generation: null,
      analysisActive: true,
      activeAnalysisStartedAt: '2026-11-26T17:00:00.000Z',
    });
    await store.refresh();
    expect(runnerBackendActive()).toBe(true);
    syncBackendActive.mockClear();

    // Real WizardRpcService.getResumableRun() swallows RPC errors into { analysis: null, generation: null }
    rpc.getResumableRun.mockResolvedValueOnce({
      analysis: null,
      generation: null,
    });
    await store.refresh();

    expect(syncBackendActive).not.toHaveBeenCalledWith(false);
    expect(runnerBackendActive()).toBe(true);
    expect(store.items()).toMatchObject([
      {
        id: 'analysis',
        state: 'running',
        title: 'Workspace analysis in progress',
      },
    ]);
  });

  it('does not advertise unbound generation checkpoints or harness tabs', async () => {
    rpc.getResumableRun.mockResolvedValue({
      analysis: null,
      generation: { lifecycle: 'paused', runId: 'orphan', agents: [] },
    });
    tabs.getWorkspaceTabs.mockReturnValue([
      { id: 'orphan-tab', workflow: 'setup-project-prompt' },
      { id: 'harness-1', workflow: 'harness-new-project' },
      { id: 'harness-2', workflow: 'harness-configure' },
    ]);
    await store.refresh();
    expect(store.items()).toEqual([]);
  });

  it('keeps the newer workspace result when an older refresh finishes last', async () => {
    let finishOld!: (value: {
      analysis: { manifest: { lifecycle: 'paused' } };
      generation: null;
    }) => void;
    rpc.getResumableRun
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ analysis: null, generation: null });

    const oldRefresh = store.refresh();
    tabs.activeWorkspacePath = '/new';
    await store.refresh();
    expect(store.items()).toEqual([]);

    finishOld({
      analysis: { manifest: { lifecycle: 'paused' } },
      generation: null,
    });
    await oldRefresh;
    expect(store.items()).toEqual([]);
    expect(tabs.getWorkspaceTabs).toHaveBeenNthCalledWith(1, '/work');
    expect(tabs.getWorkspaceTabs).toHaveBeenNthCalledWith(2, '/new');
  });
  it('clears old actions and rejects an in-flight result while the backend switches', async () => {
    let finish!: (value: {
      analysis: { manifest: { lifecycle: 'paused' } };
      generation: null;
    }) => void;
    rpc.getResumableRun.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.refresh();
    store.clear();
    expect(store.items()).toEqual([]);
    finish({
      analysis: { manifest: { lifecycle: 'paused' } },
      generation: null,
    });
    await pending;
    expect(store.items()).toEqual([]);
  });
});
