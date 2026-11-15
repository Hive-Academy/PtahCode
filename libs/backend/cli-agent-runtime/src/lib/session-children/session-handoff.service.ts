/**
 * `ISessionHandoff` (TASK_2026_655): a chat session hands its work to a NEW
 * top-level chat session in the same workspace and cwd, whose first user
 * message is the continuation prompt.
 *
 * The service only guards and asks the chat host port to start an ordinary
 * session; the new session is not a child (it is never in
 * `SessionChildRegistry`), so it can hand off again later. A child session
 * starts a successor in its existing worktree through the spawner.
 *
 * The new session adopts the caller's background work: the caller's running
 * CLI lanes and its child sessions are re-parented to its tab before the
 * start is awaited, so their completions and reports reach the session that
 * continues the task. A failed start returns work to the caller; a timeout
 * keeps adoption provisional until the start settles. A late success is
 * recorded and does not stop the caller.
 *
 * The service subscribes to SDK session-id resolution so a kept handoff can
 * record a chain edge once the successor's real id exists. The disposer is
 * held for the process lifetime. Each start has one deadline timer, cleared
 * when the start settles or the deadline fires. The state is a bounded record
 * of callers that already handed off, the callers whose start has not settled
 * yet, the one-shot stops, and the pending chain binds.
 */
import { inject, injectable, type DependencyContainer } from 'tsyringe';
import { promises as fs } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
  SDK_TOKENS,
  type SessionEndCallbackRegistry,
  type SessionIdResolvedCallbackRegistry,
  type SessionIdResolvedPayload,
  type SessionLifecycleManager,
  type SessionTurnStateRegistry,
} from '@ptah-extension/agent-sdk';
import {
  PLATFORM_TOKENS,
  isPathWithinRoots,
  type IMcpServerStatus,
  type IOutputChannel,
  type IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  SessionId,
  type IAgentAdapter,
  type SessionHandoffOpenedPayload,
} from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { CLI_AGENT_RUNTIME_TOKENS } from '../di/tokens';
import type { AgentProcessManager } from '../cli-agents/agent-process-manager.service';
import type { IChildChatSessionHost } from './child-chat-session-host.port';
import { SessionChildRegistry } from './session-child.registry';
import { bindAdoptedChildOwner } from './bind-adopted-child-owner';
import type {
  ISessionSpawner,
  SessionChildSuccessionRefusalCode,
} from './session-spawner.port';
import { safeErrorKind } from './safe-error-kind';
import { SessionHandoffAckStore } from './session-handoff-ack.store';
import { handoffCloseAckResult } from './session-handoff-close-result';
import type { ISessionHandoffChain } from './session-handoff-chain.port';
import type {
  HandoffTurnFlushNotice,
  IHandoffTurnFlush,
  ISessionHandoff,
  SessionHandoffRefusalCode,
  SessionHandoffRequest,
  SessionHandoffResult,
  SessionHandoffAckRequest,
  SessionHandoffAckResult,
  HandoffPredecessorCloser,
} from './session-handoff.port';

const LOG_PREFIX = '[SessionHandoff]';

/** How many callers that already handed off are remembered; the oldest is forgotten first. */
export const SESSION_HANDOFF_HISTORY_SIZE = 64;
/** Longest tab label, in characters. */
export const SESSION_HANDOFF_LABEL_MAX = 60;
/** How long the host may take to start the new session before the call is refused. */
export const SESSION_HANDOFF_START_TIMEOUT_MS = 30_000;
/** Maximum time to wait before reconciling a start that never settles. */
export const SESSION_HANDOFF_RECONCILE_MS = 300_000;

/** Fixed details: host error text may quote the prompt, so it is never passed on. */
export const SESSION_HANDOFF_START_FAILED_DETAIL =
  'the host could not start the new session';
export const SESSION_HANDOFF_START_TIMEOUT_DETAIL =
  `the host did not confirm the new session within ` +
  `${SESSION_HANDOFF_START_TIMEOUT_MS / 1000} s; it may still open late, so ` +
  'look for it in the sessions panel before starting another one';
const UNEXPECTED_FAULT_DETAIL = 'an unexpected fault stopped the handoff';

const TIMED_OUT: unique symbol = Symbol('session-handoff-timed-out');

type CallerRecord = NonNullable<ReturnType<SessionLifecycleManager['find']>>;
type HandoffRefusal = Extract<SessionHandoffResult, { ok: false }>;

/** A child the new session took over, with the parent link it had before. */
interface AdoptedChild {
  readonly childSessionId: string;
  readonly parentSessionId: string;
  readonly parentSdkSessionId?: string;
}

/** The caller's work moved to the new tab while its start is pending. */
interface Adoption {
  readonly lanes: readonly string[];
  readonly children: readonly AdoptedChild[];
  settled: boolean;
}

/** A caller that handed off: its ids and the tab it handed off to. */
interface HandedOff {
  readonly sdkSessionId: string | null;
  readonly tabId: string;
}

/** Successor tab id → the caller SDK id and the workspace the edge belongs to. */
interface PendingChainBind {
  readonly callerSdkId: string;
  readonly workspaceRoot: string;
  committed: boolean;
  resolvedSdkId?: string;
}

interface ArmedCallerStop {
  readonly callerTabId: string;
  readonly callerSdkId: string | null;
}

