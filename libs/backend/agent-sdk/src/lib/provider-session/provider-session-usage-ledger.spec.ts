import 'reflect-metadata';
import {
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
  ProviderSessionUsageLedger,
  providerSessionBillingMode,
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
