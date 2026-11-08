import { AgentBudgetCoordinator } from './agent-budget-coordinator';

describe('AgentBudgetCoordinator late session binding', () => {
  it('keeps prior counters and the original lifetime clock', () => {
    const coordinator = new AgentBudgetCoordinator({
      warnRatio: 0.85, stopWeightedTokens: 1000,
      handoffContextTokens: 100, maxDurationMin: 90,
    }, 5_000);
    coordinator.rebind(1_000, {
      weightedTokens: 400, rawTokens: 300, turnIds: ['native:1'],
      elapsedMs: 0, warned: false, stopped: false,
    }, 1);
    expect(coordinator.counters.rawTokens).toBe(300);
    expect(coordinator.counters.weightedTokens).toBe(400);
    expect(coordinator.turnCount).toBe(1);
    expect(coordinator.remainingMs(6_000)).toBe(90 * 60_000 - 5_000);
    expect(coordinator.resumeSnapshot().turnIds).toEqual(['native:1']);
  });
});
