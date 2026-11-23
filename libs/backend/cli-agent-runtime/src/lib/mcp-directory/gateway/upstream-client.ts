/**
 * The gateway's client for one upstream MCP server (Hub 3).
 *
 * This is the ONLY module of the gateway that imports `@modelcontextprotocol/sdk`.
 * Everything else depends on {@link UpstreamClient} and
 * {@link UpstreamClientFactory}, so the gateway service and its specs never
 * touch the SDK.
 *
 * ## Headers are set per request
 *
 * The transport is given a custom `fetch` ({@link createRedirectSafeFetch})
 * that asks the endpoint for its headers on every request. An OAuth connector
 * returns a fresh bearer each time, so a token refresh never needs a
 * reconnect, and the token is never stored in the transport or the client.
 *
 * ## Redirects (M4)
 *
 * The SDK is told to leave redirects to the fetch (`redirectPolicy: 'follow'`)
 * and the fetch sends every request with `redirect: 'manual'`, so no redirect
 * is ever followed by the platform with the caller's headers attached. The
 * fetch follows at most {@link MAX_UPSTREAM_REDIRECTS} redirects that stay on
 * the request's origin and re-applies the headers itself. A redirect to any
 * other origin fails the request with "redirected to another origin" before
 * anything is sent there, so `Authorization` never crosses an origin.
 *
 * SECURITY: nothing here logs. Error messages name no URL and no header,
 * because a Smithery URL or header can carry an API key.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/** Connect (initialize handshake) budget. */
export const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000;
/** `tools/list` budget per server, all pages together. */
export const UPSTREAM_LIST_TIMEOUT_MS = 5_000;
/** `tools/call` budget. */
export const UPSTREAM_CALL_TIMEOUT_MS = 120_000;
/** Same-origin redirects followed per request. */
export const MAX_UPSTREAM_REDIRECTS = 3;
/** Pages read from a paginated `tools/list` before giving up. */
const MAX_LIST_PAGES = 50;

const CLIENT_INFO = { name: 'ptah-gateway', version: '1.0.0' } as const;

/** `fetch` as the SDK transports call it. */
export type UpstreamFetch = (
  url: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/** What the client needs to know about one upstream server. */
export interface UpstreamEndpoint {
  readonly transport: 'http' | 'sse';
  /** May carry a secret (a Smithery key); never log it. */
  readonly url: string;
  /** Headers for the next request, resolved fresh each time. */
  resolveHeaders(): Promise<Readonly<Record<string, string>>>;
  /**
   * Force a credential refresh after a 401. Resolves true when new headers
   * are available, so the request is worth one retry.
   */
  refreshAuth?(): Promise<boolean>;
}

/** One upstream tool, as plain JSON. */
export interface UpstreamTool {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly annotations?: Readonly<Record<string, unknown>>;
}

/** A `tools/call` result, as plain JSON. */
export type UpstreamCallResult = Readonly<Record<string, unknown>>;

export interface UpstreamClient {
  /** Connect if not connected. Concurrent calls share one attempt. */
  connect(signal?: AbortSignal): Promise<void>;
  /** Every tool the server lists, following pagination. Connects first. */
  listTools(signal?: AbortSignal): Promise<UpstreamTool[]>;
  /** Call one tool by its upstream name. Connects first. */
  callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<UpstreamCallResult>;
  /** Close the session. A later call reconnects. */
  close(): Promise<void>;
}

export interface UpstreamClientOptions {
  readonly endpoint: UpstreamEndpoint;
  /** The server sent `notifications/tools/list_changed`. */
  readonly onToolsChanged?: () => void;
  /** The server answered 401 (after any refresh retry). */
  readonly onUnauthorized?: () => void;
  /** The session closed after connecting; the next call reconnects. */
  readonly onDisconnected?: () => void;
  /** A transport or protocol error the SDK reported outside a request. */
  readonly onTransportError?: (error: Error) => void;
  /** Overridable for specs; defaults to the global `fetch`. */
  readonly fetch?: UpstreamFetch;
}

/** The seam the gateway service depends on. */
export type UpstreamClientFactory = (
  options: UpstreamClientOptions,
) => UpstreamClient;

export interface RedirectSafeFetchOptions {
  readonly endpoint: UpstreamEndpoint;
  readonly onUnauthorized?: () => void;
  readonly baseFetch?: UpstreamFetch;
  readonly maxRedirects?: number;
}

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);
/** Redirects that keep the method and body by definition. */
const METHOD_PRESERVING_REDIRECTS: ReadonlySet<number> = new Set([307, 308]);

/**
 * A `fetch` that sets the endpoint's headers on every request, refreshes the
 * credential once on a 401, and follows same-origin redirects only.
 */
