import 'reflect-metadata';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  normalizeWorkspaceRoot as platformWorkspaceKey,
  type SessionUsageContribution as LiveContribution,
} from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SqliteDatabase } from '../sqlite-connection.service';
import { SqliteMigrationRunner } from '../migration-runner';
import { ledgerKeyFoldsCase, ledgerWorkspaceKey } from './ledger-workspace-key';
import { rewriteLedgerWorkspaceKeys } from './ledger-workspace-key-rewrite';
import { SessionStoreDatabase } from './session-store-database';
import { SESSION_STORE_MIGRATIONS } from './session-store-migrations';
import { SessionStatsRepository } from './session-stats-repository';
import { SqliteSessionRecordRepository } from './sqlite-session-record-repository';
import { SqliteSessionUsageSink } from './sqlite-session-usage-sink';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

const openDb = (file: string): SqliteDatabase =>
  new DatabaseSync(file) as unknown as SqliteDatabase;

const DAY_MS = 86_400_000;

/** Run `body` as if the host were `platform`; the ledger key reads process.platform per call. */
async function onPlatform<T>(platform: NodeJS.Platform, body: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    return await body();
  } finally {
    if (original) Object.defineProperty(process, 'platform', original);
  }
}

function liveEvent(
  sessionId: string,
  workspaceKey: string,
  producer: LiveContribution['producer'] = 'provider-session',
): LiveContribution {
  return {
    sessionId, producer, runId: `${sessionId}-run`, turnId: null,
    eventKey: `${sessionId}-result`, parentSessionId: null, subagentId: null,
    providerId: 'antigravity', occurredAtMs: 1_000, revision: 1,
    models: [{ modelId: 'gemini', inputTokens: 7, outputTokens: 3, cacheReadTokens: 0,
      cacheCreationTokens: 0, knownCostMicroUsd: 42, costAuthority: 'model-priced' }],
    totalCostMicroUsd: 42, totalCostAuthority: 'model-priced', pricingVersion: 'v1',
    workspaceKey, host: 'electron', source: 'live', billable: true,
  };
}

function session(sessionId: string, workspacePath: string) {
  return { sessionId, workspacePath, name: sessionId, createdAt: 1, lastActiveAt: 2,
    isChild: false, summary: {}, detail: {} };
}

describe('ledgerWorkspaceKey', () => {
  it.each<[string, NodeJS.Platform, string]>([
    ['C:\\Users\\Dev\\Proj\\', 'linux', 'c:/users/dev/proj'],
    ['C:/Users/Dev/Proj', 'linux', 'c:/users/dev/proj'],
    ['\\\\Server\\Share\\Proj', 'linux', '//server/share/proj'],
    ['C:\\Users\\Dev\\Proj', 'win32', 'c:/users/dev/proj'],
    ['/Users/Dev/Proj/', 'darwin', '/users/dev/proj'],
    ['/home/u/Proj//', 'linux', '/home/u/Proj'],
    ['/home/u/proj', 'linux', '/home/u/proj'],
    ['/', 'linux', '/'],
  ])('%s on %s is %s, and applying it again changes nothing', (input, platform, key) => {
    expect(ledgerWorkspaceKey(input, platform)).toBe(key);
    expect(ledgerWorkspaceKey(key, platform)).toBe(key);
  });

  it('folds case only for Windows-style paths or on a Windows or macOS host', () => {
    expect(ledgerKeyFoldsCase('/home/u/Proj', 'linux')).toBe(false);
    expect(ledgerKeyFoldsCase('d:/x', 'linux')).toBe(true);
    expect(ledgerKeyFoldsCase('/home/u/Proj', 'darwin')).toBe(true);
    expect(ledgerKeyFoldsCase('/home/u/Proj', 'win32')).toBe(true);
  });
});

