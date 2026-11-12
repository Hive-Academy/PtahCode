/**
 * Chat follow-up queue coordinator (TASK_2026_884).
 *
 * The provider adapter holds a follow-up sent with `queueIntent: 'next-turn'`
 * for its session and admits it as the next turn. This service is the chat
 * side of that queue:
 *
 *  - it remembers which tab queued each held item (`sessionId` +
 *    `clientMessageId` → `tabId`), captured when `chat:continue` hands the item
 *    to the adapter, so a state change is pushed to that tab and only that tab
 *    can list, withdraw or steer it;
 *  - it subscribes to `IAgentAdapter.onQueuedFollowUpState` (feature-checked:
 *    an adapter without it keeps today's behaviour) and pushes every change as
 *    `MESSAGE_TYPES.CHAT_QUEUED_MESSAGE_STATE` straight to the webview. The push
 *    bypasses the stream-viewport suppression, so a hidden tab receives it;
 *  - it withdraws every held item of a session, FIFO, before Stop interrupts.
 *
 * The tab is never resolved from the active tab. It comes from the item's
 * binding, else from the session's live Claude registration.
 *
 * Bindings exist only while an item is held: a terminal state, a confirmed
 * withdraw or steer, an admission that was not held, or a failed send removes
 * it. No timer or observer per item.
 */

import { inject, injectable } from 'tsyringe';
import { Logger, RpcUserError, TOKENS } from '@ptah-extension/vscode-core';
import {
  SDK_TOKENS,
  type SessionIdResolvedCallbackRegistry,
  type SessionLifecycleManager,
} from '@ptah-extension/agent-sdk';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import type {
  ChatQueuedMessageStateEvent,
  IAgentAdapter,
  QueuedFollowUpSnapshot,
  QueuedFollowUpStateChange,
  RpcUserErrorCode,
  SessionId,
  SteerQueuedFollowUpResult,
} from '@ptah-extension/shared';

import type { WebviewManager } from '../streaming/chat-stream-broadcaster.service';
import { CHAT_TOKENS } from '../tokens';

/** How `chat:continue` reports an accepted queued send. */
export type FollowUpAcceptance = 'queued' | 'admitted';

/** The live Claude registration lookup this service reads (tab ↔ session). */
type SessionRegistrations = Pick<SessionLifecycleManager, 'find'>;

/** Refusal text shared by every ownership check; it names no id. */
const NOT_THIS_TAB_MESSAGE = 'This conversation is not open in this tab.';
const RECEIPT_RETENTION_MS = 10 * 60 * 1000;
const MAX_TERMINAL_RECEIPTS = 200;
/** Upper bound of remembered tab → session bindings; the oldest leave first. */
const MAX_TAB_BINDINGS = 256;

