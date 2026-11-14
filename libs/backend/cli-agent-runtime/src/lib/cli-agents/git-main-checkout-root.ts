import { readFileSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

/** Resolve the main checkout of a linked git worktree without starting git. */
export function worktreeMainRoot(start: string): string | null {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const marker = join(dir, '.git');
    let markerIsFile: boolean;
    try {
      markerIsFile = statSync(marker).isFile();
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
      const common = resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf-8').trim());
      return basename(common) === '.git' ? dirname(common) : null;
    } catch {
      // degradation-audit: optional-capability - an unreadable worktree pointer
      // cannot supply a trustworthy main checkout key.
      return null;
    }
  }
}
