/**
 * Pure helpers for the KPI period-over-period deltas of the Usage view.
 *
 * `analytics:spendSummary` accepts only a 7, 30 or 90 day range and has no
 * offset, so the previous period is read from the next wider range: the
 * facts of the N days directly before the current window, where N is the
 * length of the current window. A 90-day range has no wider range, so its
 * delta is always null.
 */
import type {
  UsageFact,
  UsageRangeDays,
  UsageSummary,
} from '@ptah-extension/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The facts of the period directly before a loaded summary's window. */
export interface PreviousUsagePeriod {
  readonly fromDay: string;
  readonly untilDayExclusive: string;
  readonly facts: readonly UsageFact[];
}

/** Fractional change against the previous period (0.25 = +25 %). */
export interface KpiDeltas {
  readonly spend: number | null;
  readonly tokens: number | null;
}

export const NO_KPI_DELTAS: KpiDeltas = { spend: null, tokens: null };

/** The range that also covers the previous period, or null for 90 days. */
export function widerRangeFor(range: UsageRangeDays): UsageRangeDays | null {
  if (range === 7) return 30;
  if (range === 30) return 90;
  return null;
}

function dayToMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function msToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Slice the previous period out of the wider summary. Null when the wider
 * window does not cover the whole previous period or that period has no
 * facts.
 */
export function slicePreviousPeriod(
  current: UsageSummary,
  wider: UsageSummary,
): PreviousUsagePeriod | null {
  const fromMs = dayToMs(current.fromDay);
  const untilMs = dayToMs(current.untilDayExclusive);
  const widerFromMs = dayToMs(wider.fromDay);
  const widerUntilMs = dayToMs(wider.untilDayExclusive);
  if (![fromMs, untilMs, widerFromMs, widerUntilMs].every(Number.isFinite)) {
    return null;
  }
  const lengthMs = untilMs - fromMs;
  if (lengthMs < DAY_MS) return null;
  const previousFromMs = fromMs - lengthMs;
  if (widerFromMs > previousFromMs || widerUntilMs < fromMs) return null;

  const previousFromDay = msToDay(previousFromMs);
  // Summary boundaries describe the request, not the available history.
  const currentSources = new Map(current.sources.map((source) => [source.sourceId, source]));
  const widerSources = new Map(wider.sources.map((source) => [source.sourceId, source]));
  if (currentSources.size === 0 || currentSources.size !== widerSources.size) return null;
  for (const [id, source] of currentSources) {
    const previousSource = widerSources.get(id);
    if (source.status !== 'complete' || previousSource?.status !== 'complete' ||
        source.coverageStart === undefined || previousSource.coverageStart === undefined ||
        source.coverageStart > current.fromDay || previousSource.coverageStart > previousFromDay) return null;
  }
  if ([...current.facts, ...wider.facts].some((fact) => !currentSources.has(fact.sourceId))) return null;
  const facts = wider.facts.filter(
    (fact) => fact.day >= previousFromDay && fact.day < current.fromDay,
  );
  if (facts.length === 0) return null;
  return {
    fromDay: previousFromDay,
    untilDayExclusive: current.fromDay,
    facts,
  };
}

/** Complete spend (USD), or null if unpriced, and total tokens. */
export function periodTotals(facts: readonly UsageFact[]): {
  readonly spendUsd: number | null;
  readonly tokens: number;
} {
  let spendUsd = 0;
  let tokens = 0;
  let unpriced = false;
  for (const fact of facts) {
    unpriced ||= fact.costUsd === null || fact.costSource === 'unpriced';
    spendUsd += fact.costUsd ?? 0;
    tokens +=
      fact.inputUncachedTokens +
      fact.cacheReadTokens +
      fact.cacheWriteTokens +
      fact.outputTokens;
  }
  return { spendUsd: unpriced ? null : spendUsd, tokens };
}

/** (current - previous) / previous; null when previous <= 0 or not finite. */
export function fractionalDelta(
  current: number,
  previous: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  const delta = (current - previous) / previous;
  return Number.isFinite(delta) ? delta : null;
}

/** Spend and token deltas of the current summary against its previous period. */
export function computeKpiDeltas(
  current: UsageSummary | null,
  previous: PreviousUsagePeriod | null,
): KpiDeltas {
  if (current === null || previous === null) return NO_KPI_DELTAS;
  const now = periodTotals(current.facts);
  const before = periodTotals(previous.facts);
  return {
    spend: now.spendUsd === null || before.spendUsd === null
      ? null : fractionalDelta(now.spendUsd, before.spendUsd),
    tokens: fractionalDelta(now.tokens, before.tokens),
  };
}
