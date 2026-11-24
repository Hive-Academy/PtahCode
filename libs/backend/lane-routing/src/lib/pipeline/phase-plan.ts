/**
 * Phase planning for one route-decide call: candidates, routing rules,
 * constraints, additive scores, and spread order.
 */
import {
  LANE_DEFAULT_MODEL,
  type LaneLimitState,
  type OutcomeTaskKind,
  type RoutingRule,
} from '@ptah-extension/shared';

import type { RouteDecideArgs } from '../contracts/route-decide-args.schema';
import {
  ModelTierSchema,
  type PrunedCause,
  type UserRuleExclusion,
} from '../contracts/route-decide-result.schema';
import type { SystemOneTarget } from '../decision-model/decision-model.config';
import type { DecisionModelSelection } from '../decision-model/decision-model.types';
import type { DecisionOption } from '../decision-model/decision-payload';
import { AUTOMATIC_MATRIX_MODEL } from '../matrix/local-derivation';
import {
  isSystemCliLane,
  type RoutingCandidate,
} from '../ranking/candidate.types';
import { insideClosenessBand } from '../ranking/closeness-band';
import {
  constrainPhase,
  REVIEW_PHASE_KINDS,
  type ConstrainPhaseInput,
  type KnownPhaseExecutor,
  type PhaseConstraintResult,
  type PhaseKind,
} from '../ranking/hard-constraints';
import { resolvePreferences } from '../ranking/preference-match';
import { withPick } from '../ranking/rotation.store';
import {
  score,
  scoreResolvedCell,
  type AdditiveCandidateScore,
  type CandidateScore,
} from '../ranking/score';
import { spread, type SpreadResult } from '../ranking/spread';
import type { FallbackCause } from '../reasons/compile-reasons';
import {
  DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP,
  DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS,
  LANE_MODEL_ALTERNATES_CAP,
  SCORE_MAX,
} from '../routing-constants';
import { matchRoutingRule } from '../scope/routing-rules-setting';
import { candidatesForPhase } from './candidate-tools';
import type { GatheredCall } from './gather';
import type { LaneQuestion, ModelRequestOutcome } from './model-refine';
import { resolvePhase } from './phase-resolve';
import {
  applyRoutingRule,
  policyForPhase,
  type PhasePolicy,
} from './tier-effort-policy';

const LANE_INSTRUCTIONS =
  'Choose the executor for this phase. Each score already includes past outcomes; pastOutcomes lists the delivered and failed run counts behind it. No entry means no verified runs were available for that executor in the outcome window.';

export const BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL =
  'builtin design/visual-review subagent';

export type GateArgs = Extract<RouteDecideArgs, { stage: 'gate-0.1' }>;

type GatePhase = GateArgs['phases'][number];

export interface RoutingRulesInput {
  readonly rules: readonly RoutingRule[];
  readonly diagnostics?: readonly string[];
}

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
  readonly preferenceRank?: number;
}

