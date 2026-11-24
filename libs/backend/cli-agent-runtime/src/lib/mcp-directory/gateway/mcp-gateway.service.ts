/**
 * `McpGateway`: the hub that serves the user's own MCP servers through Ptah's
 * single `ptah` MCP server ({@link IMcpGateway}).
 *
 * ## What is served
 *
 * Per workspace root: {@link GatewayServerSources} (connectors, intents, file
 * servers, deduped and project-approved), minus every server the capability
 * policy turns off for that root (`isMcpServerEnabled`, so an `unverified`
 * policy serves nothing), minus any entry named `ptah` (Ptah's own server,
 * e.g. a retired slot file, must never be proxied through itself). Aliases are
 * assigned per root; the reverse map (`name -> upstream tool`) is per root.
 *
 * ## Caller policy (Hub 6)
 *
 * `listTools`, `callTool` and `status` apply `isGatewayCallerPermitted`
 * (platform-core, shared with the dispatcher's early skip) first. A scope without a `workspaceRoot` gets nothing: the deny list and the
 * project approvals cannot be read without one, so it fails closed.
 *
 * ## Cold start (Hub 3, S6)
 *
 * A server with no tool list yet is `pending`. The first list that sees it
 * awaits every such server together, bounded by one
 * {@link GATEWAY_COLD_START_BUDGET_MS} budget. A server still loading at the
 * deadline is omitted with detail `tools/list timed out after 12s` and keeps
 * loading; when it lands, `onToolsChanged` fires. Only the first completed
 * wait per server counts (one the caller aborted does not); later lists serve
 * the last good list and refresh in the background.
 *
 * ## Pre-warm (M5)
 *
 * When the first `onToolsChanged` listener subscribes (the HTTP MCP server's
 * start), the gateway resolves the `prewarmRoots` roots and starts loading
 * their servers on the next macrotask, so the first session or cron run finds
 * the lists loaded or in flight instead of paying the cold wait. It never
 * blocks the subscriber, runs once per gateway, and only logs a failure.
 * Pre-warm loads remote servers only: a stdio server starts on its root's
 * first list or call (S2), so boot spawns no process in every open folder.
 *
 * ## Stdio servers (C10)
 *
 * A `stdio` endpoint gets its client from {@link StdioServerHost} instead of
 * the HTTP client factory, so it shares every state, back-off and naming rule
 * below. The host adds its own restart cap and idle shutdown; a connected
 * stdio server's list is refreshed on `list_changed` or a restart only, never
 * by age, so a list does not restart a process that was stopped for idling.
 * The poll and {@link refresh} reload a stdio server only for a root that
 * listed or called within {@link STDIO_IDLE_MS} (S2): a root nobody uses gets
 * no new process, and the host stops the running one once it idles, so a
 * worktree folder is not held open. A stdio list that timed out or was
 * refused keeps the process (S1); only a closed or failed connection kills
 * it. {@link dispose} stops every process tree and settles once they stopped.
 *
 * ## Read ordering (S5)
 *
 * The poll, {@link refresh} and lists read a root concurrently. Each read
 * takes a sequence number; a read that a newer read of the same root
 * overtook writes nothing and answers with the newer read's view, so a read
 * that saw the sources before an install never replaces the view after it.
 *
 * ## Failures
 *
 * A failed server is `failed` (or `needs-auth` after an unrecoverable 401; the
 * client already ran one forced refresh and one retry) and backs off 1 s,
 * doubling to 60 s. Calls fail fast while it backs off. One server's failure
 * never fails the list; a failed call is an `isError` result, never a throw.
 *
 * ## Change notification
 *
 * `onToolsChanged` fires when a root's served set or aliases change, when a
 * listed server's tools change (an upstream `list_changed` included), when a
 * server loses its tools to `needs-auth`, and when a cold-start straggler
 * lands. {@link refresh} re-reads the known roots at once; the host calls it
 * after an install, an uninstall or a capability toggle. While anyone
 * listens, one 30 s poll also re-reads the known roots (so a
 * connector enabled, disabled, connected or removed is noticed without a
 * list) and retries servers whose back-off has expired (so a reconnected
 * token is noticed).
 *
 * SECURITY: the dedup key and the URL can carry a Smithery key, and headers
 * carry bearer tokens. Logs and status carry the server name, the tool, the
 * duration and the status only; error text is redacted of the URL and key.
 */

