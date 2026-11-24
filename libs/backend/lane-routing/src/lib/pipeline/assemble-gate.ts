/**
 * Gate result assembly. Joins candidate inventory, hard/user exclusions,
 * additive rankings, model-offer dispositions, traces, and compiled reasons.
 */
import { type LaneLimitState } from '@ptah-extension/shared';

import type {
  CandidateTrace,
  ChosenEntry,
  GateResult,
  ModelTier,
  PrunedCause,
  UnavailableEntry,
} from '../contracts/route-decide-result.schema';
import { ModelTierSchema } from '../contracts/route-decide-result.schema';
import {
  candidateDisplayName,
  type RoutingCandidate,
} from '../ranking/candidate.types';
import type {
  PhaseConstraintResult,
  UnavailablePhase,
} from '../ranking/hard-constraints';
import { preferenceBoost } from '../ranking/score';
import type { SpreadResult } from '../ranking/spread';
import {
  compileChosenExplanation,
  compileGateReasons,
  compileUnavailableExplanation,
  preferenceDiagnosticKey,
  type ChosenExecutor,
  type ChosenReasonFacts,
  type DecidingFactor,
  type ExcludedCandidateFact,
  type ExplanationAlternative,
  type PreferenceLossNote,
  type UnavailableReasonFacts,
} from '../reasons/compile-reasons';
import {
  overallRosterConfidence,
  rosterEntryConfidence,
} from '../reasons/confidence';
import type { GatheredCall } from './gather';
import type { ModelRequestOutcome } from './model-refine';
import {
  computeLaneOfferDispositions,
  effectiveTotal,
  type ChosenResolution,
  type GateArgs,
  type LaneOfferDisposition,
  type PhasePlan,
  type PhaseResolution,
} from './phase-plan';
import { usageOf, type UsageTally } from './preflight-answer';

interface ChosenDraft {
  readonly kind: 'chosen';
  readonly phaseId: string;
  readonly resolution: ChosenResolution;
  readonly plan: PhasePlan;
  readonly dispositions: ReadonlyMap<string, LaneOfferDisposition>;
}

interface UnavailableDraft {
  readonly kind: 'unavailable';
  readonly phaseId: string;
  readonly plan: PhasePlan;
  readonly dispositions: ReadonlyMap<string, LaneOfferDisposition>;
}

type Draft = ChosenDraft | UnavailableDraft;

type GateExcludedEntry = GateResult['excluded'][number];

export function assembleGateResult(
  args: GateArgs,
  gathered: GatheredCall,
  plans: ReadonlyMap<string, PhasePlan>,
  resolutions: ReadonlyMap<string, PhaseResolution>,
  inputRowIds: readonly string[],
  tally: UsageTally,
  outcomes: readonly (ModelRequestOutcome | null)[],
): GateResult {
  const chosenFacts: ChosenReasonFacts[] = [];
  const unavailableFacts: UnavailableReasonFacts[] = [];
  const excluded: GateExcludedEntry[] = [];
  const reasonExcluded: ExcludedCandidateFact[] = [];
  const ruleDiagnostics: string[] = [];
  const drafts: Draft[] = [];

  for (const phase of args.phases) {
    const plan = requiredPlan(plans, phase.id);
    const resolution = requiredResolution(resolutions, phase.id);
    const outcome = outcomeForPhase(outcomes, phase.id);
    const dispositions = computeLaneOfferDispositions(plan, outcome);
    pushExcluded(excluded, reasonExcluded, plan, dispositions);
    if (plan.ruleDiagnostics !== undefined) {
      ruleDiagnostics.push(...plan.ruleDiagnostics);
    }
    if (resolution.kind === 'unavailable') {
      if (plan.constraint.status !== 'unavailable') {
        throw new Error(`phase ${phase.id} constraint is not unavailable`);
      }
      unavailableFacts.push(unavailableFactsOf(plan, plan.constraint));
      drafts.push({
        kind: 'unavailable',
        phaseId: phase.id,
        plan,
        dispositions,
      });
      continue;
    }
    chosenFacts.push(chosenFactsOf(plan, resolution, args.preferenceSource));
    drafts.push({
      kind: 'chosen',
      phaseId: phase.id,
      resolution,
      plan,
      dispositions,
    });
  }

  const compiled = compileGateReasons({
    chosen: chosenFacts,
    unavailable: unavailableFacts,
    excluded: reasonExcluded,
    missingInputs: gathered.missing,
    inputRowIds,
    extraReasons: [...gathered.detailReasons, ...ruleDiagnostics],
  });
  const roster = rosterFrom(
    args,
    gathered,
    drafts,
    compiled.chosenReasons,
    compiled.unavailableReasons,
  );
  return {
    stage: 'gate-0.1',
    roster,
    overallSource: overallSourceOf(roster),
    overallConfidence: overallRosterConfidence(roster.map(confidenceEntry)),
    excluded,
    reasons: [...compiled.reasons],
    usage: usageOf(tally),
  };
}

