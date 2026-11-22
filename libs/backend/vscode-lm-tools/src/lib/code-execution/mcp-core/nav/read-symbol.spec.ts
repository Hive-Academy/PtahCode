import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AstCodeInsights } from '../../types';
import { handleReadSymbol, type ReadSymbolDeps } from './read-symbol';
import { READ_SYMBOL_MAX_CHARS } from './read-symbol.limits';

// The real formatter module pulls in the whole routing stack; its contract
// (one `path: message` entry per issue) is all this spec needs.
jest.mock('../route-tool-handlers', () => ({
  describeZodIssues: (error: {
    issues: { path: unknown[]; message: string }[];
  }) =>
    error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; '),
}));

jest.mock('@ptah-extension/workspace-intelligence', () => ({
  EXTENSION_LANGUAGE_MAP: { '.ts': 'typescript', '.py': 'python' },
}));

const SOURCE = [
  'import { x } from "y";', // 1
  '', // 2
  '/**', // 3
  ' * Says hello.', // 4
  ' */', // 5
  'export function greet(name: string) {', // 6
  '  return `hi ${name}`;', // 7
  '}', // 8
  '', // 9
  'export class Store {', // 10
  '  @Input()', // 11
  '  load(id: string) {', // 12
  '    return id;', // 13
  '  }', // 14
  '}', // 15
  '', // 16
  'export class Cache {', // 17
  '  load(key: string) {', // 18
  '    return key;', // 19
  '  }', // 20
  '}', // 21
].join('\n');

/** 0-based ranges, as tree-sitter reports them. */
const OUTLINE: AstCodeInsights = {
  file: 'src/a.ts',
  language: 'typescript',
  functions: [
    { name: 'greet', parameters: ['name'], startLine: 5, endLine: 7 },
    { name: 'load', parameters: ['id'], startLine: 11, endLine: 13 },
    { name: 'load', parameters: ['key'], startLine: 17, endLine: 19 },
  ],
  classes: [
    { name: 'Store', startLine: 9, endLine: 14 },
    { name: 'Cache', startLine: 16, endLine: 20 },
  ],
  imports: [],
  exports: [],
} as unknown as AstCodeInsights;

