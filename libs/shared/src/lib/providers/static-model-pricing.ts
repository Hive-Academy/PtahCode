import type { ModelPricing } from '../utils/pricing.utils';
import type { ProviderStaticModel } from './provider-registry';

/** Map only models with published input and output rates. */
export function staticModelPricing(providerId: string, models: readonly ProviderStaticModel[]): Record<string, ModelPricing> {
  const entries: Record<string, ModelPricing> = {};
  for (const model of models) {
    if (model.inputCostPerToken == null || model.outputCostPerToken == null) continue;
    const pricing: ModelPricing = {
      inputCostPerToken: model.inputCostPerToken,
      outputCostPerToken: model.outputCostPerToken,
      cacheReadCostPerToken: model.cacheReadCostPerToken,
      cacheCreationCostPerToken: model.cacheCreationCostPerToken,
      cacheCreation1hCostPerToken: model.cacheCreation1hCostPerToken,
      provider: providerId,
      maxTokens: model.contextLength,
    };
    entries[model.id] = pricing;
    entries[model.id.toLowerCase()] = pricing;
  }
  return entries;
}
