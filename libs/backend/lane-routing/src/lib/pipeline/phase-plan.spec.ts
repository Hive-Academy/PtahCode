import { toSubagentCandidate, type LaneCandidate } from '../ranking/candidate.types';
import type { PhasePlan } from './phase-plan';
import {
  BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL,
  computeLaneOfferDispositions,
  laneQuestion,
} from './phase-plan';
import { isSendable, resolvePhase } from './phase-resolve';
import { TASK_TYPES, type RoutingRule } from '@ptah-extension/shared';
import type { GatheredCall } from './gather';
import { candidatesFor, planRoutePhases, type GateArgs } from './phase-plan';

it('offers the new child session kind only when its caller is eligible', () => {
  const gathered: GatheredCall = {
    lanes: [],
    roles: [],
    childSessionEligible: true,
    rotation: { version: 1, entries: [] },
    rotationUnavailable: false,
    models: new Map(),
    missing: [],
    detailReasons: [],
    matrix: {
      reasons: [],
      outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family,
        model,
        taskKind,
        score: 50,
        cell: { kind: 'unknown' as const },
        profileModel: '*',
        noProfile: true,
      }),
    },
  };
  const phase = {
    id: 'build',
    kind: 'implement',
  } as GateArgs['phases'][number];
  expect(
    candidatesFor(phase, gathered).map((candidate) => candidate.id),
  ).toContain('child-session');
  expect(
    candidatesFor(phase, { ...gathered, childSessionEligible: false }).map(
      (candidate) => candidate.id,
    ),
  ).not.toContain('child-session');
});

it.each(['backend-developer', 'frontend-developer', 'devops-engineer'])(
  'routes retired role %s to the implement phase even when listed',
  (role) => {
    const gathered: GatheredCall = {
      lanes: [],
      roles: [role, 'custom-agent'],
      childSessionEligible: false,
      rotation: { version: 1, entries: [] },
      rotationUnavailable: false,
      models: new Map(),
      missing: [],
      detailReasons: [],
      matrix: {
        reasons: [],
        outcomeFigures: () => null,
        resolve: (family, model, taskKind) => ({
          family,
          model,
          taskKind,
          score: 50,
          cell: { kind: 'unknown' as const },
          profileModel: '*',
          noProfile: true,
        }),
      },
    };
    expect(
      candidatesFor({ id: 'build', kind: 'implement', role }, gathered),
    ).toContainEqual(expect.objectContaining({ phaseKind: 'implement' }));
    expect(
      candidatesFor({ id: 'build', kind: 'implement', role }, gathered).some(
        (candidate) => candidate.id === `subagent:${role}`,
      ),
    ).toBe(false);
    expect(
      candidatesFor({ id: 'verify', kind: 'tests', role }, gathered),
    ).toContainEqual(expect.objectContaining({ phaseKind: 'tests' }));
    expect(
      candidatesFor(
        { id: 'build', kind: 'implement', role: 'custom-agent' },
        gathered,
      ),
    ).toContainEqual(expect.objectContaining({ role: 'custom-agent' }));
  },
);

it('routes unlisted retired roles by phase kind and keeps active explicit roles', () => {
  const gathered: GatheredCall = {
    lanes: [],
    roles: ['code-logic-reviewer'],
    childSessionEligible: false,
    rotation: { version: 1, entries: [] },
    rotationUnavailable: false,
    models: new Map(),
    missing: [],
    detailReasons: [],
    matrix: {
      reasons: [],
      outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family,
        model,
        taskKind,
        score: 50,
        cell: { kind: 'unknown' as const },
        profileModel: '*',
        noProfile: true,
      }),
    },
  };
  for (const role of [
    'backend-developer',
    'Frontend-Developer',
    ' devops-engineer ',
  ]) {
    expect(
      candidatesFor({ id: 'verify', kind: 'tests', role }, gathered),
    ).toEqual([
      expect.objectContaining({ id: 'subagent:tests', phaseKind: 'tests' }),
    ]);
  }
  for (const [role, kind] of [
    ['code-logic-reviewer', 'review'],
    ['code-style-reviewer', 'review'],
    ['senior-tester', 'tests'],
    ['visual-reviewer', 'visual-review'],
  ] as const) {
    expect(candidatesFor({ id: kind, kind, role }, gathered)).toEqual([
      expect.objectContaining({ id: `subagent:${kind}`, phaseKind: kind }),
    ]);
    expect(
      candidatesFor({ id: kind, kind, role }, gathered).some(
        (candidate) => candidate.id === `subagent:${role}`,
      ),
    ).toBe(false);
  }
});
import { policyForPhase } from './tier-effort-policy';

