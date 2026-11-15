import type { GitInfoResult } from '@ptah-extension/shared';
import { GitInfoReadCache } from './git-info-read-cache';

const result = (branch: string, statusUnavailable = false): GitInfoResult => ({
  isGitRepo: true,
  branch: { branch, upstream: null, ahead: 0, behind: 0 },
  files: [],
  ...(statusUnavailable ? { statusUnavailable: 'timeout' as const } : {}),
});

const deferred = () => {
  let resolve!: (value: GitInfoResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<GitInfoResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('GitInfoReadCache', () => {
  const logger = { info: jest.fn() };
  beforeEach(() => {
    jest.useFakeTimers();
    logger.info.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('shares a flight, serves the TTL, and expires after 2.5 seconds', async () => {
    const cache = new GitInfoReadCache(logger);
    const pending = deferred();
    const compute = jest.fn(() => pending.promise);
    const first = cache.read('/a', compute);
    const joined = cache.read('/a', compute);
    expect(compute).toHaveBeenCalledTimes(1);
    pending.resolve(result('one'));
    await expect(Promise.all([first, joined])).resolves.toEqual([result('one'), result('one')]);
    await Promise.resolve();
    await expect(cache.read('/a', compute)).resolves.toEqual(result('one'));
    expect(compute).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2_501);
    await cache.read('/a', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('queues one fresh trailing read after invalidation and never stores stale output', async () => {
    const cache = new GitInfoReadCache(logger);
    const first = deferred();
    const next = deferred();
    const compute = jest.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => next.promise);
    const stale = cache.read('/a', compute);
    cache.invalidate('/a');
    const fresh = cache.read('/a', compute);
    expect(cache.read('/a', compute)).toBe(fresh);
    expect(compute).toHaveBeenCalledTimes(1);
    first.resolve(result('stale'));
    await stale;
    expect(compute).toHaveBeenCalledTimes(2);
    next.resolve(result('fresh'));
    await expect(fresh).resolves.toEqual(result('fresh'));
    await Promise.resolve();
    await expect(cache.read('/a', compute)).resolves.toEqual(result('fresh'));
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('does not cache unavailable or rejected reads', async () => {
    const cache = new GitInfoReadCache(logger);
    const compute = jest.fn().mockResolvedValueOnce(result('bad', true)).mockRejectedValueOnce(new Error('failed')).mockResolvedValue(result('good'));
    await cache.read('/a', compute);
    await expect(cache.read('/a', compute)).rejects.toThrow('failed');
    await expect(cache.read('/a', compute)).resolves.toEqual(result('good'));
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('evicts the least recently read root beyond 32 entries', async () => {
    const cache = new GitInfoReadCache(logger);
    const compute = jest.fn().mockResolvedValue(result('ok'));
    for (let i = 0; i < 32; i++) await cache.read(`/root-${i}`, compute);
    await cache.read('/root-0', compute);
    await cache.read('/root-32', compute);
    await cache.read('/root-1', compute);
    expect(compute).toHaveBeenCalledTimes(34);
  });

  it('emits one path-free activity summary per minute', async () => {
    const cache = new GitInfoReadCache(logger);
    await cache.read('/secret/path', async () => result('ok'));
    jest.advanceTimersByTime(60_000);
    await cache.read('/secret/path', async () => result('ok'));
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('/secret/path');
  });
});
