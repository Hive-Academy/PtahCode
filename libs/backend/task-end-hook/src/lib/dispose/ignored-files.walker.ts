/**
 * P7 census of a candidate's ignored files (plan Component 6.3, "Collector
 * rules"). Read-only: `lstat` and `readdir` only, a symlink counts as itself
 * and is never followed, and nothing is archived, moved or removed (C1).
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  DISPOSAL_ARCHIVE_ALLOW_LIST,
  type DisposalIgnoredFile,
  type DisposalIgnoredFiles,
} from './disposal-input';
import type { GitIgnoredEntry } from './git-porcelain.parser';

/** The archive caps the walk stops at (plus one, which means `truncated`). */
export interface IgnoredWalkCaps {
  readonly maxFiles: number;
  readonly maxBytes: number;
}

/** Matches the decision's top-level allow-list rule. */
export function isAllowListed(relPath: string): boolean {
  return DISPOSAL_ARCHIVE_ALLOW_LIST.some((entry) => {
    const dir = entry.endsWith('/') ? entry : `${entry}/`;
    return relPath === dir.slice(0, -1) || relPath.startsWith(dir);
  });
}

/**
 * P7 ignored files with sizes. Descends only into ignored directories that
 * are not allow-listed, counts with `lstat`, and stops at `maxFiles + 1`
 * files or `maxBytes + 1` bytes: the result is then `truncated`. Directories
 * visited are bounded by the same file cap plus one; beyond it the walk is
 * an `error` (a directory tree that large is not provably small).
 *
 * Any entry that cannot be read is an `error`, including one that vanished
 * after `git status` listed it: the worktree changed under the census, so
 * the archive contents are unproved and P7 records
 * `precondition-unverifiable`. A later evaluation can prove the new state.
 */
export async function walkIgnored(
  worktreeRoot: string,
  ignored: readonly GitIgnoredEntry[],
  caps: IgnoredWalkCaps,
): Promise<DisposalIgnoredFiles> {
  const files: DisposalIgnoredFile[] = [];
  const fileCap = caps.maxFiles + 1;
  const byteCap = caps.maxBytes + 1;
  let bytes = 0;
  let directories = 0;

  const count = (relPath: string, size: number): boolean => {
    files.push({ relPath, bytes: size });
    bytes += size;
    return files.length >= fileCap || bytes >= byteCap;
  };

  const stack: string[] = [];
  try {
    for (const item of ignored) {
      if (isAllowListed(item.relPath)) continue;
      if (item.isDirectory) {
        stack.push(item.relPath);
        continue;
      }
      const info = await fs.lstat(path.join(worktreeRoot, item.relPath));
      if (count(item.relPath, info.size)) return { kind: 'truncated' };
    }
    while (stack.length > 0) {
      const relDir = stack.pop() as string;
      directories += 1;
      if (directories > fileCap) return { kind: 'error' };
      const names = await fs.readdir(path.join(worktreeRoot, relDir));
      for (const name of names.sort()) {
        const relPath = `${relDir}/${name}`;
        const info = await fs.lstat(path.join(worktreeRoot, relPath));
        if (info.isDirectory()) {
          stack.push(relPath);
        } else if (count(relPath, info.size)) {
          return { kind: 'truncated' };
        }
      }
    }
  } catch {
    // degradation-audit: reported - an entry could not be read (vanished,
    // permissions, I/O): the archive size is unknown, which the collector
    // records as `ignored-walk-failed` and P7 as precondition-unverifiable.
    return { kind: 'error' };
  }
  return { kind: 'ok', files };
}