describe('session store workspace key round trip', () => {
  let dir: string;
  let store: SessionStoreDatabase;
  let records: SqliteSessionRecordRepository;
  let stats: SessionStatsRepository;
  let sink: SqliteSessionUsageSink;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-ledger-key-'));
    store = new SessionStoreDatabase(path.join(dir, 'sessions.sqlite'), logger, openDb);
    records = new SqliteSessionRecordRepository(store, 'electron');
    stats = new SessionStatsRepository(store);
    sink = new SqliteSessionUsageSink(stats, { error: jest.fn() });
  });
  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each<[string, NodeJS.Platform, string, string]>([
    // [host, platform, raw path, another spelling of the same folder on that host]
    ['Windows', 'win32', 'C:\\Users\\Dev\\Proj', 'c:/users/dev/proj'],
    ['macOS', 'darwin', '/Users/Dev/Proj', '/users/dev/proj/'],
    ['Linux', 'linux', '/home/dev/Proj', '/home/dev/Proj/'],
  ])('a %s workspace written by the record and the usage sink reads back by its path', (_host, platform, root, alias) =>
    onPlatform(platform, async () => {
      const sessionId = 'session-a';
      await records.upsert(session(sessionId, root));
      await sink.recordUsage(liveEvent(sessionId, root));

      const db = await store.ready();
      const key = ledgerWorkspaceKey(root, platform);
      expect(db.prepare('SELECT workspace_key AS list, ledger_workspace_key AS ledger FROM sessions').get())
        .toEqual({ list: platformWorkspaceKey(root), ledger: key });
      expect(db.prepare('SELECT DISTINCT workspace_key AS key FROM session_usage_turns').all()).toEqual([{ key }]);
      expect(db.prepare('SELECT workspace_key AS key FROM session_stats').get()).toEqual({ key });
      expect(db.prepare('SELECT workspace_key AS key FROM session_usage_coverage').all()).toEqual([{ key }]);

      for (const spelling of [root, alias]) {
        expect(await stats.getWorkspaceUsageGroups(spelling, 0, DAY_MS)).toEqual([expect.objectContaining({
          provider_id: 'antigravity', input_tokens: 7, known_cost_micro_usd: 42, session_count: 1 })]);
        expect(await stats.getSessionStats(sessionId, spelling)).toMatchObject({ input_tokens: 7 });
        expect(await stats.getWorkspaceCoverage(spelling)).toEqual({
          first_captured_at_ms: 1_000, last_captured_at_ms: 1_000 });
        expect(await stats.getWorkspaceSessionCount(spelling, 0, DAY_MS)).toBe(1);
        expect(await stats.getSessionModelUsage(sessionId, spelling, 0, DAY_MS))
          .toEqual([expect.objectContaining({ model_id: 'gemini', input_tokens: 7 })]);
        // The sidebar range read (session-stats-ledger-reader) adds this count.
        expect(await stats.getSessionUsageEventCount(sessionId, spelling, 0, DAY_MS)).toBe(1);
        expect(await stats.getWorkspaceTopSessions(spelling, 0, DAY_MS))
          .toEqual([expect.objectContaining({ session_id: sessionId, title: sessionId })]);
      }
      expect((await records.listForWorkspace(root)).map((row) => row.sessionId)).toEqual([sessionId]);
      expect((await records.get(sessionId))?.workspacePath).toBe(root);
      expect(await sink.readSessionUsage(sessionId, 'provider-session')).toMatchObject({ events: 1 });
    }));

  it('on Linux keeps /home/u/Proj and /home/u/proj apart from two producers through to Analytics', () =>
    onPlatform('linux', async () => {
      // A provider session with a session record, and a CLI lane with none.
      await records.upsert(session('upper', '/home/u/Proj'));
      await sink.recordUsage(liveEvent('upper', '/home/u/Proj'));
      await sink.recordUsage(liveEvent('lower', '/home/u/proj', 'cli-lane'));

      for (const [root, sessionId] of [['/home/u/Proj', 'upper'], ['/home/u/proj', 'lower']]) {
        expect(await stats.getWorkspaceSessionCount(root, 0, DAY_MS)).toBe(1);
        expect(await stats.getWorkspaceTopSessions(root, 0, DAY_MS))
          .toEqual([expect.objectContaining({ session_id: sessionId })]);
        expect(await stats.getWorkspaceCoverage(root)).not.toBeNull();
        expect(await stats.getSessionStats(sessionId, root)).not.toBeNull();
      }
      expect(await stats.getSessionStats('upper', '/home/u/proj')).toBeNull();
      expect(await stats.getWorkspaceSessionCount('/HOME/U/PROJ', 0, DAY_MS)).toBe(0);
    }));

  it('folds a Windows-style path on Linux, so a renderer echo and a lane cwd meet', () =>
    onPlatform('linux', async () => {
      await sink.recordUsage(liveEvent('a', 'C:\\Work\\Proj'));
      expect(await stats.getWorkspaceSessionCount('c:/work/proj/', 0, DAY_MS)).toBe(1);
      expect(await stats.getWorkspaceSessionCount('C:\\Work\\Other', 0, DAY_MS)).toBe(0);
    }));

  it('keeps the session list exact: folders that differ only by case are two lists', async () => {
    await records.upsert(session('upper', '/home/u/Proj'));
    await records.upsert(session('lower', '/home/u/proj'));
    await records.upsert(session('slash', '/home/u/Proj/'));
    expect((await records.listForWorkspace('/home/u/Proj')).map((row) => row.sessionId).sort())
      .toEqual(['slash', 'upper']);
    expect((await records.listForWorkspace('/home/u/proj')).map((row) => row.sessionId)).toEqual(['lower']);
    expect(await records.listForWorkspace('/HOME/U/PROJ')).toEqual([]);
  });
});