@injectable()
export class ChatFollowUpQueueService {
  /** sessionId → (clientMessageId → tabId) for items still held. */
  private readonly bindings = new Map<string, Map<string, string>>();
  private readonly states = new Map<string, Map<string, QueuedFollowUpStateChange['state']>>();
  private readonly receiptOwners = new Map<string, Map<string, string>>();
  private readonly receiptContent = new Map<string, Map<string, string>>();
  private readonly rejections = new Map<string, Map<string, RpcUserErrorCode | undefined>>();
  private readonly terminalAt = new Map<string, Map<string, number>>();
  private readonly abandoned = new Map<string, Set<string>>();
  private readonly committed = new Map<string, Set<string>>();
  private readonly admissions = new Map<string, Map<string, { tabId: string; count: number }>>();
  private readonly stopGenerations = new Map<string, number>();
  private readonly stopAt = new Map<string, number>();
  private readonly submissions = new Map<string, Set<Promise<void>>>();
  /** sessionId → tab that reopened the live session, with the registration it adopted. */
  private readonly adopted = new Map<string, { tabId: string; record: object }>();
  /**
   * tabId → the session the host last bound that tab to. A queued follow-up
   * is addressed to a session, not to its stream owner: any tab still bound to
   * the live session may queue, list and withdraw its own items, even after
   * another tab restarted the session and took the stream. A tab leaves only
   * when it binds another session or the bound is reached.
   */
  private readonly tabSessions = new Map<string, string>();
  private readonly unsubscribe: (() => void) | null;
  private readonly unsubscribeResolved: (() => void) | null;

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.WEBVIEW_MANAGER)
    private readonly webviewManager: WebviewManager,
    @inject(TOKENS.AGENT_ADAPTER)
    private readonly sdkAdapter: IAgentAdapter,
    /**
     * Optional: a host without the Claude lifecycle manager has no
     * registration to consult, so only the item bindings decide ownership.
     */
    @inject(SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER, { isOptional: true })
    private readonly registrations: SessionRegistrations | null = null,
    @inject(CHAT_TOKENS.CODEX_SESSION_OWNER, { isOptional: true })
    private readonly codexOwner: ((sessionId: string) => string | undefined) | null = null,
    @inject(SDK_TOKENS.SDK_SESSION_ID_RESOLVED_CALLBACK_REGISTRY, { isOptional: true })
    sessionIdResolved: Pick<SessionIdResolvedCallbackRegistry, 'register'> | null = null,
  ) {
    this.unsubscribeResolved =
      sessionIdResolved?.register(({ tabId, realSessionId, previousSessionId }) => {
        // A compaction or resume gave the same conversation a new id: every
        // tab that showed the previous id now shows the new one.
        if (previousSessionId !== undefined && previousSessionId !== realSessionId) {
          for (const [boundTab, boundSession] of this.tabSessions) {
            if (boundSession === previousSessionId) this.tabSessions.set(boundTab, realSessionId);
          }
        }
        if (tabId) this.noteTabSession(realSessionId, tabId);
      }) ?? null;
    this.unsubscribe =
      this.sdkAdapter.onQueuedFollowUpState?.((change) =>
        this.onStateChange(change),
      ) ?? null;
  }

  /** Release the adapter subscription. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribeResolved?.();
    this.tabSessions.clear();
    this.bindings.clear();
    this.states.clear();
    this.receiptOwners.clear();
    this.receiptContent.clear();
    this.rejections.clear();
    this.terminalAt.clear();
    this.abandoned.clear();
    this.committed.clear();
    this.admissions.clear();
    this.stopGenerations.clear();
    this.stopAt.clear();
    this.submissions.clear();
    this.adopted.clear();
  }

  trackSubmission(sessionId: string, submission: Promise<void>): void {
    const submissions = this.submissions.get(sessionId) ?? new Set<Promise<void>>();
    submissions.add(submission);
    this.submissions.set(sessionId, submissions);
    const remove = () => {
      submissions.delete(submission);
      if (submissions.size === 0) this.submissions.delete(sessionId);
    };
    void submission.then(remove, remove);
  }

  stopGeneration(sessionId: string): number {
    this.pruneStopGenerations();
    return this.stopGenerations.get(sessionId) ?? 0;
  }

  advanceStopGeneration(sessionId: string): void {
    this.stopGenerations.set(sessionId, this.stopGeneration(sessionId) + 1);
    this.stopAt.delete(sessionId);
    this.stopAt.set(sessionId, this.now());
    this.pruneStopGenerations();
  }

  private pruneStopGenerations(): void {
    for (const [sessionId, at] of this.stopAt) {
      if ((this.now() - at >= RECEIPT_RETENTION_MS || this.stopAt.size > MAX_TERMINAL_RECEIPTS) &&
          !this.admissions.get(sessionId)?.size && !this.submissions.get(sessionId)?.size) {
        this.stopAt.delete(sessionId);
        this.stopGenerations.delete(sessionId);
      }
    }
  }

  /** Remove all session-local receipt state when the owner retires it. */
  retireSession(sessionId: string): void {
    this.bindings.delete(sessionId);
    this.states.delete(sessionId);
    this.receiptOwners.delete(sessionId);
    this.receiptContent.delete(sessionId);
    this.rejections.delete(sessionId);
    this.terminalAt.delete(sessionId);
    this.abandoned.delete(sessionId);
    this.committed.delete(sessionId);
    this.admissions.delete(sessionId);
    this.stopGenerations.delete(sessionId);
    this.stopAt.delete(sessionId);
    this.submissions.delete(sessionId);
    this.adopted.delete(sessionId);
    for (const [tabId, boundSession] of this.tabSessions) {
      if (boundSession === sessionId) this.tabSessions.delete(tabId);
    }
  }

  private evictReceipt(sessionId: string, id: string): void {
    if (this.admissions.get(sessionId)?.size) return;
    this.states.get(sessionId)?.delete(id);
    this.receiptOwners.get(sessionId)?.delete(id);
    this.receiptContent.get(sessionId)?.delete(id);
    this.rejections.get(sessionId)?.delete(id);
    this.terminalAt.get(sessionId)?.delete(id);
    this.abandoned.get(sessionId)?.delete(id);
    this.bindings.get(sessionId)?.delete(id);
    this.committed.get(sessionId)?.delete(id);
    for (const map of [this.states, this.receiptOwners, this.receiptContent, this.rejections, this.terminalAt, this.bindings]) {
      if (map.get(sessionId)?.size === 0) map.delete(sessionId);
    }
    if (this.abandoned.get(sessionId)?.size === 0) this.abandoned.delete(sessionId);
    if (this.committed.get(sessionId)?.size === 0) this.committed.delete(sessionId);
  }

  private pruneReceipts(sessionId: string): void {
    const times = this.terminalAt.get(sessionId);
    if (!times) return;
    for (const [id, at] of times) {
      if (this.now() - at >= RECEIPT_RETENTION_MS || times.size > MAX_TERMINAL_RECEIPTS) {
        if (!this.admissions.get(sessionId)?.size) this.evictReceipt(sessionId, id);
      }
    }
  }

  private markTerminal(sessionId: string, id: string): void {
    const times = this.terminalAt.get(sessionId) ?? new Map<string, number>();
    if (!times.has(id)) times.set(id, this.now());
    this.terminalAt.set(sessionId, times);
    for (const recordedSession of this.terminalAt.keys()) this.pruneReceipts(recordedSession);
  }

  /** Overridable clock for retention tests. */
  protected now(): number { return Date.now(); }

  abandonPending(sessionId: string, tabId: string, id: string): void {
    if (this.receipt(sessionId, tabId, id) !== 'pending') return;
    if (this.isCommitted(sessionId, id)) return;
    const abandoned = this.abandoned.get(sessionId) ?? new Set<string>();
    abandoned.add(id);
    this.abandoned.set(sessionId, abandoned);
    this.rejectAdmission(sessionId, tabId, id, 'SESSION_CHANGED');
  }

  commitAdmission(sessionId: string, id: string): void {
    const committed = this.committed.get(sessionId) ?? new Set<string>();
    committed.add(id);
    this.committed.set(sessionId, committed);
  }

  isCommitted(sessionId: string, id: string): boolean {
    return this.committed.get(sessionId)?.has(id) === true;
  }

  /** Number of retained session receipt maps, for retention diagnostics. */
  receiptSessionCount(): number {
    return new Set([
      ...this.states.keys(), ...this.receiptOwners.keys(), ...this.rejections.keys(),
      ...this.terminalAt.keys(), ...this.abandoned.keys(), ...this.bindings.keys(),
      ...this.committed.keys(),
    ]).size;
  }

  isAbandoned(sessionId: string, id: string): boolean {
    return this.abandoned.get(sessionId)?.has(id) === true;
  }

  /**
   * Throw when `sessionId` is open in a different tab: a live Claude
   * registration under another tab, or items held for another tab. A session
   * with neither is unowned and accepted.
   */
  assertTabOwnsSession(sessionId: string, tabId: string): void {
    const owner = this.ownerTab(sessionId);
    if (owner === undefined || owner === tabId) {
      if (owner !== undefined) this.noteTabSession(sessionId, tabId);
      return;
    }
    // Another tab owns the stream, but this tab still shows the same live
    // session (for example the stream owner restarted a dead record): its
    // queued follow-ups belong to the session, so accept them. The stream
    // stays where it is.
    if (this.liveIdentity(sessionId) && this.tabSessions.get(tabId) === sessionId) {
      // Refresh the binding so a tab in use is never the oldest one.
      this.noteTabSession(sessionId, tabId);
      return;
    }
    this.logger.warn('[RPC] follow-up refused: tab is not bound to the session', {
      sessionId,
      tabId,
      ownerTabId: owner,
    });
    throw new RpcUserError(NOT_THIS_TAB_MESSAGE, 'SESSION_NOT_FOUND');
  }

  /**
   * Remember that `tabId` shows `sessionId`. A tab shows one session, so a new
   * binding replaces the old one. Bounded: the oldest binding leaves first.
   */
  noteTabSession(sessionId: string, tabId: string): void {
    this.tabSessions.delete(tabId);
    this.tabSessions.set(tabId, sessionId);
    while (this.tabSessions.size > MAX_TAB_BINDINGS) {
      const oldest = this.tabSessions.keys().next().value;
      if (oldest === undefined) break;
      this.tabSessions.delete(oldest);
    }
  }

  /** Capture the actual registration object so replacement under the same id is visible. */
  liveIdentity(sessionId: string): object | undefined {
    const record = this.registrations?.find(sessionId);
    return record?.realSessionId === sessionId ? record : undefined;
  }

  ownerIdentity(sessionId: string): string | undefined {
    return this.ownerTab(sessionId);
  }

  acceptedRetry(sessionId: string, tabId: string, clientMessageId: string, content: string): FollowUpAcceptance | undefined {
    const receipt = this.receipt(sessionId, tabId, clientMessageId);
    if (receipt === 'delivered' || receipt === 'steered' || receipt === 'queued') {
      if (this.receiptContent.get(sessionId)?.get(clientMessageId) !== content) {
        throw new RpcUserError('Follow-up ID has different content.', 'FOLLOW_UP_ID_CONFLICT');
      }
      return receipt === 'queued' ? 'queued' : 'admitted';
    }
    return undefined;
  }

  beginAdmission(sessionId: string, tabId: string, clientMessageId: string, content?: string): void {
    const admissions = this.admissions.get(sessionId) ?? new Map<string, { tabId: string; count: number }>();
    const previousOwner = admissions.get(clientMessageId)?.tabId ??
      this.receiptOwners.get(sessionId)?.get(clientMessageId);
    if (previousOwner !== undefined && previousOwner !== tabId) {
      throw new RpcUserError(NOT_THIS_TAB_MESSAGE, 'FOLLOW_UP_ID_CONFLICT');
    }
    const previousContent = this.receiptContent.get(sessionId)?.get(clientMessageId);
    if (content !== undefined && previousContent !== undefined && previousContent !== content) {
      throw new RpcUserError('Follow-up ID has different content.', 'FOLLOW_UP_ID_CONFLICT');
    }
    if (content !== undefined) {
      const contents = this.receiptContent.get(sessionId) ?? new Map<string, string>();
      contents.set(clientMessageId, content);
      this.receiptContent.set(sessionId, contents);
    }
    admissions.set(clientMessageId, { tabId, count: (admissions.get(clientMessageId)?.count ?? 0) + 1 });
    this.admissions.set(sessionId, admissions);
  }

  endAdmission(sessionId: string, clientMessageId: string): void {
    const admissions = this.admissions.get(sessionId);
    const admission = admissions?.get(clientMessageId);
    if (!admission) return;
    if (admission.count > 1) admissions?.set(clientMessageId, { ...admission, count: admission.count - 1 });
    else admissions?.delete(clientMessageId);
    if (admissions?.size === 0) this.admissions.delete(sessionId);
    this.pruneReceipts(sessionId);
  }

  /** A native resume already started the turn; keep its receipt after admission ends. */
  acceptResumed(sessionId: string, tabId: string, clientMessageId: string): void {
    this.committed.get(sessionId)?.delete(clientMessageId);
    if (this.committed.get(sessionId)?.size === 0) this.committed.delete(sessionId);
    this.bind(sessionId, tabId, clientMessageId);
    const states = this.states.get(sessionId) ?? new Map<string, QueuedFollowUpStateChange['state']>();
    if (!states.has(clientMessageId)) states.set(clientMessageId, 'delivered');
    this.states.set(sessionId, states);
    this.unbind(sessionId, clientMessageId);
    this.markTerminal(sessionId, clientMessageId);
  }

  rejectAdmission(sessionId: string, tabId: string, clientMessageId: string, errorCode?: RpcUserErrorCode): void {
    this.committed.get(sessionId)?.delete(clientMessageId);
    if (this.committed.get(sessionId)?.size === 0) this.committed.delete(sessionId);
    const receipt = this.receipt(sessionId, tabId, clientMessageId);
    if (receipt === 'delivered' || receipt === 'steered' || receipt === 'queued') return;
    const owners = this.receiptOwners.get(sessionId) ?? new Map<string, string>();
    owners.set(clientMessageId, tabId);
    this.receiptOwners.set(sessionId, owners);
    const rejected = this.rejections.get(sessionId) ?? new Map<string, RpcUserErrorCode | undefined>();
    if (!rejected.has(clientMessageId)) rejected.set(clientMessageId, errorCode);
    this.rejections.set(sessionId, rejected);
    this.markTerminal(sessionId, clientMessageId);
  }

  receiptErrorCode(sessionId: string, tabId: string, clientMessageId: string): RpcUserErrorCode | undefined {
    return this.receipt(sessionId, tabId, clientMessageId) === 'rejected'
      ? this.rejections.get(sessionId)?.get(clientMessageId) : undefined;
  }

  receipt(sessionId: string, tabId: string, clientMessageId: string): 'queued' | 'delivered' | 'steered' | 'pending' | 'rejected' | undefined {
    this.pruneReceipts(sessionId);
    const owner = this.receiptOwners.get(sessionId)?.get(clientMessageId) ??
      this.admissions.get(sessionId)?.get(clientMessageId)?.tabId;
    if (owner !== tabId) return undefined;
    const state = this.states.get(sessionId)?.get(clientMessageId);
    if (state === 'queued' || state === 'delivered' || state === 'steered') return state;
    if (this.rejections.get(sessionId)?.has(clientMessageId)) return 'rejected';
    return this.admissions.get(sessionId)?.has(clientMessageId) ? 'pending' : undefined;
  }

  /** Record the queuing tab BEFORE the adapter sees the item. */
  bind(sessionId: string, tabId: string, clientMessageId: string): void {
    const owners = this.receiptOwners.get(sessionId) ?? new Map<string, string>();
    const previousOwner = owners.get(clientMessageId);
    if (previousOwner !== undefined && previousOwner !== tabId) {
      throw new RpcUserError(NOT_THIS_TAB_MESSAGE, 'FOLLOW_UP_ID_CONFLICT');
    }
    owners.set(clientMessageId, tabId);
    this.receiptOwners.set(sessionId, owners);
    let items = this.bindings.get(sessionId);
    if (!items) {
      items = new Map();
      this.bindings.set(sessionId, items);
    }
    items.set(clientMessageId, tabId);
  }

  /** Drop a binding whose send failed or whose item left the queue. */
  unbind(sessionId: string, clientMessageId: string): void {
    const items = this.bindings.get(sessionId);
    if (!items) return;
    items.delete(clientMessageId);
    if (items.size === 0) this.bindings.delete(sessionId);
  }

  /**
   * After `sendMessageToSession` resolved: `queued` when the adapter still
   * holds the item, otherwise `admitted` (it started a turn, or the adapter has
   * no queue). An admitted item keeps no binding.
   */
  settleAccepted(sessionId: string, clientMessageId: string): FollowUpAcceptance {
    const held = this.heldItems(sessionId).some(
      (item) => item.clientMessageId === clientMessageId,
    );
    if (held) return 'queued';
    const state = this.states.get(sessionId)?.get(clientMessageId);
    if (state !== 'delivered' && state !== 'steered')
      throw new RpcUserError('Follow-up has no queued entry or delivered turn.', 'FOLLOW_UP_ID_CONFLICT');
    this.unbind(sessionId, clientMessageId);
    return 'admitted';
  }

  /** `chat:queued-list`: this tab's held items, FIFO. */
  list(sessionId: string, tabId: string): QueuedFollowUpSnapshot[] {
    this.assertTabOwnsSession(sessionId, tabId);
    return this.heldItems(sessionId).filter(
      (item) => this.boundTab(sessionId, item.clientMessageId) === tabId,
    );
  }

  /** `chat:queued-withdraw`: true only when removed before a turn claimed it. */
  async withdraw(
    sessionId: string,
    tabId: string,
    clientMessageId: string,
  ): Promise<boolean> {
    this.assertTabOwnsSession(sessionId, tabId);
    if (this.boundTab(sessionId, clientMessageId) !== tabId) return false;
    if (!this.sdkAdapter.withdrawQueuedFollowUp) return false;
    const removed = await this.sdkAdapter.withdrawQueuedFollowUp(
      sessionId as SessionId,
      clientMessageId,
    );
    if (removed) this.unbind(sessionId, clientMessageId);
    return removed;
  }

  /** `chat:queued-steer`: Codex `turn/steer`; `UNSUPPORTED` elsewhere. */
  async steer(
    sessionId: string,
    tabId: string,
    clientMessageId: string,
  ): Promise<SteerQueuedFollowUpResult> {
    this.assertTabOwnsSession(sessionId, tabId);
    if (this.boundTab(sessionId, clientMessageId) !== tabId) {
      return { ok: false, code: 'NOT_QUEUED' };
    }
    if (!this.sdkAdapter.steerQueuedFollowUp) {
      return { ok: false, code: 'UNSUPPORTED' };
    }
    const result = await this.sdkAdapter.steerQueuedFollowUp(
      sessionId as SessionId,
      clientMessageId,
    );
    if (result.ok && !result.mode) this.unbind(sessionId, clientMessageId);
    return result;
  }

  /**
   * Stop: withdraw every held item of the session in FIFO order, before the
   * caller interrupts. Returns only the confirmed withdrawals; an item a turn
   * claimed meanwhile (withdraw answered false) is not in it.
   */
  async withdrawAllForStop(sessionId: string): Promise<(QueuedFollowUpSnapshot & { readonly tabId: string })[]> {
    await Promise.allSettled([...(this.submissions.get(sessionId) ?? [])]);
    const adapter = this.sdkAdapter;
    if (!adapter.withdrawQueuedFollowUp) return [];
    const withdrawn: (QueuedFollowUpSnapshot & { readonly tabId: string })[] = [];
    for (const item of this.heldItems(sessionId)) {
      const tabId = this.boundTab(sessionId, item.clientMessageId);
      if (tabId === undefined) continue;
      try {
        const removed = await adapter.withdrawQueuedFollowUp(
          sessionId as SessionId,
          item.clientMessageId,
        );
        if (!removed) continue;
        this.unbind(sessionId, item.clientMessageId);
        withdrawn.push({ ...item, tabId });
      } catch (error: unknown) {
        // degradation-audit: reported - Stop must still interrupt; an item that could not be withdrawn stays held and the session end fails it.
        this.logger.warn(
          '[RPC] chat:abort could not withdraw a queued follow-up',
          error instanceof Error ? error : new Error(String(error)),
          { sessionId },
        );
      }
    }
    return withdrawn;
  }

  private onStateChange(change: QueuedFollowUpStateChange): void {
    const sessionId = change.sessionId as string;
    const states = this.states.get(sessionId) ?? new Map<string, QueuedFollowUpStateChange['state']>();
    states.set(change.clientMessageId, change.state);
    this.states.set(sessionId, states);
    const tabId = this.receiptOwners.get(sessionId)?.get(change.clientMessageId) ??
      this.boundTab(sessionId, change.clientMessageId);
    if (tabId !== undefined) {
      const owners = this.receiptOwners.get(sessionId) ?? new Map<string, string>();
      if (!owners.has(change.clientMessageId)) owners.set(change.clientMessageId, tabId);
      this.receiptOwners.set(sessionId, owners);
    }
    if (change.state !== 'queued') this.unbind(sessionId, change.clientMessageId);
    if (change.state !== 'queued') this.markTerminal(sessionId, change.clientMessageId);
    // An unbound change still reaches the tab that owns the live session,
    // but that tab never becomes the receipt owner: ownership follows the
    // submitter.
    const pushTabId = tabId ?? this.ownerTab(sessionId);
    if (pushTabId === undefined) {
      this.logger.debug('[RPC] queued follow-up state has no tab', {
        sessionId,
        state: change.state,
      });
      return;
    }
    const payload: ChatQueuedMessageStateEvent = {
      sessionId: change.sessionId,
      tabId: pushTabId,
      clientMessageId: change.clientMessageId,
      state: change.state,
      ...(change.state === 'failed' && change.reason === 'Session ended' ? { errorCode: 'SESSION_ENDED' as const } : {}),
      ...(change.reason !== undefined ? { reason: change.reason } : {}),
    };
    this.webviewManager
      .broadcastMessage(MESSAGE_TYPES.CHAT_QUEUED_MESSAGE_STATE, payload)
      .catch((error: unknown) => {
        // degradation-audit: reported - a lost push is recovered by chat:queued-list on reconnect.
        this.logger.warn(
          '[RPC] failed to deliver a queued follow-up state',
          error instanceof Error ? error : new Error(String(error)),
          { sessionId, state: change.state },
        );
      });
  }

  private heldItems(sessionId: string): QueuedFollowUpSnapshot[] {
    return [...(this.sdkAdapter.listQueuedFollowUps?.(sessionId as SessionId) ?? [])];
  }

  private boundTab(sessionId: string, clientMessageId: string): string | undefined {
    return this.bindings.get(sessionId)?.get(clientMessageId);
  }

  /** Tab of the live Claude record registered under this real session id. */
  private registeredTab(sessionId: string): string | undefined {
    const record = this.registrations?.find(sessionId);
    if (record?.realSessionId !== sessionId) return undefined;
    // Only a tab the host knows nothing about: a registration must not
    // replace the newer binding of a tab that opened another conversation.
    if (record.tabId && !this.tabSessions.has(record.tabId)) {
      this.noteTabSession(sessionId, record.tabId);
    }
    return record.tabId;
  }

  /**
   * `chat:resume` from a tab the user opened: when the session is live under a
   * different tab id, that tab now owns its follow-ups. The adoption holds
   * only for the registration it was made on.
   */
  adoptTab(sessionId: string, tabId: string): void {
    const record = this.liveIdentity(sessionId);
    if (!record || this.registeredTab(sessionId) === tabId) {
      this.adopted.delete(sessionId);
      return;
    }
    const previous = this.ownerTab(sessionId);
    this.adopted.set(sessionId, { tabId, record });
    this.noteTabSession(sessionId, tabId);
    if (previous === undefined || previous === tabId) return;
    // Items the earlier tab queued stay visible and addressable in this tab.
    for (const owners of [this.bindings.get(sessionId), this.receiptOwners.get(sessionId)]) {
      if (!owners) continue;
      for (const [id, owner] of owners) if (owner === previous) owners.set(id, tabId);
    }
    this.logger.info('[RPC] follow-up queue adopted by reopened tab', {
      sessionId,
      previousTabId: previous,
      tabId,
    });
  }

  private adoptedTab(sessionId: string): string | undefined {
    const adoption = this.adopted.get(sessionId);
    if (!adoption) return undefined;
    if (adoption.record === this.liveIdentity(sessionId)) return adoption.tabId;
    this.adopted.delete(sessionId);
    return undefined;
  }

  private ownerTab(sessionId: string): string | undefined {
    const codexOwner = this.codexOwner?.(sessionId);
    if (codexOwner !== undefined) return codexOwner;
    const adopted = this.adoptedTab(sessionId);
    if (adopted !== undefined) return adopted;
    const registered = this.registeredTab(sessionId);
    if (registered !== undefined) return registered;
    const items = this.bindings.get(sessionId);
    return items ? items.values().next().value : undefined;
  }
}
