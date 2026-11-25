import 'reflect-metadata';
import { MIGRATIONS, SqliteConnectionService, type SqliteDatabase } from '@ptah-extension/persistence-sqlite';
import { Logger } from '@ptah-extension/vscode-core';
import type { ReviewLaneCatalog, ReviewLaneSettings } from '@ptah-extension/review-contracts';
import type { IReviewRepository, ReviewStageRecord } from '../persistence/review-repository.interface';
import { ReviewLaneRunner, type IReviewLaneFiles, type IReviewLaneGateway, type ReviewLaneUse } from '../lanes/review-lane.runner';
import { ReviewLaneAdmissionService, type IReviewLaneClock } from '../lanes/review-lane-admission.service';
import { ReviewLaneAttempt } from '../lanes/review-lane-attempt';
import { ReviewLaneSpawnError, UNKNOWN_LANE_RUN_USAGE, type ReviewLaneRunUsage } from '../lanes/review-lane-usage';
import { ReviewQueryRepository } from '../persistence/review-query.repository';
import { SqliteReviewRepository } from '../persistence/sqlite-review.repository';
import type { ReviewLaneCandidate } from '../lanes/review-lane-list';
import { LensStageRunner } from './lens-stage.runner';
import type { ContextStageResult } from './context-stage.runner';
import type { ReviewQueueClaim } from '../review-queue.service';

const sha = 'a'.repeat(40);
const claim: ReviewQueueClaim = { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 1,
  headSha: sha, attemptId: 'attempt-1', trigger: 'poll', queuedAt: '', lease: { owner: 'worker', expiresAt: '' } };
const context: ContextStageResult = { attemptRoot: '/attempt', coverage: [], promptInput: {
  headSha: sha, title: '', body: '', diff: '', comments: '', fileContent: '', deterministicEvidence: '', repositoryRules: '',
} };
const operatorSettings = { repositories: [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }],
  maintainerLogins: ['maintainer'], pollMinutes: 10, globalPublicationPaused: false, laneCapPerPr: 6, fallbackFamilies: [] };
const lane = (id: string, family = id, limitState: ReviewLaneCandidate['limitState'] = 'confirmed-room'): ReviewLaneCandidate =>
  ({ id, label: id, family, limitState });
const THREE = [lane('codex'), lane('claude'), lane('gemini')];

function memoryRepository() {
  const stages = new Map<string, ReviewStageRecord>();
  const checkpoints = new Map<string, unknown>();
  const laneUses = new Map<string, ReviewLaneUse>();
  const order: string[] = [];
  const repository: IReviewRepository = {
    getLastReviewedHead: jest.fn().mockResolvedValue(null), getOpenFailures: jest.fn().mockResolvedValue([]),
    getLastPollAt: jest.fn().mockResolvedValue(null), recordPoll: jest.fn(), saveFailure: jest.fn(),
    enqueueDiscovered: jest.fn(), enqueueManual: jest.fn(), recordDraft: jest.fn(), claimNext: jest.fn(), heartbeat: jest.fn(), release: jest.fn(),
    reconcileExpiredLeases: jest.fn(), getAttempt: jest.fn(), getCurrentAttemptId: jest.fn().mockResolvedValue(claim.attemptId),
    getStages: async () => [...stages.values()],
    saveStage: async (stage) => { stages.set(stage.stage, stage); order.push(`stage:${stage.stage}:${stage.state}`); },
    saveCheckpoint: async (_id, stage, _ordinal, data) => { checkpoints.set(stage, data); },
    getCheckpoint: async (_id, stage) => checkpoints.get(stage) ?? null,
    beginStageLaneRun: jest.fn().mockResolvedValue(undefined),
    saveStageLane: async (_id, stage, _ordinal, use) => { if (use) laneUses.set(stage, use); order.push(`lane:${stage}`); },
    closeRunningStage: jest.fn().mockResolvedValue(undefined),
    getStatusSync: jest.fn().mockResolvedValue(null), saveStatusSync: jest.fn(),
    getPendingStatusSync: jest.fn().mockResolvedValue([]), getMachineStatusSync: jest.fn().mockResolvedValue([]),
    syncFindingResolution: jest.fn().mockResolvedValue(false),
  };
  return { repository, stages, checkpoints, laneUses, order };
}

