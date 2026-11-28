import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  AgentRecommendation,
  MultiPhaseAnalysisResponse,
  ResumableGenerationRun,
} from '@ptah-extension/shared';

import { SetupWizardStateService } from './setup-wizard-state.service';
import type { SkillGenerationProgressItem } from './setup-wizard-state.types';
import { WizardAnalysisRunner } from './wizard-analysis-runner.service';
import { WizardRpcService } from './wizard-rpc.service';

const mockMultiPhase = {
  isMultiPhase: true,
  analysisDir: '/mock/.ptah/analysis/demo',
} as unknown as MultiPhaseAnalysisResponse;

const pausedAnalysis = {
  isMultiPhase: true,
  analysisDir: '/mock/.ptah/analysis/demo',
  manifest: { lifecycle: 'paused' },
} as unknown as MultiPhaseAnalysisResponse;

const completedAnalysis = {
  isMultiPhase: true,
  analysisDir: '/mock/.ptah/analysis/demo',
  manifest: { lifecycle: 'completed' },
} as unknown as MultiPhaseAnalysisResponse;

const mockGenerationRun: ResumableGenerationRun = {
  runId: 'run-1',
  analysisDirectory: '/mock/.ptah/analysis/demo',
  outputDirectory: '/mock/.claude/agents',
  lifecycle: 'paused',
  selectedAgentIds: ['frontend-developer', 'backend-developer'],
  agents: [
    {
      agentId: 'frontend-developer',
      filePath: '/mock/.claude/agents/frontend-developer.md',
      status: 'written',
      rejectedSections: 0,
      tailoredSections: 0,
    },
    {
      agentId: 'backend-developer',
      filePath: '/mock/.claude/agents/backend-developer.md',
      status: 'pending',
      rejectedSections: 0,
      tailoredSections: 0,
    },
  ],
};

/**
 * The regression these cover: the analysis used to be owned by
 * `ScanProgressComponent`, so a view switch destroyed it mid-run and the
 * resolved result was discarded — returning to Setup re-ran the whole
 * analysis. The runner is root-scoped, so nothing here involves a component.
 */
