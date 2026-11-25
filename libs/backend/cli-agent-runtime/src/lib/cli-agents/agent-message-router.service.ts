/**
 * Agent Message Router
 *
 * Decides HOW one message reaches a spawned agent, executes that choice, and
 * reports which mechanism actually fired. Extracted from
 * {@link AgentProcessManager} under the facade rule (TASK_2026_402, R-8):
 * `AgentProcessManager.sendToAgent` keeps its name and signature and delegates
 * here. The lifecycle methods stay in the manager.
 *
 * Two rules hold this file together:
 *
 * - **Nothing here branches on a CLI name.** The mechanism comes from the
 *   handle's own declarations, falling back to the adapter's `capabilities()`.
 *   A seventh adapter is routed correctly the day it declares its capabilities,
 *   without an edit here.
 * - **Nothing returns a success the caller would act on when nothing was
 *   delivered.** A refusal is `mode: 'unsupported'` carrying the reason; the
 *   three unroutable record states are thrown as {@link AgentMessageError} by
 *   the facade before routing starts.
 */
import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import { TOKENS, Logger } from '@ptah-extension/vscode-core';
import {
  formatBudgetPauseNotice,
  type AgentMessageOutcome,
  type AgentProcessInfo,
  type CliAdapterManifest,
  type CliOutputSegment,
  type LaneTurnContent,
  type LaneTurnRequest,
} from '@ptah-extension/shared';
import { CliDetectionService } from './cli-detection.service';
import { currentLaneNotice, isLanePaused, type TrackedAgent } from './tracked-agent';
import type {
  AgentMessagingCapabilities,
  SdkHandle,
} from './cli-adapters/cli-adapter.interface';
import { legacyMessagingCapabilities } from './cli-adapters/cli-adapter.interface';
import {
  AGENT_MESSAGE_DISPATCH_JOURNAL,
  AgentMessageDispatchWithdrawnError,
  type AgentMessageDispatchJournal,
} from './messaging/agent-message-dispatch-journal.port';
import { classifyContinuationFailureDetail } from './messaging/continuation-failure.classifier';
import { resolveEffectiveLaneCapabilities } from './messaging/agent-effective-capabilities';

/**
 * How many messages may wait for an agent's current turn to finish.
 *
 * This live queue is in-memory and per agent; it holds only the delivery
 * mechanics. The record of truth is the durable inbox (the envelope store):
 * every message is persisted there before it is routed, and an entry queued
 * with a caller-supplied id is journalled as `dispatching` before it reaches
 * the adapter. After a restart the coordinator reclassifies what this queue
 * held. Over the cap the caller is REFUSED (`mode: 'unsupported'`) rather than
 * having its message silently dropped; the coordinator holds it and re-offers
 * it after the next settle.
 */
export const MAX_PENDING_MESSAGES = 8;

/** Record states that no messaging mechanism can serve. */
export type AgentMessageErrorCode = 'not_found' | 'restored' | 'not_running';

export class AgentMessageError extends Error {
  constructor(
    readonly code: AgentMessageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentMessageError';
  }
}

/** Admission changed before a continuation could start. */
export class AgentLanePausedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentLanePausedError';
  }
}

export class AgentInterruptedDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentInterruptedDeliveryError';
  }
}

/**
 * The slice of a tracked agent the router reads and writes.
 *
 * Declared here rather than imported so the router has no dependency on the
 * manager module — `AgentProcessManager`'s `TrackedAgent` satisfies it
 * structurally, and the import runs one way only.
 */
export interface MessageRoutableAgent {
  info: AgentProcessInfo;
  sdkHandle?: SdkHandle;
  subprocessReleased: boolean;
  restored?: true;
  /**
   * Settles when the turn currently in flight has torn down. Written by the
   * manager from `SdkHandle.done` and re-written from each continued turn's
   * `done`. `interrupt-resume` awaits it — without it the router races
   * `continueConversation`'s `busy` check.
   */
  currentTurnDone?: Promise<number>;
  /** Messages waiting for the current turn to end. Capped at {@link MAX_PENDING_MESSAGES}. */
  pendingMessages: PendingAgentMessage[];
  /** Ptah ask/pause notices; while one is a pause, new work is held in the queue. */
  laneAdmission?: TrackedAgent['laneAdmission'];
}

