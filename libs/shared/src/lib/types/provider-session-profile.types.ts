/**
 * The provider-session profiles Ptah drives through one runtime contract
 * (`@ptah-extension/provider-session-contracts`): ACP agents (Antigravity,
 * Grok) and OpenCode's HTTP server. Shared so host capability and auth-status
 * payloads can name a profile without depending on a backend library.
 */
export const PROVIDER_SESSION_PROFILE_IDS = ['antigravity', 'grok', 'opencode'] as const;

export type ProviderSessionProfileId = (typeof PROVIDER_SESSION_PROFILE_IDS)[number];
