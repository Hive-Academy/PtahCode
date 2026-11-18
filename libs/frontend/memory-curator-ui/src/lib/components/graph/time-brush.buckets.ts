export interface TimeBucket { readonly from: number; readonly to: number; readonly count: number; }

/** Equal-width bins over finite timestamps; the final bin includes the maximum. */
export function buildTimeBuckets(timestamps: readonly number[], count = 24): readonly TimeBucket[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const valid = timestamps.filter(Number.isFinite);
  if (!valid.length) return [];
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const width = (max - min || 1) / count;
  const counts = Array<number>(count).fill(0);
  for (const timestamp of valid) counts[Math.min(count - 1, Math.floor((timestamp - min) / width))]++;
  return counts.map((value, index) => ({ from: min + width * index, to: min + width * (index + 1), count: value }));
}
