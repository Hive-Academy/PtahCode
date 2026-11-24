/**
 * Pure helpers for the gateway's forwarded calls: shaping an upstream call
 * result into the port's result, and reading an error without leaking it.
 * Split out of `mcp-gateway.service.ts` to keep that file within the
 * repository's size limit.
 */

import type { McpGatewayCallResult } from '@ptah-extension/platform-core';
import type { UpstreamCallResult } from './upstream-client';

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

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
