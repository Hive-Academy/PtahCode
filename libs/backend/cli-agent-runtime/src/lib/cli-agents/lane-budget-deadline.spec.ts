import { AgentBudgetCoordinator } from './agent-budget-coordinator';
import { armLaneBudgetDeadline, createLaneBudget } from './lane-budget-deadline';
import type { TrackedAgent } from './tracked-agent';

describe('armLaneBudgetDeadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const settings = { warnRatio: 0.8, stopWeightedTokens: 100, handoffContextTokens: 50, maxDurationMin: 2 };

  it('fires at the ask point, then at the pause point, then disarms', () => {
    const budget = new AgentBudgetCoordinator(settings, Date.now() - 60_000);
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
    const phases: string[] = [];
    armLaneBudgetDeadline(tracked, () => true, () => phases.push(budget.admission().phase));
    // Ask at 0.8 x 120 s = 96 s, 36 s after the 60 s already elapsed.
    jest.advanceTimersByTime(35_999);
    expect(phases).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(phases).toEqual(['asked-handoff']);
    // Pause at 2 x 120 s = 240 s.
    jest.advanceTimersByTime(144_000);
    expect(phases).toEqual(['asked-handoff', 'paused']);
    expect(tracked.budgetTimer).toBeUndefined();
    jest.advanceTimersByTime(10 * 60_000);
    expect(phases).toHaveLength(2);
  });

  it('does not fire for a lane that is no longer current or running', () => {
    const budget = new AgentBudgetCoordinator(settings, Date.now());
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
    const onDeadline = jest.fn();
    armLaneBudgetDeadline(tracked, () => false, onDeadline);
    jest.advanceTimersByTime(240_000);
    expect(onDeadline).not.toHaveBeenCalled();
  });

  it('arms nothing once the lane is past the pause point', () => {
    const budget = new AgentBudgetCoordinator(settings, Date.now() - 300_000);
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
    armLaneBudgetDeadline(tracked, () => true, jest.fn());
    expect(tracked.budgetTimer).toBeUndefined();
  });

  it('clears the prior timer when a resumed lane rearms its deadline', () => {
    const budget = new AgentBudgetCoordinator(settings, Date.now());
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
    const stale = jest.fn();
    const current = jest.fn();
    armLaneBudgetDeadline(tracked, () => true, stale);
    armLaneBudgetDeadline(tracked, () => true, current);
    jest.advanceTimersByTime(96_000);
    expect(stale).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('re-arms on a settings change to the new ask point', () => {
    const budget = new AgentBudgetCoordinator(settings, Date.now());
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
    const onDeadline = jest.fn();
    armLaneBudgetDeadline(tracked, () => true, onDeadline);
    budget.updateSettings({ ...settings, maxDurationMin: 1 });
    armLaneBudgetDeadline(tracked, () => true, onDeadline);
    jest.advanceTimersByTime(48_000);
    expect(onDeadline).toHaveBeenCalledTimes(1);
  });

  it('rearms a lifetime longer than the maximum timer delay', () => {
    const budget = new AgentBudgetCoordinator({ ...settings, warnRatio: 0.9, maxDurationMin: 40_000 }, Date.now());
    const tracked = { budget, info: { status: 'running' as const } } as TrackedAgent;
    const phases: string[] = [];
    armLaneBudgetDeadline(tracked, () => true, () => phases.push(budget.admission().phase));
    jest.advanceTimersByTime(2_147_483_647);
    expect(phases).toEqual(['running']);
    // Ask at 0.9 x 40,000 min = 2,160,000,000 ms, past one maximum timer delay.
    jest.advanceTimersByTime(2_160_000_000 - 2_147_483_647);
    expect(phases).toEqual(['running', 'asked-handoff']);
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
