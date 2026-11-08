import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import type { AgentTurnUsage } from '@ptah-extension/shared';

const settings = { warnRatio: 0.8, stopWeightedTokens: 100,
  handoffContextTokens: 50, maxDurationMin: 2 };
const unavailable = { status: 'unavailable', reason: 'absent', source: 'stream' } as const;
const usage: AgentTurnUsage = {
  turnId: 'turn-1', modelId: 'unknown', scope: 'turn', source: 'stream',
  inputTokens: 60, outputTokens: 20,
  cacheReadTokens: unavailable, cacheWriteTokens: unavailable,
  requestContextTokens: unavailable, providerCostUsd: unavailable,
  cacheSemantics: 'unknown',
};

describe('AgentBudgetCoordinator', () => {
  it('warns once, deduplicates turn IDs, and stops at the limit', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 0);
    const first = coordinator.accept({ status: 'reported', usage }, 10);
    expect(first.warning).toBe(true);
    expect(first.costUnavailable).toBe(true);
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.accept({ status: 'reported', usage }, 11).warning).toBe(false);
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.counters.rawTokens).toBe(80);
    expect(coordinator.accept({ status: 'reported', usage: { ...usage, turnId: 'turn-2' } }, 12).stopReason).toBe('budget');
    expect(coordinator.turnCount).toBe(2);
  });

  it('fails closed for missing totals and expires at the original deadline', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 1_000);
    expect(coordinator.accept({ status: 'unavailable', turnId: 'missing', modelId: 'unknown', source: 'stream', reason: 'missing' }, 2_000).stopReason).toBe('telemetry-unavailable');
    expect(coordinator.expired(120_999)).toBe(false);
    expect(coordinator.expired(121_000)).toBe(true);
  });

  it('merges a prior ledger after its provisional first charge', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 5_000);
    coordinator.accept({ status: 'reported', usage }, 5_100);
    const decision = coordinator.rebindRecord({ weightedTokens: 40, rawTokens: 30,
      turnIds: ['native:1'], turnCount: 1, startedAtMs: 1_000,
      stopWeightedTokens: 100, maxDurationMin: 2 }, 6_000);
    expect(coordinator.counters.rawTokens).toBe(110);
    expect(coordinator.counters.turnIds).toEqual(['native:1', 'turn-1']);
    expect(coordinator.turnCount).toBe(2);
    expect(coordinator.startedAtMs).toBe(1_000);
    expect(coordinator.remainingMs(6_000)).toBe(115_000);
    expect(coordinator.record().rawTokens).toBe(110);
    expect(decision.stopReason).toBe('budget');
    expect(coordinator.stopReason).toBe('budget');
  });

  it('warns immediately when a late ledger merge crosses the warning threshold', () => {
    const coordinator = new AgentBudgetCoordinator(settings, Date.now());
    coordinator.accept({ status: 'reported', usage: { ...usage, inputTokens: 30, outputTokens: 10 } });
    const decision = coordinator.rebindRecord({ weightedTokens: 45, rawTokens: 45,
      turnIds: ['native:1'], turnCount: 1, startedAtMs: Date.now(),
      stopWeightedTokens: 100, maxDurationMin: 2 });
    expect(decision).toEqual({ warning: true });
    expect(coordinator.counters.warned).toBe(true);
  });
});