import {
  isGatewayCallerPermitted,
  stripPtahMcpToolPrefix,
  type IDisposable,
  type IMcpGateway,
  type McpGatewayCallResult,
  type McpGatewayScope,
  type McpGatewayServerState,
  type McpGatewayServerStatus,
  type McpGatewayTool,
} from '@ptah-extension/platform-core';
import {
  isMcpServerEnabled,
  PTAH_MCP_SERVER_NAME,
  type ICapabilityResolver,
} from '@ptah-extension/shared';
import { assignGatewayAliases } from './gateway-tool-naming';
import {
  buildGatewayToolList,
  type GatewayToolRoute,
} from './gateway-tool-list';
import {
  GATEWAY_SOURCES_CACHE_MS,
  type GatewayEndpoint,
  type GatewayServerSources,
  type GatewaySourcesLogger,
} from './server-sources';
import { STDIO_IDLE_MS, StdioServerHost } from './stdio-server-host';
import {
  errorName,
  errorResult,
  errorText,
  isProtocolError,
  isSlowOrRefusedList,
  normalizeCallResult,
  redactGatewayText,
} from './gateway-call-result';
import {
  createUpstreamClient,
  type UpstreamClient,
  type UpstreamClientFactory,
  type UpstreamEndpoint,
  type UpstreamTool,
} from './upstream-client';

/** One budget for the first list's wait on pending servers. */
export const GATEWAY_COLD_START_BUDGET_MS = 12_000;
/** Detail of a server still pending when the cold-start budget ran out. */
export const GATEWAY_COLD_START_TIMEOUT_DETAIL =
  'tools/list timed out after 12s';
/** First back-off after a failure. */
export const GATEWAY_BACKOFF_INITIAL_MS = 1_000;
/** Back-off ceiling. */
export const GATEWAY_BACKOFF_MAX_MS = 60_000;
/** A connected server's list is refreshed in the background after this. */
export const GATEWAY_LIST_REFRESH_MS = GATEWAY_SOURCES_CACHE_MS;
/** Poll interval while `onToolsChanged` has listeners. */
export const GATEWAY_POLL_MS = GATEWAY_SOURCES_CACHE_MS;
/** Most workspace roots remembered; the oldest is dropped first. */
export const GATEWAY_MAX_ROOTS = 32;

const NEEDS_AUTH_DETAIL = 'reconnect in Settings > Connectors';

export interface McpGatewayDeps {
  readonly sources: Pick<GatewayServerSources, 'list' | 'invalidate'>;
  /** Supplies the per-root deny list. */
  readonly capabilities: Pick<ICapabilityResolver, 'resolve'>;
  /** Defaults to the SDK client. */
  readonly clientFactory?: UpstreamClientFactory;
  /** Runs stdio servers. Defaults to a host owned (and disposed) by the gateway. */
  readonly stdioHost?: Pick<StdioServerHost, 'createClient' | 'dispose'>;
  readonly logger?: GatewaySourcesLogger;
  /**
   * Workspace roots to pre-warm when the first listener subscribes (M5).
   * Read at pre-warm time, not at construction. Absent: no pre-warm.
   */
  readonly prewarmRoots?: () => readonly string[];
  /** Injectable clock for specs. */
  readonly now?: () => number;
}

