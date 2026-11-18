/** Sum aligned per-day series into one daily series; bad values count as 0. */
export function dailyTotals(series: readonly (readonly number[])[]): number[] {
  const length = Math.max(0, ...series.map((values) => values.length));
  const totals = new Array<number>(length).fill(0);
  for (const values of series) {
    values.forEach((value, day) => {
      if (Number.isFinite(value) && value > 0) totals[day] = (totals[day] ?? 0) + value;
    });
  }
  return totals;
}

/** Average consecutive buckets so a sparkline gets at most `points` values. */
export function downsample(values: readonly number[], points = 12): number[] {
  if (values.length <= points) return [...values];
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const start = Math.floor((i * values.length) / points);
    const end = Math.floor(((i + 1) * values.length) / points);
    const bucket = values.slice(start, Math.max(end, start + 1));
    out.push(bucket.reduce((sum, value) => sum + value, 0) / bucket.length);
  }
  return out;
}
