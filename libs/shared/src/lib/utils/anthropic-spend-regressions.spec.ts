import { ANTHROPIC_RATE_CARD, findAnthropicRate } from './anthropic-rate-card';
import { calculateExactMessageCost, calculateMessageCost, getPricingMap, registerProviderPricing, resetPricingMapForTesting } from './pricing.utils';

afterEach(() => resetPricingMapForTesting());
const options = { billingMode: 'api-key', pricingProvider: 'anthropic', cacheSemantics: 'disjoint' } as const;

describe('cache TTL pricing', () => {
  it('prices five-minute and one-hour writes separately with full coverage', () => {
    const result = calculateExactMessageCost('claude-sonnet-5-5', { input: 100, output: 10, cacheCreation: 1000, cacheCreation1h: 400 }, options);
    expect(result.totalCost).toBeCloseTo(0.0002 + 0.0001 + 600 * 2.5e-6 + 400 * 4e-6, 10);
    expect(result.pricingCoverage).toBe('full');
    expect(calculateMessageCost('claude-sonnet-5-5', { input: 100, output: 10, cacheCreation: 1000, cacheCreation1h: 400 })).toBeCloseTo(result.totalCost ?? 0, 10);
  });
  it('uses five-minute approximation with partial coverage when the TTL split is absent', () => {
    expect(calculateExactMessageCost('claude-sonnet-5-5', { input: 100, output: 10, cacheCreation: 1000 }, options))
      .toMatchObject({ totalCost: 0.0028, pricingCoverage: 'partial' });
  });
  it('keeps full coverage for zero cache creation without a split', () => {
    expect(calculateExactMessageCost('claude-sonnet-5-5', { input: 100, output: 10, cacheCreation: 0 }, options))
      .toMatchObject({ totalCost: 0.0003, pricingCoverage: 'full' });
  });
  it('rejects an invalid one-hour subset and never invents a missing rate', () => {
    expect(calculateExactMessageCost('claude-sonnet-5-5', { input: 1, output: 1, cacheCreation: 2, cacheCreation1h: 3 }, options).totalCost).toBeNull();
    const result = calculateExactMessageCost('claude-sonnet-5-5', { input: 1, output: 1, cacheCreation: 2, cacheCreation1h: -1 }, options);
    expect(result.totalCost).toBeNull();
  });
  it.each(Object.keys(ANTHROPIC_RATE_CARD))('sets one-hour writes at twice input for %s', id => {
    const rate = findAnthropicRate(id);
    expect(rate?.cacheCreation1hCostPerToken).toBe((rate?.inputCostPerToken ?? 0) * 2);
  });
});

describe('Haiku context tiers', () => {
  it.each([0, 99_999, 100_000])('selects the low tier at %s request context tokens', contextTokens => {
    expect(findAnthropicRate('claude-haiku-5-5', contextTokens)).toMatchObject({
      inputCostPerToken: .10 * 1e-6, outputCostPerToken: .50 * 1e-6,
      cacheCreationCostPerToken: .125 * 1e-6, cacheReadCostPerToken: .01 * 1e-6,
      cacheCreation1hCostPerToken: .20 * 1e-6,
    });
    expect(calculateExactMessageCost('claude-haiku-5-5', { input: 1000, output: 1000 }, { ...options, contextTokens }).totalCost).toBeCloseTo(.0006);
  });
  it('keeps unknown context unpriced and selects the high tier above the boundary', () => {
    expect(calculateExactMessageCost('claude-haiku-5-5', { input: 1, output: 1 }, options).totalCost).toBeNull();
    expect(findAnthropicRate('claude-haiku-5-5', 100_001)).toMatchObject({ inputCostPerToken: .5e-6, cacheCreation1hCostPerToken: 1e-6 });
  });
});

describe('dotted catalog replacement', () => {
  const dotted = { inputCostPerToken: 9e-6, outputCostPerToken: 45e-6 };
  it('deletes the bundled dashed fallback when a dotted catalog ID arrives', () => {
    resetPricingMapForTesting();
    registerProviderPricing({ 'claude-sonnet-5.5': dotted });
    expect(getPricingMap()['claude-sonnet-5-5']).toBeUndefined();
    expect(getPricingMap()['claude-sonnet-5.5']).toEqual(dotted);
  });
  it('preserves a runtime dashed entry when a dotted ID arrives', () => {
    const dashed = { inputCostPerToken: 7e-6, outputCostPerToken: 35e-6 };
    registerProviderPricing({ 'claude-sonnet-5-5': dashed });
    registerProviderPricing({ 'claude-sonnet-5.5': dotted });
    expect(getPricingMap()['claude-sonnet-5-5']).toEqual(dashed);
    expect(getPricingMap()['claude-sonnet-5.5']).toEqual(dotted);
  });
});
