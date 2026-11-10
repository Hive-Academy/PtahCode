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

  it('logs retry persistence failure at the coordinator boundary', async () => {
    const f = fixture();
    f.port.upsertStatus.mockRejectedValueOnce(new Error('remote unavailable'));
    f.repository.saveStatusSync.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('sqlite unavailable'));
    await expect(f.service.enqueued(attempt)).resolves.toBeUndefined();
    expect(f.logger.error).toHaveBeenCalledWith('Review status retry persistence failed', expect.any(Error));
  });
});
