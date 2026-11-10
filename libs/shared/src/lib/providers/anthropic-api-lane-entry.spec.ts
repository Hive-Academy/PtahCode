import {
  ANTHROPIC_API_LANE_ENTRY,
  ANTHROPIC_DIRECT_PROVIDER_ID,
  ANTHROPIC_PROVIDERS,
  getAllAnthropicProviders,
  getAnthropicProvider,
  getPtahCliLaneProvider,
  isBuiltInProviderId,
} from './index';

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
    const modelIds = new Set(lane.staticModels?.map((model) => model.id));
    for (const tier of ['opus', 'sonnet', 'haiku'] as const) {
      expect(lane.defaultTiers?.[tier]).toBeDefined();
      expect(modelIds.has(lane.defaultTiers?.[tier] ?? '')).toBe(true);
    }
  });

  it('remains lane-only and reserves both Anthropic IDs', () => {
    expect(getPtahCliLaneProvider('anthropic-api')).toBe(ANTHROPIC_API_LANE_ENTRY);
    expect(getAnthropicProvider('anthropic-api')).toBeUndefined();
    expect(getAnthropicProvider(ANTHROPIC_DIRECT_PROVIDER_ID)).toBeUndefined();
    expect(ANTHROPIC_PROVIDERS.some((provider) => provider.id === 'anthropic-api')).toBe(false);
    expect(getAllAnthropicProviders().some((provider) => provider.id === 'anthropic-api')).toBe(false);
    expect(isBuiltInProviderId('anthropic-api')).toBe(true);
    expect(isBuiltInProviderId(ANTHROPIC_DIRECT_PROVIDER_ID)).toBe(true);
  });
});
