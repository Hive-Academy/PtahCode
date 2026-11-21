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
} from '@ptah-extension/platform-core';
import {
  createFlatStreamProjector,
  type ProviderSession,
  type ProviderSessionAttach,
  type ProviderSessionOpenRequest,
  type ProviderSessionRuntime,
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
  /** Builds the runtime request; called once per open, inside the mutex. */
  build(context: ProviderSessionPoolOpenContext): ProviderSessionOpenRequest;
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
  pid: number | undefined;
  lastActiveAt: number;
}

export class ProviderSessionPool {
  /** Insertion order is LRU order: a touch re-inserts the entry. */
  private readonly entries = new Map<string, PoolEntry>();
  private readonly locks = new Map<string, Promise<void>>();
  /** Opens in flight; they hold a cap slot before they own an entry. */
  private opening = 0;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  /** Makes each open's credential subject unique (see `credentialSubject`). */
  private openSequence = 0;

  constructor(private readonly deps: ProviderSessionPoolDeps) {}

  /** The live session for `sessionId`, opening (or resuming) one when none is live. */
  acquire(
    sessionId: string,
    request: ProviderSessionPoolRequest,
    signal?: AbortSignal,
  ): Promise<ProviderSession> {
    return this.withLock(sessionId, async () => {
      const live = this.entries.get(sessionId);
      if (live) return this.touch(live).session;
      const runtime = this.runtimeOf(request.profile, 'acquire');
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

  /** Close every entry (each bounded) and stop the sweep; later calls refuse. */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopSweep();
    await this.closeAll('shutdown');
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
    { runtime }: ProviderSessionPoolRuntime,
    attach: ProviderSessionAttach | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PoolEntry> {
    await this.reserveSlot();
    let session: ProviderSession | undefined;
    // One subject per open, so an older process's close (idle, eviction,
    // history reopen; not under this id's lock) never revokes a newer token.
    const credentialSubject = `${sessionId}#${++this.openSequence}`;
    const opening = Promise.resolve().then(() =>
      runtime.open(
        request.build({
          mcpToken: this.issueCredential(sessionId, credentialSubject, request),
          attach,
        }),
        signal,
      ),
    );
    try {
      session = await raceAbort(opening, signal);
      if (this.disposed)
        throw new ProviderSessionChatAdapterError('unavailable', 'acquire');
      const entry: PoolEntry = {
        sessionId,
        profile: request.profile,
        session,
        method: attach?.method ?? 'new',
        credentialSubject,
        pid: undefined,
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
      if (session) void this.closeProcess(session);
      else void opening.then((late) => this.closeProcess(late), () => undefined);
      throw error;
    } finally {
      this.opening -= 1;
    }
  }

  /** Takes one cap slot, evicting the least recently used idle entry if needed. */
  private async reserveSlot(): Promise<void> {
    if (this.entries.size + this.opening >= PROVIDER_SESSION_MAX_LIVE) {
      const victim = this.lruIdle();
      if (!victim) throw new ProviderSessionChatAdapterError('limit', 'acquire');
      this.opening += 1;
      await this.closeEntry(victim, 'evicted');
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

  /** Records the current pid; a respawned process replaces the old one. */
  private recordPid(entry: PoolEntry): void {
    const pid = entry.session.getPid();
    if (pid === entry.pid) return;
    try {
      if (entry.pid !== undefined) this.deps.pidLedger.remove(entry.pid);
      if (pid !== undefined)
        this.deps.pidLedger.record({ pid, profile: entry.profile, startedAt: Date.now() });
    } catch (error: unknown) {
      this.deps.logger.error('Provider-session pid ledger update failed.', toError(error));
    }
    entry.pid = pid;
  }

  /** Removes the entry first, so no operation sees a closing session. */
  private async closeEntry(entry: PoolEntry, reason: CloseReason): Promise<void> {
    if (this.entries.get(entry.sessionId) !== entry) return;
    this.entries.delete(entry.sessionId);
    if (this.entries.size === 0) this.stopSweep();
    if (entry.pid !== undefined) {
      try {
        this.deps.pidLedger.remove(entry.pid);
      } catch (error: unknown) {
        this.deps.logger.error('Provider-session pid ledger update failed.', toError(error));
      }
    }
    this.deps.logger.debug('Closing provider session.', {
      profile: entry.profile,
      reason,
    });
    await this.closeSession(entry.credentialSubject, entry.session);
  }

  /** Bounded close; the credential is revoked whatever the close does. */
  private async closeSession(
    credentialSubject: string,
    session: ProviderSession,
  ): Promise<void> {
    try {
      await this.closeProcess(session);
    } finally {
      this.revokeCredential(credentialSubject);
    }
  }

  /** Closes one process within the bound; a failure is logged, never thrown. */
  private async closeProcess(session: ProviderSession): Promise<void> {
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
    } catch (error: unknown) {
      this.deps.logger.error('Provider-session close failed.', toError(error));
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
