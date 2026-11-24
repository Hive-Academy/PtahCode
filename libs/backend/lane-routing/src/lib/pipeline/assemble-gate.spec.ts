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

    // Model confirmed the ranking pick (o1) and primary model: legacy source and confidence stay model,
    // while explanation credits the actual ranking factor (rule ui-review), not model refinement.
    expect(row.source).toBe('model');
    expect(row.confidence).toBe(0.9);
    // Explanation contains total, parts, runner-up, gap, deciding factor, preference source/overrides, policy, rule note, limit age.
    expect(row.explanation).toContain('Selected Kimi Code (kimi-cli');
    expect(row.explanation).toContain('with total 87');
    expect(row.explanation).toContain('over runner-up codex at total 85');
    expect(row.explanation).toContain('(gap +2)');
    expect(row.explanation).toContain('decided by rule ui-review');
    expect(row.explanation).not.toContain('decided by model refinement');
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

  it('attributes model refinement, call/configured preference, decisive vs non-decisive exclusion, and pin/rotation preference loss accurately', () => {
    const lanes = [
      makeLane('codex', { preferredRank: 1 }),
      makeLane('grok'),
      makeLane('cursor'),
    ];
    const gathered = makeGathered(lanes, { codex: 75, grok: 80, cursor: 50 });

    // 1. Model refinement (picks o2 != ranking pick) -> decided by model refinement.
    const refineArgs: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
    };
    const refinePlan = planRoutePhases(
      refineArgs.phases,
      refineArgs,
      makeGathered([makeLane('codex'), makeLane('grok')], { codex: 80, grok: 78 }),
      { version: 1, entries: [] },
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    const refineOptions = laneQuestion(refinePlan).options;
    const refineOutcome: ModelRequestOutcome = {
      sent: true,
      succeeded: true,
      requestCause: null,
      notFoundDetail: null,
      answers: new Map([
        ['build', { cause: null, confidence: 0.88, choice: 'o2', proposal: null }],
      ]),
      offered: new Map([['build', refineOptions]]),
      inputTokens: 10,
      outputTokens: 2,
      outcomeFigures: 0,
    };
    const refineRes = resolvePhase(refinePlan, {
      mode: 'model',
      blockedCause: null,
      limited: new Set(),
      outcome: refineOutcome,
    });
    const refineResult = assembleGateResult(
      refineArgs,
      makeGathered([makeLane('codex'), makeLane('grok')], { codex: 80, grok: 78 }),
      new Map([[refinePlan.phaseId, refinePlan]]),
      new Map([[refinePlan.phaseId, refineRes]]),
      ['codex', 'grok'],
      { requests: 1, input: 10, output: 2, successes: 1 },
      [refineOutcome],
    );
    expect(refineResult.roster[0]).toMatchObject({ source: 'model', confidence: 0.88 });
    expect(refineResult.roster[0].explanation).toContain('decided by model refinement');

    // 2. Configured preference changes choice (codex 75+5+12=92 beats grok 80+5=85) -> decided by configured preference.
    const confPlan = planRoutePhases(
      refineArgs.phases,
      refineArgs,
      gathered,
      gathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    const confRes = resolvePhase(confPlan, {
      mode: 'ranking',
      blockedCause: null,
      limited: new Set(),
      outcome: null,
    });
    const confResult = assembleGateResult(
      refineArgs,
      gathered,
      new Map([[confPlan.phaseId, confPlan]]),
      new Map([[confPlan.phaseId, confRes]]),
      lanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(confResult.roster[0].explanation).toContain('decided by configured preference');

    // 3. Call preference changes choice (grok 70+5+12=87 beats codex 80+5=85) -> decided by call preference.
    const callArgs: GateArgs = { ...refineArgs, preferences: { prefer: ['grok'] } };
    const callGathered = makeGathered([makeLane('codex'), makeLane('grok')], { codex: 80, grok: 70 });
    const callPlan = planRoutePhases(
      callArgs.phases,
      callArgs,
      callGathered,
      callGathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    const callRes = resolvePhase(callPlan, {
      mode: 'ranking',
      blockedCause: null,
      limited: new Set(),
      outcome: null,
    });
    const callResult = assembleGateResult(
      callArgs,
      callGathered,
      new Map([[callPlan.phaseId, callPlan]]),
      new Map([[callPlan.phaseId, callRes]]),
      ['codex', 'grok'],
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(callResult.roster[0].explanation).toContain('decided by call preference');

    // 4. Non-decisive exclusion rule (removes distant last-place cursor) -> decided by score, rule kept in policy context.
    const nonDecisiveRule: RoutingRule = {
      id: 'drop-cursor',
      match: { kind: 'implement' },
      set: { exclude: ['cursor'] },
    };
    const plainLanes = [makeLane('codex'), makeLane('grok'), makeLane('cursor')];
    const plainGathered = makeGathered(plainLanes, { codex: 85, grok: 75, cursor: 40 });
    const nonDecisivePlan = planRoutePhases(
      refineArgs.phases,
      refineArgs,
      plainGathered,
      plainGathered.rotation,
      false,
      [],
      () => undefined,
      false,
      undefined,
      { rules: [nonDecisiveRule] },
    ).plans[0];
    const nonDecisiveRes = resolvePhase(nonDecisivePlan, {
      mode: 'ranking',
      blockedCause: null,
      limited: new Set(),
      outcome: null,
    });
    const nonDecisiveResult = assembleGateResult(
      refineArgs,
      plainGathered,
      new Map([[nonDecisivePlan.phaseId, nonDecisivePlan]]),
      new Map([[nonDecisivePlan.phaseId, nonDecisiveRes]]),
      plainLanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(nonDecisiveResult.roster[0].explanation).toContain('decided by score');
    expect(nonDecisiveResult.roster[0].explanation).not.toContain('decided by rule drop-cursor');
    expect(nonDecisiveResult.roster[0].explanation).toContain('(rule drop-cursor)');

    // 5. Decisive exclusion rule (removes leader codex) -> decided by rule drop-codex.
    const decisiveRule: RoutingRule = {
      id: 'drop-codex',
      match: { kind: 'implement' },
      set: { exclude: ['codex'] },
    };
    const decisivePlan = planRoutePhases(
      refineArgs.phases,
      refineArgs,
      plainGathered,
      plainGathered.rotation,
      false,
      [],
      () => undefined,
      false,
      undefined,
      { rules: [decisiveRule] },
    ).plans[0];
    const decisiveRes = resolvePhase(decisivePlan, {
      mode: 'ranking',
      blockedCause: null,
      limited: new Set(),
      outcome: null,
    });
    const decisiveResult = assembleGateResult(
      refineArgs,
      plainGathered,
      new Map([[decisivePlan.phaseId, decisivePlan]]),
      new Map([[decisivePlan.phaseId, decisiveRes]]),
      plainLanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(decisiveResult.roster[0].explanation).toContain('decided by rule drop-codex');

    // 6. Pin with negative deficit preference loss -> reports lost under pin.
    const pinArgs: GateArgs = {
      ...refineArgs,
      preferences: { prefer: ['cursor'] },
      pins: [{ phaseId: 'build', executor: 'codex' }],
    };
    const pinPlan = planRoutePhases(
      pinArgs.phases,
      pinArgs,
      plainGathered,
      plainGathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    const pinRes = resolvePhase(pinPlan, {
      mode: 'ranking',
      blockedCause: null,
      limited: new Set(),
      outcome: null,
    });
    const pinResult = assembleGateResult(
      pinArgs,
      plainGathered,
      new Map([[pinPlan.phaseId, pinPlan]]),
      new Map([[pinPlan.phaseId, pinRes]]),
      plainLanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(pinResult.roster[0].explanation).toContain('boost +12 on cursor total 57 lost under pin');
  });

  it('preserves question-limit skip reason and ranked alternatives on an alternates-only limited phase', () => {
    const lanes = [makeLane('codex'), makeLane('grok')];
    const gathered = makeGathered(
      lanes,
      { codex: 80, grok: 60 },
      {
        models: new Map([
          [
            'codex',
            {
              models: [
                { id: 'codex-alt', provenance: 'reported' },
              ],
              status: 'ok',
            },
          ],
          ['grok', { models: [], status: 'ok' }],
        ]),
      },
    );
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
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
    expect(laneQuestion(planned).primaryCount).toBe(1);
    expect(laneQuestion(planned).options.length).toBeGreaterThanOrEqual(2);
    const resolution = resolvePhase(planned, {
      mode: 'model',
      blockedCause: null,
      limited: new Set(['build']),
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
    expect(row.status).toBe('chosen');
    if (row.status !== 'chosen') throw new Error('expected chosen');
    expect(row.fallbackCause).toBe('question-limit');
    expect(row.reason).toContain('fallback cause question-limit');
    expect(row.candidates?.map((c) => [c.candidate, c.disposition])).toEqual([
      ['codex', 'chosen'],
      ['grok', 'ranked'],
    ]);
  });

  it('keeps a model-cold skip reason on an alternates-only phase', () => {
    const lanes = [makeLane('codex'), makeLane('grok')];
    const gathered = makeGathered(
      lanes,
      { codex: 80, grok: 60 },
      {
        models: new Map([
          [
            'codex',
            {
              models: [{ id: 'codex-alt', provenance: 'reported' }],
              status: 'ok',
            },
          ],
          ['grok', { models: [], status: 'ok' }],
        ]),
      },
    );
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
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
    expect(laneQuestion(planned).primaryCount).toBe(1);
    const cold = resolvePhase(planned, {
      mode: 'blocked',
      blockedCause: 'model-cold',
      limited: new Set(),
      outcome: null,
    });
    expect(cold).toMatchObject({ cause: 'model-cold' });
    const failed = resolvePhase(planned, {
      mode: 'blocked',
      blockedCause: 'provider-error',
      limited: new Set(),
      outcome: null,
    });
    expect(failed).toMatchObject({ cause: null });
  });

  it('bounds diagnostics under 64k chars and 25.6k tokens across 10 rules with 32x200-char unknown excludes and dense repeated preferences', () => {
    const lanes = [
      makeLane('codex', { family: 'codex' }),
      makeLane('grok', { family: 'grok' }),
      makeLane('opencode', { family: 'shared' }),
      makeLane('cursor', { family: 'shared' }),
      makeLane('kimi-cli', { family: 'shared' }),
      makeLane('gemini', { family: 'shared' }),
      makeLane('claude-lane', { family: 'shared' }),
    ];
    const scores = { codex: 82, grok: 78, shared: 70 };
    const gathered = makeGathered(lanes, scores);

    // Case A: 10 phases with 10 distinct matching rules, each with 32 unique 200-char unknown exclude selectors.
    const phases = Array.from({ length: 10 }, (_, idx) => ({
      id: `phase-${idx}`,
      kind: 'implement' as const,
      role: `custom-role-${idx}`,
    }));
    const rules: RoutingRule[] = Array.from({ length: 10 }, (_, idx) => ({
      id: `rule-${idx}`,
      match: { role: `custom-role-${idx}` },
      set: {
        exclude: Array.from(
          { length: 32 },
          (_, selIdx) => `unknown-rule-${idx}-sel-${selIdx}-${'a'.repeat(170)}`.slice(0, 200),
        ),
      },
    }));
    const argsA: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement ten phases',
      taskType: 'FEATURE',
      depth: 'Full',
      phases,
    };
    const plannedA = planRoutePhases(
      argsA.phases,
      argsA,
      gathered,
      gathered.rotation,
      false,
      [],
      () => undefined,
      false,
      undefined,
      { rules },
    ).plans;
    const planMapA = new Map(plannedA.map((p) => [p.phaseId, p]));
    const resMapA = new Map(
      plannedA.map((p) => [
        p.phaseId,
        resolvePhase(p, {
          mode: 'ranking',
          blockedCause: null,
          limited: new Set(),
          outcome: null,
        }),
      ]),
    );
    const resultA = assembleGateResult(
      argsA,
      gathered,
      planMapA,
      resMapA,
      lanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(GateResultSchema.safeParse(resultA).success).toBe(true);
    const jsonA = JSON.stringify(resultA);
    expect(jsonA.length).toBeLessThan(64_000);
    // Conservative token check matching ROUTE_DECIDE_RESULT_BUDGET (~2.4 chars/token -> <= 25,600 tokens).
    expect(Math.ceil(jsonA.length / 2.4)).toBeLessThan(25_600);
    const diagnosticCharsA = resultA.reasons.reduce((sum, line) => sum + line.length, 0);
    expect(diagnosticCharsA).toBeLessThanOrEqual(8_000);
    expect(resultA.reasons[resultA.reasons.length - 1]).toMatch(
      /^and \d+ more diagnostic entries omitted$/,
    );
    for (const row of resultA.roster) {
      expect(row.candidates?.length).toBe(lanes.length);
    }

    // Case B: Dense repeated preferences across 10 phases (with a review phase where codex becomes ineligible).
    const prefPhases = [
      ...Array.from({ length: 9 }, (_, idx) => ({
        id: `impl-${idx}`,
        kind: 'implement' as const,
        role: 'custom-role',
      })),
      {
        id: 'review-0',
        kind: 'review' as const,
        role: 'custom-role',
        reviews: ['impl-0'],
      },
    ];
    const densePrefer = [
      'codex',
      'shared',
      ...Array.from(
        { length: 30 },
        (_, idx) => `unknown-pref-${idx}-${'p'.repeat(180)}`.slice(0, 200),
      ),
    ];
    const argsB: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement and review',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: prefPhases,
      preferences: { prefer: densePrefer },
    };
    const plannedB = planRoutePhases(
      argsB.phases,
      argsB,
      gathered,
      gathered.rotation,
      false,
      [{ phaseId: 'impl-0', kind: 'implement', family: 'codex' }],
      () => undefined,
      false,
    ).plans;
    const planMapB = new Map(plannedB.map((p) => [p.phaseId, p]));
    const resMapB = new Map(
      plannedB.map((p) => [
        p.phaseId,
        resolvePhase(p, {
          mode: 'ranking',
          blockedCause: null,
          limited: new Set(),
          outcome: null,
        }),
      ]),
    );
    const resultB = assembleGateResult(
      argsB,
      gathered,
      planMapB,
      resMapB,
      lanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );
    expect(GateResultSchema.safeParse(resultB).success).toBe(true);
    const jsonB = JSON.stringify(resultB);
    expect(jsonB.length).toBeLessThan(64_000);
    expect(Math.ceil(jsonB.length / 2.4)).toBeLessThan(25_600);
    // Phase 0 emits bounded ambiguous match and truncated unknown preferences once.
    expect(resultB.roster[0].explanation).toContain('shared: ambiguous (claude-lane/cursor/gemini and 2 more)');
    expect(resultB.roster[0].explanation).toContain('and 24 more');
    // Subsequent identical implement phases do not repeat already-emitted diagnostics.
    expect(resultB.roster[1].explanation).not.toContain('shared: ambiguous');
    expect(resultB.roster[1].explanation).not.toContain('unknown-pref-0');
    // Review phase where codex is excluded by reviewer-family emits the new distinct status (`ineligible`).
    expect(resultB.roster[9].explanation).toContain('codex->codex: ineligible');
  });

  it('counts 31 omitted distinct entries when 32 unknown exclude selectors share the same 45-char prefix across phases', () => {
    const lanes = [makeLane('codex'), makeLane('grok')];
    const gathered = makeGathered(lanes, { codex: 82, grok: 78 });
    const sharedPrefix = 'p'.repeat(45);
    const rule: RoutingRule = {
      id: 'same-prefix-rule',
      match: { kind: 'implement' },
      set: {
        exclude: Array.from(
          { length: 32 },
          (_, idx) => `${sharedPrefix}-tail-${idx}`,
        ),
      },
    };
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement two phases with shared-prefix rule excludes',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [
        { id: 'impl-1', kind: 'implement', role: 'custom-role' },
        { id: 'impl-2', kind: 'implement', role: 'custom-role' },
      ],
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
      { rules: [rule] },
    ).plans;
    const planMap = new Map(planned.map((p) => [p.phaseId, p]));
    const resMap = new Map(
      planned.map((p) => [
        p.phaseId,
        resolvePhase(p, {
          mode: 'ranking',
          blockedCause: null,
          limited: new Set(),
          outcome: null,
        }),
      ]),
    );
    const result = assembleGateResult(
      args,
      gathered,
      planMap,
      resMap,
      lanes.map((l) => l.id),
      { requests: 0, input: null, output: null, successes: 0 },
      [null],
    );

    expect(GateResultSchema.safeParse(result).success).toBe(true);
    expect(result.reasons).toEqual([
      `routing rule same-prefix-rule: exclude selector "${sharedPrefix}..." matched no candidate`,
      'and 31 more diagnostic entries omitted',
    ]);
  });
});
