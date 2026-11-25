import { createMockWorkspaceProvider } from '@ptah-extension/platform-core/testing';
import {
  type CliDetectionResult,
  type EffortSupport,
  type LaneOutcomeSummary,
} from '@ptah-extension/shared';

import type { LaneCatalogEntry, LaneCatalogModel } from '../catalog/lane-catalog.types';
import { GateResultSchema, type GateResult } from '../contracts/route-decide-result.schema';
import type { LaneModelEntry } from '../lane-model-listing.port';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { deriveChoiceEvidence } from '../matrix/choice-evidence';
import { FAMILY_PROFILE_MODEL } from '../matrix/matrix.types';
import { EMPTY_OUTCOME_FIGURES } from '../matrix/outcome-figures';
import { emptyRotationState } from '../ranking/rotation.store';
import type { RouteCandidateSource } from '../route-candidate-source.port';
import { PerformanceRoutingSetting } from '../scope/performance-routing-setting';
import { assembleGateResult } from './assemble-gate';
import { gatherRouteCall, type RouteMatrix } from './gather';
import { planRoutePhases, type GateArgs, type RoutingRulesInput } from './phase-plan';
import { resolvePhase } from './phase-resolve';
import { emptyTally } from './preflight-answer';

const NOW = 1_790_000_000_000;
const ROUTE_ID = 'route-choice-test';
const CODEX: CliDetectionResult = { cli: 'codex', installed: true, messagingMode: 'none' };
const ARGS: GateArgs = {
  stage: 'gate-0.1',
  request: 'ship the change',
  taskType: 'FEATURE',
  depth: 'Full',
  phases: [{ id: 'implement', kind: 'implement', role: 'backend-developer' }],
};

const UNKNOWN: EffortSupport = { provenance: 'unknown' };
const BASELINE: LaneCatalogModel = { id: 'baseline', provenance: 'configured', efforts: UNKNOWN };
const CANDIDATE: LaneCatalogModel = {
  id: 'candidate',
  provenance: 'reported',
  efforts: { provenance: 'native', supported: ['high'], default: null },
};

function testLogger(): LaneRoutingLogger {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function snapshot(
  models: readonly LaneCatalogModel[],
  overrides: Partial<LaneCatalogEntry> = {},
): LaneCatalogEntry {
  return { laneId: 'codex', models, status: 'ok', lastOkAt: NOW, fetchedAt: NOW, ...overrides };
}

function catalogWith(
  entry: LaneCatalogEntry | undefined,
  refresh: () => Promise<LaneCatalogEntry> = async () => snapshot([BASELINE]),
) {
  return {
    get: jest.fn(() => entry),
    refreshIfDue: jest.fn(),
    refresh: jest.fn(refresh),
  };
}

function runs(count: number, fields: Partial<LaneOutcomeSummary> = {}): LaneOutcomeSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    laneId: 'codex',
    family: 'codex',
    taskKind: 'implement',
    model: CANDIDATE.id,
    effort: 'high',
    verdict: 'delivered',
    finalReview: null,
    failureClass: null,
    reviseRounds: 0,
    endedAt: NOW,
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    routingSource: 'not-routed',
    ...fields,
    runId: JSON.stringify([fields.model, fields.effort, index]),
  }));
}

