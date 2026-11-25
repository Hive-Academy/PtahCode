import {
  LANE_DEFAULT_MODEL,
  SUBAGENT_LANE_ID,
  type LaneOutcomeSummary,
} from '@ptah-extension/shared';
import { ANY_EFFORT } from './choice-evidence';
import { AUTOMATIC_MATRIX_MODEL } from './local-derivation';
import { FAMILY_PROFILE_MODEL } from './matrix.types';
import { EMPTY_OUTCOME_FIGURES, outcomeFiguresFrom } from './outcome-figures';

function summary(
  runId: string,
  verdict: LaneOutcomeSummary['verdict'],
  overrides: Partial<LaneOutcomeSummary> = {},
): LaneOutcomeSummary {
  return {
    runId,
    laneId: 'codex',
    family: 'openai',
    model: 'gpt-5',
    taskKind: 'implement',
    verdict,
    failureClass: null,
    finalReview: null,
    reviseRounds: 0,
    durationMs: null,
    endedAt: 1000,
    routingSource: 'ranking',
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    ...overrides,
  };
}

describe('outcomeFiguresFrom', () => {
  it('dedupes runs using the newest summary before counting', () => {
    const lookup = outcomeFiguresFrom([
      summary('same', 'failed', { endedAt: 1000 }),
      summary('same', 'delivered', { endedAt: 2000 }),
      summary('other', 'no-deliverable'),
    ]);
    expect(lookup('codex', 'implement')).toEqual({
      laneId: 'codex', taskKind: 'implement', delivered: 1, failed: 1,
    });
  });

  it('skips subagents, blank lanes and null task kinds', () => {
    const lookup = outcomeFiguresFrom([
      summary('subagent', 'delivered', { laneId: SUBAGENT_LANE_ID }),
      summary('blank', 'failed', { laneId: '  ' }),
      summary('null', 'delivered', { taskKind: null }),
    ]);
    expect(lookup(SUBAGENT_LANE_ID, 'implement')).toBeNull();
    expect(lookup('  ', 'implement')).toBeNull();
    expect(lookup('codex', 'implement')).toBeNull();
  });

  it('counts failed and no-deliverable, and ignores unverified', () => {
    const lookup = outcomeFiguresFrom([
      summary('failed', 'failed'),
      summary('missing', 'no-deliverable'),
      summary('unverified', 'unverified'),
    ]);
    expect(lookup('codex', 'implement')).toEqual({
      laneId: 'codex', taskKind: 'implement', delivered: 0, failed: 2,
    });
    expect(outcomeFiguresFrom([summary('only', 'unverified')])('codex', 'implement')).toBeNull();
  });

  it('excludes capacity failures from model quality figures', () => {
    const lookup = outcomeFiguresFrom([
      summary('delivered', 'delivered'),
      summary('quota', 'failed', { failureClass: 'usage-limit' }),
      summary('auth', 'failed', { failureClass: 'auth' }),
      summary('timeout', 'failed', { failureClass: 'timeout' }),
      summary('crash', 'failed', { failureClass: 'crash' }),
    ]);
    expect(lookup('codex', 'implement')).toEqual({
      laneId: 'codex', taskKind: 'implement', delivered: 1, failed: 1,
    });
  });

  it('leaves a caller stop (user-stop) out of the figures', () => {
    const lookup = outcomeFiguresFrom([
      summary('delivered', 'delivered'),
      summary('stopped', 'failed', { failureClass: 'user-stop' }),
    ]);
    expect(lookup('codex', 'implement')).toEqual({
      laneId: 'codex', taskKind: 'implement', delivered: 1, failed: 0,
    });
    expect(outcomeFiguresFrom([summary('only', 'failed', { failureClass: 'user-stop' })])('codex', 'implement'))
      .toBeNull();
  });

  it('keeps lane and task-kind pairs separate', () => {
    const lookup = outcomeFiguresFrom([
      summary('a', 'delivered'),
      summary('b', 'failed', { laneId: 'glm' }),
      summary('c', 'delivered', { taskKind: 'review' }),
    ]);
    expect(lookup('codex', 'implement')?.delivered).toBe(1);
    expect(lookup('glm', 'implement')?.failed).toBe(1);
    expect(lookup('codex', 'review')?.delivered).toBe(1);
    expect(lookup('glm', 'review')).toBeNull();
  });

  it('returns null for empty figures', () => {
    expect(outcomeFiguresFrom([])('codex', 'implement')).toBeNull();
    expect(EMPTY_OUTCOME_FIGURES('codex', 'implement')).toBeNull();
  });

  it('exposes only the lane, task kind and two counts', () => {
    const lookup = outcomeFiguresFrom([
      summary('private-run', 'delivered', { family: 'private-family' }),
    ]);
    expect(Object.keys(lookup('codex', 'implement') ?? {}).sort()).toEqual([
      'delivered', 'failed', 'laneId', 'taskKind',
    ]);
    expect(JSON.stringify(lookup('codex', 'implement'))).not.toContain('private');
  });

  it('groups figures by explicit model and sent effort when byModelEffort is true', () => {
    const lookup = outcomeFiguresFrom([
      summary('r1', 'delivered', { model: 'gpt-5', effort: 'high' }),
      summary('r2', 'delivered', { model: 'gpt-5', requestedEffort: 'max', effort: 'high' }),
      summary('r3', 'failed', { model: 'gpt-5', effort: 'high' }),
      summary('r4', 'delivered', { model: 'gpt-5', effort: 'medium' }),
      summary('r5', 'no-deliverable', { model: 'gpt-5.2', effort: 'high' }),
    ], { byModelEffort: true });

    expect(lookup('codex', 'implement', 'gpt-5', 'high')).toEqual({
      laneId: 'codex',
      taskKind: 'implement',
      model: 'gpt-5',
      effort: 'high',
      delivered: 2,
      failed: 1,
    });
    expect(lookup('codex', 'implement', 'gpt-5', 'medium')).toEqual({
      laneId: 'codex',
      taskKind: 'implement',
      model: 'gpt-5',
      effort: 'medium',
      delivered: 1,
      failed: 0,
    });
    expect(lookup('codex', 'implement', 'gpt-5.2', 'high')).toEqual({
      laneId: 'codex',
      taskKind: 'implement',
      model: 'gpt-5.2',
      effort: 'high',
      delivered: 0,
      failed: 1,
    });
    expect(lookup('codex', 'implement', 'gpt-5', 'max')).toBeNull();
    expect(lookup('codex', 'implement', 'gpt-5', 'low')).toBeNull();
    expect(lookup('codex', 'implement')).toBeNull();
    expect(Object.keys(lookup('codex', 'implement', 'gpt-5', 'high') ?? {}).sort()).toEqual([
      'delivered', 'effort', 'failed', 'laneId', 'model', 'taskKind',
    ]);
  });

  it('defaults effort to "*" for runs whose effort was not sent when byModelEffort is true', () => {
    const lookup = outcomeFiguresFrom([
      summary('omitted', 'delivered'),
      summary('refused', 'failed', {
        requestedEffort: 'high',
        effort: null,
        effortDisposition: 'lane-refused',
      }),
      summary('unknown-bucket', 'no-deliverable', { effort: 'minimal' }),
      summary('sent-high', 'delivered', { effort: 'high' }),
    ], { byModelEffort: true });

    const expectedAnyEffort = {
      laneId: 'codex',
      taskKind: 'implement',
      model: 'gpt-5',
      effort: ANY_EFFORT,
      delivered: 1,
      failed: 2,
    };
    expect(lookup('codex', 'implement', 'gpt-5')).toEqual(expectedAnyEffort);
    expect(lookup('codex', 'implement', 'gpt-5', ANY_EFFORT)).toEqual(expectedAnyEffort);
    expect(lookup('codex', 'implement', 'gpt-5', 'high')).toEqual({
      laneId: 'codex',
      taskKind: 'implement',
      model: 'gpt-5',
      effort: 'high',
      delivered: 1,
      failed: 0,
    });
  });

  it('resolves effective model via choiceModelOf when byModelEffort is true', () => {
    const lookup = outcomeFiguresFrom([
      summary('explicit', 'delivered', {
        model: 'gpt-5',
        resolvedModel: 'other',
        resolvedModelProvenance: 'native',
        effort: 'high',
      }),
      summary('native-default', 'failed', {
        model: LANE_DEFAULT_MODEL,
        resolvedModel: 'gpt-5',
        resolvedModelProvenance: 'native',
        effort: 'high',
      }),
      summary('unknown-default', 'delivered', {
        model: LANE_DEFAULT_MODEL,
        resolvedModel: 'other',
        resolvedModelProvenance: 'unknown',
        effort: 'high',
      }),
      summary('blank-default', 'failed', {
        model: LANE_DEFAULT_MODEL,
        resolvedModel: '   ',
        resolvedModelProvenance: 'native',
        effort: 'high',
      }),
      summary('auto-model', 'delivered', {
        model: AUTOMATIC_MATRIX_MODEL,
        effort: 'high',
      }),
    ], { byModelEffort: true });

    expect(lookup('codex', 'implement', 'gpt-5', 'high')).toEqual({
      laneId: 'codex',
      taskKind: 'implement',
      model: 'gpt-5',
      effort: 'high',
      delivered: 1,
      failed: 1,
    });
    expect(lookup('codex', 'implement', FAMILY_PROFILE_MODEL, 'high')).toEqual({
      laneId: 'codex',
      taskKind: 'implement',
      model: FAMILY_PROFILE_MODEL,
      effort: 'high',
      delivered: 2,
      failed: 1,
    });
    expect(lookup('codex', 'implement', 'other', 'high')).toBeNull();
    expect(lookup('codex', 'implement', LANE_DEFAULT_MODEL, 'high')).toBeNull();
    expect(lookup('codex', 'implement', AUTOMATIC_MATRIX_MODEL, 'high')).toBeNull();
  });

  it('excludes all capacity failures and dedupes runs before bucketing when byModelEffort is true', () => {
    const lookup = outcomeFiguresFrom([
      summary('same', 'failed', { endedAt: 1000, effort: 'low' }),
      summary('same', 'delivered', { endedAt: 2000, effort: 'high' }),
      summary('quota-failed', 'failed', { effort: 'high', failureClass: 'usage-limit' }),
      summary('auth-missing', 'no-deliverable', { effort: 'high', failureClass: 'auth' }),
      summary('timeout-delivered', 'delivered', { effort: 'high', failureClass: 'timeout' }),
      summary('crash', 'failed', { effort: 'high', failureClass: 'crash' }),
      summary('unverified', 'unverified', { effort: 'high' }),
    ], { byModelEffort: true });

    expect(lookup('codex', 'implement', 'gpt-5', 'high')).toEqual({
      laneId: 'codex',
      taskKind: 'implement',
      model: 'gpt-5',
      effort: 'high',
      delivered: 1,
      failed: 1,
    });
    expect(lookup('codex', 'implement', 'gpt-5', 'low')).toBeNull();
  });

  it('gives the same figures with byModelEffort false as the default mode', () => {
    const rows = [
      summary('m1', 'delivered', { model: 'gpt-5', effort: 'high' }),
      summary('m2', 'delivered', { model: 'gpt-5.2', effort: 'medium' }),
      summary('m3', 'failed', { model: LANE_DEFAULT_MODEL, effort: null }),
      summary('m4', 'no-deliverable', { model: 'gpt-5', effort: 'high', failureClass: 'auth' }),
      summary('m5', 'failed', { model: 'gpt-5', effort: 'high', failureClass: 'usage-limit' }),
      summary('m6', 'failed', { model: 'gpt-5', effort: 'low', failureClass: 'crash' }),
      summary('m7', 'unverified', { model: 'gpt-5', effort: 'high' }),
      summary('other-lane', 'delivered', {
        laneId: 'glm',
        model: 'glm-5',
        taskKind: 'review',
        effort: 'max',
      }),
    ];

    const legacy = outcomeFiguresFrom(rows);
    const explicitFalse = outcomeFiguresFrom(rows, { byModelEffort: false });

    const expectedImplement = {
      laneId: 'codex',
      taskKind: 'implement',
      delivered: 2,
      failed: 3,
    };
    expect(explicitFalse('codex', 'implement')).toEqual(expectedImplement);
    expect(explicitFalse('codex', 'implement')).toEqual(legacy('codex', 'implement'));
    expect(explicitFalse('codex', 'implement', 'gpt-5', 'high')).toEqual(legacy('codex', 'implement'));
    expect(Object.keys(explicitFalse('codex', 'implement') ?? {}).sort()).toEqual([
      'delivered', 'failed', 'laneId', 'taskKind',
    ]);
    expect(explicitFalse('glm', 'review')).toEqual(legacy('glm', 'review'));
    expect(explicitFalse('glm', 'review')).toEqual({
      laneId: 'glm',
      taskKind: 'review',
      delivered: 1,
      failed: 0,
    });
    expect(explicitFalse('codex', 'review')).toBeNull();
    expect(legacy('codex', 'review')).toBeNull();
  });
});
