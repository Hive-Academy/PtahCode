import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRegularFileUtf8 } from './read-regular-file';

// A FIFO is a POSIX special file; Windows has no path for one.
const posixIt = process.platform === 'win32' ? it.skip : it;

describe('readRegularFileUtf8', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'read-regular-file-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns the UTF-8 content of a regular file', async () => {
    const path = join(root, 'settings.local.json');
    await writeFile(path, '{"permissions":{"allow":["é"]}}', 'utf8');
    await expect(readRegularFileUtf8(path, 1024)).resolves.toBe('{"permissions":{"allow":["é"]}}');
  });

  it('accepts a file of exactly the limit and rejects one byte more with EFBIG', async () => {
    const atLimit = join(root, 'at-limit.json');
    const above = join(root, 'above.json');
    await writeFile(atLimit, 'a'.repeat(16), 'utf8');
    await writeFile(above, 'a'.repeat(17), 'utf8');
    await expect(readRegularFileUtf8(atLimit, 16)).resolves.toHaveLength(16);
    await expect(readRegularFileUtf8(above, 16)).rejects.toMatchObject({ code: 'EFBIG' });
  });

  it('keeps ENOENT for a missing path', async () => {
    await expect(readRegularFileUtf8(join(root, 'missing.json'), 1024)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a directory with a code other than ENOENT', async () => {
    const directory = join(root, 'settings.local.json');
    await mkdir(directory);
    const outcome = await readRegularFileUtf8(directory, 1024).then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error && 'code' in error ? error.code : 'no-code'),
    );
    expect(outcome).not.toBe('resolved');
    expect(outcome).not.toBe('ENOENT');
  });

  posixIt('rejects a FIFO with no writer at once and does not block', async () => {
    const fifo = join(root, 'settings.local.json');
    execFileSync('mkfifo', [fifo]);
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve('blocked'), 2000);
    });
    const read = readRegularFileUtf8(fifo, 1024).then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error && 'code' in error ? String(error.code) : 'no-code'),
    );
    try {
      await expect(Promise.race([read, limit])).resolves.toBe('EINVAL');
    } finally {
      clearTimeout(timer);
    }
  });
});
