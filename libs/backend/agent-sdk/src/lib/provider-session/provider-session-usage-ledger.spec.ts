import 'reflect-metadata';
import {
  calculateExactMessageCost,
  registerProviderPricing,
  resetPricingMapForTesting,
  resolveContextCapacity,
  SessionId,
  updatePricingMap,
} from '@ptah-extension/shared';
import type { ProviderSessionChatPrepared } from './provider-session-chat-ports';
import {
  createSessionProjector,
  resultStats,
  type ProviderSessionChatSession,
} from './provider-session-turn-stream';
import {
  priceTurn,
  ProviderSessionUsageLedger,
  providerSessionBillingMode,
  providerSessionPricingFallback,
} from './provider-session-usage-ledger';

const PRICED = 'test-priced-model';

function session(
  prepared: Partial<ProviderSessionChatPrepared> = {},
): ProviderSessionChatSession {
  const id = SessionId.create();
  return {
    id,
    token: 'token',
    prepared: {
      seed: {
        providerId: 'antigravity-cli',
        profile: 'antigravity',
        consumer: 'chat',
        workspacePath: 'C:/Users/dev/repo',
        workspaceId: 'c:/users/dev/repo',
        model: 'gemini-4-hydrogen-low',
      },
      ...prepared,
    } as ProviderSessionChatPrepared,
    approvals: {} as ProviderSessionChatSession['approvals'],
    projector: createSessionProjector(id),
    abort: new AbortController(),
    nativeSessionId: 'native-1',
    contextId: '',
    settings: {},
    busy: false,
    pendingInterrupt: false,
    stopRequested: false,
  };
}