export interface PendingAgentMessage {
  readonly messageId: string;
  readonly cliSessionId: string;
  readonly text: string;
  /**
   * True when the caller supplied `messageId` (an envelope id), so the flush
   * journals it before dispatch. A router-generated id has no envelope.
   */
  readonly journaled?: boolean;
  /** A paused dispatch retains its existing durable dispatch reservation. */
  readonly dispatchReserved?: boolean;
  /** Settings and attachments of the turn this message starts. */
  readonly turn?: LaneTurnRequest;
  /**
   * The message as the user wrote it, before any Ptah header. The manager's
   * blocked-command pre-flight reads it, so a header never hides a `/command`.
   */
  readonly rawBody?: string;
  /** The user's body to echo in the lane transcript once delivered ({@link RouteTurnInput.echo}). */
  readonly echo?: string;
}

export type AgentMessageStatus =
  | { status: 'pending' | 'delivered' }
  /** `lastError`: fixed refusal text a settings or turn-input refusal keeps (≤ 200 chars). */
  | { status: 'failed'; reason: string; lastError?: string }
  | { status: 'unknown' };

const MAX_TERMINAL_MESSAGES = 64;
/** Outcome of the dispatch journal write for one queued entry. */
type JournalResult = 'ok' | 'refused' | 'withdrawn';

/**
 * The one manager operation the router invokes. Keeps the dependency an
 * interface rather than the manager class, so the router stays unit-testable
 * with a fake and the module graph stays acyclic.
 */
export interface ContinuationDispatcher {
  continueConversation(
    agentId: string,
    message: string,
    messageId?: string,
    turn?: LaneTurnRequest,
    rawBody?: string,
  ): Promise<void>;
  /**
   * Check and apply a turn's input before an interrupt-and-send interrupts
   * the running turn; a throw leaves that turn running. Absent: no pre-flight.
   */
  prepareInterruptTurn?(
    agentId: string,
    message: string,
    turn: LaneTurnRequest | undefined,
    rawBody: string | undefined,
  ): Promise<void>;
  /**
   * Write a host segment onto the lane's own output stream (the user echo).
   * It bypasses the provider segment path, so it never counts as provider
   * output or usage. Absent: no echo.
   */
  recordAgentNote?(agentId: string, segment: CliOutputSegment): void;
}

/** What a route call carries beside the text: the turn request and the raw body. */
export interface RouteTurnInput {
  readonly turn?: LaneTurnRequest;
  readonly rawBody?: string;
  /**
   * Never steer (R3-2: a raw provider `/command` must start its own turn).
   * `now` then interrupts and resumes when confirmed; `steer` is refused.
   */
  readonly noSteer?: boolean;
  /**
   * The body a user wrote, without the Ptah header (a raw `/command` as
   * typed). Once delivered it is echoed in the lane transcript as a `user`
   * segment. Absent for parent and lane senders: nothing is echoed.
   */
  readonly echo?: string;
}

/** The lane transcript's copy of what the user sent, stamped with the send time. */
export function userEchoSegment(body: string, sentAt: number): CliOutputSegment {
  return { type: 'user', content: body, sentAt };
}

/** Echo a delivered user message; a failing note never fails the delivery. */
function echoDelivered(
  dispatcher: ContinuationDispatcher,
  agentId: string,
  echo: string | undefined,
  sentAt: number,
): void {
  if (echo === undefined || echo.trim() === '' || !dispatcher.recordAgentNote) return;
  try {
    dispatcher.recordAgentNote(agentId, userEchoSegment(echo, sentAt));
  } catch {
    // degradation-audit: reported - the message was delivered; only its
    // transcript echo is missing, and the delivery receipt still shows it.
  }
}

