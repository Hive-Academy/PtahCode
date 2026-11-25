import {
  LANE_DEFAULT_MODEL,
  LANE_USER_STOP_CLASS,
  type LaneOutcomeSummary,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';
import { NEUTRAL_SCORE, OUTCOME_WINDOW_MS } from '../routing-constants';
import { blendedMean, blendedRate } from './blend';
import { buildSeedMatrix, isStale } from './seed-matrix';
import {
  CAPABILITY_MATRIX_VERSION,
  FAMILY_PROFILE_MODEL,
  type CapabilityMatrix,
  type MatrixCell,
  type MatrixProfile,
  type ValueMatrixCell,
} from './matrix.types';

/**
 * Local matrix cells from outcome summaries (Requirement 6.6, part A constants).
 *
 * Pure: the same summaries and `nowMs` always produce the same matrix. The
 * store supplies the summaries; this module does not read the outcome port.
 *
 * A cell is derived when at least one Requirement 9.1 rate has a verified
 * run in the 90-day window: delivery counts `delivered` over
 * `delivered + noDeliverable + failed` runs, review counts `approved`
 * over `approved + rejected`. Each available rate is blended toward the
 * prior (Requirement 8): `round(100 * (s + k * prior / 100) / (n + k))`
 * with `k = BLEND_PRIOR_WEIGHT`, successes `s` and observed runs `n`. The
 * prior is the score of the exact seed cell for the same family, model
 * and task kind (`buildSeedMatrix`, a pure function of `nowMs`), else
 * `NEUTRAL_SCORE`. The score is the blended delivered rate when only
 * delivery has runs, the blended review pass rate when only review does,
 * otherwise the mean of the two, rounded half away from zero. `asOf` is
 * the newest contributing record. `sampleCount` is how many unique runs
 * contributed to the rate or rates used.
 *
 * Runs stored under `LANE_DEFAULT_MODEL` or `auto` land on the family
 * profile (`*`), which is the key lookup uses for those models (Req 11.3).
 */

/** Model id that selects a model automatically (Requirement 11.3). */
export const AUTOMATIC_MATRIX_MODEL = 'auto';
export const CAPACITY_FAILURE_CLASSES = new Set(['usage-limit', 'auth', 'timeout']);
export function isCapacityFailure(failureClass: LaneOutcomeSummary['failureClass']): boolean {
  return failureClass !== null && CAPACITY_FAILURE_CLASSES.has(failureClass);
}
/**
 * A run that says nothing about the lane's quality: a capacity failure, or a
 * caller stop (`user-stop`). It counts in no delivery rate, neither as a
 * failure nor in the denominator.
 */
export function isExcludedFromRates(failureClass: LaneOutcomeSummary['failureClass']): boolean {
  return failureClass === LANE_USER_STOP_CLASS || isCapacityFailure(failureClass);
}

interface RateBucket {
  readonly family: string;
  readonly model: string;
  readonly taskKind: OutcomeTaskKind;
  delivered: number;
  noDeliverable: number;
  failed: number;
  approved: number;
  rejected: number;
  unresolvedRevise: number;
  delivery: LaneOutcomeSummary[];
  review: LaneOutcomeSummary[];
}

/**
 * One profile per family and model that derived a cell. Profiles are
 * sorted by family, then by model, with `*` before other models.
 */
export function deriveLocalMatrix(
  summaries: readonly LaneOutcomeSummary[],
  nowMs: number,
): CapabilityMatrix {
  assertFiniteNow(nowMs);
  const sinceMs = nowMs - OUTCOME_WINDOW_MS;
  const buckets = new Map<string, RateBucket>();
  for (const summary of dedupeByRun(summaries)) {
    const bucket = bucketFor(summary, sinceMs, buckets);
    if (bucket === undefined) continue;
    countSummary(bucket, summary);
  }
  return {
    version: CAPABILITY_MATRIX_VERSION,
    profiles: profilesFrom(buckets, nowMs),
  };
}

export function assertFiniteNow(nowMs: number): void {
  if (!Number.isFinite(nowMs)) {
    throw new Error('nowMs must be a finite epoch millisecond');
  }
}

/**
 * One row per `runId`. Equal `endedAt` breaks the tie on a key that ignores
 * input order, so a shuffled list cannot change the kept row.
 */
export function dedupeByRun(
  summaries: readonly LaneOutcomeSummary[],
): LaneOutcomeSummary[] {
  const byId = new Map<string, LaneOutcomeSummary>();
  for (const summary of summaries) {
    const current = byId.get(summary.runId);
    if (current === undefined || preferSummary(summary, current)) {
      byId.set(summary.runId, summary);
    }
  }
  return [...byId.values()];
}

function preferSummary(
  candidate: LaneOutcomeSummary,
  current: LaneOutcomeSummary,
): boolean {
  const candidateOk = Number.isFinite(candidate.endedAt);
  const currentOk = Number.isFinite(current.endedAt);
  if (candidateOk !== currentOk) return candidateOk;
  if (candidate.endedAt !== current.endedAt) {
    return candidate.endedAt > current.endedAt;
  }
  return tieKey(candidate) > tieKey(current);
}

function tieKey(summary: LaneOutcomeSummary): string {
  return JSON.stringify([
    summary.verdict,
    summary.finalReview,
    summary.taskKind,
    summary.family,
    summary.model,
  ]);
}

function bucketFor(
  summary: LaneOutcomeSummary,
  sinceMs: number,
  buckets: Map<string, RateBucket>,
): RateBucket | undefined {
  if (summary.taskKind === null) return undefined;
  if (!Number.isFinite(summary.endedAt) || summary.endedAt < sinceMs) {
    return undefined;
  }
  if (isBlank(summary.family) || isBlank(summary.model)) return undefined;
  const model = matrixModelKey(summary.model);
  const taskKind = summary.taskKind;
  const key = JSON.stringify([summary.family, model, taskKind]);
  const existing = buckets.get(key);
  if (existing !== undefined) return existing;
  const created = emptyRateBucket({ family: summary.family, model, taskKind });
  buckets.set(key, created);
  return created;
}

type RateKey = Pick<RateBucket, 'family' | 'model' | 'taskKind'>;
type ChoiceRateKey = RateKey & Pick<MatrixProfile, 'effort'>;

function emptyRateBucket(key: RateKey): RateBucket {
  return {
    ...key,
    delivered: 0,
    noDeliverable: 0,
    failed: 0,
    approved: 0,
    rejected: 0,
    unresolvedRevise: 0,
    delivery: [],
    review: [],
  };
}

/** Score the deduplicated, rate-eligible runs assigned to one choice key. */
export function deriveLocalCell(
  key: ChoiceRateKey,
  summaries: readonly LaneOutcomeSummary[],
  nowMs: number,
  seedProfiles: readonly MatrixProfile[],
): ValueMatrixCell | undefined {
  const bucket = emptyRateBucket(key);
  for (const summary of summaries) countSummary(bucket, summary);
  return cellFrom(bucket, nowMs, priorScore(key, seedProfiles));
}

function matrixModelKey(model: string): string {
  if (model === LANE_DEFAULT_MODEL || model === AUTOMATIC_MATRIX_MODEL) {
    return FAMILY_PROFILE_MODEL;
  }
  return model;
}

function isBlank(value: string): boolean {
  return !/\S/.test(value);
}

function countSummary(bucket: RateBucket, summary: LaneOutcomeSummary): void {
  switch (summary.verdict) {
    case 'delivered':
      bucket.delivered += 1;
      bucket.delivery.push(summary);
      break;
    case 'no-deliverable':
      if (!isExcludedFromRates(summary.failureClass)) {
        bucket.noDeliverable += 1;
        bucket.delivery.push(summary);
      }
      break;
    case 'failed':
      if (!isExcludedFromRates(summary.failureClass)) {
        bucket.failed += 1;
        bucket.delivery.push(summary);
      }
      break;
    case 'unverified':
      break;
    default: {
      const unexpected: never = summary.verdict;
      throw new Error(`unexpected verdict ${String(unexpected)}`);
    }
  }
  // A review of a run the caller stopped judges unfinished work: no review rate either.
  if (summary.failureClass === LANE_USER_STOP_CLASS) return;
  switch (summary.finalReview) {
    case 'approved':
      bucket.approved += 1;
      bucket.review.push(summary);
      break;
    case 'rejected':
      bucket.rejected += 1;
      bucket.review.push(summary);
      break;
    case null:
      if (summary.reviseRounds > 0) {
        bucket.unresolvedRevise += 1;
        bucket.review.push(summary);
      }
      break;
    default: {
      const unexpected: never = summary.finalReview;
      throw new Error(`unexpected final review ${String(unexpected)}`);
    }
  }
}

function profilesFrom(
  buckets: Map<string, RateBucket>,
  nowMs: number,
): MatrixProfile[] {
  const drafts = new Map<
    string,
    {
      family: string;
      model: string;
      cells: Record<OutcomeTaskKind, MatrixCell>;
    }
  >();
  const seedProfiles = buildSeedMatrix(nowMs).profiles;
  for (const bucket of buckets.values()) {
    const cell = cellFrom(bucket, nowMs, priorScore(bucket, seedProfiles));
    if (cell === undefined) continue;
    const key = JSON.stringify([bucket.family, bucket.model]);
    const draft = drafts.get(key) ?? {
      family: bucket.family,
      model: bucket.model,
      cells: unknownCells(),
    };
    draft.cells[bucket.taskKind] = cell;
    drafts.set(key, draft);
  }
  return [...drafts.values()].sort(compareProfiles).map((draft) => ({
    family: draft.family,
    model: draft.model,
    cells: draft.cells,
  }));
}

function unknownCells(): Record<OutcomeTaskKind, MatrixCell> {
  return {
    plan: { kind: 'unknown' },
    implement: { kind: 'unknown' },
    review: { kind: 'unknown' },
    research: { kind: 'unknown' },
    tests: { kind: 'unknown' },
    docs: { kind: 'unknown' },
  };
}

/**
 * The blend prior uses the effort-specific seed cell when present,
 * then the effort-agnostic cell for the same family, model, and task kind.
 */
function priorScore(
  key: ChoiceRateKey,
  seedProfiles: readonly MatrixProfile[],
): number {
  const profileFor = (effort: MatrixProfile['effort']) => seedProfiles.find(
    (candidate) =>
      candidate.family === key.family &&
      candidate.model === key.model &&
      candidate.effort === effort,
  );
  const exact = key.effort === undefined ? undefined : profileFor(key.effort)?.cells[key.taskKind];
  const cell = exact?.kind === 'value' ? exact : profileFor(undefined)?.cells[key.taskKind];
  return cell?.kind === 'value' ? cell.score : NEUTRAL_SCORE;
}

function cellFrom(
  bucket: RateBucket,
  nowMs: number,
  prior: number,
): ValueMatrixCell | undefined {
  const deliveryTotal = bucket.delivered + bucket.noDeliverable + bucket.failed;
  const reviewTotal = bucket.approved + bucket.rejected + bucket.unresolvedRevise;
  if (deliveryTotal === 0 && reviewTotal === 0) return undefined;

  const scored = scoreBucket(bucket, deliveryTotal, reviewTotal, prior);
  if (scored === undefined) return undefined;
  const newest = newestContributing(scored.contributing);
  const asOf = new Date(newest.endedAt).toISOString();
  return {
    kind: 'value',
    score: scored.score,
    source: 'local',
    asOf,
    stale: isStale(asOf, nowMs),
    sampleCount: scored.contributing.length,
  };
}

function scoreBucket(
  bucket: RateBucket,
  deliveryTotal: number,
  reviewTotal: number,
  prior: number,
):
  | {
      readonly score: number;
      readonly contributing: readonly LaneOutcomeSummary[];
    }
  | undefined {
  if (deliveryTotal > 0 && reviewTotal === 0) {
    const score = blendedRate(bucket.delivered, deliveryTotal, prior);
    if (score === undefined) return undefined;
    return { score, contributing: bucket.delivery };
  }
  if (reviewTotal > 0 && deliveryTotal === 0) {
    const score = blendedRate(bucket.approved, reviewTotal, prior);
    if (score === undefined) return undefined;
    return { score, contributing: bucket.review };
  }
  const score = blendedMean(
    bucket.delivered,
    deliveryTotal,
    bucket.approved,
    reviewTotal,
    prior,
  );
  if (score === undefined) return undefined;
  return { score, contributing: unionByRun(bucket.delivery, bucket.review) };
}

function unionByRun(
  left: readonly LaneOutcomeSummary[],
  right: readonly LaneOutcomeSummary[],
): LaneOutcomeSummary[] {
  const byId = new Map<string, LaneOutcomeSummary>();
  for (const summary of left) byId.set(summary.runId, summary);
  for (const summary of right) byId.set(summary.runId, summary);
  return [...byId.values()];
}

function newestContributing(
  records: readonly LaneOutcomeSummary[],
): LaneOutcomeSummary {
  let best = records[0];
  if (best === undefined) {
    throw new Error('local derivation has no contributing record');
  }
  for (const record of records) {
    if (preferSummary(record, best)) best = record;
  }
  return best;
}

function compareProfiles(left: MatrixProfile, right: MatrixProfile): number {
  if (left.family < right.family) return -1;
  if (left.family > right.family) return 1;
  if (left.model === right.model) return 0;
  if (left.model === FAMILY_PROFILE_MODEL) return -1;
  if (right.model === FAMILY_PROFILE_MODEL) return 1;
  if (left.model < right.model) return -1;
  return 1;
}
