import { z } from 'zod';
import { ReviewLaneListingEntrySchema } from '@ptah-extension/review-contracts';
import type { Logger } from '@ptah-extension/vscode-core';

/** Most lanes one list read serves; the listing contract carries no more. */
export const REVIEW_LANE_LIST_MAX = 100;

/** One gateway lane row: the listing entry without its catalog. */
export const ReviewLaneCandidateSchema = ReviewLaneListingEntrySchema.omit({ catalog: true });
/** One lane of the review lane list, in gateway (global preference) order. */
export type ReviewLaneCandidate = z.infer<typeof ReviewLaneCandidateSchema>;

export interface ReviewLaneList {
  lanes: ReviewLaneCandidate[];
  maxConcurrentAgents: number;
}

const LaneListSchema = z
  .object({ lanes: z.array(z.unknown()), maxConcurrentAgents: z.number().int().nonnegative() })
  .strict();

/**
 * Validates one gateway list read. A lane row the contract cannot carry is left out with one warn log
 * (a count, no values), so one bad row never fails the review or the listing; rows past
 * `REVIEW_LANE_LIST_MAX` are cut. A list that is not the gateway shape at all throws.
 */
export function parseReviewLaneList(raw: unknown, logger: Pick<Logger, 'warn'>): ReviewLaneList {
  const list = LaneListSchema.parse(raw);
  const lanes: ReviewLaneCandidate[] = [];
  let dropped = 0;
  for (const row of list.lanes.slice(0, REVIEW_LANE_LIST_MAX)) {
    const parsed = ReviewLaneCandidateSchema.safeParse(row);
    if (parsed.success) lanes.push(parsed.data);
    else dropped += 1;
  }
  if (dropped > 0) logger.warn('Review lanes that the lane contract cannot carry were left out', { dropped });
  return { lanes, maxConcurrentAgents: list.maxConcurrentAgents };
}
