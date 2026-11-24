import type { RoutingRule } from '@ptah-extension/shared';
import {
  GateResultSchema,
  type LimitEvidence,
} from '../contracts/route-decide-result.schema';
import type { LaneCandidate } from '../ranking/candidate.types';
import type { UnavailablePhase } from '../ranking/hard-constraints';
import { assembleGateResult, missingCapabilityLabel } from './assemble-gate';
import type { GatheredCall } from './gather';
import type { ModelRequestOutcome } from './model-refine';
import {
  BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL,
  laneQuestion,
  planRoutePhases,
  type GateArgs,
  type PhaseResolution,
} from './phase-plan';
import { resolvePhase } from './phase-resolve';

const unavailable: UnavailablePhase = {
  phaseId: 'phase',
  status: 'unavailable',
  exclusionReason: 'missing-capability',
  excluded: [
    { candidate: 'lane', rule: 'missing-capability', capability: 'browser' },
  ],
  pinRule: null,
  needsDisclosedFallback: false,
};

function makeLane(
  id: string,
  overrides: Partial<LaneCandidate> = {},
): LaneCandidate {
  return {
    kind: 'lane',
    id,
    cli: (id === 'kimi-cli' ? 'ptah-cli' : id) as LaneCandidate['cli'],
    ...(id === 'kimi-cli' ? { ptahCliId: id, displayName: 'Kimi Code' } : {}),
    family: id,
    installed: true,
    disabled: false,
    limitState: 'confirmed-room',
    ...overrides,
  };
}

function makeGathered(
  lanes: readonly LaneCandidate[],
  scores: Readonly<Record<string, number>>,
  extra: Partial<GatheredCall> = {},
): GatheredCall {
  return {
    lanes,
    roles: [],
    rotation: { version: 1, entries: [] },
    rotationUnavailable: false,
    missing: [],
    detailReasons: [],
    models: new Map(
      lanes.map((lane) => [
        lane.id,
        { models: [{ id: `${lane.id}-1`, provenance: 'reported' as const }], status: 'ok' as const },
      ]),
    ),
    nowMs: 1_700_000_060_000,
    matrix: {
      reasons: [],
      outcomeFigures: () => null,
      resolve: (family, model, taskKind) => {
        const value = scores[family];
        if (value === undefined) {
          return {
            family,
            model,
            taskKind,
            layers: {},
            score: 50,
            cell: { kind: 'unknown' as const },
            profileModel: '*',
            noProfile: true,
          };
        }
        const cell = {
          kind: 'value' as const,
          score: value,
          source: 'seed' as const,
          asOf: '2026-02-19',
          stale: false,
        };
        return {
          family,
          model,
          taskKind,
          layers: { seed: cell },
          score: value,
          cell,
          profileModel: '*',
          noProfile: false,
        };
      },
    },
    ...extra,
  };
}

it('names the excluded capability', () => {
  expect(missingCapabilityLabel(unavailable)).toBe('browser');
});

it('uses the typed reason when an exclusion has no capability name', () => {
  expect(missingCapabilityLabel({ ...unavailable, excluded: [] })).toBe(
    'missing-capability',
  );
});

