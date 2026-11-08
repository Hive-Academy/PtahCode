import { AgentTurnUsage } from '../types/agent-turn-usage.types';
import { AgentBudgetPolicy, initialAgentBudgetSnapshot, resolveAgentTurnCost } from './agent-budget-policy';
import { registerProviderPricing, resetPricingMapForTesting } from './pricing.utils';

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
  afterEach(() => resetPricingMapForTesting());
  it('warns once when another turn of the same size would cross the stop', () => {
    const predictive = new AgentBudgetPolicy({ warnRatio: 0.85, stopWeightedTokens: 300, handoffContextTokens: 1000, maxDurationMin: 2 });
    const turn = { ...usage, inputTokens: 61, outputTokens: 0, cacheReadTokens: reported(0), cacheWriteTokens: reported(0), requestContextTokens: missing };
    let snapshot = initialAgentBudgetSnapshot;
    for (let index = 0; index < 4; index++) {
      const result = predictive.evaluate(snapshot, { status: 'reported', usage: { ...turn, turnId: `t${index}` } }, index, null);
      expect(result.warning).toBe(index === 3);
      expect(result.stopReason).toBeUndefined();
      snapshot = result.snapshot;
    }
    const stop = predictive.evaluate(snapshot, { status: 'reported', usage: { ...turn, turnId: 'stop' } }, 5, null);
    expect(stop.warning).toBe(false);
    expect(stop.stopReason).toBe('budget');
  });
  it('warns before a 209587 to 251031 jump at a 250000 stop', () => {
    const predictive = new AgentBudgetPolicy({ warnRatio: 0.85, stopWeightedTokens: 250000, handoffContextTokens: 500000, maxDurationMin: 2 });
    const before = { ...initialAgentBudgetSnapshot, rawTokens: 168143, weightedTokens: 168143, largestTurnTokens: 41444 };
    const turn = { ...usage, turnId: 'before-stop', inputTokens: 41444, outputTokens: 0,
      cacheReadTokens: reported(0), cacheWriteTokens: reported(0), requestContextTokens: missing };
    const warning = predictive.evaluate(before, { status: 'reported', usage: turn }, 1, null);
    expect(warning.snapshot.rawTokens).toBe(209587);
    expect(warning.warning).toBe(true);
    expect(warning.stopReason).toBeUndefined();
    const stop = predictive.evaluate(warning.snapshot, { status: 'reported', usage: { ...turn, turnId: 'stop' } }, 2, null);
    expect(stop.snapshot.rawTokens).toBe(251031);
    expect(stop.warning).toBe(false);
    expect(stop.stopReason).toBe('budget');
  });
  it('uses the largest prior turn when the last turn was smaller', () => {
    const predictive = new AgentBudgetPolicy({ warnRatio: 0.9, stopWeightedTokens: 250, handoffContextTokens: 1000, maxDurationMin: 2 });
    const snapshot = { ...initialAgentBudgetSnapshot, rawTokens: 205, weightedTokens: 205, largestTurnTokens: 50 };
    expect(predictive.assess(snapshot, 0, undefined, 10).warning).toBe(true);
  });
  it('weights each billed model in a mixed-model turn', () => {
    registerProviderPricing({
      'priced-expensive': { inputCostPerToken: 30e-6, outputCostPerToken: 60e-6 },
      'priced-cheap': { inputCostPerToken: 3e-6, outputCostPerToken: 6e-6 },
    });
    const mixed = { ...usage, modelId: 'mixed-model', inputTokens: 20, outputTokens: 20,
      cacheReadTokens: reported(0), cacheWriteTokens: reported(0),
      models: [
        { modelId: 'priced-expensive', inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
        { modelId: 'priced-cheap', inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      ],
    };
    const result = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: mixed }, 0, null);
    expect(result.snapshot.weightedTokens).toBeCloseTo(330);
    expect(result.stopReason).toBe('budget');
  });
  it('weights all four classes and stops once', () => {
    const first = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage }, 10, rates);
    expect(first.snapshot.weightedTokens).toBeCloseTo(135);
    expect(first.stopReason).toBe('budget');
    expect(first.warning).toBe(true);
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
  it('uses the raw floor and context ceiling for persisted and live decisions', () => {
    const snapshot = { ...initialAgentBudgetSnapshot, rawTokens: 100, weightedTokens: 40 };
    expect(policy.assess(snapshot, 0)).toMatchObject({ warning: true, stopReason: 'budget' });
    expect(policy.assess(initialAgentBudgetSnapshot, 0, 100)).toMatchObject({ warning: true, stopReason: 'budget', handoff: true });
    expect(policy.assess(initialAgentBudgetSnapshot, 120_000)).toMatchObject({ stopReason: 'duration' });
  });
});
