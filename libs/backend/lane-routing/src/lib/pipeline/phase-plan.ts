/**
 * Phase planning for one route-decide call: candidates, constraints,
 * scores, and spread order.
 */
import {
  LANE_DEFAULT_MODEL,
  type LaneLimitState,
  type OutcomeTaskKind,
} from '@ptah-extension/shared';

import type { SystemOneTarget } from '../decision-model/decision-model.config';
import { insideClosenessBand } from '../ranking/closeness-band';
import type { DecisionModelSelection } from '../decision-model/decision-model.types';
import type { DecisionOption } from '../decision-model/decision-payload';
import type { RouteDecideArgs } from '../contracts/route-decide-args.schema';
import type { GatheredCall } from './gather';
import { ModelTierSchema } from '../contracts/route-decide-result.schema';
import type { LaneQuestion, ModelRequestOutcome } from './model-refine';
import { resolvePhase } from './phase-resolve';
import {
  isSystemCliLane,
  toSubagentCandidate,
  type RoutingCandidate,
} from '../ranking/candidate.types';
import {
  constrainPhase,
  REVIEW_PHASE_KINDS,
  type ConstrainPhaseInput,
  type KnownPhaseExecutor,
  type PhaseConstraintResult,
  type PhaseKind,
} from '../ranking/hard-constraints';
import { score, type CandidateScore } from '../ranking/score';
import { spread, type SpreadResult } from '../ranking/spread';
import type { FallbackCause } from '../reasons/compile-reasons';
import { policyForPhase, type PhasePolicy } from './tier-effort-policy';
import { LANE_MODEL_ALTERNATES_CAP } from '../routing-constants';
import { AUTOMATIC_MATRIX_MODEL } from '../matrix/local-derivation';

const LANE_INSTRUCTIONS = 'Choose the executor for this phase. Each score already includes past outcomes; pastOutcomes lists the delivered and failed run counts behind it. No entry means no verified runs were available for that executor in the outcome window.';

/** Built-in subagent role for a phase kind (part A, Assumption A4). */
const DEFAULT_ROLE: Readonly<Partial<Record<PhaseKind, string>>> = {
  plan: 'project-manager',
  architecture: 'software-architect',
  implement: 'backend-developer',
  review: 'code-logic-reviewer',
  'document-review': 'code-logic-reviewer',
  research: 'researcher-expert',
  tests: 'senior-tester',
  docs: 'technical-content-writer',
  'visual-review': 'visual-reviewer',
  design: 'ui-ux-designer',
};

export const BUILTIN_SUBAGENT_ROLES: ReadonlySet<string> = new Set(
  Object.values(DEFAULT_ROLE),
);

export type GateArgs = Extract<RouteDecideArgs, { stage: 'gate-0.1' }>;

type GatePhase = GateArgs['phases'][number];

export type OpenedCaller =
  | { readonly kind: 'unset' }
  | { readonly kind: 'blocked'; readonly cause: FallbackCause }
  | {
      readonly kind: 'system-one';
      /** The selection the target was resolved for (404 re-check identity). */
      readonly selection: DecisionModelSelection;
      readonly target: SystemOneTarget;
      readonly provider: 'ollama' | 'jev';
    }
  | {
      readonly kind: 'structured';
      readonly providerId: string;
      readonly model: string;
    };

export type DispatchMode = 'ranking' | 'blocked' | 'model';

export interface ScoredCandidate {
  readonly candidate: RoutingCandidate;
  readonly scored: CandidateScore;
}

export interface PhasePlan {
  readonly phaseId: string;
  readonly kind: PhaseKind;
  readonly hasExplicitRole?: boolean;
  readonly taskKind: OutcomeTaskKind;
  readonly shape?: GatePhase['shape'];
  readonly weight?: GatePhase['weight'];
  readonly policy: PhasePolicy;
  readonly constraint: PhaseConstraintResult;
  readonly ranked: readonly ScoredCandidate[];
  readonly alternates?: readonly AlternateOption[];
  readonly spread: SpreadResult | null;
}

