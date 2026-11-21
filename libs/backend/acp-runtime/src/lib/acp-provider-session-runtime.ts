/**
 * createAcpProviderSessionRuntime — the `ProviderSessionRuntime` of every ACP
 * agent (Antigravity first): one {@link createAcpSession} per opened session,
 * presented through the full `ProviderSession` contract the chat adapter
 * reads. The lane keeps its own wrapper (`provider-session-lane-handle.ts`).
 *
 * - `open` spawns the profile's agent, runs the handshake and the attach
 *   (`attach.method`, `attach.onFailure`), and resolves once the session can
 *   take prompts. It rejects only before a session exists, with an `Error`
 *   whose `code` is the `ProviderSessionErrorCode` of the failure
 *   ({@link AcpProviderSessionError}); afterwards failures are events.
 * - Instructions (`request.instructions`) reach a new session once, per the
 *   profile's `instructionsMeta` (a vendor system-prompt hook on
 *   `session/new`), else in front of the first prompt; never a restored one.
 * - The chat has no prompt timeout (`request.promptTimeoutMs` is honoured
 *   only when the caller sets one); liveness comes from the process. A
 *   process that exits during a turn ends it with
 *   `terminal{failed, broken}`; one that exits while idle makes the next
 *   `prompt` reject with `process-exited`, the code the chat adapter reads as
 *   broken. There is no respawn: the pool re-acquires with an attach.
 * - `close` aborts the session (cancel grace, then kill) and waits at most
 *   {@link ACP_PROVIDER_SESSION_CLOSE_MS} for the process. It revokes no
 *   credential: the pool that minted the MCP bearer owns its revocation.
 */
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import type {
  ProviderSession,
  ProviderSessionCapabilities,
  ProviderSessionError,
  ProviderSessionErrorCode,
  ProviderSessionLogger,
  ProviderSessionOpenRequest,
  ProviderSessionRuntime,
  ProviderTurnInput,
  ProviderTurnReceipt,
} from '@ptah-extension/provider-session-contracts';
import type { AppliedSettings } from '@ptah-extension/shared';
import { createAcpEventHub } from './acp-event-hub';
import type { AcpCommandPreparer, AcpTransportFactory } from './acp-process-transport';
import { toAcpPromptContent } from './acp-prompt-content';
import { createAcpSession } from './acp-session-runtime';
import type { AcpSessionOptions, AcpVendorProfile } from './acp-vendor-profile';

/** Bound on `close()` waiting for the agent process after the stop began. */
export const ACP_PROVIDER_SESSION_CLOSE_MS = 5_000;

/** A runtime failure the chat adapter reads by its `code` (shape, not class). */
export class AcpProviderSessionError extends Error {
  constructor(
    readonly code: ProviderSessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AcpProviderSessionError';
  }
}

export interface AcpProviderSessionRuntimeDeps {
  /** Creates the agent child off-thread (the host's SDK process spawner). */
  readonly spawner: IProcessSpawner;
  readonly logger: ProviderSessionLogger;
  /** The admitted profiles; `request.profile` selects one by its `vendor`. */
  readonly profiles: readonly AcpVendorProfile[];
  /** Command-line policy (Windows `.cmd` resolution, length limit). Optional. */
  readonly prepareCommand?: AcpCommandPreparer;
  /** Specs only: an in-memory transport instead of a spawned process. */
  readonly transportFactory?: AcpTransportFactory;
}

export function createAcpProviderSessionRuntime(
  deps: AcpProviderSessionRuntimeDeps,
): ProviderSessionRuntime {
  return {
    open: (request, signal) => openAcpProviderSession(deps, request, signal),
  };
}

