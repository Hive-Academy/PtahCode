import { lstatSync, readFileSync, realpathSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

function sameText(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Compare two paths, also through symlinks and junctions. */
function samePath(a: string, b: string): boolean {
  if (sameText(a, b)) return true;
  try {
    return sameText(realpathSync.native(a), realpathSync.native(b));
  } catch {
    // degradation-audit: optional-capability - a path that cannot be
    // resolved is not proved to be the same file.
    return false;
  }
}

/** Resolve the main checkout of a linked git worktree without starting git. */
export function worktreeMainRoot(start: string): string | null {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const marker = join(dir, '.git');
    let markerIsFile: boolean;
    try {
      // lstat: a `.git` symlink to another worktree's file must not pass the
      // real-path back-pointer check below.
      const stat = lstatSync(marker);
      if (stat.isSymbolicLink()) return null;
      markerIsFile = stat.isFile();
    } catch {
      // degradation-audit: optional-capability - a missing or unreadable
      // marker supplies no checkout key at this directory.
      const parent = dirname(dir);
      if (parent === dir) return null;
      continue;
    }
    if (!markerIsFile) return null;
    try {
      const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(marker, 'utf-8'));
      if (pointer === null) return null;
      const gitDir = resolve(dir, pointer[1].trim());
      // The main repository owns `<gitDir>/gitdir`. It must point back at this
      // `.git` file, so a forged pointer cannot claim another repository.
      const back = resolve(gitDir, readFileSync(join(gitDir, 'gitdir'), 'utf-8').trim());
      if (!samePath(back, marker)) return null;
      const common = resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf-8').trim());
      return basename(common) === '.git' ? dirname(common) : null;
    } catch {
      // degradation-audit: optional-capability - an unreadable worktree pointer
      // cannot supply a trustworthy main checkout key.
      return null;
    }
  }
}
