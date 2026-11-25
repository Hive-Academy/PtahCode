import type { ReviewUsageTotal } from '@ptah-extension/review-contracts';
import { UNKNOWN_LANE_RUN_USAGE, type ReviewLaneRunUsage } from '../lanes/review-lane-usage';

/** One stored lane run; a run that has not ended yet (`ended: false`) is pending. */
export type StoredLaneRun = ReviewLaneRunUsage & { ended: boolean };

type TokenKey = 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens';
const TOKEN_KEYS: readonly TokenKey[] = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];

function sumKnown(values: readonly (number | null)[]): number | null {
  let total: number | null = null;
  for (const value of values) if (value !== null) total = (total ?? 0) + value;
  return total;
}

/**
 * Totals stored lane runs, in the order given. No run gives null. A pending run counts as unknown
 * and partial. A token sum past `Number.MAX_SAFE_INTEGER` or a non-finite cost becomes null and partial.
 */
export function aggregateReviewUsage(runs: readonly StoredLaneRun[]): ReviewUsageTotal | null {
  if (runs.length === 0) return null;
  const counted: ReviewLaneRunUsage[] = runs.map((run) => (run.ended ? run : UNKNOWN_LANE_RUN_USAGE(true)));
  const column = (key: TokenKey): (number | null)[] => counted.map((run) => run[key]);

  let tokensPartial = counted.some((run) => run.partial || run.inputTokens === null || run.outputTokens === null);
  let costPartial = counted.some((run) => run.partial || run.costUsd === null);
  const safeTokens = (value: number | null): number | null => {
    if (value === null || Number.isSafeInteger(value)) return value;
    tokensPartial = true;
    return null;
  };

  const inputTokens = safeTokens(sumKnown(column('inputTokens')));
  const outputTokens = safeTokens(sumKnown(column('outputTokens')));
  const cacheSum = (key: TokenKey): number | null => {
    const values = column(key);
    return values.every((value) => value !== null) ? safeTokens(sumKnown(values)) : null;
  };
  const cacheReadTokens = cacheSum('cacheReadTokens');
  const cacheWriteTokens = cacheSum('cacheWriteTokens');
  const totalTokens = safeTokens(sumKnown(TOKEN_KEYS.flatMap(column)));

  let costUsd = sumKnown(counted.map((run) => run.costUsd));
  if (costUsd !== null && !Number.isFinite(costUsd)) {
    costUsd = null;
    costPartial = true;
  }

  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens, costUsd, tokensPartial, costPartial, runs: runs.length };
}
