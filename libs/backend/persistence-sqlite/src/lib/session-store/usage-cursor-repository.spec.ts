import 'reflect-metadata';
import { DatabaseSync } from 'node:sqlite';
import type { SessionUsageContribution } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SqliteDatabase } from '../sqlite-connection.service';
import { SqliteMigrationRunner } from '../migration-runner';
import { SESSION_STORE_MIGRATIONS } from './session-store-migrations';
import { SessionStatsRepository } from './session-stats-repository';
import { SqliteUsageCursorRepository, type UsageSourceCursor } from './usage-cursor-repository';

function sqlValue(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number' || value === null) return value;
  throw new Error('Unexpected SQL parameter');
}

function openStore(maxVersion = 6) {
  const raw = new DatabaseSync(':memory:');
  for (const migration of SESSION_STORE_MIGRATIONS.filter((item) => item.version <= maxVersion))
    if (migration.sql) raw.exec(migration.sql);
  const db: Pick<SqliteDatabase, 'exec' | 'prepare'> = {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const statement = raw.prepare(sql);
      return {
        run: (...values: unknown[]) => {
          const result = statement.run(...values.map(sqlValue));
          return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
        },
        get: (...values: unknown[]) => statement.get(...values.map(sqlValue)),
        all: (...values: unknown[]) => statement.all(...values.map(sqlValue)),
        iterate: function* (...values: unknown[]): IterableIterator<unknown> {
          yield* statement.iterate(...values.map(sqlValue));
        },
      };
    },
  };
  const store = { ready: async () => db };
  const stats = new SessionStatsRepository(store);
  return { raw, db, store, stats, cursors: new SqliteUsageCursorRepository(store, stats) };
}

const cursor: UsageSourceCursor = {
  sourceId: 'claude-jsonl', sourcePath: '/synthetic/session.jsonl',
  fingerprint: 'fixture-a', mtimeMs: 100, byteOffset: 20, lastEventKey: 'replay-1',
};

const replay: SessionUsageContribution = {
  sessionId: 'session-a', producer: 'transcript-replay', runId: 'run-a',
  nativeThreadId: null, turnId: 'turn-a', eventKey: 'replay-1',
  parentSessionId: null, subagentId: null, providerId: 'anthropic',
  occurredAtMs: 100, revision: 1, models: [{ modelId: 'model-a',
    inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0,
    knownCostMicroUsd: 5, costAuthority: 'provider-reported' }],
  totalCostMicroUsd: 5, totalCostAuthority: 'provider-reported',
  pricingVersion: null, workspaceKey: '/synthetic', host: 'electron',
  source: 'replay', missingReason: null, billable: true,
  coverageStartMs: null, coverageEndMs: null,
};

