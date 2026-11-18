import { buildTimeBuckets } from './time-brush.buckets';

describe('buildTimeBuckets', () => {
  it('counts timestamps in equal bins, including the upper bound', () => {
    expect(buildTimeBuckets([0, 1, 2, 3], 2).map(bucket => bucket.count)).toEqual([2, 2]);
    expect(buildTimeBuckets([], 2)).toEqual([]);
    expect(buildTimeBuckets([NaN, 5], 2).reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1);
  });
});