async function openAcpProviderSession(
  deps: AcpProviderSessionRuntimeDeps,
  request: ProviderSessionOpenRequest,
  signal?: AbortSignal,
): Promise<ProviderSession> {
  const profile = deps.profiles.find((candidate) => candidate.vendor === request.profile);
  if (!profile) {
    throw new AcpProviderSessionError(
      'protocol-unsupported',
      `No ACP profile is registered for ${request.profile}`,
    );
  }
  if (signal?.aborted) {
    throw new AcpProviderSessionError('cancelled', `${profile.displayName} open was cancelled`);
  }
  const { logger } = deps;
  const name = profile.displayName;
  const options: AcpSessionOptions = {
    workingDirectory: request.policy.cwd,
    permission: request.policy.permission,
    // Requests go to `request.approvals`; the headless policy never runs.
    autoApprove: false,
    model: request.model,
    reasoningEffort: request.effort,
    consumer: request.consumer,
    agentId: request.runId,
    mcp: request.mcp,
    ...(request.instructions ? { instructions: request.instructions } : {}),
    ...(request.promptTimeoutMs ? { promptTimeoutMs: request.promptTimeoutMs } : {}),
    ...(request.attach
      ? {
          resumeSessionId: request.attach.nativeSessionId,
          attachMethod: request.attach.method,
          attachFailure: request.attach.onFailure,
        }
      : {}),
  };

  const hub = createAcpEventHub();
  const lifetime = new AbortController();
  /** The first error of the setup: what a failed `open` rejects with. */
  let setupError: ProviderSessionError | undefined;
  let opened = false;
  const acp = createAcpSession({
    profile,
    options,
    command: request.binaryPath,
    baseEnv: request.baseEnv,
    spawner: deps.spawner,
    prepareCommand: deps.prepareCommand,
    transportFactory: deps.transportFactory,
    logger,
    signal: lifetime.signal,
    approvals: request.approvals,
    onEvent: (event) => {
      if (!opened && event.type === 'error') setupError ??= event.error;
      hub.publish(event);
    },
  });

  const cancelOpen = (): void => lifetime.abort();
  signal?.addEventListener('abort', cancelOpen, { once: true });
  let start: Awaited<ReturnType<typeof acp.start>>;
  try {
    start = await acp.start();
  } finally {
    signal?.removeEventListener('abort', cancelOpen);
  }
  const nativeSessionId = acp.getSessionId();
  if (!start.ok || !nativeSessionId || lifetime.signal.aborted) {
    lifetime.abort();
    hub.end();
    if (signal?.aborted) {
      throw new AcpProviderSessionError('cancelled', `${name} open was cancelled`);
    }
    throw new AcpProviderSessionError(
      setupError?.code ?? 'turn-failed',
      setupError?.message ?? `${name} could not open an ACP session`,
    );
  }
  opened = true;
  logger.info('[AcpProviderSession] session opened', {
    vendor: profile.vendor,
    runId: request.runId,
    restoredContext: start.restoredContext,
    attach: request.attach?.method,
  });

  let revision = 0;
  let permission = request.policy.permission;
  let closing: Promise<void> | undefined;
  const applied = (): AppliedSettings => ({
    timing: acp.isTurnRunning() ? 'nextTurn' : 'effectiveNow',
    revision: ++revision,
  });
  const refused = (what: string): AcpProviderSessionError =>
    new AcpProviderSessionError('request-failed', `${name} did not apply the ${what}`);
  const requireOpen = (operation: string): void => {
    if (closing) {
      throw new AcpProviderSessionError('cancelled', `${name} session is closed (${operation})`);
    }
    if (acp.isClosed()) {
      throw new AcpProviderSessionError(
        'process-exited',
        `${name} is no longer running; the session must be re-attached`,
      );
    }
  };

  const capabilities = (): ProviderSessionCapabilities => {
    const advertised = acp.getAgentCapabilities();
    const modes = acp.getModes();
    return {
      // An ACP agent queues a mid-turn prompt instead of injecting it.
      steer: false,
      interrupt: (profile.cancelBehavior ?? 'kill') === 'await-reply',
      setModel: acp.getModels().length > 0,
      setMode: modes.length > 0,
      images: advertised?.promptCapabilities?.image === true,
      resume: !!advertised?.sessionCapabilities?.resume,
      load: advertised?.loadSession === true,
      modes,
    };
  };

  const prompt = async (input: ProviderTurnInput): Promise<ProviderTurnReceipt> => {
    requireOpen('prompt');
    if (acp.isTurnRunning()) {
      throw new AcpProviderSessionError(
        'turn-failed',
        `${name} is still running a turn; wait for it, or interrupt it`,
      );
    }
    // Refused, never dropped: an agent that did not advertise image input
    // gets no image block (the chat adapter checks first; this is the floor).
    if (input.images?.length && !capabilities().images) {
      throw new AcpProviderSessionError('turn-failed', `${name} does not accept images`);
    }
    // `done` never rejects; the turn's outcome is its terminal event.
    void acp.prompt(toAcpPromptContent(input));
    const turnId = acp.getTurnId();
    if (!turnId) {
      throw new AcpProviderSessionError('turn-failed', `${name} did not start the turn`);
    }
    return { turnId };
  };

  const close = (): Promise<void> => {
    closing ??= (async () => {
      lifetime.abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([
          acp.exited.then(() => 'exited' as const),
          new Promise<'late'>((resolve) => {
            timer = setTimeout(() => resolve('late'), ACP_PROVIDER_SESSION_CLOSE_MS);
          }),
        ]);
        if (outcome === 'late') {
          // The kill was already sent (tree-kill); the exit is only unconfirmed.
          logger.warn('[AcpProviderSession] agent did not exit within the close bound', {
            vendor: profile.vendor,
            runId: request.runId,
            boundMs: ACP_PROVIDER_SESSION_CLOSE_MS,
          });
        }
      } finally {
        clearTimeout(timer);
        hub.end();
      }
    })();
    return closing;
  };

  return {
    nativeSessionId,
    get processGeneration() {
      return acp.getProcessGeneration();
    },
    restoredContext: start.restoredContext,
    replay: acp.getReplay(),
    capabilities,
    listModels: async () => acp.getModels(),
    events: (eventsSignal) => hub.subscribe(eventsSignal),
    prompt,
    interrupt: async (turnId) => {
      if (closing || acp.getTurnId() !== turnId) return false;
      return acp.interrupt();
    },
    setModel: async (model) => {
      requireOpen('setModel');
      if (!(await acp.setModel(model))) throw refused(`model ${model}`);
      return applied();
    },
    setEffort: async (effort) => {
      requireOpen('setEffort');
      if (!(await acp.setEffort(effort))) throw refused(`effort ${effort ?? 'default'}`);
      return applied();
    },
    setPermission: async (next) => {
      requireOpen('setPermission');
      const mode = profile.modeFor?.({ ...options, permission: next });
      if (mode && !(await acp.setMode(mode))) throw refused(`${next} permission`);
      if (next !== permission) {
        logger.info('[AcpProviderSession] permission changed', {
          vendor: profile.vendor,
          runId: request.runId,
          from: permission,
          to: next,
          mode,
        });
      }
      permission = next;
      return applied();
    },
    isTurnRunning: () => acp.isTurnRunning(),
    getPid: () => acp.getPid(),
    close,
  };
}
