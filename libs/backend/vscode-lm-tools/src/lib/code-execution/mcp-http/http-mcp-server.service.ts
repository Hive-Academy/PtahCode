/**
 * Code Execution MCP Server
 *
 * HTTP MCP server providing "execute_code" and "approval_prompt" tools for Claude CLI.
 * Implements JSON-RPC 2.0 protocol over HTTP transport.
 *
 * This is a thin orchestrator that delegates to specialized handlers:
 * - http-server.handler: HTTP server lifecycle and request handling
 * - protocol-handlers: MCP JSON-RPC protocol implementation
 * - code-execution.engine: TypeScript code execution with timeout
 * - approval-prompt.handler: User permission flow via webview
 * - tool-description.builder: Tool definitions and descriptions
 *
 * Pattern: Injectable service with HTTP server lifecycle
 *
 * ## No MCP config file is written (TASK_2026_979_9e1f, decision 10)
 *
 * This service used to declare its own server as a `ptah` entry in
 * `{ws}/.mcp.json`, `{ws}/.cursor/mcp.json` and a Codex `config.toml` for every
 * open folder. It writes none of them now. Every session and lane Ptah starts
 * gets `ptah` in its own spawn config: a Claude SDK session through
 * `Options.mcpServers` (`SdkQueryOptionsBuilder.buildMcpServers`), every other
 * CLI through its adapter's per-spawn config. A CLI the user starts outside
 * Ptah no longer gets Ptah's server. Entries an earlier Ptah wrote stay on disk
 * (D-U5 Option 1), and their persisted token hashes keep authorizing them.
 */

