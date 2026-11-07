/**
 * The symbol-index census of a main worktree root (plan Component 6.4).
 *
 * The Electron adapter reads `IndexingControlService.getStatus()` and starts
 * a census with `IndexingControlService.start('symbols', root, deps)`, without
 * `userInitiated`, so the indexing governor still applies.
 */
export interface CensusPort {
  /** Whether the `symbols` pipeline is enabled for `root`. */
  symbolsEnabled(root: string): Promise<boolean>;
  /** Whether any census of `root` is running now, whoever started it. */
  isCensusActive(root: string): boolean;
  /** Epoch ms of the last completed census of `root`; `null` when never. */
  lastIndexedAt(root: string): Promise<number | null>;
  /**
   * The engine's last error for `root`, or `null`. Read only to decide
   * `failed/census-failed`; the text is never stored or logged at info.
   */
  lastError(root: string): Promise<string | null>;
  /**
   * Starts a census of `root` and resolves when it ends. The caller reads
   * {@link lastIndexedAt} and {@link lastError} afterwards to classify it.
   */
  requestCensus(root: string, signal: AbortSignal): Promise<void>;
}
