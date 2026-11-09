import { toSubagentCandidate } from '../ranking/candidate.types';
import type { PhasePlan } from './phase-plan';
import { laneQuestion } from './phase-plan';
import { isSendable } from './phase-resolve';
import { TASK_TYPES } from '@ptah-extension/shared';
import type { GatheredCall } from './gather';
import { planRoutePhases, type GateArgs } from './phase-plan';
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

it('offers only the five-point band to the decision model', () => {
  const phase = plan([80, 76, 70]);
  expect(laneQuestion(phase).options.map((option) => option.score)).toEqual([80, 76]);
  expect(isSendable(phase)).toBe(true);
});

it('scores a subagent with the policy tier and keeps a lane configured model', () => {
  const lane = {
    kind: 'lane' as const, id: 'codex', cli: 'codex' as const, family: 'codex',
    installed: true, disabled: false, limitState: 'unknown' as const,
  };
  const gathered: GatheredCall = {
    lanes: [lane], roles: [], rotation: { version: 1, entries: [] },
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
      { id: 'small', kind: 'implement', shape: 'mechanical', weight: 3999 },
      { id: 'missing', kind: 'implement', shape: 'logic', weight: 8000 },
      { id: 'pinned', kind: 'implement', shape: 'mechanical', weight: 3999 },
    ],
    pins: [
      { phaseId: 'missing', executor: 'absent' },
      { phaseId: 'pinned', executor: 'subagent:backend-developer', model: 'haiku' },
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
    lanes: [], roles: [], rotation: { version: 1, entries: [] },
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
    phases: [{ id: 'small', kind: 'implement',
      ...(hints.shape === undefined ? {} : { shape: hints.shape }),
      ...(hints.weight === undefined ? {} : { weight: hints.weight }),
    }],
    ...(pinModel === undefined ? {} : {
      pins: [{ phaseId: 'small', executor: 'subagent:backend-developer', model: pinModel }],
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
