import { Logger } from '@ptah-extension/vscode-core';
import { CandidateFindingSchema, type IGitHubReviewPort } from '@ptah-extension/review-contracts';
import { ReviewOrchestratorService, ReviewPollDisabledError } from './review-orchestrator.service';
import { ReviewQueueService, type ReviewQueueClaim } from './review-queue.service';
import { ReviewPolicyService } from './review-policy.service';
import type { IReviewRepository, ReviewStageRecord } from './persistence/review-repository.interface';
import type { IReviewSettingsStore } from './persistence/review-settings.store';
import { DiscoveryStageRunner } from './stages/discovery-stage.runner';
import { ContextStageRunner, type ContextStageResult } from './stages/context-stage.runner';
import { TriageStageRunner } from './stages/triage-stage.runner';
import { LensStageRunner } from './stages/lens-stage.runner';
import { VerificationStageRunner } from './stages/verification-stage.runner';
import { PublicationStageRunner } from './stages/publication-stage.runner';
import { ReviewWorktreeService } from './context/review-worktree.service';
import { ReviewStatusCoordinatorService } from './status/review-status-coordinator.service';
import { ReviewLaneSelectionService } from './lanes/review-lane-selection.service';
import { ReviewLaneAttempt } from './lanes/review-lane-attempt';
import { ReviewLaneRunner, type ReviewLaneResult } from './lanes/review-lane.runner';
import type { ReviewLaneRunUsage } from './lanes/review-lane-usage';

const sha = 'a'.repeat(40);
const claim: ReviewQueueClaim = { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 1,
  headSha: sha, attemptId: 'attempt-1', trigger: 'poll', queuedAt: '2026-11-03T00:00:00Z',
  lease: { owner: 'worker', expiresAt: '2026-11-03T01:00:00Z' } };
const contextValue: ContextStageResult = { attemptRoot: '/attempt', coverage: [], promptInput: {
  headSha: sha, title: '', body: '', diff: '', comments: '', fileContent: '', deterministicEvidence: '', repositoryRules: '',
} };
const settings = { repositories: [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }],
  maintainerLogins: ['maintainer'], pollMinutes: 10, globalPublicationPaused: false, fallbackFamilies: [] };

