/**
 * ProviderSessionPool — the single host-side owner of provider-session
 * processes (plan decision A15). It keys live sessions by chat session id,
 * serialises open/load/close per id, enforces a host-wide live cap with LRU
 * eviction of idle entries, closes idle entries, mints and revokes the Ptah
 * MCP caller credential of each process, and records pids for the crash
 * sweep. The chat adapter, the history port and per-tab close all go
 * through it.
 */
import {
  ProviderSessionChatAdapterError,
  type ProviderSessionReleaseReason,
} from '@ptah-extension/agent-sdk';
import {
  INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS,
  type IMcpCallerCredentials,
  type McpCallerToolProfile,
} from '@ptah-extension/platform-core';
import {
  createFlatStreamProjector,
  type ProviderSession,
  type ProviderSessionAttach,
  type ProviderSessionOpenRequest,
  type ProviderSessionRuntime,
  type ProviderSessionSpawnedProcess,
} from '@ptah-extension/provider-session-contracts';
import type {
  FlatStreamEventUnion,
  ProviderSessionProfileId,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { ProviderSessionPidLedger } from './provider-session-pid-ledger';

/** Host-wide live process cap (agy unpacks about 1 GB per process). */
export const PROVIDER_SESSION_MAX_LIVE = 3;
/** An entry with no turn for this long is closed by the sweep. */
export const PROVIDER_SESSION_IDLE_CLOSE_MS = 10 * 60 * 1000;
/** One sweep per pool. */
export const PROVIDER_SESSION_SWEEP_INTERVAL_MS = 60 * 1000;
/** A history read covers an agy cold start. */
export const PROVIDER_SESSION_HISTORY_TIMEOUT_MS = 90 * 1000;
/** Bound of one entry's close. */
export const PROVIDER_SESSION_CLOSE_TIMEOUT_MS = 5 * 1000;

/** The runtime a profile opens through, with what its agent advertises. */
export interface ProviderSessionPoolRuntime {
  readonly runtime: ProviderSessionRuntime;
  /** The agent advertises `session/load` (native history replay). */
  readonly load: boolean;
}

/** What the pool hands the request builder for one open. */
export interface ProviderSessionPoolOpenContext {
  /** Raw Ptah MCP caller token; absent when no credential could be minted. */
  readonly mcpToken?: string;
  /** Chosen by the pool; absent for a new session. */
  readonly attach?: ProviderSessionAttach;
}

export interface ProviderSessionPoolRequest {
  readonly profile: ProviderSessionProfileId;
  /** Workspace the credential is bound to. */
  readonly workspaceRoot: string;
  /** Stored native id; attaches with `resume` (send) or `load` (history). */
  readonly nativeSessionId?: string;
  /** False: the session attaches no Ptah MCP, so no credential is minted. */
  readonly ptahMcp?: boolean;
  /** Bound into the credential; `apps` limits the caller to the Apps tools. */
  readonly toolProfile?: McpCallerToolProfile;
  /**
   * Fingerprint of the open options a running process cannot change (its MCP
   * set and tool profile). A live entry opened with a different key (a
   * history read's open, adopted by a send) is reopened by `acquire`.
   */
  readonly openOptionsKey?: string;
  /**
   * Builds the runtime request; called once per open, inside the mutex and
   * before a cap slot is taken. A reused live entry never builds, so a send
   * to a live process never re-runs CLI detection.
   */
  build(
    context: ProviderSessionPoolOpenContext,
  ): ProviderSessionOpenRequest | Promise<ProviderSessionOpenRequest>;
}

export interface ProviderSessionPoolHistory {
  readonly events: FlatStreamEventUnion[];
}

/**
 * Why a caller gives a session back: the adapter's reasons
 * (`ProviderSessionReleaseReason`, agent-sdk) plus the host-only paths
 * `deleted` (session:delete) and `crashed` (the process exited).
 */
export type ProviderSessionPoolReleaseReason =
  | ProviderSessionReleaseReason
  | 'deleted'
  | 'crashed';

type CloseReason =
  | ProviderSessionPoolReleaseReason
  | 'idle'
  | 'evicted'
  | 'history-reopen'
  | 'options-changed'
  | 'shutdown';

export type ProviderSessionHistoryErrorReason =
  | 'history-unavailable'
  | 'busy'
  | 'timeout';

/**
 * A history read the pool refused or could not finish. The history router
 * maps every port failure to `nativeReadFailed`; the reason stays internal.
 */
export class ProviderSessionHistoryError extends Error {
  constructor(
    readonly reason: ProviderSessionHistoryErrorReason,
    options?: ErrorOptions,
  ) {
    super(`Provider-session history ${reason}`, options);
    this.name = 'ProviderSessionHistoryError';
  }
}

export interface ProviderSessionPoolDeps {
  /** The runtime injected for a profile; `undefined` when not bound in this host. */
  readonly runtimeFor: (
    profile: ProviderSessionProfileId,
  ) => ProviderSessionPoolRuntime | undefined;
  readonly credentials?: Pick<IMcpCallerCredentials, 'issue' | 'revokeSubject'>;
  readonly pidLedger: ProviderSessionPidLedger;
  readonly logger: Pick<Logger, 'debug' | 'warn' | 'error'>;
}

interface PoolEntry {
  readonly sessionId: string;
  readonly profile: ProviderSessionProfileId;
  readonly session: ProviderSession;
  readonly method: 'new' | 'resume' | 'load';
  /** Revoke key of this process's MCP credential; unique per open. */
  readonly credentialSubject: string;
  /** The open options it started with (`ProviderSessionPoolRequest.openOptionsKey`). */
  readonly openOptionsKey: string | undefined;
  readonly row: LedgerRow;
  lastActiveAt: number;
}

/**
 * The ledger row of one open's process. `watched`: the runtime reported the
 * spawn (`onSpawn`), so the row goes when the process exit is observed;
 * otherwise the pool records `getPid()` after the open and removes the row
 * only after a close that settled within the bound.
 */
interface LedgerRow {
  pid: number | undefined;
  watched: boolean;
}

/** One open in flight; `dispose` aborts it and waits (bounded) for it to settle. */
interface OpenInFlight {
  readonly abort: AbortController;
  settled: Promise<unknown>;
}

export class ProviderSessionPool {
  /** Insertion order is LRU order: a touch re-inserts the entry. */
  private readonly entries = new Map<string, PoolEntry>();
  private readonly locks = new Map<string, Promise<void>>();
  /** Opens in flight; they hold a cap slot before they own an entry. */
  private opening = 0;
  /** Every open not settled yet, so `dispose` can abort it. */
  private readonly inFlight = new Set<OpenInFlight>();
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  /** Makes each open's credential subject unique (see `credentialSubject`). */
  private openSequence = 0;

  constructor(private readonly deps: ProviderSessionPoolDeps) {}

  /**
   * The live session for `sessionId`, opening (or resuming) one when none is
   * live. A live entry whose open options differ (a history read opened it
   * with Ptah MCP only) is closed and resumed with this request's options,
   * under this id's lock; only the old process's credential is revoked.
   */
  acquire(
    sessionId: string,
    request: ProviderSessionPoolRequest,
    signal?: AbortSignal,
  ): Promise<ProviderSession> {
    return this.withLock(sessionId, async () => {
      const live = this.entries.get(sessionId);
      if (live && !mustReopen(live, request)) return this.touch(live).session;
      // The runtime is checked before the close: an unbound profile keeps
      // the live entry rather than leaving the tab with nothing.
      const runtime = this.runtimeOf(request.profile, 'acquire');
      if (live) await this.closeEntry(live, 'options-changed');
      const attach: ProviderSessionAttach | undefined = request.nativeSessionId
        ? {
            nativeSessionId: request.nativeSessionId,
            method: 'resume',
            onFailure: 'error',
          }
        : undefined;
      const entry = await this.open(sessionId, request, runtime, attach, signal);
      return entry.session;
    });
  }

  /**
   * The native replay of `sessionId`, projected to the flat stream. Opens with
   * `load` and keeps the session as the tab's live entry, so the next send
   * needs no second spawn.
   */
  acquireForHistory(
    sessionId: string,
    request: ProviderSessionPoolRequest,
    signal?: AbortSignal,
  ): Promise<ProviderSessionPoolHistory> {
    return this.withLock(sessionId, async () => {
      const live = this.entries.get(sessionId);
      // The renderer already holds the live scrollback of a load-opened entry.
      if (live?.method === 'load') return project(sessionId, this.touch(live).session);
      if (live?.session.isTurnRunning())
        throw new ProviderSessionHistoryError('busy');
      const runtime = this.deps.runtimeFor(request.profile);
      if (this.disposed || !runtime?.load || !request.nativeSessionId)
        throw new ProviderSessionHistoryError('history-unavailable');
      if (live) await this.closeEntry(live, 'history-reopen');
      const timeout = new AbortController();
      const timer = setTimeout(
        () => timeout.abort(new ProviderSessionHistoryError('timeout')),
        PROVIDER_SESSION_HISTORY_TIMEOUT_MS,
      );
      const unlink = linkAbort(signal, timeout);
      try {
        const entry = await this.open(
          sessionId,
          request,
          runtime,
          {
            nativeSessionId: request.nativeSessionId,
            method: 'load',
            onFailure: 'error',
          },
          timeout.signal,
        );
        return project(sessionId, entry.session);
      } finally {
        clearTimeout(timer);
        unlink();
      }
    });
  }

  /** Whether `session` is still the live entry of `sessionId` (no lock, O(1)). */
  holds(sessionId: string, session: ProviderSession): boolean {
    return this.entries.get(sessionId)?.session === session;
  }

  /** Close one entry; a no-op when `sessionId` is not live. */
  release(sessionId: string, reason: ProviderSessionPoolReleaseReason): Promise<void> {
    return this.withLock(sessionId, async () => {
      const entry = this.entries.get(sessionId);
      if (entry) await this.closeEntry(entry, reason);
    });
  }

  /** Close every live entry; the pool stays usable. */
  async releaseAll(): Promise<void> {
    await this.closeAll('reset');
  }

  /**
   * Close every entry (each bounded), abort every open in flight (the
   * runtime stops its process; a late session is closed) and stop the sweep;
   * later calls refuse. Waits for the aborted opens at most one close bound.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopSweep();
    const opens = [...this.inFlight];
    for (const open of opens)
      open.abort.abort(new ProviderSessionChatAdapterError('unavailable', 'acquire'));
    await Promise.all([
      this.closeAll('shutdown'),
      withinBound(
        Promise.allSettled(opens.map((open) => open.settled)),
        PROVIDER_SESSION_CLOSE_TIMEOUT_MS,
      ),
    ]);
  }

  private async closeAll(reason: CloseReason): Promise<void> {
    const entries = [...this.entries.values()];
    await Promise.all(entries.map((entry) => this.closeEntry(entry, reason)));
  }

  private runtimeOf(
    profile: ProviderSessionProfileId,
    operation: string,
  ): ProviderSessionPoolRuntime {
    const runtime = this.disposed ? undefined : this.deps.runtimeFor(profile);
    if (!runtime) throw new ProviderSessionChatAdapterError('unavailable', operation);
    return runtime;
  }

  /**
   * Opens and registers one entry. On failure nothing stays: the slot, the
   * credential and any late session are released before the error rethrows.
   */
  private async open(
    sessionId: string,
    request: ProviderSessionPoolRequest,
    runtime: ProviderSessionPoolRuntime,
    attach: ProviderSessionAttach | undefined,
    callerSignal: AbortSignal | undefined,
  ): Promise<PoolEntry> {
    // Aborted by the caller or by `dispose`; the runtime stops the process.
    const abort = new AbortController();
    const unlink = linkAbort(callerSignal, abort);
    const opening = this.openTracked(sessionId, request, runtime, attach, abort.signal);
    const tracked: OpenInFlight = { abort, settled: opening };
    this.inFlight.add(tracked);
    try {
      return await opening;
    } finally {
      this.inFlight.delete(tracked);
      unlink();
    }
  }

  private async openTracked(
    sessionId: string,
    request: ProviderSessionPoolRequest,
    { runtime }: ProviderSessionPoolRuntime,
    attach: ProviderSessionAttach | undefined,
    signal: AbortSignal,
  ): Promise<PoolEntry> {
    let session: ProviderSession | undefined;
    let opening: Promise<ProviderSession> | undefined;
    let reserved = false;
    // One subject per open, so an older process's close (idle, eviction,
    // history reopen; not under this id's lock) never revokes a newer token.
    const credentialSubject = `${sessionId}#${++this.openSequence}`;
    const row: LedgerRow = { pid: undefined, watched: false };
    const onSpawn = (spawned: ProviderSessionSpawnedProcess): void =>
      this.watchSpawn(request.profile, row, spawned);
    try {
      // Built before a slot is taken: a refused build (CLI not installed)
      // evicts nobody.
      const openRequest = await raceAbort(
        Promise.resolve().then(() =>
          request.build({
            mcpToken:
              request.ptahMcp === false
                ? undefined
                : this.issueCredential(sessionId, credentialSubject, request),
            attach,
          }),
        ),
        signal,
      );
      await this.reserveSlot();
      reserved = true;
      opening = Promise.resolve().then(() =>
        runtime.open({ ...openRequest, onSpawn }, signal),
      );
      session = await raceAbort(opening, signal);
      if (this.disposed)
        throw new ProviderSessionChatAdapterError('unavailable', 'acquire');
      const entry: PoolEntry = {
        sessionId,
        profile: request.profile,
        session,
        method: attach?.method ?? 'new',
        credentialSubject,
        openOptionsKey: request.openOptionsKey,
        row,
        lastActiveAt: Date.now(),
      };
      this.entries.set(sessionId, entry);
      this.recordPid(entry);
      this.startSweep();
      return entry;
    } catch (error: unknown) {
      this.revokeCredential(credentialSubject);
      // An open that resolved late (timeout, abort, dispose) is closed here;
      // only this open's credential is revoked, so a newer open's stays valid.
      // A watched row goes with the process exit; nothing else was recorded.
      if (session) void this.closeProcess(session);
      else
        void opening?.then((late) => this.closeProcess(late), () => undefined);
      throw error;
    } finally {
      if (reserved) this.opening -= 1;
    }
  }

  /**
   * Records the process the runtime just spawned, before its open settles,
   * and removes the row once its exit is observed, never earlier: a close
   * that failed or timed out keeps the row for the next start's sweep.
   */
  private watchSpawn(
    profile: ProviderSessionProfileId,
    row: LedgerRow,
    { pid, exited }: ProviderSessionSpawnedProcess,
  ): void {
    if (row.watched) return;
    row.watched = true;
    row.pid = pid;
    this.ledger(() =>
      this.deps.pidLedger.record({ pid, profile, startedAt: Date.now() }),
    );
    void exited.then(() => {
      this.ledger(() => this.deps.pidLedger.remove(pid));
      row.pid = undefined;
    });
  }

  /** One ledger call; the ledger is best effort, so a failure is only logged. */
  private ledger(update: () => void): void {
    try {
      update();
    } catch (error: unknown) {
      this.deps.logger.error('Provider-session pid ledger update failed.', toError(error));
    }
  }

  /** Takes one cap slot, evicting the least recently used idle entry if needed. */
  private async reserveSlot(): Promise<void> {
    if (this.entries.size + this.opening >= PROVIDER_SESSION_MAX_LIVE) {
      const victim = this.lruIdle();
      if (!victim) throw new ProviderSessionChatAdapterError('limit', 'acquire');
      this.opening += 1;
      try {
        await this.closeEntry(victim, 'evicted');
      } catch (error: unknown) {
        this.opening -= 1;
        throw error;
      }
      return;
    }
    this.opening += 1;
  }

  private lruIdle(): PoolEntry | undefined {
    for (const entry of this.entries.values()) {
      if (!this.locks.has(entry.sessionId) && !entry.session.isTurnRunning())
        return entry;
    }
    return undefined;
  }

  private touch(entry: PoolEntry): PoolEntry {
    entry.lastActiveAt = Date.now();
    this.entries.delete(entry.sessionId);
    this.entries.set(entry.sessionId, entry);
    this.recordPid(entry);
    return entry;
  }

  /**
   * For a runtime that reports no spawn: records the current pid; a
   * respawned process replaces the old one. A watched row is left alone.
   */
  private recordPid(entry: PoolEntry): void {
    const { row } = entry;
    if (row.watched) return;
    const pid = entry.session.getPid();
    if (pid === row.pid) return;
    const previous = row.pid;
    this.ledger(() => {
      if (previous !== undefined) this.deps.pidLedger.remove(previous);
      if (pid !== undefined)
        this.deps.pidLedger.record({ pid, profile: entry.profile, startedAt: Date.now() });
    });
    row.pid = pid;
  }

  /**
   * Removes the entry first, so no operation sees a closing session. The
   * ledger row outlives a close whose exit is not confirmed (failed, or past
   * the bound), so the next start's orphan sweep can still stop the process.
   */
  private async closeEntry(entry: PoolEntry, reason: CloseReason): Promise<void> {
    if (this.entries.get(entry.sessionId) !== entry) return;
    this.entries.delete(entry.sessionId);
    if (this.entries.size === 0) this.stopSweep();
    this.deps.logger.debug('Closing provider session.', {
      profile: entry.profile,
      reason,
    });
    const confirmed = await this.closeSession(entry.credentialSubject, entry.session);
    const { row } = entry;
    // A watched row goes when the exit is observed (`watchSpawn`).
    if (row.watched || row.pid === undefined) return;
    if (!confirmed) {
      this.deps.logger.warn(
        'Provider-session close was not confirmed; its pid stays in the ledger for the next start.',
        { profile: entry.profile, reason },
      );
      return;
    }
    const pid = row.pid;
    this.ledger(() => this.deps.pidLedger.remove(pid));
    row.pid = undefined;
  }

  /** Bounded close; the credential is revoked whatever the close does. */
  private async closeSession(
    credentialSubject: string,
    session: ProviderSession,
  ): Promise<boolean> {
    try {
      return await this.closeProcess(session);
    } finally {
      this.revokeCredential(credentialSubject);
    }
  }

  /**
   * Closes one process within the bound. True when the close settled in
   * time; a failure or the timeout is logged and answers false.
   */
  private async closeProcess(session: ProviderSession): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        session.close(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Provider-session close timed out')),
            PROVIDER_SESSION_CLOSE_TIMEOUT_MS,
          );
        }),
      ]);
      return true;
    } catch (error: unknown) {
      this.deps.logger.error('Provider-session close failed.', toError(error));
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Same binding as Codex chat (`codex-chat-host-ports.ts` issue call): a
   * privileged session token bound to the session id and the workspace. The
   * subject is per open (`<sessionId>#<n>`), so each process's token is
   * revoked alone. A port failure opens the session without Ptah tools, as
   * Codex does.
   */
  private issueCredential(
    sessionId: string,
    credentialSubject: string,
    request: ProviderSessionPoolRequest,
  ): string | undefined {
    const credentials = this.deps.credentials;
    if (!credentials) return undefined;
    try {
      return credentials.issue(
        {
          kind: 'session',
          sessionId,
          workspaceRoot: request.workspaceRoot,
          ...(request.toolProfile === 'apps'
            ? { toolProfile: 'apps' as const }
            : {}),
          capability: 'privileged',
        },
        credentialSubject,
        INTERACTIVE_MCP_CREDENTIAL_MAX_AGE_MS,
      );
    } catch (error: unknown) {
      // degradation-audit: reported - a missing credential opens the session
      // without Ptah tools (as Codex chat does); the warning names the cause.
      this.deps.logger.warn(
        'Ptah MCP credential is unavailable; the provider session starts without Ptah tools.',
        { error: toError(error).message },
      );
      return undefined;
    }
  }

  private revokeCredential(credentialSubject: string): void {
    try {
      this.deps.credentials?.revokeSubject(credentialSubject);
    } catch (error: unknown) {
      this.deps.logger.error('Provider-session credential revoke failed.', toError(error));
    }
  }

  private startSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), PROVIDER_SESSION_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  private stopSweep(): void {
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }

  /** Closes entries with no turn for the idle window; a running turn counts as active. */
  private sweep(): void {
    const now = Date.now();
    for (const entry of [...this.entries.values()]) {
      if (this.locks.has(entry.sessionId)) continue;
      if (entry.session.isTurnRunning()) {
        entry.lastActiveAt = now;
        continue;
      }
      if (now - entry.lastActiveAt >= PROVIDER_SESSION_IDLE_CLOSE_MS)
        void this.closeEntry(entry, 'idle');
    }
  }

  /** Per-id async mutex: each call waits for the previous one on the same id. */
  private async withLock<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(sessionId) ?? Promise.resolve();
    let unlock!: () => void;
    const held = new Promise<void>((resolve) => (unlock = resolve));
    const tail = previous.then(() => held);
    this.locks.set(sessionId, tail);
    await previous;
    try {
      return await run();
    } finally {
      unlock();
      if (this.locks.get(sessionId) === tail) this.locks.delete(sessionId);
    }
  }
}