/**
 * Call `continueConversation` with only the arguments that are set, so a
 * text-only message keeps the call shape it had before turn input existed.
 */
function continueWith(
  dispatcher: ContinuationDispatcher,
  agentId: string,
  message: string,
  messageId: string | undefined,
  input: RouteTurnInput,
): Promise<void> {
  if (input.turn === undefined && input.rawBody === undefined)
    return messageId === undefined
      ? dispatcher.continueConversation(agentId, message)
      : dispatcher.continueConversation(agentId, message, messageId);
  return dispatcher.continueConversation(agentId, message, messageId, input.turn, input.rawBody);
}

/** The images and files of a turn request, or undefined when it has none. */
export function turnContentOf(turn: LaneTurnRequest | undefined): LaneTurnContent | undefined {
  const images = turn?.images?.length ? turn.images : undefined;
  const files = turn?.files?.length ? turn.files : undefined;
  if (!images && !files) return undefined;
  return { ...(images ? { images } : {}), ...(files ? { files } : {}) };
}

/** Stand-in manifest for a live handle whose adapter declares none: only the handle's own probes count. */
const UNDECLARED_MANIFEST: CliAdapterManifest = {
  messaging: {
    steer: { state: 'unsupported', reason: 'No manifest.' },
    interrupt: { state: 'unsupported', reason: 'No manifest.' },
    continuation: { state: 'unsupported', reason: 'No manifest.' },
    resume: { state: 'unsupported', reason: 'No manifest.' },
  },
  roleChannel: 'task-prompt',
  permissionModes: {},
  networkModes: {
    allow: { state: 'unsupported', reason: 'No manifest.' },
    deny: { state: 'unsupported', reason: 'No manifest.' },
  },
  limitReader: { state: 'no-reliable-source', reason: 'No manifest.' },
  mcp: { state: 'unsupported', reason: 'No manifest.' },
};

/** Microtask ticks drained while waiting for an aborted turn's exit handling. */
const TURN_SETTLE_TICKS = 20;

