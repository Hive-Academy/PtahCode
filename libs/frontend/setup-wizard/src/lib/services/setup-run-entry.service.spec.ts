import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SETUP_RUN_ENTRY, SurfaceRouterService } from '@ptah-extension/core';
import { SetupRunEntryService } from './setup-run-entry.service';
import { stepTarget } from './setup-run-steps';
import { SetupRunStore } from './setup-run.store';
import type { SetupRunRecord } from './setup-run.types';

const agent: SetupRunRecord = {
  id: 'setup-agent',
  workspacePath: '/ws',
  workflow: 'agent-generation',
  status: 'needs-input',
  step: 'preview',
  backendRunId: null,
  analysisRunId: 'analysis-1',
  parentId: null,
  unseen: false,
  createdAt: 1,
  updatedAt: 1,
};

const guidance: SetupRunRecord = {
  ...agent,
  id: 'setup-guidance',
  workflow: 'project-guidance',
  status: 'running',
  step: 'generating',
  parentId: agent.id,
};

describe('SetupRunEntryService', () => {
  const attentionCount = signal(0);
  const runningCount = signal(0);
  const records = signal<readonly SetupRunRecord[]>([]);
  const activeRun = jest.fn();
  const start = jest.fn();
  const navigateToSurface = jest.fn();
  const targetOf = jest.fn(stepTarget);

  beforeEach(() => {
    jest.clearAllMocks();
    attentionCount.set(0);
    runningCount.set(0);
    records.set([]);
    activeRun.mockReturnValue(null);
    navigateToSurface.mockResolvedValue('navigated');
    TestBed.configureTestingModule({
      providers: [
        { provide: SETUP_RUN_ENTRY, useExisting: SetupRunEntryService },
        {
          provide: SetupRunStore,
          useValue: {
            activeRun,
            attentionCount,
            runningCount,
            runs: records,
            start,
            targetOf,
          },
        },
        { provide: SurfaceRouterService, useValue: { navigateToSurface } },
      ],
    });
  });

  it('exposes the store badge signals through the entry token', () => {
    const entry = TestBed.inject(SETUP_RUN_ENTRY);
    expect(entry.attentionCount()).toBe(0);
    expect(entry.runningCount()).toBe(0);

    attentionCount.set(2);
    runningCount.set(1);

    expect(entry.attentionCount()).toBe(2);
    expect(entry.runningCount()).toBe(1);
  });

  it('opens the active run’s step with the Setup and analysis identities', async () => {
    activeRun.mockReturnValue(agent);
    const result = await TestBed.inject(SETUP_RUN_ENTRY).openSetup();

    expect(targetOf).toHaveBeenCalledWith(agent);
    expect(navigateToSurface).toHaveBeenCalledWith(
      'onboarding',
      ['analyze', 'generate'],
      { queryParams: { tab: agent.id, analysis: 'analysis-1' } },
    );
    expect(result).toBe('navigated');
  });

  it('opens Home when no run is active and returns the router result', async () => {
    navigateToSurface.mockResolvedValue('already-there');
    const result = await TestBed.inject(SETUP_RUN_ENTRY).openSetup();

    expect(navigateToSurface).toHaveBeenCalledWith('onboarding');
    expect(result).toBe('already-there');
  });

  it('reopens the requested workflow’s non-terminal record on repeated calls', async () => {
    records.set([
      { ...guidance, id: 'old', status: 'completed' },
      agent,
      guidance,
    ]);
    activeRun.mockReturnValue(agent);
    const entry = TestBed.inject(SETUP_RUN_ENTRY);

    await Promise.all([
      entry.openWorkflow('setup-project-prompt', 'host'),
      entry.openWorkflow('setup-project-prompt', 'chat'),
    ]);

    expect(targetOf.mock.calls).toEqual([[guidance], [guidance]]);
    expect(navigateToSurface).toHaveBeenCalledWith(
      'onboarding',
      ['analyze', 'guidance'],
      { queryParams: { tab: guidance.id, analysis: 'analysis-1' } },
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('declines a new agent-generation start without navigating', async () => {
    records.set([{ ...agent, status: 'cancelled' }]);

    const result = await TestBed.inject(SETUP_RUN_ENTRY).openWorkflow(
      'setup-agent-generation',
      'host',
    );

    expect(result).toBe('failed');
    expect(navigateToSurface).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('opens an existing agent-generation run on the live route', async () => {
    records.set([{ ...agent, status: 'running', step: 'generating' }]);

    await TestBed.inject(SETUP_RUN_ENTRY).openWorkflow(
      'setup-agent-generation',
      'host',
    );

    expect(navigateToSurface).toHaveBeenCalledWith(
      'onboarding',
      ['analyze', 'generate'],
      { queryParams: { tab: agent.id, analysis: 'analysis-1' } },
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('opens the guidance entry when only terminal records exist', async () => {
    records.set([{ ...guidance, status: 'failed' }]);

    await TestBed.inject(SETUP_RUN_ENTRY).openWorkflow(
      'setup-project-prompt',
      'host',
    );

    expect(navigateToSurface).toHaveBeenCalledWith('onboarding', ['guidance']);
    expect(targetOf).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
});
