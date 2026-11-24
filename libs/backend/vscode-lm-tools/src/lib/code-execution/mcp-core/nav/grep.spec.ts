import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AstCodeInsights } from '../../types';
import { handleGrep, type GrepDeps } from './grep';
import {
  buildGitGrepArgs,
  buildGitPathspecs,
  buildRipgrepArgs,
  globToRegExp,
  inferRegexMode,
  isCaseInsensitive,
  isGitWorkTree,
  canGitGrepSearchRoot,
  type GrepRequest,
} from './grep-engine';
import { GREP_MAX_CHARS, GREP_MAX_FILE_BYTES } from './grep.limits';

jest.mock('../route-tool-handlers', () => ({
  describeZodIssues: (error: {
    issues: { path: unknown[]; message: string }[];
  }) =>
    error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; '),
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

  it('infers regex mode for an rg-style pattern when regex is omitted', async () => {
    await writeFile(
      path.join(root, 'src', 'tabs.ts'),
      'const tab = findTabBySession(id);\nconst SessionId = 1;\n',
    );
    const alternation = await handleGrep(
      {
        pattern: 'findTabBySession|tabForSession|tabIdFor|bySessionId|findTab',
        path: 'src/tabs.ts',
      },
      deps,
    );
    expect(alternation.text.split('\n')[0]).toBe(
      '1 match in 1 file (engine: node) (pattern read as regex; pass regex:false for a literal search)',
    );
    const second = await handleGrep(
      { pattern: 'sessionId|session_id|SessionId', path: 'src/tabs.ts' },
      deps,
    );
    expect(second.text.split('\n')[0]).toContain('1 match in 1 file');
    expect(second.text).toContain('2| const SessionId = 1;');
  });

  it('keeps a pattern literal when regex is explicit, not compilable or a lone dot', async () => {
    await writeFile(
      path.join(root, 'src', 'lit.ts'),
      'a|b\nfoo(\nfooXbar\nfoo.bar\n',
    );
    const explicit = await handleGrep(
      { pattern: 'a|b', regex: false, path: 'src/lit.ts' },
      deps,
    );
    expect(explicit.text.split('\n')[0]).toBe(
      '1 match in 1 file (engine: node)',
    );
    const open = await handleGrep(
      { pattern: 'foo(', path: 'src/lit.ts' },
      deps,
    );
    expect(open.isError).toBe(false);
    expect(open.text.split('\n')[0]).toBe('1 match in 1 file (engine: node)');
    const dot = await handleGrep(
      { pattern: 'foo.bar', path: 'src/lit.ts', inlineBody: false },
      deps,
    );
    expect(dot.text).toContain('4| [check] foo.bar');
    expect(dot.text).not.toContain('fooXbar');
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
      { pattern: 'return', path: 'src/a.ts', context: 1, inlineBody: false },
      deps,
    );
    const lines = reply.text.split('\n');
    expect(lines).toContain('  3- export function check(n: number) {');
    expect(lines).toContain('  4| [check] return n > LIMIT;');
    expect(lines).toContain('  5- }');
    expect(lines).toContain('    --');
  });

  it('prunes the folders of the shared code-index exclude list', async () => {
    for (const dir of ['build', 'out', 'target', 'src/tmp']) {
      await mkdir(path.join(root, dir), { recursive: true });
      await writeFile(path.join(root, dir, 'x.ts'), 'LIMIT pruned\n');
    }
    const reply = await handleGrep({ pattern: 'LIMIT pruned' }, deps);
    expect(reply.text).toMatch(/^0 matches/);
    // The prune is never silent: the answer names the folders.
    expect(reply.text).toContain('code-index exclude list');
    expect(reply.text).toMatch(/build|out|target|tmp/);
    expect(reply.text).toContain('includeIgnored');
  });

  it('does not name node_modules in the note: it was always skipped', async () => {
    const reply = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(reply.text).not.toContain('code-index exclude list');
  });

  it('prunes below an excluded target by the path from that target', async () => {
    await mkdir(path.join(root, 'dist', 'pkg', 'node_modules', 'dep'), {
      recursive: true,
    });
    await writeFile(
      path.join(root, 'dist', 'pkg', 'node_modules', 'dep', 'x.js'),
      'LIMIT nested\n',
    );
    await writeFile(path.join(root, 'dist', 'pkg', 'y.js'), 'LIMIT nested\n');
    const reply = await handleGrep(
      { pattern: 'LIMIT nested', path: 'dist/pkg' },
      deps,
    );
    expect(reply.text.split('\n')[0]).toBe('1 match in 1 file (engine: node)');
    expect(reply.text).toContain('dist/pkg/y.js');
  });

  it('still searches a folder the caller scoped into, even when it is excluded', async () => {
    await mkdir(path.join(root, 'dist', 'pkg', 'lib'), { recursive: true });
    await writeFile(
      path.join(root, 'dist', 'pkg', 'lib', 'x.js'),
      'LIMIT scoped\n',
    );
    const reply = await handleGrep(
      { pattern: 'LIMIT scoped', path: 'dist/pkg' },
      deps,
    );
    expect(reply.text.split('\n')[0]).toBe('1 match in 1 file (engine: node)');
    expect(reply.text).toContain('dist/pkg/lib/x.js');
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

  it('searches a long line for a literal, and reports the lines a regex skipped', async () => {
    await writeFile(
      path.join(root, 'src', 'min.js'),
      'a'.repeat(20_000) + ' needle\nneedle\n',
    );
    const literal = await handleGrep(
      { pattern: 'needle', path: 'src/min.js' },
      deps,
    );
    expect(literal.text.split('\n')[0]).toBe(
      '2 matches in 1 file (engine: node)',
    );
    const regex = await handleGrep(
      { pattern: 'needl+e', regex: true, path: 'src/min.js' },
      deps,
    );
    expect(regex.text.split('\n')[0]).toBe('1 match in 1 file (engine: node)');
    expect(regex.text).toContain('not searched: 1 line(s) over 10000 chars');
  });

  it('says when a file over 1 MB was not searched', async () => {
    await writeFile(
      path.join(root, 'src', 'huge.txt'),
      'x'.repeat(1_100_000) + '\nneedle\n',
    );
    const reply = await handleGrep(
      { pattern: 'needle', path: 'src/huge.txt' },
      deps,
    );
    expect(reply.text).toMatch(/^0 matches/);
    expect(reply.text).toContain('not searched: 1 file(s) over 1 MB');
  });

  it('applies the root .gitignore in the Node walk', async () => {
    await writeFile(
      path.join(root, '.gitignore'),
      'build/\n*.log\n/src/b.md\n',
    );
    await mkdir(path.join(root, 'build'));
    await writeFile(path.join(root, 'build', 'out.js'), 'const LIMIT = 1;\n');
    await writeFile(path.join(root, 'src', 'run.log'), 'LIMIT in a log\n');
    const reply = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(reply.text).toContain('src/a.ts');
    expect(reply.text).not.toContain('build/out.js');
    expect(reply.text).not.toContain('run.log');
    expect(reply.text).not.toContain('src/b.md');
  });

  it('re-includes a file that a later ! rule names, and keeps the last rule', async () => {
    await writeFile(
      path.join(root, '.gitignore'),
      '*.log\n!keep.log\n*.tmp\n!drop.tmp\ndrop.tmp\n',
    );
    await writeFile(path.join(root, 'src', 'keep.log'), 'LIMIT kept\n');
    await writeFile(path.join(root, 'src', 'other.log'), 'LIMIT other\n');
    await writeFile(path.join(root, 'src', 'drop.tmp'), 'LIMIT dropped\n');
    const reply = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(reply.text).toContain('src/keep.log');
    expect(reply.text).not.toContain('other.log');
    expect(reply.text).not.toContain('drop.tmp');
  });

  it('applies a nested .gitignore relative to its folder, and lets it override', async () => {
    await mkdir(path.join(root, 'src', 'deep'), { recursive: true });
    await writeFile(path.join(root, '.gitignore'), '*.log\n');
    await writeFile(
      path.join(root, 'src', '.gitignore'),
      'secret.ts\n/deep/hidden.ts\n!keep.log\n',
    );
    await writeFile(path.join(root, 'src', 'secret.ts'), 'LIMIT secret\n');
    await writeFile(path.join(root, 'src', 'deep', 'hidden.ts'), 'LIMIT h\n');
    await writeFile(path.join(root, 'src', 'deep', 'shown.ts'), 'LIMIT s\n');
    await writeFile(path.join(root, 'src', 'keep.log'), 'LIMIT kept\n');
    await writeFile(path.join(root, 'src', 'other.log'), 'LIMIT other\n');
    // The nested rules do not reach a sibling folder of `src`.
    await mkdir(path.join(root, 'lib'));
    await writeFile(path.join(root, 'lib', 'secret.ts'), 'LIMIT sibling\n');
    const reply = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(reply.text).not.toContain('src/secret.ts');
    expect(reply.text).not.toContain('hidden.ts');
    expect(reply.text).not.toContain('other.log');
    expect(reply.text).toContain('src/deep/shown.ts');
    expect(reply.text).toContain('src/keep.log');
    expect(reply.text).toContain('lib/secret.ts');
    const included = await handleGrep(
      { pattern: 'LIMIT', includeIgnored: true, path: 'src' },
      deps,
    );
    expect(included.text).toContain('src/secret.ts');
  });

  it('drops a .gitignore rule that backtracks and keeps the other rules', async () => {
    const slow = `${'*a'.repeat(30)}b`;
    await writeFile(path.join(root, '.gitignore'), `${slow}\n*.log\n`);
    const longName = `${'a'.repeat(200)}.ts`;
    await writeFile(path.join(root, 'src', longName), 'LIMIT slow\n');
    await writeFile(path.join(root, 'src', 'run.log'), 'LIMIT log\n');
    const started = Date.now();
    const reply = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(reply.text).toContain(longName);
    expect(reply.text).not.toContain('run.log');
  }, 15000);

  it('applies the .gitignore files above a scoped target folder', async () => {
    await mkdir(path.join(root, 'src', 'deep'), { recursive: true });
    await writeFile(path.join(root, '.gitignore'), '*.log\n');
    await writeFile(path.join(root, 'src', '.gitignore'), 'secret.ts\n');
    await writeFile(path.join(root, 'src', 'deep', 'secret.ts'), 'LIMIT s\n');
    await writeFile(path.join(root, 'src', 'deep', 'run.log'), 'LIMIT l\n');
    await writeFile(path.join(root, 'src', 'deep', 'ok.ts'), 'LIMIT ok\n');
    const reply = await handleGrep(
      { pattern: 'LIMIT', path: 'src/deep' },
      deps,
    );
    expect(reply.text).toContain('src/deep/ok.ts');
    expect(reply.text).not.toContain('secret.ts');
    expect(reply.text).not.toContain('run.log');
  });

  (process.platform === 'win32' ? it.skip : it)(
    'skips a .gitignore that is a FIFO instead of blocking on the read',
    async () => {
      execFileSync('mkfifo', [path.join(root, '.gitignore')]);
      const reply = await handleGrep({ pattern: 'LIMIT', path: 'src' }, deps);
      expect(reply.isError).toBe(false);
      expect(reply.text).toContain('src/a.ts');
    },
    10_000,
  );

  it('skips a .gitignore over the size cap', async () => {
    await writeFile(
      path.join(root, '.gitignore'),
      `*.log\n${'#'.repeat(GREP_MAX_FILE_BYTES)}\n`,
    );
    await writeFile(path.join(root, 'src', 'run.log'), 'LIMIT in a log\n');
    const reply = await handleGrep({ pattern: 'LIMIT' }, deps);
    expect(reply.text).toContain('src/run.log');
  });

  it('stops a backtracking regular expression instead of freezing the host', async () => {
    await writeFile(path.join(root, 'src', 'slow.txt'), `${'a'.repeat(40)}!\n`);
    const started = Date.now();
    const reply = await handleGrep(
      { pattern: '(a+)+$', regex: true, path: 'src/slow.txt' },
      deps,
    );
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain('too slow');
  });

  it('rejects unknown arguments', async () => {
    const reply = await handleGrep({ pattern: 'x', surprise: true }, deps);
    expect(reply.isError).toBe(true);
  });

  const canChmod = process.platform !== 'win32' && process.getuid?.() !== 0;
  (canChmod ? it : it.skip)(
    'counts an unreadable folder in the not-searched note',
    async () => {
      const locked = path.join(root, 'src', 'locked');
      await mkdir(locked);
      await writeFile(path.join(locked, 'x.ts'), 'LIMIT locked\n');
      await chmod(locked, 0o000);
      try {
        const reply = await handleGrep({ pattern: 'LIMIT locked' }, deps);
        expect(reply.text).toContain('1 unreadable file(s) or folder(s)');
      } finally {
        await chmod(locked, 0o755);
      }
    },
  );
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
      { pattern: 'LIMIT', inlineBody: false },
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

  itPosix(
    'marks matches partial and shows the rg error when rg exits 2 after matching',
    async () => {
      const match = JSON.stringify({
        type: 'match',
        data: {
          path: { text: './src/a.ts' },
          lines: { text: 'export const LIMIT = 3;\n' },
          line_number: 1,
        },
      });
      const bin = await fakeRg(
        `cat <<'EOF'\n${match}\nEOF\necho "src/locked: Permission denied (os error 13)" >&2; exit 2`,
      );
      const reply = await handleGrep(
        { pattern: 'LIMIT' },
        {
          analyze: jest.fn().mockResolvedValue(OUTLINE),
          defaultWorkspaceRoot: async () => root,
          findRipgrep: async () => bin,
        },
      );
      expect(reply.text.split('\n')[0]).toBe(
        'at least 1 match in at least 1 file (engine: rg)',
      );
      expect(reply.text).toContain(
        'Engine note: rg reported an error, so matches may be partial: src/locked: Permission denied (os error 13)',
      );
    },
  );
});

const hasGit = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const itGit = hasGit && process.platform !== 'win32' ? it : it.skip;

describe('handleGrep (git engine)', () => {
  let root: string;
  let deps: GrepDeps;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'grep-git-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'a.ts'), SOURCE + '\n');
    await writeFile(path.join(root, 'src', 'new.ts'), 'LIMIT untracked\n');
    // A nested ignore file: the Node walk reads only the root one.
    await writeFile(path.join(root, 'src', '.gitignore'), 'skip.ts\n');
    await writeFile(path.join(root, 'src', 'skip.ts'), 'LIMIT ignored\n');
    if (hasGit) {
      execFileSync('git', ['init', '-q'], { cwd: root });
      execFileSync('git', ['add', 'src/a.ts'], { cwd: root });
    }
    deps = {
      analyze: jest.fn().mockResolvedValue(OUTLINE),
      defaultWorkspaceRoot: async () => root,
      findRipgrep: async () => undefined,
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  itGit(
    'finds tracked and untracked files and leaves out a nested-ignored one',
    async () => {
      const reply = await handleGrep({ pattern: 'LIMIT' }, deps);
      expect(reply.isError).toBe(false);
      expect(reply.text.split('\n')[0]).toBe(
        '4 matches in 2 files (engine: git)',
      );
      expect(reply.text).toContain('src/a.ts');
      expect(reply.text).toContain('src/new.ts');
      expect(reply.text).not.toContain('skip.ts');
    },
  );

  itGit('searches the ignored file with includeIgnored', async () => {
    const reply = await handleGrep(
      { pattern: 'LIMIT', path: 'src', includeIgnored: true },
      deps,
    );
    expect(reply.text).toContain('(engine: git)');
    expect(reply.text).toContain('src/skip.ts');
  });

  itGit('applies a glob and a negated glob', async () => {
    const only = await handleGrep({ pattern: 'LIMIT', glob: 'new.*' }, deps);
    expect(only.text.split('\n')[0]).toBe('1 match in 1 file (engine: git)');
    expect(only.text).toContain('src/new.ts');
    const without = await handleGrep(
      { pattern: 'LIMIT', glob: '!new.ts' },
      deps,
    );
    expect(without.text.split('\n')[0]).toBe(
      '3 matches in 1 file (engine: git)',
    );
    expect(without.text).not.toContain('src/new.ts');
  });

  itGit('reads git exit 1 as zero matches, not an error', async () => {
    const reply = await handleGrep({ pattern: 'NOT_IN_ANY_FILE' }, deps);
    expect(reply.isError).toBe(false);
    expect(reply.text.startsWith('0 matches (engine: git).')).toBe(true);
    expect(reply.text).not.toContain('Engine note');
  });

  itGit('leaves out hidden files and directories, like rg', async () => {
    await mkdir(path.join(root, '.cache'));
    await writeFile(path.join(root, '.cache', 'x.ts'), 'LIMIT hidden\n');
    await writeFile(path.join(root, '.env.ts'), 'LIMIT hidden\n');
    const reply = await handleGrep({ pattern: 'LIMIT hidden' }, deps);
    expect(reply.text.startsWith('0 matches (engine: git).')).toBe(true);
    // A hidden target is searched when it is named.
    const named = await handleGrep(
      { pattern: 'LIMIT hidden', path: '.cache' },
      deps,
    );
    expect(named.text).toContain('.cache/x.ts');
  });

  itGit('skips hidden entries below a named hidden target', async () => {
    await mkdir(path.join(root, '.config', '.inner'), { recursive: true });
    await writeFile(path.join(root, '.config', 'a.ts'), 'LIMIT cfg\n');
    await writeFile(
      path.join(root, '.config', '.inner', 'b.ts'),
      'LIMIT cfg\n',
    );
    const reply = await handleGrep(
      { pattern: 'LIMIT cfg', path: '.config' },
      deps,
    );
    expect(reply.text.split('\n')[0]).toBe('1 match in 1 file (engine: git)');
    expect(reply.text).not.toContain('.inner');
  });

  itGit(
    'does not run a timed-out git glob again in the Node walk',
    async () => {
      await writeFile(
        path.join(root, 'src', `${'a'.repeat(120)}.ts`),
        'LIMIT slow\n',
      );
      // A brace glob is not a git pathspec, so it filters git's output.
      const reply = await handleGrep(
        { pattern: 'LIMIT slow', glob: `{x,${'*a'.repeat(25)}*b}` },
        deps,
      );
      expect(reply.text).toContain('(engine: git)');
      expect(reply.text).toContain('the glob is too slow');
    },
    20_000,
  );

  itGit('probes again after a negative work-tree result', async () => {
    const plain = await mkdtemp(path.join(os.tmpdir(), 'grep-probe-'));
    try {
      const real = await realpath(plain);
      expect(await isGitWorkTree('git', real)).toBe(false);
      execFileSync('git', ['init', '-q'], { cwd: real });
      expect(await isGitWorkTree('git', real)).toBe(true);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });

  // The root sits under a directory that the parent repository ignores: git
  // calls it "inside the work tree" but lists no file of it.
  itGit(
    'falls back to the Node walk when a parent repository ignores the root',
    async () => {
      const parent = await mkdtemp(path.join(os.tmpdir(), 'grep-parent-'));
      try {
        const parentReal = await realpath(parent);
        execFileSync('git', ['init', '-q'], { cwd: parentReal });
        await writeFile(path.join(parentReal, '.gitignore'), 'ignored/\n');
        const ws = path.join(parentReal, 'ignored', 'ws');
        await mkdir(path.join(ws, 'src'), { recursive: true });
        await writeFile(path.join(ws, 'src', 'a.ts'), 'LIMIT in ignored\n');
        const reply = await handleGrep(
          { pattern: 'LIMIT' },
          { ...deps, defaultWorkspaceRoot: async () => ws },
        );
        expect(reply.text.split('\n')[0]).toBe(
          '1 match in 1 file (engine: node)',
        );
        expect(reply.text).toContain('src/a.ts');
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    },
  );

  itGit(
    'honours a nested .gitignore when a parent repository ignores the root',
    async () => {
      const parent = await mkdtemp(path.join(os.tmpdir(), 'grep-parent-'));
      try {
        const parentReal = await realpath(parent);
        execFileSync('git', ['init', '-q'], { cwd: parentReal });
        await writeFile(path.join(parentReal, '.gitignore'), 'ignored/\n');
        const ws = path.join(parentReal, 'ignored', 'ws');
        await mkdir(path.join(ws, 'src'), { recursive: true });
        await writeFile(path.join(ws, 'src', '.gitignore'), 'gen.ts\n');
        await writeFile(path.join(ws, 'src', 'a.ts'), 'LIMIT kept\n');
        await writeFile(path.join(ws, 'src', 'gen.ts'), 'LIMIT generated\n');
        const reply = await handleGrep(
          { pattern: 'LIMIT' },
          { ...deps, defaultWorkspaceRoot: async () => ws },
        );
        expect(reply.text).toContain('src/a.ts');
        expect(reply.text).not.toContain('gen.ts');
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    },
  );

  itGit(
    'keeps git grep for a root that a parent repository does not ignore',
    async () => {
      const ws = path.join(root, 'nested');
      await mkdir(ws);
      await writeFile(path.join(ws, 'a.ts'), 'LIMIT nested\n');
      const reply = await handleGrep(
        { pattern: 'LIMIT nested' },
        { ...deps, defaultWorkspaceRoot: async () => ws },
      );
      expect(reply.text.split('\n')[0]).toBe('1 match in 1 file (engine: git)');
    },
  );

  itGit('reports whether git grep can search the root', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'grep-ignore-'));
    try {
      const real = await realpath(parent);
      execFileSync('git', ['init', '-q'], { cwd: real });
      await writeFile(path.join(real, '.gitignore'), 'ignored/\n');
      await mkdir(path.join(real, 'ignored'));
      await mkdir(path.join(real, 'kept'));
      expect(
        await canGitGrepSearchRoot('git', path.join(real, 'ignored')),
      ).toBe(false);
      expect(await canGitGrepSearchRoot('git', path.join(real, 'kept'))).toBe(
        true,
      );
      expect(await canGitGrepSearchRoot('git', real)).toBe(true);
      // A failed probe is not "searchable": the Node walk runs.
      expect(
        await canGitGrepSearchRoot('git', path.join(real, 'missing')),
      ).toBe(false);
      expect(await canGitGrepSearchRoot('/no/such/git', real)).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  itGit('keeps a path that holds a line break in one match', async () => {
    if (process.platform === 'win32') {
      return;
    }
    await writeFile(path.join(root, 'src', 'a\nb.ts'), 'LIMIT split\n');
    const reply = await handleGrep({ pattern: 'LIMIT split' }, deps);
    expect(reply.text.split('\n')[0]).toBe('1 match in 1 file (engine: git)');
    expect(reply.text).toContain('LIMIT split');
  });

  itGit('reads a bracket glob literally, like the other engines', async () => {
    await writeFile(path.join(root, 'src', 'f[1].ts'), 'LIMIT bracket\n');
    await writeFile(path.join(root, 'src', 'f1.ts'), 'LIMIT bracket\n');
    const reply = await handleGrep(
      { pattern: 'LIMIT bracket', glob: 'f[1].ts' },
      deps,
    );
    expect(reply.text.split('\n')[0]).toBe('1 match in 1 file (engine: git)');
    expect(reply.text).toContain('src/f[1].ts');
  });

  // git filters a glob by itself; the Node walk runs it as a regex.
  it('ends a Node walk whose glob backtracks, with a reason', async () => {
    const plain = await mkdtemp(path.join(os.tmpdir(), 'grep-slow-'));
    try {
      await writeFile(
        path.join(plain, `${'a'.repeat(120)}.ts`),
        'LIMIT slow\n',
      );
      const reply = await handleGrep(
        { pattern: 'LIMIT slow', glob: `${'*a'.repeat(25)}*b` },
        { ...deps, defaultWorkspaceRoot: async () => plain },
      );
      expect(reply.text).toContain('(engine: node)');
      expect(reply.text).toContain('the glob is too slow');
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  }, 20_000);

  itGit('falls back to the Node walk outside a git work tree', async () => {
    const plain = await mkdtemp(path.join(os.tmpdir(), 'grep-plain-'));
    try {
      await writeFile(path.join(plain, 'a.ts'), 'LIMIT plain\n');
      const reply = await handleGrep(
        { pattern: 'LIMIT' },
        { ...deps, defaultWorkspaceRoot: async () => plain },
      );
      expect(reply.text.split('\n')[0]).toBe(
        '1 match in 1 file (engine: node)',
      );
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });
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

  it('maps the target and globs to git pathspecs', () => {
    expect(buildGitPathspecs(base, 'src')).toEqual([':(literal)src']);
    expect(buildGitPathspecs({ ...base, glob: '*.ts' }, 'src')).toEqual([
      ':(glob)src/**/*.ts',
    ]);
    expect(buildGitPathspecs({ ...base, glob: '*.ts' }, '.')).toEqual([
      ':(glob)**/*.ts',
    ]);
    expect(buildGitPathspecs({ ...base, glob: '!*.spec.ts' }, 'src')).toEqual([
      ':(literal)src',
      ':(exclude,glob)**/*.spec.ts',
    ]);
    expect(buildGitPathspecs({ ...base, glob: '*.{ts,js}' }, 'src')).toEqual([
      ':(literal)src',
    ]);
    // A bracket is a literal for rg and the Node walk: filter only.
    expect(buildGitPathspecs({ ...base, glob: 'f[1].ts' }, 'src')).toEqual([
      ':(literal)src',
    ]);
    // A slash glob in a scoped target filters, so siblings are not read.
    expect(buildGitPathspecs({ ...base, glob: 'src/**/*.ts' }, 'src')).toEqual([
      ':(literal)src',
    ]);
    expect(buildGitPathspecs({ ...base, glob: 'src/**/*.ts' }, '.')).toEqual([
      ':(glob)src/**/*.ts',
    ]);
  });

  it('turns off submodule recursion and excludes hidden paths for git', () => {
    const args = buildGitGrepArgs(base, 'src');
    expect(args).toEqual(
      expect.arrayContaining(['-c', 'submodule.recurse=false']),
    );
    expect(args.slice(-2)).toEqual([
      ':(exclude,glob)**/.*',
      ':(exclude,glob)**/.*/**',
    ]);
    expect(
      buildGitGrepArgs({ ...base, includeIgnored: true }, 'src'),
    ).not.toContain(':(exclude,glob)**/.*');
    expect(buildGitGrepArgs(base, '.github/workflows')).not.toContain(
      ':(exclude,glob)**/.*',
    );
  });

  it('refuses a pattern with a line break', async () => {
    const reply = await handleGrep(
      { pattern: 'alpha\nbeta' },
      {
        analyze: jest.fn(),
        defaultWorkspaceRoot: async () => os.tmpdir(),
        findRipgrep: async () => undefined,
      },
    );
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('must be one line');
  });

  it('infers regex mode only from regex syntax that compiles', () => {
    for (const pattern of [
      'a|b',
      '\\bword\\b',
      '\\d+',
      '[a-z]+',
      '[^"]',
      '(?:x)',
      '(ab)+',
      'foo.*bar',
      '^export',
      'end$',
      'x{2,3}',
    ]) {
      expect([pattern, inferRegexMode(pattern)]).toEqual([pattern, true]);
    }
    for (const pattern of [
      'foo.bar',
      'foo(',
      'check(n)',
      'arr[0]',
      'a?.b',
      'x + y',
      'a\\|b',
      '(a|',
      'x || y',
      '|leading',
      'A | B',
      'foo(?=bar)',
      'x(?<!y)z',
      '(a)\\1',
      'C:\\dev\\src',
    ]) {
      expect([pattern, inferRegexMode(pattern)]).toEqual([pattern, false]);
    }
  });

  it('hands an inferred regex to rg as a regex', () => {
    const request = { ...base, pattern: 'a|b', regex: inferRegexMode('a|b') };
    expect(buildRipgrepArgs(request, 'src')).not.toContain('--fixed-strings');
  });

  it('uses smart case', () => {
    expect(isCaseInsensitive('abc', undefined)).toBe(true);
    expect(isCaseInsensitive('aBc', undefined)).toBe(false);
    expect(isCaseInsensitive('abc', true)).toBe(false);
  });
});
