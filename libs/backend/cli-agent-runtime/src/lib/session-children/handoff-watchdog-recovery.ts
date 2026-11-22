import type { SessionEndPayload } from '@ptah-extension/agent-sdk';
import {
  formatWatchdogFinalFailure,
  formatWatchdogNoSafeRetry,
  formatWatchdogRetry,
  type SessionEndCause,
} from '@ptah-extension/shared';
import type {
  WatchdogRecoveryInput,
  WatchdogRecoveryOutcome,
} from './child-chat-session-host.port';
import type { HandoffAckRecord } from './session-handoff-ack.store';

export const WATCHDOG_RECOVERY_DELAY_MS = 5_000;
export const WATCHDOG_RECOVERY_SENDER = 'Ptah recovery';
export const WATCHDOG_RECOVERY_PROMPT = formatWatchdogRetry();

type WatchdogEnd = Pick<SessionEndPayload, 'sessionId' | 'startedAt' | 'zeroOutwardEvents'> & {
  readonly cause: SessionEndCause;
};

export function isProviderNoResponse(cause: SessionEndCause): boolean {
  return cause === 'provider-no-response' || cause === 'no-activity-timeout';
}

export function watchdogReplayPrompt(firstInput: string): string {
  return `${WATCHDOG_RECOVERY_PROMPT}\n\n${firstInput}`;
}

export interface FirstTurnRecoveryAttempt {
  /** Identity of the original input, shared by its retry. */
  readonly key: string;
  readonly ended: WatchdogEnd;
  readonly eligible: boolean;
  /** The same execution still owns recovery and there is no live replacement. */
  isCurrent(): boolean;
  recover(endedAt: number): Promise<WatchdogRecoveryOutcome>;
  fail(retried: boolean): void;
}

interface Reservation {
  readonly startedAt?: number;
  phase: 'reserved' | 'replaying' | 'used' | 'settled';
  cancelTimer?: () => void;
}

export interface HandoffWatchdogRecoveryDeps {
  findSuccessor?(
    id: string,
  ): Promise<
    (Pick<HandoffAckRecord, 'successorTabId' | 'successorSdkId'> &
      Partial<Pick<HandoffAckRecord, 'predecessorTabId' | 'generation'>>) | undefined
  >;
  isSessionChild?(id: string): boolean;
  recover?():
    | ((input: WatchdogRecoveryInput) => Promise<WatchdogRecoveryOutcome>)
    | null;
  log(message: string): void;
  delayMs?: number;
  schedule?: (run: () => void, ms: number) => void | (() => void);
  now?: () => number;
}

/** One owner for reservation, replay and final failure for an unattended first input. */
export class HandoffWatchdogRecovery {
  private readonly reservations = new Map<string, Reservation>();
  private readonly successorKeys = new Map<string, string>();
  private readonly pendingSuccessors = new Set<Set<string>>();

  constructor(private readonly deps: HandoffWatchdogRecoveryDeps) {}

  owns(key: string): boolean {
    const phase = this.reservations.get(key)?.phase;
    return phase === 'reserved' || phase === 'replaying';
  }

  cancelScheduled(key: string): void {
    if (this.reservations.get(key)?.phase === 'reserved') this.cancel(key);
  }

  cancel(key: string): void {
    const reservation = this.reservations.get(key);
    if (!reservation) return;
    reservation.phase = 'settled';
    reservation.cancelTimer?.();
    reservation.cancelTimer = undefined;
  }

  forget(key: string): void {
    this.cancel(key);
    this.reservations.delete(key);
  }

  /** Reserve synchronously so grace timers and duplicate callbacks see the same owner. */
  reserve(
    attempt: FirstTurnRecoveryAttempt,
    endedAt = attempt.ended.startedAt ?? (this.deps.now ?? Date.now)(),
  ): void {
    const { key, ended } = attempt;
    if (!isProviderNoResponse(ended.cause)) return;
    const previous = this.reservations.get(key);
    if (previous) {
      if (
        previous.phase === 'settled' || previous.phase === 'reserved' ||
        (previous.phase === 'replaying' && ended.startedAt === undefined) ||
        (ended.startedAt !== undefined && ended.startedAt === previous.startedAt)
      ) return;
      previous.phase = 'settled';
      attempt.fail(true);
      return;
    }
    if (!attempt.eligible || ended.zeroOutwardEvents !== true || !attempt.isCurrent()) {
      this.reservations.set(key, { startedAt: ended.startedAt, phase: 'settled' });
      attempt.fail(false);
      return;
    }
    const reservation: Reservation = { startedAt: ended.startedAt, phase: 'reserved' };
    this.reservations.set(key, reservation);
    const schedule = this.deps.schedule ?? ((run: () => void, ms: number) => {
      const timer = setTimeout(run, ms);
      timer.unref?.();
      return () => clearTimeout(timer);
    });
    reservation.cancelTimer = schedule(() => {
      reservation.cancelTimer = undefined;
      void this.replay(attempt, reservation, endedAt);
    }, this.deps.delayMs ?? WATCHDOG_RECOVERY_DELAY_MS) ?? undefined;
  }