interface ServerState {
  readonly key: string;
  readonly transport: GatewayEndpoint['transport'];
  /** Empty for a stdio server. */
  readonly url: string;
  /** Latest endpoint for this key; the client reads its headers per request. */
  endpoint: GatewayEndpoint;
  readonly client: UpstreamClient;
  status: McpGatewayServerState;
  detail?: string;
  /** Last good list, or null before the first one (or after `needs-auth`). */
  tools: readonly UpstreamTool[] | null;
  fingerprint: string | null;
  listedAt: number;
  loading: Promise<void> | null;
  backoffMs: number;
  retryAt: number;
  /** A cold-start list already waited for this server. */
  coldWaited: boolean;
  /** A list was served without this server's tools; announce when they land. */
  missedByList: boolean;
  /** `list_changed` or a dropped session: refresh on the next chance. */
  stale: boolean;
  /** The client saw an unrecoverable 401 since the last success. */
  unauthorized: boolean;
  closed: boolean;
}

interface RootView {
  readonly endpoints: readonly GatewayEndpoint[];
  readonly aliases: ReadonlyMap<string, string>;
  readonly fingerprint: string;
  routes: ReadonlyMap<string, GatewayToolRoute>;
}

export class McpGateway implements IMcpGateway {
  private readonly servers = new Map<string, ServerState>();
  private readonly roots = new Map<string, RootView>();
  /** The newest read of each root still running (S5). */
  private readonly rootReads = new Map<
    string,
    { readonly seq: number; readonly view: Promise<RootView | null> }
  >();
  private readSeq = 0;
  /** Last list or call per root; gates stdio loads by the poll (S2). */
  private readonly rootUsedAt = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private hostToolNames: ReadonlySet<string> = new Set();
  private readonly clientFactory: UpstreamClientFactory;
  private readonly stdioHost: Pick<StdioServerHost, 'createClient' | 'dispose'>;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private prewarmed = false;
  private disposed = false;

  constructor(private readonly deps: McpGatewayDeps) {
    this.clientFactory = deps.clientFactory ?? createUpstreamClient;
    this.stdioHost =
      deps.stdioHost ?? new StdioServerHost({ logger: deps.logger });
  }

  // ---- host-name registry ----------------------------------------------------

  registerHostToolNames(names: readonly string[]): void {
    this.hostToolNames = new Set(
      names.map((name) => stripPtahMcpToolPrefix(name)),
    );
  }

  isGatewayTool(name: string): boolean {
    return !this.hostToolNames.has(stripPtahMcpToolPrefix(name));
  }

  // ---- list ------------------------------------------------------------------

  async listTools(
    scope: McpGatewayScope,
    signal?: AbortSignal,
  ): Promise<readonly McpGatewayTool[]> {
    const root = this.permittedRoot(scope);
    if (root === null) return [];
    this.rootUsedAt.set(root, this.now());
    const view = await this.refreshRoot(root);
    if (view === null || this.disposed) return [];

    const states = this.statesOf(view);
    await this.awaitColdStart(states, signal);
    for (const state of states) {
      if (this.dueForBackgroundLoad(state)) void this.load(state);
    }
    return this.buildTools(view);
  }

  // ---- call ------------------------------------------------------------------

