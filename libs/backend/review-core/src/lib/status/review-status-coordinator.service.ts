import { hostname } from 'node:os';
import { inject, injectable } from 'tsyringe';
import type { IReviewStatusPort, ReviewStatusTarget, ReviewStatusUpdate } from '@ptah-extension/review-contracts';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { REVIEW_CORE_TOKENS } from '../../di/tokens';
import type { IReviewRepository, ReviewStatusSyncRecord } from '../persistence/review-repository.interface';
import type { ReviewQueueAttempt } from '../review-queue.service';
import { sanitizeReviewFailureMessage } from '../review-failure-sanitizer';
import { reviewStatusConclusion, type ReviewOutcome, type ReviewSeverity } from './review-status-conclusion';

const RETRY_MS = 60_000;

@injectable()
export class ReviewStatusCoordinatorService {
  readonly machineId = hostname();
  private readonly writes = new Map<string, Promise<void>>();
  constructor(
    @inject(REVIEW_CORE_TOKENS.REVIEW_REPOSITORY) private readonly repository: IReviewRepository,
    @inject(REVIEW_CORE_TOKENS.STATUS_PORT) private readonly port: IReviewStatusPort,
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
  ) {}

  async enqueued(attempt: ReviewQueueAttempt): Promise<void> {
    if (attempt.skipped || attempt.dryRun) return;
    await this.update(attempt, 'pending', 'Review queued');
  }

  async claimed(attempt: ReviewQueueAttempt, totalLenses: number): Promise<void> {
    if (attempt.dryRun) return;
    await this.update(attempt, 'pending', `Reviewing… 0/${totalLenses} lenses`, 0, totalLenses);
  }

  async lensCompleted(attempt: ReviewQueueAttempt, completed: number, total: number): Promise<void> {
    if (attempt.dryRun) return;
    await this.update(attempt, 'pending', `Reviewing… ${completed}/${total} lenses`, completed, total);
  }

  async finished(attempt: ReviewQueueAttempt, outcome: ReviewOutcome, severities: readonly ReviewSeverity[]): Promise<void> {
    if (attempt.dryRun) return;
    const conclusion = reviewStatusConclusion(outcome, severities);
    await this.update(attempt, conclusion.state, conclusion.description);
  }

  async retryDue(): Promise<void> {
    for (const record of await this.repository.getPendingStatusSync(new Date().toISOString())) {
      if (record.machineId !== this.machineId) continue;
      const attempt = await this.repository.getAttempt(record.attemptId);
      if (!attempt) continue;
      const [owner, name] = attempt.repoId.split('/');
      if (!owner || !name) continue;
      await this.write(record, { repo: { owner, name }, prNumber: attempt.prNumber, headSha: attempt.headSha,
        attemptId: attempt.attemptId, machineId: record.machineId });
    }
  }

  async recoverOwnPending(): Promise<void> {
    for (const record of await this.repository.getMachineStatusSync(this.machineId)) {
      const attempt = await this.repository.getAttempt(record.attemptId);
      if (!attempt) continue;
      if (attempt.state === 'queued' || attempt.state === 'running') continue;
      const [owner, name] = attempt.repoId.split('/');
      if (!owner || !name) continue;
      await this.update({ repo: { owner, name }, prNumber: attempt.prNumber, headSha: attempt.headSha,
        attemptId: attempt.attemptId, trigger: 'poll', queuedAt: attempt.queuedAt }, 'error',
      'Review result unavailable after restart or head change');
    }
  }

  private async update(attempt: ReviewQueueAttempt, state: ReviewStatusSyncRecord['state'], description: string,
    completed = 0, total = 0): Promise<void> {
    const previous = await this.repository.getStatusSync(attempt.attemptId);
    if (previous?.state === state && previous.description === description && !previous.syncPending) return;
    const record: ReviewStatusSyncRecord = { attemptId: attempt.attemptId, machineId: previous?.machineId ?? this.machineId,
      state, description, externalId: previous?.externalId ?? null, syncPending: true, retryAt: null,
      errorSummary: null, syncedState: previous?.syncedState ?? null, syncedDescription: previous?.syncedDescription ?? null };
    await this.repository.saveStatusSync(record);
    await this.write(record, { repo: attempt.repo, prNumber: attempt.prNumber, headSha: attempt.headSha,
      attemptId: attempt.attemptId, machineId: record.machineId }, completed, total);
  }

  private async write(record: ReviewStatusSyncRecord, target: ReviewStatusTarget, completed = 0, total = 0): Promise<void> {
    const key = `${target.repo.owner.toLowerCase()}/${target.repo.name.toLowerCase()}/${target.headSha}`;
    const prior = this.writes.get(key) ?? Promise.resolve();
    const current = prior.catch(() => undefined).then(() => this.writeOrdered(record, target, completed, total));
    this.writes.set(key, current);
    try { await current; }
    finally { if (this.writes.get(key) === current) this.writes.delete(key); }
  }

  private async writeOrdered(record: ReviewStatusSyncRecord, target: ReviewStatusTarget, completed: number, total: number): Promise<void> {
    if (await this.repository.getCurrentAttemptId(target.repo, target.prNumber, target.headSha) !== target.attemptId) {
      try { await this.repository.saveStatusSync({ ...record, syncPending: false, retryAt: null, errorSummary: 'Superseded attempt' }); }
      catch (_error: unknown) { this.logger.error('Review status supersession persistence failed', new Error('Review status supersession persistence failed')); }
      return;
    }
    const persistedProgress = /^Reviewing… (\d+)\/(\d+) lenses$/.exec(record.description);
    if (persistedProgress) {
      completed = Number(persistedProgress[1]);
      total = Number(persistedProgress[2]);
    }
    const update: ReviewStatusUpdate = record.state === 'pending'
      ? record.description === 'Review queued'
        ? { target, state: 'queued', description: record.description, summary: record.description }
        : { target, state: 'in_progress', description: record.description, summary: record.description,
          progress: { completedLenses: completed, totalLenses: total, stage: 'lenses' } }
      : { target, state: 'completed', description: record.description, summary: record.description,
        conclusion: record.state === 'success' ? 'success' : record.state === 'failure' ? 'failure' : 'cancelled' };
    try {
      const receipt = await this.port.upsertStatus(update, record.externalId ? { target, provider: 'commit_status', externalId: record.externalId } : null);
      await this.repository.saveStatusSync({ ...record, externalId: receipt.externalId, syncPending: false,
        retryAt: null, errorSummary: null, syncedState: record.state, syncedDescription: record.description });
      if (record.state === 'pending' && record.description !== 'Review queued') {
        try { await this.port.updateProgressComment?.(target, record.description); }
        catch (_error: unknown) { this.logger.error('Review progress comment failed', new Error('Review progress comment failed')); }
      }
    } catch (error: unknown) {
      const summary = sanitizeReviewFailureMessage(error instanceof Error ? error.message : 'GitHub status write failed');
      try { await this.repository.saveStatusSync({ ...record, syncPending: true,
        retryAt: new Date(Date.now() + RETRY_MS).toISOString(), errorSummary: summary }); }
      catch (_error: unknown) { this.logger.error('Review status retry persistence failed', new Error('Review status retry persistence failed')); }
      this.logger.error('Review status sync failed', new Error(summary));
    }
  }
}
