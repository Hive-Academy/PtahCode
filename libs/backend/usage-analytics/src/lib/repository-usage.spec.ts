import 'reflect-metadata';
import { DatabaseSync } from 'node:sqlite';
import { SessionStatsRepository, type SqliteDatabase } from '@ptah-extension/persistence-sqlite';
import { RepositoryIdentityBackfillService } from './repository-identity-backfill.service';

function fixture(): { raw: DatabaseSync; repository: SessionStatsRepository } {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE sessions (session_id TEXT PRIMARY KEY, workspace_path TEXT, workspace_key TEXT);
    CREATE TABLE session_stats (session_id TEXT PRIMARY KEY, repository_id TEXT, worktree_path TEXT);
    CREATE TABLE session_usage_turns (session_id TEXT, repository_id TEXT, worktree_path TEXT,
      workspace_key TEXT, billable INTEGER, occurred_at_ms INTEGER, input_tokens INTEGER,
      output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER,
      known_cost_micro_usd INTEGER, source TEXT);`);
  const db: Pick<SqliteDatabase, 'exec' | 'prepare'> = {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const statement = raw.prepare(sql);
      return {
        run: (...params: unknown[]) => {
          const result = statement.run(...params.map(sqlValue));
          return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
        },
        get: (...params: unknown[]) => statement.get(...params.map(sqlValue)),
        all: (...params: unknown[]) => statement.all(...params.map(sqlValue)),
        iterate: function* (...params: unknown[]): IterableIterator<unknown> {
          for (const row of statement.iterate(...params.map(sqlValue))) yield row;
        },
      };
    },
  };
  return { raw, repository: new SessionStatsRepository({ ready: async () => db }) };
}

function sqlValue(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number' || value === null) return value;
  throw new Error('Unexpected SQL parameter');
}

describe('repository usage identity', () => {
  it('aggregates two worktrees, retains paths and exposes unknown coverage', async () => {
    const { raw, repository } = fixture();
    try {
      const insert = raw.prepare(`INSERT INTO session_usage_turns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      insert.run('a', 'git-common', '/repo/main', '/repo/main', 1, 10, 5, 0, 0, 0, 100, 'live');
      insert.run('b', 'git-common', '/repo/linked', '/repo/linked', 1, 20, null, 3, 0, 0, null, 'replay');
      insert.run('c', 'git-common', '/repo/linked', '/repo/linked', 0, 20, 999, 0, 0, 0, 999, 'replay');
      const totals = await repository.getRepositoryUsageTotals('git-common', 0, 30);
      expect(totals).toMatchObject({ inputTokens: 5, outputTokens: 3,
        knownCostMicroUsd: 100, hasUnknownTokens: true,
        worktreePaths: ['/repo/linked', '/repo/main'] });
    } finally { raw.close(); }
  });

  it('backfills existing and later live rows while isolating a non-git workspace', async () => {
    const { raw, repository } = fixture();
    try {
      const insert = raw.prepare(`INSERT INTO session_usage_turns VALUES (?, NULL, NULL, ?, 1, 10, 1, 0, 0, 0, NULL, 'live')`);
      insert.run('a', '/repo/main');
      insert.run('b', '/repo/linked');
      insert.run('c', '/scratch');
      const resolve = jest.fn(async (path: string) => ({
        repositoryId: path === '/scratch' ? 'nogit:/scratch' : 'git-common', worktreePath: path,
      }));
      const service = new RepositoryIdentityBackfillService(repository, { resolve }, { debug: jest.fn() });
      expect(await service.runOnce()).toEqual({ updated: 3, unresolved: 0 });
      insert.run('d', '/repo/main');
      expect(await service.runOnce()).toEqual({ updated: 1, unresolved: 0 });
      expect(resolve).toHaveBeenCalledTimes(4);
      expect(raw.prepare(`SELECT repository_id,worktree_path FROM session_usage_turns WHERE session_id='d'`).get())
        .toMatchObject({ repository_id: 'git-common', worktree_path: '/repo/main' });
      expect((await repository.getRepositoryUsageTotals('nogit:/scratch', 0, 30)).inputTokens).toBe(1);
    } finally { raw.close(); }
  });
});
