/**
 * Display rows for the usage tables (breakdown by model and day, top
 * sessions). Pure: every label, title and bar width is computed here so the
 * templates only bind. Bar colours are the provider accents the daily chart
 * series use (`providerAccent`), so a provider keeps one colour everywhere.
 */
import { providerAccent } from '../provider-account-card/provider-accent';
import {
  barWidthPercent,
  formatCompactTokens,
  formatCostCell,
  formatDayShort,
  formatRelativeAge,
  formatShare,
  formatTableUsd,
  formatTokenCount,
  providerDisplayName,
} from './usage-formatting';
import type {
  DayBreakdownRow,
  ModelBreakdownRow,
  ProviderDailySeries,
  UsageSessionRow,
} from './usage-summary.view-model';

export interface ModelTableRow {
  readonly key: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly accent: string;
  readonly modelDisplayName: string;
  readonly costLabel: string;
  readonly costTitle: string | null;
  readonly shareLabel: string;
  /** Share of cost as a bar width, 0–100. */
  readonly shareBarPercent: number;
  readonly tokensLabel: string;
  readonly tokensTitle: string;
}

/** One provider's part of a day's cost bar. */
export interface DayBarSegment {
  readonly providerId: string;
  readonly color: string;
  /** Width in percent of the whole track (not of the day). */
  readonly widthPercent: number;
}

export interface DayTableRow {
  readonly day: string;
  readonly dayLabel: string;
  readonly costLabel: string;
  readonly costTitle: string | null;
  readonly shareLabel: string;
  /** Provider segments; together as wide as the day's cost against the largest day. */
  readonly segments: readonly DayBarSegment[];
  readonly tokensLabel: string;
  readonly tokensTitle: string;
  readonly topModelLabel: string;
}

export interface SessionTableRow {
  readonly key: string;
  readonly rank: number;
  readonly title: string;
  readonly providerId: string;
  readonly accent: string;
  readonly modelId: string;
  readonly modelDisplayName: string;
  readonly costLabel: string;
  readonly costTitle: string | null;
  /** Cost against the costliest listed session, 0–100. */
  readonly costBarPercent: number;
  readonly tokensLabel: string;
  readonly tokensTitle: string;
  readonly lastActive: string;
  readonly lastActiveLabel: string;
}

function unpricedFactsTitle(count: number, scope: string): string {
  return `${count} ${count === 1 ? 'fact' : 'facts'} unpriced ${scope}`;
}

export function buildModelTableRows(
  rows: readonly ModelBreakdownRow[],
): ModelTableRow[] {
  return rows.map((row) => ({
    key: `${row.providerId}:${row.modelId}`,
    providerId: row.providerId,
    providerName: providerDisplayName(row.providerId),
    accent: providerAccent(row.providerId),
    modelDisplayName: row.modelDisplayName,
    costLabel: formatCostCell(row.costUsd, row.unpriced),
    costTitle:
      row.costUsd === null
        ? 'No price for this model'
        : row.unpriced
          ? 'Some usage of this model is unpriced'
          : null,
    shareLabel: formatShare(row.shareOfCost),
    shareBarPercent:
      row.shareOfCost === null ? 0 : barWidthPercent(row.shareOfCost, 1),
    tokensLabel: formatCompactTokens(row.tokens),
    tokensTitle: formatTokenCount(row.tokens),
  }));
}

/**
 * Day rows with a stacked provider bar per day. `days` and every series'
 * `costValues` share one index; a day the series do not cover gets no bar.
 */
export function buildDayTableRows(
  rows: readonly DayBreakdownRow[],
  days: readonly string[],
  series: readonly ProviderDailySeries[],
): DayTableRow[] {
  const dayIndex = new Map(days.map((day, index) => [day, index]));
  const totalOf = (index: number | undefined): number =>
    index === undefined
      ? 0
      : series.reduce((sum, provider) => sum + (provider.costValues[index] ?? 0), 0);
  const maxTotal = rows.reduce(
    (max, row) => Math.max(max, totalOf(dayIndex.get(row.day))),
    0,
  );

  return rows.map((row) => {
    const index = dayIndex.get(row.day);
    const total = totalOf(index);
    const barPercent = barWidthPercent(total, maxTotal);
    const segments: DayBarSegment[] =
      index === undefined || total <= 0
        ? []
        : series
            .map((provider) => ({
              providerId: provider.providerId,
              color: provider.accent,
              widthPercent:
                (barPercent * Math.max(0, provider.costValues[index] ?? 0)) / total,
            }))
            .filter((segment) => segment.widthPercent > 0);
    return {
      day: row.day,
      dayLabel: formatDayShort(row.day),
      costLabel: formatCostCell(row.costUsd, row.unpricedFactCount > 0),
      costTitle:
        row.costUsd === null
          ? 'No priced usage this day'
          : row.unpricedFactCount > 0
            ? unpricedFactsTitle(row.unpricedFactCount, 'this day')
            : null,
      shareLabel: formatShare(row.shareOfCost),
      segments,
      tokensLabel: formatCompactTokens(row.tokens),
      tokensTitle: formatTokenCount(row.tokens),
      topModelLabel: row.topModelDisplayName ?? '—',
    };
  });
}

