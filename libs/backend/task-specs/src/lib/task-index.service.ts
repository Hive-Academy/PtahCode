/**
 * TaskIndexService — lazy start, file watcher, debounced reindex, and the
 * `onDidChangeIndex` event that drives the `tasks:changed` push.
 *
 * Responsibilities (R3.2–R3.5, R4.5, NFR-2, D3):
 *  - `ensureStarted(root)`: lazy full reindex + a single `createFileWatcher`
 *    (the EXISTING `IFileSystemProvider` port — no new platform port). Keyed
 *    per normalized workspace root; idempotent.
 *  - Watcher events are filtered to `<root>/.ptah/specs/`, ignoring
 *    `registry.md` (self-write) and `.archive/` + dot-folders, coalesced into a
 *    pending set behind a 300ms debounce so a burst of N writes in one folder
 *    yields ONE reindex + ONE event (NFR-2).
 *  - `reindex(root)` replaces the workspace from a full scan. Watcher and writer
 *    rebuilds scan changed folders and apply their rows in one transaction.
 *  - Write-order invariant (R3.5): `TaskWriterService` mutates `task.md` FIRST,
 *    then calls `applyFolderChange` (this class, via `ITaskIndexNotifier`),
 *    which reparses from disk — the DB is never written except from a parse of
 *    the file just written.
 */
import { inject, injectable } from 'tsyringe';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  PLATFORM_TOKENS,
  createEvent,
  FileType,
  type IFileSystemProvider,
  type IFileWatcher,
  type IEvent,
  type IDisposable,
} from '@ptah-extension/platform-core';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import {
  CARRIER_FILE,
  isSingleTaskPathSegment,
  SPECS_README_FILE,
  renderSpecsReadme,
  roundJudgeFile,
  filterTasks,
  mergeStatusTypeFacets,
  type DocFile,
  type ExcludedTaskFolder,
  type TaskSpecDetail,
  type TaskSpecSummary,
  type TasksReadFolderMarkdownResult,
  type TasksListFolderEntriesResult,
} from '@ptah-extension/shared';
import { normalizeWorkspaceRoot } from './normalize-workspace-root';
import { parseTaskFile } from './task-frontmatter';
import { TaskScannerService } from './task-scanner.service';
import { logRebuildTiming } from './rebuild-timing';
import { TASK_SPECS_TOKENS } from './di/tokens';
import { effectiveTaskStatus, type TaskStatusOverlay } from './task-status-overlay';
import type { ITaskIndexStore } from './task-index.store';
import type { ITaskIndexNotifier } from './task-index.port';
import { TaskIndexRebuildQueue } from './task-index-rebuild-queue';

/** Fired whenever the derived index changes. Drives the `tasks:changed` push. */
export interface TaskIndexChangeEvent {
  /** normalized workspace root. */
  workspaceRoot: string;
  /** folders touched by this change (empty for a full reindex). */
  folderNames: string[];
  reason: 'watcher' | 'write' | 'reindex';
}

/** Result of an explicit `reindex()` call (the `tasks:reindex` RPC). */
export interface ReindexResult {
  indexedCount: number;
  excludedCount: number;
  durationMs: number;
}

/** Board/list payload assembled from the derived index. */
export interface IndexListResult {
  tasks: TaskSpecSummary[];
  /**
   * Every skipped folder BY NAME with its typed reason. `excludedCount` stays
   * alongside it as the authoritative total, so a store that lost its rows can
   * still report the magnitude honestly rather than claiming zero.
   */
  excluded: ExcludedTaskFolder[];
  excludedCount: number;
  specsDirExists: boolean;
}

/** Per-workspace watcher + debounce state. */
interface WorkspaceState {
  started: boolean;
  /**
   * The in-flight first start, if any. Concurrent callers JOIN it instead of
   * returning early: since TASK_2026_179 step 11 the host calls `ensureStarted`
   * at activation, so an RPC can now arrive while the very first scan is still
   * running. Returning early there would hand that RPC an empty index.
   */
  startPromise: Promise<RebuildResult> | null;
  watcher: IFileWatcher | null;
  subscriptions: IDisposable[];
  specsDirExists: boolean;
  pending: Set<string>;
  pendingUnknown: boolean;
  writerFolders: Set<string>;
  writerWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
  timer: ReturnType<typeof setTimeout> | null;
  running: Promise<RebuildResult> | null;
  trailing: Promise<RebuildResult> | null;
  trailingFolders: Set<string>;
  trailingForceFull: boolean;
  trailingEmit: boolean;
  trailingReason: TaskIndexChangeEvent['reason'];
  trailingCount: number;
  flushRetries: Map<string, number>;
  fingerprints: Map<string, string | null>;
  eventsDuringRebuild: Set<string>;
  firstEventAt: number | null;
  eventClasses: Map<string, number>;
}

const DEBOUNCE_MS = 300;
const MAX_WAIT_MS = 1000;
const MAX_FOLDER_REBUILD = 64;
const FLUSH_RETRY_MS = [1000, 5000, 30000] as const;
const UNKNOWN_FLUSH_RETRY = '\u0000unknown';
export const TASK_INDEX_CLOCK = Symbol('task-index.clock');
const REGISTRY_FILE = 'registry.md';
/**
 * Watched RELATIVE to the workspace root (see `startWatcher`), which is what
 * lets every adapter resolve it exactly: `RelativePattern` in VS Code, and a
 * concrete `<root>/.ptah/specs` directory in the chokidar-backed adapters.
 */
const SPECS_GLOB = '.ptah/specs/**';

interface RebuildResult {
  indexedCount: number;
  excludedCount: number;
  indexWritten: boolean;
}

/**
 * Files this service itself generates at the ROOT of `.ptah/specs/`.
 *
 * Watcher events for these are dropped — they are our own writes, and a
 * self-triggered rebuild loop is the whole hazard here (`ensureStarted` writes
 * `README.md` into the very directory it watches). Suppression is path-based
 * rather than a timing window on purpose: a window is racy under a slow or
 * coalescing watcher, whereas these paths are NEVER a task folder, so dropping
 * them is unconditionally correct.
 */
