/**
 * Display formatting for the session stats chips and the per-model table.
 * Pure functions: no Angular, no state.
 */
import { formatDuration as formatUiDuration } from '@ptah-extension/ui';

/** A dollar figure: `—` for unknown, four decimals below one cent. */
export function formatCost(cost: number | null): string {
  if (cost === null) {
    return '—';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/** A token count: `1.2M`, `3.4k`, or the plain number below a thousand. */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return count.toString();
}

/** A row field an older producer may omit: absent is "—", never 0. */
export function formatOptionalTokens(count: number | undefined): string {
  return typeof count === 'number' ? formatTokens(count) : '—';
}

/** A duration in the shared compact format. */
export function formatDuration(ms: number): string {
  return formatUiDuration(ms);
}
