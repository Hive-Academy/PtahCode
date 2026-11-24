import type { IReviewQueueRepository } from '../review-queue.service';
import type { RepoIdentity } from '@ptah-extension/review-contracts';
import type { ReviewFailure } from '../review-failure';
import type { ReviewLaneUse } from '../lanes/review-lane.runner';
import type { ReviewLaneRunUsage } from '../lanes/review-lane-usage';

export interface ReviewStageRecord {
  attemptId: string;
  stage: string;
  ordinal: number;
  state: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted' | 'skipped';
  startedAt: string | null;
  endedAt: string | null;
  outcome: string | null;
  errorSummary: string | null;
  artifactHash: string | null;
  artifactPath: string | null;
}

export interface ReviewAttemptRecord {
  attemptId: string;
  repoId: string;
  prNumber: number;
  headSha: string;
  attemptNumber: number;
  trigger: 'automatic' | 'manual';
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  queuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ReviewStatusSyncRecord {
  attemptId: string;
  machineId: string;
  state: 'pending' | 'success' | 'failure' | 'error';
  description: string;
  externalId: string | null;
  syncPending: boolean;
  retryAt: string | null;
  errorSummary: string | null;
  syncedState: string | null;
  syncedDescription: string | null;
}

/** A checkpoint is stored as a stage with a JSON outcome, keyed by attempt/stage/ordinal. */
export interface IReviewRepository extends IReviewQueueRepository {
  getLastReviewedHead(repo: RepoIdentity, prNumber: number): Promise<string | null>;
  getOpenFailures(repo: RepoIdentity, prNumber: number): Promise<Array<{ id: string; path: string }>>;
  getLastPollAt(repo: RepoIdentity): Promise<number | null>;
  recordPoll(repo: RepoIdentity, ok: boolean): Promise<void>;
  saveFailure(attemptId: string, failure: ReviewFailure): Promise<void>;
  getAttempt(attemptId: string): Promise<ReviewAttemptRecord | null>;
  getCurrentAttemptId(repo: RepoIdentity, prNumber: number, headSha: string): Promise<string | null>;
  getStages(attemptId: string): Promise<ReviewStageRecord[]>;
  saveStage(stage: ReviewStageRecord): Promise<void>;
  saveCheckpoint(attemptId: string, stage: string, ordinal: number, data: unknown): Promise<void>;
  getCheckpoint(attemptId: string, stage: string, ordinal: number): Promise<unknown | null>;
  /**
   * Appends one pending lane run to the `checkpoint:lane:<stage>` row before a lane starts, so a run the
   * process never ends still counts as unknown and partial. Does not touch `review_stages.family`.
   */
  beginStageLaneRun(attemptId: string, stage: string, ordinal: number): Promise<void>;
  /**
   * Ends the pending lane run on the `checkpoint:lane:<stage>` row and appends `run` when given (no migration,
   * plan A2). A non-null `use` replaces lane, model, family and skipped entries and writes the family, null
   * included, into `review_stages.family`; a null `use` keeps the stored lane.
   */
  saveStageLane(attemptId: string, stage: string, ordinal: number, use: ReviewLaneUse | null, run?: ReviewLaneRunUsage): Promise<void>;
  /**
   * Closes the caller's own `running` row as `interrupted`. The `startedAt` match leaves a row that a new
   * lease owner has restarted untouched.
   */
  closeRunningStage(attemptId: string, stage: string, ordinal: number, startedAt: string, endedAt: string): Promise<void>;
  getStatusSync(attemptId: string): Promise<ReviewStatusSyncRecord | null>;
  saveStatusSync(record: ReviewStatusSyncRecord): Promise<void>;
  getPendingStatusSync(now: string): Promise<ReviewStatusSyncRecord[]>;
  getMachineStatusSync(machineId: string): Promise<ReviewStatusSyncRecord[]>;
  syncFindingResolution(repo: RepoIdentity, prNumber: number, findingId: string, resolved: boolean): Promise<boolean>;
}