interface AlternateOption {
  readonly option: DecisionOption;
  readonly scored: CandidateScore;
}

export interface ChosenResolution {
  readonly kind: 'chosen';
  readonly source: 'model' | 'ranking' | 'pin';
  readonly candidate: RoutingCandidate;
  readonly selectedScore?: CandidateScore;
  readonly cause: FallbackCause | null;
  readonly proposal: {
    readonly option: string;
    readonly confidence: number | null;
  } | null;
  readonly reported: number | null;
}

export interface UnavailableResolution {
  readonly kind: 'unavailable';
}

export type PhaseResolution = ChosenResolution | UnavailableResolution;

export interface PassContext {
  readonly mode: DispatchMode;
  readonly blockedCause: FallbackCause | null;
  readonly limited: ReadonlySet<string>;
  readonly outcome: ModelRequestOutcome | null;
}

export function planRoutePhases(
  phases: readonly GatePhase[],
  args: GateArgs,
  gathered: GatheredCall,
  rotation: GatheredCall['rotation'],
  deferReviewerFamily: boolean,
  knownExecutors: readonly KnownPhaseExecutor[],
  remember: (candidates: readonly RoutingCandidate[]) => void,
  rotate = true,
): { readonly plans: PhasePlan[]; readonly cursor: GatheredCall['rotation'] } {
  const plans: PhasePlan[] = [];
  let cursor = rotation;
  for (const phase of phases) {
    const policy = policyForPhase(phase.kind, phase.shape, phase.weight);
    const candidates = candidatesFor(phase, gathered);
    remember(candidates);
    const pin = args.pins?.find((entry) => entry.phaseId === phase.id);
    const constraint = constrainPhase(
      constraintInput(
        phase,
        candidates,
        pin?.executor,
        deferReviewerFamily,
        knownExecutors,
      ),
    );
    const taskKind = taskKindFor(phase.kind);
    if (constraint.status === 'unavailable') {
      plans.push({
        phaseId: phase.id,
        kind: phase.kind,
        hasExplicitRole: phase.role !== undefined,
        taskKind,
        shape: phase.shape,
        weight: phase.weight,
        policy,
        constraint,
        ranked: [],
        spread: null,
      });
      continue;
    }
    const pinModel = constraint.pinAccepted ? pin?.model : undefined;
    const scored = constraint.eligible.map((candidate) => ({
      candidate,
      scored: scoreCandidate(
        candidate,
        policy.tier,
        taskKind,
        pinModel,
        gathered,
      ),
    }));
    const spreadResult = spread({
      phaseId: phase.id,
      taskKind,
      candidates: scored.map((row) => ({
        candidate: row.candidate,
        score: row.scored.score,
      })),
      ...(args.preferences !== undefined
        ? { preferences: args.preferences }
        : {}),
      rotation: cursor,
      rotate,
    });
    cursor = spreadResult.rotation;
    const ranked = orderScored(scored, spreadResult.ranking);
    plans.push({
      phaseId: phase.id,
      kind: phase.kind,
      hasExplicitRole: phase.role !== undefined,
      taskKind,
      shape: phase.shape,
      weight: phase.weight,
      policy,
      constraint,
      ranked,
      alternates: alternateOptions(ranked, taskKind, gathered),
      spread: spreadResult,
    });
  }
  return { plans, cursor };
}

export function storePass(
  planned: readonly PhasePlan[],
  context: PassContext,
  plans: Map<string, PhasePlan>,
  resolutions: Map<string, PhaseResolution>,
): void {
  for (const plan of planned) {
    plans.set(plan.phaseId, plan);
    resolutions.set(plan.phaseId, resolvePhase(plan, context));
  }
}

export function isReviewPhase(kind: PhaseKind): boolean {
  return REVIEW_PHASE_KINDS.some((entry) => entry === kind);
}

