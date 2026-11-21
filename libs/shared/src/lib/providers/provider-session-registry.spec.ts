/**
 * No built-in entry carries `providerSession` yet (one is added per admitting
 * phase), so this spec gives two existing entries a profile to prove the
 * lookups: one renamed to a reserved provider-session id, one keeping an id
 * outside the reserved list. `provider-session-registry.entries.spec.ts`
 * pins that the real registry has none.
 */
jest.mock('./entries/requesty-provider-entry', () => {
  const actual = jest.requireActual('./entries/requesty-provider-entry');
  return {
    ...actual,
    REQUESTY_PROVIDER_ENTRY: {
      ...actual.REQUESTY_PROVIDER_ENTRY,
      id: 'antigravity-cli',
      name: 'Antigravity',
      providerSession: 'antigravity',
    },
  };
});
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
