/**
 * Typed failure for a live model-list fetch.
 *
 * A live route throws `ModelListError` when it knows why the list is unusable
 * (a malformed payload, no valid rows); everything else is classified from
 * the raw error by {@link classifyModelListFailure}. The reason is a closed
 * `ModelListFailureReason`, so the text a user sees is fixed copy keyed by it
 * and never relays vendor or error text. Callers log the raw message at debug
 * only.
 */

import axios from 'axios';
import type { ModelListFailureReason } from '@ptah-extension/shared';

/** A live model-list failure whose reason is already known. */
export class ModelListError extends Error {
  constructor(readonly reason: ModelListFailureReason) {
    super(`Model list unavailable: ${reason}`);
    this.name = 'ModelListError';
  }
}

const TIMEOUT_CODES: ReadonlySet<string> = new Set([
  'ECONNABORTED',
  'ETIMEDOUT',
]);

const NETWORK_CODES: ReadonlySet<string> = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ERR_NETWORK',
]);

/** `error.code` when the error carries a string code (Node and axios errors). */
function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Map any thrown value to a closed failure reason.
 *
 * - `ModelListError` -> its own reason.
 * - axios error with a response: 401/403 -> `auth-rejected`, any other status
 *   -> `http-error`.
 * - axios `ERR_BAD_RESPONSE` without a response (for example a body over
 *   `maxContentLength`) -> `bad-response`.
 * - `ECONNABORTED` / `ETIMEDOUT`, or an error named `TimeoutError` (the
 *   `AbortSignal.timeout` rejection) -> `timeout`.
 * - `ENOTFOUND` / `ECONNREFUSED` / `ECONNRESET` / `EAI_AGAIN` / `ENETUNREACH`
 *   / axios `ERR_NETWORK` -> `network`.
 * - anything else -> `unexpected`.
 */
export function classifyModelListFailure(
  error: unknown,
): ModelListFailureReason {
  if (error instanceof ModelListError) return error.reason;
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    return status === 401 || status === 403 ? 'auth-rejected' : 'http-error';
  }
  const code = errorCode(error);
  if (code === 'ERR_BAD_RESPONSE') return 'bad-response';
  if (code && TIMEOUT_CODES.has(code)) return 'timeout';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  if (code && NETWORK_CODES.has(code)) return 'network';
  return 'unexpected';
}
