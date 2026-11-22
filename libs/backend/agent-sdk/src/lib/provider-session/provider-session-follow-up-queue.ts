import type { Logger } from '@ptah-extension/vscode-core';
import type {
  QueuedFollowUpSnapshot,
  QueuedFollowUpStateChange,
  SessionId,
  SteerQueuedFollowUpResult,
} from '@ptah-extension/shared';
import { ProviderSessionChatAdapterError } from './provider-session-chat-adapter-error';
import type { ProviderSessionRealpath } from './provider-session-turn-files';
import {
  providerTurnInput,
  type ProviderSessionChatSession as Session,
  type ProviderSessionTurnInput,
  type ProviderSessionTurnOptions,
} from './provider-session-turn-stream';

/** Held turns of one session beyond this are refused as busy. */
const MAX_QUEUED_TURNS = 32;

/** A turn held until the running one ends: a follow-up or a peer message. */
export interface ProviderSessionQueuedTurn {
  readonly input: ProviderSessionTurnInput;
  readonly clientMessageId?: string;
  readonly inboundPeer?: { readonly label: string };
  /** Present for a backend-owned follow-up (state is reported, no caller waits). */
  readonly followUp?: QueuedFollowUpSnapshot;
  /** Present for a peer message whose sender waits for admission. */
  readonly waiter?: {
    resolve(): void;
    reject(error: Error): void;
  };
}

interface FollowUpQueueDependencies {
  readonly logger: Logger;
  /** Confines a steered turn's file references like a prompt's. */
  readonly realpath: ProviderSessionRealpath;
  /** Publish one turn; resolves at admission (the prompt receipt). */
  publish(
    session: Session,
    input: ProviderSessionTurnInput,
    options: Pick<ProviderSessionTurnOptions, 'clientMessageId' | 'inboundPeer'>,
  ): Promise<void>;
  failure(error: unknown, operation: string): ProviderSessionChatAdapterError;
  /** Start the next held turn if the session is idle (after a re-queue). */
  drainIfIdle(session: Session): void;
}

/**
 * The backend-owned follow-up queue of provider sessions (TASK_2026_884
 * contract): FIFO per session, one turn at a time, admitted when the running
 * turn ends. Peer messages share the FIFO without state reports.
 */
export class ProviderSessionFollowUpQueue {
  private readonly queues = new Map<Session, ProviderSessionQueuedTurn[]>();
  private readonly listeners = new Set<
    (change: QueuedFollowUpStateChange) => void
  >();

  constructor(private readonly deps: FollowUpQueueDependencies) {}

  hasHeld(session: Session): boolean {
    return (this.queues.get(session)?.length ?? 0) > 0;
  }

  isQueued(session: Session, clientMessageId: string): boolean {
    return this.index(session, clientMessageId) >= 0;
  }

  onState(listener: (change: QueuedFollowUpStateChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Hold a follow-up and report it as queued. */
  holdFollowUp(
    session: Session,
    input: ProviderSessionTurnInput,
    followUp: QueuedFollowUpSnapshot,
  ): void {
    this.enqueue(session, {
      input,
      clientMessageId: followUp.clientMessageId,
      followUp,
    });
    this.emit(session.id, followUp, 'queued');
  }

  /** Hold a peer message; resolves when its turn is admitted. */
  holdPeer(
    session: Session,
    item: Omit<ProviderSessionQueuedTurn, 'waiter' | 'followUp'>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) =>
      this.enqueue(session, { ...item, waiter: { resolve, reject } }),
    );
  }

  /** Start the next held turn. The caller checks the session is idle. */
  drain(session: Session): void {
    const next = this.queues.get(session)?.shift();
    if (!next) return;
    this.deps
      .publish(session, next.input, {
        ...(next.clientMessageId ? { clientMessageId: next.clientMessageId } : {}),
        ...(next.inboundPeer ? { inboundPeer: next.inboundPeer } : {}),
      })
      .then(
        () => {
          if (next.followUp) this.emit(session.id, next.followUp, 'delivered');
          next.waiter?.resolve();
        },
        (error: unknown) => {
          const failure = this.deps.failure(error, 'followUp');
          if (next.followUp)
            this.emit(
              session.id,
              next.followUp,
              'failed',
              'The message could not be sent to the provider.',
            );
          next.waiter?.reject(failure);
        },
      );
  }