describe('ProviderSessionUsageLedger (issue #1459)', () => {
  beforeEach(() => {
    updatePricingMap({
      [PRICED]: { inputCostPerToken: 1e-6, outputCostPerToken: 2e-6, cacheReadCostPerToken: 1e-7 },
    });
  });
  afterEach(() => resetPricingMapForTesting());

  it('bills antigravity and grok as a subscription and opencode as unknown', () => {
    expect(providerSessionBillingMode('antigravity')).toBe('subscription');
    expect(providerSessionBillingMode('grok')).toBe('subscription');
    expect(providerSessionBillingMode('opencode')).toBe('unknown');
  });

  it('sums the session lifetime tokens, turns and time across turns', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false);
    ledger.record('gemini-4-hydrogen-low', { inputTokens: 31539, outputTokens: 121 }, 3351, undefined);
    const { snapshot } = ledger.record(
      'gemini-4-hydrogen-low',
      { inputTokens: 4736, outputTokens: 321, cacheReadTokens: 59325 },
      9635,
      undefined,
    );
    expect(snapshot).toMatchObject({
      sessionId: 's1',
      model: 'gemini-4-hydrogen-low',
      tokens: { input: 36275, output: 442, cacheRead: 59325, cacheCreation: 0 },
      tokenCount: 36275 + 442 + 59325,
      turnCount: 2,
      messageCount: 2,
      durationMs: 3351 + 9635,
      status: 'ok',
      coverage: 'complete',
      scope: 'session',
    });
  });

  it('reports an unpriced model as "rate-missing", never as $0', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false);
    const { turnPrice, snapshot } = ledger.record(
      'gemini-4-hydrogen-low',
      { inputTokens: 100, outputTokens: 10 },
      1000,
      undefined,
    );
    expect(turnPrice.totalCost).toBeNull();
    expect(snapshot.totalCost).toBeNull();
    expect(snapshot.pricingCoverage).toBe('none');
    expect(snapshot.costUnavailableReason).toBe('rate-missing');
    expect(snapshot.modelUsageList?.[0]?.costUSD).toBeNull();
  });

  it('prices a model from the rate table as covered by the subscription', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false);
    const { turnPrice, snapshot } = ledger.record(
      PRICED,
      { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000 },
      1000,
      undefined,
    );
    const expected = 1000 * 1e-6 + 500 * 2e-6 + 2000 * 1e-7;
    expect(turnPrice.totalCost).toBeCloseTo(expected, 9);
    expect(snapshot.totalCost).toBeCloseTo(expected, 9);
    expect(snapshot.costBasis).toBe('covered-by-subscription');
    expect(snapshot.pricingCoverage).toBe('full');
    expect(snapshot.costUnavailableReason).toBeUndefined();
  });

  it('keeps a labeled known subtotal when only part of the session is priced', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false);
    ledger.record(PRICED, { inputTokens: 1000, outputTokens: 0 }, 1, undefined);
    const { snapshot } = ledger.record('gemini-4-neon', { inputTokens: 5, outputTokens: 5 }, 1, undefined);
    expect(snapshot.totalCost).toBeNull();
    expect(snapshot.pricingCoverage).toBe('partial');
    expect(snapshot.knownCost).toBeCloseTo(1000 * 1e-6, 9);
    expect(snapshot.costUnavailableReason).toBeUndefined();
  });

  it('uses a provider-reported cost as reported', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false);
    const { turnPrice } = ledger.record(
      'gemini-4-neon',
      { inputTokens: 5, outputTokens: 5, costUsd: 0.002 },
      1,
      undefined,
    );
    expect(turnPrice).toMatchObject({ totalCost: 0.002, costBasis: 'reported' });
  });

  it('never claims a lifetime total for a session restored from history', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', true);
    const { snapshot } = ledger.record(PRICED, { inputTokens: 10, outputTokens: 10 }, 1, undefined);
    expect(snapshot.coverage).toBe('partial');
    expect(snapshot.totalCost).toBeNull();
    expect(snapshot.turnCount).toBeUndefined();
    expect(snapshot.tokens.input).toBe(10);
  });

  it('still names a missing rate for a restored session of an unpriced model', () => {
    // A chat reopened from history (or continued after the pool closed its
    // process) is restored; its unpriced model must read "Not priced", not "—".
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', true);
    const { snapshot } = ledger.record(
      'gemini-4-hydrogen-low',
      { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 },
      1000,
      undefined,
    );
    expect(snapshot.totalCost).toBeNull();
    expect(snapshot.coverage).toBe('partial');
    expect(snapshot.costUnavailableReason).toBe('rate-missing');
  });

  it('names no cause once an unpriced turn had no model to price', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false);
    ledger.record('gemini-4-hydrogen-low', { inputTokens: 1, outputTokens: 1 }, 1, undefined);
    const { snapshot } = ledger.record(undefined, { inputTokens: 1, outputTokens: 1 }, 1, undefined);
    expect(snapshot.costUnavailableReason).toBeUndefined();
  });

  it('records the latest context frame against the agent-reported window', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false);
    const capacity = resolveContextCapacity({
      route: { kind: 'native', providerId: 'antigravity-cli' },
      model: 'gemini-4-neon',
      sdkContextWindow: 1048576,
    });
    const { snapshot } = ledger.record(
      'gemini-4-neon',
      { inputTokens: 5, outputTokens: 5, contextTokens: 32285 },
      1,
      capacity,
    );
    expect(snapshot.contextSnapshot).toEqual({
      model: 'gemini-4-neon',
      contextTokens: 32285,
      contextWindow: 1048576,
      contextCapacity: capacity,
    });
  });
});