/** sessions.sqlite at S0009, with rows written by the old producers (keys already lowercased). */
function legacyDb(sessions: readonly [string, string][], turns: readonly [string, string][],
  stats: readonly [string, string][], coverage: readonly [string, number, number][]): SqliteDatabase {
  const raw = new DatabaseSync(':memory:');
  for (const migration of SESSION_STORE_MIGRATIONS.filter((item) => item.version <= 9)) {
    if (migration.sql) raw.exec(migration.sql);
  }
  const insertSession = raw.prepare(`INSERT INTO sessions (session_id, workspace_key, workspace_path, host,
    name, created_at, last_active_at, summary_json, detail_json, updated_at)
    VALUES (?, ?, ?, 'electron', 'S', 1, 2, '{}', '{}', 1)`);
  for (const [id, workspacePath] of sessions) insertSession.run(id, workspacePath, workspacePath);
  const insertTurn = raw.prepare(`INSERT INTO session_usage_turns (session_id, producer, run_id, turn_id,
    model_id, event_key, occurred_at_ms, provider_id, input_tokens, output_tokens, cache_read_tokens,
    cache_write_tokens, known_cost_micro_usd, cost_authority, source, revision, workspace_key, host)
    VALUES (?, 'cli-lane', 'r', 't', 'm', ?, 100, 'antigravity', 1, 0, 0, 0, 1, 'model-priced', 'live', 1, ?, 'cli')`);
  for (const [id, key] of turns) insertTurn.run(id, `${id}-event`, key);
  const insertStats = raw.prepare(`INSERT INTO session_stats (session_id, host, workspace_key, provider_id,
    started_at_ms, last_usage_at_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    known_cost_micro_usd, has_unpriced, source, revision, updated_at_ms)
    VALUES (?, 'cli', ?, 'antigravity', 100, 100, 1, 0, 0, 0, 1, 0, 'live', 1, 1)`);
  for (const [id, key] of stats) insertStats.run(id, key);
  const insertCoverage = raw.prepare(`INSERT INTO session_usage_coverage
    (workspace_key, first_captured_at_ms, last_captured_at_ms) VALUES (?, ?, ?)`);
  for (const [key, first, last] of coverage) insertCoverage.run(key, first, last);
  return raw as unknown as SqliteDatabase;
}

function keys(db: SqliteDatabase, sql: string): unknown[] {
  return db.prepare(sql).all();
}

const TURN_KEYS = 'SELECT session_id AS id, workspace_key AS key FROM session_usage_turns ORDER BY session_id';
const STATS_KEYS = 'SELECT session_id AS id, workspace_key AS key FROM session_stats ORDER BY session_id';
const SESSION_KEYS = 'SELECT session_id AS id, ledger_workspace_key AS key FROM sessions ORDER BY session_id';
const COVERAGE = `SELECT workspace_key AS key, first_captured_at_ms AS first, last_captured_at_ms AS last
  FROM session_usage_coverage ORDER BY workspace_key`;