function fixture(withStatuses = false) {
  const stages = new Map<string, ReviewStageRecord>();
  const checkpoints = new Map<string, unknown>();
  const key = (name: string, ordinal: number) => `${name}:${ordinal}`;
  const repository: IReviewRepository = {
    getLastReviewedHead: jest.fn().mockResolvedValue(null), getOpenFailures: jest.fn().mockResolvedValue([]),
    getLastPollAt: jest.fn().mockResolvedValue(null), recordPoll: jest.fn(), saveFailure: jest.fn(),
    enqueueDiscovered: jest.fn(), enqueueManual: jest.fn(), recordDraft: jest.fn(),
    claimNext: jest.fn().mockResolvedValueOnce(claim).mockResolvedValue(null),
    heartbeat: jest.fn(), release: jest.fn().mockResolvedValue(true), reconcileExpiredLeases: jest.fn().mockResolvedValue(0),
    getAttempt: jest.fn(), getCurrentAttemptId: jest.fn().mockResolvedValue(claim.attemptId), getStages: async () => [...stages.values()],
    saveStage: async (row) => { stages.set(key(row.stage, row.ordinal), row); },
    saveCheckpoint: async (_id, name, ordinal, data) => { checkpoints.set(key(name, ordinal), data); },
    getCheckpoint: async (_id, name, ordinal) => checkpoints.get(key(name, ordinal)) ?? null,
    beginStageLaneRun: jest.fn().mockResolvedValue(undefined),
    saveStageLane: jest.fn().mockResolvedValue(undefined),
    // Mirrors the SQLite guard: only the `running` row this owner started is closed.
    closeRunningStage: jest.fn(async (_id: string, name: string, ordinal: number, startedAt: string, endedAt: string) => {
      const row = stages.get(key(name, ordinal));
      if (row?.state === 'running' && row.startedAt === startedAt) stages.set(key(name, ordinal), { ...row, state: 'interrupted', endedAt });
    }),
    getStatusSync: jest.fn().mockResolvedValue(null), saveStatusSync: jest.fn(),
    getPendingStatusSync: jest.fn().mockResolvedValue([]), getMachineStatusSync: jest.fn().mockResolvedValue([]),
    syncFindingResolution: jest.fn().mockResolvedValue(false),
  };
  const queue = Object.create(ReviewQueueService.prototype) as ReviewQueueService;
  const claimMock = jest.spyOn(queue, 'claim').mockImplementation(async () => repository.claimNext('worker', '', ''));
  const release = jest.spyOn(queue, 'release').mockResolvedValue(true);
  jest.spyOn(queue, 'reconcileStartup').mockResolvedValue(0);
  const discovery = Object.create(DiscoveryStageRunner.prototype) as DiscoveryStageRunner;
  const discover = jest.spyOn(discovery, 'run').mockResolvedValue(1);
  const context = Object.create(ContextStageRunner.prototype) as ContextStageRunner;
  const contextRun = jest.spyOn(context, 'run').mockResolvedValue(contextValue);
  const triage = Object.create(TriageStageRunner.prototype) as TriageStageRunner;
  const triageRun = jest.spyOn(triage, 'run').mockResolvedValue({ status: 'partial', reason: 'no-confirmed-room' });
  const lenses = Object.create(LensStageRunner.prototype) as LensStageRunner;
  const lensRun = jest.spyOn(lenses, 'run').mockResolvedValue([]);
  const verification = Object.create(VerificationStageRunner.prototype) as VerificationStageRunner;
  const verificationRun = jest.spyOn(verification, 'run').mockResolvedValue([]);
  const publication = Object.create(PublicationStageRunner.prototype) as PublicationStageRunner;
  const publicationRun = jest.spyOn(publication, 'run').mockResolvedValue({ artifactPath: '/attempt/out/review-preview.md',
    exportPath: '/attempt/out/review-export.json', acceptedCount: 0, suppressedCount: 0 });
  const github: IGitHubReviewPort = { getPull: jest.fn().mockResolvedValue({ number: 1, headSha: sha,
    baseSha: 'b'.repeat(40), state: 'open', draft: false, authorLogin: 'maintainer', headRepoId: 1, baseRepoId: 1, headIsFork: false }),
    getDiff: jest.fn(), listOpenPulls: jest.fn(), listOwnIssueComments: jest.fn(), listOwnReviewsAndThreads: jest.fn(),
    upsertWalkthrough: jest.fn(), createCommentReview: jest.fn(), replyToFinding: jest.fn() };
  const logger = Object.create(Logger.prototype) as Logger;
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  const worktree = Object.create(ReviewWorktreeService.prototype) as ReviewWorktreeService;
  const releaseSource = jest.spyOn(worktree, 'releaseSource').mockResolvedValue(true);
  const listAttemptSources = jest.spyOn(worktree, 'listAttemptSources').mockResolvedValue([]);
  const prune = jest.spyOn(worktree, 'prune').mockResolvedValue(undefined);
  const settingsStore = { getSettings: jest.fn().mockResolvedValue(settings), updateSettings: jest.fn(), listRepositories: jest.fn(),
    setPublicationPause: jest.fn(), getLiveGate: jest.fn(), setLiveGate: jest.fn() } as jest.Mocked<IReviewSettingsStore>;
  const statuses = Object.create(ReviewStatusCoordinatorService.prototype) as ReviewStatusCoordinatorService;
  jest.spyOn(statuses, 'claimed').mockResolvedValue(undefined);
  jest.spyOn(statuses, 'lensCompleted').mockResolvedValue(undefined);
  const finished = jest.spyOn(statuses, 'finished').mockResolvedValue(undefined);
  const laneSelection = Object.create(ReviewLaneSelectionService.prototype) as ReviewLaneSelectionService;
  const laneAttempt = new ReviewLaneAttempt({ source: { list: jest.fn(), listModels: jest.fn(), modelBlocked: jest.fn() },
    settings: { get: jest.fn() }, clock: { now: () => 0, setTimeout, clearTimeout }, logger: { warn: jest.fn() } });
  const beginAttempt = jest.spyOn(laneSelection, 'beginAttempt').mockReturnValue(laneAttempt);
  const coordinator = new ReviewOrchestratorService(discovery, context, triage, lenses, verification, publication, queue,
    new ReviewPolicyService(), repository, github,
    { resolve: async () => ({ repoRoot: '/repo', attemptsRoot: '/attempts' }), settings: async () => settings, baseConfig: async () => null }, logger,
    settingsStore, worktree, laneSelection, withStatuses ? statuses : undefined);
  return { beginAttempt, laneAttempt, releaseSource, listAttemptSources, prune, settingsStore, coordinator, finished, stages, checkpoints, repository, logger, claimMock, release, discover, contextRun, triageRun, lensRun,
    verificationRun, publicationRun, github };
}

