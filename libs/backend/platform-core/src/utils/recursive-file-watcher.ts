/**
 * Host-neutral file watcher helper for `ElectronFileSystemProvider` and
 * `CliFileSystemProvider`.
 *
 * ## Why this exists
 *
 * On Windows, chokidar 5 opens one native `fs.watch` handle per FILE. Watching
 * a 4,000-file `.ptah/specs/**` tree blocked the Electron main thread for
 * 1.0-1.4 s while handles were created. One `fs.watch(root, { recursive: true })`
 * handle blocks ~20 ms.
 *
 * Windows (`win32`) and macOS (`darwin`) provide native kernel-level recursive
 * `fs.watch`; other platforms (`linux`) keep the caller's chokidar fallback.
 *
 * ## Contract preserved
 *
 * Returns `IFileWatcher` emitting `path.resolve` absolute paths only when
 * `plan.matches(absolute)` holds and `!isIgnoredByPlan(...)`, with no initial
 * scan events (`ignoreInitial: true` semantics).
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

import type { IFileWatcher } from '../types/platform.types';
import { createEvent } from './event-emitter';
import {
  planGlobWatch,
  type GlobWatchPlan,
  type GlobWatchPlanOptions,
} from './glob-watch-plan';
import {
  classifyWatchBurst,
  type WatchedPathState,
} from './recursive-watch-events';

/** Per-path debounce window in milliseconds. */
export const COALESCE_MS = 50;

/** Upper bound of entries read when a moved-in directory is scanned. */
const MAX_SCAN_ENTRIES = 10_000;

export type WatcherMode = 'recursive' | 'chokidar';

/** Minimal logger contract so `platform-core` never imports `vscode-core`. */
export interface WatcherLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}

export type WatcherLoggerGetter = () => WatcherLogger | undefined;

