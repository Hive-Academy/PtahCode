/**
 * Pure event mapping for the native recursive watcher.
 *
 * `fs.watch(root, { recursive: true })` only reports `rename` or `change`.
 * This module turns one coalesced burst of those events, plus one async stat
 * result, into the created / changed / deleted event of `IFileWatcher`.
 */

/** What async `fs.stat` found for a path after the coalesce window. */
export type WatchedPathState = 'file' | 'directory' | 'missing';

export type FileEventKind = 'created' | 'changed' | 'deleted';

export interface WatchBurst {
  /** True when at least one `rename` event arrived in the coalesce window. */
  readonly sawRename: boolean;
  /** Current filesystem state of the path. */
  readonly state: WatchedPathState;
  /** True when this watcher has already observed the path as an existing file. */
  readonly known: boolean;
}

/**
 * Classify one coalesced path burst into an `IFileWatcher` event kind, or
 * `null` when nothing must be emitted (directories are ignored, matching
 * chokidar's `add` / `change` / `unlink` file-only contract).
 *
 * - `'missing'`: `'deleted'` (covers both `rename` and delete-race `change`).
 * - `'file'` with `sawRename && !known`: `'created'`.
 * - `'file'` otherwise: `'changed'`.
 */
export function classifyWatchBurst(burst: WatchBurst): FileEventKind | null {
  if (burst.state === 'directory') return null;
  if (burst.state === 'missing') return 'deleted';
  if (burst.sawRename && !burst.known) return 'created';
  return 'changed';
}
