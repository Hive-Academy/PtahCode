import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MultiPhaseAnalysisResponse } from '@ptah-extension/shared';
import { SetupWizardStateService, WizardAnalysisRunner, WizardRpcService } from '@ptah-extension/setup-wizard';
import { AnalysisStepStore } from './analysis-step.store';

const completed = {
  isMultiPhase: true,
  manifest: { version: 3, runId: 'r', slug: 'saved', analyzedAt: '', updatedAt: '',
    lifecycle: 'completed', model: 'm', totalDurationMs: 1000,
    phases: { 'project-profile': { status: 'completed', file: 'profile.md', durationMs: 1000 } } },
  phaseContents: { 'project-profile': 'Done' }, analysisDir: '/ws/.ptah/analysis/saved',
} as MultiPhaseAnalysisResponse;

describe('AnalysisStepStore', () => {
  const live = signal<MultiPhaseAnalysisResponse | null>(null);
  const running = signal(false);
  const rpc = { listAnalyses: jest.fn(), loadAnalysis: jest.fn() };
  let store: AnalysisStepStore;
  beforeEach(() => {
    live.set(null);
    running.set(false);
    rpc.listAnalyses.mockResolvedValue([{ filename: 'saved' }]);
    rpc.loadAnalysis.mockResolvedValue(completed);
    TestBed.configureTestingModule({ providers: [
      AnalysisStepStore,
      { provide: WizardRpcService, useValue: rpc },
      { provide: SetupWizardStateService, useValue: {
        multiPhaseResult: live, phaseStatuses: signal([]), currentPhaseNumber: signal(null),
        totalPhaseCount: signal(null), analysisStream: signal([]),
      } },
      { provide: WizardAnalysisRunner, useValue: { isRunning: running } },
    ] });
    store = TestBed.inject(AnalysisStepStore);
  });
  it('loads a completed saved analysis', async () => {
    await store.listAnalyses();
    expect(await store.selectAnalysis('saved')).toBe('loaded');
    expect(store.loaded()).toEqual(completed);
  });
  it('drops a late load after workspace reset', async () => {
    let finish!: (value: MultiPhaseAnalysisResponse) => void;
    rpc.loadAnalysis.mockReturnValueOnce(new Promise<MultiPhaseAnalysisResponse>((resolve) => { finish = resolve; }));
    const pending = store.useAnalysis('saved');
    store.resetForWorkspace();
    finish(completed);
    expect(await pending).toBe('not-found');
    expect(store.loaded()).toBeNull();
  });
});
