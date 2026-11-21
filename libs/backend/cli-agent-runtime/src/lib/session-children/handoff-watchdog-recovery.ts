/**
 * One automatic retry for a top-level handoff successor that the no-activity
 * watchdog ended (TASK_2026_2288 C).
 *
 * A handoff successor runs unattended: its predecessor is closed and no parent
 * session waits for it. When the provider sends no response and the watchdog
 * ends the session, nothing retries the turn, so the task stops until a human
 * types. This helper resumes such a session one time and sends it a recovery
 * prompt with a `peer` origin, so the transcript never shows it as user input.
 *
 * Out of scope on purpose:
 * - A session child: the spawner already reports a watchdog end to the parent
 *   (`session ended while it worked: no stream activity …`) and owns it.
 * - Any other end cause: a user stop, a tab close or a provider error is not
 *   retried.
 * - A second watchdog end of the same successor: it is retried at most once.
 */
import type { SessionEndPayload } from '@ptah-extension/agent-sdk';
import type {
  WatchdogRecoveryInput,
  WatchdogRecoveryOutcome,
} from './child-chat-session-host.port';
import type { HandoffAckRecord } from './session-handoff-ack.store';

/** Wait after the session end, so its teardown settles before the resume. */
export const WATCHDOG_RECOVERY_DELAY_MS = 5_000;

/** Origin name the transcript and the chat show for the recovery prompt. */
export const WATCHDOG_RECOVERY_SENDER = 'Ptah recovery';

export const WATCHDOG_RECOVERY_PROMPT =
  'Ptah recovery: the previous turn stopped because the provider sent no ' +
  'response in time (no-activity watchdog). This is an automatic retry, ' +
  'not a message from the user. Check the current state of your work, ' +
  'then continue the task from where it stopped.';

export interface HandoffWatchdogRecoveryDeps {
  /** The handoff record whose successor is this tab or SDK id. */
  findSuccessor(
    id: string,
  ): Promise<
    Pick<HandoffAckRecord, 'successorTabId' | 'successorSdkId'> | undefined
  >;
  /** True when the id names a session child (the spawner owns it). */
  isSessionChild(id: string): boolean;
  /** The chat host's recovery entry; null when the host has none. */
  recover():
    | ((input: WatchdogRecoveryInput) => Promise<WatchdogRecoveryOutcome>)
    | null;
  log(message: string): void;
  delayMs?: number;
  schedule?: (run: () => void, ms: number) => void;
  /** Clock for the watchdog end time; defaults to `Date.now`. */
  now?: () => number;
}

export class HandoffWatchdogRecovery {
  /** Successor tab ids already retried in this process. */
  private readonly retried = new Set<string>();

  constructor(private readonly deps: HandoffWatchdogRecoveryDeps) {}

  /** Session-end hook. Never throws; every outcome is logged. */
  onSessionEnd(payload: Pick<SessionEndPayload, 'sessionId' | 'cause'>): void {
    if (payload.cause !== 'no-activity-timeout') return;
    const sessionId = payload.sessionId.trim();
    if (!sessionId) return;
    const endedAt = (this.deps.now ?? Date.now)();
    const schedule =
      this.deps.schedule ??
      ((run: () => void, ms: number) => {
        setTimeout(run, ms).unref?.();
      });
    schedule(() => {
      void this.recover(sessionId, endedAt).catch((error: unknown) =>
        this.deps.log(
          `watchdog recovery of ${sessionId} failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }, this.deps.delayMs ?? WATCHDOG_RECOVERY_DELAY_MS);
  }

  private async recover(sessionId: string, endedAt: number): Promise<void> {
    if (this.deps.isSessionChild(sessionId)) return;
    const record = await this.deps.findSuccessor(sessionId);
    if (!record) return;
    const tabId = record.successorTabId;
    if (this.deps.isSessionChild(tabId)) return;
    if (this.retried.has(tabId)) {
      this.deps.log(
        `handoff successor ${tabId} ended by the watchdog again; no second automatic retry`,
      );
      return;
    }
    const recover = this.deps.recover();
    if (!recover) {
      this.deps.log(
        `handoff successor ${tabId} ended by the watchdog; this host cannot retry it`,
      );
      return;
    }
    this.retried.add(tabId);
    this.deps.log(
      `handoff successor ${tabId} ended by the watchdog; retrying one time`,
    );
    const outcome = await recover({
      sessionId: record.successorSdkId ?? sessionId,
      tabId,
      prompt: WATCHDOG_RECOVERY_PROMPT,
      senderName: WATCHDOG_RECOVERY_SENDER,
      endedAt,
    });
    this.deps.log(
      outcome.recovered
        ? `handoff successor ${tabId} resumed after the watchdog stop`
        : `handoff successor ${tabId} was not retried (${outcome.reason}${outcome.detail ? `: ${outcome.detail}` : ''})`,
    );
  }
}
