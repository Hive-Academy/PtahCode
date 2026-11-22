/**
 * Copilot Provider Entry
 *
 * Static provider definition for GitHub Copilot.
 * Registered into the Anthropic-compatible provider registry.
 */

import type { AnthropicProvider } from '../provider-registry';

/**
 * Default model tier mappings for GitHub Copilot.
 * Auto-applied on first login so users get the best models mapped immediately.
 *
 * IMPORTANT: These default to GPT models, NOT Claude. Claude models via Copilot
 * consume 5-10x more premium requests than GPT equivalents. Since the Claude
 * Agent SDK spawns subagents using tier aliases (sonnet/opus/haiku), every
 * subagent would silently use Claude at inflated rates if these defaulted
 * to Claude models — even when the user selected a GPT model for the main session.
 *
 * Users who prefer Claude through Copilot can manually configure tiers in the UI.
 */
export const COPILOT_DEFAULT_TIERS = {
  sonnet: 'gpt-5.4',
  opus: 'gpt-5.4',
  haiku: 'gpt-5-mini',
} as const;

/**
 * GitHub Copilot provider entry for the Anthropic-compatible provider registry.
 *
 * Key differences from other providers:
 * - `baseUrl` is empty — set dynamically to the translation proxy URL at runtime
 * - `authType: 'oauth'` — uses GitHub OAuth instead of API key input
 * - `requiresProxy: true` — needs the translation proxy to convert protocols
 *
 * No built-in model list: the visible models come only from the Copilot SDK's live
 * `listModels()`; a failed read reports the saved or unavailable list.
 */
export const COPILOT_PROVIDER_ENTRY: AnthropicProvider = {
  id: 'github-copilot',
  name: 'GitHub Copilot',
  baseUrl: '',
  authEnvVar: 'ANTHROPIC_AUTH_TOKEN',
  authType: 'oauth',
  requiresProxy: true,
  keyPrefix: '',
  helpUrl: 'https://github.com/features/copilot',
  description: 'Claude models via GitHub Copilot subscription',
  keyPlaceholder: 'Authenticated via GitHub',
  maskedKeyDisplay: 'GitHub Copilot (connected)',
  defaultTiers: COPILOT_DEFAULT_TIERS,
  pricingModel: 'subscription',
};