async function runRoute({
  args = ARGS,
  choice = false,
  rows = [],
  entries = [BASELINE],
  catalog,
  routingRules,
  listingBudgetMs = 1_000,
}: {
  args?: GateArgs;
  choice?: boolean;
  rows?: readonly LaneOutcomeSummary[];
  entries?: readonly LaneModelEntry[];
  catalog?: Parameters<typeof gatherRouteCall>[0]['catalog'];
  routingRules?: RoutingRulesInput;
  listingBudgetMs?: number;
} = {}) {
  const source: RouteCandidateSource = {
    rows: async () => [CODEX],
    limits: async () => new Map([['codex', 'confirmed-room']]),
    roles: async () => [],
  };
  const list = jest.fn(async () => entries);
  const load = jest.fn<ReturnType<RouteMatrix['load']>, Parameters<RouteMatrix['load']>>(async (input) => ({
    reasons: [],
    outcomeFigures: EMPTY_OUTCOME_FIGURES,
    ...(input.choice === true ? { evidence: deriveChoiceEvidence(rows, NOW) } : {}),
    resolve: (family, model, taskKind) => ({
      family,
      model,
      taskKind,
      profileModel: FAMILY_PROFILE_MODEL,
      cell: { kind: 'unknown' },
      score: 50,
      noProfile: true,
    }),
  }));
  const gathered = await gatherRouteCall({
    choice,
    catalog,
    source,
    listing: { list },
    matrix: { load },
    rotation: {
      load: () => ({ state: emptyRotationState(), reason: null }),
      save: async () => ({ persisted: true }),
    },
    logger: testLogger(),
    nowMs: NOW,
    listingBudgetMs,
  });
  const { plans } = planRoutePhases(
    args.phases, args, gathered, gathered.rotation, false, [], () => undefined,
    false, undefined, routingRules,
  );
  const chosen = new Map(plans.map((plan) => [
    plan.phaseId,
    resolvePhase(plan, { mode: 'ranking', blockedCause: null, limited: new Set(), outcome: null }),
  ]));
  const result = assembleGateResult(
    args, gathered, new Map(plans.map((plan) => [plan.phaseId, plan])), chosen,
    ['codex'], emptyTally(), [], ROUTE_ID,
  );
  expect(GateResultSchema.safeParse(result).success).toBe(true);
  return { result, gathered, list, load };
}

function chosenEntry(result: GateResult) {
  const entry = result.roster[0];
  if (entry?.status !== 'chosen') throw new Error('expected a chosen route');
  return entry;
}