function chosenFactsOf(
  plan: PhasePlan,
  resolution: ChosenResolution,
  preferenceSource: string | undefined,
): ChosenReasonFacts {
  const row = plan.ranked.find(
    (entry) => entry.candidate.id === resolution.candidate.id,
  );
  if (row === undefined) {
    throw new Error(
      `phase ${plan.phaseId} is missing a score for ${resolution.candidate.id}`,
    );
  }
  const flags = choiceFlags(
    resolution.source,
    resolution.candidate.id,
    plan.spread,
  );
  const selected = resolution.selectedScore ?? row.scored;
  return {
    phaseId: plan.phaseId,
    executor: executorOf(resolution.candidate),
    model: selected.model,
    score: selected.score,
    source: resolution.source,
    cell: selected.cell,
    limitState: limitOf(resolution.candidate),
    rotationChangedChoice: flags.rotation,
    preferenceChangedChoice: flags.preference,
    ...(preferenceSource !== undefined ? { preferenceSource } : {}),
    reportedConfidence: resolution.reported,
    fallbackCause: resolution.cause,
    ...(resolution.proposal !== null
      ? { modelProposalOption: resolution.proposal.option }
      : {}),
  };
}

function unavailableFactsOf(
  plan: PhasePlan,
  constraint: Extract<PhaseConstraintResult, { status: 'unavailable' }>,
): UnavailableReasonFacts {
  return {
    phaseId: plan.phaseId,
    exclusionReason: constraint.exclusionReason,
    excludedBy: constraint.excluded,
    pinRule: constraint.pinRule,
    needsDisclosedFallback: constraint.needsDisclosedFallback,
    source:
      constraint.exclusionReason === 'pin-unavailable' ? 'pin' : 'ranking',
  };
}

function choiceFlags(
  source: ChosenResolution['source'],
  candidateId: string,
  spreadResult: SpreadResult | null,
): { readonly rotation: boolean; readonly preference: boolean } {
  if (source === 'pin' || spreadResult === null || spreadResult.pick === null) {
    return { rotation: false, preference: false };
  }
  if (source === 'model' && candidateId !== spreadResult.pick.candidate.id) {
    return { rotation: false, preference: false };
  }
  return {
    rotation: spreadResult.rotationChangedChoice,
    preference: spreadResult.preferenceChangedChoice,
  };
}

function executorOf(candidate: RoutingCandidate): ChosenExecutor {
  if (candidate.kind === 'child-session') {
    return { kind: 'child-session', id: candidate.id, family: candidate.family };
  }
  if (candidate.kind === 'subagent') {
    return {
      kind: 'subagent',
      id: candidate.id,
      family: candidate.family,
      ...(candidate.role !== undefined ? { role: candidate.role } : {}),
      ...(candidate.phaseKind !== undefined
        ? { phaseKind: candidate.phaseKind }
        : {}),
    };
  }
  return {
    kind: 'lane',
    id: candidate.id,
    family: candidate.family,
    cli: candidate.cli,
    ...(candidate.ptahCliId !== undefined
      ? { ptahCliId: candidate.ptahCliId }
      : {}),
  };
}

function limitOf(candidate: RoutingCandidate): LaneLimitState {
  return candidate.kind === 'lane' ? candidate.limitState : 'unknown';
}

function pushExcluded(
  excluded: GateExcludedEntry[],
  reasonExcluded: ExcludedCandidateFact[],
  plan: PhasePlan,
  dispositions: ReadonlyMap<string, LaneOfferDisposition>,
): void {
  if (plan.constraint.status === 'eligible' || plan.constraint.status === 'unavailable') {
    for (const entry of plan.constraint.excluded) {
      excluded.push({
        phaseId: plan.phaseId,
        candidate: entry.candidate,
        rule: entry.rule,
        ...(entry.capability !== undefined ? { capability: entry.capability } : {}),
      });
      reasonExcluded.push({ phaseId: plan.phaseId, candidate: entry.candidate, rule: entry.rule });
    }
  }
  for (const row of plan.ranked) {
    const cause: PrunedCause | undefined = dispositions.get(row.candidate.id)?.prunedCause;
    if (cause === undefined) continue;
    excluded.push({ phaseId: plan.phaseId, candidate: row.candidate.id, rule: 'pruned', cause });
    reasonExcluded.push({ phaseId: plan.phaseId, candidate: row.candidate.id, rule: 'pruned' });
  }
}