@injectable()
export class AgentMessageRouter {
  private readonly terminal = new Map<string, AgentMessageStatus>();
  private readonly flushing = new Set<string>();
  private readonly inFlight = new Map<string, string>();
  private readonly interrupting = new Set<string>();
  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(TOKENS.CLI_DETECTION_SERVICE)
    private readonly cliDetection: CliDetectionService,
    @inject(AGENT_MESSAGE_DISPATCH_JOURNAL, { isOptional: true })
    private readonly journal: AgentMessageDispatchJournal | null = null,
  ) {}

  /**
   * Deliver `message` to a live agent by the best mechanism it supports.
   *
   * The caller has already rejected the unroutable record states, so every
   * path here either delivers or returns `unsupported` with a reason.
   */
  async route(
    agentId: string,
    tracked: MessageRoutableAgent,
    message: string,
    dispatcher: ContinuationDispatcher,
    delivery: 'queue' | 'now' | 'steer' = 'queue',
    messageId?: string,
    allowPartialTurnLoss = false,
    input: RouteTurnInput = {},
  ): Promise<AgentMessageOutcome> {
    const outcome = await this.select(agentId, tracked, message, dispatcher, delivery, messageId, allowPartialTurnLoss, input);
    this.logger.info('[AgentMessageRouter] Message routed', {
      agentId,
      cli: tracked.info.cli,
      mode: outcome.mode,
      pending: tracked.pendingMessages.length,
    });
    return outcome;
  }

  private async select(
    agentId: string,
    tracked: MessageRoutableAgent,
    message: string,
    dispatcher: ContinuationDispatcher,
    delivery: 'queue' | 'now' | 'steer',
    messageId?: string,
    allowPartialTurnLoss = false,
    input: RouteTurnInput = {},
  ): Promise<AgentMessageOutcome> {
    if (tracked.info.status === 'starting') {
      return {
        mode: 'unsupported',
        reasonCode: 'continuation-unavailable',
        detail: 'The lane is starting; try again when its handle is ready.',
      };
    }
    // Host-generated handoff asks use the manager's separate delivery path.
    if (isLanePaused(tracked)) return this.hold(agentId, tracked, message, messageId, input);

    const handle = tracked.sdkHandle;
    const caps = this.resolveCapabilities(tracked);
    const turnInFlight = tracked.info.status === 'running';
    const content = turnContentOf(input.turn);
    // Called on the handle itself, so a class-based handle keeps its `this`.
    const steer = (live: SdkHandle) =>
      content ? live.steer?.(message, content) : live.steer?.(message);

    if (delivery === 'steer') {
      if (input.noSteer || !turnInFlight || !caps.steer || !handle?.steer)
        return { mode: 'unsupported', reasonCode: 'steer-unavailable', detail: 'Explicit steer is unavailable for this active turn.' };
      const sentAt = Date.now();
      try {
        await steer(handle);
      } catch {
        return { mode: 'unsupported', reasonCode: 'steer-rejected', detail: 'The live handle rejected the steer request.' };
      }
      echoDelivered(dispatcher, agentId, input.echo, sentAt);
      return {
        mode: 'steer',
        detail:
          `Injected into the turn already running on ${tracked.info.cli}; ` +
          `the agent absorbs it without losing its current work.`,
      };
    }

    if (delivery === 'now') {
      if (!input.noSteer && turnInFlight && caps.steer && handle?.steer) {
        try {
          const sentAt = Date.now();
          await steer(handle);
          echoDelivered(dispatcher, agentId, input.echo, sentAt);
          return { mode: 'steer', detail: 'Injected into the active turn.' };
        } catch (error: unknown) {
          return { mode: 'unsupported', reasonCode: 'steer-rejected', detail: `Steer rejected: ${describeError(error)}` };
        }
      }
      if (turnInFlight && caps.interrupt && caps.continuation && handle?.interrupt) {
        if (!allowPartialTurnLoss)
          return { mode: 'unsupported', reasonCode: 'confirmation-required', detail: 'Confirm partial turn work loss before interrupting.' };
        return this.interruptAndResume(agentId, tracked, message, dispatcher, messageId, input);
      }
      return { mode: 'unsupported', reasonCode: 'immediate-unavailable', detail: 'No immediate delivery mechanism is available.' };
    }

    if (caps.continuation) {
      return turnInFlight
        ? this.park(tracked, message, messageId, input)
        : this.startNewTurn(agentId, tracked, message, dispatcher, messageId, input);
    }

    return {
      mode: 'unsupported',
      reasonCode: 'continuation-unavailable',
      detail:
        `${tracked.info.cli} offers no mechanism for delivering a message to ` +
        `an agent it has already started: it supports neither mid-turn ` +
        `steering, nor interrupting a turn, nor continuing the conversation. ` +
        `Nothing was delivered. The agent will finish on its original prompt; ` +
        `spawn a new agent if the new instruction cannot wait.`,
    };
  }

  /**
   * Abort the running turn, wait for it to tear down, then re-submit.
   *
   * The wait is the whole point: `continueConversation` refuses a `running`
   * agent as `busy`, and the record only leaves `running` inside the exit
   * handling that the turn's `done` promise triggers.
   */
  private async interruptAndResume(
    agentId: string,
    tracked: MessageRoutableAgent,
    message: string,
    dispatcher: ContinuationDispatcher,
    messageId?: string,
    input: RouteTurnInput = {},
  ): Promise<AgentMessageOutcome> {
    if (input.turn !== undefined && dispatcher.prepareInterruptTurn) {
      try {
        await dispatcher.prepareInterruptTurn(agentId, message, input.turn, input.rawBody);
      } catch (error: unknown) {
        // Refused before the interrupt: the running turn keeps going.
        const refused = classifyContinuationFailureDetail(error);
        if (refused.reasonCode && refused.lastError)
          return { mode: 'unsupported', reasonCode: refused.reasonCode, detail: refused.lastError };
        return {
          mode: 'unsupported',
          reasonCode: 'interrupt-failed',
          detail:
            `Preparing the new ${tracked.info.cli} turn failed: ${describeError(error)}. ` +
            `Nothing was delivered and the turn was left running.`,
        };
      }
    }
    this.interrupting.add(agentId);
    try {
      await tracked.sdkHandle?.interrupt?.();
    } catch (error: unknown) {
      this.interrupting.delete(agentId);
      return {
        mode: 'unsupported',
        reasonCode: 'interrupt-failed',
        detail:
          `Interrupting the current ${tracked.info.cli} turn failed: ` +
          `${describeError(error)}. Nothing was delivered and the turn was ` +
          `left running.`,
      };
    }

    let resubmitted = false;
    try {
      await this.awaitTurnSettled(tracked);
      const sentAt = Date.now();
      await continueWith(dispatcher, agentId, message, undefined, input);
      resubmitted = true;
      echoDelivered(dispatcher, agentId, input.echo, sentAt);
    } catch (error: unknown) {
      if (error instanceof AgentLanePausedError) return this.hold(agentId, tracked, message, messageId, input);
      throw new AgentInterruptedDeliveryError(
        `The ${tracked.info.cli} turn was interrupted but the message could not be re-submitted: ${describeError(error)}.`,
      );
    } finally {
      this.interrupting.delete(agentId);
      if (!resubmitted) await this.flushPending(agentId, tracked, dispatcher);
    }

    return {
      mode: 'interrupt-resume',
      detail:
        `The turn in flight was aborted and the message re-submitted on the ` +
        `same session. The aborted turn's partial work is DISCARDED — only ` +
        `what it had already written to disk survives.`,
    };
  }

  /** Hold the message until the current turn ends, or refuse if the queue is full. */
  private park(
    tracked: MessageRoutableAgent,
    message: string,
    receiptId?: string,
    input: RouteTurnInput = {},
  ): AgentMessageOutcome {
    if (tracked.pendingMessages.length >= MAX_PENDING_MESSAGES) {
      return {
        mode: 'unsupported',
        reasonCode: 'queue-full',
        detail:
          `${tracked.pendingMessages.length} messages are already waiting for ` +
          `this agent's current turn to finish, which is the limit of ` +
          `${MAX_PENDING_MESSAGES}. This message was NOT queued and nothing ` +
          `was delivered. Wait for the queue to drain, or stop the agent and ` +
          `spawn a new one with the combined instruction.`,
      };
    }

    const cliSessionId = tracked.info.cliSessionId;
    if (!cliSessionId) return { mode: 'unsupported', reasonCode: 'no-session', detail: 'The agent session is unavailable; nothing was queued.' };
    const messageId = receiptId ?? randomUUID();
    tracked.pendingMessages.push({
      messageId, cliSessionId, text: message,
      ...(receiptId !== undefined ? { journaled: true } : {}),
      ...(input.turn !== undefined ? { turn: input.turn } : {}),
      ...(input.rawBody !== undefined ? { rawBody: input.rawBody } : {}),
      ...(input.echo !== undefined ? { echo: input.echo } : {}),
    });
    return {
      mode: 'queue-next-turn',
      messageId,
      detail:
        `Message ${messageId} is pending at position ${tracked.pendingMessages.length}. Check its status for delivery.`,
    };
  }

  /** Queue a message on a paused lane; the outcome carries the Ptah hold text. */
  private hold(
    agentId: string,
    tracked: MessageRoutableAgent,
    message: string,
    messageId?: string,
    input: RouteTurnInput = {},
  ): AgentMessageOutcome {
    const outcome = this.park(tracked, message, messageId, input);
    if (outcome.mode !== 'queue-next-turn') return outcome;
    const notice = currentLaneNotice(tracked);
    const holdText = notice ? formatBudgetPauseNotice(notice, agentId) : '';
    this.logger.info('[AgentMessageRouter] Message held by a lane pause', {
      agentId,
      messageId: outcome.messageId,
      reason: notice?.reason,
    });
    return {
      ...outcome,
      detail: `${holdText} ${outcome.detail} It dispatches once the pause clears.`.trim(),
    };
  }

  /** The agent finished its turn but is still alive — start a new one now. */
  private async startNewTurn(
    agentId: string,
    tracked: MessageRoutableAgent,
    message: string,
    dispatcher: ContinuationDispatcher,
    messageId?: string,
    input: RouteTurnInput = {},
  ): Promise<AgentMessageOutcome> {
    const sentAt = Date.now();
    try {
      await continueWith(dispatcher, agentId, message, undefined, input);
    } catch (error: unknown) {
      if (error instanceof AgentLanePausedError) return this.hold(agentId, tracked, message, messageId, input);
      // A settings refusal carries fixed text from the adapter, safe to show.
      const refused = classifyContinuationFailureDetail(error);
      if (refused.reasonCode && refused.lastError)
        return { mode: 'unsupported', reasonCode: refused.reasonCode, detail: refused.lastError };
      return {
        mode: 'unsupported',
        reasonCode: 'start-turn-failed',
        detail: `Starting a new turn failed: ${describeError(error)}. Nothing was delivered.`,
      };
    }

    echoDelivered(dispatcher, agentId, input.echo, sentAt);
    return {
      mode: 'start-turn',
      detail:
        `The agent had already finished its turn and is still alive, so this ` +
        `message starts a NEW turn on the same conversation rather than ` +
        `joining one in progress.`,
    };
  }

  /**
   * Deliver ONE queued message, if any, now that the agent's turn has settled.
   *
   * Called from the manager's single settle point. One at a time on purpose:
   * the next turn's own settle drains the next entry, so a queue never turns
   * into a burst of overlapping continuations.
   */
  async flushPending(
    agentId: string,
    tracked: MessageRoutableAgent,
    dispatcher: ContinuationDispatcher,
  ): Promise<void> {
    if (tracked.pendingMessages.length === 0 || this.flushing.has(agentId) || this.interrupting.has(agentId)) return;
    // Held while paused; the manager releases the queue when the pause clears.
    if (isLanePaused(tracked)) return;

    if (tracked.subprocessReleased) {
      const dropped = tracked.pendingMessages.length;
      this.failPending(agentId, tracked, 'subprocess_released');
      this.logger.error(
        '[AgentMessageRouter] Queued messages dropped — subprocess released',
        {
          agentId,
          cli: tracked.info.cli,
          dropped,
          cliSessionId: tracked.info.cliSessionId,
        },
      );
      return;
    }

    const next = tracked.pendingMessages.shift();
    if (next === undefined) return;

    if (!tracked.info.cliSessionId || tracked.info.cliSessionId !== next.cliSessionId) {
      this.setTerminal(agentId, next.messageId, { status: 'failed', reason: 'session_changed' });
      for (let index = tracked.pendingMessages.length - 1; index >= 0; index -= 1) {
        const entry = tracked.pendingMessages[index];
        if (entry.cliSessionId !== next.cliSessionId) continue;
        this.setTerminal(agentId, entry.messageId, { status: 'failed', reason: 'session_changed' });
        tracked.pendingMessages.splice(index, 1);
      }
      return;
    }

    this.flushing.add(agentId);
    this.inFlight.set(agentId, next.messageId);
    // A previous flush may have reported this entry `storage-unavailable` and
    // put it back; this attempt starts from a clean status.
    this.terminal.delete(`${agentId}:${next.messageId}`);
    let journal: JournalResult = 'refused';
    let offerNext = false;
    try {
      journal = await this.journalDispatch(agentId, tracked, next);
      if (journal === 'ok' && this.terminal.get(`${agentId}:${next.messageId}`)?.status !== 'failed') {
        if (isLanePaused(tracked)) {
          tracked.pendingMessages.unshift({ ...next, dispatchReserved: true });
          return;
        }
        const sentAt = Date.now();
        await continueWith(dispatcher, agentId, next.text, next.messageId, next);
        if (this.terminal.get(`${agentId}:${next.messageId}`)?.status !== 'failed') {
          this.setTerminal(agentId, next.messageId, { status: 'delivered' });
          echoDelivered(dispatcher, agentId, next.echo, sentAt);
        }
        this.logger.info('[AgentMessageRouter] Delivered queued message', {
          agentId,
          cli: tracked.info.cli,
          remaining: tracked.pendingMessages.length,
        });
      }
    } catch (error: unknown) {
      if (error instanceof AgentLanePausedError) {
        if (this.terminal.get(`${agentId}:${next.messageId}`)?.status !== 'failed') {
          tracked.pendingMessages.unshift({ ...next, dispatchReserved: true });
          // Settings can release the hold before the continuation's rejection reaches us.
          offerNext = !isLanePaused(tracked);
        }
      } else {
        const detail = classifyContinuationFailureDetail(error);
        const reason = detail.reasonCode ?? detail.reason;
        // The reconciler decides between a backoff retry and a permanent hold.
        offerNext = detail.reason === 'continuation_rejected';
        this.setTerminal(agentId, next.messageId, {
          status: 'failed', reason, ...(detail.lastError ? { lastError: detail.lastError } : {}),
        });
        this.logger.error('[AgentMessageRouter] Queued message could not be delivered', {
          agentId,
          cli: tracked.info.cli,
          error: error instanceof Error ? error.name : 'unknown',
          reason,
          remaining: tracked.pendingMessages.length,
        });
      }
    } finally {
      this.inFlight.delete(agentId);
      this.flushing.delete(agentId);
    }
    // A withdrawn or permanently rejected entry ran nothing, so no settle will
    // follow: offer the next one now.
    if (journal === 'withdrawn' || offerNext) await this.flushPending(agentId, tracked, dispatcher);
  }

  /**
   * Durably journal `dispatching` before an envelope-backed entry reaches the
   * adapter. Without a journal, or for a router-generated id, there is nothing
   * to journal. When the write is refused the store is failing: the entry goes
   * back to the head of the queue, is reported `storage-unavailable`, and this
   * flush stops — nothing is dispatched and the other entries stay queued.
   * A withdrawn entry (cancelled or re-routed after this flush took it) is
   * dropped: its envelope already records the decision.
   */
  private async journalDispatch(
    agentId: string,
    tracked: MessageRoutableAgent,
    entry: PendingAgentMessage,
  ): Promise<JournalResult> {
    if (!this.journal || !entry.journaled || entry.dispatchReserved) return 'ok';
    try {
      await this.journal.markDispatching(entry.messageId);
      return 'ok';
    } catch (error: unknown) {
      if (error instanceof AgentMessageDispatchWithdrawnError) {
        this.logger.info('[AgentMessageRouter] Queued message withdrawn before dispatch', {
          agentId, state: error.state,
        });
        return 'withdrawn';
      }
      // A teardown during the write already reported the entry; re-queuing it
      // would hand a stopped agent work it can never receive.
      if (this.terminal.get(`${agentId}:${entry.messageId}`)?.status !== 'failed') {
        tracked.pendingMessages.unshift(entry);
        this.setTerminal(agentId, entry.messageId, { status: 'failed', reason: 'storage-unavailable' });
      }
      this.logger.error(
        '[AgentMessageRouter] Dispatch journal write failed; queued message not dispatched',
        error instanceof Error ? error : new Error(String(error)),
      );
      return 'refused';
    }
  }

  hasPendingWork(agentId: string, tracked: MessageRoutableAgent): boolean {
    return tracked.pendingMessages.length > 0 || this.inFlight.has(agentId);
  }

  /** Forget anything still queued for a record that can no longer receive it. */
  discardPending(agentId: string, tracked: MessageRoutableAgent): number {
    const activeId = this.inFlight.get(agentId);
    if (activeId) this.setTerminal(agentId, activeId, { status: 'failed', reason: 'agent_stopped' });
    if (tracked.pendingMessages.length === 0) return 0;
    const dropped = tracked.pendingMessages.length;
    this.failPending(agentId, tracked, 'agent_stopped');
    this.logger.warn(
      '[AgentMessageRouter] Discarded queued messages for a torn-down agent',
      { agentId, cli: tracked.info.cli, dropped },
    );
    return dropped;
  }

  messageStatus(agentId: string, tracked: MessageRoutableAgent | undefined, messageId: string): AgentMessageStatus {
    if (this.terminal.has(`${agentId}:${messageId}`)) return this.terminal.get(`${agentId}:${messageId}`)!;
    if (this.inFlight.get(agentId) === messageId) return { status: 'pending' };
    if (tracked?.pendingMessages.some((entry) => entry.messageId === messageId)) return { status: 'pending' };
    return { status: 'unknown' };
  }

  /** Release per-agent routing state when the manager expires its record. */
  forgetAgent(agentId: string): void {
    for (const key of this.terminal.keys())
      if (key.startsWith(`${agentId}:`)) this.terminal.delete(key);
    this.inFlight.delete(agentId);
    this.flushing.delete(agentId);
    this.interrupting.delete(agentId);
  }

  private failPending(agentId: string, tracked: MessageRoutableAgent, reason: string): void {
    for (const entry of tracked.pendingMessages)
      this.setTerminal(agentId, entry.messageId, { status: 'failed', reason });
    tracked.pendingMessages.length = 0;
  }

  private setTerminal(agentId: string, messageId: string, status: AgentMessageStatus): void {
    this.terminal.set(`${agentId}:${messageId}`, status);
    if (this.terminal.size > MAX_TERMINAL_MESSAGES) this.terminal.delete(this.terminal.keys().next().value!);
  }

  /**
   * The capability declaration that governs this agent.
   *
   * The HANDLE wins when present — it knows what its own live run can do — and
   * the adapter's declaration is the fallback for a record whose handle is
   * gone. No CLI name is read on either path.
   */
  private resolveCapabilities(
    tracked: MessageRoutableAgent,
  ): AgentMessagingCapabilities {
    const handle = tracked.sdkHandle;
    const adapterCaps = this.cliDetection
      .getAdapter(tracked.info.cli)
      ?.capabilities();
    if (handle) {
      // One resolver for preview, the manager record and this router (E7).
      const manifest = tracked.info.potentialCapabilities ?? adapterCaps;
      const messaging = resolveEffectiveLaneCapabilities(
        tracked.info,
        manifest?.messaging ? manifest : UNDECLARED_MANIFEST,
        handle,
        tracked.subprocessReleased,
      ).messaging;
      return {
        steer: messaging.steer.state === 'supported',
        interrupt: messaging.interrupt.state === 'supported',
        continuation: messaging.continuation.state === 'supported',
      };
    }

    return (
      adapterCaps ? legacyMessagingCapabilities(adapterCaps) : { steer: false, interrupt: false, continuation: false }
    );
  }

  /**
   * Wait for the aborted turn's exit handling to have run.
   *
   * `currentTurnDone` settles when the turn's own `done` promise does, but the
   * manager's exit handler is a SEPARATE continuation on that same promise.
   * Draining a bounded number of microtask ticks lets that handler move the
   * record out of `running` before the resume is attempted; the loop exits on
   * the first tick where it has.
   */
  private async awaitTurnSettled(tracked: MessageRoutableAgent): Promise<void> {
    if (tracked.currentTurnDone) {
      await tracked.currentTurnDone;
    }
    for (
      let tick = 0;
      tick < TURN_SETTLE_TICKS && tracked.info.status === 'running';
      tick++
    ) {
      await Promise.resolve();
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? 'operation failed' : 'unknown failure';
}
