import type { SessionStatsEntry } from '@ptah-extension/shared';
import {
  cliContribution,
  sdkContribution,
  sessionTotal,
  type CliUsageRun,
  type UsageContribution,
  type UsageMetric,
} from './session-usage-totals';

const empty: SessionStatsEntry = {
  sessionId: 'session',
  model: null,
  totalCost: null,
  knownCost: null,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
  tokenCount: 0,
  messageCount: 0,
  turnCount: 0,
  agentSessionCount: 0,
  status: 'empty',
  coverage: 'complete',
  untimestampedCount: 0,
  pricingCoverage: 'none',
};

const failed: SessionStatsEntry = {
  sessionId: 'session',
  model: null,
  totalCost: null,
  knownCost: null,
  tokens: empty.tokens,
  tokenCount: 0,
  messageCount: 0,
  status: 'error',
  coverage: 'partial',
  untimestampedCount: 0,
  pricingCoverage: 'none',
};

const legacy: SessionStatsEntry = {
  sessionId: 'session',
  model: 'model',
  totalCost: 0.42,
  tokens: { input: 650, output: 50, cacheRead: 200, cacheCreation: 100 },
  tokenCount: 1000,
  messageCount: 4,
  status: 'ok',
  coverage: 'complete',
};

const priced: SessionStatsEntry = { ...legacy, pricingCoverage: 'full' };
const complete = { complete: true, causes: [] };

function lane(overrides: Partial<CliUsageRun> = {}): UsageContribution {
  const contribution = cliContribution({
    kind: 'cli',
    id: 'cli:lane',
    label: 'CLI lane',
    provider: 'codex',
    usage: { inputTokens: 150, outputTokens: 50, costUsd: 0.1 },
    ...overrides,
  });
  if (!contribution) throw new Error('Expected a CLI contribution');
  return contribution;
}

function sdkTotal(snapshot: SessionStatsEntry | null, metric: UsageMetric) {
  return sessionTotal([sdkContribution(snapshot)], complete, metric);
}

