import {
  LANE_DEFAULT_MODEL,
  OUTCOME_TASK_KINDS,
  type CliDetectionResult,
  type LaneOutcomeSummary,
} from '@ptah-extension/shared';
import type { LaneCatalogEntry, LaneCatalogModel } from '../catalog/lane-catalog.types';
import { OUTCOME_WINDOW_DAYS, OUTCOME_WINDOW_MS } from '../routing-constants';
import { RoutingEvidenceService } from './routing-evidence.service';

const NOW = Date.parse('2026-10-15T00:00:00.000Z');
const ROW: CliDetectionResult = {
  cli: 'ptah-cli',
  ptahCliId: 'glm',
  providerId: 'z-ai',
  installed: true,
  messagingMode: 'none',
};

const native: LaneCatalogModel = {
  id: 'glm-5',
  provenance: 'reported',
  efforts: { provenance: 'native', supported: ['high', 'minimal'], default: 'high' },
};
const fallback: LaneCatalogModel = {
  id: 'new-model',
  provenance: 'fallback',
  efforts: { provenance: 'ptah-fallback', supported: ['high'], default: null },
};

function outcome(runId: string, fields: Partial<LaneOutcomeSummary> = {}): LaneOutcomeSummary {
  return {
    runId,
    laneId: 'glm',
    family: 'z-ai',
    model: 'glm-5',
    taskKind: 'implement',
    verdict: 'delivered',
    failureClass: null,
    finalReview: null,
    reviseRounds: 0,
    endedAt: NOW - 1,
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    routingSource: 'ranking',
    ...fields,
  };
}

function setup(summaries: readonly LaneOutcomeSummary[] = [], entry?: LaneCatalogEntry) {
  const catalog = { get: jest.fn(() => entry), refreshIfDue: jest.fn() };
  const outcomeReader = {
    recentWorkspaceOutcomes: jest.fn(async () => summaries),
    recentOutcomes: jest.fn(async () => []),
    isPersistent: jest.fn(() => true),
  };
  const performanceRouting = { isEnabled: jest.fn(() => false) };
  const service = new RoutingEvidenceService({
    catalog,
    outcomeReader,
    performanceRouting,
    now: () => NOW,
  });
  return { service, catalog, outcomeReader, performanceRouting };
}