interface HarnessOptions {
  /** One list per `list()` call; the last repeats. */
  lists?: ReviewLaneCandidate[][];
  settings?: ReviewLaneSettings;
  listModels?: IReviewLaneGateway['listModels'];
  spawn?: IReviewLaneGateway['spawn'];
  /** Replaces the in-memory fake, e.g. with a real SQLite repository. */
  repository?: IReviewRepository;
}

/** A real `ReviewLaneRunner` and `ReviewLaneAttempt` over a fake gateway, files and clock (the #1481 seam). */
function harness(options: HarnessOptions = {}) {
  const lists = options.lists ?? [THREE];
  let listCall = 0;
  const spawned: { laneId: string; model?: string }[] = [];
  const gateway: IReviewLaneGateway = {
    list: async () => ({ lanes: lists[Math.min(listCall++, lists.length - 1)], maxConcurrentAgents: 4 }),
    listModels: options.listModels ?? (async () => ({})),
    modelBlocked: (model) => model === 'blocked-model',
    spawn: async (input) => {
      spawned.push({ laneId: input.laneId, ...(input.model !== undefined ? { model: input.model } : {}) });
      return (await options.spawn?.(input)) ?? { usage: UNKNOWN_LANE_RUN_USAGE(false) };
    },
  };
  const files: IReviewLaneFiles = { prepare: async () => 'same', sourceChecksum: async () => 'same', clearOutput: async () => undefined,
    readOutput: async () => JSON.stringify({ schemaVersion: 1, headSha: sha, findings: [], coverage: [] }) };
  const clock: IReviewLaneClock = { now: () => 0, setTimeout, clearTimeout };
  const logger = { error: jest.fn() };
  const runner = new ReviewLaneRunner(gateway, files, clock, new ReviewLaneAdmissionService(clock), logger,
    { resolve: async () => ({ repoRoot: '/repo', attemptsRoot: '/attempts' }), settings: async () => operatorSettings, baseConfig: async () => null });
  const settings = options.settings ?? { pool: [], pins: {} };
  const store = { get: jest.fn(async () => settings), update: jest.fn() };
  const attempt = new ReviewLaneAttempt({ source: gateway, settings: store, clock, logger: { warn: jest.fn() } });
  const memory = memoryRepository();
  const lenses = new LensStageRunner(runner, options.repository ?? memory.repository);
  return { ...memory, gateway, spawned, attempt, store, logger,
    run: (target: ReviewQueueClaim = claim, signal?: AbortSignal, deadline = 10_000_000) =>
      lenses.run(target, context, deadline, attempt, signal) };
}

const families = (results: Awaited<ReturnType<ReturnType<typeof harness>['run']>>): (string | null)[] =>
  results.map(({ result }) => result.lane?.family ?? null);

describe('LensStageRunner checkpoints', () => {
  it('runs only lenses without a completed checkpoint after restart', async () => {
    const { repository, stages, checkpoints } = memoryRepository();
    const prior = 'lens:correctness-lifecycle';
    stages.set(prior, { attemptId: claim.attemptId, stage: prior, ordinal: 0, state: 'completed',
      startedAt: '', endedAt: '', outcome: 'completed', errorSummary: null, artifactHash: null, artifactPath: null });
    checkpoints.set(prior, { status: 'partial', reason: 'no-confirmed-room' });
    const lanes = Object.create(ReviewLaneRunner.prototype) as ReviewLaneRunner;
    const run = jest.spyOn(lanes, 'run').mockResolvedValue({ status: 'partial', reason: 'deadline' });
    run.mockResolvedValueOnce({ status: 'completed', family: 'codex', limitCheck: 'unavailable',
      output: { schemaVersion: 1, headSha: sha, findings: [], coverage: [] } });
    const attempt = harness().attempt;
    const results = await new LensStageRunner(lanes, repository).run(claim, context, Date.now() + 10_000, attempt);
    expect(results).toHaveLength(4);
    expect(results[0].result).toEqual({ status: 'partial', reason: 'no-confirmed-room' });
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls[0][0].attempt).toBe(attempt);
    expect(stages.get('lens:security-privacy')?.state).toBe('interrupted');
    expect(checkpoints.get('lens:security-privacy')).toEqual({ status: 'partial', reason: 'deadline' });
    expect(stages.get('lens:security-privacy')?.errorSummary).toBe('deadline');
    expect(stages.get('lens:contracts-callers')?.errorSummary).toBe('Ran without a limit check');
  });
});

