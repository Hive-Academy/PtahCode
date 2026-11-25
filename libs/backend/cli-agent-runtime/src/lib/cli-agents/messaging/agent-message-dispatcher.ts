/**
 * One delivery attempt of a persisted envelope (Component 6, step 8).
 *
 * Every adapter side effect — cold spawn, live `sendToAgent` — is preceded by
 * a durable `dispatching` write. When that write fails nothing is dispatched.
 * The caller runs this inside the lane's serial queue.
 */
import type {
  AgentId,
  AgentMessageOutcome,
  AgentMessagePreview,
  AgentProcessInfo,
  InlineImageAttachment,
  LaneTurnRequest,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { AgentProcessManager } from '../agent-process-manager.service';
import {
  AgentInterruptedDeliveryError,
  AgentMessageError,
  userEchoSegment,
  type RouteTurnInput,
} from '../agent-message-router.service';
import {
  blockedLaneCommand,
  blockedLaneCommandReason,
  leadingLaneCommand,
  matchesLaneCommand,
} from '../cli-adapters/lane-command-filter';
import type { AgentMessageAttachmentStore } from './agent-message-attachment.store';
import { LaneAccountResumeError } from '../lane-resume-gate';
import type { AgentLaneResumeService } from './agent-lane-resume.service';
import type { AgentIdAliasRegistry } from './agent-id-alias.registry';
import { formatAgentMessageDeliveryText } from './agent-message-delivery-text';
import { AgentMessageDispatchWithdrawnError } from './agent-message-dispatch-journal.port';
import { ackStateAtStart } from './agent-message-reconciler';
import type { AgentMessageEnvelope, EnvelopePatch } from './envelope/agent-message-envelope.schema';
import type { AgentMessageEnvelopeStore } from './envelope/agent-message-envelope.store';
import { LaneResumeError } from './lane-resumers/lane-resumer.port';
import { redactLaneStderr } from '../cli-adapters/provider-session/lane-stderr-redaction';

export type DispatchManager = Pick<
  AgentProcessManager,
  'findAgentInfo' | 'getMessageRoutableAgent' | 'sendToAgent'
> & Partial<Pick<AgentProcessManager, 'recordAgentNote'>>;
export type DispatchEnvelopeStore = Pick<
  AgentMessageEnvelopeStore,
  'get' | 'transition' | 'markDispatching' | 'toReceipt'
>;
type ReasonCode = NonNullable<AgentMessageOutcome['reasonCode']>;

export interface DispatchAttempt {
  readonly envelope: AgentMessageEnvelope;
  readonly body: string;
  readonly plan: AgentMessagePreview;
  readonly info: AgentProcessInfo;
  /** Current lane after alias resolution. */
  readonly laneId: AgentId;
  readonly requestedAgentId: AgentId;
  readonly routerDelivery: 'queue' | 'now' | 'steer';
}

export interface AgentMessageDispatcherDeps {
  readonly manager: DispatchManager;
  readonly store: DispatchEnvelopeStore;
  readonly aliases: Pick<AgentIdAliasRegistry, 'record'>;
  readonly resume: Pick<AgentLaneResumeService, 'resume'>;
  /** Settles a started envelope whose turn already ended (reconciler). */
  readonly settleTurn: (info: AgentProcessInfo) => Promise<void>;
  readonly logger: Logger;
  /** Held images by envelope id. Absent: a message with images fails `attachments-unavailable`. */
  readonly attachments?: Pick<AgentMessageAttachmentStore, 'take'>;
  /**
   * The command and skill names the lane advertises (bounded lookup, cached
   * per lineage), or undefined when no list is known.
   */
  readonly advertisedCommands?: (laneId: AgentId, lineage: AgentId) => Promise<readonly string[] | undefined>;
}

/** The text a delivery sends and how it is routed. */
interface DeliveryForm {
  readonly raw: boolean;
  readonly turn?: LaneTurnRequest;
}

export class AgentMessageDispatcher {
  constructor(private readonly deps: AgentMessageDispatcherDeps) {}

  async attempt(attempt: DispatchAttempt): Promise<AgentMessageOutcome> {
    const { envelope } = attempt;
    // Before any adapter call and before the dispatch journal: a refused
    // envelope fails with its body kept (Recover text / Withdraw).
    const blocked = blockedLaneCommand(attempt.body, blockedCommandsOf(attempt));
    if (blocked)
      return this.refuseHeld(attempt, 'turn-input-unsupported', blockedLaneCommandReason(blocked));
    const form = await this.deliveryForm(attempt);
    if ('refusal' in form) return this.refuseHeld(attempt, form.refusal, form.lastError);
    // The command name only (an advertised name), never its arguments.
    if (form.raw)
      this.deps.logger.info('[AgentMessageCoordinator] Delivering a raw lane command', {
        agentId: attempt.laneId, command: leadingLaneCommand(attempt.body)?.slice(0, 64),
      });
    let dispatching: AgentMessageEnvelope;
    try {
      // The raw decision is written with the journal record, once, so a retry
      // or re-offer delivers it raw again; a failed write sends nothing.
      dispatching = await this.deps.store.markDispatching(envelope.id, [envelope.state],
        form.raw && envelope.rawDelivery?.raw !== true ? { rawDelivery: { raw: true } } : {});
    } catch (error: unknown) {
      return this.journalFailed(attempt, error);
    }
    // A raw `/command` carries no header and no ack line. Otherwise the ack
    // line and the `started` ack state come from the same capability (A5).
    const text = form.raw
      ? attempt.body.trimStart()
      : formatAgentMessageDeliveryText(envelope.id, envelope.sender, attempt.body,
        ackStateAtStart(undefined, attempt.plan.effectiveCapabilities.mcp) === 'pending');
    return attempt.plan.usesResume
      ? this.cold(attempt, dispatching, text, form)
      : this.live(attempt, dispatching, text, form);
  }

  /**
   * Raw or formatted, and the turn request with its held images. A message
   * that expects images the host no longer holds (a restart) is refused
   * `attachments-unavailable`.
   */
  private async deliveryForm(
    attempt: DispatchAttempt,
  ): Promise<DeliveryForm | { refusal: ReasonCode; lastError?: string }> {
    const { envelope } = attempt;
    const imageCount = envelope.turn?.imageCount ?? 0;
    const images = imageCount > 0 ? this.deps.attachments?.take(envelope.id) : undefined;
    if (imageCount > 0 && (!images || images.length < imageCount))
      return { refusal: 'attachments-unavailable' };
    const stored = envelope.turn;
    const turn: LaneTurnRequest | undefined = stored || images ? {
      ...(stored?.model !== undefined ? { model: stored.model } : {}),
      ...(stored?.reasoningEffort !== undefined ? { reasoningEffort: stored.reasoningEffort } : {}),
      ...(stored?.files?.length ? { files: stored.files } : {}),
      ...(images?.length ? { images } : {}),
    } : undefined;
    return { raw: await this.deliversRaw(attempt), ...(turn ? { turn } : {}) };
  }

  /**
   * Raw command delivery (decisions.md 15): only a user's message whose first
   * token is an advertised `/command` or skill. Parent and lane senders always
   * keep the header, so an agent can never issue provider commands into a
   * lane. With no known list nothing goes raw: the text keeps its header, so
   * a message such as `/usr/bin is missing` is never run as a command.
   */
  private async deliversRaw(attempt: DispatchAttempt): Promise<boolean> {
    const { envelope } = attempt;
    if (envelope.rawDelivery?.raw === true) return true;
    if (envelope.sender.kind !== 'user' || leadingLaneCommand(attempt.body) === undefined) return false;
    let names: readonly string[] | undefined;
    try {
      names = await this.deps.advertisedCommands?.(attempt.laneId, envelope.laneLineageId);
    } catch (error: unknown) {
      // degradation-audit: reported - logged; with no list the message keeps its header.
      this.deps.logger.warn('[AgentMessageCoordinator] Lane command list unavailable', {
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
    return names ? matchesLaneCommand(attempt.body, names) : false;
  }

  /**
   * Fail a held envelope before dispatch; its body stays recoverable. Nothing
   * was sent, so a failed write leaves the envelope in its prior state and
   * returns `storage-unavailable` instead of throwing.
   */
  private async refuseHeld(
    attempt: DispatchAttempt,
    reason: ReasonCode,
    lastError?: string,
  ): Promise<AgentMessageOutcome> {
    let failed: AgentMessageEnvelope | undefined;
    try {
      failed = await this.deps.store.transition(attempt.envelope.id, {
        state: 'failed', reason, nextRetryAt: undefined,
        ...(lastError ? { lastError: lastError.slice(0, 200) } : {}),
      }, [attempt.envelope.state]);
    } catch (error: unknown) {
      this.deps.logger.error('[AgentMessageCoordinator] Refusal write failed; nothing dispatched',
        asError(error));
      return this.unsupported(attempt, attempt.envelope, 'storage-unavailable');
    }
    return { ...this.unsupported(attempt, failed ?? attempt.envelope, reason), ...(lastError ? { detail: lastError } : {}) };
  }

  /** Where a raw `/command` must not steer (R3-2): interrupt-resume when confirmed, else queue. */
  private routerDeliveryFor(attempt: DispatchAttempt, raw: boolean): DispatchAttempt['routerDelivery'] {
    if (!raw || attempt.routerDelivery === 'queue') return attempt.routerDelivery;
    if (attempt.plan.mode !== 'steer' && attempt.routerDelivery === 'now') return 'now';
    return attempt.envelope.allowPartialTurnLoss === true ? 'now' : 'queue';
  }

  /** Nothing ran: disk keeps the prior state; the hold is written best-effort. */
  private async journalFailed(attempt: DispatchAttempt, error: unknown): Promise<AgentMessageOutcome> {
    if (error instanceof AgentMessageDispatchWithdrawnError) {
      // A concurrent flush or cancel decided this envelope first; report what it decided.
      const latest = (await this.deps.store.get(attempt.envelope.id)) ?? attempt.envelope;
      return this.outcome(attempt, latest.mode, latest, 'already-decided');
    }
    this.deps.logger.error('[AgentMessageCoordinator] Dispatch journal write failed; nothing dispatched',
      asError(error));
    const held = await this.deps.store.transition(attempt.envelope.id, {
      state: 'blocked-retryable', reason: 'storage-unavailable', nextRetryAt: undefined,
    }, ['not-started', 'blocked-retryable']);
    const shown: AgentMessageEnvelope = {
      ...(held ?? attempt.envelope), state: 'blocked-retryable', reason: 'storage-unavailable',
    };
    return this.unsupported(attempt, shown, 'storage-unavailable');
  }

  private async cold(attempt: DispatchAttempt, dispatching: AgentMessageEnvelope, text: string, form: DeliveryForm): Promise<AgentMessageOutcome> {
    let spawnedId: AgentId;
    let spawnedSession: string | undefined;
    const { turn } = form;
    const info: AgentProcessInfo = {
      ...attempt.info,
      ...(turn?.model !== undefined ? { model: turn.model } : {}),
      ...(turn?.reasoningEffort !== undefined ? { reasoningEffort: turn.reasoningEffort } : {}),
    };
    const sentAt = Date.now();
    try {
      // The guard reads the body as written, before the Ptah header.
      // Held images ride on the resumed first turn (the plan admitted them only
      // where the manifest declares `images.onResume`).
      const guard = { rawBody: attempt.body, blocked: blockedCommandsOf(attempt) };
      const result = turn?.images?.length
        ? await this.deps.resume.resume(info, text, guard, turn.files, turn.images)
        : await this.deps.resume.resume(info, text, guard, turn?.files);
      spawnedId = result.agentId;
      spawnedSession = result.cliSessionId;
    } catch (error: unknown) {
      return this.failed(attempt, dispatching, error);
    }
    this.echoCold(attempt, spawnedId, sentAt, turn?.images);
    try {
      await this.deps.aliases.record(attempt.laneId, spawnedId);
    } catch (error: unknown) {
      // Degradation: the message is delivered; a later call to the old id reaches the stopped record.
      this.deps.logger.error('[AgentMessageCoordinator] Alias record failed after cold resume', asError(error));
    }
    const spawned = this.deps.manager.findAgentInfo(spawnedId);
    const started = await this.deps.store.transition(dispatching.id, {
      state: 'started', mode: 'start-turn', route: 'cold', actualAgentId: spawnedId, maybeDelivered: true,
      ackState: startAck(dispatching, attempt, form.raw),
      turnSeq: spawned?.turnSeq ?? 1,
      cliSessionId: spawnedSession ?? spawned?.cliSessionId ?? dispatching.cliSessionId,
    }, ['dispatching']);
    await this.settleIfFinished(spawnedId);
    const latest = (await this.deps.store.get(dispatching.id)) ?? started ?? dispatching;
    return {
      mode: 'start-turn', messageId: latest.id, receipt: this.deps.store.toReceipt(latest),
      requestedAgentId: attempt.requestedAgentId, agentId: spawnedId,
    };
  }

  private async live(attempt: DispatchAttempt, dispatching: AgentMessageEnvelope, text: string, form: DeliveryForm): Promise<AgentMessageOutcome> {
    const { envelope, laneId } = attempt;
    let result: AgentMessageOutcome;
    const input: RouteTurnInput = {
      ...(form.turn ? { turn: form.turn } : {}),
      rawBody: attempt.body,
      ...(form.raw ? { noSteer: true } : {}),
      // Only a user's message is echoed in the lane transcript, body only.
      ...(envelope.sender.kind === 'user' ? { echo: attempt.body } : {}),
    };
    try {
      result = await this.deps.manager.sendToAgent(laneId, text, this.routerDeliveryFor(attempt, form.raw), envelope.id,
        envelope.allowPartialTurnLoss === true, input);
    } catch (error: unknown) {
      return this.failed(attempt, dispatching, error);
    }
    if (result.mode === 'unsupported') {
      // The router's contract: `unsupported` means nothing was delivered.
      const queueFull = result.reasonCode === 'queue-full';
      const reason = result.reasonCode ?? 'delivery-refused';
      // A settings or turn-input refusal's detail is fixed adapter or host text, kept as `lastError`.
      const shownError = (reason === 'turn-options-refused' || reason === 'turn-input-unsupported') && result.detail
        ? result.detail.slice(0, 200) : undefined;
      const next = await this.deps.store.transition(envelope.id, {
        state: queueFull ? 'blocked-retryable' : 'failed',
        ...(queueFull ? {} : { mode: 'unsupported' as const }),
        reason, everDispatched: envelope.everDispatched ?? false,
        ...(shownError ? { lastError: shownError } : {}),
      }, ['dispatching']);
      return this.unsupported(attempt, next ?? dispatching, reason);
    }
    if (result.mode === 'queue-next-turn') return this.parked(attempt, dispatching, result);
    const current = this.deps.manager.findAgentInfo(laneId);
    const started = await this.deps.store.transition(envelope.id, {
      state: 'started', mode: result.mode, route: 'live', maybeDelivered: true,
      ackState: startAck(dispatching, attempt, form.raw),
      turnSeq: current?.turnSeq ?? attempt.info.turnSeq ?? 1,
    }, ['dispatching']);
    await this.settleIfFinished(laneId);
    const latest = (await this.deps.store.get(envelope.id)) ?? started ?? dispatching;
    return this.outcome(attempt, result.mode, latest, result.detail);
  }

  /**
   * Parking has no adapter side effect, so a parked entry goes back to
   * `not-started` with this attempt undone; the router's flush journals it
   * again before `continueConversation`. An entry the flush already took
   * stays `dispatching`.
   */
  private async parked(attempt: DispatchAttempt, dispatching: AgentMessageEnvelope, result: AgentMessageOutcome): Promise<AgentMessageOutcome> {
    const { envelope, laneId } = attempt;
    const parked = this.deps.manager.getMessageRoutableAgent(laneId)?.pendingMessages
      .some((entry) => entry.messageId === envelope.id) ?? false;
    const next = parked
      ? await this.deps.store.transition(envelope.id, {
        state: 'not-started', mode: 'queue-next-turn', route: 'live',
        everDispatched: envelope.everDispatched ?? false, attemptCount: envelope.attemptCount,
      }, ['dispatching'])
      : await this.deps.store.get(envelope.id);
    return this.outcome(attempt, 'queue-next-turn', next ?? dispatching, result.detail);
  }

  private async failed(attempt: DispatchAttempt, dispatching: AgentMessageEnvelope, error: unknown): Promise<AgentMessageOutcome> {
    const { patch, reason } = classifyAttemptFailure(error, attempt.envelope);
    if (patch.state === 'outcome-unknown')
      // Only the error's name: adapter messages can carry paths or tokens.
      this.deps.logger.error('[AgentMessageCoordinator] Delivery outcome unknown',
        new Error(`Delivery outcome unknown after ${error instanceof Error ? error.name : 'a non-Error throw'}`));
    if (error instanceof LaneResumeError || error instanceof LaneAccountResumeError)
      // L12: the cold resume's real reason, redacted and bounded. The
      // composer only shows the reason code otherwise.
      this.deps.logger.warn('[AgentMessageCoordinator] Lane resume failed', {
        cli: attempt.info.cli,
        code: error instanceof LaneResumeError ? error.code : 'account',
        reason: resumeFailureText(error),
      });
    const next = await this.deps.store.transition(dispatching.id, patch, ['dispatching']);
    const outcome = this.unsupported(attempt, next ?? dispatching, reason);
    // Fixed host text (a policy refusal) reaches the composer as the detail.
    return patch.lastError && error instanceof LaneResumeError && error.code === 'policy-refused'
      ? { ...outcome, detail: patch.lastError } : outcome;
  }

  /** The user echo of a cold resume, on the resumed lane's own output. */
  private echoCold(
    attempt: DispatchAttempt,
    agentId: AgentId,
    sentAt: number,
    images?: readonly InlineImageAttachment[],
  ): void {
    if (attempt.envelope.sender.kind !== 'user' || (attempt.body.trim() === '' && !images?.length)) return;
    try {
      this.deps.manager.recordAgentNote?.(agentId, userEchoSegment(attempt.body, sentAt, images));
    } catch {
      // degradation-audit: reported - the message was delivered; only its
      // transcript echo is missing, and the delivery receipt still shows it.
    }
  }

  private async settleIfFinished(agentId: AgentId): Promise<void> {
    const info = this.deps.manager.findAgentInfo(agentId);
    if (info && info.status !== 'running' && info.status !== 'starting')
      await this.deps.settleTurn(info);
  }

  private outcome(attempt: DispatchAttempt, mode: AgentMessageOutcome['mode'], envelope: AgentMessageEnvelope, detail?: string): AgentMessageOutcome {
    return {
      mode, messageId: envelope.id, receipt: this.deps.store.toReceipt(envelope),
      requestedAgentId: attempt.requestedAgentId, agentId: attempt.laneId,
      ...(detail ? { detail } : {}),
    };
  }

  private unsupported(attempt: DispatchAttempt, envelope: AgentMessageEnvelope, reason: ReasonCode): AgentMessageOutcome {
    return {
      mode: 'unsupported', detail: reason, reasonCode: reason, messageId: envelope.id,
      receipt: this.deps.store.toReceipt(envelope),
      requestedAgentId: attempt.requestedAgentId, agentId: attempt.laneId,
    };
  }
}

/**
 * A classified pre-acceptance refusal undoes this attempt's `everDispatched`;
 * an unclassified throw after `dispatching` may have reached the lane, so it
 * is `outcome-unknown` and a retry needs duplicate confirmation.
 */
export function classifyAttemptFailure(
  error: unknown,
  before: AgentMessageEnvelope,
): { patch: EnvelopePatch; reason: ReasonCode } {
  const undo = { everDispatched: before.everDispatched ?? false };
  if (error instanceof AgentInterruptedDeliveryError)
    return { reason: 'interrupted-undelivered',
      patch: { state: 'failed', reason: 'interrupted-undelivered', partialTurnLost: true } };
  if (error instanceof AgentMessageError) {
    const reason = error.code === 'not_found' ? 'not_found' : 'delivery-refused';
    return { reason, patch: { state: 'failed', reason, ...undo } };
  }
  if (error instanceof LaneAccountResumeError)
    return { reason: 'account_refused', patch: { state: 'failed', reason: 'account_refused', ...undo } };
  if (error instanceof LaneResumeError && (error.code === 'blocked-command' || error.code === 'turn-input-refused'))
    return { reason: 'turn-input-unsupported',
      patch: { state: 'failed', reason: 'turn-input-unsupported', lastError: error.message.slice(0, 200), ...undo } };
  if (error instanceof LaneResumeError && error.code === 'turn-settings-refused')
    return { reason: 'turn-options-refused',
      patch: { state: 'failed', reason: 'turn-options-refused', lastError: error.message.slice(0, 200), ...undo } };
  if (error instanceof LaneResumeError && error.code === 'policy-refused')
    // Retrying resolves the same policy again, so the envelope fails with the reason.
    return { reason: 'resume-failed',
      patch: { state: 'failed', reason: 'resume-failed', lastError: resumeFailureText(error), ...undo } };
  if (error instanceof LaneResumeError) {
    return error.code === 'no-session'
      ? { reason: 'resume-failed', patch: { state: 'failed', reason: 'resume-failed', ...undo } }
      : { reason: 'resume-failed', patch: { state: 'blocked-retryable', reason: 'resume-failed', nextRetryAt: undefined } };
  }
  // The adapter call began and threw: the text may have reached the lane.
  return { reason: 'delivery-failed',
    patch: { state: 'outcome-unknown', reason: 'delivery-failed', maybeDelivered: true } };
}

/** The record's static blocked `/command` list (D18): resolved turn input, then the manifest. */
function blockedCommandsOf(attempt: DispatchAttempt): readonly string[] {
  return attempt.plan.effectiveCapabilities.turnInput?.commands.blocked ??
    attempt.info.potentialCapabilities?.turnInput?.commands.blocked ?? [];
}

/**
 * A raw message asks for no ack (R3-1); a lane's own ack is never reset. The
 * attempt's own decision counts, so the text sent and the ack state agree.
 */
function startAck(dispatching: AgentMessageEnvelope, attempt: DispatchAttempt, raw: boolean) {
  return ackStateAtStart(dispatching.ackState, raw ? undefined : attempt.plan.effectiveCapabilities.mcp);
}

/** A resume failure's message with secrets redacted, bounded for a log or `lastError`. */
function resumeFailureText(error: Error): string {
  return redactLaneStderr(error.message.replace(/\s+/g, ' ').trim()).slice(0, 200);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Agent message delivery failed');
}
