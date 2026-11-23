/**
 * Is a workspace root a LINKED git worktree (`git worktree add`)? (#1469)
 *
 * A linked worktree shares its repository with the main checkout, and the MCP
 * config files Ptah manages there (`.vscode/mcp.json`, `.cursor/mcp.json`,
 * `.agents/mcp_config.json`, ...) are usually tracked files of that
 * repository. A harness sync run from a worktree rewrote, deleted and backed up
 * (`.bak`) those files, so a task branch picked up unrelated config churn and
 * home configs flipped between worktrees. In a linked worktree harness sync
 * therefore writes, updates and deletes no MCP config file, workspace or home;
 * the main checkout stays the one place MCP config is reconciled.
 *
 * The test is git's own layout. The main checkout's `.git` is a directory. A
 * linked worktree's `.git` is a FILE whose `gitdir:` line points at
 * `<common git dir>/worktrees/<name>`. A git submodule also has a `.git` FILE,
 * but its pointer is `<super>/.git/modules/<name>`, so a `.git` file alone is
 * not enough: the pointer must end in a `worktrees/<name>` pair of segments.
 * Backslashes are normalized, and a relative pointer is resolved against the
 * root. `lstat` is used so a symbolic link named `.git` is never followed and
 * never counts. Any error — the root missing, `.git` missing or unreadable, a
 * malformed pointer — reads as "not a linked worktree", which leaves the
 * main-checkout behaviour (and its own removal proofs) in charge.
 */

import { lstatSync, readFileSync } from 'fs';
import { lstat, readFile } from 'fs/promises';
import { join, resolve } from 'path';

const GITDIR_LINE = /^gitdir:\s*(.+?)\s*$/m;

/**
 * True iff the `.git` file content names a linked worktree's git dir: its
 * `gitdir:` target, resolved against `root`, ends in `worktrees/<name>`.
 */
function isWorktreeGitdirPointer(root: string, content: string): boolean {
  const match = GITDIR_LINE.exec(content);
  if (!match) return false;
  // `resolve` keeps an absolute pointer as written and resolves a relative
  // one against the root; either way `..` segments are collapsed.
  const absolute = resolve(root, match[1].replace(/\\/g, '/')).replace(
    /\\/g,
    '/',
  );
  const segments = absolute.split('/').filter((s) => s !== '');
  return segments.length >= 2 && segments[segments.length - 2] === 'worktrees';
}

/**
 * True iff `{root}/.git` is a regular file whose `gitdir:` pointer names a
 * linked worktree (not a submodule). An error reads as false.
 */
export async function isLinkedWorktreeRoot(root: string): Promise<boolean> {
  if (root === '') return false;
  const dotGit = join(root, '.git');
  try {
    if (!(await lstat(dotGit)).isFile()) return false;
    return isWorktreeGitdirPointer(root, await readFile(dotGit, 'utf8'));
  } catch {
    // degradation-audit: optional-capability - a missing or unreadable `.git`
    // is "not a linked worktree" by contract; the caller runs its own proofs.
    return false;
  }
}

/**
 * Synchronous form of {@link isLinkedWorktreeRoot}, for the synchronous MCP
 * planner. Same rule, same error handling.
 */
export function isLinkedWorktreeRootSync(root: string): boolean {
  if (root === '') return false;
  const dotGit = join(root, '.git');
  try {
    if (!lstatSync(dotGit).isFile()) return false;
    return isWorktreeGitdirPointer(root, readFileSync(dotGit, 'utf8'));
  } catch {
    // degradation-audit: optional-capability - same contract as
    // isLinkedWorktreeRoot: an error reads as "not a linked worktree".
    return false;
  }
}