describe('resultStats for a provider-session turn (issue #1459)', () => {
  it('carries the session snapshot the side panel installs', () => {
    const s = session();
    const first = resultStats(s, { inputTokens: 31539, outputTokens: 121 }, 3351);
    const second = resultStats(
      s,
      { inputTokens: 4736, outputTokens: 321, cacheReadTokens: 59325, contextTokens: 32285 },
      9635,
    );
    expect(first.sessionStats).toMatchObject({ sessionId: s.id, turnCount: 1 });
    expect(second.sessionStats).toMatchObject({
      sessionId: s.id,
      tokens: { input: 36275, output: 442, cacheRead: 59325, cacheCreation: 0 },
      turnCount: 2,
      costUnavailableReason: 'rate-missing',
    });
    expect(second.turnCost).toBeNull();
    expect(second.modelUsage?.[0]?.costUSD).toBeNull();
  });

  it('uses the context window the agent reported, so the context fill is known', () => {
    const stats = resultStats(
      session(),
      { model: 'gemini-4-neon', inputTokens: 5, outputTokens: 5, contextTokens: 32285, contextWindow: 1048576 },
      1,
    );
    expect(stats.modelUsage?.[0]).toMatchObject({
      model: 'gemini-4-neon',
      contextWindow: 1048576,
      contextCapacity: { tokens: 1048576, source: 'sdk-native' },
      lastTurnContextTokens: 32285,
    });
    expect(stats.sessionStats?.contextSnapshot).toMatchObject({ contextWindow: 1048576 });
  });

  it('marks a resumed session partial: its earlier turns ran before the restore', () => {
    const stats = resultStats(
      session({ resume: { nativeSessionId: 'native-1' } } as Partial<ProviderSessionChatPrepared>),
      { inputTokens: 5, outputTokens: 5 },
      1,
    );
    expect(stats.sessionStats?.coverage).toBe('partial');
  });
});

describe('Antigravity effort-suffixed model pricing', () => {
  const rate = { inputCostPerToken: 1e-6, outputCostPerToken: 4e-6, cacheReadCostPerToken: 2e-7 };
  const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 500 };
  afterEach(() => resetPricingMapForTesting());

  it('names the base id only for the antigravity profile and the listed suffixes', () => {
    expect(providerSessionPricingFallback('antigravity', 'gemini-4-hydrogen-low')).toBe('gemini-4-hydrogen');
    expect(providerSessionPricingFallback('antigravity', 'gemini-4-hydrogen-xhigh')).toBe('gemini-4-hydrogen');
    expect(providerSessionPricingFallback('antigravity', 'claude-opus-5-5-medium')).toBe('claude-opus-5-5');
    expect(providerSessionPricingFallback('antigravity', 'gemini-pro-orchestrator')).toBeUndefined();
    expect(providerSessionPricingFallback('antigravity', 'gemini-4-hydrogen-lowest')).toBeUndefined();
    expect(providerSessionPricingFallback('grok', 'grok-5-high')).toBeUndefined();
    expect(providerSessionPricingFallback(undefined, 'gemini-4-hydrogen-low')).toBeUndefined();
  });

  it('prices gemini-4-hydrogen-low at the gemini-4-hydrogen rate and names it', () => {
    registerProviderPricing({ 'google/gemini-4-hydrogen': rate, 'gemini-4-hydrogen': rate });
    const price = priceTurn('gemini-4-hydrogen-low', usage, 'subscription', 'antigravity');
    expect(price.totalCost).toBeCloseTo(1000 * 1e-6 + 100 * 4e-6 + 500 * 2e-7, 9);
    expect(price.costBasis).toBe('covered-by-subscription');
    expect(price.priceProvenance?.modelIdUsed).toBe('gemini-4-hydrogen');
  });

  it('keeps an effort variant unpriced outside the antigravity profile', () => {
    updatePricingMap({ 'gemini-4-hydrogen': rate });
    expect(priceTurn('gemini-4-hydrogen-low', usage, 'subscription', 'grok').totalCost).toBeNull();
    expect(priceTurn('gemini-4-hydrogen-low', usage, 'subscription').totalCost).toBeNull();
  });

  it('keeps a model with no published rate unpriced, never $0', () => {
    updatePricingMap({ 'gemini-4-hydrogen': rate });
    for (const model of ['gemini-pro-orchestrator', 'gemini-pro-orchestrator-high']) {
      const price = priceTurn(model, usage, 'subscription', 'antigravity');
      expect(price.totalCost).toBeNull();
      expect(price.costUnavailableReason).toBe('rate-missing');
    }
  });

  it('prices a claude effort variant at the bundled claude rate', () => {
    const expected = calculateExactMessageCost(
      'claude-sonnet-5-5',
      { input: 1000, output: 100, cacheHit: 500, cacheCreation: 0 },
      { billingMode: 'subscription', cacheSemantics: 'disjoint', usageObserved: true },
    );
    expect(expected.totalCost).not.toBeNull();
    const price = priceTurn('claude-sonnet-5-5-medium', usage, 'subscription', 'antigravity');
    expect(price.totalCost).toBe(expected.totalCost);
    expect(price.priceProvenance?.modelIdUsed).toBe(expected.priceProvenance?.modelIdUsed);
  });

  it('prices through the ledger with the session profile', () => {
    updatePricingMap({ 'gemini-4-hydrogen': rate });
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false, { profile: 'antigravity' });
    const { snapshot } = ledger.record('gemini-4-hydrogen-high', usage, 1, undefined);
    expect(snapshot.pricingCoverage).toBe('full');
    expect(snapshot.totalCost).not.toBeNull();
    expect(snapshot.priceProvenance?.[0]?.modelIdUsed).toBe('gemini-4-hydrogen');
  });
});

