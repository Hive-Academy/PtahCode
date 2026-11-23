import { formatUsageCost, formatUsageTokens, usageDetailsText } from './session-usage-format';
import type { UsageState } from './session-usage-totals';

function figure(value: number | null, state: UsageState = 'exact') {
  return { value, state, causes: [] };
}

describe('session usage formatting', () => {
  it.each([
    [0.086, 'lower-bound', '≥$0.08'],
    [0.29, 'exact', '$0.29'],
    [0.0049, 'exact', '$0.004'],
    [0.00999, 'both', '≥ ~$0.009'],
    [9.999, 'estimate', '~$9.99'],
    [10, 'exact', '$10'],
    [10.99, 'lower-bound', '≥$10'],
    [0, 'exact', '$0.00'],
    [1e-7, 'lower-bound', '≥$0.000'],
  ] satisfies [number, UsageState, string][])('floors %s (%s) to %s', (value, state, expected) => {
    expect(formatUsageCost(figure(value, state))).toBe(expected);
  });

  it('floors compact tokens without crossing the next unit and includes the marker', () => {
    expect(formatUsageTokens(figure(999_999, 'lower-bound'))).toBe('≥999.9k');
    expect(formatUsageTokens(figure(2_999_999, 'estimate'))).toBe('~2.9M');
    expect(formatUsageTokens(figure(1_030_000_000, 'both'))).toBe('≥ ~1.0B');
    expect(formatUsageTokens(figure(0))).toBe('0');
  });

  it('renders missing figures with an em dash', () => {
    expect(formatUsageTokens(figure(null, 'unknown'))).toBe('—');
    expect(formatUsageCost(figure(null, 'unknown'))).toBe('—');
  });

  it('speaks the full reported value, scope, and causes', () => {
    expect(usageDetailsText({
      ...figure(0.086, 'both'), causes: ['Some SDK usage could not be counted'],
    }, 'cost', 'Session')).toBe('Session: at least about $0.086. Some SDK usage could not be counted');
    expect(usageDetailsText(figure(12_345, 'estimate'), 'tokens', 'Orchestrator'))
      .toBe('Orchestrator: about 12,345 tokens');
    expect(usageDetailsText(figure(0, 'lower-bound'), 'tokens', 'SDK'))
      .toBe('SDK: at least 0 tokens');
  });
});