export function dispatchMode(caller: OpenedCaller): DispatchMode {
  if (caller.kind === 'unset') return 'ranking';
  if (caller.kind === 'blocked') return 'blocked';
  return 'model';
}

export function laneQuestion(plan: PhasePlan): LaneQuestion {
  const top = plan.ranked.length === 0 ? 0 : Math.max(...plan.ranked.map((row) => row.scored.score));
  const primaries = plan.ranked.filter((row) => insideClosenessBand(top, row.scored.score));
  const eligible = new Set(primaries.map((row) => row.candidate.id));
  return {
    phaseId: plan.phaseId,
    taskKind: plan.taskKind,
    instructions: LANE_INSTRUCTIONS,
    primaryCount: primaries.length,
    options: [
      ...primaries.map(toOption),
      ...(plan.alternates ?? [])
        .filter((entry) => eligible.has(entry.option.laneId))
        .map((entry) => entry.option),
    ],
  };
}

function alternateOptions(
  ranked: readonly ScoredCandidate[],
  taskKind: OutcomeTaskKind,
  gathered: GatheredCall,
): AlternateOption[] {
  const options: AlternateOption[] = [];
  const top = ranked.length === 0 ? 0 : Math.max(...ranked.map((row) => row.scored.score));
  for (const row of ranked) {
    const candidate = row.candidate;
    if (!isSystemCliLane(candidate)) continue;
    const seen = new Set([row.scored.model]);
    const laneOptions: AlternateOption[] = [];
    for (const listed of gathered.models.get(candidate.id)?.models ?? []) {
      if (listed.provenance !== 'reported' || listed.auto === true ||
          listed.id === LANE_DEFAULT_MODEL || listed.id === AUTOMATIC_MATRIX_MODEL ||
          listed.id === '' || seen.has(listed.id)) continue;
      seen.add(listed.id);
      const resolved = gathered.matrix.resolve(candidate.family, listed.id, taskKind);
      if (!insideClosenessBand(top, resolved.score)) continue;
      const scored: CandidateScore = {
        ...row.scored,
        model: listed.id,
        provenance: 'reported',
        score: resolved.score,
        cell: resolved.cell,
        profileModel: resolved.profileModel,
        noProfile: resolved.noProfile,
      };
      laneOptions.push({ option: toOption({ candidate, scored }), scored });
    }
    laneOptions.sort((a, b) => b.scored.score - a.scored.score);
    options.push(...laneOptions.slice(0, LANE_MODEL_ALTERNATES_CAP));
  }
  return options;
}

export function implementersOf(
  plans: readonly PhasePlan[],
  resolutions: ReadonlyMap<string, PhaseResolution>,
): KnownPhaseExecutor[] {
  const known: KnownPhaseExecutor[] = [];
  for (const plan of plans) {
    if (plan.kind !== 'implement') continue;
    const resolution = resolutions.get(plan.phaseId);
    if (resolution === undefined || resolution.kind !== 'chosen') continue;
    known.push({
      phaseId: plan.phaseId,
      kind: 'implement',
      family: resolution.candidate.family,
    });
  }
  return known;
}

function candidatesFor(
  phase: GatePhase,
  gathered: GatheredCall,
): RoutingCandidate[] {
  const role = phase.role ?? DEFAULT_ROLE[phase.kind];
  const candidates: RoutingCandidate[] = [...gathered.lanes];
  if (role === undefined) return candidates;
  if (BUILTIN_SUBAGENT_ROLES.has(role) || gathered.roles.includes(role)) {
    candidates.push(toSubagentCandidate(role));
  }
  return candidates;
}

