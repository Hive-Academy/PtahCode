/**
 * OpenCode Provider Entries
 *
 * Static provider definitions for OpenCode Zen and OpenCode Go.
 * Registered into the Anthropic-compatible provider registry.
 *
 * OpenCode Zen:
 * - Pay-as-you-go / usage-billed (`pricingModel: 'usage'`)
 * - Base URL: https://opencode.ai/zen/v1
 * - Key: User-provided remote key via OPENCODE_API_KEY
 * - Multi-protocol routing via local translation proxy
 *
 * OpenCode Go:
 * - Flat $10/month subscription (`pricingModel: 'subscription'`)
 * - Base URL: https://opencode.ai/zen/go/v1
 * - Key: User-provided separate Go key
 * - Kept OUT of the shared pricing map (`isSubscriptionCoveredProvider` guard)
 * - Multi-protocol routing via local translation proxy
 *
 * No built-in model list or routing table: the models and each model's
 * upstream protocol come from the public gateway catalog at runtime
 * (`OpenCodeLiveRoutes` in auth-providers). A model whose protocol cannot be
 * routed (Google generateContent, Jev systemone) is not listed.
 *
 * @see TASK_2026_526
 */

import type { AnthropicProvider } from '../provider-registry';

/** The two OpenCode subscriptions. */
export type OpenCodeProviderId = 'opencode-zen' | 'opencode-go';

/** The upstream APIs OpenCode routes a model to. */
export type OpenCodeProtocol = 'messages' | 'chat/completions' | 'responses';

/**
 * Type guard for OpenCodeProviderId.
 */
export function isOpenCodeProviderId(id: string): id is OpenCodeProviderId {
  return id === 'opencode-zen' || id === 'opencode-go';
}

/**
 * Default model tier mappings for OpenCode Zen.
 * All Zen tier defaults route to native Anthropic Messages.
 */
export const OPENCODE_ZEN_DEFAULT_TIERS = {
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5',
  haiku: 'claude-haiku-4-5',
} as const;

/**
 * Default model tier mappings for OpenCode Go.
 * All Go tier defaults route to OpenAI Chat Completions.
 */
export const OPENCODE_GO_DEFAULT_TIERS = {
  sonnet: 'glm-5.3',
  opus: 'kimi-k3',
  haiku: 'glm-5.3-flash',
} as const;

/**
 * OpenCode Zen provider entry.
 */
export const OPENCODE_ZEN_PROVIDER_ENTRY: AnthropicProvider = {
  id: 'opencode-zen',
  name: 'OpenCode Zen',
  baseUrl: 'https://opencode.ai/zen/v1',
  authEnvVar: 'ANTHROPIC_AUTH_TOKEN',
  authType: 'apiKey',
  requiresProxy: true,
  isLocal: false,
  keyPrefix: '',
  helpUrl: 'https://opencode.ai/docs/zen/',
  description:
    'Usage-billed OpenCode models via Messages, Chat Completions and Responses. Gemini and Jev are not supported.',
  keyPlaceholder: 'Enter OpenCode Zen API key...',
  maskedKeyDisplay: '••••••••',
  pricingModel: 'usage',
  defaultTiers: OPENCODE_ZEN_DEFAULT_TIERS,
};

/**
 * OpenCode Go provider entry.
 *
 * OpenCode Go is a flat $10/month subscription, so its entry carries
 * `pricingModel: 'subscription'` and stays OUT of the shared pricing map.
 */
export const OPENCODE_GO_PROVIDER_ENTRY: AnthropicProvider = {
  id: 'opencode-go',
  name: 'OpenCode Go',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  authEnvVar: 'ANTHROPIC_AUTH_TOKEN',
  authType: 'apiKey',
  requiresProxy: true,
  isLocal: false,
  keyPrefix: '',
  helpUrl: 'https://opencode.ai/docs/go/',
  description:
    'OpenCode Go, $10/month with a separate Go key. Messages, Chat Completions and Responses; Gemini and Jev are not supported.',
  keyPlaceholder: 'Enter OpenCode Go API key...',
  maskedKeyDisplay: '••••••••',
  pricingModel: 'subscription',
  defaultTiers: OPENCODE_GO_DEFAULT_TIERS,
};
