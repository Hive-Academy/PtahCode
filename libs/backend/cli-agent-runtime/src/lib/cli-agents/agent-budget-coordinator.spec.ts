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
  it('reassesses changed limits without losing charged turns or restarting duration', () => {
    const coordinator = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 1_000);
    coordinator.accept({ status: 'reported', usage: { ...usage, inputTokens: 30, outputTokens: 10 } }, 2_000);
    expect(coordinator.updateSettings({ ...settings, stopWeightedTokens: 50 }, 3_000).stopReason).toBeUndefined();
    expect(coordinator.updateSettings({ ...settings, stopWeightedTokens: 35 }, 4_000).stopReason).toBe('budget');
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.counters.rawTokens).toBe(40);
    expect(coordinator.startedAtMs).toBe(1_000);
    expect(coordinator.record().stopWeightedTokens).toBe(35);
  });

  it('applies a shorter lifetime to the existing start time', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 1_000);
    expect(coordinator.updateSettings({ ...settings, maxDurationMin: 1 }, 61_000).stopReason).toBe('duration');
    expect(coordinator.remainingMs(61_000)).toBe(0);
  });
  it('warns once, deduplicates turn IDs, and stops at the limit', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 0);
    const first = coordinator.accept({ status: 'reported', usage }, 10);
    expect(first.warning).toBe(true);
    expect(first.costUnavailable).toBe(true);
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.accept({ status: 'reported', usage }, 11).warning).toBe(false);
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.counters.rawTokens).toBe(80);
    const crossing = coordinator.accept({ status: 'reported', usage: { ...usage, turnId: 'turn-2' } }, 12);
    expect(crossing.warning).toBe(true);
    expect(crossing.stopReason).toBeUndefined();
    expect(coordinator.turnCount).toBe(2);
    expect(coordinator.accept({ status: 'reported', usage: { ...usage, turnId: 'turn-3' } }, 13).stopReason).toBe('budget');
    expect(coordinator.turnCount).toBe(3);
  });

  it('allows one missing total and expires at the original deadline', () => {
    const coordinator = new AgentBudgetCoordinator(settings, 1_000);
    expect(coordinator.accept({ status: 'unavailable', turnId: 'missing', modelId: 'unknown', source: 'stream', reason: 'missing' }, 2_000).stopReason).toBeUndefined();
    expect(coordinator.record().unavailableTurns).toBe(1);
    expect(coordinator.expired(120_999)).toBe(false);
    expect(coordinator.expired(121_000)).toBe(true);
  });

  it('persists the unavailable streak and carries the newer count across a ledger rebind', () => {
    const first = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 1_000);
    const missingTurn = (turnId: string) => ({ status: 'unavailable' as const, turnId,
      modelId: 'unknown', source: 'stream' as const, reason: 'missing' });
    first.accept(missingTurn('old'), 1_100);
    const record = first.record();
    expect(record.unavailableTurns).toBe(1);
    const resumed = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 2_000);
    resumed.accept(missingTurn('new'), 2_100);
    resumed.rebindRecord(record, 2_200);
    expect(resumed.counters.unavailableTurns).toBe(2);
    expect(resumed.record().turnIds).toEqual(['old', 'new']);
    expect(resumed.turnCount).toBe(2);
    expect(resumed.accept(missingTurn('last'), 2_300).stopReason).toBe('telemetry-unavailable');
    expect(resumed.counters.unavailableTurns).toBe(3);
  });

  it('adds unavailable streaks across distinct ledgers without a reported reset', () => {
    const coordinator = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 2_000);
    coordinator.accept({ status: 'unavailable', turnId: 'current', modelId: 'unknown',
      source: 'stream', reason: 'missing' }, 2_100);
    coordinator.rebindRecord({ weightedTokens: 0, rawTokens: 0, unavailableTurns: 2,
      turnIds: ['prior-1', 'prior-2'], turnCount: 2, startedAtMs: 1_000 }, 2_200);
    expect(coordinator.counters.unavailableTurns).toBe(3);
  });

  it('uses the current streak after a reported turn resets the prior ledger', () => {
    const coordinator = new AgentBudgetCoordinator({ ...settings, stopWeightedTokens: 200 }, 2_000);
    coordinator.accept({ status: 'reported', usage: { ...usage, inputTokens: 10, outputTokens: 0 } }, 2_100);
    coordinator.accept({ status: 'unavailable', turnId: 'current', modelId: 'unknown',
      source: 'stream', reason: 'missing' }, 2_200);
    coordinator.rebindRecord({ weightedTokens: 0, rawTokens: 0, unavailableTurns: 2,
      turnIds: ['prior-1', 'prior-2'], turnCount: 2, startedAtMs: 1_000 }, 2_300);
    expect(coordinator.counters.unavailableTurns).toBe(1);
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
