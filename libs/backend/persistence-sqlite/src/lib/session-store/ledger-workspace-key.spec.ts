import 'reflect-metadata';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  normalizeWorkspaceRoot as platformWorkspaceKey,
  type SessionUsageContribution as LiveContribution,
} from '@ptah-extension/platform-core';
import { normalizeWorkspaceRoot as sharedWorkspaceKey } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SqliteDatabase } from '../sqlite-connection.service';
import { SqliteMigrationRunner } from '../migration-runner';
import {
  caseKeptWorkspaceKey,
  isCaseSensitiveWorkspaceHost,
  ledgerWorkspaceKey,
} from './ledger-workspace-key';
import {
  countLedgerKeyCaseCollisions,
  rewriteLedgerWorkspaceKeys,
} from './ledger-workspace-key-rewrite';
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

function liveEvent(sessionId: string, workspaceKey: string): LiveContribution {
  return {
    sessionId, producer: 'provider-session', runId: `${sessionId}-run`, turnId: null,
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
  it.each([
    ['c:\\Users\\Dev\\Proj', 'c:/users/dev/proj'],
    ['C:/Users/Dev/Proj/', 'c:/users/dev/proj'],
    ['c:/users/dev/proj', 'c:/users/dev/proj'],
    ['/Users/Dev/Proj', '/users/dev/proj'],
    ['/home/dev/proj//', '/home/dev/proj'],
    ['/', '/'],
  ])('folds %s to %s, and folding again changes nothing', (input, key) => {
    expect(ledgerWorkspaceKey(input)).toBe(key);
    expect(ledgerWorkspaceKey(key)).toBe(key);
  });

  it('agrees with the shared key every usage producer and reader passes', () => {
    for (const root of ['C:\\Users\\Dev\\Proj', '/Users/Dev/Proj', '/home/dev/proj']) {
      expect(ledgerWorkspaceKey(root)).toBe(sharedWorkspaceKey(root));
    }
  });

  it('keeps case in the case-kept spelling and knows which hosts ignore case', () => {
    expect(caseKeptWorkspaceKey('C:\\Users\\Dev\\Proj\\')).toBe('C:/Users/Dev/Proj');
    expect(isCaseSensitiveWorkspaceHost('linux')).toBe(true);
    expect(isCaseSensitiveWorkspaceHost('win32')).toBe(false);
    expect(isCaseSensitiveWorkspaceHost('darwin')).toBe(false);
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

  it.each([
    ['Windows', 'C:\\Users\\Dev\\Proj'],
    ['macOS', '/Users/Dev/Proj'],
    ['Linux', '/home/dev/proj'],
  ])('a %s workspace written by the record and the usage sink reads back under either spelling', async (_os, root) => {
    const sessionId = 'session-a';
    await records.upsert(session(sessionId, root));
    // The producers write the shared fold; the record keeps the real path.
    await sink.recordUsage(liveEvent(sessionId, sharedWorkspaceKey(root)));

    const db = await store.ready();
    const key = sharedWorkspaceKey(root);
    expect(db.prepare('SELECT workspace_key AS list, ledger_workspace_key AS ledger FROM sessions').get())
      .toEqual({ list: platformWorkspaceKey(root), ledger: key });
    expect(db.prepare('SELECT DISTINCT workspace_key AS key FROM session_usage_turns').all()).toEqual([{ key }]);
    expect(db.prepare('SELECT workspace_key AS key FROM session_stats').get()).toEqual({ key });
    expect(db.prepare('SELECT workspace_key AS key FROM session_usage_coverage').all()).toEqual([{ key }]);

    for (const spelling of [key, root]) {
      const groups = await stats.getWorkspaceUsageGroups(spelling, 0, DAY_MS);
      expect(groups).toEqual([expect.objectContaining({ provider_id: 'antigravity', input_tokens: 7,
        known_cost_micro_usd: 42, session_count: 1 })]);
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
  });

  it('keeps the session list exact: folders that differ only by case are two lists', async () => {
    await records.upsert(session('upper', '/home/u/Proj'));
    await records.upsert(session('lower', '/home/u/proj'));
    await records.upsert(session('slash', '/home/u/Proj/'));
    expect((await records.listForWorkspace('/home/u/Proj')).map((row) => row.sessionId).sort())
      .toEqual(['slash', 'upper']);
    expect((await records.listForWorkspace('/home/u/proj')).map((row) => row.sessionId)).toEqual(['lower']);
    expect(await records.listForWorkspace('/HOME/U/PROJ')).toEqual([]);
  });

  it('keeps two different workspaces apart', async () => {
    await sink.recordUsage(liveEvent('a', sharedWorkspaceKey('C:\\Work\\A')));
    await sink.recordUsage(liveEvent('b', sharedWorkspaceKey('C:\\Work\\B')));
    expect(await stats.getWorkspaceSessionCount('C:\\Work\\A', 0, DAY_MS)).toBe(1);
    expect(await stats.getWorkspaceSessionCount('c:/work/b', 0, DAY_MS)).toBe(1);
    expect(await stats.getWorkspaceSessionCount('C:\\Work\\C', 0, DAY_MS)).toBe(0);
  });
});

/** A version-8 store holding rows written before the ledger key, as the app left them. */
async function openLegacyStore(file: string): Promise<void> {
  const legacy = openDb(file);
  await new SqliteMigrationRunner(legacy, logger).applyAll(
    SESSION_STORE_MIGRATIONS.filter((migration) => migration.version <= 8),
    { vecExtensionLoaded: false },
  );
  legacy.exec(`
    INSERT INTO sessions (session_id, workspace_key, workspace_path, host, name, created_at,
      last_active_at, summary_json, detail_json, updated_at)
    VALUES ('win', 'c:\\Users\\Dev\\Proj', 'C:\\Users\\Dev\\Proj', 'electron', 'W', 1, 2, '{}', '{}', 1),
      ('mac', '/Users/Dev/Proj', '/Users/Dev/Proj', 'electron', 'M', 1, 2, '{}', '{}', 1),
      ('none', NULL, NULL, 'electron', 'N', 1, 2, '{}', '{}', 1);
    INSERT INTO session_usage_turns (session_id, producer, run_id, turn_id, model_id, event_key,
      occurred_at_ms, provider_id, input_tokens, output_tokens, cache_read_tokens,
      cache_write_tokens, known_cost_micro_usd, cost_authority, source, revision, workspace_key, host)
    VALUES ('win', 'provider-session', 'r', 't', 'gemini', 'e1', 100, 'antigravity', 5, 1, 0, 0, 9,
        'model-priced', 'live', 1, 'c:/users/dev/proj', 'electron'),
      ('mac', 'sdk-owner', 'r', 't', 'claude', 'e2', 100, 'anthropic', 4, 1, 0, 0, 8,
        'provider-reported', 'live', 1, '/users/dev/proj', 'electron');
    INSERT INTO session_stats (session_id, host, workspace_key, provider_id, started_at_ms,
      last_usage_at_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      known_cost_micro_usd, has_unpriced, source, revision, updated_at_ms)
    VALUES ('win', 'electron', 'c:\\Users\\Dev\\Proj', 'antigravity', 100, 100, 5, 1, 0, 0, 9, 0, 'live', 1, 1),
      ('mac', 'electron', '/Users/Dev/Proj', 'anthropic', 100, 100, 4, 1, 0, 0, 8, 0, 'live', 1, 1);
    INSERT INTO session_usage_coverage (workspace_key, first_captured_at_ms, last_captured_at_ms)
    VALUES ('c:\\Users\\Dev\\Proj', 100, 300), ('c:/users/dev/proj', 50, 200),
      ('/Users/Dev/Proj', 100, 100);`);
  legacy.close();
}

function coverageRows(db: Pick<SqliteDatabase, 'prepare'>): unknown[] {
  return db.prepare(`SELECT workspace_key AS key, first_captured_at_ms AS first,
    last_captured_at_ms AS last FROM session_usage_coverage ORDER BY workspace_key`).all();
}

describe('S0009/S0010 ledger workspace key migration', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-ledger-key-migration-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fills the ledger key, rewrites legacy usage keys, merges coverage, and reruns without change', async () => {
    const file = path.join(dir, 'sessions.sqlite');
    await openLegacyStore(file);
    const store = new SessionStoreDatabase(file, logger, openDb);
    try {
      const db = await store.ready();
      // The session list key is untouched; the ledger key is filled beside it.
      expect(db.prepare(`SELECT session_id AS id, workspace_key AS list, ledger_workspace_key AS ledger
        FROM sessions ORDER BY session_id`).all()).toEqual([
        { id: 'mac', list: '/Users/Dev/Proj', ledger: '/users/dev/proj' },
        { id: 'none', list: null, ledger: null },
        { id: 'win', list: 'c:\\Users\\Dev\\Proj', ledger: 'c:/users/dev/proj' },
      ]);
      expect(db.prepare('SELECT workspace_key AS key FROM session_stats ORDER BY session_id').all())
        .toEqual([{ key: '/users/dev/proj' }, { key: 'c:/users/dev/proj' }]);
      const coverage = coverageRows(db);
      expect(coverage).toEqual([
        { key: '/users/dev/proj', first: 100, last: 100 },
        { key: 'c:/users/dev/proj', first: 50, last: 300 },
      ]);

      const stats = new SessionStatsRepository(store);
      expect(await stats.getWorkspaceUsageGroups('C:\\Users\\Dev\\Proj', 0, DAY_MS))
        .toEqual([expect.objectContaining({ provider_id: 'antigravity', input_tokens: 5 })]);
      expect(await stats.getSessionStats('mac', '/Users/Dev/Proj')).toMatchObject({ input_tokens: 4 });
      const records = new SqliteSessionRecordRepository(store, 'electron');
      // Legacy list keys were normalized on the host that wrote them.
      const [listRoot, listed] = process.platform === 'win32'
        ? ['C:\\Users\\Dev\\Proj', 'win'] : ['/Users/Dev/Proj', 'mac'];
      expect((await records.listForWorkspace(listRoot)).map((row) => row.sessionId)).toEqual([listed]);

      const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[])
        .map((row) => row.name);
      expect(indexes).toEqual(expect.arrayContaining(['idx_sessions_host_workspace', 'idx_sessions_workspace_key',
        'idx_sessions_ledger_workspace_key', 'idx_session_usage_workspace_time', 'idx_session_stats_workspace_time']));

      rewriteLedgerWorkspaceKeys(db, false);
      expect(coverageRows(db)).toEqual(coverage);
    } finally {
      store.close();
    }
  });

  it('logs one line when opening a store on Linux leaves case-only key pairs apart', async () => {
    const file = path.join(dir, 'sessions.sqlite');
    const legacy = openDb(file);
    await new SqliteMigrationRunner(legacy, logger).applyAll(
      SESSION_STORE_MIGRATIONS.filter((migration) => migration.version <= 8),
      { vecExtensionLoaded: false },
    );
    legacy.exec(`INSERT INTO session_usage_coverage VALUES ('/home/u/Proj', 1, 2), ('/home/u/proj', 3, 4)`);
    legacy.close();
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const warn = jest.fn();
    const store = new SessionStoreDatabase(file, { ...logger, warn } as unknown as Logger, openDb);
    try {
      await store.ready();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('differ only by case'), { collisions: 1 });
    } finally {
      store.close();
      if (platform) Object.defineProperty(process, 'platform', platform);
    }
  });

  it('on a case-sensitive host keeps keys that differ only by case apart and counts them', () => {
    const raw = new DatabaseSync(':memory:');
    try {
      for (const migration of SESSION_STORE_MIGRATIONS) if (migration.sql) raw.exec(migration.sql);
      const db = raw as unknown as SqliteDatabase;
      raw.exec(`
        INSERT INTO session_stats (session_id, host, workspace_key, provider_id, started_at_ms,
          last_usage_at_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          known_cost_micro_usd, has_unpriced, source, revision, updated_at_ms)
        VALUES ('upper', 'cli', '/home/u/Proj', 'anthropic', 1, 1, 1, 0, 0, 0, 1, 0, 'live', 1, 1),
          ('lower', 'cli', '/home/u/proj', 'anthropic', 1, 1, 1, 0, 0, 0, 1, 0, 'live', 1, 1),
          ('alone', 'cli', '/home/u/Other', 'anthropic', 1, 1, 1, 0, 0, 0, 1, 0, 'live', 1, 1);
        INSERT INTO session_usage_coverage (workspace_key, first_captured_at_ms, last_captured_at_ms)
        VALUES ('/home/u/Proj', 10, 20), ('/home/u/proj', 30, 40), ('/home/u/Other/', 5, 6);`);

      rewriteLedgerWorkspaceKeys(db, true);
      expect(raw.prepare('SELECT session_id AS id, workspace_key AS key FROM session_stats ORDER BY session_id').all())
        .toEqual([
          { id: 'alone', key: '/home/u/other' },
          { id: 'lower', key: '/home/u/proj' },
          { id: 'upper', key: '/home/u/Proj' },
        ]);
      expect(coverageRows(db)).toEqual([
        { key: '/home/u/Proj', first: 10, last: 20 },
        { key: '/home/u/other', first: 5, last: 6 },
        { key: '/home/u/proj', first: 30, last: 40 },
      ]);
      expect(countLedgerKeyCaseCollisions(db)).toBe(1);

      // A case-insensitive host treats the same pair as one folder.
      rewriteLedgerWorkspaceKeys(db, false);
      expect(coverageRows(db)).toEqual([
        { key: '/home/u/other', first: 5, last: 6 },
        { key: '/home/u/proj', first: 10, last: 40 },
      ]);
      expect(countLedgerKeyCaseCollisions(db)).toBe(0);
    } finally {
      raw.close();
    }
  });
});