  async callTool(
    scope: McpGatewayScope,
    name: string,
    args: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<McpGatewayCallResult> {
    const root = this.permittedRoot(scope);
    if (root === null) {
      return errorResult('Gateway tools are not available to this caller.');
    }
    this.rootUsedAt.set(root, this.now());
    const bare = stripPtahMcpToolPrefix(name);
    let route = this.roots.get(root)?.routes.get(bare);
    if (route === undefined) {
      // The caller may hold a list from before a restart or a refresh.
      await this.listTools(scope, signal);
      route = this.roots.get(root)?.routes.get(bare);
    }
    const state = route === undefined ? undefined : this.servers.get(route.key);
    if (route === undefined || state === undefined || state.closed) {
      return errorResult(`Unknown gateway tool: ${bare}`);
    }
    const display = state.endpoint.serverName;

    // Policy may have changed since the list that produced the route.
    const policy = await this.deps.capabilities.resolve(root);
    if (!isMcpServerEnabled(policy, display)) {
      return errorResult(`${display} is turned off for this workspace.`);
    }
    if (this.inBackoff(state)) {
      return errorResult(
        `${display} error: ${
          state.status === 'needs-auth'
            ? `authorization required; ${NEEDS_AUTH_DETAIL}`
            : (state.detail ?? 'server unavailable')
        }`,
      );
    }

    const started = this.now();
    state.unauthorized = false;
    try {
      const result = await state.client.callTool(
        route.upstreamName,
        args,
        signal,
      );
      const normalized = normalizeCallResult(result);
      this.deps.logger?.debug('MCP gateway tools/call', {
        server: display,
        tool: route.upstreamName,
        durationMs: this.now() - started,
        status: normalized.isError === true ? 'error' : 'ok',
      });
      return normalized;
    } catch (error: unknown) {
      // degradation-audit: reported - the failure is logged, returned to the
      // caller as an `isError` result, and (for transport or auth failures)
      // recorded on the server's status with back-off.
      const aborted = signal?.aborted === true;
      if (state.unauthorized || (!aborted && !isProtocolError(error))) {
        this.markFailed(state, error);
      }
      this.deps.logger?.warn('MCP gateway tools/call failed', {
        server: display,
        tool: route.upstreamName,
        durationMs: this.now() - started,
        status: aborted
          ? 'aborted'
          : state.unauthorized
            ? 'needs-auth'
            : 'error',
      });
      const message = state.unauthorized
        ? `authorization failed; ${NEEDS_AUTH_DETAIL}`
        : redactGatewayText(errorText(error), state.endpoint, state.key);
      return errorResult(`${display} error: ${message}`);
    }
  }

  // ---- status ----------------------------------------------------------------

  status(scope: McpGatewayScope): McpGatewayServerStatus[] {
    const root = this.permittedRoot(scope);
    if (root === null) return [];
    const view = this.roots.get(root);
    if (view === undefined) return [];
    const statuses: McpGatewayServerStatus[] = [];
    for (const endpoint of view.endpoints) {
      const state = this.servers.get(endpoint.key);
      if (state === undefined) continue;
      // The dedup key can carry a Smithery key, so the name stands in for it.
      statuses.push({
        key: endpoint.serverName,
        display: endpoint.serverName,
        status: state.status,
        ...(state.detail === undefined ? {} : { detail: state.detail }),
      });
    }
    return statuses;
  }

  async servedFileServerNames(root: string): Promise<string[]> {
    if (this.disposed) return [];
    try {
      const set = await this.deps.sources.list(root);
      // Never report `ptah`: the CLI must keep Ptah's own server.
      return set.servedFileServerNames.filter(
        (name) => name !== PTAH_MCP_SERVER_NAME,
      );
    } catch (error: unknown) {
      // degradation-audit: reported - logged; suppressing nothing leaves the
      // CLI's own copies running, which duplicates tools but loses none.
      this.deps.logger?.warn(
        'MCP gateway could not resolve served file names',
        {
          error: errorName(error),
        },
      );
      return [];
    }
  }

  // ---- change notification ----------------------------------------------------

  onToolsChanged(listener: () => void): IDisposable {
    if (this.disposed) return { dispose: () => undefined };
    this.listeners.add(listener);
    this.startPoll();
    this.schedulePrewarm();
    return {
      dispose: () => {
        this.listeners.delete(listener);
        if (this.listeners.size === 0) this.stopPoll();
      },
    };
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    this.deps.sources.invalidate();
    try {
      await this.rereadKnownRoots();
    } catch (error: unknown) {
      // degradation-audit: reported - logged; callers fire and forget, and
      // the next list or poll re-reads the roots anyway.
      this.deps.logger?.warn('MCP gateway refresh failed', {
        error: errorName(error),
      });
    }
  }

  /**
   * Terminal. The kills start before the first `await`; the promise settles
   * once the stdio host stopped every process. Never rejects.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopPoll();
    this.listeners.clear();
    for (const state of this.servers.values()) this.closeState(state);
    this.servers.clear();
    this.roots.clear();
    this.rootReads.clear();
    this.rootUsedAt.clear();
    try {
      await this.stdioHost.dispose();
    } catch (error: unknown) {
      // degradation-audit: reported - logged; every client was already told
      // to stop its process tree above.
      this.deps.logger?.warn('MCP gateway could not stop its stdio servers', {
        error: errorName(error),
      });
    }
  }

  // ---- roots -----------------------------------------------------------------

  private permittedRoot(scope: McpGatewayScope): string | null {
    if (this.disposed || !isGatewayCallerPermitted(scope)) return null;
    const root = scope.workspaceRoot;
    return root === undefined || root.trim() === '' ? null : root;
  }

  /**
   * Re-read the served set for `root`, update the server states, close the
   * servers no root serves any more, and announce a changed set. Returns the
   * last known view when the sources fail, or null when there is none. A
   * read overtaken by a newer read of the same root writes nothing (S5).
   */
  private refreshRoot(root: string): Promise<RootView | null> {
    const seq = ++this.readSeq;
    const view = this.readRoot(root, seq).finally(() => {
      if (this.rootReads.get(root)?.seq === seq) this.rootReads.delete(root);
    });
    this.rootReads.set(root, { seq, view });
    return view;
  }

  /**
   * Undefined while `seq` is the newest read of `root`; otherwise the newer
   * read's view, or the view it already wrote.
   */
  private overtaken(
    root: string,
    seq: number,
  ): Promise<RootView | null> | undefined {
    const newest = this.rootReads.get(root);
    if (newest?.seq === seq) return undefined;
    return newest?.view ?? Promise.resolve(this.roots.get(root) ?? null);
  }

  private async readRoot(root: string, seq: number): Promise<RootView | null> {
    let endpoints: GatewayEndpoint[];
    try {
      const [set, policy] = await Promise.all([
        this.deps.sources.list(root),
        this.deps.capabilities.resolve(root),
      ]);
      endpoints = set.endpoints.filter(
        (endpoint) =>
          endpoint.serverName !== PTAH_MCP_SERVER_NAME &&
          isMcpServerEnabled(policy, endpoint.serverName),
      );
    } catch (error: unknown) {
      // degradation-audit: reported - logged; the last known list keeps
      // serving (or none), and the next list or poll tries again.
      this.deps.logger?.warn('MCP gateway could not resolve its servers', {
        error: errorName(error),
      });
      return this.overtaken(root, seq) ?? this.roots.get(root) ?? null;
    }
    if (this.disposed) return null;
    const newer = this.overtaken(root, seq);
    if (newer !== undefined) return newer;

    const aliases = assignGatewayAliases(endpoints);
    const fingerprint = endpoints
      .map((endpoint) => `${endpoint.key}\u0000${aliases.get(endpoint.key)}`)
      .join('\n');
    for (const endpoint of endpoints) this.upsertState(endpoint);

    const previous = this.roots.get(root);
    this.roots.delete(root);
    this.roots.set(root, {
      endpoints,
      aliases,
      fingerprint,
      routes: previous?.routes ?? new Map(),
    });
    while (this.roots.size > GATEWAY_MAX_ROOTS) {
      const oldest = this.roots.keys().next().value;
      if (oldest === undefined) break;
      this.roots.delete(oldest);
      this.rootUsedAt.delete(oldest);
    }
    this.closeUnserved();
    if (previous !== undefined && previous.fingerprint !== fingerprint) {
      this.emit();
    }
    return this.roots.get(root) ?? null;
  }

  private upsertState(endpoint: GatewayEndpoint): void {
    const existing = this.servers.get(endpoint.key);
    if (
      existing !== undefined &&
      existing.transport === endpoint.transport &&
      existing.url === urlOf(endpoint)
    ) {
      existing.endpoint = endpoint;
      return;
    }
    if (existing !== undefined) this.closeState(existing);
    this.servers.set(endpoint.key, this.createState(endpoint));
  }

  private createState(endpoint: GatewayEndpoint): ServerState {
    const callbacks = {
      onToolsChanged: () => this.onUpstreamListChanged(state),
      onDisconnected: () => {
        state.stale = true;
      },
      onTransportError: (error: Error) => {
        this.deps.logger?.debug('MCP gateway upstream transport error', {
          server: state.endpoint.serverName,
          error: errorName(error),
        });
      },
    };
    const client =
      endpoint.transport === 'stdio'
        ? this.stdioHost.createClient({
            spec: endpoint,
            serverName: endpoint.serverName,
            ...callbacks,
          })
        : this.clientFactory({
            endpoint: this.remoteProxy(endpoint, () => state.endpoint),
            onUnauthorized: () => {
              state.unauthorized = true;
              this.deps.sources.invalidate();
            },
            ...callbacks,
          });
    const state: ServerState = {
      key: endpoint.key,
      transport: endpoint.transport,
      url: urlOf(endpoint),
      endpoint,
      client,
      status: 'pending',
      tools: null,
      fingerprint: null,
      listedAt: 0,
      loading: null,
      backoffMs: 0,
      retryAt: 0,
      coldWaited: false,
      missedByList: false,
      stale: false,
      unauthorized: false,
      closed: false,
    };
    return state;
  }

  /**
   * An endpoint whose headers come from the latest endpoint for its key, so a
   * refreshed token is used without a reconnect.
   */
  private remoteProxy(
    endpoint: UpstreamEndpoint,
    latest: () => GatewayEndpoint,
  ): UpstreamEndpoint {
    const remote = (): UpstreamEndpoint | null => {
      const current = latest();
      return current.transport === 'stdio' ? null : current;
    };
    return {
      transport: endpoint.transport,
      url: endpoint.url,
      resolveHeaders: () => remote()?.resolveHeaders() ?? Promise.resolve({}),
      refreshAuth: () => remote()?.refreshAuth?.() ?? Promise.resolve(false),
    };
  }

  private statesOf(view: RootView): ServerState[] {
    const states: ServerState[] = [];
    for (const endpoint of view.endpoints) {
      const state = this.servers.get(endpoint.key);
      if (state !== undefined) states.push(state);
    }
    return states;
  }

  /** Close every server that no remembered root serves. */
  private closeUnserved(): void {
    const served = new Set<string>();
    for (const view of this.roots.values()) {
      for (const endpoint of view.endpoints) served.add(endpoint.key);
    }
    for (const [key, state] of this.servers) {
      if (served.has(key)) continue;
      this.closeState(state);
      this.servers.delete(key);
    }
  }

  private closeState(state: ServerState): void {
    state.closed = true;
    state.client.close().catch((error: unknown) => {
      // degradation-audit: reported - logged; the session is abandoned either
      // way and the server is no longer served.
      this.deps.logger?.debug('MCP gateway could not close an upstream', {
        server: state.endpoint.serverName,
        error: errorName(error),
      });
    });
  }

  // ---- loading ---------------------------------------------------------------

  /** Wait once per server, within one budget, for servers with no list yet. */
  private async awaitColdStart(
    states: readonly ServerState[],
    signal?: AbortSignal,
  ): Promise<void> {
    const waiting = states.filter(
      (state) =>
        !state.coldWaited && state.tools === null && !this.inBackoff(state),
    );
    if (waiting.length === 0) return;
    // `load` never rejects, so neither does `loads`.
    let loadsDone = false;
    const loads = Promise.all(waiting.map((state) => this.load(state))).then(
      () => {
        loadsDone = true;
      },
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    let timedOut = false;
    const stop = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, GATEWAY_COLD_START_BUDGET_MS);
      if (signal !== undefined) {
        onAbort = () => resolve();
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    });
    try {
      await Promise.race([loads, stop]);
    } finally {
      clearTimeout(timer);
      if (onAbort !== undefined) signal?.removeEventListener('abort', onAbort);
    }

    // Only a completed wait (every load landed, or the budget ran out) uses up
    // a server's cold wait. A wait the caller aborted leaves the next list to
    // wait again (M6).
    if (!loadsDone && !timedOut) return;
    for (const state of waiting) state.coldWaited = true;

    for (const state of waiting) {
      if (state.loading === null) continue;
      // Still loading: omitted from this list (`buildTools` marks it missed)
      // and announced when it lands.
      if (timedOut) {
        state.status = 'pending';
        state.detail = GATEWAY_COLD_START_TIMEOUT_DETAIL;
        this.deps.logger?.warn(
          'MCP gateway server still pending after the cold-start budget',
          {
            server: state.endpoint.serverName,
            durationMs: GATEWAY_COLD_START_BUDGET_MS,
            status: 'pending',
          },
        );
      }
    }
  }

