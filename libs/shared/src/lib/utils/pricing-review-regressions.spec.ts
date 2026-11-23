import { calculateExactMessageCost, findModelPricing, hasUnknownCacheCreationTtl, registerProviderPricing, resetPricingMapForTesting } from './pricing.utils';

beforeEach(() => resetPricingMapForTesting());
afterEach(() => resetPricingMapForTesting());
const rate = { inputCostPerToken: 1e-6, outputCostPerToken: 2e-6 };
it('shares TTL uncertainty with analytics while preserving explicit zero and no writes', () => {
  const pricing = { ...rate, cacheCreationCostPerToken: 3e-6, cacheCreation1hCostPerToken: 4e-6 };
  const tokens = { input: 1, output: 1, cacheCreation: 10 };
  expect(hasUnknownCacheCreationTtl('claude-custom', tokens, pricing)).toBe(true);
  expect(hasUnknownCacheCreationTtl('claude-custom', { ...tokens, cacheCreation1h: 0 }, pricing)).toBe(false);
  expect(hasUnknownCacheCreationTtl('claude-custom', { ...tokens, cacheCreation: 0 }, pricing)).toBe(false);
  expect(hasUnknownCacheCreationTtl('other', tokens, rate)).toBe(false);
});
it('resolves a tagged dotted catalog entry before the bundled dashed base', () => {
  registerProviderPricing({ 'claude-sonnet-5.5[1m]': rate });
  expect(findModelPricing('claude-sonnet-5-5[1m]')).toEqual(rate);
});
it('normalizes mixed-case dotted IDs before removing a bundled fallback', () => {
  registerProviderPricing({ 'Claude-Sonnet-5.5': rate });
  expect(findModelPricing('claude-sonnet-5-5')).toEqual(rate);
});
it.each(['claude-haiku-5-5', 'claude-haiku-5.5'])('requires context evidence for exact %s catalog quotes', (model) => {
  registerProviderPricing({ [model]: rate });
  expect(calculateExactMessageCost(model, { input: 1, output: 1 }, { billingMode: 'api-key' })).toMatchObject({ totalCost: null, costUnavailableReason: 'rate-missing' });
  expect(calculateExactMessageCost(model, { input: 1, output: 1 }, { billingMode: 'api-key', contextTokens: 1 })).toMatchObject({ totalCost: null });
});
it('prices one-hour-only writes without a five-minute rate', () => {
  registerProviderPricing({ 'claude-custom': { ...rate, cacheCreation1hCostPerToken: 4e-6 } });
  expect(calculateExactMessageCost('claude-custom', { input: 0, output: 0, cacheCreation: 10, cacheCreation1h: 10 }, { billingMode: 'api-key', cacheSemantics: 'disjoint' })).toMatchObject({ totalCost: 0.00004, pricingCoverage: 'full' });
});
it('keeps unknown Anthropic TTL splits partial after catalog hydration', () => {
  registerProviderPricing({ 'claude-sonnet-5-5': { ...rate, cacheCreationCostPerToken: 3e-6 } });
  const options = { billingMode: 'api-key', cacheSemantics: 'disjoint' } as const;
  expect(calculateExactMessageCost('claude-sonnet-5-5', { input: 1, output: 1, cacheCreation: 10 }, options).pricingCoverage).toBe('partial');
  expect(calculateExactMessageCost('claude-sonnet-5-5', { input: 1, output: 1, cacheCreation: 10, cacheCreation1h: 0 }, options).pricingCoverage).toBe('full');
});
it.each(['glm-5.3', 'glm-5.3-flash', 'glm-4.5-air'])('leaves Z.AI %s cost unknown: no built-in rate exists', (model) => {
  expect(findModelPricing(model)).toBeNull();
  expect(calculateExactMessageCost(model, { input: 1000, output: 100 }, { billingMode: 'api-key' })).toMatchObject({ totalCost: null, costUnavailableReason: 'rate-missing' });
});

it.each(['anthropic/claude-sonnet-4-6', 'claude-sonnet-4-6-20251101', 'claude-sonnet-4.6'])(
  'resolves native Anthropic model spelling %s', (model) => {
    const result = calculateExactMessageCost(model, { input: 1000, output: 100 }, { billingMode: 'api-key', pricingProvider: 'anthropic' });
    expect(result.totalCost).toBeCloseTo(0.0045);
    expect(result.priceProvenance?.modelIdUsed).toBe('claude-sonnet-4-6');
  },
);
it('keeps native Haiku tier selection after normalization', () => {
  const model = 'anthropic/claude-haiku-5.5-20261118';
  const tokens = { input: 1000, output: 0 };
  const options = { billingMode: 'api-key', pricingProvider: 'anthropic' } as const;
  expect(calculateExactMessageCost(model, tokens, options).costUnavailableReason).toBe('rate-missing');
  expect(calculateExactMessageCost(model, tokens, { ...options, contextTokens: 100_000 }).totalCost).toBeCloseTo(0.0001);
  expect(calculateExactMessageCost(model, tokens, { ...options, contextTokens: 100_001 }).totalCost).toBeCloseTo(0.0005);
});

it.each(['claude-sonnet-4-6[1m]', 'anthropic/claude-sonnet-4.6-20251101[1m]'])(
  'keeps native variant %s distinct from the base rate', (model) => {
    registerProviderPricing({ [model]: rate });
    expect(calculateExactMessageCost(model, { input: 1000, output: 100 }, { billingMode: 'api-key', pricingProvider: 'anthropic' }))
      .toMatchObject({ totalCost: null, costUnavailableReason: 'rate-missing' });
  },
);