describe('SqliteUsageCursorRepository', () => {
  it('upgrades a populated version-4 ledger once and skips S0005/S0006 on rerun', async () => {
    const { raw, db } = openStore(4);
    try {
      raw.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
        INSERT INTO schema_migrations VALUES (1, 1), (2, 1), (3, 1), (4, 1);
        INSERT INTO session_usage_turns
          (session_id, producer, run_id, turn_id, model_id, event_key, occurred_at_ms,
           provider_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
           cost_authority, source, revision)
          VALUES ('session-a','sdk-owner','run-a','turn-a','model-a','legacy-key',100,
            'anthropic',1,0,0,0,'unpriced','live',1)`);
      const logger: Logger = Object.create(null);
      logger.info = jest.fn();
      logger.warn = jest.fn();
      logger.error = jest.fn();
      logger.debug = jest.fn();
      const runner = new SqliteMigrationRunner(db as SqliteDatabase, logger);
      expect((await runner.applyAll(SESSION_STORE_MIGRATIONS, { vecExtensionLoaded: false })).appliedVersions)
        .toEqual([5, 6]);
      expect((await runner.applyAll(SESSION_STORE_MIGRATIONS, { vecExtensionLoaded: false })).appliedVersions)
        .toEqual([]);
      expect(raw.prepare('SELECT COUNT(*) AS count FROM session_usage_turns').get()).toMatchObject({ count: 1 });
      expect(raw.prepare('SELECT COUNT(*) AS count FROM usage_source_cursor').get()).toMatchObject({ count: 0 });
    } finally { raw.close(); }
  });

  it('commits replay and cursor together and repeats a chunk without changing totals', async () => {
    const { raw, cursors, stats } = openStore();
    try {
      await cursors.commit(cursor, [replay]);
      await cursors.commit(cursor, [replay]);
      expect(await cursors.load(cursor.sourceId, cursor.sourcePath)).toEqual(cursor);
      expect(raw.prepare('SELECT COUNT(*) AS count FROM session_usage_turns').get()).toMatchObject({ count: 1 });
      expect((await stats.getSessionStats('session-a', '/synthetic'))?.input_tokens).toBe(10);
      expect((await stats.getWorkspaceCoverage('/synthetic'))?.first_captured_at_ms).toBe(100);
    } finally { raw.close(); }
  });

  it('rolls back the cursor and all replay rows when a later replay write fails', async () => {
    const { raw, cursors } = openStore();
    try {
      await cursors.commit(cursor, [replay]);
      const next = { ...cursor, byteOffset: 40, lastEventKey: 'bad' };
      const bad = { ...replay, eventKey: 'bad', occurredAtMs: 200,
        models: [{ ...replay.models[0], inputTokens: Number.MAX_SAFE_INTEGER }] };
      await expect(cursors.commit(next, [{ ...replay, eventKey: 'replay-2' }, bad]))
        .rejects.toThrow();
      expect(await cursors.load(cursor.sourceId, cursor.sourcePath)).toEqual(cursor);
      expect(raw.prepare('SELECT COUNT(*) AS count FROM session_usage_turns').get()).toMatchObject({ count: 1 });
    } finally { raw.close(); }
  });

  it('demotes historical replay when a measured live owner arrives later', async () => {
    const { raw, cursors, stats } = openStore();
    try {
      await cursors.commit(cursor, [replay]);
      await stats.recordUsage({ sessionId: 'session-a', producer: 'sdk-owner',
        runId: 'run-a', turnId: 'turn-live', eventKey: 'live-1', modelId: 'model-a',
        providerId: 'anthropic', occurredAtMs: 100, inputTokens: 20, outputTokens: 1,
        cacheReadTokens: 0, cacheWriteTokens: 0, knownCostMicroUsd: 7,
        costAuthority: 'provider-reported', source: 'live', pricingVersion: null,
        revision: 1, workspaceKey: '/synthetic', host: 'electron',
        coverageStartMs: 90, coverageEndMs: 110 });
      expect(raw.prepare("SELECT billable FROM session_usage_turns WHERE source = 'replay'").get()).toMatchObject({ billable: 0 });
      expect((await stats.getSessionStats('session-a', '/synthetic'))?.input_tokens).toBe(20);
    } finally { raw.close(); }
  });

  it('commits more than the live sink queue capacity through the replay transaction', async () => {
    const { raw, cursors } = openStore();
    try {
      const events = Array.from({ length: 257 }, (_, index) => ({
        ...replay, eventKey: `replay-${index}`, occurredAtMs: 100 + index,
      }));
      await cursors.commit({ ...cursor, byteOffset: 257, lastEventKey: 'replay-256' }, events);
      expect(raw.prepare('SELECT COUNT(*) AS count FROM session_usage_turns').get())
        .toMatchObject({ count: 257 });
    } finally { raw.close(); }
  });

  it('allows replay billing when the live lane has only unknown counters', async () => {
    const { raw, cursors, stats } = openStore();
    try {
      await stats.recordUsage({ sessionId: 'session-a', producer: 'cli-lane',
        runId: 'run-a', turnId: 'turn-live', eventKey: 'live-unknown', modelId: 'model-a',
        providerId: 'anthropic', occurredAtMs: 100, inputTokens: null,
        outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null,
        knownCostMicroUsd: null, costAuthority: 'unpriced', source: 'live',
        pricingVersion: null, revision: 1, workspaceKey: '/synthetic', host: 'electron',
        coverageStartMs: 90, coverageEndMs: 110 });
      await cursors.commit(cursor, [replay]);
      expect(raw.prepare("SELECT billable FROM session_usage_turns WHERE source = 'replay'").get())
        .toMatchObject({ billable: 1 });
      expect((await stats.getSessionStats('session-a', '/synthetic'))?.input_tokens).toBe(10);
    } finally { raw.close(); }
  });

  it('does not bill replay inside a measured Codex checkpoint main thread', async () => {
    const { raw, cursors, stats } = openStore();
    try {
      await stats.recordUsage({ sessionId: 'session-a', producer: 'codex-checkpoint',
        runId: 'thread-a', nativeThreadId: 'thread-a', turnId: 'turn-live',
        eventKey: 'checkpoint-1', modelId: 'model-a', providerId: 'codex',
        occurredAtMs: 100, inputTokens: 20, outputTokens: 1,
        cacheReadTokens: 0, cacheWriteTokens: 0, knownCostMicroUsd: 7,
        costAuthority: 'provider-reported', source: 'live', pricingVersion: null,
        revision: 1, workspaceKey: '/synthetic', host: 'electron',
        coverageStartMs: 90, coverageEndMs: 110 });
      await cursors.commit({ ...cursor, sourceId: 'codex-rollout' }, [{ ...replay,
        providerId: 'codex', nativeThreadId: 'thread-a' }]);
      expect(raw.prepare("SELECT billable FROM session_usage_turns WHERE source = 'replay'").get())
        .toMatchObject({ billable: 0 });
      expect((await stats.getSessionStats('session-a', '/synthetic'))?.input_tokens).toBe(20);
    } finally { raw.close(); }
  });
});
