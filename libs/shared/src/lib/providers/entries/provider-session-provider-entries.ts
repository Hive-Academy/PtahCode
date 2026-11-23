/**
 * Provider-session provider entries
 *
 * Registry entries for providers that run as a native chat runtime through
 * `@ptah-extension/provider-session-contracts` (one entry per admitted
 * profile). Such an entry never serves the Claude SDK: it has no base URL, no
 * proxy and no API key; the CLI's own sign-in is the credential.
 */

import type { AnthropicProvider } from '../provider-registry';

/**
 * Google Antigravity (`agy`) as a main-chat provider, driven over ACP by the
 * `antigravity` provider-session profile. The renderer offers it only when the
 * host reports an `antigravity` row in `auth:getAuthStatus`
 * (`providerSessionStatus`).
 */
export const ANTIGRAVITY_CLI_PROVIDER_ENTRY: AnthropicProvider = {
  id: 'antigravity-cli',
  name: 'Antigravity',
  baseUrl: '',
  authEnvVar: 'ANTHROPIC_AUTH_TOKEN',
  authType: 'oauth',
  requiresProxy: false,
  keyPrefix: '',
  helpUrl: 'https://antigravity.google',
  description: 'Gemini models via the Antigravity CLI sign-in',
  keyPlaceholder: 'Authenticated via Antigravity CLI',
  maskedKeyDisplay: 'Antigravity (connected)',
  pricingModel: 'subscription',
  providerSession: 'antigravity',
};
