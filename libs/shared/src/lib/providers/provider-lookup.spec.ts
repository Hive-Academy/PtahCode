/**
 * Provider registry — the lookup accessors.
 *
 * The sibling spec (`provider-registry.spec.ts`) covers the user-defined entry
 * merge layer. This one covers the read side that every surface goes through,
 * where the failure modes are quiet rather than loud:
 *
 *  - `getProviderBaseUrl` FALLS BACK rather than throwing, so a typo'd id
 *    silently sends traffic to the default provider's host. That fallback must
 *    be deliberate and pinned, not incidental.
 *  - `getProviderAuthEnvVar` defaults to `ANTHROPIC_AUTH_TOKEN`; a provider
 *    that needs a different variable and does not declare one gets its key
 *    exported under the wrong name and simply fails to authenticate.
 */
import {
  ANTHROPIC_PROVIDERS,
  DEFAULT_PROVIDER_ID,
  clearCustomProviderEntries,
  customEntryToAnthropicProvider,
  getAnthropicProvider,
  getProviderAuthEnvVar,
  getProviderBaseUrl,
  isSubscriptionCoveredProvider,
  setCustomProviderEntries,
  CustomProviderEntrySchema,
  type AnthropicProvider,
} from './provider-registry';
import { findModelPricing } from '../utils/pricing.utils';
import { resolveStrategy } from '../types/auth-strategy.types';

/** The shipped registry, widened from its literal tuple type. */
const PROVIDERS: readonly AnthropicProvider[] = ANTHROPIC_PROVIDERS;

describe('getProviderBaseUrl', () => {
  afterEach(() => clearCustomProviderEntries());

  it('returns the declared base URL for a known provider', () => {
    const provider = PROVIDERS[0];
    expect(getProviderBaseUrl(provider.id)).toBe(provider.baseUrl);
  });

  it('falls back to the default provider for an unknown id', () => {
    const fallback = getAnthropicProvider(DEFAULT_PROVIDER_ID);
    expect(fallback).toBeDefined();
    expect(getProviderBaseUrl('no-such-provider')).toBe(fallback?.baseUrl);
  });

  it('resolves a user-defined provider rather than falling back', () => {
    setCustomProviderEntries([
      CustomProviderEntrySchema.parse({
        id: 'my-box',
        name: 'My Box',
        baseUrl: 'http://192.168.1.50:8000',
        lane: 'openai',
      }),
    ]);

    expect(getProviderBaseUrl('my-box')).toBe('http://192.168.1.50:8000');
  });
});

describe('getProviderAuthEnvVar', () => {
  it('returns the declared variable for every shipped provider', () => {
    for (const provider of PROVIDERS) {
      expect(getProviderAuthEnvVar(provider.id)).toBe(provider.authEnvVar);
    }
  });

  it('defaults to ANTHROPIC_AUTH_TOKEN for an unknown id', () => {
    expect(getProviderAuthEnvVar('no-such-provider')).toBe(
      'ANTHROPIC_AUTH_TOKEN',
    );
  });
});

describe('customEntryToAnthropicProvider', () => {
  it('renders a key placeholder from the declared prefix', () => {
    const provider = customEntryToAnthropicProvider(
      CustomProviderEntrySchema.parse({
        id: 'prefixed',
        name: 'Prefixed',
        baseUrl: 'https://api.example.com/v1',
        lane: 'openai',
        keyPrefix: 'sk-ex-',
      }),
    );

    expect(provider.keyPlaceholder).toBe('sk-ex-…');
  });

  it('falls back to a generic placeholder when no prefix is declared', () => {
    const provider = customEntryToAnthropicProvider(
      CustomProviderEntrySchema.parse({
        id: 'unprefixed',
        name: 'Unprefixed',
        baseUrl: 'https://api.example.com/v1',
        lane: 'anthropic',
      }),
    );

    expect(provider.keyPlaceholder).toBe('API key');
  });
});

describe('kimi-code registry entry', () => {
  const kimi = getAnthropicProvider('kimi-code');

  it('is an OAuth proxy provider on the coding endpoint with an API key fallback', () => {
    expect(kimi).toBeDefined();
    expect(kimi?.baseUrl).toBe('https://api.kimi.ai/coding/');
    // The direct key paths (draft verification, connection check, Ptah CLI
    // agents) still send the fallback key as x-api-key.
    expect(kimi?.authEnvVar).toBe('ANTHROPIC_API_KEY');
    expect(kimi?.authType).toBe('oauth');
    expect(kimi?.requiresProxy).toBe(true);
    expect(kimi?.apiKeyFallback).toBe(true);
    expect(kimi?.supportsOptionalApiKey).toBeUndefined();
    expect(kimi?.pricingModel).toBe('subscription');
    expect(kimi?.modelsEndpoint).toBeUndefined();
    expect(isSubscriptionCoveredProvider('kimi-code')).toBe(true);
  });

  it('routes third-party auth through the OAuth proxy strategy', () => {
    expect(kimi).toBeDefined();
    if (!kimi) return;
    expect(resolveStrategy('thirdParty', kimi)).toBe('oauth-proxy');
  });

  it('defaults to the K3.1 Pro / K3 / Kimi for Coding tiers', () => {
    expect(kimi?.defaultTiers).toEqual({
      opus: 'k3.1-pro',
      sonnet: 'k3',
      haiku: 'kimi-for-coding',
    });
  });

  it('declares the SDK capability allowlist for its live models', () => {
    expect(kimi?.liveModelCapabilities).toEqual([
      'thinking',
      'interleaved_thinking',
      'effort',
      'xhigh_effort',
      'max_effort',
    ]);
  });

  it('has no kimi-code rate in the pricing map (cost unknown)', () => {
    expect(findModelPricing('k3')).toBeNull();
  });

  it('replaces the moonshot entry rather than sitting beside it', () => {
    expect(getAnthropicProvider('moonshot')).toBeUndefined();
    expect(PROVIDERS.map((p) => p.id)).not.toContain('moonshot');
  });
});
