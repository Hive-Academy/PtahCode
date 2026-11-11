import type { AgentTurnTelemetry } from '@ptah-extension/shared';
import { laneModelOutcome, observedModelFrom, requestedModelForLog, takeOutcomeLog, type LaneModelLogState } from './lane-model-log';

const telemetry = (modelId: string): AgentTurnTelemetry => ({
  status: 'reported',
  usage: {
    turnId: 'turn-1', modelId, scope: 'turn', source: 'sdk',
    inputTokens: 1, outputTokens: 1,
    cacheReadTokens: { status: 'unavailable', reason: 'none', source: 'sdk' },
    cacheWriteTokens: { status: 'unavailable', reason: 'none', source: 'sdk' },
    requestContextTokens: { status: 'unavailable', reason: 'none', source: 'sdk' },
    providerCostUsd: { status: 'unavailable', reason: 'none', source: 'sdk' },
    cacheSemantics: 'unknown',
  },
});

describe('lane model logs', () => {
  it('bounds requested models and labels absent requests', () => {
    expect(requestedModelForLog('  ')).toBe('none');
    expect(requestedModelForLog(undefined)).toBe('none');
    expect(requestedModelForLog(`  ${'x'.repeat(150)}  `)).toBe('x'.repeat(128));
  });

  it('never infers actual model from the selection', () => {
    const state: LaneModelLogState = {
      requestedModel: 'requested', selectedModel: 'selected',
      modelSource: 'request' as const, selectedEffort: 'high',
    };
    expect(laneModelOutcome('agent', 'cursor', state).actualModel).toBe('unobserved');
    expect(laneModelOutcome('agent', 'cursor', { ...state, actualModel: 'reported' }).actualModel).toBe('reported');
  });

  it('accepts only bounded, adapter-reported model ids', () => {
    expect(observedModelFrom('cursor', telemetry('  provider/model  '))).toBe('provider/model');
    expect(observedModelFrom('cursor', telemetry('x'.repeat(150)))).toBe('x'.repeat(128));
    expect(observedModelFrom('cursor', telemetry('  '))).toBeUndefined();
    expect(observedModelFrom('cursor', telemetry('provider/unknown'))).toBeUndefined();
    expect(observedModelFrom('cursor', telemetry('provider/multi-model'))).toBeUndefined();
    expect(observedModelFrom('pi', telemetry('provider/model'))).toBeUndefined();
    expect(observedModelFrom('cursor', {
      status: 'unavailable', turnId: 'turn-1', modelId: 'provider/model',
      source: 'sdk', reason: 'missing',
    })).toBeUndefined();
  });

  it('logs once per completion stamp and logs a resumed turn again', () => {
    const state: LaneModelLogState = {
      requestedModel: 'requested', selectedModel: 'selected',
      modelSource: 'request' as const, selectedEffort: 'high',
    };
    expect(takeOutcomeLog(state, 'agent', 'cursor', 'first')?.actualModel).toBe('unobserved');
    expect(takeOutcomeLog(state, 'agent', 'cursor', 'first')).toBeUndefined();
    state.actualModel = observedModelFrom('cursor', telemetry('provider/reported'));
    expect(takeOutcomeLog(state, 'agent', 'cursor', 'second')?.actualModel).toBe('provider/reported');
    expect(takeOutcomeLog(state, 'agent', 'cursor', 'second')).toBeUndefined();
  });
});
