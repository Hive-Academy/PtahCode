jest.mock('chokidar', () => ({ watch: jest.fn() }));
jest.mock('fs/promises', () => ({
  __esModule: true,
  ...jest.requireActual<typeof import('fs/promises')>('fs/promises'),
}));

import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CliFileSystemProvider } from './cli-file-system-provider';

describe('CliFileSystemProvider exclusive file handle', () => {
  let root: string;
  const provider = new CliFileSystemProvider();

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'ptah-exclusive-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('restores mode through the open handle and closes it', async () => {
    const file = join(root, 'stage');
    const handle = await fs.open(file, 'wx', 0o600);
    const open = jest.spyOn(fs, 'open').mockResolvedValueOnce(handle);
    const chmod = jest.spyOn(handle, 'chmod');
    const close = jest.spyOn(handle, 'close');
    const pathChmod = jest.spyOn(fs, 'chmod');
    await provider.writeFileExclusive(file, 'instructions', { mode: 0o660 });
    expect(open).toHaveBeenCalledWith(file, 'wx', 0o660);
    expect(chmod).toHaveBeenCalledWith(0o660);
    expect(pathChmod).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(file, 'utf8')).toBe('instructions');
  });

  it('preserves EEXIST without changing existing bytes or permissions', async () => {
    const file = join(root, 'existing');
    await fs.writeFile(file, 'original', { mode: 0o600 });
    const before = await fs.stat(file);
    await expect(provider.writeFileExclusive(file, 'replacement', { mode: 0o777 }))
      .rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readFile(file, 'utf8')).toBe('original');
    expect((await fs.stat(file)).mode).toBe(before.mode);
  });

  it.each(['writeFile', 'chmod'] as const)('closes the handle when %s fails and preserves the error', async (operation) => {
    const file = join(root, 'failure');
    const handle = await fs.open(file, 'wx', 0o600);
    jest.spyOn(fs, 'open').mockResolvedValueOnce(handle);
    const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    jest.spyOn(handle, operation).mockRejectedValueOnce(failure);
    const close = jest.spyOn(handle, 'close');
    await expect(provider.writeFileExclusive(file, 'instructions', { mode: 0o600 }))
      .rejects.toBe(failure);
    expect(close).toHaveBeenCalledTimes(1);
  });

  // POSIX mode bits and symlink replacement are not portable to Windows.
  (process.platform === 'win32' ? it.skip : it)(
    'does not chmod a symlink target swapped in after the write', async () => {
      const file = join(root, 'stage');
      const retained = join(root, 'retained');
      const target = join(root, 'target');
      await fs.writeFile(target, 'other instructions', { mode: 0o600 });
      await fs.chmod(target, 0o600);
      const handle = await fs.open(file, 'wx', 0o600);
      jest.spyOn(fs, 'open').mockResolvedValueOnce(handle);
      const write = handle.writeFile.bind(handle);
      jest.spyOn(handle, 'writeFile').mockImplementationOnce(async (content, options) => {
        await write(content, options);
        await fs.rename(file, retained);
        await fs.symlink(target, file);
      });
      await provider.writeFileExclusive(file, 'instructions', { mode: 0o660 });
      expect((await fs.stat(target)).mode & 0o777).toBe(0o600);
      expect((await fs.stat(retained)).mode & 0o777).toBe(0o660);
      expect(await fs.readFile(target, 'utf8')).toBe('other instructions');
      expect(await fs.readFile(retained, 'utf8')).toBe('instructions');
    },
  );
});

