import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import fastGlob from 'fast-glob';
import { FileType } from '@ptah-extension/platform-core';
import {
  createMockFileSystemProvider,
  createMockTokenCounter,
} from '@ptah-extension/platform-core/testing';
import type { ISymbolSink } from '@ptah-extension/memory-contracts';
import type { Logger } from '@ptah-extension/vscode-core';
import type { AstAnalysisService } from '../ast/ast-analysis.service';
import { FileTypeClassifierService } from '../context-analysis/file-type-classifier.service';
import { IgnorePatternResolverService } from '../file-indexing/ignore-pattern-resolver.service';
import { PatternMatcherService } from '../file-indexing/pattern-matcher.service';
import { WorkspaceIndexerService } from '../file-indexing/workspace-indexer.service';
import { CodeSymbolIndexer } from './code-symbol-indexer.service';
import { FileSystemService } from './file-system.service';
import { TokenCounterService } from './token-counter.service';

jest.mock('../ast/wasm-bundle-dir', () => ({
  BUNDLE_DIR: '/mock/bundle/dir',
  resolveWasmPath: (filename: string) => `/mock/bundle/dir/wasm/${filename}`,
}));

describe('code symbol index scope on disk', () => {
  let root: string;
  let indexer: CodeSymbolIndexer;
  let rows: Map<string, Set<string>>;
  let provider: ReturnType<typeof createMockFileSystemProvider>;
  let replace: jest.MockedFunction<ISymbolSink['replaceFileSymbols']>;
  let logger: Logger;
  let outside: string | null;

  function file(relative: string): string {
    return path.join(root, relative).replaceAll('\\', '/');
  }

  async function write(
    relative: string,
    content = 'function f() {}',
  ): Promise<void> {
    const destination = file(relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }

  beforeEach(async () => {
    root = (
      await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-b3-scope-'))
    ).replaceAll('\\', '/');
    provider = createMockFileSystemProvider();
    provider.findFiles.mockImplementation((pattern, ignore, _limit, cwd) =>
      fastGlob(pattern, {
        ignore,
        cwd,
        absolute: true,
        onlyFiles: true,
        dot: true,
      }),
    );
    provider.readFile.mockImplementation((filePath) =>
      fs.readFile(filePath, 'utf8'),
    );
    provider.exists.mockImplementation(async (filePath) => {
      await fs.access(filePath);
      return true;
    });
    provider.stat.mockImplementation(async (filePath) => {
      const stats = await fs
        .stat(filePath)
        .catch((error: NodeJS.ErrnoException) => {
          // Native fs errors cross Jest's VM boundary. Keep errno in this realm
          // so FileSystemService can retain it as the cause.
          throw Object.assign(new Error(error.message), { code: error.code });
        });
      return {
        type: stats.isFile() ? FileType.File : FileType.Directory,
        mtime: stats.mtimeMs,
        ctime: stats.ctimeMs,
        size: stats.size,
      };
    });
    provider.readDirectory.mockImplementation(async (directory) => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.isFile() ? FileType.File : FileType.Directory,
      }));
    });
    provider.realpath.mockImplementation(async (filePath) => {
      const real = await fs
        .realpath(filePath)
        .catch((error: NodeJS.ErrnoException) => {
          throw Object.assign(new Error(error.message), { code: error.code });
        });
      return real.replaceAll('\\', '/');
    });
    provider.lstat.mockImplementation(async (filePath) => {
      const stats = await fs
        .lstat(filePath)
        .catch((error: NodeJS.ErrnoException) => {
          throw Object.assign(new Error(error.message), { code: error.code });
        });
      return {
        type: stats.isSymbolicLink()
          ? FileType.SymbolicLink
          : stats.isFile()
            ? FileType.File
            : FileType.Directory,
        mtime: stats.mtimeMs,
        ctime: stats.ctimeMs,
        size: stats.size,
      };
    });
    outside = null;
    logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as Logger;
    const fileSystem = new FileSystemService(provider);
    const patternMatcher = new PatternMatcherService();
    const discovery = new WorkspaceIndexerService(
      fileSystem,
      patternMatcher,
      new IgnorePatternResolverService(fileSystem, patternMatcher),
      new FileTypeClassifierService(),
      new TokenCounterService(createMockTokenCounter()),
      provider,
      logger,
    );
    const ast = {
      isRuntimeUnavailable: () => false,
      analyzeSource: jest.fn().mockResolvedValue({
        isErr: () => false,
        value: { parseStatus: 'ok', functions: [{ name: 'f' }], classes: [] },
      }),
    } as unknown as AstAnalysisService;
    rows = new Map();
    replace = jest.fn(async (workspaceRoot, filePath, chunks) => {
      const rootRows = rows.get(workspaceRoot) ?? new Set<string>();
      rows.set(workspaceRoot, rootRows);
      if (chunks.length > 0) rootRows.add(filePath);
      else rootRows.delete(filePath);
    });
    const sink: ISymbolSink = {
      replaceFileSymbols: replace,
      insertSymbols: jest.fn(),
      deleteSymbolsForFile: (filePath, workspaceRoot) =>
        rows.get(workspaceRoot)?.delete(filePath) ? 1 : 0,
      purgeMissing: (workspaceRoot, present) => {
        const rootRows = rows.get(workspaceRoot);
        const keep = new Set(present);
        let deleted = 0;
        for (const filePath of rootRows ?? []) {
          if (!keep.has(filePath) && rootRows?.delete(filePath)) deleted++;
        }
        return deleted;
      },
    };
    indexer = new CodeSymbolIndexer(logger, ast, discovery, provider, sink);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    if (outside !== null)
      await fs.rm(outside, { recursive: true, force: true });
  });

  /** A directory outside the root, removed after the test. */
  async function outsideDir(): Promise<string> {
    outside = (
      await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-b3-outside-'))
    ).replaceAll('\\', '/');
    return outside;
  }

  /**
   * Creates a symlink (a junction for a directory on Windows). Answers false
   * where the platform or account cannot create one, so the test skips.
   */
  async function link(
    target: string,
    relative: string,
    kind: 'file' | 'dir',
  ): Promise<boolean> {
    const linkPath = file(relative);
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    try {
      await fs.symlink(
        target,
        linkPath,
        kind === 'dir'
          ? process.platform === 'win32'
            ? 'junction'
            : 'dir'
          : 'file',
      );
      return true;
    } catch {
      // EPERM without the symlink privilege on Windows: nothing to test here.
      return false;
    }
  }

  it('excludes harness paths, ignored files, and nested checkouts, and purges old excluded rows', async () => {
    const excluded = [
      '.ptah/analysis/x.ts',
      '.claude/skills/s/run.js',
      '.claude-worktrees/w/src/a.ts',
      'vendor-wt/b.ts',
      'generated-local/c.ts',
    ];
    for (const relative of ['src/a.ts', ...excluded]) await write(relative);
    await write('vendor-wt/.git', 'gitdir: /tmp/worktrees/vendor-wt\n');
    await write('.gitignore', 'generated-local/\n');
    rows.set(root, new Set([file('.claude/skills/s/run.js')]));

    await indexer.indexWorkspace(root);

    expect(rows.get(root)).toEqual(new Set([file('src/a.ts')]));
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockClear();
    for (const relative of excluded) {
      await expect(
        indexer.reindexFile(file(relative), root),
      ).resolves.toMatchObject({
        coverage: { excluded: 1 },
        symbolsIndexed: 0,
      });
    }
    expect(replace).not.toHaveBeenCalled();

    await expect(
      indexer.indexWorkspace(file('vendor-wt')),
    ).resolves.toMatchObject({
      filesScanned: 1,
    });
    expect(rows.get(file('vendor-wt'))).toEqual(
      new Set([file('vendor-wt/b.ts')]),
    );
  });

  it('observes a new ignore file and excludes a newly created source after warming the cache', async () => {
    await write('src/a.ts');
    await indexer.reindexFile(file('src/a.ts'), root);
    expect(replace).toHaveBeenCalledTimes(1);

    await write('.gitignore', 'generated-local/\n');
    await write('generated-local/new.ts');
    provider.readFile.mockClear();
    await expect(
      indexer.reindexFile(file('generated-local/new.ts'), root),
    ).resolves.toMatchObject({
      coverage: { excluded: 1 },
    });
    expect(provider.readFile).not.toHaveBeenCalledWith(
      file('generated-local/new.ts'),
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('purges JavaScript with a source twin and indexes lone or declaration-backed JavaScript', async () => {
    for (const relative of [
      'src/paired.js',
      'src/paired.ts',
      'src/lone.js',
      'src/types.js',
      'src/types.d.ts',
    ]) {
      await write(relative);
    }
    rows.set(root, new Set([file('src/paired.js')]));

    await indexer.indexWorkspace(root);

    const expected = new Set([
      file('src/paired.ts'),
      file('src/lone.js'),
      file('src/types.js'),
    ]);
    expect(rows.get(root)).toEqual(expected);
    expect(replace.mock.calls.map(([, filePath]) => filePath)).not.toContain(
      file('src/paired.js'),
    );
    replace.mockClear();
    await expect(
      indexer.reindexFile(file('src/paired.js'), root),
    ).resolves.toMatchObject({
      coverage: { excluded: 1 },
    });
    expect(replace).not.toHaveBeenCalled();
    await expect(
      indexer.reindexFile(file('src/lone.js'), root),
    ).resolves.toMatchObject({
      coverage: { analyzed: 1 },
    });
    expect(rows.get(root)).toEqual(expected);
  });

  it('rejects traversal outside the root and tolerates failed nested-repo and twin probes', async () => {
    await expect(
      indexer.reindexFile(`${root}/src/../../outside.ts`, root),
    ).resolves.toMatchObject({
      coverage: { excluded: 1 },
    });
    expect(provider.exists).not.toHaveBeenCalled();
    expect(provider.readFile).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    await write('src/unpaired.js');
    // The disk-backed probes reject with ENOENT for the missing .git and twins.
    await expect(
      indexer.reindexFile(file('src/unpaired.js'), root),
    ).resolves.toMatchObject({
      coverage: { analyzed: 1 },
    });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  describe('real-path containment', () => {
    const outsideWarning = expect.stringContaining(
      'outside the workspace root',
    );

    it('skips a file symlink that points outside the root', async () => {
      const elsewhere = await outsideDir();
      await fs.writeFile(path.join(elsewhere, 'secret.ts'), 'function s() {}');
      await write('src/a.ts');
      if (
        !(await link(
          path.join(elsewhere, 'secret.ts'),
          'src/secret.ts',
          'file',
        ))
      )
        return;

      const stats = await indexer.indexWorkspace(root);

      expect(rows.get(root)).toEqual(new Set([file('src/a.ts')]));
      expect(stats).toMatchObject({
        filesScanned: 1,
        filesSkippedOutsideRoot: 1,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        outsideWarning,
        expect.objectContaining({ count: 1, sample: [file('src/secret.ts')] }),
      );
      replace.mockClear();
      provider.readFile.mockClear();
      await expect(
        indexer.reindexFile(file('src/secret.ts'), root),
      ).resolves.toMatchObject({
        coverage: { excluded: 1 },
        symbolsIndexed: 0,
      });
      expect(provider.readFile).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    });

    it('skips the files of a directory symlink that points outside the root', async () => {
      const elsewhere = await outsideDir();
      await fs.writeFile(path.join(elsewhere, 'x.ts'), 'function x() {}');
      await fs.writeFile(path.join(elsewhere, 'y.ts'), 'function y() {}');
      await write('src/a.ts');
      if (!(await link(elsewhere, 'vendor', 'dir'))) return;

      const stats = await indexer.indexWorkspace(root);

      expect(rows.get(root)).toEqual(new Set([file('src/a.ts')]));
      expect(stats).toMatchObject({ filesSkippedOutsideRoot: 2 });
      await expect(
        indexer.reindexFile(file('vendor/x.ts'), root),
      ).resolves.toMatchObject({
        coverage: { excluded: 1 },
      });
    });

    it('indexes the target of a symlink inside the root once', async () => {
      await write('src/a.ts');
      if (!(await link('a.ts', 'src/alias.ts', 'file'))) return;

      const stats = await indexer.indexWorkspace(root);

      expect(rows.get(root)).toEqual(new Set([file('src/a.ts')]));
      expect(replace).toHaveBeenCalledTimes(1);
      expect(stats).toMatchObject({
        filesScanned: 1,
        filesSkippedOutsideRoot: 0,
      });

      replace.mockClear();
      await expect(
        indexer.reindexFile(file('src/alias.ts'), root),
      ).resolves.toMatchObject({
        coverage: { analyzed: 1 },
      });
      expect(replace.mock.calls.map(([, filePath]) => filePath)).toEqual([
        file('src/a.ts'),
      ]);
    });

    it('indexes the in-root target of a symlink whose target discovery did not list', async () => {
      // The target sits in a directory discovery excludes by name, so only the
      // link reaches it; the target must still pass the scope rules.
      await write('src/a.ts');
      await write('.ptah/analysis/hidden.ts');
      if (!(await link('../.ptah/analysis/hidden.ts', 'src/hidden.ts', 'file')))
        return;

      await indexer.indexWorkspace(root);

      expect(rows.get(root)).toEqual(new Set([file('src/a.ts')]));
    });

    it('skips a broken symlink', async () => {
      await write('src/a.ts');
      if (!(await link(file('src/missing.ts'), 'src/broken.ts', 'file')))
        return;

      await indexer.indexWorkspace(root);

      expect(rows.get(root)).toEqual(new Set([file('src/a.ts')]));
      replace.mockClear();
      provider.readFile.mockClear();
      await expect(
        indexer.reindexFile(file('src/broken.ts'), root),
      ).resolves.toMatchObject({
        coverage: { excluded: 1 },
        errors: 0,
      });
      expect(provider.readFile).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        outsideWarning,
        expect.objectContaining({
          file: file('src/broken.ts'),
          reason: 'broken-link',
        }),
      );
    });

    it('indexes a root that is itself a symlink, under the root spelling it was given', async () => {
      await write('real/src/a.ts');
      if (!(await link(file('real'), 'alias-root', 'dir'))) return;
      const aliasRoot = file('alias-root');

      const stats = await indexer.indexWorkspace(aliasRoot);

      expect(stats).toMatchObject({
        filesScanned: 1,
        filesSkippedOutsideRoot: 0,
      });
      expect(rows.get(aliasRoot)).toEqual(new Set([`${aliasRoot}/src/a.ts`]));
      await expect(
        indexer.reindexFile(`${aliasRoot}/src/a.ts`, aliasRoot),
      ).resolves.toMatchObject({ coverage: { analyzed: 1 } });
    });
  });
});
