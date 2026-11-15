import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MultiPhaseAnalysisResponse } from '@ptah-extension/shared';
import { SetupWizardStateService, WizardAnalysisRunner, WizardRpcService } from '@ptah-extension/setup-wizard';
import { AnalysisStepStore } from './analysis-step.store';

const completed = { isMultiPhase: true, manifest: { version: 3, runId: 'r', slug: 'saved', analyzedAt: '', updatedAt: '', lifecycle: 'completed', model: 'm', totalDurationMs: 1000,
  phases: { 'project-profile': { status: 'completed', file: 'profile.md', durationMs: 1000 } } }, phaseContents: { 'project-profile': 'Done' }, analysisDir: '/ws/.ptah/analysis/saved' } as MultiPhaseAnalysisResponse;
const unfinished = { ...completed, manifest: { ...completed.manifest, lifecycle: 'paused' as const } } as MultiPhaseAnalysisResponse;
const saved = [{ filename: 'saved', savedAt: '2026-01-01', projectType: 'Angular', phaseCount: 1, model: 'm', durationMs: 1000 }];

describe('AnalysisStepStore', () => {
  let store: AnalysisStepStore;
  const live = signal<MultiPhaseAnalysisResponse | null>(null);
  const running = signal(false);
  const phases = signal<{ id: string; status: string }[]>([]);
  const current = signal<number | null>(null);
  const total = signal<number | null>(null);
  const stream = signal<{ kind: 'text'; content: string; timestamp: number }[]>([]);
  const rpc = { listAnalyses: jest.fn(), loadAnalysis: jest.fn() };
  beforeEach(() => {
    live.set(null); running.set(false); phases.set([]); current.set(null); total.set(null); stream.set([]);
    jest.clearAllMocks(); rpc.listAnalyses.mockResolvedValue(saved); rpc.loadAnalysis.mockResolvedValue(completed);
    TestBed.configureTestingModule({ providers: [AnalysisStepStore,
      { provide: WizardRpcService, useValue: rpc },
      { provide: SetupWizardStateService, useValue: { multiPhaseResult: live, phaseStatuses: phases, currentPhaseNumber: current, totalPhaseCount: total, analysisStream: stream } },
      { provide: WizardAnalysisRunner, useValue: { isRunning: running } },
    ] });
    store = TestBed.inject(AnalysisStepStore);
  });
  it('loads a listed completed analysis and reports a missing filename', async () => {
    await store.listAnalyses();
    expect(await store.selectAnalysis('saved')).toBe('loaded');
    expect(store.selected()).toBe('saved');
    expect(store.loaded()).toEqual(completed);
    expect(await store.selectAnalysis('missing')).toBe('not-found');
    expect(rpc.loadAnalysis).toHaveBeenCalledTimes(1);
  });
  it('never substitutes an unfinished live run for the selected analysis', async () => {
    await store.listAnalyses(); await store.selectAnalysis('saved'); live.set(unfinished);
    expect(store.loaded()).toEqual(completed);
    store.clearSelection(); expect(store.loaded()).toBeNull();
  });
  it('keeps completed analysis available', async () => {
    await store.listAnalyses(); await store.selectAnalysis('saved');
    expect(store.loaded()).toEqual(completed);
  });
  it('shows stream counts only while attached', () => {
    running.set(true); stream.set([{ kind: 'text', content: 'x', timestamp: 1 }]);
    expect(store.streamCounts()).toBeNull();
    store.attachStream(); expect(store.streamCounts()?.total).toBe(1);
    store.detachStream(); expect(store.streamCounts()).toBeNull();
  });
  it('distinguishes a saved-list failure from an empty list', async () => {
    rpc.listAnalyses.mockRejectedValueOnce(new Error('offline'));
    await expect(store.listAnalyses()).rejects.toThrow('offline');
    expect(store.saved()).toEqual([]);
    await store.listAnalyses();
    expect(rpc.listAnalyses).toHaveBeenCalledWith({ throwOnError: true });
  });
  it('discards an analysis load that finishes after a workspace change', async () => {
    let finishLoad!: (value: MultiPhaseAnalysisResponse) => void;
    rpc.loadAnalysis.mockReturnValueOnce(new Promise<MultiPhaseAnalysisResponse>((resolve) => { finishLoad = resolve; }));
    const pending = store.useAnalysis('saved');
    store.resetForWorkspace();
    finishLoad(completed);
    expect(await pending).toBe('not-found');
    expect(store.selected()).toBeNull();
    expect(store.loaded()).toBeNull();
  });
});
