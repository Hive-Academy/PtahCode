import { TestBed } from '@angular/core/testing';
import type {
  SetupGenerationRunState,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import { WizardRpcService } from './wizard-rpc.service';
import { GenerationWorkflowStore } from './generation-workflow.store';
import { SetupRunStore } from './setup-run.store';
import type { SetupRunRecord } from './setup-run.types';
import { safeFailureCopy } from '../utils/safe-failure-copy';

const binding = {
  tabId: 'tab',
  workspacePath: '/ws',
  workflow: 'setup-agent-generation' as const,
};
const guidanceBinding = {
  ...binding,
  workflow: 'setup-project-prompt' as const,
};
const active = {
  binding: { ...binding, runId: 'run' },
  status: 'running' as const,
  source: { kind: 'workspace-discovery' as const, reason: 'missing' as const },
  effectiveProvider: 'unknown',
  effectiveModel: 'unknown',
};

function record(
  over: Partial<SetupRunRecord> & { id: string },
): SetupRunRecord {
  return {
    workspacePath: '/ws',
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

function workflowOf(
  bindingValue: SetupGenerationTabBinding,
): SetupRunRecord['workflow'] | null {
  if (bindingValue.workflow === 'setup-agent-generation') {
    return 'agent-generation';
  }
  if (bindingValue.workflow === 'setup-project-prompt') {
    return 'project-guidance';
  }
  return null;
}

function statusOf(run: SetupGenerationRunState): SetupRunRecord['status'] {
  if (run.status === 'completed') return 'completed';
  if (run.status === 'cancelled') return 'cancelled';
  if (run.status === 'failed' || run.status === 'timed-out') return 'failed';
  return 'running';
}

type RunsFake = {
  get: jest.Mock;
  startInitial: SetupRunStore['startInitial'];
  adopt: jest.Mock;
  resolveBlockedStart: jest.Mock;
  report: jest.Mock;
  reportRun: jest.Mock;
  reporterFor: jest.Mock;
  bindingFor: jest.Mock;
  retry: jest.Mock;
  rerun: jest.Mock;
  whenStarted: jest.Mock;
  cancel: jest.Mock;
};

type RpcFake = {
  getBoundRunState: jest.Mock;
  startBoundAgents: jest.Mock;
  startBoundGuidance: jest.Mock;
  regenerateBoundGuidance: jest.Mock;
  cancelBoundRun: jest.Mock;
};

describe('GenerationWorkflowStore', () => {
  let records: Map<string, SetupRunRecord>;
  let runs: RunsFake;
  let rpc: RpcFake;
  let store: GenerationWorkflowStore;

  function seed(value: SetupRunRecord): SetupRunRecord {
    records.set(value.id, value);
    return value;
  }

  beforeEach(() => {
    records = new Map();
    runs = {
      startInitial: (_binding, send) => send(),
      get: jest
        .fn()
        .mockImplementation((id: string) => records.get(id) ?? null),
      resolveBlockedStart: jest
        .fn()
        .mockImplementation(
          (value: SetupGenerationTabBinding, ownerTabId: string) => ({
            owner: runs.adopt({ ...value, tabId: ownerTabId }),
            run: null,
          }),
        ),
      adopt: jest
        .fn()
        .mockImplementation((bindingValue: SetupGenerationTabBinding) => {
          const existing = records.get(bindingValue.tabId);
          if (existing) return existing;
          const workflow = workflowOf(bindingValue);
          if (!workflow) return null;
          const adopted = record({
            id: bindingValue.tabId,
            workspacePath: bindingValue.workspacePath,
            workflow,
          });
          records.set(adopted.id, adopted);
          return adopted;
        }),
      report: jest.fn().mockImplementation((id: string, update) => {
        const current = records.get(id);
        if (!current) return null;
        const updated = { ...current, ...update, updatedAt: 2000 };
        records.set(id, updated);
        return updated;
      }),
      reporterFor: jest
        .fn()
        .mockImplementation(
          (id: string) => (run: SetupGenerationRunState) =>
            runs.reportRun(id, run),
        ),
      reportRun: jest
        .fn()
        .mockImplementation((id: string, run: SetupGenerationRunState) => {
          const current = records.get(id);
          if (!current) return null;
          const updated = {
            ...current,
            backendRunId: run.binding.runId,
            status: statusOf(run),
            updatedAt: 2000,
          };
          records.set(id, updated);
          return updated;
        }),
      bindingFor: jest.fn().mockImplementation((value: SetupRunRecord) => {
        const workflow =
          value.workflow === 'agent-generation'
            ? 'setup-agent-generation'
            : value.workflow === 'project-guidance'
              ? 'setup-project-prompt'
              : null;
        return workflow
          ? {
              tabId: value.id,
              workspacePath: value.workspacePath,
              workflow,
            }
          : null;
      }),
      retry: jest.fn(),
      rerun: jest.fn(),
      whenStarted: jest.fn().mockImplementation(async (id: string) => {
        return records.get(id) ?? null;
      }),
      cancel: jest.fn().mockResolvedValue(true),
    };
    rpc = {
      getBoundRunState: jest.fn().mockResolvedValue(null),
      startBoundAgents: jest.fn().mockResolvedValue({}),
      startBoundGuidance: jest.fn().mockResolvedValue({}),
      regenerateBoundGuidance: jest.fn(),
      cancelBoundRun: jest.fn().mockResolvedValue(true),
    };
    TestBed.configureTestingModule({
      providers: [
        GenerationWorkflowStore,
        { provide: WizardRpcService, useValue: rpc },
        { provide: SetupRunStore, useFactory: () => runs },
      ],
    });
    store = TestBed.inject(GenerationWorkflowStore);
  });

  afterEach(() => {
    store.unbind();
    jest.useRealTimers();
  });

  it.each([
    'starting',
    'running',
    'cancelling',
    'cancelled',
    'failed',
    'timed-out',
    'completed',
  ] as const)(
    'rebinds the %s lifecycle from authoritative state',
    async (status) => {
      const authoritative = { ...active, status };
      rpc.getBoundRunState.mockResolvedValue(authoritative);
      store.bind(binding, 'run');
      await store.refresh();
      expect(store.state()).toBe(status);
      expect(store.run()?.binding.runId).toBe('run');
      expect(rpc.getBoundRunState).toHaveBeenCalledWith(binding, undefined);
    },
  );

  it('flags a mismatched run on rebind for recovery', async () => {
    rpc.getBoundRunState.mockResolvedValue({
      ...active,
      binding: { ...binding, runId: 'latest' },
    });
    store.bind(binding, 'old');
    await store.refresh();
    expect(store.runMismatch()).toBe(true);
    expect(store.run()).toBeNull();
    store.bind(binding, 'latest');
    await store.refresh();
    expect(store.runMismatch()).toBe(false);
    expect(store.run()?.binding.runId).toBe('latest');
  });

  it('flags recovery when the expected run has no authoritative owner', async () => {
    store.bind(binding, 'run');
    await store.refresh();
    expect(store.state()).toBe('idle');
    expect(store.run()).toBeNull();
    expect(store.runMismatch()).toBe(true);
    await store.refresh();
    expect(store.runMismatch()).toBe(true);
  });

  it('recovers the expected run after one failed lookup', async () => {
    jest.useFakeTimers();
    rpc.getBoundRunState
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(active);
    store.bind(binding, 'run');
    await jest.advanceTimersByTimeAsync(0);
    expect(store.runMismatch()).toBe(false);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(store.run()?.binding.runId).toBe('run');
    expect(store.runMismatch()).toBe(false);
    expect(rpc.getBoundRunState).toHaveBeenCalledTimes(2);
  });

  it('schedules a retry without consuming the expected run after a failed lookup', async () => {
    jest.useFakeTimers();
    rpc.getBoundRunState.mockRejectedValue(new Error('offline'));
    store.bind(binding, 'run');
    await jest.advanceTimersByTimeAsync(0);
    expect(store.runMismatch()).toBe(false);
    expect(store.run()).toBeNull();
    expect(jest.getTimerCount()).toBe(1);
  });

  it('exposes lookupExhausted after the fourth failed expected-run lookup and clears it on recovery', async () => {
    jest.useFakeTimers();
    rpc.getBoundRunState.mockRejectedValue(new Error('offline'));
    store.bind(binding, 'run');
    await jest.advanceTimersByTimeAsync(7000);
    expect(rpc.getBoundRunState).toHaveBeenCalledTimes(4);
    expect(store.lookupExhausted()).toBe(true);
    expect(store.runMismatch()).toBe(false);
    rpc.getBoundRunState.mockResolvedValue(active);
    await store.refresh();
    expect(store.lookupExhausted()).toBe(false);
    expect(store.run()?.binding.runId).toBe('run');
  });

  it('keeps the held run and skips a lookup when rebinding its run id', async () => {
    rpc.getBoundRunState.mockResolvedValue(active);
    store.bind(binding);
    await store.refresh();
    const heldRun = store.run();
    const calls = rpc.getBoundRunState.mock.calls.length;
    store.bind(binding, 'run');
    expect(store.run()).toBe(heldRun);
    expect(store.state()).toBe('running');
    expect(rpc.getBoundRunState).toHaveBeenCalledTimes(calls);
  });

  it('adopts a started run B after binding run A without a mismatch on refresh', async () => {
    const settledA = { ...active, status: 'completed' as const };
    const startedB = { ...active, binding: { ...binding, runId: 'B' } };
    rpc.getBoundRunState.mockImplementation(async (_binding, runId?: string) =>
      runId === 'B' ? startedB : settledA,
    );
    rpc.startBoundAgents.mockResolvedValue({ accepted: { runId: 'B' } });
    store.bind(binding, 'run');
    await store.refresh();
    expect(store.run()?.binding.runId).toBe('run');
    await store.startAgents(['agent']);
    expect(store.run()?.binding.runId).toBe('B');
    rpc.getBoundRunState.mockResolvedValue(startedB);
    await store.refresh();
    expect(store.runMismatch()).toBe(false);
    expect(store.run()?.binding.runId).toBe('B');
    expect(store.state()).toBe('running');
  });

  it('rebinds a handoff-started run without a second guidance start', async () => {
    const handoffRun = {
      ...active,
      binding: { ...guidanceBinding, runId: 'handoff' },
    };
    rpc.getBoundRunState.mockResolvedValue(handoffRun);
    store.bind(guidanceBinding, 'handoff');
    await store.refresh();
    expect(store.run()?.binding.runId).toBe('handoff');
    expect(rpc.startBoundGuidance).not.toHaveBeenCalled();
  });

  it('finds its own guidance run after a lost start response without claiming a model cause', async () => {
    const ownRun = {
      ...active,
      binding: { ...guidanceBinding, runId: 'guidance' },
    };
    rpc.startBoundGuidance
      .mockRejectedValueOnce(new Error('lost response'))
      .mockRejectedValueOnce(
        new Error('The selected model is not available for this provider.'),
      );
    store.bind(guidanceBinding);
    await store.startGuidance();
    expect(rpc.getBoundRunState).toHaveBeenCalledWith(
      guidanceBinding,
      undefined,
    );
    expect(store.run()).toBeNull();
    rpc.getBoundRunState.mockResolvedValueOnce(ownRun);
    await store.refresh();
    expect(store.run()?.binding.runId).toBe('guidance');
    store.unbind();
    rpc.getBoundRunState.mockResolvedValue(null);
    store.bind(guidanceBinding);
    await store.startGuidance();
    expect(store.startError()).toBeNull();
  });

  it.each([
    ['finalization failure', true, 'failed', true],
    ['other failure', false, 'failed', false],
    ['completed terminal', false, 'completed', false],
  ] as const)(
    'allows verified lookup correction only for %s',
    async (_name, finalizationFailed, priorStatus, shouldCorrect) => {
      const previous = {
        ...active,
        status: priorStatus,
        result: {
          status: priorStatus,
          success: priorStatus === 'completed',
          source: active.source,
          effectiveProvider: 'unknown',
          effectiveModel: 'unknown',
          ...(finalizationFailed ? { finalizationFailed: true } : {}),
        },
      };
      const verified = {
        ...active,
        status: 'completed' as const,
        result: {
          status: 'completed' as const,
          success: true,
          source: active.source,
          effectiveProvider: 'unknown',
          effectiveModel: 'unknown',
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
      rpc.getBoundRunState
        .mockResolvedValueOnce(previous)
        .mockResolvedValue(verified);
      store.bind(binding);
      await Promise.resolve();
      await store.refresh();
      expect(store.run()).toEqual(shouldCorrect ? verified : previous);
    },
  );

  it('keeps a terminal result when a stale running read arrives', async () => {
    const terminal = {
      ...active,
      status: 'completed' as const,
      result: {
        status: 'completed' as const,
        success: true,
        source: active.source,
        effectiveProvider: 'unknown',
        effectiveModel: 'unknown',
      },
    };
    rpc.getBoundRunState
      .mockResolvedValueOnce(terminal)
      .mockResolvedValueOnce(active)
      .mockResolvedValue({ ...terminal, result: undefined });
    store.bind(binding);
    await Promise.resolve();
    await store.refresh();
    await store.refresh();
    await store.refresh();
    expect(store.run()).toEqual(terminal);
    expect(store.state()).toBe('completed');
  });

  it('retries a lost status read with a bounded watchdog', async () => {
    jest.useFakeTimers();
    rpc.getBoundRunState
      .mockResolvedValueOnce(active)
      .mockRejectedValue(new Error('offline'));
    store.bind(binding);
    await Promise.resolve();
    await store.refresh();
    await jest.advanceTimersByTimeAsync(7000);
    expect(rpc.getBoundRunState).toHaveBeenCalledTimes(5);
    store.unbind();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('restores the lookup watchdog for a newly accepted binding after exhaustion', async () => {
    jest.useFakeTimers();
    rpc.getBoundRunState
      .mockResolvedValueOnce(active)
      .mockRejectedValue(new Error('offline'));
    rpc.startBoundAgents.mockResolvedValue({
      accepted: {
        runId: 'second-run',
        source: active.source,
        effectiveProvider: 'unknown',
        effectiveModel: 'unknown',
      },
    });
    store.bind(binding);
    await Promise.resolve();
    await store.refresh();
    await jest.advanceTimersByTimeAsync(7000);
    store.bind({ ...binding, tabId: 'second-tab' });
    await Promise.resolve();
    await store.startAgents(['a']);
    await store.refresh();
    expect(jest.getTimerCount()).toBe(1);
  });

  it('retries an interrupted record through SetupRunStore', async () => {
    const interrupted = seed(
      record({ id: 'tab', status: 'interrupted', backendRunId: 'old' }),
    );
    const started = {
      ...interrupted,
      status: 'running' as const,
      backendRunId: 'run',
    };
    runs.retry.mockResolvedValue(started);
    rpc.getBoundRunState.mockResolvedValue(active);
    store.bind(binding);
    await store.retry();
    expect(runs.retry).toHaveBeenCalledWith('tab');
    expect(rpc.startBoundAgents).not.toHaveBeenCalled();
    expect(store.run()?.binding.runId).toBe('run');
    expect(store.rejection()).toBeNull();
  });

  it('attaches to the owner record returned by retry', async () => {
    seed(record({ id: 'tab', status: 'failed' }));
    const owner = seed(record({ id: 'owner', backendRunId: 'owner-run' }));
    runs.retry.mockResolvedValue(owner);
    rpc.getBoundRunState.mockResolvedValue({
      ...active,
      binding: { ...binding, tabId: 'owner', runId: 'owner-run' },
    });
    store.bind(binding);
    await store.retry();
    expect(runs.retry).toHaveBeenCalledWith('tab');
    expect(store.binding()?.tabId).toBe('owner');
    expect(store.rejection()).toBeNull();
  });

  it('clears a previous rejection on a new start and on acceptance', async () => {
    rpc.startBoundAgents
      .mockResolvedValueOnce({ rejection: { reason: 'preview-required' } })
      .mockResolvedValueOnce({
        success: true,
        accepted: {
          runId: 'run',
          source: active.source,
          effectiveProvider: 'unknown',
          effectiveModel: 'unknown',
        },
      });
    store.bind(binding);
    await store.startAgents(['agent']);
    expect(store.rejection()?.reason).toBe('preview-required');
    const second = store.startAgents(['agent']);
    expect(store.rejection()).toBeNull();
    await second;
    expect(store.run()?.binding.runId).toBe('run');
    expect(store.rejection()).toBeNull();
  });

  it.each(['agents', 'guidance', 'retry'] as const)(
    'releases the binding immediately for an explicit %s start failure',
    async (kind) => {
      const selectedBinding = kind === 'guidance' ? guidanceBinding : binding;
      const error = 'Agent generation could not start. Please retry.';
      const response = { success: false, error };
      rpc.startBoundAgents.mockResolvedValue(response);
      rpc.startBoundGuidance.mockResolvedValue(response);
      if (kind === 'retry') {
        const failed = seed(record({ id: 'tab', status: 'failed', error }));
        runs.retry.mockResolvedValue(failed);
      }
      store.bind(selectedBinding);
      if (kind === 'agents') await store.startAgents(['agent']);
      else if (kind === 'guidance') await store.startGuidance();
      else await store.retry();
      expect(store.state()).toBe('idle');
      expect(store.isBound()).toBe(false);
      expect(store.startError()).toBe(error);
    },
  );

  it('shows the Setup error after a bound guidance start rejection', async () => {
    const message =
      'Setup model cannot run guidance (not-signed-in; provider=openrouter). Update Background models and retry.';
    const error = Object.assign(
      new Error(
        `SETUP_MODEL_INVALID reason=not-signed-in provider=openrouter: ${message}`,
      ),
      {
        code: 'SETUP_MODEL_INVALID',
        reason: 'not-signed-in',
        provider: 'openrouter',
      },
    );
    rpc.startBoundGuidance.mockRejectedValue(error);
    store.bind(guidanceBinding);
    await store.startGuidance();
    const startError = store.startError();
    const viewError = safeFailureCopy(
      startError,
      'Guidance could not start. Try again.',
    );
    expect(store.state()).toBe('idle');
    expect(startError).toBe(
      `SETUP_MODEL_INVALID reason=not-signed-in provider=openrouter: ${message}`,
    );
    expect(viewError).toBe('Sign in to OpenRouter. Then retry guidance.');
  });

  it('releases a runless binding after unconfirmed start lookups are exhausted', async () => {
    jest.useFakeTimers();
    rpc.startBoundAgents.mockRejectedValue(new Error('Start unconfirmed'));
    store.bind(binding);
    await store.startAgents(['agent']);
    await jest.advanceTimersByTimeAsync(7000);
    expect(store.state()).toBe('idle');
    expect(store.isBound()).toBe(false);
    expect(store.startError()).toBe(
      'Generation could not be started. Try again.',
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it('queues Stop until the exact accepted run ID and cancels its record', async () => {
    rpc.getBoundRunState.mockResolvedValueOnce(null).mockResolvedValue(active);
    rpc.startBoundAgents.mockResolvedValue({
      success: true,
      accepted: {
        runId: 'run',
        status: 'starting',
        source: active.source,
        effectiveProvider: 'unknown',
        effectiveModel: 'unknown',
      },
    });
    store.bind(binding);
    await Promise.resolve();
    const starting = store.startAgents(['agent']);
    store.stop();
    await starting;
    expect(runs.get('tab')?.backendRunId).toBe('run');
    expect(runs.cancel).toHaveBeenCalledWith('tab');
    expect(rpc.cancelBoundRun).not.toHaveBeenCalled();
    expect(store.provider()).toBeNull();
    expect(store.model()).toBeNull();
  });

  it('takes terminal truth only from lookup', async () => {
    rpc.getBoundRunState.mockResolvedValue({
      ...active,
      status: 'timed-out',
      committedState: 'unknown',
    });
    store.bind(binding);
    await store.refresh();
    expect(store.state()).toBe('timed-out');
  });

  it('passes confirmed preview decisions to the bound submit and exposes preview-required', async () => {
    rpc.startBoundAgents.mockResolvedValue({
      rejection: { reason: 'preview-required' },
    });
    store.bind(binding);
    const decisions = {
      previewToken: 'token-1',
      fileDecisions: {
        tester: { decision: 'replace' as const, revision: 'rev-1' },
      },
      target: 'harness-root' as const,
    };
    await store.startAgents(['tester'], decisions);
    expect(rpc.startBoundAgents).toHaveBeenCalledWith(
      binding,
      ['tester'],
      false,
      decisions,
    );
    expect(store.rejection()).toEqual({ reason: 'preview-required' });
    expect(store.state()).toBe('idle');
  });

  it.each(['invalid-binding', 'workspace-mismatch'] as const)(
    'marks the record failed after a %s rejection',
    async (reason) => {
      seed(record({ id: 'tab' }));
      rpc.startBoundAgents.mockResolvedValue({ rejection: { reason } });
      store.bind(binding);
      await store.startAgents(['agent']);
      expect(runs.report).toHaveBeenCalledWith('tab', {
        status: 'failed',
        error: 'This run belongs to another workspace.',
      });
      expect(runs.get('tab')).toMatchObject({
        status: 'failed',
        error: 'This run belongs to another workspace.',
      });
      expect(store.rejection()).toEqual({ reason });
      expect(store.state()).toBe('idle');
    },
  );

  it('preserves an unconfirmed Stop and rereads the exact run', async () => {
    rpc.getBoundRunState.mockResolvedValue(active);
    runs.cancel.mockResolvedValue(false);
    store.bind(binding);
    await store.refresh();
    expect(store.state()).toBe('running');
    store.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runs.get('tab')?.backendRunId).toBe('run');
    expect(runs.cancel).toHaveBeenCalledWith('tab');
    expect(store.state()).toBe('stop-unconfirmed');
    rpc.getBoundRunState.mockResolvedValue({
      ...active,
      status: 'cancelled',
      interrupted: true,
    });
    await store.refresh();
    expect(store.state()).toBe('cancelled');
    expect(store.run()?.interrupted).toBe(true);
  });

  it('attaches a blocked owner and discards pending Stop', async () => {
    let resolveStart!: (value: {
      rejection: { reason: 'blocked'; ownerTabId: string };
    }) => void;
    rpc.startBoundAgents.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    store.bind(binding);
    const starting = store.startAgents(['agent']);
    expect(store.state()).toBe('starting');
    store.stop();
    expect(store.state()).toBe('cancelling');
    resolveStart({ rejection: { reason: 'blocked', ownerTabId: 'other-tab' } });
    await starting;
    expect(store.binding()?.tabId).toBe('other-tab');
    expect(store.rejection()).toBeNull();
    expect(runs.cancel).not.toHaveBeenCalled();
  });

  it('marks a lost lookup stop-unknown and never cancels an unrelated run', async () => {
    rpc.getBoundRunState.mockResolvedValue(active);
    store.bind(binding);
    await store.refresh();
    rpc.getBoundRunState.mockResolvedValueOnce(null).mockResolvedValue({
      ...active,
      binding: { ...binding, runId: 'foreign' },
    });
    store.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.state()).toBe('stop-unknown');
    await store.refresh();
    expect(runs.cancel).not.toHaveBeenCalled();
    expect(rpc.cancelBoundRun).not.toHaveBeenCalled();
    expect(store.run()?.binding.runId).toBe('run');
  });

  it('does nothing when guidance regeneration has no record', async () => {
    store.bind(guidanceBinding);
    await store.regenerateGuidance();
    expect(runs.retry).not.toHaveBeenCalled();
    expect(runs.rerun).not.toHaveBeenCalled();
    expect(runs.whenStarted).not.toHaveBeenCalled();
    expect(rpc.startBoundGuidance).not.toHaveBeenCalled();
    expect(rpc.regenerateBoundGuidance).not.toHaveBeenCalled();
    expect(store.state()).toBe('idle');
  });

  it('retries a failed record when guidance regenerates', async () => {
    const failed = seed(
      record({
        id: 'tab',
        workflow: 'project-guidance',
        status: 'failed',
        backendRunId: 'old',
      }),
    );
    const started = {
      ...failed,
      status: 'running' as const,
      backendRunId: 'new-run',
    };
    runs.retry.mockResolvedValue(started);
    rpc.getBoundRunState.mockResolvedValue({
      ...active,
      binding: { ...guidanceBinding, runId: 'new-run' },
    });
    store.bind(guidanceBinding);
    await store.regenerateGuidance();
    expect(runs.retry).toHaveBeenCalledWith('tab');
    expect(runs.rerun).not.toHaveBeenCalled();
    expect(store.run()?.binding.runId).toBe('new-run');
  });

  it('reruns a completed guidance record and binds the new record', async () => {
    seed(
      record({
        id: 'tab',
        workflow: 'project-guidance',
        status: 'completed',
        backendRunId: 'old-run',
      }),
    );
    const next = seed(
      record({
        id: 'next-tab',
        workflow: 'project-guidance',
        status: 'running',
        backendRunId: 'next-run',
      }),
    );
    runs.rerun.mockReturnValue(next);
    runs.whenStarted.mockResolvedValue(next);
    rpc.getBoundRunState.mockResolvedValue({
      ...active,
      binding: {
        ...guidanceBinding,
        tabId: 'next-tab',
        runId: 'next-run',
      },
    });
    store.bind(guidanceBinding);
    await store.regenerateGuidance();
    await store.refresh();
    expect(runs.rerun).toHaveBeenCalledWith('tab');
    expect(runs.whenStarted).toHaveBeenCalledWith('next-tab');
    expect(runs.retry).not.toHaveBeenCalled();
    expect(store.binding()?.tabId).toBe('next-tab');
    expect(store.run()?.binding.runId).toBe('next-run');
  });

  it('adopts an unknown accepted record and reports its placeholder', async () => {
    rpc.startBoundAgents.mockResolvedValue({
      accepted: {
        runId: 'run',
        source: active.source,
        effectiveProvider: 'unknown',
        effectiveModel: 'unknown',
      },
    });
    store.bind(binding);
    await store.startAgents(['agent']);
    expect(runs.adopt).toHaveBeenCalledWith(binding);
    expect(runs.reportRun).toHaveBeenCalledTimes(1);
    expect(runs.reportRun).toHaveBeenCalledWith('tab', {
      binding: { ...binding, runId: 'run' },
      status: 'starting',
      source: active.source,
      effectiveProvider: 'unknown',
      effectiveModel: 'unknown',
    });
  });

  it('reports a verified lookup to its record', async () => {
    seed(record({ id: 'tab' }));
    rpc.getBoundRunState.mockResolvedValue(active);
    store.bind(binding);
    await store.refresh();
    expect(runs.reportRun).toHaveBeenCalledWith('tab', active);
    expect(runs.get('tab')?.backendRunId).toBe('run');
  });
});