function outcomeForPhase(
  outcomes: readonly (ModelRequestOutcome | null)[],
  phaseId: string,
): ModelRequestOutcome | null {
  for (const outcome of outcomes) {
    if (outcome === null || !outcome.sent) continue;
    if (outcome.offered.has(phaseId)) return outcome;
  }
  return null;
}

function rosterFrom(
  args: GateArgs,
  gathered: GatheredCall,
  drafts: readonly Draft[],
  chosenReasons: readonly string[],
  unavailableReasons: readonly string[],
): (ChosenEntry | UnavailableEntry)[] {
  let chosenIndex = 0;
  let unavailableIndex = 0;
  const seenPreferenceDiagnostics = new Set<string>();
  const roster: (ChosenEntry | UnavailableEntry)[] = [];
  for (const draft of drafts) {
    if (draft.kind === 'unavailable') {
      const reason = reasonAt(
        unavailableReasons,
        unavailableIndex,
        draft.phaseId,
      );
      unavailableIndex += 1;
      roster.push(
        unavailableEntry(
          draft,
          gathered,
          withPolicyReason(reason, draft.plan),
        ),
      );
      continue;
    }
    const reason = withOnlyEligible(
      reasonAt(chosenReasons, chosenIndex, draft.phaseId),
      draft.plan,
    );
    chosenIndex += 1;
    roster.push(
      chosenEntry(
        draft,
        gathered,
        args.preferenceSource,
        reason,
        seenPreferenceDiagnostics,
      ),
    );
  }
  if (roster.length !== args.phases.length) {
    throw new Error('route decide roster does not cover every phase');
  }
  return roster;
}

export function withPolicyReason(
  reason: string,
  plan: Pick<PhasePlan, 'policy' | 'shape' | 'weight'>,
  chosenTier: ModelTier = plan.policy.tier,
): string {
  const { ruleId, effort } = plan.policy;
  return `${reason}; policy ${ruleId}; tier ${chosenTier}, effort ${effort}, shape ${plan.shape ?? 'unset'}, weight ${plan.weight ?? 'unset'}`;
}

function reasonAt(
  reasons: readonly string[],
  index: number,
  phaseId: string,
): string {
  const reason = reasons[index];
  if (reason === undefined) {
    throw new Error(`phase ${phaseId} is missing its compiled reason`);
  }
  return reason;
}

export function missingCapabilityLabel(constraint: UnavailablePhase): string {
  return (
    constraint.excluded.find((item) => item.capability)?.capability ??
    constraint.pinRule ??
    constraint.exclusionReason ??
    'capability-unknown'
  );
}

function laneMetaOf(
  candidate: RoutingCandidate,
  gathered: GatheredCall,
): Pick<CandidateTrace, 'limitEvidence' | 'modelListStatus'> {
  if (candidate.kind !== 'lane') return {};
  const status = gathered.models.get(candidate.id)?.status;
  return {
    ...(candidate.limitEvidence !== undefined
      ? { limitEvidence: candidate.limitEvidence }
      : {}),
    ...(status !== undefined ? { modelListStatus: status } : {}),
  };
}

