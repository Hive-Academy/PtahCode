import { toSubagentCandidate } from '../ranking/candidate.types';
import type { PhasePlan } from './phase-plan';
import { laneQuestion } from './phase-plan';
import { isSendable, resolvePhase } from './phase-resolve';
import { TASK_TYPES } from '@ptah-extension/shared';
import type { GatheredCall } from './gather';
import { candidatesFor, planRoutePhases, type GateArgs } from './phase-plan';

it('offers the new child session kind only when its caller is eligible', () => {
  const gathered: GatheredCall = {
    lanes: [], roles: [], childSessionEligible: true,
    rotation: { version: 1, entries: [] }, rotationUnavailable: false,
    models: new Map(), missing: [], detailReasons: [],
    matrix: {
      reasons: [], outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family, model, taskKind, score: 50, cell: { kind: 'unknown' as const },
        profileModel: '*', noProfile: true,
      }),
    },
  };
  const phase = { id: 'build', kind: 'implement' } as GateArgs['phases'][number];
  expect(candidatesFor(phase, gathered).map((candidate) => candidate.id)).toContain('child-session');
  expect(candidatesFor(phase, { ...gathered, childSessionEligible: false }).map((candidate) => candidate.id))
    .not.toContain('child-session');
});
import { policyForPhase } from './tier-effort-policy';

function plan(scores: readonly number[]): PhasePlan {
  const candidates = scores.map((_, index) => toSubagentCandidate(`role-${index}`));
  return {
    phaseId: 'build', kind: 'implement', taskKind: 'implement',
    policy: policyForPhase('implement'),
    constraint: { phaseId: 'build', status: 'eligible', eligible: candidates, excluded: [], pinAccepted: false },
    spread: null,
    ranked: candidates.map((candidate, index) => ({
      candidate,
      scored: { candidate, model: 'auto', provenance: 'lane-default', score: scores[index], cell: { kind: 'unknown' }, profileModel: '*', noProfile: true },
    })),
  };
}

it('returns no decision options for an empty ranked list', () => {
  expect(laneQuestion(plan([]))).toMatchObject({ primaryCount: 0, options: [] });
  expect(isSendable(plan([]))).toBe(false);
});

it('offers only the five-point band to the decision model', () => {
  const phase = plan([80, 76, 70]);
  expect(laneQuestion(phase).options.map((option) => option.score)).toEqual([80, 76]);
  expect(isSendable(phase)).toBe(true);
});

