import { TASK_TYPES, type CliType } from '@ptah-extension/shared';
import type { LaneCandidate } from '../ranking/candidate.types';
import { assembleGateResult } from './assemble-gate';
import type { GatheredCall } from './gather';
import type { ModelRequestOutcome } from './model-refine';
import {
  implementersOf, laneQuestion, planRoutePhases,
  type GateArgs, type PhasePlan, type PhaseResolution,
} from './phase-plan';
import { resolvePhase } from './phase-resolve';

function lane(cli: CliType): LaneCandidate {
  return { kind: 'lane', id: cli, cli, family: cli, installed: true,
    disabled: false, limitState: 'confirmed-room' };
}

function fixture(clis: readonly CliType[] = ['codex'], alternateScore = 68) {
  const lanes = clis.map(lane);
  const gathered: GatheredCall = {
    lanes, roles: [], rotation: { version: 1, entries: [] },
    rotationUnavailable: false, missing: [], detailReasons: [],
    models: new Map(clis.map((cli) => [cli, { models: [
      { id: `${cli}-live-a`, provenance: 'reported' as const },
      { id: `${cli}-live-b`, provenance: 'reported' as const },
    ] }])),
    matrix: {
      reasons: [], outcomeFigures: () => null,
      resolve: (family, model, taskKind) => {
        const score = model.endsWith('live-a') ? alternateScore : 70;
        return {
          family, model, taskKind, score,
          cell: { kind: 'value' as const, score, source: 'seed' as const,
            asOf: '2026-02-19', stale: false },
          profileModel: '*', noProfile: false,
        };
      },
    },
  };
  const args: GateArgs = {
    stage: 'gate-0.1', request: 'Implement', taskType: TASK_TYPES[0], depth: 'Full',
    phases: [{ id: 'build', kind: 'implement', role: 'custom-role' }],
  };
  const plan = planRoutePhases(args.phases, args, gathered, gathered.rotation,
    false, [], () => undefined).plans[0];
  return { gathered, args, plan };
}

function outcome(plan: PhasePlan, choice: string | null,
  requestCause: ModelRequestOutcome['requestCause'] = null,
  sent = true): ModelRequestOutcome {
  return {
    sent, succeeded: requestCause === null, requestCause, notFoundDetail: null,
    answers: new Map([[plan.phaseId, {
      cause: choice === null ? 'bad-output' as const : null,
      confidence: choice === null ? null : 0.9,
      choice, proposal: null,
    }]]),
    offered: new Map([[plan.phaseId, laneQuestion(plan).options]]),
    inputTokens: null, outputTokens: null, outcomeFigures: 0,
  };
}

function assembled(f: ReturnType<typeof fixture>, resolution: PhaseResolution,
  request: ModelRequestOutcome | null = null) {
  return assembleGateResult(f.args, f.gathered,
    new Map([[f.plan.phaseId, f.plan]]),
    new Map([[f.plan.phaseId, resolution]]),
    f.gathered.lanes.map((entry) => entry.id),
    { requests: 0, input: null, output: null, successes: 0 },
    [request]);
}

it.each(['claude', 'ptah-cli'] as const)('%s does not offer alternates', (cli) => {
  const f = fixture([cli]);
  expect(laneQuestion(f.plan).options).toHaveLength(1);
});

it('keeps deterministic roster fields for ranking, unsent, timeout, invalid and primary choices', () => {
  const f = fixture();
  const baseline = resolvePhase(f.plan, {
    mode: 'ranking', blockedCause: null, limited: new Set(), outcome: null,
  });
  const baselineRow = assembled(f, baseline).roster[0];
  for (const request of [
    outcome(f.plan, 'o2', null, false),
    outcome(f.plan, 'o2', 'timeout'),
    outcome(f.plan, null),
    outcome(f.plan, 'o1'),
  ]) {
    const resolution = resolvePhase(f.plan, {
      mode: 'model', blockedCause: null, limited: new Set(), outcome: request,
    });
    expect(resolution).not.toHaveProperty('selectedScore');
    const row = assembled(f, resolution, request).roster[0];
    expect(row).toMatchObject({ model: baselineRow.model,
      provenance: baselineRow.provenance });
  }
  expect(baseline).not.toHaveProperty('selectedScore');
});

it('assembles a selected alternate with its exact id, provenance, score and reason', () => {
  const f = fixture();
  const request = outcome(f.plan, 'o2');
  const resolution = resolvePhase(f.plan, {
    mode: 'model', blockedCause: null, limited: new Set(), outcome: request,
  });
  const row = assembled(f, resolution, request).roster[0];
  expect(row).toMatchObject({ status: 'chosen', model: 'codex-live-b',
    provenance: 'reported', score: 70 });
  expect(row.reason).toContain('model codex-live-b');
});

it('keeps primaries ahead of alternates when only two options fit', () => {
  const f = fixture(['codex', 'grok']);
  expect(laneQuestion(f.plan).options.map((option) => option.laneId)).toEqual([
    'codex', 'grok', 'codex', 'codex', 'grok', 'grok',
  ]);
  expect(laneQuestion(f.plan).options.slice(0, 2).map((option) => option.model)).toEqual([
    'lane-default', 'lane-default',
  ]);
});

it('does not offer alternates outside the top score band', () => {
  const f = fixture(['codex'], 60);
  expect(laneQuestion(f.plan).options.map((option) => option.model)).toEqual([
    'lane-default', 'codex-live-b',
  ]);
});

it('excludes the implementer lane from review after either model choice', () => {
  const f = fixture(['codex', 'grok']);
  for (const choice of ['o1', 'o3']) {
    const implement = resolvePhase(f.plan, {
      mode: 'model', blockedCause: null, limited: new Set(),
      outcome: outcome(f.plan, choice),
    });
    const reviewArgs: GateArgs = { ...f.args, phases: [
      f.args.phases[0],
      { id: 'review', kind: 'review', reviews: ['build'], role: 'custom-role' },
    ] };
    const review = planRoutePhases(reviewArgs.phases.slice(1), reviewArgs,
      f.gathered, f.gathered.rotation, false,
      implementersOf([f.plan], new Map([['build', implement]])),
      () => undefined).plans[0];
    expect(review.constraint.excluded).toContainEqual({
      candidate: 'codex', rule: 'reviewer-family',
    });
    expect(review.ranked.map((entry) => entry.candidate.id)).toEqual(['grok']);
  }
});
