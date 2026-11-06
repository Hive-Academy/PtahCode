/**
 * A host probe that may have nothing to ask: the engine behind it is not
 * registered on this host. Callers map `unavailable` to their own fallback
 * (`in-use-unverifiable` for dispose P10, a deferral for the census).
 */
export type TaskEndProbeResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'unavailable' };

/**
 * In-process activity: live sessions, tracked CLI lanes and open workspaces
 * (plan Components 6.1, 6.3, 6.4).
 *
 * The Electron host binds it to `SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER`,
 * `TOKENS.AGENT_PROCESS_MANAGER` and `PLATFORM_TOKENS.WORKSPACE_PROVIDER`,
 * resolved lazily inside each call. Activity is in-process only
 * (`activityScope: 'in-process'`).
 */
export interface ActivityPort {
  /** Whether the session is live in this process (close-curate hand-off). */
  isSessionLive(sessionId: string): TaskEndProbeResult<boolean>;
  /** Workspace roots of every live session (dispose P10). */
  liveSessionRoots(): TaskEndProbeResult<readonly string[]>;
  /** Working directories of every tracked CLI agent lane (dispose P10). */
  trackedLaneDirs(): TaskEndProbeResult<readonly string[]>;
  /** Roots of the registered workspace folders (dispose P10, index gate 0). */
  registeredWorkspaceRoots(): TaskEndProbeResult<readonly string[]>;
  /**
   * Whether any live session has a turn in flight, or had activity within
   * `backoffMs` (`memory.triggers.bootScanIdleBackoffMs`), for index step 5.
   */
  foregroundActive(backoffMs: number): TaskEndProbeResult<boolean>;
}
