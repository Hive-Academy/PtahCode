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
 * `listTools`, `callTool` and `status` apply {@link isGatewayScopePermitted}
 * first. A scope without a `workspaceRoot` gets nothing: the deny list and the
 * project approvals cannot be read without one, so it fails closed.
 *
 * ## Cold start (Hub 3, S6)
 *
 * A server with no tool list yet is `pending`. The first list that sees it
 * awaits every such server together, bounded by one
 * {@link GATEWAY_COLD_START_BUDGET_MS} budget. A server still loading at the
 * deadline is omitted with detail `tools/list timed out after 12s` and keeps
 * loading; when it lands, `onToolsChanged` fires. Only the first list per
 * server waits; later lists serve the last good list and refresh in the
 * background.
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
 * lands. While anyone listens, one 30 s poll re-reads the known roots (so a
 * connector enabled, disabled, connected or removed is noticed without a
 * list) and retries servers whose back-off has expired (so a reconnected
 * token is noticed).
 *
 * SECURITY: the dedup key and the URL can carry a Smithery key, and headers
 * carry bearer tokens. Logs and status carry the server name, the tool, the
 * duration and the status only; error text is redacted of the URL and key.
 */

import type {
  IDisposable,
  IMcpGateway,
  McpGatewayCallResult,
  McpGatewayScope,
  McpGatewayServerState,
  McpGatewayServerStatus,
  McpGatewayTool,
} from '@ptah-extension/platform-core';
import {
  isMcpServerEnabled,
  PTAH_MCP_SERVER_NAME,
  type ICapabilityResolver,
} from '@ptah-extension/shared';
import { isGatewayScopePermitted } from './gateway-caller-policy';
import {
  assignGatewayAliases,
  buildGatewayToolName,
} from './gateway-tool-naming';
import {
  GATEWAY_SOURCES_CACHE_MS,
  type GatewayEndpoint,
  type GatewayServerSources,
  type GatewaySourcesLogger,
} from './server-sources';
import {
  createUpstreamClient,
  type UpstreamCallResult,
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

const HOST_PREFIX = 'mcp__ptah__';
const NEEDS_AUTH_DETAIL = 'reconnect in Settings > Connectors';
const MAX_ERROR_TEXT = 500;

export interface McpGatewayDeps {
  readonly sources: Pick<GatewayServerSources, 'list' | 'invalidate'>;
  /** Supplies the per-root deny list. */
  readonly capabilities: Pick<ICapabilityResolver, 'resolve'>;
  /** Defaults to the SDK client. */
  readonly clientFactory?: UpstreamClientFactory;
  readonly logger?: GatewaySourcesLogger;
  /** Injectable clock for specs. */
  readonly now?: () => number;
}

interface ServerState {
  readonly key: string;
  readonly transport: UpstreamEndpoint['transport'];
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

interface Route {
  readonly key: string;
  readonly upstreamName: string;
}

interface RootView {
  readonly endpoints: readonly GatewayEndpoint[];
  readonly aliases: ReadonlyMap<string, string>;
  readonly fingerprint: string;
  routes: ReadonlyMap<string, Route>;
}

export class McpGateway implements IMcpGateway {
  private readonly servers = new Map<string, ServerState>();
  private readonly roots = new Map<string, RootView>();
  private readonly listeners = new Set<() => void>();
  private hostToolNames: ReadonlySet<string> = new Set();
  private readonly clientFactory: UpstreamClientFactory;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private disposed = false;

  constructor(private readonly deps: McpGatewayDeps) {
    this.clientFactory = deps.clientFactory ?? createUpstreamClient;
  }

  // ---- host-name registry ----------------------------------------------------

  registerHostToolNames(names: readonly string[]): void {
    this.hostToolNames = new Set(names.map(stripHostPrefix));
  }

  isGatewayTool(name: string): boolean {
    return !this.hostToolNames.has(stripHostPrefix(name));
  }

  // ---- list ------------------------------------------------------------------

  async listTools(
    scope: McpGatewayScope,
    signal?: AbortSignal,
  ): Promise<readonly McpGatewayTool[]> {
    const root = this.permittedRoot(scope);
    if (root === null) return [];
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
    const bare = stripHostPrefix(name);
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
        : redact(errorText(error), state);
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
    return {
      dispose: () => {
        this.listeners.delete(listener);
        if (this.listeners.size === 0) this.stopPoll();
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopPoll();
    this.listeners.clear();
    for (const state of this.servers.values()) this.closeState(state);
    this.servers.clear();
    this.roots.clear();
  }

  // ---- roots -----------------------------------------------------------------

  private permittedRoot(scope: McpGatewayScope): string | null {
    if (this.disposed || !isGatewayScopePermitted(scope)) return null;
    const root = scope.workspaceRoot;
    return root === undefined || root.trim() === '' ? null : root;
  }

  /**
   * Re-read the served set for `root`, update the server states, close the
   * servers no root serves any more, and announce a changed set. Returns the
   * last known view when the sources fail, or null when there is none.
   */
  private async refreshRoot(root: string): Promise<RootView | null> {
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
      return this.roots.get(root) ?? null;
    }
    if (this.disposed) return null;

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
      existing.url === endpoint.url
    ) {
      existing.endpoint = endpoint;
      return;
    }
    if (existing !== undefined) this.closeState(existing);
    this.servers.set(endpoint.key, this.createState(endpoint));
  }

  private createState(endpoint: GatewayEndpoint): ServerState {
    const proxy: UpstreamEndpoint = {
      transport: endpoint.transport,
      url: endpoint.url,
      resolveHeaders: () => state.endpoint.resolveHeaders(),
      refreshAuth: () =>
        state.endpoint.refreshAuth === undefined
          ? Promise.resolve(false)
          : state.endpoint.refreshAuth(),
    };
    const client = this.clientFactory({
      endpoint: proxy,
      onToolsChanged: () => this.onUpstreamListChanged(state),
      onUnauthorized: () => {
        state.unauthorized = true;
        this.deps.sources.invalidate();
      },
      onDisconnected: () => {
        state.stale = true;
      },
      onTransportError: (error) => {
        this.deps.logger?.debug('MCP gateway upstream transport error', {
          server: state.endpoint.serverName,
          error: errorName(error),
        });
      },
    });
    const state: ServerState = {
      key: endpoint.key,
      transport: endpoint.transport,
      url: endpoint.url,
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
    for (const state of waiting) state.coldWaited = true;
    const loads = Promise.all(waiting.map((state) => this.load(state)));

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
    return (
      state.status !== 'connected' ||
      this.now() - state.listedAt >= GATEWAY_LIST_REFRESH_MS
    );
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
      this.markFailed(state, error);
      this.deps.logger?.warn('MCP gateway tools/list failed', {
        server: state.endpoint.serverName,
        durationMs: this.now() - started,
        status: state.status,
      });
    }
  }

  private markFailed(state: ServerState, error: unknown): void {
    const needsAuth = state.unauthorized;
    state.status = needsAuth ? 'needs-auth' : 'failed';
    state.detail = needsAuth
      ? NEEDS_AUTH_DETAIL
      : redact(errorText(error), state);
    state.backoffMs =
      state.backoffMs === 0
        ? GATEWAY_BACKOFF_INITIAL_MS
        : Math.min(state.backoffMs * 2, GATEWAY_BACKOFF_MAX_MS);
    state.retryAt = this.now() + state.backoffMs;
    // Drop the session so the next attempt reconnects from scratch.
    state.client.close().catch((closeError: unknown) => {
      // degradation-audit: reported - logged; the next attempt reconnects
      // regardless.
      this.deps.logger?.debug('MCP gateway could not close an upstream', {
        server: state.endpoint.serverName,
        error: errorName(closeError),
      });
    });
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
    const routes = new Map<string, Route>();
    const tools: McpGatewayTool[] = [];
    for (const endpoint of view.endpoints) {
      const state = this.servers.get(endpoint.key);
      const alias = view.aliases.get(endpoint.key);
      if (state === undefined || alias === undefined) continue;
      if (state.tools === null) {
        state.missedByList = true;
        continue;
      }
      const display = endpoint.serverName;
      for (const tool of state.tools) {
        const name = buildGatewayToolName(alias, tool.name, this.hostToolNames);
        if (name === null || routes.has(name)) {
          this.deps.logger?.debug('MCP gateway skipped a tool name', {
            server: display,
            tool: tool.name,
          });
          continue;
        }
        routes.set(name, { key: endpoint.key, upstreamName: tool.name });
        const text = tool.description ?? tool.title ?? '';
        tools.push({
          name,
          description: `[${display} via Ptah] ${text}`.trimEnd(),
          inputSchema: tool.inputSchema,
          ...(tool.annotations === undefined
            ? {}
            : { annotations: tool.annotations }),
          ...(tool.outputSchema === undefined
            ? {}
            : { outputSchema: tool.outputSchema }),
        });
      }
    }
    view.routes = routes;
    return tools;
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
      for (const root of [...this.roots.keys()]) {
        const view = await this.refreshRoot(root);
        if (view === null || this.disposed) continue;
        for (const state of this.statesOf(view)) {
          // Connected lists refresh on the next `tools/list`; the poll only
          // retries servers that are not serving.
          if (state.status !== 'connected' || state.stale) {
            if (this.dueForBackgroundLoad(state)) void this.load(state);
          }
        }
      }
    } finally {
      this.polling = false;
    }
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

function stripHostPrefix(name: string): string {
  return name.startsWith(HOST_PREFIX) ? name.slice(HOST_PREFIX.length) : name;
}

function toolsFingerprint(tools: readonly UpstreamTool[]): string {
  return JSON.stringify(tools);
}

function errorResult(text: string): McpGatewayCallResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function normalizeCallResult(result: UpstreamCallResult): McpGatewayCallResult {
  const { content, isError, structuredContent, ...rest } = result;
  return {
    ...rest,
    content: Array.isArray(content) ? content : [],
    ...(isError === true ? { isError: true } : {}),
    ...(isPlainObject(structuredContent) ? { structuredContent } : {}),
  };
}

/**
 * A JSON-RPC error the upstream answered (negative code), other than
 * "connection closed" (-32000). Such an error is the tool's, not the
 * server's, so it does not put the server into back-off.
 */
function isProtocolError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'number' &&
    error.code < 0 &&
    error.code !== -32000
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Remove the URL and the dedup key (either may carry a key) and bound it. */
function redact(text: string, state: ServerState): string {
  let out = text;
  for (const secret of [state.url, state.key]) {
    if (secret !== '') out = out.split(secret).join('<server>');
  }
  return out.length > MAX_ERROR_TEXT
    ? `${out.slice(0, MAX_ERROR_TEXT)}...`
    : out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
