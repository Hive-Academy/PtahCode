import { replaceProviderContextWindows } from '@ptah-extension/shared';
import { childModelCandidates, childModelTier, childModelWindow, compareChildModelVersions, preferredChildModels } from './child-model-tier';

describe('child model tiers', () => {
  // The windows a live `claude-cli` catalogue reports; no repository list supplies them.
  beforeEach(() => {
    replaceProviderContextWindows('claude-cli', [{ id: 'claude-sonnet-5-5', contextLength: 1_000_000 }]);
  });
  afterEach(() => {
    replaceProviderContextWindows('claude-cli', []);
  });

  it.each([
    ['gpt-astra-1', 3],
    ['gpt-sol-1', 2],
    ['gpt-terra-1', 1],
    ['gpt-luna-1', 0],
    ['aragon-1', 2],
    ['claude-opus-5-5', 2],
    ['claude-sonnet-5-5', 1],
    ['claude-haiku-5-5', 0],
    ['claude-fable-5-2', 3],
    ['gemini-3-pro', 2],
    ['gemini-3-flash', 0],
    ['kimi-k2', 1],
    ['kimi-k3', 1],
    ['glm-5', 1],
    ['glm-4.6', 1],
    ['glm-4.5-air', 1],
    ['glm-4-flash', 0],
    ['gpt-sol-2', 2],
    ['gpt-5.5-console', 1],
    ['gpt-solution-1', 1],
  ])('classifies %s as tier %s', (model, tier) => {
    expect(childModelTier(model)).toBe(tier);
  });
  it('preserves token delimiters, case folding, and check precedence', () => {
    expect(childModelTier('GPT/ASTRA_1')).toBe(3);
    expect(childModelTier('gpt.sol:2')).toBe(2);
    expect(childModelTier('sol2')).toBe(2);
    expect(childModelTier('default-astra-sol-luna')).toBeUndefined();
    expect(childModelTier('astra-sol-luna')).toBe(3);
    expect(childModelTier('sol-luna')).toBe(2);
  });
  it.each([0, 1, 2] as const)('never offers Astra or Fable automatically for tier %s', (tier) => {
    const pinned = ['gpt-astra-1', 'claude-fable-5-2'];
    const automatic = ['gpt-sol-1', 'gpt-terra-1', 'gpt-luna-1'];
    const catalog = [...pinned, ...automatic];
    expect(childModelCandidates(catalog, tier)).toEqual(childModelCandidates(automatic, tier));
    expect(preferredChildModels(catalog, tier)).toEqual(preferredChildModels(automatic, tier));
    expect(childModelCandidates(pinned, tier)).toEqual([]);
    expect(preferredChildModels(pinned, tier)).toEqual([]);
  });
  it('keeps tier 3 pin-only even when it is the requested candidate floor', () => {
    expect(childModelCandidates(['gpt-astra-1', 'claude-fable-5-2'], 3)).toEqual([]);
  });
  it('orders versions numerically and ignores date suffixes', () => {
    expect(['claude-sonnet-5', 'claude-sonnet-4-6-20261118', 'claude-sonnet-5-5'].sort(compareChildModelVersions)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6-20261118']);
    expect(compareChildModelVersions('claude-sonnet-5-10', 'claude-sonnet-5-9')).toBeLessThan(0);
  });
  it('ignores dashed date suffixes', () => {
    expect(['gpt-4o-2024-08-06', 'gpt-4o'].sort(compareChildModelVersions)).toEqual(['gpt-4o', 'gpt-4o-2024-08-06']);
    expect(['gemini-2.5-pro-preview-05-06', 'gemini-2.5-pro', 'gemini-3-pro'].sort(compareChildModelVersions)).toEqual(['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-pro-preview-05-06']);
  });
  it('gets discovered windows, [1m] ids and the legacy fallback table', () => {
    expect(childModelWindow('claude-sonnet-5-5')).toBe(1_000_000);
    expect(childModelWindow('claude-opus-5-5[1m]')).toBe(1_000_000);
    expect(childModelWindow('claude-opus-5-5')).toBeUndefined();
    expect(childModelWindow('claude-haiku-4-5-20251001')).toBe(200_000);
    expect(childModelWindow('claude-3-7-sonnet-20250219')).toBe(200_000);
    expect(childModelWindow('claude-haiku-5-5')).toBeUndefined();
  });
  it('holds known 200k candidates in reserve only when that tier has a known 1M candidate', () => {
    expect(preferredChildModels(['claude-3-7-sonnet', 'claude-sonnet-5-5', 'claude-sonnet-5'], 1)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5']);
    expect(childModelCandidates(['claude-3-7-sonnet', 'claude-sonnet-5-5', 'claude-sonnet-5'], 1)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-3-7-sonnet']);
    expect(preferredChildModels(['claude-haiku-4-5', 'claude-haiku-5-5'], 0)).toContain('claude-haiku-4-5');
  });
  it('puts reserve 200k models after the preferred models of every fallback tier', () => {
    expect(childModelCandidates(['claude-3-7-sonnet', 'claude-sonnet-5-5', 'claude-opus-5-5'], 1)).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-3-7-sonnet']);
  });
  it('ignores default and reserves Fable for explicit selection', () => {
    expect(childModelTier('default')).toBeUndefined();
    expect(childModelTier('claude-fable-5-2')).toBe(3);
    expect(childModelCandidates(['default', 'claude-fable-5-2'], 1)).toEqual([]);
  });
  it('keeps the allowed fallback tiers after the preferred tier, in tier order', () => {
    const catalog = ['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5'];
    expect(childModelCandidates(catalog, 1)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-opus-5-5']);
    expect(childModelCandidates(catalog, 2)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5']);
    expect(childModelCandidates(catalog, 0)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-opus-5-5']);
  });
  it('deduplicates candidates', () => {
    expect(childModelCandidates(['claude-sonnet-5', 'claude-sonnet-5'], 1)).toEqual(['claude-sonnet-5']);
  });
  it('never chooses a known 200k Haiku when a 1M Haiku is admitted', () => {
    replaceProviderContextWindows('claude-cli', [{ id: 'claude-haiku-4-0', contextLength: 1_000_000 }]);
    expect(preferredChildModels(['claude-haiku-4-5', 'claude-haiku-4-0'], 0)).toEqual(['claude-haiku-4-0']);
    expect(childModelCandidates(['claude-haiku-4-5', 'claude-haiku-4-0'], 0)).toEqual(['claude-haiku-4-0', 'claude-haiku-4-5']);
  });

  it('reads only the claude-cli catalogue, not another provider\'s window for the same id', () => {
    replaceProviderContextWindows('claude-cli', []);
    replaceProviderContextWindows('openrouter', [{ id: 'claude-sonnet-5-5', contextLength: 1_000_000 }]);
    try {
      expect(childModelWindow('claude-sonnet-5-5')).toBeUndefined();
    } finally {
      replaceProviderContextWindows('openrouter', []);
    }
  });

});

