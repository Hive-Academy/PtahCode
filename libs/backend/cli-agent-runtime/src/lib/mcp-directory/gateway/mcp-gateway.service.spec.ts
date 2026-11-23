import type { McpGatewayScope } from '@ptah-extension/platform-core';
import type { EffectiveCapabilitySet } from '@ptah-extension/shared';
import {
  GATEWAY_BACKOFF_INITIAL_MS,
  GATEWAY_COLD_START_BUDGET_MS,
  GATEWAY_COLD_START_TIMEOUT_DETAIL,
  GATEWAY_LIST_REFRESH_MS,
  GATEWAY_POLL_MS,
  McpGateway,
  type McpGatewayDeps,
} from './mcp-gateway.service';
import type {
  GatewayEndpoint,
  GatewayRemoteEndpoint,
  GatewayServerSet,
  GatewayStdioEndpoint,
} from './server-sources';
import {
  STDIO_RESTART_LIMIT_DETAIL,
  type StdioClientOptions,
  type StdioUpstreamClient,
} from './stdio-server-host';
import type {
  UpstreamClient,
  UpstreamClientOptions,
  UpstreamTool,
} from './upstream-client';

const ROOT = '/ws/root';
const SESSION: McpGatewayScope = {
  kind: 'session',
  capability: 'privileged',
  workspaceRoot: ROOT,
  gatewayApproval: true,
};
const SECRET_URL_KEY = 'SMITHERY-SECRET-KEY';
const BEARER = 'bearer-secret-token';

function endpoint(
  serverName: string,
  overrides: Partial<GatewayRemoteEndpoint> = {},
): GatewayRemoteEndpoint {
  const url = overrides.url ?? `https://${serverName}.example.com/mcp`;
  return {
    key: overrides.key ?? url,
    serverName,
    origin: 'intent',
    baseAlias: serverName,
    authenticated: true,
    transport: 'http',
    url,
    resolveHeaders: async () => ({ Authorization: `Bearer ${BEARER}` }),
    ...overrides,
  };
}

function stdioEndpoint(serverName: string): GatewayStdioEndpoint {
  return {
    key: `stdio:${serverName}`,
    serverName,
    origin: 'intent',
    baseAlias: serverName,
    authenticated: false,
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: { API_TOKEN: 'stdio-secret' },
    cwd: ROOT,
  };
}

interface FakeStdioHost {
  createClient: jest.Mock<StdioUpstreamClient, [StdioClientOptions]>;
  dispose: jest.Mock<Promise<void>, []>;
  clients: Map<string, jest.Mocked<StdioUpstreamClient>>;
  options: Map<string, StdioClientOptions>;
}

