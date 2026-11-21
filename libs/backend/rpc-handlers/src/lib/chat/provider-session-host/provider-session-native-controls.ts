/**
 * `NativeSessionControls` of provider sessions (SDK_TOKENS.PROVIDER_SESSION_CONTROLS,
 * the session runtime router's third arm). Live model/effort/permission
 * changes, their persistence and rollback are the native controls Codex uses
 * (`createNativeSessionControls`) over the provider-session adapter; only
 * `/compact` differs: a provider session owns its own context, so it is
 * refused before any adapter call.
 */
import {
  ProviderSessionChatAdapterError,
  type NativeSessionControls,
} from '@ptah-extension/agent-sdk';
import {
  createNativeSessionControls,
  type NativeSessionControlsDeps,
} from '../codex-host/native-session-controls';

export type ProviderSessionNativeControlsDeps = NativeSessionControlsDeps;

export function createProviderSessionNativeControls(
  deps: ProviderSessionNativeControlsDeps,
): NativeSessionControls {
  const controls = createNativeSessionControls(deps);
  return {
    ...controls,
    async compact() {
      throw new ProviderSessionChatAdapterError(
        'unsupported-option',
        'compact',
        { option: '/compact' },
      );
    },
  };
}