function plan(scores: readonly number[]): PhasePlan {
  const candidates = scores.map((_, index) =>
    toSubagentCandidate(`role-${index}`),
  );
  return {
    phaseId: 'build',
    kind: 'implement',
    taskKind: 'implement',
    policy: policyForPhase('implement'),
    constraint: {
      phaseId: 'build',
      status: 'eligible',
      eligible: candidates,
      excluded: [],
      pinAccepted: false,
    },
    spread: null,
    ranked: candidates.map((candidate, index) => ({
      candidate,
      scored: {
        candidate,
        model: 'auto',
        provenance: 'lane-default',
        score: scores[index],
        cell: { kind: 'unknown' },
        profileModel: '*',
        noProfile: true,
      },
    })),
  };
}

it('returns no decision options for an empty ranked list', () => {
  expect(laneQuestion(plan([]))).toMatchObject({
    primaryCount: 0,
    options: [],
  });
  expect(isSendable(plan([]))).toBe(false);
});

it('offers only the five-point band to the decision model', () => {
  const phase = plan([80, 76, 70]);
  expect(laneQuestion(phase).options.map((option) => option.score)).toEqual([
    80, 76,
  ]);
  expect(isSendable(phase)).toBe(true);
});

it('ranks reported alternates before capping and keeps the system CLI default row', () => {
  const lane = {
    kind: 'lane' as const,
    id: 'codex',
    cli: 'codex' as const,
    family: 'codex',
    installed: true,
    disabled: false,
    limitState: 'confirmed-room' as const,
  };
  const gathered: GatheredCall = {
    lanes: [lane],
    roles: [],
    rotation: { version: 1, entries: [] },
    rotationUnavailable: false,
    missing: [],
    detailReasons: [],
    models: new Map([
      [
        'codex',
        {
          models: [
            { id: 'fallback-id', provenance: 'fallback' as const },
            { id: 'live-one', provenance: 'reported' as const },
            { id: 'live-two', provenance: 'reported' as const },
            { id: 'live-three', provenance: 'reported' as const },
          ],
        },
      ],
    ]),
    matrix: {
      reasons: [],
      outcomeFigures: () => null,
      resolve: (family, model, taskKind) => {
        const value = model === 'live-three' ? 54 : 50;
        return {
          family,
          model,
          taskKind,
          score: value,
          cell:
            model === 'live-three'
              ? {
                  kind: 'value' as const,
                  score: value,
                  source: 'seed' as const,
                  asOf: '2026-02-19',
                  stale: false,
                }
              : { kind: 'unknown' as const },
          profileModel: '*',
          noProfile: model !== 'live-three',
        };
      },
    },
  };
  const args: GateArgs = {
    stage: 'gate-0.1',
    request: 'Implement',
    taskType: TASK_TYPES[0],
    depth: 'Full',
    phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
  };
  const phase = planRoutePhases(
    args.phases,
    args,
    gathered,
    gathered.rotation,
    false,
    [],
    () => undefined,
  ).plans[0];
  expect(laneQuestion(phase).options.map((option) => option.model)).toEqual([
    'lane-default',
    'live-three',
    'live-one',
  ]);
  expect(isSendable(phase)).toBe(true);
  const empty = { ...phase, alternates: [] };
  expect(isSendable(empty)).toBe(false);
  const options = laneQuestion(phase).options;
  const outcome = {
    sent: true,
    succeeded: true,
    requestCause: null,
    notFoundDetail: null,
    answers: new Map([
      ['build', { cause: null, confidence: 0.9, choice: 'o2', proposal: null }],
    ]),
    offered: new Map([['build', options]]),
    inputTokens: null,
    outputTokens: null,
    outcomeFigures: 0,
  };
  const chosen = resolvePhase(phase, {
    mode: 'model',
    blockedCause: null,
    limited: new Set(),
    outcome,
  });
  expect(chosen).toMatchObject({
    kind: 'chosen',
    source: 'model',
    candidate: { id: 'codex' },
    selectedScore: { model: 'live-three', provenance: 'reported' },
  });
  const invalid = resolvePhase(phase, {
    mode: 'model',
    blockedCause: null,
    limited: new Set(),
    outcome: {
      ...outcome,
      answers: new Map([
        [
          'build',
          {
            cause: 'bad-output' as const,
            confidence: null,
            choice: null,
            proposal: null,
          },
        ],
      ]),
    },
  });
  expect(invalid).toMatchObject({
    kind: 'chosen',
    source: 'ranking',
    candidate: { id: 'codex' },
  });
  expect(invalid).toMatchObject({ cause: null, proposal: null });
  expect(
    resolvePhase(phase, {
      mode: 'model' as const,
      blockedCause: null,
      limited: new Set(['build']),
      outcome,
    }),
  ).toMatchObject({
    source: 'ranking',
    cause: 'question-limit',
    proposal: null,
  });
  for (const context of [
    {
      mode: 'blocked' as const,
      blockedCause: 'provider-error' as const,
      limited: new Set<string>(),
      outcome: null,
    },
    {
      mode: 'model' as const,
      blockedCause: null,
      limited: new Set<string>(),
      outcome: { ...outcome, sent: false, requestCause: 'timeout' as const },
    },
    {
      mode: 'model' as const,
      blockedCause: null,
      limited: new Set<string>(),
      outcome: {
        ...outcome,
        answers: new Map([
          [
            'build',
            {
              cause: 'bad-output' as const,
              confidence: null,
              choice: 'o9',
              proposal: { option: 'o9', confidence: null },
            },
          ],
        ]),
      },
    },
  ]) {
    expect(resolvePhase(phase, context)).toMatchObject({
      source: 'ranking',
      cause: null,
      proposal: null,
    });
  }
  const bandGathered: GatheredCall = {
    ...gathered,
    models: new Map([
      [
        'codex',
        {
          models: [
            { id: 'low-a', provenance: 'reported' },
            { id: 'low-b', provenance: 'reported' },
            { id: 'good-c', provenance: 'reported' },
          ],
        },
      ],
    ]),
    matrix: {
      ...gathered.matrix,
      resolve: (family, model, taskKind) => {
        const low = model.startsWith('low-');
        const value = low ? 40 : 50;
        return {
          family,
          model,
          taskKind,
          score: value,
          cell: low
            ? {
                kind: 'value' as const,
                score: value,
                source: 'seed' as const,
                asOf: '2026-02-19',
                stale: false,
              }
            : { kind: 'unknown' as const },
          profileModel: '*',
          noProfile: !low,
        };
      },
    },
  };
  const bandPhase = planRoutePhases(
    args.phases,
    args,
    bandGathered,
    bandGathered.rotation,
    false,
    [],
    () => undefined,
  ).plans[0];
  expect(laneQuestion(bandPhase).options.map((option) => option.model)).toEqual(
    ['lane-default', 'good-c'],
  );
  const fallbackOnly: GatheredCall = {
    ...gathered,
    lanes: [{ ...lane, id: 'cursor', cli: 'cursor', family: 'cursor' }],
    models: new Map([
      [
        'cursor',
        { models: [{ id: 'cursor-fallback', provenance: 'fallback' }] },
      ],
    ]),
  };
  const cursorPhase = planRoutePhases(
    args.phases,
    args,
    fallbackOnly,
    fallbackOnly.rotation,
    false,
    [],
    () => undefined,
  ).plans[0];
  expect(cursorPhase.ranked[0].scored).toMatchObject({
    model: 'lane-default',
    provenance: 'lane-default',
  });
});