  private dueForBackgroundLoad(state: ServerState): boolean {
    if (state.closed || state.loading !== null || this.inBackoff(state)) {
      return false;
    }
    if (state.stale || state.tools === null) return true;
    if (state.status !== 'connected') return true;
    // A stdio list changes only through `list_changed` or a restart.
    if (state.transport === 'stdio') return false;
    return this.now() - state.listedAt >= GATEWAY_LIST_REFRESH_MS;
  }

  /** List one server's tools. Never rejects; concurrent calls share a load. */
  private load(state: ServerState): Promise<void> {
    if (state.loading !== null) return state.loading;
    if (state.closed || this.inBackoff(state)) return Promise.resolve();
    const started = this.now();
    state.stale = false;
    const run = this.listOnce(state, started).finally(() => {
      if (state.loading === run) state.loading = null;
    });
    state.loading = run;
    return run;
  }

  private async listOnce(state: ServerState, started: number): Promise<void> {
    try {
      const tools = await state.client.listTools();
      if (state.closed) return;
      const previous = state.fingerprint;
      state.tools = tools;
      state.fingerprint = toolsFingerprint(tools);
      state.status = 'connected';
      delete state.detail;
      state.listedAt = this.now();
      state.backoffMs = 0;
      state.retryAt = 0;
      state.unauthorized = false;
      this.deps.logger?.debug('MCP gateway tools/list', {
        server: state.endpoint.serverName,
        durationMs: this.now() - started,
        status: 'connected',
        tools: tools.length,
      });
      const changed = previous !== null && previous !== state.fingerprint;
      const missed = state.missedByList;
      state.missedByList = false;
      if (changed || missed) this.emit();
    } catch (error: unknown) {
      // degradation-audit: reported - the server is marked failed or
      // needs-auth with back-off and logged; status() surfaces it and every
      // other server still lists.
      if (state.closed) return;
      // A stdio process that listed slowly or refused the list is still
      // running: keep it, so a cold start is not counted as a restart (S1).
      const keepProcess =
        state.transport === 'stdio' && isSlowOrRefusedList(error);
      this.markFailed(state, error, keepProcess);
      this.deps.logger?.warn('MCP gateway tools/list failed', {
        server: state.endpoint.serverName,
        durationMs: this.now() - started,
        status: state.status,
      });
    }
  }

