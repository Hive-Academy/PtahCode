import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AppStateManager,
  ClaudeRpcService,
  VSCodeService,
} from '@ptah-extension/core';
import {
  GenerationHandoffStore,
  GenerationWorkflowStore,
  SetupRunStore,
  WizardRpcService,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';
import { BehaviorSubject } from 'rxjs';
import { OnboardingFlagService } from '../first-run/onboarding-flag.service';
import { AnalyzeDonePage } from './analyze-done.page';

describe('AnalyzeDonePage', () => {
  const call = jest.fn();
  const navigate = jest.fn();
  const params = new BehaviorSubject(convertToParamMap({ analysis: 'saved' }));
  const agent: SetupRunRecord = {
    id: 'agent-1',
    workspacePath: '/ws',
    workflow: 'agent-generation',
    status: 'completed',
    step: 'generating',
    backendRunId: null,
    analysisRunId: 'saved',
    parentId: null,
    unseen: false,
    createdAt: 1,
    updatedAt: 2,
  };
  const pending = signal(false);
  const seconds = signal(5);
  const skip = jest.fn(() => pending.set(false));
  const record = signal(agent);
  const workspace = signal('/ws');
  const markSeen = jest.fn();
  const binding = { tabId: agent.id, workspacePath: agent.workspacePath };
  const workflow = { bind: jest.fn(), unbind: jest.fn(), run: signal(null) };

  beforeEach(() => {
    jest.clearAllMocks();
    params.next(convertToParamMap({ analysis: 'saved' }));
    pending.set(false);
    seconds.set(5);
    record.set(agent);
    workspace.set('/ws');
    call.mockResolvedValue({
      isSuccess: () => true,
      data: {
        mode: 'selected',
        slugs: ['angular'],
        available: [
          { slug: 'angular', name: 'Angular', description: '', pluginId: null },
        ],
      },
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: ClaudeRpcService, useValue: { call } },
        {
          provide: WizardRpcService,
          useValue: {
            getEnhancedPromptsStatus: jest
              .fn()
              .mockResolvedValue({ enabled: true }),
          },
        },
        {
          provide: TabManagerService,
          useValue: { activeWorkspacePath: '/ws' },
        },
        {
          provide: VSCodeService,
          useValue: {
            config: () => ({ workspaceRoot: '/ws' }),
            postMessage: jest.fn(),
          },
        },
        { provide: AppStateManager, useValue: { setCurrentView: jest.fn() } },
        {
          provide: OnboardingFlagService,
          useValue: { markCompleted: jest.fn() },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: params,
            snapshot: { queryParamMap: params.value },
          },
        },
        { provide: Router, useValue: { navigate } },
        {
          provide: SetupRunStore,
          useValue: {
            workspacePath: workspace,
            get: (id: string) => (id === record().id ? record() : null),
            runsFor: () => [],
            bindingFor: () => binding,
            markSeen,
          },
        },
        {
          provide: GenerationHandoffStore,
          useValue: { pendingFor: pending, remainingSeconds: seconds, skip },
        },
      ],
    });
    TestBed.overrideComponent(AnalyzeDonePage, {
      set: {
        providers: [{ provide: GenerationWorkflowStore, useValue: workflow }],
      },
    });
  });
  it('reads durable workspace skill candidates and guidance status', async () => {
    const fixture = TestBed.createComponent(AnalyzeDonePage);
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(call).toHaveBeenCalledWith('harness:get-skill-selection', {});
    expect(fixture.nativeElement.textContent).toContain('Angular');
    expect(fixture.nativeElement.textContent).toContain('On');
    expect(fixture.nativeElement.textContent).not.toContain('Generate agents');
  });

  it('keeps the originating Setup record and analysis ID when returning to Review skills', async () => {
    params.next(convertToParamMap({ tab: agent.id, analysis: 'saved' }));
    const fixture = TestBed.createComponent(AnalyzeDonePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    [...page.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Review skills')
      ?.click();
    expect(navigate).toHaveBeenCalledWith(['/onboarding/analyze/skills'], {
      queryParams: { tab: agent.id, analysis: agent.analysisRunId },
    });
  });

  it('shows the agent hand-off countdown on Done and skips the identified run', async () => {
    params.next(convertToParamMap({ tab: agent.id, analysis: 'saved' }));
    pending.set(true);
    const fixture = TestBed.createComponent(AnalyzeDonePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Project guidance starts in 5 seconds.');
    seconds.set(4);
    fixture.detectChanges();
    expect(page.textContent).toContain('Project guidance starts in 4 seconds.');
    const skipButton = [...page.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Skip guidance',
    );
    expect(skipButton).toBeDefined();
    skipButton?.click();
    fixture.detectChanges();
    expect(skip).toHaveBeenCalledWith(agent.id);
    expect(page.textContent).not.toContain('Project guidance starts in');
  });

  it('keeps the agent workflow bound across hand-off patches and rebinds when the backend run changes', () => {
    params.next(convertToParamMap({ tab: agent.id }));
    record.set({ ...agent, backendRunId: 'run-1' });
    const fixture = TestBed.createComponent(AnalyzeDonePage);
    fixture.detectChanges();
    expect(workflow.bind).toHaveBeenCalledWith(binding, 'run-1');

    record.update((current) => ({ ...current, guidanceHandoff: 'skipped' }));
    fixture.detectChanges();
    expect(workflow.bind).toHaveBeenCalledTimes(1);
    expect(workflow.unbind).not.toHaveBeenCalled();

    record.update((current) => ({ ...current, backendRunId: 'run-2' }));
    fixture.detectChanges();
    expect(workflow.unbind).toHaveBeenCalledTimes(1);
    expect(workflow.bind).toHaveBeenCalledTimes(2);
    expect(workflow.bind).toHaveBeenLastCalledWith(binding, 'run-2');
  });

  it('marks the routed tab seen only in its active workspace', () => {
    params.next(convertToParamMap({ tab: agent.id }));
    record.set({ ...agent, unseen: true });
    workspace.set('/other');
    const fixture = TestBed.createComponent(AnalyzeDonePage);
    fixture.detectChanges();
    expect(markSeen).not.toHaveBeenCalled();

    workspace.set('/ws');
    fixture.detectChanges();
    expect(markSeen).toHaveBeenCalledWith(agent.id);

    record.set({
      ...agent,
      id: 'guidance-1',
      workflow: 'project-guidance',
      unseen: true,
    });
    params.next(convertToParamMap({ tab: 'guidance-1' }));
    fixture.detectChanges();
    expect(markSeen.mock.calls).toEqual([[agent.id], ['guidance-1']]);
  });

  it('keeps next steps mounted when guidance queues and offers Skip', () => {
    params.next(convertToParamMap({ tab: agent.id }));
    pending.set(true);
    const fixture = TestBed.createComponent(AnalyzeDonePage);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const nextSteps = page.querySelector('ptah-agent-next-steps');
    expect(nextSteps?.textContent).toContain('Quick Start examples');

    seconds.set(0);
    fixture.detectChanges();
    expect(page.querySelector('ptah-agent-next-steps')).toBe(nextSteps);
    expect(nextSteps?.textContent).toContain('Quick Start examples');
    expect(page.textContent).toContain(
      'Project guidance is queued for this run',
    );
    expect(page.textContent).not.toContain(
      'Project guidance starts in 0 seconds',
    );
    const skipButton = [...page.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Skip guidance',
    );
    expect(skipButton).toBeDefined();
    skipButton?.click();
    fixture.detectChanges();
    expect(skip).toHaveBeenCalledWith(agent.id);
    expect(page.textContent).not.toContain('Project guidance is queued');
    expect(page.querySelector('ptah-agent-next-steps')).toBe(nextSteps);
  });
});