describe('SDK usage contribution', () => {
  it.each(['tokens', 'cost'] as const)('keeps absent SDK %s unknown', (metric) => {
    expect(sdkTotal(null, metric)).toMatchObject({
      value: null, state: 'unknown', coverage: 'missing', causes: ['SDK usage not loaded yet'],
    });
  });

  it.each(['tokens', 'cost'] as const)('ignores the failed SDK %s sentinel (F9)', (metric) => {
    expect(sdkTotal(failed, metric)).toMatchObject({
      value: null, state: 'unknown', coverage: 'missing', causes: ['SDK usage could not be read'],
    });
  });

  it('uses measured empty SDK tokens and keeps empty SDK cost missing', () => {
    expect(sdkTotal(empty, 'tokens')).toMatchObject({ value: 0, state: 'exact', coverage: 'full' });
    expect(sdkTotal(empty, 'cost')).toMatchObject({
      value: null, state: 'unknown', coverage: 'missing', causes: ['No priced SDK usage recorded'],
    });
  });

  it('classifies partial empty snapshots per metric and uses generic copy (F8)', () => {
    const snapshot: SessionStatsEntry = { ...empty, coverage: 'partial' };
    expect(sdkTotal(snapshot, 'tokens')).toMatchObject({
      value: 0, state: 'lower-bound', coverage: 'partial', causes: ['Some SDK usage could not be counted'],
    });
    expect(sdkTotal(snapshot, 'cost')).toMatchObject({
      value: null, state: 'unknown', coverage: 'missing', causes: ['Some SDK usage could not be counted'],
    });
    expect(sdkContribution({ ...empty, pricingCoverage: 'full', totalCost: 0 }).cost.value).toBe(0);
  });

  it('keeps reported zero cost exact with full SDK pricing', () => {
    expect(sdkTotal({ ...priced, totalCost: 0 }, 'cost')).toMatchObject({
      value: 0, state: 'exact', coverage: 'full',
    });
  });

  it('uses partial SDK pricing as a lower bound and names an explicit rate gap', () => {
    const snapshot: SessionStatsEntry = {
      ...priced, totalCost: null, knownCost: 0.086, pricingCoverage: 'partial',
      costUnavailableReason: 'rate-missing',
    };
    expect(sdkTotal(snapshot, 'tokens')).toMatchObject({ value: 1000, state: 'exact', coverage: 'full' });
    expect(sdkTotal(snapshot, 'cost')).toMatchObject({
      value: 0.086, state: 'lower-bound', coverage: 'partial', causes: ['Not priced'],
    });
    expect(sdkTotal({ ...snapshot, knownCost: null }, 'cost').value).toBeNull();
  });

  it('names a narrow SDK cost cause only when the snapshot supplies it', () => {
    const snapshot: SessionStatsEntry = {
      ...priced, totalCost: null, pricingCoverage: 'none', coverage: 'partial',
      costUnavailableReason: 'billing-unknown',
    };
    expect(sdkTotal(snapshot, 'cost')).toMatchObject({
      value: null, state: 'unknown', coverage: 'missing',
      causes: ['Some SDK usage could not be counted', 'SDK billing mode is unknown'],
    });
    expect(sdkTotal({ ...snapshot, costUnavailableReason: undefined }, 'cost').causes)
      .toEqual(['Some SDK usage could not be counted']);
  });

  it('keeps legacy reported zero cost exact unless coverage is partial', () => {
    const zero = { ...legacy, totalCost: 0 };
    expect(sdkTotal(zero, 'cost')).toMatchObject({ value: 0, state: 'exact', coverage: 'full' });
    expect(sdkTotal({ ...zero, coverage: 'partial' }, 'cost')).toMatchObject({
      value: 0, state: 'lower-bound', coverage: 'partial', causes: ['Some SDK usage could not be counted'],
    });
  });

  it('keeps provisional legacy cost marked as an estimate', () => {
    expect(sdkTotal({ ...legacy, provisional: true }, 'cost')).toMatchObject({
      value: 0.42, state: 'estimate', coverage: 'full',
    });
  });

  it('leaves null legacy cost missing and still counts its tokens', () => {
    const snapshot = { ...legacy, totalCost: null };
    expect(sdkTotal(snapshot, 'cost')).toMatchObject({
      value: null, state: 'unknown', coverage: 'missing', causes: ['SDK cost not reported'],
    });
    expect(sdkTotal(snapshot, 'tokens')).toMatchObject({ value: 1000, state: 'exact', coverage: 'full' });
  });

  it('preserves cost basis and coverage, including estimates on final snapshots (F5 and F10)', () => {
    const covered = { ...priced, costBasis: 'covered-by-subscription' } as const;
    expect(sdkTotal({ ...covered, provisional: true }, 'cost')).toMatchObject({
      value: 0.42, state: 'estimate', coverage: 'full',
      causes: ['Published-rate value covered by the subscription'],
    });
    expect(sdkTotal({ ...covered, coverage: 'partial' }, 'cost')).toMatchObject({
      value: 0.42, state: 'lower-bound', coverage: 'partial',
      causes: ['Some SDK usage could not be counted', 'Published-rate value covered by the subscription'],
    });
    expect(sdkTotal({ ...priced, costBasis: 'estimated' }, 'cost')).toMatchObject({
      value: 0.42, state: 'estimate', coverage: 'full',
    });
  });

  it('rejects invalid SDK fields independently and retains their basis flags', () => {
    const sdk = sdkContribution({ ...priced, tokenCount: NaN, totalCost: -1, provisional: true, coverage: 'partial' });
    expect(sdk.tokens).toMatchObject({ value: null, estimated: true, lowerBound: true });
    expect(sdk.cost).toMatchObject({ value: null, estimated: true, lowerBound: true });
  });
});