  /** The session closed: every held turn fails. */
  rejectAll(session: Session): void {
    const queue = this.queues.get(session) ?? [];
    this.queues.delete(session);
    for (const item of queue) {
      if (item.followUp)
        this.emit(session.id, item.followUp, 'failed', 'The session ended.');
      item.waiter?.reject(
        new ProviderSessionChatAdapterError('unavailable', 'followUp'),
      );
    }
  }

  withdraw(session: Session, clientMessageId: string): boolean {
    const queue = this.queues.get(session);
    const index = this.index(session, clientMessageId);
    if (!queue || index < 0) return false;
    const [item] = queue.splice(index, 1);
    if (item.followUp) this.emit(session.id, item.followUp, 'withdrawn');
    return true;
  }

  list(session: Session): readonly QueuedFollowUpSnapshot[] {
    return (this.queues.get(session) ?? []).flatMap((item) =>
      item.followUp ? [item.followUp] : [],
    );
  }

  /** Steer a held follow-up into the running turn when the provider can steer. */
  async steer(
    session: Session,
    clientMessageId: string,
  ): Promise<SteerQueuedFollowUpResult> {
    const queue = this.queues.get(session) ?? [];
    const index = this.index(session, clientMessageId);
    if (index < 0) return { ok: false, code: 'NOT_QUEUED' };
    const live = session.live;
    if (!live?.steer || !live.capabilities().steer)
      return { ok: false, code: 'UNSUPPORTED' };
    const turnId = session.turnId;
    if (!session.busy || !turnId) return { ok: false, code: 'TURN_CHANGED' };
    const [item] = queue.splice(index, 1);
    try {
      if (item.input.images?.length && !live.capabilities().images)
        throw new ProviderSessionChatAdapterError('unsupported-option', 'steer', {
          option: 'images',
        });
      await live.steer(
        await providerTurnInput(session, item.input, this.deps.realpath),
        turnId,
      );
    } catch (error) {
      this.deps.failure(error, 'steer');
      this.requeue(session, item, index);
      return { ok: false, code: 'TURN_CHANGED' };
    }
    if (item.followUp) this.emit(session.id, item.followUp, 'steered');
    return { ok: true };
  }

  /**
   * A refused steer puts the follow-up back into the session's current queue
   * (the steer awaited: the turn may have ended, the queue drained or the
   * session closed meanwhile). A closed session fails it instead.
   */
  private requeue(
    session: Session,
    item: ProviderSessionQueuedTurn,
    index: number,
  ): void {
    if (session.closing || session.abort.signal.aborted) {
      if (item.followUp)
        this.emit(session.id, item.followUp, 'failed', 'The session ended.');
      item.waiter?.reject(
        new ProviderSessionChatAdapterError('unavailable', 'followUp'),
      );
      return;
    }
    const queue = this.queues.get(session) ?? [];
    queue.splice(Math.min(index, queue.length), 0, item);
    this.queues.set(session, queue);
    this.deps.drainIfIdle(session);
  }

  /** Report a follow-up admitted at once (nothing was running). */
  delivered(sessionId: SessionId, followUp: QueuedFollowUpSnapshot): void {
    this.emit(sessionId, followUp, 'delivered');
  }

  private enqueue(session: Session, item: ProviderSessionQueuedTurn): void {
    const queue = this.queues.get(session) ?? [];
    if (queue.length >= MAX_QUEUED_TURNS)
      throw new ProviderSessionChatAdapterError('busy', 'followUpQueueFull');
    queue.push(item);
    this.queues.set(session, queue);
  }

  private index(session: Session, clientMessageId: string): number {
    return (this.queues.get(session) ?? []).findIndex(
      (item) => item.followUp?.clientMessageId === clientMessageId,
    );
  }

  private emit(
    sessionId: SessionId,
    followUp: QueuedFollowUpSnapshot,
    state: QueuedFollowUpStateChange['state'],
    reason?: string,
  ): void {
    const change: QueuedFollowUpStateChange = {
      sessionId,
      clientMessageId: followUp.clientMessageId,
      state,
      ...(reason ? { reason } : {}),
    };
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (error: unknown) {
        // degradation-audit: reported - one subscriber must not block queue
        // settlement or other subscribers.
        this.deps.logger.warn(
          '[ProviderSessionChatAdapter] follow-up listener failed',
          { error: error instanceof Error ? error.message : 'unknown' },
        );
      }
    }
  }
}
