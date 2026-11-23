// The workspace-intelligence barrel (the language registry) loads tsyringe.
import 'reflect-metadata';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AstCodeInsights } from '../types';
import {
  buildCodeNamespace,
  type CodeNamespaceDependencies,
} from './code-namespace.builder';

// route-tool-handlers pulls in the markdown reducers; only describeZodIssues is used.
jest.mock('../mcp-core/route-tool-handlers', () => ({
  describeZodIssues: (error: {
    issues: { path: unknown[]; message: string }[];
  }) =>
    error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; '),
}));

const EMPTY_OUTLINE = {
  file: 'a.ts',
  language: 'typescript',
  functions: [],
  classes: [],
  imports: [],
  exports: [],
} as unknown as AstCodeInsights;

describe('ptah.code.grep and ptah.code.readSymbol (Code Mode nav wrappers)', () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'code-nav-')));
    await mkdir(path.join(root, 'src'));
    await writeFile(
      path.join(root, 'src', 'a.ts'),
      ['const one = 1;', 'const clampTail = 2;', 'const three = 3;'].join(
        '\n',
      ) + '\n',
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeNamespace(over: Partial<CodeNamespaceDependencies> = {}) {
    return buildCodeNamespace({
      getMemorySearch: () => undefined,
      getSymbolIndexer: () => undefined,
      getWorkspaceRoot: () => root,
      getHostWorkspaceRoots: () => [root],
      getNavWorkspaceRoot: () => root,
      analyze: jest.fn().mockResolvedValue(EMPTY_OUTLINE),
      logger: { warn: jest.fn() },
      ...over,
    });
  }

  it('grep returns the ptah_grep text for the session workspace', async () => {
    const text = await makeNamespace().grep({ pattern: 'clampTail' });

    expect(text).toMatch(/^1 match in 1 file \(engine: (rg|git|node)\)/);
    expect(text).toContain('src/a.ts');
  });

  it('readSymbol returns the ptah_read_symbol text for a line range', async () => {
    const text = await makeNamespace().readSymbol({
      file: 'src/a.ts',
      startLine: 2,
      endLine: 2,
    });

    expect(text).toContain('const clampTail = 2;');
    expect(text).not.toContain('const one');
  });

  it('throws the tool error text when the call is invalid', async () => {
    await expect(makeNamespace().grep({ pattern: 'a\nb' })).rejects.toThrow(
      /invalid ptah_grep arguments/,
    );
  });

  it('refuses workspaceRoot: a Code Mode call has no containment check', async () => {
    const ns = makeNamespace();
    const withRoot = { pattern: 'x', workspaceRoot: os.tmpdir() };

    await expect(ns.grep(withRoot)).rejects.toThrow(/workspaceRoot/);
    await expect(
      ns.readSymbol({ file: 'src/a.ts', ...{ workspaceRoot: os.tmpdir() } }),
    ).rejects.toThrow(/workspaceRoot/);
  });

  it('refuses a root that is not inside an open folder of the host', async () => {
    const ns = makeNamespace({ getHostWorkspaceRoots: () => [os.tmpdir()] });
    const elsewhere = makeNamespace({
      getHostWorkspaceRoots: () => [path.join(root, 'src')],
    });

    // `root` lies inside the tmp dir: allowed. A sibling-only host root: refused.
    await expect(ns.grep({ pattern: 'clampTail' })).resolves.toContain(
      'src/a.ts',
    );
    await expect(elsewhere.grep({ pattern: 'clampTail' })).rejects.toThrow(
      /not an open folder/,
    );
  });

  it('reads workspaceRoot once: a getter cannot show a different value later', async () => {
    let reads = 0;
    const args = {
      pattern: 'clampTail',
      get workspaceRoot() {
        reads += 1;
        return reads === 1 ? undefined : os.tmpdir();
      },
    };

    // The one read gives undefined: the call runs in the session root, and
    // the handler never sees the second, different value.
    await expect(makeNamespace().grep(args)).resolves.toContain('src/a.ts');
    expect(reads).toBe(1);
  });

  it('throws when no workspace is open instead of searching another folder', async () => {
    const ns = makeNamespace({ getNavWorkspaceRoot: () => undefined });

    await expect(ns.grep({ pattern: 'clampTail' })).rejects.toThrow(
      /no workspace is open/,
    );
  });

  it('throws a clear error when the host gives no outline source', async () => {
    const ns = makeNamespace({ analyze: undefined });

    await expect(ns.grep({ pattern: 'clampTail' })).rejects.toThrow(
      /not available in this host/,
    );
  });
});
