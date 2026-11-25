import { formatDuration as clockDuration, type PtahStatAccuracy } from '@ptah-extension/ui';
import { trustedContextWindow, type SessionBudgetState, type SessionStatsEntry } from '@ptah-extension/shared';
import type { LiveModelStats } from './session-stats-summary.component';
import type { StatsLimitViewModel } from './plan-limits/stats-limit-view-model.types';
import type { SessionLimitSummary } from './plan-limits/session-limit-summary';
import { budgetTooltip, costTooltip, tokensTooltip } from './session-budget-format';
import { formatCost, formatDuration, formatTokens } from './session-stats-format';
import { costBasisLabel } from '../../atoms/cost-badge.component';

import { formatUsageCost, formatUsageTokens, usageDetailsText } from './session-usage-format';
import { sdkContribution, sessionTotal, type UsageMetric, type UsageState, type UsageTotal } from './session-usage-totals';

export type SessionUsageTotals = Readonly<Record<UsageMetric, UsageTotal>>;

export const USAGE_ACCURACY: Record<UsageState, PtahStatAccuracy> = {
  exact: 'exact',
  unknown: 'exact',
  estimate: 'approximate',
  'lower-bound': 'lower-bound',
  both: 'lower-bound-approximate',
};

export interface SessionStatsInputs {
  readonly sessionId: string | null;
  readonly snapshot: SessionStatsEntry | null;
  readonly cache?: NonNullable<SessionStatsEntry['cache']> | null;
  readonly liveModelStats: LiveModelStats | null;
  /**
   * The model the session runs now, as its model pill shows it (tab override,
   * then the session's model, then the global pick). Absent: unknown.
   */
  readonly currentModel?: string | null;
  readonly compactionCount: number;
  readonly limits: StatsLimitViewModel | null;
  readonly budget: SessionBudgetState | null;
  readonly context: SessionContextCue;
  readonly limitSummary: SessionLimitSummary;
}

export interface SessionContextCue {
  readonly hasLive: boolean;
  readonly known: boolean;
  readonly percent: number | null;
  readonly label: string;
  readonly usedTokens: number | null;
}

export const KNOWN_SUBTOTAL_DETAILS =
  'Only part of this session has a known price. This is the sum of the priced part, not the session total.';
export const AGENTS_DETAILS =
  'Unique subagents this session has run, over its whole lifetime.';

export const STATS_EMPTY = { value: '—', context: 'Context unavailable', tokens: 'Tokens unavailable', cost: 'Cost unavailable' } as const;

/**
 * Label for a null cost whose narrow cause is a missing published rate. Every
 * other null-cost cause keeps {@link STATS_EMPTY.cost}, so "Not priced" never
 * mislabels an unknown billing mode or unusable usage.
 */
export const NOT_PRICED = 'Not priced';

/** A cost that can be shown as dollars: a finite number, never null or undefined. */
export function isKnownCost(cost: number | null | undefined): cost is number {
  return typeof cost === 'number' && Number.isFinite(cost);
}

/**
 * A per-model row cost. A row's null cost has several causes (no published
 * rate, usage not observed, a model only partly priced), and the row carries
 * no reason of its own. It reads "Not priced" only when the session names a
 * missing rate as its one cause; every other null keeps "—" ("not reported"),
 * so a partly priced or unobserved model is never labelled as unpriced.
 */
export function formatModelCost(
  cost: number | null | undefined,
  snapshot: SessionStatsEntry | null,
): string {
  if (isKnownCost(cost)) return formatCost(cost);
  return nullCostValue(snapshot);
}

/**
 * The Total of a per-model list: the session cost, else its labelled known
 * subtotal when pricing is partial, else the null-cost value.
 */
export function formatModelTotal(snapshot: SessionStatsEntry | null): string {
  const total = snapshot?.totalCost;
  if (isKnownCost(total)) return formatCost(total);
  const known = knownSubtotalOf(snapshot);
  return known ? `known subtotal ${formatCost(known.value)}` : nullCostValue(snapshot);
}

