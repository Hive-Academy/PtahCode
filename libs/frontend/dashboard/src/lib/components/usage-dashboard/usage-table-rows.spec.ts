/**
 * Display rows of the usage tables: labels, titles and the inline bar
 * widths. Bar colours are the chart's provider accents.
 */
import { providerAccent } from '../provider-account-card/provider-accent';
import {
  buildDayTableRows,
  buildModelTableRows,
  buildSessionTableRows,
  buildConcentrationSegments,
  dayBreakdownDescription,
  modelBreakdownDescription,
  topSessionsDescription,
} from './usage-table-rows';
import type {
  DayBreakdownRow,
  ModelBreakdownRow,
  ProviderDailySeries,
  UsageSessionRow,
} from './usage-summary.view-model';

function modelRow(overrides: Partial<ModelBreakdownRow>): ModelBreakdownRow {
  return {
    providerId: 'anthropic',
    modelId: 'claude-opus-4-6',
    modelDisplayName: 'Claude Opus 4.6',
    costUsd: 3,
    shareOfCost: 0.6,
    tokens: 12_345,
    unpriced: false,
    cacheSavingsUsd: null,
    savingsUnknownFactCount: 0,
    ...overrides,
  };
}

function dayRow(overrides: Partial<DayBreakdownRow>): DayBreakdownRow {
  return {
    day: '2026-10-18',
    costUsd: 2,
    shareOfCost: 0.4,
    tokens: 2000,
    unpricedFactCount: 0,
    topModelId: 'claude-sonnet-4-6',
    topModelDisplayName: 'Claude Sonnet 4.6',
    cacheSavingsUsd: null,
    savingsUnknownFactCount: 0,
    ...overrides,
  };
}

function series(
  providerId: string,
  costValues: number[],
): ProviderDailySeries {
  return {
    providerId,
    displayName: providerId,
    accent: providerAccent(providerId),
    costValues,
    costUnknownByDay: costValues.map(() => false),
    tokenValues: costValues.map(() => 0),
  };
}

function session(overrides: Partial<UsageSessionRow>): UsageSessionRow {
  return {
    sessionId: 's1',
    title: 'Session one',
    providerId: 'anthropic',
    modelId: 'claude-opus-4-6',
    modelDisplayName: 'Claude Opus 4.6',
    costUsd: 4,
    unpriced: false,
    tokens: 1000,
    messageCount: 1,
    subagentCount: 0,
    lastActive: '2026-10-20T07:00:00.000Z',
    ...overrides,
  };
}

describe('buildModelTableRows', () => {
  it('labels cost, share and tokens and colours the share bar by provider', () => {
    const [row] = buildModelTableRows([modelRow({})]);
    expect(row).toMatchObject({
      key: 'anthropic:claude-opus-4-6',
      providerName: 'Anthropic',
      accent: providerAccent('anthropic'),
      costLabel: '$3.00',
      costTitle: null,
      shareLabel: '60%',
      shareBarPercent: 60,
      tokensLabel: '12.3K',
      tokensTitle: '12,345 tokens',
    });
  });

  it('keeps a tiny positive share readable and an unpriced row unknown', () => {
    const [tiny, partial, unpriced] = buildModelTableRows([
      modelRow({ costUsd: 0.0002, shareOfCost: 0.0004 }),
      modelRow({ modelId: 'b', unpriced: true }),
      modelRow({ modelId: 'c', costUsd: null, shareOfCost: null, unpriced: true }),
    ]);
    expect(tiny.shareLabel).toBe('<0.1%');
    expect(tiny.shareBarPercent).toBe(2);
    expect(tiny.costLabel).toBe('$0.0002');
    expect(partial.costLabel).toBe('≥ $3.00');
    expect(partial.costTitle).toBe('Some usage of this model is unpriced');
    expect(unpriced.costLabel).toBe('—');
    expect(unpriced.costTitle).toBe('No price for this model');
    expect(unpriced.shareLabel).toBe('—');
    expect(unpriced.shareBarPercent).toBe(0);
  });
});

describe('buildDayTableRows', () => {
  const days = ['2026-10-18', '2026-10-19', '2026-10-20'];
  const providerSeries = [
    series('anthropic', [1, 3, 0]),
    series('opencode', [1, 1, 0]),
  ];

  it('stacks provider segments relative to the largest day', () => {
    const rows = buildDayTableRows(
      [
        dayRow({ day: '2026-10-18' }),
        dayRow({ day: '2026-10-19', costUsd: 4 }),
        dayRow({ day: '2026-10-20', costUsd: null, shareOfCost: null }),
      ],
      days,
      providerSeries,
    );
    // Day 19 is the largest day (4): its segments fill the track 3:1.
    expect(rows[1].segments).toEqual([
      { providerId: 'anthropic', color: providerAccent('anthropic'), widthPercent: 75 },
      { providerId: 'opencode', color: providerAccent('opencode'), widthPercent: 25 },
    ]);
    // Day 18 (2) is half of the largest day, split evenly.
    expect(rows[0].segments.map((s) => s.widthPercent)).toEqual([25, 25]);
    // A day without priced cost draws no bar and keeps its em dash.
    expect(rows[2].segments).toEqual([]);
    expect(rows[2].costLabel).toBe('—');
    expect(rows[2].costTitle).toBe('No priced usage this day');
    expect(rows[0].dayLabel).toBe('Oct 18');
    expect(rows[0].topModelLabel).toBe('Claude Sonnet 4.6');
  });

  it('marks a lower-bound day and a day without a top model', () => {
    const [row] = buildDayTableRows(
      [dayRow({ unpricedFactCount: 2, topModelDisplayName: null })],
      days,
      providerSeries,
    );
    expect(row.costLabel).toBe('≥ $2.00');
    expect(row.costTitle).toBe('2 facts unpriced this day');
    expect(row.topModelLabel).toBe('—');
  });

  it('draws no bar for a day outside the series window', () => {
    const [row] = buildDayTableRows([dayRow({ day: '2026-11-01' })], days, providerSeries);
    expect(row.segments).toEqual([]);
  });
});

