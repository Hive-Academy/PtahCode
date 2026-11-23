/**
 * What `ptah_ast_analyze` returns, measured on the REAL parser (TASK_2026_559
 * Batch 20.2p).
 *
 * The prompt contract says the tool costs "40-60% fewer tokens than Read"
 * (`ptah-core-prompt.ts:48`, `tool-description.builder.ts:1665`). Plain
 * `JSON.stringify` of the namespace result saved only ~26% on a
 * function-heavy 300-line file, because every record repeats its field names.
 * The dispatcher now writes the result with `formatAstAnalysisResult`; these
 * specs run the real `buildAstNamespace` + `AstAnalysisService` +
 * `TreeSitterParserService` and prove the text is:
 *  - lossless: every field of the old JSON result is recovered from it;
 *  - at least 40% smaller in gpt-tokenizer tokens than the source file;
 *  - led by parse status and coverage, including on a file with syntax errors.
 *
 * The two shims are the ones `code-outliner.adapter.spec.ts` documents.
 */
import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  AstAnalysisService,
  TreeSitterParserService,
  formatAstAnalysisResult,
} from '@ptah-extension/workspace-intelligence';
import {
  FileType,
  isCleanAnswer,
  type IFileSystemProvider,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import { countTokens } from '@ptah-extension/tool-output-reducers';
import { buildAstNamespace } from '../namespace-builders/ast-namespace.builder';
import type { AstNamespace } from '../types';
import {
  AST_ANALYZE_TRUNCATION_HINT,
  renderAstAnalyzeResult,
  shapeAstAnalyzeResult,
} from './ast-analyze-output';
import { getToolResultBudget } from './tool-result-budget';

jest.mock('wasm-bundle-dir', () => {
  const nodePath = require('path');
  const grammarDir = nodePath.join(
    nodePath.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')),
    'wasm',
  );
  const runtimeDir = nodePath.dirname(require.resolve('web-tree-sitter'));
  return {
    BUNDLE_DIR: grammarDir,
    resolveWasmPath: (filename: string) =>
      filename.startsWith('web-tree-sitter')
        ? nodePath.join(runtimeDir, filename)
        : nodePath.join(grammarDir, filename),
  };
});

jest.mock('web-tree-sitter', () => {
  const actual =
    jest.requireActual<typeof import('web-tree-sitter')>('web-tree-sitter');
  const nodeFs = require('fs');
  const loadFromPathOrBuffer = actual.Language.load.bind(actual.Language);
  actual.Language.load = (input: string | Uint8Array) =>
    loadFromPathOrBuffer(
      typeof input === 'string'
        ? new Uint8Array(nodeFs.readFileSync(input))
        : input,
    );
  return actual;
});

const ROOT = 'D:/ws';

function silentLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

/**
 * A 300-line, function-heavy service module: imports, one class with
 * methods, then short exported helpers — the shape where per-record JSON
 * keys cost the most.
 */
function generateSource(lineCount: number, exportHelpers = true): string {
  const lines = [
    "import { readFile } from 'node:fs/promises';",
    "import * as path from 'node:path';",
    "import type { Logger } from './logger';",
    '',
    'export class RecordStore {',
    '  private readonly cache = new Map<string, number>();',
    '  constructor(private readonly logger: Logger) {}',
  ];
  for (let m = 0; m < 6; m++) {
    lines.push(
      `  async load${m}(key: string, fallback: number): Promise<number> {`,
      `    const hit = this.cache.get(key) ?? fallback;`,
      `    this.logger.debug(path.join(key, '${m}'));`,
      '    return hit;',
      '  }',
    );
  }
  lines.push('}', '');
  let n = 0;
  while (lines.length + 7 <= lineCount) {
    lines.push(
      `${exportHelpers ? 'export ' : ''}function transformRecord${n}(input: string, factor: number, label?: string): string {`,
      `  const scaled = input.length * factor + ${n};`,
      `  const text = label ? label + ':' + scaled : String(scaled);`,
      `  return text.padStart(${(n % 7) + 2}, '0');`,
      '}',
      '',
    );
    n++;
  }
  lines.push('export const RECORD_LIMIT = 100;');
  while (lines.length < lineCount - 1) {
    lines.push('');
  }
  lines.push('export default RecordStore;');
  return lines.join('\n');
}

const BROKEN_SOURCE = [
  "import { join } from 'node:path';",
  '',
  'export function intact(a: string, b: number): string {',
  '  return join(a, String(b));',
  '}',
  '',
  'export function broken(a: string {',
  '  return a +;',
  '}',
  '',
  'export function alsoIntact(c: number): number {',
  '  return c * 2;',
  '}',
].join('\n');

/** Inverse of the table form, written from its documented rules only. */
function decode(text: string): Record<string, unknown> {
  const out = JSON.parse(text) as Record<string, unknown>;
  for (const [key, value] of Object.entries(out)) {
    if (isTable(value)) {
      out[key] = decodeTable(value);
    }
  }
  return out;
}

/** Records of one table; a cell that is a table (class members) nests. */
function decodeTable([header, ...rows]: [string[], ...unknown[][]]): Record<
  string,
  unknown
>[] {
  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    header.forEach((column, i) => {
      if (i < row.length && row[i] !== null) {
        const cell = row[i];
        record[column] = isTable(cell) ? decodeTable(cell) : cell;
      }
    });
    return record;
  });
}

