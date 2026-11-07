/**
 * Session-to-task links and worktree naming, read from session organization
 * (plan Components 6.1, 6.3 and 7c; batches.md Decision D2).
 *
 * The library never imports `@ptah-extension/session-organization`, which
 * depends on agent-sdk. The Electron host binds this port to
 * `SESSION_ORGANIZATION_TOKENS.STORE` and to the exported
 * `taskIdsInWorktreeName`.
 *
 * Every method throws when the organization store is not available; callers
 * record their step's fallback outcome (`failed/curator-failed` for
 * close-curate, `blocked/precondition-unverifiable` for dispose).
 */
export interface SessionLinkPort {
  /**
   * Ids of the sessions linked to `taskId` in any of `roots`, de-duplicated,
   * in a stable order. Roots are workspace roots as the organization store
   * keys them (the run's main root and its seen root).
   */
  linkedSessions(taskId: string, roots: readonly string[]): readonly string[];
  /**
   * The `worktreePath` stored on the session's organization row, looked up
   * under each of `roots` in order; `null` when no row holds one.
   */
  worktreePathForSession(
    sessionId: string,
    roots: readonly string[],
  ): string | null;
  /** Task ids named by a worktree's folder name or branch name. */
  taskIdsInWorktreeName(
    worktreePath: string | null,
    branch: string | null,
  ): string[];
}
