import { inject, injectable } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { SDK_TOKENS, SessionActivityRegistry } from '@ptah-extension/agent-sdk';
import {
  SessionId,
  type IAgentAdapter,
  type ParentDeliveryView,
} from '@ptah-extension/shared';
import { CLI_AGENT_RUNTIME_TOKENS } from '../../di/tokens';
import {
  ParentEnvelopeStoreService,
  type NewParentDeliveryEnvelope,
  type ParentAdmittedEnqueueResult,
  type ParentDeliveryEnvelope,
  type ParentEnqueueAdmission,
  type ParentEnqueueResult,
  type ParentMutationResult,
} from './parent-envelope-store.service';
import type { ParentCompletionOutboxEntry } from './parent-envelope.schema';
import { classifyParentSendFailure } from './parent-send-failure.classifier';
import { SessionChildRegistry } from '../../session-children/session-child.registry';
import type { SessionHandoffAckStore } from '../../session-children/session-handoff-ack.store';
import { latestDeliveryTarget } from '../../session-children/session-handoff-lineage';

/** A stored envelope, or a view-only `not-saved` delivery (with `removed` once saved). */
export type ParentDeliveryEvent =
  | ParentDeliveryEnvelope
  | (ParentDeliveryView & { readonly removed?: true });
export interface ParentDeliveryEventSink {
  emit(envelope: ParentDeliveryEvent): void;
}
export type ParentRetryTickListener = () => void | Promise<void>;

const BACKOFF_MS = [5_000, 30_000, 120_000, 600_000] as const;
/** A child report whose binding never comes back is cancelled after this long. */
const BINDING_WAIT_MS = 24 * 60 * 60 * 1000;

/**
 * `unknown`: the child is not in the in-memory registry (for example after a
 * host restart). `lookup-failed`: the handoff lineage could not be read, or the
 * binding kept moving while it was read. Neither proves a new owner.
 */
type SessionOwnerState = 'matches' | 'changed' | 'unknown' | 'lookup-failed';