describe('ProviderSessionUsageLedger persistence identity and seed', () => {
  const seedRow = {
    modelId: 'm',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    knownCostMicroUsd: 2500,
    events: 2,
    unpricedEvents: 0,
    costAuthorities: ['model-priced' as const],
  };
  afterEach(() => resetPricingMapForTesting());

  it('gives the turns of one run increasing revisions under one run id', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false);
    const one = ledger.record('m', { inputTokens: 1, outputTokens: 1 }, 1, undefined);
    const two = ledger.record('m', { inputTokens: 1, outputTokens: 1 }, 1, undefined);
    expect(two.revision).toBeGreaterThan(one.revision);
    expect([one.runTurn, two.runTurn]).toEqual([1, 2]);
    expect(two.runId).toBe(one.runId);
    expect(two.snapshot.coverage).toBe('complete');
  });

  it('shows the persisted totals of a contiguous seed as partial, since a lost trailing turn leaves no trace', () => {
    updatePricingMap({ m: { inputCostPerToken: 1e-6, outputCostPerToken: 1e-6 } });
    // 1..2 persisted, contiguous: a third turn may still have been lost.
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', true, {
      seed: { events: 2, maxRevision: 2, durationMs: 40, models: [seedRow] },
    });
    const turn = ledger.record('m', { inputTokens: 1, outputTokens: 1 }, 10, undefined);
    expect(turn.runTurn).toBe(1);
    expect(turn.revision).toBeGreaterThan(2);
    expect(turn.snapshot).toMatchObject({
      coverage: 'partial',
      messageCount: 3,
      durationMs: 50,
      tokens: { input: 11, output: 6 },
      // Partial, so the renderer shows the known subtotal (knownSubtotalOf).
      pricingCoverage: 'partial',
      totalCost: null,
    });
    expect(turn.snapshot.turnCount).toBeUndefined();
    expect(turn.snapshot.knownCost).toBeCloseTo(0.0025 + 2e-6, 9);
  });

  it('keeps applying a seed whose revisions are time-based (no poisoning after a timed-out resume)', () => {
    // An earlier process resumed without a seed and wrote time-based
    // revisions; the next resume still counts every persisted turn.
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', true, {
      seed: { events: 3, maxRevision: 1_700_000_000_000, durationMs: 0, models: [{ ...seedRow, events: 3 }] },
    });
    const turn = ledger.record('m', { inputTokens: 1, outputTokens: 1 }, 1, undefined);
    expect(turn.snapshot.tokens.input).toBe(11);
    expect(turn.snapshot.messageCount).toBe(4);
    expect(turn.revision).toBeGreaterThan(1_700_000_000_000);
  });

  it('ignores a seed for a session that was not restored', () => {
    const ledger = new ProviderSessionUsageLedger('s1', 'subscription', false, {
      seed: { events: 2, maxRevision: 2, durationMs: 0, models: [seedRow] },
    });
    const turn = ledger.record('m', { inputTokens: 1, outputTokens: 1 }, 1, undefined);
    expect(turn.snapshot.tokens.input).toBe(1);
    expect(turn.snapshot.coverage).toBe('complete');
  });
});
