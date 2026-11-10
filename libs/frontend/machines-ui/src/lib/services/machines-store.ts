import {
  Injectable,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import type { RpcResult } from '@ptah-extension/core';
import type {
  MachineConnectionState,
  MachineStateReason,
  MachineSummary,
  MachinesEventPayload,
  MachinesReadinessResult,
  MachinesSessionAttachResult,
  MachinesStatePayload,
  PermissionRequest,
  RemoteMachineSessionSummary,
  RemoteMachineWorkspace,
  RpcUserErrorCode,
} from '@ptah-extension/shared';
import { MachinesApi } from './machines-api';
import { MachinesFeed } from './machines-feed';
import {
  initialSessionEventState,
  isCaughtUp,
  reduceSessionEvent,
  type SessionEventAction,
  type SessionEventState,
} from './session-event-reducer';

/** One registered machine as the view shows it. */
export interface RemoteMachine extends MachineSummary {
  /** Why it is in its state, when Electron main named an actionable cause. */
  readonly reason?: MachineStateReason;
}

/** A failed call, as the view reports it. */
export interface MachinesError {
  readonly message: string;
  readonly code?: RpcUserErrorCode;
}

/** Sessions of one workspace, in the order the worker listed them. */
export interface RemoteWorkspaceSessions {
  readonly workspace: RemoteMachineWorkspace;
  readonly sessions: readonly RemoteMachineSessionSummary[];
}

/** An opened remote session: reducer state plus what the view derives. */
export interface RemoteSessionView extends SessionEventState {
  readonly machineId: string;
  /** The machine's state, or `null` once the machine is gone from the list. */
  readonly machineState: MachineConnectionState | null;
  /**
   * The machine is not connected: what is shown is the last known state, not
   * a failure (design 3.4). Session states are never changed because of it.
   */
  readonly stale: boolean;
  /**
   * Nothing can be acted on: the attach returned a saved snapshot (another
   * process drives the session, or it has no log), or the lock check failed.
   * Phase 1 watch-only (design 4.9, Q1 (a)).
   */
  readonly watchOnly: boolean;
  /** The worker could not check the driver lock (design 4.9 9c). */
  readonly lockUnavailable: boolean;
  /** A replay or attach is outstanding ("Catching up..." / "Fetching missing events"). */
  readonly catchingUp: boolean;
  readonly error: MachinesError | null;
}

/** Why the store refused an action without calling the machine. */
export type MachinesRefusal = 'watch-only' | 'not-connected' | 'not-open';

export type MachinesOutcome<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: MachinesError }
  | { readonly ok: false; readonly refused: MachinesRefusal };

/** One tool approval that waits in an opened session of a machine. */
export interface MachinePendingApproval {
  readonly sessionId: string;
  readonly request: PermissionRequest;
}

interface SessionEntry {
  readonly machineId: string;
  readonly reducer: SessionEventState;
  readonly lockUnavailable: boolean;
  readonly error: MachinesError | null;
}

const LOCK_UNAVAILABLE_CODES: ReadonlySet<RpcUserErrorCode> = new Set([
  'SESSION_DRIVER_LOCK_UNAVAILABLE',
]);

function sessionKey(machineId: string, sessionId: string): string {
  return `${machineId}\u0000${sessionId}`;
}

function toError<T>(result: RpcResult<T>): MachinesError {
  return {
    message: result.error ?? 'The request failed.',
    ...(result.errorCode !== undefined ? { code: result.errorCode } : {}),
  };
}

/**
 * Signal store of the Machines view: registered machines with their
 * connection state, the workspaces and sessions each machine lists, and one
 * {@link reduceSessionEvent} state per opened remote session.
 *
 * Rules it keeps:
 *
 * - Machine state comes only from `machines:state` and machine RPC results,
 *   never from session state; a machine going offline marks its views
 *   `stale` and changes nothing else (design 3.4, 7).
 * - Events apply per session by (epoch, seq) through the reducer; a gap or a
 *   reconnect that left a view behind sends `machines:session.replay` with
 *   the reducer's `afterSeq`.
 * - Watch-only sessions (a snapshot attach) refuse send, stop and permission
 *   answers locally. A send refused with `SESSION_DRIVEN_ELSEWHERE`
 *   re-attaches to learn the holder (design 4.9 9d). Freedom is learned only
 *   by {@link openSession} again (Refresh); there is no timer.
 */