function buildCandidateTrace(
  draft: Draft,
  gathered: GatheredCall,
): CandidateTrace[] {
  const plan = draft.plan;
  const rankedList = plan.rankedByTotal ?? plan.ranked;
  const rankedById = new Map(rankedList.map((row) => [row.candidate.id, row]));
  const inventoryById = new Map<string, RoutingCandidate>();
  for (const candidate of plan.inventory ?? []) {
    inventoryById.set(candidate.id, candidate);
  }
  for (const row of rankedList) {
    if (!inventoryById.has(row.candidate.id)) {
      inventoryById.set(row.candidate.id, row.candidate);
    }
  }
  const trace: CandidateTrace[] = [];
  const seen = new Set<string>();

  // 1. Chosen candidate first.
  if (draft.kind === 'chosen') {
    const cand = draft.resolution.candidate;
    const row = rankedById.get(cand.id);
    const selected = draft.resolution.selectedScore ?? row?.scored;
    const prefSource = plan.spread?.preferenceSource;
    const overridden = plan.spread?.overriddenPreferenceSources ?? [];
    seen.add(cand.id);
    trace.push({
      candidate: cand.id,
      displayName: candidateDisplayName(cand),
      total: selected === undefined ? null : effectiveTotal(selected),
      ...(selected?.parts !== undefined ? { parts: selected.parts } : {}),
      disposition: 'chosen',
      ...laneMetaOf(cand, gathered),
      ...(prefSource !== undefined ? { preferenceSource: prefSource } : {}),
      ...(overridden.length > 0
        ? { overriddenPreferenceSources: [...overridden] }
        : {}),
    });
  }

  // 2a. Hard and user-rule exclusions from inventory (missing pin stays synthetic legacy exclusion).
  for (const entry of plan.constraint.excluded) {
    if (seen.has(entry.candidate)) continue;
    const cand = inventoryById.get(entry.candidate);
    if (cand === undefined) continue;
    seen.add(entry.candidate);
    trace.push({
      candidate: cand.id,
      displayName: candidateDisplayName(cand),
      total: null,
      disposition: 'excluded',
      rule: entry.rule,
      ...laneMetaOf(cand, gathered),
    });
  }

  // 2b. Model-pruned eligible candidates (retain computed additive total and parts).
  for (const row of rankedList) {
    const id = row.candidate.id;
    if (seen.has(id)) continue;
    const cause = draft.dispositions.get(id)?.prunedCause;
    if (cause === undefined) continue;
    seen.add(id);
    trace.push({
      candidate: id,
      displayName: candidateDisplayName(row.candidate),
      total: effectiveTotal(row.scored),
      ...(row.scored.parts !== undefined ? { parts: row.scored.parts } : {}),
      disposition: 'excluded',
      rule: 'pruned',
      cause,
      ...laneMetaOf(row.candidate, gathered),
    });
  }

  // 3. Remaining ranked eligible alternatives in descending additive total order.
  for (const row of rankedList) {
    const id = row.candidate.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const total = effectiveTotal(row.scored);
    const tiedPrunedIndex = trace.findIndex((entry) => entry.rule === 'pruned' && entry.total === total);
    // The compactor keeps the first alternative at a tied total.
    trace.splice(tiedPrunedIndex === -1 ? trace.length : tiedPrunedIndex, 0, {
      candidate: id,
      displayName: candidateDisplayName(row.candidate),
      total,
      ...(row.scored.parts !== undefined ? { parts: row.scored.parts } : {}),
      disposition: 'ranked',
      ...laneMetaOf(row.candidate, gathered),
    });
  }

  return trace;
}

function strongestAlternativeOf(
  plan: PhasePlan,
  chosenId: string,
): ExplanationAlternative | undefined {
  const ordered = plan.rankedByTotal ?? plan.ranked;
  const runnerUp = ordered.find((row) => row.candidate.id !== chosenId);
  if (runnerUp === undefined) return undefined;
  return {
    id: runnerUp.candidate.id,
    displayName: candidateDisplayName(runnerUp.candidate),
    total: effectiveTotal(runnerUp.scored),
    ...(runnerUp.scored.parts !== undefined
      ? { parts: runnerUp.scored.parts }
      : {}),
  };
}

function decidingFactorOf(
  plan: PhasePlan,
  resolution: ChosenResolution,
  selectedTotal: number,
  alternative: ExplanationAlternative | undefined,
): DecidingFactor {
  if (resolution.source === 'pin') return 'pin';
  if (resolution.source === 'model' && resolution.modelRefined === true) {
    return 'model refinement';
  }
  if (plan.spread?.rotationChangedChoice) return 'rotation';
  if (
    plan.matchedRule !== undefined &&
    (plan.ruleExclusionChangedChoice === true ||
      (plan.spread?.preferenceSource === 'rule' &&
        plan.spread.preferenceChangedChoice))
  ) {
    return `rule ${plan.matchedRule.id}`;
  }
  if (plan.spread?.preferenceChangedChoice) {
    if (plan.spread.preferenceSource === 'call') return 'call preference';
    if (plan.spread.preferenceSource === 'configured') {
      return 'configured preference';
    }
  }
  if (alternative !== undefined && selectedTotal === alternative.total) {
    return 'tie-break';
  }
  return 'score';
}

