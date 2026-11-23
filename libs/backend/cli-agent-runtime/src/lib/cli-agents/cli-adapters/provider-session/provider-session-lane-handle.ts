/**
 * createProviderSessionLaneHandle — presents one provider session (an ACP
 * agent from `@ptah-extension/acp-runtime`) as a lane `SdkHandle` with the
 * lane semantics the ACP lane always had.
 *
 * - The agent process is spawned synchronously and the handle returned at
 *   once (Cursor/Pi convention). `done` is the first turn: the handshake,
 *   then the Ptah MCP attachment wait, then the task prompt.
 * - `continue(message)` is a further prompt on the same session.
 * - There is no `steer`: an ACP agent queues a mid-turn prompt instead of
 *   injecting it. `interrupt` is offered when the profile's cancel behaviour
 *   keeps the process (`await-reply`): `session/cancel` ends the turn and the
 *   next `continue` runs on the same process and session. The interrupted
 *   turn's `done` resolves 0 (Cursor convention), so the lane is not failed.
 * - Abort = `session/cancel` (when a prompt is in flight), a short grace, then
 *   kill; the session stays resumable by id.
 * - Spawn: through the host `IProcessSpawner` with the lane base environment
 *   and command preparer (`lane-acp-spawn.ts`). Without a spawner the lane
 *   fails at once with one error.
 * - Each prompt is bounded by {@link LANE_ACP_PROMPT_TIMEOUT_MS}; a failed
 *   resume falls back to a new session (lanes keep that fallback).
 *
 * - Fallback (optional, {@link ProviderSessionLaneFallback}): when the ACP
 *   session cannot be opened at all (spawn, `initialize` or `session/new`
 *   failed, so no session id) and nothing was prompted, the lane runs on the
 *   fallback transport instead, with one `info` naming the ACP failure. The
 *   setup's own output is held until the outcome is known. Never mid-run: once
 *   a session exists the lane stays on ACP.
 *
 * - MCP credential (round 4): `options.onMcpConfigRestored` is the
 *   manager's revoke of the lane's Ptah MCP credential (Antigravity wires it;
 *   stream-json calls it after restoring `mcp_config.json`). An ACP lane
 *   writes no config, so it calls the hook once the agent process exits on
 *   its own: a failed setup or a lost process. An abort is the manager's stop
 *   or idle release, which revoke the subject themselves
 *   (`AgentProcessManager.stop`, `releaseSubprocess`); calling the hook from
 *   that late exit could revoke a credential the manager has meanwhile minted
 *   for a resumed lane of the same id. A warm process keeps the credential
 *   for its continuations. After a fallback the fallback transport owns it.
 *
 * Session events reach the lane twice: as segments (`projectToCliSegments`,
 * the text log and lane outcome) and as flat stream events
 * (`createFlatStreamProjector`, `onStreamEvent`), from which the renderer
 * builds the lane's execution cards. stderr lines are classified here (`classifyCliStderr`). `done` and every continuation
 * `done` resolve with 0 or 1 and never reject; failures become one `error`
 * segment.
 */
