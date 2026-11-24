import type { CliOutputSegment } from '@ptah-extension/shared';
import type { UsageScope } from '@ptah-extension/platform-core';

type Usage = NonNullable<CliOutputSegment['usage']>;
type Counter = 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'totalTokens';

/**
 * The summed counters. Snapshot fields (`contextTokens`, `durationMs`,
 * `model`, `models`) pass through unchanged: the renderer takes them
 * last-wins, so they are never subtracted (E56).
 */
const COUNTERS: readonly Counter[] = [
  'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens',
];

/** What one usage segment adds to the card, and the turn total so far. */
export interface LaneUsageStep {
  /** Counters this segment adds; absent counters stay absent. May be negative for a `turn` correction. */
  readonly increment: Usage;
  /** The turn's total so far: what the durable lane outcome records. */
  readonly turnTotal: Usage;
}

function withCounters(usage: Usage, counter: (key: Counter) => number | undefined): Usage {
  const next: { -readonly [K in keyof Usage]: Usage[K] } = { ...usage };
  for (const key of COUNTERS) {
    const value = counter(key);
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

function withoutCost(usage: Usage): Usage {
  const next: { -readonly [K in keyof Usage]: Usage[K] } = { ...usage };
  delete next.costUsd;
  return next;
}

/** `a + b` per counter; a counter absent in both stays absent. */
function add(a: Usage | undefined, b: Usage, fields: Usage): Usage {
  return withCounters(fields, (key) => {
    const left = a?.[key];
    const right = b[key];
    return left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0);
  });
}

/**
 * Turns every usage segment into an increment the card can add up, while the
 * turn total stays exact (B4, D8). Per lane and per turn:
 * - `message`: one provider message; the increment is the usage itself.
 * - `cumulative`: a turn-scoped snapshot; the increment is the delta to the
 *   previous snapshot of this turn (a regression starts a new series).
 * - `turn`: the turn total so far; the increment is `total - running sum`,
 *   which may be negative, so the card sum equals the provider's total.
 * `costUsd` rides only on `turn` increments (last-wins, as before).
 */
export class LaneUsageNormalizer {
  /** Sum of the increments emitted this turn. */
  private readonly sums = new Map<string, Usage>();
  /** Last `cumulative` snapshot of this turn. */
  private readonly snapshots = new Map<string, Usage>();

  accept(laneId: string, scope: UsageScope, usage: Usage): LaneUsageStep {
    const sum = this.sums.get(laneId);
    if (scope === 'turn') {
      const increment = withCounters(usage, (key) => {
        const total = usage[key];
        return total === undefined ? undefined : total - (sum?.[key] ?? 0);
      });
      this.sums.set(laneId, withCounters(usage, (key) => usage[key] ?? sum?.[key]));
      return { increment, turnTotal: usage };
    }
    let increment: Usage;
    if (scope === 'message') {
      increment = withoutCost(usage);
    } else {
      const previous = this.snapshots.get(laneId);
      this.snapshots.set(laneId, usage);
      increment = withoutCost(withCounters(usage, (key) => {
        const current = usage[key];
        const before = previous?.[key];
        return current === undefined ? undefined
          : before === undefined || current < before ? current
          : current - before;
      }));
    }
    const turnTotal = add(sum, increment, usage);
    this.sums.set(laneId, turnTotal);
    return { increment, turnTotal };
  }

  /** A new turn starts from zero: running sums and snapshots are cleared. */
  settleTurn(laneId: string): void {
    this.sums.delete(laneId);
    this.snapshots.delete(laneId);
  }

  release(laneId: string): void {
    this.settleTurn(laneId);
  }
}
