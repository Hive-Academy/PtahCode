import type { SessionStatsEntry } from '@ptah-extension/shared';
import { compactSessionMetrics, contextDetailsText, costDetailsText, durationMsOf, formatModelCost, formatModelTotal, isKnownCost, sessionContextCue, tokenDetailsText, type SessionStatsInputs } from './session-stats-view';
import type { LiveModelStats } from './session-stats-summary.component';

const liveContext: LiveModelStats = {
  model: 'claude-sonnet-4-5',
  contextKnown: true,
  contextCapacity: {
    tokens: 200_000,
    source: 'sdk-native',
    providerId: null,
    model: 'claude-sonnet-4-5',
  },
  contextUsed: 130_000,
  contextWindow: 200_000,
  contextPercent: 65,
};

describe('sessionContextCue', () => {
  it.each([
    { window: 200_000, percent: 65 }, // F2
    { window: 1_000_000, percent: 13 }, // F3
  ])('shows $percent% for a trusted $window window', ({ window, percent }) => {
    expect(sessionContextCue({
      ...liveContext,
      contextCapacity: { ...liveContext.contextCapacity!, tokens: window },
      contextWindow: window,
      contextPercent: percent,
    })).toEqual({
      hasLive: true,
      known: true,
      percent,
      label: `${percent}%`,
      usedTokens: 130_000,
    });
  });

  it.each([
    { contextCapacity: { ...liveContext.contextCapacity!, source: 'unknown' as const } },
    { contextCapacity: { ...liveContext.contextCapacity!, source: 'provider-catalog' as const, providerId: null } },
    { contextCapacity: { ...liveContext.contextCapacity!, model: 'another-model' } },
    { contextWindow: 1_000_000 },
  ])('shows an em dash for an untrusted or mismatched window (F6): %j', (change) => {
    expect(sessionContextCue({ ...liveContext, ...change })).toEqual({
      hasLive: true,
      known: false,
      percent: null,
      label: '\u2014',
      usedTokens: null,
    });
  });
});

const empty: SessionStatsInputs = {
  sessionId: 'one', snapshot: null, liveModelStats: null, compactionCount: 0,
  limits: null, budget: null,
  context: { hasLive: false, known: false, percent: null, label: '—', usedTokens: null },
  limitSummary: { state: 'none', text: null, extra: 0, source: null, fullText: null },
};
const snapshot: SessionStatsEntry = {
  sessionId: 'one', model: 'test-model', totalCost: 0, knownCost: 0, tokenCount: 0,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
  messageCount: 0, agentSessionCount: 2, status: 'ok', pricingCoverage: 'full', scope: 'session', revision: 1,
};

describe('compactSessionMetrics', () => {
  it('shows muted placeholders including unknown time and names their causes', () => {
    const metrics = compactSessionMetrics(empty);
    expect(metrics.map(({ value, unavailable }) => [value, unavailable])).toEqual([
      ['—', true], ['—', true], ['—', true], ['--:--', true],
    ]);
    expect(metrics[0].ariaLabel).toBe('Context unavailable');
    expect(metrics[1].ariaLabel).toContain('Tokens unavailable');
    expect(metrics[2].ariaLabel).toContain('Cost unavailable');
    expect(metrics[3].ariaLabel).toBe('Time. Duration not recorded');
    expect(compactSessionMetrics(empty, undefined, 'Earlier duration missing')[3].ariaLabel)
      .toBe('Time. Earlier duration missing');
  });

  it('preserves measured zero', () => {
    const metrics = compactSessionMetrics({ ...empty, snapshot });
    expect(metrics[1]).toMatchObject({ value: '0', unavailable: false });
    expect(metrics[2]).toMatchObject({ value: '$0.00', unavailable: false });
  });

  it('uses S1 totals and speaks their full value and cause even when the snapshot differs', () => {
    const details = {
      sdk: 100, cli: 100, coverage: 'partial', reportedCount: 2, missingCount: 1,
      causes: ['A restored lane reported no usage'],
    } as const;
    const metrics = compactSessionMetrics({ ...empty, snapshot }, {
      tokens: { ...details, state: 'lower-bound', value: 123_456 },
      cost: { ...details, state: 'both', value: 19.987 },
    });
    expect(metrics[1].value).toBe('≥123.4k');
    expect(metrics[1].ariaLabel).toContain('at least 123,456 tokens');
    expect(metrics[2].value).toBe('≥ ~$19');
    expect(metrics[2].ariaLabel).toContain('at least about $19.987');
    expect(metrics[2].ariaLabel).toContain('A restored lane reported no usage');
  });

  it.each([
    ['estimated', '~$0.50', 'about $0.5', 'Estimated cost, not a charge.'],
    ['covered-by-subscription', '$0.50', 'covered by the subscription',
      'Published-rate value covered by the subscription, not a charge.'],
  ] as const)('preserves the %s cost basis in full-value text', (basis, value, spoken, details) => {
    const priced = { ...snapshot, totalCost: 0.5, costBasis: basis };
    const cost = compactSessionMetrics({ ...empty, snapshot: priced })[2];
    expect(cost.value).toBe(value);
    expect(cost.ariaLabel).toContain(spoken);
    expect(costDetailsText(priced, null)).toContain(details);
  });

  it.each([
    ['rate-missing', 'Not priced'],
    ['usage-incomplete', 'Some SDK usage could not be priced'],
  ] as const)('keeps null cost muted and speaks the %s cause', (costUnavailableReason, cause) => {
    const unavailable = { ...snapshot, totalCost: null, costUnavailableReason, pricingCoverage: 'none' as const };
    const cost = compactSessionMetrics({ ...empty, snapshot: unavailable })[2];
    expect(cost).toMatchObject({ unavailable: true, value: '—' });
    expect(cost.ariaLabel).toContain(cause);
  });

  it.each([
    [252000, '4:12', '4 minutes 12 seconds'],
    [61000, '1:01', '1 minute 1 second'],
    [60000, '1:00', '1 minute 0 seconds'],
    [12500, '0:12', '12.5 seconds'],
    [1000, '0:01', '1.0 second'],
    [850, '0:00', '850 milliseconds'],
    [1, '0:00', '1 millisecond'],
  ])('speaks duration %s with its full precision', (durationMs, value, spoken) => {
    const metrics = compactSessionMetrics({ ...empty, snapshot: { ...snapshot, durationMs } });
    expect(metrics[3]).toMatchObject({ value, ariaLabel: `Time. ${spoken}` });
  });
  it('uses the approved missing detail copy', () => {
    expect(contextDetailsText(null, 0)).toBe('Context unavailable');
    expect(tokenDetailsText(null, null)).toContain('Tokens unavailable');
    expect(costDetailsText(null, null)).toContain('Cost unavailable');
  });
});


