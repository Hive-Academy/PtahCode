import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleInspect, type InspectDeps } from './inspect';
import { applyToolResultBudget } from '../tool-result-budget';

jest.mock('../route-tool-handlers', () => ({
  describeZodIssues: (error: { issues: { path: unknown[]; message: string }[] }) =>
    error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; '),
}));

jest.mock('@ptah-extension/workspace-intelligence', () => ({
  EXTENSION_LANGUAGE_MAP: { '.ts': 'typescript' },
  DEFAULT_WORKSPACE_EXCLUDES: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/.ptah/specs/**', '**/.svn/**', '**/.hg/**', '**/out/**', '**/.nx/**'],
}));

describe('handleInspect', () => {
  let root: string;
  let deps: InspectDeps;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ptah-inspect-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'note.txt'), 'alpha\nbeta\n');
    deps = {
      analyze: async () => { throw new Error('AST analysis was not expected'); },
      defaultWorkspaceRoot: async () => root,
      runGit: async (args) => args.join(' '),
    };
  });

  afterEach(async () => rm(root, { recursive: true, force: true }));

  it('runs read, grep, list and fixed git ops in input order', async () => {
    const reply = await handleInspect({ ops: [
      { op: 'read', file: 'src/note.txt', startLine: 1, maxLines: 1 },
      { op: 'grep', pattern: 'alpha', path: 'src' },
      { op: 'list', pattern: '**/*.txt' },
      { op: 'git', action: 'status' },
    ] }, deps);
    expect(reply.isError).toBe(false);
    expect(reply.text.indexOf('## 1 read')).toBeLessThan(reply.text.indexOf('## 2 grep'));
    expect(reply.text).toContain('## 3 list');
    expect(reply.text).toContain('## 4 git status');
  });

  it('continues after a failed operation and rejects a fully failed batch', async () => {
    const partial = await handleInspect({ ops: [{ op: 'unknown' }, { op: 'git', action: 'branch' }] }, deps);
    expect(partial.isError).toBe(false);
    expect(partial.text).toContain('ERROR op #1');
    const failed = await handleInspect({ ops: [{ op: 'read', file: '../outside', startLine: 1 }] }, deps);
    expect(failed.isError).toBe(true);
  });

  it('rejects unsafe git refs, unknown operation keys, too many ops and outside roots', async () => {
    for (const base of ['--output=x', '-c', 'a b', 'a;b']) {
      const reply = await handleInspect({ ops: [{ op: 'git', action: 'diff_stat', base }] }, deps);
      expect(reply.isError).toBe(true);
    }
    const extra = await handleInspect({ ops: [{ op: 'read', file: 'src/note.txt', startLine: 1, surprise: true }] }, deps);
    expect(extra.text).toContain('valid keys');
    expect((await handleInspect({ ops: Array.from({ length: 9 }, () => ({ op: 'git', action: 'status' })) }, deps)).isError).toBe(true);
    expect((await handleInspect({ workspaceRoot: os.tmpdir(), ops: [{ op: 'git', action: 'status' }] }, deps)).isError).toBe(true);
  });

  it('runs git with a fixed argument array and reports timeout errors as partial failures', async () => {
    const spy = jest.fn(async (args: readonly string[]) => args.join(' '));
    const reply = await handleInspect({ ops: [{ op: 'git', action: 'diff_stat', base: 'main' }] }, { ...deps, runGit: spy });
    expect(spy).toHaveBeenCalledWith(['diff', '--stat', '--relative', 'main...HEAD', '--', '.'], expect.any(String));
    expect(reply.text).toContain('diff --stat --relative main...HEAD -- .');
    const timeout = await handleInspect({ ops: [{ op: 'git', action: 'status' }] }, { ...deps, runGit: async () => { throw new Error('timed out'); } });
    expect(timeout.text).toContain('timed out');
  });

  it('accepts existing read and grep aliases and contains operation paths', async () => {
    const alias = await handleInspect({ ops: [
      { op: 'read', file_path: 'src/note.txt', offset: 2, limit: 1 },
      { op: 'grep', pattern: 'alpha', path: '../' },
    ] }, deps);
    expect(alias.text).toContain('beta');
    expect(alias.text).toContain('resolves outside');
    const traversingRead = await handleInspect({ ops: [{ op: 'read', file: '../outside.txt', startLine: 1 }] }, deps);
    expect(traversingRead.isError).toBe(true);
  });

  it('adds continuation footers when an operation or the batch is cut', async () => {
    const largeDeps = { ...deps, listFiles: async (_pattern: string, limit: number, _root: string) => Array.from({ length: limit }, (_, index) => `${index}-${'x'.repeat(40)}`) };
    const section = await handleInspect({ ops: [{ op: 'list', pattern: '**/*', limit: 200 }] }, largeDeps);
    expect(section.text).toContain('section cut; continue');
    const total = await handleInspect({ ops: Array.from({ length: 8 }, () => ({ op: 'list', pattern: '**/*', limit: 200 })) }, largeDeps);
    expect(total.text).toContain('result cut; continue');
  });

  it('rejects zero and more than eight operations and reports unknown operation keys', async () => {
    expect((await handleInspect({ ops: [] }, deps)).isError).toBe(true);
    expect((await handleInspect({ ops: Array.from({ length: 9 }, () => ({ op: 'git', action: 'status' })) }, deps)).isError).toBe(true);
    const unknownOp = await handleInspect({ ops: [{ op: 'wat' }] }, deps);
    expect(unknownOp.isError).toBe(true);
    expect(unknownOp.text).toContain('valid op keys');
    const unknownKey = await handleInspect({ ops: [{ op: 'list', pattern: '*', surprise: true }] }, deps);
    expect(unknownKey.text).toContain('valid keys');
  });

  it('rejects more than eight operations', async () => {
    expect((await handleInspect({ ops: Array.from({ length: 9 }, () => ({ op: 'git', action: 'status' })) }, deps)).isError).toBe(true);
  });
  it('rejects zero operations', async () => {
    expect((await handleInspect({ ops: [] }, deps)).isError).toBe(true);
  });
  it('reports unknown operation names and valid alternatives', async () => {
    const reply = await handleInspect({ ops: [{ op: 'wat' }] }, deps);
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('valid op keys');
  });
  it('reports valid keys for an unknown operation key', async () => {
    const reply = await handleInspect({ ops: [{ op: 'list', pattern: '*', extra: true }] }, deps);
    expect(reply.text).toContain('valid keys');
  });
  it('returns an error when all operations fail', async () => {
    expect((await handleInspect({ ops: [{ op: 'read', file: '../outside', startLine: 1 }] }, deps)).isError).toBe(true);
  });

  it('validates git base values and action scope without spawning git', async () => {
    const runGit = jest.fn(async () => 'unexpected');
    for (const base of ['--output=x', '-c core.pager=x', 'a b', 'a;b', '-main']) {
      const reply = await handleInspect({ ops: [{ op: 'git', action: 'diff_stat', base }] }, { ...deps, runGit });
      expect(reply.isError).toBe(true);
    }
    const wrongAction = await handleInspect({ ops: [{ op: 'git', action: 'status', base: 'main' }] }, { ...deps, runGit });
    expect(wrongAction.isError).toBe(true);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('clamps oversized git log limits and preserves input order when operations finish out of order', async () => {
    const runGit = jest.fn(async (args: readonly string[]) => args.join(' '));
    const delayed = { ...deps, runGit, listFiles: async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return ['later']; } };
    const reply = await handleInspect({ ops: [
      { op: 'list', pattern: '*' },
      { op: 'git', action: 'log', limit: 200 },
    ] }, delayed);
    expect(runGit).toHaveBeenCalledWith(['log', '--oneline', '-n', '20', '--', '.'], expect.any(String));
    expect(reply.text.indexOf('## 1 list')).toBeLessThan(reply.text.indexOf('## 2 git log'));
  });

  it('normalizes read and grep aliases and rejects traversal paths', async () => {
    const reply = await handleInspect({ ops: [
      { op: 'read', file_path: 'src/note.txt', offset: 2, limit: 1 },
      { op: 'grep', pattern: 'beta', path: 'src', head_limit: 1, type: 'txt' },
      { op: 'read', file: '../escape.txt' },
      { op: 'grep', pattern: 'beta', path: '../' },
    ] }, deps);
    expect(reply.text).toContain('beta');
    expect(reply.text).toContain('resolves outside');
    expect(reply.text).toContain('ERROR op #3');
    expect(reply.text).toContain('ERROR op #4');
    const outside = await handleInspect({ workspaceRoot: os.tmpdir(), ops: [{ op: 'git', action: 'status' }] }, deps);
    expect(outside.isError).toBe(true);
  });

  it.each([
    '..', './../x', 'sub/../../x', '..\\x', '.\\./outside/*.ts',
    '**/../../x', 'src/**/..', '{..,src}/*.ts', '[.][.]/x',
    'C:/x/*.ts', 'C:\\x\\*.ts', 'c:x', '\\\\server\\share\\*',
    '//server/share/*', '/etc/*', 'a\0b/*.ts',
  ])('rejects unsafe list pattern %s before listing', async (pattern) => {
    const reply = await handleInspect({ ops: [{ op: 'list', pattern }] }, deps);
    expect(reply.text).toMatch(/relative glob|NUL|\.\. segment|walk base/);
  });

  it('uses the normalized read alias values in the section header', async () => {
    const reply = await handleInspect({ ops: [{ op: 'read', file_path: 'src/note.txt', offset: 2, limit: 1 }] }, deps);
    expect(reply.text).toContain('## 1 read src/note.txt:2-2');
  });

  it('lists bounded workspace glob paths with correct empty and continuation output', async () => {
    const one = await handleInspect({ ops: [{ op: 'list', pattern: 'src/*.txt', limit: 1 }] }, deps);
    expect(one.text).toContain('src/note.txt');
    expect(one.text).not.toContain('## File Search');
    const empty = await handleInspect({ ops: [{ op: 'list', pattern: 'missing/*.txt' }] }, deps);
    expect(empty.text).toContain('No files matched.');
    await writeFile(path.join(root, 'src', 'second.txt'), 'second');
    const capped = await handleInspect({ ops: [{ op: 'list', pattern: 'src/*.txt', limit: 1 }] }, deps);
    expect(capped.text).toContain('more files');
  });

  it('uses the default workspace excludes for list walks', async () => {
    for (const folder of ['.git', 'node_modules', 'dist', 'build', '.nx']) {
      await mkdir(path.join(root, folder), { recursive: true });
      await writeFile(path.join(root, folder, 'hidden.ts'), 'ignored');
    }
    const reply = await handleInspect({ ops: [{ op: 'list', pattern: '**/*.ts' }] }, deps);
    expect(reply.text).not.toMatch(/(?:\.git|node_modules|dist|build|\.nx)\/hidden\.ts/);
  });

  (process.platform === 'win32' ? it.skip : it)('rejects a static list base symlink that resolves outside the workspace', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'ptah-inspect-outside-'));
    try {
      await writeFile(path.join(outside, 'secret.ts'), 'secret');
      await symlink(outside, path.join(root, 'external'));
      const reply = await handleInspect({ ops: [{ op: 'list', pattern: 'external/*.ts' }] }, deps);
      expect(reply.isError).toBe(true);
      expect(reply.text).toContain('outside the workspace root');
      const walked = await handleInspect({ ops: [{ op: 'list', pattern: '**/*.ts' }] }, deps);
      expect(walked.text).not.toContain('secret.ts');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  (process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0) ? it.skip : it)('reports partial and empty list results when directories cannot be read', async () => {
    const privateDir = path.join(root, 'private');
    await mkdir(privateDir);
    await writeFile(path.join(privateDir, 'hidden.ts'), 'hidden');
    await writeFile(path.join(root, 'src', 'visible.ts'), 'visible');
    await chmod(privateDir, 0);
    try {
      const partial = await handleInspect({ ops: [{ op: 'list', pattern: '**/*.ts' }] }, deps);
      expect(partial.text).toContain('src/visible.ts');
      expect(partial.text).toContain('incomplete: 1 directory could not be read');
      const empty = await handleInspect({ ops: [{ op: 'list', pattern: 'private/*.ts' }] }, deps);
      expect(empty.isError).toBe(true);
      expect(empty.text).toContain('incomplete: 1 directory could not be read');
    } finally {
      await chmod(privateDir, 0o700);
    }
  });

  it('keeps git status, diff stat, and log within a nested workspace root', async () => {
    const repository = path.join(root, 'repository');
    const workspace = path.join(repository, 'project');
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(repository, 'outside.txt'), 'initial');
    await writeFile(path.join(workspace, 'inside.txt'), 'initial');
    execFileSync('git', ['init', '-q'], { cwd: repository });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repository });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repository });
    execFileSync('git', ['add', '.'], { cwd: repository });
    execFileSync('git', ['commit', '-qm', 'initial'], { cwd: repository });
    await writeFile(path.join(repository, 'outside.txt'), 'outside change');
    execFileSync('git', ['add', 'outside.txt'], { cwd: repository });
    execFileSync('git', ['commit', '-qm', 'outside only'], { cwd: repository });

    const runGit = async (args: readonly string[], cwd: string): Promise<string> =>
      execFileSync('git', [...args], { cwd, encoding: 'utf8' });
    const reply = await handleInspect({
      workspaceRoot: workspace,
      ops: [
        { op: 'git', action: 'status' },
        { op: 'git', action: 'diff_stat' },
        { op: 'git', action: 'log' },
      ],
    }, { ...deps, runGit });
    expect(reply.text).not.toContain('outside.txt');
    expect(reply.text).not.toContain('outside only');
    expect(reply.text).toContain('initial');
  });

  it.each([
    '**/*.ts', 'src/**/auth*', '*.spec.ts', '{a,b}/**/*.md',
    'app/\\[id\\]/*.tsx', 'docs/[a-c]*.md', 'file..name.ts', 'a/..b/c.ts',
  ])('forwards accepted list pattern %s unchanged to bounded search', async (pattern) => {
    const listFiles = jest.fn().mockResolvedValue([]);
    const reply = await handleInspect({ ops: [{ op: 'list', pattern }] }, { ...deps, listFiles });
    expect(reply.isError).toBe(false);
    expect(listFiles).toHaveBeenCalledWith(pattern, 51, root);
  });

  it('accepts a second registered workspace root', async () => {
    const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'ptah-inspect-root-b-'));
    try {
      const multiRootDeps = { ...deps, allowedWorkspaceRoots: async () => [root, secondRoot] };
      const reply = await handleInspect({ workspaceRoot: secondRoot, ops: [{ op: 'git', action: 'status' }] }, multiRootDeps);
      expect(reply.text).toContain(`root=${secondRoot}`);
      await writeFile(path.join(secondRoot, 'second.ts'), 'export const second = true;');
      const listReply = await handleInspect({ workspaceRoot: secondRoot, ops: [{ op: 'list', pattern: '*.ts' }] }, multiRootDeps);
      expect(listReply.text).toContain('second.ts');
    } finally {
      await rm(secondRoot, { recursive: true, force: true });
    }
  });

  it('rejects non-finite read and grep aliases per operation and continues the batch', async () => {
    const reply = await handleInspect({ ops: [
      { op: 'read', file_path: 'src/note.txt', offset: 1, limit: Number.POSITIVE_INFINITY },
      { op: 'grep', pattern: 'alpha', head_limit: Number.NaN },
      { op: 'git', action: 'branch' },
    ] }, deps);
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain('ERROR op #1: alias "limit" must be a finite integer');
    expect(reply.text).toContain('ERROR op #2: alias "head_limit" must be a finite integer');
    expect(reply.text).toContain('## 3 git branch');
  });

  it.each([
    ['read limit', { op: 'read', file_path: 'src/note.txt', offset: 1, limit: Number.POSITIVE_INFINITY }, 'alias "limit"'],
    ['grep head_limit', { op: 'grep', pattern: 'alpha', head_limit: Number.NaN }, 'alias "head_limit"'],
  ])('fails only the operation with a non-finite %s alias', async (_label, invalidOp, message) => {
    const reply = await handleInspect({ ops: [invalidOp, { op: 'git', action: 'branch' }] }, deps);
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain(`ERROR op #1: ${message} must be a finite integer`);
    expect(reply.text).toContain('## 2 git branch');
  });

  it('keeps the inspect continuation footer through the result budget near the total cap', async () => {
    const source = `${Array.from({ length: 400 }, (_, index) => `export const row${index} = '${'x'.repeat(90)}';`).join('\n')}\n`;
    for (const name of ['large-a.ts', 'large-b.ts', 'large-c.ts', 'large-d.ts']) {
      await writeFile(path.join(root, 'src', name), source);
    }
    const reply = await handleInspect({ ops: ['large-a.ts', 'large-b.ts', 'large-c.ts', 'large-d.ts'].map((file) => ({ op: 'read', file: `src/${file}`, startLine: 1, maxLines: 400 })) }, deps);
    expect(reply.text).toContain('result cut; continue');
    expect(reply.text.match(/result cut; continue/g)).toHaveLength(1);
    const budgeted = await applyToolResultBudget({ text: reply.text, toolName: 'ptah_inspect', requestId: 991, spoolRoot: root });
    expect(budgeted.text).toMatch(/result cut; continue[^\n]*$/);
    expect(budgeted.text.match(/result cut; continue/g)).toHaveLength(1);
  });
});