  private markFailed(
    state: ServerState,
    error: unknown,
    keepSession = false,
  ): void {
    const needsAuth = state.unauthorized;
    state.status = needsAuth ? 'needs-auth' : 'failed';
    state.detail = needsAuth
      ? NEEDS_AUTH_DETAIL
      : redactGatewayText(errorText(error), state.endpoint, state.key);
    state.backoffMs =
      state.backoffMs === 0
        ? GATEWAY_BACKOFF_INITIAL_MS
        : Math.min(state.backoffMs * 2, GATEWAY_BACKOFF_MAX_MS);
    state.retryAt = this.now() + state.backoffMs;
    // Drop the session so the next attempt reconnects from scratch.
    if (!keepSession) {
      state.client.close().catch((closeError: unknown) => {
        // degradation-audit: reported - logged; the next attempt reconnects
        // regardless.
        this.deps.logger?.debug('MCP gateway could not close an upstream', {
          server: state.endpoint.serverName,
          error: errorName(closeError),
        });
      });
    }
    if (needsAuth && state.tools !== null) {
      // A revoked connector's tools go away until it is reconnected.
      state.tools = null;
      state.fingerprint = null;
      this.emit();
    }
  }

  private inBackoff(state: ServerState): boolean {
    return (
      (state.status === 'failed' || state.status === 'needs-auth') &&
      this.now() < state.retryAt
    );
  }