describe('assembleGateResult trace and explanations', () => {
  it('orders candidates chosen -> excluded (hard/user & pruned with cause) -> ranked and validates schema', () => {
    const evidence: LimitEvidence = {
      state: 'confirmed-room',
      lookup: 'ok',
      status: 'available',
      readAt: 1_700_000_030_000,
    };
    const lanes = [
      makeLane('kimi-cli', { limitEvidence: evidence }),
      makeLane('codex', { preferredRank: 1 }),
      makeLane('grok'),
      makeLane('opencode', { limitState: 'at-limit' }),
      makeLane('cursor'),
    ];
    const gathered = makeGathered(
      lanes,
      { 'kimi-cli': 70, codex: 80, grok: 78, opencode: 90, cursor: 55 },
      {
        models: new Map([
          ['kimi-cli', { models: [], status: 'empty' }],
          ['codex', { models: [{ id: 'gpt-5', provenance: 'reported' }], status: 'ok' }],
          ['grok', { models: [{ id: 'grok-4', provenance: 'reported' }], status: 'ok' }],
          ['opencode', { models: [], status: 'timeout' }],
          ['cursor', { models: [{ id: 'cursor-1', provenance: 'reported' }], status: 'ok' }],
        ]),
        missing: ['limits', 'model-lists'],
        detailReasons: [
          'models unknown for kimi-cli (empty)',
          'models unknown for opencode (timeout)',
          'phase definition unavailable for implement (timeout)',
        ],
      },
    );
    const rule: RoutingRule = {
      id: 'ui-review',
      match: { kind: 'implement', shape: 'logic' },
      set: {
        maxTier: 'sonnet',
        effort: 'xhigh',
        prefer: ['Kimi Code'],
        exclude: ['ghost-selector'],
      },
    };
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement UI logic',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [
        {
          id: 'build',
          kind: 'implement',
          shape: 'logic',
          weight: 9000,
          role: 'custom-role',
        },
      ],
      preferences: { prefer: ['codex'] },
    };
    const planned = planRoutePhases(
      args.phases,
      args,
      gathered,
      gathered.rotation,
      false,
      [],
      () => undefined,
      false,
      undefined,
      {
        rules: [rule],
        diagnostics: ['routing rule bad: ignored', 'routing rule bad: ignored'],
      },
    ).plans[0];
    const options = laneQuestion(planned).options;
    // Offer only kimi-cli and codex (simulate payload-fit dropping grok; cursor is below-band).
    const modelOutcome: ModelRequestOutcome = {
      sent: true,
      succeeded: true,
      requestCause: null,
      notFoundDetail: null,
      answers: new Map([
        ['build', { cause: null, confidence: 0.9, choice: 'o1', proposal: null }],
      ]),
      offered: new Map([['build', options.slice(0, 2)]]),
      optionCapOffered: new Map([['build', options]]),
      prunedLanes: new Map([['build', new Map([['grok', 'payload-fit']])]]),
      inputTokens: 12,
      outputTokens: 3,
      outcomeFigures: 0,
    };
    const resolution = resolvePhase(planned, {
      mode: 'model',
      blockedCause: null,
      limited: new Set(),
      outcome: modelOutcome,
    });
    const result = assembleGateResult(
      args,
      gathered,
      new Map([[planned.phaseId, planned]]),
      new Map([[planned.phaseId, resolution]]),
      lanes.map((l) => l.id),
      { requests: 1, input: 12, output: 3, successes: 1 },
      [modelOutcome],
    );

    expect(GateResultSchema.safeParse(result).success).toBe(true);
    const row = result.roster[0];
    expect(row.status).toBe('chosen');
    if (row.status !== 'chosen') throw new Error('expected chosen');

    // Every candidate in inventory appears exactly once: chosen first, then hard excluded & pruned, then ranked.
    expect(row.candidates?.map((c) => [c.candidate, c.disposition, c.rule, c.cause])).toEqual([
      ['kimi-cli', 'chosen', undefined, undefined],
      ['opencode', 'excluded', 'at-limit', undefined],
      ['grok', 'excluded', 'pruned', 'payload-fit'],
      ['cursor', 'excluded', 'pruned', 'below-band'],
      ['codex', 'ranked', undefined, undefined],
    ]);
    expect(row.candidates?.[0]).toMatchObject({
      displayName: 'Kimi Code',
      total: 87,
      limitEvidence: evidence,
      modelListStatus: 'empty',
      preferenceSource: 'rule',
      overriddenPreferenceSources: ['call', 'configured'],
    });
    // Hard-excluded has null total; pruned eligible candidates keep computed additive totals.
    expect(row.candidates?.[1].total).toBeNull();
    expect(row.candidates?.[2].total).toBe(83);
    expect(row.candidates?.[3].total).toBe(60);
    expect(row.candidates?.[4].total).toBe(85);

    // Legacy excluded keeps hard exclusions and pruned entries with typed cause.
    expect(result.excluded).toEqual([
      { phaseId: 'build', candidate: 'opencode', rule: 'at-limit' },
      { phaseId: 'build', candidate: 'grok', rule: 'pruned', cause: 'payload-fit' },
      { phaseId: 'build', candidate: 'cursor', rule: 'pruned', cause: 'below-band' },
    ]);

    // Explanation contains total, parts, runner-up, gap, deciding factor, preference source/overrides, policy, rule note, limit age.
    expect(row.explanation).toContain('Selected Kimi Code (kimi-cli');
    expect(row.explanation).toContain('with total 87');
    expect(row.explanation).toContain('over runner-up codex at total 85');
    expect(row.explanation).toContain('(gap +2)');
    expect(row.explanation).toContain('decided by model refinement');
    expect(row.explanation).toContain('preferences from rule');
    expect(row.explanation).toContain('overridden: call, configured');
    expect(row.explanation).toContain('R3 shape=logic weight>=8000, sonnet/xhigh after rule ui-review capped tier opus->sonnet');
    expect(row.explanation).toContain('limit confirmed-room (age 30s)');

    // Top-level reasons deduplicate rule diagnostics, omit generic 'models unknown' when per-lane detail exists, keep limits & phase defs.
    expect(result.reasons).not.toContain('models unknown');
    expect(result.reasons).toContain('limits unavailable');
    expect(result.reasons).toContain('models unknown for kimi-cli (empty)');
    expect(result.reasons).toContain('models unknown for opencode (timeout)');
    expect(result.reasons).toContain('phase definition unavailable for implement (timeout)');
    expect(
      result.reasons.filter((line) => line === 'routing rule bad: ignored'),
    ).toHaveLength(1);
    expect(result.reasons).toContain(
      'routing rule ui-review: exclude selector "ghost-selector" matched no candidate',
    );
  });

  it('produces ranking-only trace with preference loss, rotation, pin, and AM3 override explanations', () => {
    const lanes = [makeLane('codex'), makeLane('grok')];
    const gathered = makeGathered(lanes, { codex: 60, grok: 85 });
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
      preferences: { prefer: ['codex'] },
    };
    const planned = planRoutePhases(
      args.phases,
      args,
      gathered,
      gathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    const resolution = resolvePhase(planned, {
      mode: 'ranking',
      blockedCause: null,
      limited: new Set(),
      outcome: null,
    });
    const result = assembleGateResult(
      args,
      gathered,
      new Map([[planned.phaseId, planned]]),
      new Map([[planned.phaseId, resolution]]),
      lanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );

    expect(GateResultSchema.safeParse(result).success).toBe(true);
    const row = result.roster[0];
    if (row.status !== 'chosen') throw new Error('expected chosen');
    // No model dispatch -> no pruned entries, ranked alternative retained.
    expect(result.excluded).toEqual([]);
    expect(row.candidates?.map((c) => [c.candidate, c.disposition])).toEqual([
      ['grok', 'chosen'],
      ['codex', 'ranked'],
    ]);
    // codex total = 60 + 5 + 12 = 77; grok total = 85 + 5 = 90 (gap +13).
    expect(row.explanation).toContain('with total 90');
    expect(row.explanation).toContain('over runner-up codex at total 77');
    expect(row.explanation).toContain('(gap +13)');
    expect(row.explanation).toContain('boost +12 on codex total 77 lost to total 90 (gap -13)');
    expect(row.explanation).toContain('limit confirmed-room (age unknown)');

    // Rotation deciding factor with negative gap when cursor rotates to #2 inside band.
    const rotGathered = makeGathered(
      lanes,
      { codex: 80, grok: 78 },
      { rotation: { version: 1, entries: [{ key: 'build|implement', candidateId: 'codex' }] } },
    );
    const rotPlan = planRoutePhases(
      args.phases,
      { ...args, preferences: undefined },
      rotGathered,
      rotGathered.rotation,
      false,
      [],
      () => undefined,
      true,
    ).plans[0];
    const rotRes = resolvePhase(rotPlan, {
      mode: 'ranking',
      blockedCause: null,
      limited: new Set(),
      outcome: null,
    });
    const rotResult = assembleGateResult(
      { ...args, preferences: undefined },
      rotGathered,
      new Map([[rotPlan.phaseId, rotPlan]]),
      new Map([[rotPlan.phaseId, rotRes]]),
      lanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(GateResultSchema.safeParse(rotResult).success).toBe(true);
    expect(rotResult.roster[0].explanation).toContain('decided by rotation');
    expect(rotResult.roster[0].explanation).toContain('(gap -2)');

    // AM3 visual-review override explanation.
    const visualArgs: GateArgs = {
      stage: 'gate-0.1',
      request: 'Review UI',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'look', kind: 'visual-review' }],
    };
    const visualPlan = planRoutePhases(
      visualArgs.phases,
      visualArgs,
      makeGathered([makeLane('codex')], { codex: 85 }),
      { version: 1, entries: [] },
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    const visualRes = resolvePhase(visualPlan, {
      mode: 'ranking',
      blockedCause: null,
      limited: new Set(),
      outcome: null,
    });
    const visualResult = assembleGateResult(
      visualArgs,
      makeGathered([makeLane('codex')], { codex: 85 }),
      new Map([[visualPlan.phaseId, visualPlan]]),
      new Map([[visualPlan.phaseId, visualRes]]),
      ['codex', 'subagent:visual-review'],
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(GateResultSchema.safeParse(visualResult).success).toBe(true);
    expect(visualResult.roster[0].explanation).toContain(
      `override: ${BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL} (+50)`,
    );
  });

  it('retains synthetic not-listed legacy exclusion and ranked inventory on pin-unavailable rows', () => {
    const lanes = [makeLane('codex'), makeLane('grok', { limitState: 'at-limit' })];
    const gathered = makeGathered(lanes, { codex: 80, grok: 75 });
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
      pins: [{ phaseId: 'build', executor: 'ghost-lane' }],
    };
    const planned = planRoutePhases(
      args.phases,
      args,
      gathered,
      gathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    const resolution: PhaseResolution = { kind: 'unavailable' };
    const result = assembleGateResult(
      args,
      gathered,
      new Map([[planned.phaseId, planned]]),
      new Map([[planned.phaseId, resolution]]),
      lanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );

    expect(GateResultSchema.safeParse(result).success).toBe(true);
    const row = result.roster[0];
    expect(row.status).toBe('unavailable');
    // Synthetic missing pin stays in legacy excluded / excludedBy; inventory candidates appear in trace.
    expect(result.excluded).toContainEqual({
      phaseId: 'build',
      candidate: 'ghost-lane',
      rule: 'not-listed',
    });
    expect(row.candidates?.map((c) => [c.candidate, c.disposition, c.total])).toEqual([
      ['grok', 'excluded', null],
      ['codex', 'ranked', 85],
    ]);
    expect(row.explanation).toContain('blocking constraint pin-unavailable');
    expect(row.explanation).toContain('pin rule not-listed');
  });
});