/** Accessible label for a null session cost, by its backend-named cause. */
export function nullCostLabel(s: SessionStatsEntry | null): string {
  return s !== null && s.totalCost === null &&
      s.costUnavailableReason === 'rate-missing'
    ? NOT_PRICED
    : STATS_EMPTY.cost;
}

/**
 * Visible value of a null session cost: "Not priced" when the backend names a
 * missing published rate (an unpriced model is neither "—" nor $0), else "—".
 */
export function nullCostValue(s: SessionStatsEntry | null): string {
  return nullCostLabel(s) === NOT_PRICED ? NOT_PRICED : STATS_EMPTY.value;
}

const ESTIMATE_LINE =
  'Live estimate while the turn runs; final figures replace it when it ends.';

function withEstimateLine(text: string | null): string {
  return text ? `${ESTIMATE_LINE}\n\n${text}` : ESTIMATE_LINE;
}

export function sessionContextCue(live: LiveModelStats | null): SessionContextCue {
  const trustedWindow = live ? trustedContextWindow(live.contextCapacity, live.model) : null;
  const known = !!live && live.contextKnown !== false &&
    Number.isFinite(live.contextUsed) && live.contextUsed >= 0 &&
    Number.isFinite(live.contextPercent) && trustedWindow !== null &&
    live.contextWindow === trustedWindow;
  return {
    hasLive: !!live,
    known,
    percent: known ? live.contextPercent : null,
    label: known ? `${live.contextPercent}%` : '—',
    usedTokens: known ? live.contextUsed : null,
  };
}

export function contextDetailsText(live: LiveModelStats | null, compactions: number): string | null {
  if (!live) return STATS_EMPTY.context;
  const text = !sessionContextCue(live).known
    ? STATS_EMPTY.context
    : [
        `Context used (latest main request): ${live.contextUsed.toLocaleString()} tokens`,
        `Context Window: ${live.contextWindow.toLocaleString()} tokens`,
        `Usage: ${live.contextPercent}%`,
      ].join('\n');
  return compactions > 0
    ? `${text}\nNumber of context compactions during this session: ${compactions}`
    : text;
}

export function tokenDetailsText(s: SessionStatsEntry | null, b: SessionBudgetState | null): string {
  let breakdown: string = STATS_EMPTY.tokens;
  if (s) {
    const t = s.tokens;
    const lines = [
      `Input (uncached): ${t.input.toLocaleString()}`,
      `Output: ${t.output.toLocaleString()}`,
      `Cache Read: ${t.cacheRead.toLocaleString()}`,
      `Cache Creation: ${t.cacheCreation.toLocaleString()}`,
      typeof s.tokenCount === 'number' ? `Total: ${s.tokenCount.toLocaleString()}` : 'Total: unavailable',
    ];
    if (s.coverage === 'partial') lines.push('Some usage could not be counted.');
    breakdown = lines.join('\n');
  }
  const budgetLine = budgetTooltip(b, {
    tokensLabel: typeof s?.tokenCount === 'number' ? formatTokens(s.tokenCount) : '—',
    totalCost: s?.totalCost ?? null,
  });
  const text = tokensTooltip(b, budgetLine, breakdown);
  return s?.provisional ? withEstimateLine(text) : text;
}

export function costDetailsText(s: SessionStatsEntry | null, b: SessionBudgetState | null): string | null {
  const basis = costBasisLabel(s?.totalCost, s?.costBasis);
  const basisDetails = basis === 'estimated'
    ? 'Estimated cost, not a charge.'
    : basis === 'covered by subscription'
      ? 'Published-rate value covered by the subscription, not a charge.'
      : null;
  const budgetLine = budgetTooltip(b, {
    tokensLabel: typeof s?.tokenCount === 'number' ? formatTokens(s.tokenCount) : '—',
    totalCost: s?.totalCost ?? null,
  });
  const parts = [
    s?.totalCost == null ? nullCostLabel(s) : basisDetails,
    costTooltip(b, budgetLine),
    knownSubtotalOf(s) ? KNOWN_SUBTOTAL_DETAILS : null,
  ]
    .filter((part): part is string => part !== null);
  const text = parts.length ? parts.join('\n\n') : null;
  return s?.provisional ? withEstimateLine(text) : text;
}