/**
 * A live entry is reopened for `request` only when both name their options
 * and they differ, no turn runs on it, and the request can resume the same
 * native session (so the conversation carries over).
 */
function mustReopen(entry: PoolEntry, request: ProviderSessionPoolRequest): boolean {
  return (
    request.openOptionsKey !== undefined &&
    entry.openOptionsKey !== undefined &&
    entry.openOptionsKey !== request.openOptionsKey &&
    request.nativeSessionId !== undefined &&
    !entry.session.isTurnRunning()
  );
}

function project(sessionId: string, session: ProviderSession): ProviderSessionPoolHistory {
  const projector = createFlatStreamProjector({ sessionId });
  return { events: session.replay.flatMap((event) => projector.project(event)) };
}

/** Rejects with the signal's reason when it aborts before `promise` settles. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new ProviderSessionChatAdapterError('cancelled', 'acquire');
}

/** Waits for `promise` at most `ms`; never rejects. */
async function withinBound(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise.then(
        () => undefined,
        () => undefined,
      ),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Forwards the caller's abort to `target`; returns the release of the listener. */
function linkAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  if (source.aborted) {
    target.abort(source.reason);
    return () => undefined;
  }
  const onAbort = () => target.abort(source.reason);
  source.addEventListener('abort', onAbort, { once: true });
  return () => source.removeEventListener('abort', onAbort);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