it('ranks reported alternates before capping and keeps the system CLI default row', () => {
  const lane = {
    kind: 'lane' as const, id: 'codex', cli: 'codex' as const, family: 'codex',
    installed: true, disabled: false, limitState: 'confirmed-room' as const,
  };
  const gathered: GatheredCall = {
    lanes: [lane], roles: [], rotation: { version: 1, entries: [] },
    rotationUnavailable: false, missing: [], detailReasons: [],
    models: new Map([['codex', { models: [
      { id: 'fallback-id', provenance: 'fallback' as const },
      { id: 'live-one', provenance: 'reported' as const },
      { id: 'live-two', provenance: 'reported' as const },
      { id: 'live-three', provenance: 'reported' as const },
    ] }]]),
    matrix: {
      reasons: [], outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family, model, taskKind, score: model === 'live-three' ? 54 : 50, cell: { kind: 'unknown' as const },
        profileModel: '*', noProfile: true,
      }),
    },
  };
  const args: GateArgs = {
    stage: 'gate-0.1', request: 'Implement', taskType: TASK_TYPES[0], depth: 'Full',
    phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
  };
  const phase = planRoutePhases(args.phases, args, gathered, gathered.rotation, false, [], () => undefined).plans[0];
  expect(laneQuestion(phase).options.map((option) => option.model)).toEqual([
    'lane-default', 'live-three', 'live-one',
  ]);
  expect(isSendable(phase)).toBe(true);
  const empty = { ...phase, alternates: [] };
  expect(isSendable(empty)).toBe(false);
  const options = laneQuestion(phase).options;
  const outcome = {
    sent: true, succeeded: true, requestCause: null, notFoundDetail: null,
    answers: new Map([['build', { cause: null, confidence: 0.9, choice: 'o2', proposal: null }]]),
    offered: new Map([['build', options]]),
    inputTokens: null, outputTokens: null, outcomeFigures: 0,
  };
  const chosen = resolvePhase(phase, {
    mode: 'model', blockedCause: null, limited: new Set(), outcome,
  });
  expect(chosen).toMatchObject({ kind: 'chosen', source: 'model',
    candidate: { id: 'codex' }, selectedScore: { model: 'live-three', provenance: 'reported' } });
  const invalid = resolvePhase(phase, {
    mode: 'model', blockedCause: null, limited: new Set(),
    outcome: { ...outcome, answers: new Map([['build', {
      cause: 'bad-output' as const, confidence: null, choice: null, proposal: null,
    }]]) },
  });
  expect(invalid).toMatchObject({ kind: 'chosen', source: 'ranking', candidate: { id: 'codex' } });
  expect(invalid).toMatchObject({ cause: null, proposal: null });
  for (const context of [
    { mode: 'blocked' as const, blockedCause: 'provider-error' as const, limited: new Set<string>(), outcome: null },
    { mode: 'model' as const, blockedCause: null, limited: new Set(['build']), outcome },
    { mode: 'model' as const, blockedCause: null, limited: new Set<string>(), outcome: { ...outcome, sent: false, requestCause: 'timeout' as const } },
    { mode: 'model' as const, blockedCause: null, limited: new Set<string>(), outcome: { ...outcome, answers: new Map([['build', { cause: 'bad-output' as const, confidence: null, choice: 'o9', proposal: { option: 'o9', confidence: null } }]]) } },
  ]) {
    expect(resolvePhase(phase, context)).toMatchObject({ source: 'ranking', cause: null, proposal: null });
  }
  const bandGathered: GatheredCall = {
    ...gathered,
    models: new Map([['codex', { models: [
      { id: 'low-a', provenance: 'reported' },
      { id: 'low-b', provenance: 'reported' },
      { id: 'good-c', provenance: 'reported' },
    ] }]]),
    matrix: { ...gathered.matrix, resolve: (family, model, taskKind) => ({
      family, model, taskKind, score: model.startsWith('low-') ? 40 : 50,
      cell: { kind: 'unknown' as const }, profileModel: '*', noProfile: true,
    }) },
  };
  const bandPhase = planRoutePhases(args.phases, args, bandGathered,
    bandGathered.rotation, false, [], () => undefined).plans[0];
  expect(laneQuestion(bandPhase).options.map((option) => option.model)).toEqual([
    'lane-default', 'good-c',
  ]);
  const fallbackOnly: GatheredCall = {
    ...gathered,
    lanes: [{ ...lane, id: 'cursor', cli: 'cursor', family: 'cursor' }],
    models: new Map([['cursor', { models: [
      { id: 'cursor-fallback', provenance: 'fallback' },
    ] }]]),
  };
  const cursorPhase = planRoutePhases(args.phases, args, fallbackOnly,
    fallbackOnly.rotation, false, [], () => undefined).plans[0];
  expect(cursorPhase.ranked[0].scored).toMatchObject({
    model: 'lane-default', provenance: 'lane-default',
  });
});

it('scores a subagent with the policy tier and keeps a lane configured model', () => {
  const lane = {
    kind: 'lane' as const, id: 'codex', cli: 'codex' as const, family: 'codex',
    installed: true, disabled: false, limitState: 'unknown' as const,
  };
  const gathered: GatheredCall = {
    lanes: [lane], roles: ['legacy-role'], rotation: { version: 1, entries: [] },
    rotationUnavailable: false, missing: [], detailReasons: [],
    models: new Map([['codex', { models: [], configuredModel: { id: 'configured-lane-model', provenance: 'configured' as const } }]]),
    matrix: {
      reasons: [], outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family, model, taskKind, score: 50, cell: { kind: 'unknown' as const }, profileModel: model, noProfile: true,
      }),
    },
  };
  const args: GateArgs = {
    stage: 'gate-0.1', request: 'Implement a small change', taskType: TASK_TYPES[0], depth: 'Full',
    phases: [
      { id: 'small', kind: 'implement', role: 'legacy-role', shape: 'mechanical', weight: 3999 },
      { id: 'missing', kind: 'implement', role: 'legacy-role', shape: 'logic', weight: 8000 },
      { id: 'pinned', kind: 'implement', role: 'legacy-role', shape: 'mechanical', weight: 3999 },
    ],
    pins: [
      { phaseId: 'missing', executor: 'absent' },
      { phaseId: 'pinned', executor: 'subagent:legacy-role', model: 'haiku' },
    ],
  };
  const { plans } = planRoutePhases(args.phases, args, gathered, gathered.rotation, false, [], () => undefined);
  expect(plans[0].policy).toEqual({ tier: 'haiku', effort: 'low', ruleId: 'R4' });
  expect(plans[0].ranked.find((row) => row.candidate.kind === 'subagent')?.scored.model).toBe('haiku');
  expect(plans[0].ranked.find((row) => row.candidate.kind === 'lane')?.scored.model).toBe('configured-lane-model');
  expect(plans[1].constraint.status).toBe('unavailable');
  expect(plans[1].policy).toEqual({ tier: 'opus', effort: 'xhigh', ruleId: 'R3' });
  expect(plans[2].ranked[0].scored.model).toBe('haiku');
  expect(plans[2].ranked[0].scored.provenance).toBe('tier');
});

