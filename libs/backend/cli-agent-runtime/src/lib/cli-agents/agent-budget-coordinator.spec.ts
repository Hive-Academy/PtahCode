import { completedTurnTelemetry } from '@ptah-extension/shared';
import { AgentBudgetCoordinator } from './agent-budget-coordinator';

const settings = {
  warnRatio: 0.5, stopWeightedTokens: 100,
  handoffContextTokens: 1000, maxDurationMin: 1,
};

describe('AgentBudgetCoordinator', () => {
  it('warns once, deduplicates turns, and stops at the hard limit', () => {
    const budget = new AgentBudgetCoordinator(settings, 0);
    const turn = (turnId: string, inputTokens: number) => completedTurnTelemetry({
      turnId, modelId: 'unknown-test-model', source: 'stream',
      usage: { inputTokens, outputTokens: 0 },
    });
    expect(budget.accept(turn('one', 60), 1).warning).toBe(true);
    expect(budget.accept(turn('one', 60), 2).warning).toBe(false);
    expect(budget.counters.rawTokens).toBe(60);
    expect(budget.accept(turn('two', 40), 3).stopReason).toBe('budget');
  });

  it('fails closed for missing turn totals and keeps the original deadline', () => {
    const budget = new AgentBudgetCoordinator(settings, 100);
    expect(budget.remainingMs(30_100)).toBe(30_000);
    expect(budget.accept({ status: 'unavailable', turnId: 'one', modelId: 'm', source: 'stream', reason: 'missing totals' }, 200).stopReason)
      .toBe('telemetry-unavailable');
    expect(budget.remainingMs(60_100)).toBe(0);
  });
});
