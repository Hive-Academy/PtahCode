/**
 * createAcpSession — one long-lived ACP agent process and its session. This
 * is the only stateful unit of the ACP runtime; everything vendor-specific
 * comes from the {@link AcpVendorProfile}. What the agent shows is emitted as
 * `ProviderSessionEvent`s; a consumer (a lane handle, later the chat) projects
 * them.
 *
 * Lifecycle:
 * - The process is spawned synchronously when the session is created, through
 *   `IProcessSpawner` with the complete environment built from `baseEnv` and
 *   the profile's spawn env.
 * - `start()` runs the handshake: `connectAcp` → `initialize` (protocol
 *   tolerance per D8) → `session/resume|load|new` (with one `authenticate`
 *   retry when the profile names a method) → `session/set_config_option` and
 *   `session/set_mode`. Each handshake phase has its own deadline
 *   ({@link ACP_HANDSHAKE_TIMEOUTS_MS}).
 * - `prompt(text)` is one `session/prompt`, optionally bounded by
 *   `options.promptTimeoutMs` (lanes).
 * - `interrupt()` sends `session/cancel`; with the profile's `await-reply`
 *   cancel behaviour the agent answers the prompt and the process stays for
 *   the next prompt.
 * - Aborting `signal` = `session/cancel` (when a prompt is in flight), then up
 *   to {@link ACP_CANCEL_GRACE_MS} for the agent to answer or exit, then kill.
 *   The session is never closed, so it stays resumable by id.
 *
 * Process generations: every spawned agent process is one generation. Its
 * callbacks carry their generation, and anything a dead generation still
 * delivers (a late update, reply or request) is dropped. With
 * `respawnOnPrompt` the next prompt after a crash spawns a new generation and
 * re-attaches to the same session (failing with `resume-failed` when that is
 * impossible).
 *
 * `start` and `prompt` never reject for an agent failure; a failure becomes
 * one `error` event.
 */
