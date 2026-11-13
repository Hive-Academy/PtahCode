import type { IReviewStatusPort } from '@ptah-extension/review-contracts';
import type { Logger } from '@ptah-extension/vscode-core';
import type { IReviewRepository, ReviewStatusSyncRecord } from '../persistence/review-repository.interface';
import type { ReviewQueueAttempt } from '../review-queue.service';
import { ReviewStatusCoordinatorService } from './review-status-coordinator.service';

const attempt: ReviewQueueAttempt = { repo: { owner: 'acme', name: 'repo' }, prNumber: 4,
  headSha: 'a'.repeat(40), attemptId: 'new', trigger: 'manual', queuedAt: '2026-01-01T00:00:00Z' };

function fixture() {
  const records = new Map<string, ReviewStatusSyncRecord>();
  const repository = Object.assign(Object.create(null) as IReviewRepository, {
    getCurrentAttemptId: jest.fn().mockResolvedValue('new'),
    getStatusSync: jest.fn(async (id: string) => records.get(id) ?? null),
    getPendingStatusSync: jest.fn(async () => [...records.values()].filter(row => row.syncPending)),
    saveStatusSync: jest.fn(async (row: ReviewStatusSyncRecord) => { records.set(row.attemptId, row); }),
    getAttempt: jest.fn(async (id: string) => ({ attemptId: id, repoId: 'acme/repo', prNumber: 4,
      headSha: attempt.headSha, attemptNumber: id === 'new' ? 2 : 1 })),
  });
  const port = Object.assign(Object.create(null) as IReviewStatusPort, { upsertStatus: jest.fn(async (update: { target: object }) => ({
    target: update.target, provider: 'commit_status' as const, externalId: 'remote',
  })), findOwnStatus: jest.fn().mockResolvedValue(null) });
  const logger = { error: jest.fn() };
  const service = new ReviewStatusCoordinatorService(repository, port, logger as Pick<Logger, 'error'> as Logger);
  return { records, repository, port, logger, service };
}

