import {
  discoverAuthorizationServer,
  discoverAuthServerMetadata,
  parseResourceMetadataChallenge,
  parseScopeChallenge,
  registerClient,
  selectAuthorizationScope,
  OAuthDiscoveryError,
  OAUTH_DISCOVERY_ERROR_NAME,
  OAuthTimeoutError,
  OAUTH_TIMEOUT_ERROR_NAME,
  withRequestTimeout,
  type FetchLike,
} from './mcp-oauth-metadata';
import {
  HIGGSFIELD_AS,
  HIGGSFIELD_AS_PATH_INSERT,
  HIGGSFIELD_AS_ROOT,
  HIGGSFIELD_AUTHORIZE,
  HIGGSFIELD_CHALLENGE,
  HIGGSFIELD_MCP_URL,
  HIGGSFIELD_PRM_URL,
  HIGGSFIELD_RESOURCE_SCOPE,
  higgsfieldFetch,
} from './__fixtures__/higgsfield-oauth.fixture';

/**
 * A request that never answers on its own and settles only when its signal
 * aborts, which is how the real `fetch` behaves against a silent server.
 * `AbortSignal.timeout` runs on Node's internal timers, which Jest's fake
 * timers do not drive, so the timeout specs use real timers with small bounds.
 */
function hangingFetch(seen: string[]): FetchLike {
  return (url, init) => {
    seen.push(url);
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(init.signal?.reason),
        { once: true },
      );
    });
  };
}

function jsonResp(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function notFound() {
  return {
    ok: false,
    status: 404,
    json: async () => ({}),
    text: async () => '',
  };
}

/** A 401 carrying an RFC 9728 §5.1 `WWW-Authenticate` challenge. */
function challenge401(wwwAuthenticate: string) {
  return {
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => '',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'www-authenticate' ? wwwAuthenticate : null,
    },
  };
}

/**
 * The Smithery shapes measured on 2026-09-03 (TASK_2026_375 context.md F2).
 * Every document at an origin root is a 404; the real ones live under the path.
 */
const SMITHERY_PRM_PATH =
  'https://server.smithery.ai/.well-known/oauth-protected-resource/hubspot/mcp';
const SMITHERY_AS_PATH_INSERT =
  'https://auth.smithery.ai/.well-known/oauth-authorization-server/hubspot';

