import {
  ANTHROPIC_API_LANE_ENTRY,
  ANTHROPIC_DIRECT_PROVIDER_ID,
  ANTHROPIC_PROVIDERS,
  getAllAnthropicProviders,
  getAnthropicProvider,
  getPtahCliLaneProvider,
  isBuiltInProviderId,
} from './index';
import { CLAUDE_CLI_PROVIDER_ENTRY } from './entries/claude-cli-provider-entry';

describe('direct Claude API CLI lane', () => {
  it('has a direct key and valid Claude tier defaults', () => {
    const lane = ANTHROPIC_API_LANE_ENTRY;
    expect(lane).toMatchObject({
      id: 'anthropic-api',
      name: 'Claude API',
      baseUrl: 'https://api.anthropic.com',
      authType: 'apiKey',
      authEnvVar: 'ANTHROPIC_API_KEY',
      requiresProxy: false,
    });
    expect(lane.nativeAuth).not.toBe(true);
    // The models come from the live `/v1/models` route; the tiers are the
    // native login's defaults.
    expect(lane.modelsEndpoint).toBe(
      'https://api.anthropic.com/v1/models?limit=1000',
    );
    expect(lane.defaultTiers).toEqual(CLAUDE_CLI_PROVIDER_ENTRY.defaultTiers);
    for (const tier of ['opus', 'sonnet', 'haiku'] as const) {
      expect(lane.defaultTiers?.[tier]).toBeDefined();
    }
  });

  it('remains lane-only and reserves both Anthropic IDs', () => {
    expect(getPtahCliLaneProvider('anthropic-api')).toBe(
      ANTHROPIC_API_LANE_ENTRY,
    );
    expect(getAnthropicProvider('anthropic-api')).toBeUndefined();
    expect(getAnthropicProvider(ANTHROPIC_DIRECT_PROVIDER_ID)).toBeUndefined();
    expect(
      ANTHROPIC_PROVIDERS.some((provider) => provider.id === 'anthropic-api'),
    ).toBe(false);
    expect(
      getAllAnthropicProviders().some(
        (provider) => provider.id === 'anthropic-api',
      ),
    ).toBe(false);
    expect(isBuiltInProviderId('anthropic-api')).toBe(true);
    expect(isBuiltInProviderId(ANTHROPIC_DIRECT_PROVIDER_ID)).toBe(true);
  });
});
