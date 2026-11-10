import { z } from 'zod';
import { ShaSchema } from './review-finding.schema';
import { RepoIdentitySchema } from './review-run.schema';

/** One public status belongs to one attempt on one pull request head. */
export const ReviewStatusTargetSchema = z.object({
  repo: RepoIdentitySchema,
  prNumber: z.number().int().min(1).max(1_000_000_000),
  headSha: ShaSchema,
  attemptId: z.string().trim().min(1).max(64),
  machineId: z.string().trim().min(1).max(128),
}).strict();
export type ReviewStatusTarget = z.infer<typeof ReviewStatusTargetSchema>;

export const ReviewStatusProgressSchema = z.object({
  completedLenses: z.number().int().min(0).max(100),
  totalLenses: z.number().int().min(0).max(100),
  stage: z.string().trim().min(1).max(64),
}).strict().refine(
  ({ completedLenses, totalLenses }) => completedLenses <= totalLenses,
  'Completed lenses cannot exceed selected lenses',
);
export type ReviewStatusProgress = z.infer<typeof ReviewStatusProgressSchema>;

export const ReviewStatusConclusionSchema = z.enum([
  'success',
  'failure',
  'cancelled',
]);
export type ReviewStatusConclusion = z.infer<typeof ReviewStatusConclusionSchema>;

const statusBase = z.object({
  target: ReviewStatusTargetSchema,
  /** Short enough for GitHub commit-status descriptions. */
  description: z.string().trim().min(1).max(140),
  /** Check Run output or the source for a bounded walkthrough comment. */
  summary: z.string().max(65_536),
});

export const ReviewStatusUpdateSchema = z.discriminatedUnion('state', [
  statusBase.extend({ state: z.literal('queued') }).strict(),
  statusBase.extend({
    state: z.literal('in_progress'),
    progress: ReviewStatusProgressSchema,
  }).strict(),
  statusBase.extend({
    state: z.literal('completed'),
    conclusion: ReviewStatusConclusionSchema,
  }).strict(),
]);
export type ReviewStatusUpdate = z.infer<typeof ReviewStatusUpdateSchema>;

/** Store this with the attempt; the ID is reused for idempotent updates. */
export const ReviewStatusReceiptSchema = z.object({
  target: ReviewStatusTargetSchema,
  provider: z.enum(['check_run', 'commit_status']),
  externalId: z.string().trim().min(1).max(128),
}).strict();
export type ReviewStatusReceipt = z.infer<typeof ReviewStatusReceiptSchema>;

export interface IReviewStatusPort {
  /** Best-effort live update of the walkthrough comment on this head. */
  updateProgressComment?(target: ReviewStatusTarget, summary: string): Promise<void>;
  /** Reconcile an uncertain create or recover a status after a restart. */
  findOwnStatus(target: ReviewStatusTarget): Promise<ReviewStatusReceipt | null>;
  /** Reuse the receipt when present; return the identity of the public write. */
  upsertStatus(
    update: ReviewStatusUpdate,
    previous?: ReviewStatusReceipt | null,
  ): Promise<ReviewStatusReceipt>;
}
