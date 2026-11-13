import type {
  RepositoryIdentityResolver,
  SessionUsageContribution,
  SessionUsageSink,
  UsageMissingReason,
  UsageReconciliationTrigger,
  UsageScope,
} from './index';
import { PLATFORM_TOKENS } from './index';

describe('public usage contracts', () => {
  it('exports stable platform tokens for the usage ports', () => {
    expect(Symbol.keyFor(PLATFORM_TOKENS.SESSION_USAGE_SINK)).toBe(
      'PlatformSessionUsageSink',
    );
    expect(Symbol.keyFor(PLATFORM_TOKENS.USAGE_RECONCILIATION_TRIGGER)).toBe(
      'PlatformUsageReconciliationTrigger',
    );
    expect(Symbol.keyFor(PLATFORM_TOKENS.REPOSITORY_IDENTITY_RESOLVER)).toBe(
      'PlatformRepositoryIdentityResolver',
    );
  });

  it('exposes nullable deltas and optional sink lifecycle methods', () => {
    const scope: UsageScope = 'turn';
    const missingReason: UsageMissingReason = 'partial-usage';
    const event: SessionUsageContribution = {
      sessionId: 'session',
      producer: 'transcript-replay',
      runId: 'run',
      nativeThreadId: null,
      turnId: null,
      eventKey: 'event',
      parentSessionId: null,
      subagentId: null,
      providerId: null,
      occurredAtMs: 1,
      revision: 0,
      models: [{
        modelId: null,
        inputTokens: null,
        outputTokens: 0,
        cacheReadTokens: null,
        cacheCreationTokens: null,
        knownCostMicroUsd: null,
        costAuthority: 'unpriced',
      }],
      totalCostMicroUsd: null,
      totalCostAuthority: 'unpriced',
      pricingVersion: null,
      source: 'replay',
      missingReason,
      billable: false,
      coverageStartMs: null,
      coverageEndMs: null,
    };
    const sink: SessionUsageSink = { recordUsage: () => undefined };
    const trigger: UsageReconciliationTrigger = { enqueue: () => undefined };
    const resolver: RepositoryIdentityResolver = {
      resolve: async () => null,
    };

    expect(scope).toBe('turn');
    expect(event.models[0].inputTokens).toBeNull();
    expect(sink.requestFinalization).toBeUndefined();
    expect(typeof trigger.enqueue).toBe('function');
    expect(typeof resolver.resolve).toBe('function');
  });
});
