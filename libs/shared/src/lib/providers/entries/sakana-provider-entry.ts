/**
 * Sakana Provider Entry
 *
 * Static provider definition for Sakana AI's "Fugu" models.
 * Registered into the Anthropic-compatible provider registry.
 *
 * Sakana exposes an OpenAI-compatible API (Chat Completions + Responses) at
 * https://api.sakana.ai/v1 with Bearer authentication. It is the first
 * provider combining `authType: 'apiKey'` (a user-provided remote key) with
 * `requiresProxy: true` (a local translation proxy converts Anthropic
 * Messages -> OpenAI Chat Completions). Tier mapping is driven entirely by
 * `defaultTiers`. No built-in model list: `modelsEndpoint` is the only model list
 * (including dated aliases such as `fugu-ultra-20260615`); without a key or
 * offline the picker reports the saved or unavailable list.
 *
 * Pricing is unpublished, so cost is unknown.
 */

import type { AnthropicProvider } from '../provider-registry';

/**
 * Default model tier mappings for Sakana.
 * Applied on provider selection so "Default (recommended)" resolves to the
 * provider's best model. Fugu ids name no tier, so the derivation below the
 * registry (`model-tier-derivation.ts`) can only reach them through its
 * context-length ordinal pass; these explicit mappings are the verified
 * statement that outranks it.
 */
export const SAKANA_DEFAULT_TIERS = {
  sonnet: 'fugu',
  opus: 'fugu-ultra',
  haiku: 'fugu',
} as const;

/**
 * Sakana (Fugu) provider entry for the Anthropic-compatible provider registry.
 *
 * Key characteristics:
 * - `baseUrl`: Sakana's OpenAI-compatible endpoint (https://api.sakana.ai/v1)
 * - `authType: 'apiKey'` -- user-provided Bearer key
 * - `requiresProxy: true` -- needs the translation proxy (OpenAI -> Anthropic)
 * - `isLocal: false` -- remote API
 * - `modelsEndpoint` -- enables dynamic listing via the generic
 *   ProviderModelsService path (incl. dated aliases like `fugu-ultra-20260615`)
 */
export const SAKANA_PROVIDER_ENTRY: AnthropicProvider = {
  id: 'sakana',
  name: 'Sakana (Fugu)',
  baseUrl: 'https://api.sakana.ai/v1',
  authEnvVar: 'ANTHROPIC_AUTH_TOKEN',
  authType: 'apiKey',
  requiresProxy: true,
  isLocal: false,
  keyPrefix: '',
  helpUrl: 'https://console.sakana.ai/api-keys',
  description: 'Fugu models via Sakana AI',
  keyPlaceholder: 'Enter Sakana API key...',
  maskedKeyDisplay: '••••••••••••',
  modelsEndpoint: 'https://api.sakana.ai/v1/models',
  defaultTiers: SAKANA_DEFAULT_TIERS,
};