describe('S0010 ledger workspace key rewrite', () => {
  it.each<NodeJS.Platform>(['win32', 'darwin'])('on %s folds every key and merges coverage', (platform) => {
    const db = legacyDb(
      [['win', 'C:\\Users\\Dev\\Proj'], ['mac', '/Users/Dev/Proj']],
      [['win', 'c:/users/dev/proj'], ['mac', '/users/dev/proj']],
      [['win', 'c:\\Users\\Dev\\Proj'], ['mac', '/Users/Dev/Proj']],
      [['c:\\Users\\Dev\\Proj', 100, 300], ['c:/users/dev/proj', 50, 200], ['/Users/Dev/Proj', 100, 100]],
    );
    rewriteLedgerWorkspaceKeys(db, platform);
    const expected = [{ id: 'mac', key: '/users/dev/proj' }, { id: 'win', key: 'c:/users/dev/proj' }];
    expect(keys(db, SESSION_KEYS)).toEqual(expected);
    expect(keys(db, TURN_KEYS)).toEqual(expected);
    expect(keys(db, STATS_KEYS)).toEqual(expected);
    const coverage = keys(db, COVERAGE);
    expect(coverage).toEqual([
      { key: '/users/dev/proj', first: 100, last: 100 },
      { key: 'c:/users/dev/proj', first: 50, last: 300 },
    ]);
    rewriteLedgerWorkspaceKeys(db, platform);
    expect(keys(db, COVERAGE)).toEqual(coverage);
  });

  it('on Linux folds Windows-style keys, keeps POSIX case, and restores lowercased keys from one session folder', () => {
    const db = legacyDb(
      [['win', 'C:\\Users\\Dev\\Proj'], ['upper', '/home/u/Proj'], ['twinA', '/srv/A'], ['twinB', '/srv/a']],
      [
        ['win', 'c:/users/dev/proj'],
        ['upper', '/home/u/proj'], // lowercased by an old producer; one session folder folds to it
        ['lane', '/home/u/proj'], // a lane without a session row, same folder
        ['twin', '/srv/a'], // two session folders fold to it: left as it is
        ['orphan', '/opt/tool'], // no session folder: left as it is
      ],
      [['upper', '/home/u/Proj'], ['lane', '/home/u/proj']],
      [['/home/u/Proj', 100, 300], ['/home/u/proj', 50, 200], ['c:\\Users\\Dev\\Proj', 10, 20]],
    );
    rewriteLedgerWorkspaceKeys(db, 'linux');
    expect(keys(db, SESSION_KEYS)).toEqual([
      { id: 'twinA', key: '/srv/A' }, { id: 'twinB', key: '/srv/a' },
      { id: 'upper', key: '/home/u/Proj' }, { id: 'win', key: 'c:/users/dev/proj' },
    ]);
    expect(keys(db, TURN_KEYS)).toEqual([
      { id: 'lane', key: '/home/u/Proj' },
      { id: 'orphan', key: '/opt/tool' },
      { id: 'twin', key: '/srv/a' },
      { id: 'upper', key: '/home/u/Proj' },
      { id: 'win', key: 'c:/users/dev/proj' },
    ]);
    expect(keys(db, STATS_KEYS)).toEqual([{ id: 'lane', key: '/home/u/Proj' }, { id: 'upper', key: '/home/u/Proj' }]);
    const coverage = keys(db, COVERAGE);
    expect(coverage).toEqual([
      { key: '/home/u/Proj', first: 50, last: 300 },
      { key: 'c:/users/dev/proj', first: 10, last: 20 },
    ]);
    rewriteLedgerWorkspaceKeys(db, 'linux');
    expect(keys(db, TURN_KEYS)).toHaveLength(5);
    expect(keys(db, COVERAGE)).toEqual(coverage);
  });

  it('runs as S0010 when a version-8 store opens, and keeps the workspace indexes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-ledger-key-migration-'));
    const file = path.join(dir, 'sessions.sqlite');
    try {
      const legacy = openDb(file);
      await new SqliteMigrationRunner(legacy, logger).applyAll(
        SESSION_STORE_MIGRATIONS.filter((migration) => migration.version <= 8),
        { vecExtensionLoaded: false },
      );
      // Windows-style keys fold on every host, so this case does not depend on the test host.
      legacy.exec(`
        INSERT INTO sessions (session_id, workspace_key, workspace_path, host, name, created_at,
          last_active_at, summary_json, detail_json, updated_at)
        VALUES ('win', 'c:\\Users\\Dev\\Proj', 'C:\\Users\\Dev\\Proj', 'electron', 'W', 1, 2, '{}', '{}', 1),
          ('none', NULL, NULL, 'electron', 'N', 1, 2, '{}', '{}', 1);
        INSERT INTO session_usage_turns (session_id, producer, run_id, turn_id, model_id, event_key,
          occurred_at_ms, provider_id, input_tokens, output_tokens, cache_read_tokens,
          cache_write_tokens, known_cost_micro_usd, cost_authority, source, revision, workspace_key, host)
        VALUES ('win', 'provider-session', 'r', 't', 'gemini', 'e1', 100, 'antigravity', 5, 1, 0, 0, 9,
          'model-priced', 'live', 1, 'c:/users/dev/proj', 'electron');`);
      legacy.close();

      const store = new SessionStoreDatabase(file, logger, openDb);
      try {
        const db = await store.ready();
        expect(keys(db, 'SELECT session_id AS id, workspace_key AS list, ledger_workspace_key AS ledger FROM sessions ORDER BY session_id'))
          .toEqual([
            { id: 'none', list: null, ledger: null },
            { id: 'win', list: 'c:\\Users\\Dev\\Proj', ledger: 'c:/users/dev/proj' },
          ]);
        expect(await new SessionStatsRepository(store).getWorkspaceUsageGroups('C:\\Users\\Dev\\Proj', 0, DAY_MS))
          .toEqual([expect.objectContaining({ provider_id: 'antigravity', input_tokens: 5 })]);
        const indexes = (keys(db, "SELECT name FROM sqlite_master WHERE type = 'index'") as { name: string }[])
          .map((row) => row.name);
        expect(indexes).toEqual(expect.arrayContaining(['idx_sessions_host_workspace', 'idx_sessions_workspace_key',
          'idx_sessions_ledger_workspace_key', 'idx_session_usage_workspace_time', 'idx_session_stats_workspace_time']));
      } finally {
        store.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
