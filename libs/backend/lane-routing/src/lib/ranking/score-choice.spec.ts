import { LANE_DEFAULT_MODEL, type LaneOutcomeSummary } from '@ptah-extension/shared';
import { GateResultSchema, type ModelEffort } from '../contracts/route-decide-result.schema';
import { deriveChoiceEvidence } from '../matrix/choice-evidence';
import { FAMILY_PROFILE_MODEL, type ValueMatrixCell } from '../matrix/matrix.types';
import { NEUTRAL_SCORE } from '../routing-constants';
import type { LaneCandidate } from './candidate.types';
import type { ChoiceInput } from './choice.types';
import { score, type ListedModel, type ScoreCell, type ScoreInput, type ScoreMatrix } from './score';

const NOW = Date.parse('2026-10-15T00:00:00.000Z');
const AS_OF = new Date(NOW).toISOString();
const CODEX: LaneCandidate = {
  kind: 'lane', id: 'codex', cli: 'codex', family: 'codex',
  installed: true, disabled: false, limitState: 'confirmed-room',
};

function runs(count: number, fields: Partial<LaneOutcomeSummary> = {}): LaneOutcomeSummary[] {
  const row: Omit<LaneOutcomeSummary, 'runId'> = {
    laneId: CODEX.id,
    family: CODEX.family,
    taskKind: 'implement',
    model: LANE_DEFAULT_MODEL,
    effort: 'medium',
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
  };
  return Array.from({ length: count }, (_, index) => ({
    ...row,
    runId: JSON.stringify([row.model, row.effort, row.verdict, row.taskKind, index]),
  }));
}

function choice(rows: LaneOutcomeSummary[], overrides: Partial<ChoiceInput> = {}): ChoiceInput {
  return {
    evidence: deriveChoiceEvidence(rows, NOW),
    policyEffort: 'medium',
    effortFixed: false,
    exploreTurn: false,
    ...overrides,
  };
}

function model(id: string, supported?: readonly string[]): ListedModel {
  return {
    id,
    provenance: 'reported',
    ...(supported === undefined ? {} : { efforts: { provenance: 'native', supported, default: null } }),
  };
}

function matrixCell(profileModel: string, value?: ValueMatrixCell): ScoreCell {
  return {
    profileModel,
    score: value?.score ?? NEUTRAL_SCORE,
    cell: value ?? { kind: 'unknown' },
    noProfile: value === undefined,
  };
}

function value(source: ValueMatrixCell['source'], score: number): ValueMatrixCell {
  return { kind: 'value', source, score, asOf: AS_OF, stale: false };
}

function matrix(values: Readonly<Record<string, ValueMatrixCell>> = {}): ScoreMatrix {
  return {
    resolve: (_family, id) => {
      const key = Object.hasOwn(values, id) ? id : FAMILY_PROFILE_MODEL;
      return matrixCell(key, values[key]);
    },
  };
}