describe('ReviewStatusCoordinatorService', () => {
  it('drops a failed older retry after a newer result was published', async () => {
    const f = fixture();
    f.records.set('old', { attemptId: 'old', machineId: f.service.machineId, state: 'pending',
      description: 'Review queued', externalId: null, syncPending: true, retryAt: null,
      errorSummary: 'prior failure', syncedState: null, syncedDescription: null });
    await f.service.finished(attempt, 'complete', []);
    await f.service.retryDue();
    expect(f.port.upsertStatus).toHaveBeenCalledTimes(1);
    expect(f.records.get('old')?.syncPending).toBe(false);
  });

  it('publishes the latest row when a retry holds a stale snapshot of the same attempt', async () => {
    const f = fixture();
    const stale: ReviewStatusSyncRecord = { attemptId: 'new', machineId: f.service.machineId, state: 'pending',
      description: 'Reviewing… 1/3 lenses', externalId: 'remote', syncPending: true, retryAt: null,
      errorSummary: 'prior failure', syncedState: null, syncedDescription: null };
    f.records.set('new', { ...stale, state: 'success', description: 'No blocking findings' });
    f.repository.getPendingStatusSync.mockResolvedValueOnce([stale]);
    await f.service.retryDue();
    expect(f.port.upsertStatus).toHaveBeenCalledTimes(1);
    expect(f.port.upsertStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'completed', conclusion: 'success' }), expect.anything());
    expect(f.records.get('new')).toMatchObject({ state: 'success', syncPending: false, syncedState: 'success' });
  });

  it('drops a retry whose row a newer write already synced', async () => {
    const f = fixture();
    await f.service.finished(attempt, 'complete', []);
    const synced = f.records.get('new');
    f.repository.getPendingStatusSync.mockResolvedValueOnce([{ ...synced, state: 'pending',
      description: 'Review queued', syncPending: true } as ReviewStatusSyncRecord]);
    await f.service.retryDue();
    expect(f.port.upsertStatus).toHaveBeenCalledTimes(1);
    expect(f.records.get('new')).toEqual(synced);
  });

  it('keeps a newer state when an older write of the same attempt is still in flight', async () => {
    const f = fixture();
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    f.port.upsertStatus.mockImplementationOnce(async (update: { target: object }) => {
      await held;
      return { target: update.target, provider: 'commit_status' as const, externalId: 'remote' };
    });
    const older = f.service.lensCompleted(attempt, 2, 3);
    const newer = f.service.finished(attempt, 'complete', []);
    await new Promise<void>(resolve => { setImmediate(resolve); });
    expect(f.port.upsertStatus).toHaveBeenCalledTimes(1);
    expect(f.records.get('new')?.state).toBe('pending');
    release();
    await Promise.all([older, newer]);
    expect(f.port.upsertStatus).toHaveBeenCalledTimes(2);
    expect(f.port.upsertStatus.mock.calls[0]?.[0]).toMatchObject({ state: 'in_progress',
      progress: { completedLenses: 2, totalLenses: 3 } });
    expect(f.port.upsertStatus.mock.calls[1]?.[0]).toMatchObject({ state: 'completed' });
    expect(f.records.get('new')).toMatchObject({ state: 'success', syncPending: false, externalId: 'remote' });
  });

  describe('GitHub refuses the status write', () => {
    const refusal = (code: string, retryAt?: Date) =>
      Object.assign(new Error(`GitHub refused: ${code}`), { code, ...(retryAt ? { retryAt } : {}) });
    const pending = (f: ReturnType<typeof fixture>, id: string): void => {
      f.records.set(id, { attemptId: id, machineId: f.service.machineId, state: 'pending',
        description: 'Review queued', externalId: null, syncPending: true, retryAt: null,
        errorSummary: 'prior failure', syncedState: null, syncedDescription: null });
    };

    afterEach(() => { jest.useRealTimers(); });

    it('backs a permission failure off for 30 minutes instead of 60 seconds', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const f = fixture();
      f.port.upsertStatus.mockRejectedValueOnce(refusal('permission'));
      await f.service.enqueued(attempt);
      expect(f.records.get('new')).toMatchObject({ syncPending: true, retryAt: '2026-01-01T00:30:00.000Z' });
    });

    it('makes one GitHub request for many pending rows while the block lasts', async () => {
      const f = fixture();
      // Each old attempt owns its own head, so none of them counts as superseded.
      f.repository.getAttempt.mockImplementation(async (id: string) => ({ attemptId: id, repoId: 'acme/repo',
        prNumber: 4, headSha: id === 'new' ? attempt.headSha : `sha-${id}`, attemptNumber: 1 }));
      f.repository.getCurrentAttemptId.mockImplementation(async (_repo: unknown, _pr: number, sha: string) =>
        sha === attempt.headSha ? 'new' : sha.replace('sha-', ''));
      f.port.upsertStatus.mockRejectedValue(refusal('permission'));
      await f.service.enqueued(attempt);
      pending(f, 'old-1');
      pending(f, 'old-2');
      await f.service.retryDue();
      expect(f.port.upsertStatus).toHaveBeenCalledTimes(1);
      expect(f.records.get('old-1')).toMatchObject({ syncPending: true });
      expect(f.records.get('old-1')?.retryAt).toBe(f.records.get('new')?.retryAt);
    });

    it('logs the same refusal once per quiet window, even when the block ends sooner', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const f = fixture();
      // A rate-limit block is only 60 s, so the request is repeated well inside the quiet window.
      f.port.upsertStatus.mockRejectedValue(refusal('rate-limit', new Date('2026-01-01T00:01:00Z')));
      await f.service.enqueued(attempt);
      jest.setSystemTime(new Date('2026-01-01T00:02:00Z'));
      await f.service.lensCompleted(attempt, 1, 3);
      expect(f.port.upsertStatus).toHaveBeenCalledTimes(2);
      expect(f.logger.error).toHaveBeenCalledTimes(1);
      expect(f.logger.error).toHaveBeenCalledWith('Review status sync failed', expect.any(Error));
      jest.setSystemTime(new Date('2026-01-01T00:11:00Z'));
      await f.service.finished(attempt, 'complete', []);
      expect(f.port.upsertStatus).toHaveBeenCalledTimes(3);
      expect(f.logger.error).toHaveBeenCalledTimes(2);
    });

    it('does not shorten a held block when a later refusal from a concurrent head is shorter', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const f = fixture();
      const other = { ...attempt, attemptId: 'two', headSha: 'b'.repeat(40) };
      f.repository.getCurrentAttemptId.mockImplementation(async (_repo: unknown, _pr: number, sha: string) =>
        sha === attempt.headSha ? 'new' : 'two');
      const settle: Array<(error: Error) => void> = [];
      f.port.upsertStatus.mockImplementation(() => new Promise((_resolve, reject) => { settle.push(reject); }));
      const first = f.service.enqueued(attempt);
      const second = f.service.enqueued(other);
      await jest.advanceTimersByTimeAsync(0);
      expect(settle).toHaveLength(2);
      settle[0]?.(refusal('permission'));
      await first;
      settle[1]?.(refusal('rate-limit', new Date('2026-01-01T00:01:00Z')));
      await second;
      expect(f.records.get('two')?.retryAt).toBe('2026-01-01T00:30:00.000Z');
      f.port.upsertStatus.mockClear();
      jest.setSystemTime(new Date('2026-01-01T00:05:00Z'));
      await f.service.lensCompleted(attempt, 1, 3);
      expect(f.port.upsertStatus).not.toHaveBeenCalled();
    });

    it('keeps the in-memory throttle maps bounded', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const f = fixture();
      f.port.upsertStatus.mockRejectedValue(refusal('rate-limit', new Date('2026-01-01T00:01:00Z')));
      await f.service.enqueued(attempt);
      jest.setSystemTime(new Date('2026-01-01T01:00:00Z'));
      f.port.upsertStatus.mockRejectedValue(refusal('timeout'));
      await f.service.lensCompleted(attempt, 1, 3);
      const internals = f.service as unknown as { blocked: Map<string, unknown>; lastLogged: Map<string, number> };
      expect(internals.blocked.size).toBe(0);
      expect(internals.lastLogged.size).toBe(1);
    });

    it('tries again after the block ends and clears it on success', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const f = fixture();
      f.port.upsertStatus.mockRejectedValueOnce(refusal('permission'));
      await f.service.enqueued(attempt);
      jest.setSystemTime(new Date('2026-01-01T00:31:00Z'));
      await f.service.finished(attempt, 'complete', []);
      expect(f.port.upsertStatus).toHaveBeenCalledTimes(2);
      expect(f.records.get('new')).toMatchObject({ syncPending: false, syncedState: 'success' });
    });

    it('waits until the rate-limit reset GitHub reports, capped at one hour', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const f = fixture();
      f.port.upsertStatus.mockRejectedValueOnce(refusal('rate-limit', new Date('2026-01-01T00:10:00Z')));
      await f.service.enqueued(attempt);
      expect(f.records.get('new')?.retryAt).toBe('2026-01-01T00:10:00.000Z');
      const g = fixture();
      g.port.upsertStatus.mockRejectedValueOnce(refusal('rate-limit', new Date('2026-01-02T00:00:00Z')));
      await g.service.enqueued(attempt);
      expect(g.records.get('new')?.retryAt).toBe('2026-01-01T01:00:00.000Z');
    });

    it('keeps the 60 second retry for failures that are not a refusal', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const f = fixture();
      f.port.upsertStatus.mockRejectedValueOnce(refusal('timeout'));
      await f.service.enqueued(attempt);
      expect(f.records.get('new')?.retryAt).toBe('2026-01-01T00:01:00.000Z');
      await f.service.finished(attempt, 'complete', []);
      expect(f.port.upsertStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('logs retry persistence failure at the coordinator boundary', async () => {
    const f = fixture();
    f.port.upsertStatus.mockRejectedValueOnce(new Error('remote unavailable'));
    f.repository.saveStatusSync.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('sqlite unavailable'));
    await expect(f.service.enqueued(attempt)).resolves.toBeUndefined();
    expect(f.logger.error).toHaveBeenCalledWith('Review status retry persistence failed', expect.any(Error));
  });
});
