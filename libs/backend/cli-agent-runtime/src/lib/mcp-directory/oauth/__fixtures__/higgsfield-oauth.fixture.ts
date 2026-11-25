/**
 * The Higgsfield MCP OAuth shapes measured live on 2026-11-24
 * (TASK_2026_HIGGSFIELD task.md). Clerk is the authorization server; its
 * `scopes_supported` lists scopes a dynamically registered client may NOT
 * request (`private_metadata`, `user:org:read`), and the origin-only RFC 8414
 * path answers HTML 200 because the site is an SPA.
 */
import type { FetchLike } from '../mcp-oauth-metadata';

export const HIGGSFIELD_MCP_URL = 'https://mcp.higgsfield.ai/mcp';
export const HIGGSFIELD_PRM_URL =
  'https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp';
export const HIGGSFIELD_AS = 'https://higgsfield.ai/_clerk';
export const HIGGSFIELD_AS_PATH_INSERT =
  'https://higgsfield.ai/.well-known/oauth-authorization-server/_clerk';
export const HIGGSFIELD_AS_ROOT =
  'https://higgsfield.ai/.well-known/oauth-authorization-server';
export const HIGGSFIELD_AUTHORIZE =
  'https://higgsfield.ai/_clerk/oauth/authorize';
export const HIGGSFIELD_TOKEN = 'https://higgsfield.ai/_clerk/oauth/token';
export const HIGGSFIELD_REGISTER =
  'https://higgsfield.ai/_clerk/oauth/register';

/** The scope Higgsfield's 401 challenge and PRM both ask for. */
export const HIGGSFIELD_RESOURCE_SCOPE = 'openid email offline_access';
/** Clerk's AS `scopes_supported`; requesting all of it is `invalid_scope`. */
export const CLERK_SCOPES_SUPPORTED = [
  'openid',
  'profile',
  'email',
  'public_metadata',
  'private_metadata',
  'offline_access',
  'user:org:read',
];

export const HIGGSFIELD_CHALLENGE =
  `Bearer resource_metadata="${HIGGSFIELD_PRM_URL}", ` +
  `scope="${HIGGSFIELD_RESOURCE_SCOPE}"`;

function json(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** An SPA page: 200, but `json()` fails the way the real `fetch` does. */
function html200() {
  const page = '<!doctype html><html><body><div id="root"></div></body></html>';
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(page) as unknown,
    text: async () => page,
  };
}

function status(code: number, wwwAuthenticate?: string) {
  return {
    ok: false,
    status: code,
    json: async () => ({}),
    text: async () => '',
    headers: {
      get: (name: string) =>
        wwwAuthenticate && name.toLowerCase() === 'www-authenticate'
          ? wwwAuthenticate
          : null,
    },
  };
}

export interface HiggsfieldFetchOptions {
  /** Answer the PRM path form with 404 until the 401 challenge was read. */
  readonly prmOnlyViaChallenge?: boolean;
}

/** A fake transport answering every request the connect flow makes. */
export function higgsfieldFetch(
  seen: string[] = [],
  options: HiggsfieldFetchOptions = {},
): FetchLike {
  return async (url) => {
    seen.push(url);
    if (url === HIGGSFIELD_MCP_URL) return status(401, HIGGSFIELD_CHALLENGE);
    // With `prmOnlyViaChallenge` the guessed path form 404s until the 401 has
    // been read, after which the same URL (now hinted) answers.
    if (
      url === HIGGSFIELD_PRM_URL &&
      (!options.prmOnlyViaChallenge || seen.includes(HIGGSFIELD_MCP_URL))
    ) {
      return prm();
    }
    if (url === HIGGSFIELD_AS_PATH_INSERT) {
      return json({
        issuer: HIGGSFIELD_AS,
        authorization_endpoint: HIGGSFIELD_AUTHORIZE,
        token_endpoint: HIGGSFIELD_TOKEN,
        registration_endpoint: HIGGSFIELD_REGISTER,
        scopes_supported: CLERK_SCOPES_SUPPORTED,
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url === HIGGSFIELD_AS_ROOT) return html200();
    if (url === HIGGSFIELD_REGISTER) {
      return json({
        client_id: 'clerk-client-1',
        scope: 'email offline_access openid profile public_metadata',
      });
    }
    if (url === HIGGSFIELD_TOKEN) {
      return json({
        access_token: 'HF-AT',
        refresh_token: 'HF-RT',
        expires_in: 3600,
      });
    }
    return status(404);
  };
}

function prm() {
  return json({
    resource: HIGGSFIELD_MCP_URL,
    authorization_servers: [HIGGSFIELD_AS],
    scopes_supported: ['openid', 'email', 'offline_access'],
    bearer_methods_supported: ['header'],
  });
}