describe('route choice', () => {
  it('adds only the effort check and its reason clause to the off-mode route', async () => {
    const legacy = await runRoute({ entries: [{ id: BASELINE.id, provenance: 'configured' }] });
    const { result, list, load } = await runRoute({
      entries: [{ ...BASELINE, efforts: CANDIDATE.efforts }],
    });
    expect(list).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[0]).not.toHaveProperty('choice');

    const { effortCheck, ...entry } = chosenEntry(result);
    const clause = '; effort medium not in codex native list; spawn sends no effort at this step';
    expect(effortCheck).toEqual({
      requested: 'medium',
      provenance: 'native',
      supported: ['high'],
      inList: false,
      expected: 'not-in-native-list',
    });
    expect(entry.reason).toContain(clause);
    const withoutEffortCheck = {
      ...result,
      roster: [{ ...entry, reason: entry.reason.replace(clause, '') }],
    };
    expect(JSON.stringify(withoutEffortCheck)).toBe(JSON.stringify(legacy.result));
  });

  it('uses a stale catalog snapshot immediately and emits the selected model-effort pair', async () => {
    const catalog = catalogWith(snapshot([BASELINE, CANDIDATE], {
      lastOkAt: NOW - 2_500, status: 'error',
    }));
    const rows = [...runs(40), ...runs(10, { effort: 'medium', verdict: 'failed' })];
    const { result, list, load } = await runRoute({ choice: true, catalog, rows });
    expect(catalog.get).toHaveBeenCalledWith('codex');
    expect(catalog.refreshIfDue).toHaveBeenCalledWith(CODEX, NOW);
    expect(catalog.refresh).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ choice: true }));
    expect(result.routeId).toBe(ROUTE_ID);
    expect(result.reasons).toContain('catalog for codex is 2500ms old (error)');

    const entry = chosenEntry(result);
    expect(entry).toMatchObject({
      model: 'candidate',
      effort: 'high',
      provenance: 'reported',
      score: 90,
      effortCheck: {
        requested: 'high', provenance: 'native', supported: ['high'],
        inList: true, expected: 'native-match',
      },
    });
    expect(entry.reason).toContain('model candidate effort high (pair, 40 samples)');
  });

  it('waits for the first catalog read of a never-read lane', async () => {
    const catalog = catalogWith(snapshot([], { status: 'never', fetchedAt: null, lastOkAt: null }));
    const { result, list } = await runRoute({ choice: true, catalog });
    expect(catalog.refresh).toHaveBeenCalledWith(CODEX, NOW);
    expect(list).not.toHaveBeenCalled();
    expect(chosenEntry(result).model).toBe(BASELINE.id);
  });

  it('keeps a never-read lane eligible when the first catalog read times out', async () => {
    const catalog = catalogWith(undefined, () => new Promise(() => undefined));
    const { result, list } = await runRoute({ choice: true, catalog, listingBudgetMs: 10 });
    expect(catalog.refresh).toHaveBeenCalledWith(CODEX, NOW);
    expect(list).not.toHaveBeenCalled();
    expect(result.reasons).toContain('models unknown for codex (timeout)');
    expect(chosenEntry(result).model).toBe('lane-default');
  });

  it('keeps the listing path with choice enabled and no catalog', async () => {
    const { result, gathered, list, load } = await runRoute({ choice: true });
    expect(list).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ choice: true }));
    expect(gathered.models.get('codex')?.status).toBe('ok');
    expect(chosenEntry(result).model).toBe(BASELINE.id);
  });

  it.each([
    {
      efforts: { provenance: 'ptah-fallback', supported: ['medium', 'high'], default: null },
      supported: ['medium', 'high'],
      inList: true,
    },
    { efforts: UNKNOWN, supported: null, inList: null },
  ] satisfies readonly { efforts: EffortSupport; supported: string[] | null; inList: boolean | null }[])(
    'reports $efforts.provenance effort support without selecting a non-native effort',
    async ({ efforts, supported, inList }) => {
      const catalog = catalogWith(snapshot([{ ...BASELINE, efforts }]));
      const { result } = await runRoute({
        choice: true, catalog, rows: runs(40, { model: BASELINE.id }),
      });
      expect(chosenEntry(result)).toMatchObject({
        effort: 'medium',
        effortCheck: {
          requested: 'medium', provenance: efforts.provenance, supported, inList,
          expected: 'fallback-allowlist',
        },
      });
    },
  );

  it('keeps a rule-fixed effort even when a different effort has pair evidence', async () => {
    const { result } = await runRoute({
      choice: true,
      entries: [BASELINE, CANDIDATE],
      rows: runs(40),
      routingRules: { rules: [{
        id: 'low-effort', match: { kind: 'implement' }, set: { effort: 'low' },
      }] },
    });
    expect(chosenEntry(result).effort).toBe('low');
  });

  it('keeps the phase effort and scores the exact pinned model', async () => {
    const { result } = await runRoute({
      args: { ...ARGS, pins: [{ phaseId: 'implement', executor: 'codex', model: CANDIDATE.id }] },
      choice: true,
      entries: [BASELINE, CANDIDATE],
      rows: runs(40),
    });
    expect(chosenEntry(result)).toMatchObject({
      source: 'pin', model: CANDIDATE.id, provenance: 'reported', effort: 'medium',
      effortCheck: { inList: false, expected: 'not-in-native-list' },
    });
  });

  it('explores on the fifth routed run unless a user rule matches the phase', async () => {
    const input = {
      choice: true,
      entries: [BASELINE, CANDIDATE],
      rows: runs(4, { model: BASELINE.id, effort: 'medium', routingSource: 'ranking' }),
    };
    const exploring = await runRoute(input);
    expect(chosenEntry(exploring.result).reason).toContain('explore candidate/medium: 0/3 samples');

    const withRule = await runRoute({
      ...input,
      routingRules: { rules: [{
        id: 'prefer-codex', match: { kind: 'implement' }, set: { prefer: ['codex'] },
      }] },
    });
    expect(chosenEntry(withRule.result).model).toBe(BASELINE.id);
  });
});

describe('PerformanceRoutingSetting', () => {
  it.each([false, true, undefined, 'false', 0, null])(
    'disables performance routing only for an explicit false (%p)',
    (value) => {
      const workspace = createMockWorkspaceProvider({
        config: { 'ptah.agentOrchestration.performanceRouting': value },
      });
      const logger = testLogger();
      expect(new PerformanceRoutingSetting(workspace, logger).isEnabled()).toBe(value !== false);
      expect(workspace.getConfiguration).toHaveBeenCalledWith('ptah', 'agentOrchestration.performanceRouting');
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  it('keeps the default enabled and warns once across failed reads', () => {
    const workspace = createMockWorkspaceProvider();
    workspace.getConfiguration.mockImplementation(() => { throw new Error('unavailable'); });
    const logger = testLogger();
    const setting = new PerformanceRoutingSetting(workspace, logger);

    expect(setting.isEnabled()).toBe(true);
    expect(setting.isEnabled()).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