it('scores a subagent with the policy tier and keeps a lane configured model', () => {
  const lane = {
    kind: 'lane' as const,
    id: 'codex',
    cli: 'codex' as const,
    family: 'codex',
    installed: true,
    disabled: false,
    limitState: 'unknown' as const,
  };
  const gathered: GatheredCall = {
    lanes: [lane],
    roles: ['legacy-role'],
    rotation: { version: 1, entries: [] },
    rotationUnavailable: false,
    missing: [],
    detailReasons: [],
    models: new Map([
      [
        'codex',
        {
          models: [],
          configuredModel: {
            id: 'configured-lane-model',
            provenance: 'configured' as const,
          },
        },
      ],
    ]),
    matrix: {
      reasons: [],
      outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family,
        model,
        taskKind,
        score: 50,
        cell: { kind: 'unknown' as const },
        profileModel: model,
        noProfile: true,
      }),
    },
  };
  const args: GateArgs = {
    stage: 'gate-0.1',
    request: 'Implement a small change',
    taskType: TASK_TYPES[0],
    depth: 'Full',
    phases: [
      {
        id: 'small',
        kind: 'implement',
        role: 'legacy-role',
        shape: 'mechanical',
        weight: 3999,
      },
      {
        id: 'missing',
        kind: 'implement',
        role: 'legacy-role',
        shape: 'logic',
        weight: 8000,
      },
      {
        id: 'pinned',
        kind: 'implement',
        role: 'legacy-role',
        shape: 'mechanical',
        weight: 3999,
      },
    ],
    pins: [
      { phaseId: 'missing', executor: 'absent' },
      { phaseId: 'pinned', executor: 'subagent:legacy-role', model: 'haiku' },
    ],
  };
  const { plans } = planRoutePhases(
    args.phases,
    args,
    gathered,
    gathered.rotation,
    false,
    [],
    () => undefined,
  );
  expect(plans[0].policy).toEqual({
    tier: 'haiku',
    effort: 'low',
    ruleId: 'R4',
    condition: 'R4 shape=mechanical weight<4000',
  });
  expect(
    plans[0].ranked.find((row) => row.candidate.kind === 'subagent')?.scored
      .model,
  ).toBe('haiku');
  expect(
    plans[0].ranked.find((row) => row.candidate.kind === 'lane')?.scored.model,
  ).toBe('configured-lane-model');
  expect(plans[1].constraint.status).toBe('unavailable');
  expect(plans[1].policy).toEqual({
    tier: 'opus',
    effort: 'xhigh',
    ruleId: 'R3',
    condition: 'R3 shape=logic weight>=8000',
  });
  expect(plans[2].ranked[0].scored.model).toBe('haiku');
  expect(plans[2].ranked[0].scored.provenance).toBe('tier');
});

