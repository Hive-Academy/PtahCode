/**
 * AuthRequiredError — thrown when a session operation is attempted but the
 * adapter is not usable because authentication is missing or expired.
 *
 * Replaces the generic "SdkAgentAdapter not initialized" SdkError so the RPC
 * boundary and chat UI can distinguish an auth problem (recoverable by the user
 * re-authenticating) from an unexpected internal failure.
 *
 * Carries the provider whose auth is required and a human-readable recovery
 * hint (typically the adapter's last health `errorMessage`) so the UI can render
 * an actionable banner instead of a cryptic message.
 */
import {
  isProviderSessionProviderId,
  providerSessionNativeRuntimeRequiredMessage,
  type ProviderSessionProviderId,
} from '@ptah-extension/shared';
import { SdkError } from './sdk.error';

export class AuthRequiredError extends SdkError {
  /** Provider whose authentication is required, when known (e.g. 'openai-codex'). */
  readonly providerId: string | null;
  /** Human-readable guidance on how to recover (re-authenticate). */
  readonly recoveryHint: string | null;

  constructor(
    message: string,
    details?: {
      providerId?: string | null;
      recoveryHint?: string | null;
      cause?: unknown;
    },
  ) {
    super(message, details?.cause ? { cause: details.cause } : undefined);
    this.name = 'AuthRequiredError';
    this.providerId = details?.providerId ?? null;
    this.recoveryHint = details?.recoveryHint ?? null;
  }
}

/** Exact text of the deliberate native-Codex refusal. Not a general auth failure. */
export const CODEX_NATIVE_RUNTIME_REQUIRED_MESSAGE =
  'Codex chat requires a host with the native Codex runtime.';

/**
 * True only for the deliberate Codex native-runtime refusal.
 * Any other `AuthRequiredError` (including Codex id with a different message)
 * stays an ordinary auth failure.
 */
export function isCodexNativeRuntimeRefusal(
  error: unknown,
): error is AuthRequiredError {
  return (
    error instanceof AuthRequiredError &&
    error.providerId === 'openai-codex' &&
    error.message === CODEX_NATIVE_RUNTIME_REQUIRED_MESSAGE
  );
}

/**
 * True only for the deliberate provider-session refusal: an
 * `AuthRequiredError` whose provider is a provider-session entry and whose
 * message is that provider's refusal text.
 */
export function isProviderSessionNativeRuntimeRefusal(
  error: unknown,
): error is AuthRequiredError & { readonly providerId: ProviderSessionProviderId } {
  return (
    error instanceof AuthRequiredError &&
    error.providerId !== null &&
    isProviderSessionProviderId(error.providerId) &&
    error.message === providerSessionNativeRuntimeRequiredMessage(error.providerId)
  );
}

/** The Codex or the provider-session native-runtime refusal. */
export function isNativeRuntimeRefusal(
  error: unknown,
): error is AuthRequiredError & {
  readonly providerId: 'openai-codex' | ProviderSessionProviderId;
} {
  return (
    isCodexNativeRuntimeRefusal(error) ||
    isProviderSessionNativeRuntimeRefusal(error)
  );
}
