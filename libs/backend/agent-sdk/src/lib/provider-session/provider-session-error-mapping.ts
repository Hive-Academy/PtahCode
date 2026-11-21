import type { ProviderSessionErrorCode } from '@ptah-extension/provider-session-contracts';
import {
  PROVIDER_SESSION_PROVIDER_IDS,
  type ProviderSessionProviderId,
  type ProviderSessionSeed,
} from '@ptah-extension/shared';
import {
  ProviderSessionChatAdapterError,
  type ProviderSessionChatAdapterErrorCode,
} from './provider-session-chat-adapter-error';

const RUNTIME_ERROR_CODES: ReadonlySet<string> = new Set<ProviderSessionErrorCode>([
  'binary-missing',
  'handshake-timeout',
  'auth-required',
  'resume-failed',
  'server-start-failed',
  'server-auth-failed',
  'protocol-unsupported',
  'prompt-timeout',
  'process-exited',
  'cancelled',
  'request-failed',
  'turn-failed',
]);

/**
 * The reserved provider-session ids, not the registry entries (those are
 * added per phase; plan A5), so a sign-in error names its provider early.
 */
function isReservedProviderSessionId(
  providerId: string,
): providerId is ProviderSessionProviderId {
  return (PROVIDER_SESSION_PROVIDER_IDS as readonly string[]).includes(
    providerId,
  );
}

/**
 * The `ProviderSessionErrorCode` of a runtime failure. Runtimes reject with
 * an `Error` carrying that code (agent-sdk never imports a runtime library,
 * so the shape is checked, not the class).
 */
export function providerSessionRuntimeErrorCode(
  error: unknown,
): ProviderSessionErrorCode | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  const code: unknown = error.code;
  return typeof code === 'string' && RUNTIME_ERROR_CODES.has(code)
    ? (code as ProviderSessionErrorCode)
    : undefined;
}

function adapterCode(
  code: ProviderSessionErrorCode | undefined,
): ProviderSessionChatAdapterErrorCode {
  switch (code) {
    case 'auth-required':
      return 'auth-required';
    case 'resume-failed':
      return 'resume-failed';
    case 'cancelled':
      return 'cancelled';
    case 'binary-missing':
    case 'handshake-timeout':
    case 'server-start-failed':
    case 'server-auth-failed':
    case 'protocol-unsupported':
      return 'unavailable';
    case 'prompt-timeout':
    case 'process-exited':
    case 'request-failed':
    case 'turn-failed':
    case undefined:
      return 'runtime-failed';
    default: {
      const unknownCode: never = code;
      void unknownCode;
      return 'runtime-failed';
    }
  }
}

/**
 * Map any failure to the coded adapter error the host turns into an RPC
 * result. An auth-required runtime failure keeps its user-facing message as
 * the sign-in hint (runtime messages never carry a credential).
 */
export function toProviderSessionChatAdapterError(
  error: unknown,
  operation: string,
  seed?: ProviderSessionSeed,
): ProviderSessionChatAdapterError {
  if (error instanceof ProviderSessionChatAdapterError) return error;
  const code = adapterCode(providerSessionRuntimeErrorCode(error));
  if (code !== 'auth-required')
    return new ProviderSessionChatAdapterError(code, operation, { cause: error });
  return new ProviderSessionChatAdapterError(code, operation, {
    cause: error,
    ...(seed && isReservedProviderSessionId(seed.providerId)
      ? { providerId: seed.providerId }
      : {}),
    ...(error instanceof Error && error.message
      ? { signInHint: error.message }
      : {}),
  });
}
