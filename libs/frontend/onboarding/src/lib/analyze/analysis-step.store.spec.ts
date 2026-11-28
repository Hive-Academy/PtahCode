import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MultiPhaseAnalysisResponse } from '@ptah-extension/shared';
import {
  SetupWizardStateService,
  WizardAnalysisRunner,
  WizardRpcService,
} from '@ptah-extension/setup-wizard';
import { AnalysisStepStore } from './analysis-step.store';

const completed = {
  isMultiPhase: true,
  manifest: {
    version: 3,
    runId: 'r',
    slug: 'saved',
    analyzedAt: '',
    updatedAt: '',
    lifecycle: 'completed',
    model: 'm',
    totalDurationMs: 1000,
    phases: {
      'project-profile': {
        status: 'completed',
        file: 'profile.md',
        durationMs: 1000,
      },
    },
  },
  phaseContents: { 'project-profile': 'Done' },
  analysisDir: '/ws/.ptah/analysis/saved',
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
    TestBed.configureTestingModule({
      providers: [
        AnalysisStepStore,
        { provide: WizardRpcService, useValue: rpc },
        {
          provide: SetupWizardStateService,
          useValue: {
            multiPhaseResult: live,
            phaseStatuses: signal([]),
            currentPhaseNumber: signal(null),
            totalPhaseCount: signal(null),
            analysisStream: signal([]),
          },
        },

        { provide: WizardAnalysisRunner, useValue: { isRunning: running } },
      ],
    });
    store = TestBed.inject(AnalysisStepStore);
  });
  it('loads a completed saved analysis', async () => {
    await store.listAnalyses();
    expect(await store.selectAnalysis('saved')).toBe('loaded');
    expect(store.loaded()).toEqual(completed);
  });
  it('drops a late load after workspace reset', async () => {
    let finish!: (value: MultiPhaseAnalysisResponse) => void;
    rpc.loadAnalysis.mockReturnValueOnce(
      new Promise<MultiPhaseAnalysisResponse>((resolve) => {
        finish = resolve;
      }),
    );

    const pending = store.useAnalysis('saved');
    store.resetForWorkspace();
    finish(completed);
    expect(await pending).toBe('superseded');
    expect(store.loaded()).toBeNull();
  });

  it('keeps the newer saved list when an older listAnalyses reply settles late', async () => {
    let settleOlder!: (value: { filename: string }[]) => void;
    let settleNewer!: (value: { filename: string }[]) => void;
    rpc.listAnalyses
      .mockReturnValueOnce(
        new Promise((resolve) => {
          settleOlder = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          settleNewer = resolve;
        }),
      );

    const older = store.listAnalyses();
    const newer = store.listAnalyses();
    settleNewer([{ filename: 'post-rerun' }]);
    await newer;
    expect(store.saved()).toEqual([{ filename: 'post-rerun' }]);

    settleOlder([{ filename: 'stale-initial' }]);
    await older;
    expect(store.saved()).toEqual([{ filename: 'post-rerun' }]);
  });

  it('drops a late saved-list reply after workspace reset', async () => {
    let settleOlder!: (value: { filename: string }[]) => void;
    rpc.listAnalyses.mockReturnValueOnce(
      new Promise((resolve) => {
        settleOlder = resolve;
      }),
    );

    const pending = store.listAnalyses();
    store.resetForWorkspace();
    settleOlder([{ filename: 'stale-workspace' }]);
    await pending;
    expect(store.saved()).toEqual([]);
  });

  it('filters active and non-completed runs from saved analyses', async () => {
    rpc.listAnalyses.mockResolvedValueOnce([
      { filename: 'legacy-entry' },
      { filename: 'completed-entry', lifecycle: 'completed', isActive: false },
      { filename: 'active-entry', lifecycle: 'completed', isActive: true },
      { filename: 'running-entry', lifecycle: 'running' },
      { filename: 'paused-entry', lifecycle: 'paused' },
      { filename: 'failed-entry', lifecycle: 'failed' },
    ]);

    await store.listAnalyses();
    expect(store.saved().map((item) => item.filename)).toEqual([
      'legacy-entry',
      'completed-entry',
    ]);
  });

  it('[S1] hides a completed live result belonging to another workspace', () => {
    const resultWorkspace = signal<string | null>('/ws-a');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AnalysisStepStore,
        { provide: WizardRpcService, useValue: rpc },
        {
          provide: SetupWizardStateService,
          useValue: {
            multiPhaseResult: live,
            phaseStatuses: signal([]),
            currentPhaseNumber: signal(null),
            totalPhaseCount: signal(null),
            analysisStream: signal([]),
          },
        },
        {
          provide: WizardAnalysisRunner,
          useValue: {
            isRunning: running,
            isResultForWorkspace: (path: string | null | undefined) =>
              resultWorkspace() === null || resultWorkspace() === path,
          },
        },
      ],
    });
    const scopedStore = TestBed.inject(AnalysisStepStore);
    live.set(completed);

    scopedStore.setWorkspacePath('/ws-a');
    expect(scopedStore.loaded()).toEqual(completed);

    scopedStore.setWorkspacePath('/ws-b');
    expect(scopedStore.loaded()).toBeNull();
  });
});