describe('RoutingEvidenceService', () => {
  it('reads the current snapshot and schedules a background refresh even with performance routing off', async () => {
    const snapshot: LaneCatalogEntry = {
      laneId: 'glm',
      status: 'timeout',
      fetchedAt: NOW - 60_000,
      lastOkAt: NOW - 700_000,
      models: [native, fallback],
    };
    const { service, catalog, outcomeReader, performanceRouting } = setup([], snapshot);
    catalog.refreshIfDue.mockImplementation(() => {
      catalog.get.mockReturnValue({ ...snapshot, status: 'ok', fetchedAt: NOW, lastOkAt: NOW });
    });

    const result = await service.read([ROW]);

    expect(catalog.get).toHaveBeenCalledWith('glm');
    expect(catalog.refreshIfDue).toHaveBeenCalledWith(ROW, NOW);
    expect(outcomeReader.recentWorkspaceOutcomes).toHaveBeenCalledWith({ sinceMs: NOW - OUTCOME_WINDOW_MS });
    expect(outcomeReader.recentOutcomes).not.toHaveBeenCalled();
    expect(performanceRouting.isEnabled).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      windowDays: OUTCOME_WINDOW_DAYS,
      performanceRouting: false,
      decisionModels: [],
      lanes: [{
        laneId: 'glm',
        family: 'z-ai',
        catalog: { status: 'timeout', fetchedAt: NOW - 60_000, lastOkAt: NOW - 700_000, modelCount: 2 },
      }],
    });
    const [nativeView, fallbackView] = result.lanes[0].models;
    expect(nativeView).toMatchObject({ model: 'glm-5', inCatalog: true, efforts: native.efforts });
    expect(nativeView.keys).toHaveLength(OUTCOME_TASK_KINDS.length * 2);
    expect(nativeView.keys.find(({ taskKind, effort }) => taskKind === 'implement' && effort === 'high'))
      .toMatchObject({ score: null, sampleCount: 0 });
    expect(fallbackView).toMatchObject({ model: 'new-model', inCatalog: true, efforts: fallback.efforts });
    expect(fallbackView.keys).toHaveLength(OUTCOME_TASK_KINDS.length);
    expect(fallbackView.keys.find(({ taskKind }) => taskKind === 'implement')).toMatchObject({
      effort: '*',
      funnel: { spawned: 0, completed: 0, delivered: 0, reviewed: 0, approved: 0 },
      effortNotSent: 0,
      durationMs: { total: 0, count: 0 },
      inputTokens: { total: 0, count: 0 },
      outputTokens: { total: 0, count: 0 },
      costUsd: { total: 0, count: 0 },
      score: null,
      sampleCount: 0,
      asOf: null,
      stale: false,
    });
  });

  it('shows the ranking evidence, older models and decision-model figures', async () => {
    const { service, performanceRouting } = setup([
      outcome('accepted', {
        model: LANE_DEFAULT_MODEL,
        resolvedModel: 'glm-5',
        resolvedModelProvenance: 'native',
        routingSource: 'model',
        decisionModel: 'planner',
        proposalConfidence: 0.75,
        effort: 'high',
        finalReview: 'approved',
        durationMs: 100,
        inputTokens: 30,
        outputTokens: 5,
        costUsd: 0.25,
      }),
      outcome('declined', {
        model: 'retired-model',
        verdict: 'failed',
        failureClass: 'usage-limit',
        requestedEffort: 'high',
        effortDisposition: 'lane-refused',
        decisionModel: 'planner',
        proposalConfidence: 0.25,
      }),
      outcome('outside-window', { endedAt: NOW - OUTCOME_WINDOW_MS - 1, model: 'old-model' }),
    ], {
      laneId: 'glm',
      status: 'ok',
      fetchedAt: NOW,
      lastOkAt: NOW,
      models: [native],
    });
    performanceRouting.isEnabled.mockReturnValue(true);

    const result = await service.read([ROW]);

    expect(result.performanceRouting).toBe(true);
    const { models } = result.lanes[0];
    expect(models.map(({ model, inCatalog }) => [model, inCatalog])).toEqual([
      ['glm-5', true],
      ['*', false],
      ['retired-model', false],
    ]);
    const measured = models[0].keys.find(({ taskKind, effort }) => taskKind === 'implement' && effort === 'high');
    expect(measured).toMatchObject({
      score: expect.any(Number),
      sampleCount: 1,
      asOf: new Date(NOW - 1).toISOString(),
      stale: false,
      funnel: { spawned: 1, completed: 1, delivered: 1, reviewed: 1, approved: 1 },
      durationMs: { total: 100, count: 1 },
      inputTokens: { total: 30, count: 1 },
      outputTokens: { total: 5, count: 1 },
      costUsd: { total: 0.25, count: 1 },
    });
    expect(models[2]).toMatchObject({
      efforts: { provenance: 'unknown' },
      keys: [{
        taskKind: 'implement',
        effort: '*',
        score: null,
        sampleCount: 0,
        effortNotSent: 1,
        funnel: { spawned: 1, completed: 0, capacityDropped: 1 },
      }],
    });
    expect(result.decisionModels).toMatchObject([{
      decisionModel: 'planner',
      proposals: 2,
      accepted: 1,
      meanConfidence: 0.5,
      funnel: { spawned: 2, completed: 1, approved: 1, capacityDropped: 1 },
    }]);
  });

  it('reports lanes that have no snapshot and refreshes each available lane once', async () => {
    const { service, catalog } = setup();
    const disabled: CliDetectionResult = { cli: 'codex', installed: true, disabled: true, messagingMode: 'none' };
    const unavailable: CliDetectionResult = { cli: 'claude', installed: false, messagingMode: 'none' };

    const result = await service.read([ROW, { ...ROW }, disabled, unavailable]);

    expect(result.lanes).toHaveLength(3);
    for (const lane of result.lanes) {
      expect(lane.catalog).toEqual({ status: 'never', fetchedAt: null, lastOkAt: null, modelCount: 0 });
      expect(lane.models).toEqual([]);
    }
    expect(catalog.refreshIfDue).toHaveBeenCalledTimes(1);
    expect(catalog.refreshIfDue).toHaveBeenCalledWith(ROW, NOW);
  });

  it('rejects when the workspace outcome store is unavailable', async () => {
    const { service, outcomeReader } = setup();
    outcomeReader.isPersistent.mockReturnValue(false);

    await expect(service.read([ROW])).rejects.toThrow('requires a readable workspace outcome store');
    expect(outcomeReader.recentWorkspaceOutcomes).not.toHaveBeenCalled();
  });
});