  private onUpstreamListChanged(state: ServerState): void {
    if (state.closed || this.disposed) return;
    state.stale = true;
    // The load emits when the new list differs from the cached one.
    void this.load(state);
  }

  // ---- tools -----------------------------------------------------------------

  private buildTools(view: RootView): McpGatewayTool[] {
    const { tools, routes } = buildGatewayToolList({
      endpoints: view.endpoints,
      aliases: view.aliases,
      toolsOf: (key) => this.servers.get(key)?.tools,
      hostToolNames: this.hostToolNames,
      onMissing: (key) => {
        const state = this.servers.get(key);
        if (state !== undefined) state.missedByList = true;
      },
      logger: this.deps.logger,
    });
    view.routes = routes;
    return tools;
  }

  // ---- pre-warm ----------------------------------------------------------------

  /** Pre-warm once, on the next macrotask, so the subscriber never waits. */
  private schedulePrewarm(): void {
    if (this.prewarmed || this.deps.prewarmRoots === undefined) return;
    this.prewarmed = true;
    const timer = setTimeout(() => void this.prewarm(), 0);
    timer.unref?.();
  }

  /**
   * Resolve each root and start its remote servers' first loads; stdio
   * servers wait for their root's first list or call (S2). Never rejects.
   */
  private async prewarm(): Promise<void> {
    try {
      const roots = this.deps.prewarmRoots?.() ?? [];
      for (const root of roots) {
        if (this.disposed) return;
        if (root.trim() === '') continue;
        const view = await this.refreshRoot(root);
        if (view === null || this.disposed) continue;
        for (const state of this.statesOf(view)) {
          if (state.transport === 'stdio') continue;
          if (this.dueForBackgroundLoad(state)) void this.load(state);
        }
      }
    } catch (error: unknown) {
      // degradation-audit: reported - logged; pre-warm is an optimisation and
      // the first list still loads every server under the cold-start budget.
      this.deps.logger?.warn('MCP gateway pre-warm failed', {
        error: errorName(error),
      });
    }
  }

