import { isProviderSessionChatAdapterError } from '@ptah-extension/agent-sdk';
import type { ChatStartResult, RpcUserErrorCode } from '@ptah-extension/shared';

/** Shown for an auth-required failure whose provider gave no sign-in hint. */
export const PROVIDER_SESSION_SIGN_IN_FALLBACK =
  'Sign in to the provider, then try again.';

/**
 * Classify a provider-session chat failure into a coded RPC result, the
 * provider-session counterpart of `ChatSessionService.codexFailure`.
 *
 * The user-facing text is fixed here, so no runtime cause or option value
 * reaches the renderer; the only provider-supplied text is the sign-in hint,
 * which the adapter contract keeps credential-free. Returns `undefined` for
 * any other error, so the caller's generic path runs after it (same order as
 * Codex).
 */
/** Longest sign-in hint shown to the user; a longer hint is truncated. */
export const MAX_SIGN_IN_HINT_LENGTH = 300;
/** Longest option name echoed back to the user. */
export const MAX_OPTION_LENGTH = 64;

export function providerSessionFailure(
  error: unknown,
): ChatStartResult | undefined {
  if (!isProviderSessionChatAdapterError(error)) return undefined;
  switch (error.code) {
    case 'cancelled':
      return { success: false, cancelled: true };
    case 'auth-required':
      return {
        success: false,
        error:
          sanitizeProviderText(error.signInHint, MAX_SIGN_IN_HINT_LENGTH) ||
          PROVIDER_SESSION_SIGN_IN_FALLBACK,
        errorCode: 'AUTH_REQUIRED',
        ...(error.providerId ? { providerId: error.providerId } : {}),
      };
    case 'unsupported-option': {
      const option = sanitizeProviderText(error.option, MAX_OPTION_LENGTH);
      return coded(
        option
          ? `This chat provider does not support the "${option}" option.`
          : 'This chat provider does not support the requested option.',
        'PROVIDER_SESSION_UNSUPPORTED_OPTION',
      );
    }
    case 'busy':
      return coded(
        'The provider session is busy. Try again when the current operation finishes.',
        'PROVIDER_SESSION_BUSY',
      );
    case 'limit':
      return coded(
        'Too many provider sessions are open. Close one and try again.',
        'PROVIDER_SESSION_LIMIT',
      );
    case 'unavailable':
      return coded(
        'The provider session is unavailable. Reconnect and try again.',
        'PROVIDER_SESSION_UNAVAILABLE',
      );
    case 'resume-failed':
      return coded(
        'The provider could not reopen this conversation. Start a new session to continue.',
        'PROVIDER_SESSION_RESUME_FAILED',
      );
    case 'runtime-failed':
      return coded(
        'The provider session could not complete the operation.',
        'PROVIDER_SESSION_RUNTIME_FAILED',
      );
  }
}

function coded(error: string, errorCode: RpcUserErrorCode): ChatStartResult {
  return { success: false, error, errorCode };
}

/**
 * Provider-supplied text is untrusted: drop control characters (ANSI escapes,
 * NUL, bidi overrides), collapse whitespace and cap the length.
 */
function sanitizeProviderText(
  text: string | undefined,
  maxLength: number,
): string {
  if (!text) return '';
  const clean = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > maxLength
    ? `${clean.slice(0, maxLength - 1).trimEnd()}…`
    : clean;
}