/** The lists of the served shape, as plain JSON. */
function shapedLists(
  result: Parameters<typeof shapeAstAnalyzeResult>[0],
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(shapeAstAnalyzeResult(result, [ROOT])));
}

function isTable(value: unknown): value is [string[], ...unknown[][]] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((row) => Array.isArray(row)) &&
    (value[0] as unknown[]).every((cell) => typeof cell === 'string')
  );
}

describe('ptah_ast_analyze result text (real parser)', () => {
  const files = new Map<string, string>();
  let parser: TreeSitterParserService;
  let ast: AstNamespace;

  beforeAll(async () => {
    parser = new TreeSitterParserService(silentLogger());
    const init = await parser.initialize();
    if (init.isErr()) {
      throw init.error ?? new Error('tree-sitter initialisation failed');
    }
    const fileSystemProvider = {
      stat: async () => ({ type: FileType.File }),
      readFile: async (p: string) => {
        const content = files.get(p);
        if (content === undefined) {
          throw new Error(`no such file: ${p}`);
        }
        return content;
      },
    } as unknown as IFileSystemProvider;
    const workspaceProvider = {
      getWorkspaceRoot: () => ROOT,
    } as unknown as IWorkspaceProvider;
    ast = buildAstNamespace({
      treeSitterParser: parser,
      astAnalysis: new AstAnalysisService(silentLogger(), parser),
      fileSystemProvider,
      workspaceProvider,
    });
    files.set(`${ROOT}/src/record-store.ts`, generateSource(300));
    files.set(`${ROOT}/src/broken.ts`, BROKEN_SOURCE);
    // Loading the WASM grammars exceeds Jest's 5 s default under parallel load.
  }, 60_000);

  afterAll(() => {
    parser?.dispose();
  });

  it('is lossless: every field of the JSON result is recovered from the tables', async () => {
    const result = await ast.analyze(`${ROOT}/src/record-store.ts`);
    const text = formatAstAnalysisResult(result);
    const parsed = JSON.parse(text) as Record<string, unknown>;

    for (const list of ['functions', 'classes', 'imports', 'exports']) {
      expect(isTable(parsed[list])).toBe(true);
    }
    expect(result.functions.length).toBeGreaterThan(40);
    expect(decode(text)).toEqual(JSON.parse(JSON.stringify(result)));
  });

  it('is at least 40% smaller in tokens than reading the 300-line file', async () => {
    const source = files.get(`${ROOT}/src/record-store.ts`) ?? '';
    expect(source.split('\n')).toHaveLength(300);

    const result = await ast.analyze(`${ROOT}/src/record-store.ts`);
    const sourceTokens = countTokens(source);
    const resultTokens = countTokens(formatAstAnalysisResult(result));

    expect(1 - resultTokens / sourceTokens).toBeGreaterThanOrEqual(0.4);
  });

  // Lane H merge (Batches 22c + 24r): the namespace result carries the full
  // coverage with its verdict first. TASK_2026_2299: the served text drops a
  // zero error count and a plain clean coverage, and lists classes, exports
  // and imports ahead of functions. `D:/ws` is not absolute on POSIX, so the
  // file stays as given there and becomes `src/...` on Windows.
  it('serves parse status first, quiet fields dropped, functions last', async () => {
    const result = await ast.analyze(`${ROOT}/src/record-store.ts`);
    expect(Object.keys(result.coverage).slice(0, 2)).toEqual([
      'clean',
      'reasons',
    ]);
    const text = renderAstAnalyzeResult(result, [ROOT]);

    expect(text).toMatch(
      /^\{"parseStatus":"ok","file":"(D:\/ws\/)?src\/record-store\.ts","language":"typescript","classes":\[\[/,
    );
    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      'parseStatus',
      'file',
      'language',
      'classes',
      'exports',
      'imports',
      'functions',
    ]);
    expect(decode(text)['functions']).toEqual(shapedLists(result)['functions']);
  });

  it('lists class methods under their class as members, out of functions', async () => {
    const result = await ast.analyze(`${ROOT}/src/record-store.ts`);
    const text = renderAstAnalyzeResult(result, [ROOT]);
    const parsed = JSON.parse(text) as { classes: unknown[][] };

    expect(parsed.classes[0]).toEqual([
      'name',
      'startLine',
      'endLine',
      'members',
    ]);
    const [name, startLine, endLine, members] = parsed.classes[1] as [
      string,
      number,
      number,
      unknown[][],
    ];
    expect([name, startLine, endLine]).toEqual(['RecordStore', 4, 37]);
    expect(members[0]).toEqual([
      'name',
      'parameters',
      'startLine',
      'endLine',
      'modifiers',
    ]);
    expect(members[1]).toEqual(['constructor', ['logger'], 6, 6]);
    expect(members[2]).toEqual(['load0', ['key', 'fallback'], 7, 11, 'async']);
    expect(members).toHaveLength(8);

    const functions = decode(text)['functions'] as { name: string }[];
    const names = functions.map((fn) => fn.name);
    expect(names).not.toContain('constructor');
    expect(names.some((fn) => fn.startsWith('load'))).toBe(false);
    expect(names).toContain('transformRecord0');
    expect(functions).toHaveLength(result.functions.length - 7);
  });

  it('cuts functions at a record boundary to fit the budget, and says so', async () => {
    // Helpers stay private, so the long list is `functions`, not `exports`.
    files.set(`${ROOT}/src/huge-store.ts`, generateSource(3000, false));
    const result = await ast.analyze(`${ROOT}/src/huge-store.ts`);
    const text = renderAstAnalyzeResult(result, [ROOT]);
    const parsed = JSON.parse(text) as {
      truncated: Record<string, { shown: number; total: number }>;
      hint: string;
    };
    const budget = getToolResultBudget('ptah_ast_analyze');

    expect(countTokens(text)).toBeLessThanOrEqual(budget.tokens);
    expect(Object.keys(parsed).indexOf('truncated')).toBeLessThan(
      Object.keys(parsed).indexOf('classes'),
    );
    expect(parsed.hint).toBe(AST_ANALYZE_TRUNCATION_HINT);
    const cut = parsed.truncated['functions'];
    expect(cut.shown).toBeGreaterThan(0);
    expect(cut.shown).toBeLessThan(cut.total);
    const decoded = decode(text);
    const shaped = shapedLists(result);
    expect(cut.total).toBe((shaped['functions'] as unknown[]).length);
    expect(decoded['functions']).toEqual(
      (shaped['functions'] as unknown[]).slice(0, cut.shown),
    );
    for (const list of ['classes', 'exports', 'imports'] as const) {
      expect(decoded[list]).toEqual(shaped[list]);
    }
  });

  it('counts the methods of cut classes and points to ptah_read_symbol', async () => {
    const source = Array.from(
      { length: 1500 },
      (_, i) =>
        `class Unit${i} {\n  alpha${i}(input: string): string {\n    return input + '${i}';\n  }\n  beta${i}(): number {\n    return ${i};\n  }\n}\n`,
    ).join('\n');
    files.set(`${ROOT}/src/many-classes.ts`, source);
    const result = await ast.analyze(`${ROOT}/src/many-classes.ts`);
    const text = renderAstAnalyzeResult(result, [ROOT]);
    const parsed = JSON.parse(text) as {
      truncated: Record<
        string,
        {
          shown: number;
          total: number;
          omittedNames?: string;
          omittedMembers?: number;
        }
      >;
      hint: string;
    };

    const cut = parsed.truncated['classes'];
    expect(cut.shown).toBeLessThan(cut.total);
    expect(parsed.hint).toBe(AST_ANALYZE_TRUNCATION_HINT);
    expect(parsed.hint).toContain('Class.method');
    const names = (cut.omittedNames ?? '').split(',');
    // Cut class names come first; the cap on names may drop the members, so
    // `omittedMembers` gives their count and the hint names the way to read.
    expect(names.slice(0, 2)).toEqual([
      `Unit${cut.shown}`,
      `Unit${cut.shown + 1}`,
    ]);
    expect(cut.omittedMembers).toBe((cut.total - cut.shown) * 2);
  });

  // Batch 31 r1 R31-01: a clean C answer, in the form the dispatcher
  // serves (`renderAstAnalyzeResult`), still names its approximation;
  // a C++ one does not.
  it.each([
    ['widget.c', ['c:parsed-as-cpp']],
    ['widget.h', ['c:parsed-as-cpp']],
    ['widget.cpp', undefined],
  ])(
    'serves the clean %s answer with approximations %j',
    async (name, approximations) => {
      files.set(`${ROOT}/native/${name}`, 'int needle(int x) { return x; }\n');
      const result = await ast.analyze(`${ROOT}/native/${name}`);
      const served = JSON.parse(renderAstAnalyzeResult(result, [ROOT])) as {
        parseStatus: string;
        coverage?: Record<string, unknown>;
      };

      expect(served.parseStatus).toBe('ok');
      // A plain clean verdict is dropped; one with an approximation is kept.
      expect(served.coverage).toEqual(
        approximations === undefined
          ? undefined
          : { clean: true, analyzed: 1, approximations },
      );
    },
  );

  it('still reports a recovered parse, with coverage, for a file with syntax errors', async () => {
    const result = await ast.analyze(`${ROOT}/src/broken.ts`);
    const text = formatAstAnalysisResult(result);
    const parsed = JSON.parse(text) as {
      parseStatus: string;
      errorNodeCount: number;
      coverage: { analyzed: number; failed: number };
      functions: unknown[][];
    };

    expect(text.startsWith('{"parseStatus":"recovered",')).toBe(true);
    expect(parsed.errorNodeCount).toBeGreaterThan(0);
    expect(parsed.coverage).toMatchObject({ analyzed: 0, failed: 1 });
    expect(parsed.functions[0]).toEqual([
      'name',
      'parameters',
      'startLine',
      'endLine',
    ]);
    expect(parsed.functions.map((row) => row[0])).toContain('alsoIntact');
    expect(decode(text)).toEqual(JSON.parse(JSON.stringify(result)));
  });

  // Batch 20.2q narrow fix (Decision 22): the r4-postcap reviewer's probes.
  describe('export forms beyond ES declarations', () => {
    async function analyzeSource(name: string, source: string) {
      files.set(`${ROOT}/src/${name}`, source);
      return ast.analyze(`${ROOT}/src/${name}`);
    }

    it('reports `export = value` as a clean, non-empty answer (R4-02)', async () => {
      const result = await analyzeSource(
        'assign.ts',
        'const value = 1;\nexport = value;',
      );
      expect(result.parseStatus).toBe('ok');
      expect(result.exports).toEqual([
        { name: 'export=', kind: 'unknown', localName: 'value' },
      ]);
      expect(result.unextractedExports).toBeUndefined();
      expect(isCleanAnswer(result.coverage)).toBe(true);
    });

    it('reports `export import Alias = Other` as an exported alias (R4-02)', async () => {
      const result = await analyzeSource(
        'alias.ts',
        'export import Alias = Other;',
      );
      expect(result.exports).toEqual([
        { name: 'Alias', kind: 'unknown', localName: 'Other' },
      ]);
    });

    it('never returns a clean empty answer for an unextracted CommonJS form (R4-02)', async () => {
      const result = await analyzeSource('dynamic.ts', 'exports[key] = 1;');
      expect(result.parseStatus).toBe('ok');
      expect(result.exports).toEqual([]);
      expect(result.unextractedExports).toEqual(['line 1: exports']);
      expect(result.coverage).toMatchObject({
        analyzed: 0,
        failed: 1,
        failedByReason: { 'unsupported-syntax': 1 },
      });
      expect(isCleanAnswer(result.coverage)).toBe(false);
      // The reason is serialised right after coverage, ahead of the tables.
      expect(formatAstAnalysisResult(result)).toMatch(
        /"coverage":\{[^[]*(\[[^\]]*\][^[]*)*\},"unextractedExports":\["line 1: exports"\],"file"/,
      );
    });

    it('decodes aliases around comments and string names from nodes (R4-01)', async () => {
      const result = await analyzeSource(
        'aliases.ts',
        'const a = 1;\nexport { a /* c */ as b, a as /* public name */ d, a as "x-y" };',
      );
      expect(result.exports).toEqual([
        { name: 'b', kind: 'unknown', localName: 'a' },
        { name: 'd', kind: 'unknown', localName: 'a' },
        { name: 'x-y', kind: 'unknown', localName: 'a' },
      ]);
    });
  });
});
