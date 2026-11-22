import {
  CODEX_DEFAULT_TIERS,
  CODEX_PROVIDER_ENTRY,
} from './codex-provider-entry';
import { isSubscriptionCoveredProvider } from '../provider-registry';

describe('CODEX_PROVIDER_ENTRY', () => {
  it('shares its default tier mappings with the provider registry', () => {
    expect(CODEX_PROVIDER_ENTRY.defaultTiers).toBe(CODEX_DEFAULT_TIERS);
    expect(Object.keys(CODEX_DEFAULT_TIERS).sort()).toEqual([
      'haiku',
      'opus',
      'sonnet',
    ]);
    const models = Object.values(CODEX_DEFAULT_TIERS);
    expect(models.every((model) => model.trim().length > 0)).toBe(true);
    expect(new Set(models).size).toBe(models.length);
  });

  it('is subscription-covered', () => {
    expect(isSubscriptionCoveredProvider('openai-codex')).toBe(true);
  });
});