describe('model and effort choices', () => {
  it.each([[7, LANE_DEFAULT_MODEL, 'medium'], [8, 'candidate', 'high']] as const)(
    'requires more than the closeness band with %i successes (system CLI)',
    (count, expectedModel, expectedEffort) => {
      const priors = matrix({
        [FAMILY_PROFILE_MODEL]: value('user', 66),
        candidate: value('seed', 90),
      });
      const input: ScoreInput = {
        candidate: CODEX,
        models: [model('candidate', ['high'])],
      };
      expect(score(input, 'implement', priors).model).toBe(LANE_DEFAULT_MODEL);
      const result = score({
        ...input,
        choice: choice([
          ...runs(count, { model: 'candidate', effort: 'high' }),
          ...runs(10, { model: 'candidate', verdict: 'failed' }),
        ]),
      }, 'implement', priors);
      expect(result).toMatchObject({ model: expectedModel, effort: expectedEffort });
      if (expectedModel === 'candidate') {
        expect(result.parts).toMatchObject({ evidence: 'pair', learned: 0, sampleCount: count });
      }
    },
  );

  it('keeps the configured default and tier-table effort without local evidence', () => {
    const input: ScoreInput = {
      candidate: CODEX,
      configuredModel: { id: 'selected', provenance: 'configured' },
      models: [model('selected', ['high']), model('other', ['max'])],
    };
    const priors = matrix({ selected: value('seed', 60), other: value('seed', 90) });
    const before = score(input, 'implement', priors);
    expect(score({ ...input, choice: choice([]) }, 'implement', priors)).toMatchObject({
      model: before.model,
      provenance: before.provenance,
      total: before.total,
      effort: 'medium',
      parts: { evidence: 'prior' },
    });
  });

  it('preserves the Ptah CLI seed-80 promotion with no local evidence', () => {
    const input: ScoreInput = {
      candidate: { ...CODEX, cli: 'ptah-cli', family: 'z-ai' },
      models: [model('glm-5', ['high'])],
    };
    const priors = matrix({ 'glm-5': value('seed', 80) });
    const before = score(input, 'implement', priors);
    expect(before).toMatchObject({ model: 'glm-5', provenance: 'reported', total: 85 });
    expect(score({ ...input, choice: choice([]) }, 'implement', priors)).toMatchObject({
      model: before.model, provenance: before.provenance, total: before.total,
      effort: 'medium', parts: { evidence: 'prior' },
    });
  });

  it('ignores evidence for removed and automatic catalog models', () => {
    const result = score({
      candidate: CODEX,
      models: [model('listed'), { ...model('automatic'), auto: true }],
      choice: choice([
        ...runs(40, { model: 'removed' }),
        ...runs(40, { model: 'automatic' }),
      ]),
    }, 'implement', matrix());
    expect(result).toMatchObject({ model: LANE_DEFAULT_MODEL, parts: { evidence: 'prior' } });
  });

  const highOnly = ['high', 'vendor-effort'];
  it.each([
    ['fixed rule', true, model('selected', highOnly)],
    ['fallback support', false, { ...model('selected'), efforts: {
      provenance: 'ptah-fallback', supported: highOnly, default: null,
    } }],
    ['unknown support', false, { ...model('selected'), efforts: { provenance: 'unknown' } }],
  ] as const)('keeps policy effort with %s', (_name, effortFixed, listed) => {
    const result = score({
      candidate: CODEX,
      configuredModel: { id: 'selected', provenance: 'configured' },
      models: [listed],
      choice: choice([
        ...runs(10, { model: 'selected', verdict: 'failed' }),
        ...runs(40, { model: 'selected', effort: 'high' }),
      ], { effortFixed }),
    }, 'implement', matrix());
    expect(result).toMatchObject({ effort: 'medium', score: 25, parts: { evidence: 'pair' } });
  });

  it('uses model evidence before family evidence, and family evidence only for the fallback', () => {
    const rows = [
      ...runs(10, { verdict: 'failed', effort: 'high' }),
      ...runs(30, { model: 'selected', effort: null }),
    ];
    const input: ScoreInput = {
      candidate: CODEX,
      models: [model('listed')],
      choice: choice(rows),
    };
    expect(score(input, 'implement', matrix())).toMatchObject({
      model: LANE_DEFAULT_MODEL, score: 25, parts: { evidence: 'family' },
    });
    expect(score({
      ...input, configuredModel: { id: 'selected', provenance: 'configured' },
    }, 'implement', matrix())).toMatchObject({
      model: 'selected', score: 88, parts: { evidence: 'model' },
    });
  });

  it('lets a pair-specific user cell override learned evidence', () => {
    const input: ScoreInput = {
      candidate: CODEX,
      configuredModel: { id: 'selected', provenance: 'configured' },
      choice: choice(runs(40, { model: 'selected' })),
    };
    const priors: ScoreMatrix = {
      ...matrix(),
      resolvePair: (family, id, taskKind, effort) => {
        expect([family, id, taskKind, effort]).toEqual(['codex', 'selected', 'implement', 'medium']);
        return matrixCell(id, value('user', 12));
      },
    };
    expect(score(input, 'implement', priors)).toMatchObject({
      score: 12, total: 12,
      cell: { source: 'user' },
      parts: { priorSource: 'user', learned: 0, exploration: 0, evidence: 'pair' },
    });
  });

  it('uses catalog order and then canonical effort order to break equal scores', () => {
    const input: ScoreInput = {
      candidate: CODEX,
      models: [model('z', ['high', 'low']), model('a', ['high', 'low'])],
      choice: choice(['a', 'z'].flatMap((id) => [
        ...runs(20, { model: id, effort: 'low' }),
        ...runs(20, { model: id, effort: 'high' }),
        ...runs(20, { model: id, verdict: 'failed' }),
      ])),
    };
    const priors = matrix();
    const first = score(input, 'implement', priors);
    expect(first).toMatchObject({ model: 'z', effort: 'low', score: 83 });
    expect(score(input, 'implement', priors)).toEqual(first);
  });

  it('uses the seed prior until local evidence moves it, and keeps the capped path intact', () => {
    const candidate: LaneCandidate = { ...CODEX, family: 'z-ai' };
    const input: ScoreInput = {
      candidate,
      configuredModel: { id: 'glm-5', provenance: 'configured' },
    };
    const priors = matrix({ 'glm-5': value('seed', 80) });
    const cold = score({ ...input, choice: choice([]) }, 'implement', priors);
    expect(cold).toMatchObject({
      score: 80, total: 85, parts: { prior: 80, priorSource: 'seed', learned: 0, evidence: 'prior' },
    });
    const rows = [
      ...runs(40, { family: 'z-ai', model: 'glm-5', verdict: 'failed' }),
      ...runs(40, { family: 'z-ai', model: 'unseeded' }),
    ];
    const sampled = { ...input, choice: choice(rows) };
    expect(score(sampled, 'implement', priors)).toMatchObject({
      score: 16, total: 16, parts: { prior: 16, priorSource: 'seed', learned: 0, sampleCount: 40 },
    });
    expect(score({ ...sampled, models: [model('unseeded')] }, 'implement', priors)).toMatchObject({
      model: 'unseeded', total: 90, parts: { priorSource: 'neutral' },
    });
    const local = { ...value('local', 16), sampleCount: 40 };
    expect(score(input, 'implement', {
      resolve: (family, id, taskKind) => id === 'glm-5'
        ? { ...matrixCell(id, local), layers: { seed: value('seed', 80), local } }
        : priors.resolve(family, id, taskKind),
    }).total).toBe(65);
  });
});

