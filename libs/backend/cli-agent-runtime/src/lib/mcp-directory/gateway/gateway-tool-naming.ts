/**
 * Names of the tools the gateway serves through Ptah's `ptah` MCP server.
 *
 * Format: `<alias>__<tool>`, at most {@link GATEWAY_TOOL_NAME_MAX} characters
 * of `[A-Za-z0-9_-]`. Claude shows it as `mcp__ptah__<alias>__<tool>`, and
 * Codex/OpenAI cap a tool name at 64 characters, so the gateway name gets
 * 64 minus the 11 characters of `mcp__ptah__`.
 *
 * Every name is a pure function of the server keys and upstream tool names,
 * so a name stays the same across app runs and when other servers are added.
 */

import { createHash } from 'node:crypto';

/** Longest gateway tool name: 64 minus `mcp__ptah__`. */
export const GATEWAY_TOOL_NAME_MAX = 53;

/** Longest base alias, before any collision suffix. */
export const GATEWAY_ALIAS_MAX = 20;

/** Alias that names Ptah itself; a server never gets it bare. */
export const RESERVED_GATEWAY_ALIAS = 'ptah';

/** Separator between the alias and the upstream tool name. */
export const GATEWAY_NAME_SEPARATOR = '__';

/** Alias used when sanitizing leaves nothing. */
const FALLBACK_ALIAS = 'mcp';

const CONNECTOR_KEY_PREFIXES: readonly string[] = ['oauth-', 'smithery-'];

const LEADING_HOST_LABELS: ReadonlySet<string> = new Set(['mcp', 'api', 'www']);

/**
 * Second-level labels that form a public suffix with a two-letter country
 * TLD (`example.co.uk`, `example.com.au`). There is no public suffix list in
 * this repository; this covers the common registrations.
 */
const COUNTRY_SECOND_LEVEL_LABELS: ReadonlySet<string> = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'gov',
  'net',
  'or',
  'org',
]);

const VALID_GATEWAY_TOOL_NAME = /^[A-Za-z0-9_-]+$/;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Lowercase `raw` to `[a-z0-9-]`, collapse and trim dashes, and cap it at
 * {@link GATEWAY_ALIAS_MAX}. An empty result becomes `mcp`.
 */
export function sanitizeGatewayAlias(raw: string): string {
  const alias = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, GATEWAY_ALIAS_MAX)
    .replace(/-$/, '');
  return alias === '' ? FALLBACK_ALIAS : alias;
}

/**
 * Host of a connector from its key when no URL is at hand. The connector key
 * is the host, then the path with `/` turned into `-`
 * (`deriveMcpOAuthServerKey`), so the host ends at the first `-` after its
 * last `.`. A key with no `.` (e.g. `localhost-8080-mcp`) is used whole.
 */
function hostFromConnectorKey(rest: string): string {
  const lastDot = rest.lastIndexOf('.');
  if (lastDot < 0) return rest;
  const dash = rest.indexOf('-', lastDot);
  return dash < 0 ? rest : rest.slice(0, dash);
}

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** Drop a leading `mcp.`/`api.`/`www.` and the public suffix of `host`. */
function hostAliasLabels(host: string): string[] {
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  if (isIpv4(hostname) || !hostname.includes('.')) return [hostname];
  const labels = hostname.split('.').filter((label) => label !== '');
  while (labels.length > 1 && LEADING_HOST_LABELS.has(labels[0])) {
    labels.shift();
  }
  if (labels.length > 1) {
    const tld = labels[labels.length - 1];
    labels.pop();
    if (
      tld.length === 2 &&
      labels.length > 1 &&
      COUNTRY_SECOND_LEVEL_LABELS.has(labels[labels.length - 1])
    ) {
      labels.pop();
    }
  }
  return labels;
}

/**
 * Base alias of a connector (an OAuth or Smithery server). Strips the
 * `oauth-`/`smithery-` key prefix, takes the host (from `url` when given,
 * else from the key), drops a leading `mcp.`/`api.`/`www.` and the public
 * suffix, and sanitizes: `oauth-mcp.zernio.com-mcp` gives `zernio`.
 */
