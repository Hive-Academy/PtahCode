export interface GitReadRunOptions {
  /** Hard ceiling for the call; at most `WORKTREE_GIT_TIMEOUT_MS`. */
  readonly timeoutMs: number;
  /** Combined stdout and stderr bytes allowed before the call rejects. */
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
}

export interface GitReadResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Runs one git argument vector, never a shell string (plan Component 8).
 *
 * The Electron host binds it to `execGit` with `priority: 'background'`. The
 * library never calls it directly: every call goes through `ReadOnlyGit`,
 * which rejects any vector outside the read-only allow-list before spawning.
 *
 * Resolves with the exit code for a process that ran; rejects on a timeout,
 * an abort, an output-limit breach or a spawn failure. Callers map a
 * rejection to `precondition-unverifiable` (or `in-use-unverifiable`).
 */
export interface GitReadRunner {
  run(
    args: readonly string[],
    cwd: string,
    options: GitReadRunOptions,
  ): Promise<GitReadResult>;
}
