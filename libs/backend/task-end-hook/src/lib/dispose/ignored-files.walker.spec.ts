import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isAllowListed, walkIgnored } from './ignored-files.walker';

const CAPS = { maxFiles: 100, maxBytes: 1_000_000 };

let root: string;

function write(relPath: string, content: string): void {
  const file = path.join(root, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-ignored-walk-'));
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('isAllowListed', () => {
  it('matches an allow-listed directory and its contents, nothing else', () => {
    expect(isAllowListed('node_modules')).toBe(true);
    expect(isAllowListed('node_modules/pkg/a.js')).toBe(true);
    expect(isAllowListed('node_modules_extra/a.js')).toBe(false);
    expect(isAllowListed('build/a.bin')).toBe(false);
  });
});

describe('walkIgnored', () => {
  it('lists ignored files and descends only into non-allow-listed directories', async () => {
    write('top.log', 'abc');
    write('build/sub/b.bin', '12345');
    write('node_modules/pkg/a.js', 'skipped');

    const result = await walkIgnored(
      root,
      [
        { relPath: 'top.log', isDirectory: false },
        { relPath: 'build', isDirectory: true },
        { relPath: 'node_modules', isDirectory: true },
      ],
      CAPS,
    );

    expect(result).toEqual({
      kind: 'ok',
      files: [
        { relPath: 'top.log', bytes: 3 },
        { relPath: 'build/sub/b.bin', bytes: 5 },
      ],
    });
  });

  it('stops at the file cap plus one as truncated', async () => {
    write('a.log', 'a');
    write('b.log', 'b');

    const result = await walkIgnored(
      root,
      [
        { relPath: 'a.log', isDirectory: false },
        { relPath: 'b.log', isDirectory: false },
      ],
      { maxFiles: 1, maxBytes: 1_000_000 },
    );

    expect(result).toEqual({ kind: 'truncated' });
  });

  it('maps an ignored file that vanished after git status to error (L3)', async () => {
    write('kept.log', 'x');

    const result = await walkIgnored(
      root,
      [
        { relPath: 'kept.log', isDirectory: false },
        { relPath: 'gone.log', isDirectory: false },
      ],
      CAPS,
    );

    expect(result).toEqual({ kind: 'error' });
  });

  it('maps an ignored directory that vanished after git status to error (L3)', async () => {
    const result = await walkIgnored(
      root,
      [{ relPath: 'gone-dir', isDirectory: true }],
      CAPS,
    );

    expect(result).toEqual({ kind: 'error' });
  });

  it('maps an entry that vanished between readdir and lstat to error', async () => {
    write('build/a.bin', 'a');
    const lstat = fs.promises.lstat;
    jest.spyOn(fs.promises, 'lstat').mockImplementation(async (target) => {
      if (String(target).endsWith(path.join('build', 'a.bin'))) {
        throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      }
      return lstat(target);
    });

    const result = await walkIgnored(
      root,
      [{ relPath: 'build', isDirectory: true }],
      CAPS,
    );

    expect(result).toEqual({ kind: 'error' });
  });

  it('maps an unreadable directory to error', async () => {
    write('build/a.bin', 'a');
    jest
      .spyOn(fs.promises, 'readdir')
      .mockRejectedValue(
        Object.assign(new Error('denied'), { code: 'EACCES' }),
      );

    const result = await walkIgnored(
      root,
      [{ relPath: 'build', isDirectory: true }],
      CAPS,
    );

    expect(result).toEqual({ kind: 'error' });
  });
});
