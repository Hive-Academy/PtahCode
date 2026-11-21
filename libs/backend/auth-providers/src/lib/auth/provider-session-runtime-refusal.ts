import { AuthRequiredError } from '@ptah-extension/agent-sdk';
import {
  getAnthropicProvider,
  providerSessionNativeRuntimeRequiredMessage,
} from '@ptah-extension/shared';

/**
 * The deliberate refusal for a provider-session provider on a path that
 * needs the Claude SDK (global auth env, one-shot queries, translation
 * proxies, draft probes). Provider sessions run only as a chat or agent
 * runtime. `isProviderSessionNativeRuntimeRefusal` recognises the result.
 */
export function providerSessionNativeRuntimeRequired(
  providerId: string,
): AuthRequiredError {
  const name = getAnthropicProvider(providerId)?.name ?? providerId;
  return new AuthRequiredError(
    providerSessionNativeRuntimeRequiredMessage(providerId),
    {
      providerId,
      recoveryHint: `Use ${name} in the chat, or choose another provider for this feature in Settings.`,
    },
  );
}
