/**
 * Task-end transition detector (TASK_2026_886, plan Component 4).
 *
 * Turns task-index changes and startup state into journal observations
 * without touching the status write path:
 *
 * - **Observation.** The `onDidChangeIndex` listener only records a "seen"
 *   entry in memory (O(1), no I/O, no SQLite, no `list()`), and arms the
 *   root's commit timer only when no writer call is in flight for that root.
 * - **Commit boundary.** A root's commit is scheduled only from the writer's
 *   `onDidSettleWrites` signal or from the listener with no write in flight,
 *   always as an `unref`'d macrotask timer (`OBSERVE_DEBOUNCE_MS`), never
 *   inline. Every promise continuation of the settled write therefore runs
 *   before the commit. When the timer fires the gate is re-checked: a write
 *   that started meanwhile defers the commit to its own settle signal.
 * - **Commit (flush).** Serialised, one at a time. Resolves the repository
 *   identity and the main root, reads `taskIndex.list(root)` at commit time,
 *   and journals each named, valid carrier through `ITaskEndStore`.
 * - **Startup.** `reconcileStartup()` baselines a new repository (no runs) or
 *   journals every visible carrier with source `startup-reconcile`, then
 *   creates runs for orphaned transitions. Newly added workspace folders are
 *   reconciled the same way.
 *
 * The hook-disabled setting keeps journaling: the store records terminal
 * entries with `noRunReason: hook-disabled` (policy built from the Batch 4
 * settings snapshot, Decision D11). The detector never throws into an event
 * emitter; a failed flush is logged and dropped, and the next event or
 * startup recovers it because the journal compares against the carrier.
 */
