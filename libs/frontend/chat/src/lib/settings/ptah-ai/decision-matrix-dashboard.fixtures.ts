import type {
  AgentCapabilityMatrixValueCell,
  AgentGetCapabilityMatrixResult,
  AgentGetRoutingEvidenceResult,
  AgentRoutingEvidenceKey,
  AgentRoutingEvidenceLane,
  AgentRoutingFunnel,
} from '@ptah-extension/shared';

export const funnel: AgentRoutingFunnel = {
  spawned: 10, completed: 9, delivered: 7, reviewed: 6, approved: 4,
  capacityDropped: 1, failed: 1, noDeliverable: 1, rejected: 1,
  unverified: 0, unresolvedRevise: 1, reviseRounds: 3,
};
const aggregate = { total: 0, count: 0 };
export const evidenceKey: AgentRoutingEvidenceKey = {
  taskKind: 'implement', effort: '*', funnel, effortNotSent: 3,
  durationMs: aggregate, inputTokens: aggregate, outputTokens: aggregate, costUsd: aggregate,
  score: 80, sampleCount: 6, asOf: '2026-11-01', stale: true,
};
export function evidenceLane(
  laneId: string,
  keys: readonly AgentRoutingEvidenceKey[],
): AgentRoutingEvidenceLane {
  return {
    laneId, family: laneId,
    catalog: { status: 'ok', fetchedAt: 1, lastOkAt: 1, modelCount: 1 },
    models: [{
      model: 'model-a', inCatalog: true, efforts: { provenance: 'native', supported: ['high'], default: 'high' }, keys,
    }],
  };
}
export const evidence: AgentGetRoutingEvidenceResult = {
  windowDays: 30, performanceRouting: true,
  laneFunnels: ['alpha', 'beta'].map((laneId) => ({ laneId, family: laneId, funnel })),
  decisionModels: [{ decisionModel: 'planner', proposals: 10, accepted: 4, meanConfidence: 0.8, funnel }],
  lanes: [
    evidenceLane('alpha', [
      evidenceKey,
      { ...evidenceKey, effort: 'high', funnel: { ...funnel, spawned: 7 } },
    ]),
    evidenceLane('beta', [{ ...evidenceKey, score: 75, stale: false }]),
  ],
};
const unknown = { kind: 'unknown' } as const;
const rating: AgentCapabilityMatrixValueCell = {
  kind: 'value', score: 72, source: 'seed', sourceRef: 'benchmark-v2',
  asOf: '2026-11-10', stale: true, sampleCount: null, note: 'Catalog benchmark',
};
export const ratings: AgentGetCapabilityMatrixResult = {
  profiles: [{
    family: 'alpha', model: 'model-a',
    cells: { implement: rating, plan: unknown, review: unknown, tests: unknown, docs: unknown, research: unknown },
  }],
};