describe('bounded exploration', () => {
  function explorationInput(
    routed: number,
    taskKind: LaneOutcomeSummary['taskKind'] = 'implement',
  ): ScoreInput & { choice: ChoiceInput } {
    return {
      candidate: CODEX,
      models: [model('proven', ['low', 'high']), model('sampled'), model('z'), model('a')],
      choice: choice([
        ...runs(routed, { verdict: 'failed', routingSource: 'ranking', taskKind }),
        ...runs(20, { model: 'proven', taskKind }),
        ...runs(1, { model: 'sampled', verdict: 'unverified', taskKind }),
      ], { exploreTurn: true }),
    };
  }

  it.each(['confirmed-room', 'unknown'] as const)(
    'tries the least-sampled catalog model on the fifth run with limit state %s',
    (limitState) => {
      const input = explorationInput(4);
      const candidate = { ...CODEX, limitState };
      const result = score({ ...input, candidate }, 'implement', matrix());
      const exploit = score({ ...input, candidate, choice: {
        ...input.choice, exploreTurn: false,
      } }, 'implement', matrix());
      expect(exploit.model).toBe('proven');
      expect(result).toMatchObject({
        model: 'z', effort: 'medium', provenance: 'reported', score: NEUTRAL_SCORE,
        total: exploit.total, cell: { kind: 'unknown' },
        parts: { explore: true, sampleCount: 0, effort: 'medium', evidence: 'prior' },
      });
    },
  );

  it('skips exploration outside the permitted turn, on review, and at near-limit', () => {
    const input = explorationInput(4);
    const priors = matrix();
    expect(score(explorationInput(3), 'implement', priors).parts.explore).toBeUndefined();
    expect(score(explorationInput(4, 'review'), 'review', priors).parts.explore).toBeUndefined();
    expect(score({ ...input, candidate: { ...CODEX, limitState: 'near-limit' } }, 'implement', priors)
      .parts.explore).toBeUndefined();
    expect(score({ ...input, choice: { ...input.choice, effortFixed: true } }, 'implement', priors)
      .parts.explore).toBeUndefined();
    expect(() => score({ ...input, candidate: { ...CODEX, limitState: 'at-limit' } }, 'implement', priors))
      .toThrow(/at-limit candidates must be excluded/);
  });

  it('requires enough default samples even when the lane has four routed runs', () => {
    const rows = [
      ...runs(2, { routingSource: 'ranking' }),
      ...runs(2, { model: 'other', routingSource: 'ranking' }),
    ];
    expect(score({
      candidate: CODEX, models: [model('other'), model('unsampled')],
      choice: choice(rows, { exploreTurn: true }),
    }, 'implement', matrix()).parts.explore).toBeUndefined();
  });

  it.each([['max', 'low'], ['low', 'high']] as const)(
    'tries an adjacent native effort in canonical order when %s already has three samples',
    (sampledEffort, expectedEffort) => {
      const rows = [
        ...runs(4, { model: 'selected', routingSource: 'ranking' }),
        ...runs(3, { model: 'selected', effort: sampledEffort, verdict: 'failed' }),
      ];
      const result = score({
        candidate: CODEX,
        configuredModel: { id: 'selected', provenance: 'configured' },
        models: [model('selected', ['max', 'high', 'low'])],
        choice: choice(rows, { exploreTurn: true }),
      }, 'implement', matrix());
      expect(result).toMatchObject({
        model: 'selected', effort: expectedEffort, total: 64,
        parts: { explore: true, sampleCount: 0 },
      });
    },
  );
});

describe('route choice result schema', () => {
  it('round-trips optional routing, effort-check and choice trace fields', () => {
    const effort: ModelEffort = 'high';
    const result = {
      stage: 'gate-0.1',
      routeId: 'route-1',
      roster: [{
        phaseId: 'implement', status: 'chosen',
        executor: { kind: 'lane', id: 'codex', cli: 'codex', family: 'codex' },
        model: 'selected', provenance: 'reported', tier: 'sonnet', effort,
        effortCheck: {
          requested: effort, provenance: 'native', supported: ['minimal', 'high'],
          inList: true, expected: 'native-match',
        },
        score: 85, source: 'ranking', taskKind: 'implement',
        confidence: null, fallbackCause: null, modelProposal: null, reason: 'Ranking',
        candidates: [{
          candidate: 'codex', displayName: 'Codex', total: 85, disposition: 'chosen',
          parts: { prior: 85, learned: 0, preference: 0, limit: 0, effort, evidence: 'pair', explore: true },
        }],
      }],
      overallSource: 'ranking', overallConfidence: null, excluded: [], reasons: [],
      usage: { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
    expect(GateResultSchema.parse(result)).toEqual(result);
  });
});