@injectable()
export class ParentDeliveryDrainerService {
  private readonly draining = new Map<string, Promise<void>>();
  private readonly dirty = new Set<string>();
  private readonly accepted = new Map<string, () => void>();
  private readonly retryTickListeners = new Set<ParentRetryTickListener>();
  /** View-only deliveries; bounded by the notifier's pending replay map. */
  private readonly unsaved = new Map<string, ParentDeliveryView>();
  private readonly unregisterActivity?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private timerAt?: number;
  private disposed = false;

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(ParentEnvelopeStoreService) private readonly store: ParentEnvelopeStoreService,
    @inject(TOKENS.AGENT_ADAPTER, { isOptional: true }) private readonly adapter: IAgentAdapter | null,
    @inject(SDK_TOKENS.SDK_SESSION_ACTIVITY_REGISTRY, { isOptional: true })
    activity: SessionActivityRegistry | null,
    @inject(CLI_AGENT_RUNTIME_TOKENS.PARENT_DELIVERY_EVENT_SINK, { isOptional: true })
    private readonly sink: ParentDeliveryEventSink | null,
    /** Rechecks a child session's recorded owner before its queued report is sent. */
    @inject(SessionChildRegistry, { isOptional: true })
    private readonly sessionChildren: SessionChildRegistry | null = null,
    @inject(CLI_AGENT_RUNTIME_TOKENS.SESSION_HANDOFF_ACK_STORE, { isOptional: true })
    private readonly handoffAcks: SessionHandoffAckStore | null = null,
  ) {
    this.unregisterActivity = activity?.register(({ sessionId }) => {
      void this.drain(sessionId).catch((error: unknown) => this.logCallbackError(error));
    });
    void this.startupDrain();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.timerAt = undefined;
    this.retryTickListeners.clear();
    this.unsaved.clear();
    this.unregisterActivity?.();
  }

  find(dedupeKey: string): ParentDeliveryEnvelope | undefined {
    return this.store.find(dedupeKey);
  }

  list(parentSessionId?: string): readonly ParentDeliveryEnvelope[] {
    return this.store.list(parentSessionId);
  }

  toView(envelope: ParentDeliveryEnvelope): ParentDeliveryView {
    return this.store.toView(envelope);
  }

  isParentFrozen(parentSessionId: string): boolean {
    return this.store.isParentFrozen(parentSessionId);
  }

  isCompletionSatisfied(parentSessionId: string, dedupeKey: string): Promise<boolean> {
    return this.store.isCompletionSatisfied(parentSessionId, dedupeKey);
  }

  backfillCompletionKeys(parentSessionId?: string): Promise<void> {
    return this.store.backfillCompletionKeys(parentSessionId);
  }

  listCompletionOutbox(
    parentSessionId?: string,
  ): Promise<readonly ParentCompletionOutboxEntry[]> {
    return this.store.listCompletionOutbox(parentSessionId);
  }

  async enqueue(
    envelope: NewParentDeliveryEnvelope,
    onAccepted?: () => void,
  ): Promise<ParentEnqueueResult> {
    const saved = await this.store.enqueue(envelope);
    if (!('refused' in saved)) this.accept(saved, onAccepted);
    else if (saved.refused === 'storage-unavailable') this.schedule(5_000);
    return saved;
  }

  /** `enqueue` with an owner check that the store runs inside its serialized write. */
  async enqueueAdmitted(
    envelope: NewParentDeliveryEnvelope,
    admit: ParentEnqueueAdmission,
    onAccepted?: () => void,
  ): Promise<ParentAdmittedEnqueueResult> {
    const saved = await this.store.enqueueAdmitted(envelope, admit);
    if (!('refused' in saved)) this.accept(saved, onAccepted);
    else if (saved.refused === 'storage-unavailable') this.schedule(5_000);
    return saved;
  }

  async cancel(id: string, reason?: string): Promise<ParentMutationResult> {
    const result = await this.store.cancel(id, reason);
    if (!('refused' in result)) this.emitSafely(result);
    return result;
  }

  async consumeCompletion(parentSessionId: string, dedupeKey: string): Promise<void> {
    await this.store.consumeCompletion(parentSessionId, dedupeKey);
  }

  async retry(
    id: string,
    options: { confirmDuplicateRisk?: boolean } = {},
  ): Promise<ParentMutationResult> {
    const result = await this.store.retry(id, options);
    if ('refused' in result) return result;
    this.emitSafely(result);
    void this.drain(result.parentSessionId).catch((error: unknown) => this.logCallbackError(error));
    return result;
  }

  publishUnsaved(view: ParentDeliveryView): void {
    this.unsaved.set(view.deliveryId, view);
    this.emitSafely(view);
  }

  clearUnsaved(deliveryId: string): void {
    const view = this.unsaved.get(deliveryId);
    if (!view) return;
    this.unsaved.delete(deliveryId);
    this.emitSafely({ ...view, removed: true });
  }

  onRetryTick(listener: ParentRetryTickListener): () => void {
    this.retryTickListeners.add(listener);
    return () => this.retryTickListeners.delete(listener);
  }

  scheduleRetry(delayMs = BACKOFF_MS[0]): void {
    this.schedule(delayMs);
  }

  drain(parentSessionId: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const existing = this.draining.get(parentSessionId);
    if (existing) {
      this.dirty.add(parentSessionId);
      return existing;
    }
    const task = Promise.resolve().then(async () => {
      try {
        do {
          this.dirty.delete(parentSessionId);
          await this.drainOnce(parentSessionId);
        } while (this.dirty.has(parentSessionId));
      } finally {
        this.draining.delete(parentSessionId);
        if (this.dirty.delete(parentSessionId)) await this.drain(parentSessionId);
      }
    });
    this.draining.set(parentSessionId, task);
    return task;
  }

  async resolveParentSessionId(tabId: string, sessionId: string): Promise<void> {
    await this.store.resolveParentSessionId(tabId, sessionId);
    await this.drain(sessionId);
  }

  /** A callback waits until its row is delivered, cancelled or gone, across retries. */
  private accept(saved: ParentDeliveryEnvelope, onAccepted?: () => void): void {
    for (const key of this.accepted.keys()) {
      const state = this.store.find(key)?.state;
      if (state === undefined || state === 'delivered' || state === 'cancelled')
        this.accepted.delete(key);
    }
    if (onAccepted && saved.state === 'pending') this.accepted.set(saved.dedupeKey, onAccepted);
    if (saved.state === 'pending') this.emitSafely(saved);
    void this.drain(saved.parentSessionId).catch((error: unknown) => this.logCallbackError(error));
  }

  private async startupDrain(): Promise<void> {
    try {
      await this.store.restore();
      if (this.disposed) return;
      const parents = new Set(this.store.list().map((entry) => entry.parentSessionId));
      for (const parentSessionId of parents) await this.drain(parentSessionId);
      this.scheduleNext();
    } catch (error: unknown) {
      // Degradation: a failed restore is retried before any adapter call.
      this.logger.error('[ParentDeliveryDrainer] Startup restore failed', this.error(error));
      this.schedule(5_000);
    }
  }

  private async drainOnce(parentSessionId: string): Promise<void> {
    await this.store.restore();
    if (this.disposed || this.store.isParentFrozen(parentSessionId)) return;
    const id = SessionId.safeParse(parentSessionId);
    if (!id || !this.adapter?.isSessionActive(id)) {
      await this.store.markWaiting(parentSessionId);
      return;
    }
    for (const pending of this.store.list(parentSessionId).filter((entry) =>
      entry.state === 'pending' || entry.state === 'blocked-retryable')) {
      if (this.disposed || this.store.isParentFrozen(parentSessionId)) return;
      if (pending.nextRetryAt !== undefined && pending.nextRetryAt > Date.now()) {
        this.schedule(pending.nextRetryAt - Date.now());
        continue;
      }
      if (!this.adapter.isSessionActive(id)) {
        await this.store.markWaiting(parentSessionId);
        return;
      }
      if (pending.originKind === 'session') {
        const owner = await this.sessionOwner(pending);
        if (owner !== 'matches') {
          await this.holdSessionReport(pending, owner, false);
          continue;
        }
      }
      let sending: ParentDeliveryEnvelope | undefined;
      try {
        sending = await this.store.markSending(pending.id);
      } catch (error: unknown) {
        this.logger.error('[ParentDeliveryDrainer] Could not persist sending state', this.error(error));
        this.schedule(this.backoff(pending.attempts));
        break;
      }
      // The entry changed state after the snapshot (for example, it was cancelled).
      if (!sending) continue;
      this.emitSafely(sending);
      const body = await this.store.getBody(sending.id);
      if (body === undefined) {
        const unknown = await this.store.markOutcomeUnknown(sending.id, 'body-unavailable');
        if (unknown) this.emitSafely(unknown);
        break;
      }
      // The owner can change while the claim and the body read wait on storage.
      if (sending.originKind === 'session') {
        const owner = await this.sessionOwner(sending);
        if (owner !== 'matches') {
          await this.holdSessionReport(pending, owner, true);
          continue;
        }
      }
      try {
        await this.adapter.sendMessageToSession(id, body, {
          clientMessageId: sending.id,
          origin: {
            kind: 'peer',
            from: sending.originKind === 'session'
              ? `ptah-session:${sending.agentId}`
              : `ptah-agent:${sending.agentId}`,
            name: sending.originName,
          },
        });
      } catch (error: unknown) {
        await this.recordSendFailure(sending, error);
        break;
      }
      await this.recordDelivered(sending);
    }
  }

  /**
   * Whether a queued child-session report may still go to its envelope parent.
   * The registry binding is read again after the async lineage read; if it
   * moved, the check runs once more, then reports `lookup-failed`.
   */
  private async sessionOwner(
    envelope: ParentDeliveryEnvelope,
    retried = false,
  ): Promise<SessionOwnerState> {
    const recorded = this.recordedOwners(envelope.agentId);
    if (!recorded) return 'unknown';
    if (recorded.includes(envelope.parentSessionId)) return 'matches';
    const owner = recorded.find((value) => SessionId.safeParse(value));
    if (!owner || !this.handoffAcks) return 'changed';
    let forwarded: string;
    try {
      forwarded = latestDeliveryTarget(await this.handoffAcks.records(), owner);
    } catch (error: unknown) {
      this.logger.error('[ParentDeliveryDrainer] Handoff lineage read failed', this.error(error));
      return 'lookup-failed';
    }
    const after = this.recordedOwners(envelope.agentId);
    if (after?.join('\0') !== recorded.join('\0'))
      return retried ? 'lookup-failed' : this.sessionOwner(envelope, true);
    return forwarded === envelope.parentSessionId ? 'matches' : 'changed';
  }

  private recordedOwners(childSessionId: string): readonly string[] | undefined {
    const child = this.sessionChildren?.get(childSessionId);
    if (!child || child.childSessionId !== childSessionId) return undefined;
    return [child.parentSessionId, child.parentSdkSessionId]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);
  }

  /**
   * A report whose owner is not confirmed is never sent. `changed` cancels it;
   * `unknown` and `lookup-failed` keep the body and wait with bounded backoff.
   * Limitation: a restored binding does not wake the drainer; the next backoff
   * tick (at most 10 minutes) or parent activity picks the entry up.
   * `claimed`: the entry is already `sending`; `snapshot` is its state before the claim.
   */
  private async holdSessionReport(
    snapshot: ParentDeliveryEnvelope,
    owner: Exclude<SessionOwnerState, 'matches'>,
    claimed: boolean,
  ): Promise<void> {
    if (owner === 'changed') {
      await this.cancelStaleSessionReport(snapshot, 'owner-changed', claimed);
      return;
    }
    if (owner === 'unknown' && Date.now() - snapshot.createdAt > BINDING_WAIT_MS) {
      await this.cancelStaleSessionReport(snapshot, 'binding-unavailable', claimed);
      return;
    }
    const reason = owner === 'unknown' ? 'waiting-for-binding' : 'owner-lookup-failed';
    const delay = this.deferral(snapshot, reason);
    try {
      const next = claimed
        ? await this.store.markBlocked(snapshot.id, reason, delay)
        : await this.store.markDeferred(snapshot.id, reason, delay);
      if (next) this.emitSafely(next);
    } catch (error: unknown) {
      // Degradation: the entry keeps its body; the timer below rechecks the owner.
      this.logger.error('[ParentDeliveryDrainer] Could not defer child report', this.error(error));
    }
    this.schedule(delay);
  }

  /** Grows through `BACKOFF_MS` while the same reason repeats. */
  private deferral(entry: ParentDeliveryEnvelope, reason: string): number {
    const previous = entry.lastError === reason && entry.nextRetryAt !== undefined
      ? entry.nextRetryAt - entry.updatedAt
      : 0;
    return BACKOFF_MS.find((delay) => delay > previous + 1_000) ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  }

  /** The cancelled entry stays in delivery status, so the undelivered outcome is not lost. */
  private async cancelStaleSessionReport(
    envelope: ParentDeliveryEnvelope,
    reason: 'owner-changed' | 'binding-unavailable',
    claimed: boolean,
  ): Promise<void> {
    this.logger.warn('[ParentDeliveryDrainer] Child session report cancelled', {
      parentSessionId: envelope.parentSessionId, childSessionId: envelope.agentId, reason,
    });
    try {
      await this.cancel(envelope.id, reason);
      return;
    } catch (error: unknown) {
      // Degradation: the body is kept; the retry below rechecks the owner and cancels again.
      this.logger.error('[ParentDeliveryDrainer] Could not cancel stale child report', this.error(error));
    }
    if (claimed) {
      // A claimed row left `sending` is never drained again, so release it for the retry.
      try {
        const blocked = await this.store.markBlocked(envelope.id, reason, BACKOFF_MS[0]);
        if (blocked) this.emitSafely(blocked);
      } catch (error: unknown) {
        // Degradation: restore turns a stuck `sending` row into outcome-unknown; it is never sent.
        this.logger.error('[ParentDeliveryDrainer] Could not release stale child report', this.error(error));
      }
    }
    this.schedule(BACKOFF_MS[0]);
  }

  /** A failed `delivered` write stays `sending` on disk, which restore makes outcome-unknown. */
  private async recordDelivered(sending: ParentDeliveryEnvelope): Promise<void> {
    try {
      const delivered = await this.store.markDelivered(sending.dedupeKey);
      if (delivered) this.emitSafely(delivered);
    } catch (error: unknown) {
      this.logger.error('[ParentDeliveryDrainer] Could not persist delivered state', this.error(error));
    }
    try {
      this.accepted.get(sending.dedupeKey)?.();
    } catch (error: unknown) {
      this.logCallbackError(error);
    } finally {
      this.accepted.delete(sending.dedupeKey);
    }
  }

  private async recordSendFailure(
    sending: ParentDeliveryEnvelope,
    error: unknown,
  ): Promise<void> {
    const failure = classifyParentSendFailure(error);
    this.logger.warn('[ParentDeliveryDrainer] Parent send failed', {
      parentSessionId: sending.parentSessionId, kind: sending.kind, failure,
    });
    const next = failure === 'not-accepted'
      ? await this.store.markBlocked(sending.id, this.reason(error), this.backoff(sending.attempts))
      : await this.store.markOutcomeUnknown(sending.id, this.reason(error));
    if (!next) return;
    this.emitSafely(next);
    if (next.nextRetryAt !== undefined) this.schedule(next.nextRetryAt - Date.now());
  }

  private scheduleNext(): void {
    const next = Math.min(...this.store.list()
      .filter((entry) => (entry.state === 'pending' || entry.state === 'blocked-retryable') &&
        entry.nextRetryAt !== undefined && entry.waitingReason !== 'parent-offline')
      .map((entry) => entry.nextRetryAt ?? Number.POSITIVE_INFINITY));
    if (Number.isFinite(next)) this.schedule(Math.max(0, next - Date.now()));
  }

  private schedule(delayMs: number): void {
    if (this.disposed) return;
    const due = Date.now() + Math.max(0, delayMs);
    if (this.timer && this.timerAt !== undefined && this.timerAt <= due) return;
    if (this.timer) clearTimeout(this.timer);
    this.timerAt = due;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.timerAt = undefined;
      void this.retryTick().catch((error: unknown) => this.logCallbackError(error));
    }, Math.max(0, delayMs));
  }

  private async retryTick(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.store.restore();
      const parents = new Set(this.store.list().map((entry) => entry.parentSessionId));
      for (const parentSessionId of parents) await this.drain(parentSessionId);
      await this.store.backfillCompletionKeys();
      const listenersFailed = await this.runRetryTickListeners();
      this.scheduleNext();
      if (listenersFailed) this.schedule(BACKOFF_MS[0]);
    } catch (error: unknown) {
      // Degradation: restore and completion backfill retry on the same drainer timer.
      this.logger.error('[ParentDeliveryDrainer] Retry tick failed', this.error(error));
      this.schedule(5_000);
    }
  }

  /** A listener that throws still has work, so the same timer runs again. */
  private async runRetryTickListeners(): Promise<boolean> {
    let failed = false;
    for (const listener of [...this.retryTickListeners]) {
      try {
        await listener();
      } catch (error: unknown) {
        failed = true;
        this.logCallbackError(error);
      }
    }
    return failed;
  }

  private backoff(attempts: number): number {
    return BACKOFF_MS[Math.min(Math.max(0, attempts - 1), BACKOFF_MS.length - 1)];
  }

  private emitSafely(envelope: ParentDeliveryEvent): void {
    try {
      this.sink?.emit(envelope);
    } catch (error: unknown) {
      this.logCallbackError(error);
    }
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 200) : 'delivery-failed';
  }

  private error(error: unknown): Error {
    return error instanceof Error ? error : new Error('Parent delivery operation failed');
  }

  private logCallbackError(error: unknown): void {
    this.logger.error('[ParentDeliveryDrainer] Delivery callback failed', this.error(error));
  }
}
