import {
  chmod,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AstCodeInsights } from '../../types';
import { handleGrep, type GrepDeps } from './grep';
import {
  buildRipgrepArgs,
  globToRegExp,
  isCaseInsensitive,
  type GrepRequest,
} from './grep-engine';
import { GREP_MAX_CHARS } from './grep.limits';

jest.mock('../route-tool-handlers', () => ({
  describeZodIssues: (error: {
    issues: { path: unknown[]; message: string }[];
  }) =>
    error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; '),
}));

jest.mock('@ptah-extension/workspace-intelligence', () => ({
  EXTENSION_LANGUAGE_MAP: { '.ts': 'typescript' },
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

describe('handleGrep (node engine)', () => {
  let root: string;
  let outside: string;
  let deps: GrepDeps & { analyze: jest.Mock };

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'grep-'));
    outside = await mkdtemp(path.join(os.tmpdir(), 'grep-out-'));
    await mkdir(path.join(root, 'src'));
    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(path.join(root, 'src', 'a.ts'), SOURCE + '\n');
    await writeFile(
      path.join(root, 'src', 'b.md'),
      'The LIMIT is documented.\n',
    );
    await writeFile(
      path.join(root, 'node_modules', 'pkg', 'index.js'),
      'exports.LIMIT = 9;\n',
    );
    await writeFile(
      path.join(root, 'src', 'bin.dat'),
      Buffer.from([0, 76, 73, 77]),
    );
    await writeFile(path.join(outside, 'secret.ts'), 'LIMIT secret\n');
    deps = {
      analyze: jest.fn().mockResolvedValue(OUTLINE),
      defaultWorkspaceRoot: jest.fn().mockResolvedValue(root),
      findRipgrep: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('groups matches by file with the enclosing symbol and relative paths', async () => {
    const reply = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(reply.isError).toBe(false);
    const lines = reply.text.split('\n');
    expect(lines[0]).toBe('4 matches in 2 files (engine: node)');
    expect(lines).toContain('src/a.ts (3 matches)');
    expect(lines).toContain('  1| export const LIMIT = 3;');
    expect(lines).toContain('  4| [check] return n > LIMIT;');
    expect(lines).toContain('  9| [Gate.open] return LIMIT + 1;');
    expect(lines).toContain('src/b.md (1 match)');
    expect(reply.text).not.toContain(root);
    expect(reply.text).not.toContain('node_modules');
  });

  it('is case-insensitive for a lower-case pattern and exact otherwise', async () => {
    const smart = await handleGrep(
      { pattern: 'limit', path: 'src/b.md' },
      deps,
    );
    expect(smart.text.split('\n')[0]).toBe('1 match in 1 file (engine: node)');
    const exact = await handleGrep(
      { pattern: 'limit', caseSensitive: true, path: 'src' },
      deps,
    );
    expect(exact.text).toMatch(/^0 matches/);
  });

  it('treats the pattern as a literal unless regex is set', async () => {
    const literal = await handleGrep({ pattern: 'n > L.MIT' }, deps);
    expect(literal.text).toMatch(/^0 matches/);
    const regex = await handleGrep({ pattern: 'n > L.MIT', regex: true }, deps);
    expect(regex.text.split('\n')[0]).toContain('1 match');
  });

  it('rejects an invalid regular expression with a tool error', async () => {
    const reply = await handleGrep({ pattern: '(', regex: true }, deps);
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('invalid regular expression');
  });

  it('applies a glob and skips binary files', async () => {
    const reply = await handleGrep({ pattern: 'LIM', glob: '*.md' }, deps);
    expect(reply.text).toContain('src/b.md');
    expect(reply.text).not.toContain('src/a.ts');
    expect(reply.text).not.toContain('bin.dat');
  });

  it('adds context lines and separators', async () => {
    const reply = await handleGrep(
      { pattern: 'return', path: 'src/a.ts', context: 1 },
      deps,
    );
    const lines = reply.text.split('\n');
    expect(lines).toContain('  3- export function check(n: number) {');
    expect(lines).toContain('  4| [check] return n > LIMIT;');
    expect(lines).toContain('  5- }');
    expect(lines).toContain('    --');
  });

  it('keeps node_modules out unless includeIgnored has a scoped path', async () => {
    const scoped = await handleGrep(
      { pattern: 'LIMIT', path: 'node_modules/pkg', includeIgnored: true },
      deps,
    );
    expect(scoped.text).toContain('node_modules/pkg/index.js');
    const unscoped = await handleGrep(
      { pattern: 'LIMIT', includeIgnored: true },
      deps,
    );
    expect(unscoped.isError).toBe(true);
    expect(unscoped.text).toContain('scoped');
  });

  it('refuses a path outside the workspace, also through a symlink', async () => {
    const escape = await handleGrep({ pattern: 'LIMIT', path: '../' }, deps);
    expect(escape.isError).toBe(true);
    await symlink(outside, path.join(root, 'link'));
    const viaLink = await handleGrep({ pattern: 'LIMIT', path: 'link' }, deps);
    expect(viaLink.isError).toBe(true);
    expect(viaLink.text).toContain('outside the workspace');
  });

  it('says what was cut and stays inside the character cap', async () => {
    const big = Array.from(
      { length: 400 },
      (_, i) => `const needle${i} = "${'x'.repeat(150)}";`,
    ).join('\n');
    await writeFile(path.join(root, 'src', 'big.ts'), big);
    deps.analyze.mockResolvedValue({ ...OUTLINE, functions: [], classes: [] });
    const reply = await handleGrep(
      { pattern: 'needle', path: 'src/big.ts', maxMatches: 200 },
      deps,
    );
    expect(reply.text.length).toBeLessThanOrEqual(GREP_MAX_CHARS + 400);
    expect(reply.text).toMatch(/\+ \d+ more matches not shown/);
    expect(reply.text.split('\n')[0]).toBe(
      '400 matches in 1 file (engine: node)',
    );
  });

  it('reports no match with a hint', async () => {
    const reply = await handleGrep({ pattern: 'zzz-not-there' }, deps);
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain('0 matches');
    expect(reply.text).toContain('includeIgnored');
  });

  it('keeps the match when the outline fails', async () => {
    deps.analyze.mockRejectedValue(new Error('parse failed'));
    const reply = await handleGrep(
      { pattern: 'LIMIT', path: 'src/a.ts' },
      deps,
    );
    expect(reply.text).toContain('  4| return n > LIMIT;');
  });

  it('honours a negated glob like rg', async () => {
    const reply = await handleGrep({ pattern: 'LIMIT', glob: '!*.md' }, deps);
    expect(reply.text).toContain('src/a.ts');
    expect(reply.text).not.toContain('src/b.md');
  });

  it('prints no phantom context line past the end of the file', async () => {
    const reply = await handleGrep(
      { pattern: '^}$', regex: true, path: 'src/a.ts', context: 2 },
      deps,
    );
    expect(reply.text).not.toMatch(/ 12- /);
  });

  it('skips lines too long to search safely', async () => {
    await writeFile(
      path.join(root, 'src', 'min.js'),
      'a'.repeat(20_000) + ' needle\nneedle\n',
    );
    const reply = await handleGrep(
      { pattern: 'needle', path: 'src/min.js' },
      deps,
    );
    expect(reply.text.split('\n')[0]).toBe('1 match in 1 file (engine: node)');
  });

  it('rejects unknown arguments', async () => {
    const reply = await handleGrep({ pattern: 'x', surprise: true }, deps);
    expect(reply.isError).toBe(true);
  });
});

const itPosix = process.platform === 'win32' ? it.skip : it;

describe('handleGrep (rg engine)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'grep-rg-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'a.ts'), SOURCE + '\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function fakeRg(script: string): Promise<string> {
    const bin = path.join(root, 'fake-rg');
    await writeFile(bin, `#!/bin/sh\n${script}\n`);
    await chmod(bin, 0o755);
    return bin;
  }

  itPosix('parses rg --json matches and strips the ./ prefix', async () => {
    const json = (line: number, text: string) =>
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: './src/a.ts' },
          lines: { text: text + '\n' },
          line_number: line,
        },
      });
    const bin = await fakeRg(
      `cat <<'EOF'\n${json(1, 'export const LIMIT = 3;')}\n${json(4, '  return n > LIMIT;')}\n{"type":"summary"}\nEOF`,
    );
    const reply = await handleGrep(
      { pattern: 'LIMIT' },
      {
        analyze: jest.fn().mockResolvedValue(OUTLINE),
        defaultWorkspaceRoot: async () => root,
        findRipgrep: async () => bin,
      },
    );
    expect(reply.text.split('\n')[0]).toBe('2 matches in 1 file (engine: rg)');
    expect(reply.text).toContain('  4| [check] return n > LIMIT;');
  });

  itPosix(
    'falls back to the Node walk when rg fails with no match',
    async () => {
      const bin = await fakeRg('echo "regex parse error" >&2; exit 2');
      const reply = await handleGrep(
        { pattern: 'LIMIT' },
        {
          analyze: jest.fn().mockResolvedValue(OUTLINE),
          defaultWorkspaceRoot: async () => root,
          findRipgrep: async () => bin,
        },
      );
      expect(reply.text).toContain('(engine: node)');
    },
  );
});

