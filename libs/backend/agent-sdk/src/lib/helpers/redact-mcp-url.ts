/**
 * Redaction helper for MCP server URLs.
 *
 * Smithery (and other hosted-MCP) connection URLs carry the API key and the
 * base64-encoded per-server config in their query string
 * (`server.smithery.ai/...?config=...&api_key=...&profile=...`). Those values
 * are secrets and MUST NOT reach logs, telemetry, or Sentry.
 *
 * `redactMcpUrl` keeps the scheme + host + path (useful for debugging which
 * server was reached) and masks every secret-bearing query parameter with
 * `***redacted***`. It is intentionally conservative: any query parameter whose
 * name matches a known-secret token, plus the userinfo component, is masked.
 *
 * SECURITY: callers should route every log line that would otherwise emit a raw
 * `mcpUrl` / override `url` through this function.
 */

const REDACTED = '***redacted***';

/**
 * Query-parameter names that carry secrets or secret-bearing payloads.
 * Matched case-insensitively. `config` is included because Smithery base64-
 * encodes the full per-server config (which may itself contain credentials).
 */
const SECRET_QUERY_PARAMS = new Set([
  'api_key',
  'apikey',
  'key',
  'config',
  'token',
  'access_token',
  'secret',
  'password',
  'profile',
]);

/**
 * Redact secret-bearing query-string values (and any embedded userinfo) from an
 * MCP server URL, preserving the scheme, host, and path for debuggability.
 *
 * Falls back to a coarse `***redacted***` for the whole query string when the
 * input cannot be parsed as a URL (never emits the raw value on the error path).
 */
export function redactMcpUrl(url: string): string {
  if (typeof url !== 'string' || url.length === 0) {
    return url;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return redactUnparseable(url);
  }

  if (parsed.username) parsed.username = REDACTED;
  if (parsed.password) parsed.password = REDACTED;

  for (const name of [...parsed.searchParams.keys()]) {
    if (SECRET_QUERY_PARAMS.has(name.toLowerCase())) {
      parsed.searchParams.set(name, REDACTED);
    }
  }

  return parsed.toString();
}

/**
 * Best-effort redaction for strings that are not valid URLs: strips any query
 * string entirely rather than risk leaking a malformed secret-bearing value.
 */
function redactUnparseable(value: string): string {
  const queryIndex = value.indexOf('?');
  if (queryIndex === -1) {
    return value;
  }
  return `${value.slice(0, queryIndex)}?${REDACTED}`;
}

/**
 * Redact every entry of an `mcpServersOverride`-style map for safe logging.
 * Returns a plain object keyed by server key → redacted URL (or a marker when a
 * non-http entry has no URL field).
 */
export function redactMcpOverrideMap(
  override: Record<string, { url?: string } | undefined> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!override) return out;
  for (const [serverKey, entry] of Object.entries(override)) {
    out[serverKey] = entry?.url ? redactMcpUrl(entry.url) : '<no-url>';
  }
  return out;
}

/** Any `scheme://...` run up to whitespace, a quote or a closing bracket. */
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()[\]{}]+/gi;

/** Credential-bearing HTTP headers whose whole value is masked. */
const SECRET_HEADER =
  /\b((?:proxy-)?authorization|cookie|set-cookie|x-[a-z0-9-]*(?:key|token|secret))(["']?\s*[:=]\s*["']?)[^"'\r\n,;]+/gi;

/** A bearer or basic credential anywhere in the text. */
const AUTH_SCHEME_TOKEN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;

/**
 * `name=value` or `name: value` where the name carries a credential, such as
 * `token`, `api_key`, `client_secret`, `password` or `access_token`.
 */
const SECRET_ASSIGNMENT =
  /\b([a-z0-9_.-]*(?:token|secret|password|passwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credentials?))(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi;

/**
 * Keep only the scheme, host, port and path of a URL found in free text. The
 * userinfo is dropped, and a query or fragment becomes `?***redacted***`.
 */
function redactUrlInText(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // degradation-audit: optional-capability - an unparseable URL loses
    // everything after its first `?` or `#`, so no query value survives.
    const cut = url.search(/[?#]/);
    return cut === -1 ? url : `${url.slice(0, cut)}?${REDACTED}`;
  }
  const hasQuery = parsed.search !== '' || parsed.hash !== '';
  const base = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  return hasQuery ? `${base}?${REDACTED}` : base;
}

/**
 * Redact free-form MCP error text (a CLI `system`/`init` server error, a
 * gateway status detail) before it reaches a user-visible summary. Every URL
 * keeps only its scheme, host and path; credential header values, bearer and
 * basic tokens and credential assignments are masked.
 */
export function redactMcpErrorText(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  const maskValue = (_match: string, name: string, separator: string) =>
    `${name}${separator}${REDACTED}`;
  return text
    .replace(URL_IN_TEXT, redactUrlInText)
    .replace(SECRET_HEADER, maskValue)
    .replace(
      AUTH_SCHEME_TOKEN,
      (_match, scheme: string) => `${scheme} ${REDACTED}`,
    )
    .replace(SECRET_ASSIGNMENT, maskValue);
}