export interface LaneOfferDisposition {
  readonly candidateId: string;
  readonly inBand: boolean;
  readonly offered: boolean;
  readonly prunedCause?: PrunedCause;
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
  /** Non-excluded candidates in descending additive total order (before rotation). */
  readonly rankedByTotal?: readonly ScoredCandidate[];
  readonly alternates?: readonly AlternateOption[];
  readonly spread: SpreadResult | null;
  /** Full candidate inventory for this phase before exclusions. */
  readonly inventory?: readonly RoutingCandidate[];
  /** First matching user routing rule for this phase, if any. */
  readonly matchedRule?: RoutingRule;
  /** Rule policy note (tier clamp / effort override), if any. */
  readonly policyRuleNote?: string | null;
  /** True when the matched rule's exclude list changed the ranking pick under the same cursor. */
  readonly ruleExclusionChangedChoice?: boolean;
  /** Routing-rule diagnostics (settings-level and per-phase selector diagnostics). */
  readonly ruleDiagnostics?: readonly string[];
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
  /** True when model refinement chose another offered executor or alternate model. */
  readonly modelRefined?: boolean;
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
  toolNamesByPhase?: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly string[] | null>
  >,
  routingRules?: RoutingRulesInput,
): { readonly plans: PhasePlan[]; readonly cursor: GatheredCall['rotation'] } {
  const plans: PhasePlan[] = [];
  let cursor = rotation;
  const settingsDiagnostics = routingRules?.diagnostics ?? [];

  for (const phase of phases) {
    const basePolicy = policyForPhase(phase.kind, phase.shape, phase.weight);
    const matchedRule = routingRules ? matchRoutingRule(phase, args.taskType, routingRules.rules) : undefined;
    const applied = applyRoutingRule(basePolicy, matchedRule);
    const policy: PhasePolicy = {
      tier: applied.tier,
      effort: applied.effort,
      ruleId: applied.ruleId,
      condition: applied.condition ?? basePolicy.condition,
    };
    const inventory = candidatesFor(phase, gathered);
    remember(inventory);
    const { userExclusions, diagnostics: excludeDiagnostics } = resolveRuleExclusions(matchedRule, inventory);
    const ruleDiagnostics = [...settingsDiagnostics, ...excludeDiagnostics];
    const pin = args.pins?.find((entry) => entry.phaseId === phase.id);
    const constraint = constrainPhase(constraintInput(
      phase,
      inventory,
      pin?.executor,
      deferReviewerFamily,
      knownExecutors,
      toolNamesByPhase?.get(phase.id),
      userExclusions.size > 0 ? userExclusions : undefined,
    ));
    const taskKind = taskKindFor(phase.kind);
    const excludedIds = new Set(constraint.excluded.map((entry) => entry.candidate));
    const scorePool = inventory.filter((candidate) => !excludedIds.has(candidate.id));

    if (constraint.status === 'unavailable') {
      const scored = scorePool.map((candidate) => ({
        candidate,
        scored: scoreCandidate(candidate, policy.tier, taskKind, undefined, gathered),
      }));
      const spreadResult = scored.length === 0 ? null : spread({
        phaseId: phase.id,
        taskKind,
        candidates: scored.map((row) => ({
          candidate: row.candidate,
          score: row.scored.score,
          total: row.scored.total,
          parts: row.scored.parts,
        })),
        inventory,
        ...(matchedRule?.set.prefer !== undefined ? { rulePrefer: matchedRule.set.prefer } : {}),
        ...(args.preferences !== undefined ? { preferences: args.preferences } : {}),
        rotation: cursor,
        rotate: false,
      });
      const rankedByTotal = spreadResult === null ? [] : orderScored(scored, spreadResult.rankingByTotal);
      plans.push({
        phaseId: phase.id,
        kind: phase.kind,
        hasExplicitRole: phase.role !== undefined,
        taskKind,
        shape: phase.shape,
        weight: phase.weight,
        policy,
        constraint,
        ranked: rankedByTotal,
        rankedByTotal,
        spread: spreadResult,
        inventory,
        ...(matchedRule !== undefined ? { matchedRule } : {}),
        policyRuleNote: applied.note,
        ruleDiagnostics,
      });
      continue;
    }

    const pinnedId = constraint.pinAccepted ? constraint.eligible[0]?.id : undefined;
    const pinModel = constraint.pinAccepted ? pin?.model : undefined;
    const applyBuiltinOverride = !constraint.pinAccepted && matchedRule === undefined &&
      (phase.kind === 'visual-review' || phase.kind === 'design');
    const scored = scorePool.map((candidate) => ({
      candidate,
      scored: scoreCandidate(candidate, policy.tier, taskKind, candidate.id === pinnedId ? pinModel : undefined, gathered),
    }));
    const spreadCandidates = scored.map((row) => ({
      candidate: row.candidate,
      score: row.scored.score,
      total: row.scored.total,
      parts: row.scored.parts,
      ...(applyBuiltinOverride && row.candidate.kind === 'subagent'
        ? {
            totalOverride: {
              target: SCORE_MAX,
              label: BUILTIN_VISUAL_DESIGN_OVERRIDE_LABEL,
            },
          }
        : {}),
    }));
    const spreadResult = spread({
      phaseId: phase.id,
      taskKind,
      candidates: spreadCandidates,
      inventory,
      ...(matchedRule?.set.prefer !== undefined ? { rulePrefer: matchedRule.set.prefer } : {}),
      ...(args.preferences !== undefined ? { preferences: args.preferences } : {}),
      rotation: cursor,
      rotate: constraint.pinAccepted ? false : rotate,
    });
    const ruleExclusionChangedChoice = computeRuleExclusionChangedChoice(
      matchedRule,
      constraint,
      inventory,
      spreadCandidates,
      spreadResult.pick?.candidate.id,
      phase.id,
      policy.tier,
      taskKind,
      args.preferences,
      cursor,
      rotate,
      gathered,
    );
    const rankedByTotal = orderScored(scored, spreadResult.rankingByTotal);
    let ranked: ScoredCandidate[];
    if (constraint.pinAccepted && pinnedId !== undefined) {
      const pinnedRow = rankedByTotal.find((row) => row.candidate.id === pinnedId);
      const others = rankedByTotal.filter((row) => row.candidate.id !== pinnedId);
      ranked = pinnedRow === undefined ? rankedByTotal : [pinnedRow, ...others];
      if (rotate) cursor = withPick(cursor, spreadResult.key, pinnedId);
    } else {
      ranked = orderScored(scored, spreadResult.ranking);
      cursor = spreadResult.rotation;
    }
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
      rankedByTotal,
      alternates: constraint.pinAccepted ? [] : alternateOptions(ranked, taskKind, gathered),
      spread: spreadResult,
      inventory,
      ...(matchedRule !== undefined ? { matchedRule, ruleExclusionChangedChoice } : {}),
      policyRuleNote: applied.note,
      ruleDiagnostics,
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

/** Additive total when present, falling back to legacy score for minimal fixtures. */
export function effectiveTotal(scored: CandidateScore): number {
  return scored.total ?? scored.score;
}

export function laneQuestion(plan: PhasePlan): LaneQuestion {
  const top =
    plan.ranked.length === 0
      ? 0
      : Math.max(...plan.ranked.map((row) => effectiveTotal(row.scored)));
  const primaries = plan.ranked.filter((row) =>
    insideClosenessBand(top, effectiveTotal(row.scored)),
  );
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

/**
 * Compute per-lane model-offer dispositions and first applicable prune cause
 * (`below-band`, `option-cap`, or `payload-fit`). Dropping only an alternate
 * model never prunes its lane.
 */
export function computeLaneOfferDispositions(
  plan: PhasePlan,
  outcome?: ModelRequestOutcome | null,
): ReadonlyMap<string, LaneOfferDisposition> {
  const question = laneQuestion(plan);
  const inBandIds = new Set(
    question.options
      .slice(0, question.primaryCount)
      .map((option) => option.laneId),
  );
  const sentForPhase =
    outcome !== null &&
    outcome !== undefined &&
    outcome.sent &&
    outcome.offered.has(plan.phaseId);
  const offeredLaneIds = sentForPhase
    ? new Set(
        (outcome.offered.get(plan.phaseId) ?? []).map(
          (option) => option.laneId,
        ),
      )
    : undefined;
  const capLaneIds =
    sentForPhase && outcome.optionCapOffered?.has(plan.phaseId)
      ? new Set(
          (outcome.optionCapOffered.get(plan.phaseId) ?? []).map(
            (option) => option.laneId,
          ),
        )
      : undefined;
  const prunedFromModel = sentForPhase
    ? outcome.prunedLanes?.get(plan.phaseId)
    : undefined;

  const dispositions = new Map<string, LaneOfferDisposition>();
  for (const row of plan.ranked) {
    const id = row.candidate.id;
    const inBand = inBandIds.has(id);
    if (!sentForPhase || offeredLaneIds === undefined) {
      dispositions.set(id, { candidateId: id, inBand, offered: false });
      continue;
    }
    if (offeredLaneIds.has(id)) {
      dispositions.set(id, { candidateId: id, inBand, offered: true });
      continue;
    }
    if (!inBand) {
      dispositions.set(id, { candidateId: id, inBand: false, offered: false, prunedCause: 'below-band' });
      continue;
    }
    const cause: PrunedCause =
      prunedFromModel?.get(id) ?? (capLaneIds !== undefined && !capLaneIds.has(id) ? 'option-cap' : 'payload-fit');
    dispositions.set(id, { candidateId: id, inBand: true, offered: false, prunedCause: cause });
  }
  return dispositions;
}

function alternateOptions(
  ranked: readonly ScoredCandidate[],
  taskKind: OutcomeTaskKind,
  gathered: GatheredCall,
): AlternateOption[] {
  const options: AlternateOption[] = [];
  const top = ranked.length === 0 ? 0 : Math.max(...ranked.map((row) => effectiveTotal(row.scored)));
  for (const row of ranked) {
    const candidate = row.candidate;
    if (!isSystemCliLane(candidate)) continue;
    const seen = new Set([row.scored.model]);
    const laneOptions: AlternateOption[] = [];
    for (const listed of gathered.models.get(candidate.id)?.models ?? []) {
      if (
        listed.provenance !== 'reported' || listed.auto === true ||
        listed.id === LANE_DEFAULT_MODEL || listed.id === AUTOMATIC_MATRIX_MODEL ||
        listed.id === '' || seen.has(listed.id)
      ) continue;
      seen.add(listed.id);
      const resolved = gathered.matrix.resolve(candidate.family, listed.id, taskKind);
      const recomputed = scoreResolvedCell(candidate, resolved, row.preferenceRank);
      if (!insideClosenessBand(top, recomputed.total)) continue;
      const scored: CandidateScore = {
        ...row.scored,
        model: listed.id,
        provenance: 'reported',
        score: recomputed.score,
        total: recomputed.total,
        parts: recomputed.parts,
        cell: recomputed.cell,
        profileModel: recomputed.profileModel,
        noProfile: recomputed.noProfile,
      };
      laneOptions.push({ option: toOption({ candidate, scored }), scored });
    }
    laneOptions.sort((a, b) => effectiveTotal(b.scored) - effectiveTotal(a.scored));
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
    known.push({ phaseId: plan.phaseId, kind: 'implement', family: resolution.candidate.family });
  }
  return known;
}

export function candidatesFor(phase: GatePhase, gathered: GatheredCall): RoutingCandidate[] {
  return candidatesForPhase(phase, gathered);
}

function resolveRuleExclusions(
  rule: RoutingRule | undefined,
  inventory: readonly RoutingCandidate[],
): { readonly userExclusions: ReadonlyMap<string, UserRuleExclusion>; readonly diagnostics: readonly string[] } {
  const userExclusions = new Map<string, UserRuleExclusion>();
  const diagnostics: string[] = [];
  const selectors = rule?.set.exclude;
  if (rule === undefined || selectors === undefined || selectors.length === 0) return { userExclusions, diagnostics };
  const tag: UserRuleExclusion = `user-rule:${rule.id}`;
  for (const match of resolvePreferences(selectors, inventory)) {
    const label = truncateSnippet(sanitizeSelector(match.entry), DIAGNOSTIC_SELECTOR_SNIPPET_MAX_CHARS);
    if (match.status === 'matched') {
      userExclusions.set(match.ids[0], tag);
      continue;
    }
    if (match.status === 'unknown') {
      diagnostics.push(`routing rule ${rule.id}: exclude selector "${label}" matched no candidate`);
      continue;
    }
    if (match.status === 'ambiguous') {
      diagnostics.push(`routing rule ${rule.id}: exclude selector "${label}" is ambiguous (${formatAmbiguousSample(match.ids)})`);
    }
  }
  return { userExclusions, diagnostics };
}

function sanitizeSelector(value: string): string {
  return value.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateSnippet(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return maxChars <= 3 ? value.slice(0, maxChars) : `${value.slice(0, maxChars - 3)}...`;
}

function formatAmbiguousSample(ids: readonly string[]): string {
  if (ids.length <= DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP) return ids.join(', ');
  const shown = ids.slice(0, DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP).join(', ');
  return `${shown}, and ${ids.length - DIAGNOSTIC_AMBIGUOUS_MATCH_SAMPLE_CAP} more`;
}

function computeRuleExclusionChangedChoice(
  matchedRule: RoutingRule | undefined,
  constraint: Extract<PhaseConstraintResult, { status: 'eligible' }>,
  inventory: readonly RoutingCandidate[],
  spreadCandidates: Parameters<typeof spread>[0]['candidates'],
  actualPickId: string | undefined,
  phaseId: string,
  tier: PhasePolicy['tier'],
  taskKind: OutcomeTaskKind,
  preferences: GateArgs['preferences'],
  incomingCursor: GatheredCall['rotation'],
  rotate: boolean,
  gathered: GatheredCall,
): boolean {
  if (matchedRule === undefined || constraint.pinAccepted) return false;
  const ruleTag: UserRuleExclusion = `user-rule:${matchedRule.id}`;
  const excludedByRule = new Set(
    constraint.excluded.filter((entry) => entry.rule === ruleTag).map((entry) => entry.candidate),
  );
  if (excludedByRule.size === 0) return false;
  const restored = inventory
    .filter((candidate) => excludedByRule.has(candidate.id))
    .map((candidate) => {
      const scored = scoreCandidate(candidate, tier, taskKind, undefined, gathered);
      return { candidate, score: scored.score, total: scored.total, parts: scored.parts };
    });
  if (restored.length === 0) return false;
  const counterfactual = spread({
    phaseId,
    taskKind,
    candidates: [...spreadCandidates, ...restored],
    inventory,
    ...(matchedRule.set.prefer !== undefined ? { rulePrefer: matchedRule.set.prefer } : {}),
    ...(preferences !== undefined ? { preferences } : {}),
    rotation: incomingCursor,
    rotate,
  });
  return counterfactual.pick?.candidate.id !== actualPickId;
}

function constraintInput(
  phase: GatePhase,
  candidates: readonly RoutingCandidate[],
  executor: string | undefined,
  deferReviewerFamily: boolean,
  knownExecutors: readonly KnownPhaseExecutor[],
  toolNames?: ReadonlyMap<string, readonly string[] | null>,
  userExclusions?: ReadonlyMap<string, UserRuleExclusion>,
): ConstrainPhaseInput {
  return {
    phase: {
      id: phase.id,
      kind: phase.kind,
      requiredCapabilities: phase.requiredCapabilities ?? [],
      ...(phase.reviews !== undefined ? { reviews: phase.reviews } : {}),
    },
    candidates,
    toolNames,
    ...(executor !== undefined ? { pin: { executor } } : {}),
    ...(deferReviewerFamily ? { deferReviewerFamily: true } : { knownExecutors }),
    ...(userExclusions !== undefined ? { userExclusions } : {}),
  };
}

function scoreCandidate(
  candidate: RoutingCandidate,
  tier: PhasePolicy['tier'],
  taskKind: OutcomeTaskKind,
  pinModel: string | undefined,
  gathered: GatheredCall,
): AdditiveCandidateScore {
  const facts = candidate.kind === 'lane' ? gathered.models.get(candidate.id) : undefined;
  const configuredModel = candidate.kind !== 'lane'
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
  return pinModel === undefined
    ? scored
    : applyPinModel(scored, candidate, pinModel, facts?.models ?? [], taskKind, gathered);
}

function applyPinModel(
  scored: AdditiveCandidateScore,
  candidate: RoutingCandidate,
  pinModel: string,
  models: readonly {
    readonly id: string;
    readonly provenance: CandidateScore['provenance'];
  }[],
  taskKind: OutcomeTaskKind,
  gathered: GatheredCall,
): AdditiveCandidateScore {
  const listed = models.find((model) => model.id === pinModel);
  const laneDefault = pinModel === LANE_DEFAULT_MODEL;
  const tierPin =
    candidate.kind === 'subagent' && ModelTierSchema.safeParse(pinModel).success;
  if (listed === undefined && !laneDefault && !tierPin) return scored;
  const modelId = laneDefault ? LANE_DEFAULT_MODEL : pinModel;
  const resolved = gathered.matrix.resolve(candidate.family, modelId, taskKind);
  const recomputed = scoreResolvedCell(candidate, resolved);
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
    score: recomputed.score,
    total: recomputed.total,
    parts: recomputed.parts,
    cell: recomputed.cell,
    profileModel: recomputed.profileModel,
    noProfile: recomputed.noProfile,
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
    if (found === undefined) continue;
    ordered.push({
      candidate: found.candidate,
      scored: {
        ...found.scored,
        total: row.total,
        ...(row.parts !== undefined ? { parts: row.parts } : {}),
      },
      ...(row.preferenceRank !== undefined
        ? { preferenceRank: row.preferenceRank }
        : {}),
    });
  }
  return ordered;
}

function toOption(row: ScoredCandidate): DecisionOption {
  return {
    laneId: row.candidate.id,
    family: row.candidate.family,
    model: row.scored.model,
    limitState: limitOf(row.candidate),
    score: effectiveTotal(row.scored),
  };
}

function limitOf(candidate: RoutingCandidate): LaneLimitState {
  return candidate.kind === 'lane' ? candidate.limitState : 'unknown';
}
