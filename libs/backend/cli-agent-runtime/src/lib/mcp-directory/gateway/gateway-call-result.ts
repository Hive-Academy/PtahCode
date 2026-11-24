/**
 * Pure helpers for the gateway's forwarded calls: shaping an upstream call
 * result into the port's result, and reading an error without leaking it.
 * Split out of `mcp-gateway.service.ts` to keep that file within the
 * repository's size limit.
 */

import type { McpGatewayCallResult } from '@ptah-extension/platform-core';
import type { GatewayEndpoint } from './server-sources';
import type { UpstreamCallResult } from './upstream-client';

const MAX_ERROR_TEXT = 500;
/** Shorter values are too common to redact without mangling the text. */
const MIN_REDACTED_LENGTH = 4;

export function errorResult(text: string): McpGatewayCallResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export function normalizeCallResult(
  result: UpstreamCallResult,
): McpGatewayCallResult {
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
export function isProtocolError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'number' &&
    error.code < 0 &&
    error.code !== -32000
  );
}

/**
 * A list the server answered with an error, or did not answer in time. The
 * process may be healthy (a slow first list after a cold start), so a stdio
 * server keeps it rather than being killed and counted as a restart (S1).
 * A closed connection (-32000) is neither.
 */
export function isSlowOrRefusedList(error: unknown): boolean {
  if (isProtocolError(error)) return true;
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? error.name
      : undefined;
  return name === 'TimeoutError';
}

/**
 * Error text safe for status and tool results: the URL and the dedup key
 * (either may carry a key) become `<server>`; a stdio server's command,
 * arguments and env values (any may be a secret) become `<redacted>`.
 * Bounded to {@link MAX_ERROR_TEXT} characters.
 */
export function redactGatewayText(
  text: string,
  endpoint: GatewayEndpoint,
  key: string,
): string {
  let out = text;
  const url = endpoint.transport === 'stdio' ? '' : endpoint.url;
  for (const secret of [url, key]) {
    if (secret !== '') out = out.split(secret).join('<server>');
  }
  if (endpoint.transport === 'stdio') {
    const values = [
      endpoint.command,
      ...endpoint.args,
      ...Object.values(endpoint.env),
    ]
      .filter((value) => value.length >= MIN_REDACTED_LENGTH)
      // Longest first, so a value that contains another is removed whole.
      .sort((a, b) => b.length - a.length);
    for (const value of values) out = out.split(value).join('<redacted>');
  }
  return out.length > MAX_ERROR_TEXT
    ? `${out.slice(0, MAX_ERROR_TEXT)}...`
    : out;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
