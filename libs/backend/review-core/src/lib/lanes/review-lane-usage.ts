import { z } from 'zod';
import { ReviewModelIdSchema } from '@ptah-extension/review-contracts';

const LaneTokenCountSchema = z.number().int().nonnegative().safe().nullable();

/** Usage of one lane run as the gateway read it; a null counter, cost or model is unknown. */
export const ReviewLaneRunUsageSchema = z
  .object({
    inputTokens: LaneTokenCountSchema,
    outputTokens: LaneTokenCountSchema,
    cacheReadTokens: LaneTokenCountSchema,
    cacheWriteTokens: LaneTokenCountSchema,
    costUsd: z.number().finite().nonnegative().nullable(),
    model: ReviewModelIdSchema.nullable(),
    /** The run stopped before its usage was complete (abort, deadline, failure). */
    partial: z.boolean(),
  })
  .strict();
export type ReviewLaneRunUsage = z.infer<typeof ReviewLaneRunUsageSchema>;

/** A lane run whose usage is not known at all. */
export function UNKNOWN_LANE_RUN_USAGE(partial: boolean): ReviewLaneRunUsage {
  return { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, costUsd: null, model: null, partial };
}

/** What a lane gateway resolves with once its lane ended. */
export type ReviewLaneSpawnResult = { usage: ReviewLaneRunUsage };

/**
 * A gateway spawn failure that says whether the lane started and what it used. `message` and `name`
 * are the wrapped error's, so a failure reason built from them reads as it did without the wrapper.
 */
export class ReviewLaneSpawnError extends Error {
  readonly spawned: boolean;
  readonly usage: ReviewLaneRunUsage | null;

  constructor(error: unknown, spawned: boolean, usage: ReviewLaneRunUsage | null) {
    // A non-Error throw reads as the runner's own fallback failure.
    super(error instanceof Error ? error.message : 'Review lane failed', { cause: error });
    this.name = error instanceof Error ? error.name : 'Error';
    this.spawned = spawned;
    this.usage = usage;
  }

  /** Wraps `error`; one that already is a `ReviewLaneSpawnError` is returned unchanged. */
  static from(error: unknown, spawned: boolean, usage: ReviewLaneRunUsage | null): ReviewLaneSpawnError {
    return error instanceof ReviewLaneSpawnError ? error : new ReviewLaneSpawnError(error, spawned, usage);
  }
}
