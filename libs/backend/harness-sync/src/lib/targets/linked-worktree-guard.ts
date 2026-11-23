/**
 * In a linked git worktree, harness sync rewrites and deletes no copy that git
 * tracks (#1469, live-review LR1).
 *
 * A worktree shares its repository with the main checkout, so a skill, command
 * or agent copy that the project committed is a tracked file there too. An
 * update or a removal of such a copy, driven by `~/.ptah/user` or by which CLIs
 * a pass detected, lands as an uncommitted diff on the task branch. The main
 * checkout stays the one place those copies change; in the worktree the claim
 * is released instead (`releasedTracked`), so the path reads as foreign on the
 * next pass and is left alone.
 *
 * Only an existing path can be tracked, so a `create` never reaches this
 * guard. A path git cannot answer for (`unverifiable`) counts as tracked: a
 * linked worktree always has a `.git` marker, which is the same rule the
 * main-checkout command removal applies.
 */

import type { GitTrackingProbe } from './retirement-proof';

/**
 * True when `relPath` must be kept as it is: the root is a linked worktree and
 * git does not answer `untracked` for the path.
 */
export async function keepsTrackedCopy(
  linkedWorktree: boolean,
  workspaceRoot: string,
  relPath: string,
  probeGitTracking: GitTrackingProbe,
): Promise<boolean> {
  if (!linkedWorktree) return false;
  return (await probeGitTracking(workspaceRoot, relPath)) !== 'untracked';
}