export function connectorAliasBase(key: string, url?: string): string {
  let host: string | undefined;
  if (url !== undefined && URL.canParse(url)) {
    host = new URL(url).hostname;
  }
  if (host === undefined || host === '') {
    let rest = key;
    for (const prefix of CONNECTOR_KEY_PREFIXES) {
      if (rest.startsWith(prefix)) {
        rest = rest.slice(prefix.length);
        break;
      }
    }
    host = hostFromConnectorKey(rest);
  }
  return sanitizeGatewayAlias(hostAliasLabels(host).join('-'));
}

/** Base alias of a non-connector server: its config key, sanitized. */
export function configAliasBase(serverName: string): string {
  return sanitizeGatewayAlias(serverName);
}

/** One server competing for an alias. */
export interface GatewayAliasCandidate {
  /** Dedup key (normalized URL for HTTP servers). */
  readonly key: string;
  /** Base alias from {@link connectorAliasBase} or {@link configAliasBase}. */
  readonly baseAlias: string;
}

/** The base alias plus `_` and 4 hex of `sha256(key)`. */
function suffixedAlias(baseAlias: string, key: string): string {
  return `${baseAlias}_${sha256Hex(key).slice(0, 4)}`;
}

/**
 * Final alias per server key. Among servers sharing a base alias, the
 * lexicographically smallest key keeps it bare and the others get `_` plus
 * 4 hex of `sha256(key)`, so adding a server never renames one whose key
 * sorts first. The reserved `ptah` alias is never given bare.
 */
export function assignGatewayAliases(
  candidates: readonly GatewayAliasCandidate[],
): ReadonlyMap<string, string> {
  const keysByAlias = new Map<string, string[]>();
  for (const { key, baseAlias } of candidates) {
    const alias = sanitizeGatewayAlias(baseAlias);
    const keys = keysByAlias.get(alias) ?? [];
    if (!keys.includes(key)) keys.push(key);
    keysByAlias.set(alias, keys);
  }
  const aliases = new Map<string, string>();
  for (const [alias, keys] of keysByAlias) {
    const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    sorted.forEach((key, index) => {
      const bare = index === 0 && alias !== RESERVED_GATEWAY_ALIAS;
      aliases.set(key, bare ? alias : suffixedAlias(alias, key));
    });
  }
  return aliases;
}

/**
 * `<alias>__<tool>` within {@link GATEWAY_TOOL_NAME_MAX}. The tool part keeps
 * the upstream name when it fits and is already `[A-Za-z0-9_-]`. Otherwise
 * invalid characters become `_`, the part is truncated to its budget minus
 * 7, and `_` plus 6 hex of `sha256(upstreamTool)` is appended, so two
 * upstream names that sanitize or truncate alike still differ.
 */
export function gatewayToolName(alias: string, upstreamTool: string): string {
  const prefix = `${alias}${GATEWAY_NAME_SEPARATOR}`;
  const budget = GATEWAY_TOOL_NAME_MAX - prefix.length;
  const sanitized = upstreamTool.replace(/[^A-Za-z0-9_-]/g, '_');
  if (
    sanitized === upstreamTool &&
    sanitized !== '' &&
    sanitized.length <= budget
  ) {
    return `${prefix}${sanitized}`;
  }
  const hash = sha256Hex(upstreamTool).slice(0, 6);
  return `${prefix}${sanitized.slice(0, Math.max(0, budget - 7))}_${hash}`;
}

/** `true` when `name` is a well-formed gateway tool name. */
export function isValidGatewayToolName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= GATEWAY_TOOL_NAME_MAX &&
    VALID_GATEWAY_TOOL_NAME.test(name)
  );
}

/**
 * {@link gatewayToolName}, or `null` when the generated name equals one of
 * Ptah's own tool names (or is malformed). The gateway drops such a tool
 * instead of shadowing a host tool.
 */
export function buildGatewayToolName(
  alias: string,
  upstreamTool: string,
  hostToolNames: ReadonlySet<string>,
): string | null {
  const name = gatewayToolName(alias, upstreamTool);
  if (hostToolNames.has(name) || !isValidGatewayToolName(name)) return null;
  return name;
}