function smitheryFetch(seen: string[]): FetchLike {
  return async (url) => {
    seen.push(url);
    if (url === SMITHERY_PRM_PATH) {
      return jsonResp({
        resource: 'https://server.smithery.ai/hubspot/mcp',
        authorization_servers: ['https://auth.smithery.ai/hubspot'],
      });
    }
    if (url === SMITHERY_AS_PATH_INSERT) {
      return jsonResp({
        issuer: 'https://auth.smithery.ai/hubspot',
        authorization_endpoint: 'https://auth.smithery.ai/hubspot/authorize',
        token_endpoint: 'https://auth.smithery.ai/hubspot/token',
        registration_endpoint: 'https://auth.smithery.ai/hubspot/register',
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    return notFound();
  };
}

describe('discoverAuthorizationServer', () => {
  it('reads the auth server from protected-resource metadata (RFC 9728)', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes('.well-known/oauth-protected-resource')) {
        return jsonResp({
          authorization_servers: ['https://auth.example.com'],
        });
      }
      return notFound();
    };
    const result = await discoverAuthorizationServer(
      'https://mcp.example.com/mcp',
      fetchImpl,
    );
    expect(result.authorizationServer).toBe('https://auth.example.com');
  });

  it('falls back to the server origin when PRM is absent', async () => {
    const fetchImpl: FetchLike = async () => notFound();
    const result = await discoverAuthorizationServer(
      'https://mcp.example.com/mcp',
      fetchImpl,
    );
    expect(result.authorizationServer).toBe('https://mcp.example.com');
  });

  it('reads the RFC 9728 path form first (Smithery shape)', async () => {
    const seen: string[] = [];
    const result = await discoverAuthorizationServer(
      'https://server.smithery.ai/hubspot/mcp',
      smitheryFetch(seen),
    );
    expect(result.authorizationServer).toBe('https://auth.smithery.ai/hubspot');
    // The path form is tried BEFORE the root document, which Smithery 404s.
    expect(seen[0]).toBe(SMITHERY_PRM_PATH);
  });

  it('keeps reading the root document for a root server URL (HubSpot direct)', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url);
      if (
        url === 'https://mcp.hubspot.com/.well-known/oauth-protected-resource'
      ) {
        return jsonResp({
          authorization_servers: ['https://mcp.hubspot.com'],
        });
      }
      return notFound();
    };
    const result = await discoverAuthorizationServer(
      'https://mcp.hubspot.com',
      fetchImpl,
    );
    expect(result.authorizationServer).toBe('https://mcp.hubspot.com');
    // The document first, then the server's own 401 for its challenge scope.
    expect(seen).toEqual([
      'https://mcp.hubspot.com/.well-known/oauth-protected-resource',
      'https://mcp.hubspot.com',
    ]);
  });

  it('follows resource_metadata from a 401 WWW-Authenticate challenge', async () => {
    const hinted =
      'https://hubspot.run.tools/.well-known/oauth-protected-resource';
    const fetchImpl: FetchLike = async (url) => {
      if (url === hinted) {
        return jsonResp({
          authorization_servers: ['https://auth.smithery.ai/hubspot'],
        });
      }
      if (url === 'https://hubspot.run.tools/mcp') {
        return challenge401(
          'Bearer error="unauthorized", resource_metadata="' + hinted + '"',
        );
      }
      return notFound();
    };
    const result = await discoverAuthorizationServer(
      'https://hubspot.run.tools/mcp',
      fetchImpl,
    );
    expect(result.authorizationServer).toBe('https://auth.smithery.ai/hubspot');
  });

  it('falls back to the origin when the challenge document names no auth server', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url === 'https://mcp.example.com/mcp') {
        return challenge401(
          'Bearer resource_metadata="https://mcp.example.com/prm"',
        );
      }
      if (url === 'https://mcp.example.com/prm') return jsonResp({});
      return notFound();
    };
    const result = await discoverAuthorizationServer(
      'https://mcp.example.com/mcp',
      fetchImpl,
    );
    expect(result.authorizationServer).toBe('https://mcp.example.com');
  });

  it('tolerates a fetch impl that exposes no response headers', async () => {
    // Every pre-existing fake omits `headers`; that must stay a valid FetchLike.
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => '',
    });
    await expect(
      discoverAuthorizationServer('https://mcp.example.com/mcp', fetchImpl),
    ).resolves.toEqual({
      authorizationServer: 'https://mcp.example.com',
      challengeScope: undefined,
    });
  });
});

describe('parseResourceMetadataChallenge', () => {
  it.each([
    ['Bearer resource_metadata="https://a/prm"', 'https://a/prm'],
    ['Bearer error="x", resource_metadata="https://a/prm"', 'https://a/prm'],
    ['Bearer resource_metadata=https://a/prm', 'https://a/prm'],
    ['Bearer Resource_Metadata = "https://a/prm"', 'https://a/prm'],
    ['Bearer resource_metadata=https://a/prm, scope="x"', 'https://a/prm'],
  ])('parses %s', (header, expected) => {
    expect(parseResourceMetadataChallenge(header)).toBe(expected);
  });

  it('returns undefined for an absent or unrelated challenge', () => {
    expect(parseResourceMetadataChallenge(null)).toBeUndefined();
    expect(parseResourceMetadataChallenge(undefined)).toBeUndefined();
    expect(parseResourceMetadataChallenge('Bearer realm="x"')).toBeUndefined();
  });
});