describe('LensStageRunner lane diversity through the real lane runner (#1481)', () => {
  it('spreads lenses over the listed families with empty settings and sends no model (Req 2.1, 2.2)', async () => {
    const h = harness();
    const results = await h.run();
    expect(h.spawned.map(({ laneId }) => laneId)).toEqual(['codex', 'claude', 'gemini', 'codex']);
    expect(new Set(families(results)).size).toBeGreaterThan(1);
    expect(h.spawned.every((call) => !('model' in call))).toBe(true);
    expect(h.store.get).toHaveBeenCalledTimes(1);
  });

  it('uses the pool families in pool order, sends pool models, and never a lane outside the pool (Req 2.3, 2.5, 2.6)', async () => {
    const h = harness({ lists: [[...THREE, lane('copilot')]], settings: { pins: {}, pool: [
      { lane: 'gemini', model: 'gemini-model' }, { lane: 'codex', model: null }, { lane: 'claude', model: 'claude-model' },
    ] } });
    await h.run();
    expect(h.spawned).toEqual([{ laneId: 'gemini', model: 'gemini-model' }, { laneId: 'codex' },
      { laneId: 'claude', model: 'claude-model' }, { laneId: 'gemini', model: 'gemini-model' }]);
    expect(h.laneUses.get('lens:correctness-lifecycle')).toEqual({ lane: 'gemini', model: 'gemini-model', family: 'gemini', fallback: [] });
  });

  it('keeps every lens on a single-family pool (Req 2.4)', async () => {
    const h = harness({ settings: { pins: {}, pool: [{ lane: 'codex', model: null }, { lane: 'codex', model: 'codex-mini' }] } });
    const results = await h.run();
    expect(new Set(families(results))).toEqual(new Set(['codex']));
  });

  it('counts the family of a reused completed lens checkpoint (Req 2.7)', async () => {
    const h = harness();
    const prior = 'lens:correctness-lifecycle';
    h.stages.set(prior, { attemptId: claim.attemptId, stage: prior, ordinal: 0, state: 'completed',
      startedAt: '', endedAt: '', outcome: 'completed', errorSummary: null, artifactHash: null, artifactPath: null });
    // A checkpoint written before lane pools carries no `lane`; its family still counts.
    h.checkpoints.set(prior, { status: 'completed', family: 'claude', output: { schemaVersion: 1, headSha: sha, findings: [], coverage: [] } });
    const results = await h.run();
    expect(results[0].result).toMatchObject({ status: 'completed', family: 'claude' });
    expect(h.spawned.map(({ laneId }) => laneId)).toEqual(['codex', 'gemini', 'codex']);
  });

  it('does not choose a lane that turned at-limit between lenses (Req 2.8)', async () => {
    const h = harness({ lists: [THREE, [lane('codex'), lane('claude', 'claude', 'at-limit'), lane('gemini')]] });
    await h.run();
    expect(h.spawned.map(({ laneId }) => laneId)).toEqual(['codex', 'gemini', 'codex', 'codex']);
  });

  it('honours a lens pin and counts it for earlier and later lenses (Req 3.1, 3.2)', async () => {
    const h = harness({ settings: { pool: [], pins: { 'security-privacy': { lane: 'claude', model: 'claude-model' } } } });
    await h.run();
    expect(h.spawned).toEqual([{ laneId: 'codex' }, { laneId: 'gemini' }, { laneId: 'claude', model: 'claude-model' }, { laneId: 'codex' }]);
  });

  it('records an unavailable pin with its reason and falls back to the global order (Req 4.1, 4.3)', async () => {
    const h = harness({ settings: { pool: [], pins: {
      'correctness-lifecycle': { lane: 'ptah-cli:pc-gone', model: null },
      'contracts-callers': { lane: 'claude', model: 'blocked-model' },
    } } });
    await h.run();
    expect(h.laneUses.get('lens:correctness-lifecycle')).toEqual({ lane: 'codex', model: null, family: 'codex',
      fallback: [{ source: 'pin', lane: 'ptah-cli:pc-gone', model: null, reason: 'lane-not-listed' }] });
    expect(h.laneUses.get('lens:contracts-callers')).toMatchObject({ lane: 'claude',
      fallback: [{ source: 'pin', lane: 'claude', model: 'blocked-model', reason: 'model-blocked' }] });
    expect(h.order.indexOf('lane:lens:correctness-lifecycle'))
      .toBeLessThan(h.order.indexOf('stage:lens:correctness-lifecycle:completed'));
  });

  it('records skipped pool entries in order and skips a model a readable catalog does not offer (Req 4.1, 4.4)', async () => {
    const catalog: ReviewLaneCatalog = { status: 'read', models: ['codex-other'], truncated: false, verifiable: true };
    const h = harness({ listModels: async () => ({ codex: catalog }), settings: { pins: {}, pool: [
      { lane: 'missing', model: null }, { lane: 'codex', model: 'codex-retired' }, { lane: 'gemini', model: null },
    ] } });
    await h.run();
    expect(h.laneUses.get('lens:correctness-lifecycle')).toEqual({ lane: 'gemini', model: null, family: 'gemini', fallback: [
      { source: 'pool', lane: 'missing', model: null, reason: 'lane-not-listed' },
      { source: 'pool', lane: 'codex', model: 'codex-retired', reason: 'model-not-offered' },
    ] });
  });

  it('passes the saved model unchecked when the catalog cannot be read (Req 4.2)', async () => {
    const h = harness({ listModels: async () => { throw new Error('catalog offline'); },
      settings: { pins: {}, pool: [{ lane: 'codex', model: 'codex-saved' }] } });
    await h.run();
    expect(h.spawned[0]).toEqual({ laneId: 'codex', model: 'codex-saved' });
  });

  it('ends every lens no-confirmed-room when no pool entry is available, and records why (Req 4.5)', async () => {
    const h = harness({ settings: { pins: {}, pool: [{ lane: 'missing', model: null }] } });
    const results = await h.run();
    expect(results.map(({ result }) => result.status === 'partial' ? result.reason : 'completed'))
      .toEqual(Array(4).fill('no-confirmed-room'));
    expect(h.spawned).toEqual([]);
    expect(h.stages.get('lens:host-di-config')?.state).toBe('interrupted');
    expect(h.laneUses.get('lens:host-di-config')).toEqual({ lane: null, model: null, family: null,
      fallback: [{ source: 'pool', lane: 'missing', model: null, reason: 'lane-not-listed' }] });
  });

  it('does not retry a started lane that fails (Req 4.6)', async () => {
    let calls = 0;
    const h = harness({ spawn: async () => {
      if (++calls === 1) throw new Error('status-failed: quota');
      return { usage: UNKNOWN_LANE_RUN_USAGE(false) };
    } });
    const results = await h.run();
    expect(results[0].result).toMatchObject({ status: 'partial', reason: 'status-failed: quota', lane: { lane: 'codex' } });
    expect(h.spawned).toHaveLength(4);
    // The failed lane's family still counts as used, so the next lens moves on.
    expect(h.spawned[1].laneId).toBe('claude');
  });
});