import * as http from 'http';
import * as path from 'path';
import { injectable, inject } from 'tsyringe';
import { TOKENS, Logger, hangBreadcrumbs } from '@ptah-extension/vscode-core';
import type { WebviewManager } from '@ptah-extension/vscode-core';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import type {
  IArtifactStore,
  IWorkspaceProvider,
  IStateStorage,
  IDisposable,
  IMcpServerStatus,
  IMcpCallerCredentials,
  IMcpGateway,
  IMcpSubagentRootRegistrar,
  IUserInteraction,
  McpCallerBinding,
  McpSubagentRootRetention,
} from '@ptah-extension/platform-core';
import {
  PtahAPIBuilder,
  IDE_CAPABILITIES_TOKEN,
} from '../ptah-api-builder.service';
import { type IIDECapabilities } from '../namespace-builders';
import { PermissionPromptService } from '../../permission/permission-prompt.service';
import { PtahAPI } from '../types';
import { handleMCPRequest, type ToolResultCallback } from '../mcp-core';
import type { ArtifactNotification } from '../mcp-core/artifact-tool-handlers';
import { killRunningChecks } from '../mcp-core/run-check.tool';
import {
  TreeSitterCodeOutliner,
  type OutlineQueryRunner,
} from '../mcp-core/code-outliner.adapter';
import type { CodeOutliner } from '@ptah-extension/tool-output-reducers';
import { CLI_AGENT_RUNTIME_TOKENS, type ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import {
  HARNESS_SYNC_TOKENS,
  type IHarnessCliDetector,
} from '@ptah-extension/harness-sync';
import {
  startHttpServer,
  stopHttpServer,
  getConfiguredPort,
} from './http-server.handler';
import { sweepRetiredPtahMcpEntries } from './retired-ptah-mcp-slots';
import { McpNotificationHub } from './mcp-notification-hub';
import { buildToolDefinitions } from '../mcp-core/effective-tool-list';
import { McpCallerTokenRegistry } from './mcp-caller-token-registry';
import {
  parseExternalCallerAccess,
  type McpExternalAccess,
} from '../mcp-core/mcp-caller-auth.types';

/** Host callback for metadata-only artifact pushes. Registered by Electron. */
export const ARTIFACT_NOTIFICATION_TOKEN = Symbol('ArtifactNotification');

/** Why a session cannot be told that Ptah's server is reachable. */
export type McpRegistrationFailure =
  /** The HTTP server is not running, or is being torn down. */
  'not-started';

/**
 * The outcome of {@link CodeExecutionMCP.ensureRegisteredForSubagents}.
 *
 * A readiness answer, not a write result: it is true exactly when the HTTP
 * server is up. Callers AND it into the `mcpServerRunning` they pass to the
 * session they start, which then carries `ptah` in its own spawn config.
 */
export interface McpSubagentRegistration {
  /** True when the HTTP server is running and not being torn down. */
  registered: boolean;
  /** Present exactly when `registered` is false. */
  reason?: McpRegistrationFailure;
}

const REGISTERED: McpSubagentRegistration = { registered: true };

/**
 * How long a chat start waits for a queued retired-entry sweep before it goes
 * on. The sweep keeps running in the background past it; readiness does not
 * depend on it.
 */
export const MCP_CHAT_REGISTRATION_DEADLINE_MS = 3000;

/**
 * Duplicated from SDK_TOKENS.SDK_SESSION_LIFECYCLE_MANAGER (agent-sdk) to avoid
 * a vscode-lm-tools -> agent-sdk dependency. Keep the string in sync.
 */
const SDK_SESSION_LIFECYCLE_MANAGER = Symbol.for('SdkSessionLifecycleManager');

/** The one lifecycle-manager read the artifact publish scope needs. */
interface SessionWorkspaceReader {
  getSessionWorkspace(idOrTabId: string): string | undefined;
  find(idOrTabId: string): { tabId: string } | undefined;
}

function notRegistered(
  reason: McpRegistrationFailure,
): McpSubagentRegistration {
  return { registered: false, reason };
}

export interface IMcpExternalCallerAccessUpdater {
  applyExternalCallerAccess(access: McpExternalAccess): Promise<void>;
}

@injectable()
export class CodeExecutionMCP
  implements
    IDisposable,
    IMcpServerStatus,
    IMcpSubagentRootRegistrar,
    IMcpCallerCredentials,
    IMcpExternalCallerAccessUpdater
{
  private server: http.Server | null = null;
  private port: number | null = null;
  private readonly ptahAPI: PtahAPI;
  private toolResultCallback: ToolResultCallback | undefined;

  /**
   * The tail of the operation queue. The retired-entry sweep and the
   * external-access update join it, so neither interleaves with the other,
   * and `stop()` joins it so no sweep runs past the socket close.
   */
  private mcpOpQueue: Promise<void> = Promise.resolve();

  /** A retired-entry sweep that is queued and has NOT started. */
  private queuedSweep: Promise<void> | null = null;

  /**
   * True when the next chat start should sweep retired entries: after
   * `start()` and after a workspace-folder change. A folder event only sets
   * the flag, so opening a folder never touches disk on its own (Bug #9).
   */
  private sweepDue = true;

  /**
   * True between `stop()` and the next `start()`. A sweep queued before the
   * stop and run after it is dropped.
   */
  private stopped = false;

  private readonly workspaceFoldersSubscription: IDisposable;

  private readonly hasIDECapabilities: boolean;
  private readonly hasSqliteLayer: boolean;
  private readonly codeOutliner: CodeOutliner | undefined;
  private readonly callerCredentials: McpCallerTokenRegistry;
  /** Open GET SSE streams; present only when a gateway is bound. */
  private readonly notificationHub: McpNotificationHub | undefined;
  private readonly gatewayToolsSubscription: IDisposable | undefined;

  constructor(
    @inject(TOKENS.PTAH_API_BUILDER)
    private readonly apiBuilder: PtahAPIBuilder,

    @inject(TOKENS.LOGGER)
    private readonly logger: Logger,

    @inject(PLATFORM_TOKENS.WORKSPACE_STATE_STORAGE)
    private readonly workspaceState: IStateStorage,

    @inject(PLATFORM_TOKENS.WORKSPACE_PROVIDER)
    private readonly workspaceProvider: IWorkspaceProvider,

    @inject(TOKENS.PERMISSION_PROMPT_SERVICE)
    private readonly permissionPromptService: PermissionPromptService,

    @inject(TOKENS.WEBVIEW_MANAGER, { isOptional: true })
    private readonly webviewManager: WebviewManager | undefined,

    @inject(IDE_CAPABILITIES_TOKEN, { isOptional: true })
    ideCapabilities: IIDECapabilities | undefined,

    /**
     * Which rival CLIs are installed, used to gate the retired-entry sweep
     * (it runs only where `agy` is detected).
     *
     * Optional so a bare container still starts a server; absent means the
     * sweep touches no file. All three hosts register
     * `HARNESS_SYNC_TOKENS.CLI_DETECTOR` during DI setup, and this class is a
     * lazily-constructed singleton resolved when the server starts.
     */
    @inject(HARNESS_SYNC_TOKENS.CLI_DETECTOR, { isOptional: true })
    private readonly cliDetector: IHarnessCliDetector | undefined,

    /**
     * The host's shared tree-sitter parser (the one `PtahAPIBuilder` uses),
     * wrapped as the tool-result budget's code outliner. Optional: without it
     * over-budget code falls back to the log reducer and the cut.
     */
    @inject(TOKENS.TREE_SITTER_PARSER_SERVICE, { isOptional: true })
    treeSitterParser?: OutlineQueryRunner,

    @inject(PLATFORM_TOKENS.ARTIFACT_STORE, { isOptional: true })
    private readonly artifactStore?: IArtifactStore,

    @inject(ARTIFACT_NOTIFICATION_TOKEN, { isOptional: true })
    private readonly notifyArtifactPublished?: ArtifactNotification,

    /** Strict caller-session workspace lookup for artifact publishing. */
    @inject(SDK_SESSION_LIFECYCLE_MANAGER, { isOptional: true })
    private readonly sessionWorkspaces?: SessionWorkspaceReader,

    /**
     * Host-global state for persistent credential hashes. Optional so a unit
     * test that constructs the service positionally keeps compiling; absent
     * means hashes live only for this process.
     */
    @inject(PLATFORM_TOKENS.STATE_STORAGE, { isOptional: true })
    globalState?: IStateStorage,

    /** Once-per-process grace notice. CLI and tests may omit it. */
    @inject(PLATFORM_TOKENS.USER_INTERACTION, { isOptional: true })
    legacyNotice?: IUserInteraction,
    @inject(CLI_AGENT_RUNTIME_TOKENS.EXTERNAL_COMPLETION_OUTBOX, { isOptional: true })
    private readonly completionOutbox?: ExternalCompletionOutbox,
    /**
     * The user's own MCP servers served through `ptah`. Optional: a host
     * without auth secrets binds none, and the server then lists, calls and
     * advertises exactly Ptah's own tools.
     */
    @inject(PLATFORM_TOKENS.MCP_GATEWAY, { isOptional: true })
    private readonly gateway?: IMcpGateway,
  ) {
    this.codeOutliner =
      treeSitterParser === undefined
        ? undefined
        : new TreeSitterCodeOutliner(treeSitterParser);
    this.hasIDECapabilities = ideCapabilities !== undefined;
    this.hasSqliteLayer = this.apiBuilder.hasSymbolAndMemoryLayer();
    this.ptahAPI = this.apiBuilder.build();
    this.callerCredentials = new McpCallerTokenRegistry({
      ...(globalState === undefined ? {} : { state: globalState }),
      logger: this.logger,
      externalCallerAccess: this.externalCallerAccess(),
      ...(legacyNotice === undefined ? {} : { notice: legacyNotice }),
      onExclusiveOwnerRevoked: (owner) => { this.completionOutbox?.discardOwner(owner); },
    });
    // A changed folder set can bring a retired entry into view; the next chat
    // start sweeps it. Nothing is written from the event itself.
    this.workspaceFoldersSubscription =
      this.workspaceProvider.onDidChangeWorkspaceFolders(() => {
        this.sweepDue = true;
      });
    const hub =
      this.gateway === undefined
        ? undefined
        : new McpNotificationHub({ logger: this.logger });
    this.notificationHub = hub;
    this.gatewayToolsSubscription =
      hub === undefined
        ? undefined
        : this.gateway?.onToolsChanged(() => hub.notifyToolsChanged());
  }

  /**
   * Run `job` after every operation already queued on this instance.
   *
   * Mirrors `harness-sync`'s `serializeByKey`: the chain is kept alive past a
   * rejection so one failed operation cannot poison the next one.
   */
  private enqueueMcpOp<T>(job: () => Promise<T>): Promise<T> {
    const run = this.mcpOpQueue.then(job, job);
    this.mcpOpQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Start HTTP MCP server on configured localhost port (default: 51820)
   * Stores port in workspace state for Claude CLI discovery
   */
  async start(): Promise<number> {
    if (this.server) {
      this.logger.warn('CodeExecutionMCP already started', 'CodeExecutionMCP');
      return this.port as number;
    }

    // A restart re-arms the sweep that `stop()` disabled.
    this.stopped = false;
    this.sweepDue = true;

    const configuredPort = getConfiguredPort(this.workspaceProvider);

    // Every name Ptah serves itself, so `isGatewayTool` treats only the rest
    // as third-party. The same superset the dispatcher's collision filter uses.
    this.gateway?.registerHostToolNames(
      buildToolDefinitions({ hasIDECapabilities: true }).map((tool) => tool.name),
    );

    const result = await startHttpServer({
      port: configuredPort,
      logger: this.logger,
      workspaceState: this.workspaceState,
      authenticate: (input) => this.callerCredentials.authorize(input),
      isExclusiveOwnerActive: (owner) => this.callerCredentials.isExclusiveOwnerActive(owner),
      completionOutbox: this.completionOutbox,
      notificationHub: this.notificationHub,
      onMCPRequest: (request) =>
        handleMCPRequest(request, {
          ptahAPI: this.ptahAPI,
          artifactStore: this.artifactStore,
          notifyArtifactPublished: this.notifyArtifactPublished,
          getSessionWorkspace: (id) =>
            this.sessionWorkspaces?.getSessionWorkspace(id),
          getSessionTabId: (id) => this.sessionWorkspaces?.find(id)?.tabId,
          permissionPromptService: this.permissionPromptService,
          webviewManager: this.webviewManager,
          logger: this.logger,
          onToolResult: this.toolResultCallback,
          hasIDECapabilities: this.hasIDECapabilities,
          hasSqliteLayer: this.hasSqliteLayer,
          codeOutliner: this.codeOutliner,
          workspaceProvider: this.workspaceProvider,
          disabledMcpNamespaces:
            this.workspaceProvider.getConfiguration<string[]>(
              'ptah',
              'agentOrchestration.disabledMcpNamespaces',
              [],
            ) ?? [],
          resolveOutcomeReport: () =>
            typeof this.apiBuilder.outcomeReportDependencies === 'function'
              ? this.apiBuilder.outcomeReportDependencies()
              : undefined,
          hangBreadcrumbs,
          gateway: this.gateway,
        }),
    });

    this.server = result.server;
    this.port = result.port;

    return this.port;
  }

  /**
   * Tell a session starter whether Ptah's server is reachable. Callers AND the
   * answer into the `mcpServerRunning` they pass to the session, which then
   * carries `ptah` in its own spawn config (a Claude SDK session through
   * `Options.mcpServers`). No config file is written.
   *
   * Never rejects. `registered: false` with `not-started` means the server is
   * down or stopping, and the session must start without Ptah tools.
   *
   * The first call after `start()` or after a workspace-folder change also
   * runs the retired-entry sweep (see {@link removeRetiredEntries}), waiting
   * for it at most {@link MCP_CHAT_REGISTRATION_DEADLINE_MS}. The answer does
   * not depend on the sweep.
   */
  async ensureRegisteredForSubagents(): Promise<McpSubagentRegistration> {
    if (this.stopped || !this.port) return notRegistered('not-started');
    if (this.sweepDue) await this.waitForSweep(this.queueRetiredSweep());
    return REGISTERED;
  }

  /**
   * Whether a session in `root` gets Ptah's server (IMcpSubagentRootRegistrar).
   * A readiness answer: true when the server is up, because the session gets
   * `ptah` in its own spawn config. Nothing is written or retained, so
   * {@link releaseRoot} has nothing to give back.
   */
  async retainRoot(root: string): Promise<McpSubagentRootRetention> {
    if (root.trim() === '' || !path.isAbsolute(root)) {
      return { registered: false, reason: 'invalid-root' };
    }
    if (this.stopped || !this.port) {
      return { registered: false, reason: 'not-started' };
    }
    return REGISTERED;
  }

  /** Nothing is retained by {@link retainRoot}, so a release changes nothing. */
  releaseRoot(_root: string): Promise<void> {
    return Promise.resolve();
  }

  /** One queued sweep serves every chat start that arrives before it runs. */
  private queueRetiredSweep(): Promise<void> {
    if (this.queuedSweep) return this.queuedSweep;
    this.sweepDue = false;
    const run: Promise<void> = this.enqueueMcpOp(async () => {
      if (this.queuedSweep === run) this.queuedSweep = null;
      // `stop()` arrived while this sweep was queued.
      if (this.stopped) return;
      await this.removeRetiredEntries();
    });
    this.queuedSweep = run;
    return run;
  }

  /** Wait for `sweep`, but no longer than the chat deadline. */
  private async waitForSweep(sweep: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.logger.warn(
          '[CodeExecutionMCP] Retired MCP entry sweep exceeded the chat deadline; it continues in the background',
          'CodeExecutionMCP',
        );
        resolve();
      }, MCP_CHAT_REGISTRATION_DEADLINE_MS);
    });
    try {
      await Promise.race([sweep, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Take back the `ptah` entries an earlier Ptah wrote into Antigravity config
   * files (TASK_2026_2297): the persistent slots and any entry a stream-json
   * lane of an older build left behind. Drop their credentials too.
   * Kept as is under D-U5 Option 1, including its linked-worktree skip.
   * It never rejects: failures are logged and retried by the next sweep.
   * See `retired-ptah-mcp-slots.ts`.
   */
  private removeRetiredEntries(): Promise<void> {
    return sweepRetiredPtahMcpEntries({
      workspaceRoots: [
        ...this.workspaceProvider.getWorkspaceFolders(),
        this.workspaceProvider.getWorkspaceRoot() ?? '',
      ],
      isInstalled: (target) =>
        this.cliDetector?.isInstalled(target) ?? Promise.resolve(false),
      revokeCredential: (configPath) =>
        this.callerCredentials.revokePersistent(configPath),
      logger: this.logger,
    });
  }

  /**
   * Stop MCP server and clean up resources.
   *
   * The stopped flag drops a sweep that is still queued. Ephemeral lane and
   * session credentials are revoked immediately.
   */
  async stop(): Promise<void> {
    // Lane tokens die with the server. Persistent hashes stay, so an entry an
    // earlier Ptah wrote keeps its token across a restart (M1, D-U5 Option 1).
    this.callerCredentials.revokeEphemeral();
    this.stopped = true;

    // Join the queue so a running sweep finishes before the socket closes.
    await this.enqueueMcpOp(() => Promise.resolve());

    // Open SSE streams would keep `server.close` waiting forever.
    this.notificationHub?.closeAll();
    await stopHttpServer(this.server, this.workspaceState, this.logger);
    this.server = null;
    this.port = null;
  }

  /**
   * Get current server port (for testing)
   */
  getPort(): number | null {
    return this.port;
  }

  /** In-memory lane or session token. Not written to a config file or to state. */
  issue(binding: McpCallerBinding, subject: string, ttlMs: number): string {
    return this.callerCredentials.issue(binding, subject, ttlMs);
  }

  /** Drop in-memory tokens for `subject`. Persistent slot hashes stay. */
  revokeSubject(subject: string): void {
    this.callerCredentials.revokeSubject(subject);
  }

  /** Update live persistent capabilities without rotating any token. */
  async applyExternalCallerAccess(
    access: McpExternalAccess,
  ): Promise<void> {
    this.callerCredentials.clampExternalCallerAccess(access);
    await this.enqueueMcpOp(() =>
      this.callerCredentials.applyExternalCallerAccess(this.externalCallerAccess()),
    );
  }


  private externalCallerAccess(): 'read-only' | 'full' {
    return parseExternalCallerAccess(
      this.workspaceProvider.getConfiguration(
        'ptah',
        'mcp.externalCallerAccess',
        'read-only',
      ),
    );
  }


  /**
   * Set callback for tool result notifications.
   * Used by agentic analysis to stream tool results to the frontend.
   */
  setToolResultCallback(callback: ToolResultCallback): void {
    this.toolResultCallback = callback;
  }

  /**
   * Clear the tool result callback.
   */
  clearToolResultCallback(): void {
    this.toolResultCallback = undefined;
  }

  /**
   * Dispose of server resources (IDisposable contract — synchronous).
   *
   * Prefer disposeAsync() when the caller can await cleanup. This sync form
   * kicks off stop() and surfaces any teardown error to the logger instead
   * of silently swallowing it (which is what happened when dispose() simply
   * called this.stop() without handling the returned promise).
   */
  dispose(): void {
    this.disposeAsync().catch((error) => {
      this.logger.error(
        '[CodeExecutionMCP] Error during dispose',
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  }

  /**
   * Async dispose — await this when the caller can wait for HTTP server
   * shutdown to complete before proceeding (e.g., during app quit).
   */
  async disposeAsync(): Promise<void> {
    this.workspaceFoldersSubscription.dispose();
    this.gatewayToolsSubscription?.dispose();
    // A `run_check` in flight owns an Nx process tree that would outlive the
    // host. Fail-open: a kill failure must not stop the server teardown.
    try {
      await killRunningChecks();
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn; teardown continues.
      this.logger.warn('[CodeExecutionMCP] Killing running checks failed', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    await this.stop();
    // Here and not in `stop()`: a stop can be followed by another start, and
    // `IMcpGateway.dispose()` is terminal. It stops every stdio server's
    // process tree, which a host exit does not reap on Windows; awaited so a
    // caller that waits for this teardown also waits for those kills. It
    // never rejects.
    await this.gateway?.dispose();
  }
}
