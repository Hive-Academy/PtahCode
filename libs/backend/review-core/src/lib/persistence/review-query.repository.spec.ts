import 'reflect-metadata';
import { MIGRATIONS, SqliteConnectionService, type SqliteDatabase } from '@ptah-extension/persistence-sqlite';
import { Logger } from '@ptah-extension/vscode-core';
import { z } from 'zod';
import { REVIEW_STAGE_USAGE_RUNS_MAX, ReviewRunSchema } from '@ptah-extension/review-contracts';
import type { ReviewLaneRunUsage } from '../lanes/review-lane-usage';
import { ReviewQueryRepository } from './review-query.repository';
import { SqliteReviewRepository } from './sqlite-review.repository';

describe('ReviewQueryRepository', () => {
  it('binds cursor parameters and filters partial runs by persisted result', async () => {
    const Database = require('better-sqlite3') as new (path: string) => SqliteDatabase;
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      const migration = MIGRATIONS.find((entry) => entry.version === 65);
      if (!migration?.sql) throw new Error('Review migration missing');
      db.exec(migration.sql);
      for (const version of [67, 68]) {
        const addition = MIGRATIONS.find((entry) => entry.version === version);
        if (!addition?.sql) throw new Error('Review migration missing: ' + version);
        db.exec(addition.sql);
      }
      const now = Date.UTC(2026, 0, 1);
      const sha = 'a'.repeat(40);
      db.prepare(`INSERT INTO review_repositories (repo_id, owner, name, created_at, updated_at)
        VALUES ('hive-academy/ptahcode', 'Hive-Academy', 'PtahCode', ?, ?)`).run(now, now);
      db.prepare(`INSERT INTO review_heads (repo_id, pr_number, head_sha, state, discovered_at)
        VALUES ('hive-academy/ptahcode', 1, ?, 'active', ?)`).run(sha, now);
      const insert = db.prepare(`INSERT INTO review_attempts
        (attempt_id, repo_id, pr_number, head_sha, attempt_number, trigger, state, result_status,
        queued_at, ended_at, deadline_at, config_snapshot_hash)
        VALUES (?, 'hive-academy/ptahcode', 1, ?, ?, 'manual', 'completed', ?, ?, ?, ?, ?)`);
      insert.run('a1', sha, 1, 'partial', now + 1, now + 11, now + 1000, sha);
      insert.run('a2', sha, 2, 'succeeded', now + 2, now + 12, now + 1000, sha);
      insert.run('a3', sha, 3, 'partial', now + 3, now + 13, now + 1000, sha);
      const checkpoint = db.prepare(`INSERT INTO review_stages (attempt_id, stage, ordinal, state, outcome)
        VALUES (?, 'checkpoint:context', 0, 'completed', '{"coverage":["src"]}')`);
      for (const id of ['a1', 'a2', 'a3']) checkpoint.run(id);
      db.prepare(`INSERT INTO review_attempts
        (attempt_id, repo_id, pr_number, head_sha, attempt_number, trigger, state, queued_at)
        VALUES ('a4', 'hive-academy/ptahcode', 1, ?, 4, 'manual', 'queued', ?)`)
        .run(sha, now + 4);
      db.prepare(`INSERT INTO review_attempts
        (attempt_id, repo_id, pr_number, head_sha, attempt_number, trigger, state, result_status, queued_at, ended_at)
        VALUES ('a5', 'hive-academy/ptahcode', 1, ?, 5, 'automatic', 'cancelled', 'superseded', ?, ?)`)
        .run(sha, now + 5, now + 6);
      db.prepare(`INSERT INTO review_stages (attempt_id, stage, ordinal, state, outcome, error_summary)
        VALUES ('a3', 'lens:security-privacy', 0, 'interrupted', 'partial', 'deadline')`).run();
      const findingId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
      const secret = `ghp_${'a'.repeat(30)}`;
      const finding = { schemaVersion: 1, lens: 'security-privacy', title: 'Credential exposure',
        failureMode: `Leaks ${secret}`, affectedBehavior: 'Credential visible', scenario: 'Export after review',
        path: 'src/review.ts', line: 3, evidence: [{ path: 'src/review.ts', line: 3, excerpt: 'token output' }],
        affectedCaller: null, severity: 'Major', category: 'security', confidence: 0.9,
        verification: 'cross-family', suggestedDiff: null, fixPrompt: 'Remove credential output' };
      db.prepare(`INSERT INTO review_findings
        (finding_id, repo_id, pr_number, path, category, status, severity, confidence,
         payload_json, first_head_sha, last_head_sha, created_at, updated_at)
        VALUES (?, 'hive-academy/ptahcode', 1, 'src/review.ts', 'security', 'open', 'Major', 0.9,
          ?, ?, ?, ?, ?)`).run(findingId, JSON.stringify(finding), sha, sha, now, now);
      db.prepare(`INSERT INTO review_finding_events (event_id, attempt_id, finding_id, kind, created_at)
        VALUES ('event', 'a3', ?, 'accepted', ?)`).run(findingId, now);
      const logger = Object.create(Logger.prototype) as Logger;
      const connection = new SqliteConnectionService(':memory:', logger);
      Object.defineProperty(connection, 'db', { value: db });
      const query = new ReviewQueryRepository(connection);
      db.prepare(`UPDATE review_repositories SET poll_status = 'failed', poll_error = 'github-poll-failed'
        WHERE repo_id = 'hive-academy/ptahcode'`).run();
      db.prepare(`INSERT INTO review_poll_state (repo_id, last_error_at, last_error)
        VALUES ('hive-academy/ptahcode', ?, 'github-poll-failed')`).run(now + 5);
      expect(await query.getRun('a4')).toMatchObject({ configHash: null, deadlineAt: null, coverage: [] });
      db.pragma('foreign_keys = OFF');
      db.prepare('DELETE FROM review_heads WHERE repo_id = ? AND pr_number = ? AND head_sha = ?')
        .run('hive-academy/ptahcode', 1, sha);
      db.pragma('foreign_keys = ON');
      expect(await query.getRun('a4')).toMatchObject({ headRetry: null });
      expect((await query.listRuns({ limit: 10 })).runs.find((run) => run.attemptId === 'a4'))
        .toMatchObject({ headRetry: null });
      db.prepare(`INSERT INTO review_heads (repo_id, pr_number, head_sha, state, discovered_at)
        VALUES ('hive-academy/ptahcode', 1, ?, 'active', ?)`).run(sha, now);
      expect((await query.listRuns({ limit: 10 })).runs.find((run) => run.attemptId === 'a5'))
        .toMatchObject({ status: 'superseded' });
      expect(await query.getRun('a5')).toMatchObject({ status: 'superseded' });
      db.prepare(`UPDATE review_attempts SET result_status = NULL WHERE attempt_id = 'a5'`).run();
      expect((await query.listRuns({ limit: 10 })).runs.find((run) => run.attemptId === 'a5'))
        .toMatchObject({ status: 'superseded' });
      expect((await query.getRun('a3'))?.stages).toMatchObject([{ name: 'lenses', scope: 'security-privacy',
        status: 'partial', error: 'deadline' }]);
      for (const stage of ['discovery', 'context', 'checks', 'triage', 'lens:correctness-lifecycle',
        'lens:contracts-callers', 'lens:host-di-config', 'verification']) {
        db.prepare(`INSERT INTO review_stages (attempt_id, stage, ordinal, state)
          VALUES ('a3', ?, 0, 'completed')`).run(stage);
      }
      expect((await query.getRun('a3'))?.stages).toHaveLength(9);
      const findings = await query.listFindings('a3');
      expect(findings).toHaveLength(1);
      expect(JSON.stringify(findings)).not.toContain(secret);
      // A configured secret has no token shape: only the secrets list can remove it.
      const configured = await query.listFindings('a3', ['Credential']);
      expect(configured[0].title).toBe('[redacted] exposure');
      expect(JSON.stringify(configured)).not.toContain('Credential');
      // The identity that the renderer sends back must equal the identity of the thread lookup.
      expect((await query.listPublishedTitles('a3', ['Credential']))[0].title).toBe(configured[0].title);
      expect(await query.listPublishedTitles('a3', [])).toEqual([{ findingId, path: 'src/review.ts', line: 3,
        title: 'Credential exposure', publishedTitle: 'Credential exposure' }]);
      const first = await query.listRuns({ state: 'partial', limit: 1 });
      expect(first.poll).toEqual({ status: 'failed', error: 'github-poll-failed', lastSuccessAt: null,
        lastErrorAt: new Date(now + 5).toISOString() });
      db.prepare(`INSERT INTO review_repositories (repo_id, owner, name, enabled, poll_status, poll_error, created_at, updated_at)
        VALUES ('other/repo', 'Other', 'Repo', 1, 'failed', 'other-poll-failed', ?, ?)`).run(now, now);
      db.prepare(`INSERT INTO review_poll_state (repo_id, last_error_at, last_error)
        VALUES ('other/repo', ?, 'other-poll-failed')`).run(now + 10);
      expect((await query.listRuns({ limit: 10 })).poll.error).toBe('other-poll-failed');
      expect((await query.listRuns({ repo: { owner: 'Hive-Academy', name: 'PtahCode' }, limit: 10 })).poll.error)
        .toBe('github-poll-failed');
      db.prepare(`UPDATE review_repositories SET enabled = 0 WHERE repo_id = 'other/repo'`).run();
      expect((await query.listRuns({ limit: 10 })).poll.error).toBe('github-poll-failed');
      expect(first.runs.map((run) => run.attemptId)).toEqual(['a3']);
      expect(first.nextCursor).not.toBeNull();
      const second = await query.listRuns({ state: 'partial', limit: 1, cursor: first.nextCursor ?? undefined });
      expect(second.runs.map((run) => run.attemptId)).toEqual(['a1']);
      expect(second.nextCursor).toBeNull();
    } finally { db.close(); }
  });

  it('projects lane records onto their stages, ignores invalid ones, and renders older runs with nulls (Req 4.7, 4.8)', async () => {
    const Database = require('better-sqlite3') as new (path: string) => SqliteDatabase;
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      for (const version of [65, 67, 68]) {
        const migration = MIGRATIONS.find((entry) => entry.version === version);
        if (!migration?.sql) throw new Error('Review migration missing: ' + version);
        db.exec(migration.sql);
      }
      const now = Date.UTC(2026, 0, 1);
      const sha = 'a'.repeat(40);
      db.prepare(`INSERT INTO review_repositories (repo_id, owner, name, created_at, updated_at)
        VALUES ('hive-academy/ptahcode', 'Hive-Academy', 'PtahCode', ?, ?)`).run(now, now);
      db.prepare(`INSERT INTO review_heads (repo_id, pr_number, head_sha, state, discovered_at)
        VALUES ('hive-academy/ptahcode', 1, ?, 'active', ?)`).run(sha, now);
      const attempt = db.prepare(`INSERT INTO review_attempts
        (attempt_id, repo_id, pr_number, head_sha, attempt_number, trigger, state, result_status, queued_at, ended_at)
        VALUES (?, 'hive-academy/ptahcode', 1, ?, ?, 'manual', 'completed', 'succeeded', ?, ?)`);
      attempt.run('lanes', sha, 1, now + 1, now + 2);
      attempt.run('older', sha, 2, now + 3, now + 4);
      const stage = db.prepare(`INSERT INTO review_stages (attempt_id, stage, ordinal, state, outcome, family, started_at, ended_at)
        VALUES (?, ?, ?, 'completed', ?, ?, ?, ?)`);
      stage.run('lanes', 'triage', 1, 'completed', 'claude', now + 10, now + 11);
      stage.run('lanes', 'lens:security-privacy', 0, 'completed', 'codex', now + 12, now + 13);
      stage.run('lanes', 'verification', 3, 'completed', 'gemini', now + 14, now + 15);
      stage.run('lanes', 'checkpoint:lane:triage', 1, JSON.stringify({ version: 1, lane: 'claude', model: null, family: 'claude',
        fallback: [{ source: 'pin', lane: 'ptah-cli:pc-gone', model: 'model-x', reason: 'lane-not-listed' }] }), null, null, null);
      stage.run('lanes', 'checkpoint:lane:lens:security-privacy', 0, JSON.stringify({ version: 1, lane: 'codex', model: 'gpt-model',
        family: 'codex', fallback: [] }), null, null, null);
      // Wrong ordinal: belongs to no displayed stage.
      stage.run('lanes', 'checkpoint:lane:verification', 0, JSON.stringify({ version: 1, lane: 'gemini', model: null,
        family: 'gemini', fallback: [] }), null, null, null);
      stage.run('lanes', 'checkpoint:lane:verification', 3, '{not json', null, null, null);
      stage.run('older', 'triage', 1, 'completed', null, now + 20, now + 21);
      const logger = Object.create(Logger.prototype) as Logger;
      const connection = new SqliteConnectionService(':memory:', logger);
      Object.defineProperty(connection, 'db', { value: db });
      const query = new ReviewQueryRepository(connection);
      const run = await query.getRun('lanes');
      expect(run?.stages).toEqual([
        expect.objectContaining({ name: 'triage', family: 'claude', lane: 'claude', model: null,
          fallback: [{ source: 'pin', lane: 'ptah-cli:pc-gone', model: 'model-x', reason: 'lane-not-listed' }] }),
        expect.objectContaining({ name: 'lenses', scope: 'security-privacy', family: 'codex', lane: 'codex', model: 'gpt-model', fallback: [] }),
        expect.objectContaining({ name: 'verification', family: 'gemini', lane: null, model: null, fallback: null }),
      ]);
      expect((await query.getRun('older'))?.stages).toEqual([
        expect.objectContaining({ name: 'triage', family: null, lane: null, model: null, fallback: null }),
      ]);
      expect((await query.listRuns({ limit: 10 })).runs.find((entry) => entry.attemptId === 'lanes')?.stages).toHaveLength(3);
    } finally { db.close(); }
  });

  describe('lane usage on runs and stages', () => {
    const at = (offset: number): string => new Date(Date.UTC(2026, 0, 1) + offset).toISOString();
    const target = { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 1, headSha: 'a'.repeat(40) };
    const LENS = 'lens:security-privacy';
    const run = (inputTokens: number, costUsd: number | null = 0.25): ReviewLaneRunUsage => ({ inputTokens, outputTokens: 5,
      cacheReadTokens: 1, cacheWriteTokens: 2, costUsd, model: 'model-a', partial: false });
    const use = (lane: string) => ({ lane, model: 'model-a', family: lane, fallback: [] });
    const row = (attemptId: string, stage: string, startedAt: string, ordinal = 0) => ({ attemptId, stage, ordinal, state: 'running' as const,
      startedAt, endedAt: null, outcome: null, errorSummary: null, artifactHash: null, artifactPath: null });

    function setup() {
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
      return { db, repository: new SqliteReviewRepository(connection, logger), query: new ReviewQueryRepository(connection) };
    }

    async function claimed(repository: SqliteReviewRepository, leaseEnd = at(100_000)): Promise<string> {
      const attempt = await repository.enqueueDiscovered(target, at(0));
      await repository.claimNext('owner', at(1), leaseEnd);
      return attempt.attemptId;
    }

    async function laneRun(repository: SqliteReviewRepository, attemptId: string, stage: string, lane: string | null,
      usage?: ReviewLaneRunUsage, ordinal = 0): Promise<void> {
      await repository.beginStageLaneRun(attemptId, stage, ordinal);
      await repository.saveStageLane(attemptId, stage, ordinal, lane === null ? null : use(lane), usage);
    }

    it('shows the latest lane of a rerun stage and sums both runs into the stage and the run (A1, req 2.3, 3.1)', async () => {
      const { db, repository, query } = setup();
      try {
        const id = await claimed(repository);
        await repository.saveStage(row(id, LENS, at(2)));
        await laneRun(repository, id, LENS, 'codex', run(10));
        await laneRun(repository, id, LENS, 'claude', run(20, 0.5));
        await repository.saveStage({ ...row(id, 'triage', at(3), 1) });
        await laneRun(repository, id, 'triage', 'gemini', run(1), 1);
        const result = await query.getRun(id);
        const lens = { inputTokens: 30, outputTokens: 10, cacheReadTokens: 2, cacheWriteTokens: 4, totalTokens: 46, costUsd: 0.75,
          tokensPartial: false, costPartial: false, runs: 2 };
        expect(result?.stages).toEqual([expect.objectContaining({ name: 'lenses', lane: 'claude', usage: lens }),
          expect.objectContaining({ name: 'triage', lane: 'gemini', usage: { ...lens, inputTokens: 1, outputTokens: 5,
            cacheReadTokens: 1, cacheWriteTokens: 2, totalTokens: 9, costUsd: 0.25, runs: 1 } })]);
        expect(result?.usage).toEqual({ inputTokens: 31, outputTokens: 15, cacheReadTokens: 3, cacheWriteTokens: 6, totalTokens: 55,
          costUsd: 1, tokensPartial: false, costPartial: false, runs: 3 });
        expect(ReviewRunSchema.parse(result)).toEqual(result);
      } finally { db.close(); }
    });

    it('leaves usage absent on a stage whose lane was refused before spawn (req 1.5)', async () => {
      const { db, repository, query } = setup();
      try {
        const id = await claimed(repository);
        await repository.saveStage(row(id, LENS, at(2)));
        await laneRun(repository, id, LENS, null);
        const result = await query.getRun(id);
        expect(result?.stages[0]).not.toHaveProperty('usage');
        expect(result).not.toHaveProperty('usage');
      } finally { db.close(); }
    });

    it('reads a begun stage as interrupted after lease reconciliation, keeps earlier usage, and marks both partial (req 7.7)', async () => {
      const { db, repository, query } = setup();
      try {
        const id = await claimed(repository, at(5));
        await repository.saveStage(row(id, LENS, at(2)));
        await laneRun(repository, id, LENS, 'codex', run(10));
        // The process dies after begin: no save, no in-process close.
        await repository.beginStageLaneRun(id, LENS, 0);
        expect(await repository.reconcileExpiredLeases(at(6))).toBe(1);
        const result = await query.getRun(id);
        expect(result?.stages).toEqual([expect.objectContaining({ name: 'lenses', status: 'interrupted', lane: 'codex' })]);
        expect(result?.stages[0].usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadTokens: null, cacheWriteTokens: null,
          totalTokens: 18, costUsd: 0.25, tokensPartial: true, costPartial: true, runs: 2 });
        expect(result?.usage).toEqual(result?.stages[0].usage);
      } finally { db.close(); }
    });

    it('counts an overflowed stage list as partial with one extra unknown run (F9)', async () => {
      const { db, repository, query } = setup();
      try {
        const id = await claimed(repository);
        await repository.saveStage(row(id, LENS, at(2)));
        for (let index = 0; index < REVIEW_STAGE_USAGE_RUNS_MAX; index += 1) await laneRun(repository, id, LENS, 'codex', run(1));
        await laneRun(repository, id, LENS, 'codex', run(1));
        const usage = (await query.getRun(id))?.stages[0].usage;
        expect(usage).toMatchObject({ inputTokens: REVIEW_STAGE_USAGE_RUNS_MAX, tokensPartial: true, costPartial: true,
          runs: REVIEW_STAGE_USAGE_RUNS_MAX + 1 });
      } finally { db.close(); }
    });

    it('returns runs whose lane documents hold more than 256 runs in total (F8)', async () => {
      const { db, repository, query } = setup();
      try {
        const id = await claimed(repository);
        for (let stage = 0; stage < 17; stage += 1)
          for (let index = 0; index < REVIEW_STAGE_USAGE_RUNS_MAX; index += 1) await laneRun(repository, id, `lens:extra-${stage}`, 'codex', run(1));
        const expected = { inputTokens: 272, outputTokens: 1360, runs: 272, tokensPartial: false, costPartial: false };
        expect((await query.getRun(id))?.usage).toMatchObject(expected);
        expect((await query.listRuns({ limit: 10 })).runs.find((entry) => entry.attemptId === id)?.usage).toMatchObject(expected);
      } finally { db.close(); }
    });

    it('keeps rows and lane documents this build writes readable by the pre-change readers (NFR a, b)', async () => {
      const { db, repository } = setup();
      try {
        const id = await claimed(repository);
        await repository.saveStage(row(id, LENS, at(2)));
        await laneRun(repository, id, LENS, 'codex', run(1));
        await repository.saveStage(row(id, 'verification', at(3), 3));
        await repository.beginStageLaneRun(id, 'verification', 3);
        await repository.closeRunningStage(id, 'verification', 3, at(3), at(4));
        // Copies of the pre-change readers.
        const stageState = z.enum(['queued', 'running', 'completed', 'failed', 'interrupted', 'skipped']);
        const oldStageSchema = z.object({ stage: z.string(), ordinal: z.number(), state: stageState, outcome: z.string().nullable(),
          family: z.string().nullable(), scope: z.string().nullable(), started_at: z.number().nullable(), ended_at: z.number().nullable(),
          error_summary: z.string().nullable(), artifact_path: z.string().nullable() });
        const oldLaneRecordSchema = z.object({ version: z.literal(1), lane: z.string().nullable(), model: z.string().nullable(),
          fallback: z.array(z.unknown()) });
        const stages = db.prepare(`SELECT stage, ordinal, state, outcome, family, scope, started_at, ended_at, error_summary, artifact_path
          FROM review_stages WHERE attempt_id = ? AND stage NOT LIKE 'checkpoint:%' ORDER BY ordinal`).all(id)
          .map((value) => oldStageSchema.parse(value));
        expect(stages.map(({ stage, state }) => ({ stage, state }))).toEqual([{ stage: LENS, state: 'running' },
          { stage: 'verification', state: 'interrupted' }]);
        const docs = db.prepare(`SELECT outcome FROM review_stages WHERE attempt_id = ? AND stage LIKE 'checkpoint:lane:%' ORDER BY stage`)
          .all(id).map((value) => oldLaneRecordSchema.parse(JSON.parse(z.object({ outcome: z.string() }).parse(value).outcome)));
        expect(docs).toEqual([{ version: 1, lane: 'codex', model: 'model-a', fallback: [] },
          { version: 1, lane: null, model: null, fallback: [] }]);
      } finally { db.close(); }
    });

    it('reads a run written before usage capture with usage absent and a valid response (req 2.4)', async () => {
      const { db, repository, query } = setup();
      try {
        const id = await claimed(repository);
        await repository.saveStage(row(id, LENS, at(2)));
        db.prepare(`INSERT INTO review_stages (attempt_id, stage, ordinal, state, outcome) VALUES (?, ?, 0, 'completed', ?)`)
          .run(id, `checkpoint:lane:${LENS}`, JSON.stringify({ version: 1, lane: 'codex', model: null, family: 'codex', fallback: [] }));
        const result = await query.getRun(id);
        expect(result?.stages).toEqual([expect.objectContaining({ lane: 'codex' })]);
        expect(result?.stages[0]).not.toHaveProperty('usage');
        expect(result).not.toHaveProperty('usage');
        expect(ReviewRunSchema.parse(result)).toEqual(result);
      } finally { db.close(); }
    });

    it('keeps the stored usage of a completed stage that a resume skips and counts it once (req 2.2)', async () => {
      const { db, repository, query } = setup();
      try {
        const id = await claimed(repository, at(5));
        await repository.saveStage(row(id, LENS, at(2)));
        await laneRun(repository, id, LENS, 'codex', run(10));
        await repository.saveStage({ ...row(id, LENS, at(2)), state: 'completed', endedAt: at(3), outcome: 'completed' });
        await repository.reconcileExpiredLeases(at(6));
        await repository.claimNext('new-owner', at(7), at(100_000));
        // The resume skips the completed lens and runs triage only.
        await repository.saveStage(row(id, 'triage', at(8), 1));
        await laneRun(repository, id, 'triage', 'claude', run(1), 1);
        const result = await query.getRun(id);
        expect(result?.stages).toEqual([expect.objectContaining({ name: 'lenses', status: 'succeeded', usage: expect.objectContaining({ inputTokens: 10, runs: 1 }) }),
          expect.objectContaining({ name: 'triage', usage: expect.objectContaining({ inputTokens: 1, runs: 1 }) })]);
        expect(result?.usage).toMatchObject({ inputTokens: 11, runs: 2, tokensPartial: false });
      } finally { db.close(); }
    });
  });
});
