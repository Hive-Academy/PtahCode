import { Injectable, signal } from '@angular/core';
import type { QueuedFollowUpRef } from '@ptah-extension/chat-state';

export type AutoHandoffState = 'pending' | 'delivered' | 'recorded' | 'completed' | 'failed' | 'cancelled';

/** One session's automatic hand-off, as far as it got. */
export interface AutoHandoffEntry {
  readonly state: AutoHandoffState;
  /**
   * The queued follow-up the command became, by identity (not by text);
   * `null` before the send and when it was sent straight away.
   */
  readonly queued: QueuedFollowUpRef | null;
  readonly attempts: number;
  readonly clientMessageId: string | null;
  readonly statusError: boolean;
}

/**
 * SessionAutoHandoffService - "hand off automatically at 100%" bookkeeping.
 *
 * The automatic trigger is a ROOT coordinator over every mounted tab
 * (TASK_2026_863), so this root store holds one entry per session id, set
 * before the send, so the hand-off fires once per session and never again
 * after a cancel.
 *
 * In memory only: a reload starts empty (the backend's handoff refusal and
 * the skill's fallback cover a second run). It holds one small entry per
 * session that reached its limit with the setting on, so it is not pruned.
 */
@Injectable({ providedIn: 'root' })
export class SessionAutoHandoffService {
  private readonly _entries = signal<ReadonlyMap<string, AutoHandoffEntry>>(
    new Map(),
  );

  /**
   * Sessions the user wrapped up by hand ("Wrap up & hand off"): the automatic
   * trigger must not add a second hand-off to them.
   */
  private readonly manualWrapUps = new Set<string>();

  /** The session's entry, or `null` when the automatic hand-off is still armed. */
  entry(sessionId: string): AutoHandoffEntry | null {
    return this._entries().get(sessionId) ?? null;
  }

  /**
   * Claim the session's one automatic hand-off. Returns false when it was
   * already claimed (fired or cancelled), so the caller must not send.
   */
  claim(sessionId: string): boolean {
    const current = this.entry(sessionId);
    if (current) return current.state === 'pending' && current.queued === null && current.attempts > 0;
    this.set(sessionId, { state: 'pending', queued: null, attempts: 0, clientMessageId: null, statusError: false });
    return true;
  }

  /** Record the queued follow-up a fired session's command became. */
  recordQueued(sessionId: string, queued: QueuedFollowUpRef | null): void {
    const current = this.entry(sessionId);
    if (current?.state !== 'pending') return;
    this.set(sessionId, { ...current, queued, clientMessageId: queued?.clientMessageId ?? current.clientMessageId, attempts: current.attempts + 1 });
  }

  transition(sessionId: string, state: AutoHandoffState, statusError = false): void {
    const current = this.entry(sessionId);
    if (!current || current.state === 'cancelled') return;
    this.set(sessionId, { ...current, state, statusError });
  }

  retry(sessionId: string): void {
    const current = this.entry(sessionId);
    if (current?.state !== 'failed') return;
    this._entries.update((entries) => {
      const next = new Map(entries);
      next.delete(sessionId);
      return next;
    });
  }

  releaseForResend(sessionId: string): void {
    const current = this.entry(sessionId);
    if (current?.state !== 'delivered') return;
    this.set(sessionId, { ...current, state: 'pending', queued: null });
  }

  /** The user cancelled it: it never fires again for the session. */
  cancel(sessionId: string): void {
    const current = this.entry(sessionId);
    this.set(sessionId, {
      state: 'cancelled',
      queued: current?.queued ?? null,
      attempts: current?.attempts ?? 0,
      clientMessageId: current?.clientMessageId ?? null,
      statusError: false,
    });
  }

  /**
   * Undo a {@link cancel} whose withdraw came too late: a turn already took
   * the command, so the hand-off did fire.
   */
  revertCancel(sessionId: string): void {
    const current = this.entry(sessionId);
    if (current?.state !== 'cancelled') return;
    this.set(sessionId, { ...current, state: 'delivered' });
  }

  /**
   * Release a claimed automatic hand-off whose send failed, so a later budget
   * update can try it again (TASK_2026_863: a failed send kept the claim
   * forever). A cancelled entry stays cancelled: the user withdrew the
   * command, so it must not fire again.
   */
  release(sessionId: string): void {
    if (this.entry(sessionId)?.state !== 'pending') return;
    this._entries.update((entries) => {
      const next = new Map(entries);
      next.delete(sessionId);
      return next;
    });
  }

  /**
   * The user sent this session's wrap-up by hand: the automatic trigger stays
   * off for the session, so it never adds a second hand-off.
   */
  markManualWrapUp(sessionId: string): void {
    this.manualWrapUps.add(sessionId);
  }

  /**
   * A manual wrap-up that never sent (failed send, target changed) releases
   * the mark, so the automatic trigger can take over again.
   */
  clearManualWrapUp(sessionId: string): void {
    this.manualWrapUps.delete(sessionId);
  }

  /** True when the session was wrapped up by hand. */
  isManuallyWrappedUp(sessionId: string): boolean {
    return this.manualWrapUps.has(sessionId);
  }

  private set(sessionId: string, entry: AutoHandoffEntry): void {
    this._entries.update((entries) => new Map(entries).set(sessionId, entry));
  }
}
