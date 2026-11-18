/** Standard global API prices, USD per million tokens; 5-minute cache writes.
 * Retrieved 2026-11-18 from https://platform.claude.com/docs/en/about-claude/pricing
 * Haiku 5.5 requires context evidence; never seed its conditional rate globally.
 */
import type { ModelPricing } from './pricing.utils';

export const ANTHROPIC_RATE_CARD_DATE = '2026-11-18';
export const ANTHROPIC_RATE_CARD_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing';
const rates = {
  'claude-opus-5-5': [4, 20, 5, 0.20],
  'claude-sonnet-5-5': [2, 10, 2.50, 0.10],
  'claude-haiku-5-5': [0.50, 2.50, 0.625, 0.05],
  'claude-fable-5-2': [8, 40, 10, 0.20],
  'claude-fable-5-1': [10, 50, 12.50, 0.25],
  'claude-opus-4-8': [5, 25, 6.25, 0.50],
  'claude-sonnet-4-6': [3, 15, 3.75, 0.30],
  'claude-haiku-4-5': [1, 5, 1.25, 0.10],
} as const;

/** USD per 1M tokens: input, output, 5-minute cache write, cache read. */
const HAIKU_5_5_LOW_CONTEXT_RATES = [0.1, 0.5, 0.125, 0.01] as const;

export function findAnthropicRate(modelId: string, contextTokens?: number): ModelPricing | null {
  if (!Object.hasOwn(rates, modelId)) return null;
  // Haiku 5.5 requires the request context to select its tariff.
  if (modelId === 'claude-haiku-5-5') {
    if (contextTokens === undefined || !Number.isSafeInteger(contextTokens) || contextTokens < 0) return null;
  }
  // Haiku 5.5 has a lower tariff for prompts of at most 100,000 context tokens.
  const lowHaikuTier =
    modelId === 'claude-haiku-5-5' && contextTokens !== undefined && contextTokens <= 100_000;
  const [input, output, write, read] = lowHaikuTier
    ? HAIKU_5_5_LOW_CONTEXT_RATES
    : rates[modelId as keyof typeof rates];
  return {
    inputCostPerToken: input * 1e-6,
    outputCostPerToken: output * 1e-6,
    cacheCreationCostPerToken: write * 1e-6,
    cacheCreation1hCostPerToken: input * 2 * 1e-6,
    cacheReadCostPerToken: read * 1e-6,
    provider: 'anthropic',
    catalogSource: ANTHROPIC_RATE_CARD_SOURCE,
    catalogVersion: ANTHROPIC_RATE_CARD_DATE,
  };
}

/** Seven unconditional IDs; the eighth (Haiku 5.5) requires findAnthropicRate context evidence. */
export const ANTHROPIC_RATE_CARD: Readonly<Record<string, ModelPricing>> = Object.fromEntries(
  Object.keys(rates).flatMap((id) => {
    const rate = findAnthropicRate(id);
    return rate ? [[id, rate]] : [];
  }),
);