describe('ReviewOrchestratorService', () => {
  it('releases the source after lease release even when status completion throws', async () => {
    const f = fixture(true);
    f.finished.mockRejectedValueOnce(new Error('status unavailable'));
    await expect(f.coordinator.drain('worker', Date.now() + 500)).rejects.toThrow('status unavailable');
    expect(f.release).toHaveBeenCalled();
    expect(f.releaseSource).toHaveBeenCalledWith(claim.repo, '/repo', '/attempts', claim.attemptId);
  });
  it('does not save a failure when shutdown aborts an in-flight attempt', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.contextRun.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('shutdown');
    });
    await f.coordinator.drain('worker', Date.now() + 500, controller.signal);
    expect(f.repository.saveFailure).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
    expect(f.releaseSource).not.toHaveBeenCalled();
  });

  it('removes the source worktree of an attempt after it is released', async () => {
    const f = fixture();
    await f.coordinator.drain('worker', Date.now() + 500);
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', expect.any(String));
    expect(f.releaseSource).toHaveBeenCalledWith(claim.repo, '/repo', '/attempts', claim.attemptId);
    expect(f.release.mock.invocationCallOrder[0]).toBeLessThan(f.releaseSource.mock.invocationCallOrder[0]);
  });

  it('keeps the source worktree when the lease was lost and release did not apply', async () => {
    const f = fixture();
    f.release.mockResolvedValueOnce(false);
    await f.coordinator.drain('worker', Date.now() + 500);
    expect(f.releaseSource).not.toHaveBeenCalled();
  });

  it('removes the source worktree of a failed attempt and contains a cleanup failure', async () => {
    const f = fixture();
    f.contextRun.mockRejectedValueOnce(new Error('No space left on device'));
    f.releaseSource.mockRejectedValueOnce(new Error('Review source removal failed'));
    await expect(f.coordinator.drain('worker', Date.now() + 500)).resolves.toBe(1);
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', 'failed');
    expect(f.releaseSource).toHaveBeenCalledTimes(1);
    expect(f.logger.error).toHaveBeenCalledWith('Review attempt source cleanup failed', new Error('Review source removal failed'));
  });

  it('startup sweep removes sources of ended attempts only', async () => {
    const f = fixture();
    f.listAttemptSources.mockResolvedValueOnce(['done', 'failed', 'cancelled', 'running', 'queued', 'unknown']);
    const states: Record<string, string> = { done: 'completed', failed: 'failed', cancelled: 'cancelled', running: 'running', queued: 'queued' };
    jest.mocked(f.repository.getAttempt).mockImplementation(async (id) => states[id]
      ? { attemptId: id, state: states[id] } as Awaited<ReturnType<IReviewRepository['getAttempt']>> : null);
    await expect(f.coordinator.releaseEndedSources()).resolves.toBe(3);
    expect(f.listAttemptSources).toHaveBeenCalledWith(claim.repo, '/repo', '/attempts');
    expect(f.releaseSource.mock.calls.map((call) => call[3])).toEqual(['done', 'failed', 'cancelled']);
    expect(f.prune).toHaveBeenCalledWith(claim.repo, '/repo');
  });

  it('startup sweep continues after one attempt fails and never throws', async () => {
    const f = fixture();
    f.listAttemptSources.mockResolvedValueOnce(['a', 'b']);
    jest.mocked(f.repository.getAttempt).mockImplementation(async (id) =>
      ({ attemptId: id, state: 'completed' }) as Awaited<ReturnType<IReviewRepository['getAttempt']>>);
    f.releaseSource.mockRejectedValueOnce(new Error('busy'));
    await expect(f.coordinator.releaseEndedSources()).resolves.toBe(1);
    expect(f.releaseSource.mock.calls.map((call) => call[3])).toEqual(['a', 'b']);
    f.listAttemptSources.mockRejectedValueOnce(new Error('Git worktree list failed'));
    await expect(f.coordinator.releaseEndedSources()).resolves.toBe(0);
    f.settingsStore.getSettings.mockRejectedValueOnce(new Error('settings unavailable'));
    await expect(f.coordinator.releaseEndedSources()).resolves.toBe(0);
    expect(f.logger.error).toHaveBeenCalledWith('Review attempt source sweep failed', new Error('Git worktree list failed'));
  });

  it('contains failure persistence errors and releases the attempt as failed', async () => {
    const f = fixture();
    f.contextRun.mockRejectedValueOnce(new Error('stage failed'));
    jest.mocked(f.repository.saveFailure).mockRejectedValueOnce(new Error('secret persistence failure'));
    await expect(f.coordinator.drain('worker', Date.now() + 500)).resolves.toBeDefined();
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', 'failed');
    expect(f.logger.error).toHaveBeenCalledWith('Review failure persistence failed',
      new Error('Review failure persistence failed'));
  });
  it('persists and logs redacted failure details', async () => {
    const f = fixture();
    f.contextRun.mockRejectedValueOnce(new Error('failed at C:\\private\\repo with ghp_123456789012345678901234'));
    await f.coordinator.drain('worker', Date.now() + 500);
    expect(f.repository.saveFailure).toHaveBeenCalledWith('attempt-1', expect.objectContaining({ stage: 'context', code: 'unknown', message: expect.not.stringContaining('ghp_') }));
    const saved = jest.mocked(f.repository.saveFailure).mock.calls[0][1];
    expect(saved.message).not.toContain('C:\\private');
    expect(f.stages.get('context:0')?.errorSummary).toBe(saved.message);
    expect(jest.mocked(f.logger.error).mock.calls[0][0]).toBeInstanceOf(Error);
    expect(jest.mocked(f.logger.error).mock.calls[0][1]).toEqual(expect.objectContaining({ attemptId: 'attempt-1', code: 'unknown' }));
  });
  it('records failed discovery and successful retry through the repository', async () => {
    const f = fixture();
    const repo = claim.repo;
    f.discover.mockRejectedValueOnce(new Error('remote failure')).mockResolvedValueOnce(1);
    await expect(f.coordinator.pollAndRecord(repo)).rejects.toThrow('remote failure');
    expect(f.repository.recordPoll).toHaveBeenCalledWith(repo, false);
    await expect(f.coordinator.pollAndRecord(repo)).resolves.toBe(1);
    expect(f.repository.recordPoll).toHaveBeenLastCalledWith(repo, true);
  });
  it('rejects a disabled repository without discovery or a poll write', async () => {
    const f = fixture();
    f.settingsStore.getSettings.mockResolvedValueOnce(null);
    await expect(f.coordinator.pollAndRecord({ owner: 'Hive-Academy', name: 'PtahCode' }))
      .rejects.toBeInstanceOf(ReviewPollDisabledError);
    expect(f.discover).not.toHaveBeenCalled();
    expect(f.repository.recordPoll).not.toHaveBeenCalled();
  });
  it('gives a claimed attempt its own deadline beyond the drain window', async () => {
    const f = fixture();
    const drainDeadline = Date.now() + 1000;
    await f.coordinator.drain('worker', drainDeadline);
    expect(f.contextRun).toHaveBeenCalledWith(claim, expect.any(Number), undefined);
    const contextDeadline = f.contextRun.mock.calls[0][1];
    expect(contextDeadline).toBeGreaterThan(drainDeadline + 20 * 60_000);
    expect(f.triageRun.mock.calls[0][2]).toBe(contextDeadline);
  });

  it('gives triage, lenses and the verifier one lane attempt and reports the triage family to publication', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.triageRun.mockResolvedValue({ status: 'completed', family: 'claude',
      output: { schemaVersion: 1, headSha: sha, findings: [], coverage: [] } });
    await f.coordinator.drain('worker', Date.now() + 10_000, controller.signal);
    expect(f.beginAttempt).toHaveBeenCalledTimes(1);
    expect(f.beginAttempt).toHaveBeenCalledWith(controller.signal);
    expect(f.triageRun.mock.calls[0][3]).toBe(f.laneAttempt);
    expect(f.lensRun.mock.calls[0][3]).toBe(f.laneAttempt);
    expect(f.verificationRun.mock.calls[0][4]).toBe(f.laneAttempt);
    expect(f.publicationRun.mock.calls[0][5]).toBe(true);
    expect(f.publicationRun.mock.calls[0][6]).toBe('claude');
  });

  it('reports no triage family to publication when triage was partial', async () => {
    const f = fixture();
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.publicationRun.mock.calls[0][5]).toBe(false);
    expect(f.publicationRun.mock.calls[0][6]).toBeNull();
  });

  it('does not publish when all lens lanes skipped for deadline', async () => {
    const f = fixture();
    f.lensRun.mockResolvedValue([{ lens: 'correctness-lifecycle', result: { status: 'partial', reason: 'deadline' } }]);
    await f.coordinator.drain('worker', Date.now() + 1000);
    expect(f.publicationRun).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', 'partial');
  });
  it.each([['diff-truncated', 'partial'], ['diff-complete', 'succeeded']] as const)('releases a run with %s coverage as %s', async (coverage, status) => {
    const f = fixture();
    f.contextRun.mockResolvedValue({ ...contextValue, coverage: [coverage] });
    f.triageRun.mockResolvedValue({ status: 'completed', family: 'codex', output: { schemaVersion: 1, headSha: sha, findings: [], coverage: [] } });
    await f.coordinator.drain('worker', Date.now() + 1000);
    expect(f.publicationRun).toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', status);
  });
  it('polls on startup only when discovery is at least 48 hours old', async () => {
    const f = fixture();
    expect(await f.coordinator.startupPoll(Date.now() - 47 * 60 * 60 * 1000)).toBe(0);
    expect(f.discover).not.toHaveBeenCalled();
    expect(await f.coordinator.startupPoll(Date.now() - 49 * 60 * 60 * 1000)).toBe(1);
    expect(f.discover).toHaveBeenCalledTimes(1);
  });

  it('reconciles the queue independently of startup discovery', async () => {
    const f = fixture();
    await f.coordinator.reconcileStartup();
    expect(f.discover).not.toHaveBeenCalled();
  });

  it('reuses a completed context checkpoint without rerunning context', async () => {
    const f = fixture();
    f.stages.set('context:0', { attemptId: claim.attemptId, stage: 'context', ordinal: 0, state: 'completed',
      startedAt: null, endedAt: null, outcome: 'completed', errorSummary: null, artifactHash: null, artifactPath: null });
    f.checkpoints.set('context:0', contextValue);
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.contextRun).not.toHaveBeenCalled();
    expect(f.triageRun).toHaveBeenCalledTimes(1);
  });

  it('restarts an interrupted context stage after lease recovery', async () => {
    const f = fixture();
    f.stages.set('context:0', { attemptId: claim.attemptId, stage: 'context', ordinal: 0, state: 'interrupted',
      startedAt: null, endedAt: null, outcome: 'interrupted', errorSummary: 'Lease expired', artifactHash: null, artifactPath: null });
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.contextRun).toHaveBeenCalledTimes(1);
    expect(f.stages.get('context:0')?.state).toBe('completed');
  });

  it('keeps triage retryable when the lane settings were unreadable, and runs it again on resume (M2)', async () => {
    const f = fixture();
    f.triageRun.mockResolvedValue({ status: 'partial', reason: 'lane-settings-unavailable' });
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.stages.get('triage:1')).toEqual(expect.objectContaining({ state: 'interrupted', outcome: 'partial',
      errorSummary: 'lane-settings-unavailable' }));
    expect(f.checkpoints.has('triage:1')).toBe(false);
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', 'partial');
    f.triageRun.mockResolvedValue({ status: 'completed', family: 'claude',
      output: { schemaVersion: 1, headSha: sha, findings: [], coverage: [] } });
    (f.repository.claimNext as jest.Mock).mockResolvedValueOnce(claim);
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.triageRun).toHaveBeenCalledTimes(2);
    expect(f.stages.get('triage:1')?.state).toBe('completed');
  });

  it('checkpoints a no-room triage as a completed stage', async () => {
    const f = fixture();
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.stages.get('triage:1')?.state).toBe('completed');
    expect(f.checkpoints.get('triage:1')).toEqual({ status: 'partial', reason: 'no-confirmed-room' });
  });

  it('keeps verification retryable when the lane settings were unreadable (M2)', async () => {
    const f = fixture();
    const finding = CandidateFindingSchema.parse({ schemaVersion: 1, lens: 'security-privacy', title: 'Unsafe output',
      failureMode: 'Leaks a token', affectedBehavior: 'Preview contains token', scenario: 'Open preview',
      path: 'src/a.ts', line: 1, evidence: [{ path: 'src/a.ts', line: 1, excerpt: 'token' }], affectedCaller: null,
      severity: 'Major', category: 'security', confidence: 0.9, suggestedDiff: null, fixPrompt: 'Remove token' });
    f.verificationRun.mockResolvedValue([{ lens: 'security-privacy', finding, verification: 'unavailable',
      result: { status: 'partial', reason: 'lane-settings-unavailable' } }]);
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.stages.get('verification:3')).toEqual(expect.objectContaining({ state: 'interrupted', outcome: 'partial',
      errorSummary: 'lane-settings-unavailable' }));
    expect(f.checkpoints.has('verification:3')).toBe(false);
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', 'partial');
  });

  it.each([['no room', 'no-confirmed-room'], ['deadline', 'deadline']])('marks %s partial', async (_case, reason) => {
    const f = fixture();
    f.triageRun.mockResolvedValue({ status: 'partial', reason });
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', 'partial');
  });

  describe('stage() abort paths leave no running row (M6, req 7.3)', () => {
    const running = (f: ReturnType<typeof fixture>) => [...f.stages.values()].filter((row) => row.state === 'running');

    it('closes a stage interrupted, with no checkpoint, when the abort lands while it runs', async () => {
      const f = fixture();
      const controller = new AbortController();
      f.triageRun.mockImplementationOnce(async () => { controller.abort(); return { status: 'partial', reason: 'aborted' }; });
      await f.coordinator.drain('worker', Date.now() + 10_000, controller.signal);
      expect(f.stages.get('triage:1')).toEqual(expect.objectContaining({ state: 'interrupted', outcome: null, errorSummary: null,
        endedAt: expect.any(String) }));
      expect(f.checkpoints.has('triage:1')).toBe(false);
      expect(running(f)).toEqual([]);
      expect(f.release).not.toHaveBeenCalled();
    });

    it('closes a stage interrupted when it throws after the abort, and saves no failure', async () => {
      const f = fixture();
      const controller = new AbortController();
      f.contextRun.mockImplementationOnce(async () => { controller.abort(); throw new Error('shutdown'); });
      await f.coordinator.drain('worker', Date.now() + 10_000, controller.signal);
      expect(f.stages.get('context:0')).toEqual(expect.objectContaining({ state: 'interrupted', errorSummary: null }));
      expect(running(f)).toEqual([]);
      expect(f.repository.saveFailure).not.toHaveBeenCalled();
    });

    it('closes a stage interrupted when the abort lands right after the running row is saved', async () => {
      const f = fixture();
      const controller = new AbortController();
      const saveStage = f.repository.saveStage.bind(f.repository);
      f.repository.saveStage = async (row) => {
        await saveStage(row);
        if (row.stage === 'triage' && row.state === 'running') controller.abort();
      };
      await f.coordinator.drain('worker', Date.now() + 10_000, controller.signal);
      expect(f.triageRun).not.toHaveBeenCalled();
      expect(f.stages.get('triage:1')?.state).toBe('interrupted');
      expect(running(f)).toEqual([]);
    });

    it('closes a stage interrupted when the abort lands after its checkpoint, so it reruns on resume', async () => {
      const f = fixture();
      const controller = new AbortController();
      const saveCheckpoint = f.repository.saveCheckpoint.bind(f.repository);
      f.repository.saveCheckpoint = async (id, name, ordinal, data) => {
        await saveCheckpoint(id, name, ordinal, data);
        if (name === 'triage') controller.abort();
      };
      await f.coordinator.drain('worker', Date.now() + 10_000, controller.signal);
      expect(f.stages.get('triage:1')?.state).toBe('interrupted');
      expect(running(f)).toEqual([]);
      (f.repository.claimNext as jest.Mock).mockResolvedValueOnce(claim);
      await f.coordinator.drain('worker', Date.now() + 10_000);
      expect(f.triageRun).toHaveBeenCalledTimes(2);
      expect(f.stages.get('triage:1')?.state).toBe('completed');
    });

    it('keeps the failed state when a stage throws without an abort', async () => {
      const f = fixture();
      f.triageRun.mockRejectedValueOnce(new Error('lane exploded'));
      await f.coordinator.drain('worker', Date.now() + 10_000);
      expect(f.stages.get('triage:1')).toEqual(expect.objectContaining({ state: 'failed', errorSummary: 'lane exploded' }));
      expect(f.repository.closeRunningStage).not.toHaveBeenCalled();
    });
  });

  it('supersedes when the head changes at a stage boundary', async () => {
    const f = fixture();
    let reads = 0;
    jest.spyOn(f.github, 'getPull').mockImplementation(async () => ({ number: 1, headSha: ++reads === 1 ? sha : 'c'.repeat(40),
      baseSha: 'b'.repeat(40), state: 'open', draft: false, authorLogin: 'maintainer', headRepoId: 1, baseRepoId: 1, headIsFork: false }));
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.contextRun).toHaveBeenCalledTimes(1);
    expect(f.triageRun).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', 'superseded');
  });

  it('stops when trust is revoked on recheck', async () => {
    const f = fixture();
    let reads = 0;
    jest.spyOn(f.github, 'getPull').mockImplementation(async () => ({ number: 1, headSha: sha,
      baseSha: 'b'.repeat(40), state: 'open', draft: ++reads > 1, authorLogin: 'maintainer', headRepoId: 1, baseRepoId: 1, headIsFork: false }));
    await f.coordinator.drain('worker', Date.now() + 10_000);
    expect(f.triageRun).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledWith(claim.attemptId, 'worker', 'superseded');
  });
});


