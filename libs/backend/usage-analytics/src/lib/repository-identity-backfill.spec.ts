import 'reflect-metadata';
import { SessionStatsRepository } from '@ptah-extension/persistence-sqlite';
import { RepositoryIdentityBackfillService } from './repository-identity-backfill.service';

class PageRepository extends SessionStatsRepository {
  readonly updates: { rowId: number; repositoryId: string; worktreePath: string }[][] = [];
  constructor() { super({ ready: async () => { throw new Error('unused'); } }); }
  override async getUnresolvedRepositoryUsagePage(afterRowId: number) {
    if (afterRowId > 0) return [];
    return [
      { rowId: 1, sessionId: 'a', workspacePath: '/failed' },
      { rowId: 2, sessionId: 'b', workspacePath: '/failed' },
      { rowId: 3, sessionId: 'c', workspacePath: '/resolved' },
    ];
  }
  override async setRepositoryUsageIdentity(rows: readonly { rowId: number; repositoryId: string; worktreePath: string }[]) {
    this.updates.push([...rows]);
    return rows.length;
  }
}

it('caches a failing resolver once per run and leaves unresolved rows untouched', async () => {
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
});
