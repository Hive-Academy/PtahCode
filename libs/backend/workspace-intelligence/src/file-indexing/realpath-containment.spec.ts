import { FileType } from '@ptah-extension/platform-core';
import {
  containedIndexPath,
  resolveIndexPath,
  resolveRealRoot,
  type RealpathFileSystem,
} from './realpath-containment';

/** A file system whose real paths come from a table, as a junction resolves on win32. */
function tableFs(
  realPaths: Record<string, string>,
  links: readonly string[] = [],
): RealpathFileSystem {
  return {
    realpath: jest.fn(async (filePath: string) => {
      const real = realPaths[filePath];
      if (real === undefined) throw new Error(`ENOENT: ${filePath}`);
      return real;
    }),
    lstat: jest.fn(async (filePath: string) => ({
      type: links.includes(filePath) ? FileType.SymbolicLink : FileType.File,
      mtime: 0,
      ctime: 0,
      size: 0,
    })),
  };
}

describe('containedIndexPath', () => {
  it('compares win32 paths case-insensitively and spells the result from the lexical root', () => {
    expect(
      containedIndexPath(
        'C:/Work/Repo',
        'c:\\work\\repo',
        'C:\\WORK\\REPO\\src\\a.ts',
        'win32',
      ),
    ).toBe('C:/Work/Repo/src/a.ts');
  });

  it('rejects another drive, a sibling with the root as prefix, and the root itself on win32', () => {
    expect(
      containedIndexPath('C:/Repo', 'C:\\Repo', 'D:\\Repo\\a.ts', 'win32'),
    ).toBeNull();
    expect(
      containedIndexPath(
        'C:/Repo',
        'C:\\Repo',
        'C:\\Repo-other\\a.ts',
        'win32',
      ),
    ).toBeNull();
    expect(
      containedIndexPath('C:/Repo', 'C:\\Repo', 'c:\\repo', 'win32'),
    ).toBeNull();
  });

  it('compares posix paths case-sensitively', () => {
    expect(
      containedIndexPath('/repo', '/repo', '/Repo/a.ts', 'linux'),
    ).toBeNull();
    expect(containedIndexPath('/repo', '/repo', '/repo/a.ts', 'linux')).toBe(
      '/repo/a.ts',
    );
  });
});

describe('resolveIndexPath with an injected win32 realpath (junctions)', () => {
  const root = 'C:/Work/Repo';
  const realRoot = 'c:\\work\\repo';

  it('skips a junction whose target is outside the root', async () => {
    const fs = tableFs({ 'C:/Work/Repo/vendor/a.ts': 'D:\\shared\\a.ts' });
    await expect(
      resolveIndexPath('C:/Work/Repo/vendor/a.ts', root, realRoot, fs, 'win32'),
    ).resolves.toEqual({ kind: 'outside' });
  });

  it('maps a junction into the root onto the in-root path of its target', async () => {
    const fs = tableFs({
      'C:/Work/Repo/lib/x.ts': 'C:\\WORK\\REPO\\src\\x.ts',
    });
    await expect(
      resolveIndexPath('C:/Work/Repo/lib/x.ts', root, realRoot, fs, 'win32'),
    ).resolves.toEqual({ kind: 'inside', path: 'C:/Work/Repo/src/x.ts' });
  });

  it('keeps the exact spelling of an entry whose real path differs only in case', async () => {
    const fs = tableFs({
      'C:/Work/Repo/src/A.ts': 'c:\\work\\repo\\src\\a.ts',
    });
    await expect(
      resolveIndexPath('C:/Work/Repo/src/A.ts', root, realRoot, fs, 'win32'),
    ).resolves.toEqual({ kind: 'inside', path: 'C:/Work/Repo/src/A.ts' });
  });

  it('skips a dangling junction and keeps a non-link whose real path cannot be read', async () => {
    const fs = tableFs({}, ['C:/Work/Repo/dangling.ts']);
    await expect(
      resolveIndexPath('C:/Work/Repo/dangling.ts', root, realRoot, fs, 'win32'),
    ).resolves.toEqual({ kind: 'broken-link' });
    await expect(
      resolveIndexPath('C:/Work/Repo/gone.ts', root, realRoot, fs, 'win32'),
    ).resolves.toEqual({ kind: 'inside', path: 'C:/Work/Repo/gone.ts' });
  });
});

describe('resolveRealRoot', () => {
  it('answers the real path, or the root as given when it cannot be resolved', async () => {
    await expect(
      resolveRealRoot('/alias', tableFs({ '/alias': '/real' })),
    ).resolves.toBe('/real');
    await expect(resolveRealRoot('/missing', tableFs({}))).resolves.toBe(
      '/missing',
    );
  });
});