export function buildSessionTableRows(
  sessions: readonly UsageSessionRow[],
  generatedAt: string,
): SessionTableRow[] {
  const maxCost = sessions.reduce(
    (max, session) => Math.max(max, session.costUsd ?? 0),
    0,
  );
  return sessions.map((session, index) => ({
    key: `${session.providerId}:${session.sessionId}`,
    rank: index + 1,
    title: session.title,
    providerId: session.providerId,
    accent: providerAccent(session.providerId),
    modelId: session.modelId,
    modelDisplayName: session.modelDisplayName,
    costLabel: formatCostCell(session.costUsd, session.unpriced, 'Unpriced'),
    costTitle: session.unpriced ? 'Some usage has no price' : null,
    costBarPercent: barWidthPercent(session.costUsd, maxCost),
    tokensLabel: formatCompactTokens(session.tokens),
    tokensTitle: formatTokenCount(session.tokens),
    lastActive: session.lastActive,
    lastActiveLabel: formatRelativeAge(session.lastActive, generatedAt),
  }));
}

/** One provider's part of the model-mode concentration strip. */
export interface ConcentrationSegment {
  readonly providerId: string;
  readonly color: string;
  /** Share of the window's known cost as a width, 0–100 (2 minimum when positive). */
  readonly widthPercent: number;
}

/**
 * Provider cost shares for the concentration strip, in the chart's series
 * order. Empty when no provider has priced cost, so no bar is drawn.
 */
export function buildConcentrationSegments(
  series: readonly ProviderDailySeries[],
): ConcentrationSegment[] {
  const totals = series.map((provider) => ({
    provider,
    total: provider.costValues.reduce(
      (sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0),
      0,
    ),
  }));
  const grand = totals.reduce((sum, entry) => sum + entry.total, 0);
  return totals
    .map(({ provider, total }) => ({
      providerId: provider.providerId,
      color: provider.accent,
      widthPercent: barWidthPercent(total, grand),
    }))
    .filter((segment) => segment.widthPercent > 0);
}

/** "9 models · $1,066.33 known cost"; the cost part only when a row is priced. */
export function modelBreakdownDescription(
  rows: readonly ModelBreakdownRow[],
): string {
  const count = `${rows.length} ${rows.length === 1 ? 'model' : 'models'}`;
  const priced = rows.filter((row) => row.costUsd !== null);
  if (priced.length === 0) return count;
  const known = priced.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  return `${count} · ${formatTableUsd(known)} known cost`;
}

/** "30 days · busiest day Nov 9"; the busiest part only when a day has cost. */
export function dayBreakdownDescription(rows: readonly DayBreakdownRow[]): string {
  const count = `${rows.length} ${rows.length === 1 ? 'day' : 'days'}`;
  let busiest: DayBreakdownRow | null = null;
  for (const row of rows) {
    if (row.costUsd === null || !(row.costUsd > 0)) continue;
    if (busiest === null || row.costUsd > (busiest.costUsd ?? 0)) busiest = row;
  }
  return busiest === null
    ? count
    : `${count} · busiest day ${formatDayShort(busiest.day)}`;
}

/**
 * "$525.43 · 49.3% of known cost" for the listed sessions; the share part
 * only when the window's known cost is positive. `null` without a priced
 * session.
 */
export function topSessionsDescription(
  sessions: readonly UsageSessionRow[],
  knownCostUsd: number | null,
): string | null {
  const priced = sessions.filter((session) => session.costUsd !== null);
  if (priced.length === 0) return null;
  const sum = priced.reduce((total, session) => total + (session.costUsd ?? 0), 0);
  const label = formatTableUsd(sum);
  if (knownCostUsd === null || !(knownCostUsd > 0)) return label;
  return `${label} · ${formatShare(Math.min(1, sum / knownCostUsd))} of known cost`;
}