describe('formatModelCost and formatModelTotal', () => {
  const base = {
    sessionId: 's', model: 'm', totalCost: null,
    tokens: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
    messageCount: 1, status: 'ok', scope: 'session',
  } as SessionStatsEntry;
  const rateMissing = { ...base, pricingCoverage: 'none', costUnavailableReason: 'rate-missing' } as SessionStatsEntry;
  const partial = { ...base, pricingCoverage: 'partial', knownCost: 0.4 } as SessionStatsEntry;

  it('reads "Not priced" only when the session names a missing rate', () => {
    expect(formatModelCost(null, rateMissing)).toBe('Not priced');
    expect(formatModelCost(undefined, rateMissing)).toBe('Not priced');
  });

  it('keeps "—" for a null row that is unobserved or only partly priced', () => {
    expect(formatModelCost(null, base)).toBe('—');
    expect(formatModelCost(null, partial)).toBe('—');
    expect(formatModelCost(Number.NaN, partial)).toBe('—');
    expect(formatModelCost(null, { ...base, costUnavailableReason: 'billing-unknown' })).toBe('—');
    expect(formatModelCost(null, null)).toBe('—');
  });

  it('keeps a priced row unchanged, including a measured zero', () => {
    expect(formatModelCost(1.234, partial)).toBe('$1.23');
    expect(formatModelCost(0.0042, rateMissing)).toBe('$0.0042');
    expect(formatModelCost(0, base)).toBe('$0.0000');
  });

  it('labels a partial Total with its known subtotal', () => {
    expect(formatModelTotal(partial)).toBe('known subtotal $0.40');
    expect(formatModelTotal(rateMissing)).toBe('Not priced');
    expect(formatModelTotal(base)).toBe('—');
    expect(formatModelTotal({ ...base, totalCost: 2.5 })).toBe('$2.50');
  });

  it('treats only a finite number as a known cost', () => {
    expect(isKnownCost(0)).toBe(true);
    expect(isKnownCost(null)).toBe(false);
    expect(isKnownCost(undefined)).toBe(false);
    expect(isKnownCost(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('durationMsOf', () => {
  const codex = {
    sessionId: 'codex-1', model: 'gpt-5.5', totalCost: null,
    tokens: { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 },
    messageCount: 1, status: 'ok', scope: 'session',
  } as SessionStatsEntry;

  it('reads a Codex snapshot duration', () => {
    expect(durationMsOf({ ...codex, durationMs: 4_200 })).toBe(4_200);
  });

  it('is null only when the duration is truly unknown', () => {
    expect(durationMsOf(null)).toBeNull();
    expect(durationMsOf(codex)).toBeNull();
    expect(durationMsOf({ ...codex, durationMs: null })).toBeNull();
    expect(durationMsOf({ ...codex, durationMs: 0 })).toBeNull();
  });
});