describe('buildSessionTableRows', () => {
  it('ranks sessions and sizes each cost bar against the top session', () => {
    const rows = buildSessionTableRows(
      [
        session({}),
        session({ sessionId: 's2', providerId: 'opencode', costUsd: 1, unpriced: true }),
        session({ sessionId: 's3', costUsd: null, unpriced: true }),
      ],
      '2026-10-20T12:00:00.000Z',
    );
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.costBarPercent)).toEqual([100, 25, 0]);
    expect(rows[1].accent).toBe(providerAccent('opencode'));
    expect(rows.map((row) => row.costLabel)).toEqual(['$4.00', '≥ $1.00', 'Unpriced']);
    expect(rows[1].costTitle).toBe('Some usage has no price');
    expect(rows[0].costTitle).toBeNull();
    expect(rows[0].lastActiveLabel).toBe('5h ago');
    expect(rows[0].lastActive).toBe('2026-10-20T07:00:00.000Z');
    expect(rows[0].tokensLabel).toBe('1K');
    expect(rows[0].key).toBe('anthropic:s1');
  });

  it('draws no bars when no listed session is priced', () => {
    const rows = buildSessionTableRows(
      [session({ costUsd: null, unpriced: true })],
      '2026-10-20T12:00:00.000Z',
    );
    expect(rows[0].costBarPercent).toBe(0);
  });
});

describe('table edge cases', () => {
  it('writes the full token count with thousands separators', () => {
    expect(buildModelTableRows([modelRow({})])[0].tokensTitle).toBe('12,345 tokens');
  });

  it('draws no bars for a zero or non-finite top cost', () => {
    const rows = buildSessionTableRows(
      [session({ costUsd: 0 }), session({ sessionId: 's2', costUsd: Number.NaN })],
      '2026-10-20T12:00:00.000Z',
    );
    expect(rows.map((row) => row.costBarPercent)).toEqual([0, 0]);
  });

  it('keeps list order for equal costs and reads future or invalid times safely', () => {
    const rows = buildSessionTableRows(
      [
        session({ sessionId: 'a', lastActive: '2026-10-21T00:00:00.000Z' }),
        session({ sessionId: 'b', lastActive: 'not-a-date' }),
      ],
      '2026-10-20T12:00:00.000Z',
    );
    expect(rows.map((row) => [row.key, row.rank])).toEqual([
      ['anthropic:a', 1],
      ['anthropic:b', 2],
    ]);
    expect(rows[0].lastActiveLabel).toBe('Just now');
    expect(rows[1].lastActiveLabel).toBe('—');
    expect(rows[1].lastActive).toBe('not-a-date');
  });
});

describe('buildConcentrationSegments', () => {
  it('splits known cost by provider in series order, with a visible minimum', () => {
    const segments = buildConcentrationSegments([
      series('anthropic', [300, 699]),
      series('opencode', [1, Number.NaN]),
      series('openai', [0, 0]),
    ]);
    expect(segments.map((segment) => segment.providerId)).toEqual(['anthropic', 'opencode']);
    expect(segments[0].widthPercent).toBeCloseTo(99.9);
    expect(segments[1].widthPercent).toBe(2);
    expect(segments[0].color).toBe(providerAccent('anthropic'));
  });

  it('draws nothing without priced cost', () => {
    expect(buildConcentrationSegments([series('anthropic', [0, 0])])).toEqual([]);
    expect(buildConcentrationSegments([])).toEqual([]);
  });
});

describe('table descriptions', () => {
  it('counts models and sums their known cost', () => {
    expect(
      modelBreakdownDescription([
        modelRow({}),
        modelRow({ modelId: 'b', costUsd: 1063.33 }),
        modelRow({ modelId: 'c', costUsd: null, unpriced: true }),
      ]),
    ).toBe('3 models · $1,066.33 known cost');
    expect(modelBreakdownDescription([modelRow({ costUsd: null })])).toBe('1 model');
  });

  it('names the busiest priced day', () => {
    expect(
      dayBreakdownDescription([
        dayRow({}),
        dayRow({ day: '2026-10-19', costUsd: 5 }),
        dayRow({ day: '2026-10-20', costUsd: null }),
      ]),
    ).toBe('3 days · busiest day Oct 19');
    expect(dayBreakdownDescription([dayRow({ costUsd: 0 })])).toBe('1 day');
  });

  it('sums the listed sessions and their share of known cost', () => {
    const sessions = [session({}), session({ sessionId: 's2', costUsd: null })];
    expect(topSessionsDescription(sessions, 10)).toMatch(
      /^\$4\.00 · 40(\.0)?% of known cost$/,
    );
    expect(topSessionsDescription(sessions, null)).toBe('$4.00');
    expect(topSessionsDescription(sessions, 0)).toBe('$4.00');
    expect(topSessionsDescription([session({ costUsd: null })], 10)).toBeNull();
  });
});
