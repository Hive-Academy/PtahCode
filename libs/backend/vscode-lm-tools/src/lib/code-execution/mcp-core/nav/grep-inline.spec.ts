import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AstCodeInsights } from '../../types';
import { handleGrep, type GrepDeps } from './grep';
import { GREP_INLINE_MAX_BODY_LINES } from './grep.limits';

jest.mock('../route-tool-handlers', () => ({
  describeZodIssues: () => 'invalid',
}));

// The real package cannot load under Jest (tree-sitter loader). This stand-in
// has the excluded folders the specs use; the predicate itself is pinned by
// workspace-default-excludes.spec.ts.
jest.mock('@ptah-extension/workspace-intelligence', () => ({
  EXTENSION_LANGUAGE_MAP: { '.ts': 'typescript' },
  isCodeIndexExcluded: (relativePath: string) =>
    /(^|\/)(node_modules|dist|build|out|target|tmp|coverage)(\/|$)/.test(
      relativePath,
    ),
}));

const SOURCE = [
  'export const LIMIT = 3;', // 1
  '', // 2
  'export function check(n: number) {', // 3
  '  return n > LIMIT;', // 4
  '}', // 5
  '', // 6
  'export class Gate {', // 7
  '  open() {', // 8
  '    return LIMIT + 1;', // 9
  '  }', // 10
  '}', // 11
].join('\n');

/** 0-based ranges, as the tree-sitter outline reports them. */
const OUTLINE = {
  file: 'src/a.ts',
  language: 'typescript',
  functions: [
    { name: 'check', parameters: ['n'], startLine: 2, endLine: 4 },
    { name: 'open', parameters: [], startLine: 7, endLine: 9 },
  ],
  classes: [{ name: 'Gate', startLine: 6, endLine: 10 }],
  imports: [],
  exports: [],
} as unknown as AstCodeInsights;

function outlineOf(
  functions: { name: string; startLine: number; endLine: number }[],
): AstCodeInsights {
  return {
    ...OUTLINE,
    functions: functions.map((fn) => ({ ...fn, parameters: [] })),
    classes: [],
  } as unknown as AstCodeInsights;
}

const bodyMarkers = (text: string): string[] =>
  text.split('\n').filter((line) => /^ {2}\[[^\]]+\] \w+ \d+-\d+/.test(line));