export function createRedirectSafeFetch(
  options: RedirectSafeFetchOptions,
): UpstreamFetch {
  const { endpoint, onUnauthorized } = options;
  const baseFetch = options.baseFetch ?? globalFetch;
  const maxRedirects = options.maxRedirects ?? MAX_UPSTREAM_REDIRECTS;

  return async (input, init) => {
    let current = new URL(typeof input === 'string' ? input : input.href);
    const origin = current.origin;
    const method = (init?.method ?? 'GET').toUpperCase();
    let redirects = 0;
    let refreshed = false;

    for (;;) {
      const headers = new Headers(init?.headers);
      for (const [name, value] of Object.entries(
        await endpoint.resolveHeaders(),
      )) {
        headers.set(name, value);
      }
      const response = await baseFetch(current, {
        ...init,
        headers,
        redirect: 'manual',
      });

      if (response.status === 401) {
        if (!refreshed && endpoint.refreshAuth !== undefined) {
          refreshed = true;
          if (await endpoint.refreshAuth()) {
            await discardBody(response);
            continue;
          }
        }
        onUnauthorized?.();
        return response;
      }

      if (!REDIRECT_STATUSES.has(response.status)) return response;
      const location = response.headers.get('location');
      if (location === null || !URL.canParse(location, current)) {
        return response;
      }
      const next = new URL(location, current);
      await discardBody(response);
      if (next.origin !== origin) {
        throw new Error('MCP upstream request redirected to another origin');
      }
      if (redirects >= maxRedirects) {
        throw new Error(
          `MCP upstream request exceeded ${maxRedirects} redirects`,
        );
      }
      if (
        !METHOD_PRESERVING_REDIRECTS.has(response.status) &&
        method !== 'GET' &&
        method !== 'HEAD'
      ) {
        // A 301/302/303 turns the request into a GET without its body, and a
        // JSON-RPC message without its body is no request at all.
        throw new Error(
          `MCP upstream ${method} request was redirected with status ${response.status}`,
        );
      }
      redirects += 1;
      current = next;
    }
  };
}

/** The default factory: an SDK client over streamable HTTP or SSE. */
export const createUpstreamClient: UpstreamClientFactory = (options) =>
  new SdkUpstreamClient(options);

class SdkUpstreamClient implements UpstreamClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly options: UpstreamClientOptions) {}

  async connect(signal?: AbortSignal): Promise<void> {
    await this.connected(signal);
  }

  async listTools(signal?: AbortSignal): Promise<UpstreamTool[]> {
    const client = await this.connected(signal);
    const deadline = AbortSignal.timeout(UPSTREAM_LIST_TIMEOUT_MS);
    const listSignal =
      signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
    const tools: UpstreamTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const result = await client.listTools(
        cursor === undefined ? undefined : { cursor },
        { signal: listSignal, timeout: UPSTREAM_LIST_TIMEOUT_MS },
      );
      for (const tool of result.tools) tools.push(toUpstreamTool(tool));
      cursor = result.nextCursor;
      if (cursor === undefined || cursor === '') return tools;
    }
    throw new Error(
      `MCP upstream tools/list returned more than ${MAX_LIST_PAGES} pages`,
    );
  }

  async callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<UpstreamCallResult> {
    const client = await this.connected(signal);
    const result = await client.callTool(
      { name, arguments: { ...args } },
      undefined,
      { signal, timeout: UPSTREAM_CALL_TIMEOUT_MS },
    );
    return { ...result };
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.connecting = null;
    if (client !== null) await client.close();
  }

  private connected(signal?: AbortSignal): Promise<Client> {
    if (this.client !== null) return Promise.resolve(this.client);
    if (this.connecting === null) {
      const attempt = this.open(signal).finally(() => {
        if (this.connecting === attempt) this.connecting = null;
      });
      this.connecting = attempt;
    }
    return this.connecting;
  }

  private async open(signal?: AbortSignal): Promise<Client> {
    const { endpoint, onToolsChanged, onUnauthorized, onDisconnected } =
      this.options;
    const fetch = createRedirectSafeFetch({
      endpoint,
      onUnauthorized,
      baseFetch: this.options.fetch,
    });
    const transport = createTransport(endpoint, fetch);
    const client = new Client(CLIENT_INFO, {
      // No `elicitation` capability: P1 forwards tools only, and the SDK
      // rejects an upstream elicitation request the client did not declare.
      capabilities: {},
      listChanged: {
        tools: {
          autoRefresh: false,
          onChanged: () => onToolsChanged?.(),
        },
      },
    });
    client.onclose = () => {
      // Only a session that was live and not closed by `close()` reports.
      if (this.client !== client) return;
      this.client = null;
      onDisconnected?.();
    };
    client.onerror = (error) => this.options.onTransportError?.(error);
    try {
      await client.connect(transport, {
        signal,
        timeout: UPSTREAM_CONNECT_TIMEOUT_MS,
      });
    } catch (error: unknown) {
      // Not a swallow: the transport is released and the error rethrown, so
      // a failed handshake leaves no half-open session behind.
      await transport.close();
      throw error;
    }
    this.client = client;
    return client;
  }
}

function createTransport(
  endpoint: UpstreamEndpoint,
  fetch: UpstreamFetch,
): Transport {
  const url = new URL(endpoint.url);
  return endpoint.transport === 'sse'
    ? new SSEClientTransport(url, { fetch, redirectPolicy: 'follow' })
    : new StreamableHTTPClientTransport(url, {
        fetch,
        redirectPolicy: 'follow',
      });
}

function toUpstreamTool(tool: {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}): UpstreamTool {
  return {
    name: tool.name,
    ...(tool.title === undefined ? {} : { title: tool.title }),
    ...(tool.description === undefined
      ? {}
      : { description: tool.description }),
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema === undefined
      ? {}
      : { outputSchema: tool.outputSchema }),
    ...(tool.annotations === undefined
      ? {}
      : { annotations: tool.annotations }),
  };
}

/** Release a response that will not be read, so its connection is freed. */
async function discardBody(response: Response): Promise<void> {
  if (response.body !== null && !response.bodyUsed) {
    await response.body.cancel();
  }
}

function globalFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}
