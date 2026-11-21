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
import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';
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
  const streamProjector = createFlatStreamProjector();
  let mcpTimedOut = false;
  let onMcpTimeout: (() => void) | undefined;

  /** Status of the last turn's `terminal` event. */
  let lastTerminalStatus: string | undefined;
  /** {@link interrupt} was called during the current turn. */
  let interruptRequested = false;

  const onEvent = (event: ProviderSessionEvent): void => {
    if (event.type === 'terminal') lastTerminalStatus = event.status;
    if (event.type === 'diagnostic') {
      output.emit(`[stderr] ${event.line}\n`);
      segment.emit({ type: classifyCliStderr(event.line), content: event.line });
      return;
    }
    if (event.type === 'textDelta') output.emit(event.delta);
    if (event.type === 'error') {
      output.emit(`\n[${name}] ${event.error.message}\n`);
    }
    for (const item of projectToCliSegments(event)) segment.emit(item);
    // A failure already reaches the execution tree as its `error` segment
    // (the card renders error segments beside the event tree); projecting it
    // too would show the message twice.
    if (event.type === 'error') return;
    for (const item of streamProjector.project(event)) stream.emit(item);
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
    interruptRequested = false;
    lastTerminalStatus = undefined;
    return session
      .prompt(text)
      .then((code) =>
        code !== 0 &&
        interruptRequested &&
        lastTerminalStatus === 'interrupted' &&
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

  const runFirstTurn = async (): Promise<number> => {
    const setup = await session.start();
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

  const supportsContinuation = (): boolean =>
    session.isSetupComplete() &&
    !!session.getSessionId() &&
    !session.isClosed() &&
    !abort.signal.aborted;

  /** `done` never rejects: an unexpected throw is logged and becomes exit 1. */
  const onUnexpectedTurnError = (error: unknown): number => {
    logger?.error('[AcpSessionHandle] turn threw unexpectedly', {
      ...logContext,
      error: error instanceof Error ? error.message : String(error),
    });
    return 1;
  };

  const continueTurn = (message: string): Promise<ContinuationOutcome> => {
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
    interruptRequested = true;
    const kept = await session.interrupt();
    logger?.info('[AcpSessionHandle] turn interrupted', {
      ...logContext,
      processKept: kept,
    });
  };

  const done = runFirstTurn().catch(onUnexpectedTurnError);

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
    getSessionId: () => session.getSessionId() ?? options.resumeSessionId,
    onSessionResolved: sessionResolved.subscribe,
    supportsContinuation,
    continue: continueTurn,
    // Before the task prompt there is no turn to cancel.
    supportsInterrupt: () =>
      taskPromptSent && session.supportsInterrupt() && !abort.signal.aborted,
    interrupt,
    getPid: () => session.getPid(),
    outcomeUsageIsTurnTotal: true,
    usageScope: 'turn',
    getObservedNativeThreadId: () => session.getSessionId(),
  };
}
