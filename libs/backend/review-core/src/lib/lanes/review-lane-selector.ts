import type { Lens } from '@ptah-extension/review-contracts';
import type { ReviewLaneCandidate } from './review-lane-selection';

export type ReviewLaneKind = 'triage' | Lens | 'verifier';
export type LaneLimitState = 'confirmed-room' | 'unknown' | 'at-limit';

/** One listed review lane. Selection lives in `review-lane-selection.ts` (`selectReviewLane`). */
export type ReviewLaneCapability = ReviewLaneCandidate;
