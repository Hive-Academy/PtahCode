/**
 * OpenCode Provider Entry Specs
 *
 * Verifies:
 * 1. The provider-id guard.
 * 2. Resolution through `getAnthropicProvider()` and `getAllAnthropicProviders()`.
 * 3. The entry properties and the default tiers (the models and their
 *    protocols come from the live gateway catalog, not from the entries).
 * 4. Subscription policy: Go is subscription-covered, Zen is usage-billed.
 *
 * @see TASK_2026_526
 */

import {
  OPENCODE_ZEN_PROVIDER_ENTRY,
  OPENCODE_GO_PROVIDER_ENTRY,
  OPENCODE_ZEN_DEFAULT_TIERS,
  OPENCODE_GO_DEFAULT_TIERS,
  isOpenCodeProviderId,
} from './opencode-provider-entry';
import {
  getAllAnthropicProviders,
  getAnthropicProvider,
  isSubscriptionCoveredProvider,
} from '../provider-registry';

describe('OpenCode Provider Entries', () => {
  it('validates isOpenCodeProviderId guard', () => {
    expect(isOpenCodeProviderId('opencode-zen')).toBe(true);
    expect(isOpenCodeProviderId('opencode-go')).toBe(true);
    expect(isOpenCodeProviderId('openrouter')).toBe(false);
    expect(isOpenCodeProviderId('sakana')).toBe(false);
    expect(isOpenCodeProviderId('opencode')).toBe(false);
    expect(isOpenCodeProviderId('')).toBe(false);
  });

  describe('registry integration', () => {
    it('resolves both entries through getAnthropicProvider', () => {
      expect(getAnthropicProvider('opencode-zen')).toBe(
        OPENCODE_ZEN_PROVIDER_ENTRY,
      );
      expect(getAnthropicProvider('opencode-go')).toBe(
        OPENCODE_GO_PROVIDER_ENTRY,
      );
    });

    it('includes both entries in getAllAnthropicProviders', () => {
      const all = getAllAnthropicProviders();
      expect(all.some((p) => p.id === 'opencode-zen')).toBe(true);
      expect(all.some((p) => p.id === 'opencode-go')).toBe(true);
    });

    it('configures OpenCode Zen entry with correct properties', () => {
      expect(OPENCODE_ZEN_PROVIDER_ENTRY).toMatchObject({
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
      });
      expect(OPENCODE_ZEN_PROVIDER_ENTRY.modelsEndpoint).toBeUndefined();
    });

    it('configures OpenCode Go entry with correct properties', () => {
      expect(OPENCODE_GO_PROVIDER_ENTRY).toMatchObject({
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
      });
      expect(OPENCODE_GO_PROVIDER_ENTRY.modelsEndpoint).toBeUndefined();
    });
  });

  describe('default tiers', () => {
    it('maps every Zen tier to a model id', () => {
      expect(OPENCODE_ZEN_DEFAULT_TIERS).toEqual({
        sonnet: 'claude-sonnet-5',
        opus: 'claude-opus-5',
        haiku: 'claude-haiku-4-5',
      });
    });

    it('maps every Go tier to a model id', () => {
      expect(OPENCODE_GO_DEFAULT_TIERS).toEqual({
        sonnet: 'glm-5.3',
        opus: 'kimi-k3',
        haiku: 'glm-5.3-flash',
      });
    });
  });

  describe('pricing and subscription policy', () => {
    it('identifies OpenCode Go as a subscription-covered provider', () => {
      expect(isSubscriptionCoveredProvider('opencode-go')).toBe(true);
    });

    it('identifies OpenCode Zen as not subscription-covered (usage-billed)', () => {
      expect(isSubscriptionCoveredProvider('opencode-zen')).toBe(false);
    });
  });
});