import { createAcpSession } from '@ptah-extension/acp-runtime';
import type {
  AcpTransportFactory,
  AcpVendorProfile,
} from '@ptah-extension/acp-runtime';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import {
  createFlatStreamProjector,
  projectToCliSegments,
} from '@ptah-extension/provider-session-contracts';
import type {
  ProviderSessionError,
  ProviderSessionEvent,
} from '@ptah-extension/provider-session-contracts';
import type {
  CliOutputSegment,
  FlatStreamEventUnion,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { MCP_ATTACHMENT_TIMEOUT_MS } from '../../mcp-attachment-probe.port';
import type {
  CliCommandOptions,
  ContinuationOutcome,
  SdkHandle,
} from '../cli-adapter.interface';
import { buildTaskPrompt, createBufferedEmitter } from '../cli-adapter.utils';
import { classifyCliStderr } from '../cli-stderr-severity';
import {
  LANE_ACP_PROMPT_TIMEOUT_MS,
  laneAcpBaseEnv,
  laneAcpCommandPreparer,
} from './lane-acp-spawn';
import { buildLaneMcpAttachments } from './lane-mcp-attachments';
import { redactLaneStderr } from './lane-stderr-redaction';

/**
 * Setup output held while a fallback is still possible. Beyond it the output
 * is released, so a noisy setup is never silenced for long.
 */
const MAX_HELD_SETUP_ITEMS = 200;

/** Another transport for the same lane, used only when the ACP session never opened. */
export interface ProviderSessionLaneFallback {
  /** Names the transport in the lane's `info`, e.g. `stream-json`. */
  readonly label: string;
  /** Start the lane on that transport. A rejection fails the lane with one error. */
  readonly run: () => Promise<SdkHandle>;
}

export interface ProviderSessionLaneHandleConfig {
  readonly profile: AcpVendorProfile;
  readonly options: CliCommandOptions;
  /** The binary to run: the resolved path from detection, or a bare name. */
  readonly command: string;
  /** Creates the child off-thread when present (TASK_2026_367). */
  readonly spawner?: IProcessSpawner;
  /** Defaults to the runtime's process transport (needs `spawner`); specs pass an in-memory one. */
  readonly transportFactory?: AcpTransportFactory;
  /** Receives the raw failure detail that user-facing segments summarise. */
  readonly logger?: Logger;
  /** Runs the lane elsewhere when the ACP session could not be opened. */
  readonly fallback?: ProviderSessionLaneFallback;
}

/**
 * Spawn the profile's agent and return its `SdkHandle` at once. The handshake
 * and the first prompt run inside `done`.
 */
export function createProviderSessionLaneHandle(
  config: ProviderSessionLaneHandleConfig,
): SdkHandle {
  const { profile, options, logger } = config;
  const name = profile.displayName;
  const logContext = { vendor: profile.vendor };

  const abort = new AbortController();
  const output = createBufferedEmitter<string>();
  const segment = createBufferedEmitter<CliOutputSegment>();

  if (!config.spawner && !config.transportFactory) {
    const message = `${name} cannot start: no process spawner was supplied for the lane`;
    logger?.error('[AcpSessionHandle] lane has no process spawner', logContext);
    output.emit(`\n[${name}] ${message}\n`);
    segment.emit({ type: 'error', content: message });
    // Nothing will ever use the credential minted for this lane.
    options.onMcpConfigRestored?.();
    return {
      abort,
      done: Promise.resolve(1),
      onOutput: output.subscribe,
      onSegment: segment.subscribe,
      getSessionId: () => options.resumeSessionId,
      supportsContinuation: () => false,
    };
  }

  const sessionResolved = createBufferedEmitter<string>();
  const stream = createBufferedEmitter<FlatStreamEventUnion>();
  let streamProjector = createFlatStreamProjector();

  /**
   * While the setup runs and a fallback is configured, output is held: a
   * setup that fails over must not leave its errors on the lane.
   */
  let holdingSetup = !!config.fallback;
  const held: Array<() => void> = [];
  const setupErrors: ProviderSessionError[] = [];
  const releaseHeld = (): void => {
    holdingSetup = false;
    for (const send of held.splice(0)) send();
  };
  const deliver = (send: () => void): void => {
    if (!holdingSetup) {
      send();
      return;
    }
    held.push(send);
    if (held.length > MAX_HELD_SETUP_ITEMS) releaseHeld();
  };
  /** The lane runs on the fallback transport; ACP events are ignored from then on. */
  let delegate: SdkHandle | undefined;
  let delegating = false;
  let mcpTimedOut = false;
  let onMcpTimeout: (() => void) | undefined;

  /** Status of the last turn's `terminal` event. */
  let lastTerminalStatus: string | undefined;
  /** {@link interrupt} was called during the current turn. */
  let interruptRequested = false;

  /** The turn whose failure already reached the lane as an `error` segment. */
  let errorShownForTurn: string | undefined;
  /** Turns that already have stream rows (an open message to complete). */
  let streamedTurn: string | undefined;

  const project = (event: ProviderSessionEvent): void => {
    const turnKey = event.turnId ?? `${event.contextId}:setup`;
    if (event.type === 'diagnostic') {
      const safe = redactLaneStderr(event.line, options.mcpToken);
      output.emit(`[stderr] ${safe}\n`);
      segment.emit({ type: classifyCliStderr(safe), content: safe });
      return;
    }
    if (event.type === 'textDelta') output.emit(event.delta);
    // A refused tool request reaches the lane's output too: the parent reads
    // the output, and a refusal must never look like a silent empty turn.
    if (event.type === 'error' || (event.type === 'info' && event.notice === 'permission-refused')) {
      output.emit(
        `\n[${name}] ${event.type === 'error' ? event.error.message : event.message}\n`,
      );
    }
    for (const item of projectToCliSegments(event)) segment.emit(item);
    // A failure already reaches the execution tree as its `error` segment
    // (the card renders error segments beside the event tree); projecting it
    // too would show the message twice. The same holds for the failed
    // `terminal` of a turn with no stream rows yet: the projector would open
    // a message only to repeat the failure.
    if (event.type === 'error') {
      errorShownForTurn = turnKey;
      return;
    }
    if (
      event.type === 'terminal' &&
      event.status === 'failed' &&
      errorShownForTurn === turnKey &&
      streamedTurn !== turnKey
    ) {
      return;
    }
    const rows = streamProjector.project(event);
    if (rows.length > 0) streamedTurn = turnKey;
    for (const item of rows) stream.emit(item);
  };

  const onEvent = (event: ProviderSessionEvent): void => {
    if (delegating) return;
    if (event.type === 'terminal') lastTerminalStatus = event.status;
    if (event.type === 'error' && holdingSetup) setupErrors.push(event.error);
    deliver(() => project(event));
  };

  const session = createAcpSession({
    profile,
    options: {
      ...options,
      mcp: buildLaneMcpAttachments(options),
      attachMethod: 'resume',
      attachFailure: 'new-session',
      promptTimeoutMs: LANE_ACP_PROMPT_TIMEOUT_MS,
    },
    command: config.command,
    baseEnv: laneAcpBaseEnv(),
    spawner: config.spawner,
    prepareCommand: laneAcpCommandPreparer,
    transportFactory: config.transportFactory,
    logger,
    signal: abort.signal,
    onEvent,
    onSessionResolved: sessionResolved.emit,
  });

  /** Wait for the lane's Ptah MCP attachment before the first prompt. */
  const awaitMcpAttachment = async (): Promise<void> => {
    if (
      !options.attachmentProbe ||
      !options.agentId ||
      !options.mcpPort ||
      !session.attachedMcpServers()
    ) {
      return;
    }
    const attachmentWait = new AbortController();
    const attached = await Promise.race([
      options.attachmentProbe.waitFor(
        options.agentId,
        options.mcpPort,
        MCP_ATTACHMENT_TIMEOUT_MS,
        attachmentWait.signal,
      ),
      session.exited.then(() => undefined),
      new Promise<undefined>((resolve) => {
        if (abort.signal.aborted) resolve(undefined);
        else
          abort.signal.addEventListener('abort', () => resolve(undefined), {
            once: true,
            signal: attachmentWait.signal,
          });
      }),
    ]);
    attachmentWait.abort();
    if (!attached && !session.isClosed() && !abort.signal.aborted) {
      mcpTimedOut = true;
      onMcpTimeout?.();
      logger?.warn(
        '[AcpSessionHandle] Ptah MCP did not connect before first prompt',
        {
          ...logContext,
          cause: 'handshake-timeout',
          agentId: options.agentId,
          port: options.mcpPort,
          timeoutMs: MCP_ATTACHMENT_TIMEOUT_MS,
        },
      );
      segment.emit({
        type: 'info',
        content:
          'Ptah MCP did not connect within 15s; report in your final message.',
      });
    }
  };

  /**
   * The task prompt goes first: until it is sent (the handshake and the up to
   * 15 s MCP attachment wait), `continue()` refuses (PR #1444 review). The
   * router parks a message sent meanwhile, because the first turn is running,
   * and delivers it once that turn settles.
   */
  let taskPromptSent = false;

  /**
   * Run one prompt. A turn Ptah interrupted to keep the session resolves 0,
   * as Cursor's does: the lane is healthy and the router continues it, so it
   * must not be recorded as a failed lane. A whole-lane abort stays 1.
   */
  const runTurn = (text: string): Promise<number> => {
    // An interrupted turn can leave a tool or its message open in the
    // projector; the next turn starts from a clean projection.
    if (lastTerminalStatus === 'interrupted') {
      streamProjector = createFlatStreamProjector();
    }
    interruptRequested = false;
    lastTerminalStatus = undefined;
    return session
      .prompt(text)
      .then((code) =>
        // Only a turn whose process takes the next prompt is healthy: a
        // process retired by a failed cancel reports `interrupted` too, but
        // the lane cannot continue on it (PR #1450 review).
        code !== 0 &&
        interruptRequested &&
        lastTerminalStatus === 'interrupted' &&
        !session.isClosed() &&
        !abort.signal.aborted
          ? 0
          : code,
      );
  };

  /**
   * The account-binding checkpoint (`CliCommandOptions.onAccountBinding`),
   * awaited before the task prompt as the Codex lane adapter does, so a named
   * lane never prompts before its binding to the session id persisted.
   * Resolves false, after one error segment and stopping the agent, when the
   * binding is incomplete or the checkpoint rejects.
   */
  const persistAccountBinding = async (sessionId: string): Promise<boolean> => {
    if (options.accountBinding === undefined && options.accountBindingId === undefined) {
      return true;
    }
    try {
      if (!options.accountBinding || !options.accountBindingId || !options.onAccountBinding) {
        throw new Error('the lane account binding is incomplete');
      }
      await options.onAccountBinding(
        {
          accountBinding: options.accountBinding,
          accountBindingId: options.accountBindingId,
        },
        sessionId,
      );
      return true;
    } catch (error: unknown) {
      logger?.error('[AcpSessionHandle] account binding checkpoint failed', {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
      const message = `${name} did not start: its account binding could not be recorded`;
      output.emit(`\n[${name}] ${message}\n`);
      segment.emit({ type: 'error', content: message });
      abort.abort();
      return false;
    }
  };

  /**
   * Whether a failed setup may fail over: nothing was aborted, no ACP session
   * was opened, the held output was not released, and the failure is not a
   * missing sign-in (both transports share agy's profile, so the fallback
   * would fail the same way, and the ACP error carries the sign-in hint).
   */
  const mayFallBack = (): boolean =>
    holdingSetup &&
    !abort.signal.aborted &&
    !session.getSessionId() &&
    !setupErrors.some((error) => error.code === 'auth-required');

  /** Run the lane on the fallback transport and forward everything it emits. */
  const runFallback = async (
    fallback: ProviderSessionLaneFallback,
  ): Promise<number> => {
    delegating = true;
    held.length = 0;
    holdingSetup = false;
    const reason =
      setupErrors.map((error) => error.message).join('; ') ||
      'the ACP session did not open';
    logger?.warn('[AcpSessionHandle] ACP setup failed; the lane falls back', {
      ...logContext,
      transport: fallback.label,
      reason,
    });
    let next: SdkHandle;
    try {
      next = await fallback.run();
    } catch (error: unknown) {
      logger?.error(
        '[AcpSessionHandle] fallback transport failed to start',
        error instanceof Error ? error : new Error(String(error)),
      );
      const detail = error instanceof Error ? error.message : String(error);
      const message = `${name} could not start: ACP failed (${reason}), then ${fallback.label} failed (${detail})`;
      output.emit(`\n[${name}] ${message}\n`);
      segment.emit({ type: 'error', content: message });
      return 1;
    }
    delegate = next;
    if (abort.signal.aborted) next.abort.abort();
    else {
      abort.signal.addEventListener('abort', () => next.abort.abort(), {
        once: true,
      });
    }
    const notice = `${name} could not open an ACP session (${reason}); this lane runs on ${fallback.label} instead.`;
    output.emit(`\n[${name}] ${notice}\n`);
    segment.emit({ type: 'info', content: notice });
    // The manager reads `mcpConfigWriteFailed` once, at spawn, while this
    // handle still ran ACP; a fallback that could not write its MCP config
    // is reported here (round-2 M1). The fallback prints its own output line.
    if (next.mcpConfigWriteFailed) {
      logger?.warn('[AcpSessionHandle] fallback could not configure Ptah MCP', {
        ...logContext,
        transport: fallback.label,
        cause: 'config-write-failed',
      });
      segment.emit({
        type: 'info',
        content: `Ptah MCP was not configured for the ${fallback.label} lane (config-write-failed); report in your final message.`,
      });
    }
    next.onOutput(output.emit);
    next.onSegment?.(segment.emit);
    next.onStreamEvent?.(stream.emit);
    next.onSessionResolved?.(sessionResolved.emit);
    next.onMcpAttachmentTimeout?.(() => {
      mcpTimedOut = true;
      onMcpTimeout?.();
    });
    return next.done;
  };

  /** Revoke the lane's MCP credential once, when the ACP process is gone. */
  let credentialReleased = false;
  const releaseCredential = (): void => {
    if (credentialReleased || abort.signal.aborted) return;
    credentialReleased = true;
    options.onMcpConfigRestored?.();
  };
  const releaseCredentialOnExit = (): void => {
    session.exited.then(releaseCredential, (error: unknown) => {
      logger?.warn('[AcpSessionHandle] agent exit watch failed; revoking the lane credential', {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
      releaseCredential();
    });
  };

  const runFirstTurn = async (): Promise<number> => {
    const setup = await session.start();
    if (!setup.ok && config.fallback && mayFallBack()) {
      return runFallback(config.fallback);
    }
    // Decided after the fallback check: a fallback lane still needs the
    // credential, and its own transport revokes it.
    releaseCredentialOnExit();
    releaseHeld();
    if (!setup.ok || abort.signal.aborted) return 1;
    const sessionId = session.getSessionId();
    if (!sessionId || !(await persistAccountBinding(sessionId))) return 1;
    await awaitMcpAttachment();
    if (abort.signal.aborted || session.isClosed()) return 1;
    taskPromptSent = true;
    return runTurn(
      buildTaskPrompt(
        // A restored session ran its earlier turns in another handle — another
        // process, host or Ptah version — so what they carried (the policy
        // version, the messaging block) is unknown here. Claiming today's
        // preambles were delivered would drop the lane policy and messaging
        // from a resume that may never have carried them; no
        // resumeDeliveredPreambles is passed, so both blocks stay in this
        // first prompt. Same-process continuations (continueTurn) still send
        // bare messages and keep their dedup.
        { ...options, resumeRestoresContext: setup.restoredContext },
        profile.vendor,
      ),
    );
  };

  const supportsContinuation = (): boolean => {
    if (delegate) return delegate.supportsContinuation?.() ?? false;
    return (
      !delegating &&
      session.isSetupComplete() &&
      !!session.getSessionId() &&
      !session.isClosed() &&
      !abort.signal.aborted
    );
  };

  /** `done` never rejects: an unexpected throw is logged and becomes exit 1. */
  const onUnexpectedTurnError = (error: unknown): number => {
    logger?.error('[AcpSessionHandle] turn threw unexpectedly', {
      ...logContext,
      error: error instanceof Error ? error.message : String(error),
    });
    return 1;
  };

  const continueTurn = (message: string): Promise<ContinuationOutcome> => {
    if (delegate) {
      return delegate.continue
        ? delegate.continue(message)
        : Promise.reject(
            new Error(`${name} on ${config.fallback?.label} takes no further messages`),
          );
    }
    if (session.isClosed() || abort.signal.aborted) {
      return Promise.reject(
        new Error(`${name} is no longer running; resume the session by id`),
      );
    }
    if (!session.isSetupComplete() || !session.getSessionId()) {
      return Promise.reject(new Error(`${name} has no ACP session yet`));
    }
    if (!taskPromptSent) {
      return Promise.reject(
        new Error(`${name} has not sent its task prompt yet; send the message after it`),
      );
    }
    if (session.isTurnRunning()) {
      return Promise.reject(new Error(`${name} is still running a turn`));
    }
    return Promise.resolve({
      done: runTurn(message).catch(onUnexpectedTurnError),
    });
  };

  /** Cancel the running turn; the process and session stay for `continue`. */
  const interrupt = async (): Promise<void> => {
    if (delegate) {
      await delegate.interrupt?.();
      return;
    }
    interruptRequested = true;
    const kept = await session.interrupt();
    logger?.info('[AcpSessionHandle] turn interrupted', {
      ...logContext,
      processKept: kept,
    });
  };

  /**
   * A first turn that threw before its task prompt went out leaves a session
   * that can never take a message (`continue` refuses without the task
   * prompt). The lane is aborted, so `supportsContinuation()` turns false
   * and the agent is released instead of idling until the lane's cleanup
   * (PR #1450 review). Every other early exit of the first turn already
   * aborts or closes the session.
   */
  const done = runFirstTurn().catch((error: unknown) => {
    const code = onUnexpectedTurnError(error);
    if (!taskPromptSent) abort.abort();
    return code;
  });

  return {
    abort,
    done,
    onOutput: output.subscribe,
    onSegment: segment.subscribe,
    onStreamEvent: stream.subscribe,
    onMcpAttachmentTimeout: (callback) => {
      onMcpTimeout = callback;
      if (mcpTimedOut) callback();
    },
    // After a fallback, the fallback transport's answer (it writes the file).
    get mcpConfigWriteFailed() {
      return delegate?.mcpConfigWriteFailed;
    },
    getSessionId: () =>
      delegate
        ? delegate.getSessionId?.()
        : (session.getSessionId() ?? options.resumeSessionId),
    onSessionResolved: sessionResolved.subscribe,
    supportsContinuation,
    continue: continueTurn,
    // Before the task prompt there is no turn to cancel.
    supportsInterrupt: () =>
      delegate
        ? (delegate.supportsInterrupt?.() ?? false)
        : taskPromptSent && session.supportsInterrupt() && !abort.signal.aborted,
    interrupt,
    getPid: () => (delegate ? delegate.getPid?.() : session.getPid()),
    // Both transports report per-turn totals.
    outcomeUsageIsTurnTotal: true,
    usageScope: 'turn',
    getObservedNativeThreadId: () =>
      delegate
        ? (delegate.getObservedNativeThreadId?.() ?? delegate.getSessionId?.())
        : session.getSessionId(),
  };
}