describe('TriageStageRunner lane usage (M6)', () => {
  const run: ReviewLaneRunUsage = { inputTokens: 10, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null,
    costUsd: null, model: null, partial: true };
  const lane = { lane: 'codex', model: null, family: 'codex', fallback: [] };

  function triage(result: () => Promise<ReviewLaneResult>) {
    const { repository, laneAttempt } = fixture();
    const order: string[] = [];
    (repository.beginStageLaneRun as jest.Mock).mockImplementation(async () => { order.push('begin'); });
    (repository.saveStageLane as jest.Mock).mockImplementation(async () => { order.push('save'); });
    const lanes = Object.create(ReviewLaneRunner.prototype) as ReviewLaneRunner;
    const laneRun = jest.spyOn(lanes, 'run').mockImplementation(async () => { order.push('run'); return result(); });
    const runner = new TriageStageRunner(lanes, repository);
    return { repository, order, laneRun, run: (signal?: AbortSignal) => runner.run(claim, contextValue, 10_000_000, laneAttempt, signal) };
  }

  it('records the lane and usage of a lane that returned after the abort (req 7.1, 7.6)', async () => {
    const controller = new AbortController();
    const t = triage(async () => { controller.abort(); return { status: 'partial', reason: 'aborted', lane, run }; });
    await expect(t.run(controller.signal)).resolves.toEqual({ status: 'partial', reason: 'aborted', lane, run });
    expect(t.order).toEqual(['begin', 'run', 'save']);
    expect(t.repository.beginStageLaneRun).toHaveBeenCalledWith(claim.attemptId, 'triage', 1);
    expect(t.repository.saveStageLane).toHaveBeenCalledWith(claim.attemptId, 'triage', 1, lane, run);
  });

  it('ends the pending run with no lane when the result has none', async () => {
    const t = triage(async () => ({ status: 'partial', reason: 'lane-settings-unavailable' }));
    await t.run();
    expect(t.repository.saveStageLane).toHaveBeenCalledWith(claim.attemptId, 'triage', 1, null, undefined);
  });

  it('removes the pending run and rethrows when the lane runner throws before selection (req 7.2)', async () => {
    const t = triage(async () => { throw new Error('Invalid run deadline'); });
    await expect(t.run()).rejects.toThrow('Invalid run deadline');
    expect(t.order).toEqual(['begin', 'run', 'save']);
    expect(t.repository.saveStageLane).toHaveBeenCalledWith(claim.attemptId, 'triage', 1, null, undefined);
  });

  it('rethrows the lane error when removing the pending run also fails', async () => {
    const t = triage(async () => { throw new Error('lane exploded'); });
    (t.repository.saveStageLane as jest.Mock).mockRejectedValue(new Error('disk full'));
    await expect(t.run()).rejects.toThrow('lane exploded');
  });
});
