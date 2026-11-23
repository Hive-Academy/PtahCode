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
 * The test is git's own layout: the main checkout's `.git` is a directory, a
 * linked worktree's `.git` is a FILE holding a `gitdir:` pointer. `lstat` is
 * used so a symbolic link named `.git` is never followed and never counts.
 * Any error — the root missing, `.git` missing, a permission failure — reads
 * as "not a linked worktree", which leaves the main-checkout behaviour (and its
 * own removal proofs) in charge.
 */

import { lstatSync } from 'fs';
import { lstat } from 'fs/promises';
import { join } from 'path';

/** True iff `{root}/.git` is a regular file. An error reads as false. */
export async function isLinkedWorktreeRoot(root: string): Promise<boolean> {
  if (root === '') return false;
  try {
    return (await lstat(join(root, '.git'))).isFile();
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
  try {
    return lstatSync(join(root, '.git')).isFile();
  } catch {
    // degradation-audit: optional-capability - same contract as
    // isLinkedWorktreeRoot: an error reads as "not a linked worktree".
    return false;
  }
}
