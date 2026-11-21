import {
  ANTHROPIC_PROVIDERS,
  PROVIDER_SESSION_PROVIDER_IDS,
  type AnthropicProvider,
} from './provider-registry';

const entries: readonly AnthropicProvider[] = ANTHROPIC_PROVIDERS;

describe('built-in provider-session entries', () => {
  it('has none before an admitting phase adds one', () => {
    expect(
      entries.filter((provider) => provider.providerSession !== undefined),
    ).toEqual([]);
  });

  it('gives every provider-session entry a reserved id', () => {
    // An entry outside the reserved union would never be recognised; add
    // its id to PROVIDER_SESSION_PROVIDER_IDS with the entry.
    const reserved: readonly string[] = PROVIDER_SESSION_PROVIDER_IDS;
    for (const provider of entries) {
      if (provider.providerSession !== undefined) {
        expect(reserved).toContain(provider.id);
      }
    }
  });
});
