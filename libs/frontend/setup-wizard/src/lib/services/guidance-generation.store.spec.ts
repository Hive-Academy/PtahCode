import { TestBed } from '@angular/core/testing';
import type {
  SetupGenerationRunState,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import { GuidanceGenerationStore } from './guidance-generation.store';
import { SetupRunStore } from './setup-run.store';
import type { SetupRunRecord } from './setup-run.types';
import { WizardRpcService } from './wizard-rpc.service';

const binding = {
  tabId: 'own',
  workspacePath: '/ws',
  workflow: 'setup-project-prompt' as const,
};
const accepted = {
  runId: 'r1',
  status: 'starting' as const,
  source: { kind: 'workspace-discovery' as const, reason: 'missing' as const },
  effectiveProvider: 'unknown',
  effectiveModel: 'unknown',
};
const run = (
  status: SetupGenerationRunState['status'],
  committedState?: SetupGenerationRunState['committedState'],
): SetupGenerationRunState => ({
  binding: { ...binding, runId: 'r1' },
  status,
  committedState,
  source: accepted.source,
  effectiveProvider: 'unknown',
  effectiveModel: 'unknown',
});

function record(
  over: Partial<SetupRunRecord> & { id: string },
): SetupRunRecord {
  return {
    workspacePath: '/ws',
    workflow: 'project-guidance',
    status: 'running',
    step: 'generating',
    backendRunId: 'r1',
    analysisRunId: null,
    parentId: null,
    unseen: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

describe('GuidanceGenerationStore', () => {
  let rpc: {
    getBoundRunState: jest.Mock;
    startBoundGuidance: jest.Mock;
    cancelBoundRun: jest.Mock;
    getEnhancedPromptsStatus: jest.Mock;
    regenerateBoundGuidance: jest.Mock;
    toggleEnhancedPrompts: jest.Mock;
    getEnhancedPromptContent: jest.Mock;
    downloadEnhancedPrompt: jest.Mock;
  };
  let runs: {
    get: jest.Mock;
    adopt: jest.Mock;
    reportRun: jest.Mock;
    bindingFor: jest.Mock;
  };
  let records: Map<string, SetupRunRecord>;
  let store: GuidanceGenerationStore;

  beforeEach(() => {
    records = new Map([['own', record({ id: 'own' })]]);
    runs = {
      get: jest.fn().mockImplementation((id: string) => records.get(id) ?? null),
      adopt: jest
        .fn()
        .mockImplementation((bindingValue: SetupGenerationTabBinding) => {
          const existing = records.get(bindingValue.tabId);
          if (existing) return existing;
          if (bindingValue.workflow !== 'setup-project-prompt') return null;
          const adopted = record({
            id: bindingValue.tabId,
            workspacePath: bindingValue.workspacePath,
            backendRunId: null,
          });
          records.set(adopted.id, adopted);
          return adopted;
        }),
      reportRun: jest
        .fn()
        .mockImplementation((id: string, value: SetupGenerationRunState) => {
          const current = records.get(id);
          if (!current) return null;
          const updated = {
            ...current,
            backendRunId: value.binding.runId,
            updatedAt: 2000,
          };
          records.set(id, updated);
          return updated;
        }),
      bindingFor: jest.fn().mockImplementation((value: SetupRunRecord) => {
        return value.workflow === 'project-guidance'
          ? {
              tabId: value.id,
              workspacePath: value.workspacePath,
              workflow: 'setup-project-prompt',
            }
          : null;
      }),
    };
    rpc = {
      getBoundRunState: jest.fn().mockResolvedValue(null),
      startBoundGuidance: jest.fn().mockResolvedValue({ accepted }),
      cancelBoundRun: jest.fn().mockResolvedValue(true),
      getEnhancedPromptsStatus: jest
        .fn()
        .mockResolvedValue({ hasGeneratedPrompt: false }),
      regenerateBoundGuidance: jest.fn(),
      toggleEnhancedPrompts: jest.fn(),
      getEnhancedPromptContent: jest.fn(),
      downloadEnhancedPrompt: jest.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        GuidanceGenerationStore,
        { provide: WizardRpcService, useValue: rpc },
        { provide: SetupRunStore, useFactory: () => runs },
      ],
    });
    store = TestBed.inject(GuidanceGenerationStore);
  });

  it('adopts a workflow run and labels only verified latest analysis', async () => {
    store.bind(binding);
    store.adopt(run('running'));
    expect(store.source()).toBe('Workspace discovery (missing)');
    expect(store.snapshot()?.provider).toBeNull();
    rpc.getBoundRunState.mockResolvedValue({
      ...run('running'),
      source: {
        kind: 'verified-analysis',
        analysisRunId: 'a',
        analysisDir: '/secret',
      },
    });
    store.adopt({
      ...run('running'),
      binding: { ...binding, runId: 'r2' },
      source: {
        kind: 'verified-analysis',
        analysisRunId: 'a',
        analysisDir: '/secret',
      },
    });
    expect(store.source()).toBe('Verified latest analysis');
    expect(JSON.stringify(store.snapshot())).not.toContain('/secret');
  });

  it('does not mark a trace-write failure successful', async () => {
    store.bind(binding);
    store.adopt(run('running'));
    rpc.getBoundRunState.mockResolvedValue(run('completed', 'unknown'));
    await store.refresh();
    expect(store.status()).toBe('failed');
  });

  it('keeps an unchanged completed run successful after an active run', async () => {
    store.bind(binding);
    store.adopt(run('running'));
    rpc.getBoundRunState.mockResolvedValue(run('completed', 'unchanged'));
    await store.refresh();
    expect(store.status()).toBe('completed');
  });

  it('shows committed guidance with neutral status after reload unless cancellation is verified', async () => {
    rpc.getBoundRunState.mockResolvedValue(run('completed', 'committed'));
    rpc.getEnhancedPromptsStatus.mockResolvedValue({
      hasGeneratedPrompt: true,
      generatedAt: 'saved',
      enabled: true,
      cacheValid: true,
    });
    store.bind(binding);
    await store.refresh();
    expect(store.status()).toBe('idle');
    expect(store.result()?.generatedAt).toBe('saved');
    rpc.getBoundRunState.mockResolvedValue(run('cancelled', 'unchanged'));
    await store.refresh();
    expect(store.status()).toBe('cancelled');
  });

  it.each(['workflow first', 'guidance first'])(
    'keeps a restored failed run neutral when %s replies',
    async (order) => {
      rpc.getBoundRunState.mockResolvedValue(run('failed'));
      store.bind(binding);
      if (order === 'workflow first') store.adopt(run('failed'));
      await store.refresh();
      if (order === 'guidance first') store.adopt(run('failed'));
      expect(store.status()).toBe('idle');
      store.adopt(run('failed'), true);
      expect(store.status()).toBe('failed');
    },
  );

  it('loads only the committed metadata and supports enabled/content/download actions', async () => {
    rpc.getEnhancedPromptsStatus.mockResolvedValue({
      hasGeneratedPrompt: true,
      generatedAt: 'now',
      enabled: true,
      cacheValid: false,
    });
    rpc.toggleEnhancedPrompts.mockResolvedValue(undefined);
    rpc.getEnhancedPromptContent.mockResolvedValue('saved text');
    rpc.downloadEnhancedPrompt.mockResolvedValue({ success: true });
    store.bind(binding);
    await store.refreshCommitted();
    await store.setEnabled(false);
    await store.loadContent();
    await store.download();
    expect(store.result()?.generatedAt).toBe('now');
    expect(store.content()).toBe('saved text');
    expect(store.actionFailed()).toBe(false);
  });

  it('reverts a failed toggle, clears action errors, and drops stale content on a new commit', async () => {
    rpc.getEnhancedPromptsStatus.mockResolvedValue({
      hasGeneratedPrompt: true,
      generatedAt: 'first',
      enabled: true,
      cacheValid: true,
    });
    rpc.toggleEnhancedPrompts.mockRejectedValueOnce(new Error('private'));
    rpc.getEnhancedPromptContent
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce(null);
    rpc.downloadEnhancedPrompt.mockResolvedValue({ success: true });
    store.bind(binding);
    await store.refreshCommitted();
    await store.loadContent();
    await store.setEnabled(false);
    expect(store.result()?.enabled).toBe(true);
    expect(store.actionFailed()).toBe(true);
    await store.download();
    expect(store.actionFailed()).toBe(false);
    rpc.getEnhancedPromptsStatus.mockResolvedValue({
      hasGeneratedPrompt: true,
      generatedAt: 'second',
      enabled: true,
      cacheValid: true,
    });
    await store.refreshCommitted();
    expect(store.content()).toBeNull();
    await store.loadContent();
    expect(store.actionFailed()).toBe(true);
  });

  it('reports an applied run to its Setup record', () => {
    const verified = run('running');
    store.bind(binding);
    store.adopt(verified);
    expect(runs.reportRun).toHaveBeenCalledWith('own', verified);
    expect(runs.get('own')?.backendRunId).toBe('r1');
  });

  it('binds a project-guidance Setup record', async () => {
    const value = record({ id: 'record', backendRunId: 'r9' });
    records.set(value.id, value);
    const verified = {
      ...run('running'),
      binding: {
        ...binding,
        tabId: 'record',
        runId: 'r9',
      },
    };
    rpc.getBoundRunState.mockResolvedValue(verified);
    expect(store.bindRecord(value)).toBe(true);
    expect(runs.bindingFor).toHaveBeenCalledWith(value);
    expect(store.binding()).toEqual({ ...binding, tabId: 'record' });
    await store.refresh();
    expect(store.snapshot()?.runId).toBe('r9');
    expect(runs.reportRun).toHaveBeenCalledWith('record', verified);
  });
});
