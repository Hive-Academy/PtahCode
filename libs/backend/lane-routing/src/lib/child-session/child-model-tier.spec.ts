import { getAnthropicProvider } from '@ptah-extension/shared';
jest.mock('@ptah-extension/shared', () => {
  const actual = jest.requireActual<typeof import('@ptah-extension/shared')>('@ptah-extension/shared');
  return { ...actual, getAnthropicProvider: jest.fn(actual.getAnthropicProvider) };
});
import { childModelCandidates, childModelTier, childModelWindow, compareChildModelVersions } from './child-model-tier';

describe('child model tiers', () => {
  it('orders versions numerically and ignores date suffixes', () => {
    expect(['claude-sonnet-5', 'claude-sonnet-4-6-20261118', 'claude-sonnet-5-5'].sort(compareChildModelVersions)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6-20261118']);
    expect(compareChildModelVersions('claude-sonnet-5-10', 'claude-sonnet-5-9')).toBeLessThan(0);
  });
  it('ignores dashed date suffixes', () => {
    expect(['gpt-4o-2024-08-06', 'gpt-4o'].sort(compareChildModelVersions)).toEqual(['gpt-4o', 'gpt-4o-2024-08-06']);
    expect(['gemini-2.5-pro-preview-05-06', 'gemini-2.5-pro', 'gemini-3-pro'].sort(compareChildModelVersions)).toEqual(['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-pro-preview-05-06']);
  });
  it('gets static windows and the legacy fallback table', () => {
    expect(childModelWindow('claude-sonnet-5-5')).toBe(1_000_000);
    expect(childModelWindow('claude-haiku-4-5-20251001')).toBe(200_000);
    expect(childModelWindow('claude-3-7-sonnet-20250219')).toBe(200_000);
    expect(childModelWindow('claude-haiku-5-5')).toBeUndefined();
  });
  it('drops known 200k candidates only when that tier has a known 1M candidate', () => {
    expect(childModelCandidates(['claude-3-7-sonnet', 'claude-sonnet-5-5', 'claude-sonnet-5'], 1)).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5']);
    expect(childModelCandidates(['claude-haiku-4-5', 'claude-haiku-5-5'], 0)).toContain('claude-haiku-4-5');
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
    const provider = getAnthropicProvider('claude-cli');
    if (!provider) throw new Error('native provider missing');
    // Every lookup sees the fixture for this decision, including the filtering pass.
    jest.mocked(getAnthropicProvider).mockReturnValue({ ...provider, staticModels: [
      { id: 'claude-haiku-4-0', name: '1M Haiku fixture', description: 'Test context capacity', contextLength: 1_000_000, supportsToolUse: true },
    ] });
    try {
      expect(childModelCandidates(['claude-haiku-4-5', 'claude-haiku-4-0'], 0)).toEqual(['claude-haiku-4-0']);
    } finally {
      jest.mocked(getAnthropicProvider).mockReturnValue(provider);
    }
  });

});