@injectable()
export class SessionHandoffService
  implements ISessionHandoff, IHandoffTurnFlush
{
  /** Keyed by the caller's tab id, in insertion order (oldest first). */
  private readonly handedOff = new Map<string, HandedOff>();
  /**
   * Tab ids of callers whose start has not settled. A start that outlives
   * its deadline stays here until it settles, so a retry cannot open a
   * second session.
   */
  private readonly inFlight = new Map<string, string>();
  /** One-shot stops, keyed by the caller tab id. Deleted before `endSession`. */
  private readonly armed = new Map<string, ArmedCallerStop>();
  private readonly stopping = new Set<string>();
  private readonly stopped = new Set<string>();
  private readonly flushed = new Set<string>();
  private readonly recoverableRecords = new Map<
    string,
    import('./session-handoff-ack.store').HandoffAckRecord
  >();
  /** SDK spelling observed for a successor tab; never grants child ownership. */
  private readonly resolvedSuccessorIds = new Map<string, string>();
  private readonly ackAttempts = new Map<
    string,
    Promise<SessionHandoffAckResult>
  >();
  private readonly stopWaiters = new Map<string, (success: boolean) => void>();
  /** Kept successors whose SDK id is not known yet. Not the 64-cap refusal map. */
  private readonly pending = new Map<string, PendingChainBind>();
  private readonly releaseIdResolved: () => void;
  private readonly endedInFlight = new Set<string>();
  private readonly inFlightSdkIds = new Map<string, string | null>();

  constructor(
    @inject(SessionChildRegistry)
    private readonly registry: SessionChildRegistry,
    @inject(SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER)
    private readonly lifecycle: SessionLifecycleManager,
    @inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
    private readonly workspace: IWorkspaceProvider,
    @inject(PLATFORM_TOKENS.OUTPUT_CHANNEL)
    private readonly output: IOutputChannel,
    /** Holds the caller's CLI lanes, which the new session adopts. */
    @inject(TOKENS.AGENT_PROCESS_MANAGER)
    private readonly agents: AgentProcessManager,
    /** Absent in a host without a chat runtime → `chat-runtime-unavailable`. */
    @inject(TOKENS.AGENT_ADAPTER, { isOptional: true })
    private readonly adapter: IAgentAdapter | null = null,
    /**
     * Where the chat host port is looked up, at call time and never here:
     * `registerChatServices` registers it in a later phase than this lib
     * (same reason as `SessionSpawnerService`).
     */
    @inject(PLATFORM_TOKENS.DI_CONTAINER, { isOptional: true })
    private readonly container: DependencyContainer | null = null,
    /** Absent or port-less (CLI host) → `mcp-unavailable`. */
    @inject(PLATFORM_TOKENS.MCP_SERVER_STATUS, { isOptional: true })
    private readonly mcpStatus: IMcpServerStatus | null = null,
    /** Absent → the stop still ends the session, without clearing turn state. */
    @inject(SDK_TOKENS.SDK_SESSION_TURN_STATE_REGISTRY, { isOptional: true })
    private readonly turnState: Pick<
      SessionTurnStateRegistry,
      'forceIdle'
    > | null = null,
    /** Absent → stop and chain failures are logged on the output channel by kind. */
    @inject(TOKENS.LOGGER, { isOptional: true })
    private readonly logger: Logger | null = null,
    /** Absent → a kept handoff still stops, and writes no chain edge. */
    @inject(SDK_TOKENS.SDK_SESSION_ID_RESOLVED_CALLBACK_REGISTRY, {
      isOptional: true,
    })
    private readonly idResolved: SessionIdResolvedCallbackRegistry | null = null,
    /** Absent → a kept handoff still stops, and writes no chain edge. */
    @inject(CLI_AGENT_RUNTIME_TOKENS.SESSION_HANDOFF_CHAIN, {
      isOptional: true,
    })
    private readonly chain: ISessionHandoffChain | null = null,
    @inject(CLI_AGENT_RUNTIME_TOKENS.SESSION_HANDOFF_ACK_STORE, {
      isOptional: true,
    })
    private readonly ackStore: SessionHandoffAckStore | null = null,
    @inject(CLI_AGENT_RUNTIME_TOKENS.SESSION_SPAWNER, { isOptional: true })
    private readonly spawner: ISessionSpawner | null = null,
    @inject(SDK_TOKENS.SDK_SESSION_END_CALLBACK_REGISTRY, { isOptional: true })
    sessionEnds: SessionEndCallbackRegistry | null = null,
  ) {
    sessionEnds?.register(({ sessionId }) => {
      for (const [tabId, entry] of this.handedOff) {
        if (tabId === sessionId || entry.sdkSessionId === sessionId)
          this.handedOff.delete(tabId);
      }
      for (const tabId of this.inFlight.keys()) {
        if (tabId === sessionId || this.inFlightSdkIds.get(tabId) === sessionId)
          this.endedInFlight.add(tabId);
      }
    });
    this.releaseIdResolved = this.idResolved
      ? this.idResolved.register((payload) => {
          this.onSessionIdResolved(payload);
        })
      : () => undefined;
  }

  async handoff(request: SessionHandoffRequest): Promise<SessionHandoffResult> {
    try {
      return await this.guardAndStart(request);
    } catch (error: unknown) {
      // degradation-audit: reported - an unexpected fault in a collaborator
      // is logged and returned as the closed `session-start-failed`, so the
      // tool never throws and the skill falls back to printing the prompt.
      // Only the error's kind is logged: its message may quote the request.
      this.log(`handoff faulted: ${safeErrorKind(error)}`);
      return this.refuse('session-start-failed', UNEXPECTED_FAULT_DETAIL);
    }
  }

  acknowledge(
    request: SessionHandoffAckRequest,
  ): Promise<SessionHandoffAckResult> {
    return this.acknowledgeOnce(request);
  }

  private async acknowledgeOnce(
    request: SessionHandoffAckRequest,
  ): Promise<SessionHandoffAckResult> {
    const refused = (reason: string): SessionHandoffAckResult => ({
      status: 'refused',
      reason,
    });
    const retry = (reason: string): SessionHandoffAckResult => ({
      status: 'retryable-failure',
      reason,
    });
    if (this.registry.isChild(request.callerSessionId)) {
      return {
        status: 'already-closed',
        reason:
          'A successor child needs no acknowledgement; the host retires its predecessor.',
      };
    }
    if (
      !this.ackStore ||
      !request.callerSessionId?.trim() ||
      !request.predecessorSessionId.trim()
    ) {
      return refused('handoff identity or storage unavailable');
    }
    try {
      let record = await this.ackStore.findByPredecessor(
        request.predecessorSessionId,
      );
      if (!record) {
        const recoverable =
          this.recoverableRecords.get(request.predecessorSessionId) ??
          [...this.recoverableRecords.values()].find(
            (entry) => entry.predecessorSdkId === request.predecessorSessionId,
          );
        if (recoverable) {
          await this.ackStore.record(recoverable);
          this.recoverableRecords.delete(recoverable.predecessorTabId);
          record = recoverable;
        }
      }
      // A successor can acknowledge while a late start's asynchronous record
      // write is still in progress. Let it retry after that write settles.
      if (!record)
        return retry('handoff record not yet available; retry later');
      if (record.state === 'starting')
        return retry('handoff session is still starting; retry later');
      const resolvedSdkId = this.resolvedSuccessorIds.get(record.successorTabId);
      if (resolvedSdkId && resolvedSdkId === request.callerSessionId && record.successorSdkId !== resolvedSdkId) {
        await this.ackStore.compareAndSet(record.predecessorTabId, record.state, {
          successorSdkId: resolvedSdkId,
        });
        record = (await this.ackStore.findByPredecessor(record.predecessorTabId)) ?? record;
      }
      // Check the caller before joining an in-flight attempt, so a stranger never
      // receives another caller's result.
      if (
        request.callerSessionId !== record.successorTabId &&
        request.callerSessionId !== record.successorSdkId
      ) {
        return refused('caller is not the recorded successor');
      }
      const existing = this.ackAttempts.get(record.predecessorTabId);
      if (existing) return existing;
      const attempt = this.acknowledgeRecord(request, record);
      this.ackAttempts.set(record.predecessorTabId, attempt);
      try {
        return await attempt;
      } finally {
        this.ackAttempts.delete(record.predecessorTabId);
      }
    } catch (error: unknown) {
      this.reportError('handoff acknowledgement failed', error);
      return retry('handoff close failed; retry later');
    }
  }

  private async acknowledgeRecord(
    request: SessionHandoffAckRequest,
    record: import('./session-handoff-ack.store').HandoffAckRecord,
  ): Promise<SessionHandoffAckResult> {
    const refused = (reason: string): SessionHandoffAckResult => ({
      status: 'refused',
      reason,
    });
    const retry = (reason: string): SessionHandoffAckResult => ({
      status: 'retryable-failure',
      reason,
    });
    try {
      if (
        request.callerSessionId !== record.successorTabId &&
        request.callerSessionId !== record.successorSdkId
      ) {
        return refused('caller is not the recorded successor');
      }
      if (!request.handoffPath || !isAbsolute(request.handoffPath))
        return refused('handoff path missing');
      let canonicalPath: string;
      try {
        canonicalPath = await fs.realpath(request.handoffPath);
      } catch {
        canonicalPath = resolve(request.handoffPath);
      }
      if (canonicalPath !== record.handoffPath)
        return refused('handoff path does not match');
      if (record.keepPredecessor)
        return refused(
          'the predecessor received results after the handoff timed out; ' +
            'read them there and close it yourself',
        );
      if (record.state === 'closeCompleted')
        return {
          status: 'already-closed',
          reason: 'predecessor already closed',
        };
      if (
        !this.container?.isRegistered(
          CLI_AGENT_RUNTIME_TOKENS.HANDOFF_PREDECESSOR_CLOSER,
          true,
        )
      ) {
        return refused('predecessor close is unavailable in this host');
      }
      if (record.state === 'recorded') {
        const moved = await this.ackStore!.compareAndSet(
          record.predecessorTabId,
          'recorded',
          { state: 'closePending' },
        );
        if (
          !moved &&
          !(await this.ackStore!.findByPredecessor(record.predecessorTabId))
        )
          return refused('handoff record missing');
      }
      const closer = this.container!.resolve<HandoffPredecessorCloser>(
        CLI_AGENT_RUNTIME_TOKENS.HANDOFF_PREDECESSOR_CLOSER,
      );
      if (!this.stopped.has(record.predecessorTabId)) {
        if (this.stopWaiters.has(record.predecessorTabId))
          return retry('predecessor stop already pending');
        const stop = new Promise<boolean>((resolveStop) =>
          this.stopWaiters.set(record.predecessorTabId, resolveStop),
        );
        this.armed.set(record.predecessorTabId, {
          callerTabId: record.predecessorTabId,
          callerSdkId: record.predecessorSdkId,
        });
        if (
          this.flushed.has(record.predecessorTabId) ||
          (record.predecessorSdkId && this.flushed.has(record.predecessorSdkId))
        ) {
          this.onCallerTurnFlushed({
            tabId: record.predecessorTabId,
            sessionId: record.predecessorSdkId ?? record.predecessorTabId,
          });
          const stopped = await withDeadline(stop, 30_000);
          if (stopped === TIMED_OUT)
            this.stopWaiters.delete(record.predecessorTabId);
          if (stopped !== true)
            return retry('predecessor execution stop failed; retry later');
        } else {
          this.stopWaiters.delete(record.predecessorTabId);
          return retry('waiting for predecessor turn to flush; retry later');
        }
      }
      const closeResult = handoffCloseAckResult(
        await closer.close(record.predecessorTabId, record.predecessorSdkId),
      );
      if (closeResult.status !== 'closed') return closeResult;
      await this.ackStore!.compareAndSet(
        record.predecessorTabId,
        'closePending',
        { state: 'closeCompleted' },
      );
      return { status: 'closed', reason: 'predecessor closed' };
    } catch (error: unknown) {
      this.reportError('handoff acknowledgement failed', error);
      return retry('handoff close failed; retry later');
    }
  }

  private async succeedChild(
    request: SessionHandoffRequest,
  ): Promise<SessionHandoffResult> {
    if (!this.spawner) {
      return this.refuse(
        'child-session',
        'a child session cannot hand off; its parent session supervises its work',
      );
    }
    if ((this.mcpStatus?.getPort() ?? null) === null) {
      return this.refuse(
        'mcp-unavailable',
        'the Ptah MCP server is not running in this host, so the new session could not hand off again',
      );
    }
    const handoffFile = await this.checkHandoffFile(request.handoffPath);
    if (typeof handoffFile !== 'string') return handoffFile;
    const result = await this.spawner.succeed({
      callerSessionId: request.callerSessionId,
      handoffPath: resolve(request.handoffPath),
      prompt: request.prompt,
      label: request.label,
    });
    if (!result.ok) {
      const refusals: Record<
        SessionChildSuccessionRefusalCode,
        SessionHandoffRefusalCode
      > = {
        'not-a-live-child': 'unattributed-caller',
        'succession-in-progress': 'already-handed-off',
        'max-successions-reached': 'child-session',
        'chat-runtime-unavailable': 'chat-runtime-unavailable',
        'session-start-failed': 'session-start-failed',
      };
      return this.refuse(refusals[result.refusal], result.detail);
    }
    return {
      ok: true,
      tabId: result.successor.childSessionId,
      label: result.successor.label,
      workspaceRoot: result.successor.workspaceRoot,
      cwd: result.successor.worktreePath,
      tabOpened: result.tabOpened,
      adoptedLanes: result.adoptedLanes,
      adoptedChildSessions: [],
    };
  }

  private async guardAndStart(
    request: SessionHandoffRequest,
  ): Promise<SessionHandoffResult> {
    const caller = SessionId.safeParse(request.callerSessionId?.trim());
    const record = caller ? this.lifecycle.find(caller) : undefined;
    if (!caller || !record) {
      return this.refuse(
        'unattributed-caller',
        'ptah_session_handoff must be called from a live chat session; this ' +
          'caller has no live session id',
      );
    }
    if (
      this.registry.isChild(caller) ||
      this.registry.isChild(record.realSessionId ?? undefined)
    ) {
      return this.succeedChild(request);
    }
    const host = this.lookupHost();
    if (!host || !this.adapter) {
      return this.refuse(
        'chat-runtime-unavailable',
        'this host has no chat runtime to open a new session in',
      );
    }
    if ((this.mcpStatus?.getPort() ?? null) === null) {
      return this.refuse(
        'mcp-unavailable',
        'the Ptah MCP server is not running in this host, so the new session ' +
          'could not hand off again',
      );
    }
    const paths = this.resolvePaths(record);
    if (!paths.ok) return paths;
    const handoffFile = await this.checkHandoffFile(request.handoffPath);
    if (typeof handoffFile !== 'string') return handoffFile;

    // The caller may be named by its tab id or its SDK id; both resolve to
    // one record, whose tab id keys every duplicate check and reservation.
    const key = record.tabId;
    this.dropGoneSuccessors();
    const earlier = this.findHandedOff(key, record.realSessionId);
    if (earlier) {
      return this.refuse(
        'already-handed-off',
        `this session already handed off to tab ${earlier.tabId}`,
      );
    }
    const inFlightSuccessor = this.inFlight.get(key);
    if (inFlightSuccessor) {
      return this.refuse(
        'already-handed-off',
        `a handoff from this session to tab ${inFlightSuccessor} is already in progress`,
      );
    }
    // The new tab id is minted here so the caller's work can be adopted
    // BEFORE the start is awaited: a lane or child that finishes while the
    // host starts the session must not signal the caller the user is about
    // to close. The adoption is provisional until the start settles.
    const tabId = SessionId.create();
    this.inFlight.set(key, tabId);
    this.inFlightSdkIds.set(key, record.realSessionId);
    const adoption = this.adoptWork(record, tabId);
    this.bindPendingChain(record, tabId, paths.root);
    let recordSaved = false;
    if (this.ackStore) {
      try {
        await this.ackStore.record({
          predecessorTabId: record.tabId,
          predecessorSdkId: record.realSessionId,
          successorTabId: tabId,
          successorSdkId: null,
          workspaceRoot: resolve(paths.root),
          handoffPath: await fs.realpath(request.handoffPath),
          state: 'starting',
        });
        recordSaved = true;
      } catch (error: unknown) {
        this.reportError('handoff acknowledgement record failed', error);
      }
    }
    // Never rejects. Release the reservation only after the settled outcome
    // has been recorded, including when it arrives after the deadline.
    const attempt = this.start(host, request, record, paths, tabId).catch(
      (error: unknown) => {
        // degradation-audit: reported - logged by kind only (its message may
        // quote the prompt) and returned as the closed `session-start-failed`.
        this.reportError(
          'handoff start faulted',
          new Error(safeErrorKind(error)),
        );
        return this.refuse(
          'session-start-failed',
          SESSION_HANDOFF_START_FAILED_DETAIL,
        );
      },
    );
    const result = await withDeadline(
      attempt,
      SESSION_HANDOFF_START_TIMEOUT_MS,
    );
    if (result === TIMED_OUT) {
      // Keep the reservation and provisional adoption until the host actually
      // settles. A late success is a real successor, even after this refusal.
      const timer = setTimeout(() => {
        try {
          const found = this.lifecycle.find(tabId);
          this.log(
            `handoff reconciliation for ${tabId}: ${found ? 'successor found' : 'successor absent; adoption reverted'}`,
          );
          if (!found) this.settleAdoption(adoption, tabId, 'reverted');
        } catch (error: unknown) {
          this.reportError('handoff reconciliation lookup failed', error);
        }
      }, SESSION_HANDOFF_RECONCILE_MS);
      timer.unref?.();
      void attempt
        .then(async (lateResult) => {
          clearTimeout(timer);
          if (!lateResult.ok) {
            this.pending.delete(tabId);
            if (recordSaved) await this.discardStartingRecord(record.tabId);
            this.settleAdoption(adoption, tabId, 'reverted');
            this.inFlight.delete(key);
            this.inFlightSdkIds.delete(key);
            this.endedInFlight.delete(key);
            return;
          }
          this.remember(record.tabId, {
            sdkSessionId: record.realSessionId,
            tabId,
          });
          this.inFlight.delete(key);
          this.inFlightSdkIds.delete(key);
          // Reconciliation already returned the work to the predecessor, and
          // results that completed since then went to it. Withhold the ack so
          // the successor cannot close the predecessor and lose those results.
          const reverted = adoption.settled;
          if (reverted) {
            const renewed = this.adoptWork(record, tabId, true);
            try {
              this.settleAdoption(renewed, tabId, 'kept', true);
            } catch (error: unknown) {
              this.settleAdoption(renewed, tabId, 'reverted');
              throw error;
            }
          } else {
            this.settleAdoption(adoption, tabId, 'kept');
          }
          const pending = this.pending.get(tabId);
          const successorSdkId = pending?.resolvedSdkId ?? null;
          if (reverted) {
            this.log(
              `handoff ${tabId} started after reconciliation; the predecessor stays open`,
            );
          }
          try {
            // The record still binds the successor tab to its SDK id for
            // report delivery. After a revert it never permits the close.
            await this.recordLateAck({
              predecessorTabId: record.tabId,
              predecessorSdkId: record.realSessionId,
              successorTabId: tabId,
              successorSdkId,
              workspaceRoot: resolve(paths.root),
              handoffPath: handoffFile,
              state: 'recorded',
              ...(reverted ? { keepPredecessor: true } : {}),
            }, recordSaved);
          } catch (error: unknown) {
            this.reportError('handoff late-completion record failed', error);
          }
          if (pending) {
            pending.committed = true;
            if (pending.resolvedSdkId)
              this.bindAdoptedChildren(tabId, pending.resolvedSdkId);
            if (
              pending.resolvedSdkId &&
              pending.resolvedSdkId !== successorSdkId &&
              this.ackStore
            ) {
              try {
                const saved = await this.ackStore.findBySuccessor(tabId);
                if (saved)
                  await this.ackStore.compareAndSet(
                    saved.predecessorTabId,
                    saved.state,
                    { successorSdkId: pending.resolvedSdkId },
                  );
              } catch (error: unknown) {
                this.reportError('handoff successor binding failed', error);
              }
            }
            if (pending.resolvedSdkId) this.commitPendingChain(tabId, pending);
          }
        })
        .catch((error: unknown) => {
          this.reportError('handoff late-completion failed', error);
          this.pending.delete(tabId);
          if (recordSaved) void this.discardStartingRecord(record.tabId);
          this.settleAdoption(adoption, tabId, 'reverted');
          this.inFlight.delete(key);
          this.inFlightSdkIds.delete(key);
          this.endedInFlight.delete(key);
        });
      return this.refuse(
        'session-start-timeout',
        SESSION_HANDOFF_START_TIMEOUT_DETAIL,
      );
    }
    if (!result.ok) {
      this.pending.delete(tabId);
      if (recordSaved) await this.discardStartingRecord(record.tabId);
      this.settleAdoption(adoption, tabId, 'reverted');
      this.inFlight.delete(key);
      this.inFlightSdkIds.delete(key);
      this.endedInFlight.delete(key);
      return result;
    }
    this.settleAdoption(adoption, tabId, 'kept');
    const successorSdkId = this.pending.get(tabId)?.resolvedSdkId;
    if (successorSdkId) bindAdoptedChildOwner(this.registry, tabId, successorSdkId);
    this.remember(record.tabId, {
      sdkSessionId: record.realSessionId,
      tabId,
    });
    this.inFlight.delete(key);
    this.inFlightSdkIds.delete(key);
    try {
      const ackRecord = {
        predecessorTabId: record.tabId,
        predecessorSdkId: record.realSessionId,
        successorTabId: tabId,
        successorSdkId: this.pending.get(tabId)?.resolvedSdkId ?? null,
        workspaceRoot: resolve(paths.root),
        handoffPath: handoffFile,
        state: 'recorded' as const,
      };
      this.recoverableRecords.set(record.tabId, ackRecord);
      if (!this.ackStore)
        throw new Error('handoff acknowledgement storage unavailable');
      if (recordSaved) {
        const settled = await this.ackStore.compareAndSet(record.tabId, 'starting', {
          state: 'recorded',
          successorSdkId: ackRecord.successorSdkId,
        });
        if (!settled) throw new Error('handoff starting record changed before settlement');
      } else {
        await this.ackStore.record(ackRecord);
      }
      this.recoverableRecords.delete(record.tabId);
    } catch (error: unknown) {
      this.reportError('handoff acknowledgement record failed', error);
    }
    const pending = this.pending.get(tabId);
    if (pending) {
      // The start settled either way: the chain lineage must still commit when
      // the successor's SDK id resolves later, even without an ack record.
      pending.committed = true;
      if (pending.resolvedSdkId)
        this.bindAdoptedChildren(tabId, pending.resolvedSdkId);
      if (recordSaved && pending.resolvedSdkId && this.ackStore) {
        try {
          const saved = await this.ackStore.findBySuccessor(tabId);
          if (saved && saved.successorSdkId !== pending.resolvedSdkId) {
            await this.ackStore.compareAndSet(
              saved.predecessorTabId,
              saved.state,
              { successorSdkId: pending.resolvedSdkId },
            );
          }
        } catch (error: unknown) {
          this.reportError('handoff successor binding failed', error);
        }
      }
      if (pending.resolvedSdkId) this.commitPendingChain(tabId, pending);
    }
    if (adoption.lanes.length > 0 || adoption.children.length > 0) {
      this.log(
        `${record.tabId}: the new session adopted ${adoption.lanes.length} ` +
          `lane(s), ${adoption.children.length} child session(s)`,
      );
    }
    return {
      ...result,
      adoptedLanes: adoption.lanes,
      adoptedChildSessions: adoption.children.map((c) => c.childSessionId),
    };
  }

  private async start(
    host: IChildChatSessionHost,
    request: SessionHandoffRequest,
    record: CallerRecord,
    paths: { readonly root: string; readonly cwd: string },
    tabId: string,
  ): Promise<SessionHandoffResult> {
    const label = truncate(
      request.label?.trim() ||
        `Continued: ${record.config.sessionName?.trim() || 'session'}`,
      SESSION_HANDOFF_LABEL_MAX,
    );
    const descriptor: SessionHandoffOpenedPayload = {
      tabId,
      fromTabId: record.tabId,
      fromSessionId: record.realSessionId,
      workspaceRoot: paths.root,
      cwd: paths.cwd,
      label,
      displayPrompt: request.prompt,
      ...(record.currentModel ? { model: record.currentModel } : {}),
      startedAt: Date.now(),
    };
    let outcome: Awaited<
      ReturnType<IChildChatSessionHost['startHandoffSession']>
    >;
    try {
      outcome = await host.startHandoffSession({
        tabId,
        workspaceRoot: paths.root,
        cwd: paths.cwd,
        prompt: request.prompt,
        sessionName: label,
        descriptor,
        ...(record.currentModel ? { model: record.currentModel } : {}),
        permissionLevel: record.permissionLevel,
      });
    } catch (error: unknown) {
      // degradation-audit: reported - the port's contract is never-throw; a
      // throw means the session did not start. Its message may quote the
      // prompt, so only its kind is logged and the detail is fixed.
      this.reportError('host start threw', new Error(safeErrorKind(error)));
      return this.refuse(
        'session-start-failed',
        SESSION_HANDOFF_START_FAILED_DETAIL,
      );
    }
    if (!outcome.started) {
      // The host's error text may quote the prompt: it is not passed on.
      this.log('host reported that the new session did not start');
      return this.refuse(
        'session-start-failed',
        SESSION_HANDOFF_START_FAILED_DETAIL,
      );
    }
    // `remember`, the stop, and the chain bind run only after `guardAndStart`
    // sees this result inside the deadline. A late resolution writes nothing.
    this.log(
      `${record.tabId} handed off to ${tabId} in ${paths.cwd}` +
        (outcome.uiAnnounced ? '' : ' (no webview took the tab)'),
    );
    // The adopted ids are filled in by `guardAndStart`, which settles the
    // adoption; a start that outlived its deadline must not report them.
    return {
      ok: true,
      tabId,
      label,
      workspaceRoot: paths.root,
      cwd: paths.cwd,
      tabOpened: outcome.uiAnnounced,
      adoptedLanes: [],
      adoptedChildSessions: [],
    };
  }

  /**
   * The new session takes over the caller's background work, so its later
   * completions and reports reach the session that continues the task, not
   * the one that stops after this turn flushes. The caller is matched by both its tab
   * id and its SDK id: work records whichever it had when it started.
   * Runs before the start is awaited, so the new session has only its tab id.
   *
   * - Running CLI lanes get the new tab id as parent; the manager's tab →
   *   SDK id remap then follows the new session like any lane it spawned
   *   itself. Until {@link settleAdoption}, a lane that finishes has its
   *   completion signal held by the manager.
   * - All child records get the new tab as parent and lose the old parent SDK
   *   id. The new SDK id is bound when it resolves. A child that settles while
   *   the new session is not live yet keeps its completion held, for
   *   whichever parent it ends up with.
   *
   * Each half is attempted even if the other faults; a fault is logged by
   * kind and that half's work stays with the caller.
   */
  private adoptWork(
    caller: CallerRecord,
    successorTabId: string,
    strict = false,
  ): Adoption {
    const fromIds = [caller.tabId, caller.realSessionId].filter(
      (id): id is string => !!id,
    );
    let lanes: readonly string[] = [];
    let failure: unknown;
    try {
      lanes = this.agents.adoptLanes(fromIds, successorTabId);
    } catch (error: unknown) {
      // degradation-audit: reported - the lanes stay with the caller (the
      // behaviour before adoption existed) and the reply lists none.
      this.log(`lane adoption faulted: ${safeErrorKind(error)}`);
      failure = error;
    }
    const children: AdoptedChild[] = [];
    try {
      for (const child of this.registry.childrenOf(fromIds)) {
        const moved = this.registry.reparent(
          child.childSessionId,
          successorTabId,
          undefined,
        );
        if (!moved) {
          if (strict) throw new Error('child session re-adoption failed');
          continue;
        }
        children.push({
          childSessionId: child.childSessionId,
          parentSessionId: child.parentSessionId,
          ...(child.parentSdkSessionId
            ? { parentSdkSessionId: child.parentSdkSessionId }
            : {}),
        });
      }
    } catch (error: unknown) {
      // degradation-audit: reported - as above; children not yet moved stay
      // with the caller and are not listed as adopted.
      this.log(`child session adoption faulted: ${safeErrorKind(error)}`);
      failure = error;
    }
    if (strict && failure) {
      this.settleAdoption(
        { lanes, children, settled: false },
        successorTabId,
        'reverted',
      );
      throw failure;
    }
    return { lanes, children, settled: false };
  }

  /**
   * End the provisional adoption once. `kept`: the new session started.
   * `reverted`: it did not, or not within the deadline, so every lane and
   * child goes back to the parent it had, and held lane signals reach the
   * caller. A child's completion held meanwhile is drained by the caller's
   * next `ptah_session_*` call, including this handoff's own reply.
   */
  private settleAdoption(
    adoption: Adoption,
    successorTabId: string,
    outcome: 'kept' | 'reverted',
    strict = false,
  ): void {
    if (adoption.settled) return;
    try {
      this.agents.settleLaneAdoption(adoption.lanes, outcome);
    } catch (error: unknown) {
      // degradation-audit: reported - logged by kind; the children are still
      // settled below.
      this.log(`lane adoption settle faulted: ${safeErrorKind(error)}`);
      if (strict) throw error;
    }
    if (outcome === 'kept') {
      const sdkId = this.pending.get(successorTabId)?.resolvedSdkId;
      if (sdkId) this.bindAdoptedChildren(successorTabId, sdkId);
      adoption.settled = true;
      return;
    }
    adoption.settled = true;
    try {
      for (const child of adoption.children) {
        // Only undo our own move; a child that moved again since is left.
        const current = this.registry.get(child.childSessionId);
        if (current?.parentSessionId !== successorTabId) continue;
        this.registry.reparent(
          child.childSessionId,
          child.parentSessionId,
          child.parentSdkSessionId,
        );
      }
    } catch (error: unknown) {
      // degradation-audit: reported - logged by kind; a child left with the
      // tab that never opened is reachable by its id only.
      this.log(`child session revert faulted: ${safeErrorKind(error)}`);
    }
  }

  /** The caller's cwd and root, both inside an open workspace folder. */
  private resolvePaths(
    record: CallerRecord,
  ):
    | { readonly ok: true; readonly root: string; readonly cwd: string }
    | HandoffRefusal {
    const cwd = record.config.projectPath?.trim();
    if (!cwd) {
      return this.refuse(
        'no-workspace',
        'the calling session has no working directory',
      );
    }
    const root = record.config.workspaceId?.trim() || cwd;
    const folders = this.workspace.getWorkspaceFolders();
    for (const path of [cwd, root]) {
      if (!isPathWithinRoots(path, folders)) {
        return this.refuse(
          'no-workspace',
          `${path} is not inside a workspace folder open in this host`,
        );
      }
    }
    return { ok: true, root, cwd };
  }

  /**
   * Return the canonical path for a regular file inside an open workspace,
   * or a refusal if validation fails.
   */
  private async checkHandoffFile(
    handoffPath: string,
  ): Promise<HandoffRefusal | string> {
    const path = handoffPath.trim();
    if (!path || !isAbsolute(path)) {
      return this.refuse(
        'handoff-file-missing',
        `handoffPath must be an absolute path; got "${path}"`,
      );
    }
    if (!isPathWithinRoots(path, this.workspace.getWorkspaceFolders())) {
      return this.refuse(
        'handoff-file-missing',
        `${path} is not inside a workspace folder open in this host`,
      );
    }
    try {
      const stat = await fs.stat(path);
      if (stat.isFile()) return await fs.realpath(path);
      return this.refuse('handoff-file-missing', `${path} is not a file`);
    } catch (error: unknown) {
      // degradation-audit: reported - a missing or unreadable file is the
      // closed `handoff-file-missing`; the detail names the path.
      return this.refuse(
        'handoff-file-missing',
        `${path} could not be read (${safeErrorKind(error)})`,
      );
    }
  }

  private findHandedOff(
    callerTabId: string,
    callerSdkId: string | null,
  ): HandedOff | undefined {
    const byTab = this.handedOff.get(callerTabId);
    if (byTab) return byTab;
    if (!callerSdkId) return undefined;
    for (const entry of this.handedOff.values()) {
      if (entry.sdkSessionId === callerSdkId) return entry;
    }
    return undefined;
  }

  /**
   * Stop the armed caller after its turn flushed. A notice matches when
   * either id is the caller tab id or the caller SDK id. The arm is consumed
   * before `endSession`, so an abort that re-enters the flush cannot stop twice.
   */
  onCallerTurnFlushed(notice: HandoffTurnFlushNotice): void {
    if (this.findHandedOff(notice.tabId, notice.sessionId)) {
      this.flushed.add(notice.tabId);
      this.flushed.add(notice.sessionId);
    }
    this.dropGoneSuccessors();
    const arm = this.takeArmed(notice);
    if (!arm) return;
    this.stopping.add(arm.callerTabId);
    void this.stopCaller(arm);
  }

  private armCallerStop(record: CallerRecord): void {
    this.armed.set(record.tabId, {
      callerTabId: record.tabId,
      callerSdkId: record.realSessionId,
    });
  }

  private takeArmed(
    notice: HandoffTurnFlushNotice,
  ): ArmedCallerStop | undefined {
    for (const [key, arm] of this.armed) {
      const ids = [arm.callerTabId, arm.callerSdkId].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      );
      if (
        !this.stopping.has(key) &&
        (ids.includes(notice.tabId) || ids.includes(notice.sessionId))
      ) {
        this.armed.delete(key);
        return arm;
      }
    }
    return undefined;
  }

  private async stopCaller(arm: ArmedCallerStop): Promise<void> {
    try {
      await this.lifecycle.endSession(
        SessionId.from(arm.callerTabId),
        'parent-stop',
      );
    } catch (error: unknown) {
      // degradation-audit: reported - reportError logs the stop failure; the caller is re-armed so the next flush retries.
      this.reportError('handoff caller stop failed', error);
      this.armed.set(arm.callerTabId, arm);
      this.stopping.delete(arm.callerTabId);
      this.stopWaiters.get(arm.callerTabId)?.(false);
      this.stopWaiters.delete(arm.callerTabId);
      return;
    }
    const ids = [arm.callerTabId, arm.callerSdkId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    for (const id of ids) {
      try {
        this.turnState?.forceIdle(id);
      } catch (error: unknown) {
        this.reportError('handoff forceIdle failed', error);
      }
    }
    this.stopping.delete(arm.callerTabId);
    this.stopped.add(arm.callerTabId);
    this.stopWaiters.get(arm.callerTabId)?.(true);
    this.stopWaiters.delete(arm.callerTabId);
  }

  private bindPendingChain(
    record: CallerRecord,
    successorTabId: string,
    workspaceRoot: string,
  ): void {
    const callerSdkId = record.realSessionId?.trim() ?? '';
    this.pending.set(successorTabId, {
      callerSdkId,
      workspaceRoot,
      committed: false,
    });
  }

  private onSessionIdResolved(payload: SessionIdResolvedPayload): void {
    const tabId = payload.tabId;
    if (!tabId) return;
    const successorSdkId = payload.realSessionId.trim();
    const pending = this.pending.get(tabId);
    if (successorSdkId && pending?.committed)
      this.bindAdoptedChildren(tabId, successorSdkId);
    if (!pending) return;
    if (!successorSdkId) {
      this.pending.delete(tabId);
      return;
    }
    pending.resolvedSdkId = successorSdkId;
    this.resolvedSuccessorIds.set(tabId, successorSdkId);
    if (pending.committed) bindAdoptedChildOwner(this.registry, tabId, successorSdkId);
    for (const record of this.recoverableRecords.values()) {
      if (record.successorTabId === tabId)
        record.successorSdkId = successorSdkId;
    }
    if (pending.committed && this.ackStore) {
      void this.ackStore
        .findBySuccessor(tabId)
        .then((record) =>
          record
            ? this.ackStore!.compareAndSet(
                record.predecessorTabId,
                record.state,
                { successorSdkId },
              ).then(() => undefined)
            : undefined,
        )
        .catch((error: unknown) =>
          this.reportError('handoff successor binding failed', error),
        );
    }
    if (pending.committed) this.commitPendingChain(tabId, pending);
  }

  private bindAdoptedChildren(tabId: string, sdkId: string): void {
    for (const child of this.registry.childrenOf([tabId])) {
      if (child.parentSessionId === tabId)
        this.registry.reparent(child.childSessionId, tabId, sdkId);
    }
  }

  private commitPendingChain(tabId: string, pending: PendingChainBind): void {
    this.pending.delete(tabId);
    const chain = this.chain;
    if (!chain || !pending.callerSdkId) return;
    void chain
      .append(
        pending.callerSdkId,
        pending.resolvedSdkId!,
        pending.workspaceRoot,
      )
      .catch((error: unknown) => {
        this.reportError('handoff chain append failed', error);
      });
  }

  /** Remove a provisional record of a start that did not keep; never throws. */
  private async discardStartingRecord(predecessorTabId: string): Promise<void> {
    try {
      await this.ackStore?.discardStarting(predecessorTabId);
    } catch (error: unknown) {
      this.reportError('handoff acknowledgement rollback failed', error);
    }
  }

  /** Drop a bind whose successor tab is no longer a live session. */
  private dropGoneSuccessors(): void {
    for (const [tabId, bind] of [...this.pending.entries()]) {
      // An uncommitted bind belongs to a start that has not settled yet;
      // the start path deletes it on timeout or refusal.
      if (!bind.committed) continue;
      let found: ReturnType<SessionLifecycleManager['find']> | undefined;
      try {
        found = this.lifecycle.find(tabId);
      } catch (error: unknown) {
        this.reportError('handoff successor lookup failed', error);
        continue;
      }
      if (!found) this.pending.delete(tabId);
    }
  }

  private async recordLateAck(
    record: import('./session-handoff-ack.store').HandoffAckRecord,
    hadStartingRecord = false,
  ): Promise<void> {
    this.recoverableRecords.set(record.predecessorTabId, record);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (!this.ackStore)
          throw new Error('handoff acknowledgement storage unavailable');
        if (hadStartingRecord) {
          const settled = await this.ackStore.compareAndSet(record.predecessorTabId, 'starting', {
            state: 'recorded',
            successorSdkId: record.successorSdkId,
            ...(record.keepPredecessor ? { keepPredecessor: true } : {}),
          });
          if (!settled) throw new Error('handoff starting record changed before late settlement');
        } else {
          await this.ackStore.record(record);
        }
        this.recoverableRecords.delete(record.predecessorTabId);
        return;
      } catch (error: unknown) {
        this.reportError('handoff acknowledgement write failed', error);
        if (attempt < 2)
          await new Promise<void>((resolveDelay) =>
            setTimeout(resolveDelay, 100 * 2 ** attempt),
          );
      }
    }
  }

  private reportError(message: string, error: unknown): void {
    const reported = error instanceof Error ? error : new Error(String(error));
    if (this.logger) {
      this.logger.error(`${LOG_PREFIX} ${message}`, reported);
      return;
    }
    this.log(`${message}: ${safeErrorKind(error)}`);
  }

  private remember(callerTabId: string, entry: HandedOff): void {
    if (this.endedInFlight.delete(callerTabId)) return;
    this.handedOff.delete(callerTabId);
    this.handedOff.set(callerTabId, entry);
  }

  /**
   * The chat host port as registered NOW. `null` when there is no container,
   * nothing is registered yet, or construction throws.
   */
  private lookupHost(): IChildChatSessionHost | null {
    const token = CLI_AGENT_RUNTIME_TOKENS.CHILD_CHAT_SESSION_HOST;
    if (this.container === null || !this.container.isRegistered(token, true)) {
      return null;
    }
    try {
      return this.container.resolve<IChildChatSessionHost>(token);
    } catch (error: unknown) {
      // degradation-audit: reported - logged below; the handoff is refused
      // as `chat-runtime-unavailable`, a closed reason the caller reads.
      this.log(`chat host could not be resolved: ${safeErrorKind(error)}`);
      return null;
    }
  }

  /** Logs the refusal; the prompt text is never part of a detail. */
  private refuse(
    refusal: SessionHandoffRefusalCode,
    detail: string,
  ): HandoffRefusal {
    this.log(`handoff refused (${refusal}): ${detail}`);
    return { ok: false, refusal, detail };
  }

  /** Never throws: a failing output channel must not change the result. */
  private log(message: string): void {
    try {
      this.output.appendLine(`${LOG_PREFIX} ${message}`);
    } catch {
      // degradation-audit: optional-capability - the output channel is optional;
      // a lost log line keeps the never-throw port.
    }
  }
}

/** `work`'s value, or `TIMED_OUT` after `ms`. The timer is always cleared. */
async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
