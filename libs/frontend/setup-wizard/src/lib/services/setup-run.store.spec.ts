import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import * as chatState from '@ptah-extension/chat-state';
import { VSCodeService } from '@ptah-extension/core';
import type {
  SetupGenerationRunLifecycle,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';

import {
  MAX_SETUP_RUNS_PER_WORKSPACE,
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

function runState(
  status: SetupGenerationRunLifecycle,
  extra: Partial<SetupGenerationRunState> = {},
): SetupGenerationRunState {
  return {
    status,
    binding: { runId: 'run-1' },
    source: { kind: 'none' },
    effectiveProvider: 'p',
    effectiveModel: 'm',
    ...extra,
  } as unknown as SetupGenerationRunState;
}

function binding(
  tabId: string,
  workflow: SetupGenerationTabBinding['workflow'] = 'setup-agent-generation',
  workspacePath = WS,
): SetupGenerationTabBinding {
  return { tabId, workflow, workspacePath };
}

describe('SetupRunStore', () => {
  let workspace: ReturnType<typeof signal<string>>;
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
    workspace = signal(WS);
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

    TestBed.configureTestingModule({
      providers: [
        { provide: WizardRpcService, useValue: rpc },
        { provide: WizardAnalysisRunner, useValue: runner },
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
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    localStorage.clear();
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
      analysis: { manifest: { runId: 'an-1', lifecycle } },
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

    it('maps the runner finishing a run started here', async () => {
      const store = await create();
      const rec = store.start('analysis', WS);
      (runner['isRunningForWorkspace'] as jest.Mock).mockReturnValue(true);
      runnerRunning.set(true);
      await flush();
      expect(store.get(rec!.id)?.status).toBe('running');

      (runner['isRunningForWorkspace'] as jest.Mock).mockReturnValue(false);
      (runner['isResultForWorkspace'] as jest.Mock).mockReturnValue(true);
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

  describe('adoption', () => {
    it('adopts a running generation checkpoint from get-resumable-run', async () => {
      rpc['getBoundRunState'].mockResolvedValue(
        runState('running', { binding: { runId: 'gen-1' } } as never),
      );
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

    it('adopts legacy chat tabs under their tab id', async () => {
      legacyTabs.mockReturnValue([
        binding('legacy-tab-1', 'setup-project-prompt'),
      ]);
      const store = await create();
      const adopted = store.get('legacy-tab-1');
      expect(adopted?.workflow).toBe('project-guidance');
      expect(adopted?.workspacePath).toBe(WS);
    });

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
      rpc['getBoundRunState'].mockResolvedValue(runState('running'));
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
      rpc['getBoundRunState']
        .mockClear()
        .mockResolvedValue(runState('completed'));
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
      store.report('setup-g1', { step: 'generating' });
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
        workspacePath: WS,
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
      rpc['getBoundRunState'].mockResolvedValue(runState('running'));
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
      rpc['getBoundRunState'].mockResolvedValue(runState('running'));
      rpc['cancelBoundRun'].mockResolvedValue(false);
      const store = await create();
      expect(await store.cancel('setup-g1')).toBe(false);
      expect(store.get('setup-g1')?.status).toBe('running');
      expect(store.isCancelling('setup-g1')).toBe(false);
    });

    it('stays running when the cancel request fails', async () => {
      seed(record({ id: 'setup-g1', backendRunId: 'run-1' }));
      rpc['getBoundRunState'].mockResolvedValue(runState('running'));
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

    it('cancels an analysis once the backend is no longer active', async () => {
      seed(record({ id: 'setup-a1', workflow: 'analysis', step: 'analyzing' }));
      const store = await create();
      rpc['getResumableRun'].mockResolvedValue({
        analysis: null,
        generation: null,
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
      rpc['getBoundRunState'].mockResolvedValue(runState('running'));
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
        }),
      );
      const store = await create();
      const next = store.rerun('setup-a1');
      expect(next?.id).not.toBe('setup-a1');
      expect(next?.parentId).toBe('setup-parent');
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
      rpc['getBoundRunState'].mockResolvedValue(runState('running'));
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
});