@Injectable({ providedIn: 'root' })
export class MachinesStore {
  private readonly api = inject(MachinesApi);
  private readonly feed = inject(MachinesFeed);

  private readonly _machines = signal<readonly RemoteMachine[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<MachinesError | null>(null);
  private readonly _workspaces = signal<
    ReadonlyMap<string, readonly RemoteMachineWorkspace[]>
  >(new Map());
  private readonly _sessions = signal<
    ReadonlyMap<
      string,
      ReadonlyMap<string, readonly RemoteMachineSessionSummary[]>
    >
  >(new Map());
  private readonly _views = signal<ReadonlyMap<string, SessionEntry>>(
    new Map(),
  );
  /** Latest attach/replay request per session; older answers are ignored. */
  private readonly requestTokens = new Map<string, number>();
  private nextToken = 1;

  public readonly machines: Signal<readonly RemoteMachine[]> =
    this._machines.asReadonly();
  public readonly loading = this._loading.asReadonly();
  public readonly error = this._error.asReadonly();

  public readonly connectedCount = computed(
    () => this._machines().filter((m) => m.state === 'connected').length,
  );

  /** Pending tool approvals across opened sessions, per machine. */
  public readonly pendingApprovalsByMachine = computed(() => {
    const counts = new Map<string, number>();
    for (const entry of this._views().values()) {
      const pending = entry.reducer.pendingPermissions.length;
      if (pending === 0) continue;
      counts.set(entry.machineId, (counts.get(entry.machineId) ?? 0) + pending);
    }
    return counts as ReadonlyMap<string, number>;
  });

  /** The waiting approval requests of opened sessions, per machine. */
  public readonly pendingApprovalRequestsByMachine = computed(() => {
    const byMachine = new Map<string, MachinePendingApproval[]>();
    for (const [key, entry] of this._views()) {
      const pending = entry.reducer.pendingPermissions;
      if (pending.length === 0) continue;
      const sessionId = key.slice(key.indexOf('\u0000') + 1);
      const list = byMachine.get(entry.machineId) ?? [];
      for (const request of pending) list.push({ sessionId, request });
      byMachine.set(entry.machineId, list);
    }
    return byMachine as ReadonlyMap<string, readonly MachinePendingApproval[]>;
  });

  public readonly pendingApprovalCount = computed(() => {
    let total = 0;
    for (const count of this.pendingApprovalsByMachine().values())
      total += count;
    return total;
  });

  public constructor() {
    // Root singletons share the app lifetime; the subscriptions end with it.
    this.feed.onEvent((event) => this.onEvent(event));
    this.feed.onState((state) => this.onState(state));
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  public machine(machineId: string): Signal<RemoteMachine | null> {
    return computed(
      () => this._machines().find((m) => m.machineId === machineId) ?? null,
    );
  }

  public workspaces(
    machineId: string,
  ): Signal<readonly RemoteMachineWorkspace[]> {
    return computed(() => this._workspaces().get(machineId) ?? []);
  }

  /** Sessions grouped by workspace, in the worker's workspace order. */
  public sessionsByWorkspace(
    machineId: string,
  ): Signal<readonly RemoteWorkspaceSessions[]> {
    return computed(() => {
      const lists = this._sessions().get(machineId);
      return (this._workspaces().get(machineId) ?? []).map((workspace) => ({
        workspace,
        sessions: lists?.get(workspace.workspaceId) ?? [],
      }));
    });
  }

  public sessionView(
    machineId: string,
    sessionId: string,
  ): Signal<RemoteSessionView | null> {
    const key = sessionKey(machineId, sessionId);
    return computed(() => {
      const entry = this._views().get(key);
      if (entry === undefined) return null;
      const machine =
        this._machines().find((m) => m.machineId === machineId) ?? null;
      return this.toView(entry, machine);
    });
  }

  // -------------------------------------------------------------------------
  // Machines
  // -------------------------------------------------------------------------

  public async loadMachines(): Promise<void> {
    this._loading.set(true);
    const result = await this.api.list();
    this._loading.set(false);
    if (!result.isSuccess()) {
      this._error.set(toError(result));
      return;
    }
    this._error.set(null);
    const previous = new Map(this._machines().map((m) => [m.machineId, m]));
    this._machines.set(
      result.data.machines.map((summary) => {
        const reason = previous.get(summary.machineId)?.reason;
        return reason !== undefined ? { ...summary, reason } : summary;
      }),
    );
  }

  public add(alias: string): Promise<MachinesOutcome<RemoteMachine>> {
    return this.machineCall(this.api.add(alias));
  }

  public pair(
    machineId: string,
    code: string,
  ): Promise<MachinesOutcome<RemoteMachine>> {
    return this.machineCall(this.api.pair(machineId, code));
  }

  public pairViaSsh(
    machineId: string,
  ): Promise<MachinesOutcome<RemoteMachine>> {
    return this.machineCall(this.api.pairViaSsh(machineId));
  }

  public retry(machineId: string): Promise<MachinesOutcome<RemoteMachine>> {
    return this.machineCall(this.api.retry(machineId));
  }

  /** `Host` aliases from `~/.ssh/config`, for the add form's suggestions. */
  public async sshAliases(): Promise<MachinesOutcome<readonly string[]>> {
    const result = await this.api.sshAliases();
    if (!result.isSuccess()) return { ok: false, error: toError(result) };
    return { ok: true, value: result.data.aliases };
  }

  /** One readiness run; nothing is cached, "Check again" runs it anew. */
  public async readiness(
    machineId: string,
  ): Promise<MachinesOutcome<MachinesReadinessResult>> {
    const result = await this.api.readiness(machineId);
    if (!result.isSuccess()) return { ok: false, error: toError(result) };
    return { ok: true, value: result.data };
  }

  public async remove(machineId: string): Promise<MachinesOutcome> {
    const result = await this.api.remove(machineId);
    if (!result.isSuccess()) return { ok: false, error: toError(result) };
    this._machines.update((list) =>
      list.filter((m) => m.machineId !== machineId),
    );
    this._workspaces.update((map) => without(map, machineId));
    this._sessions.update((map) => without(map, machineId));
    this._views.update((views) => {
      const next = new Map(views);
      for (const [key, entry] of views) {
        if (entry.machineId === machineId) {
          next.delete(key);
          this.requestTokens.delete(key);
        }
      }
      return next;
    });
    return { ok: true, value: undefined };
  }

  public async loadWorkspaces(machineId: string): Promise<MachinesOutcome> {
    const result = await this.api.workspaces(machineId);
    if (!result.isSuccess()) return { ok: false, error: toError(result) };
    this._workspaces.update((map) =>
      new Map(map).set(machineId, result.data.workspaces),
    );
    return { ok: true, value: undefined };
  }

  public async loadSessions(
    machineId: string,
    workspaceId: string,
  ): Promise<MachinesOutcome> {
    const result = await this.api.sessions(machineId, workspaceId);
    if (!result.isSuccess()) return { ok: false, error: toError(result) };
    this._sessions.update((map) => {
      const lists = new Map(map.get(machineId) ?? []);
      lists.set(workspaceId, result.data.sessions);
      return new Map(map).set(machineId, lists);
    });
    return { ok: true, value: undefined };
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  /**
   * Attach to a session, or re-check it (the 4.9 "Refresh"). A cached view
   * stays visible until the answer arrives.
   */
  public async openSession(
    machineId: string,
    sessionId: string,
  ): Promise<MachinesOutcome> {
    const key = sessionKey(machineId, sessionId);
    const existing = this._views().get(key);
    this.setEntry(key, {
      machineId,
      reducer: existing?.reducer ?? initialSessionEventState(sessionId),
      lockUnavailable: existing?.lockUnavailable ?? false,
      error: null,
    });
    this.dispatch(key, { kind: 'attach-started' });
    const token = this.issueToken(key);
    const result = await this.api.attach(machineId, sessionId);
    if (this.requestTokens.get(key) !== token)
      return { ok: true, value: undefined };
    return this.settleAttach(key, result);
  }

  public async closeSession(
    machineId: string,
    sessionId: string,
  ): Promise<MachinesOutcome> {
    const key = sessionKey(machineId, sessionId);
    this._views.update((views) => without(views, key));
    this.requestTokens.delete(key);
    const result = await this.api.detach(machineId, sessionId);
    return result.isSuccess()
      ? { ok: true, value: undefined }
      : { ok: false, error: toError(result) };
  }

  /** Start a session on a workspace and open it. */
  public async startSession(
    machineId: string,
    workspaceId: string,
    prompt: string,
    name?: string,
  ): Promise<MachinesOutcome<string>> {
    if (!this.isConnected(machineId))
      return { ok: false, refused: 'not-connected' };
    const result = await this.api.start({
      machineId,
      workspaceId,
      prompt,
      ...(name !== undefined ? { name } : {}),
    });
    if (!result.isSuccess()) return { ok: false, error: toError(result) };
    const sessionId = result.data.sessionId;
    void this.openSession(machineId, sessionId);
    return { ok: true, value: sessionId };
  }

  public async sendPrompt(
    machineId: string,
    sessionId: string,
    prompt: string,
  ): Promise<MachinesOutcome> {
    const refusal = this.refusal(machineId, sessionId);
    if (refusal !== null) return { ok: false, refused: refusal };
    const result = await this.api.continue(machineId, sessionId, prompt);
    if (result.isSuccess()) return { ok: true, value: undefined };
    const error = toError(result);
    this.onSessionError(machineId, sessionId, error);
    return { ok: false, error };
  }

  public async stopSession(
    machineId: string,
    sessionId: string,
  ): Promise<MachinesOutcome> {
    const refusal = this.refusal(machineId, sessionId);
    if (refusal !== null) return { ok: false, refused: refusal };
    const result = await this.api.stop(machineId, sessionId);
    if (result.isSuccess()) return { ok: true, value: undefined };
    const error = toError(result);
    this.onSessionError(machineId, sessionId, error);
    return { ok: false, error };
  }

  public async respondPermission(
    machineId: string,
    sessionId: string,
    requestId: string,
    decision: 'allow' | 'deny',
  ): Promise<MachinesOutcome> {
    const refusal = this.refusal(machineId, sessionId);
    if (refusal !== null) return { ok: false, refused: refusal };
    const result = await this.api.respondPermission({
      machineId,
      sessionId,
      requestId,
      decision,
    });
    if (result.isSuccess()) return { ok: true, value: undefined };
    const error = toError(result);
    this.onSessionError(machineId, sessionId, error);
    return { ok: false, error };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async machineCall(
    call: Promise<RpcResult<{ readonly machine: MachineSummary }>>,
  ): Promise<MachinesOutcome<RemoteMachine>> {
    const result = await call;
    if (!result.isSuccess()) return { ok: false, error: toError(result) };
    const machine = result.data.machine;
    this._machines.update((list) => {
      const index = list.findIndex((m) => m.machineId === machine.machineId);
      if (index === -1) return [...list, machine];
      const next = [...list];
      // The RPC result has no `reason`; a fresh result supersedes the old one.
      next[index] = machine;
      return next;
    });
    return { ok: true, value: machine };
  }

  private onState(push: MachinesStatePayload): void {
    const previous = this._machines().find(
      (m) => m.machineId === push.machineId,
    );
    // A push for a machine the list does not have yet waits for the list.
    if (previous === undefined) return;
    const next: RemoteMachine = {
      machineId: previous.machineId,
      alias: previous.alias,
      displayName: previous.displayName,
      state: push.state,
      ...(push.nextRetryAt !== undefined
        ? { nextRetryAt: push.nextRetryAt }
        : {}),
      ...((push.versions ?? previous.versions) !== undefined
        ? { versions: push.versions ?? previous.versions }
        : {}),
      ...((push.lastSeenAt ?? previous.lastSeenAt) !== undefined
        ? { lastSeenAt: push.lastSeenAt ?? previous.lastSeenAt }
        : {}),
      ...(push.reason !== undefined ? { reason: push.reason } : {}),
    };
    this._machines.update((list) =>
      list.map((m) => (m.machineId === push.machineId ? next : m)),
    );

    if (push.state !== 'connected') return;
    const reattachFailed = push.reason === 'session-reattach-failed';
    const reconnected = previous.state !== 'connected';
    if (!reconnected && !reattachFailed) return;
    for (const [key, entry] of this._views()) {
      if (entry.machineId !== push.machineId) continue;
      if (entry.reducer.mode === 'detached') {
        // The last attach failed (often: opened while offline). Attach once
        // per reconnect; a failed attach while connected waits for Refresh
        // or the next reconnect, so no push can start a retry loop.
        if (reconnected) {
          void this.openSession(entry.machineId, entry.reducer.sessionId);
        }
        continue;
      }
      this.dispatch(key, { kind: 'connected', force: reattachFailed });
    }
  }

  private onEvent(event: MachinesEventPayload): void {
    const key = sessionKey(event.machineId, event.sessionId);
    if (!this._views().has(key)) return;
    this.dispatch(key, { kind: 'event', event });
  }

  /** Apply one action and send the replay it asks for. */
  private dispatch(key: string, action: SessionEventAction): void {
    const entry = this._views().get(key);
    if (entry === undefined) return;
    const step = reduceSessionEvent(entry.reducer, action);
    if (step.state !== entry.reducer) {
      this.setEntry(key, { ...entry, reducer: step.state });
    }
    if (step.replay !== null) {
      void this.runReplay(key, entry.machineId, step.replay.afterSeq);
    }
  }

  private async runReplay(
    key: string,
    machineId: string,
    afterSeq: number,
  ): Promise<void> {
    const entry = this._views().get(key);
    if (entry === undefined) return;
    const token = this.issueToken(key);
    const result = await this.api.replay(
      machineId,
      entry.reducer.sessionId,
      afterSeq,
    );
    if (this.requestTokens.get(key) !== token) return;
    if (result.isSuccess()) {
      this.settleAttach(key, result);
      return;
    }
    this.dispatch(key, { kind: 'replay-failed' });
    this.patchEntry(key, { error: toError(result) });
  }

  private settleAttach(
    key: string,
    result: RpcResult<MachinesSessionAttachResult>,
  ): MachinesOutcome {
    if (!result.isSuccess()) {
      const error = toError(result);
      const lockUnavailable =
        error.code !== undefined && LOCK_UNAVAILABLE_CODES.has(error.code);
      // Keep any cached transcript so the view can show the failure next to
      // it; a later Refresh attaches again.
      this.dispatch(key, { kind: 'attach-failed' });
      this.patchEntry(key, { error, lockUnavailable });
      return { ok: false, error };
    }
    this.dispatch(key, { kind: 'attach-succeeded', result: result.data });
    this.patchEntry(key, { error: null, lockUnavailable: false });
    return { ok: true, value: undefined };
  }

  private onSessionError(
    machineId: string,
    sessionId: string,
    error: MachinesError,
  ): void {
    const key = sessionKey(machineId, sessionId);
    if (!this._views().has(key)) return;
    if (error.code === 'SESSION_DRIVEN_ELSEWHERE') {
      // Another process won the lock: re-attach to show its snapshot and label.
      void this.openSession(machineId, sessionId);
      return;
    }
    this.patchEntry(key, {
      error,
      ...(error.code !== undefined && LOCK_UNAVAILABLE_CODES.has(error.code)
        ? { lockUnavailable: true }
        : {}),
    });
  }

  private refusal(
    machineId: string,
    sessionId: string,
  ): MachinesRefusal | null {
    const entry = this._views().get(sessionKey(machineId, sessionId));
    if (entry === undefined || entry.reducer.mode === 'detached') {
      return 'not-open';
    }
    if (!this.isConnected(machineId)) return 'not-connected';
    const machine = this._machines().find((m) => m.machineId === machineId);
    return this.toView(entry, machine ?? null).watchOnly ? 'watch-only' : null;
  }

  private isConnected(machineId: string): boolean {
    return (
      this._machines().find((m) => m.machineId === machineId)?.state ===
      'connected'
    );
  }

  private toView(
    entry: SessionEntry,
    machine: RemoteMachine | null,
  ): RemoteSessionView {
    const reducer = entry.reducer;
    return {
      ...reducer,
      machineId: entry.machineId,
      machineState: machine?.state ?? null,
      stale: machine?.state !== 'connected',
      watchOnly: reducer.mode === 'snapshot' || entry.lockUnavailable,
      lockUnavailable: entry.lockUnavailable,
      catchingUp:
        reducer.mode === 'log' &&
        (reducer.recovery !== 'none' || !isCaughtUp(reducer)),
      error: entry.error,
    };
  }

  private issueToken(key: string): number {
    const token = this.nextToken;
    this.nextToken += 1;
    this.requestTokens.set(key, token);
    return token;
  }

  private setEntry(key: string, entry: SessionEntry): void {
    this._views.update((views) => new Map(views).set(key, entry));
  }

  private patchEntry(
    key: string,
    patch: Partial<Pick<SessionEntry, 'error' | 'lockUnavailable'>>,
  ): void {
    const entry = this._views().get(key);
    if (entry === undefined) return;
    this.setEntry(key, { ...entry, ...patch });
  }
}

function without<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}