describe('handleReadSymbol', () => {
  let root: string;
  let outside: string;
  let deps: ReadSymbolDeps & {
    analyze: jest.Mock;
    defaultWorkspaceRoot: jest.Mock;
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'read-symbol-'));
    outside = await mkdtemp(path.join(os.tmpdir(), 'read-symbol-out-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'a.ts'), SOURCE + '\n');
    await writeFile(
      path.join(root, 'notes.txt'),
      Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n'),
    );
    await writeFile(path.join(outside, 'secret.ts'), 'export const s = 1;\n');
    deps = {
      analyze: jest.fn().mockResolvedValue(OUTLINE),
      defaultWorkspaceRoot: jest.fn().mockResolvedValue(root),
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('returns a named declaration with its doc comment and a relative header', async () => {
    const reply = await handleReadSymbol(
      { file: 'src/a.ts', name: 'greet' },
      deps,
    );
    expect(reply.isError).toBe(false);
    const lines = reply.text.split('\n');
    expect(lines[0]).toBe('src/a.ts:3-8 function greet');
    expect(lines[1]).toBe('3| /**');
    expect(lines).toContain('6| export function greet(name: string) {');
    expect(lines[lines.length - 1]).toBe('8| }');
    expect(reply.text).not.toContain(root);
  });

  it('points to ptah_grep and the range form when the name is not a function or class', async () => {
    const reply = await handleReadSymbol(
      { file: 'src/a.ts', name: 'StoreOptions' },
      deps,
    );
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain('No declaration named "StoreOptions"');
    expect(reply.text).toContain('ptah_grep');
    expect(reply.text).toContain('startLine/endLine');
  });

  it('lists the candidates when startLine overlaps none of them', async () => {
    const reply = await handleReadSymbol(
      { file: 'src/a.ts', name: 'load', startLine: 1, endLine: 2 },
      deps,
    );
    expect(reply.text).toContain('2 declarations named "load"');
  });

  it('accepts an absolute file path and still prints it relative', async () => {
    const reply = await handleReadSymbol(
      { file: path.join(root, 'src', 'a.ts'), name: 'Store' },
      deps,
    );
    expect(reply.text.split('\n')[0]).toBe('src/a.ts:10-15 class Store');
  });

  it('resolves a qualified name and includes decorator lines', async () => {
    const reply = await handleReadSymbol(
      { file: 'src/a.ts', name: 'Store.load' },
      deps,
    );
    const lines = reply.text.split('\n');
    expect(lines[0]).toBe('src/a.ts:11-14 method Store.load');
    expect(lines[1]).toBe('11|   @Input()');
  });

  it('lists ambiguous matches without bodies', async () => {
    const reply = await handleReadSymbol(
      { file: 'src/a.ts', name: 'load' },
      deps,
    );
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain('2 declarations named "load"');
    expect(reply.text).toContain('pass startLine/endLine or kind to choose');
    expect(reply.text).toContain('src/a.ts:12-14 method Store.load load(id)');
    expect(reply.text).toContain('src/a.ts:18-20 method Cache.load load(key)');
    expect(reply.text).not.toContain('return id;');
  });

  it('chooses among ambiguous matches by startLine', async () => {
    const reply = await handleReadSymbol(
      { file: 'src/a.ts', name: 'load', startLine: 19 },
      deps,
    );
    expect(reply.text.split('\n')[0]).toBe('src/a.ts:18-20 method Cache.load');
  });

  it('reports a missing name with the closest declared names', async () => {
    const reply = await handleReadSymbol(
      { file: 'src/a.ts', name: 'gree' },
      deps,
    );
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain('No declaration named "gree" in src/a.ts.');
    expect(reply.text).toContain('Closest names: greet');
  });

  it('filters by kind', async () => {
    const reply = await handleReadSymbol(
      { file: 'src/a.ts', name: 'greet', kind: 'class' },
      deps,
    );
    expect(reply.text).toContain('No declaration named "greet" of kind class');
  });

  it('reads a line range', async () => {
    const reply = await handleReadSymbol(
      { file: 'notes.txt', startLine: 9, endLine: 11 },
      deps,
    );
    expect(reply.isError).toBe(false);
    expect(reply.text).toBe(
      [
        'notes.txt:9-11 (500 lines)',
        ' 9| line 9',
        '10| line 10',
        '11| line 11',
      ].join('\n'),
    );
    expect(deps.analyze).not.toHaveBeenCalled();
  });

  it('clamps endLine to the file length and says so', async () => {
    const reply = await handleReadSymbol(
      { file: 'notes.txt', startLine: 499, endLine: 900 },
      deps,
    );
    const lines = reply.text.split('\n');
    expect(lines[0]).toBe('notes.txt:499-500 (500 lines)');
    expect(lines[1]).toContain('clamped');
    expect(lines[lines.length - 1]).toBe('500| line 500');
  });

  it('cuts at maxLines and names the continuation', async () => {
    const reply = await handleReadSymbol(
      { file: 'notes.txt', startLine: 1, endLine: 50, maxLines: 10 },
      deps,
    );
    const lines = reply.text.split('\n');
    expect(lines).toContain('10| line 10');
    expect(reply.text).not.toContain('line 11\n');
    expect(lines[lines.length - 1]).toBe(
      '… 40 more lines; call again with startLine=11 endLine=50',
    );
  });

  it('defaults the range to maxLines lines', async () => {
    const reply = await handleReadSymbol(
      { file: 'notes.txt', startLine: 1 },
      deps,
    );
    expect(reply.text.split('\n')[0]).toBe('notes.txt:1-200 (500 lines)');
  });

  it('cuts on a line boundary at the character cap', async () => {
    const long = Array.from({ length: 300 }, () => 'x'.repeat(100)).join('\n');
    await writeFile(path.join(root, 'wide.txt'), long);
    const reply = await handleReadSymbol(
      { file: 'wide.txt', startLine: 1, endLine: 300, maxLines: 400 },
      deps,
    );
    expect(reply.text.length).toBeLessThanOrEqual(READ_SYMBOL_MAX_CHARS);
    const lines = reply.text.split('\n');
    expect(lines[lines.length - 1]).toMatch(
      /^… \d+ more lines; call again with startLine=\d+ endLine=300$/,
    );
    expect(lines[lines.length - 2]).toMatch(/\| x{100}$/);
  });

  it.each([
    [{ file: 'notes.txt', startLine: 5, endLine: 2 }, 'is after endLine'],
    [{ file: 'notes.txt', startLine: 0 }, 'startLine'],
    [{ file: 'notes.txt', startLine: -3 }, 'startLine'],
    [{ file: 'notes.txt', startLine: 600 }, 'past the end'],
    [{ file: 'notes.txt', startLine: 1, maxLines: 401 }, 'maxLines'],
    [{ file: 'notes.txt' }, 'pass "name"'],
    [{ file: 'notes.txt', startLine: 1, extra: true }, 'extra'],
  ])('rejects bad arguments %j', async (args, message) => {
    const reply = await handleReadSymbol(args, deps);
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain(message);
  });

  it('refuses a path that escapes the workspace root', async () => {
    const reply = await handleReadSymbol(
      { file: path.join(outside, 'secret.ts'), startLine: 1 },
      deps,
    );
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('outside the workspace root');
  });

  it('refuses a symlink that points outside the workspace root', async () => {
    await symlink(path.join(outside, 'secret.ts'), path.join(root, 'link.ts'));
    const reply = await handleReadSymbol({ file: 'link.ts', name: 's' }, deps);
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('outside the workspace root');
    expect(deps.analyze).not.toHaveBeenCalled();
  });

  (process.platform === 'win32' ? it.skip : it)(
    'refuses a FIFO instead of blocking on it',
    async () => {
      const { execFileSync } = await import('node:child_process');
      execFileSync('mkfifo', [path.join(root, 'pipe.ts')]);
      const reply = await handleReadSymbol(
        { file: 'pipe.ts', startLine: 1 },
        deps,
      );
      expect(reply.isError).toBe(true);
      expect(reply.text).toContain('not a regular file');
    },
  );

  it('refuses a relative path with .. segments', async () => {
    const reply = await handleReadSymbol(
      { file: `../${path.basename(outside)}/secret.ts`, startLine: 1 },
      deps,
    );
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('outside the workspace root');
  });

  it('reports a missing file as a tool error', async () => {
    const reply = await handleReadSymbol({ file: 'nope.ts', name: 'x' }, deps);
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('path not found: nope.ts');
  });

  it('explains the name form is unavailable for an unsupported language', async () => {
    const reply = await handleReadSymbol(
      { file: 'notes.txt', name: 'x' },
      deps,
    );
    expect(reply.isError).toBe(false);
    expect(reply.text).toContain(
      'Symbol lookup is not available for .txt files',
    );
    expect(reply.text).toContain('startLine/endLine');
    expect(deps.analyze).not.toHaveBeenCalled();
  });

  it('uses an explicit workspaceRoot over the default', async () => {
    deps.defaultWorkspaceRoot.mockResolvedValue(outside);
    const reply = await handleReadSymbol(
      { file: 'notes.txt', startLine: 1, endLine: 1, workspaceRoot: root },
      deps,
    );
    expect(reply.text).toBe('notes.txt:1-1 (500 lines)\n1| line 1');
  });

  it('asks for workspaceRoot when no workspace is open', async () => {
    deps.defaultWorkspaceRoot.mockResolvedValue(undefined);
    const reply = await handleReadSymbol(
      { file: 'notes.txt', startLine: 1 },
      deps,
    );
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain('workspaceRoot');
  });
});
