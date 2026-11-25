import { ReviewUsageTotalSchema } from '@ptah-extension/review-contracts';
import { aggregateReviewUsage, type StoredLaneRun } from './review-usage-total';

function run(overrides: Partial<StoredLaneRun> = {}): StoredLaneRun {
  return {
    inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 1, costUsd: 0.5,
    model: null, partial: false, ended: true, ...overrides,
  };
}

describe('aggregateReviewUsage', () => {
  it('sums every counter and the cost when every run reports them (3.1)', () => {
    expect(aggregateReviewUsage([run(), run({ inputTokens: 50, costUsd: 0.25 })])).toEqual({
      inputTokens: 150, outputTokens: 40, cacheReadTokens: 10, cacheWriteTokens: 2, totalTokens: 202,
      costUsd: 0.75, tokensPartial: false, costPartial: false, runs: 2,
    });
  });

  it('marks tokens partial when one run has no input count (3.2)', () => {
    const total = aggregateReviewUsage([run(), run({ inputTokens: null })]);
    expect(total).toMatchObject({ inputTokens: 100, outputTokens: 40, totalTokens: 152, tokensPartial: true, costPartial: false });
  });

  it('marks only cost partial when every cost is unknown and tokens are complete (3.3)', () => {
    const total = aggregateReviewUsage([run({ costUsd: null }), run({ costUsd: null })]);
    expect(total).toMatchObject({ costUsd: null, costPartial: true, tokensPartial: false, inputTokens: 200 });
  });

  it('gives null cache totals when one run misses a cache counter, without tokens partial (3.4)', () => {
    const total = aggregateReviewUsage([run(), run({ cacheReadTokens: null })]);
    expect(total).toMatchObject({ cacheReadTokens: null, cacheWriteTokens: 2, totalTokens: 247, tokensPartial: false });
  });

  it('gives null totals when nothing is known (3.5)', () => {
    const unknown = run({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, costUsd: null });
    expect(aggregateReviewUsage([unknown])).toEqual({
      inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null,
      costUsd: null, tokensPartial: true, costPartial: true, runs: 1,
    });
  });

  it('gives null for no runs (3.6)', () => {
    expect(aggregateReviewUsage([])).toBeNull();
  });

  it('marks both totals partial when a run is partial', () => {
    expect(aggregateReviewUsage([run({ partial: true })])).toMatchObject({ inputTokens: 100, tokensPartial: true, costPartial: true });
  });

  it('counts a pending run as unknown and partial, ignoring stored values', () => {
    const total = aggregateReviewUsage([run(), run({ ended: false })]);
    expect(total).toEqual({
      inputTokens: 100, outputTokens: 20, cacheReadTokens: null, cacheWriteTokens: null, totalTokens: 126,
      costUsd: 0.5, tokensPartial: true, costPartial: true, runs: 2,
    });
  });

  it('gives the same output for the same input (3.7)', () => {
    const runs = [run(), run({ costUsd: 0.1 }), run({ cacheWriteTokens: null, partial: true })];
    expect(aggregateReviewUsage(runs)).toEqual(aggregateReviewUsage(runs.map((entry) => ({ ...entry }))));
  });

  it('saturates a token sum past MAX_SAFE_INTEGER to null and partial', () => {
    const big = run({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    const total = aggregateReviewUsage([big, big]);
    expect(total).toMatchObject({ inputTokens: null, outputTokens: 0, totalTokens: null, tokensPartial: true, costPartial: false });
    expect(() => ReviewUsageTotalSchema.parse(total)).not.toThrow();
  });

  it('saturates a non-finite cost sum to null and partial', () => {
    const total = aggregateReviewUsage([run({ costUsd: Number.MAX_VALUE }), run({ costUsd: Number.MAX_VALUE })]);
    expect(total).toMatchObject({ costUsd: null, costPartial: true, tokensPartial: false });
    expect(() => ReviewUsageTotalSchema.parse(total)).not.toThrow();
  });

  it('counts 16 stages of 17 runs as 272 runs that pass the strict schema', () => {
    const runs = Array.from({ length: 16 * 17 }, (_, index) => run({ costUsd: index % 3 === 0 ? null : 0.01 }));
    const total = aggregateReviewUsage(runs);
    expect(total?.runs).toBe(272);
    expect(ReviewUsageTotalSchema.parse(total)).toEqual(total);
  });
});
