import { calculateExactMessageCost, findModelPricing, hasUnknownCacheCreationTtl, registerProviderPricing, resetPricingMapForTesting } from './pricing.utils';
import { seedStaticModelPricing } from '../providers/provider-registry';

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
it('retains one-hour pricing when seeding native Claude static models', () => {
  const bundled = findModelPricing('claude-sonnet-5-5')?.cacheCreation1hCostPerToken;
  seedStaticModelPricing('claude-cli');
  expect(findModelPricing('claude-sonnet-5-5')?.cacheCreation1hCostPerToken).toBe(bundled);
});