export function knownSubtotalOf(s: SessionStatsEntry | null): { value: number } | null {
  if (!s || s.totalCost !== null || s.pricingCoverage !== 'partial') return null;
  return typeof s.knownCost === 'number' && Number.isFinite(s.knownCost)
    ? { value: s.knownCost } : null;
}

export function agentCountOf(s: SessionStatsEntry | null): number | null {
  const count = s?.agentSessionCount;
  return typeof count === 'number' && count > 0 ? count : null;
}

export function durationMsOf(s: SessionStatsEntry | null): number | null {
  const duration = s?.durationMs;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function lanesAriaLabelFor(count: number): string {
  return `${count} lane run${count === 1 ? '' : 's'}, not in session totals`;
}

/** Formatting-only projection of the same inputs used by the expanded inspector. */
export interface CompactSessionMetric {
  readonly id: 'context' | 'tokens' | 'cost' | 'time';
  readonly label: 'Ctx' | 'Tokens' | 'Cost' | 'Time';
  readonly value: string;
  readonly ariaLabel: string;
  readonly unavailable: boolean;
}

/** SDK-only callers still project the S1 model while the host supplies whole-session totals. */
export function sdkSessionTotals(snapshot: SessionStatsEntry | null): SessionUsageTotals {
  const contributions = [sdkContribution(snapshot)];
  const coverage = { complete: true, causes: [] };
  return {
    tokens: sessionTotal(contributions, coverage, 'tokens'),
    cost: sessionTotal(contributions, coverage, 'cost'),
  };
}

export const DURATION_NOT_RECORDED = 'Duration not recorded';

export function sessionDurationText(duration: number | null, unknownReason = DURATION_NOT_RECORDED): string {
  if (duration === null) return unknownReason;
  return formatDuration(duration).replace(/([\d.]+)(ms|m|s)\b/g, (_match: string, amount: string, unit: string) => {
    const name = unit === 'ms' ? 'millisecond' : unit === 'm' ? 'minute' : 'second';
    return `${amount} ${name}${Number(amount) === 1 ? '' : 's'}`;
  });
}

export function compactSessionMetrics(
  stats: SessionStatsInputs,
  totals = sdkSessionTotals(stats.snapshot),
  durationUnknownReason?: string,
): readonly CompactSessionMetric[] {
  const duration = durationMsOf(stats.snapshot);
  return [
    {
      id: 'context', label: 'Ctx', value: stats.context.label,
      ariaLabel: stats.context.known
        ? `Main request context ${stats.context.label}, ${stats.context.usedTokens?.toLocaleString()} tokens used`
        : STATS_EMPTY.context,
      unavailable: !stats.context.known,
    },
    {
      id: 'tokens', label: 'Tokens', value: formatUsageTokens(totals.tokens),
      ariaLabel: usageDetailsText(totals.tokens, 'tokens', 'Whole-session tokens'),
      unavailable: totals.tokens.value === null,
    },
    {
      id: 'cost', label: 'Cost', value: formatUsageCost(totals.cost),
      ariaLabel: usageDetailsText(totals.cost, 'cost', 'Whole-session cost'),
      unavailable: totals.cost.value === null,
    },
    {
      id: 'time', label: 'Time', value: duration === null ? '--:--' : clockDuration(duration, 'clock'),
      ariaLabel: `Time. ${sessionDurationText(duration, durationUnknownReason)}`,
      unavailable: duration === null,
    },
  ];
}
