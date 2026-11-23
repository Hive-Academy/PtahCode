/**
 * Pure scoring of the offline navigation benchmark (TASK_2026_2299_d6f5).
 * No I/O here: nav-benchmark.ts runs the steps and hands their results in.
 */

import { encode } from 'gpt-tokenizer';
import type {
  BenchmarkRun,
  NavStrategyName,
  StepResult,
  StrategyResult,
  TaskResult,
} from './types';

export const TOKENIZER_NAME =
  'gpt-tokenizer (countTokens from @ptah-extension/tool-output-reducers)';

type Totals = BenchmarkRun['totals'];

/**
 * Same options as `countTokens` in libs/backend/tool-output-reducers/src/lib/token-measure.ts:
 * special-token markers count as plain text. The lib is not imported because
 * scripts/tsconfig.json has no `paths` for the alias, and its stricter
 * `noUncheckedIndexedAccess` rejects the lib source under ts-jest. The spec pins
 * that both still use these options.
 */
const ENCODE_OPTIONS = { disallowedSpecial: new Set<string>() };

/** Token count of one step output, identical to the reducers' `countTokens`. */
export function countTaskTokens(text: string): number {
  return text.length === 0 ? 0 : encode(text, ENCODE_OPTIONS).length;
}

/**
 * A strategy is correct when every expected substring appears in the joined
 * output of its `ok` steps. An unavailable or failed step contributes nothing,
 * so a strategy that needed its output is scored incorrect.
 */
export function scoreStrategy(
  steps: readonly StepResult[],
  expect: readonly string[],
): StrategyResult {
  const answer = steps
    .filter((s) => s.status === 'ok')
    .map((s) => s.output)
    .join('\n');
  const missing = expect.filter((e) => !answer.includes(e));
  return {
    calls: steps.length,
    tokens: steps.reduce((sum, s) => sum + s.tokens, 0),
    correct: missing.length === 0,
    missing,
    steps,
  };
}

/** Sums calls, tokens and correct answers per strategy over all tasks. */
export function buildTotals(results: readonly TaskResult[]): Totals {
  const totals: Partial<
    Record<
      NavStrategyName,
      { calls: number; tokens: number; correct: number; tasks: number }
    >
  > = {};
  for (const task of results) {
    for (const [name, result] of Object.entries(task.strategies) as [
      NavStrategyName,
      StrategyResult | undefined,
    ][]) {
      if (!result) {
        continue;
      }
      const t = totals[name] ?? { calls: 0, tokens: 0, correct: 0, tasks: 0 };
      t.calls += result.calls;
      t.tokens += result.tokens;
      t.correct += result.correct ? 1 : 0;
      t.tasks += 1;
      totals[name] = t;
    }
  }
  return totals;
}

function cell(result: StrategyResult | undefined): string {
  if (!result) {
    return '- | - | -';
  }
  return `${result.calls} | ${result.tokens} | ${result.correct ? 'yes' : 'no'}`;
}

/** Markdown table: one row per task plus a totals row, three columns per strategy. */
export function renderTable(
  run: BenchmarkRun,
  strategies: readonly NavStrategyName[],
): string {
  const header = [
    'task',
    'kind',
    ...strategies.flatMap((s) => [`${s} calls`, `${s} tokens`, `${s} correct`]),
  ];
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
  ];
  for (const task of run.results) {
    const cells = strategies.map((s) => cell(task.strategies[s]));
    lines.push(`| ${task.id} | ${task.kind} | ${cells.join(' | ')} |`);
  }
  const totalCells = strategies.map((s) => {
    const t = run.totals[s];
    return t
      ? `${t.calls} | ${t.tokens} | ${t.correct}/${t.tasks}`
      : '- | - | -';
  });
  lines.push(
    `| **total** | ${run.taskCount} tasks | ${totalCells.join(' | ')} |`,
  );
  return lines.join('\n');
}