import * as fs from 'node:fs/promises';
import { inject, injectable } from 'tsyringe';
import {
  createEvent,
  normalizeWorkspaceRoot,
  PLATFORM_TOKENS,
  type IDisposable,
  type IEvent,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import type {
  TaskEndTriggerSource,
  TaskSpecSummary,
} from '@ptah-extension/shared';
import {
  TASK_SPECS_TOKENS,
  type TaskIndexChangeEvent,
  type TaskIndexService,
  type TaskWriterService,
  type TaskWritesSettledEvent,
} from '@ptah-extension/task-specs';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { TaskEndHookSettingsReader } from '../config/task-end-hook-config';
import { TASK_END_TOKENS } from '../di/tokens';
import type {
  ITaskEndStore,
  TaskEndObservationClass,
  TaskEndRunPolicy,
} from '../persistence/task-end-store.interface';
import type { GitReadRunner } from '../ports/git-read-runner.port';
import { ReadOnlyGit } from '../ports/read-only-git';
import { MainRootResolver } from './main-root-resolver';
import {
  RepositoryIdentityResolver,
  type RepositoryIdentity,
} from './repository-identity';

/** Delay between the commit boundary and the journal commit. */
export const OBSERVE_DEBOUNCE_MS = 250;

/** The task index members the detector reads. */
export type TaskEndIndexSource = Pick<
  TaskIndexService,
  'onDidChangeIndex' | 'list' | 'ensureStarted'
>;

/** The writer members that form the post-write boundary (Component 4a). */
export type TaskEndWriteGate = Pick<
  TaskWriterService,
  'hasWriteInFlight' | 'onDidSettleWrites'
>;

/** Fired after a flush or reconcile created or cancelled at least one run. */
export interface TaskEndRunsChanged {
  readonly createdRunIds: readonly string[];
  readonly cancelledRunIds: readonly string[];
}

/** One root's seen-but-uncommitted changes. */
interface PendingEntry {
  /** Set by a reindex or an event without folder names: every row. */
  all: TaskEndTriggerSource | null;
  /** Named folders and the source that saw each. */
  readonly folders: Map<string, TaskEndTriggerSource>;
}

/** Where a root's rows come from and which ones a commit takes. */
type CommitScope =
  | { readonly kind: 'pending'; readonly entry: PendingEntry }
  | { readonly kind: 'startup' };

/** Runs created or cancelled by one flush or reconcile. */
interface RunChanges {
  readonly created: string[];
  readonly cancelled: string[];
}

function newChanges(): RunChanges {
  return { created: [], cancelled: [] };
}

/** What every observation of one root commit shares. */
interface CommitContext {
  readonly seenRoot: string;
  readonly identity: RepositoryIdentity;
  readonly mainRoot: string | null;
  readonly policy: TaskEndRunPolicy;
  readonly changes: RunChanges;
}

/** A write outranks a reindex, which outranks a watcher echo. */
const SOURCE_RANK: Readonly<Record<TaskEndTriggerSource, number>> = {
  write: 3,
  reindex: 2,
  watcher: 1,
  'startup-reconcile': 0,
};

function stronger(
  current: TaskEndTriggerSource | null | undefined,
  next: TaskEndTriggerSource,
): TaskEndTriggerSource {
  return current === null ||
    current === undefined ||
    SOURCE_RANK[next] > SOURCE_RANK[current]
    ? next
    : current;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

@injectable()
export class TaskEndTransitionDetector {
  private readonly identities: RepositoryIdentityResolver;
  private readonly mainRoots: MainRootResolver;
  private readonly pending = new Map<string, PendingEntry>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Normalised roots reconciled by startup or a folder change. */
  private readonly reconciledRoots = new Set<string>();
  private readonly subscriptions: IDisposable[] = [];
  private readonly abort = new AbortController();
  private readonly fireRunsChanged: (event: TaskEndRunsChanged) => void;
  /** Serialises flushes and reconciles; never rejects. */
  private chain: Promise<void> = Promise.resolve();
  private subscribed = false;
  private disposed = false;

  /** The worker subscribes and calls `wake()` (plan Component 4). */
  readonly onDidChangeRuns: IEvent<TaskEndRunsChanged>;

  constructor(
    @inject(TASK_END_TOKENS.STORE) private readonly store: ITaskEndStore,
    @inject(TASK_SPECS_TOKENS.TASK_INDEX_SERVICE)
    private readonly taskIndex: TaskEndIndexSource,
    @inject(TASK_SPECS_TOKENS.TASK_WRITER)
    private readonly writer: TaskEndWriteGate,
    @inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
    private readonly workspace: Pick<
      IWorkspaceProvider,
      'getWorkspaceFolders' | 'onDidChangeWorkspaceFolders'
    >,
    @inject(TASK_END_TOKENS.GIT_READ_RUNNER) gitRunner: GitReadRunner,
    @inject(TASK_END_TOKENS.SETTINGS_READER)
    private readonly settings: Pick<TaskEndHookSettingsReader, 'read'>,
    @inject(TOKENS.LOGGER)
    private readonly logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
  ) {
    const git = new ReadOnlyGit(gitRunner);
    const realpath = (target: string): Promise<string> => fs.realpath(target);
    this.identities = new RepositoryIdentityResolver(git, realpath);
    this.mainRoots = new MainRootResolver({
      git,
      identities: this.identities,
      realpath,
      logger,
    });
    const [event, fire] = createEvent<TaskEndRunsChanged>();
    this.onDidChangeRuns = event;
    this.fireRunsChanged = fire;
  }

  // --- Lifecycle -----------------------------------------------------------

  /**
   * Baselines or reconciles every registered workspace folder, then creates
   * runs for orphaned terminal transitions (AC 1.6, 1.9, 1.10, 1.12b).
   * Resolves after the work is done; never rejects.
   */
  reconcileStartup(): Promise<void> {
    return this.enqueue(async () => {
      const changes = newChanges();
      for (const root of this.registeredRoots()) {
        await this.reconcileRoot(root, changes);
      }
      this.createOrphanRuns(changes);
      this.announce(changes);
    });
  }

  /**
   * Subscribes to index changes, writer settle signals and workspace folder
   * changes. Idempotent; safe before or after `reconcileStartup()` because
   * both run on the same serial chain.
   */
  subscribe(): void {
    if (this.subscribed || this.disposed) return;
    this.subscribed = true;
    this.subscriptions.push(
      this.taskIndex.onDidChangeIndex((event) => this.onIndexChange(event)),
      this.writer.onDidSettleWrites((event) => this.onWritesSettled(event)),
      this.workspace.onDidChangeWorkspaceFolders(() =>
        this.onWorkspaceFoldersChanged(),
      ),
    );
  }

  /**
   * Resolves once every queued flush and reconcile has finished. Pending
   * entries whose timer has not fired are not waited for.
   */
  whenIdle(): Promise<void> {
    return this.chain;
  }

  /**
   * Unsubscribes, clears the commit timers, drops uncommitted entries (the
   * next startup reconcile recovers them) and aborts in-flight git calls.
   * Idempotent. Await `whenIdle()` afterwards to let a running flush end.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const subscription of this.subscriptions.splice(0)) {
      subscription.dispose();
    }
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.pending.clear();
    this.abort.abort();
  }

  // --- Listeners (O(1), no I/O) -------------------------------------------

  private onIndexChange(event: TaskIndexChangeEvent): void {
    try {
      if (this.disposed) return;
      const root = normalizeWorkspaceRoot(event.workspaceRoot);
      const source: TaskEndTriggerSource = event.reason;
      let entry = this.pending.get(root);
      if (entry === undefined) {
        entry = { all: null, folders: new Map() };
        this.pending.set(root, entry);
      }
      if (event.reason === 'reindex' || event.folderNames.length === 0) {
        entry.all = stronger(entry.all, source);
      } else {
        for (const folder of event.folderNames) {
          entry.folders.set(
            folder,
            stronger(entry.folders.get(folder), source),
          );
        }
      }
      if (!this.writer.hasWriteInFlight(root)) this.armCommit(root);
    } catch (error: unknown) {
      // Never throw into the index emitter: it runs inside the writer's
      // notification. The next event or startup reconcile recovers it.
      this.logger.warn('[task-end-hook] index event not recorded', {
        error: errorText(error),
      });
    }
  }

  private onWritesSettled(event: TaskWritesSettledEvent): void {
    if (this.disposed) return;
    const root = normalizeWorkspaceRoot(event.workspaceRoot);
    // A settle with nothing seen for the root is a no-op flush: no timer.
    if (this.pending.has(root)) this.armCommit(root);
  }

  private onWorkspaceFoldersChanged(): void {
    if (this.disposed) return;
    const current = new Set(this.registeredRoots());
    for (const known of [...this.reconciledRoots]) {
      // A removed folder is reconciled again if it is added back later.
      if (!current.has(known)) this.reconciledRoots.delete(known);
    }
    const added = [...current].filter(
      (root) => !this.reconciledRoots.has(root),
    );
    if (added.length === 0) return;
    void this.enqueue(async () => {
      const changes = newChanges();
      for (const root of added) {
        await this.reconcileRoot(root, changes);
      }
      this.announce(changes);
    });
  }

  // --- Commit scheduling ---------------------------------------------------

  /** Arms the root's commit timer unless one is already armed. */
  private armCommit(root: string): void {
    if (this.timers.has(root)) return;
    const timer = setTimeout(
      () => this.onCommitTimer(root),
      OBSERVE_DEBOUNCE_MS,
    );
    timer.unref?.();
    this.timers.set(root, timer);
  }

  private onCommitTimer(root: string): void {
    this.timers.delete(root);
    if (this.disposed) return;
    // A write started after the boundary: its settle signal re-arms.
    if (this.writer.hasWriteInFlight(root)) return;
    const entry = this.pending.get(root);
    if (entry === undefined) return;
    this.pending.delete(root);
    void this.enqueue(async () => {
      const changes = newChanges();
      await this.commitRoot(root, { kind: 'pending', entry }, changes);
      this.announce(changes);
    });
  }

  /** Appends `work` to the serial chain; the chain never rejects. */
  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.chain.then(async () => {
      if (this.disposed) return;
      try {
        await work();
      } catch (error: unknown) {
        this.logger.warn('[task-end-hook] detector flush failed', {
          error: errorText(error),
        });
      }
    });
    this.chain = next;
    return next;
  }

  // --- Commit --------------------------------------------------------------

  private async reconcileRoot(
    root: string,
    changes: RunChanges,
  ): Promise<void> {
    this.reconciledRoots.add(root);
    try {
      await this.taskIndex.ensureStarted(root);
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn; the root is skipped
      // and left unmarked, so the next startup or folder change retries it.
      this.reconciledRoots.delete(root);
      this.logger.warn('[task-end-hook] task index start failed', {
        error: errorText(error),
      });
      return;
    }
    await this.commitRoot(root, { kind: 'startup' }, changes);
  }

  /**
   * One root's commit: identity, main root, carriers read now, then the
   * baseline (new repository) or one journal observation per carrier.
   */
  private async commitRoot(
    root: string,
    scope: CommitScope,
    changes: RunChanges,
  ): Promise<void> {
    const signal = this.abort.signal;
    const identityResult = await this.identities.resolve(root, signal);
    if (identityResult.kind !== 'ok') {
      this.logger.warn('[task-end-hook] repository identity unresolved', {
        error: identityResult.error,
      });
      return;
    }
    const identity = identityResult.identity;
    const mainRoot = await this.mainRoots.resolve(root, identity, signal);

    if (scope.kind === 'pending' && this.writer.hasWriteInFlight(root)) {
      // Never read a carrier while a write for its root is in flight: put
      // the entry back; that write's settle signal re-arms the commit.
      this.requeue(root, scope.entry);
      return;
    }
    if (this.disposed) return;

    const listing = await this.taskIndex.list(root);
    const rows = listing.tasks.filter((row) => row.frontmatterValid);

    if (!this.store.isBaselined(identity.repoId)) {
      this.store.recordBaseline(
        identity.repoId,
        mainRoot,
        rows.map((row) => ({
          taskId: row.id,
          status: row.status,
          seenRoot: root,
        })),
      );
      this.logger.info('[task-end-hook] repository baselined', {
        entries: rows.length,
      });
      return;
    }
    if (mainRoot !== null)
      this.store.rememberMainRoot(identity.repoId, mainRoot);

    const commit: CommitContext = {
      seenRoot: root,
      identity,
      mainRoot,
      policy: this.policy(),
      changes,
    };
    for (const { row, source } of this.selectRows(rows, scope)) {
      this.journal(row, source, commit);
    }
  }

  private selectRows(
    rows: readonly TaskSpecSummary[],
    scope: CommitScope,
  ): { row: TaskSpecSummary; source: TaskEndTriggerSource }[] {
    if (scope.kind === 'startup') {
      return rows.map((row) => ({ row, source: 'startup-reconcile' as const }));
    }
    const { entry } = scope;
    const selected: { row: TaskSpecSummary; source: TaskEndTriggerSource }[] =
      [];
    for (const row of rows) {
      const named = entry.folders.get(row.folderName);
      const source =
        named === undefined ? entry.all : stronger(entry.all, named);
      if (source !== null) selected.push({ row, source });
    }
    return selected;
  }

  private journal(
    row: TaskSpecSummary,
    source: TaskEndTriggerSource,
    commit: CommitContext,
  ): void {
    let result: TaskEndObservationClass;
    try {
      result = this.store.journalObservation(
        {
          repoId: commit.identity.repoId,
          taskId: row.id,
          status: row.status,
          source,
          seenRoot: commit.seenRoot,
          mainRoot: commit.mainRoot,
        },
        commit.policy,
      );
    } catch (error: unknown) {
      // One carrier's transaction rolled back; the others still commit, and
      // the next event or startup reconcile retries this one.
      this.logger.error(
        '[task-end-hook] journal observation failed',
        asError(error),
      );
      return;
    }
    switch (result.kind) {
      case 'duplicate':
        this.logger.info('[task-end-hook] duplicate-ignored', {
          dedupeKey: result.dedupeKey,
        });
        return;
      case 'terminal-entry':
        if (result.entry.kind === 'run')
          commit.changes.created.push(result.entry.runId);
        this.logger.info('[task-end-hook] terminal entry journaled', {
          dedupeKey: result.dedupeKey,
          entry: result.entry,
        });
        return;
      case 'reversion':
        commit.changes.cancelled.push(...result.cancelledRunIds);
        this.logger.info('[task-end-hook] status reverted', {
          taskId: row.id,
          cancelledRuns: result.cancelledRunIds.length,
        });
        return;
      case 'no-op':
      case 'non-terminal-update':
        return;
    }
  }

  private createOrphanRuns(changes: RunChanges): void {
    try {
      changes.created.push(...this.store.createRunForOrphans(this.policy()));
    } catch (error: unknown) {
      // The orphans stay committed without a run; the next startup retries.
      this.logger.error(
        '[task-end-hook] orphan run creation failed',
        asError(error),
      );
    }
  }

  /** Merges an entry taken by a commit back into the root's pending map. */
  private requeue(root: string, entry: PendingEntry): void {
    const current = this.pending.get(root);
    if (current === undefined) {
      this.pending.set(root, entry);
      return;
    }
    if (entry.all !== null) current.all = stronger(current.all, entry.all);
    for (const [folder, source] of entry.folders) {
      current.folders.set(
        folder,
        stronger(current.folders.get(folder), source),
      );
    }
  }

  private announce(changes: RunChanges): void {
    if (changes.created.length === 0 && changes.cancelled.length === 0) return;
    try {
      this.fireRunsChanged({
        createdRunIds: changes.created,
        cancelledRunIds: changes.cancelled,
      });
    } catch (error: unknown) {
      // A throwing subscriber must not fail the flush; the worker's own
      // timer still finds the runs.
      this.logger.warn('[task-end-hook] runs-changed listener failed', {
        error: errorText(error),
      });
    }
  }

  /** The store's run policy from a fresh settings snapshot (Decision D11). */
  private policy(): TaskEndRunPolicy {
    const snapshot = this.settings.read();
    return {
      hookEnabled: snapshot.enabled,
      settleWindowMs: snapshot.settleWindowMs,
      queueCap: snapshot.queueCap,
    };
  }

  private registeredRoots(): string[] {
    const roots = new Set<string>();
    for (const folder of this.workspace.getWorkspaceFolders()) {
      roots.add(normalizeWorkspaceRoot(folder));
    }
    return [...roots];
  }
}