function preferenceLossOf(
  plan: PhasePlan,
  chosenId: string,
): PreferenceLossNote | undefined {
  const matches = plan.spread?.preferenceMatches;
  if (matches === undefined || matches.length === 0) return undefined;
  const rankedById = new Map(
    (plan.rankedByTotal ?? plan.ranked).map((row) => [row.candidate.id, row]),
  );
  for (const match of matches) {
    if ('source' in match || match.status !== 'matched') continue;
    const preferredId = match.ids[0];
    if (preferredId === chosenId) return undefined;
    const row = rankedById.get(preferredId);
    if (row === undefined) continue;
    const boost = row.scored.parts?.preference ?? preferenceBoost(match.rank);
    if (boost <= 0) continue;
    return {
      candidateDisplayName: candidateDisplayName(row.candidate),
      candidateTotal: effectiveTotal(row.scored),
      boost,
    };
  }
  return undefined;
}

function unavailableEntry(
  draft: UnavailableDraft,
  gathered: GatheredCall,
  reason: string,
): UnavailableEntry {
  const plan = draft.plan;
  if (plan.constraint.status !== 'unavailable') {
    throw new Error(`phase ${plan.phaseId} constraint is not unavailable`);
  }
  const orchestratorPhase = (plan.kind === 'batch' || plan.kind === 'completion') &&
    plan.constraint.exclusionReason === 'no-eligible-candidate' && !plan.hasExplicitRole;
  const explanation = compileUnavailableExplanation({
    phaseId: plan.phaseId,
    exclusionReason: plan.constraint.exclusionReason,
    pinRule: plan.constraint.pinRule,
    needsDisclosedFallback: plan.constraint.needsDisclosedFallback,
    excludedBy: plan.constraint.excluded,
    policyCondition: plan.policy.condition ?? plan.policy.ruleId,
    tier: plan.policy.tier,
    effort: plan.policy.effort,
    ...(plan.matchedRule !== undefined ? { matchedRuleId: plan.matchedRule.id } : {}),
    policyRuleNote: plan.policyRuleNote,
  });
  return {
    phaseId: plan.phaseId,
    status: 'unavailable',
    executor: 'unavailable',
    exclusionReason: plan.constraint.exclusionReason,
    excludedBy: [...plan.constraint.excluded],
    pinRule: plan.constraint.pinRule,
    needsDisclosedFallback: plan.constraint.needsDisclosedFallback,
    source: plan.constraint.exclusionReason === 'pin-unavailable' ? 'pin' : 'ranking',
    model: null,
    tier: plan.policy.tier,
    effort: plan.policy.effort,
    provenance: null,
    score: null,
    confidence: null,
    fallbackCause: null,
    reason: orchestratorPhase
      ? `${reason}; No executor; the orchestrator does this phase${plan.constraint.excluded.length ? ` (excluded: ${plan.constraint.excluded.map((item) => `${item.candidate}:${item.rule}`).join(', ')})` : ''}`
      : plan.constraint.exclusionReason === 'missing-capability' ||
          plan.constraint.pinRule === 'missing-capability' ||
          plan.constraint.pinRule === 'capability-unknown'
        ? `${reason}; missing capability: ${missingCapabilityLabel(plan.constraint)}`
        : reason,
    candidates: buildCandidateTrace(draft, gathered),
    explanation,
  };
}