describe('CLI usage and session totals', () => {
  it('counts an ordinary CLI split without a mark and excludes SDK subagent and background rows (R2.1)', () => {
    const sdk = sdkContribution(priced);
    const cli = lane();
    const sub = cliContribution({ kind: 'subagent', id: 'sub:1', label: 'Subagent', usage: { inputTokens: 100 } });
    const bg = cliContribution({ kind: 'background', id: 'bg:1', label: 'Background', usage: { inputTokens: 100 } });
    const contributions = [sdk, cli, sub, bg].filter((entry) => entry !== null);
    expect(sub).toBeNull();
    expect(bg).toBeNull();
    expect(sessionTotal(contributions, complete, 'tokens')).toEqual({
      value: 1200, state: 'exact', sdk: 1000, cli: 200, coverage: 'full',
      reportedCount: 2, missingCount: 0, causes: [],
    });
    expect(sessionTotal(contributions, complete, 'cost')).toMatchObject({
      value: 0.52, state: 'exact', coverage: 'full',
    });
  });

  it('prefers the ordinary split over raw provider total and overlapping cache fields', () => {
    const { tokens } = lane({
      usage: { inputTokens: 150, outputTokens: 50, totalTokens: 500, cacheReadTokens: 300, cacheWriteTokens: 5 },
    });
    expect(tokens).toEqual({ value: 200, comparable: true, lowerBound: false, estimated: false, causes: [] });
  });

  it.each(['input', 'output'] as const)('includes only the reported %s class with a lower bound', (tokenClass) => {
    const usage = tokenClass === 'input' ? { inputTokens: 150 } : { outputTokens: 150 };
    expect(sessionTotal([sdkContribution(priced), lane({ usage })], complete, 'tokens')).toMatchObject({
      value: 1150, state: 'lower-bound', coverage: 'partial',
      causes: [`CLI lane reported only ${tokenClass} tokens`],
    });
  });

  it('keeps an opaque provider total on its row and excludes it from the headline', () => {
    const opaque = lane({ usage: { totalTokens: 700, costUsd: 0.1 } });
    expect(opaque.tokens).toMatchObject({ value: 700, comparable: false, lowerBound: true });
    expect(sessionTotal([sdkContribution(priced), opaque], complete, 'tokens')).toMatchObject({
      value: 1000, state: 'lower-bound', coverage: 'partial', cli: null,
      missingCount: 1, causes: ['CLI lane reports a provider total on another basis'],
    });
  });

  it.each([NaN, -1])('counts a lane with invalid output (%s) as missing usage', (outputTokens) => {
    const invalid = lane({ usage: { inputTokens: 150, outputTokens } });
    expect(sessionTotal([sdkContribution(priced), lane(), invalid], complete, 'tokens')).toMatchObject({
      value: 1200, state: 'lower-bound', coverage: 'partial', missingCount: 1,
      causes: ['CLI lane reported no tokens', '1 of 2 lanes report no usage'],
    });
  });

  it('distinguishes a generic CLI cost gap from an explicit missing rate', () => {
    const sdk = sdkContribution(priced);
    const noCost = lane({ cost: null });
    const partial = lane({ costPartial: true });
    const unpriced = lane({ cost: null, costUnavailableReason: 'rate-missing' });
    expect(sessionTotal([sdk, noCost], complete, 'cost')).toMatchObject({
      value: 0.42, state: 'lower-bound', coverage: 'partial',
      causes: ['CLI lane reported incomplete cost', '1 of 1 lanes report no cost'],
    });
    expect(sessionTotal([sdk, partial], complete, 'cost')).toMatchObject({
      value: 0.52, state: 'lower-bound', coverage: 'partial', causes: ['CLI lane reported incomplete cost'],
    });
    expect(unpriced.cost.causes).toEqual(['CLI lane: Not priced']);
  });

  it('marks CLI estimates without implying a gap and combines the marks when a gap is detected', () => {
    const sdk = sdkContribution(priced);
    const estimate = lane({ costEstimated: true });
    expect(sessionTotal([sdk, estimate], complete, 'cost')).toMatchObject({
      value: 0.52, state: 'estimate', coverage: 'full',
    });
    expect(sessionTotal([sdkContribution(failed), estimate], complete, 'cost')).toMatchObject({
      value: 0.1, state: 'both', coverage: 'partial', causes: ['SDK usage could not be read'],
    });
  });

  it('marks the CLI-only subtotal when SDK usage is unloaded', () => {
    expect(sessionTotal([sdkContribution(null), lane()], complete, 'tokens')).toMatchObject({
      value: 200, state: 'lower-bound', coverage: 'partial', sdk: null, cli: 200,
      causes: ['SDK usage not loaded yet'],
    });
  });

  it('counts retained removed-lane usage and marks a detected removal gap for the affected metric', () => {
    const contributions = [sdkContribution(priced), lane()];
    expect(sessionTotal(contributions, complete, 'tokens').state).toBe('exact');
    expect(sessionTotal(contributions, {
      complete: false, causes: ["A removed lane's usage was not captured"],
    }, 'cost')).toMatchObject({
      value: 0.52, state: 'lower-bound', coverage: 'partial',
      causes: ["A removed lane's usage was not captured"],
    });
  });

  it('marks a resumed session only for an observed metric gap', () => {
    const sdk = sdkContribution(priced);
    expect(sessionTotal([sdk], complete, 'tokens').state).toBe('exact');
    expect(sessionTotal([sdk, lane()], complete, 'tokens').state).toBe('exact');
    expect(sessionTotal([sdk, lane()], {
      complete: false, causes: ['1 CLI lane from an earlier run has no recorded usage'],
    }, 'cost')).toMatchObject({
      value: 0.52, state: 'lower-bound', coverage: 'partial',
      causes: ['1 CLI lane from an earlier run has no recorded usage'],
    });
  });

  it('includes reported zeroes in a complete session (F7)', () => {
    const cli = lane({ usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } });
    expect(sessionTotal([sdkContribution(empty), cli], complete, 'tokens')).toMatchObject({
      value: 0, state: 'exact', coverage: 'full', reportedCount: 2,
    });
    expect(sessionTotal([sdkContribution({ ...priced, totalCost: 0 }), cli], complete, 'cost')).toMatchObject({
      value: 0, state: 'exact', coverage: 'full', reportedCount: 2,
    });
  });
});
