import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import { armLaneBudgetDeadline } from './lane-budget-deadline';

describe('armLaneBudgetDeadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('arms the remaining lifetime and stops only the current running lane', () => {
    const budget = new AgentBudgetCoordinator({
      warnRatio: 0.8, stopWeightedTokens: 100,
      handoffContextTokens: 50, maxDurationMin: 2,
    }, Date.now() - 60_000);
    const tracked = { budget, info: { status: 'running' as const }, budgetTimer: undefined as NodeJS.Timeout | undefined };
    const stop = jest.fn();
    armLaneBudgetDeadline(tracked, () => true, stop);
    jest.advanceTimersByTime(59_999);
    expect(stop).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('clears the prior timer when a resumed lane rearms its deadline', () => {
    const budget = new AgentBudgetCoordinator({
      warnRatio: 0.8, stopWeightedTokens: 100,
      handoffContextTokens: 50, maxDurationMin: 2,
    }, Date.now());
    const tracked = { budget, info: { status: 'running' as const }, budgetTimer: undefined as NodeJS.Timeout | undefined };
    const staleStop = jest.fn();
    const currentStop = jest.fn();
    armLaneBudgetDeadline(tracked, () => true, staleStop);
    armLaneBudgetDeadline(tracked, () => true, currentStop);
    jest.advanceTimersByTime(120_000);
    expect(staleStop).not.toHaveBeenCalled();
    expect(currentStop).toHaveBeenCalledTimes(1);
  });
});
