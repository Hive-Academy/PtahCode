import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { ExecutionTreeBuilderService } from '@ptah-extension/chat-streaming';
import type {
  GenerationStreamPayload,
  SetupGenerationRunState,
} from '@ptah-extension/shared';
import {
  SetupRunStore,
  SetupWizardStateService,
  WizardRpcService,
  stepTarget,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';
import { BehaviorSubject } from 'rxjs';
import { AgentGenerationRunPage } from './agent-generation-run.page';

const binding = {
  tabId: 'setup-agent-1',
  workspacePath: '/workspace',
  workflow: 'setup-agent-generation',
  runId: 'generation-1',
} as const;

const initialRecord: SetupRunRecord = {
  id: binding.tabId,
  workspacePath: binding.workspacePath,
  workflow: 'agent-generation',
  status: 'running',
  step: 'generating',
  backendRunId: binding.runId,
  analysisRunId: 'analysis-1',
  parentId: null,
  unseen: true,
  createdAt: 1,
  updatedAt: 2,
};

const failedRun: SetupGenerationRunState = {
  binding,
  status: 'failed',
  source: {
    kind: 'verified-analysis',
    analysisRunId: 'analysis-1',
    analysisDir: '/workspace/.ptah/analysis',
  },
  effectiveProvider: 'codex',
  effectiveModel: 'model',
  result: {
    status: 'failed',
    success: false,
    source: {
      kind: 'verified-analysis',
      analysisRunId: 'analysis-1',
      analysisDir: '/workspace/.ptah/analysis',
    },
    effectiveProvider: 'codex',
    effectiveModel: 'model',
    agentOutcomes: [
      {
        agentId: 'planner',
        rejectedSections: 0,
        tailoredSections: 0,
        status: 'failed',
        error: 'permission denied',
      },
      {
        agentId: 'reviewer',
        rejectedSections: 0,
        tailoredSections: 0,
        status: 'rejected',
      },
      {
        agentId: 'developer',
        rejectedSections: 0,
        tailoredSections: 0,
        status: 'written',
      },
    ],
    counts: {
      total: 3,
      written: 1,
      unchanged: 0,
      failed: 1,
      skipped: 0,
      rejected: 1,
    },
  },
};

describe('AgentGenerationRunPage', () => {
  const record = signal<SetupRunRecord | null>(null);
  const generationStream = signal<GenerationStreamPayload[]>([]);
  const params = new BehaviorSubject(convertToParamMap({ tab: binding.tabId }));
  const runs = {
    get: jest.fn((id: string) => (id === record()?.id ? record() : null)),
    workspacePath: signal(binding.workspacePath),
    attach: jest.fn(),
    release: jest.fn(),
    bindingFor: jest.fn(() => ({
      tabId: binding.tabId,
      workspacePath: binding.workspacePath,
      workflow: binding.workflow,
    })),
    isCancelling: jest.fn(() => false),
    cancel: jest.fn(async () => true),
    retry: jest.fn(async () => record()),
    targetOf: jest.fn((current: SetupRunRecord, destination?: 'entry') => {
      const target = stepTarget(current);
      return destination === 'entry'
        ? { ...target, subPath: ['analyze', 'skills'] }
        : target;
    }),
    reporterFor: () => jest.fn(),
    report: jest.fn((_id: string, update: Partial<SetupRunRecord>) =>
      record.update((current) => current && { ...current, ...update }),
    ),
    reportRun: jest.fn((_id: string, state: SetupGenerationRunState) => {
      if (state.status === 'completed') {
        record.update(
          (current) => current && { ...current, status: 'completed' },
        );
      }
    }),
  };
  const rpc = {
    getBoundRunState: jest.fn(),
    retryGenerationItem: jest.fn(),
  };
  const buildTree = jest.fn(() => []);

  beforeEach(() => {
    jest.clearAllMocks();
    record.set(initialRecord);
    runs.workspacePath.set(binding.workspacePath);
    generationStream.set([]);
    params.next(convertToParamMap({ tab: binding.tabId }));
    rpc.getBoundRunState.mockResolvedValue(null);
    rpc.retryGenerationItem.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: params,
            snapshot: { queryParamMap: params.value },
          },
        },
        { provide: SetupRunStore, useValue: runs },
        { provide: SetupWizardStateService, useValue: { generationStream } },
        { provide: WizardRpcService, useValue: rpc },
        { provide: ExecutionTreeBuilderService, useValue: { buildTree } },
      ],
    });
    jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  async function render() {
    const fixture = TestBed.createComponent(AgentGenerationRunPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  function click(page: HTMLElement, label: string): void {
    const button = Array.from(page.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button).toBeDefined();
    button?.click();
  }

  it('attaches the view, renders live output for its own attempt, and lets the user stop it', async () => {
    const { fixture, page } = await render();
    expect(runs.attach).toHaveBeenCalledWith(binding.tabId);
    expect(page.querySelector('[role="status"]')?.textContent).toContain(
      'Generating agents',
    );
    generationStream.set([
      {
        kind: 'text',
        content: 'current output',
        timestamp: 1,
        tabBinding: binding,
      },
      {
        kind: 'text',
        content: 'prior attempt',
        timestamp: 2,
        tabBinding: { ...binding, runId: 'older' },
      },
      {
        kind: 'text',
        content: 'foreign output',
        timestamp: 3,
        tabBinding: { ...binding, workspacePath: '/other' },
      },
    ]);
    fixture.detectChanges();
    const log = page.querySelector('[role="log"]');
    expect(log?.textContent).toContain('current output');
    expect(log?.textContent).not.toContain('prior attempt');
    expect(log?.textContent).not.toContain('foreign output');

    click(page, 'Stop generation');
    expect(runs.cancel).toHaveBeenCalledWith(binding.tabId);
    fixture.destroy();
    expect(runs.release).toHaveBeenCalledWith(binding.tabId);
  });

  it('shows failed counts and retries failed items serially on the checkpoint', async () => {
    record.set({ ...initialRecord, status: 'failed' });
    rpc.getBoundRunState.mockResolvedValue(failedRun);
    const { fixture, page } = await render();
    expect(page.textContent).toContain('1 written');
    expect(page.textContent).toContain('1 failed');
    expect(page.textContent).toContain('planner:');
    let settleFirst: () => void = () => undefined;
    rpc.retryGenerationItem.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        settleFirst = resolve;
      }),
    );
    const resumedRun: SetupGenerationRunState = {
      ...failedRun,
      status: 'completed',
      result: undefined,
    };
    rpc.getBoundRunState.mockResolvedValue(resumedRun);

    click(page, 'Retry failed items');
    expect(rpc.retryGenerationItem).toHaveBeenCalledTimes(1);
    settleFirst();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(rpc.retryGenerationItem.mock.calls).toEqual([
      ['planner', binding],
      ['reviewer', binding],
    ]);
    expect(runs.reportRun).toHaveBeenCalledWith(binding.tabId, resumedRun);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['/onboarding', 'analyze', 'done'],
      {
        queryParams: { tab: binding.tabId, analysis: 'analysis-1' },
        replaceUrl: true,
      },
    );
  });

  it('resumes an interrupted checkpoint on the existing record', async () => {
    record.set({ ...initialRecord, status: 'interrupted' });
    const { fixture, page } = await render();
    click(page, 'Resume');
    await fixture.whenStable();
    expect(runs.retry).toHaveBeenCalledWith(binding.tabId);
  });

  it('links the preview-required state to the run entry with its analysis identity', async () => {
    record.set({
      ...initialRecord,
      status: 'needs-input',
      step: 'preview',
      backendRunId: null,
    });
    const { page } = await render();
    expect(page.querySelector('h2')?.textContent).toContain('Preview required');
    expect(runs.targetOf).toHaveBeenCalledWith(record(), 'entry');
    expect(page.querySelector('a')?.getAttribute('href')).toBe(
      '/onboarding/analyze/skills?tab=setup-agent-1&analysis=analysis-1',
    );
    expect(rpc.getBoundRunState).not.toHaveBeenCalled();
  });

  it('navigates to the summary when a live record completes', async () => {
    const { fixture } = await render();
    record.set({ ...initialRecord, status: 'completed' });
    fixture.detectChanges();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['/onboarding', 'analyze', 'done'],
      {
        queryParams: { tab: binding.tabId, analysis: 'analysis-1' },
        replaceUrl: true,
      },
    );
  });

  it('keeps another workspace’s run out of the view', async () => {
    runs.workspacePath.set('/other');
    const { page } = await render();
    expect(page.querySelector('[role="status"]')?.textContent).toContain(
      'unavailable',
    );
    expect(runs.attach).not.toHaveBeenCalled();
  });
});
