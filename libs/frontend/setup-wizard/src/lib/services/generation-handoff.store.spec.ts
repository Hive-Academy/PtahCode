import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SurfaceRouterService } from '@ptah-extension/core';
import type {
  SetupGenerationRunState,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import { GenerationHandoffStore } from './generation-handoff.store';
import { SetupRunStore, type SetupRunReport } from './setup-run.store';
import type { SetupRunRecord } from './setup-run.types';
import { WizardRpcService } from './wizard-rpc.service';

const parent: SetupRunRecord = {
  id: 'setup-agent',
  workspacePath: '/ws',
  workflow: 'agent-generation',
  status: 'completed',
  step: 'generating',
  backendRunId: 'backend-agent',
  analysisRunId: 'analysis-1',
  parentId: null,
  unseen: false,
  createdAt: 1,
  updatedAt: 1,
};

const guidance: SetupRunRecord = {
  ...parent,
  id: 'setup-guidance',
  workflow: 'project-guidance',
  status: 'running',
  backendRunId: null,
};

const binding: SetupGenerationTabBinding = {
  tabId: guidance.id,
  workspacePath: '/ws',
  workflow: 'setup-project-prompt',
};

const accepted = {
  runId: 'backend-guidance',
  source: { kind: 'workspace-discovery', reason: 'no-analysis' },
  effectiveProvider: 'unknown',
  effectiveModel: 'unknown',
};

describe('GenerationHandoffStore', () => {
  const agent = signal<SetupRunRecord | null>(parent);
  const cancellingIds = signal<ReadonlySet<string>>(new Set());
  const activeWorkspace = signal('/ws');
  const startBoundGuidance = jest.fn();
  const navigateToSurface = jest.fn();
  const starts = jest.fn();
  const whenStarted = jest.fn();
  const resolveBlockedStart = jest.fn();
  const targetOf = jest.fn();
  let child: SetupRunRecord | null;
  let store: GenerationHandoffStore;

  const reportRun = jest.fn((_id: string, run: SetupGenerationRunState) => {
    if (child) child = { ...child, backendRunId: run.binding.runId };
    return child;
  });
  const report = jest.fn((_id: string, update: SetupRunReport) => {
    if (child && update.status) child = { ...child, status: update.status };
    return child;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    agent.set(parent);
    cancellingIds.set(new Set());
    activeWorkspace.set('/ws');
    child = null;
    starts.mockImplementation(() => (child = guidance));
    whenStarted.mockImplementation(async () => child);
    startBoundGuidance.mockResolvedValue({ accepted });
    navigateToSurface.mockResolvedValue('navigated');
    targetOf.mockReturnValue({
      subPath: ['guidance'],
      queryParams: { tab: guidance.id },
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: SurfaceRouterService, useValue: { navigateToSurface } },
        { provide: WizardRpcService, useValue: { startBoundGuidance } },
        {
          provide: SetupRunStore,
          useValue: {
            get: (id: string) => (id === parent.id ? agent() : child),
            isCancelling: (id: string) => cancellingIds().has(id),
            runsFor: () => (child ? [child] : []),
            workspacePath: activeWorkspace,
            start: starts,
            bindingFor: (record: SetupRunRecord) => ({
              ...binding,
              tabId: record.id,
            }),
            startInitial: (
              _binding: SetupGenerationTabBinding,
              send: () => unknown,
            ) => send(),
            reportRun,
            report,
            whenStarted,
            resolveBlockedStart,
            targetOf,
          },
        },
      ],
    });
    store = TestBed.inject(GenerationHandoffStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });

  it('waits five seconds and starts a child of the Setup record in the background', async () => {
    const deadline = Date.now() + 5_000;
    store.schedule(parent.id, '/ws/');
    expect(store.pending()).toEqual({
      agentRunId: parent.id,
      workspacePath: '/ws/',
      guidanceStartDeadline: deadline,
    });
    await jest.advanceTimersByTimeAsync(4_999);
    expect(starts).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(starts).toHaveBeenCalledWith('project-guidance', '/ws', {
      parentId: parent.id,
      analysisRunId: 'analysis-1',
      origin: 'analysis-result-continue',
    });
    expect(startBoundGuidance).toHaveBeenCalledWith(binding);
    expect(reportRun).toHaveBeenCalledWith(
      guidance.id,
      expect.objectContaining({
        binding: { ...binding, runId: accepted.runId },
      }),
    );
    expect(store.started()).toEqual({ ...binding, runId: accepted.runId });
    expect(store.outcome()).toBe('started');
    expect(navigateToSurface).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'dismissed'] as const)(
    'skips after the parent is %s',
    async (status) => {
      store.schedule(parent.id, '/ws');
      TestBed.tick();
      agent.set(status === 'dismissed' ? null : { ...parent, status });
      TestBed.tick();

      expect(store.pending()).toBeNull();
      expect(store.outcome()).toBe('skipped');
      await jest.advanceTimersByTimeAsync(5_000);
      expect(starts).not.toHaveBeenCalled();
    },
  );

  it('skips the countdown while the parent awaits cancellation confirmation', async () => {
    agent.set({ ...parent, status: 'running' });
    store.schedule(parent.id, '/ws');
    TestBed.tick();
    expect(store.pending()?.agentRunId).toBe(parent.id);

    cancellingIds.set(new Set([parent.id]));
    TestBed.tick();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(store.pending()).toBeNull();
    expect(store.outcome()).toBe('skipped');
    expect(starts).not.toHaveBeenCalled();
  });

  it('checks the parent again when starting now, before the effect can run', async () => {
    store.schedule(parent.id, '/ws');
    agent.set(null);

    await store.startNow();

    expect(store.outcome()).toBe('skipped');
    expect(starts).not.toHaveBeenCalled();
  });

  it('lets the user start before the deadline without sending a second start', async () => {
    store.schedule(parent.id, '/ws');

    await store.startNow();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(startBoundGuidance).toHaveBeenCalledTimes(1);
  });

  it('clears the countdown on skip and on service destruction', async () => {
    store.schedule(parent.id, '/ws');
    store.skip();
    expect(store.outcome()).toBe('skipped');
    await jest.advanceTimersByTimeAsync(5_000);
    expect(starts).not.toHaveBeenCalled();

    store.schedule(parent.id, '/ws');
    TestBed.resetTestingModule();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(starts).not.toHaveBeenCalled();
  });

  it('joins an existing guidance run without sending another request', async () => {
    child = { ...guidance, backendRunId: 'existing-run' };
    store.schedule(parent.id, '/ws');

    await store.startNow();

    expect(starts).not.toHaveBeenCalled();
    expect(startBoundGuidance).not.toHaveBeenCalled();
    expect(whenStarted).toHaveBeenCalledWith(guidance.id);
    expect(store.started()).toEqual({ ...binding, runId: 'existing-run' });
  });

  it('offers manual recovery when a joined guidance retry rejects', async () => {
    child = guidance;
    whenStarted.mockRejectedValueOnce(new Error('retry failed'));
    store.schedule(parent.id, '/ws');

    await store.startNow();

    expect(whenStarted).toHaveBeenCalledWith(guidance.id);
    expect(startBoundGuidance).not.toHaveBeenCalled();
    expect(store.started()).toBeNull();
    expect(store.outcome()).toBe('manual-recovery');
    expect(store.inFlight()).toBe(false);
  });

  it('keeps the pending parent chain on manual Continue', async () => {
    store.schedule(parent.id, '/ws/');

    await store.manualContinue('/ws');
    await jest.advanceTimersByTimeAsync(5_000);

    expect(starts).toHaveBeenCalledTimes(1);
    expect(starts).toHaveBeenCalledWith('project-guidance', '/ws', {
      parentId: parent.id,
      analysisRunId: parent.analysisRunId,
      origin: 'analysis-result-continue',
    });
    expect(store.outcome()).toBe('started');
    expect(navigateToSurface).not.toHaveBeenCalled();
  });

  it('joins an in-flight start when manual Continue is repeated', async () => {
    await Promise.all([
      store.manualContinue('/ws'),
      store.manualContinue('/ws'),
    ]);

    expect(starts).toHaveBeenCalledTimes(1);
    expect(startBoundGuidance).toHaveBeenCalledTimes(1);
    expect(navigateToSurface).toHaveBeenCalledTimes(1);
    expect(navigateToSurface).toHaveBeenCalledWith('onboarding', ['guidance'], {
      queryParams: { tab: guidance.id },
    });
    expect(store.started()?.runId).toBe(accepted.runId);
  });

  it('opens the backend owner when the guidance start is blocked', async () => {
    const owner = { ...guidance, id: 'owner', backendRunId: 'owner-run' };
    startBoundGuidance.mockResolvedValue({
      rejection: { reason: 'blocked', ownerTabId: owner.id },
    });
    resolveBlockedStart.mockResolvedValue({ owner, run: null });

    await store.manualContinue('/ws');

    expect(resolveBlockedStart).toHaveBeenCalledWith(binding, owner.id);
    expect(targetOf).toHaveBeenCalledWith(owner);
    expect(store.started()).toEqual({
      ...binding,
      tabId: owner.id,
      runId: 'owner-run',
    });
  });

  it('reports a safe failure when the start rejects', async () => {
    startBoundGuidance.mockRejectedValue(new Error('private backend details'));

    await store.manualContinue('/ws');

    expect(report).toHaveBeenCalledWith(guidance.id, {
      status: 'failed',
      error: expect.not.stringContaining('private backend details'),
    });
    expect(store.outcome()).toBe('manual-recovery');
    expect(store.inFlight()).toBe(false);
    expect(navigateToSurface).not.toHaveBeenCalled();
  });

  it('records an accepted start after Skip without replacing the skipped UI state', async () => {
    store.schedule(parent.id, '/ws');
    const start = store.startNow();
    store.skip();

    await start;

    expect(reportRun).toHaveBeenCalledTimes(1);
    expect(store.started()).toBeNull();
    expect(store.outcome()).toBe('skipped');
    expect(store.inFlight()).toBe(false);
  });
});
