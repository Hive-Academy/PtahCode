/**
 * Codex lane budgets as a lane may use them (TASK_2026_597, R4.1, R4.2, R4.4).
 *
 * The settings import path writes values without validation, so a settings
 * file can hold any JSON for the global budgets or Codex web search.
 * The lane validates those values at spawn:
 *
 * - the handoff context is a positive safe integer and warning ratio is finite in (0, 1);
 * - the tool output budget is a positive safe integer;
 * - web search is a boolean;
 * - anything else is replaced by the default, with one warning naming the key.
 *
 * An absent value is "not set" and takes the default silently.
 */

import type { CliLaneBudgets } from '../cli-adapter.interface';

/** Derived from registered global defaults (pinned by the spec). */
export const CODEX_DEFAULT_LANE_BUDGETS: CliLaneBudgets = {
  autoCompactTokens: 127500,
  toolOutputTokenLimit: 2500,
  webSearch: true,
};

/** Raw budget values, as read from settings or passed by a caller. */
export interface RawCodexLaneBudgets {
  readonly warnRatio?: unknown;
  readonly handoffContextTokens?: unknown;
  readonly toolOutputTokenLimit?: unknown;
  readonly webSearch?: unknown;
}

export interface ResolvedCodexLaneBudgets {
  readonly budgets: CliLaneBudgets;
  /** One line per invalid value; names the setting key. Never secrets. */
  readonly warnings: string[];
}

export function resolveCodexLaneBudgets(
  raw: RawCodexLaneBudgets | undefined,
): ResolvedCodexLaneBudgets {
  const warnings: string[] = [];
  const defaults = CODEX_DEFAULT_LANE_BUDGETS;
  return {
    budgets: {
      autoCompactTokens: autoCompactBudget(raw, warnings),
      toolOutputTokenLimit: tokenBudget(
        'compaction.toolOutputBudgetTokens',
        raw?.toolOutputTokenLimit,
        defaults.toolOutputTokenLimit,
        warnings,
      ),
      webSearch: webSearch(raw?.webSearch, defaults.webSearch, warnings),
    },
    warnings,
  };
}

function autoCompactBudget(raw: RawCodexLaneBudgets | undefined, warnings: string[]): number {
  const ratio = raw?.warnRatio;
  const context = raw?.handoffContextTokens;
  const ratioValid = ratio === undefined ||
    (typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 && ratio < 1);
  const contextValid = context === undefined ||
    (typeof context === 'number' && Number.isSafeInteger(context) && context > 0);
  if (!ratioValid || !contextValid) {
    warnings.push('Invalid agentBudget.warnRatio or agentBudget.handoffContextTokens; using registered defaults.');
    return CODEX_DEFAULT_LANE_BUDGETS.autoCompactTokens;
  }
  const effectiveRatio = typeof ratio === 'number' ? ratio : 0.85;
  const effectiveContext = typeof context === 'number' ? context : 150000;
  // The epsilon keeps float error (0.29 * 100 = 28.999...) from flooring one token low;
  // the floor of 1 keeps a tiny product from becoming 0, which Codex treats as "unset".
  return Math.max(1, Math.floor(effectiveRatio * effectiveContext + 1e-9));
}

function tokenBudget(
  key: string,
  value: unknown,
  fallback: number,
  warnings: string[],
): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  warnings.push(
    `Ignored ${key}=${describe(value)}: expected a positive whole number; using ${fallback}.`,
  );
  return fallback;
}

function webSearch(
  value: unknown,
  fallback: boolean,
  warnings: string[],
): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  warnings.push(
    `Ignored agentOrchestration.codexWebSearch=${describe(value)}: expected true or false; using ${String(fallback)}.`,
  );
  return fallback;
}

/** A short, bounded rendering of an invalid value for the log. */
function describe(value: unknown): string {
  let text: string;
  try {
    text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  } catch {
    // degradation-audit: optional-capability - a value whose String()
    // throws (a hostile toString) is only described, never used.
    text = typeof value;
  }
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
