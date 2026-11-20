import { DEFAULT_MODEL_PRICING } from './pricing.utils';
import { ANTHROPIC_RATE_CARD, findAnthropicRate } from './anthropic-rate-card';

describe('dated Anthropic rates', () => {
  it.each([
    ['claude-opus-5-5', 4, 20, 5, .20], ['claude-sonnet-5-5', 2, 10, 2.5, .10],
    ['claude-fable-5-2', 8, 40, 10, .20], ['claude-fable-5-1', 10, 50, 12.5, .25],
    ['claude-opus-4-8', 5, 25, 6.25, .50], ['claude-sonnet-4-6', 3, 15, 3.75, .30],
    ['claude-haiku-4-5', 1, 5, 1.25, .10],
  ])('prices %s in per-token units', (id, input, output, write, read) => {
    const rate = findAnthropicRate(String(id));
    expect(rate).toMatchObject({ inputCostPerToken: Number(input) * 1e-6, outputCostPerToken: Number(output) * 1e-6,
      cacheCreationCostPerToken: Number(write) * 1e-6, cacheReadCostPerToken: Number(read) * 1e-6,
      catalogVersion: '2026-11-18' });
  });
  it('requires explicit context evidence for Haiku dual tariff', () => {
    for (const count of [undefined, NaN, -1]) expect(findAnthropicRate('claude-haiku-5-5', count)).toBeNull();
    expect(findAnthropicRate('claude-haiku-5-5', 100_001)?.inputCostPerToken).toBe(.5e-6);
    expect(ANTHROPIC_RATE_CARD['claude-haiku-5-5']).toBeUndefined();
  });
  it('bundles seven unconditional IDs and resolves the eighth only with explicit Haiku context', () => {
    expect(Object.keys(ANTHROPIC_RATE_CARD)).toHaveLength(7);
    expect(DEFAULT_MODEL_PRICING['claude-haiku-5-5']).toBeUndefined();
    for (const context of [undefined]) {
      expect(findAnthropicRate('claude-haiku-5-5', context)).toBeNull();
    }
    expect(findAnthropicRate('claude-haiku-5-5', 100_001)).toMatchObject({
      inputCostPerToken: .50 * 1e-6, outputCostPerToken: 2.50 * 1e-6,
      cacheCreationCostPerToken: .625 * 1e-6, cacheReadCostPerToken: .05 * 1e-6,
    });
  });
  it.each(['claude-opus', 'claude-opus-5-5-20261118', 'anthropic/claude-opus-5-5', 'constructor'])('rejects non-exact ID %s', id => {
    expect(findAnthropicRate(id)).toBeNull();
  });
});
