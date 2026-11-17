import 'reflect-metadata';
import { SessionStatsRepository } from '@ptah-extension/persistence-sqlite';
import { RepositoryIdentityBackfillService } from './repository-identity-backfill.service';

class PageRepository extends SessionStatsRepository {
  readonly updates: { rowId: number; repositoryId: string; worktreePath: string }[][] = [];
  readonly attempts: number[][] = [];
  pageWalks = 0;
  constructor() { super({ ready: async () => { throw new Error('unused'); } }); }
  override async getUnresolvedRepositoryUsagePage(afterRowId: number, _limit = 200) {
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


it('enriches reactive rows on its own timer and cancels future passes on stop', async () => {
  jest.useFakeTimers();
  const repository = new PageRepository();
  const resolve = jest.fn(async (path: string) => ({ repositoryId: 'repo', worktreePath: path }));
  const service = new RepositoryIdentityBackfillService(repository, { resolve }, { debug: jest.fn() });
  try {
    service.start();
    service.start();
    expect(resolve).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.updates.flat()).toHaveLength(3);
    expect(repository.pageWalks).toBe(1);
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(repository.pageWalks).toBe(2);
    service.stop();
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(repository.pageWalks).toBe(2);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    service.stop();
    jest.useRealTimers();
  }
});

function deferred<T>() {
  let complete: (value: T) => void = () => { throw new Error('deferred not initialized'); };
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, complete };
}

describe('backfill lifecycle cancellation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup() {
    const repository = new PageRepository();
    const gate = deferred<{ repositoryId: string; worktreePath: string }>();
    const resolve = jest.fn(() => gate.promise);
    const debug = jest.fn();
    const service = new RepositoryIdentityBackfillService(repository, { resolve }, { debug });
    return { repository, gate, resolve, debug, service };
  }

  it('stops before the startup callback', async () => {
    const { service, repository } = setup();
    service.start();
    service.stop();
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.pageWalks).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores a stale startup callback after stop/restart', async () => {
    const { service, repository, gate } = setup();
    const timers = jest.spyOn(global, 'setTimeout');
    try {
      service.start();
      const staleCallback = timers.mock.calls[0]?.[0];
      service.stop();
      service.start();
      if (typeof staleCallback !== 'function') throw new Error('missing startup callback');
      staleCallback();
      expect(repository.pageWalks).toBe(0);
      expect(jest.getTimerCount()).toBe(1);
      gate.complete({ repositoryId: 'repo', worktreePath: '/resolved' });
      await jest.advanceTimersByTimeAsync(0);
      expect(repository.pageWalks).toBe(1);
      expect(jest.getTimerCount()).toBe(1);
    } finally {
      service.stop();
      timers.mockRestore();
    }
  });

  it('stops during resolution without writes or rescheduling', async () => {
    const { service, repository, gate } = setup();
    service.start();
    await jest.advanceTimersByTimeAsync(0);
    service.stop();
    gate.complete({ repositoryId: 'repo', worktreePath: '/resolved' });
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.updates).toEqual([]);
    expect(repository.attempts).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('serializes stop/restart during a pass and leaves exactly one timer', async () => {
    const { service, repository, gate } = setup();
    service.start();
    await jest.advanceTimersByTimeAsync(0);
    service.stop();
    service.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.pageWalks).toBe(1);
    gate.complete({ repositoryId: 'repo', worktreePath: '/resolved' });
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.pageWalks).toBe(2);
    expect(repository.updates).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(1);
    service.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('joins concurrent public passes with the same result', async () => {
    const { service, repository, gate } = setup();
    const first = service.runOnce();
    const second = service.runOnce();
    expect(second).toBe(first);
    gate.complete({ repositoryId: 'repo', worktreePath: '/resolved' });
    await expect(first).resolves.toEqual({ updated: 3, unresolved: 0 });
    expect(repository.pageWalks).toBe(1);
    expect(repository.updates).toHaveLength(1);
  });

  it('logs a rejected read and schedules a successful next pass', async () => {
    const { service, repository, debug, gate } = setup();
    jest.spyOn(repository, 'getUnresolvedRepositoryUsagePage').mockRejectedValueOnce(new Error('read failed'));
    service.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(debug).toHaveBeenCalledWith('[UsageBackfill] Scheduled pass failed', { reason: 'read failed' });
    expect(jest.getTimerCount()).toBe(1);
    gate.complete({ repositoryId: 'repo', worktreePath: '/resolved' });
    await jest.advanceTimersByTimeAsync(60 * 60_000);
    expect(repository.updates.flat()).toHaveLength(3);
    expect(jest.getTimerCount()).toBe(1);
    service.stop();
  });
});

it('pages over 200 rows and yields before reading the next page', async () => {
  const repository = new PageRepository();
  const rows = Array.from({ length: 401 }, (_, index) => ({ rowId: index + 1, sessionId: String(index), workspacePath: '/resolved' }));
  const reads = jest.spyOn(repository, 'getUnresolvedRepositoryUsagePage').mockImplementation(async (afterRowId: number, limit = 200) => rows.filter(row => row.rowId > afterRowId).slice(0, limit));
  const immediate = jest.spyOn(global, 'setImmediate');
  const service = new RepositoryIdentityBackfillService(repository, { resolve: async path => ({ repositoryId: 'repo', worktreePath: path }) }, { debug: jest.fn() });
  try {
    await expect(service.runOnce()).resolves.toEqual({ updated: 401, unresolved: 0 });
    expect(reads.mock.calls).toEqual([[0, 200], [200, 200], [400, 200]]);
    expect(repository.updates.map(page => page.length)).toEqual([200, 200, 1]);
    expect(immediate).toHaveBeenCalledTimes(2);
  } finally {
    immediate.mockRestore();
  }
});
