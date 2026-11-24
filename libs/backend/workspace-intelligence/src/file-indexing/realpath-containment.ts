import * as path from 'path';
import {
  FileType,
  type IFileSystemProvider,
} from '@ptah-extension/platform-core';

/**
 * Real-path containment for the code-symbol index.
 *
 * Discovery and `reindexFile` check containment LEXICALLY, so a symlink or a
 * Windows junction inside the workspace root that points outside it passes
 * that check, and its target would be read and indexed. These helpers resolve
 * the real path through the injected file-system port
 * (`IFileSystemProvider.realpath`, which the Electron and CLI providers
 * implement with `fs.promises.realpath`; it resolves junctions too) and
 * compare it against the real path of the root.
 *
 * Policy:
 * - Target outside the root: skipped.
 * - Link that does not resolve (broken link, dangling junction): skipped.
 * - Target inside the root: indexed under its in-root path, spelled from the
 *   root the caller passed (so a root that is itself a symlink still works),
 *   and de-duplicated by that path by the caller.
 * - The real path cannot be read and the entry is NOT a link (the file just
 *   vanished, or the provider cannot answer): the lexical path is kept and
 *   the read decides the outcome. The caller has already checked lexical
 *   containment.
 */

/** The file-system calls containment needs. */
export type RealpathFileSystem = Pick<
  IFileSystemProvider,
  'realpath' | 'lstat'
>;

export type IndexPathResolution =
  /** Index `path`: the entry itself, or the in-root path of its link target. */
  | { readonly kind: 'inside'; readonly path: string }
  /** The resolved target lies outside the workspace root. */
  | { readonly kind: 'outside' }
  /** A link whose target does not resolve. */
  | { readonly kind: 'broken-link' };

function toForwardSlashes(value: string): string {
  return value.replaceAll('\\', '/');
}

/**
 * The in-root path of `realTarget`, spelled from `lexicalRoot`, or `null`
 * when the target is the root itself or lies outside it. `path.relative` of
 * the platform's flavour decides containment: on win32 it compares
 * case-insensitively and answers an absolute path for another drive.
 */
export function containedIndexPath(
  lexicalRoot: string,
  realRoot: string,
  realTarget: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const flavour = platform === 'win32' ? path.win32 : path.posix;
  const relative = flavour.relative(
    flavour.normalize(realRoot),
    flavour.normalize(realTarget),
  );
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${flavour.sep}`) ||
    flavour.isAbsolute(relative)
  ) {
    return null;
  }
  return toForwardSlashes(flavour.join(lexicalRoot, relative));
}

/** The real path of the workspace root, or the root as given when it cannot be resolved. */
export async function resolveRealRoot(
  workspaceRoot: string,
  fs: RealpathFileSystem,
): Promise<string> {
  try {
    return await fs.realpath(workspaceRoot);
  } catch {
    // degradation-audit: optional-capability - an unresolvable root keeps the
    // lexical root as the base; every file is then compared against it.
    return workspaceRoot;
  }
}

/**
 * Where `filePath` (lexically inside `lexicalRoot`) may be indexed, if at all.
 * An entry that is not a link keeps its exact spelling, so its rows keep the
 * key they had before this check existed.
 */
export async function resolveIndexPath(
  filePath: string,
  lexicalRoot: string,
  realRoot: string,
  fs: RealpathFileSystem,
  platform: NodeJS.Platform = process.platform,
): Promise<IndexPathResolution> {
  let realTarget: string;
  try {
    realTarget = await fs.realpath(filePath);
  } catch {
    // degradation-audit: reported - the caller counts a broken link as
    // skipped; a non-link keeps its lexical path and the read decides.
    return (await isLink(filePath, fs))
      ? { kind: 'broken-link' }
      : { kind: 'inside', path: filePath };
  }
  const contained = containedIndexPath(
    lexicalRoot,
    realRoot,
    realTarget,
    platform,
  );
  if (contained === null) return { kind: 'outside' };
  return {
    kind: 'inside',
    path: samePath(contained, filePath, platform) ? filePath : contained,
  };
}

async function isLink(
  filePath: string,
  fs: RealpathFileSystem,
): Promise<boolean> {
  try {
    const stat = await fs.lstat(filePath);
    return (stat.type & FileType.SymbolicLink) !== 0;
  } catch {
    // degradation-audit: optional-capability - an entry that cannot be
    // lstat-ed is not known to be a link; the read reports it.
    return false;
  }
}

function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  const flavour = platform === 'win32' ? path.win32 : path.posix;
  const left = toForwardSlashes(flavour.normalize(a));
  const right = toForwardSlashes(flavour.normalize(b));
  return platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}
