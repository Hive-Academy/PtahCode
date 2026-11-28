import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  StreamRouter,
  StreamingSurfaceRegistry,
} from '@ptah-extension/chat-routing';
import {
  MESSAGE_HANDLERS,
  MessageRouterService,
  VSCodeService,
} from '@ptah-extension/core';
import type {
  SetupGenerationRunBinding,
  SetupGenerationRunLifecycle,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
  SetupGenerationWorkflow,
} from '@ptah-extension/shared';

import { GenerationRunEventAdapter } from './generation-run-event-adapter';
import { GenerationWorkflowStore } from './generation-workflow.store';
import {
  SETUP_RUNS_STORAGE_KEY,
  serializeSetupRunIndex,
} from './setup-run-persistence';
import { SETUP_RUN_POLL_INTERVAL_MS, SetupRunStore } from './setup-run.store';
import type { SetupRunRecord } from './setup-run.types';
import { SetupWizardStateService } from './setup-wizard-state.service';
import { WizardAnalysisRunner } from './wizard-analysis-runner.service';
import { WizardRpcService } from './wizard-rpc.service';

jest.mock('@ptah-extension/chat-state', () => ({
  ...jest.requireActual('@ptah-extension/chat-state'),
  consumeLegacySetupTabs: jest.fn(() => []),
}));

const WS = '/ws/a';
const OTHER_WS = '/ws/b';

