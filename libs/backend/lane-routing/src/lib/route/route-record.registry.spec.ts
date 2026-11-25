import type { ChosenEntry } from '../contracts/route-decide-result.schema';
import { ROUTE_RECORD_CAP } from '../routing-constants';
import { RouteRecordRegistry } from './route-record.registry';

const chosen: ChosenEntry = {
  phaseId: 'implement',
  status: 'chosen',
  executor: { kind: 'lane', id: 'codex', cli: 'codex', family: 'openai' },
  model: 'gpt-5',
  tier: 'sonnet',
  effort: 'high',
  provenance: 'reported',
  score: 75,
  source: 'model',
  taskKind: 'implement',
  confidence: 0.8,
  fallbackCause: null,
  modelProposal: { option: 'codex', confidence: 0.8 },
  reason: 'Model proposal',
};

describe('RouteRecordRegistry', () => {
  it('looks up chosen entries by route and phase, returning null for unknown ids', () => {
    const registry = new RouteRecordRegistry();
    registry.store('route-1', [chosen, { ...chosen, phaseId: 'review' }], 'ollama:nimble');
    registry.store('route-2', [{ ...chosen, model: 'gpt-5-mini' }], 'ollama:nimble');

    expect(registry.spawnFacts('route-1', 'implement')).toEqual({
      routeId: 'route-1',
      phaseId: 'implement',
      laneId: 'codex',
      model: 'gpt-5',
      effort: 'high',
      source: 'model',
      decisionModel: 'ollama:nimble',
      proposalConfidence: 0.8,
    });
    expect(registry.spawnFacts('route-1', 'review')?.phaseId).toBe('review');
    expect(registry.spawnFacts('route-2', 'implement')?.model).toBe('gpt-5-mini');
    expect(registry.spawnFacts('route-2', 'review')).toBeNull();
    expect(registry.spawnFacts('unknown', 'implement')).toBeNull();
  });

  it('records a decision model only for a proposal and truncates the id to 128 characters', () => {
    const registry = new RouteRecordRegistry();
    const modelId = `custom:${'x'.repeat(150)}`;
    registry.store('route', [
      chosen,
      { ...chosen, phaseId: 'review', modelProposal: null, source: 'ranking', fallbackCause: 'timeout' },
    ], modelId);

    expect(registry.spawnFacts('route', 'implement')).toMatchObject({
      decisionModel: `custom:${'x'.repeat(121)}`,
      proposalConfidence: 0.8,
    });
    expect(registry.spawnFacts('route', 'review')).toMatchObject({
      source: 'ranking',
      decisionModel: null,
      proposalConfidence: null,
    });
  });

  it('evicts the oldest inserted route as a unit, even after a lookup', () => {
    const registry = new RouteRecordRegistry();
    registry.store('route-0', [chosen, { ...chosen, phaseId: 'review' }], null);
    for (let i = 1; i < ROUTE_RECORD_CAP; i += 1) {
      registry.store(`route-${i}`, [chosen], null);
    }
    expect(registry.spawnFacts('route-0', 'implement')).not.toBeNull();

    registry.store(`route-${ROUTE_RECORD_CAP}`, [chosen], null);

    expect(registry.spawnFacts('route-0', 'implement')).toBeNull();
    expect(registry.spawnFacts('route-0', 'review')).toBeNull();
    expect(registry.spawnFacts('route-1', 'implement')).not.toBeNull();
    expect(registry.spawnFacts(`route-${ROUTE_RECORD_CAP}`, 'implement')).not.toBeNull();
  });
});