import { randomUUID } from 'node:crypto';
import type {
  InitializeResponse,
  McpServer,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import type {
  ProviderApprovalSink,
  ProviderSessionErrorCode,
  ProviderSessionEvent,
  ProviderSessionEventBody,
  ProviderSessionLogger,
} from '@ptah-extension/provider-session-contracts';
import type { z } from 'zod';
import {
  requestAcpApproval,
  toProviderApprovalRequest,
} from './acp-approval-adapter';
import { cancelledResponse, decideAcpPermission } from './acp-permission-policy';
import { spawnAcpProcess } from './acp-process-transport';
import type {
  AcpCommandPreparer,
  AcpProcessExit,
  AcpProcessTransport,
  AcpTransportFactory,
} from './acp-process-transport';
import {
  ACP_REQUESTED_PROTOCOL_VERSION,
  advertisedAuthMethods,
  checkInitializeReply,
} from './acp-protocol-negotiation';
import { createAcpReplayCollector } from './acp-replay-collector';
import type { AcpReplayCollector } from './acp-replay-collector';
import {
  AcpUnavailableError,
  acpMethodNotFound,
  connectAcp,
} from './acp-sdk-loader';
import type { AcpClientHandlers, AcpConnectionApi } from './acp-sdk-loader';
import {
  acpPromptUsageSchema,
  acpUsageUpdateSchema,
  advertisedValuesOf,
  describeExit,
  errorText,
  isRecord,
  isReplayedUpdate,
  readAuthoritativeConfigOptions,
  readConfigOptions,
  readJsonRpcError,
  readModeIds,
} from './acp-session-helpers';
import { buildAcpSpawnEnv } from './acp-spawn-env';
import {
  createAcpSessionUpdateMapper,
  mapStopReason,
} from './acp-session-update-mapper';
import { readAcpErrorDetail } from './acp-vendor-profile';
import type {
  AcpRequestFailure,
  AcpRequestMethod,
  AcpSessionConfigEntry,
  AcpSessionOptions,
  AcpVendorProfile,
} from './acp-vendor-profile';

/** The two handshake phases; each one gets its own deadline. */
export type AcpHandshakePhase = 'initialize' | 'session';

/**
 * Per-phase handshake deadlines; a phase that overruns its own fails the turn.
 * `initialize` covers the child's start and the `initialize` reply. `session`
 * covers `session/new` (or a resume) and the config writes. That phase is the
 * slow one: the agent connects its MCP servers there, Ptah's own included, so
 * a busy host or a loaded machine stretches it. One fixed 30 s budget for both
 * failed grok lanes under load (TASK_2026_882_01ef).
 */
export const ACP_HANDSHAKE_TIMEOUTS_MS: Readonly<
  Record<AcpHandshakePhase, number>
> = { initialize: 45_000, session: 90_000 };

const HANDSHAKE_PHASE_LABEL: Readonly<Record<AcpHandshakePhase, string>> = {
  initialize: 'initialize',
  session: 'session setup',
};

/**
 * After `session/cancel`, how long the agent gets to stop its tools and answer
 * the prompt (or exit) before the tree-kill.
 */
export const ACP_CANCEL_GRACE_MS = 1_500;
/**
 * How long writing `session/cancel` may take. The SDK queues the notification
 * behind any pending write (a large prompt into a child that stopped reading
 * stdin), so the write itself is bounded; past this the agent is stopped.
 */
export const ACP_CANCEL_WRITE_TIMEOUT_MS = 1_500;
/** Bound for agents that return a prompt response without usage metadata or a usage_update. */
export const ACP_USAGE_DRAIN_MS = 2_000;
/**
 * After an interrupt's `session/cancel`, how long an `await-reply` agent gets
 * to answer the cancelled prompt before it is stopped (and the session is
 * broken). Longer than the abort grace: the process is meant to survive.
 */
export const ACP_INTERRUPT_REPLY_TIMEOUT_MS = 10_000;

/** The JSON-RPC code ACP defines for "authentication required". */
export const ACP_AUTH_REQUIRED_CODE = -32000;

/** The client identity sent on `initialize` (the ACP client revision, not the Ptah release). */
const ACP_CLIENT_INFO = { name: 'ptah', title: 'Ptah', version: '1' } as const;

/** Distinct unknown extension methods named in an `info`; later ones stay silent. */
const MAX_REPORTED_EXTENSION_METHODS = 32;

/** Title used when a refused permission request carried none. */
const FALLBACK_REFUSED_TITLE = 'a tool call';

export interface AcpSessionConfig {
  readonly profile: AcpVendorProfile;
  readonly options: AcpSessionOptions;
  /** The binary to run: the resolved path from detection, or a bare name. */
  readonly command: string;
  /**
   * The environment the agent starts from (a lane: the host environment plus
   * its clean-output variables). The profile's spawn env is applied to it.
   */
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  /** Creates the child (off-thread in the hosts, TASK_2026_367). */
  readonly spawner?: IProcessSpawner;
  /** The caller's command-line policy (Windows `.cmd` resolution, length limit). */
  readonly prepareCommand?: AcpCommandPreparer;
  /** Defaults to {@link spawnAcpProcess}; specs pass an in-memory transport. */
  readonly transportFactory?: AcpTransportFactory;
  /** Receives the raw failure detail that user-facing events summarise. */
  readonly logger?: ProviderSessionLogger;
  /** Aborting ends the session (cancel grace, then kill). */
  readonly signal: AbortSignal;
  /** Every event, in order. Called synchronously; must not throw. */
  readonly onEvent: (event: ProviderSessionEvent) => void;
  /** The native session id, once `session/new` (or a resume) settled it. */
  readonly onSessionResolved?: (sessionId: string) => void;
  /**
   * Where permission requests are asked (the chat's approval UI). Omit for
   * the headless lane policy (`decideAcpPermission` over `autoApprove`).
   */
  readonly approvals?: ProviderApprovalSink;
  /**
   * Respawn the agent and re-attach on the next prompt after its process
   * ended (chat). Lanes leave it off: a dead lane is resumed by id instead.
   */
  readonly respawnOnPrompt?: boolean;
}

/** What `start()` settled to; on `ok: false` the error event is already out. */
export type AcpSessionStart =
  | { readonly ok: true; readonly restoredContext: boolean }
  | { readonly ok: false };

/** One ACP agent session. */
export interface AcpSession {
  /** Handshake and session setup. Never rejects; stops the agent on failure. */
  start(): Promise<AcpSessionStart>;
  /**
   * One `session/prompt`. Resolves with the lane exit code (0 or 1); an agent
   * failure is an `error` event, never a rejection. Prompts do not overlap: a
   * call while an earlier prompt has not settled rejects at once and sends
   * nothing.
   */
  prompt(text: string): Promise<number>;
  /**
   * Cancel the running turn. Resolves true when the turn ended and the agent
   * process is still running (the session takes the next prompt); false when
   * no turn was running or the agent had to be stopped.
   */
  interrupt(): Promise<boolean>;
  /** Whether {@link interrupt} keeps the process (profile `await-reply`, session set up). */
  supportsInterrupt(): boolean;
  /** Switch the session mode (`session/set_mode`, else a `mode` config option). */
  setMode(mode: string): Promise<boolean>;
  /** Switch the model (a `model` config option; ACP has no `session/set_model`). */
  setModel(model: string): Promise<boolean>;
  /** Resolves when the current agent process ends. Never rejects. */
  readonly exited: Promise<AcpProcessExit>;
  /**
   * The connection closed or the process exited, or the process is being
   * stopped (the prompt watchdog fired, a kill was started): it takes no
   * further prompt.
   */
  isClosed(): boolean;
  /** Session set up and config applied: it can take prompts. */
  isSetupComplete(): boolean;
  isTurnRunning(): boolean;
  getSessionId(): string | undefined;
  /** Whether the session attached at least one MCP server. */
  attachedMcpServers(): boolean;
  /** The agent's pid while it is alive. */
  getPid(): number | undefined;
  /** Increments each time the agent process is respawned; starts at 1. */
  getProcessGeneration(): number;
  /** History replayed by `session/load`, flagged `replayed` (empty otherwise). */
  getReplay(): readonly ProviderSessionEvent[];
}

/** A turn failure whose message is already user-facing. */
class AcpTurnFailure extends Error {
  constructor(
    message: string,
    readonly code: ProviderSessionErrorCode = 'request-failed',
    readonly rpcCode?: number,
    /** The message came from the profile's `describeError`. */
    readonly described = false,
  ) {
    super(message);
    this.name = 'AcpTurnFailure';
  }
}

const HANDSHAKE_TIMED_OUT = Symbol('acp-handshake-timed-out');

/** One spawned agent process and its connection. */
interface Generation {
  readonly number: number;
  readonly transport: AcpProcessTransport;
  connection?: AcpConnectionApi;
  init?: InitializeResponse;
  closed: boolean;
  exit?: AcpProcessExit;
  killRequested: boolean;
  /**
   * The process is being stopped (the watchdog fired, or a kill was asked):
   * it takes no further prompt, even before it actually exits.
   */
  retired: boolean;
  /** Aborted when this generation's process ends (pending approvals give up). */
  readonly gone: AbortController;
}

/** Spawn the profile's agent and return its session at once. */
export function createAcpSession(config: AcpSessionConfig): AcpSession {
  const { profile, options, logger, signal } = config;
  const name = profile.displayName;
  const logContext = { vendor: profile.vendor };
  const logMcpRequest = (
    method: string,
    servers: readonly McpServer[],
    session?: string,
  ): void => {
    logger?.info('[AcpSessionHandle] session MCP servers', {
      ...logContext,
      method,
      agentId: options.agentId,
      sessionId: session,
      // Name and transport only: a stdio server's env and args, and an HTTP
      // server's url and headers, can carry credentials (PR #1450 review).
      // The configuration sent to the agent is not changed.
      mcpServers: servers.map((server) => ({
        name: server.name,
        transport: 'type' in server ? server.type : 'stdio',
      })),
    });
  };

  const mapper = createAcpSessionUpdateMapper({
    extractExitCode: (rawOutput) => profile.extractExitCode?.(rawOutput),
  });

  /** A separate mapper for history, so the replay never touches live tool state. */
  const replayMapper = createAcpSessionUpdateMapper({
    extractExitCode: (rawOutput) => profile.extractExitCode?.(rawOutput),
  });

  let sessionId: string | undefined;
  /** The id being resumed or loaded, so its updates pass the session filter. */
  let attachingSessionId: string | undefined;
  /** Set while `session/load` replays history into it. */
  let replayCollector: AcpReplayCollector | undefined;
  let replay: readonly ProviderSessionEvent[] = [];
  let replayCaptured = false;
  /** Session set up and config applied: the session can take further prompts. */
  let setupComplete = false;
  let sentMcpServers = false;
  let advertisedConfig: readonly Record<string, unknown>[] = [];
  let advertisedModes: readonly string[] = [];
  /** The last model and mode the agent acknowledged after setup; a respawn reapplies them. */
  let acknowledgedModel: string | undefined;
  let acknowledgedMode: string | undefined;
  let handshakePhase: AcpHandshakePhase = 'initialize';
  /** Set while {@link withHandshakeTimeout} runs; re-arms its timer for a phase. */
  let enterHandshakePhase: ((phase: AcpHandshakePhase) => void) | undefined;
  let promptInFlight = false;
  let promptSequence = 0;
  let currentTurnId: string | undefined;
  let eventSequence = 0;
  let approvalSequence = 0;
  const budgetRunId = options.agentId ?? randomUUID();
  let latestUpdateUsage: z.infer<typeof acpPromptUsageSchema> | undefined;
  let resolveUsageUpdate: (() => void) | undefined;
  /** Title of the first request the policy refused during the current prompt. */
  let refusedThisTurn: string | undefined;
  /** The running turn was cancelled by {@link interrupt} or the watchdog. */
  let turnCancelledByPtah = false;
  /** Settles when the current prompt has its answer; never rejects. */
  let promptSettled: Promise<number> | undefined;
  /** Aborted by {@link interrupt} or the watchdog: the turn's pending approvals answer `cancelled`. */
  let turnApprovals: AbortController | undefined;
  /** Approvals waiting on the sink, so an interrupt can let them answer before `session/cancel`. */
  const pendingApprovals = new Set<Promise<unknown>>();
  const reportedExtensionMethods = new Set<string>();

  /** The current process generation; replaced only by a respawn. */
  let gen!: Generation;

  const emit = (body: ProviderSessionEventBody): void => {
    config.onEvent({
      contextId: budgetRunId,
      processGeneration: gen.number,
      sequence: ++eventSequence,
      ...(sessionId ? { sessionId } : {}),
      ...(currentTurnId ? { turnId: currentTurnId } : {}),
      ...body,
    });
  };
  const emitError = (
    message: string,
    code: ProviderSessionErrorCode = 'turn-failed',
  ): void => {
    emit({ type: 'error', error: { code, message } });
  };
  const emitInfo = (message: string): void => {
    emit({ type: 'info', message });
  };

  /** Kill a generation's child once, unless it already exited (an exited pid may be reused). */
  const stopProcess = (target: Generation = gen): void => {
    target.retired = true;
    if (target.exit || target.killRequested) return;
    target.killRequested = true;
    target.transport.kill();
  };

  /** The generation can take work: its connection is open and no stop was started. */
  const isLive = (target: Generation): boolean =>
    !target.closed && !target.retired;

  const dropStale = (target: Generation, what: string): boolean => {
    if (target === gen) return false;
    logger?.debug('[AcpSessionHandle] dropped a late message from an ended agent process', {
      ...logContext,
      what,
      generation: target.number,
      current: gen.number,
    });
    return true;
  };

  const isOwnSession = (id: unknown): boolean => {
    const expected = sessionId ?? attachingSessionId;
    return expected === undefined || id === expected;
  };

  const answerPermission = async (
    target: Generation,
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> => {
    if (!config.approvals) {
      const decision = decideAcpPermission(request, {
        autoApprove: options.autoApprove,
      });
      if (decision.info) emitInfo(decision.info);
      if (decision.refused && promptInFlight && !refusedThisTurn) {
        refusedThisTurn = decision.toolTitle ?? FALLBACK_REFUSED_TITLE;
      }
      return decision.response;
    }
    const approval = toProviderApprovalRequest(
      request,
      `${sessionId ?? budgetRunId}:approval:${++approvalSequence}`,
    );
    emit({ type: 'approvalRequested', request: approval });
    const asked = new AbortController();
    const stopAsking = (): void => asked.abort();
    // Session abort, process exit, and an interrupt of the turn all cancel it.
    const turn = turnApprovals?.signal;
    signal.addEventListener('abort', stopAsking, { once: true });
    target.gone.signal.addEventListener('abort', stopAsking, { once: true });
    turn?.addEventListener('abort', stopAsking, { once: true });
    if (signal.aborted || target.gone.signal.aborted || turn?.aborted) asked.abort();
    const asking = requestAcpApproval(config.approvals, request, approval, asked.signal);
    pendingApprovals.add(asking);
    try {
      const outcome = await asking;
      if (target === gen) {
        emit({
          type: 'approvalSettled',
          requestId: approval.requestId,
          decision: outcome.decision,
        });
        if (outcome.refused && promptInFlight && !refusedThisTurn) {
          refusedThisTurn = approval.title;
        }
      }
      return outcome.response;
    } finally {
      pendingApprovals.delete(asking);
      signal.removeEventListener('abort', stopAsking);
      target.gone.signal.removeEventListener('abort', stopAsking);
      turn?.removeEventListener('abort', stopAsking);
    }
  };

  const createHandlers = (target: Generation): AcpClientHandlers => ({
    sessionUpdate: async (notification) => {
      if (dropStale(target, 'session/update')) return;
      if (!isOwnSession(notification.sessionId)) return;
      if (replayCollector) {
        // Everything `session/load` sends before it answers is history.
        replayCollector.add(replayMapper.map(notification.update));
        return;
      }
      if (isReplayedUpdate(notification)) return;
      // A live option change (e.g. a mode added after a model switch) is what
      // later `setMode`/`setModel` calls validate against. History never
      // reaches here: replayed updates returned above.
      if (notification.update.sessionUpdate === 'config_option_update') {
        const updated = readAuthoritativeConfigOptions(notification.update);
        if (updated) advertisedConfig = updated;
      }
      if (promptInFlight) {
        const update = acpUsageUpdateSchema.safeParse(notification.update);
        if (update.success && update.data._meta?.usage) {
          latestUpdateUsage = {
            ...update.data._meta.usage,
            contextTokens:
              update.data._meta.usage.contextTokens ?? update.data.used,
          };
          resolveUsageUpdate?.();
        }
      }
      for (const body of mapper.map(notification.update)) emit(body);
    },
    requestPermission: async (request) => {
      if (dropStale(target, 'session/request_permission')) {
        return cancelledResponse();
      }
      // A request for another session must not be answered with this
      // session's policy, nor shown under it (PR #1445 review). During a
      // re-attach the attaching id is the expected one.
      if (!isOwnSession(request.sessionId)) {
        logger?.warn('[AcpSessionHandle] cancelled a permission request for another session', {
          ...logContext,
          requestSessionId: request.sessionId,
          sessionId: sessionId ?? attachingSessionId,
        });
        return cancelledResponse();
      }
      return answerPermission(target, request);
    },
    extNotification: async (method, params) => {
      if (dropStale(target, method)) return;
      if (profile.extensions?.notification?.(method, params, logger)) return;
      logger?.debug('[AcpSessionHandle] unsupported extension notification', {
        ...logContext,
        method,
      });
      if (
        reportedExtensionMethods.has(method) ||
        reportedExtensionMethods.size >= MAX_REPORTED_EXTENSION_METHODS
      ) {
        return;
      }
      reportedExtensionMethods.add(method);
      emitInfo(`${name} sent an unsupported notification: ${method}`);
    },
    // Without a profile hook there is no `extMethod`: the SDK answers an
    // unhandled agent request with -32601 itself.
    ...(profile.extensions?.request
      ? {
          extMethod: async (method: string, params: Record<string, unknown>) => {
            const result = dropStale(target, method)
              ? undefined
              : await profile.extensions?.request?.(method, params);
            if (result === undefined) throw await acpMethodNotFound(method);
            return result;
          },
        }
      : {}),
  });

  const onAbort = (): void => {
    const target = gen;
    const conn = target.connection;
    const id = sessionId;
    if (promptInFlight && conn && id && !target.closed) {
      // The grace starts once the agent can see the notification; a cancel
      // that fails or does not get written in time kills at once.
      const settled = promptSettled;
      void cancelPrompt(target, conn, id).then((sent) =>
        sent ? stopAfterGrace(target, ACP_CANCEL_GRACE_MS, settled) : undefined,
      );
      return;
    }
    stopProcess(target);
  };
  signal.addEventListener('abort', onAbort, { once: true });

  const spawnGeneration = (number: number): Generation => {
    const spawnSpec = profile.buildSpawn(options);
    /** Filled once the generation exists; stderr of an older one is dropped. */
    const owner: { generation?: Generation } = {};
    const transport = (config.transportFactory ?? spawnAcpProcess)({
      command: config.command,
      args: spawnSpec.args,
      env: buildAcpSpawnEnv(config.baseEnv, spawnSpec.env),
      needsConsole: spawnSpec.needsConsole === true,
      cwd: options.workingDirectory,
      spawner: config.spawner,
      prepareCommand: config.prepareCommand,
      logger,
      onStderrLine: (line) => {
        if (owner.generation && owner.generation !== gen) return;
        const cleaned = line.trim();
        if (!cleaned) return;
        emit({ type: 'diagnostic', stream: 'stderr', line: cleaned });
      },
    });
    const next: Generation = {
      number,
      transport,
      closed: false,
      killRequested: false,
      retired: false,
      gone: new AbortController(),
    };
    owner.generation = next;
    void transport.exited.then((exit) => {
      // Exit while idle needs no output: no prompt is pending, and the next
      // message is refused (or respawns), so the caller resumes by session id.
      next.exit = exit;
      next.closed = true;
      next.gone.abort();
      if (!config.respawnOnPrompt) signal.removeEventListener('abort', onAbort);
      logger?.info('[AcpSessionHandle] agent process ended', {
        ...logContext,
        code: exit.code,
        signal: exit.signal,
        killedByPtah: next.killRequested,
        generation: number,
      });
    });
    return next;
  };

  gen = spawnGeneration(1);
  // A signal aborted before the session existed never fires 'abort' again:
  // stop the child now (PR #1444 review).
  if (signal.aborted) onAbort();

  const sendCancel = (conn: AcpConnectionApi, id: string): Promise<void> => {
    const meta = profile.cancelMeta?.(options);
    return conn.cancel({ sessionId: id, ...(meta ? { _meta: meta } : {}) });
  };

  /**
   * Send `session/cancel` within {@link ACP_CANCEL_WRITE_TIMEOUT_MS}. Resolves
   * true once it is written. On a failed, stalled or moot write (the process
   * ended first) the agent is stopped at once and it resolves false, so no
   * cancellation path waits on the write without a bound (PR #1445 review).
   * Never rejects.
   */
  const cancelPrompt = async (
    target: Generation,
    conn: AcpConnectionApi,
    id: string,
  ): Promise<boolean> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<'stalled'>((resolve) => {
      timer = setTimeout(() => resolve('stalled'), ACP_CANCEL_WRITE_TIMEOUT_MS);
    });
    try {
      const outcome = await Promise.race([
        sendCancel(conn, id).then(() => 'sent' as const),
        stalled,
        target.transport.exited.then(() => 'exited' as const),
      ]);
      if (outcome === 'sent') return true;
      logger?.warn('[AcpSessionHandle] session/cancel was not written in time', {
        ...logContext,
        outcome,
        timeoutMs: ACP_CANCEL_WRITE_TIMEOUT_MS,
      });
    } catch (error: unknown) {
      // Logged here; the agent is stopped below and the caller reads `false`
      // as "stopped".
      logger?.warn('[AcpSessionHandle] session/cancel could not be sent', {
        ...logContext,
        error: errorText(error),
      });
    } finally {
      clearTimeout(timer);
    }
    stopProcess(target);
    return false;
  };

  /**
   * Give a cancelled agent up to `graceMs` to stop its tools and answer the
   * cancelled prompt (`settled`, captured when the cancel started) or exit,
   * then kill. The kill is the backstop for an agent that ignores the cancel;
   * it is skipped once the child exited.
   */
  const stopAfterGrace = async (
    target: Generation,
    graceMs: number,
    settled: Promise<unknown> | undefined,
  ): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, graceMs);
    });
    try {
      await Promise.race([
        target.transport.exited,
        settled ?? Promise.resolve(),
        grace,
      ]);
    } catch (error: unknown) {
      logger?.error(
        '[AcpSessionHandle] waiting for the cancelled turn failed',
        {
          ...logContext,
          error: errorText(error),
        },
      );
    } finally {
      clearTimeout(timer);
    }
    stopProcess(target);
  };

  const onConnectionClosed = (target: Generation): void => {
    target.closed = true;
    // A child without a connection can do no more work for this session.
    stopProcess(target);
  };

  /** The runner's own wording for a failure the profile did not describe. */
  const genericFailure = (failure: AcpRequestFailure): string => {
    const detail = readAcpErrorDetail(failure.data);
    return (
      `${name} ${failure.method} failed: ${failure.message}` +
      (detail ? ` (${detail})` : '') +
      ` [code ${failure.code}]`
    );
  };

  /** Run one request; a JSON-RPC error answer becomes an {@link AcpTurnFailure}. */
  const call = async <T>(
    method: AcpRequestMethod,
    run: () => Promise<T>,
    context: Pick<
      AcpRequestFailure,
      'configId' | 'configValue' | 'advertisedValues'
    > = {},
  ): Promise<T> => {
    try {
      return await run();
    } catch (error: unknown) {
      const rpc = readJsonRpcError(error);
      if (!rpc) throw error;
      logger?.warn('[AcpSessionHandle] ACP request failed', {
        ...logContext,
        method,
        code: rpc.code,
        message: rpc.message,
        detail: readAcpErrorDetail(rpc.data),
        ...context,
      });
      const failure = { method, ...rpc, ...context, options };
      const described = profile.describeError?.(failure);
      throw new AcpTurnFailure(
        described || genericFailure(failure),
        'request-failed',
        rpc.code,
        !!described,
      );
    }
  };

  /**
   * Re-attach to `resumeId`. The method is chosen from what the agent
   * advertised: the preferred one (`options.attachMethod`, default `resume`)
   * when offered, else the other one. `load` collects the replayed history.
   */
  const attachExistingSession = async (
    conn: AcpConnectionApi,
    init: InitializeResponse,
    resumeId: string,
    mcpServers: readonly McpServer[],
    target: Generation,
  ): Promise<
    | { ok: true; response: unknown }
    | { ok: false; reason: string }
  > => {
    const capabilities = init.agentCapabilities;
    const canResume = !!capabilities?.sessionCapabilities?.resume;
    const canLoad = capabilities?.loadSession === true;
    const preferred = options.attachMethod ?? 'resume';
    const offered = { resume: canResume, load: canLoad };
    const other = preferred === 'resume' ? 'load' : 'resume';
    const method = offered[preferred]
      ? preferred
      : offered[other]
        ? other
        : undefined;
    if (!method) {
      return { ok: false, reason: `${name} does not support resuming a session` };
    }

    const cwd = options.workingDirectory;
    attachingSessionId = resumeId;
    const collector =
      method === 'load'
        ? createAcpReplayCollector({
            contextId: budgetRunId,
            processGeneration: target.number,
            sessionId: resumeId,
          })
        : undefined;
    replayCollector = collector;
    try {
      logMcpRequest(`session/${method}`, mcpServers, resumeId);
      const response: unknown =
        method === 'resume'
          ? // mcpServers on resume too, or a resumed lane loses Ptah MCP (R7).
            await conn.resumeSession({
              sessionId: resumeId,
              cwd,
              mcpServers: [...mcpServers],
            })
          : await conn.loadSession({
              sessionId: resumeId,
              cwd,
              mcpServers: [...mcpServers],
            });
      // The first replay is the session's history; a respawn's re-load must not
      // replace it (a consumer that appended the first one would duplicate it).
      if (collector && !replayCaptured) {
        replay = collector.events();
        replayCaptured = true;
      }
      return { ok: true, response };
    } catch (error: unknown) {
      if (conn.signal.aborted || signal.aborted) throw error;
      const rpc = readJsonRpcError(error);
      const detail = rpc ? readAcpErrorDetail(rpc.data) : undefined;
      const reason = `${errorText(error)}${detail ? ` (${detail})` : ''}`;
      logger?.info('[AcpSessionHandle] session re-attach attempt failed', {
        ...logContext,
        attempt: method,
        code: rpc?.code,
        reason,
      });
      return { ok: false, reason };
    } finally {
      attachingSessionId = undefined;
      replayCollector = undefined;
      replayMapper.releaseTools();
    }
  };

  const configParams = (
    id: string,
    configId: string,
    value: string | boolean,
  ) =>
    typeof value === 'boolean'
      ? { sessionId: id, configId, type: 'boolean' as const, value }
      : { sessionId: id, configId, value };

  /** Write one config option; the response's options replace the advertised set. */
  const writeConfig = async (
    conn: AcpConnectionApi,
    id: string,
    configId: string,
    value: string | boolean,
    values: readonly string[],
  ): Promise<void> => {
    const response = await call(
      'session/set_config_option',
      () => conn.setSessionConfigOption(configParams(id, configId, value)),
      { configId, configValue: value, advertisedValues: values },
    );
    // A model change can narrow the other options (e.g. the effort list),
    // so later entries are validated against the updated set. The reply's
    // list is complete: an empty one removes every option (PR #1445 review).
    const updated = readAuthoritativeConfigOptions(response);
    if (updated) advertisedConfig = updated;
  };

  /**
   * Apply the profile's config entries (R6). An entry the profile marks
   * `binding` (e.g. the model) is always sent, advertised or not, and fails
   * the turn when rejected. Any other entry (e.g. the reasoning effort, whose
   * allowed values vary per model) is a hint, skipped with an info when the
   * setting or value is not advertised or when the agent rejects it.
   */
  const applySessionConfig = async (
    conn: AcpConnectionApi,
    id: string,
    sessionOptions: AcpSessionOptions,
  ): Promise<void> => {
    const entries: readonly AcpSessionConfigEntry[] =
      profile.sessionConfig?.(sessionOptions) ?? [];
    for (const entry of entries) {
      const binding = entry.binding === true;
      const option = advertisedConfig.find(
        (item) => item['id'] === entry.configId,
      );
      if (!option && !binding) {
        emitInfo(
          `${name} does not offer the "${entry.configId}" setting, so ${String(entry.value)} was not applied`,
        );
        continue;
      }
      const values = option ? advertisedValuesOf(option) : [];
      if (
        !binding &&
        typeof entry.value === 'string' &&
        values.length > 0 &&
        !values.includes(entry.value)
      ) {
        emitInfo(
          `${name} does not offer ${entry.value} for "${entry.configId}" (available: ${values.join(', ')}), so it was not applied`,
        );
        continue;
      }
      try {
        await writeConfig(conn, id, entry.configId, entry.value, values);
      } catch (error: unknown) {
        if (binding || !(error instanceof AcpTurnFailure)) throw error;
        emitInfo(
          `${error.message}; continuing without the "${entry.configId}" setting`,
        );
      }
    }
  };

  /** The advertised config option of a category (or with that id). */
  const optionFor = (
    category: 'mode' | 'model',
  ): Record<string, unknown> | undefined =>
    advertisedConfig.find(
      (item) => item['category'] === category || item['id'] === category,
    );

  /**
   * Set `mode` through `session/set_mode` when the session advertised it,
   * else through a `mode` config option. Returns whether it was applied; a
   * mode the agent does not offer, or a refusal, is an `info` (a hint).
   */
  const applyMode = async (
    conn: AcpConnectionApi,
    id: string,
    mode: string,
  ): Promise<boolean> => {
    try {
      if (advertisedModes.includes(mode)) {
        await call('session/set_mode', () =>
          conn.setSessionMode({ sessionId: id, modeId: mode }),
        );
      } else {
        const option = optionFor('mode');
        const values = option ? advertisedValuesOf(option) : [];
        if (!option || typeof option['id'] !== 'string' || !values.includes(mode)) {
          emitInfo(`${name} does not offer the "${mode}" mode, so it was not applied`);
          return false;
        }
        await writeConfig(conn, id, option['id'], mode, values);
      }
      emit({ type: 'modeChanged', mode });
      return true;
    } catch (error: unknown) {
      if (!(error instanceof AcpTurnFailure)) throw error;
      emitInfo(`${error.message}; continuing without the "${mode}" mode`);
      return false;
    }
  };

  /** `session/new`, with one `authenticate` retry on the ACP auth-required error. */
  const createSession = async (
    conn: AcpConnectionApi,
    init: InitializeResponse,
    mcpServers: readonly McpServer[],
  ): Promise<unknown> => {
    const create = (): Promise<unknown> => {
      logMcpRequest('session/new', mcpServers);
      const meta = profile.sessionMeta?.(options);
      return call('session/new', () =>
        conn.newSession({
          cwd: options.workingDirectory,
          mcpServers: [...mcpServers],
          ...(meta ? { _meta: meta } : {}),
        }),
      );
    };
    const authRequired = (error: unknown): error is AcpTurnFailure =>
      error instanceof AcpTurnFailure && error.rpcCode === ACP_AUTH_REQUIRED_CODE;
    const signInFailure = (error: AcpTurnFailure): AcpTurnFailure =>
      // The profile's own wording wins; otherwise name the sign-in step.
      new AcpTurnFailure(
        error.described
          ? error.message
          : `${name} is not signed in: ${profile.signInHint}`,
        'auth-required',
        error.rpcCode,
        error.described,
      );
    try {
      return await create();
    } catch (error: unknown) {
      if (!authRequired(error)) throw error;
      const method = profile.authMethod;
      if (!method || !advertisedAuthMethods(init).includes(method)) {
        throw signInFailure(error);
      }
      logger?.info('[AcpSessionHandle] authenticating after auth-required', {
        ...logContext,
        methodId: method,
      });
      try {
        await call('authenticate', () => conn.authenticate({ methodId: method }));
      } catch (authError: unknown) {
        throw authError instanceof AcpTurnFailure
          ? signInFailure(authError)
          : authError;
      }
      try {
        return await create();
      } catch (retryError: unknown) {
        // Only a second auth-required is a sign-in problem; any other failure
        // of the retried `session/new` keeps its own message (PR #1445 review).
        throw authRequired(retryError) ? signInFailure(retryError) : retryError;
      }
    }
  };

  /**
   * Handshake and session setup on the current generation. Returns whether
   * the prior context was restored. `resumeId` re-attaches to that session;
   * `attachFailure: 'error'` fails the setup when that is impossible.
   */
  const setUpSession = async (
    target: Generation,
    resumeId: string | undefined,
    attachFailure: 'new-session' | 'error',
  ): Promise<{ restoredContext: boolean }> => {
    const conn = await connectAcp(target.transport.stream, createHandlers(target));
    target.connection = conn;
    void conn.closed.then(() => onConnectionClosed(target));

    const initMeta = profile.initializeMeta?.(options);
    const init = await call('initialize', () =>
      conn.initialize({
        protocolVersion: ACP_REQUESTED_PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { ...ACP_CLIENT_INFO },
        ...(initMeta ? { _meta: initMeta } : {}),
      }),
    );
    target.init = init;
    const initRecord: unknown = init;
    logger?.info('[AcpSessionHandle] initialized', {
      ...logContext,
      protocolVersion: isRecord(initRecord)
        ? initRecord['protocolVersion']
        : undefined,
      mcpCapabilities: isRecord(initRecord)
        ? initRecord['mcpCapabilities']
        : undefined,
      generation: target.number,
    });
    const protocol = checkInitializeReply(initRecord);
    if (!protocol.ok) {
      throw new AcpTurnFailure(
        `${name} speaks ${protocol.reason}`,
        'protocol-unsupported',
      );
    }

    enterHandshakePhase?.('session');
    const mcpServers = profile.buildMcpServers(options);
    sentMcpServers = mcpServers.length > 0;
    let restoredContext = false;
    let response: unknown;
    let id: string | undefined;

    if (resumeId) {
      const attached = await attachExistingSession(
        conn,
        init,
        resumeId,
        mcpServers,
        target,
      );
      if (attached.ok) {
        id = resumeId;
        restoredContext = true;
        response = attached.response;
      } else if (attachFailure === 'error') {
        throw new AcpTurnFailure(
          `could not resume ${resumeId}: ${attached.reason}`,
          'resume-failed',
        );
      } else {
        emitInfo(
          `could not resume ${resumeId}: ${attached.reason}; started a new session`,
        );
      }
    }

    if (!id) {
      response = await createSession(conn, init, mcpServers);
      const createdId = isRecord(response) ? response['sessionId'] : undefined;
      if (typeof createdId !== 'string' || !createdId) {
        throw new AcpTurnFailure(`${name} did not return a session id`);
      }
      id = createdId;
    }
    advertisedConfig = readConfigOptions(response);
    advertisedModes = readModeIds(response);

    sessionId = id;
    // Reported before the config is applied on purpose: a refused config fails
    // the turn, but the session exists and stays resumable by this id.
    config.onSessionResolved?.(id);
    // A respawn re-applies what the agent last acknowledged (`setModel`,
    // `setMode`), not the values the session was opened with (PR #1445 review).
    await applySessionConfig(
      conn,
      id,
      acknowledgedModel === undefined
        ? options
        : { ...options, model: acknowledgedModel },
    );
    const mode = acknowledgedMode ?? profile.modeFor?.(options);
    if (mode) await applyMode(conn, id, mode);
    // `onSessionResolved` or the config writes may have aborted the session
    // or retired this process: setup did not succeed then (PR #1450 review).
    if (signal.aborted || !isLive(target)) {
      throw new AcpTurnFailure(
        `${name} was stopped during session setup`,
        'process-exited',
      );
    }
    setupComplete = true;
    return { restoredContext };
  };

  /**
   * Race the handshake against the deadline of its current phase
   * ({@link ACP_HANDSHAKE_TIMEOUTS_MS}). A phase change re-arms the timer;
   * the timer is always cleared.
   */
  const withHandshakeTimeout = async <T>(
    work: () => Promise<T>,
  ): Promise<T | typeof HANDSHAKE_TIMED_OUT> => {
    // After a timeout the abandoned handshake rejects once the kill closes the
    // connection. `Promise.race` subscribes to `work` synchronously below, so
    // that late rejection is already handled and never surfaces as unhandled.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expire: () => void = () => undefined;
    const timeout = new Promise<typeof HANDSHAKE_TIMED_OUT>((resolve) => {
      expire = () => resolve(HANDSHAKE_TIMED_OUT);
    });
    const arm = (phase: AcpHandshakePhase): void => {
      handshakePhase = phase;
      clearTimeout(timer);
      timer = setTimeout(expire, ACP_HANDSHAKE_TIMEOUTS_MS[phase]);
    };
    // The first phase is armed before the work starts, so the work's own
    // phase change (to `session`) always replaces it.
    arm('initialize');
    enterHandshakePhase = arm;
    try {
      return await Promise.race([work(), timeout]);
    } finally {
      enterHandshakePhase = undefined;
      clearTimeout(timer);
    }
  };

  /** Emit the one `error` event a failed turn gets. Always 1. */
  const reportFailure = async (error: unknown): Promise<number> => {
    if (signal.aborted) return 1;
    const target = gen;
    logger?.warn('[AcpSessionHandle] turn failed', {
      ...logContext,
      error: errorText(error),
      exit: target.exit,
    });
    if (error instanceof AcpTurnFailure) {
      emitError(error.message, error.code);
      return 1;
    }
    if (error instanceof AcpUnavailableError) {
      emitError(error.message, 'protocol-unsupported');
      return 1;
    }
    if (target.closed || target.connection?.signal.aborted) {
      // The child reports 'exit' before its stdout closes, so its exit is
      // normally known here; never wait for it.
      const exit =
        target.exit ??
        (await Promise.race([
          target.transport.exited,
          Promise.resolve(undefined),
        ]));
      emitError(
        exit
          ? `${name} exited (${describeExit(exit)}) during the turn`
          : `${name} closed the ACP connection during the turn`,
        'process-exited',
      );
      return 1;
    }
    emitError(`${name} ACP request failed: ${errorText(error)}`);
    return 1;
  };

  /** Run the handshake on the current generation; on failure stop it. */
  const runSetup = async (
    resumeId: string | undefined,
    attachFailure: 'new-session' | 'error',
  ): Promise<AcpSessionStart> => {
    const target = gen;
    if (signal.aborted) {
      stopProcess(target);
      return { ok: false };
    }
    try {
      const outcome = await withHandshakeTimeout(() =>
        setUpSession(target, resumeId, attachFailure),
      );
      if (outcome === HANDSHAKE_TIMED_OUT) {
        if (!signal.aborted) {
          emitError(
            `${name} did not complete the ACP handshake (${HANDSHAKE_PHASE_LABEL[handshakePhase]}) in ${ACP_HANDSHAKE_TIMEOUTS_MS[handshakePhase] / 1000} s`,
            'handshake-timeout',
          );
        }
        stopProcess(target);
        return { ok: false };
      }
      return { ok: true, restoredContext: outcome.restoredContext };
    } catch (error: unknown) {
      // A session whose setup failed can take no prompt (a refused model must
      // not silently fall back to the default one), so the child goes too.
      await reportFailure(error);
      stopProcess(target);
      return { ok: false };
    }
  };

  /** Spawn the next generation and re-attach to the session (chat respawn). */
  const respawn = async (): Promise<boolean> => {
    const previous = sessionId;
    if (!previous) return false;
    logger?.info('[AcpSessionHandle] respawning the agent process', {
      ...logContext,
      generation: gen.number + 1,
    });
    setupComplete = false;
    // A retired process that has not exited yet must not outlive its successor.
    stopProcess(gen);
    mapper.releaseTools();
    gen = spawnGeneration(gen.number + 1);
    const setup = await runSetup(previous, 'error');
    return setup.ok;
  };

  /**
   * One accepted prompt. Every path, including a failed respawn, a missing
   * session and a prompt after abort, ends with exactly one `terminal`.
   */
  const runPromptTurn = async (text: string): Promise<number> => {
    // Allocated first, so a respawn failure's error carries the turn id too.
    const turnId = `${sessionId ?? budgetRunId}:${budgetRunId}:${++promptSequence}`;
    currentTurnId = turnId;
    latestUpdateUsage = undefined;
    turnCancelledByPtah = false;
    refusedThisTurn = undefined;
    // Tools of an earlier turn that never finished are abandoned.
    mapper.releaseTools();
    let target = gen;
    let exitCode = 1;
    let timedOut = false;
    /** The turn ended before `session/prompt`: the session cannot take it. */
    let notStarted = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      if (signal.aborted) {
        notStarted = true;
        return 1;
      }
      // A retired generation (the watchdog fired, a kill is under way) takes
      // no prompt even while its process is still alive (PR #1445 review).
      if (!isLive(gen) && config.respawnOnPrompt && sessionId) {
        const respawned = await respawn();
        target = gen;
        if (!respawned) {
          notStarted = true;
          return 1;
        }
      }
      const conn = target.connection;
      const id = sessionId;
      if (setupComplete && target.retired && !target.closed && !signal.aborted) {
        notStarted = true;
        emitError(
          `${name} is being stopped after an earlier turn failed; resume the session to continue`,
          'process-exited',
        );
        return 1;
      }
      if (!conn || !id || !setupComplete || signal.aborted) {
        notStarted = true;
        // After an abort the abort is the cause; no misleading error.
        if (!signal.aborted) emitError(`${name} has no ACP session to prompt`);
        return 1;
      }
      promptInFlight = true;
      const approvals = new AbortController();
      turnApprovals = approvals;
      const limit = options.promptTimeoutMs;
      if (limit !== undefined && limit > 0) {
        watchdog = setTimeout(() => {
          timedOut = true;
          turnCancelledByPtah = true;
          // This process is going to be killed: no later prompt may use it.
          target.retired = true;
          approvals.abort();
          emitError(
            `${name} did not finish the turn within ${limit / 1000} s`,
            'prompt-timeout',
          );
          const settled = promptSettled;
          void cancelPrompt(target, conn, id).then((sent) =>
            sent
              ? stopAfterGrace(target, ACP_CANCEL_GRACE_MS, settled)
              : undefined,
          );
        }, limit);
        watchdog.unref?.();
      }
      const response: unknown = await call('session/prompt', () =>
        conn.prompt({ sessionId: id, prompt: [{ type: 'text', text }] }),
      );
      // The answer is in: the watchdog can no longer fire during the usage drain.
      clearTimeout(watchdog);
      if (dropStale(target, 'session/prompt reply')) return 1;
      // A reply that raced the watchdog stays failed: its error is already out.
      if (timedOut) return 1;
      const stopReason =
        isRecord(response) && typeof response['stopReason'] === 'string'
          ? response['stopReason']
          : 'missing';
      const mapped = mapStopReason({
        stopReason,
        aborted: signal.aborted || turnCancelledByPtah,
        refusedPermissionTitle: refusedThisTurn,
        displayName: name,
      });
      if (mapped.exitCode === 0) {
        const meta = isRecord(response) ? response['_meta'] : undefined;
        const rawUsage = isRecord(meta) ? meta['usage'] : undefined;
        const promptUsage = acpPromptUsageSchema.safeParse(rawUsage);
        if (!promptUsage.success && !latestUpdateUsage) {
          // ACP agents can send usage_update after the prompt response. Wait
          // for that notification, with a safety bound for agents omitting it.
          let usageDrainTimer: NodeJS.Timeout | undefined;
          const onDrainAbort = (): void => {
            resolveUsageUpdate?.();
          };
          try {
            await new Promise<void>((resolve) => {
              usageDrainTimer = setTimeout(resolve, ACP_USAGE_DRAIN_MS);
              usageDrainTimer.unref();
              resolveUsageUpdate = resolve;
              signal.addEventListener('abort', onDrainAbort, { once: true });
              if (latestUpdateUsage || signal.aborted) resolve();
            });
          } finally {
            clearTimeout(usageDrainTimer);
            signal.removeEventListener('abort', onDrainAbort);
            resolveUsageUpdate = undefined;
          }
        }
        const usage = promptUsage.success ? promptUsage.data : latestUpdateUsage;
        emit({ type: 'usage', provider: name, turnId, usage });
      }
      if (mapped.segment?.type === 'error') {
        emitError(mapped.segment.content);
      } else if (mapped.segment) {
        emitInfo(mapped.segment.content);
      }
      exitCode = mapped.exitCode;
      return exitCode;
    } catch (error: unknown) {
      if (timedOut || dropStale(target, 'session/prompt failure')) return 1;
      return await reportFailure(error);
    } finally {
      clearTimeout(watchdog);
      if (target === gen) {
        emit({
          type: 'terminal',
          status:
            exitCode === 0
              ? 'completed'
              : (signal.aborted || turnCancelledByPtah) && !timedOut
                ? 'interrupted'
                : 'failed',
          // A retired process (a failed cancel write, a kill-style interrupt)
          // takes no further prompt even while it has not exited yet.
          disposition:
            target.closed || target.retired || timedOut || notStarted
              ? 'broken'
              : 'reusable',
        });
      }
      promptInFlight = false;
      turnApprovals = undefined;
      currentTurnId = undefined;
      resolveUsageUpdate = undefined;
      latestUpdateUsage = undefined;
      refusedThisTurn = undefined;
      turnCancelledByPtah = false;
    }
  };

  /** A prompt was accepted and has not settled (covers a respawn before it). */
  let turnAccepted = false;
  const prompt = (text: string): Promise<number> => {
    if (turnAccepted) {
      // Overlapping prompts would share one turn's state (PR #1444 review).
      return Promise.reject(
        new Error(`${name} is still running a turn; wait for it before prompting again`),
      );
    }
    turnAccepted = true;
    const pending = runPromptTurn(text).finally(() => {
      turnAccepted = false;
    });
    promptSettled = pending;
    return pending;
  };

  const cancelBehavior = profile.cancelBehavior ?? 'kill';

  const interrupt = async (): Promise<boolean> => {
    const target = gen;
    const conn = target.connection;
    const id = sessionId;
    const settled = promptSettled;
    if (!promptInFlight || !conn || !id || !settled || !isLive(target) || signal.aborted) {
      return false;
    }
    turnCancelledByPtah = true;
    // ACP: the client answers its pending permission requests `cancelled` when
    // it cancels; an agent waiting on one would never answer the cancel.
    turnApprovals?.abort();
    if (pendingApprovals.size > 0) {
      await Promise.allSettled([...pendingApprovals]);
      // Let the SDK write the answers before the cancel notification.
      await new Promise<void>((resolve) => setImmediate(resolve));
      // The turn may have ended meanwhile; a late cancel would hit the next one.
      if (promptSettled !== settled || !promptInFlight) return true;
    }
    // A kill-style agent is stopped after this cancel: reserve the process
    // for shutdown before anything is awaited, so a prompt sent once the
    // cancelled turn settles cannot land on it (PR #1450 review).
    if (cancelBehavior === 'kill') target.retired = true;
    // Bounded: a cancel that fails or stalls behind a pending write has
    // already stopped the agent.
    if (!(await cancelPrompt(target, conn, id))) return false;
    if (cancelBehavior === 'kill') {
      await stopAfterGrace(target, ACP_CANCEL_GRACE_MS, settled);
      return false;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>((resolve) => {
      timer = setTimeout(() => resolve('late'), ACP_INTERRUPT_REPLY_TIMEOUT_MS);
    });
    try {
      const outcome = await Promise.race([
        settled.then(() => 'answered' as const),
        target.transport.exited.then(() => 'exited' as const),
        late,
      ]);
      if (outcome === 'answered' && !target.closed) return true;
      logger?.warn('[AcpSessionHandle] the agent did not answer the cancelled turn', {
        ...logContext,
        outcome,
      });
      stopProcess(target);
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const setModeOnSession = async (mode: string): Promise<boolean> => {
    const conn = gen.connection;
    if (!conn || !sessionId || !setupComplete || !isLive(gen)) return false;
    const applied = await applyMode(conn, sessionId, mode);
    if (applied) acknowledgedMode = mode;
    return applied;
  };

  const setModel = async (model: string): Promise<boolean> => {
    const conn = gen.connection;
    const id = sessionId;
    if (!conn || !id || !setupComplete || !isLive(gen)) return false;
    const option = optionFor('model');
    const configId = typeof option?.['id'] === 'string' ? option['id'] : 'model';
    try {
      await writeConfig(conn, id, configId, model, option ? advertisedValuesOf(option) : []);
      acknowledgedModel = model;
      emit({ type: 'configChanged' });
      return true;
    } catch (error: unknown) {
      if (!(error instanceof AcpTurnFailure)) throw error;
      emitError(error.message, error.code);
      return false;
    }
  };

  /**
   * The first generation's setup, shared by every `start()` call: a second
   * concurrent setup would open another SDK connection on the same byte
   * stream and fail on its locked reader (PR #1445 review). A respawn runs
   * its own setup.
   */
  let initialSetup: Promise<AcpSessionStart> | undefined;

  return {
    start: () =>
      (initialSetup ??= runSetup(
        options.resumeSessionId,
        options.attachFailure ?? 'new-session',
      )),
    prompt,
    interrupt,
    supportsInterrupt: () =>
      cancelBehavior === 'await-reply' &&
      setupComplete &&
      isLive(gen) &&
      !signal.aborted,
    setMode: setModeOnSession,
    setModel,
    get exited() {
      return gen.transport.exited;
    },
    isClosed: () => !isLive(gen),
    isSetupComplete: () => setupComplete,
    // A respawn before `session/prompt` is part of the turn too.
    isTurnRunning: () => promptInFlight || turnAccepted,
    getSessionId: () => sessionId,
    attachedMcpServers: () => sentMcpServers,
    getPid: () => gen.transport.getPid(),
    getProcessGeneration: () => gen.number,
    getReplay: () => replay,
  };
}
