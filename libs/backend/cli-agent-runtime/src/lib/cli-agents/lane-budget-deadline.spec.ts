import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import { armLaneBudgetDeadline, createLaneBudget } from './lane-budget-deadline';
import type { TrackedAgent } from './tracked-agent';

describe('armLaneBudgetDeadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('arms the remaining lifetime and stops only the current running lane', () => {
    const budget = new AgentBudgetCoordinator({
      warnRatio: 0.8, stopWeightedTokens: 100,
      handoffContextTokens: 50, maxDurationMin: 2,
    }, Date.now() - 60_000);
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
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
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
    const staleStop = jest.fn();
    const currentStop = jest.fn();
    armLaneBudgetDeadline(tracked, () => true, staleStop);
    armLaneBudgetDeadline(tracked, () => true, currentStop);
    jest.advanceTimersByTime(120_000);
    expect(staleStop).not.toHaveBeenCalled();
    expect(currentStop).toHaveBeenCalledTimes(1);
  });
  it('rearms a lifetime longer than the maximum timer delay', () => {
    const budget = new AgentBudgetCoordinator({
      warnRatio: 0.8, stopWeightedTokens: 100,
      handoffContextTokens: 50, maxDurationMin: 40_000,
    }, Date.now());
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
    const stop = jest.fn();
    armLaneBudgetDeadline(tracked, () => true, stop);
    jest.advanceTimersByTime(2_147_483_647);
    expect(stop).not.toHaveBeenCalled();
    jest.advanceTimersByTime(40_000 * 60_000 - 2_147_483_647);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

it('restores budget counters and start time from a previous record', () => {
  const budget = createLaneBudget({ warnRatio: 0.8, stopWeightedTokens: 100,
    handoffContextTokens: 50, maxDurationMin: 2 }, new Date(10_000).toISOString(), {
    startedAtMs: 1_000, weightedTokens: 20, rawTokens: 18,
    turnIds: ['first'], turnCount: 3,
  });
  expect(budget.startedAtMs).toBe(1_000);
  expect(budget.turnCount).toBe(3);
  expect(budget.counters.rawTokens).toBe(18);
});

describe('createLaneBudget on resume', () => {
  it('restores the unavailable-turn and largest-turn counters of the previous record', () => {
    const budget = createLaneBudget({
      warnRatio: 0.8, stopWeightedTokens: 1_000,
      handoffContextTokens: 500, maxDurationMin: 60,
    }, '2026-11-08T00:00:00.000Z', {
      weightedTokens: 100, rawTokens: 120, largestTurnTokens: 70, unavailableTurns: 2,
      turnIds: ['t1', 't2'], turnCount: 2, startedAtMs: Date.now(),
      stopWeightedTokens: 1_000, maxDurationMin: 60,
    });
    expect(budget.counters.largestTurnTokens).toBe(70);
    expect(budget.counters.unavailableTurns).toBe(2);
    expect(budget.record()).toMatchObject({ largestTurnTokens: 70, unavailableTurns: 2 });
  });
});
