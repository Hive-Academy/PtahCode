import { LANE_DEFAULT_MODEL, type LaneOutcomeSummary } from '@ptah-extension/shared';
import { OUTCOME_WINDOW_MS } from '../routing-constants';
import { ANY_EFFORT, deriveChoiceEvidence, type ChoiceKey } from './choice-evidence';
import { AUTOMATIC_MATRIX_MODEL, deriveLocalMatrix } from './local-derivation';
import { FAMILY_PROFILE_MODEL } from './matrix.types';
import { outcomeFiguresFrom } from './outcome-figures';
import { buildSeedMatrix } from './seed-matrix';

const NOW = Date.parse('2026-10-15T00:00:00.000Z');
const KEY: ChoiceKey = {
  family: 'z-ai',
  model: 'glm-5',
  effort: ANY_EFFORT,
  taskKind: 'implement',
};

function row(runId: string, fields: Partial<LaneOutcomeSummary> = {}): LaneOutcomeSummary {
  return {
    runId,
    laneId: 'glm',
    family: KEY.family,
    model: KEY.model,
    taskKind: KEY.taskKind,
    verdict: 'delivered',
    failureClass: null,
    finalReview: null,
    reviseRounds: 0,
    endedAt: NOW,
    durationMs: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    routingSource: 'ranking',
    ...fields,
  };
}

