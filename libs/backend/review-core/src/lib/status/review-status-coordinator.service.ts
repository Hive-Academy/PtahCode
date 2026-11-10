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
    await this.update(attempt, 'pending', `Reviewing… 0/${totalLenses} lenses`);
  }

  async lensCompleted(attempt: ReviewQueueAttempt, completed: number, total: number): Promise<void> {
    if (attempt.dryRun) return;
    await this.update(attempt, 'pending', `Reviewing… ${completed}/${total} lenses`);
  }

  async finished(attempt: ReviewQueueAttempt, outcome: ReviewOutcome, severities: readonly ReviewSeverity[]): Promise<void> {
    if (attempt.dryRun) return;
    const conclusion = reviewStatusConclusion(outcome, severities);
    await this.update(attempt, conclusion.state, conclusion.description);
  }

  async retryDue(): Promise<void> {
    for (const due of await this.repository.getPendingStatusSync(new Date().toISOString())) {
      if (due.machineId !== this.machineId) continue;
      const attempt = await this.repository.getAttempt(due.attemptId);
      if (!attempt) continue;
      const [owner, name] = attempt.repoId.split('/');
      if (!owner || !name) continue;
      const repo = { owner, name };
      // The due row is a snapshot. Read the row again in the serialized section, so that a
      // stale snapshot cannot publish an older state after a newer state of the same attempt.
      await this.serialize(repo, attempt.headSha, async () => {
        const latest = await this.repository.getStatusSync(due.attemptId);
        if (!latest?.syncPending) return;
        await this.publish(latest, { repo, prNumber: attempt.prNumber, headSha: attempt.headSha,
          attemptId: attempt.attemptId, machineId: latest.machineId });
      });
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

  /** Reads, saves and publishes in one serialized section, so that writes of one attempt cannot interleave. */
  private async update(attempt: ReviewQueueAttempt, state: ReviewStatusSyncRecord['state'], description: string): Promise<void> {
    await this.serialize(attempt.repo, attempt.headSha, async () => {
      const previous = await this.repository.getStatusSync(attempt.attemptId);
      if (previous?.state === state && previous.description === description && !previous.syncPending) return;
      const record: ReviewStatusSyncRecord = { attemptId: attempt.attemptId, machineId: previous?.machineId ?? this.machineId,
        state, description, externalId: previous?.externalId ?? null, syncPending: true, retryAt: null,
        errorSummary: null, syncedState: previous?.syncedState ?? null, syncedDescription: previous?.syncedDescription ?? null };
      await this.repository.saveStatusSync(record);
      await this.publish(record, { repo: attempt.repo, prNumber: attempt.prNumber, headSha: attempt.headSha,
        attemptId: attempt.attemptId, machineId: record.machineId });
    });
  }

  private async serialize(repo: ReviewStatusTarget['repo'], headSha: string, work: () => Promise<void>): Promise<void> {
    const key = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}/${headSha}`;
    const prior = this.writes.get(key) ?? Promise.resolve();
    const current = prior.catch(() => undefined).then(work);
    this.writes.set(key, current);
    try { await current; }
    finally { if (this.writes.get(key) === current) this.writes.delete(key); }
  }

  /** Publishes one status row. Call it only from a serialized section. */
  private async publish(record: ReviewStatusSyncRecord, target: ReviewStatusTarget): Promise<void> {
    if (await this.repository.getCurrentAttemptId(target.repo, target.prNumber, target.headSha) !== target.attemptId) {
      try { await this.repository.saveStatusSync({ ...record, syncPending: false, retryAt: null, errorSummary: 'Superseded attempt' }); }
      catch (_error: unknown) { this.logger.error('Review status supersession persistence failed', new Error('Review status supersession persistence failed')); }
      return;
    }
    const progress = /^Reviewing… (\d+)\/(\d+) lenses$/.exec(record.description);
    const update: ReviewStatusUpdate = record.state === 'pending'
      ? record.description === 'Review queued'
        ? { target, state: 'queued', description: record.description, summary: record.description }
        : { target, state: 'in_progress', description: record.description, summary: record.description,
          progress: { completedLenses: Number(progress?.[1] ?? 0), totalLenses: Number(progress?.[2] ?? 0), stage: 'lenses' } }
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