describe('discoverAuthServerMetadata', () => {
  it('parses the RFC 8414 authorization-server document', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith('/.well-known/oauth-authorization-server')) {
        return jsonResp({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          registration_endpoint: 'https://auth.example.com/register',
          scopes_supported: ['read', 'write'],
        });
      }
      return notFound();
    };
    const meta = await discoverAuthServerMetadata(
      'https://auth.example.com',
      fetchImpl,
    );
    expect(meta.authorizationEndpoint).toBe(
      'https://auth.example.com/authorize',
    );
    expect(meta.tokenEndpoint).toBe('https://auth.example.com/token');
    expect(meta.registrationEndpoint).toBe('https://auth.example.com/register');
    // The AS list is every scope it knows, never a request scope
    // (TASK_2026_HIGGSFIELD), so the metadata does not carry it at all.
    expect(meta).not.toHaveProperty('scopesSupported');
  });

  it('falls back to the OIDC discovery document', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith('/.well-known/openid-configuration')) {
        return jsonResp({
          authorization_endpoint: 'https://auth.example.com/oidc/authorize',
          token_endpoint: 'https://auth.example.com/oidc/token',
        });
      }
      return notFound();
    };
    const meta = await discoverAuthServerMetadata(
      'https://auth.example.com',
      fetchImpl,
    );
    expect(meta.authorizationEndpoint).toBe(
      'https://auth.example.com/oidc/authorize',
    );
  });

  it('reads the RFC 8414 path-insert form for a path-hosted issuer (Smithery)', async () => {
    const seen: string[] = [];
    const meta = await discoverAuthServerMetadata(
      'https://auth.smithery.ai/hubspot',
      smitheryFetch(seen),
    );
    expect(meta.authorizationEndpoint).toBe(
      'https://auth.smithery.ai/hubspot/authorize',
    );
    expect(meta.tokenEndpoint).toBe('https://auth.smithery.ai/hubspot/token');
    expect(meta.registrationEndpoint).toBe(
      'https://auth.smithery.ai/hubspot/register',
    );
    // Path-insert is the FIRST candidate. The legacy issuer-suffix form and the
    // two root documents, all of which Smithery 404s, come after it.
    expect(seen[0]).toBe(SMITHERY_AS_PATH_INSERT);
  });

  it('never asks for the issuer-suffix form before the path-insert form', async () => {
    const seen: string[] = [];
    await expect(
      discoverAuthServerMetadata('https://auth.smithery.ai/nosuch', (url) => {
        seen.push(url);
        return Promise.resolve(notFound());
      }),
    ).rejects.toBeInstanceOf(OAuthDiscoveryError);
    expect(seen).toEqual([
      'https://auth.smithery.ai/.well-known/oauth-authorization-server/nosuch',
      'https://auth.smithery.ai/.well-known/openid-configuration/nosuch',
      'https://auth.smithery.ai/nosuch/.well-known/oauth-authorization-server',
      'https://auth.smithery.ai/nosuch/.well-known/openid-configuration',
      'https://auth.smithery.ai/.well-known/oauth-authorization-server',
      'https://auth.smithery.ai/.well-known/openid-configuration',
    ]);
  });

  it('falls back to the OIDC form appended to a path-hosted issuer', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (
        url ===
        'https://auth.example.com/tenant/.well-known/openid-configuration'
      ) {
        return jsonResp({
          authorization_endpoint: 'https://auth.example.com/tenant/authorize',
          token_endpoint: 'https://auth.example.com/tenant/token',
        });
      }
      return notFound();
    };
    const meta = await discoverAuthServerMetadata(
      'https://auth.example.com/tenant',
      fetchImpl,
    );
    expect(meta.tokenEndpoint).toBe('https://auth.example.com/tenant/token');
  });

  it('still reads the root document for a root issuer (HubSpot direct)', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url);
      if (
        url === 'https://mcp.hubspot.com/.well-known/oauth-authorization-server'
      ) {
        return jsonResp({
          issuer: 'https://mcp.hubspot.com',
          authorization_endpoint: 'https://mcp.hubspot.com/oauth/authorize',
          token_endpoint: 'https://mcp.hubspot.com/oauth/token',
        });
      }
      return notFound();
    };
    const meta = await discoverAuthServerMetadata(
      'https://mcp.hubspot.com',
      fetchImpl,
    );
    expect(meta.authorizationEndpoint).toBe(
      'https://mcp.hubspot.com/oauth/authorize',
    );
    // No `registration_endpoint`: this is the pre-registered-app path.
    expect(meta.registrationEndpoint).toBeUndefined();
    expect(seen).toEqual([
      'https://mcp.hubspot.com/.well-known/oauth-authorization-server',
    ]);
  });

  it('names the original authorization server, path included, when nothing is found', async () => {
    const fetchImpl: FetchLike = async () => notFound();
    await expect(
      discoverAuthServerMetadata('https://auth.smithery.ai/nosuch', fetchImpl),
    ).rejects.toMatchObject({
      name: OAUTH_DISCOVERY_ERROR_NAME,
      serverUrl: 'https://auth.smithery.ai/nosuch',
    });
  });

  it('throws when no metadata document is found', async () => {
    const fetchImpl: FetchLike = async () => notFound();
    await expect(
      discoverAuthServerMetadata('https://auth.example.com', fetchImpl),
    ).rejects.toThrow(/No OAuth authorization-server metadata/);
  });

  it('rejects a server with no metadata endpoints as OAuthDiscoveryError', async () => {
    const fetchImpl: FetchLike = async () => notFound();
    // `name` is the contract the RPC layer classifies on: `instanceof` first,
    // `name` second, because a bundle boundary drops the prototype.
    await expect(
      discoverAuthServerMetadata('https://mcp.firecrawl.dev', fetchImpl),
    ).rejects.toMatchObject({
      name: OAUTH_DISCOVERY_ERROR_NAME,
      serverUrl: 'https://mcp.firecrawl.dev',
    });
    expect(OAUTH_DISCOVERY_ERROR_NAME).toBe('OAuthDiscoveryError');
  });

  it('rejects with an OAuthDiscoveryError instance', async () => {
    const fetchImpl: FetchLike = async () => notFound();
    await expect(
      discoverAuthServerMetadata('https://auth.example.com', fetchImpl),
    ).rejects.toBeInstanceOf(OAuthDiscoveryError);
  });
});

