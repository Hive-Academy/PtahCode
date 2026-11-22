/**
 * Declarations of one file as the navigation tools see them: 1-based line
 * ranges, a kind, and a name qualified by its containing classes. Built from
 * the tree-sitter outline `ptah_ast_analyze` returns, so every language that
 * service supports works here too.
 */
import type { AstCodeInsights, AstFunctionInfo } from '../../types';

export type NavSymbolKind = 'class' | 'method' | 'function';

export interface NavSymbol {
  /** Declared name (`bar`). */
  readonly name: string;
  /** Name with its containing classes (`Foo.bar`). */
  readonly qualifiedName: string;
  readonly kind: NavSymbolKind;
  /** 1-based, inclusive. */
  readonly startLine: number;
  /** 1-based, inclusive. */
  readonly endLine: number;
  /** `bar(a, b)` for functions and methods, `class Foo` for classes. */
  readonly signature: string;
}

interface ClassRange {
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
}

function hasRange<T extends { startLine?: number; endLine?: number }>(
  value: T,
): value is T & { startLine: number; endLine: number } {
  return (
    typeof value.startLine === 'number' && typeof value.endLine === 'number'
  );
}

function contains(outer: ClassRange, start: number, end: number): boolean {
  return outer.startLine <= start && end <= outer.endLine;
}

/** Containing classes of a range, outermost first, excluding the range itself. */
function enclosingClasses(
  classes: readonly ClassRange[],
  start: number,
  end: number,
): ClassRange[] {
  return classes
    .filter(
      (cls) =>
        contains(cls, start, end) &&
        !(cls.startLine === start && cls.endLine === end),
    )
    .sort((a, b) => b.endLine - b.startLine - (a.endLine - a.startLine));
}

function qualify(parents: readonly ClassRange[], name: string): string {
  return [...parents.map((parent) => parent.name), name].join('.');
}

/** Turn a tree-sitter outline into sorted 1-based declarations. */
export function toNavSymbols(outline: AstCodeInsights): NavSymbol[] {
  const classes: ClassRange[] = outline.classes.filter(hasRange).map((cls) => ({
    name: cls.name,
    startLine: cls.startLine + 1,
    endLine: cls.endLine + 1,
  }));

  const symbols: NavSymbol[] = [];
  const seen = new Set<string>();
  const push = (symbol: NavSymbol): void => {
    const key = `${symbol.kind}:${symbol.qualifiedName}:${symbol.startLine}`;
    if (!seen.has(key)) {
      seen.add(key);
      symbols.push(symbol);
    }
  };

  for (const cls of classes) {
    const parents = enclosingClasses(classes, cls.startLine, cls.endLine);
    push({
      name: cls.name,
      qualifiedName: qualify(parents, cls.name),
      kind: 'class',
      startLine: cls.startLine,
      endLine: cls.endLine,
      signature: `class ${cls.name}`,
    });
  }

  const functions: AstFunctionInfo[] = [
    ...outline.functions,
    ...outline.classes.flatMap((cls) => cls.methods ?? []),
  ];
  for (const fn of functions) {
    if (!hasRange(fn)) {
      continue;
    }
    const start = fn.startLine + 1;
    const end = fn.endLine + 1;
    const parents = enclosingClasses(classes, start, end);
    push({
      name: fn.name,
      qualifiedName: qualify(parents, fn.name),
      kind: parents.length > 0 ? 'method' : 'function',
      startLine: start,
      endLine: end,
      signature: `${fn.name}(${fn.parameters.join(', ')})`,
    });
  }

  return symbols.sort(
    (a, b) => a.startLine - b.startLine || b.endLine - a.endLine,
  );
}

/** The smallest declaration whose range holds `line` (1-based), if any. */
export function innermostSymbolAt(
  symbols: readonly NavSymbol[],
  line: number,
): NavSymbol | undefined {
  let best: NavSymbol | undefined;
  for (const symbol of symbols) {
    if (symbol.startLine > line || symbol.endLine < line) {
      continue;
    }
    if (
      best === undefined ||
      symbol.endLine - symbol.startLine < best.endLine - best.startLine
    ) {
      best = symbol;
    }
  }
  return best;
}
