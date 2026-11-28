import type {
  AgentGetCapabilityMatrixResult,
  AgentGetRoutingEvidenceResult,
  AgentRoutingEvidenceKey,
} from '@ptah-extension/shared';

const asOf = new Date().toISOString();
const measuredFunnel = {
  spawned: 12,
  completed: 11,
  delivered: 8,
  reviewed: 7,
  approved: 5,
  capacityDropped: 1,
  unverified: 1,
  noDeliverable: 1,
  failed: 1,
  rejected: 1,
  unresolvedRevise: 1,
  reviseRounds: 3,
};
const efforts = {
  provenance: 'native',
  supported: ['medium', 'high'],
  default: 'medium',
} as const;

function sample(
  taskKind: AgentRoutingEvidenceKey['taskKind'],
  effort: string,
  score: number,
  repeats = 1,
): AgentRoutingEvidenceKey {
  const funnel = { ...measuredFunnel };
  for (const field of Object.keys(funnel) as (keyof typeof funnel)[]) {
    funnel[field] *= repeats;
  }
  return {
    taskKind,
    effort,
    funnel,
    effortNotSent: effort === '*' ? 1 : 0,
    durationMs: { total: 500_000, count: 10 },
    inputTokens: { total: 100_000, count: 10 },
    outputTokens: { total: 12_000, count: 10 },
    costUsd: { total: 0, count: 0 },
    sampleCount: 6 * repeats,
    score,
    asOf,
    stale: false,
  };
}

const catalogReady = {
  status: 'ok',
  fetchedAt: Date.parse(asOf),
  lastOkAt: Date.parse(asOf),
  modelCount: 1,
} as const;

const evidence: AgentGetRoutingEvidenceResult = {
  windowDays: 30,
  performanceRouting: true,
  lanes: [
    {
      laneId: 'codex',
      family: 'codex',
      catalog: catalogReady,
      models: [{
        model: 'gpt-5.5-codex',
        inCatalog: true,
        efforts,
        keys: [
          sample('implement', '*', 86, 2),
          sample('implement', 'high', 86),
          sample('implement', 'medium', 82),
          sample('tests', 'medium', 80),
        ],
      }],
    },
    {
      laneId: 'claude',
      family: 'claude',
      catalog: catalogReady,
      models: [{
        model: 'claude-sonnet-4-6',
        inCatalog: true,
        efforts,
        keys: [
          sample('implement', 'high', 81),
          sample('review', 'high', 88),
          sample('plan', 'medium', 85),
        ],
      }],
    },
  ],
  laneFunnels: ['codex', 'claude'].map((laneId) => ({
    laneId, family: laneId, funnel: sample('implement', '*', 0, 3).funnel,
  })),
  decisionModels: [],
};

const ratings: AgentGetCapabilityMatrixResult = {
  profiles: [{
    family: 'codex',
    model: 'gpt-5.5-codex',
    cells: {
      implement: {
        kind: 'value',
        score: 91,
        source: 'local',
        sourceRef: 'settings-harness',
        asOf,
        stale: false,
        sampleCount: 20,
      },
      plan: { kind: 'unknown' },
      review: { kind: 'unknown' },
      research: { kind: 'unknown' },
      tests: { kind: 'unknown' },
      docs: { kind: 'unknown' },
    },
  }],
  lastPicks: [{ key: 'implement|implement', candidateId: 'codex' }],
};

export const decisionMatrixFixtures = {
  'agent:getRoutingEvidence': evidence,
  'agent:getCapabilityMatrix': ratings,
};