interface SubagentPhaseHints {
  readonly shape?: 'mechanical';
  readonly weight?: number;
}

function subagentPlan(hints: SubagentPhaseHints, pinModel?: string): PhasePlan {
  const gathered: GatheredCall = {
    lanes: [],
    roles: ['legacy-role'],
    rotation: { version: 1, entries: [] },
    rotationUnavailable: false,
    missing: [],
    detailReasons: [],
    models: new Map(),
    matrix: {
      reasons: [],
      outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family,
        model,
        taskKind,
        score: 50,
        cell: { kind: 'unknown' as const },
        profileModel: model,
        noProfile: true,
      }),
    },
  };
  const args: GateArgs = {
    stage: 'gate-0.1',
    request: 'Implement a small change',
    taskType: TASK_TYPES[0],
    depth: 'Full',
    phases: [
      {
        id: 'small',
        kind: 'implement',
        role: 'legacy-role',
        ...(hints.shape === undefined ? {} : { shape: hints.shape }),
        ...(hints.weight === undefined ? {} : { weight: hints.weight }),
      },
    ],
    ...(pinModel === undefined
      ? {}
      : {
          pins: [
            {
              phaseId: 'small',
              executor: 'subagent:legacy-role',
              model: pinModel,
            },
          ],
        }),
  };
  return planRoutePhases(
    args.phases,
    args,
    gathered,
    gathered.rotation,
    false,
    [],
    () => undefined,
  ).plans[0];
}

it('scores an unpinned subagent on a light R4 phase with the haiku tier', () => {
  const phase = subagentPlan({ shape: 'mechanical', weight: 2000 });
  expect(phase.policy).toEqual({
    tier: 'haiku',
    effort: 'low',
    ruleId: 'R4',
    condition: 'R4 shape=mechanical weight<4000',
  });
  expect(phase.ranked[0].scored).toMatchObject({
    model: 'haiku',
    provenance: 'tier',
  });
});

it('uses the R4 middle bucket for a mechanical phase without a weight', () => {
  const phase = subagentPlan({ shape: 'mechanical' });
  expect(phase.policy).toEqual({
    tier: 'sonnet',
    effort: 'medium',
    ruleId: 'R4',
    condition: 'R4 shape=mechanical weight omitted',
  });
  expect(phase.shape).toBe('mechanical');
  expect(phase.weight).toBeUndefined();
  expect(phase.ranked[0].scored).toMatchObject({
    model: 'sonnet',
    provenance: 'tier',
  });
});

it('uses R5 for a weight-only phase and carries the weight on the plan', () => {
  const phase = subagentPlan({ weight: 9000 });
  expect(phase.policy).toEqual({
    tier: 'opus',
    effort: 'high',
    ruleId: 'R5',
    condition: 'R5 shape=unset weight>=8000',
  });
  expect(phase.shape).toBeUndefined();
  expect(phase.weight).toBe(9000);
  expect(phase.ranked[0].scored).toMatchObject({
    model: 'opus',
    provenance: 'tier',
  });
});

