import { usageFact, usageSummary as rawUsageSummary } from './dashboard-rpc.testing';
import {
  computeKpiDeltas,
  fractionalDelta,
  periodTotals,
  slicePreviousPeriod,
  widerRangeFor,
} from './kpi-delta';

const usageSummary: typeof rawUsageSummary = (facts, options = {}) => rawUsageSummary(facts, {
  ...options,
  sources: options.sources ?? [{ sourceId: 'claude-ledger', status: 'complete', coverageStart: '2026-01-01' }],
});

describe('kpi-delta', () => {
  it('maps each range to the next wider one, and 90 to none', () => {
    expect(widerRangeFor(7)).toBe(30);
    expect(widerRangeFor(30)).toBe(90);
    expect(widerRangeFor(90)).toBeNull();
  });

  // current 7 days: 2026-10-14 .. 2026-10-20; previous: 2026-10-07 .. 2026-10-13
  const current = usageSummary([usageFact({ day: '2026-10-18', costUsd: 3 })], {
    range: 7,
  });

  it('slices only the days directly before the current window', () => {
    const wider = usageSummary(
      [
        usageFact({ day: '2026-10-06' }),
        usageFact({ day: '2026-10-07' }),
        usageFact({ day: '2026-10-13' }),
        usageFact({ day: '2026-10-14' }),
      ],
      { range: 30 },
    );
    const previous = slicePreviousPeriod(current, wider);
    expect(previous?.fromDay).toBe('2026-10-07');
    expect(previous?.untilDayExclusive).toBe('2026-10-14');
    expect(previous?.facts.map((f) => f.day)).toEqual([
      '2026-10-07',
      '2026-10-13',
    ]);
  });

  it('is null when the wider window does not cover the previous period', () => {
    const wider = usageSummary([usageFact({ day: '2026-10-10' })], {
      range: 10,
    });
    expect(slicePreviousPeriod(current, wider)).toBeNull();
  });

  it('is null when the previous period has no facts', () => {
    const wider = usageSummary([usageFact({ day: '2026-10-15' })], {
      range: 30,
    });
    expect(slicePreviousPeriod(current, wider)).toBeNull();
  });

  it('totals known spend and all token kinds', () => {
    expect(
      periodTotals([
        usageFact({ costUsd: 2, cacheReadTokens: 10, cacheWriteTokens: 5 }),
        usageFact({
          costUsd: null,
          costSource: 'unpriced',
          knownCostUsd: 0.5,
        }),
        usageFact({ costUsd: null, costSource: 'unpriced' }),
      ]),
    ).toEqual({ spendUsd: null, tokens: 165 + 150 + 150 });
  });

  it('returns a fraction, or null when the previous total is not positive', () => {
    expect(fractionalDelta(15, 10)).toBeCloseTo(0.5);
    expect(fractionalDelta(5, 10)).toBeCloseTo(-0.5);
    expect(fractionalDelta(5, 0)).toBeNull();
    expect(fractionalDelta(5, -1)).toBeNull();
    expect(fractionalDelta(Number.NaN, 1)).toBeNull();
  });

  it('computes spend and token deltas, null without a previous period', () => {
    const previous = {
      fromDay: '2026-10-07',
      untilDayExclusive: '2026-10-14',
      facts: [usageFact({ costUsd: 2, outputTokens: 0, inputUncachedTokens: 75 })],
    };
    const deltas = computeKpiDeltas(current, previous);
    expect(deltas.spend).toBeCloseTo(0.5);
    expect(deltas.tokens).toBeCloseTo(1);
    expect(computeKpiDeltas(current, null)).toEqual({ spend: null, tokens: null });
    expect(computeKpiDeltas(null, previous)).toEqual({ spend: null, tokens: null });
  });
  it.each(['partial', 'unavailable'] as const)('rejects %s source history', (status) => {
    const wider = usageSummary([usageFact({ day: '2026-10-10' })], { range: 30 });
    expect(slicePreviousPeriod(current, { ...wider, sources: [{ sourceId: 'claude-ledger', status }] })).toBeNull();
    expect(slicePreviousPeriod({ ...current, sources: [{ sourceId: 'claude-ledger', status }] }, wider)).toBeNull();
  });

  it('rejects late-starting ledgers, missing coverage, and mismatched sources', () => {
    const wider = usageSummary([usageFact({ day: '2026-10-10' })], { range: 30 });
    for (const sources of [
      [{ sourceId: 'claude-ledger', status: 'complete' as const, coverageStart: '2026-10-10' }],
      [{ sourceId: 'claude-ledger', status: 'complete' as const }],
      [{ sourceId: 'other-ledger', status: 'complete' as const, coverageStart: '2026-01-01' }],
      [],
    ]) expect(slicePreviousPeriod(current, { ...wider, sources })).toBeNull();
    expect(slicePreviousPeriod({ ...current, sources: [{ sourceId: 'claude-ledger', status: 'complete', coverageStart: '2026-10-18' }] }, wider)).toBeNull();
  });

  it.each([undefined, 2])('hides unpriced spend in either period even with known subtotal %s', (knownCostUsd) => {
    const priced = usageFact({ costUsd: 2 });
    const unknown = usageFact({ costUsd: null, costSource: 'unpriced', knownCostUsd });
    const previous = { fromDay: '2026-10-07', untilDayExclusive: '2026-10-14', facts: [priced] };
    for (const facts of [[unknown], [priced, unknown]]) {
      expect(computeKpiDeltas({ ...current, facts }, previous).spend).toBeNull();
      expect(computeKpiDeltas(current, { ...previous, facts }).spend).toBeNull();
      expect(computeKpiDeltas({ ...current, facts }, previous).tokens).not.toBeNull();
    }
  });

});
