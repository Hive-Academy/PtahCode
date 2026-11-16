import 'reflect-metadata';
import { SessionStatsRepository } from '@ptah-extension/persistence-sqlite';
import { RepositoryIdentityBackfillService } from './repository-identity-backfill.service';

class PageRepository extends SessionStatsRepository {
  readonly updates: { rowId: number; repositoryId: string; worktreePath: string }[][] = [];
  readonly attempts: number[][] = [];
  pageWalks = 0;
  constructor() { super({ ready: async () => { throw new Error('unused'); } }); }
  override async getUnresolvedRepositoryUsagePage(afterRowId: number) {
    this.pageWalks++;
    if (afterRowId > 0) return [];
    return [
      { rowId: 1, sessionId: 'a', workspacePath: '/failed' },
      { rowId: 2, sessionId: 'b', workspacePath: '/failed' },
      { rowId: 3, sessionId: 'c', workspacePath: '/resolved' },
    ].filter((row) => !this.attempts.flat().includes(row.rowId) && !this.updates.flat().some((update) => update.rowId === row.rowId));
  }
  override async setRepositoryUsageIdentity(rows: readonly { rowId: number; repositoryId: string; worktreePath: string }[]) {
    this.updates.push([...rows]);
    return rows.length;
  }
  override async markRepositoryUsageUnresolved(rowIds: readonly number[]) { this.attempts.push([...rowIds]); }
}

it('retries a thrown resolver failure on a later run without marking either row', async () => {
  const repository = new PageRepository();
  const debug = jest.fn();
  const resolve = jest.fn(async (path: string) => {
    if (path === '/failed') throw new Error('git timed out');
    return { repositoryId: 'repo', worktreePath: path };
  });
  const service = new RepositoryIdentityBackfillService(repository, { resolve }, { debug });
  await expect(service.runOnce()).resolves.toEqual({ updated: 1, unresolved: 2 });
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(debug).toHaveBeenCalledTimes(1);
  expect(repository.updates).toEqual([[{ rowId: 3, repositoryId: 'repo', worktreePath: '/resolved' }]]);
  expect(repository.attempts).toEqual([[]]);
  resolve.mockImplementation(async (path: string) => ({ repositoryId: 'repo', worktreePath: path }));
  await expect(service.runOnce()).resolves.toEqual({ updated: 2, unresolved: 0 });
  expect(resolve).toHaveBeenCalledTimes(3);
  expect(repository.updates[1]).toEqual([
    { rowId: 1, repositoryId: 'repo', worktreePath: '/failed' },
    { rowId: 2, repositoryId: 'repo', worktreePath: '/failed' },
  ]);
  expect(repository.pageWalks).toBe(2);
});

it('marks definitive null results and skips them on the next run', async () => {
  const repository = new PageRepository();
  const resolve = jest.fn(async (path: string) => path === '/failed'
    ? null : { repositoryId: 'repo', worktreePath: path });
  const service = new RepositoryIdentityBackfillService(repository, { resolve }, { debug: jest.fn() });
  await expect(service.runOnce()).resolves.toEqual({ updated: 1, unresolved: 2 });
  expect(repository.attempts).toEqual([[1, 2]]);
  await expect(service.runOnce()).resolves.toEqual({ updated: 0, unresolved: 0 });
  expect(resolve).toHaveBeenCalledTimes(2);
});