describe('deriveChoiceEvidence', () => {
  it('keeps own model ids and rolls native lane defaults into both model and family cells', () => {
    const evidence = deriveChoiceEvidence([
      row('own', { resolvedModel: 'other', resolvedModelProvenance: 'native', effort: 'high' }),
      row('native', {
        model: LANE_DEFAULT_MODEL,
        resolvedModel: KEY.model,
        resolvedModelProvenance: 'native',
        effort: 'high',
      }),
      row('unknown', {
        model: LANE_DEFAULT_MODEL,
        resolvedModel: 'other',
        resolvedModelProvenance: 'unknown',
        effort: 'medium',
      }),
      row('old-default', { model: LANE_DEFAULT_MODEL }),
      row('auto', { model: AUTOMATIC_MATRIX_MODEL }),
    ], NOW);
    const family = { ...KEY, model: FAMILY_PROFILE_MODEL };

    expect(evidence.cells()).toHaveLength(5);
    expect(evidence.cell(KEY)?.funnel.spawned).toBe(2);
    expect(evidence.cell({ ...KEY, effort: 'high' })?.funnel.spawned).toBe(2);
    expect(evidence.cell(family)?.funnel.spawned).toBe(4);
    expect(evidence.cell({ ...family, effort: 'high' })?.funnel.spawned).toBe(1);
    expect(evidence.cell({ ...family, effort: 'medium' })?.funnel.spawned).toBe(1);
    expect(evidence.cell({ ...KEY, model: 'other' })).toBeUndefined();
  });

  it('uses the sent effort, including a later policy step, and counts both dispositions', () => {
    const evidence = deriveChoiceEvidence([
      row('next-step', {
        requestedEffort: 'max', effort: 'high', effortDisposition: 'not-in-native-list',
      }),
      row('refused', {
        requestedEffort: 'high', effort: null, effortDisposition: 'lane-refused',
      }),
      row('unsupported-scoring-bucket', { effort: 'minimal', resolvedEffort: 'max' }),
      row('old-row'),
    ], NOW);

    expect(evidence.cell(KEY)?.funnel.spawned).toBe(4);
    expect(evidence.cell(KEY)?.effortNotSent).toBe(2);
    expect(evidence.cell({ ...KEY, effort: 'high' })?.funnel.spawned).toBe(1);
    expect(evidence.cell({ ...KEY, effort: 'high' })?.effortNotSent).toBe(1);
    expect(evidence.cell({ ...KEY, effort: 'max' })).toBeUndefined();
  });

  it('keeps the funnel stages ordered and totals only recorded measurements', () => {
    const evidence = deriveChoiceEvidence([
      row('approved', {
        finalReview: 'approved', reviseRounds: 1, durationMs: 100, inputTokens: 30,
        outputTokens: 5, costUsd: 0.25,
      }),
      row('rejected', { finalReview: 'rejected', reviseRounds: 2, durationMs: 50, costUsd: 0 }),
      row('open-revise', { reviseRounds: 2, outputTokens: 8 }),
      row('unreviewed'),
      row('unverified', { verdict: 'unverified', finalReview: 'approved', inputTokens: 0 }),
      row('missing', { verdict: 'no-deliverable' }),
      row('failed', { verdict: 'failed', failureClass: 'crash' }),
      row('quota', { verdict: 'no-deliverable', failureClass: 'usage-limit', durationMs: 0 }),
      row('auth', { verdict: 'failed', failureClass: 'auth', finalReview: 'approved' }),
      row('timeout', { verdict: 'failed', failureClass: 'timeout' }),
    ], NOW);

    expect(evidence.cell(KEY)?.funnel).toEqual({
      spawned: 10,
      completed: 7,
      delivered: 4,
      reviewed: 3,
      approved: 1,
      capacityDropped: 3,
      unverified: 1,
      noDeliverable: 1,
      failed: 1,
      rejected: 1,
      unresolvedRevise: 1,
      reviseRounds: 5,
    });
    expect(evidence.cell(KEY)?.aggregates).toEqual({
      durationMs: { total: 150, count: 3 },
      inputTokens: { total: 30, count: 2 },
      outputTokens: { total: 13, count: 2 },
      costUsd: { total: 0.25, count: 2 },
    });
  });

  it('uses the legacy seed and rates and excludes capacity from both rates', () => {
    const scoringRows = [
      row('failed', { verdict: 'failed', endedAt: NOW - 1 }),
      row('approved', { verdict: 'unverified', finalReview: 'approved', endedAt: NOW - 5 }),
      row('open-revise', { reviseRounds: 1, endedAt: NOW - 10 }),
    ];
    const evidence = deriveChoiceEvidence([
      ...scoringRows.map((summary) => ({ ...summary, effort: 'high' })),
      row('quota', { verdict: 'failed', failureClass: 'usage-limit', finalReview: 'rejected' }),
    ], NOW);
    const legacy = deriveLocalMatrix(scoringRows, NOW).profiles[0]?.cells.implement;
    expect(legacy).toEqual({
      kind: 'value', score: 75, source: 'local',
      asOf: new Date(NOW - 1).toISOString(), stale: false, sampleCount: 3,
    });
    expect(evidence.cell(KEY)?.local).toEqual(legacy);
    expect(evidence.cell({ ...KEY, effort: 'high' })?.local).toEqual(legacy);

    const withoutRates = deriveChoiceEvidence([
      row('only-capacity', { verdict: 'failed', failureClass: 'auth' }),
      row('only-unverified', { verdict: 'unverified' }),
    ], NOW);
    expect(withoutRates.cell(KEY)?.funnel.spawned).toBe(2);
    expect(withoutRates.cell(KEY)?.local).toBeUndefined();
  });

  it('excludes caller stops from scoring and counts them as unverified in the funnel', () => {
    const valid = row('finished', { verdict: 'failed', effort: 'high' });
    const evidence = deriveChoiceEvidence([
      valid,
      row('stopped-failure', { verdict: 'failed', failureClass: 'user-stop', effort: 'high' }),
      // A stop can coexist with a recorded deliverable and review.
      row('stopped-delivered', { failureClass: 'user-stop', finalReview: 'approved', effort: 'high' }),
    ], NOW);
    const validOnly = deriveChoiceEvidence([valid], NOW);
    for (const effort of [ANY_EFFORT, 'high'] as const) {
      const key = { ...KEY, effort };
      expect(evidence.cell(key)?.local).toEqual(validOnly.cell(key)?.local);
      expect(evidence.cell(key)?.funnel).toMatchObject({
        spawned: 3, completed: 3, capacityDropped: 0, unverified: 2,
        failed: 1, delivered: 0, approved: 0,
      });
    }
  });

  it('uses a matching effort seed and falls back to the model-wide seed', () => {
    const [modelSeed] = buildSeedMatrix(NOW).profiles;
    const implement = modelSeed?.cells.implement;
    if (implement?.kind !== 'value') throw new Error('expected an implementation seed');
    const evidence = deriveChoiceEvidence([
      row('high', { verdict: 'failed', effort: 'high' }),
      row('medium', { verdict: 'failed', effort: 'medium' }),
    ], NOW, [
      { ...modelSeed, effort: 'high', cells: { ...modelSeed.cells, implement: { ...implement, score: 20 } } },
      modelSeed,
    ]);

    expect(evidence.cell({ ...KEY, effort: 'high' })?.local?.score).toBe(18);
    expect(evidence.cell({ ...KEY, effort: 'medium' })?.local?.score).toBe(73);
    expect(evidence.cell(KEY)?.local?.score).toBe(67);
  });

  it('uses the model-wide seed for a task kind missing from the effort profile', () => {
    const [seed] = buildSeedMatrix(NOW).profiles;
    const implement = seed?.cells.implement;
    if (implement?.kind !== 'value') throw new Error('expected an implementation seed');
    const rows = [row('high', { verdict: 'failed', effort: 'high' })];
    const evidence = deriveChoiceEvidence(rows, NOW, [
      { ...seed, effort: 'high', cells: { ...seed.cells, implement: { kind: 'unknown' } } },
      seed,
    ]);
    expect(evidence.cell({ ...KEY, effort: 'high' })?.local?.score).toBe(73);
  });

  it('uses the same window and dedupe for cells and counts routed runs once', () => {
    const since = NOW - OUTCOME_WINDOW_MS;
    const rows = [
      row('duplicate', { endedAt: since, verdict: 'failed' }),
      row('duplicate', { endedAt: NOW - 1, effort: 'max' }),
      row('boundary', { endedAt: since, routingSource: 'pin' }),
      row('before', { endedAt: since - 1 }),
      row('bad-time', { endedAt: Number.NaN }),
      row('no-kind', { taskKind: null }),
      row('manual', { routingSource: 'not-routed' }),
      row('other-kind', { taskKind: 'plan' }),
      row('other-lane', { laneId: 'glm-alt' }),
    ];

    for (const input of [rows, [...rows].reverse()]) {
      const evidence = deriveChoiceEvidence(input, NOW);
      expect(evidence.cell(KEY)?.funnel).toMatchObject({ spawned: 4, delivered: 4, failed: 0 });
      expect(evidence.cell({ ...KEY, effort: 'max' })?.funnel.spawned).toBe(1);
      expect(evidence.routedRuns('glm', 'implement')).toBe(2);
      expect(evidence.routedRuns('glm', 'plan')).toBe(1);
      expect(evidence.routedRuns('glm-alt', 'implement')).toBe(1);
    }
  });

  it('groups deduped proposals by decision model and averages recorded confidence', () => {
    const evidence = deriveChoiceEvidence([
      row('accepted', {
        routingSource: 'model', decisionModel: 'claude:sonnet', proposalConfidence: 0.8,
        finalReview: 'approved',
      }),
      row('accepted', {
        endedAt: NOW - 10, decisionModel: 'other:model', proposalConfidence: 0.9,
      }),
      row('ranking', {
        decisionModel: 'claude:sonnet', proposalConfidence: 0, verdict: 'failed',
        failureClass: 'timeout',
      }),
      row('unknown-confidence', {
        routingSource: 'model', decisionModel: 'claude:sonnet', verdict: 'unverified',
      }),
      row('other-model', { routingSource: 'model', decisionModel: 'custom:judge' }),
      row('no-proposal', { decisionModel: null }),
    ], NOW);

    expect(evidence.decisionModels()).toEqual([
      {
        decisionModel: 'claude:sonnet',
        proposals: 3,
        accepted: 2,
        meanConfidence: 0.4,
        funnel: expect.objectContaining({ spawned: 3, capacityDropped: 1, approved: 1 }),
      },
      {
        decisionModel: 'custom:judge',
        proposals: 1,
        accepted: 1,
        meanConfidence: null,
        funnel: expect.objectContaining({ spawned: 1 }),
      },
    ]);
  });

  it('returns empty evidence and zero routed runs for an empty window', () => {
    const evidence = deriveChoiceEvidence([], NOW);
    expect(evidence.cells()).toEqual([]);
    expect(evidence.cell(KEY)).toBeUndefined();
    expect(evidence.routedRuns('glm', 'implement')).toBe(0);
    expect(evidence.decisionModels()).toEqual([]);
    expect(() => deriveChoiceEvidence([], Number.NaN)).toThrow('nowMs must be a finite epoch millisecond');
  });
});

