/**
 * Dedup key for an HTTP or SSE MCP server.
 *
 * Two declarations of the same endpoint (a connector, an intent and a
 * `.mcp.json` entry, say) must produce one key, so the gateway connects once.
 * The key lowercases the scheme and host, drops the default port, userinfo,
 * fragment and trailing `/`, and keeps the path and query as written.
 */

const SUPPORTED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Normalized form of `raw`, or `null` when it is not a valid `http`/`https`
 * URL. WHATWG parsing already lowercases the scheme and host and drops the
 * scheme's default port.
 */
export function normalizeMcpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  // An unparsable URL has no key; the caller skips the entry.
  if (!URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  if (!SUPPORTED_PROTOCOLS.has(url.protocol) || url.hostname === '') {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}${url.search}`;
}
