import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  SessionStatsRepository,
  SessionStoreDatabase,
  type SessionUsageContribution,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import type { Logger } from '@ptah-extension/vscode-core';
import { UsageAnalyticsService } from './usage-summary.service';
import { RepositoryIdentityBackfillService } from './repository-identity-backfill.service';
import { CodexSource } from './sources/codex.source';
import { OpenCodeSource } from './sources/opencode.source';
import { GrokSource } from './sources/grok.source';
import { CliSessionSource } from './cli-session.source';
import { workspaceMatches } from './sources/file-facts';
import type { UsageContribution, UsageSource } from './usage-source.types';

/**
 * TASK_2026_2321 req 6.1-6.5, assumption S2, A10: a review lane's spend is
 * written once, under the reviewed checkout (folder A), and no other path
 * (transcript replay, disk sources, the attempt root) adds a second copy or
 * leaks it into another folder. Real SQLite ledger, no mocked repository.
 */
describe('review lane spend in the usage summary', () => {
  const FOLDER_A = '/work/reviewed-repo';
  const FOLDER_B = '/work/other-repo';
  const ATTEMPT_ROOT = '/userdata/review/attempts/run-1/attempt-1';
  const LANE_SESSION = 'lane-session-1';
  const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;

  let dir: string;
  let store: SessionStoreDatabase;
  let repository: SessionStatsRepository;

  const base: SessionUsageContribution = {
    sessionId: LANE_SESSION,
    producer: 'cli-lane',
    runId: 'agent-1',
    turnId: '1',
    eventKey: 'agent-1:t1',
    modelId: 'gpt-5',
    providerId: 'codex',
    occurredAtMs: today,
    inputTokens: 100,
    outputTokens: 40,
    cacheReadTokens: 10,
    cacheWriteTokens: 0,
    knownCostMicroUsd: 1_500_000,
    costAuthority: 'provider-reported',
    source: 'live',
    pricingVersion: null,
    revision: 1,
    workspaceKey: FOLDER_A,
    host: 'cli',
  };

  const empty = { contributions: [], status: { sourceId: 'external', status: 'complete' as const } };

  function service(codexDisk: readonly UsageContribution[] = []): UsageAnalyticsService {
    // A stub UsageSource that applies the production cwd filter (equal-or-under).
    const codexStub: UsageSource = {
      read: async (workspacePath) => ({
        contributions: codexDisk.filter((fact) => workspaceMatches(fact.workspaceRoot, workspacePath)),
        status: { sourceId: 'codex', status: 'complete' },
      }),
    };
    jest.spyOn(CodexSource.prototype, 'read').mockImplementation((workspacePath, since, until, signal) =>
      codexStub.read(workspacePath, since, until, signal));
    for (const source of [OpenCodeSource, GrokSource, CliSessionSource]) {
      jest.spyOn(source.prototype, 'read').mockResolvedValue(empty);
    }
    return new UsageAnalyticsService({ read: async () => empty },
      { price: async () => ({ costUsd: null, cacheSavingsUsd: null, costSource: 'unpriced', priceSource: 'unavailable' }) },
      { warn: jest.fn() }, repository);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ptah-review-lane-spend-'));
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as Logger;
    store = new SessionStoreDatabase(join(dir, 'sessions.sqlite'), logger,
      (file) => new DatabaseSync(file) as unknown as SqliteDatabase);
    repository = new SessionStatsRepository(store);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** (i) the live lane row (override key A), (ii) its replay under the attempt root. */
  async function seedLaneAndReplay(): Promise<void> {
    await repository.recordUsage(base);
    await repository.recordUsage({
      ...base,
      producer: 'transcript-replay',
      eventKey: 'replay:agent-1:t1',
      source: 'replay',
      workspaceKey: ATTEMPT_ROOT,
    });
  }

  // (iii) a Codex disk fact whose cwd is the attempt root.
  const codexDiskFact: UsageContribution = {
    key: 'rollout:evt-1', sourceId: 'codex', timestampMs: today, providerId: 'codex', modelId: 'gpt-5',
    inputUncachedTokens: 100, cacheReadTokens: 10, cacheWriteTokens: 0, outputTokens: 40,
    sessionId: 'native-thread-1', workspaceRoot: ATTEMPT_ROOT,
  };

  function tokenTotal(summary: Awaited<ReturnType<UsageAnalyticsService['summarize']>>): number {
    return summary.facts.reduce((sum, fact) => sum + fact.inputUncachedTokens + fact.outputTokens
      + fact.cacheReadTokens + fact.cacheWriteTokens, 0);
  }

  it('counts the lane turn once in folder A across ledger, replay and disk paths (6.2, 6.3, P1-P4)', async () => {
    await seedLaneAndReplay();
    const summary = await service([codexDiskFact]).summarize({ range: 7 }, FOLDER_A);
    expect(tokenTotal(summary)).toBe(150);
    expect(summary.facts).toHaveLength(1);
    expect(summary.facts[0]).toMatchObject({ providerId: 'codex', sourceId: 'claude-ledger',
      costSource: 'provider-reported', costUsd: 1.5, inputUncachedTokens: 100, outputTokens: 40, cacheReadTokens: 10 });
  });

  it('shows nothing for a second registered folder B (6.1, A10)', async () => {
    await seedLaneAndReplay();
    const summary = await service([codexDiskFact]).summarize({ range: 7 }, FOLDER_B);
    expect(summary.facts).toEqual([]);
    expect(summary.sessionCount).toBe(0);
    expect(summary.messageCount).toBe(0);
    expect(summary.topSessions).toEqual([]);
  });

  it('reports one session, one message and one top session for the lane in A (A10)', async () => {
    await seedLaneAndReplay();
    const summary = await service([codexDiskFact]).summarize({ range: 7 }, FOLDER_A);
    expect(summary.sessionCount).toBe(1);
    expect(summary.messageCount).toBe(1);
    expect(summary.topSessions ?? []).toHaveLength(1);
    expect(summary.topSessions?.[0]).toMatchObject({ sessionId: LANE_SESSION, messageCount: 1, tokens: 150, costUsd: 1.5 });
  });

  it('keeps an unpriced lane turn unpriced, never a zero cost (6.4)', async () => {
    await repository.recordUsage({ ...base, knownCostMicroUsd: null, costAuthority: 'unpriced' });
    const summary = await service().summarize({ range: 7 }, FOLDER_A);
    expect(summary.facts).toHaveLength(1);
    expect(summary.facts[0]).toMatchObject({ costSource: 'unpriced', costUsd: null });
    expect(tokenTotal(summary)).toBe(150);
    expect(summary.topSessions?.[0]).toMatchObject({ sessionId: LANE_SESSION, costUsd: null, unpriced: true });
  });

  it('puts a row keyed only with the attempt root in neither folder (6.5)', async () => {
    await repository.recordUsage({ ...base, sessionId: 'orphan-session', eventKey: 'orphan:t1', workspaceKey: ATTEMPT_ROOT });
    const sut = service([codexDiskFact]);
    for (const folder of [FOLDER_A, FOLDER_B]) {
      const summary = await sut.summarize({ range: 7 }, folder);
      expect(summary.facts).toEqual([]);
      expect(summary.sessionCount).toBe(0);
      expect(summary.topSessions).toEqual([]);
    }
  });

  it('lists the turn once under repositories after the backfill resolves folder A (P6, S2)', async () => {
    await seedLaneAndReplay();
    const resolve = jest.fn(async (path: string) => path === FOLDER_A
      ? { repositoryId: 'repo-a', worktreePath: FOLDER_A }
      : { repositoryId: `nogit:${path}`, worktreePath: path });
    await new RepositoryIdentityBackfillService(repository, { resolve }, { debug: jest.fn() }).runOnce();
    const summary = await service([codexDiskFact]).summarize({ range: 7 }, FOLDER_A);
    expect(summary.repositories).toHaveLength(1);
    expect(summary.repositories?.[0]).toMatchObject({ repositoryId: 'repo-a', inputTokens: 100, outputTokens: 40,
      cacheReadTokens: 10, knownCostMicroUsd: 1_500_000, worktreePaths: [FOLDER_A] });
    // The replay row resolved to the attempt root, never to the reviewed repository.
    const other = await service().summarize({ range: 7 }, FOLDER_B);
    expect(other.repositories ?? []).toEqual([]);
  });

  describe('reconciler and finalization seeing a lane that already has a ledger row', () => {
    it('does not let a replay with the lane event key overwrite or duplicate the live row', async () => {
      await repository.recordUsage(base);
      await expect(repository.recordUsage({ ...base, producer: 'transcript-replay', source: 'replay',
        workspaceKey: ATTEMPT_ROOT })).rejects.toThrow(/another producer/);
      const summary = await service().summarize({ range: 7 }, FOLDER_A);
      expect(tokenTotal(summary)).toBe(150);
      expect(summary.messageCount).toBe(1);
    });

    it('keeps one copy in A when the replay is written again and finalization is requested', async () => {
      await seedLaneAndReplay();
      await repository.recordUsage({ ...base, producer: 'transcript-replay', eventKey: 'replay:agent-1:t1',
        source: 'replay', workspaceKey: ATTEMPT_ROOT, revision: 2 });
      await repository.requestFinalization(LANE_SESSION);
      const summary = await service([codexDiskFact]).summarize({ range: 7 }, FOLDER_A);
      expect(tokenTotal(summary)).toBe(150);
      expect(summary.sessionCount).toBe(1);
      expect(summary.messageCount).toBe(1);
      expect(summary.topSessions ?? []).toHaveLength(1);
    });

    it('counts a re-recorded identical live event once (same key converges)', async () => {
      await repository.recordUsage(base);
      await repository.recordUsage(base);
      const summary = await service().summarize({ range: 7 }, FOLDER_A);
      expect(tokenTotal(summary)).toBe(150);
      expect(summary.messageCount).toBe(1);
    });
  });
});
