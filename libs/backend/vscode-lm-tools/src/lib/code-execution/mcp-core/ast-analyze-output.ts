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
 *
 * A TS/JS class lists its own methods as `members` (name, parameters, line
 * range, `modifiers` such as `private static` or `get`), written as a nested
 * table; those methods are left out of `functions`, which keeps the module
 * functions and the methods no class claims (object-literal methods, and
 * the methods of languages that do not attach them).
 *
 * When the text is cut, `omittedNames` lists each cut class and each of its
 * methods by the name `ptah_read_symbol` qualifies it with (`Outer.Inner.run`
 * for a method of a nested class), taken from `toNavSymbols`, the mapping that
 * tool uses, so the two always agree. A file with so many classes and methods
 * that the lookup would be slow lists no names; the counts stay.
 */
import * as path from 'node:path';
import { compactCoverage } from '@ptah-extension/platform-core';
import { fitsBudget } from '@ptah-extension/tool-output-reducers';
import { formatAstAnalysisResult } from '@ptah-extension/workspace-intelligence';
import type { AstClassInfo, AstCodeInsights, AstFunctionInfo } from '../types';
import { toNavSymbols } from './nav/nav-symbols';
import { getToolResultBudget } from './tool-result-budget';

const TOOL_NAME = 'ptah_ast_analyze';

/**
 * Share of the result budget the text may use. The rest is headroom for the
 * response envelope, so the budget step returns the text unchanged.
 */
const BUDGET_SHARE = 0.9;

export const AST_ANALYZE_TRUNCATION_HINT =
  'Lists cut at a record boundary to fit the result budget. ' +
  'omittedNames lists the cut records by name when names exist and fit; ' +
  'the named methods of cut classes follow, and omittedMembers counts them. ' +
  'A name list that ends with … is cut again. ' +
  'Read a cut class or method with ptah_read_symbol: pass its name from ' +
  'omittedNames as it is (the name carries the outer classes, as in ' +
  'Outer.Inner.method); a long read says where to continue.';

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

function rangeKey(info: AstFunctionInfo): string {
  return `${info.name}:${info.startLine ?? ''}:${info.endLine ?? ''}`;
}

/** A class with its methods as `members`; no key when it has none. */
function shapeClass({
  methods,
  ...rest
}: AstClassInfo): Record<string, unknown> {
  return methods && methods.length > 0 ? { ...rest, members: methods } : rest;
}

/**
 * Most comparisons the name lookup may make. It compares each class with every
 * other class, function and method, as `toNavSymbols` does, so it is
 * quadratic: a file past this bound (generated code) lists no names.
 */
const MAX_NAME_LOOKUP_WORK = 100_000_000;

/**
 * Most characters the qualified names may take, estimated as the longest name
 * plus the most characters of class names that cover one line, times the
 * number of declarations (an upper bound: each name holds only the classes
 * around it).
 */
const MAX_NAME_LOOKUP_CHARS = 20_000_000;

/** The outline `ptah_read_symbol` reads, with a missing `parameters` filled. */
function readerOutline(result: AstCodeInsights): AstCodeInsights {
  const withParameters = (info: AstFunctionInfo): AstFunctionInfo => ({
    ...info,
    parameters: info.parameters ?? [],
  });
  return {
    ...result,
    functions: result.functions.map(withParameters),
    classes: result.classes.map((info) => ({
      ...info,
      methods: info.methods?.map(withParameters),
    })),
  };
}

/**
 * Most characters in the names of the classes that cover one line, each name
 * with its `.` separator. A class around a declaration covers the line where
 * the declaration starts, so this bounds the outer part of every qualified
 * name, whatever way the line ranges overlap. A sweep over the range starts
 * and ends gives it in O(n log n).
 */
function mostCoveredNameChars(classes: AstCodeInsights['classes']): number {
  const changes = new Map<number, number>();
  for (const info of classes) {
    if (
      typeof info.startLine !== 'number' ||
      typeof info.endLine !== 'number'
    ) {
      continue;
    }
    const chars = info.name.length + 1;
    changes.set(info.startLine, (changes.get(info.startLine) ?? 0) + chars);
    changes.set(info.endLine + 1, (changes.get(info.endLine + 1) ?? 0) - chars);
  }
  let covered = 0;
  let most = 0;
  for (const line of [...changes.keys()].sort((a, b) => a - b)) {
    covered += changes.get(line) ?? 0;
    most = Math.max(most, covered);
  }
  return most;
}

/** Whether the lookup would be too slow or too large for `result`. */
function isLookupTooLarge(result: AstCodeInsights): boolean {
  const { classes, functions } = result;
  let methods = 0;
  let longest = 0;
  for (const info of classes) {
    methods += info.methods?.length ?? 0;
    longest = Math.max(longest, info.name.length);
    for (const method of info.methods ?? []) {
      longest = Math.max(longest, method.name.length);
    }
  }
  for (const info of functions) {
    longest = Math.max(longest, info.name.length);
  }
  const declarations = classes.length + functions.length + methods;
  if (classes.length * declarations > MAX_NAME_LOOKUP_WORK) {
    return true;
  }
  // A qualified name is its own name plus the names of the classes around it.
  return (
    (longest + mostCoveredNameChars(classes)) * declarations >
    MAX_NAME_LOOKUP_CHARS
  );
}

/**
 * The name `ptah_read_symbol` qualifies a class or a class method with, for
 * `formatAstAnalysisResult`. It is the qualified name of `toNavSymbols` run on
 * the outline the reader sees, found by `name:startLine:endLine`: the
 * qualified name depends on those three only. The reader keeps one symbol for
 * each kind, qualified name and start line, so a ranged record it dropped has
 * no entry and lists no name. A record without a range keeps its own name. The table is built when the
 * first name is asked for, so an uncut result costs nothing. It serves the
 * `classes` list only (a class and its methods); the other lists keep the
 * names their records carry.
 */
export function readerNameLookup(
  result: AstCodeInsights,
): (record: unknown) => string | undefined {
  if (isLookupTooLarge(result)) {
    return () => undefined;
  }
  let qualified: Map<string, string> | undefined;
  const table = (): Map<string, string> => {
    if (qualified === undefined) {
      qualified = new Map();
      for (const symbol of toNavSymbols(readerOutline(result))) {
        qualified.set(
          `${symbol.name}:${symbol.startLine - 1}:${symbol.endLine - 1}`,
          symbol.qualifiedName,
        );
      }
    }
    return qualified;
  };
  return (record) => {
    if (typeof record !== 'object' || record === null) {
      return undefined;
    }
    const { name, startLine, endLine } = record as Partial<AstFunctionInfo>;
    if (typeof name !== 'string' || name === '') {
      return undefined;
    }
    // A record without a range is no reader symbol (an export, an import):
    // it keeps its own name, as before.
    if (typeof startLine !== 'number' || typeof endLine !== 'number') {
      return name;
    }
    return table().get(`${name}:${startLine}:${endLine}`);
  };
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
  const members = new Set(
    result.classes.flatMap((info) => (info.methods ?? []).map(rangeKey)),
  );
  shaped['classes'] = result.classes.map(shapeClass);
  shaped['exports'] = result.exports;
  shaped['imports'] = result.imports;
  shaped['functions'] = result.functions.filter(
    (info) => !members.has(rangeKey(info)),
  );
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
    listedName: { classes: readerNameLookup(result) },
  });
}