describe('registerClient', () => {
  it('performs dynamic client registration and returns the client_id', async () => {
    let capturedBody: unknown;
    const fetchImpl: FetchLike = async (_url, init) => {
      capturedBody = init?.body ? JSON.parse(init.body) : undefined;
      return jsonResp({ client_id: 'client-123' });
    };
    const registered = await registerClient(
      'https://auth.example.com/register',
      'http://127.0.0.1:5000/callback',
      fetchImpl,
    );
    expect(registered.clientId).toBe('client-123');
    expect(capturedBody).toMatchObject({
      redirect_uris: ['http://127.0.0.1:5000/callback'],
      token_endpoint_auth_method: 'none',
    });
  });

  it('throws when registration is rejected', async () => {
    const fetchImpl: FetchLike = async () => notFound();
    await expect(
      registerClient(
        'https://auth.example.com/register',
        'http://x/cb',
        fetchImpl,
      ),
    ).rejects.toThrow(/Dynamic client registration failed/);
  });
});

describe('withRequestTimeout', () => {
  it('aborts a hanging request after the per-request timeout', async () => {
    const timed = withRequestTimeout(hangingFetch([]), 30);
    const started = Date.now();

    const error = await timed('https://auth.example.com/token').catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(OAuthTimeoutError);
    expect(error).toMatchObject({
      name: OAUTH_TIMEOUT_ERROR_NAME,
      url: 'https://auth.example.com/token',
      message: 'The authorization server did not respond in time.',
    });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(20);
    expect(elapsed).toBeLessThan(5000);
  });

  it('honours a caller signal that fires before the per-request timeout', async () => {
    const timed = withRequestTimeout(hangingFetch([]), 10_000);
    await expect(
      timed('https://auth.example.com/x', { signal: AbortSignal.timeout(20) }),
    ).rejects.toBeInstanceOf(OAuthTimeoutError);
  });

  it('passes a normal response through and leaves other failures unchanged', async () => {
    const ok = withRequestTimeout(async () => jsonResp({ a: 1 }), 1000);
    const resp = await ok('https://auth.example.com/x');
    expect(resp.ok).toBe(true);
    expect(resp.status).toBe(200);
    await expect(resp.json()).resolves.toEqual({ a: 1 });

    const failing = withRequestTimeout(async () => {
      throw new TypeError('fetch failed');
    }, 1000);
    await expect(failing('https://auth.example.com/x')).rejects.toThrow(
      new TypeError('fetch failed'),
    );
  });
});