describe('LensStageRunner lane usage and abort (M6) on in-memory SQLite', () => {
  const FIRST = 'lens:correctness-lifecycle';
  const at = (offset: number): string => new Date(Date.UTC(2026, 0, 1) + offset).toISOString();
  const usage = (inputTokens: number | null, partial = false): ReviewLaneRunUsage => ({ inputTokens, outputTokens: null,
    cacheReadTokens: null, cacheWriteTokens: null, costUsd: null, model: null, partial });

  async function sqlite() {
    const Database = require('better-sqlite3') as new (path: string) => SqliteDatabase;
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const version of [65, 66, 67, 68, 69]) {
      const migration = MIGRATIONS.find((entry) => entry.version === version);
      if (!migration?.sql) throw new Error('Review migration missing: ' + version);
      db.exec(migration.sql);
    }
    const logger = Object.create(Logger.prototype) as Logger;
    logger.info = jest.fn();
    const connection = new SqliteConnectionService(':memory:', logger);
    Object.defineProperty(connection, 'db', { value: db });
    const repository = new SqliteReviewRepository(connection, logger);
    const attempt = await repository.enqueueDiscovered({ repo: claim.repo, prNumber: claim.prNumber, headSha: sha }, at(0));
    await repository.claimNext('owner', at(1), at(100_000));
    const target: ReviewQueueClaim = { ...claim, attemptId: attempt.attemptId };
    const row = (stage: string) => db.prepare(`SELECT state, outcome, family, error_summary AS errorSummary, ended_at AS endedAt
      FROM review_stages WHERE attempt_id = ? AND stage = ? AND ordinal = 0`).get(target.attemptId, stage) as
      { state: string; outcome: string | null; family: string | null; errorSummary: string | null; endedAt: number | null } | undefined;
    const lensStage = async (scope: string) => (await new ReviewQueryRepository(connection).getRun(target.attemptId))
      ?.stages.find((stage) => stage.name === 'lenses' && stage.scope === scope);
    const running = () => db.prepare(`SELECT COUNT(*) AS n FROM review_stages WHERE state = 'running'`).get();
    return { db, repository, target, row, lensStage, running };
  }

  /** A gateway spawn that aborts the caller mid-lane and still reports the usage read so far. */
  const abortingSpawn = (controller: AbortController, inputTokens: number): IReviewLaneGateway['spawn'] =>
    async () => { controller.abort(); return { usage: usage(inputTokens) }; };

  it('records the lane and usage of a lane that ran before the abort and leaves the row interrupted (req 7.1, 7.3, 7.6)', async () => {
    const store = await sqlite();
    try {
      const controller = new AbortController();
      const h = harness({ repository: store.repository, spawn: abortingSpawn(controller, 7) });
      expect(await h.run(store.target, controller.signal)).toEqual([]);
      expect(h.spawned).toHaveLength(1);
      expect(store.row(FIRST)).toMatchObject({ state: 'interrupted', outcome: null, family: 'codex', errorSummary: null });
      expect(store.row(FIRST)?.endedAt).not.toBeNull();
      expect(await store.repository.getCheckpoint(store.target.attemptId, FIRST, 0)).toBeNull();
      expect(await store.lensStage('correctness-lifecycle')).toMatchObject({ status: 'interrupted', lane: 'codex',
        usage: { inputTokens: 7, runs: 1 } });
      expect(store.running()).toEqual({ n: 0 });
    } finally { store.db.close(); }
  });

  it('shows the lane, usage and tokensPartial of a started lane that rejected, keeping the partial outcome (req 1.6, A5)', async () => {
    const store = await sqlite();
    try {
      let calls = 0;
      const h = harness({ repository: store.repository, spawn: async () => {
        if (++calls === 1) throw new ReviewLaneSpawnError(new Error('status-failed: quota'), true, usage(10, true));
        return { usage: usage(1) };
      } });
      const results = await h.run(store.target);
      expect(results[0].result).toMatchObject({ status: 'partial', reason: 'status-failed: quota', lane: { lane: 'codex' } });
      expect(store.row(FIRST)).toMatchObject({ state: 'interrupted', outcome: 'partial', errorSummary: 'status-failed: quota' });
      expect(store.row('lens:contracts-callers')).toMatchObject({ state: 'completed', outcome: 'completed' });
      expect(await store.lensStage('correctness-lifecycle')).toMatchObject({ status: 'partial', lane: 'codex',
        usage: { inputTokens: 10, tokensPartial: true, runs: 1 } });
    } finally { store.db.close(); }
  });

  it('fails a lens that throws before a lane is chosen, with no lane and no runs (req 7.2)', async () => {
    const store = await sqlite();
    try {
      const h = harness({ repository: store.repository });
      await expect(h.run(store.target, undefined, Number.NaN)).rejects.toThrow('Invalid run deadline');
      expect(h.spawned).toEqual([]);
      expect(store.row(FIRST)).toMatchObject({ state: 'failed', family: null, errorSummary: 'Invalid run deadline' });
      const stage = await store.lensStage('correctness-lifecycle');
      expect(stage).toMatchObject({ status: 'failed', lane: null });
      expect(stage?.usage).toBeUndefined();
    } finally { store.db.close(); }
  });

  it('closes the row interrupted and clears the pending run when the lens throws after an abort', async () => {
    const store = await sqlite();
    try {
      const controller = new AbortController();
      const h = harness({ repository: store.repository });
      jest.spyOn(h.gateway, 'list').mockImplementation(async () => { controller.abort(); throw new Error('list offline'); });
      await expect(h.run(store.target, controller.signal)).rejects.toThrow('list offline');
      expect(store.row(FIRST)).toMatchObject({ state: 'interrupted', errorSummary: null });
      expect((await store.lensStage('correctness-lifecycle'))?.usage).toBeUndefined();
      expect(store.running()).toEqual({ n: 0 });
    } finally { store.db.close(); }
  });

  /** The stored lane document of the first lens, with one stale pending marker an earlier crash left. */
  async function withStaleMarker(store: Awaited<ReturnType<typeof sqlite>>) {
    await store.repository.beginStageLaneRun(store.target.attemptId, FIRST, 0);
    return () => store.repository.getCheckpoint(store.target.attemptId, `lane:${FIRST}`, 0);
  }

  it('leaves an older stored lane document untouched when the lens throws before begin (P2 m3)', async () => {
    const store = await sqlite();
    try {
      const laneDoc = await withStaleMarker(store);
      const before = await laneDoc();
      jest.spyOn(store.repository, 'beginStageLaneRun').mockRejectedValueOnce(new Error('begin failed'));
      const save = jest.spyOn(store.repository, 'saveStageLane');
      const h = harness({ repository: store.repository });
      await expect(h.run(store.target)).rejects.toThrow('begin failed');
      expect(save).not.toHaveBeenCalled();
      expect(h.spawned).toEqual([]);
      expect(await laneDoc()).toEqual(before);
      expect(store.row(FIRST)).toMatchObject({ state: 'failed', errorSummary: 'begin failed' });
    } finally { store.db.close(); }
  });

  it('keeps the saved run and the older marker when the lens throws after the lane save (P2 m3)', async () => {
    const store = await sqlite();
    try {
      const laneDoc = await withStaleMarker(store);
      jest.spyOn(store.repository, 'saveCheckpoint').mockRejectedValueOnce(new Error('checkpoint failed'));
      const h = harness({ repository: store.repository, spawn: async () => ({ usage: usage(5) }) });
      await expect(h.run(store.target)).rejects.toThrow('checkpoint failed');
      const runs = (await laneDoc() as { usage: { runs: { ended: boolean; inputTokens: number | null }[] } }).usage.runs;
      expect(runs).toEqual([expect.objectContaining({ ended: false }), expect.objectContaining({ ended: true, inputTokens: 5 })]);
      expect(store.row(FIRST)).toMatchObject({ state: 'failed', family: 'codex', errorSummary: 'checkpoint failed' });
    } finally { store.db.close(); }
  });

  it('keeps this run\'s pending marker when saving the returned lane fails, so usage reads partial', async () => {
    const store = await sqlite();
    try {
      const laneDoc = await withStaleMarker(store);
      const save = jest.spyOn(store.repository, 'saveStageLane').mockRejectedValueOnce(new Error('lane save failed'));
      const h = harness({ repository: store.repository, spawn: async () => ({ usage: usage(5) }) });
      await expect(h.run(store.target)).rejects.toThrow('lane save failed');
      expect(save).toHaveBeenCalledTimes(1);
      const runs = (await laneDoc() as { usage: { runs: { ended: boolean }[] } }).usage.runs;
      expect(runs).toEqual([expect.objectContaining({ ended: false }), expect.objectContaining({ ended: false })]);
      expect((await store.lensStage('correctness-lifecycle'))?.usage).toMatchObject({ tokensPartial: true });
      expect(store.row(FIRST)).toMatchObject({ state: 'failed', errorSummary: 'lane save failed' });
    } finally { store.db.close(); }
  });

  it('reruns an aborted lens on resume: the new lane replaces the old one and usage sums (req 7.4)', async () => {
    const store = await sqlite();
    try {
      const controller = new AbortController();
      await harness({ repository: store.repository, spawn: abortingSpawn(controller, 7) }).run(store.target, controller.signal);
      const resumed = harness({ repository: store.repository, lists: [[lane('claude'), lane('gemini')]],
        spawn: async () => ({ usage: usage(20) }) });
      expect(await resumed.run(store.target)).toHaveLength(4);
      expect(resumed.spawned[0].laneId).toBe('claude');
      expect(store.row(FIRST)).toMatchObject({ state: 'completed', outcome: 'completed', family: 'claude' });
      expect(await store.lensStage('correctness-lifecycle')).toMatchObject({ status: 'succeeded', lane: 'claude',
        usage: { inputTokens: 27, runs: 2 } });
    } finally { store.db.close(); }
  });

  it('overwrites a stale family with null when the rerun finds no lane (req 7.5)', async () => {
    const store = await sqlite();
    try {
      const controller = new AbortController();
      await harness({ repository: store.repository, spawn: abortingSpawn(controller, 7) }).run(store.target, controller.signal);
      expect(store.row(FIRST)?.family).toBe('codex');
      await harness({ repository: store.repository, settings: { pins: {}, pool: [{ lane: 'missing', model: null }] } }).run(store.target);
      expect(store.row(FIRST)).toMatchObject({ state: 'interrupted', outcome: 'partial', family: null, errorSummary: 'no-confirmed-room' });
      expect(await store.lensStage('correctness-lifecycle')).toMatchObject({ lane: null, family: null,
        usage: { inputTokens: 7, runs: 1 } });
    } finally { store.db.close(); }
  });
});
