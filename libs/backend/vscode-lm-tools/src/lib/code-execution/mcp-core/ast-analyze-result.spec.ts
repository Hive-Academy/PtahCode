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
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as nodePath from 'node:path';
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
import { handleReadSymbol } from './nav/read-symbol';
import { toNavSymbols } from './nav/nav-symbols';
import { buildAstNamespace } from '../namespace-builders/ast-namespace.builder';
import type { AstNamespace } from '../types';
import {
  AST_ANALYZE_TRUNCATION_HINT,
  readerNameLookup,
  renderAstAnalyzeResult,
  shapeAstAnalyzeResult,
} from './ast-analyze-output';
import { getToolResultBudget } from './tool-result-budget';

// The real `ptah_read_symbol` handler is run below; its formatter module pulls
// in the whole routing stack, and only the issue text is needed from it.
jest.mock('./route-tool-handlers', () => ({
  describeZodIssues: () => 'invalid arguments',
}));

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
    expect(parsed.hint).toContain('Outer.Inner.method');
    const names = (cut.omittedNames ?? '').split(',');
    // Cut class names come first; the cap on names may drop the members, so
    // `omittedMembers` gives their count and the hint names the way to read.
    expect(names.slice(0, 2)).toEqual([
      `Unit${cut.shown}`,
      `Unit${cut.shown + 1}`,
    ]);
    expect(cut.omittedMembers).toBe((cut.total - cut.shown) * 2);
  });

  describe('names of the members of nested classes', () => {
    const UNITS = 6;
    // Every unit nests the same names (`Inner`, `run`, `Deep`, `go`) under a
    // different outer class, so only the full chain tells two of them apart.
    const nestedSource = [
      ...Array.from(
        { length: UNITS },
        (_, i) => `class Outer${i} {
  make() {
    const Inner = class {
      run() {
        return ${i};
      }
      deepen() {
        const Deep = class {
          go() {
            return ${i};
          }
        };
        return Deep;
      }
    };
    return Inner;
  }
}
`,
      ),
      'class Plain {\n  load() {\n    return 1;\n  }\n}\n',
    ].join('\n');
    let dir: string;
    let file: string;

    beforeAll(async () => {
      dir = await mkdtemp(nodePath.join(os.tmpdir(), 'ast-nested-'));
      await mkdir(nodePath.join(dir, 'src'));
      file = nodePath.join(dir, 'src', 'nested.ts');
      await writeFile(file, nestedSource);
      files.set(file, nestedSource);
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    /**
     * The `omittedNames` of `classes` when only the first `rows` classes of
     * `target` stay: the real parser, shaper and name lookup, with a row count
     * for the budget.
     */
    async function cutNote(
      rows: number,
      target = file,
    ): Promise<{
      names: string[];
      shown: number;
    }> {
      const result = await ast.analyze(target);
      const text = formatAstAnalysisResult(
        shapeAstAnalyzeResult(result, [dir]),
        {
          fits: (candidate) =>
            ((JSON.parse(candidate) as { classes: unknown[] }).classes ?? [])
              .length <=
            rows + 1,
          hint: AST_ANALYZE_TRUNCATION_HINT,
          listedName: { classes: readerNameLookup(result) },
        },
      );
      const note = (
        JSON.parse(text) as {
          truncated: {
            classes: { shown: number; omittedNames?: string };
          };
        }
      ).truncated.classes;
      return { names: (note.omittedNames ?? '').split(','), shown: note.shown };
    }

    it('gives every emitted name to ptah_read_symbol as it is, to one declaration', async () => {
      const { names, shown } = await cutNote(1);
      expect(shown).toBe(1);
      // Two and three levels deep, and a top-level class, all cut.
      expect(names).toEqual(
        expect.arrayContaining([
          'Outer3.Inner',
          'Outer3.Inner.Deep',
          'Outer3.Inner.run',
          'Outer3.Inner.Deep.go',
          'Plain',
          'Plain.load',
        ]),
      );
      expect(names).not.toContain('…');

      await expectEveryNameToRead(names, 'src/nested.ts', file);
    });

    /**
     * Each of `names`, as emitted, is a name `ptah_read_symbol` resolves: it is
     * a qualified name of the reader's own mapping, and a real read of it
     * returns one declaration of that name.
     */
    async function expectEveryNameToRead(
      names: readonly string[],
      relative: string,
      target: string,
    ): Promise<void> {
      const result = await ast.analyze(target);
      const deps = {
        analyze: async () => result,
        defaultWorkspaceRoot: async () => dir,
      };
      const resolvable = new Set(
        toNavSymbols(result).map((symbol) => symbol.qualifiedName),
      );
      for (const name of names) {
        expect(resolvable.has(name)).toBe(true);
        const reply = await handleReadSymbol({ file: relative, name }, deps);
        expect(reply.isError).toBe(false);
        // One declaration, named by its full chain: not a "no declaration"
        // answer and not a list of candidates.
        expect(reply.text).not.toMatch(/^No declaration/);
        expect(reply.text).not.toMatch(/declarations named/);
        expect(reply.text.split('\n')[0]).toMatch(
          new RegExp(` (class|method|function) ${name.replace(/\./g, '\\.')}$`),
        );
      }
    }

    it('names a class written on one line, and its methods, as the reader does', async () => {
      const compact = nodePath.join(dir, 'src', 'compact.ts');
      const source = [
        'class Compact {',
        '  make() {',
        '    const Tiny = class { ping() { return 1; } };',
        '    return Tiny;',
        '  }',
        '}',
        'class OneLine { hit() { return 2; } }',
        '',
      ].join('\n');
      await writeFile(compact, source);
      files.set(compact, source);

      const { names } = await cutNote(0, compact);

      // The reader leaves a class on the member's own lines out of its chain.
      expect(names).toEqual([
        'Compact',
        'Compact.Tiny',
        'OneLine',
        'Compact.make',
        'Compact.ping',
        'hit',
      ]);
      await expectEveryNameToRead(names, 'src/compact.ts', compact);
    });

    // Layouts where the lines of a class and a member overlap in ways that
    // change the reader's chain; every emitted name must still read.
    it.each([
      [
        'a class and its nested class that end on one line',
        'class Host { make() { const Inner = class {\n  run() {}\n}; return Inner; } }\n',
        'Host.Inner.run',
      ],
      [
        'a nested class whose last line also holds a method of its outer class',
        'class Host {\n  make() { const Inner = class {\n    inside() {} }; return Inner; } run() {}\n}\n',
        'Host.Inner.inside',
      ],
      [
        'two top-level classes that share a line',
        'class A {} class B {\n  run() {}\n}\n',
        'B.run',
      ],
    ])(
      'names the members of %s as the reader does',
      async (_label, source, expected) => {
        const target = nodePath.join(dir, 'src', 'layout.ts');
        await writeFile(target, source);
        files.set(target, source);

        const { names } = await cutNote(0, target);

        expect(names).toContain(expected);
        await expectEveryNameToRead(names, 'src/layout.ts', target);
      },
    );

    it('lists no name for a member the reader keeps only once', async () => {
      const target = nodePath.join(dir, 'src', 'accessors.ts');
      const source =
        'class Box {\n  get value() { return 1; } set value(v: number) {\n    void v;\n  }\n}\nclass Other {\n  get value() { return 2; }\n}\n';
      await writeFile(target, source);
      files.set(target, source);

      const { names } = await cutNote(0, target);

      // The reader keeps the getter and drops the setter (one start line); a
      // bare `value` would match both classes.
      expect(names).toEqual(['Box', 'Other', 'Box.value', 'Other.value']);
      await expectEveryNameToRead(names, 'src/accessors.ts', target);
    });

    it('names the class method, with its body, that the reader keeps', async () => {
      const target = nodePath.join(dir, 'src', 'literal.ts');
      const source =
        'class Box {\n  options = { run() {} }; run() {\n    return 42;\n  }\n}\n';
      await writeFile(target, source);
      files.set(target, source);
      const result = await ast.analyze(target);

      const { names } = await cutNote(0, target);
      const reply = await handleReadSymbol(
        { file: 'src/literal.ts', name: 'Box.run' },
        { analyze: async () => result, defaultWorkspaceRoot: async () => dir },
      );

      // The reader keeps the object-literal method (it comes first in
      // `functions`) over the class method; the class method has no symbol,
      // so no name is listed for it.
      expect(names).toEqual(['Box']);
      expect(reply.text).toContain('options = { run() {} }');
      expect(reply.text).not.toContain('return 42;');
    });

    it('lists a cut function by its own name, not as a class member', async () => {
      const target = nodePath.join(dir, 'src', 'literal-fn.ts');
      const source =
        'class Box {\n  options = {\n    run() {},\n  };\n  go() {}\n}\nfunction helper() {}\n';
      await writeFile(target, source);
      files.set(target, source);
      const result = await ast.analyze(target);

      const text = formatAstAnalysisResult(
        shapeAstAnalyzeResult(result, [dir]),
        {
          fits: (candidate) =>
            (
              (JSON.parse(candidate) as { functions: unknown[] }).functions ??
              []
            ).length <= 1,
          listedName: { classes: readerNameLookup(result) },
        },
      );

      const note = (
        JSON.parse(text) as {
          truncated: { functions: { omittedNames: string } };
        }
      ).truncated.functions;
      expect(note.omittedNames).toBe('run,helper');
    });

    it('counts the names of the classes around a method, not only the longest name', () => {
      const methods = Array.from({ length: 12_000 }, (_, i) => ({
        name: `m${i}`,
        parameters: [],
        startLine: 100 + i,
        endLine: 100 + i,
      }));
      const name = (i: number): string => `${'N'.repeat(400)}${i}`;
      const nested = Array.from({ length: 20 }, (_, i) => ({
        name: name(i),
        startLine: i,
        endLine: 50_000 - i,
        ...(i === 19 ? { methods } : {}),
      }));
      // The same classes side by side: no class holds another one.
      const flat = nested.map((info, i) => ({
        ...info,
        startLine: i * 20_000,
        endLine: i * 20_000 + 19_999,
        // The methods lie inside their own class, the last of the row.
        methods:
          i === 19
            ? methods.map((method) => ({
                ...method,
                startLine: 380_100 + method.startLine,
                endLine: 380_100 + method.endLine,
              }))
            : undefined,
      }));
      const lookup = (classes: unknown[]) =>
        readerNameLookup({
          classes,
          functions: [],
        } as unknown as Parameters<typeof readerNameLookup>[0]);

      // 20 nested names of 400 characters in each of 12,000 qualified names
      // is about 96 million characters: no name. Side by side, each name
      // holds one class name and the lookup runs.
      expect(lookup(nested)(nested[19])).toBeUndefined();
      expect(lookup(nested)(methods[0])).toBeUndefined();
      expect(lookup(flat)(flat[0])).toBe(name(0));
      expect(lookup(flat)(flat[19].methods?.[5])).toBe(`${name(19)}.m5`);
      expect(lookup(flat)(flat[19].methods?.[11_999])).toBe(
        `${name(19)}.m11999`,
      );
      // Two classes that overlap on one line count together (`A`, `B`).
      const overlap = [
        { name: 'A'.repeat(50_000), startLine: 0, endLine: 1 },
        {
          name: 'B'.repeat(50_000),
          startLine: 1,
          endLine: 2,
          methods: Array.from({ length: 150 }, (_, i) => ({
            name: `f${i}`,
            parameters: [],
            startLine: 1,
            endLine: 1,
          })),
        },
      ];
      // One class alone is about 15 million characters (allowed); both count
      // at the shared line, about 23 million.
      expect(lookup(overlap)(overlap[1].methods?.[0])).toBeUndefined();
      expect(
        lookup([overlap[0], { ...overlap[1], startLine: 2 }])(overlap[0]),
      ).toBe(overlap[0].name);
    });

    it('lists no names, and keeps the counts, when the lookup would be too slow', () => {
      const classes = Array.from({ length: 11_000 }, (_, i) => ({
        name: `C${i}`,
        startLine: i,
        endLine: i,
      }));
      const lookup = readerNameLookup({
        classes,
        functions: [],
      } as unknown as Parameters<typeof readerNameLookup>[0]);

      expect(lookup(classes[0])).toBeUndefined();
      expect(
        formatAstAnalysisResult(
          { classes: [{ name: 'A' }, { name: 'B', members: [{ name: 'm' }] }] },
          {
            fits: (text) => !text.includes('"B"'),
            listedName: { classes: () => undefined },
          },
        ),
      ).toContain('"omittedMembers":1');
    });

    it('keeps two nested classes with the same inner name apart', async () => {
      const { names } = await cutNote(1);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toEqual(
        expect.arrayContaining(['Outer2.Inner.run', 'Outer4.Inner.run']),
      );
      const result = await ast.analyze(file);
      const reply = await handleReadSymbol(
        { file: 'src/nested.ts', name: 'Outer4.Inner.run' },
        { analyze: async () => result, defaultWorkspaceRoot: async () => dir },
      );
      expect(reply.text).toContain('return 4;');
      expect(reply.text).not.toContain('return 2;');
    });

    it('adds no field to a class record, nested or top-level', async () => {
      const result = await ast.analyze(file);
      const classes = shapeAstAnalyzeResult(result, [dir])[
        'classes'
      ] as object[];

      expect(classes.length).toBeGreaterThan(UNITS);
      for (const record of classes) {
        expect(
          Object.keys(record).every((key) =>
            ['name', 'startLine', 'endLine', 'isExported', 'members'].includes(
              key,
            ),
          ),
        ).toBe(true);
      }
      expect(
        JSON.parse(renderAstAnalyzeResult(result, [dir])).classes[0],
      ).toEqual(['name', 'startLine', 'endLine', 'members']);
    });

    it('serves names that read, through the production budget', async () => {
      const big = nodePath.join(dir, 'src', 'big.ts');
      const source = Array.from(
        { length: 1500 },
        (_, i) =>
          `class Out${i} {\n  make() {\n    const Inner = class {\n      run() {\n        return ${i};\n      }\n    };\n    return Inner;\n  }\n}\n`,
      ).join('\n');
      await writeFile(big, source);
      files.set(big, source);
      const result = await ast.analyze(big);

      const served = JSON.parse(renderAstAnalyzeResult(result, [dir])) as {
        truncated: {
          classes: { omittedNames: string; omittedMembers: number };
        };
      };

      const names = served.truncated.classes.omittedNames
        .split(',')
        .filter((name) => name !== '…');
      expect(names.length).toBeGreaterThan(50);
      expect(names.some((name) => /^Out\d+\.Inner$/.test(name))).toBe(true);
      await expectEveryNameToRead(names.slice(0, 6), 'src/big.ts', big);
    }, 60_000);
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