function fakeStdioHost(
  behaviour: Record<string, FakeBehaviour> = {},
): FakeStdioHost {
  const clients = new Map<string, jest.Mocked<StdioUpstreamClient>>();
  const options = new Map<string, StdioClientOptions>();
  const createClient = jest.fn((opts: StdioClientOptions) => {
    const fake = behaviour[opts.serverName] ?? {};
    const client = {
      connect: jest.fn(async () => undefined),
      listTools: jest.fn(fake.listTools ?? (async () => [tool('search')])),
      callTool: jest.fn(
        fake.callTool ??
          (async () => ({ content: [{ type: 'text', text: 'ok' }] })),
      ),
      close: jest.fn(async () => undefined),
      stderrTail: jest.fn(() => []),
      running: true,
    } as unknown as jest.Mocked<StdioUpstreamClient>;
    clients.set(opts.serverName, client);
    options.set(opts.serverName, opts);
    return client;
  });
  return {
    createClient,
    dispose: jest.fn(async () => undefined),
    clients,
    options,
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function tool(name: string, description = `${name} tool`): UpstreamTool {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  };
}

type FakeBehaviour = Partial<
  Pick<UpstreamClient, 'listTools' | 'callTool' | 'close'>
>;

interface Harness {
  gateway: McpGateway;
  sources: { list: jest.Mock; invalidate: jest.Mock };
  capabilities: { resolve: jest.Mock };
  factory: jest.Mock;
  options: Map<string, UpstreamClientOptions>;
  clients: Map<string, jest.Mocked<UpstreamClient>>;
  logs: unknown[];
  setEndpoints(next: GatewayEndpoint[], fileNames?: string[]): void;
  setPolicy(policy: Partial<EffectiveCapabilitySet>): void;
}

function harness(
  endpoints: GatewayEndpoint[],
  behaviour: Record<string, FakeBehaviour> = {},
  extraDeps: Partial<McpGatewayDeps> = {},
): Harness {
  let set: GatewayServerSet = { endpoints, servedFileServerNames: [] };
  let policy: Partial<EffectiveCapabilitySet> = {
    status: 'verified',
    ptahEnabled: true,
    deniedMcpServers: [],
    approvedProjectMcpServers: [],
  };
  const sources = {
    list: jest.fn(async () => set),
    invalidate: jest.fn(),
  };
  const capabilities = {
    resolve: jest.fn(async () => policy as EffectiveCapabilitySet),
  };
  const options = new Map<string, UpstreamClientOptions>();
  const clients = new Map<string, jest.Mocked<UpstreamClient>>();
  const factory = jest.fn((opts: UpstreamClientOptions) => {
    const url = opts.endpoint.url;
    const name = new URL(url).hostname.split('.')[0];
    const fake = behaviour[name] ?? {};
    const client: jest.Mocked<UpstreamClient> = {
      connect: jest.fn(async () => undefined),
      listTools: jest.fn(fake.listTools ?? (async () => [tool('search')])),
      callTool: jest.fn(
        fake.callTool ??
          (async () => ({ content: [{ type: 'text', text: 'ok' }] })),
      ),
      close: jest.fn(fake.close ?? (async () => undefined)),
    };
    options.set(name, opts);
    clients.set(name, client);
    return client;
  });
  const logs: unknown[] = [];
  const logger = {
    debug: (message: string, context?: Record<string, unknown>) =>
      logs.push([message, context]),
    warn: (message: string, context?: Record<string, unknown>) =>
      logs.push([message, context]),
  };
  const deps: McpGatewayDeps = {
    sources,
    capabilities,
    clientFactory: factory,
    logger,
    ...extraDeps,
  };
  return {
    gateway: new McpGateway(deps),
    sources,
    capabilities,
    factory,
    options,
    clients,
    logs,
    setEndpoints(next, fileNames = []) {
      set = { endpoints: next, servedFileServerNames: fileNames };
    },
    setPolicy(next) {
      policy = { ...policy, ...next };
    },
  };
}

function delayed<T>(ms: number, value: T): () => Promise<T> {
  return () => new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function failing(message: string): () => Promise<never> {
  return () => Promise.reject(new Error(message));
}

describe('McpGateway', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('caller policy', () => {
    it.each<[string, McpGatewayScope]>([
      [
        'session without gatewayApproval',
        { ...SESSION, gatewayApproval: false },
      ],
      [
        'internal-query without includeConnectors',
        {
          kind: 'internal-query',
          capability: 'privileged',
          workspaceRoot: ROOT,
        },
      ],
      [
        'read-only agent',
        { kind: 'agent', capability: 'read-only', workspaceRoot: ROOT },
      ],
      [
        'workspace slot',
        { kind: 'workspace', capability: 'privileged', workspaceRoot: ROOT },
      ],
      [
        'home slot',
        { kind: 'home', capability: 'privileged', workspaceRoot: ROOT },
      ],
      [
        'scope with no workspace root',
        { ...SESSION, workspaceRoot: undefined },
      ],
    ])(
      '%s sees and calls no gateway tools, and nothing connects',
      async (_label, scope) => {
        const h = harness([endpoint('zernio')]);
        await expect(h.gateway.listTools(scope)).resolves.toEqual([]);
        const result = await h.gateway.callTool(scope, 'zernio__search', {});
        expect(result.isError).toBe(true);
        expect(h.gateway.status(scope)).toEqual([]);
        expect(h.factory).not.toHaveBeenCalled();
        expect(h.sources.list).not.toHaveBeenCalled();
      },
    );

    it.each<[string, McpGatewayScope]>([
      ['session with gatewayApproval', SESSION],
      [
        'internal-query with includeConnectors',
        {
          kind: 'internal-query',
          capability: 'privileged',
          workspaceRoot: ROOT,
          includeConnectors: true,
        },
      ],
      [
        'privileged agent lane',
        { kind: 'agent', capability: 'privileged', workspaceRoot: ROOT },
      ],
    ])('%s sees gateway tools', async (_label, scope) => {
      const h = harness([endpoint('zernio')]);
      const tools = await h.gateway.listTools(scope);
      expect(tools.map((t) => t.name)).toEqual(['zernio__search']);
    });
  });

  describe('listTools', () => {
    it('names, prefixes and passes schemas through', async () => {
      const h = harness([endpoint('zernio')]);
      const [listed] = await h.gateway.listTools(SESSION);
      expect(listed).toEqual({
        name: 'zernio__search',
        description: '[zernio via Ptah] search tool',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
        annotations: { readOnlyHint: true },
      });
    });

    it('gives the bare alias to the smaller key and suffixes the other', async () => {
      const h = harness([
        endpoint('zernio', {
          key: 'https://b.example.com/mcp',
          url: 'https://zernio.example.com/mcp',
        }),
        endpoint('zernio2', {
          key: 'https://a.example.com/mcp',
          url: 'https://zernio2.example.com/mcp',
          baseAlias: 'zernio',
        }),
      ]);
      const names = (await h.gateway.listTools(SESSION)).map((t) => t.name);
      expect(names).toHaveLength(2);
      expect(names).toContain('zernio__search');
      expect(names.find((n) => n !== 'zernio__search')).toMatch(
        /^zernio_[0-9a-f]{4}__search$/,
      );
    });

    it('leaves denied servers out and never connects them', async () => {
      const h = harness([endpoint('zernio'), endpoint('denied')]);
      h.setPolicy({ deniedMcpServers: ['denied'] });
      const names = (await h.gateway.listTools(SESSION)).map((t) => t.name);
      expect(names).toEqual(['zernio__search']);
      expect(h.clients.has('denied')).toBe(false);
    });

    it('serves nothing under an unverified policy', async () => {
      const h = harness([endpoint('zernio')]);
      h.setPolicy({ status: 'unverified' });
      await expect(h.gateway.listTools(SESSION)).resolves.toEqual([]);
      expect(h.factory).not.toHaveBeenCalled();
    });

    it('never proxies a server named ptah', async () => {
      const h = harness([endpoint('ptah'), endpoint('zernio')]);
      const names = (await h.gateway.listTools(SESSION)).map((t) => t.name);
      expect(names).toEqual(['zernio__search']);
      expect(h.clients.has('ptah')).toBe(false);
    });

    it('keeps listing when one server fails', async () => {
      const h = harness([endpoint('broken'), endpoint('zernio')], {
        broken: { listTools: failing('boom') },
      });
      const names = (await h.gateway.listTools(SESSION)).map((t) => t.name);
      expect(names).toEqual(['zernio__search']);
      expect(h.gateway.status(SESSION)).toEqual([
        { key: 'broken', display: 'broken', status: 'failed', detail: 'boom' },
        { key: 'zernio', display: 'zernio', status: 'connected' },
      ]);
    });

    it('closes a server that leaves its source', async () => {
      const h = harness([endpoint('zernio'), endpoint('gone')]);
      await h.gateway.listTools(SESSION);
      h.setEndpoints([endpoint('zernio')]);
      await h.gateway.listTools(SESSION);
      expect(h.clients.get('gone')?.close).toHaveBeenCalled();
      expect(h.clients.get('zernio')?.close).not.toHaveBeenCalled();
    });
  });

  describe('host-name registry', () => {
    it('fails closed before registration', () => {
      const h = harness([]);
      expect(h.gateway.isGatewayTool('ptah_workspace_analyze')).toBe(true);
      expect(h.gateway.isGatewayTool('mcp__ptah__anything')).toBe(true);
    });

    it('treats registered names, bare or prefixed, as host tools', () => {
      const h = harness([]);
      h.gateway.registerHostToolNames(['ptah_workspace_analyze']);
      expect(h.gateway.isGatewayTool('ptah_workspace_analyze')).toBe(false);
      expect(h.gateway.isGatewayTool('mcp__ptah__ptah_workspace_analyze')).toBe(
        false,
      );
      expect(h.gateway.isGatewayTool('mcp__ptah__zernio__search')).toBe(true);
      expect(h.gateway.isGatewayTool('never_seen')).toBe(true);
    });

    it('drops a tool whose generated name equals a host tool name', async () => {
      const h = harness([endpoint('zernio')], {
        zernio: { listTools: async () => [tool('search'), tool('post')] },
      });
      h.gateway.registerHostToolNames(['zernio__search']);
      const names = (await h.gateway.listTools(SESSION)).map((t) => t.name);
      expect(names).toEqual(['zernio__post']);
    });
  });

  describe('cold start', () => {
    it('lists an upstream that answers at 8s, omits one at 15s, then announces it', async () => {
      jest.useFakeTimers();
      const h = harness([endpoint('fast'), endpoint('slow')], {
        fast: { listTools: delayed(8_000, [tool('a')]) },
        slow: { listTools: delayed(15_000, [tool('b')]) },
      });
      const changed = jest.fn();
      h.gateway.onToolsChanged(changed);

      let listed: string[] | undefined;
      void h.gateway.listTools(SESSION).then((tools) => {
        listed = tools.map((t) => t.name);
      });
      await jest.advanceTimersByTimeAsync(8_000);
      expect(listed).toBeUndefined();
      await jest.advanceTimersByTimeAsync(GATEWAY_COLD_START_BUDGET_MS - 8_000);
      expect(listed).toEqual(['fast__a']);
      expect(h.gateway.status(SESSION)).toEqual([
        { key: 'fast', display: 'fast', status: 'connected' },
        {
          key: 'slow',
          display: 'slow',
          status: 'pending',
          detail: GATEWAY_COLD_START_TIMEOUT_DETAIL,
        },
      ]);
      expect(changed).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(3_000);
      expect(changed).toHaveBeenCalledTimes(1);

      // Later lists never wait.
      const again = await h.gateway.listTools(SESSION);
      expect(again.map((t) => t.name)).toEqual(['fast__a', 'slow__b']);
      h.gateway.dispose();
    });

    it('stops waiting when the caller aborts', async () => {
      jest.useFakeTimers();
      const h = harness([endpoint('slow')], {
        slow: { listTools: delayed(15_000, [tool('b')]) },
      });
      const controller = new AbortController();
      const pending = h.gateway.listTools(SESSION, controller.signal);
      await jest.advanceTimersByTimeAsync(1_000);
      controller.abort();
      await expect(pending).resolves.toEqual([]);
      h.gateway.dispose();
    });

    it('an aborted first list does not use up the cold wait (M6)', async () => {
      jest.useFakeTimers();
      const h = harness([endpoint('slow')], {
        slow: { listTools: delayed(5_000, [tool('b')]) },
      });
      const controller = new AbortController();
      controller.abort();
      await expect(
        h.gateway.listTools(SESSION, controller.signal),
      ).resolves.toEqual([]);

      let listed: string[] | undefined;
      void h.gateway.listTools(SESSION).then((tools) => {
        listed = tools.map((t) => t.name);
      });
      await jest.advanceTimersByTimeAsync(5_000);
      // The second list waited for the in-flight load instead of omitting it.
      expect(listed).toEqual(['slow__b']);
      expect(h.clients.get('slow')?.listTools).toHaveBeenCalledTimes(1);
      h.gateway.dispose();
    });
  });

  describe('pre-warm (M5)', () => {
    it('loads the pre-warm roots after the first listener subscribes, without blocking it', async () => {
      jest.useFakeTimers();
      const prewarmRoots = jest.fn(() => [ROOT]);
      const h = harness(
        [endpoint('slow')],
        { slow: { listTools: delayed(10_000, [tool('b')]) } },
        { prewarmRoots },
      );

      const subscription = h.gateway.onToolsChanged(jest.fn());
      // Subscribing returned before anything was read or connected.
      expect(prewarmRoots).not.toHaveBeenCalled();
      expect(h.sources.list).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(0);
      expect(prewarmRoots).toHaveBeenCalledTimes(1);
      expect(h.sources.list).toHaveBeenCalledWith(ROOT);
      expect(h.clients.get('slow')?.listTools).toHaveBeenCalledTimes(1);

      // A second subscriber does not pre-warm again.
      h.gateway.onToolsChanged(jest.fn());
      await jest.advanceTimersByTimeAsync(10_000);
      expect(prewarmRoots).toHaveBeenCalledTimes(1);

      // The first list finds the tools loaded and does not list again.
      const tools = await h.gateway.listTools(SESSION);
      expect(tools.map((t) => t.name)).toEqual(['slow__b']);
      expect(h.clients.get('slow')?.listTools).toHaveBeenCalledTimes(1);
      subscription.dispose();
      h.gateway.dispose();
    });

    it('logs and carries on when the pre-warm roots cannot be read', async () => {
      jest.useFakeTimers();
      const h = harness(
        [endpoint('zernio')],
        {},
        {
          prewarmRoots: () => {
            throw new Error('no workspace provider');
          },
        },
      );
      h.gateway.onToolsChanged(jest.fn());
      await jest.advanceTimersByTimeAsync(0);

      expect(h.logs).toContainEqual([
        'MCP gateway pre-warm failed',
        { error: 'Error' },
      ]);
      const tools = await h.gateway.listTools(SESSION);
      expect(tools.map((t) => t.name)).toEqual(['zernio__search']);
      h.gateway.dispose();
    });
  });

  describe('failures', () => {
    it('backs off 1s doubling and fails calls fast while backing off', async () => {
      jest.useFakeTimers();
      const h = harness([endpoint('broken')], {
        broken: { listTools: failing('down') },
      });
      await h.gateway.listTools(SESSION);
      const client = h.clients.get('broken');
      expect(client?.listTools).toHaveBeenCalledTimes(1);

      await h.gateway.listTools(SESSION);
      expect(client?.listTools).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(GATEWAY_BACKOFF_INITIAL_MS);
      await h.gateway.listTools(SESSION);
      await jest.advanceTimersByTimeAsync(0);
      expect(client?.listTools).toHaveBeenCalledTimes(2);

      // Second failure: 2s back-off, 1s is not enough.
      await jest.advanceTimersByTimeAsync(GATEWAY_BACKOFF_INITIAL_MS);
      await h.gateway.listTools(SESSION);
      expect(client?.listTools).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(GATEWAY_BACKOFF_INITIAL_MS);
      await h.gateway.listTools(SESSION);
      await jest.advanceTimersByTimeAsync(0);
      expect(client?.listTools).toHaveBeenCalledTimes(3);
      h.gateway.dispose();
    });

    it('marks a server needs-auth after an unrecoverable 401 and invalidates sources', async () => {
      const h = harness([endpoint('zernio')], {
        zernio: {
          listTools: async () => {
            h.options.get('zernio')?.onUnauthorized?.();
            throw new Error('Unauthorized');
          },
        },
      });
      await h.gateway.listTools(SESSION);
      expect(h.sources.invalidate).toHaveBeenCalled();
      expect(h.gateway.status(SESSION)).toEqual([
        {
          key: 'zernio',
          display: 'zernio',
          status: 'needs-auth',
          detail: 'reconnect in Settings > Connectors',
        },
      ]);
    });

    it('forces the endpoint refresh through the client proxy', async () => {
      const refreshAuth = jest.fn(async () => true);
      const h = harness([endpoint('zernio', { refreshAuth })]);
      await h.gateway.listTools(SESSION);
      await expect(
        h.options.get('zernio')?.endpoint.refreshAuth?.(),
      ).resolves.toBe(true);
      expect(refreshAuth).toHaveBeenCalledTimes(1);
      await expect(
        h.options.get('zernio')?.endpoint.resolveHeaders(),
      ).resolves.toEqual({ Authorization: `Bearer ${BEARER}` });
    });
  });

  describe('callTool', () => {
    it('forwards to the upstream name with the signal and passes the result through', async () => {
      const h = harness([endpoint('zernio')], {
        zernio: {
          callTool: async () => ({
            content: [{ type: 'text', text: 'posted' }],
            structuredContent: { id: 1 },
            _meta: { extra: true },
          }),
        },
      });
      await h.gateway.listTools(SESSION);
      const controller = new AbortController();
      const result = await h.gateway.callTool(
        SESSION,
        'mcp__ptah__zernio__search',
        { q: 'x' },
        controller.signal,
      );
      expect(h.clients.get('zernio')?.callTool).toHaveBeenCalledWith(
        'search',
        { q: 'x' },
        controller.signal,
      );
      expect(result).toEqual({
        content: [{ type: 'text', text: 'posted' }],
        structuredContent: { id: 1 },
        _meta: { extra: true },
      });
    });

    it('re-lists once on an unknown name', async () => {
      const h = harness([endpoint('zernio')]);
      const result = await h.gateway.callTool(SESSION, 'zernio__search', {});
      expect(result.isError).toBeUndefined();
      expect(h.sources.list).toHaveBeenCalledTimes(1);
      const unknown = await h.gateway.callTool(SESSION, 'zernio__nope', {});
      expect(unknown).toEqual({
        content: [{ type: 'text', text: 'Unknown gateway tool: zernio__nope' }],
        isError: true,
      });
    });

    it('turns an upstream failure into an isError result with the URL redacted', async () => {
      const url = `https://zernio.example.com/mcp?api_key=${SECRET_URL_KEY}`;
      const h = harness([endpoint('zernio', { url, key: url })], {
        zernio: { callTool: failing(`fetch to ${url} failed`) },
      });
      await h.gateway.listTools(SESSION);
      const result = await h.gateway.callTool(SESSION, 'zernio__search', {});
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain(SECRET_URL_KEY);
      expect(result.content).toEqual([
        { type: 'text', text: 'zernio error: fetch to <server> failed' },
      ]);
      expect(h.gateway.status(SESSION)[0]?.status).toBe('failed');
    });

    it('keeps the server up after a JSON-RPC tool error', async () => {
      const rpcError = Object.assign(new Error('bad params'), { code: -32602 });
      const h = harness([endpoint('zernio')], {
        zernio: { callTool: () => Promise.reject(rpcError) },
      });
      await h.gateway.listTools(SESSION);
      const result = await h.gateway.callTool(SESSION, 'zernio__search', {});
      expect(result.isError).toBe(true);
      expect(h.gateway.status(SESSION)[0]?.status).toBe('connected');
    });

    it('refuses a server turned off after the list', async () => {
      const h = harness([endpoint('zernio')]);
      await h.gateway.listTools(SESSION);
      h.setPolicy({ deniedMcpServers: ['zernio'] });
      const result = await h.gateway.callTool(SESSION, 'zernio__search', {});
      expect(result.isError).toBe(true);
      expect(h.clients.get('zernio')?.callTool).not.toHaveBeenCalled();
    });
  });

  describe('onToolsChanged', () => {
    it('fires when an upstream list_changed brings a different list', async () => {
      let tools = [tool('search')];
      const h = harness([endpoint('zernio')], {
        zernio: { listTools: async () => tools },
      });
      const changed = jest.fn();
      h.gateway.onToolsChanged(changed);
      await h.gateway.listTools(SESSION);
      tools = [tool('search'), tool('post')];
      h.options.get('zernio')?.onToolsChanged?.();
      await new Promise((resolve) => setImmediate(resolve));
      expect(changed).toHaveBeenCalledTimes(1);
      h.gateway.dispose();
    });

    it('polls the known roots and fires when a connector is enabled or disabled', async () => {
      jest.useFakeTimers();
      const h = harness([endpoint('zernio'), endpoint('other')]);
      const changed = jest.fn();
      const subscription = h.gateway.onToolsChanged(changed);
      await h.gateway.listTools(SESSION);

      h.setPolicy({ deniedMcpServers: ['other'] });
      await jest.advanceTimersByTimeAsync(GATEWAY_POLL_MS);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(h.clients.get('other')?.close).toHaveBeenCalled();

      subscription.dispose();
      h.setPolicy({ deniedMcpServers: [] });
      await jest.advanceTimersByTimeAsync(GATEWAY_POLL_MS * 2);
      expect(changed).toHaveBeenCalledTimes(1);
      h.gateway.dispose();
    });

    it('retries a needs-auth server on the poll and fires when the new token works', async () => {
      jest.useFakeTimers();
      let authorized = false;
      const h = harness([endpoint('zernio')], {
        zernio: {
          listTools: async () => {
            if (authorized) return [tool('search')];
            h.options.get('zernio')?.onUnauthorized?.();
            throw new Error('Unauthorized');
          },
        },
      });
      const changed = jest.fn();
      h.gateway.onToolsChanged(changed);
      await expect(h.gateway.listTools(SESSION)).resolves.toEqual([]);
      authorized = true;
      await jest.advanceTimersByTimeAsync(GATEWAY_POLL_MS);
      expect(h.gateway.status(SESSION)[0]?.status).toBe('connected');
      expect(changed).toHaveBeenCalled();
      h.gateway.dispose();
    });
  });

  describe('servedFileServerNames', () => {
    it('returns the sources names without ptah', async () => {
      const h = harness([]);
      h.setEndpoints([], ['ptah', 'zernio-file']);
      await expect(h.gateway.servedFileServerNames(ROOT)).resolves.toEqual([
        'zernio-file',
      ]);
    });
  });

  it('never logs a token, the URL or its key', async () => {
    const url = `https://zernio.example.com/mcp?api_key=${SECRET_URL_KEY}`;
    const h = harness(
      [endpoint('zernio', { url, key: url }), endpoint('broken')],
      {
        zernio: { callTool: failing(`401 at ${url} with Bearer ${BEARER}`) },
        broken: {
          listTools: failing(
            `cannot reach ${'https://broken.example.com/mcp'}`,
          ),
        },
      },
    );
    await h.gateway.listTools(SESSION);
    await h.gateway.callTool(SESSION, 'zernio__search', {});
    expect(h.logs.length).toBeGreaterThan(0);
    const logged = JSON.stringify(h.logs);
    expect(logged).not.toContain(BEARER);
    expect(logged).not.toContain(SECRET_URL_KEY);
    expect(logged).not.toContain('example.com');
  });

  describe('stdio servers (C10)', () => {
    it('serves a stdio endpoint through the stdio host, never the HTTP factory', async () => {
      const host = fakeStdioHost();
      const h = harness([stdioEndpoint('local')], {}, { stdioHost: host });
      const names = (await h.gateway.listTools(SESSION)).map((t) => t.name);

      expect(names).toEqual(['local__search']);
      expect(h.factory).not.toHaveBeenCalled();
      expect(host.createClient).toHaveBeenCalledTimes(1);
      const [opts] = host.createClient.mock.calls[0];
      expect(opts.serverName).toBe('local');
      expect(opts.spec).toMatchObject({
        command: 'node',
        args: ['server.js'],
        cwd: ROOT,
      });

      const result = await h.gateway.callTool(SESSION, 'local__search', {});
      expect(result.isError).toBeUndefined();
      expect(host.clients.get('local')?.callTool).toHaveBeenCalledWith(
        'search',
        {},
        undefined,
      );
    });

    it('never refreshes a connected stdio list by age, unlike a remote one', async () => {
      let now = 1_000;
      const host = fakeStdioHost();
      const h = harness(
        [stdioEndpoint('local'), endpoint('zernio')],
        {},
        { stdioHost: host, now: () => now },
      );
      await h.gateway.listTools(SESSION);
      now += GATEWAY_LIST_REFRESH_MS + 1;
      await h.gateway.listTools(SESSION);
      await settle();

      expect(host.clients.get('local')?.listTools).toHaveBeenCalledTimes(1);
      expect(h.clients.get('zernio')?.listTools).toHaveBeenCalledTimes(2);
    });

    it('re-lists a stdio server when it reports a change', async () => {
      const host = fakeStdioHost();
      const h = harness([stdioEndpoint('local')], {}, { stdioHost: host });
      await h.gateway.listTools(SESSION);
      host.options.get('local')?.onToolsChanged?.();
      await settle();
      expect(host.clients.get('local')?.listTools).toHaveBeenCalledTimes(2);
    });

    it('reports a stdio server that used up its restarts as failed', async () => {
      const host = fakeStdioHost({
        local: { listTools: failing(STDIO_RESTART_LIMIT_DETAIL) },
      });
      const h = harness(
        [stdioEndpoint('local'), endpoint('zernio')],
        {},
        { stdioHost: host },
      );
      const names = (await h.gateway.listTools(SESSION)).map((t) => t.name);

      expect(names).toEqual(['zernio__search']);
      expect(h.gateway.status(SESSION)).toEqual(
        expect.arrayContaining([
          {
            key: 'local',
            display: 'local',
            status: 'failed',
            detail: STDIO_RESTART_LIMIT_DETAIL,
          },
        ]),
      );
      expect(JSON.stringify(h.logs)).not.toContain('stdio-secret');
    });

    it('closes a stdio client its source no longer serves', async () => {
      const host = fakeStdioHost();
      const h = harness([stdioEndpoint('local')], {}, { stdioHost: host });
      await h.gateway.listTools(SESSION);
      h.setEndpoints([]);
      await h.gateway.listTools(SESSION);
      expect(host.clients.get('local')?.close).toHaveBeenCalled();
    });

    it('stops the stdio host on dispose', async () => {
      const host = fakeStdioHost();
      const h = harness([stdioEndpoint('local')], {}, { stdioHost: host });
      await h.gateway.listTools(SESSION);
      h.gateway.dispose();
      expect(host.clients.get('local')?.close).toHaveBeenCalled();
      expect(host.dispose).toHaveBeenCalledTimes(1);
    });
  });

  it('closes every upstream and serves nothing after dispose', async () => {
    const h = harness([endpoint('zernio')]);
    await h.gateway.listTools(SESSION);
    h.gateway.dispose();
    expect(h.clients.get('zernio')?.close).toHaveBeenCalled();
    await expect(h.gateway.listTools(SESSION)).resolves.toEqual([]);
  });
});