export interface FsWatchHandle {
  close(): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export type FsWatchListener = (
  eventType: string,
  filename: string | Buffer | null | undefined,
) => void;

export type FsWatchFn = (
  target: string,
  options: { recursive: boolean; persistent: boolean },
  listener: FsWatchListener,
) => FsWatchHandle;

/** Optional host-level seams accepted by the Electron and CLI providers. */
export interface FileWatcherHostOptions {
  /** Lazy getter so a Logger registered after the provider is still found. */
  readonly getLogger?: WatcherLoggerGetter;
  /** Test seam. Defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform;
  /** Test seam. Defaults to `fs.watch`. */
  readonly fsWatch?: FsWatchFn;
  /** Test seam. Defaults to async `fs.promises.stat`. */
  readonly stat?: (target: string) => Promise<WatchedPathState>;
  /** Test seam for the per-path coalesce window. Defaults to `COALESCE_MS`. */
  readonly coalesceMs?: number;
}

export interface GlobFileWatcherOptions
  extends FileWatcherHostOptions,
    GlobWatchPlanOptions {}

export interface RecursiveFileWatcherOptions {
  readonly plan: GlobWatchPlan;
  readonly fsWatch?: FsWatchFn;
  readonly stat?: (target: string) => Promise<WatchedPathState>;
  readonly getLogger?: WatcherLoggerGetter;
  readonly coalesceMs?: number;
}

/** Native recursive `fs.watch` is supported on Windows and macOS. */
export function shouldUseRecursiveWatch(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin';
}

export function watcherModeFor(platform: NodeJS.Platform): WatcherMode {
  return shouldUseRecursiveWatch(platform) ? 'recursive' : 'chokidar';
}

const defaultFsWatch: FsWatchFn = (target, options, listener) =>
  fs.watch(target, options, listener);

async function defaultStat(target: string): Promise<WatchedPathState> {
  try {
    const stats = await fsp.stat(target);
    if (stats.isDirectory()) return 'directory';
    return stats.isFile() ? 'file' : 'directory';
  } catch (error: unknown) {
    // degradation-audit: optional-capability - an unstat-able path after an OS
    // watch event vanished or became inaccessible; classify as 'missing'.
    void error;
    return 'missing';
  }
}

/**
 * Check `plan.ignores` on `absolute` and every ancestor below `root` so
 * directory-level excludes (e.g. `node_modules`) prune descendants the same way
 * chokidar's `ignored` predicate prunes directory walks.
 */
function isIgnoredByPlan(
  plan: GlobWatchPlan,
  root: string,
  absolute: string,
): boolean {
  let current = absolute;
  while (current !== root) {
    if (plan.ignores(current)) return true;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

interface PendingBurst {
  timer: ReturnType<typeof setTimeout>;
  sawRename: boolean;
}

function openRecursiveWatcher(options: RecursiveFileWatcherOptions): {
  watcher: IFileWatcher;
  handles: number;
} {
  const { plan } = options;
  const log = (): WatcherLogger | undefined => options.getLogger?.();
  const fsWatch = options.fsWatch ?? defaultFsWatch;
  const stat = options.stat ?? defaultStat;
  const windowMs = options.coalesceMs ?? COALESCE_MS;
  const root = path.resolve(plan.watchRoot);

  const [onDidChange, fireChange] = createEvent<string>();
  const [onDidCreate, fireCreate] = createEvent<string>();
  const [onDidDelete, fireDelete] = createEvent<string>();

  const pending = new Map<string, PendingBurst>();
  const known = new Set<string>();
  /** Latest settle token per path, so a stale async stat result is dropped. */
  const generation = new Map<string, number>();
  let handle: FsWatchHandle | undefined;
  let disposed = false;

  const closeHandle = (): void => {
    const current = handle;
    handle = undefined;
    if (!current) return;
    try {
      current.close();
    } catch (error: unknown) {
      // degradation-audit: reported - close failure is logged at warn; nothing to retry.
      log()?.warn('[file-watcher] close failed', {
        root,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const clearTimers = (): void => {
    for (const burst of pending.values()) clearTimeout(burst.timer);
    pending.clear();
  };

  /**
   * A directory that was moved in or renamed reports only itself on win32 and
   * darwin. Walk it once so its files still emit `created`, as chokidar did.
   */
  const scanDirectory = async (directory: string): Promise<void> => {
    const queue: string[] = [directory];
    let seen = 0;
    while (queue.length > 0 && seen < MAX_SCAN_ENTRIES) {
      const current = queue.pop() as string;
      let entries: fs.Dirent[];
      try {
        entries = await fsp.readdir(current, { withFileTypes: true });
      } catch (error: unknown) {
        // degradation-audit: optional-capability - a directory that vanished
        // during the scan has no files left to report.
        void error;
        continue;
      }
      if (disposed) return;
      for (const entry of entries) {
        seen += 1;
        const child = path.join(current, entry.name);
        if (isIgnoredByPlan(plan, root, child)) continue;
        if (entry.isDirectory()) {
          queue.push(child);
        } else if (entry.isFile() && plan.matches(child) && !known.has(child)) {
          known.add(child);
          fireCreate(child);
        }
      }
    }
    if (seen >= MAX_SCAN_ENTRIES) {
      log()?.warn('[file-watcher] directory scan limit reached', {
        root,
        limit: MAX_SCAN_ENTRIES,
      });
    }
  };

  const settle = async (
    absolute: string,
    sawRename: boolean,
    token: number,
  ): Promise<void> => {
    try {
      const state = await stat(absolute);
      // A newer burst for the same path owns the result: drop this stale one.
      if (disposed || generation.get(absolute) !== token) return;
      generation.delete(absolute);
      if (state === 'directory') {
        if (sawRename) await scanDirectory(absolute);
        return;
      }
      // A rename that reached here only to be checked as a directory must not
      // emit for a path the caller did not ask for (file or already deleted).
      if (!plan.matches(absolute)) return;
      const kind = classifyWatchBurst({
        sawRename,
        state,
        known: known.has(absolute),
      });
      if (kind === null) return;
      if (kind === 'deleted') {
        known.delete(absolute);
        fireDelete(absolute);
        return;
      }
      known.add(absolute);
      if (kind === 'created') fireCreate(absolute);
      else fireChange(absolute);
    } catch (error: unknown) {
      // degradation-audit: reported - unexpected stat/listener error is logged at warn.
      log()?.warn('[file-watcher] event settle failed', {
        root,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const onRawEvent: FsWatchListener = (eventType, filename) => {
    if (disposed || filename === null || filename === undefined) return;
    const rel = filename.toString().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel) return;
    const absolute = path.resolve(root, rel);
    const isRename = eventType === 'rename';
    // A rename may be a directory move: let it reach `settle`, which stats it.
    if (isIgnoredByPlan(plan, root, absolute)) return;
    if (!isRename && !plan.matches(absolute)) return;
    const existing = pending.get(absolute);
    if (existing) {
      existing.sawRename = existing.sawRename || isRename;
      return;
    }
    const burst: PendingBurst = {
      sawRename: isRename,
      timer: setTimeout(() => {
        pending.delete(absolute);
        const token = (generation.get(absolute) ?? 0) + 1;
        generation.set(absolute, token);
        void settle(absolute, burst.sawRename, token);
      }, windowMs),
    };
    burst.timer.unref();
    pending.set(absolute, burst);
  };

  let handles = 0;
  try {
    handle = fsWatch(root, { recursive: true, persistent: true }, onRawEvent);
    handles = 1;
    handle.on('error', (error: Error) => {
      if (disposed) return;
      disposed = true;
      log()?.warn('[file-watcher] watch error, handle closed', {
        root,
        error: error.message,
      });
      clearTimers();
      closeHandle();
    });
  } catch (error: unknown) {
    // degradation-audit: reported - missing or inaccessible root logs once and returns a safe no-op watcher.
    log()?.warn('[file-watcher] watch unavailable, no-op watcher', {
      root,
      error: error instanceof Error ? error.message : String(error),
    });
    handle = undefined;
  }

  return {
    handles,
    watcher: {
      onDidChange,
      onDidCreate,
      onDidDelete,
      dispose() {
        if (disposed) return;
        disposed = true;
        clearTimers();
        closeHandle();
      },
    },
  };
}

/** Create one recursive `fs.watch` `IFileWatcher` directly from a `GlobWatchPlan`. */
export function createRecursiveFileWatcher(
  options: RecursiveFileWatcherOptions,
): IFileWatcher {
  return openRecursiveWatcher(options).watcher;
}

/**
 * Shared entrypoint for `ElectronFileSystemProvider.createFileWatcher` and
 * `CliFileSystemProvider.createFileWatcher`: selects one recursive `fs.watch`
 * handle on `win32`/`darwin` or `createChokidarWatcher` elsewhere, and emits a
 * debug timing line when a `WatcherLogger` is wired.
 */
export function createGlobFileWatcher(
  pattern: string,
  options: GlobFileWatcherOptions | undefined,
  createChokidarWatcher: (plan: GlobWatchPlan) => IFileWatcher,
): IFileWatcher {
  const started = performance.now();
  const plan = planGlobWatch(pattern, options);
  const mode = watcherModeFor(options?.platform ?? process.platform);

  let watcher: IFileWatcher;
  let handles: number | undefined;
  if (mode === 'recursive') {
    const opened = openRecursiveWatcher({
      plan,
      fsWatch: options?.fsWatch,
      stat: options?.stat,
      getLogger: options?.getLogger,
      coalesceMs: options?.coalesceMs,
    });
    watcher = opened.watcher;
    handles = opened.handles;
  } else {
    watcher = createChokidarWatcher(plan);
  }

  options?.getLogger?.()?.debug('[file-watcher] created', {
    root: path.resolve(plan.watchRoot),
    mode,
    ...(handles !== undefined ? { handles } : {}),
    durationMs: Math.round(performance.now() - started),
  });

  return watcher;
}
