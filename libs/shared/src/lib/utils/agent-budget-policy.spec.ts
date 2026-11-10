import { AgentTurnUsage } from '../types/agent-turn-usage.types';
import { AgentBudgetPolicy, MAX_CONSECUTIVE_UNAVAILABLE_TURNS, initialAgentBudgetSnapshot, parseAgentBudgetSetting, resolveAgentTurnCost } from './agent-budget-policy';
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
const policy = new AgentBudgetPolicy({ warnRatio: 0.8, stopWeightedTokens: 100, handoffContextTokens: 50, maxDurationMin: 2 }, { laneAccounting: true });

describe('AgentBudgetPolicy', () => {
  it('keeps the original immediate token stop and raw floor by default', () => {
    const original = new AgentBudgetPolicy({ warnRatio: 0.8, stopWeightedTokens: 100, handoffContextTokens: 1000, maxDurationMin: 2 });
    const turn = { ...usage, inputTokens: 110, outputTokens: 0, cacheReadTokens: reported(0),
      cacheWriteTokens: reported(0), requestContextTokens: missing };
    expect(original.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: turn }, 0, null).stopReason).toBe('budget');
    expect(original.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage }, 0, null).snapshot.weightedTokens).toBe(80);
    expect(original.assess({ ...initialAgentBudgetSnapshot, rawTokens: 100, weightedTokens: 40 }, 0).stopReason).toBe('budget');
  });
  it('stops immediately on unavailable telemetry by default', () => {
    const original = new AgentBudgetPolicy({ warnRatio: 0.8, stopWeightedTokens: 100, handoffContextTokens: 1000, maxDurationMin: 2 });
    expect(original.evaluate(initialAgentBudgetSnapshot, { status: 'unavailable', turnId: 'missing', modelId: 'm', source: 'sdk', reason: 'missing' }, 0, null))
      .toMatchObject({ stopReason: 'telemetry-unavailable', snapshot: { stopped: true, weightedTokens: 0 } });
  });
  it('enforces contributed bounds at the settings boundary', () => {
    expect(parseAgentBudgetSetting('stopWeightedTokens', 100)).toBeUndefined();
    expect(parseAgentBudgetSetting('stopWeightedTokens', 2_000)).toBe(2_000);
    expect(parseAgentBudgetSetting('maxDurationMin', 0.5)).toBeUndefined();
    expect(parseAgentBudgetSetting('maxDurationMin', 1_441)).toBeUndefined();
  });
  afterEach(() => resetPricingMapForTesting());
  it('warns once when another turn of the same size would cross the stop', () => {
    const predictive = new AgentBudgetPolicy({ warnRatio: 0.85, stopWeightedTokens: 300, handoffContextTokens: 1000, maxDurationMin: 2 }, { laneAccounting: true });
    const turn = { ...usage, inputTokens: 61, outputTokens: 0, cacheReadTokens: reported(0), cacheWriteTokens: reported(0), requestContextTokens: missing };
    let snapshot = initialAgentBudgetSnapshot;
    for (let index = 0; index < 4; index++) {
      const result = predictive.evaluate(snapshot, { status: 'reported', usage: { ...turn, turnId: `t${index}` } }, index, null);
      expect(result.warning).toBe(index === 3);
      expect(result.stopReason).toBeUndefined();
      snapshot = result.snapshot;
    }
    const crossing = predictive.evaluate(snapshot, { status: 'reported', usage: { ...turn, turnId: 'crossing' } }, 5, null);
    expect(crossing.warning).toBe(true);
    expect(crossing.stopReason).toBeUndefined();
    const stop = predictive.evaluate(crossing.snapshot, { status: 'reported', usage: { ...turn, turnId: 'stop' } }, 6, null);
    expect(stop.stopReason).toBe('budget');
  });
  it('warns before a 209587 to 251031 jump at a 250000 stop', () => {
    const predictive = new AgentBudgetPolicy({ warnRatio: 0.85, stopWeightedTokens: 250000, handoffContextTokens: 500000, maxDurationMin: 2 }, { laneAccounting: true });
    const before = { ...initialAgentBudgetSnapshot, rawTokens: 168143, weightedTokens: 168143, largestTurnTokens: 41444 };
    const turn = { ...usage, turnId: 'before-stop', inputTokens: 41444, outputTokens: 0,
      cacheReadTokens: reported(0), cacheWriteTokens: reported(0), requestContextTokens: missing };
    const warning = predictive.evaluate(before, { status: 'reported', usage: turn }, 1, null);
    expect(warning.snapshot.rawTokens).toBe(209587);
    expect(warning.warning).toBe(true);
    expect(warning.stopReason).toBeUndefined();
    const crossing = predictive.evaluate(warning.snapshot, { status: 'reported', usage: { ...turn, turnId: 'crossing' } }, 2, null);
    expect(crossing.snapshot.rawTokens).toBe(251031);
    expect(crossing.warning).toBe(true);
    expect(crossing.stopReason).toBeUndefined();
    const stop = predictive.evaluate(crossing.snapshot, { status: 'reported', usage: { ...turn, turnId: 'stop' } }, 3, null);
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
    expect(result.warning).toBe(true);
    expect(result.stopReason).toBeUndefined();
  });
  it('weights all four classes and stops once', () => {
    const first = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage }, 10, rates);
    expect(first.snapshot.weightedTokens).toBeCloseTo(135);
    expect(first.stopReason).toBeUndefined();
    expect(first.warning).toBe(true);
    expect(first.handoff).toBe(true);
    const duplicate = policy.evaluate(first.snapshot, { status: 'reported', usage }, 11, rates);
    expect(duplicate.snapshot.weightedTokens).toBe(first.snapshot.weightedTokens);
    expect(duplicate.stopReason).toBeUndefined();
  });
  it('discounts verified cache reads even when price coverage is missing', () => {
    const result = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: { ...usage, requestContextTokens: missing } }, 10, null);
    expect(result.snapshot.rawTokens).toBe(80);
    expect(result.snapshot.weightedTokens).toBe(71);
    expect(result.coverage).toBe('price-weighting-degraded');
    expect(result.warning).toBe(true); // A same-size next turn is projected past the stop.
    expect(result.cost.status).toBe('unavailable');
  });
  it('uses verified per-model reads as the floor and clamps them to input', () => {
    const modelUsage = { ...usage, inputTokens: 60, outputTokens: 20, cacheSemantics: 'unknown' as const,
      cacheReadTokens: missing, models: [{ modelId: 'unpriced-model', inputTokens: 60,
        outputTokens: 20, cacheReadTokens: 100, cacheWriteTokens: 0 }] };
    const result = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: modelUsage }, 0, null);
    expect(result.snapshot.rawTokens).toBe(80);
    expect(result.snapshot.weightedTokens).toBe(26);
  });
  it('caps verified cache reads against each model input before summing', () => {
    const modelUsage = { ...usage, inputTokens: 100, outputTokens: 0,
      cacheReadTokens: missing, requestContextTokens: missing,
      models: [
        { modelId: 'unpriced-a', inputTokens: 10, outputTokens: 0, cacheReadTokens: 100, cacheWriteTokens: 0 },
        { modelId: 'unpriced-b', inputTokens: 90, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      ] };
    const result = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: modelUsage }, 0, null);
    expect(result.snapshot.rawTokens).toBe(100);
    expect(result.snapshot.weightedTokens).toBe(91);
  });
  it('keeps the raw floor for unverified cache classes and takes the larger priced value', () => {
    const unverified = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported',
      usage: { ...usage, cacheSemantics: 'unknown' } }, 0, null);
    expect(unverified.snapshot.weightedTokens).toBe(80);
    const priced = policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage }, 0, rates);
    expect(priced.snapshot.weightedTokens).toBe(135);
  });
  it('gives one grace turn at the token stop and ignores duplicate turns', () => {
    const budget = new AgentBudgetPolicy({ warnRatio: 0.85, stopWeightedTokens: 100,
      handoffContextTokens: 1000, maxDurationMin: 2 }, { laneAccounting: true });
    const turn = { ...usage, inputTokens: 110, outputTokens: 0, cacheReadTokens: reported(0),
      cacheWriteTokens: reported(0), requestContextTokens: missing };
    const first = budget.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: turn }, 0, null);
    expect(first).toMatchObject({ warning: true, stopReason: undefined, snapshot: { warned: true, stopped: false } });
    const duplicate = budget.evaluate(first.snapshot, { status: 'reported', usage: turn }, 1, null);
    expect(duplicate).toMatchObject({ warning: false, stopReason: undefined });
    expect(duplicate.snapshot.weightedTokens).toBe(first.snapshot.weightedTokens);
    const second = budget.evaluate(duplicate.snapshot, { status: 'reported',
      usage: { ...turn, turnId: 't2' } }, 2, null);
    expect(second).toMatchObject({ warning: false, stopReason: 'budget', snapshot: { stopped: true } });
  });
  it('grants the crossing turn grace even after an earlier warning', () => {
    const budget = new AgentBudgetPolicy({ warnRatio: 0.85, stopWeightedTokens: 100,
      handoffContextTokens: 1000, maxDurationMin: 2 }, { laneAccounting: true });
    const turn = { ...usage, inputTokens: 85, outputTokens: 0, cacheReadTokens: reported(0),
      cacheWriteTokens: reported(0), requestContextTokens: missing };
    const warned = budget.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: turn }, 0, null);
    expect(warned).toMatchObject({ warning: true, stopReason: undefined, snapshot: { weightedTokens: 85 } });
    const crossing = budget.evaluate(warned.snapshot, { status: 'reported', usage: {
      ...turn, turnId: 'crossing', inputTokens: 20,
    } }, 1, null);
    expect(crossing).toMatchObject({ warning: true, stopReason: undefined, snapshot: { weightedTokens: 105, stopped: false } });
    const stop = budget.evaluate(crossing.snapshot, { status: 'reported', usage: {
      ...turn, turnId: 'stop', inputTokens: 1,
    } }, 2, null);
    expect(stop.stopReason).toBe('budget');
  });
  it('stops immediately at the context ceiling, including a crossing or duplicate turn', () => {
    const budget = new AgentBudgetPolicy({ warnRatio: 0.85, stopWeightedTokens: 100,
      handoffContextTokens: 50, maxDurationMin: 2 }, { laneAccounting: true });
    const turn = { ...usage, inputTokens: 110, outputTokens: 0, cacheReadTokens: reported(0),
      cacheWriteTokens: reported(0), requestContextTokens: reported(100) };
    const crossing = budget.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: turn }, 0, null);
    expect(crossing.stopReason).toBe('budget');
    const ledger = { ...initialAgentBudgetSnapshot, weightedTokens: 110, turnIds: ['t1'] };
    const duplicateContext = budget.evaluate(ledger, { status: 'reported', usage: turn }, 1, null);
    expect(duplicateContext.stopReason).toBe('budget');
    const duplicateTokensOnly = budget.evaluate(ledger, { status: 'reported', usage: {
      ...turn, requestContextTokens: missing,
    } }, 1, null);
    expect(duplicateTokensOnly.stopReason).toBeUndefined();
  });
  it('prefers provider cost and stops after consecutive unavailable turns', () => {
    expect(resolveAgentTurnCost({ ...usage, providerCostUsd: reported(0.2) }, null)).toEqual({ status: 'reported', value: 0.2, source: 'provider' });
    expect(MAX_CONSECUTIVE_UNAVAILABLE_TURNS).toBe(3);
    const before = { ...initialAgentBudgetSnapshot, weightedTokens: 10, rawTokens: 10, largestTurnTokens: 20 };
    const missingTurn = (turnId: string) => ({ status: 'unavailable' as const, turnId, modelId: 'm', source: 'sdk' as const, reason: 'missing' });
    const first = policy.evaluate(before, missingTurn('t1'), 0, null);
    expect(first).toMatchObject({ stopReason: undefined, coverage: 'telemetry-unavailable', snapshot: { unavailableTurns: 1, weightedTokens: 30, rawTokens: 10 } });
    const duplicate = policy.evaluate(first.snapshot, missingTurn('t1'), 1, null);
    expect(duplicate.snapshot).toMatchObject({ unavailableTurns: 1, weightedTokens: 30, rawTokens: 10 });
    expect(duplicate.stopReason).toBeUndefined();
    const second = policy.evaluate(duplicate.snapshot, missingTurn('t2'), 2, null);
    expect(second).toMatchObject({ stopReason: undefined, snapshot: { unavailableTurns: 2, weightedTokens: 50 } });
    const third = policy.evaluate(second.snapshot, missingTurn('t3'), 3, null);
    expect(third).toMatchObject({ stopReason: 'telemetry-unavailable', snapshot: { unavailableTurns: 3, stopped: true } });
    const stopped = policy.evaluate(third.snapshot, missingTurn('t4'), 4, null);
    expect(stopped.stopReason).toBeUndefined();
    expect(stopped.snapshot.weightedTokens).toBe(third.snapshot.weightedTokens);
    expect(stopped.snapshot.unavailableTurns).toBe(3);
  });
  it('resets unavailable streak after an accounted turn', () => {
    const missingTurn = (turnId: string) => ({ status: 'unavailable' as const, turnId, modelId: 'm', source: 'sdk' as const, reason: 'missing' });
    const first = policy.evaluate(initialAgentBudgetSnapshot, missingTurn('m1'), 0, null);
    const available = policy.evaluate(first.snapshot, { status: 'reported', usage: { ...usage, turnId: 'a1', inputTokens: 1, outputTokens: 0, cacheReadTokens: reported(0), requestContextTokens: missing } }, 1, null);
    expect(available.snapshot.unavailableTurns).toBe(0);
    const next = policy.evaluate(available.snapshot, missingTurn('m2'), 2, null);
    expect(next.snapshot.unavailableTurns).toBe(1);
    expect(next.stopReason).toBeUndefined();
  });
  it('gives the estimated token stop one grace turn and enforces duration immediately', () => {
    const missingTurn = (turnId: string) => ({ status: 'unavailable' as const, turnId, modelId: 'm', source: 'sdk' as const, reason: 'missing' });
    const before = { ...initialAgentBudgetSnapshot, weightedTokens: 80, largestTurnTokens: 30 };
    const first = policy.evaluate(before, missingTurn('m1'), 0, null);
    expect(first).toMatchObject({ warning: true, stopReason: undefined, snapshot: { weightedTokens: 110, stopped: false } });
    const second = policy.evaluate(first.snapshot, missingTurn('m2'), 1, null);
    expect(second.stopReason).toBe('budget');
    expect(policy.evaluate(initialAgentBudgetSnapshot, missingTurn('late'), 120_000, null).stopReason).toBe('duration');
  });
  it('enforces duration without a token threshold', () => {
    expect(policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: { ...usage, inputTokens: 1, outputTokens: 1, cacheReadTokens: reported(0), cacheWriteTokens: reported(0), requestContextTokens: missing } }, 120_000, rates).stopReason).toBe('duration');
  });
  it('uses weighted tokens and the context ceiling for persisted decisions', () => {
    const snapshot = { ...initialAgentBudgetSnapshot, rawTokens: 100, weightedTokens: 40 };
    expect(policy.assess(snapshot, 0)).toMatchObject({ warning: false, stopReason: undefined });
    expect(policy.assess(initialAgentBudgetSnapshot, 0, 100)).toMatchObject({ warning: true, stopReason: 'budget', handoff: true });
    expect(policy.evaluate(initialAgentBudgetSnapshot, { status: 'reported', usage: {
      ...usage, inputTokens: 1, outputTokens: 0, cacheReadTokens: reported(0),
      cacheWriteTokens: reported(0), requestContextTokens: reported(100),
    } }, 0, null).stopReason).toBe('budget');
    expect(policy.assess(initialAgentBudgetSnapshot, 120_000)).toMatchObject({ stopReason: 'duration' });
  });
});