function constraintInput(
  phase: GatePhase,
  candidates: readonly RoutingCandidate[],
  executor: string | undefined,
  deferReviewerFamily: boolean,
  knownExecutors: readonly KnownPhaseExecutor[],
): ConstrainPhaseInput {
  return {
    phase: {
      id: phase.id,
      kind: phase.kind,
      ...(phase.reviews !== undefined ? { reviews: phase.reviews } : {}),
    },
    candidates,
    ...(executor !== undefined ? { pin: { executor } } : {}),
    ...(deferReviewerFamily
      ? { deferReviewerFamily: true }
      : { knownExecutors }),
  };
}

function scoreCandidate(
  candidate: RoutingCandidate,
  tier: PhasePolicy['tier'],
  taskKind: OutcomeTaskKind,
  pinModel: string | undefined,
  gathered: GatheredCall,
): CandidateScore {
  const facts =
    candidate.kind === 'lane' ? gathered.models.get(candidate.id) : undefined;
  const configuredModel =
    candidate.kind === 'subagent'
      ? { id: tier, provenance: 'tier' as const }
      : facts?.configuredModel;
  const scored = score(
    {
      candidate,
      ...(facts?.models !== undefined ? { models: facts.models } : {}),
      ...(configuredModel !== undefined ? { configuredModel } : {}),
    },
    taskKind,
    gathered.matrix,
  );
  if (pinModel === undefined) return scored;
  return applyPinModel(
    scored,
    candidate,
    pinModel,
    facts?.models ?? [],
    taskKind,
    gathered,
  );
}

function applyPinModel(
  scored: CandidateScore,
  candidate: RoutingCandidate,
  pinModel: string,
  models: readonly {
    readonly id: string;
    readonly provenance: CandidateScore['provenance'];
  }[],
  taskKind: OutcomeTaskKind,
  gathered: GatheredCall,
): CandidateScore {
  const listed = models.find((model) => model.id === pinModel);
  const laneDefault = pinModel === LANE_DEFAULT_MODEL;
  const tierPin = candidate.kind === 'subagent' && ModelTierSchema.safeParse(pinModel).success;
  if (listed === undefined && !laneDefault && !tierPin) return scored;
  const modelId = laneDefault ? LANE_DEFAULT_MODEL : pinModel;
  const resolved = gathered.matrix.resolve(candidate.family, modelId, taskKind);
  const provenance = laneDefault
    ? 'lane-default'
    : tierPin
      ? 'tier'
      : listed === undefined
        ? scored.provenance
        : listed.provenance;
  return {
    ...scored,
    model: modelId,
    provenance,
    score: resolved.score,
    cell: resolved.cell,
    profileModel: resolved.profileModel,
    noProfile: resolved.noProfile,
  };
}

function taskKindFor(kind: PhaseKind): OutcomeTaskKind {
  switch (kind) {
    case 'plan':
    case 'architecture':
    case 'batch':
    case 'completion':
      return 'plan';
    case 'implement':
      return 'implement';
    case 'review':
    case 'document-review':
    case 'visual-review':
      return 'review';
    case 'research':
      return 'research';
    case 'tests':
      return 'tests';
    case 'docs':
    case 'design':
      return 'docs';
    default: {
      const unexpected: never = kind;
      throw new Error(`unexpected phase kind ${String(unexpected)}`);
    }
  }
}

function orderScored(
  scored: readonly ScoredCandidate[],
  ranking: SpreadResult['ranking'],
): ScoredCandidate[] {
  const byId = new Map(scored.map((row) => [row.candidate.id, row]));
  const ordered: ScoredCandidate[] = [];
  for (const row of ranking) {
    const found = byId.get(row.candidate.id);
    if (found !== undefined) ordered.push(found);
  }
  return ordered;
}

function toOption(row: ScoredCandidate): DecisionOption {
  return {
    laneId: row.candidate.id,
    family: row.candidate.family,
    model: row.scored.model,
    limitState: limitOf(row.candidate),
    score: row.scored.score,
  };
}

function limitOf(candidate: RoutingCandidate): LaneLimitState {
  return candidate.kind === 'lane' ? candidate.limitState : 'unknown';
}
