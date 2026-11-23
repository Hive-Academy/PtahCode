import { createHash } from 'crypto';
import * as path from 'path';
import { FileType, type DirectoryEntry, type IFileSystemProvider } from '@ptah-extension/platform-core';
import { isSingleTaskPathSegment } from '@ptah-extension/shared';

type FolderFailure = { state: 'rejected' | 'missing' | 'unreadable' };
export type ContainedTaskOpen = { state: 'ready'; folder: ContainedTaskFolder } | FolderFailure;
export type ContainedTaskList = { state: 'ready'; entries: DirectoryEntry[] } | FolderFailure;
export type ContainedTaskInspect =
  | { state: 'file'; size: number; mtime: number }
  | { state: 'directory' | 'other' }
  | FolderFailure;
export type ContainedTaskRead =
  | { state: 'ready' | 'capped'; content: string }
  | { state: 'binary'; capped: boolean }
  | { state: 'rejected' | 'missing' | 'unreadable' | 'directory' };

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function validSegment(part: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part) && !part.includes('..');
}

function failure(error: unknown): FolderFailure {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return { state: code === 'ENOENT' ? 'missing' : 'unreadable' };
}

export class ContainedTaskFolder {
  private constructor(
    private readonly fs: IFileSystemProvider,
    private readonly canonicalFolder: string,
    readonly cacheKey: string,
    readonly fragmentCacheKey: string,
  ) {}

  static async open(fs: IFileSystemProvider, root: string, taskId: string): Promise<ContainedTaskOpen> {
    if (!isSingleTaskPathSegment(taskId)) return { state: 'rejected' };
    try {
      const canonicalRoot = await fs.realpath(root);
      let current = root;
      let canonicalFolder = canonicalRoot;
      for (const segment of ['.ptah', 'specs', taskId]) {
        current = path.join(current, segment);
        if ((await fs.lstat(current)).type !== FileType.Directory) return { state: 'rejected' };
        canonicalFolder = await fs.realpath(current);
        if (!inside(canonicalRoot, canonicalFolder)) return { state: 'rejected' };
      }
      const cacheKey = createHash('sha256').update(canonicalRoot).update('\0').update(canonicalFolder).digest('hex');
      const fragmentCacheKey = createHash('sha256').update(canonicalFolder).digest('hex');
      return { state: 'ready', folder: new ContainedTaskFolder(fs, canonicalFolder, cacheKey, fragmentCacheKey) };
    } catch (error: unknown) {
      return failure(error);
    }
  }

  static validParts(parts: readonly string[], maxDepth: number): boolean {
    return parts.length <= maxDepth && parts.every(validSegment);
  }

  async list(parts: readonly string[], maxDepth: number): Promise<ContainedTaskList> {
    if (!ContainedTaskFolder.validParts(parts, maxDepth)) return { state: 'rejected' };
    try {
      let current = this.canonicalFolder;
      let canonicalBefore = await this.directoryPath(current);
      if (canonicalBefore !== current) return { state: 'rejected' };
      for (const part of parts) {
        current = path.join(current, part);
        canonicalBefore = await this.directoryPath(current);
        if (canonicalBefore === null) return { state: 'rejected' };
      }
      const entries = await this.fs.readDirectory(current);
      try {
        if (await this.directoryPath(current) !== canonicalBefore) return { state: 'rejected' };
      } catch {
        return { state: 'rejected' };
      }
      return { state: 'ready', entries };
    } catch (error: unknown) {
      return failure(error);
    }
  }

  async inspect(name: string): Promise<ContainedTaskInspect> {
    const inspected = await this.inspectTarget(name);
    if (inspected.state === 'file') return { state: 'file', size: inspected.size, mtime: inspected.mtime };
    return inspected;
  }

  async read(name: string, maxBytes: number): Promise<ContainedTaskRead> {
    const inspected = await this.inspectTarget(name);
    if (inspected.state === 'other') return { state: 'rejected' };
    if (inspected.state !== 'file') return { state: inspected.state };
    const target = path.join(this.canonicalFolder, name);
    let read: Awaited<ReturnType<IFileSystemProvider['readFileBoundedNoFollow']>>;
    try {
      if (await this.directoryPath(this.canonicalFolder) !== this.canonicalFolder) return { state: 'rejected' };
      read = await this.fs.readFileBoundedNoFollow(target, maxBytes);
    } catch (error: unknown) {
      return failure(error);
    }

    // The provider checks open-file identity. Recheck the parent and target
    // paths as well, since the open is relative to a path, not a directory handle.
    try {
      const folderAfter = await this.fs.realpath(this.canonicalFolder);
      const targetAfter = await this.fs.realpath(target);
      if (folderAfter !== this.canonicalFolder || targetAfter !== inspected.canonical ||
          !inside(this.canonicalFolder, targetAfter) ||
          (await this.fs.lstat(this.canonicalFolder)).type !== FileType.Directory) return { state: 'rejected' };
    } catch {
      return { state: 'rejected' };
    }
    if (read.bytes.includes(0)) return { state: 'binary', capped: read.truncated };
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(read.bytes, { stream: read.truncated });
      return { state: read.truncated ? 'capped' : 'ready', content };
    } catch {
      return { state: 'binary', capped: read.truncated };
    }
  }

  private async directoryPath(target: string): Promise<string | null> {
    if ((await this.fs.lstat(target)).type !== FileType.Directory) return null;
    const canonical = await this.fs.realpath(target);
    return inside(this.canonicalFolder, canonical) ? canonical : null;
  }

  private async inspectTarget(name: string): Promise<
    | { state: 'file'; size: number; mtime: number; canonical: string }
    | { state: 'directory' }
    | { state: 'other' }
    | FolderFailure
  > {
    if (!validSegment(name)) return { state: 'rejected' };
    try {
      const target = path.join(this.canonicalFolder, name);
      const stat = await this.fs.lstat(target);
      if (stat.type === FileType.Directory) return { state: 'directory' };
      if (stat.type !== FileType.File) return { state: 'other' };
      const canonical = await this.fs.realpath(target);
      if (!inside(this.canonicalFolder, canonical)) return { state: 'rejected' };
      return { state: 'file', size: stat.size, mtime: stat.mtime, canonical };
    } catch (error: unknown) {
      return failure(error);
    }
  }
}
