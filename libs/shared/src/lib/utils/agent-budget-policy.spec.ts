import { AgentTurnUsage } from '../types/agent-turn-usage.types';
import { AgentBudgetPolicy, initialAgentBudgetSnapshot, resolveAgentTurnCost } from './agent-budget-policy';

const reported = (value: number) => ({ status: 'reported', value, source: 'stream' } as const);
const missing = { status: 'unavailable', reason: 'absent', source: 'stream' } as const;
const usage: AgentTurnUsage = {
  turnId: 't1', modelId: 'm', scope: 'turn', source: 'stream', inputTokens: 60,
  outputTokens: 20, cacheReadTokens: reported(10), cacheWriteTokens: reported(5),
  requestContextTokens: reported(60), providerCostUsd: missing,
  cacheSemantics: 'verified-subsets',
};
const rates = { inputCostPerToken: 3e-6, outputCostPerToken: 12e-6, cacheReadCostPerToken: 1e-6, cacheCreationCostPerToken: 4e-6 };
const policy = new AgentBudgetPolicy({ warnRatio: 0.8, stopWeightedTokens: 100, handoffContextTokens: 50, maxDurationMin: 2 });

describe('AgentBudgetPolicy', () => {
  it('weights all four classes and stops once', () => {
    const first = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage }, 10, rates);
    expect(first.snapshot.weightedTokens).toBeCloseTo(135);
    expect(first.stopReason).toBe('budget');
    expect(first.handoff).toBe(true);
    const duplicate = policy.evaluate(first.snapshot, { status: 'reported', usage }, 11, rates);
    expect(duplicate.snapshot.weightedTokens).toBe(first.snapshot.weightedTokens);
    expect(duplicate.stopReason).toBeUndefined();
  });
  it('keeps raw token floor and marks missing price coverage', () => {
    const result = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage }, 10, null);
    expect(result.snapshot.weightedTokens).toBe(80);
    expect(result.coverage).toBe('price-weighting-degraded');
    expect(result.warning).toBe(true);
    expect(result.cost.status).toBe('unavailable');
  });
  it('prefers provider cost and stops on unavailable telemetry', () => {
    expect(resolveAgentTurnCost({ ...usage, providerCostUsd: reported(0.2) }, null)).toEqual({ status: 'reported', value: 0.2, source: 'provider' });
    expect(policy.evaluate(initialAgentBudgetSnapshot, { status: 'unavailable', turnId: 't', modelId: 'm', source: 'sdk', reason: 'missing' }, 0, null).stopReason).toBe('telemetry-unavailable');
  });
  it('enforces duration without a token threshold', () => {
    expect(policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: { ...usage, inputTokens: 1, outputTokens: 1, cacheReadTokens: reported(0), cacheWriteTokens: reported(0), requestContextTokens: missing } }, 120_000, rates).stopReason).toBe('duration');
  });
});
