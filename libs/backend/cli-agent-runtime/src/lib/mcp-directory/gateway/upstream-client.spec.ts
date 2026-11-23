import {
  createRedirectSafeFetch,
  createUpstreamClient,
  MAX_UPSTREAM_REDIRECTS,
  type UpstreamEndpoint,
  type UpstreamFetch,
} from './upstream-client';

type Call = { url: string; init: RequestInit; headers: Headers };

function recordingFetch(
  respond: (call: Call, index: number) => Response | Promise<Response>,
): { fetch: jest.MockedFunction<UpstreamFetch>; calls: Call[] } {
  const calls: Call[] = [];
  const fetch = jest.fn<Promise<Response>, [string | URL, RequestInit?]>(
    async (url, init = {}) => {
      const call = {
        url: typeof url === 'string' ? url : url.href,
        init,
        headers: new Headers(init.headers),
      };
      calls.push(call);
      return respond(call, calls.length - 1);
    },
  );
  return { fetch, calls };
}

function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

function endpointWith(
  overrides: Partial<UpstreamEndpoint> = {},
): UpstreamEndpoint & { resolveHeaders: jest.Mock } {
  let n = 0;
  return {
    transport: 'http',
    url: 'https://mcp.example.com/mcp',
    resolveHeaders: jest.fn(async () => ({
      Authorization: `Bearer token-${++n}`,
    })),
    ...overrides,
  } as UpstreamEndpoint & { resolveHeaders: jest.Mock };
}

