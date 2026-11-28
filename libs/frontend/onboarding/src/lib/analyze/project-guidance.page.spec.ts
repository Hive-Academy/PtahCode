import { assertNotInReactiveContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { ExecutionTreeBuilderService } from '@ptah-extension/chat-streaming';
import type {
  EnhancedGenerationStreamPayload,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import {
  GenerationHandoffStore,
  GenerationWorkflowStore,
  GuidanceGenerationStore,
  SetupRunStore,
  SetupWizardStateService,
  WizardRpcService,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';
import { GenerationStepStore } from './generation-step.store';
import { ProjectGuidancePage } from './project-guidance.page';

const binding = {
  tabId: 'setup-guidance',
  workspacePath: '/ws',
  workflow: 'setup-project-prompt' as const,
};
const completed: SetupGenerationRunState = {
  binding: { ...binding, runId: 'guidance-run' },
  status: 'completed',
  committedState: 'committed',
  source: { kind: 'workspace-discovery', reason: 'missing' },
  effectiveProvider: 'unknown',
  effectiveModel: 'unknown',
};
const guidanceRecord: SetupRunRecord = {
  id: binding.tabId,
  workflow: 'project-guidance',
  workspacePath: '/ws',
  status: 'running',
  step: 'generating',
  backendRunId: null,
  analysisRunId: null,
  parentId: 'setup-agent',
  unseen: false,
  createdAt: 0,
  updatedAt: 0,
};
const agentRecord: SetupRunRecord = {
  ...guidanceRecord,
  id: 'setup-agent',
  workflow: 'agent-generation',
  status: 'completed',
  parentId: null,
};
const counts = {
  sections: [
    { name: 'Project Context', wordCount: 10, generated: true },
    { name: 'Framework Guidelines', wordCount: 20, generated: true },
    { name: 'Coding Standards', wordCount: 0, generated: false },
    { name: 'Architecture Notes', wordCount: 5, generated: true },
  ],
};

describe('ProjectGuidancePage', () => {
  const params: Record<string, string> = {
    tab: 'setup-guidance',
    run: 'guidance-run',
    gen: 'setup-agent',
  };
  const queryParamMap = new BehaviorSubject(convertToParamMap(params));
  const state = signal<
    | 'idle'
    | 'starting'
    | 'running'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timed-out'
  >('idle');
  const run = signal<SetupGenerationRunState | null>(null);
  const mismatch = signal(false),
    exhausted = signal(false);
  const rejection = signal<{ reason: 'blocked' } | null>(null);
  const workflow = {
    binding: signal<SetupGenerationTabBinding | null>(null),
    state,
    run,
    runMismatch: mismatch,
    lookupExhausted: exhausted,
    rejection,
    startError: signal<string | null>(null),
    isBound: () => false,
    bind: jest.fn(),
    unbind: jest.fn(),
    refresh: jest.fn(),
    stop: jest.fn(),
    startGuidance: jest.fn(),
    regenerateGuidance: jest.fn(),
  };
  const guidance = {
    run: signal<SetupGenerationRunState | null>(null),
    result: signal<{
      generatedAt: string | null;
      enabled: boolean;
      cacheValid: boolean;
    } | null>(null),
    content: signal<string | null>(null),
    bind: jest.fn(),
    unbind: jest.fn(),
    actionFailed: signal(false),
    adopt: jest.fn(),
    refresh: jest.fn(),
    refreshCommitted: jest.fn(),
    setEnabled: jest.fn(),
    loadContent: jest.fn(),
    download: jest.fn(),
  };
  const handoff = {
    started: signal<{
      tabId: string;
      workspacePath: string;
      workflow: 'setup-project-prompt';
      runId: string;
    } | null>(null),
    pending: signal<{
      agentRunId: string;
      workspacePath: string;
      guidanceStartDeadline: number;
    } | null>(null),
    inFlight: signal(false),
    outcome: signal('idle'),
    startNow: jest.fn(),
  };
  const step = { bindGuidance: jest.fn(), guidanceSections: jest.fn() };
  const rpc = {
    getBoundRunState: jest.fn(),
    getEnhancedPromptsStatus: jest.fn(),
  };
  const router = { navigate: jest.fn() };
  const records = signal<SetupRunRecord[]>([]);
  const workspace = signal<string | null>('/ws');
  const runs = {
    get: jest.fn(
      (id: string) => records().find((record) => record.id === id) ?? null,
    ),
    runs: records,
    workspacePath: workspace,
    attach: jest.fn(),
    release: jest.fn(),
    start: jest.fn(),
    bindingFor: (record: SetupRunRecord) => ({
      ...binding,
      tabId: record.id,
      workspacePath: record.workspacePath,
    }),
  };
  const enhanceStream = signal<EnhancedGenerationStreamPayload[]>([]);
  let fixture: ReturnType<typeof TestBed.createComponent<ProjectGuidancePage>>;

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.set('/ws');
    params['tab'] = 'setup-guidance';
    params['run'] = 'guidance-run';
    params['gen'] = 'setup-agent';
    delete params['analysis'];
    records.set([guidanceRecord, agentRecord]);
    enhanceStream.set([]);
    workflow.binding.set(binding);
    runs.start.mockImplementation(() => {
      records.update((current) => [...current, guidanceRecord]);
      return guidanceRecord;
    });
    state.set('idle');
    run.set(null);
    mismatch.set(false);
    exhausted.set(false);
    rejection.set(null);
    workflow.startError.set(null);
    guidance.run.set(null);
    guidance.result.set(null);
    guidance.content.set(null);
    handoff.started.set(null);
    handoff.pending.set(null);
    handoff.inFlight.set(false);
    handoff.outcome.set('idle');
    workflow.refresh.mockResolvedValue(undefined);
    workflow.startGuidance.mockResolvedValue(undefined);
    workflow.regenerateGuidance.mockResolvedValue(undefined);
    guidance.refresh.mockResolvedValue(undefined);
    guidance.refreshCommitted.mockResolvedValue(undefined);
    guidance.adopt.mockImplementation((value) => guidance.run.set(value));
    step.bindGuidance.mockReturnValue('bound');
    step.guidanceSections.mockReturnValue(null);
    rpc.getBoundRunState.mockResolvedValue(null);
    rpc.getEnhancedPromptsStatus.mockResolvedValue({
      enabled: true,
      hasGeneratedPrompt: false,
      generatedAt: null,
      detectedStack: null,
      cacheValid: false,
    });
    router.navigate.mockResolvedValue(true);
    handoff.startNow.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap,
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(params);
              },
              get queryParams() {
                return { ...params };
              },
              data: {},
            },
          },
        },
        { provide: Router, useValue: router },
        { provide: SetupRunStore, useValue: runs },
        { provide: SetupWizardStateService, useValue: { enhanceStream } },
        {
          provide: ExecutionTreeBuilderService,
          useValue: { buildTree: jest.fn(() => []) },
        },
        { provide: GenerationWorkflowStore, useValue: workflow },
        { provide: GuidanceGenerationStore, useValue: guidance },
        { provide: GenerationHandoffStore, useValue: handoff },
        { provide: GenerationStepStore, useValue: step },
        { provide: WizardRpcService, useValue: rpc },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  async function render() {
    queryParamMap.next(convertToParamMap(params));
    fixture = TestBed.createComponent(ProjectGuidancePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('releases and unbinds guidance when the workspace changes while the route remains open', async () => {
    const element = await render();
    expect(runs.attach).toHaveBeenCalledWith(guidanceRecord.id);
    workflow.unbind.mockClear();
    guidance.unbind.mockClear();
    workspace.set('/other');
    await fixture.componentInstance['retry']();
    expect(workflow.regenerateGuidance).not.toHaveBeenCalled();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(runs.release).toHaveBeenCalledWith(guidanceRecord.id);
    expect(workflow.unbind).toHaveBeenCalled();
    expect(guidance.unbind).toHaveBeenCalled();
    expect(fixture.componentInstance['recovery']()).toBe('workspace-mismatch');
    expect(
      element.querySelector('[data-testid="guidance-recovery-panel"]'),
    ).not.toBeNull();
  });

  it('ignores stale Stop, lookup, refresh and open actions before workspace effects run', async () => {
    state.set('starting');
    const element = await render();
    const stop = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Stop',
    );
    expect(stop).toBeDefined();
    jest.clearAllMocks();
    workspace.set('/other');
    stop?.click();
    expect(workflow.stop).not.toHaveBeenCalled();
    await Promise.all([
      fixture.componentInstance['retryLookup'](),
      fixture.componentInstance['refresh'](),
      fixture.componentInstance['openLatest'](),
    ]);
    expect(step.bindGuidance).not.toHaveBeenCalled();
    expect(workflow.bind).not.toHaveBeenCalled();
    expect(workflow.refresh).not.toHaveBeenCalled();
    expect(guidance.refresh).not.toHaveBeenCalled();
    expect(rpc.getEnhancedPromptsStatus).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('links a guidance run started after Skills to the completed skill review', async () => {
    delete params['tab'];
    delete params['run'];
    delete params['gen'];
    params['analysis'] = 'analysis-from-review';
    const review: SetupRunRecord = {
      ...agentRecord,
      id: 'setup-review',
      workflow: 'skill-review',
      status: 'completed',
      step: 'selecting',
      analysisRunId: 'analysis-from-review',
    };
    records.set([review]);
    await render();
    expect(runs.start).not.toHaveBeenCalled();
    await fixture.componentInstance['start']();
    expect(runs.start).toHaveBeenCalledWith('project-guidance', '/ws', {
      parentId: review.id,
      analysisRunId: review.analysisRunId,
      origin: 'analysis-result-continue',
    });
  });

  it('opens an existing Setup run when no record id is supplied', async () => {
    delete params['tab'];
    await render();
    expect(runs.attach).toHaveBeenCalledWith(guidanceRecord.id);
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, 'guidance-run');
    expect(runs.start).not.toHaveBeenCalled();
  });

  it('creates a Setup record only when Start guidance is selected', async () => {
    delete params['tab'];
    delete params['run'];
    records.set([agentRecord]);
    const element = await render();
    expect(runs.start).not.toHaveBeenCalled();
    element
      .querySelector<HTMLButtonElement>('[data-testid="guidance-start"]')
      ?.click();
    await fixture.whenStable();
    expect(runs.start).toHaveBeenCalledWith(
      'project-guidance',
      '/ws',
      expect.objectContaining({ parentId: agentRecord.id }),
    );
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, undefined);
    expect(workflow.startGuidance).toHaveBeenCalledTimes(1);
  });

  it('rebinds when on-page navigation targets another Setup record', async () => {
    const other = { ...guidanceRecord, id: 'setup-other' };
    records.update((current) => [...current, other]);
    await render();
    params['tab'] = other.id;
    queryParamMap.next(convertToParamMap(params));
    await fixture.whenStable();
    expect(runs.release).toHaveBeenCalledWith(guidanceRecord.id);
    expect(runs.attach).toHaveBeenCalledWith(other.id);
    expect(step.bindGuidance).toHaveBeenLastCalledWith(
      { ...binding, tabId: other.id },
      'guidance-run',
    );
  });

  it('rebinds URL run before a different handoff run', async () => {
    handoff.started.set({ ...binding, runId: 'other-run' });
    await render();
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, 'guidance-run');
    expect(rpc.getBoundRunState).not.toHaveBeenCalled();
  });
  it('renders live guidance output scoped to the selected Setup record and backend attempt', async () => {
    const backendBinding = {
      ...completed.binding,
      workspacePath: 'C:\\Work\\Repo',
    };
    workspace.set(backendBinding.workspacePath);
    records.set([{ ...guidanceRecord, workspacePath: 'c:/work/repo' }]);
    state.set('running');
    run.set({ ...completed, binding: backendBinding, status: 'running' });
    const element = await render();
    const log = element.querySelector('[role="log"]');
    const panel = element.querySelector('ptah-run-panel');
    expect(log?.closest('[runlog]')).not.toBeNull();
    expect(
      log &&
        panel &&
        log.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    enhanceStream.set([
      {
        kind: 'text',
        content: 'Current guidance',
        timestamp: 1,
        tabBinding: backendBinding,
      },
      {
        kind: 'text',
        content: 'Older attempt',
        timestamp: 2,
        tabBinding: { ...completed.binding, runId: 'old' },
      },
      {
        kind: 'text',
        content: 'Unrelated workspace',
        timestamp: 3,
        tabBinding: { ...completed.binding, workspacePath: '/other' },
      },
      {
        kind: 'text',
        content: 'Other record',
        timestamp: 4,
        tabBinding: { ...completed.binding, tabId: 'other' },
      },
    ]);
    fixture.detectChanges();
    expect(log?.textContent).toContain('Current guidance');
    expect(log?.textContent).not.toMatch(
      /Older attempt|Unrelated workspace|Other record/,
    );
    mismatch.set(true);
    fixture.detectChanges();
    expect(element.querySelector('[role="log"]')).toBeNull();
  });

  it('rebinds a matching handoff-started run without a second runWizard', async () => {
    delete params['run'];
    handoff.started.set({ ...binding, runId: 'handoff-run' });
    await render();
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, 'handoff-run');
    expect(workflow.startGuidance).not.toHaveBeenCalled();
    expect(handoff.startNow).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ run: 'handoff-run' }),
        replaceUrl: true,
      }),
    );
  });
  it('uses the authoritative run after a handoff for another tab', async () => {
    delete params['run'];
    handoff.started.set({
      ...binding,
      tabId: 'foreign-tab',
      runId: 'foreign-run',
    });
    rpc.getBoundRunState.mockResolvedValue(completed);
    await render();
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, 'guidance-run');
  });
  it('auto-starts only a pending handoff with no run', async () => {
    delete params['run'];
    handoff.pending.set({
      agentRunId: 'setup-agent',
      workspacePath: '/ws',
      guidanceStartDeadline: Date.now() + 5000,
    });
    await render();
    expect(handoff.startNow).toHaveBeenCalledTimes(1);
  });
  it('does not auto-start when the pending id does not identify the parent Setup record', async () => {
    delete params['run'];
    handoff.pending.set({
      agentRunId: 'other-agent',
      workspacePath: '/ws',
      guidanceStartDeadline: Date.now() + 5000,
    });
    await render();
    expect(handoff.startNow).not.toHaveBeenCalled();
  });

  it('offers Retry for an interrupted Setup record whose backend attempt is gone', async () => {
    records.set([
      {
        ...guidanceRecord,
        status: 'interrupted',
        backendRunId: 'guidance-run',
      },
      agentRecord,
    ]);
    const element = await render();
    const panel = element.querySelector('ptah-run-panel');
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, undefined);
    expect(panel?.textContent).toContain('Guidance interrupted');
    expect(panel?.textContent).not.toMatch(/Resume|Start guidance/);
    Array.from(panel?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.trim() === 'Retry')
      ?.click();
    expect(workflow.regenerateGuidance).toHaveBeenCalledTimes(1);
  });

  it('does not auto-start after manual recovery', async () => {
    delete params['run'];
    handoff.pending.set({
      agentRunId: 'setup-agent',
      workspacePath: '/ws',
      guidanceStartDeadline: Date.now() + 5000,
    });
    handoff.outcome.set('manual-recovery');
    await render();
    expect(handoff.startNow).not.toHaveBeenCalled();
  });
  it('does not double-start while manualContinue has cleared started', async () => {
    delete params['run'];
    handoff.inFlight.set(true);
    const element = await render();
    expect(element.querySelector('[data-testid="guidance-start"]')).toBeNull();
    await (
      fixture.componentInstance as unknown as { start(): Promise<void> }
    ).start();
    expect(handoff.startNow).not.toHaveBeenCalled();
    expect(workflow.startGuidance).not.toHaveBeenCalled();
  });
  it('shows rejected authoritative lookup as an error and retries binding', async () => {
    delete params['run'];
    rpc.getBoundRunState
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null);
    const element = await render();
    expect(
      element.querySelector('[data-testid="guidance-lookup-error"]'),
    ).not.toBeNull();
    expect(element.querySelector('[data-testid="guidance-start"]')).toBeNull();
    element
      .querySelector<HTMLButtonElement>(
        '[data-testid="guidance-lookup-error"] button',
      )
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rpc.getBoundRunState).toHaveBeenCalledTimes(2);
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, undefined);
  });
  it('adopts a late matching handoff run without starting again', async () => {
    delete params['run'];
    await render();
    handoff.started.set({ ...binding, runId: 'late-run' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, 'late-run');
    expect(workflow.startGuidance).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: expect.objectContaining({ run: 'late-run' }),
        replaceUrl: true,
      }),
    );
  });
  it('attaches a late handoff when the chained route has no guidance record yet', async () => {
    delete params['tab'];
    delete params['run'];
    records.set([agentRecord]);
    handoff.inFlight.set(true);
    await render();
    expect(step.bindGuidance).not.toHaveBeenCalled();
    records.set([guidanceRecord, agentRecord]);
    handoff.started.set({ ...binding, runId: 'late-run' });
    handoff.inFlight.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, 'late-run');
    expect(runs.attach).toHaveBeenCalledWith(guidanceRecord.id);
    expect(workflow.startGuidance).not.toHaveBeenCalled();
  });

  it('attaches a late handoff outside the effect that observes the Setup index', async () => {
    delete params['tab'];
    delete params['run'];
    records.set([agentRecord]);
    handoff.inFlight.set(true);
    await render();

    let reactiveAttachError: unknown;
    runs.attach.mockImplementationOnce((id: string) => {
      try {
        assertNotInReactiveContext(runs.attach);
      } catch (error: unknown) {
        reactiveAttachError = error;
      }
      records.update((current) =>
        current.map((record) =>
          record.id === id ? { ...record, unseen: false } : record,
        ),
      );
    });
    handoff.started.set({ ...binding, runId: 'late-run' });
    records.set([{ ...guidanceRecord, unseen: true }, agentRecord]);
    handoff.inFlight.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(runs.attach).toHaveBeenCalledTimes(1);
    expect(reactiveAttachError).toBeUndefined();
    expect(
      records().find((record) => record.id === guidanceRecord.id)?.unseen,
    ).toBe(false);
    expect(step.bindGuidance).toHaveBeenCalledWith(binding, 'late-run');
  });

  it('ignores a late handoff run for another tab', async () => {
    delete params['run'];
    await render();
    step.bindGuidance.mockClear();
    handoff.started.set({
      ...binding,
      tabId: 'another-tab',
      runId: 'foreign-run',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(step.bindGuidance).not.toHaveBeenCalled();
    expect(workflow.startGuidance).not.toHaveBeenCalled();
  });
  it('shows mismatched run recovery', async () => {
    mismatch.set(true);
    const element = await render();
    expect(
      element.querySelector('[data-testid="guidance-recovery-panel"]')
        ?.textContent,
    ).toContain('no longer current');
  });
  it('shows four confirmed section rows and no token or fallback copy', async () => {
    state.set('completed');
    run.set(completed);
    guidance.run.set(completed);
    guidance.result.set({
      generatedAt: '2026-10-30T00:00:00.000Z',
      enabled: true,
      cacheValid: true,
    });
    step.guidanceSections.mockReturnValue(counts);
    const element = await render();
    const card = element.querySelector('[data-testid="guidance-summary-card"]');
    expect(
      card?.querySelectorAll('[data-testid="guidance-summary-row"]'),
    ).toHaveLength(4);
    expect(card?.textContent).toContain('3 of 4 sections generated');
    expect(card?.textContent).not.toMatch(/token|fallback|Quality Guidance/i);
  });
  it.each(['no capture', 'disabled', 'different run', 'active run'] as const)(
    'hides counts for %s',
    async (caseName) => {
      state.set('completed');
      run.set(completed);
      guidance.run.set(completed);
      guidance.result.set({
        generatedAt: '2026-10-30T00:00:00.000Z',
        enabled: caseName !== 'disabled',
        cacheValid: true,
      });
      step.guidanceSections.mockReturnValue(
        caseName === 'no capture' ? null : counts,
      );
      if (caseName === 'different run') {
        run.set({ ...completed, binding: { ...binding, runId: 'new-run' } });
        step.guidanceSections.mockReturnValue(null);
      }
      if (caseName === 'active run') state.set('running');
      const element = await render();
      expect(
        element.querySelector('[data-testid="guidance-summary-card"]'),
      ).toBeNull();
    },
  );
  it('shows lookup exhaustion with Retry', async () => {
    exhausted.set(true);
    const element = await render();
    (
      element.querySelector(
        '[data-testid="guidance-lookup-exhausted"] button',
      ) as HTMLButtonElement
    ).click();
    expect(workflow.refresh).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['failed', 'Guidance failed. Retry the run or start over.'],
    ['timed-out', 'The request timed out. Try again.'],
    [
      'cancelling',
      'Stopping guidance. Check its status before starting another run.',
    ],
    ['cancelled', 'Guidance stopped. You can try again.'],
  ] as const)('shows state-specific copy for %s', async (status, copy) => {
    state.set(status);
    const element = await render();
    expect(element.querySelector('ptah-run-panel')?.textContent).toContain(
      copy,
    );
    expect(element.querySelector('ptah-run-panel')?.textContent).not.toContain(
      'The run continues in its bound session.',
    );
  });
  it('shows the running title without the old session subtitle', async () => {
    state.set('running');
    const element = await render();
    const panel = element.querySelector('ptah-run-panel');

    expect(panel?.textContent).toContain('Creating guidance');
    expect(panel?.textContent).not.toContain(
      'The run continues in its bound session.',
    );
  });
  it('sanitizes a guidance failure reason', async () => {
    state.set('failed');
    workflow.startError.set('EACCES /private/key');
    const element = await render();
    expect(element.querySelector('ptah-run-panel')?.textContent).toContain(
      'permission denied',
    );
    expect(element.textContent).not.toContain('/private/key');
  });
  it('keeps the saved guidance surface separate from the owner banner', async () => {
    rejection.set({ reason: 'blocked' });
    const element = await render();
    expect(
      element
        .querySelector('[data-testid="guidance-saved-card"]')
        ?.getAttribute('data-glass-surface'),
    ).toBe('content');
    expect(
      element.querySelector('[data-testid="guidance-owner-conflict"]')
        ?.textContent,
    ).toContain('Check again');
  });
  it('keeps Stop, owner conflict and detected stack available on reload', async () => {
    state.set('starting');
    run.set({ ...completed, status: 'starting' });
    rejection.set({ reason: 'blocked' });
    rpc.getEnhancedPromptsStatus.mockResolvedValue({
      enabled: true,
      hasGeneratedPrompt: false,
      generatedAt: null,
      detectedStack: {
        projectType: 'Angular',
        languages: ['TypeScript'],
        frameworks: ['Angular'],
        buildTools: [],
        testingFrameworks: [],
        additionalTools: [],
        configFiles: [],
      },
      cacheValid: false,
    });
    const element = await render();
    expect(workflow.refresh).toHaveBeenCalled();
    expect(
      element.querySelector('[data-testid="guidance-owner-conflict"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="guidance-detected-stack"]')
        ?.textContent,
    ).toContain('Angular');
    const stop = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Stop',
    );
    stop?.click();
    expect(workflow.stop).toHaveBeenCalled();
  });
  it('continues to Done after completion', async () => {
    state.set('completed');
    run.set(completed);
    const element = await render();
    const continueButton = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Continue',
    );
    continueButton?.click();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/onboarding', 'analyze', 'done'],
      expect.anything(),
    );
  });
  it('wires saved guidance enable, view, download and unchanged notice', async () => {
    state.set('completed');
    run.set({ ...completed, committedState: 'unchanged' });
    guidance.result.set({
      generatedAt: '2026-10-30T00:00:00.000Z',
      enabled: true,
      cacheValid: true,
    });
    const element = await render();
    expect(
      element.querySelector('[data-testid="guidance-unchanged"]'),
    ).not.toBeNull();
    element
      .querySelector<HTMLInputElement>(
        'input[aria-label="Enable project guidance"]',
      )
      ?.click();
    expect(guidance.setEnabled).toHaveBeenCalledWith(false);
    for (const [label, action] of [
      ['View content', guidance.loadContent],
      ['Download', guidance.download],
    ] as const) {
      Array.from(element.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === label)
        ?.click();
      expect(action).toHaveBeenCalled();
    }
  });
  it('skips to Done and retries failure', async () => {
    state.set('failed');
    const element = await render();
    (
      element.querySelector(
        '[data-testid="guidance-skip"]',
      ) as HTMLButtonElement
    ).click();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/onboarding', 'analyze', 'done'],
      expect.anything(),
    );
    const retry = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Retry'),
    );
    retry?.click();
    expect(workflow.regenerateGuidance).toHaveBeenCalled();
  });
});
