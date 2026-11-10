import {
  PTAH_CLI_PROVIDER_MARK_IDS,
  cliMarkFor,
  ptahCliProviderMarkId,
} from './agent-marks';

describe('ptahCliProviderMarkId', () => {
  it('maps anthropic-api and the Anthropic family to the Anthropic mark', () => {
    expect(ptahCliProviderMarkId('anthropic-api')).toBe('anthropic');
    expect(ptahCliProviderMarkId('anthropic')).toBe('anthropic');
  });

  it('maps both Ollama ids to the Ollama mark', () => {
    expect(ptahCliProviderMarkId('ollama')).toBe('ollama');
    expect(ptahCliProviderMarkId('ollama-cloud')).toBe('ollama');
  });

  it('returns null for an unknown, blank or missing provider id', () => {
    expect(ptahCliProviderMarkId('requesty')).toBeNull();
    expect(ptahCliProviderMarkId('my-custom-provider')).toBeNull();
    expect(ptahCliProviderMarkId('toString')).toBeNull();
    expect(ptahCliProviderMarkId('  ')).toBeNull();
    expect(ptahCliProviderMarkId(null)).toBeNull();
    expect(ptahCliProviderMarkId(undefined)).toBeNull();
  });

  it('keeps every table value non-empty', () => {
    for (const id of Object.values(PTAH_CLI_PROVIDER_MARK_IDS)) {
      expect(id.length).toBeGreaterThan(0);
    }
  });
});

describe('cliMarkFor with a provider id', () => {
  it('shows the provider mark for a ptah-cli lane', () => {
    expect(cliMarkFor('ptah-cli', 'anthropic-api')).toEqual({
      kind: 'provider',
      providerId: 'anthropic',
    });
    expect(cliMarkFor('ptah-cli', 'ollama')).toEqual({
      kind: 'provider',
      providerId: 'ollama',
    });
  });

  it('falls back to the ptah-cli P mark for an unknown or missing provider', () => {
    const fallback = { kind: 'provider', providerId: 'ptah-cli' };
    expect(cliMarkFor('ptah-cli', 'unknown-provider')).toEqual(fallback);
    expect(cliMarkFor('ptah-cli', null)).toEqual(fallback);
    expect(cliMarkFor('ptah-cli')).toEqual(fallback);
  });

  it('ignores the provider id for system CLI lanes', () => {
    expect(cliMarkFor('codex', 'anthropic-api')).toEqual({
      kind: 'provider',
      providerId: 'codex',
    });
  });
});