interface SubagentPhaseHints {
  readonly shape?: 'mechanical';
  readonly weight?: number;
}

function subagentPlan(hints: SubagentPhaseHints, pinModel?: string): PhasePlan {
  const gathered: GatheredCall = {
    lanes: [], roles: ['legacy-role'], rotation: { version: 1, entries: [] },
    rotationUnavailable: false, missing: [], detailReasons: [], models: new Map(),
    matrix: {
      reasons: [], outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family, model, taskKind, score: 50, cell: { kind: 'unknown' as const },
        profileModel: model, noProfile: true,
      }),
    },
  };
  const args: GateArgs = {
    stage: 'gate-0.1', request: 'Implement a small change',
    taskType: TASK_TYPES[0], depth: 'Full',
    phases: [{ id: 'small', kind: 'implement', role: 'legacy-role',
      ...(hints.shape === undefined ? {} : { shape: hints.shape }),
      ...(hints.weight === undefined ? {} : { weight: hints.weight }),
    }],
    ...(pinModel === undefined ? {} : {
      pins: [{ phaseId: 'small', executor: 'subagent:legacy-role', model: pinModel }],
    }),
  };
  return planRoutePhases(
    args.phases, args, gathered, gathered.rotation, false, [], () => undefined,
  ).plans[0];
}

it('scores an unpinned subagent on a light R4 phase with the haiku tier', () => {
  const phase = subagentPlan({ shape: 'mechanical', weight: 2000 });
  expect(phase.policy).toEqual({ tier: 'haiku', effort: 'low', ruleId: 'R4' });
  expect(phase.ranked[0].scored).toMatchObject({ model: 'haiku', provenance: 'tier' });
});

it('uses the R4 middle bucket for a mechanical phase without a weight', () => {
  const phase = subagentPlan({ shape: 'mechanical' });
  expect(phase.policy).toEqual({ tier: 'sonnet', effort: 'medium', ruleId: 'R4' });
  expect(phase.shape).toBe('mechanical');
  expect(phase.weight).toBeUndefined();
  expect(phase.ranked[0].scored).toMatchObject({ model: 'sonnet', provenance: 'tier' });
});

it('uses R5 for a weight-only phase and carries the weight on the plan', () => {
  const phase = subagentPlan({ weight: 9000 });
  expect(phase.policy).toEqual({ tier: 'opus', effort: 'high', ruleId: 'R5' });
  expect(phase.shape).toBeUndefined();
  expect(phase.weight).toBe(9000);
  expect(phase.ranked[0].scored).toMatchObject({ model: 'opus', provenance: 'tier' });
});

it('applies a haiku subagent pin as a tier pin on a light R4 phase', () => {
  const phase = subagentPlan({ shape: 'mechanical', weight: 2000 }, 'haiku');
  expect(phase.constraint).toMatchObject({ status: 'eligible', pinAccepted: true });
  expect(phase.ranked[0].scored).toMatchObject({ model: 'haiku', provenance: 'tier' });
});

it('applies a sonnet subagent pin over a light R4 policy tier', () => {
  const phase = subagentPlan({ shape: 'mechanical', weight: 2000 }, 'sonnet');
  expect(phase.policy).toEqual({ tier: 'haiku', effort: 'low', ruleId: 'R4' });
  expect(phase.constraint).toMatchObject({ status: 'eligible', pinAccepted: true });
  expect(phase.ranked[0].scored).toMatchObject({ model: 'sonnet', provenance: 'tier' });
});

it('applies an unlisted haiku pin over the selected sonnet tier', () => {
  const phase = subagentPlan({}, 'haiku');
  expect(phase.policy).toEqual({ tier: 'sonnet', effort: 'medium', ruleId: 'R5' });
  expect(phase.constraint).toMatchObject({ status: 'eligible', pinAccepted: true });
  expect(phase.ranked[0].scored).toMatchObject({ model: 'haiku', provenance: 'tier' });
});

it('ignores a subagent pin model that is not a tier alias', () => {
  const phase = subagentPlan({ shape: 'mechanical', weight: 2000 }, 'gpt-unlisted');
  expect(phase.constraint).toMatchObject({ status: 'eligible', pinAccepted: true });
  expect(phase.ranked[0].scored).toMatchObject({ model: 'haiku', provenance: 'tier' });
});

it('falls back to ranking when the band has one member', () => {
  const phase = plan([80, 70, 60]);
  expect(laneQuestion(phase).options).toHaveLength(1);
  expect(isSendable(phase)).toBe(false);
});