describe('discovery deadline', () => {
  it('discoverAuthorizationServer stops trying candidates once the deadline passes', async () => {
    const seen: string[] = [];
    // Each request would wait 10 s; the phase deadline fires at 40 ms.
    const timed = withRequestTimeout(hangingFetch(seen), 10_000);

    await expect(
      discoverAuthorizationServer(
        'https://mcp.example.com/mcp',
        timed,
        AbortSignal.timeout(40),
      ),
    ).rejects.toBeInstanceOf(OAuthTimeoutError);
    // Only the first of the path / root / 401-challenge candidates was tried.
    expect(seen).toEqual([
      'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
    ]);
  });

  it('discoverAuthServerMetadata stops mid-way when per-request timeouts exhaust the deadline', async () => {
    const seen: string[] = [];
    // Each candidate times out after 30 ms; the deadline fires at 75 ms, so
    // the candidate list (six forms for a path issuer) is not exhausted.
    const timed = withRequestTimeout(hangingFetch(seen), 30);

    await expect(
      discoverAuthServerMetadata(
        'https://auth.smithery.ai/hubspot',
        timed,
        AbortSignal.timeout(75),
      ),
    ).rejects.toBeInstanceOf(OAuthTimeoutError);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.length).toBeLessThan(6);
  });

  it('reports a passed deadline as a timeout, not as "no OAuth discovery"', async () => {
    const seen: string[] = [];
    await expect(
      discoverAuthServerMetadata(
        'https://auth.example.com',
        smitheryFetch(seen),
        AbortSignal.abort(),
      ),
    ).rejects.toMatchObject({ name: OAUTH_TIMEOUT_ERROR_NAME });
    expect(seen).toEqual([]);
  });

  it('leaves discovery unchanged when the deadline has not passed', async () => {
    const seen: string[] = [];
    const meta = await discoverAuthServerMetadata(
      'https://auth.smithery.ai/hubspot',
      withRequestTimeout(smitheryFetch(seen), 1000),
      AbortSignal.timeout(5000),
    );
    expect(meta.tokenEndpoint).toBe('https://auth.smithery.ai/hubspot/token');
    expect(seen).toEqual([SMITHERY_AS_PATH_INSERT]);
  });
});

describe('parseScopeChallenge', () => {
  it.each([
    [HIGGSFIELD_CHALLENGE, HIGGSFIELD_RESOURCE_SCOPE],
    ['Bearer scope="read write"', 'read write'],
    ['Bearer scope=read', 'read'],
    ['Bearer realm="x",scope="a b"', 'a b'],
    ['Bearer error="insufficient_scope", scope="files:read"', 'files:read'],
  ])('parses %s', (header, expected) => {
    expect(parseScopeChallenge(header)).toBe(expected);
  });

  it('returns undefined when the challenge names no scope', () => {
    expect(parseScopeChallenge(null)).toBeUndefined();
    expect(parseScopeChallenge(undefined)).toBeUndefined();
    expect(
      parseScopeChallenge('Bearer resource_metadata="https://a/prm"'),
    ).toBeUndefined();
    expect(
      parseScopeChallenge('Bearer error="insufficient_scope"'),
    ).toBeUndefined();
    expect(parseScopeChallenge('Bearer scope=""')).toBeUndefined();
  });
});

describe('selectAuthorizationScope (MCP scope selection)', () => {
  const both = { challengeScope: 'a b', resourceScopes: ['c', 'd'] };

  it('prefers an explicit scope', () => {
    expect(selectAuthorizationScope('x y', both)).toBe('x y');
  });

  it('uses the 401 challenge scope over the protected-resource scopes', () => {
    expect(selectAuthorizationScope(undefined, both)).toBe('a b');
  });

  it('falls back to the protected-resource scopes_supported', () => {
    expect(
      selectAuthorizationScope(undefined, { resourceScopes: ['c', 'd'] }),
    ).toBe('c d');
  });

  it('requests no scope when none is known', () => {
    expect(selectAuthorizationScope(undefined, {})).toBeUndefined();
    expect(
      selectAuthorizationScope('  ', { resourceScopes: [] }),
    ).toBeUndefined();
  });

  it('treats a blank explicit scope as absent', () => {
    expect(selectAuthorizationScope('   ', both)).toBe('a b');
  });
});