function chosenEntry(
  draft: ChosenDraft,
  gathered: GatheredCall,
  callerPreferenceNote: string | undefined,
  reason: string,
  seenPreferenceDiagnostics: Set<string>,
): ChosenEntry {
  const plan = draft.plan;
  const row = plan.ranked.find((entry) => entry.candidate.id === draft.resolution.candidate.id);
  if (row === undefined) {
    throw new Error(`phase ${draft.phaseId} is missing a score for ${draft.resolution.candidate.id}`);
  }
  const selected = draft.resolution.selectedScore ?? row.scored;
  const confidence = rosterEntryConfidence({
    status: 'chosen',
    source: draft.resolution.source,
    reportedConfidence: draft.resolution.reported,
  });
  const pinnedTier = draft.resolution.candidate.kind === 'subagent' && row.scored.provenance === 'tier'
    ? ModelTierSchema.safeParse(row.scored.model)
    : null;
  const tier = pinnedTier?.success ? pinnedTier.data : plan.policy.tier;
  const selectedTotal = effectiveTotal(selected);
  const alternative = strongestAlternativeOf(plan, draft.resolution.candidate.id);
  const decidingFactor = decidingFactorOf(plan, draft.resolution, selectedTotal, alternative);
  const preferenceLoss = preferenceLossOf(plan, draft.resolution.candidate.id);
  const preferenceMatches = plan.spread?.preferenceMatches?.filter((entry) => {
    const key = preferenceDiagnosticKey(entry);
    if (seenPreferenceDiagnostics.has(key)) return false;
    seenPreferenceDiagnostics.add(key);
    return true;
  });
  const explanation = compileChosenExplanation({
    candidateId: draft.resolution.candidate.id,
    displayName: candidateDisplayName(draft.resolution.candidate),
    model: selected.model,
    total: selectedTotal,
    ...(selected.parts !== undefined ? { parts: selected.parts } : {}),
    ...(alternative !== undefined ? { strongestAlternative: alternative } : {}),
    decidingFactor,
    ...(plan.spread?.preferenceSource !== undefined ? { preferenceSource: plan.spread.preferenceSource } : {}),
    ...(plan.spread?.overriddenPreferenceSources !== undefined
      ? { overriddenPreferenceSources: plan.spread.overriddenPreferenceSources }
      : {}),
    ...(preferenceMatches !== undefined ? { preferenceMatches } : {}),
    ...(preferenceLoss !== undefined ? { preferenceLoss } : {}),
    ...(callerPreferenceNote !== undefined ? { callerPreferenceNote } : {}),
    policyCondition: plan.policy.condition ?? plan.policy.ruleId,
    tier,
    effort: plan.policy.effort,
    ...(plan.matchedRule !== undefined ? { matchedRuleId: plan.matchedRule.id } : {}),
    policyRuleNote: plan.policyRuleNote,
    limitState: limitOf(draft.resolution.candidate),
    ...(draft.resolution.candidate.kind === 'lane' && draft.resolution.candidate.limitEvidence !== undefined
      ? { limitEvidence: draft.resolution.candidate.limitEvidence }
      : {}),
    ...(gathered.nowMs !== undefined ? { nowMs: gathered.nowMs } : {}),
  });
  return {
    phaseId: draft.phaseId,
    status: 'chosen',
    executor: executorOf(draft.resolution.candidate),
    model: selected.model,
    tier,
    effort: plan.policy.effort,
    provenance: selected.provenance,
    score: selected.score,
    source: draft.resolution.source,
    taskKind: plan.taskKind,
    confidence,
    fallbackCause: draft.resolution.cause,
    modelProposal: draft.resolution.proposal,
    reason: withPolicyReason(reason, plan, tier),
    candidates: buildCandidateTrace(draft, gathered),
    explanation,
  };
}

function withOnlyEligible(reason: string, plan: PhasePlan): string {
  if (plan.constraint.status !== 'eligible' || plan.constraint.pinAccepted) {
    return reason;
  }
  if (plan.constraint.eligible.length !== 1) return reason;
  return `${reason}; only eligible candidate`;
}

function overallSourceOf(
  roster: readonly (ChosenEntry | UnavailableEntry)[],
): 'model' | 'ranking' | 'mixed' {
  let chosen = 0;
  let model = 0;
  for (const entry of roster) {
    if (entry.status !== 'chosen') continue;
    chosen += 1;
    if (entry.source === 'model') model += 1;
  }
  if (model === 0) return 'ranking';
  if (model === chosen) return 'model';
  return 'mixed';
}

function confidenceEntry(entry: ChosenEntry | UnavailableEntry):
  | {
      readonly status: 'chosen';
      readonly source: ChosenEntry['source'];
      readonly reportedConfidence: number | null;
    }
  | { readonly status: 'unavailable' } {
  if (entry.status === 'unavailable') return { status: 'unavailable' };
  return {
    status: 'chosen',
    source: entry.source,
    reportedConfidence: entry.confidence,
  };
}

function requiredPlan(
  plans: ReadonlyMap<string, PhasePlan>,
  phaseId: string,
): PhasePlan {
  const plan = plans.get(phaseId);
  if (plan === undefined) throw new Error(`phase ${phaseId} was not planned`);
  return plan;
}

function requiredResolution(
  resolutions: ReadonlyMap<string, PhaseResolution>,
  phaseId: string,
): PhaseResolution {
  const resolution = resolutions.get(phaseId);
  if (resolution === undefined) {
    throw new Error(`phase ${phaseId} was not resolved`);
  }
  return resolution;
}
