import type { ProviderSessionProviderId } from '@ptah-extension/shared';

/**
 * A provider-session chat failure the host maps to a coded RPC result
 * (`providerSessionFailure` in rpc-handlers). The message names only the
 * operation and the code; user-facing text is fixed by the host mapping, so a
 * runtime cause never reaches the renderer.
 */
export type ProviderSessionChatAdapterErrorCode =
  | 'unavailable'
  | 'busy'
  | 'limit'
  | 'unsupported-option'
  | 'auth-required'
  | 'resume-failed'
  | 'runtime-failed'
  | 'cancelled';

export interface ProviderSessionChatAdapterErrorOptions extends ErrorOptions {
  /** The provider whose sign-in is required (`auth-required`). */
  readonly providerId?: ProviderSessionProviderId;
  /** User-facing sign-in instruction (`auth-required`); never a credential. */
  readonly signInHint?: string;
  /** The chat option name the provider refused (`unsupported-option`). */
  readonly option?: string;
}

export class ProviderSessionChatAdapterError extends Error {
  readonly providerId?: ProviderSessionProviderId;
  readonly signInHint?: string;
  readonly option?: string;

  constructor(
    readonly code: ProviderSessionChatAdapterErrorCode,
    readonly operation: string,
    options?: ProviderSessionChatAdapterErrorOptions,
  ) {
    super(`Provider-session chat ${operation}: ${code}`, options);
    this.name = 'ProviderSessionChatAdapterError';
    this.providerId = options?.providerId;
    this.signInHint = options?.signInHint;
    this.option = options?.option;
  }
}

export function isProviderSessionChatAdapterError(
  error: unknown,
): error is ProviderSessionChatAdapterError {
  return error instanceof ProviderSessionChatAdapterError;
}