describe('Higgsfield (Clerk) discovery shape', () => {
  it('reads the PRM path form, then the 401 challenge for its scope', async () => {
    const seen: string[] = [];
    const result = await discoverAuthorizationServer(
      HIGGSFIELD_MCP_URL,
      higgsfieldFetch(seen),
    );
    expect(result).toEqual({
      authorizationServer: HIGGSFIELD_AS,
      challengeScope: HIGGSFIELD_RESOURCE_SCOPE,
      resourceScopes: ['openid', 'email', 'offline_access'],
    });
    expect(seen).toEqual([HIGGSFIELD_PRM_URL, HIGGSFIELD_MCP_URL]);
  });

  it('lets a narrower challenge scope win over broad PRM scopes', async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (
        url ===
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp'
      ) {
        return jsonResp({
          authorization_servers: ['https://auth.example.com'],
          scopes_supported: ['files:read', 'files:write', 'admin'],
        });
      }
      if (url === 'https://mcp.example.com/mcp') {
        return challenge401(
          'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp", scope="files:read"',
        );
      }
      return notFound();
    };
    const result = await discoverAuthorizationServer(
      'https://mcp.example.com/mcp',
      fetchImpl,
    );
    expect(result.challengeScope).toBe('files:read');
    expect(result.resourceScopes).toEqual([
      'files:read',
      'files:write',
      'admin',
    ]);
    expect(selectAuthorizationScope(undefined, result)).toBe('files:read');
  });

  it.each<[string, FetchLike]>([
    [
      'the challenge request throws',
      async (url) => {
        if (url.includes('oauth-protected-resource')) {
          return jsonResp({
            authorization_servers: ['https://auth.example.com'],
            scopes_supported: ['a', 'b'],
          });
        }
        throw new TypeError('fetch failed');
      },
    ],
    [
      'the server answers without a challenge',
      async (url) =>
        url.includes('oauth-protected-resource')
          ? jsonResp({
              authorization_servers: ['https://auth.example.com'],
              scopes_supported: ['a', 'b'],
            })
          : jsonResp({}),
    ],
  ])('falls back to PRM scopes when %s', async (_case, fetchImpl) => {
    const result = await discoverAuthorizationServer(
      'https://mcp.example.com/mcp',
      fetchImpl,
    );
    expect(result).toEqual({
      authorizationServer: 'https://auth.example.com',
      challengeScope: undefined,
      resourceScopes: ['a', 'b'],
    });
    expect(selectAuthorizationScope(undefined, result)).toBe('a b');
  });

  it('carries the 401 challenge scope when the challenge led to the PRM', async () => {
    const result = await discoverAuthorizationServer(
      HIGGSFIELD_MCP_URL,
      higgsfieldFetch([], { prmOnlyViaChallenge: true }),
    );
    expect(result).toEqual({
      authorizationServer: HIGGSFIELD_AS,
      challengeScope: HIGGSFIELD_RESOURCE_SCOPE,
      resourceScopes: ['openid', 'email', 'offline_access'],
    });
  });

  it('keeps the challenge scope when the origin fallback is used', async () => {
    const fetchImpl: FetchLike = async (url) =>
      url === 'https://mcp.example.com/mcp'
        ? challenge401('Bearer scope="files:read"')
        : notFound();
    await expect(
      discoverAuthorizationServer('https://mcp.example.com/mcp', fetchImpl),
    ).resolves.toEqual({
      authorizationServer: 'https://mcp.example.com',
      challengeScope: 'files:read',
    });
  });

  it('reads Clerk metadata from the path-insert form first', async () => {
    const seen: string[] = [];
    const meta = await discoverAuthServerMetadata(
      HIGGSFIELD_AS,
      higgsfieldFetch(seen),
    );
    expect(meta.authorizationEndpoint).toBe(HIGGSFIELD_AUTHORIZE);
    expect(seen).toEqual([HIGGSFIELD_AS_PATH_INSERT]);
    // Clerk's scopes_supported is published but never surfaced.
    expect(JSON.stringify(meta)).not.toContain('private_metadata');
  });

  it('never counts an HTML 200 page as authorization-server metadata', async () => {
    const seen: string[] = [];
    const base = higgsfieldFetch(seen);
    // Hide every JSON form, so only the SPA's HTML 200 root answers.
    const fetchImpl: FetchLike = async (url, init) =>
      url === HIGGSFIELD_AS_ROOT ? base(url, init) : notFound();
    await expect(
      discoverAuthServerMetadata(HIGGSFIELD_AS, fetchImpl),
    ).rejects.toBeInstanceOf(OAuthDiscoveryError);
    expect(seen).toEqual([HIGGSFIELD_AS_ROOT]);
  });

  it('never counts an HTML 200 page as protected-resource metadata', async () => {
    const html = {
      ok: true,
      status: 200,
      json: async () => JSON.parse('<!doctype html>') as unknown,
      text: async () => '<!doctype html>',
    };
    const result = await discoverAuthorizationServer(
      'https://spa.example.com/mcp',
      async () => html,
    );
    expect(result.authorizationServer).toBe('https://spa.example.com');
  });
});
