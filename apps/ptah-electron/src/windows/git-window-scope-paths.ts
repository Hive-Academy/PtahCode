import { realpathSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Path containment of the detached Git window (PR #1038 review).
 *
 * One helper checks every path parameter of the child (file, editor, worktree
 * add and remove): {@link isPhysicallyInside}. It compares path segments, by
 * name and again after symbolic links are resolved.
 */

/** The comparison key of a root: absolute, and without case on Windows. */
export function rootKey(root: string): string {
  const resolved = path.resolve(root);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function keys(roots: readonly (string | null)[]): Set<string> {
  return new Set(roots.filter((root): root is string => root !== null).map(rootKey));
}

/**
 * `target` with its symbolic links resolved. A part that does not exist yet
 * (a new file or a new worktree) stays as it is under its resolved parent.
 */
export function physicalPath(target: string): string {
  let existing = path.resolve(target);
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(realpathSync.native(existing), ...rest);
    } catch {
      // degradation-audit: optional-capability - this part does not exist (or
      // cannot be read); its parent decides, and the lexical check ran before.
      const parent = path.dirname(existing);
      if (parent === existing) return path.resolve(target);
      rest.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

/** Inside `roots` (root keys) by name. A name such as `..notes` is not a parent step. */
export function isInside(target: string, roots: ReadonlySet<string>): boolean {
  const key = rootKey(target);
  for (const root of roots) {
    if (key === root) return true;
    const relative = path.relative(root, key);
    const leaves = relative === '..' || relative.startsWith(`..${path.sep}`);
    if (relative !== '' && !leaves && !path.isAbsolute(relative)) return true;
  }
  return false;
}

/** Inside `roots` by name, and also after symbolic links are resolved. */
export function isPhysicallyInside(target: string, roots: ReadonlySet<string>): boolean {
  if (!isInside(target, roots)) return false;
  const physicalRoots = new Set([...roots].map((root) => rootKey(physicalPath(root))));
  return isInside(physicalPath(target), physicalRoots);
}

/** `requested` as an absolute path: a relative path resolves against `root`. */
export function absoluteTarget(root: string, requested: string): string {
  const absolute = path.isAbsolute(requested) || path.win32.isAbsolute(requested);
  return absolute ? requested : path.resolve(root, requested);
}
