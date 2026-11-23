/**
 * Antigravity is the first built-in provider-session entry. To prove that a
 * profile on an id outside the reserved list is ignored, this spec gives the
 * Sakana entry a profile.
 */
jest.mock('./entries/sakana-provider-entry', () => {
  const actual = jest.requireActual('./entries/sakana-provider-entry');
  return {
    ...actual,
    SAKANA_PROVIDER_ENTRY: {
      ...actual.SAKANA_PROVIDER_ENTRY,
      providerSession: 'grok',
    },
  };
});

import {
  getProviderSessionProfile,
  isProviderSessionProviderId,
  planOwnerProviderId,
  providerRuntimeFor,
  providerSessionNativeRuntimeRequiredMessage,
} from './provider-registry';

describe('provider-session registry lookups', () => {
  it('reads the profile of a reserved id whose entry declares one', () => {
    expect(getProviderSessionProfile('antigravity-cli')).toBe('antigravity');
    expect(isProviderSessionProviderId('antigravity-cli')).toBe(true);
    expect(providerRuntimeFor('antigravity-cli')).toBe('provider-session');
  });

  it('ignores a profile on an id outside the reserved union', () => {
    expect(getProviderSessionProfile('sakana')).toBeUndefined();
    expect(isProviderSessionProviderId('sakana')).toBe(false);
    expect(providerRuntimeFor('sakana')).toBe('claude-sdk');
  });

  it('answers "not a provider session" for a reserved id with no entry', () => {
    expect(getProviderSessionProfile('grok-cli')).toBeUndefined();
    expect(isProviderSessionProviderId('grok-cli')).toBe(false);
  });

  it('names the plan-limit owner provider of a main provider (issue #1459)', () => {
    // Antigravity bills its CLI account, whose owners carry the profile id.
    expect(planOwnerProviderId('antigravity-cli')).toBe('antigravity');
    expect(planOwnerProviderId('openai-codex')).toBe('openai-codex');
    expect(planOwnerProviderId('anthropic')).toBe('anthropic');
    expect(planOwnerProviderId('grok-cli')).toBe('grok-cli');
  });

  it('maps Codex to its app-server runtime', () => {
    expect(providerRuntimeFor('openai-codex')).toBe('codex-app-server');
    expect(isProviderSessionProviderId('openai-codex')).toBe(false);
  });

  it.each(['openrouter', 'anthropic', 'claude-cli', 'unknown-id', ''])(
    'maps %s to the Claude SDK',
    (providerId) => {
      expect(getProviderSessionProfile(providerId)).toBeUndefined();
      expect(isProviderSessionProviderId(providerId)).toBe(false);
      expect(providerRuntimeFor(providerId)).toBe('claude-sdk');
    },
  );

  it('names the provider in the refusal text, falling back to the id', () => {
    expect(providerSessionNativeRuntimeRequiredMessage('antigravity-cli')).toBe(
      "Antigravity runs only as a chat or agent runtime; it cannot serve Ptah's internal model calls.",
    );
    expect(providerSessionNativeRuntimeRequiredMessage('missing-cli')).toBe(
      "missing-cli runs only as a chat or agent runtime; it cannot serve Ptah's internal model calls.",
    );
  });
});