describe('grep engine helpers', () => {
  const base: GrepRequest = {
    pattern: 'a b',
    regex: false,
    includeIgnored: false,
    rootReal: '/r',
    targetAbsolute: '/r/src',
    targetIsDirectory: true,
  };

  it('passes the pattern after -- as argv, never through a shell', () => {
    const args = buildRipgrepArgs(
      { ...base, glob: '*.ts', includeIgnored: true, caseSensitive: true },
      'src',
    );
    expect(args.slice(-3)).toEqual(['--', 'a b', 'src']);
    expect(args).toEqual(
      expect.arrayContaining([
        '--fixed-strings',
        '--case-sensitive',
        '--no-ignore',
        '--hidden',
      ]),
    );
  });

  it('matches globs like rg', () => {
    expect(globToRegExp('*.ts').test('libs/a/b.ts')).toBe(true);
    expect(globToRegExp('*.ts').test('libs/a/b.tsx')).toBe(false);
    expect(globToRegExp('libs/**/*.spec.ts').test('libs/a/b/c.spec.ts')).toBe(
      true,
    );
    expect(globToRegExp('*.{ts,js}').test('x.js')).toBe(true);
  });

  it('uses smart case', () => {
    expect(isCaseInsensitive('abc', undefined)).toBe(true);
    expect(isCaseInsensitive('aBc', undefined)).toBe(false);
    expect(isCaseInsensitive('abc', true)).toBe(false);
  });
});