describe('createRedirectSafeFetch', () => {
  it('refuses a cross-origin redirect and never sends Authorization there', async () => {
    const { fetch, calls } = recordingFetch(() =>
      redirect(307, 'https://evil.example.net/steal'),
    );
    const safe = createRedirectSafeFetch({
      endpoint: endpointWith(),
      baseFetch: fetch,
    });

    await expect(
      safe('https://mcp.example.com/mcp', { method: 'POST', body: '{}' }),
    ).rejects.toThrow('redirected to another origin');

    expect(calls).toHaveLength(1);
    expect(
      calls.every((c) => new URL(c.url).origin === 'https://mcp.example.com'),
    ).toBe(true);
    expect(calls[0].init.redirect).toBe('manual');
  });

  it('treats a scheme or port change as another origin', async () => {
    for (const target of [
      'http://mcp.example.com/mcp',
      'https://mcp.example.com:8443/mcp',
    ]) {
      const { fetch, calls } = recordingFetch(() => redirect(308, target));
      const safe = createRedirectSafeFetch({
        endpoint: endpointWith(),
        baseFetch: fetch,
      });
      await expect(safe('https://mcp.example.com/mcp')).rejects.toThrow(
        'redirected to another origin',
      );
      expect(calls).toHaveLength(1);
    }
  });

  it('follows a same-origin redirect and re-applies headers', async () => {
    const { fetch, calls } = recordingFetch((_call, index) =>
      index === 0
        ? redirect(307, '/v2/mcp')
        : new Response('ok', { status: 200 }),
    );
    const endpoint = endpointWith();
    const safe = createRedirectSafeFetch({ endpoint, baseFetch: fetch });

    const response = await safe('https://mcp.example.com/mcp', {
      method: 'POST',
      body: '{"jsonrpc":"2.0"}',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe('https://mcp.example.com/v2/mcp');
    expect(calls[1].init.method).toBe('POST');
    expect(calls[1].init.body).toBe('{"jsonrpc":"2.0"}');
    expect(calls[1].init.redirect).toBe('manual');
    // Fresh headers per hop, and the caller's own headers survive.
    expect(endpoint.resolveHeaders).toHaveBeenCalledTimes(2);
    expect(calls[0].headers.get('authorization')).toBe('Bearer token-1');
    expect(calls[1].headers.get('authorization')).toBe('Bearer token-2');
    expect(calls[1].headers.get('content-type')).toBe('application/json');
  });

  it(`follows at most ${MAX_UPSTREAM_REDIRECTS} redirects`, async () => {
    const { fetch, calls } = recordingFetch((_call, index) =>
      redirect(302, `/hop-${index}`),
    );
    const safe = createRedirectSafeFetch({
      endpoint: endpointWith(),
      baseFetch: fetch,
    });

    await expect(safe('https://mcp.example.com/mcp')).rejects.toThrow(
      `exceeded ${MAX_UPSTREAM_REDIRECTS} redirects`,
    );
    expect(calls).toHaveLength(MAX_UPSTREAM_REDIRECTS + 1);
  });

  it('refuses a 302 of a POST, which would drop the JSON-RPC body', async () => {
    const { fetch, calls } = recordingFetch(() => redirect(302, '/other'));
    const safe = createRedirectSafeFetch({
      endpoint: endpointWith(),
      baseFetch: fetch,
    });

    await expect(
      safe('https://mcp.example.com/mcp', { method: 'POST', body: '{}' }),
    ).rejects.toThrow('redirected with status 302');
    expect(calls).toHaveLength(1);
  });

  it('returns a redirect without a Location as is', async () => {
    const { fetch } = recordingFetch(() => new Response(null, { status: 302 }));
    const safe = createRedirectSafeFetch({
      endpoint: endpointWith(),
      baseFetch: fetch,
    });
    expect((await safe('https://mcp.example.com/mcp')).status).toBe(302);
  });

  it('refreshes the credential once on a 401 and retries', async () => {
    const { fetch, calls } = recordingFetch((_call, index) =>
      index === 0
        ? new Response(null, { status: 401 })
        : new Response('ok', { status: 200 }),
    );
    const refreshAuth = jest.fn(async () => true);
    const onUnauthorized = jest.fn();
    const safe = createRedirectSafeFetch({
      endpoint: endpointWith({ refreshAuth }),
      baseFetch: fetch,
      onUnauthorized,
    });

    const response = await safe('https://mcp.example.com/mcp', {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(calls[1].headers.get('authorization')).toBe('Bearer token-2');
  });

  it('reports a 401 that a refresh cannot fix', async () => {
    const { fetch, calls } = recordingFetch(
      () => new Response(null, { status: 401 }),
    );
    const refreshAuth = jest.fn(async () => true);
    const onUnauthorized = jest.fn();
    const safe = createRedirectSafeFetch({
      endpoint: endpointWith({ refreshAuth }),
      baseFetch: fetch,
      onUnauthorized,
    });

    expect((await safe('https://mcp.example.com/mcp')).status).toBe(401);
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('reports a 401 at once when the endpoint cannot refresh', async () => {
    const { fetch, calls } = recordingFetch(
      () => new Response(null, { status: 401 }),
    );
    const onUnauthorized = jest.fn();
    const safe = createRedirectSafeFetch({
      endpoint: endpointWith(),
      baseFetch: fetch,
      onUnauthorized,
    });

    expect((await safe('https://mcp.example.com/mcp')).status).toBe(401);
    expect(calls).toHaveLength(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

/**
 * A minimal streamable-HTTP MCP server behind a fake `fetch`. Exercises the
 * real SDK client, which also proves Jest resolves the SDK subpath exports.
 */
function fakeMcpServer(): ReturnType<typeof recordingFetch> {
  return recordingFetch(async (call) => {
    const method = (call.init.method ?? 'GET').toUpperCase();
    if (method === 'GET') return new Response(null, { status: 405 });
    if (method === 'DELETE') return new Response(null, { status: 200 });
    const message = JSON.parse(String(call.init.body)) as {
      id?: number;
      method: string;
      params?: { protocolVersion?: string; cursor?: string; name?: string };
    };
    if (message.id === undefined) return new Response(null, { status: 202 });
    const json = (result: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }), {
        status: 200,
        headers: { 'content-type': 'application/json', ...headers },
      });
    switch (message.method) {
      case 'initialize':
        return json(
          {
            protocolVersion: message.params?.protocolVersion,
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'fake', version: '1.0.0' },
          },
          { 'mcp-session-id': 'session-1' },
        );
      case 'tools/list':
        return message.params?.cursor === undefined
          ? json({
              tools: [{ name: 'first', inputSchema: { type: 'object' } }],
              nextCursor: 'page-2',
            })
          : json({
              tools: [
                {
                  name: 'second',
                  description: 'Second tool',
                  inputSchema: { type: 'object' },
                },
              ],
            });
      case 'tools/call':
        return json({
          content: [{ type: 'text', text: `called ${message.params?.name}` }],
        });
      default:
        return new Response(null, { status: 404 });
    }
  });
}

describe('createUpstreamClient (SDK over the redirect-safe fetch)', () => {
  it('connects, lists every page and calls a tool with per-request headers', async () => {
    const { fetch, calls } = fakeMcpServer();
    const endpoint = endpointWith();
    const client = createUpstreamClient({ endpoint, fetch });

    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['first', 'second']);
    expect(tools[1]).toEqual({
      name: 'second',
      description: 'Second tool',
      inputSchema: { type: 'object' },
    });

    const result = await client.callTool('first', { a: 1 });
    expect(result['content']).toEqual([{ type: 'text', text: 'called first' }]);

    await client.close();

    expect(calls.length).toBeGreaterThan(3);
    for (const call of calls) {
      expect(call.init.redirect).toBe('manual');
      expect(call.headers.get('authorization')).toMatch(/^Bearer token-\d+$/);
    }
    // One header resolution per request: the token is never cached.
    expect(endpoint.resolveHeaders).toHaveBeenCalledTimes(calls.length);
  });

  it('shares one connect between concurrent callers', async () => {
    const { fetch, calls } = fakeMcpServer();
    const client = createUpstreamClient({ endpoint: endpointWith(), fetch });

    await Promise.all([client.connect(), client.connect(), client.listTools()]);

    const initializes = calls.filter(
      (c) =>
        typeof c.init.body === 'string' &&
        c.init.body.includes('"method":"initialize"'),
    );
    expect(initializes).toHaveLength(1);
    await client.close();
  });

  it('fails the connect when the server redirects to another origin', async () => {
    const { fetch, calls } = recordingFetch(() =>
      redirect(307, 'https://evil.example.net/mcp'),
    );
    const client = createUpstreamClient({ endpoint: endpointWith(), fetch });

    await expect(client.connect()).rejects.toThrow(
      'redirected to another origin',
    );
    expect(calls.some((c) => c.url.includes('evil.example.net'))).toBe(false);
  });
});

describe('createUpstreamClient session events', () => {
  it('does not report a disconnect for its own close, and reconnects after it', async () => {
    const { fetch, calls } = fakeMcpServer();
    const onDisconnected = jest.fn();
    const client = createUpstreamClient({
      endpoint: endpointWith(),
      fetch,
      onDisconnected,
    });

    await client.connect();
    await client.close();
    await client.listTools();

    expect(onDisconnected).not.toHaveBeenCalled();
    const initializes = calls.filter(
      (c) =>
        typeof c.init.body === 'string' &&
        c.init.body.includes('"method":"initialize"'),
    );
    expect(initializes).toHaveLength(2);
    await client.close();
  });
});
