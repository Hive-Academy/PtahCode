import {
  AuthRequiredError,
  CODEX_NATIVE_RUNTIME_REQUIRED_MESSAGE,
} from '@ptah-extension/agent-sdk';
import {
  getAnthropicProvider,
  isProviderSessionProviderId,
} from '@ptah-extension/shared';
import type { AuthOperationContext } from './auth-strategy.types';

export { CODEX_NATIVE_RUNTIME_REQUIRED_MESSAGE };

/** Native hosts own Codex authentication except for historical SDK sessions. */
export function isNativeCodexAuthIntent(
  context?: AuthOperationContext,
): boolean {
  return (
    context?.providerId === 'openai-codex' &&
    context.hostNativeCodex &&
    context.reason !== 'legacy-session-start'
  );
}

/**
 * Global auth for `providerId` is owned by a native runtime: Codex under the
 * host's native-Codex intent, and every provider-session provider always
 * (they have no Claude SDK route at all).
 */
export function isNativeRuntimeAuthIntent(
  providerId: string,
  context?: AuthOperationContext,
): boolean {
  return (
    isProviderSessionProviderId(providerId) || isNativeCodexAuthIntent(context)
  );
}

/** The "owned by the native runtime" detail for an unconfigured result. */
export function nativeRuntimeOwnedDetail(providerId: string): string {
  return isProviderSessionProviderId(providerId)
    ? `${getAnthropicProvider(providerId)?.name ?? providerId} authentication is owned by its native runtime.`
    : 'Codex authentication is owned by the native runtime.';
}

export function codexNativeRuntimeRequired(
  recoveryHint?: string,
): AuthRequiredError {
  return new AuthRequiredError(CODEX_NATIVE_RUNTIME_REQUIRED_MESSAGE, {
    providerId: 'openai-codex',
    ...(recoveryHint !== undefined ? { recoveryHint } : {}),
  });
}
