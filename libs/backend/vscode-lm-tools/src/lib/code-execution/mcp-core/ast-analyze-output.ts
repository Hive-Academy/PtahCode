/**
 * The `ptah_ast_analyze` result text (TASK_2026_2299): a structural summary
 * that always fits the tool's result budget, so the budget step never cuts
 * it mid-record.
 *
 * Key order: `parseStatus`, then `errorNodeCount` / `errorNodeCountCapped`
 * only when they say something, `coverage` only when it is not a plain clean
 * verdict, `unextractedExports` when present, `file` (relative to the
 * workspace root when inside it), `language`, then the lists `classes`,
 * `exports`, `imports`, `functions`. The lists are written as tables
 * (`formatAstAnalysisResult`); when the whole text is over the budget,
 * `functions` loses trailing records first (then `imports`, ...), and the
 * text carries `truncated` and a one-line `hint` before the first list.
 */
import * as path from 'node:path';
import { compactCoverage } from '@ptah-extension/platform-core';
import { fitsBudget } from '@ptah-extension/tool-output-reducers';
import { formatAstAnalysisResult } from '@ptah-extension/workspace-intelligence';
import type { AstCodeInsights } from '../types';
import { getToolResultBudget } from './tool-result-budget';

const TOOL_NAME = 'ptah_ast_analyze';

/**
 * Share of the result budget the text may use. The rest is headroom for the
 * response envelope, so the budget step returns the text unchanged.
 */
const BUDGET_SHARE = 0.9;

export const AST_ANALYZE_TRUNCATION_HINT =
  'Lists cut at a record boundary to fit the result budget. ' +
  'omittedNames lists the cut records by name; read one with ptah_read_symbol.';

/**
 * `file` relative to the first root that contains it, `/`-separated; the
 * path unchanged when it is relative already or no root contains it.
 */
export function relativeToWorkspace(
  file: string,
  roots: readonly (string | undefined)[],
): string {
  if (!path.isAbsolute(file)) {
    return file;
  }
  for (const root of roots) {
    if (root === undefined || root.trim() === '' || !path.isAbsolute(root)) {
      continue;
    }
    const relative = path.relative(root.trim(), file);
    if (
      relative !== '' &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative)
    ) {
      return relative.split(path.sep).join('/');
    }
  }
  return file;
}

/** The analysis result in the documented key order, quiet fields dropped. */
export function shapeAstAnalyzeResult(
  result: AstCodeInsights,
  roots: readonly (string | undefined)[],
): Record<string, unknown> {
  const shaped: Record<string, unknown> = { parseStatus: result.parseStatus };
  if (result.errorNodeCount !== 0) {
    shaped['errorNodeCount'] = result.errorNodeCount;
  }
  if (result.errorNodeCountCapped) {
    shaped['errorNodeCountCapped'] = true;
  }
  const coverage = compactCoverage(result.coverage);
  // A clean verdict with no approximation says nothing; an approximation is
  // kept, because it qualifies the lists.
  if (!coverage.clean || (coverage.approximations?.length ?? 0) > 0) {
    shaped['coverage'] = coverage;
  }
  if (result.unextractedExports && result.unextractedExports.length > 0) {
    shaped['unextractedExports'] = result.unextractedExports;
  }
  shaped['file'] = relativeToWorkspace(result.file, roots);
  shaped['language'] = result.language;
  shaped['classes'] = result.classes;
  shaped['exports'] = result.exports;
  shaped['imports'] = result.imports;
  shaped['functions'] = result.functions;
  return shaped;
}

/**
 * The bounded result text. `roots` are tried in order to make `file`
 * relative: the call's `workspaceRoot`, the caller's declared root, then the
 * open folders.
 */
export function renderAstAnalyzeResult(
  result: AstCodeInsights,
  roots: readonly (string | undefined)[],
): string {
  const budget = getToolResultBudget(TOOL_NAME);
  const limit = {
    tokens: Math.floor(budget.tokens * BUDGET_SHARE),
    chars: Math.floor(budget.chars * BUDGET_SHARE),
  };
  return formatAstAnalysisResult(shapeAstAnalyzeResult(result, roots), {
    fits: (text) => fitsBudget(text, limit),
    hint: AST_ANALYZE_TRUNCATION_HINT,
  });
}