const GENERATED_ROOT_FILES: readonly string[] = [
  REGISTRY_FILE,
  SPECS_README_FILE,
];

@injectable()
export class TaskIndexService implements ITaskIndexNotifier {
  private readonly states = new Map<string, WorkspaceState>();
  private readonly activeFlushes = new Set<Promise<void>>();
  private readonly rootRebuildCounts = new Map<string, number>();
  private readonly triggerRebuildCounts = new Map<string, number>();
  private readonly _onDidChangeIndex: IEvent<TaskIndexChangeEvent>;
  private readonly fireChange: (e: TaskIndexChangeEvent) => void;
  private readonly now: () => number;
  private readonly rebuildQueue = new TaskIndexRebuildQueue((waitedMs, depth) => {
    if (waitedMs > 100 || depth > 0) this.logger.info('[task-specs] rebuild queue', { waitedMs, depth });
  });

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER)
    private readonly fs: IFileSystemProvider,
    @inject(TASK_SPECS_TOKENS.TASK_SCANNER)
    private readonly scanner: TaskScannerService,
    @inject(TASK_SPECS_TOKENS.TASK_INDEX_STORE)
    private readonly store: ITaskIndexStore,
    @inject(TASK_INDEX_CLOCK, { isOptional: true })
    now?: () => number,
    @inject(TASK_SPECS_TOKENS.TASK_STATUS_OVERLAY, { isOptional: true })
    private readonly statusOverlay?: TaskStatusOverlay,
  ) {
    const [event, fire] = createEvent<TaskIndexChangeEvent>();
    // Each listener is guarded: a listener that throws must not stop the
    // listeners after it (the RPC broadcast is one of them).
    this._onDidChangeIndex = (listener) =>
      event((e) => this.callListener(listener, e));
    this.fireChange = fire;
    this.now = now ?? (() => performance.now());
  }

  private callListener(
    listener: (e: TaskIndexChangeEvent) => void,
    e: TaskIndexChangeEvent,
  ): void {
    try { listener(e); }
    catch (error: unknown) {
      // degradation-audit: reported — logged at warn; the other listeners still run.
      this.logger.warn('[task-specs] index change listener failed', {
        error: new Error('Index change listener failed'),
        errorClass: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  /** Subscribe to derived-index changes (the RPC handler broadcasts these). */
  get onDidChangeIndex(): IEvent<TaskIndexChangeEvent> {
    return this._onDidChangeIndex;
  }

  /** Signal a host-side status change without rebuilding the carrier index. */
  notifyStatusOverlayChanged(workspaceRoot: string, taskId?: string): void {
    this.fireChange({ workspaceRoot: normalizeWorkspaceRoot(workspaceRoot), folderNames: taskId ? [taskId] : [], reason: 'write' });
  }

  /**
   * Lazy start: first call for a workspace performs a full (silent) reindex,
   * creates the watcher and writes the specs README. Idempotent — later calls
   * are cheap no-ops, and concurrent first calls collapse into exactly ONE
   * rebuild and ONE README write (R4).
   *
   * Two callers race in practice: the host at activation and `tasks:*` RPCs.
   * `started` is latched SYNCHRONOUSLY before the first `await`, so the second
   * caller can never begin a rebuild of its own; it awaits the first instead.
   */
  async ensureStarted(workspaceRoot: string): Promise<RebuildResult | null> {
    const root = normalizeWorkspaceRoot(workspaceRoot);
    const existing = this.states.get(root);
    if (existing?.started) {
      // Join a still-warming first call rather than returning an empty index.
      if (existing.startPromise) return existing.startPromise;
      return null;
    }

    const state: WorkspaceState = existing ?? {
      started: false,
      startPromise: null,
      watcher: null,
      subscriptions: [],
      specsDirExists: false,
      pending: new Set<string>(),
      pendingUnknown: false,
      writerFolders: new Set<string>(),
      writerWaiters: [],
      timer: null,
      running: null,
      trailing: null,
      trailingFolders: new Set<string>(),
      trailingForceFull: false,
      trailingEmit: false,
      trailingReason: 'watcher',
      trailingCount: 0,
      flushRetries: new Map(),
      eventsDuringRebuild: new Set(),
      fingerprints: new Map(),
      firstEventAt: null,
      eventClasses: new Map(),
    };
    state.started = true;
    this.states.set(root, state);

    const start = this.performStart(root, state);
    state.startPromise = start;
    try {
      const result = await start;
      if (!result.indexWritten) {
        // The README landed but the derived index did not — most often a store
        // whose SQLite connection is not open yet. Un-latch so the next caller
        // performs a real warm-up instead of inheriting an empty index for the
        // rest of the session.
        //
        // TASK_2026_306 defect E gave that "next caller" a trigger rather than
        // leaving it to chance: `startTaskSpecsIndex` re-warms on the
        // connection's `onDidOpen`. This latch is still what makes that second
        // call do real work, and it remains the only recovery for hosts and
        // paths with no open signal — do not remove it as redundant.
        state.started = false;
      }
      return result;
    } catch (error: unknown) {
      state.started = false;
      throw error;
    } finally {
      state.startPromise = null;
    }
  }

  /**
   * The actual first-start work. Returns whether the derived index was written;
   * the README write is independent and happens either way, because a host that
   * cannot index yet still needs the contract doc on disk.
   */
  private async performStart(
    root: string,
    state: WorkspaceState,
  ): Promise<RebuildResult> {
    this.startWatcher(root, state);
    // Initial index is silent — the caller (RPC handler) returns the data
    // itself, so an extra push would be redundant noise.
    const result = await this.scheduleRebuild(root, [], 'reindex', false);
    await this.ensureSpecsReadme(root, state);
    return result;
  }

  /**
   * Write `.ptah/specs/README.md` when its content differs from what we render.
   *
   * This is the data-plane doc: the ONLY channel that states the carrier
   * contract to a user whose `.claude/` clone has diverged from the shipped
   * orchestration skill. It is deliberately NOT a migration — nothing under a
   * `TASK_*` folder is read, touched or rewritten here (automatic migration
   * inside `ensureStarted` is explicitly rejected by the design).
   *
   * Only written when `.ptah/specs/` already exists: a workspace that has never
   * used tasks should not have the tree materialized under it just by opening.
   *
   * Never throws — a read-only or otherwise unwritable workspace must degrade
   * to "no README", not to a failed activation.
   */
  private async ensureSpecsReadme(
    root: string,
    state: WorkspaceState,
  ): Promise<void> {
    if (!state.specsDirExists) return;
    const readmePath = path.join(root, '.ptah', 'specs', SPECS_README_FILE);
    try {
      const rendered = renderSpecsReadme();
      // Content comparison IS the hash comparison, minus the collision risk.
      // `renderSpecsReadme` is deterministic, so a matching file means there is
      // genuinely nothing to do and we must not rewrite it — an unconditional
      // write would touch the file on every activation.
      let current: string | null = null;
      if (await this.fs.exists(readmePath)) {
        current = await this.fs.readFile(readmePath);
      }
      if (current === rendered) return;
      await this.fs.writeFile(readmePath, rendered);
      this.logger.info('[task-specs] wrote .ptah/specs/README.md');
    } catch (error: unknown) {
      this.logger.warn('[task-specs] failed to write specs README', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Explicit full reindex (`tasks:reindex`). Emits `reason: 'reindex'` so open
   * boards refresh.
   */
  async reindex(workspaceRoot: string): Promise<ReindexResult> {
    const root = normalizeWorkspaceRoot(workspaceRoot);
    const t0 = Date.now();
    const started = await this.ensureStarted(root);
    let indexedCount: number;
    let excludedCount: number;
    if (started?.indexWritten) {
      ({ indexedCount, excludedCount } = started);
      this.fireChange({
        workspaceRoot: root,
        folderNames: [],
        reason: 'reindex',
      });
    } else {
      ({ indexedCount, excludedCount } = await this.scheduleRebuild(
        root,
        [],
        'reindex',
        true,
      ));
    }
    return { indexedCount, excludedCount, durationMs: Date.now() - t0 };
  }

  /**
   * Write-order hook (R3.5, `ITaskIndexNotifier`). Called by
   * `TaskWriterService` AFTER the `task.md` mutation. Reparses from disk and
   * emits `reason: 'write'` for the touched folder.
   */
  async applyFolderChange(
    workspaceRoot: string,
    folderName: string,
  ): Promise<void> {
    const root = normalizeWorkspaceRoot(workspaceRoot);
    await this.ensureStarted(root);
    const state = this.states.get(root);
    if (!state) {
      await this.scheduleRebuild(root, [folderName], 'write');
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const now = Date.now();
      state.pending.add(folderName);
      state.writerFolders.add(folderName);
      state.writerWaiters.push({ resolve, reject });
      if (state.firstEventAt === null) state.firstEventAt = now;
      this.armFlush(root, state, this.nextDebounceDelay(state, now));
    });
  }

  /** Read the derived index for a workspace (list/board RPCs). */
  async list(
    workspaceRoot: string,
    filters?: Parameters<ITaskIndexStore['listByWorkspace']>[1],
  ): Promise<IndexListResult> {
    const root = normalizeWorkspaceRoot(workspaceRoot);
    await this.ensureStarted(root);
    let tasks: TaskSpecSummary[] = [];
    try {
      const stored = this.store.listByWorkspace(root);
      const merged = this.statusOverlay?.mergedTaskIds(root) ?? new Set<string>();
      const projected = stored.map((row) => ({
        ...row, carrierStatus: row.status,
        status: effectiveTaskStatus(row.status, merged.has(row.id)),
      }));
      const spec = filters ? mergeStatusTypeFacets(filters.filter, filters.status, filters.type) : undefined;
      tasks = spec === null ? [] : spec ? filterTasks(projected, spec) : projected;
    } catch (error: unknown) {
      this.logger.error(
        '[task-specs] index list failed',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    const meta = this.safeGetMeta(root);
    const state = this.states.get(root);
    return {
      tasks,
      excluded: meta?.excluded ?? [],
      excludedCount: meta?.excludedCount ?? 0,
      specsDirExists: state?.specsDirExists ?? false,
    };
  }

  /**
   * Read a single task's full detail (`tasks:get`). Reads the folder directly
   * (the index only stores summaries) — body + folder artifacts.
   */
  async getDetail(
    workspaceRoot: string,
    folderName: string,
  ): Promise<TaskSpecDetail | null> {
    const root = normalizeWorkspaceRoot(workspaceRoot);
    const carrier = await this.readFolderMarkdown(root, folderName, CARRIER_FILE);
    if (carrier.state === 'missing') return null;
    if (carrier.state !== 'ready' || carrier.content === null) {
      this.logger.warn('[task-specs] getDetail carrier read failed', { folderName, state: carrier.state });
      throw new Error(`Task carrier read failed: ${carrier.state}`);
    }
    try {
      const raw = carrier.content;
      const parsed = parseTaskFile(folderName, raw);
      if (parsed.kind !== 'task') return null;
      const listing = await this.listFolderEntries(root, folderName, '');
      if (listing.state !== 'ready') {
        this.logger.warn('[task-specs] getDetail listing failed', { folderName, state: listing.state });
        throw new Error(`Task folder listing failed: ${listing.state}`);
      }
      const entries = listing.entries.slice().sort((a, b) => a.name.localeCompare(b.name));
      const artifacts = entries.map((entry) => entry.name);
      return {
        ...parsed.task,
        carrierStatus: parsed.task.status,
        status: effectiveTaskStatus(parsed.task.status,
          this.statusOverlay?.mergedTaskIds(root).has(parsed.task.id) ?? false),
        body: parsed.body, artifacts, entries,
      };
    } catch (error: unknown) {
      this.logger.warn('[task-specs] getDetail failed', {
        folderName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Read ONE workflow document out of a task folder (`tasks:getArtifact`).
   *
   * `file` is a {@link DocFile} — a member of the contract's closed document
   * set, already narrowed at the Zod boundary. It is joined onto the folder
   * path, so accepting a free string here would turn this into an
   * arbitrary-file read primitive; the type is the guard, and it is why this
   * method takes `DocFile` rather than `string`.
   *
   * A missing document returns `null`, not an error. Most tasks carry three or
   * four of the fifteen recognised documents, and one that has not been planned
   * yet has no `implementation-plan.md` to read — that is the ordinary case.
   */
  async readArtifact(
    workspaceRoot: string,
    folderName: string,
    file: DocFile,
  ): Promise<string | null> {
    const read = await this.readFolderMarkdown(workspaceRoot, folderName, file);
    if (read.state === 'missing') return null;
    if (read.state === 'ready') return read.content;
    this.logger.warn('[task-specs] readArtifact failed', { folderName, file, state: read.state });
    throw new Error(`Task document read failed: ${read.state}`);
  }

  private inside(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  }

  private async containedTask(root: string, taskId: string): Promise<string> {
    if (!isSingleTaskPathSegment(taskId)) throw new Error('Invalid task folder');
    const canonicalRoot = await this.fs.realpath(root);
    let current = root;
    for (const segment of ['.ptah', 'specs', taskId]) {
      current = path.join(current, segment);
      const stat = await this.fs.lstat(current);
      if (stat.type !== FileType.Directory) throw new Error('Invalid task folder');
      const canonical = await this.fs.realpath(current);
      if (!this.inside(canonicalRoot, canonical)) throw new Error('Outside workspace');
    }
    return this.fs.realpath(current);
  }

  async readFolderMarkdown(workspaceRoot: string, taskId: string, file: string): Promise<TasksReadFolderMarkdownResult> {
    const result = (state: TasksReadFolderMarkdownResult['state'], content: string | null = null): TasksReadFolderMarkdownResult => ({ taskId, file, state, content });
    if (!isSingleTaskPathSegment(taskId)) return result('rejected');
    if (!/^[a-z0-9][a-z0-9._-]*\.md$/.test(file) || file.includes('..')) return result('rejected');
    try {
      const folder = await this.containedTask(normalizeWorkspaceRoot(workspaceRoot), taskId);
      const target = path.join(folder, file);
      const stat = await this.fs.lstat(target);
      if (stat.type === FileType.Directory) return result('directory');
      if (stat.type !== FileType.File) return result('rejected');
      if (stat.size > 1048576) return result('too_large');
      const canonicalTarget = await this.fs.realpath(target);
      if (!this.inside(folder, canonicalTarget)) return result('rejected');
      const read = await this.fs.readFileBoundedNoFollow(target, 1048576);
      // The path-based open cannot bind to the validated parent directory.
      // Discard bytes if either path changed while the read was in flight.
      try {
        const folderAfter = await this.fs.realpath(folder);
        const targetAfter = await this.fs.realpath(target);
        if (folderAfter !== folder || targetAfter !== canonicalTarget ||
            !this.inside(folder, targetAfter) ||
            (await this.fs.lstat(folder)).type !== FileType.Directory) return result('rejected');
      } catch (error: unknown) {
        this.logger.warn('[task-specs] document post-read check failed', {
          taskId, file, error: error instanceof Error ? error.message : String(error),
        });
        return result('rejected');
      }
      if (read.truncated) return result('too_large');
      if (read.bytes.includes(0)) return result('binary');
      try { return result('ready', new TextDecoder('utf-8', { fatal: true }).decode(read.bytes)); }
      catch { return result('binary'); }
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      const message = error instanceof Error ? error.message : '';
      if (code !== 'ENOENT' && message !== 'Invalid task folder' && message !== 'Outside workspace') {
        this.logger.error('[task-specs] document read failed', error instanceof Error ? error : new Error(String(error)));
      }
      return result(message === 'Invalid task folder' || message === 'Outside workspace' ? 'rejected' : code === 'ENOENT' ? 'missing' : 'unreadable');
    }
  }

  async listFolderEntries(workspaceRoot: string, taskId: string, directory: string): Promise<TasksListFolderEntriesResult> {
    const result = (state: TasksListFolderEntriesResult['state'], entries: TasksListFolderEntriesResult['entries'] = []): TasksListFolderEntriesResult => ({ taskId, directory, state, entries });
    if (!isSingleTaskPathSegment(taskId)) return result('rejected');
    const parts = directory === '' ? [] : directory.split('/');
    if (parts.length > 4 || parts.some((part) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(part) || part === '..' || part.includes('..'))) return result('rejected');
    try {
      const folder = await this.containedTask(normalizeWorkspaceRoot(workspaceRoot), taskId);
      let current = folder;
      for (const part of parts) {
        current = path.join(current, part);
        const stat = await this.fs.lstat(current);
        if (stat.type !== FileType.Directory || !this.inside(folder, await this.fs.realpath(current))) return result('rejected');
      }
      const before = await this.fs.lstat(current);
      const canonicalBefore = await this.fs.realpath(current);
      if (before.type !== FileType.Directory || !this.inside(folder, canonicalBefore)) return result('rejected');
      const entries = await this.fs.readDirectory(current);
      const after = await this.fs.lstat(current);
      const canonicalAfter = await this.fs.realpath(current);
      if (after.type !== FileType.Directory || canonicalAfter !== canonicalBefore ||
          !this.inside(folder, canonicalAfter)) return result('rejected');
      if (entries.length > 200) return result('too_many');
      return result('ready', entries.map(({ name, type }) => ({ name, kind: type === FileType.File ? 'file' : type === FileType.Directory ? 'directory' : type === FileType.SymbolicLink ? 'symlink' : 'other' })));
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      const message = error instanceof Error ? error.message : '';
      if (code !== 'ENOENT' && message !== 'Invalid task folder' && message !== 'Outside workspace') {
        this.logger.error('[task-specs] folder listing failed', error instanceof Error ? error : new Error(String(error)));
      }
      return result(message === 'Invalid task folder' || message === 'Outside workspace' ? 'rejected' : code === 'ENOENT' ? 'missing' : 'unreadable');
    }
  }

  /**
   * Read one Crucible judge report from a task folder.
   *
   * `round` is a NUMBER and the filename is composed HERE, from the shared
   * contract's {@link roundJudgeFile}. That is the security boundary: a number
   * cannot carry a separator or a `..`, so no caller input reaches the join as
   * a path fragment. `readArtifact` gets the same guarantee from the `DocFile`
   * enum; `round-N-judge.md` cannot be a `DocFile` (`N` is a parameter), so it
   * gets it from the shape of the parameter instead. Neither method screens a
   * string, because neither method accepts one.
   *
   * A missing report returns `null`, not an error. An unjudged round is the
   * ORDINARY state of a Crucible in progress — round 2 has no report while
   * round 1 is still being revised — and reporting that as a fault would make
   * every live run look broken.
   */
  async readRoundJudge(
    workspaceRoot: string,
    folderName: string,
    round: number,
  ): Promise<string | null> {
    const root = normalizeWorkspaceRoot(workspaceRoot);
    const file = roundJudgeFile(round);
    const target = path.join(root, '.ptah', 'specs', folderName, file);
    try {
      if (!(await this.fs.exists(target))) return null;
      return await this.fs.readFile(target);
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn here; null reads as "no
      // judge verdict for this round yet".
      this.logger.warn('[task-specs] readRoundJudge failed', {
        folderName,
        round,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** Tear down all watchers + pending timers (container disposal). */
  dispose(): void {
    const pendingWrites: Promise<void>[] = [];
    for (const [root, state] of this.states) {
      state.flushRetries.clear();
      if (state.timer) clearTimeout(state.timer);
      const folders = [...state.writerFolders];
      const waiters = state.writerWaiters.splice(0);
      state.writerFolders.clear();
      if (waiters.length > 0) {
        pendingWrites.push(this.scheduleRebuild(root, folders, 'write', false).then(
          (result) => {
            try {
              this.assertIndexPersisted(result);
              waiters.forEach(({ resolve }) => resolve());
            } catch (error: unknown) {
              waiters.forEach(({ reject }) => reject(error));
            }
          },
          (error: unknown) => waiters.forEach(({ reject }) => reject(error)),
        ));
      }
      for (const sub of state.subscriptions) sub.dispose();
      state.watcher?.dispose();
    }
    this.states.clear();
    if (pendingWrites.length > 0 || this.activeFlushes.size > 0) {
      void Promise.allSettled([...pendingWrites, ...this.activeFlushes]).then(() => this.rebuildQueue.dispose());
    } else {
      this.rebuildQueue.dispose();
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private startWatcher(root: string, state: WorkspaceState): void {
    if (state.watcher) return;
    try {
      // Scoped to THIS root, not a bare cross-workspace glob. One watcher is
      // created per workspace and `extractFolder` already discards anything
      // outside `<root>/.ptah/specs/`, so an unscoped watch only bought every
      // root a copy of every other root's events. Scoping also gives the Node
      // adapters a concrete directory to watch instead of the workspace tree.
      const watcher = this.fs.createFileWatcher(SPECS_GLOB, { cwd: root });
      state.watcher = watcher;
      state.subscriptions.push(
        watcher.onDidChange((p) => this.onWatchEvent(root, p, 'change')),
        watcher.onDidCreate((p) => this.onWatchEvent(root, p, 'create')),
        watcher.onDidDelete((p) => this.onWatchEvent(root, p, 'delete')),
      );
    } catch (error: unknown) {
      // A host without a real watcher (or a failure) degrades to
      // reindex-on-RPC — the index is still correct, just not live.
      this.logger.warn('[task-specs] watcher unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private onWatchEvent(root: string, rawPath: string, eventKind: string): void {
    const folderName = this.extractFolder(root, rawPath);
    const state = this.states.get(root);
    if (!state) return;
    const now = Date.now();
    if (!folderName) {
      const norm = rawPath.replace(/\\/g, '/').toLowerCase();
      const specs = `${root.replace(/\\/g, '/').toLowerCase()}/.ptah/specs`;
      if (norm !== specs && !norm.startsWith(`${specs}/`)) return;
      const leaf = norm.slice(specs.length + 1).split('/')[0];
      if (leaf && (leaf.startsWith('.') || GENERATED_ROOT_FILES.some((name) => name.toLowerCase() === leaf))) return;
      state.pendingUnknown = true;
    } else {
      state.pending.add(folderName);
      if (state.running) state.eventsDuringRebuild.add(folderName);
    }
    if (state.firstEventAt === null) state.firstEventAt = now;
    const leaf = path.basename(rawPath);
    const kind = leaf === CARRIER_FILE ? 'carrier' : leaf.endsWith('.md') ? 'markdown' : 'other';
    const category = `${eventKind}:${kind}`;
    state.eventClasses.set(category, (state.eventClasses.get(category) ?? 0) + 1);
    this.armFlush(root, state, this.nextDebounceDelay(state, now));
  }

  private nextDebounceDelay(state: WorkspaceState, now: number): number {
    return Math.min(DEBOUNCE_MS, Math.max(0, MAX_WAIT_MS - (now - (state.firstEventAt ?? now))));
  }

  private armFlush(
    root: string,
    state: WorkspaceState,
    delayMs: number,
    isRetry = false,
  ): void {
    // A timer armed by a newer watcher event during the failed flush stays:
    // its flush reads `state.pending`, which holds the retried folders too.
    if (isRetry && state.timer) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      const active = this.flush(root);
      this.activeFlushes.add(active);
      void active.finally(() => this.activeFlushes.delete(active));
    }, delayMs);
  }

  /**
   * Map a raw watcher path to the affected task folder name, or null when the
   * event is outside `<root>/.ptah/specs/`, is the generated `registry.md`, or
   * targets `.archive/` / a dot-folder.
   */
  private extractFolder(root: string, rawPath: string): string | null {
    const norm = rawPath.replace(/\\/g, '/');
    const prefix = `${root.replace(/\\/g, '/')}/.ptah/specs/`;
    if (norm.toLowerCase().indexOf(prefix.toLowerCase()) !== 0) return null;
    const rest = norm.slice(prefix.length);
    if (rest.length === 0) return null;
    const folderName = rest.split('/')[0];
    if (!folderName) return null;
    // Our own generated files at the specs root (registry.md, README.md).
    if (GENERATED_ROOT_FILES.includes(folderName)) return null;
    if (folderName.startsWith('.')) return null; // .archive/ + dot-dirs
    return folderName;
  }

  private async flush(root: string): Promise<void> {
    const state = this.states.get(root);
    if (!state) return;
    state.timer = null;
    const folderNames = [...state.pending];
    const unknown = state.pendingUnknown;
    state.pendingUnknown = false;
    state.pending.clear();
    const writerFolders = new Set(state.writerFolders);
    state.writerFolders.clear();
    const waiters = state.writerWaiters.splice(0);
    state.firstEventAt = null;
    const eventClasses = Object.fromEntries(state.eventClasses);
    state.eventClasses.clear();
    if (folderNames.length > 0) this.logger.debug('[task-specs] watcher batch', {
      folders: folderNames.length, writers: writerFolders.size, activeRoots: this.states.size, eventClasses,
    });
    try {
      // degradation-audit: reported - this only waits for the earlier rebuild
      // to settle; its rejection reaches the caller that scheduled it
      // (scheduleRebuild returns that promise).
      if (state.running) await state.running.catch(() => undefined);
    const changed: string[] = [];
    for (const name of folderNames) {
      try {
        const current = await this.fingerprintFolder(root, name);
        if (writerFolders.has(name) || !state.fingerprints.has(name) || current !== state.fingerprints.get(name)) changed.push(name);
      } catch (error: unknown) {
        this.logger.debug('[task-specs] watcher carrier comparison unavailable', {
          error: error instanceof Error ? error.message : String(error),
        });
        changed.push(name);
      }
    }
      const reason = writerFolders.size > 0 ? 'write' : 'watcher';
      const result = unknown || folderNames.length > MAX_FOLDER_REBUILD
        ? await this.scheduleRebuild(root, [], reason, true, true)
        : changed.length > 0 ? await this.scheduleRebuild(root, changed, reason) : null;
      if (result) this.assertIndexPersisted(result);
      for (const { resolve } of waiters) resolve();
      const suppressed = folderNames.length - changed.length;
      if (suppressed > 0) this.logger.info('[task-specs] watcher echoes suppressed', { suppressed });
      for (const name of folderNames) state.flushRetries.delete(name);
      if (unknown) state.flushRetries.delete(UNKNOWN_FLUSH_RETRY);
    } catch (error: unknown) {
      for (const { reject } of waiters) reject(error);
      for (const name of writerFolders) state.writerFolders.add(name);
      if (unknown) state.pendingUnknown = true;
      let nextDelay = Number.POSITIVE_INFINITY;
      for (const name of folderNames) {
        const attempts = state.flushRetries.get(name) ?? 0;
        state.flushRetries.set(name, Math.min(attempts + 1, FLUSH_RETRY_MS.length));
        state.pending.add(name);
        nextDelay = Math.min(nextDelay, FLUSH_RETRY_MS[Math.min(attempts, FLUSH_RETRY_MS.length - 1)]);
      }
      if (unknown) {
        const attempts = state.flushRetries.get(UNKNOWN_FLUSH_RETRY) ?? 0;
        state.flushRetries.set(UNKNOWN_FLUSH_RETRY, Math.min(attempts + 1, FLUSH_RETRY_MS.length));
        nextDelay = Math.min(nextDelay, FLUSH_RETRY_MS[Math.min(attempts, FLUSH_RETRY_MS.length - 1)]);
      }
      const retry = (state.pending.size > 0 || unknown) && Number.isFinite(nextDelay);
      this.logger.debug('[task-specs] watcher flush failed', {
        error: error instanceof Error ? error.name : 'Unknown error',
        retryInMs: retry ? nextDelay : null,
      });
      if (retry && this.states.get(root) === state) this.armFlush(root, state, nextDelay, true);
    }
  }

  private assertIndexPersisted(result: RebuildResult): void {
    if (!result.indexWritten && this.store.isReady()) {
      throw new Error('task index write not persisted');
    }
  }

  private scheduleRebuild(
    root: string,
    folders: string[],
    reason: TaskIndexChangeEvent['reason'],
    emit = true,
    forceFull = false,
  ): Promise<RebuildResult> {
    const state = this.states.get(root);
    if (!state) return this.rebuildQueue.enqueue(root, (queuedFolders, queuedForceFull) => this.rebuild(root, queuedFolders, reason, emit, 0, 1, queuedForceFull), folders, forceFull);
    if (state.running) {
      for (const folder of folders) state.trailingFolders.add(folder);
      state.trailingForceFull ||= forceFull;
      state.trailingEmit ||= emit;
      if (reason === 'reindex' || (reason === 'write' && state.trailingReason === 'watcher')) {
        state.trailingReason = reason;
      }
      state.trailingCount++;
      if (!state.trailing) {
        const running = state.running;
        const queuedAt = this.now();
        // degradation-audit: reported - this only waits for the running
        // rebuild to settle; its rejection reaches the caller that scheduled
        // it (scheduleRebuild returned that promise).
        const trailing = running.catch(() => undefined).then(() => {
          const nextFolders = [...state.trailingFolders];
          const nextReason = state.trailingReason;
          const nextForceFull = state.trailingForceFull;
          const nextEmit = state.trailingEmit;
          const count = state.trailingCount;
          state.trailingFolders.clear();
          state.trailingCount = 0;
          state.trailingReason = 'watcher';
          state.trailingForceFull = false;
          state.trailingEmit = false;
          const next = this.rebuildQueue.enqueue(root, (queuedFolders, queuedForceFull) => this.rebuild(root, queuedFolders, nextReason, nextEmit, this.now() - queuedAt, count, queuedForceFull), nextFolders, nextForceFull);
          state.running = next;
          state.trailing = null;
          void next.then(() => { if (state.running === next && !state.trailing) state.running = null; },
            () => { if (state.running === next && !state.trailing) state.running = null; });
          return next;
        });
        state.trailing = trailing;
        void trailing.finally(() => {
          if (state.trailing === trailing) state.trailing = null;
        }).catch((error: unknown) => {
          this.logger.warn('[task-specs] trailing rebuild failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
      return state.trailing;
    }
    const run = this.rebuildQueue.enqueue(root, (queuedFolders, queuedForceFull) => this.rebuild(root, queuedFolders, reason, emit, 0, 1, queuedForceFull), folders, forceFull);
    state.running = run;
    void run.then(() => { if (state.running === run && !state.trailing) state.running = null; },
      () => { if (state.running === run && !state.trailing) state.running = null; });
    return run;
  }

  /**
   * Full scans replace the workspace; changed-folder scans apply a transaction.
   * `emit` gates the push so the silent warm-up doesn't broadcast.
   *
   * The scan is unconditional; only the WRITE is skipped when the store reports
   * it cannot accept one yet. `indexWritten` in the result says which happened,
   * and it is what `ensureStarted` latches on.
   * Folder results equal a full scan when every change was observed by the watcher
   * or preceded by a written full scan.
   * Earlier-session meta can enable folder mode before this session's first full write; the in-process excluded map stays empty until the re-warm full scan repairs it.
   */
  private async rebuild(
    root: string,
    folderNames: string[],
    reason: TaskIndexChangeEvent['reason'],
    emit: boolean,
    waitedMs: number,
    coalesced: number,
    forceFull = false,
  ): Promise<RebuildResult> {
    const started = this.now();
    let enumerateMs = 0;
    let readMs = 0;
    let parseValidateMs = 0;
    let replaceMs = 0;
    let listenerMs = 0;
    let carriers = 0;
    let rows = 0;
    let failed = true;
    let scanMs = 0;
    let mode: 'full' | 'folders' = 'full';
    try {
    const state = this.states.get(root);
    if (state) {
      state.eventsDuringRebuild.clear();
      await this.captureFingerprints(root, state, folderNames);
    }
    const scanStarted = this.now();
    let folderScan: Awaited<ReturnType<TaskScannerService['scanFolders']>> | null = null;
    let stored: TaskSpecSummary[] = [];
    const canScanFolders = !forceFull && reason !== 'reindex' && folderNames.length > 0 && folderNames.length <= MAX_FOLDER_REBUILD &&
      folderNames.every(isSingleTaskPathSegment) && this.store.isReady();
    const metaRead = canScanFolders ? this.safeGetMeta(root) : null;
    // The SQLite store persists only the excluded COUNT. After a restart its
    // in-memory excluded rows are empty, so a folder update would overwrite the
    // count from an empty baseline. Use a full scan until the rows match it.
    const priorMeta = metaRead !== null && metaRead.excluded.length === metaRead.excludedCount ? metaRead : null;
    if (metaRead !== null && priorMeta === null) {
      this.logger.debug('[task-specs] folder rebuild needs a full scan: excluded rows not loaded', {
        excludedCount: metaRead.excludedCount,
      });
    }
    if (priorMeta !== null) {
      try {
        folderScan = await this.scanner.scanFolders(root, folderNames);
        stored = this.store.listByWorkspace(root);
        const oldByFolder = new Map(stored.map((task) => [task.folderName, task]));
        const sameGraph = (a: TaskSpecSummary, b: TaskSpecSummary): boolean =>
          a.id === b.id && a.parent === b.parent &&
          JSON.stringify([a.dependsOn, a.duplicates, a.relatesTo]) ===
          JSON.stringify([b.dependsOn, b.duplicates, b.relatesTo]);
        const changedPresence = new Set([
          ...folderScan.tasks.filter((task) => !oldByFolder.has(task.folderName)).map((task) => task.folderName),
          ...folderScan.deletedFolders,
        ]);
        const referenced = [...changedPresence].some((name) => stored.some((task) =>
          task.folderName !== name && [task.parent, ...task.dependsOn, ...task.duplicates, ...task.relatesTo]
            .some((ref) => ref !== undefined && (ref === name || ref === oldByFolder.get(name)?.id ||
              ref === folderScan?.tasks.find((scanned) => scanned.folderName === name)?.id))));
        if (referenced || folderScan.tasks.some((task) => {
          const old = oldByFolder.get(task.folderName);
          return old !== undefined && !sameGraph(task, old);
        })) {
          folderScan = null;
        } else {
          const touched = new Set(folderNames);
          const graph = stored.filter((task) => !touched.has(task.folderName));
          this.scanner.mergeCrossFileIssues(folderScan.tasks, [...graph, ...folderScan.tasks]);
          mode = 'folders';
        }
      } catch (error: unknown) {
        folderScan = null;
        stored = [];
        this.logger.warn('[task-specs] folder rebuild failed; retrying full scan', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const scan = folderScan ?? await this.scanner.scan(root);
    scanMs = this.now() - scanStarted;
    enumerateMs = scan.timing?.enumerateMs ?? 0;
    readMs = scan.timing?.readMs ?? 0;
    parseValidateMs = scan.timing?.parseValidateMs ?? 0;
    carriers = scan.timing?.carriers ?? 0;
    // Keep unsafe names visible in the board's excluded list instead of
    // silently dropping them from the scanner's directory candidates.
    const excluded = [...scan.excluded];
    const readableTasks = scan.tasks.filter((task) => {
      if (isSingleTaskPathSegment(task.folderName)) return true;
      excluded.push({ folderName: task.folderName, reason: 'unreadable' });
      return false;
    });
    const summaries: TaskSpecSummary[] = readableTasks.map(
      ({ body: _body, ...summary }) => summary,
    );
    rows = summaries.length;
    let indexWritten = true;
    if (!this.store.isReady()) {
      // The one PREDICTABLE offline case, and the whole reason `isReady()`
      // exists (TASK_2026_306 task 4.4). Both Electron and the CLI register the
      // store in the same DI pass as the activation warm-up but call
      // `openAndMigrate` hundreds of log lines later, so this first warm-up runs
      // against a connection that is certain to reject the write. Attempting it
      // anyway produced `Persistence is offline` as a WARN on every clean boot —
      // an expected outcome in the channel reserved for unexpected ones, which
      // is how a reader learns to ignore the channel.
      //
      // ONLY the write is skipped. The scan above already ran, so
      // `state.specsDirExists` below is set from it and `ensureSpecsReadme` still
      // writes the contract doc — which is why this guard costs nothing on a host
      // where `openAndMigrate` genuinely never succeeds. `indexWritten: false`
      // still un-latches `ensureStarted`, so the `onDidOpen` re-warm in
      // `di/start-index.ts` performs the real rebuild moments later.
      indexWritten = false;
      this.logger.debug(
        '[task-specs] index rebuild write skipped — store not ready yet',
      );
    } else {
      try {
        const replaceStarted = this.now();
        try {
          if (folderScan) this.store.applyFolderChanges(root, summaries, folderScan.deletedFolders, excluded);
          else this.store.replaceWorkspace(root, summaries, excluded);
        }
        finally { replaceMs = this.now() - replaceStarted; }
      } catch (error: unknown) {
        if (folderScan) {
          this.logger.warn('[task-specs] folder index write failed; retrying full scan', {
            error: error instanceof Error ? error.message : String(error),
          });
          return this.rebuild(root, folderNames, reason, emit, waitedMs, coalesced, true);
        }
        indexWritten = false;
        // WARN, not ERROR: this is recoverable, not a defect. `ensureStarted`
        // treats it as "not started" and a later call performs a real rebuild.
        //
        // Reaching here means a store that reported itself READY failed anyway —
        // a closed connection, a full disk, a corrupt page. That is unpredicted
        // and belongs in this channel. The guard above removed the one predicted
        // failure from it; it did not remove the channel.
        this.logger.warn('[task-specs] index rebuild write failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (state && 'specsDirExists' in scan) state.specsDirExists = scan.specsDirExists;
    if (state) {
      if (!indexWritten) state.fingerprints.clear();
      for (const name of state.eventsDuringRebuild) state.fingerprints.delete(name);
      state.eventsDuringRebuild.clear();
    }
    if (emit) {
      const listenerStarted = this.now();
      try { this.fireChange({ workspaceRoot: root, folderNames, reason }); }
      finally { listenerMs = this.now() - listenerStarted; }
    }
    failed = !indexWritten && this.store.isReady();
    return {
      indexedCount: folderScan ? stored.filter((task) => !folderNames.includes(task.folderName)).length + summaries.length : summaries.length,
      excludedCount: folderScan ? (priorMeta?.excluded ?? []).filter((row) => !folderNames.includes(row.folderName)).length + excluded.length : excluded.length,
      indexWritten,
    };
    } finally {
      if (failed) this.states.get(root)?.fingerprints.clear();
      const trigger = reason === 'write' ? 'writer' : reason === 'reindex' && !emit ? 'activation' : reason;
      const rootRebuilds = (this.rootRebuildCounts.get(root) ?? 0) + 1;
      const triggerRebuilds = (this.triggerRebuildCounts.get(trigger) ?? 0) + 1;
      this.rootRebuildCounts.set(root, rootRebuilds);
      this.triggerRebuildCounts.set(trigger, triggerRebuilds);
      logRebuildTiming(this.logger, {
        trigger, rootId: createHash('sha256').update(root).digest('hex').slice(0, 8),
        activeRoots: this.states.size, scanMs, rootRebuilds, triggerRebuilds,
        enumerateMs, readMs, parseValidateMs, sqliteReplaceMs: replaceMs,
        listenerMs, waitedMs, totalMs: this.now() - started + waitedMs,
        carriers, rows, coalesced, failed, mode,
      });
    }
  }

  private async fingerprintFolder(root: string, name: string): Promise<string | null> {
    const folder = path.join(root, '.ptah', 'specs', name);
    if (!(await this.fs.exists(folder))) return null;
    const entries = await this.fs.readDirectory(folder);
    if (entries.length > 128) throw new Error('Task folder fingerprint limit exceeded');
    const hash = createHash('sha256');
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      hash.update(entry.name);
      hash.update(String(entry.type));
      if (entry.type !== FileType.File) continue;
      const file = path.join(folder, entry.name);
      const stat = await this.fs.lstat(file);
      hash.update(String(stat.size));
      const read = await this.fs.readFileBoundedNoFollow(file, 1024 * 1024);
      if (read.truncated) throw new Error('Task file fingerprint limit exceeded');
      hash.update(read.bytes);
    }
    return hash.digest('hex');
  }

  private async captureFingerprints(root: string, state: WorkspaceState, touched: string[]): Promise<void> {
    try {
      const full = touched.length === 0;
      const entries = full ? await this.fs.readDirectory(path.join(root, '.ptah', 'specs')) : [];
      const names = entries.filter((entry) => entry.type === FileType.Directory &&
        isSingleTaskPathSegment(entry.name)).map((entry) => entry.name);
      const next = full ? new Map<string, string | null>() : new Map(state.fingerprints);
      for (const name of names.slice(0, 512)) {
        try { next.set(name, await this.fingerprintFolder(root, name)); }
        catch (error: unknown) {
          this.logger.debug('[task-specs] folder fingerprint unavailable', {
            error: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }
      for (const name of touched) {
        try { next.set(name, await this.fingerprintFolder(root, name)); }
        catch (error: unknown) {
          next.delete(name);
          this.logger.debug('[task-specs] touched folder fingerprint unavailable', {
            error: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }
      while (next.size > 512) {
        const oldest = next.keys().next();
        if (oldest.done) break;
        next.delete(oldest.value);
      }
      state.fingerprints = next;
    } catch (error: unknown) {
      this.logger.debug('[task-specs] fingerprint capture unavailable', {
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      state.fingerprints.clear();
    }
  }

  private safeGetMeta(root: string): ReturnType<ITaskIndexStore['getMeta']> {
    try {
      return this.store.getMeta(root);
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn here; null reads as "no
      // index metadata", the same as an index that was never written.
      this.logger.warn('[task-specs] index getMeta failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

}

