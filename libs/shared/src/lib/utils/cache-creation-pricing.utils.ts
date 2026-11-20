import type { ModelPricing, TokenBreakdown } from './pricing.utils';

/** Unknown cache-write TTLs cannot be claimed as fully priced. */
export function hasUnknownCacheCreationTtl(
  modelId: string,
  tokens: TokenBreakdown,
  pricing: ModelPricing,
): boolean {
  return (tokens.cacheCreation ?? 0) > 0 && tokens.cacheCreation1h === undefined &&
    (pricing.cacheCreation1hCostPerToken !== undefined || /claude-/.test(modelId) || pricing.provider === 'anthropic');
}
