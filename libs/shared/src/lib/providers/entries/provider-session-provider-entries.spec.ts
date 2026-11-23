import { ANTIGRAVITY_CLI_PROVIDER_ENTRY } from './provider-session-provider-entries';
import {
  getAnthropicProvider,
  getProviderSessionProfile,
  isBuiltInProviderId,
  isProviderSessionProviderId,
  isSubscriptionCoveredProvider,
  providerRuntimeFor,
} from '../provider-registry';

describe('ANTIGRAVITY_CLI_PROVIDER_ENTRY', () => {
  it('is a provider-session entry with no endpoint, proxy or key', () => {
    expect(ANTIGRAVITY_CLI_PROVIDER_ENTRY).toMatchObject({
      id: 'antigravity-cli',
      authType: 'oauth',
      baseUrl: '',
      requiresProxy: false,
      pricingModel: 'subscription',
      providerSession: 'antigravity',
    });
  });

  it('is registered as a built-in provider-session provider', () => {
    expect(getAnthropicProvider('antigravity-cli')).toBe(
      ANTIGRAVITY_CLI_PROVIDER_ENTRY,
    );
    expect(isBuiltInProviderId('antigravity-cli')).toBe(true);
    expect(getProviderSessionProfile('antigravity-cli')).toBe('antigravity');
    expect(isProviderSessionProviderId('antigravity-cli')).toBe(true);
    expect(providerRuntimeFor('antigravity-cli')).toBe('provider-session');
  });

  it('is subscription-covered', () => {
    expect(isSubscriptionCoveredProvider('antigravity-cli')).toBe(true);
  });
});