it('applies a haiku subagent pin as a tier pin on a light R4 phase', () => {
  const phase = subagentPlan({ shape: 'mechanical', weight: 2000 }, 'haiku');
  expect(phase.constraint).toMatchObject({
    status: 'eligible',
    pinAccepted: true,
  });
  expect(phase.ranked[0].scored).toMatchObject({
    model: 'haiku',
    provenance: 'tier',
  });
});

it('applies a sonnet subagent pin over a light R4 policy tier', () => {
  const phase = subagentPlan({ shape: 'mechanical', weight: 2000 }, 'sonnet');
  expect(phase.policy).toEqual({
    tier: 'haiku',
    effort: 'low',
    ruleId: 'R4',
    condition: 'R4 shape=mechanical weight<4000',
  });
  expect(phase.constraint).toMatchObject({
    status: 'eligible',
    pinAccepted: true,
  });
  expect(phase.ranked[0].scored).toMatchObject({
    model: 'sonnet',
    provenance: 'tier',
  });
});

it('applies an unlisted haiku pin over the selected sonnet tier', () => {
  const phase = subagentPlan({}, 'haiku');
  expect(phase.policy).toEqual({
    tier: 'sonnet',
    effort: 'medium',
    ruleId: 'R5',
    condition: 'R5 shape=unset weight omitted',
  });
  expect(phase.constraint).toMatchObject({
    status: 'eligible',
    pinAccepted: true,
  });
  expect(phase.ranked[0].scored).toMatchObject({
    model: 'haiku',
    provenance: 'tier',
  });
});

it('ignores a subagent pin model that is not a tier alias', () => {
  const phase = subagentPlan(
    { shape: 'mechanical', weight: 2000 },
    'gpt-unlisted',
  );
  expect(phase.constraint).toMatchObject({
    status: 'eligible',
    pinAccepted: true,
  });
  expect(phase.ranked[0].scored).toMatchObject({
    model: 'haiku',
    provenance: 'tier',
  });
});

it('falls back to ranking when the band has one member', () => {
  const phase = plan([80, 70, 60]);
  expect(laneQuestion(phase).options).toHaveLength(1);
  expect(isSendable(phase)).toBe(false);
});

