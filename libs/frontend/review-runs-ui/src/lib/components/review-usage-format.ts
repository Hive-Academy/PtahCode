import type { ReviewUsageTotal } from '@ptah-extension/review-contracts';

/** One usage figure: visible text, the sentence screen readers get, and whether it is a lower bound. */
export interface UsageFigure {
  readonly text: string;
  readonly srText: string;
  readonly partial: boolean;
}

/** Shown for a value nobody reported. Unknown is never shown as 0. */
export const USAGE_UNKNOWN = '—';

const TOKEN_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Token total of a stage or a run; a partial total reads "≥ N tokens". */
export function tokensDisplay(usage: ReviewUsageTotal | null | undefined): UsageFigure {
  if (!usage || usage.totalTokens === null) return { text: USAGE_UNKNOWN, srText: 'Token usage unknown', partial: false };
  const grouped = TOKEN_FORMAT.format(usage.totalTokens);
  if (usage.tokensPartial) {
    return { text: `≥ ${grouped} tokens`, srText: `At least ${grouped} tokens; some stages did not report all usage`, partial: true };
  }
  return { text: `${grouped} tokens`, srText: `${grouped} tokens`, partial: false };
}

/** USD cost of a stage or a run; a partial cost reads "≥ $X". Its marker is independent of the token marker. */
export function costDisplay(usage: ReviewUsageTotal | null | undefined): UsageFigure {
  if (!usage || usage.costUsd === null) return { text: USAGE_UNKNOWN, srText: 'Cost unknown', partial: false };
  const amount = usd(usage.costUsd);
  if (usage.costPartial) {
    return { text: `≥ ${amount}`, srText: `At least ${amount}; some costs were not reported`, partial: true };
  }
  return { text: amount, srText: amount, partial: false };
}

/** Two decimals at or above $1 and for a known zero, four below $1 so small lane costs stay visible. */
function usd(value: number): string {
  return `$${value.toFixed(value === 0 || value >= 1 ? 2 : 4)}`;
}