  private async replay(
    attempt: FirstTurnRecoveryAttempt,
    reservation: Reservation,
    endedAt: number,
  ): Promise<void> {
    if (reservation.phase !== 'reserved' || this.reservations.get(attempt.key) !== reservation) return;
    if (!attempt.isCurrent()) {
      reservation.phase = 'settled';
      this.deps.log(`watchdog recovery of ${attempt.ended.sessionId} skipped: the ended attempt no longer owns recovery`);
      return;
    }
    reservation.phase = 'replaying';
    let outcome: WatchdogRecoveryOutcome;
    try {
      outcome = await attempt.recover(endedAt);
    } catch (error: unknown) {
      this.deps.log(`watchdog recovery of ${attempt.ended.sessionId} failed: ${String(error)}`);
      outcome = { recovered: false, reason: 'resume-failed' };
    }
    if (reservation.phase !== 'replaying' || this.reservations.get(attempt.key) !== reservation) return;
    if (outcome.recovered) {
      reservation.phase = 'used';
      this.deps.log(`${attempt.ended.sessionId} resumed after the watchdog stop`);
      return;
    }
    reservation.phase = 'settled';
    this.deps.log(`watchdog recovery of ${attempt.ended.sessionId} did not resume (${outcome.reason}${outcome.detail ? `: ${outcome.detail}` : ''})`);
    if (outcome.reason !== 'already-active' && outcome.reason !== 'stopped') {
      attempt.fail(true);
    }
  }

  /** Top-level entry point from the handoff service's existing end subscription. */
  onSessionEnd(payload: WatchdogEnd): void {
    if (!isProviderNoResponse(payload.cause)) {
      const key = this.successorKeys.get(payload.sessionId);
      if (key) this.cancel(key);
      for (const stopped of this.pendingSuccessors) stopped.add(payload.sessionId);
      return;
    }
    if (this.deps.isSessionChild?.(payload.sessionId)) return;
    const endedAt = payload.startedAt ?? (this.deps.now ?? Date.now)();
    const stopped = new Set<string>();
    this.pendingSuccessors.add(stopped);
    void this.reserveSuccessor(payload, stopped, endedAt)
      .catch((error: unknown) =>
        this.deps.log(`watchdog recovery of ${payload.sessionId} failed: ${String(error)}`),
      )
      .finally(() => this.pendingSuccessors.delete(stopped));
  }

  private async reserveSuccessor(
    payload: WatchdogEnd,
    stopped: ReadonlySet<string>,
    endedAt: number,
  ): Promise<void> {
    const record = await this.deps.findSuccessor?.(payload.sessionId);
    if (!record || this.deps.isSessionChild?.(record.successorTabId)) return;
    const tabId = record.successorTabId;
    if ([payload.sessionId, tabId, record.successorSdkId].some((id) => id && stopped.has(id))) return;
    const recover = this.deps.recover?.();
    const key = JSON.stringify([record.predecessorTabId ?? tabId, record.generation ?? 0, tabId]);
    this.successorKeys.set(tabId, key);
    if (record.successorSdkId) this.successorKeys.set(record.successorSdkId, key);
    this.reserve({
      key,
      ended: payload,
      eligible: !!recover,
      isCurrent: () => !this.deps.isSessionChild?.(tabId),
      recover: async (cutoff) => recover?.({
        sessionId: record.successorSdkId ?? payload.sessionId,
        tabId,
        prompt: WATCHDOG_RECOVERY_PROMPT,
        senderName: WATCHDOG_RECOVERY_SENDER,
        endedAt: cutoff,
      }) ?? { recovered: false, reason: 'resume-failed' },
      fail: (retried) => this.deps.log(
        retried ? formatWatchdogFinalFailure(tabId) : formatWatchdogNoSafeRetry(tabId),
      ),
    }, endedAt);
  }
}