describe('B07 additive totals, routing rules, AM3 override, and AM4 model refinement', () => {
  function seedCell(score: number) {
    return {
      kind: 'value' as const,
      score,
      source: 'seed' as const,
      asOf: '2026-02-19',
      stale: false,
    };
  }

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
      models: new Map(),
      matrix: {
        reasons: [],
        outcomeFigures: () => null,
        resolve: (family, model, taskKind) => {
          const key = `${family}:${model}`;
          const value = scores[key] ?? scores[family];
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
          const cell = seedCell(value);
          return {
            family,
            model,
            taskKind,
            layers: { seed: cell },
            score: value,
            cell,
            profileModel: model === 'lane-default' ? '*' : model,
            noProfile: false,
          };
        },
      },
      ...extra,
    };
  }

  it('uses additive total for the model-offer band so preferred or confirmed-room picks are not dropped (finding #3)', () => {
    const lanes = [makeLane('codex'), makeLane('grok'), makeLane('opencode')];
    const gathered = makeGathered(lanes, {
      codex: 80,
      opencode: 78,
      grok: 70,
    });
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
      preferences: { prefer: ['grok'] },
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

    // grok: 70 + 5 (explore) + 12 (pref) = 87; codex: 80 + 5 = 85; opencode: 78 + 5 = 83
    expect(planned.spread?.pick?.candidate.id).toBe('grok');
    expect(planned.ranked.map((r) => [r.candidate.id, r.scored.total])).toEqual(
      [
        ['grok', 87],
        ['codex', 85],
        ['opencode', 83],
      ],
    );
    const question = laneQuestion(planned);
    expect(question.options.map((option) => option.laneId)).toEqual([
      'grok',
      'codex',
      'opencode',
    ]);
    expect(question.options.map((option) => option.score)).toEqual([87, 85, 83]);

    // Limit adjustment case: near-limit (-10) drops codex/opencode below confirmed-room grok.
    const limitLanes = [
      makeLane('codex', { limitState: 'near-limit' }),
      makeLane('opencode', { limitState: 'near-limit' }),
      makeLane('grok', { limitState: 'confirmed-room' }),
    ];
    const limitGathered = makeGathered(limitLanes, {
      codex: 80,
      opencode: 79,
      grok: 74,
    });
    const limitPlanned = planRoutePhases(
      args.phases,
      { ...args, preferences: undefined },
      limitGathered,
      limitGathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];

    // grok: 74 + 5 + 0 = 79; codex: 80 + 5 - 10 = 75; opencode: 79 + 5 - 10 = 74
    expect(limitPlanned.spread?.pick?.candidate.id).toBe('grok');
    expect(laneQuestion(limitPlanned).options.map((o) => o.laneId)).toEqual([
      'grok',
      'codex',
      'opencode',
    ]);
  });

  it('expresses AM3 builtin design/visual-review override as named part reaching total 100 and yields to a rule or pin', () => {
    const lanes = [makeLane('codex')];
    const gathered = makeGathered(lanes, { codex: 85 });
    const baseArgs: GateArgs = {
      stage: 'gate-0.1',
      request: 'Review screenshots',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'look', kind: 'visual-review' }],
    };

    const defaultPlan = planRoutePhases(
      baseArgs.phases,
      baseArgs,
      gathered,
      gathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];

    const subagent = defaultPlan.ranked.find(
      (row) => row.candidate.kind === 'subagent',
    );
    expect(defaultPlan.spread?.pick?.candidate.kind).toBe('subagent');
    expect(subagent?.scored.total).toBe(100);
    expect(subagent?.scored.parts).toMatchObject({
      limit: -5,
      override: 50,
      overrideLabel: BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL,
    });
    // Codex has total 90 (85 + 5), so 100 - 90 = 10 > 5: subagent wins cleanly outside band.
    expect(laneQuestion(defaultPlan).options.map((o) => o.laneId)).toEqual([
      'subagent:visual-review',
    ]);

    // A matching routing rule suppresses the builtin override and wins over it.
    const rule: RoutingRule = {
      id: 'prefer-codex-visual',
      match: { kind: 'visual-review' },
      set: { maxTier: 'sonnet', effort: 'high', prefer: ['codex'] },
    };
    const rulePlan = planRoutePhases(
      baseArgs.phases,
      baseArgs,
      gathered,
      gathered.rotation,
      false,
      [],
      () => undefined,
      false,
      undefined,
      { rules: [rule] },
    ).plans[0];

    const subagentUnderRule = rulePlan.ranked.find(
      (row) => row.candidate.kind === 'subagent',
    );
    expect(subagentUnderRule?.scored.parts?.override).toBeUndefined();
    expect(subagentUnderRule?.scored.parts?.overrideLabel).toBeUndefined();
    expect(rulePlan.spread?.pick?.candidate.id).toBe('codex');
    expect(rulePlan.policy).toMatchObject({ tier: 'sonnet', effort: 'high' });
    expect(rulePlan.policyRuleNote).toBe(
      'rule prefer-codex-visual capped tier opus->sonnet',
    );

    // An accepted pin also suppresses the builtin override.
    const pinPlan = planRoutePhases(
      baseArgs.phases,
      { ...baseArgs, pins: [{ phaseId: 'look', executor: 'codex' }] },
      gathered,
      gathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    expect(pinPlan.ranked[0].candidate.id).toBe('codex');
    expect(
      pinPlan.ranked.find((r) => r.candidate.kind === 'subagent')?.scored.parts
        ?.override,
    ).toBeUndefined();

    // Call preference for the design subagent keeps total at 100, preserves parts sum, and keeps a 97 competitor in band.
    const designArgs: GateArgs = {
      stage: 'gate-0.1',
      request: 'Design UI',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'design-ui', kind: 'design' }],
      preferences: { prefer: ['subagent:design'] },
    };
    const closeGathered = makeGathered([makeLane('codex')], { codex: 92 });
    const designPlan = planRoutePhases(
      designArgs.phases,
      designArgs,
      closeGathered,
      closeGathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    const designSubagent = designPlan.ranked.find(
      (row) => row.candidate.id === 'subagent:design',
    );
    const designCodex = designPlan.ranked.find(
      (row) => row.candidate.id === 'codex',
    );
    expect(designSubagent?.scored.total).toBe(100);
    expect(designSubagent?.scored.parts).toMatchObject({
      prior: 50,
      learned: 5,
      preference: 12,
      limit: -5,
      override: 38,
      overrideLabel: BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL,
    });
    const designParts = designSubagent?.scored.parts;
    expect(
      designParts
        ? designParts.prior +
            designParts.learned +
            designParts.preference +
            designParts.limit +
            (designParts.override ?? 0)
        : null,
    ).toBe(100);
    expect(designCodex?.scored.total).toBe(97);
    expect(designPlan.spread?.preferenceChangedChoice).toBe(false);
    expect(laneQuestion(designPlan).options.map((o) => [o.laneId, o.score])).toEqual([
      ['subagent:design', 100],
      ['codex', 97],
    ]);
  });

  it('applies routing rule prefer, exclude, tier clamp, effort override, and emits unknown/ambiguous diagnostics', () => {
    const lanes = [
      makeLane('codex', { preferredRank: 1 }),
      makeLane('grok'),
      makeLane('kimi-cli'),
      makeLane('opencode', { family: 'shared-fam' }),
      makeLane('cursor', { family: 'shared-fam' }),
    ];
    const gathered = makeGathered(lanes, {
      codex: 70,
      grok: 70,
      'kimi-cli': 70,
      'shared-fam': 70,
    });
    const rule: RoutingRule = {
      id: 'ui-review',
      match: { kind: 'implement', shape: 'logic', taskType: 'FEATURE' },
      set: {
        maxTier: 'sonnet',
        effort: 'xhigh',
        prefer: ['Kimi Code'],
        exclude: ['grok', 'missing-agent', 'shared-fam'],
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
      { rules: [rule], diagnostics: ['routing rule bad: ignored'] },
    ).plans[0];

    // Policy clamped from opus to sonnet, effort stayed xhigh.
    expect(planned.policy).toMatchObject({
      ruleId: 'R3',
      tier: 'sonnet',
      effort: 'xhigh',
      condition: 'R3 shape=logic weight>=8000',
    });
    expect(planned.matchedRule?.id).toBe('ui-review');
    expect(planned.policyRuleNote).toBe(
      'rule ui-review capped tier opus->sonnet',
    );
    // grok excluded by user-rule:ui-review; full inventory still retained.
    expect(planned.inventory?.map((c) => c.id)).toEqual([
      'codex',
      'grok',
      'kimi-cli',
      'opencode',
      'cursor',
    ]);
    expect(planned.constraint.excluded).toContainEqual({
      candidate: 'grok',
      rule: 'user-rule:ui-review',
    });
    // Rule prefer ('Kimi Code' -> kimi-cli) beats call prefer ('codex') and configured rank.
    expect(planned.spread?.preferenceSource).toBe('rule');
    expect(planned.spread?.overriddenPreferenceSources).toEqual([
      'call',
      'configured',
    ]);
    expect(planned.spread?.pick?.candidate.id).toBe('kimi-cli');
    expect(planned.ruleDiagnostics).toEqual([
      'routing rule bad: ignored',
      'routing rule ui-review: exclude selector "missing-agent" matched no candidate',
      'routing rule ui-review: exclude selector "shared-fam" is ambiguous (cursor, opencode)',
    ]);
  });

  it('retains full inventory and ranked totals on pinned phases and lets pin beat user exclusion and tier clamp', () => {
    const lanes = [makeLane('codex'), makeLane('grok')];
    const gathered = makeGathered(lanes, { codex: 60, grok: 80 });
    const rule: RoutingRule = {
      id: 'cap-sonnet',
      match: { kind: 'implement' },
      set: { maxTier: 'sonnet', effort: 'high', exclude: ['codex'] },
    };
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [
        { id: 'build', kind: 'implement', shape: 'logic', weight: 9000 },
      ],
      pins: [{ phaseId: 'build', executor: 'codex' }],
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
    ).plans[0];

    expect(planned.constraint).toMatchObject({
      status: 'eligible',
      pinAccepted: true,
    });
    expect(planned.inventory?.map((c) => c.id)).toEqual([
      'codex',
      'grok',
      'subagent:implement',
    ]);
    // Pinned candidate is first in `ranked`, while non-excluded alternatives retain additive totals.
    expect(planned.ranked[0].candidate.id).toBe('codex');
    expect(planned.ranked.map((r) => r.candidate.id)).toEqual([
      'codex',
      'grok',
      'subagent:implement',
    ]);
    expect(planned.rankedByTotal?.map((r) => r.candidate.id)).toEqual([
      'grok',
      'codex',
      'subagent:implement',
    ]);
    expect(planned.ranked[1].scored.total).toBe(85);
    expect(planned.policy.effort).toBe('high');
  });

  it('records AM4 model refinement when the model picks another offered executor and preserves deadline fallback on alternates-only phases', () => {
    const lanes = [makeLane('codex'), makeLane('grok')];
    const gathered = makeGathered(lanes, { codex: 80, grok: 78 });
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
    const options = laneQuestion(planned).options;
    const modelChoice = resolvePhase(planned, {
      mode: 'model',
      blockedCause: null,
      limited: new Set(),
      outcome: {
        sent: true,
        succeeded: true,
        requestCause: null,
        notFoundDetail: null,
        answers: new Map([
          ['build', { cause: null, confidence: 0.85, choice: 'o2', proposal: null }],
        ]),
        offered: new Map([['build', options]]),
        inputTokens: 10,
        outputTokens: 2,
        outcomeFigures: 0,
      },
    });
    expect(modelChoice).toMatchObject({
      kind: 'chosen',
      source: 'model',
      candidate: { id: 'grok' },
      modelRefined: true,
    });

    // Deadline fallback takes precedence over alternates-only suppression.
    const altGathered = makeGathered(
      [makeLane('codex')],
      { codex: 70, 'codex:alt-1': 69 },
      {
        models: new Map([
          ['codex', { models: [{ id: 'alt-1', provenance: 'reported' }], status: 'ok' }],
        ]),
      },
    );
    const altPlan = planRoutePhases(
      args.phases,
      args,
      altGathered,
      altGathered.rotation,
      false,
      [],
      () => undefined,
      false,
    ).plans[0];
    expect(laneQuestion(altPlan).primaryCount).toBe(1);
    expect(isSendable(altPlan)).toBe(true);
    const deadlineRes = resolvePhase(altPlan, {
      mode: 'model',
      blockedCause: null,
      limited: new Set(),
      outcome: {
        sent: false,
        succeeded: false,
        requestCause: 'deadline',
        notFoundDetail: null,
        answers: new Map(),
        offered: new Map(),
        inputTokens: null,
        outputTokens: null,
        outcomeFigures: 0,
      },
    });
    expect(deadlineRes).toMatchObject({
      kind: 'chosen',
      source: 'ranking',
      cause: 'deadline',
    });

    // Question-limit skip is also preserved through alternates-only suppression.
    const limitedRes = resolvePhase(altPlan, {
      mode: 'model',
      blockedCause: null,
      limited: new Set(['build']),
      outcome: null,
    });
    expect(limitedRes).toMatchObject({
      kind: 'chosen',
      source: 'ranking',
      cause: 'question-limit',
      proposal: null,
    });

    // Offer dispositions with no dispatch have no prunedCause.
    const noDispatch = computeLaneOfferDispositions(planned, null);
    expect(noDispatch.get('codex')).toEqual({
      candidateId: 'codex',
      inBand: true,
      offered: false,
    });
  });

  it('truncates long exclude selector snippets, caps ambiguous match lists, and computes exclusion counterfactuals', () => {
    const lanes = [
      makeLane('codex', { family: 'shared-fam' }),
      makeLane('grok', { family: 'shared-fam' }),
      makeLane('opencode', { family: 'shared-fam' }),
      makeLane('cursor', { family: 'shared-fam' }),
      makeLane('kimi-cli', { family: 'shared-fam' }),
    ];
    const gathered = makeGathered(lanes, {
      'shared-fam': 70,
    });
    const longSelector = 'x'.repeat(200);
    const rule: RoutingRule = {
      id: 'bounded-diag',
      match: { kind: 'implement' },
      set: {
        exclude: [longSelector, 'shared-fam', 'kimi-cli'],
      },
    };
    const args: GateArgs = {
      stage: 'gate-0.1',
      request: 'Implement',
      taskType: 'FEATURE',
      depth: 'Full',
      phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
    };

    // With no cursor, codex beats kimi-cli by ordinal id -> excluding kimi-cli did not change the pick.
    const nonDecisive = planRoutePhases(
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
    ).plans[0];
    expect(nonDecisive.ruleExclusionChangedChoice).toBe(false);
    expect(nonDecisive.ruleDiagnostics).toEqual([
      `routing rule bounded-diag: exclude selector "${'x'.repeat(45)}..." matched no candidate`,
      'routing rule bounded-diag: exclude selector "shared-fam" is ambiguous (codex, cursor, grok, and 2 more)',
    ]);

    // With incoming cursor on grok, next in band would be kimi-cli -> excluding kimi-cli changes the pick to opencode.
    const decisive = planRoutePhases(
      args.phases,
      args,
      gathered,
      { version: 1, entries: [{ key: 'build|implement', candidateId: 'grok' }] },
      false,
      [],
      () => undefined,
      true,
      undefined,
      { rules: [rule] },
    ).plans[0];
    expect(decisive.spread?.pick?.candidate.id).toBe('opencode');
    expect(decisive.ruleExclusionChangedChoice).toBe(true);
  });
});
