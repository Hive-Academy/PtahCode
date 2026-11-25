import type { ReviewUsageTotal } from '@ptah-extension/review-contracts';
import { costDisplay, tokensDisplay } from './review-usage-format';

const usage = (overrides: Partial<ReviewUsageTotal>): ReviewUsageTotal => ({
  inputTokens: 1000, outputTokens: 234, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 1234,
  costUsd: 0.0123, tokensPartial: false, costPartial: false, runs: 1,
  ...overrides,
});

describe('tokensDisplay', () => {
  it('shows an exact total grouped', () => {
    expect(tokensDisplay(usage({ totalTokens: 1234567 }))).toEqual({ text: '1,234,567 tokens', srText: '1,234,567 tokens', partial: false });
  });

  it('shows a partial total as a lower bound with a sentence for screen readers', () => {
    expect(tokensDisplay(usage({ tokensPartial: true }))).toEqual({
      text: '≥ 1,234 tokens', srText: 'At least 1,234 tokens; some stages did not report all usage', partial: true,
    });
  });

  it('shows unknown, never 0, for missing usage or a null total', () => {
    const unknown = { text: '—', srText: 'Token usage unknown', partial: false };
    expect(tokensDisplay(null)).toEqual(unknown);
    expect(tokensDisplay(undefined)).toEqual(unknown);
    expect(tokensDisplay(usage({ totalTokens: null, tokensPartial: true }))).toEqual(unknown);
  });

  it('shows a known zero as 0 tokens', () => {
    expect(tokensDisplay(usage({ totalTokens: 0 })).text).toBe('0 tokens');
  });
});

describe('costDisplay', () => {
  it('uses two decimals at or above $1 and four below', () => {
    expect(costDisplay(usage({ costUsd: 1 })).text).toBe('$1.00');
    expect(costDisplay(usage({ costUsd: 12.345 })).text).toBe('$12.35');
    expect(costDisplay(usage({ costUsd: 0.0123 })).text).toBe('$0.0123');
  });

  it('shows a known zero as $0.00', () => {
    expect(costDisplay(usage({ costUsd: 0 }))).toEqual({ text: '$0.00', srText: '$0.00', partial: false });
  });

  it('shows a partial cost as a lower bound', () => {
    expect(costDisplay(usage({ costUsd: 2.5, costPartial: true }))).toEqual({
      text: '≥ $2.50', srText: 'At least $2.50; some costs were not reported', partial: true,
    });
  });

  it('shows unknown, never $0.00, for missing usage or a null cost', () => {
    const unknown = { text: '—', srText: 'Cost unknown', partial: false };
    expect(costDisplay(null)).toEqual(unknown);
    expect(costDisplay(undefined)).toEqual(unknown);
    expect(costDisplay(usage({ costUsd: null, costPartial: true }))).toEqual(unknown);
  });
});

describe('independent markers', () => {
  it('marks only the cost when only the cost is partial', () => {
    const value = usage({ costUsd: 3, costPartial: true, tokensPartial: false });
    expect(tokensDisplay(value).partial).toBe(false);
    expect(tokensDisplay(value).text).toBe('1,234 tokens');
    expect(costDisplay(value).text).toBe('≥ $3.00');
  });

  it('marks only the tokens when only the tokens are partial', () => {
    const value = usage({ costUsd: 3, costPartial: false, tokensPartial: true });
    expect(tokensDisplay(value).text).toBe('≥ 1,234 tokens');
    expect(costDisplay(value)).toEqual({ text: '$3.00', srText: '$3.00', partial: false });
  });
});