describe('model and effort outcome figures', () => {
  it('groups verified results by effective model and sent effort only when enabled', () => {
    const rows = [
      row('high', { requestedEffort: 'max', effort: 'high' }),
      row('high-failed', {
        model: LANE_DEFAULT_MODEL, resolvedModel: KEY.model, resolvedModelProvenance: 'native',
        effort: 'high', verdict: 'failed',
      }),
      row('different-model', { model: 'other', effort: 'high' }),
      row('not-sent', { requestedEffort: 'high', verdict: 'no-deliverable' }),
      row('capacity', { effort: 'high', verdict: 'no-deliverable', failureClass: 'auth' }),
    ];
    const byChoice = outcomeFiguresFrom(rows, { byModelEffort: true });
    expect(byChoice('glm', 'implement', KEY.model, 'high')).toEqual({
      laneId: 'glm', taskKind: 'implement', model: KEY.model, effort: 'high',
      delivered: 1, failed: 1,
    });
    // The '*' bucket holds every run of the model, whatever effort it sent.
    const anyEffort = {
      laneId: 'glm', taskKind: 'implement', model: KEY.model, effort: '*',
      delivered: 1, failed: 2,
    };
    expect(byChoice('glm', 'implement', KEY.model)).toEqual(anyEffort);
    expect(byChoice('glm', 'implement', 'other', 'high')?.delivered).toBe(1);
    // An effort with no runs of its own falls back to the model's '*' bucket.
    expect(byChoice('glm', 'implement', KEY.model, 'max')).toEqual(anyEffort);
    expect(byChoice('glm', 'implement', 'unknown-model', 'high')).toBeNull();
    expect(outcomeFiguresFrom(rows, { byModelEffort: false })('glm', 'implement')).toEqual({
      laneId: 'glm', taskKind: 'implement', delivered: 2, failed: 3,
    });
  });
});