describe('WizardAnalysisRunner', () => {
  let runner: WizardAnalysisRunner;
  let mockStateService: Partial<SetupWizardStateService>;
  let mockRpcService: Partial<WizardRpcService>;

  let multiPhaseResult: ReturnType<
    typeof signal<MultiPhaseAnalysisResponse | null>
  >;
  let recommendations: ReturnType<typeof signal<AgentRecommendation[]>>;
  let skillItems: ReturnType<typeof signal<SkillGenerationProgressItem[]>>;

  beforeEach(() => {
    multiPhaseResult = signal<MultiPhaseAnalysisResponse | null>(null);
    recommendations = signal<AgentRecommendation[]>([]);
    skillItems = signal<SkillGenerationProgressItem[]>([]);

    mockStateService = {
      multiPhaseResult: multiPhaseResult.asReadonly(),
      recommendations: recommendations.asReadonly(),
      skillGenerationProgress: skillItems.asReadonly(),
      reset: jest.fn(),
      setMultiPhaseResult: jest.fn((r: MultiPhaseAnalysisResponse) =>
        multiPhaseResult.set(r),
      ),
      setRecommendations: jest.fn((r: AgentRecommendation[]) =>
        recommendations.set(r),
      ),
      setSkillGenerationProgress: jest.fn(
        (items: SkillGenerationProgressItem[]) => skillItems.set(items),
      ),
      setCurrentStep: jest.fn(),
    } as unknown as Partial<SetupWizardStateService>;

    mockRpcService = {
      deepAnalyze: jest.fn().mockResolvedValue(mockMultiPhase),
      cancelAnalysis: jest.fn().mockResolvedValue(undefined),
      getResumableRun: jest
        .fn()
        .mockResolvedValue({ analysis: null, generation: null }),
      resumeGeneration: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as Partial<WizardRpcService>;

    TestBed.configureTestingModule({
      providers: [
        { provide: SetupWizardStateService, useValue: mockStateService },
        { provide: WizardRpcService, useValue: mockRpcService },
      ],
    });

    runner = TestBed.inject(WizardAnalysisRunner);
  });

  it('stores the result and advances the step', async () => {
    await runner.ensureStarted();

    expect(mockStateService.setMultiPhaseResult).toHaveBeenCalledWith(
      mockMultiPhase,
    );
    expect(mockStateService.setCurrentStep).toHaveBeenCalledWith('analysis');
  });

  it('stores a result that resolves after the view is gone', async () => {
    let resolveDeepAnalyze!: (value: MultiPhaseAnalysisResponse) => void;
    (mockRpcService.deepAnalyze as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDeepAnalyze = resolve;
      }),
    );

    const run = runner.ensureStarted();
    // The view switch happens here — nothing tells the runner, by design.
    resolveDeepAnalyze(mockMultiPhase);
    await run;

    expect(mockStateService.setMultiPhaseResult).toHaveBeenCalledWith(
      mockMultiPhase,
    );
  });

  it('re-attaches to the in-flight run instead of starting a second one', async () => {
    let resolveDeepAnalyze!: (value: MultiPhaseAnalysisResponse) => void;
    (mockRpcService.deepAnalyze as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDeepAnalyze = resolve;
      }),
    );

    const first = runner.ensureStarted();
    const second = runner.ensureStarted();

    expect(second).toBe(first);

    // Let the discovery step settle so the run reaches deepAnalyze.
    await new Promise<void>((resolve) => setTimeout(resolve));
    expect(mockRpcService.deepAnalyze).toHaveBeenCalledTimes(1);

    resolveDeepAnalyze(mockMultiPhase);
    await first;
  });

  it('re-uses a stored result instead of re-analyzing', async () => {
    await runner.ensureStarted();
    (mockRpcService.deepAnalyze as jest.Mock).mockClear();

    await runner.ensureStarted();

    expect(mockRpcService.deepAnalyze).not.toHaveBeenCalled();
  });

  it('reuses a stored analysis without another RPC', async () => {
    multiPhaseResult.set(mockMultiPhase);

    await runner.ensureStarted();

    expect(mockRpcService.deepAnalyze).not.toHaveBeenCalled();
    expect(mockStateService.setCurrentStep).toHaveBeenCalledWith('analysis');
  });

  it('surfaces a failure and leaves the step alone', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (mockRpcService.deepAnalyze as jest.Mock).mockRejectedValue(
      new Error('Deep analysis failed: timeout'),
    );

    await runner.ensureStarted();

    expect(runner.errorMessage()).toBe('Deep analysis failed: timeout');
    expect(runner.statusText()).toBe('Analysis failed');
    expect(runner.isRunning()).toBe(false);
    expect(mockStateService.setCurrentStep).not.toHaveBeenCalled();
  });

  it('drops the result of a run the user cancelled', async () => {
    let resolveDeepAnalyze!: (value: MultiPhaseAnalysisResponse) => void;
    (mockRpcService.deepAnalyze as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDeepAnalyze = resolve;
      }),
    );

    const run = runner.ensureStarted();
    await runner.cancel();
    resolveDeepAnalyze(mockMultiPhase);
    await run;

    expect(mockRpcService.cancelAnalysis).toHaveBeenCalled();
    expect(mockStateService.reset).toHaveBeenCalled();
    expect(mockStateService.setMultiPhaseResult).not.toHaveBeenCalled();
    expect(mockStateService.setCurrentStep).not.toHaveBeenCalled();
  });

  it('lets a reset start a fresh run', async () => {
    await runner.ensureStarted();
    runner.reset();
    multiPhaseResult.set(null);
    (mockRpcService.deepAnalyze as jest.Mock).mockClear();

    await runner.ensureStarted();

    expect(mockRpcService.deepAnalyze).toHaveBeenCalledTimes(1);
  });

  describe('resume discovery (restart recovery)', () => {
    it('holds on an unfinished analysis instead of restarting it', async () => {
      (mockRpcService.getResumableRun as jest.Mock).mockResolvedValue({
        analysis: pausedAnalysis,
        generation: null,
      });

      await runner.ensureStarted();

      expect(mockRpcService.deepAnalyze).not.toHaveBeenCalled();
      expect(runner.resumableAnalysis()).toBe(pausedAnalysis);
      expect(runner.statusText()).toBe('An unfinished analysis was found.');
    });

    it('queries wizard:get-resumable-run only once per session', async () => {
      await runner.ensureStarted();
      runner.reset();
      multiPhaseResult.set(null);
      await runner.ensureStarted();

      expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(1);
    });

    it('resumeAnalysis continues the run with the resume flag', async () => {
      (mockRpcService.getResumableRun as jest.Mock).mockResolvedValue({
        analysis: pausedAnalysis,
        generation: null,
      });
      await runner.ensureStarted();

      await runner.resumeAnalysis();

      expect(runner.resumableAnalysis()).toBeNull();
      expect(mockRpcService.deepAnalyze).toHaveBeenCalledWith({
        resume: true,
      });
      expect(mockStateService.setMultiPhaseResult).toHaveBeenCalledWith(
        mockMultiPhase,
      );
      expect(mockStateService.setCurrentStep).toHaveBeenCalledWith('analysis');
    });

    it('startFreshAnalysis discards the offer and analyzes without resume', async () => {
      (mockRpcService.getResumableRun as jest.Mock).mockResolvedValue({
        analysis: pausedAnalysis,
        generation: null,
      });
      await runner.ensureStarted();

      await runner.startFreshAnalysis();

      expect(runner.resumableAnalysis()).toBeNull();
      expect(mockRpcService.deepAnalyze).toHaveBeenCalledWith({
        resume: false,
      });
    });

    it('adopts a completed analysis and surfaces its generation checkpoint', async () => {
      (mockRpcService.getResumableRun as jest.Mock).mockResolvedValue({
        analysis: completedAnalysis,
        generation: mockGenerationRun,
      });

      await runner.ensureStarted();

      // Completed analysis is stored, never re-run.
      expect(mockStateService.setMultiPhaseResult).toHaveBeenCalledWith(
        completedAnalysis,
      );
      expect(mockRpcService.deepAnalyze).not.toHaveBeenCalled();
      expect(runner.resumableAnalysis()).toBeNull();
      expect(runner.resumableGeneration()).toBe(mockGenerationRun);
    });
  });

  describe('resumeGeneration', () => {
    beforeEach(async () => {
      (mockRpcService.getResumableRun as jest.Mock).mockResolvedValue({
        analysis: completedAnalysis,
        generation: mockGenerationRun,
      });
      await runner.ensureStarted();
    });

    it('seeds items from the persisted checkpoint and moves to generation', async () => {
      await runner.resumeGeneration();

      expect(mockStateService.setSkillGenerationProgress).toHaveBeenCalledWith([
        {
          id: 'frontend-developer',
          name: 'frontend-developer.md',
          type: 'agent',
          status: 'complete',
          progress: 100,
        },
        {
          id: 'backend-developer',
          name: 'backend-developer.md',
          type: 'agent',
          status: 'pending',
        },
      ]);
      expect(mockStateService.setCurrentStep).toHaveBeenCalledWith(
        'generation',
      );
      expect(mockRpcService.resumeGeneration).toHaveBeenCalledTimes(1);
      expect(runner.resumableGeneration()).toBeNull();
    });

    it('is a no-op without a discovered checkpoint', async () => {
      await runner.resumeGeneration();
      (mockRpcService.resumeGeneration as jest.Mock).mockClear();

      await runner.resumeGeneration();

      expect(mockRpcService.resumeGeneration).not.toHaveBeenCalled();
    });

    it('marks still-pending items as failed when the resume RPC fails', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      (mockRpcService.resumeGeneration as jest.Mock).mockRejectedValue(
        new Error('no checkpoint'),
      );

      await runner.resumeGeneration();

      const items = skillItems();
      const byId = new Map(items.map((item) => [item.id, item]));
      expect(byId.get('backend-developer')?.status).toBe('error');
      expect(byId.get('backend-developer')?.errorMessage).toBe(
        'Generation could not be resumed. Try again.',
      );
      // Already-terminal items keep their state.
      expect(byId.get('frontend-developer')?.status).toBe('complete');
    });
  });

  describe('resumeGeneration with settled kept files', () => {
    it('shows kept and changed-since-preview agents as settled, not pending', async () => {
      const agent = (
        agentId: string,
        status: ResumableGenerationRun['agents'][number]['status'],
      ): ResumableGenerationRun['agents'][number] => ({
        agentId,
        filePath: `/mock/.claude/agents/${agentId}.md`,
        status,
        rejectedSections: 0,
        tailoredSections: 0,
      });
      (mockRpcService.getResumableRun as jest.Mock).mockResolvedValue({
        analysis: completedAnalysis,
        generation: {
          ...mockGenerationRun,
          agents: [
            agent('planner', 'kept'),
            agent('data-engineer', 'changed-since-preview'),
            agent('tester', 'failed'),
          ],
        },
      });
      await runner.ensureStarted();

      await runner.resumeGeneration();

      const calls = (mockStateService.setSkillGenerationProgress as jest.Mock)
        .mock.calls;
      const items = calls[calls.length - 1][0] as SkillGenerationProgressItem[];
      expect(items.map((item) => [item.id, item.status])).toEqual([
        ['planner', 'complete'],
        ['data-engineer', 'complete'],
        ['tester', 'pending'],
      ]);
    });
  });

  describe('startedAt, workspace tracking, and backend-active hydration', () => {
    it('tracks startedAt and activeWorkspacePath while a run is in flight and clears them on finish', async () => {
      let resolveDeepAnalyze!: (value: MultiPhaseAnalysisResponse) => void;
      (mockRpcService.deepAnalyze as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveDeepAnalyze = resolve;
        }),
      );

      expect(runner.startedAt()).toBeNull();
      expect(runner.activeWorkspacePath()).toBeNull();
      expect(runner.isRunningForWorkspace('/repo/a')).toBe(false);

      const beforeStart = Date.now();
      const run = runner.ensureStarted('/repo/a///');
      await new Promise<void>((resolve) => setTimeout(resolve));

      expect(runner.isRunning()).toBe(true);
      const startedAt = runner.startedAt();
      expect(startedAt).not.toBeNull();
      expect(startedAt ?? 0).toBeGreaterThanOrEqual(beforeStart);
      expect(runner.activeWorkspacePath()).toBe('/repo/a');
      expect(runner.isRunningForWorkspace('/repo/a')).toBe(true);
      expect(runner.isRunningForWorkspace('/repo/a/')).toBe(true);
      expect(runner.isRunningForWorkspace('/repo/b')).toBe(false);
      expect(runner.isRunningForWorkspace(null)).toBe(false);

      resolveDeepAnalyze(mockMultiPhase);
      await run;

      expect(runner.isRunning()).toBe(false);
      expect(runner.startedAt()).toBeNull();
      expect(runner.activeWorkspacePath()).toBeNull();
      expect(runner.isRunningForWorkspace('/repo/a')).toBe(false);
    });

    it('keeps activeWorkspacePath null and matches any workspace for legacy callers without workspacePath', async () => {
      let resolveDeepAnalyze!: (value: MultiPhaseAnalysisResponse) => void;
      (mockRpcService.deepAnalyze as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveDeepAnalyze = resolve;
        }),
      );

      const run = runner.startFreshAnalysis();
      expect(runner.isRunning()).toBe(true);
      expect(runner.activeWorkspacePath()).toBeNull();
      expect(runner.isRunningForWorkspace('/any/workspace')).toBe(true);
      expect(runner.isRunningForWorkspace(undefined)).toBe(true);

      resolveDeepAnalyze(mockMultiPhase);
      await run;
      expect(runner.isRunningForWorkspace('/any/workspace')).toBe(false);
    });

    it('records workspacePath when resuming or starting fresh', async () => {
      let resolveDeepAnalyze!: (value: MultiPhaseAnalysisResponse) => void;
      (mockRpcService.deepAnalyze as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveDeepAnalyze = resolve;
        }),
      );

      const resumeRun = runner.resumeAnalysis('/repo/resume/');
      expect(runner.activeWorkspacePath()).toBe('/repo/resume');
      expect(runner.isRunningForWorkspace('/repo/resume')).toBe(true);
      expect(runner.isRunningForWorkspace('/repo/other')).toBe(false);

      resolveDeepAnalyze(mockMultiPhase);
      await resumeRun;
      expect(runner.activeWorkspacePath()).toBeNull();
    });

    it('syncBackendActive hydrates isRunning, startedAt, and workspacePath and clears resumableAnalysis', () => {
      const isoStart = '2026-11-26T17:00:00.000Z';
      runner.syncBackendActive(true, {
        startedAt: isoStart,
        workspacePath: '/repo/reloaded/',
      });

      expect(runner.backendActive()).toBe(true);
      expect(runner.isRunning()).toBe(true);
      expect(runner.startedAt()).toBe(Date.parse(isoStart));
      expect(runner.activeWorkspacePath()).toBe('/repo/reloaded');
      expect(runner.isRunningForWorkspace('/repo/reloaded')).toBe(true);
      expect(runner.isRunningForWorkspace('/repo/other')).toBe(false);

      // Does not overwrite an existing startedAt
      runner.syncBackendActive(true, {
        startedAt: '2026-11-26T17:05:00.000Z',
      });
      expect(runner.startedAt()).toBe(Date.parse(isoStart));

      // Clearing backendActive resets hydrated fields when no frontend run is active
      runner.syncBackendActive(false);
      expect(runner.backendActive()).toBe(false);
      expect(runner.isRunning()).toBe(false);
      expect(runner.startedAt()).toBeNull();
      expect(runner.activeWorkspacePath()).toBeNull();
    });

    it('does not overwrite a live in-flight run workspacePath during syncBackendActive', async () => {
      let resolveDeepAnalyze!: (value: MultiPhaseAnalysisResponse) => void;
      (mockRpcService.deepAnalyze as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveDeepAnalyze = resolve;
        }),
      );

      const run = runner.startFreshAnalysis('/repo/live');
      const liveStartedAt = runner.startedAt();

      runner.syncBackendActive(true, {
        startedAt: '2026-11-26T17:00:00.000Z',
        workspacePath: '/repo/different',
      });
      expect(runner.activeWorkspacePath()).toBe('/repo/live');
      expect(runner.startedAt()).toBe(liveStartedAt);

      // Clearing backendActive while live run is in flight preserves live state
      runner.syncBackendActive(false);
      expect(runner.isRunning()).toBe(true);
      expect(runner.activeWorkspacePath()).toBe('/repo/live');
      expect(runner.startedAt()).toBe(liveStartedAt);

      resolveDeepAnalyze(mockMultiPhase);
      await run;
    });

    it('hydrates backendActive on discoverResumableRun when analysisActive is true and skips deepAnalyze', async () => {
      const startedAtIso = '2026-11-26T16:55:00.000Z';
      (mockRpcService.getResumableRun as jest.Mock).mockResolvedValue({
        analysis: pausedAnalysis,
        generation: null,
        analysisActive: true,
        activeAnalysisStartedAt: startedAtIso,
      });

      await runner.ensureStarted('/repo/active/');

      expect(mockRpcService.deepAnalyze).not.toHaveBeenCalled();
      expect(runner.backendActive()).toBe(true);
      expect(runner.isRunning()).toBe(true);
      expect(runner.resumableAnalysis()).toBeNull();
      expect(runner.startedAt()).toBe(Date.parse(startedAtIso));
      expect(runner.activeWorkspacePath()).toBe('/repo/active');

      // Calling ensureStarted again while backendActive still does not start a fresh run
      await runner.ensureStarted('/repo/active');
      expect(mockRpcService.deepAnalyze).not.toHaveBeenCalled();
    });

    it('clears backendActive, startedAt, and activeWorkspacePath on reset and cancel', async () => {
      runner.syncBackendActive(true, {
        startedAt: '2026-11-26T17:00:00.000Z',
        workspacePath: '/repo/a',
      });
      runner.reset();

      expect(runner.backendActive()).toBe(false);
      expect(runner.isRunning()).toBe(false);
      expect(runner.startedAt()).toBeNull();
      expect(runner.activeWorkspacePath()).toBeNull();

      runner.syncBackendActive(true, {
        startedAt: '2026-11-26T17:00:00.000Z',
        workspacePath: '/repo/a',
      });
      await runner.cancel();

      expect(mockRpcService.cancelAnalysis).toHaveBeenCalled();
      expect(runner.backendActive()).toBe(false);
      expect(runner.isRunning()).toBe(false);
      expect(runner.startedAt()).toBeNull();
      expect(runner.activeWorkspacePath()).toBeNull();
    });

    it('[B1] does not latch backendActive when syncBackendActive(true) is called during an active local run', async () => {
      let resolveDeepAnalyze!: (value: MultiPhaseAnalysisResponse) => void;
      (mockRpcService.deepAnalyze as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          resolveDeepAnalyze = resolve;
        }),
      );

      const run = runner.startFreshAnalysis('/repo/a');
      runner.syncBackendActive(true, {
        startedAt: '2026-11-26T17:00:00.000Z',
        workspacePath: '/repo/a',
      });

      expect(runner.backendActive()).toBe(false);
      expect(runner.isRunning()).toBe(true);

      resolveDeepAnalyze(completedAnalysis);
      await run;

      expect(runner.isRunning()).toBe(false);
      expect(runner.backendActive()).toBe(false);
      expect(runner.isRunningForWorkspace('/repo/a')).toBe(false);
      expect(runner.isRunningForWorkspace('/other')).toBe(false);
    });

    it('[B2] polls getResumableRun while backendActive, adopts completed analysis, clears isRunning, and stops timers', async () => {
      jest.useFakeTimers();
      try {
        const reloadedCompleted = {
          ...completedAnalysis,
          analysisDir: '/repo/reloaded/.ptah/analysis/demo',
        } as unknown as MultiPhaseAnalysisResponse;
        (mockRpcService.getResumableRun as jest.Mock)
          .mockResolvedValueOnce({
            analysis: pausedAnalysis,
            generation: null,
            analysisActive: true,
          })
          .mockResolvedValueOnce({
            analysis: reloadedCompleted,
            generation: null,
            analysisActive: false,
          });

        runner.syncBackendActive(true, {
          startedAt: '2026-11-26T17:00:00.000Z',
          workspacePath: '/repo/reloaded',
        });
        expect(runner.backendActive()).toBe(true);
        expect(runner.isRunning()).toBe(true);

        // First poll: still active
        await jest.advanceTimersByTimeAsync(2500);
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(1);
        expect(runner.backendActive()).toBe(true);
        expect(runner.isRunning()).toBe(true);

        // Second poll: backend finished with completed analysis
        await jest.advanceTimersByTimeAsync(2500);
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(2);
        expect(runner.backendActive()).toBe(false);
        expect(runner.isRunning()).toBe(false);
        expect(mockStateService.setMultiPhaseResult).toHaveBeenCalledWith(
          reloadedCompleted,
        );
        expect(runner.resultWorkspacePath()).toBe('/repo/reloaded');
        expect(runner.isResultForWorkspace('/repo/reloaded')).toBe(true);
        expect(runner.isResultForWorkspace('/repo/other')).toBe(false);

        // No further polls after stopping
        await jest.advanceTimersByTimeAsync(10_000);
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('[B2] stops backend watcher on reset and bounds repeated poll errors', async () => {
      jest.useFakeTimers();
      try {
        (mockRpcService.getResumableRun as jest.Mock).mockRejectedValue(
          new Error('ipc offline'),
        );

        runner.syncBackendActive(true, { workspacePath: '/repo/a' });
        runner.reset();
        await jest.advanceTimersByTimeAsync(10_000);
        expect(mockRpcService.getResumableRun).not.toHaveBeenCalled();

        // Bounded poll errors stop watcher cleanly after 5 failures
        runner.syncBackendActive(true, { workspacePath: '/repo/a' });
        for (let i = 0; i < 8; i++) {
          await jest.advanceTimersByTimeAsync(2500);
        }
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(5);
      } finally {
        jest.useRealTimers();
      }
    });

    it('[N1] pauses backend watcher on workspace switch, ignores in-flight cross-workspace replies, and resumes when switching back', async () => {
      jest.useFakeTimers();
      try {
        const wsACompleted = {
          ...completedAnalysis,
          analysisDir: '/repo/a/.ptah/analysis/demo-a',
        } as unknown as MultiPhaseAnalysisResponse;
        const wsBCompleted = {
          ...completedAnalysis,
          analysisDir: '/repo/b/.ptah/analysis/demo-b',
        } as unknown as MultiPhaseAnalysisResponse;

        let resolveInFlight!: (value: {
          analysis: MultiPhaseAnalysisResponse | null;
          generation: null;
          analysisActive: boolean;
        }) => void;
        (mockRpcService.getResumableRun as jest.Mock)
          .mockReturnValueOnce(
            new Promise((resolve) => {
              resolveInFlight = resolve;
            }),
          )
          .mockResolvedValueOnce({
            analysis: wsACompleted,
            generation: null,
            analysisActive: false,
          });

        runner.setCurrentWorkspacePath('/repo/a');
        runner.syncBackendActive(true, {
          startedAt: '2026-11-26T17:00:00.000Z',
          workspacePath: '/repo/a',
        });

        // First tick starts an in-flight RPC while on /repo/a
        await jest.advanceTimersByTimeAsync(2500);
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(1);

        // User switches to /repo/b while poll #1 is still in flight
        runner.setCurrentWorkspacePath('/repo/b');

        // Stale in-flight poll resolves with /repo/b's completed analysis and analysisActive: false
        resolveInFlight({
          analysis: wsBCompleted,
          generation: null,
          analysisActive: false,
        });
        await Promise.resolve();
        await Promise.resolve();

        // /repo/a's backendActive must stay intact and /repo/b's analysis must NOT be adopted
        expect(runner.backendActive()).toBe(true);
        expect(runner.isRunningForWorkspace('/repo/a')).toBe(true);
        expect(runner.isRunningForWorkspace('/repo/b')).toBe(false);
        expect(mockStateService.setMultiPhaseResult).not.toHaveBeenCalled();

        // Staying on /repo/b keeps the watcher paused (no further RPC polls)
        await jest.advanceTimersByTimeAsync(10_000);
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(1);
        expect(runner.backendActive()).toBe(true);

        // Switching back to /repo/a resumes polling and completes cleanly
        runner.setCurrentWorkspacePath('/repo/a');
        await jest.advanceTimersByTimeAsync(2500);
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(2);
        expect(runner.backendActive()).toBe(false);
        expect(runner.isRunning()).toBe(false);
        expect(mockStateService.setMultiPhaseResult).toHaveBeenCalledWith(
          wsACompleted,
        );
        expect(runner.resultWorkspacePath()).toBe('/repo/a');

        // No further timers remain after completion
        await jest.advanceTimersByTimeAsync(10_000);
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('[N1] refuses to adopt a completed analysis whose analysisDir belongs to another workspace (defense-in-depth)', async () => {
      jest.useFakeTimers();
      try {
        const foreignAnalysis = {
          ...completedAnalysis,
          analysisDir: '/repo/ab/.ptah/analysis/wrong-workspace',
        } as unknown as MultiPhaseAnalysisResponse;
        (mockRpcService.getResumableRun as jest.Mock).mockResolvedValueOnce({
          analysis: foreignAnalysis,
          generation: null,
          analysisActive: false,
        });

        runner.setCurrentWorkspacePath('/repo/a');
        runner.syncBackendActive(true, { workspacePath: '/repo/a' });

        await jest.advanceTimersByTimeAsync(2500);
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(1);
        expect(mockStateService.setMultiPhaseResult).not.toHaveBeenCalled();
        expect(runner.backendActive()).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('[N2] treats analysisActive undefined (RPC error fallback) as a transient poll error and bounds retries to 5', async () => {
      jest.useFakeTimers();
      try {
        const wsACompleted = {
          ...completedAnalysis,
          analysisDir: '/repo/a/.ptah/analysis/demo-a',
        } as unknown as MultiPhaseAnalysisResponse;

        // Single transient fallback followed by active then completed recovers cleanly
        (mockRpcService.getResumableRun as jest.Mock)
          .mockResolvedValueOnce({ analysis: null, generation: null })
          .mockResolvedValueOnce({
            analysis: pausedAnalysis,
            generation: null,
            analysisActive: true,
          })
          .mockResolvedValueOnce({
            analysis: wsACompleted,
            generation: null,
            analysisActive: false,
          });

        runner.setCurrentWorkspacePath('/repo/a');
        runner.syncBackendActive(true, { workspacePath: '/repo/a' });

        await jest.advanceTimersByTimeAsync(2500);
        expect(runner.backendActive()).toBe(true);
        expect(runner.isRunning()).toBe(true);

        await jest.advanceTimersByTimeAsync(2500);
        expect(runner.backendActive()).toBe(true);

        await jest.advanceTimersByTimeAsync(2500);
        expect(runner.backendActive()).toBe(false);
        expect(mockStateService.setMultiPhaseResult).toHaveBeenCalledWith(
          wsACompleted,
        );

        // 5 consecutive undefined responses stop the watcher cleanly without clearing backendActive
        (mockRpcService.getResumableRun as jest.Mock).mockClear();
        (mockRpcService.getResumableRun as jest.Mock).mockResolvedValue({
          analysis: null,
          generation: null,
        });

        runner.syncBackendActive(true, { workspacePath: '/repo/a' });
        for (let i = 0; i < 8; i++) {
          await jest.advanceTimersByTimeAsync(2500);
        }
        expect(mockRpcService.getResumableRun).toHaveBeenCalledTimes(5);
        expect(runner.backendActive()).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('[S1] scopes stored results and errors to the workspace that ran them and clears on reset', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await runner.startFreshAnalysis('/repo/a/');
      expect(runner.resultWorkspacePath()).toBe('/repo/a');
      expect(runner.isResultForWorkspace('/repo/a')).toBe(true);
      expect(runner.isResultForWorkspace('/repo/a/')).toBe(true);
      expect(runner.isResultForWorkspace('/repo/b')).toBe(false);
      expect(runner.isResultForWorkspace(null)).toBe(false);

      runner.reset();
      expect(runner.resultWorkspacePath()).toBeNull();
      expect(runner.isResultForWorkspace('/repo/b')).toBe(true);

      (mockRpcService.deepAnalyze as jest.Mock).mockRejectedValueOnce(
        new Error('boom'),
      );
      await runner.startFreshAnalysis('/repo/a');
      expect(runner.errorMessage()).toBe('boom');
      expect(runner.resultWorkspacePath()).toBe('/repo/a');
      expect(runner.isResultForWorkspace('/repo/a')).toBe(true);
      expect(runner.isResultForWorkspace('/repo/b')).toBe(false);
    });

    it('[S2] resumeAnalysis and startFreshAnalysis call deepAnalyze even when multiPhaseResult holds a paused manifest', async () => {
      multiPhaseResult.set(pausedAnalysis);
      (mockRpcService.deepAnalyze as jest.Mock).mockResolvedValue(
        completedAnalysis,
      );

      await runner.resumeAnalysis('/repo/a');
      expect(mockRpcService.deepAnalyze).toHaveBeenCalledWith({ resume: true });
      expect(mockStateService.setMultiPhaseResult).toHaveBeenCalledWith(
        completedAnalysis,
      );

      (mockRpcService.deepAnalyze as jest.Mock).mockClear();
      multiPhaseResult.set(pausedAnalysis);

      await runner.startFreshAnalysis('/repo/a');
      expect(mockRpcService.deepAnalyze).toHaveBeenCalledWith({
        resume: false,
      });
    });
  });
});
