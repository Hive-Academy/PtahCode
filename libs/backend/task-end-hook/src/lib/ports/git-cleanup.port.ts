/** A fresh inspection of the exact task worktree and its branch. */
export interface TaskWorktreeInspection {
  readonly canonicalPath: string;
  readonly branch: string;
  /** Includes untracked files. */
  readonly clean: boolean;
  readonly branchMergedIntoMain: boolean;
}

export type GitCleanupResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'already-removed'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

/**
 * Write-capable Git boundary, separate from the read-only runner.
 * Callers must recheck the worktree and branch immediately before removal.
 * Implementations must refuse force removal and force branch deletion.
 */
export interface GitCleanupPort {
  inspectTaskWorktree(
    mainRoot: string,
    worktreePath: string,
    branch: string,
  ): Promise<GitCleanupResult<TaskWorktreeInspection>>;
  /** Runs `git worktree remove -- <canonicalPath>` without force. */
  removeWorktree(
    mainRoot: string,
    canonicalPath: string,
  ): Promise<GitCleanupResult<void>>;
  /** Runs `git branch -d -- <branch>`. */
  deleteBranch(mainRoot: string, branch: string): Promise<GitCleanupResult<void>>;
}
