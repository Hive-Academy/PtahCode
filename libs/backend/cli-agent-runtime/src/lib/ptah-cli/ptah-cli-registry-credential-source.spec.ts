import { parsePtahCliCredentialSource } from './helpers/ptah-cli-credential-source';

describe('Ptah CLI credential source boundary', () => {
  it('keeps legacy instances on their instance secret', () => {
    expect(parsePtahCliCredentialSource('anthropic-api', undefined)).toBe('instance');
  });

  it('accepts the shared connection only for the direct Claude API lane', () => {
    expect(parsePtahCliCredentialSource('anthropic-api', 'shared-connection')).toBe('shared-connection');
    expect(() => parsePtahCliCredentialSource('claude-cli', 'shared-connection')).toThrow();
    expect(() => parsePtahCliCredentialSource('anthropic-api', 'invalid')).toThrow();
  });
});