  // ---- polling and events ------------------------------------------------------

  private startPoll(): void {
    if (this.pollTimer !== null || this.disposed) return;
    this.pollTimer = setInterval(() => void this.poll(), GATEWAY_POLL_MS);
    this.pollTimer.unref?.();
  }

  private stopPoll(): void {
    if (this.pollTimer === null) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async poll(): Promise<void> {
    if (this.polling || this.disposed) return;
    this.polling = true;
    try {
      await this.rereadKnownRoots();
    } finally {
      this.polling = false;
    }
  }

  /**
   * Re-read each known root in turn (`refreshRoot` emits for a changed set)
   * and start loading the servers that are not serving. Connected lists
   * refresh on the next `tools/list`. A stdio server is loaded only while its
   * root is in use (S2).
   */
  private async rereadKnownRoots(): Promise<void> {
    for (const root of [...this.roots.keys()]) {
      const view = await this.refreshRoot(root);
      if (view === null || this.disposed) continue;
      const rootInUse = this.rootInUse(root);
      for (const state of this.statesOf(view)) {
        if (state.status === 'connected' && !state.stale) continue;
        if (state.transport === 'stdio' && !rootInUse) continue;
        if (this.dueForBackgroundLoad(state)) void this.load(state);
      }
    }
  }

  /** The root listed or called within {@link STDIO_IDLE_MS}. */
  private rootInUse(root: string): boolean {
    const usedAt = this.rootUsedAt.get(root);
    return usedAt !== undefined && this.now() - usedAt < STDIO_IDLE_MS;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error: unknown) {
        // degradation-audit: reported - logged; one listener's failure must
        // not stop the others from hearing the change.
        this.deps.logger?.warn('MCP gateway tools-changed listener failed', {
          error: errorName(error),
        });
      }
    }
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}

function urlOf(endpoint: GatewayEndpoint): string {
  return endpoint.transport === 'stdio' ? '' : endpoint.url;
}

function toolsFingerprint(tools: readonly UpstreamTool[]): string {
  return JSON.stringify(tools);
}
