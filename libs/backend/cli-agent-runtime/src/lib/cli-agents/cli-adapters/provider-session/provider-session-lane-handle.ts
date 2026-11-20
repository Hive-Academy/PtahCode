/**
 * createProviderSessionLaneHandle — presents one provider session (an ACP
 * agent from `@ptah-extension/acp-runtime`) as a lane `SdkHandle` with the
 * lane semantics the ACP lane always had.
 *
 * - The agent process is spawned synchronously and the handle returned at
 *   once (Cursor/Pi convention). `done` is the first turn: the handshake,
 *   then the Ptah MCP attachment wait, then the task prompt.
 * - `continue(message)` is a further prompt on the same session.
 * - There is no `steer` or `interrupt`: an ACP agent queues a mid-turn prompt
 *   instead of injecting it, so the message router's own queue is used.
 * - Abort = `session/cancel` (when a prompt is in flight), a short grace, then
 *   kill; the session stays resumable by id.
 *
 * Session events reach the lane through `projectToCliSegments`; stderr lines
 * are classified here (`classifyCliStderr`). `done` and every continuation
 * `done` resolve with 0 or 1 and never reject; failures become one `error`
 * segment.
 */
import { createAcpSession } from '@ptah-extension/acp-runtime';
import type {
  AcpTransportFactory,
  AcpVendorProfile,
} from '@ptah-extension/acp-runtime';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import { projectToCliSegments } from '@ptah-extension/provider-session-contracts';
import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';
import type { CliOutputSegment } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import { MCP_ATTACHMENT_TIMEOUT_MS } from '../../mcp-attachment-probe.port';
import type {
  CliCommandOptions,
  ContinuationOutcome,
  SdkHandle,
} from '../cli-adapter.interface';
import { buildTaskPrompt, createBufferedEmitter } from '../cli-adapter.utils';
import { classifyCliStderr } from '../cli-stderr-severity';
import { cliAcpSpawnTransport } from './cli-acp-spawn-transport';
import { buildLaneMcpAttachments } from './lane-mcp-attachments';

export interface ProviderSessionLaneHandleConfig {
  readonly profile: AcpVendorProfile;
  readonly options: CliCommandOptions;
  /** The binary to run: the resolved path from detection, or a bare name. */
  readonly command: string;
  /** Creates the child off-thread when present (TASK_2026_367). */
  readonly spawner?: IProcessSpawner;
  /** Defaults to the runtime's process transport; specs pass an in-memory one. */
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
  const sessionResolved = createBufferedEmitter<string>();
  let mcpTimedOut = false;
  let onMcpTimeout: (() => void) | undefined;

  const onEvent = (event: ProviderSessionEvent): void => {
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
  };

  const session = createAcpSession({
    profile,
    options: { ...options, mcp: buildLaneMcpAttachments(options) },
    command: config.command,
    spawner: config.spawner,
    spawnTransport: cliAcpSpawnTransport,
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

  const runFirstTurn = async (): Promise<number> => {
    const setup = await session.start();
    if (!setup.ok || abort.signal.aborted) return 1;
    await awaitMcpAttachment();
    if (abort.signal.aborted || session.isClosed()) return 1;
    return session.prompt(
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
    if (session.isTurnRunning()) {
      return Promise.reject(new Error(`${name} is still running a turn`));
    }
    return Promise.resolve({
      done: session.prompt(message).catch(onUnexpectedTurnError),
    });
  };

  const done = runFirstTurn().catch(onUnexpectedTurnError);

  return {
    abort,
    done,
    onOutput: output.subscribe,
    onSegment: segment.subscribe,
    onMcpAttachmentTimeout: (callback) => {
      onMcpTimeout = callback;
      if (mcpTimedOut) callback();
    },
    getSessionId: () => session.getSessionId() ?? options.resumeSessionId,
    onSessionResolved: sessionResolved.subscribe,
    supportsContinuation,
    continue: continueTurn,
    getPid: () => session.getPid(),
    outcomeUsageIsTurnTotal: true,
    usageScope: 'turn',
    getObservedNativeThreadId: () => session.getSessionId(),
  };
}
