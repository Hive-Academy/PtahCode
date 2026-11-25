import type { LaneCandidate } from '../ranking/candidate.types';
import { assembleGateResult } from './assemble-gate';
import type { GatheredCall } from './gather';
import type { ModelRequestOutcome } from './model-refine';
import { laneQuestion, planRoutePhases, type GateArgs } from './phase-plan';
import { resolvePhase } from './phase-resolve';

it('places the ranked runner-up ahead of the tied pruned trace for MCP compaction', () => {
  const lanes = (['codex', 'grok', 'opencode'] as const).map((cli): LaneCandidate => ({
    kind: 'lane', id: cli, cli, family: cli, installed: true, disabled: false,
    limitState: 'confirmed-room',
  }));
  const gathered: GatheredCall = {
    lanes, roles: [], rotation: { version: 1, entries: [] }, rotationUnavailable: false,
    missing: [], detailReasons: [], models: new Map(),
    matrix: {
      reasons: [],
      outcomeFigures: () => null,
      resolve: (family, model, taskKind) => ({
        family, model, taskKind, cell: { kind: 'unknown' }, score: 50,
        profileModel: '*', noProfile: true,
      }),
    },
  };
  const args: GateArgs = {
    stage: 'gate-0.1', request: 'implement it', taskType: 'FEATURE', depth: 'Full',
    phases: [{ id: 'build', kind: 'implement' }],
  };
  const [plan] = planRoutePhases(
    args.phases, args, gathered, gathered.rotation, false, [], () => undefined, false,
  ).plans;
  const options = laneQuestion(plan).options;
  const [chosen, ranked, pruned] = options;
  const outcome: ModelRequestOutcome = {
    sent: true, succeeded: true, requestCause: null, notFoundDetail: null,
    answers: new Map([['build', { cause: null, choice: 'o1', confidence: 0.9, proposal: null }]]),
    offered: new Map([['build', [chosen, ranked]]]),
    prunedLanes: new Map([['build', new Map([[pruned.laneId, 'option-cap']])]]),
    inputTokens: null, outputTokens: null, outcomeFigures: 0,
  };
  const resolution = resolvePhase(plan, {
    mode: 'model', blockedCause: null, limited: new Set(), outcome,
  });
  const result = assembleGateResult(
    args, gathered, new Map([['build', plan]]), new Map([['build', resolution]]),
    (plan.inventory ?? lanes).map((candidate) => candidate.id), { requests: 1, successes: 1, input: null, output: null }, [outcome],
  );
  const trace = result.roster[0].candidates ?? [];
  const runner = trace.findIndex((entry) => entry.candidate === ranked.laneId && entry.disposition === 'ranked');
  const cutoff = trace.findIndex((entry) => entry.candidate === pruned.laneId && entry.rule === 'pruned');
  expect(runner).toBeGreaterThan(0);
  expect(cutoff).toBeGreaterThan(runner);
  expect(trace[runner].total).toBe(trace[cutoff].total);
  expect(result.roster[0].explanation).toContain(ranked.laneId);
});
