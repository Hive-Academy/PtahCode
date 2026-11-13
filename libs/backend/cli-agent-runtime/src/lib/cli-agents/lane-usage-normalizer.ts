import type { CliOutputSegment } from '@ptah-extension/shared';
import type { UsageScope } from '@ptah-extension/platform-core';

type Usage = NonNullable<CliOutputSegment['usage']>;
type Counter = 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens';

function withCounters(usage: Usage, counter: (key: Counter) => number | undefined): Usage {
  return {
    ...usage,
    inputTokens: counter('inputTokens'),
    outputTokens: counter('outputTokens'),
    cacheReadTokens: counter('cacheReadTokens'),
    cacheWriteTokens: counter('cacheWriteTokens'),
  };
}

/** Keeps absent counters unknown while converting provider snapshots to turn deltas. */
export class LaneUsageNormalizer {
  private readonly cumulative = new Map<string, Usage>();
  private readonly messages = new Map<string, Usage>();

  accept(laneId: string, scope: UsageScope, usage: Usage): Usage {
    if (scope === 'turn') return usage;
    if (scope === 'message') {
      const prior = this.messages.get(laneId);
      const total = withCounters(usage, (key) => {
        const current = usage[key];
        const previous = prior?.[key];
        return current === undefined ? previous : (previous ?? 0) + current;
      });
      this.messages.set(laneId, total);
      return total;
    }
    const prior = this.cumulative.get(laneId);
    this.cumulative.set(laneId, usage);
    const delta = withCounters(usage, (key) => {
      const current = usage[key];
      const previous = prior?.[key];
      return current === undefined ? undefined
        : previous === undefined ? current
        : current >= previous ? current - previous : current;
    });
    return delta;
  }

  settleTurn(laneId: string): void { this.messages.delete(laneId); }
  release(laneId: string): void {
    this.messages.delete(laneId);
    this.cumulative.delete(laneId);
  }
}