describe('handleGrep enclosing-body inlining', () => {
  let root: string;
  let deps: GrepDeps & { analyze: jest.Mock };

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'grep-inline-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'a.ts'), SOURCE + '\n');
    deps = {
      analyze: jest.fn().mockResolvedValue(OUTLINE),
      defaultWorkspaceRoot: jest.fn().mockResolvedValue(root),
      findRipgrep: jest.fn().mockResolvedValue(undefined),
      findGit: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('inlines the enclosing bodies of a small result', async () => {
    const reply = await handleGrep({ pattern: 'return' }, deps);
    expect(reply.isError).toBe(false);
    expect(reply.text.split('\n')).toEqual([
      '2 matches in 1 file (engine: node)',
      'src/a.ts (2 matches)',
      '  [check] function 3-5',
      '  3- export function check(n: number) {',
      '  4|   return n > LIMIT;',
      '  5- }',
      '  [Gate.open] method 8-10',
      '  8- open() {',
      '  9|   return LIMIT + 1;',
      '  10- }',
    ]);
  });

  it('keeps the plain list above the match threshold', async () => {
    // Three matches in two declarations (line 1 has none): inlined.
    const three = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(three.text.split('\n')[0]).toBe(
      '3 matches in 1 file (engine: node)',
    );
    expect(three.text).toContain('  1| export const LIMIT = 3;');
    expect(bodyMarkers(three.text)).toHaveLength(2);

    await writeFile(
      path.join(root, 'src', 'a.ts'),
      SOURCE + '\nexport const OTHER = LIMIT;\n',
    );
    const four = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(four.text.split('\n')[0]).toBe('4 matches in 1 file (engine: node)');
    expect(bodyMarkers(four.text)).toEqual([]);
    expect(four.text).toContain('  4| [check] return n > LIMIT;');
  });

  it('inlines no body when three matches sit in three declarations', async () => {
    await writeFile(
      path.join(root, 'src', 't.ts'),
      ['function a() {}', 'function b() {}', 'function c() {}'].join('\n') +
        '\n',
    );
    deps.analyze.mockResolvedValue(
      outlineOf([
        { name: 'a', startLine: 0, endLine: 0 },
        { name: 'b', startLine: 1, endLine: 1 },
        { name: 'c', startLine: 2, endLine: 2 },
      ]),
    );
    const reply = await handleGrep({ pattern: '}', path: 'src/t.ts' }, deps);
    expect(reply.text.split('\n')[0]).toBe(
      '3 matches in 1 file (engine: node)',
    );
    expect(bodyMarkers(reply.text)).toEqual([]);
  });

  it('inlines one body for two matches in one function', async () => {
    await writeFile(
      path.join(root, 'src', 'c.ts'),
      [
        'function twice() {', // 1
        '  const token = read();', // 2
        '  return token + token2;', // 3
        '}', // 4
      ].join('\n') + '\n',
    );
    deps.analyze.mockResolvedValue(
      outlineOf([{ name: 'twice', startLine: 0, endLine: 3 }]),
    );
    const reply = await handleGrep(
      { pattern: 'token', path: 'src/c.ts' },
      deps,
    );
    expect(bodyMarkers(reply.text)).toEqual(['  [twice] function 1-4']);
    expect(reply.text.split('\n')).toEqual([
      '2 matches in 1 file (engine: node)',
      'src/c.ts (2 matches)',
      '  [twice] function 1-4',
      '  1- function twice() {',
      '  2|   const token = read();',
      '  3|   return token + token2;',
      '  4- }',
    ]);
  });

  it('inlines one outer body when matches sit in a declaration and one nested in it', async () => {
    await writeFile(
      path.join(root, 'src', 'n.ts'),
      [
        'function outer() {', // 1
        '  const token = 1;', // 2
        '  function inner() {', // 3
        '    return token;', // 4
        '  }', // 5
        '}', // 6
      ].join('\n') + '\n',
    );
    deps.analyze.mockResolvedValue(
      outlineOf([
        { name: 'outer', startLine: 0, endLine: 5 },
        { name: 'inner', startLine: 2, endLine: 4 },
      ]),
    );
    const reply = await handleGrep(
      { pattern: 'token', path: 'src/n.ts' },
      deps,
    );
    const markers = bodyMarkers(reply.text);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatch(/outer\] function 1-6$/);
    expect(reply.text.match(/^ {2}4\|/gm)).toHaveLength(1);
  });

  it('cuts a long body around its match and says how to read the rest', async () => {
    const lines = ['function big() {'];
    for (let i = 2; i < 200; i++) {
      lines.push(i === 100 ? '  needle();' : `  step${i}();`);
    }
    lines.push('}'); // 200
    await writeFile(path.join(root, 'src', 'big.ts'), lines.join('\n') + '\n');
    deps.analyze.mockResolvedValue(
      outlineOf([{ name: 'big', startLine: 0, endLine: 199 }]),
    );
    const reply = await handleGrep(
      { pattern: 'needle', path: 'src/big.ts' },
      deps,
    );
    const out = reply.text.split('\n');
    const first = 100 - 3;
    const last = first + GREP_INLINE_MAX_BODY_LINES - 1;
    expect(out).toContain(`  [big] function 1-200, showing ${first}-${last}`);
    expect(out).toContain(`    … lines 1-${first - 1} not shown`);
    expect(out).toContain('  100| needle();');
    expect(out).toContain(
      `    … lines ${last + 1}-200 not shown; read them with ptah_read_symbol (name "big" or startLine ${last + 1})`,
    );
    const numbered = out.filter((line) => /^ {2}\d+[|-]/.test(line));
    expect(numbered).toHaveLength(GREP_INLINE_MAX_BODY_LINES);
    expect(reply.text).not.toMatch(/more matches not shown/);
  });

  it('falls back to the plain list when the symbol lookup fails', async () => {
    deps.analyze.mockRejectedValue(new Error('parse failed'));
    const reply = await handleGrep({ pattern: 'return' }, deps);
    expect(reply.isError).toBe(false);
    expect(reply.text.split('\n')).toEqual([
      '2 matches in 1 file (engine: node)',
      'src/a.ts (2 matches)',
      '  4| return n > LIMIT;',
      '  9| return LIMIT + 1;',
    ]);
  });

  it('keeps the plain list for a file the outline does not cover', async () => {
    await writeFile(path.join(root, 'src', 'notes.md'), 'one return\n');
    const reply = await handleGrep({ pattern: 'return', glob: '*.md' }, deps);
    expect(reply.text).toContain('  1| one return');
    expect(bodyMarkers(reply.text)).toEqual([]);
  });

  it('turns inlining off with inlineBody:false', async () => {
    const reply = await handleGrep(
      { pattern: 'return', inlineBody: false },
      deps,
    );
    expect(bodyMarkers(reply.text)).toEqual([]);
    expect(reply.text).toContain('  4| [check] return n > LIMIT;');
  });
});
