import * as path from 'path';
import { FileType, type DirectoryEntry, type FileStat, type IFileSystemProvider } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import { normalizeWorkspaceRoot } from './normalize-workspace-root';
import { TaskIndexService } from './task-index.service';
import type { ITaskIndexStore } from './task-index.store';
import type { TaskScannerService } from './task-scanner.service';

const root = normalizeWorkspaceRoot(path.resolve('/workspace'));
const taskId = 'TASK_2026_123';
const taskPath = path.join(root, '.ptah', 'specs', taskId);
const sizeLimit = 1024 * 1024;

function fixture() {
  const directory = (type = FileType.Directory): FileStat => ({ type, size: 0, mtime: 0, ctime: 0 });
  const fs = {
    realpath: jest.fn(async (target: string) => target),
    lstat: jest.fn(async (_target: string): Promise<FileStat> => directory()),
    readDirectory: jest.fn(async (_target: string): Promise<DirectoryEntry[]> => []),
    readFileBoundedNoFollow: jest.fn(async (_target: string, _limit: number) => ({
      bytes: new TextEncoder().encode('safe'),
      truncated: false,
    })),
  };
  const index = new TaskIndexService(
    {} as Logger, fs as unknown as IFileSystemProvider, {} as TaskScannerService, {} as ITaskIndexStore,
  );
  async function open() {
    const opened = await index.openContainedTask(root, taskId);
    if (opened.state !== 'ready') throw new Error(opened.state);
    return opened.folder;
  }
  return { fs, index, open };
}

describe('ContainedTaskFolder', () => {
  it('leaves depth and size policies to the legacy entry points and rejects depth five without I/O', async () => {
    const { fs, index, open } = fixture();
    expect(await index.listFolderEntries(root, taskId, 'a/b/c/d/e')).toMatchObject({ state: 'rejected' });
    expect(fs.realpath).not.toHaveBeenCalled();
    expect(fs.lstat).not.toHaveBeenCalled();
    expect(fs.readDirectory).not.toHaveBeenCalled();

    for (const directory of ['a/b/c', 'a/b/c/d']) {
      expect(await index.listFolderEntries(root, taskId, directory)).toMatchObject({ state: 'ready' });
    }
    const folder = await open();
    expect(await folder.list(['a', 'b', 'c'], 2)).toEqual({ state: 'rejected' });

    const entries = Array.from({ length: 201 }, (_, n) => ({ name: String(n), type: FileType.File }));
    fs.readDirectory.mockResolvedValue(entries);
    expect(await folder.list([], 2)).toEqual({ state: 'ready', entries });
    expect(await index.listFolderEntries(root, taskId, '')).toMatchObject({ state: 'too_many' });

    expect(await index.readFolderMarkdown(root, taskId, 'notes.md')).toMatchObject({ state: 'directory' });
    fs.lstat.mockImplementation(async (target) => target.endsWith('notes.md')
      ? { type: FileType.File, size: sizeLimit + 1, ctime: 0, mtime: 0 }
      : { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 });
    expect(await index.readFolderMarkdown(root, taskId, 'notes.md')).toMatchObject({ state: 'too_large' });
    expect(fs.readFileBoundedNoFollow).not.toHaveBeenCalled();
    expect(await index.readFolderMarkdown(root, taskId, '../notes.md')).toMatchObject({ state: 'rejected' });

    fs.lstat.mockImplementation(async (target) => ({
      type: target.endsWith('notes.md') ? FileType.File : FileType.Directory, size: 4, ctime: 0, mtime: 0,
    }));
    fs.readFileBoundedNoFollow.mockResolvedValueOnce({ bytes: new Uint8Array([0]), truncated: true });
    expect(await index.readFolderMarkdown(root, taskId, 'notes.md')).toMatchObject({ state: 'too_large' });
  });

  it('rejects invalid task and child names and refuses directory and markdown symlinks', async () => {
    const { fs, index, open } = fixture();
    expect(await index.openContainedTask(root, '../outside')).toEqual({ state: 'rejected' });
    expect(fs.lstat).not.toHaveBeenCalled();
    const folder = await open();
    fs.lstat.mockResolvedValue({ type: FileType.SymbolicLink, size: 0, ctime: 0, mtime: 0 });
    expect(await index.openContainedTask(root, taskId)).toEqual({ state: 'rejected' });
    expect(await folder.list(['linked'], 2)).toEqual({ state: 'rejected' });
    expect(await folder.inspect('../notes.md')).toEqual({ state: 'rejected' });
    expect(await folder.list(['nested/child'], 2)).toEqual({ state: 'rejected' });
    for (const name of ['notes.md', 'NOTES.MD']) {
      expect(await folder.inspect(name)).toEqual({ state: 'other' });
      expect(await folder.read(name, 100)).toEqual({ state: 'rejected' });
    }
    expect(fs.readDirectory).not.toHaveBeenCalled();
    expect(fs.readFileBoundedNoFollow).not.toHaveBeenCalled();
  });

  it('discards a listing if its directory changes during enumeration', async () => {
    const { fs, open } = fixture();
    const folder = await open();
    fs.readDirectory.mockImplementationOnce(async () => {
      fs.realpath.mockImplementation(async (target) => target === taskPath ? path.resolve('/outside') : target);
      return [{ name: 'external.md', type: FileType.File }];
    });
    expect(await folder.list([], 2)).toEqual({ state: 'rejected' });
  });

  it.each(['parent', 'target'])('discards bounded bytes when the canonical %s changes during read', async (changed) => {
    const { fs, open } = fixture();
    const folder = await open();
    const target = path.join(taskPath, 'notes.md');
    fs.lstat.mockImplementation(async (p) => ({
      type: p === target ? FileType.File : FileType.Directory, size: 4, ctime: 0, mtime: 0,
    }));
    fs.readFileBoundedNoFollow.mockImplementationOnce(async () => {
      fs.realpath.mockImplementation(async (p) => p === (changed === 'parent' ? taskPath : target) ? path.resolve('/outside') : p);
      return { bytes: new TextEncoder().encode('safe'), truncated: false };
    });
    expect(await folder.read('notes.md', 100)).toEqual({ state: 'rejected' });
    expect(fs.readFileBoundedNoFollow).toHaveBeenCalledWith(target, 100);
  });

  it('propagates the no-follow provider identity rejection without exposing bytes or paths', async () => {
    const { fs, open } = fixture();
    const folder = await open();
    fs.lstat.mockResolvedValueOnce({ type: FileType.File, size: 4, ctime: 0, mtime: 0 });
    fs.readFileBoundedNoFollow.mockRejectedValueOnce(new Error(`File changed: ${taskPath}`));
    expect(await folder.read('notes.md', 100)).toEqual({ state: 'unreadable' });
  });
});