function record(
  over: Partial<SetupRunRecord> & { id: string },
): SetupRunRecord {
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

function pushed(
  tabId: string,
  runId = 'run-1',
  workflow: SetupGenerationWorkflow = 'setup-agent-generation',
  workspacePath = WS,
): SetupGenerationRunBinding {
  return { tabId, workflow, workspacePath, runId };
}

function runState(
  status: SetupGenerationRunLifecycle,
  binding: SetupGenerationRunBinding,
): SetupGenerationRunState {
  return {
    status,
    binding,
    ...(status === 'completed' && binding.workflow === 'setup-project-prompt'
      ? { committedState: 'committed' as const }
      : {}),
    source: { kind: 'workspace-discovery', reason: 'missing' },
    effectiveProvider: 'p',
    effectiveModel: 'm',
  };
}

describe('GenerationRunEventAdapter', () => {
  let rpc: Record<string, jest.Mock>;
  let tabs: Record<string, unknown> & {
    createTab: jest.Mock;
    createWorkflowTabForWorkspace: jest.Mock;
  };
  let shownBinding: ReturnType<typeof signal<SetupGenerationTabBinding | null>>;
  let shownRun: ReturnType<typeof signal<SetupGenerationRunState | null>>;
  let shownBound: ReturnType<typeof signal<boolean>>;
  let workflow: {
    binding: () => SetupGenerationTabBinding | null;
    run: () => SetupGenerationRunState | null;
    isBound: () => boolean;
    refresh: jest.Mock;
    bind: jest.Mock;
  };

  function seed(...records: SetupRunRecord[]): void {
    const index: Record<string, SetupRunRecord[]> = {};
    for (const r of records) (index[r.workspacePath] ??= []).push(r);
    localStorage.setItem(SETUP_RUNS_STORAGE_KEY, serializeSetupRunIndex(index));
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      for (let j = 0; j < 12; j++) await Promise.resolve();
    }
  }

  async function create(): Promise<{
    adapter: GenerationRunEventAdapter;
    runs: SetupRunStore;
  }> {
    const runs = TestBed.inject(SetupRunStore);
    const adapter = TestBed.inject(GenerationRunEventAdapter);
    await flush();
    rpc['getBoundRunState'].mockClear();
    return { adapter, runs };
  }

  function stream(
    adapter: GenerationRunEventAdapter,
    binding: SetupGenerationRunBinding,
    extra: Record<string, unknown> = {},
    type = 'setup-wizard:generation-stream',
  ): void {
    adapter.handleMessage({
      type,
      payload: {
        tabBinding: binding,
        kind: 'text',
        content: 'x',
        timestamp: 1000,
        ...extra,
      },
    });
  }

  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
    rpc = {
      getResumableRun: jest
        .fn()
        .mockResolvedValue({ analysis: null, generation: null }),
      // Activation reconciles every live record: report each one running.
      getBoundRunState: jest.fn(
        async (tab: SetupGenerationTabBinding, runId?: string) =>
          runState('running', { ...tab, runId: runId ?? 'run-1' }),
      ),
      startBoundAgents: jest.fn(),
      startBoundGuidance: jest.fn(),
      getEnhancedPromptsStatus: jest.fn().mockResolvedValue({}),
      getSkillReview: jest.fn().mockResolvedValue({ review: null }),
    };
    tabs = {
      activeWorkspacePath: WS,
      createTab: jest.fn(),
      createWorkflowTabForWorkspace: jest.fn(),
    };
    shownBinding = signal<SetupGenerationTabBinding | null>(null);
    shownRun = signal<SetupGenerationRunState | null>(null);
    shownBound = signal(false);
    workflow = {
      binding: shownBinding.asReadonly(),
      run: shownRun.asReadonly(),
      isBound: shownBound.asReadonly(),
      refresh: jest.fn().mockResolvedValue(undefined),
      bind: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        MessageRouterService,
        {
          provide: MESSAGE_HANDLERS,
          useExisting: GenerationRunEventAdapter,
          multi: true,
        },
        {
          provide: MESSAGE_HANDLERS,
          useExisting: SetupWizardStateService,
          multi: true,
        },
        { provide: StreamRouter, useValue: {} },
        { provide: StreamingSurfaceRegistry, useValue: {} },
        { provide: WizardRpcService, useValue: rpc },
        {
          provide: WizardAnalysisRunner,
          useValue: {
            isRunning: signal(false),
            activeWorkspacePath: signal(null),
            backendActive: jest.fn(() => false),
            syncBackendActive: jest.fn(),
            setCurrentWorkspacePath: jest.fn(),
            isCanceling: signal(false),
            runGeneration: signal(0),
            errorMessage: signal(null),
            isRunningForWorkspace: jest.fn(() => false),
            isResultForWorkspace: jest.fn(() => false),
            resumableAnalysis: jest.fn(() => null),
          },
        },
        {
          provide: SetupWizardStateService,
          useValue: { multiPhaseResult: signal(null) },
        },
        { provide: TabManagerService, useValue: tabs },
        {
          provide: VSCodeService,
          useValue: { config: signal({ workspaceRoot: '' }) },
        },
        { provide: GenerationWorkflowStore, useValue: workflow },
      ],
    });
  });

  afterEach(() => {
    expect(tabs.createTab).not.toHaveBeenCalled();
    expect(tabs.createWorkflowTabForWorkspace).not.toHaveBeenCalled();
    jest.useRealTimers();
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('handles the four generator push types', async () => {
    const { adapter } = await create();
    expect([...adapter.handledMessageTypes]).toEqual([
      'setup-wizard:generation-stream',
      'setup-wizard:enhance-stream',
      'setup-wizard:generation-complete',
      'setup-wizard:error',
    ]);
  });

  it.each([
    [
      'setup-wizard:generation-stream',
      'setup-agent-generation',
      'generationStream',
    ],
    ['setup-wizard:enhance-stream', 'setup-project-prompt', 'enhanceStream'],
  ] as const)(
    'routes %s once to both the record and transcript handlers',
    async (type, workflow, buffer) => {
      TestBed.overrideProvider(SetupWizardStateService, {
        useFactory: () => new SetupWizardStateService(),
        deps: [],
      });
      const { adapter, runs } = await create();
      const state = TestBed.inject(SetupWizardStateService);
      const adapterHandler = jest.spyOn(adapter, 'handleMessage');
      const transcriptHandler = jest.spyOn(state, 'handleMessage');
      TestBed.inject(MessageRouterService);

      const payload = {
        tabBinding: pushed('record-x', 'run-6', workflow),
        kind: 'text',
        content: 'one chunk',
        timestamp: 1000,
      };
      window.dispatchEvent(
        new MessageEvent('message', { data: { type, payload } }),
      );
      await jest.advanceTimersByTimeAsync(1);
      await flush();

      expect(adapterHandler).toHaveBeenCalledTimes(1);
      expect(transcriptHandler).toHaveBeenCalledTimes(1);
      expect(runs.get('record-x')).toMatchObject({
        backendRunId: 'run-6',
        status: 'running',
      });
      expect(state[buffer]()).toEqual([payload]);
      expect(tabs.createTab).not.toHaveBeenCalled();
      expect(tabs.createWorkflowTabForWorkspace).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      workflow: 'setup-project-prompt',
      recordWorkflow: 'project-guidance',
      type: 'setup-wizard:enhance-stream',
      rpcName: 'startBoundGuidance',
      nextId: 'run-new',
    },
    {
      workflow: 'setup-agent-generation',
      recordWorkflow: 'agent-generation',
      type: 'setup-wizard:generation-stream',
      rpcName: 'startBoundAgents',
      nextId: 'run-old',
    },
  ] as const)(
    'rereads $workflow after deferred acceptance of $nextId',
    async ({ workflow, recordWorkflow, type, rpcName, nextId }) => {
      seed(
        record({
          id: 'record-x',
          workflow: recordWorkflow,
          backendRunId: 'run-old',
        }),
      );
      const { adapter, runs } = await create();
      const old = pushed('record-x', 'run-old', workflow);
      const current = pushed('record-x', nextId, workflow);
      let replyToOldRead!: (value: SetupGenerationRunState) => void;
      rpc['getBoundRunState'].mockReturnValueOnce(
        new Promise((resolve) => (replyToOldRead = resolve)),
      );
      stream(adapter, old, { lifecycle: 'failed' }, type);
      runs.reportRun('record-x', runState('failed', old));

      let accept!: (value: { accepted: { runId: string } }) => void;
      rpc[rpcName].mockReturnValue(
        new Promise((resolve) => (accept = resolve)),
      );
      const started = runs.retry('record-x');
      stream(adapter, current, {}, type);
      stream(adapter, current, { lifecycle: 'completed' }, type);
      replyToOldRead(runState('failed', old));
      await flush();
      expect(runs.get('record-x')?.status).toBe('running');

      rpc['getBoundRunState'].mockResolvedValue(runState('completed', current));
      accept({ accepted: { runId: nextId } });
      await started;
      await flush();
      expect(rpc['getBoundRunState']).toHaveBeenLastCalledWith(
        { tabId: 'record-x', workflow, workspacePath: WS },
        nextId,
      );
      expect(runs.get('record-x')).toMatchObject({
        backendRunId: nextId,
        status: 'completed',
        unseen: true,
      });
    },
  );

  describe('stream pushes', () => {
    it('updates the record named by the binding id', async () => {
      seed(
        record({ id: 'setup-g1', status: 'needs-input', step: 'preview' }),
        record({ id: 'setup-g2', status: 'needs-input', step: 'preview' }),
      );
      const { adapter, runs } = await create();
      stream(adapter, pushed('setup-g1'));
      expect(runs.get('setup-g1')).toMatchObject({
        status: 'running',
        step: 'generating',
        backendRunId: 'run-1',
      });
      expect(runs.get('setup-g2')?.status).toBe('needs-input');
    });

    it('routes a guidance enhance-stream to its guidance record', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          status: 'needs-input',
          step: 'preview',
        }),
      );
      const { adapter, runs } = await create();
      stream(
        adapter,
        pushed('setup-p1', 'run-3', 'setup-project-prompt'),
        {},
        'setup-wizard:enhance-stream',
      );
      expect(runs.get('setup-p1')?.backendRunId).toBe('run-3');
    });

    it('adopts a push for an unknown id (R1)', async () => {
      const { adapter, runs } = await create();
      stream(
        adapter,
        pushed('owner-9', 'run-4', 'setup-project-prompt'),
        {},
        'setup-wizard:enhance-stream',
      );
      expect(runs.get('owner-9')).toMatchObject({
        workflow: 'project-guidance',
        workspacePath: WS,
        status: 'running',
        backendRunId: 'run-4',
      });
    });

    it('keeps a dismissed checkpoint hidden on a late push', async () => {
      seed(
        record({
          id: 'setup-g1',
          status: 'interrupted',
          backendRunId: 'run-1',
        }),
      );
      const { adapter, runs } = await create();
      expect(runs.dismiss('setup-g1')).toBe(true);

      const binding = pushed('setup-g1');
      stream(adapter, binding);
      adapter.handleMessage({
        type: 'setup-wizard:generation-complete',
        payload: { tabBinding: binding },
      });
      expect(runs.get('setup-g1')).toBeNull();
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();

      stream(adapter, pushed('setup-g1', 'run-2'));
      expect(runs.get('setup-g1')?.backendRunId).toBe('run-2');
    });

    it('ignores a late push of a settled run', async () => {
      seed(
        record({ id: 'setup-g1', status: 'completed', backendRunId: 'run-1' }),
      );
      const { adapter, runs } = await create();
      stream(adapter, pushed('setup-g1', 'run-1'));
      expect(runs.get('setup-g1')?.status).toBe('completed');
    });

    it('keeps B settled after a delayed stream or terminal push from A', async () => {
      seed(record({ id: 'setup-g1', status: 'failed', backendRunId: 'run-a' }));
      const { adapter, runs } = await create();
      rpc['startBoundAgents'].mockResolvedValue({
        accepted: { runId: 'run-b' },
      });
      rpc['getBoundRunState'].mockResolvedValue(
        runState('completed', pushed('setup-g1', 'run-b')),
      );
      await runs.retry('setup-g1');
      await flush();
      const settled = runs.get('setup-g1');
      expect(settled).toMatchObject({
        status: 'completed',
        backendRunId: 'run-b',
        unseen: true,
      });
      rpc['getBoundRunState'].mockClear();
      stream(adapter, pushed('setup-g1', 'run-a'));
      stream(adapter, pushed('setup-g1', 'run-a'), { lifecycle: 'failed' });
      stream(adapter, pushed('setup-g1', 'run-b'), { lifecycle: 'completed' });
      await flush();
      expect(runs.get('setup-g1')).toBe(settled);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
    });

    it('ignores a stale push of an older run on a live record', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-2' }));
      const { adapter, runs } = await create();
      stream(adapter, pushed('setup-g1', 'run-1'));
      expect(runs.get('setup-g1')?.backendRunId).toBe('run-2');
    });

    it('ignores a push whose workflow or workspace differs from the record', async () => {
      seed(record({ id: 'setup-g1', status: 'needs-input', step: 'preview' }));
      const { adapter, runs } = await create();
      stream(adapter, pushed('setup-g1', 'run-1', 'setup-project-prompt'));
      stream(
        adapter,
        pushed('setup-g1', 'run-1', 'setup-agent-generation', OTHER_WS),
      );
      expect(runs.get('setup-g1')?.status).toBe('needs-input');
    });

    it('ignores a push without a valid binding', async () => {
      const { adapter, runs } = await create();
      for (const tabBinding of [
        undefined,
        { ...pushed('bad/id') },
        { ...pushed('setup-g1'), runId: 7 },
        { ...pushed('setup-g1'), workflow: 'chat' },
        { ...pushed('setup-g1'), workspacePath: '' },
      ]) {
        adapter.handleMessage({
          type: 'setup-wizard:generation-stream',
          payload: { tabBinding, kind: 'text', content: 'x', timestamp: 1000 },
        });
      }
      adapter.handleMessage({ type: 'setup-wizard:generation-stream' });
      expect(runs.runs()).toEqual([]);
    });

    it('binds an idle workflow view when its record first observes a run', async () => {
      seed(record({ id: 'setup-g1', status: 'needs-input', step: 'preview' }));
      const { adapter } = await create();
      shownBinding.set({
        tabId: 'setup-g1',
        workflow: 'setup-agent-generation',
        workspacePath: WS,
      });
      stream(adapter, pushed('setup-g1', 'run-2'));
      expect(workflow.bind).toHaveBeenCalledWith(shownBinding(), 'run-2');
      expect(workflow.refresh).not.toHaveBeenCalled();
    });

    it('leaves a workflow view of another record alone', async () => {
      seed(record({ id: 'setup-g1' }));
      const { adapter } = await create();
      shownBinding.set({
        tabId: 'setup-other',
        workflow: 'setup-agent-generation',
        workspacePath: WS,
      });
      stream(adapter, pushed('setup-g1'));
      expect(workflow.bind).not.toHaveBeenCalled();
      expect(workflow.refresh).not.toHaveBeenCalled();
    });
  });

  describe('terminal pushes', () => {
    it('settles the record only after the run-state lookup confirms it', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      const { adapter, runs } = await create();
      rpc['getBoundRunState'].mockResolvedValue(
        runState('completed', pushed('setup-g1')),
      );
      adapter.handleMessage({
        type: 'setup-wizard:generation-complete',
        payload: { tabBinding: pushed('setup-g1'), success: true },
      });
      expect(runs.get('setup-g1')?.status).toBe('running');
      await flush();
      expect(rpc['getBoundRunState']).toHaveBeenCalledWith(
        {
          tabId: 'setup-g1',
          workflow: 'setup-agent-generation',
          workspacePath: WS,
        },
        'run-1',
      );
      expect(runs.get('setup-g1')).toMatchObject({
        status: 'completed',
        unseen: true,
      });
    });

    it.each([
      'rejected',
      'missing',
      'running',
      'bad-lifecycle',
      'bad-source',
      'bad-run-id',
    ] as const)(
      'restores detached polling after %s terminal verification',
      async (verification) => {
        seed(record({ id: 'record-x', backendRunId: 'run-1' }));
        const { adapter, runs } = await create();
        const binding = pushed('record-x');
        stream(adapter, binding);
        await flush();
        await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
        expect(rpc['getBoundRunState']).not.toHaveBeenCalled();

        const running = runState('running', binding);
        const lookup = rpc['getBoundRunState'];
        if (verification === 'rejected')
          lookup.mockRejectedValueOnce(new Error('timeout'));
        else if (verification === 'missing') lookup.mockResolvedValueOnce(null);
        else if (verification === 'bad-lifecycle')
          lookup.mockResolvedValueOnce({ ...running, status: 'unknown' });
        else if (verification === 'bad-source')
          lookup.mockResolvedValueOnce({
            ...running,
            status: 'completed',
            source: null,
          });
        else if (verification === 'bad-run-id')
          lookup.mockResolvedValueOnce({
            ...running,
            status: 'completed',
            binding: { ...binding, runId: '../../another-run' },
          });
        else lookup.mockResolvedValueOnce(running);
        stream(adapter, binding, { lifecycle: 'completed' });
        await flush();
        expect(runs.get('record-x')?.status).toBe('running');
        // Progress after an inconclusive terminal lookup must keep fallback active.
        stream(adapter, binding);
        await flush();
        if (verification === 'missing') {
          lookup.mockResolvedValueOnce(null);
          await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
          expect(runs.get('record-x')?.status).toBe('running');
        }
        lookup.mockResolvedValue(runState('completed', binding));
        await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
        expect(runs.get('record-x')).toMatchObject({
          status: 'completed',
          unseen: true,
        });
        const calls = verification === 'missing' ? 3 : 2;
        expect(lookup).toHaveBeenCalledTimes(calls);
        await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 2);
        expect(lookup).toHaveBeenCalledTimes(calls);
      },
    );

    it('ignores a running poll reply after a terminal push settles the same run', async () => {
      seed(record({ id: 'record-x', backendRunId: 'run-1' }));
      const { adapter, runs } = await create();
      const binding = pushed('record-x');
      let finishPoll!: (value: SetupGenerationRunState) => void;
      rpc['getBoundRunState'].mockReturnValueOnce(
        new Promise((resolve) => (finishPoll = resolve)),
      );
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      rpc['getBoundRunState'].mockResolvedValueOnce(
        runState('completed', binding),
      );
      stream(adapter, binding, { lifecycle: 'completed' });
      await flush();
      const settled = runs.get('record-x');
      expect(settled).toMatchObject({ status: 'completed', unseen: true });
      finishPoll(runState('running', binding));
      await flush();
      expect(runs.get('record-x')).toBe(settled);
    });

    it('preserves B established by a push while an unbound poll for A is in flight', async () => {
      const { adapter, runs } = await create();
      const record = runs.start('agent-generation', WS);
      if (!record) throw new Error('Expected a generation record');
      let finishPoll!: (value: SetupGenerationRunState) => void;
      rpc['getBoundRunState'].mockReturnValueOnce(
        new Promise((resolve) => (finishPoll = resolve)),
      );
      await flush();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);

      stream(adapter, pushed(record.id, 'run-b'));
      finishPoll(runState('running', pushed(record.id, 'run-a')));
      await flush();
      expect(runs.get(record.id)).toMatchObject({
        backendRunId: 'run-b',
        status: 'running',
      });
    });

    it('does not enable polling for a retry after the previous attempt misses terminal verification', async () => {
      seed(record({ id: 'record-x', backendRunId: 'run-1' }));
      const { adapter, runs } = await create();
      const binding = pushed('record-x');
      stream(adapter, binding);
      let finishVerification!: (value: null) => void;
      rpc['getBoundRunState'].mockReturnValueOnce(
        new Promise((resolve) => (finishVerification = resolve)),
      );
      stream(adapter, binding, { lifecycle: 'failed' });
      runs.reportRun('record-x', runState('failed', binding));

      rpc['startBoundAgents'].mockResolvedValue({
        accepted: { runId: binding.runId },
      });
      await runs.retry('record-x');
      await flush();
      stream(adapter, binding);
      finishVerification(null);
      await flush();
      rpc['getBoundRunState'].mockClear();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS * 2);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
      expect(runs.get('record-x')?.status).toBe('running');
    });

    it('rejects malformed envelopes before adoption or poll suppression', async () => {
      seed(record({ id: 'record-x', backendRunId: 'run-1' }));
      const { adapter, runs } = await create();
      const badEvents = [
        {
          type: 'setup-wizard:generation-stream',
          tabBinding: pushed('wrong-workflow', 'run-1', 'setup-project-prompt'),
        },
        {
          type: 'setup-wizard:enhance-stream',
          tabBinding: pushed('wrong-stream'),
        },
        {
          type: 'setup-wizard:generation-complete',
          tabBinding: pushed(
            'wrong-completion',
            'run-1',
            'setup-project-prompt',
          ),
        },
        {
          type: 'setup-wizard:generation-complete',
          tabBinding: pushed('invalid-terminal'),
          terminalStatus: 'running',
        },
        {
          type: 'setup-wizard:generation-stream',
          tabBinding: pushed('unknown-lifecycle'),
          lifecycle: 'paused',
        },
        {
          type: 'setup-wizard:generation-stream',
          tabBinding: pushed('identity-conflict'),
          runId: 'other-run',
        },
        {
          type: 'setup-wizard:generation-stream',
          tabBinding: pushed('record-x'),
          lifecycle: 'constructor',
        },
      ];
      for (const { type, ...payload } of badEvents)
        adapter.handleMessage({
          type,
          payload: { kind: 'text', content: 'x', timestamp: 1000, ...payload },
        });
      await flush();
      expect(runs.runs().map((item) => item.id)).toEqual(['record-x']);
      expect(rpc['getBoundRunState']).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(1);
    });

    it('requires a known stream kind and its fields before adoption or delivery', async () => {
      seed(record({ id: 'record-x', backendRunId: 'run-1' }));
      const { adapter, runs } = await create();
      const valid = { content: '', timestamp: 1000 };
      const invalid = [
        {},
        { ...valid, kind: 'constructor' },
        { kind: 'thinking', content: 'x' },
        { kind: 'status', timestamp: 1000 },
        { ...valid, kind: 'error', timestamp: NaN },
        { ...valid, kind: 'tool_start', toolName: 'Read' },
        { ...valid, kind: 'tool_input', toolCallId: 'call-1' },
        {
          ...valid,
          kind: 'tool_result',
          toolName: 'Read',
          toolCallId: 'call-1',
          isError: 'false',
        },
      ];
      for (const [type, workflow] of [
        ['setup-wizard:generation-stream', 'setup-agent-generation'],
        ['setup-wizard:enhance-stream', 'setup-project-prompt'],
      ] as const) {
        for (const payload of invalid)
          adapter.handleMessage({
            type,
            payload: {
              tabBinding: pushed('phantom', 'run-1', workflow),
              ...payload,
            },
          });
      }
      for (const payload of invalid)
        adapter.handleMessage({
          type: 'setup-wizard:generation-stream',
          payload: { tabBinding: pushed('record-x'), ...payload },
        });

      expect(runs.runs().map((item) => item.id)).toEqual(['record-x']);
      await jest.advanceTimersByTimeAsync(SETUP_RUN_POLL_INTERVAL_MS);
      expect(rpc['getBoundRunState']).toHaveBeenCalledTimes(1);

      for (const kind of [
        'text',
        'thinking',
        'error',
        'status',
        'tool_start',
        'tool_input',
        'tool_result',
      ]) {
        const payload = {
          ...valid,
          kind,
          toolName: 'Read',
          toolCallId: 'call-1',
          isError: false,
        };
        stream(adapter, pushed(kind), payload);
        expect(runs.get(kind)?.backendRunId).toBe('run-1');
        const enhanceId = `enhance-${kind}`;
        stream(
          adapter,
          pushed(enhanceId, 'run-1', 'setup-project-prompt'),
          payload,
          'setup-wizard:enhance-stream',
        );
        expect(runs.get(enhanceId)?.backendRunId).toBe('run-1');
      }
    });

    it('maps an error push to failed with fixed copy', async () => {
      seed(
        record({
          id: 'setup-p1',
          workflow: 'project-guidance',
          backendRunId: 'run-5',
        }),
      );
      const { adapter, runs } = await create();
      const binding = pushed('setup-p1', 'run-5', 'setup-project-prompt');
      rpc['getBoundRunState'].mockResolvedValue(runState('failed', binding));
      adapter.handleMessage({
        type: 'setup-wizard:error',
        payload: { tabBinding: binding, message: 'raw backend text' },
      });
      await flush();
      expect(runs.get('setup-p1')).toMatchObject({
        status: 'failed',
        error: 'Project guidance did not finish.',
        backendRunId: 'run-5',
      });
    });

    it('treats a stream push with a terminal lifecycle as terminal', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      const { adapter, runs } = await create();
      rpc['getBoundRunState'].mockResolvedValue(
        runState('cancelled', pushed('setup-g1')),
      );
      stream(adapter, pushed('setup-g1'), { lifecycle: 'cancelled' });
      await flush();
      expect(runs.get('setup-g1')?.status).toBe('cancelled');
    });

    it('keeps the record when the lookup names another run or fails', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      const { adapter, runs } = await create();
      rpc['getBoundRunState'].mockResolvedValueOnce(
        runState('completed', pushed('setup-g1', 'run-0')),
      );
      adapter.handleMessage({
        type: 'setup-wizard:generation-complete',
        payload: { tabBinding: pushed('setup-g1') },
      });
      await flush();
      rpc['getBoundRunState'].mockRejectedValueOnce(new Error('offline'));
      adapter.handleMessage({
        type: 'setup-wizard:error',
        payload: { tabBinding: pushed('setup-g1') },
      });
      await flush();
      expect(runs.get('setup-g1')?.status).toBe('running');
    });

    it('ignores a terminal push of an older run on a live record', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-2' }));
      const { adapter, runs } = await create();
      rpc['getBoundRunState'].mockResolvedValue(
        runState('failed', pushed('setup-g1', 'run-1')),
      );
      adapter.handleMessage({
        type: 'setup-wizard:error',
        payload: { tabBinding: pushed('setup-g1', 'run-1') },
      });
      await flush();
      expect(runs.get('setup-g1')).toMatchObject({
        status: 'running',
        backendRunId: 'run-2',
      });
    });

    it('adopts and settles a terminal push for an unknown id', async () => {
      const { adapter, runs } = await create();
      const binding = pushed('owner-9', 'run-6');
      rpc['getBoundRunState'].mockResolvedValue(runState('completed', binding));
      adapter.handleMessage({
        type: 'setup-wizard:generation-complete',
        payload: { tabBinding: binding },
      });
      await flush();
      expect(runs.get('owner-9')).toMatchObject({
        status: 'completed',
        backendRunId: 'run-6',
      });
    });

    it('refreshes the workflow view that shows the run', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      const { adapter } = await create();
      shownBinding.set({
        tabId: 'setup-g1',
        workflow: 'setup-agent-generation',
        workspacePath: WS,
      });
      shownRun.set(runState('running', pushed('setup-g1')));
      shownBound.set(true);
      rpc['getBoundRunState'].mockResolvedValue(
        runState('completed', pushed('setup-g1')),
      );
      adapter.handleMessage({
        type: 'setup-wizard:generation-complete',
        payload: { tabBinding: pushed('setup-g1') },
      });
      await flush();
      expect(workflow.refresh).toHaveBeenCalledTimes(1);
      expect(workflow.bind).not.toHaveBeenCalled();
    });

    it('does not rebind a bound workflow view to another run', async () => {
      seed(record({ id: 'setup-g1', status: 'needs-input', step: 'preview' }));
      const { adapter } = await create();
      shownBinding.set({
        tabId: 'setup-g1',
        workflow: 'setup-agent-generation',
        workspacePath: WS,
      });
      shownRun.set(runState('running', pushed('setup-g1', 'run-0')));
      shownBound.set(true);
      stream(adapter, pushed('setup-g1', 'run-2'));
      expect(workflow.bind).not.toHaveBeenCalled();
    });
  });
});
