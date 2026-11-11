/**
 * Resolves one planned phase after a decision-model pass, or from the
 * ranking pick when that pass did not send the phase.
 */
import type { RoutingCandidate } from '../ranking/candidate.types';
import type { FallbackCause } from '../reasons/compile-reasons';
import { MIN_OPTIONS_PER_PHASE } from '../routing-constants';
import { optionIndex } from './model-refine';
import type {
  ChosenResolution,
  PassContext,
  PhasePlan,
  PhaseResolution,
} from './phase-plan';
import { laneQuestion } from './phase-plan';

export function isSendable(plan: PhasePlan): boolean {
  return (
    plan.constraint.status === 'eligible' &&
    !plan.constraint.pinAccepted &&
    laneQuestion(plan).options.length >= MIN_OPTIONS_PER_PHASE
  );
}

export function resolvePhase(
  plan: PhasePlan,
  context: PassContext,
): PhaseResolution {
  if (plan.constraint.status === 'unavailable') return { kind: 'unavailable' };
  if (plan.constraint.pinAccepted) {
    const pinned = plan.constraint.eligible[0];
    if (pinned === undefined) {
      throw new Error(`phase ${plan.phaseId} pin has no candidate`);
    }
    return rankingResolution(pinned, 'pin', null, null);
  }
  const pick = rankingPick(plan);
  if (!isSendable(plan)) return rankingResolution(pick, 'ranking', null, null);
  const alternatesOnly = laneQuestion(plan).primaryCount < MIN_OPTIONS_PER_PHASE;
  const fallback = (cause: FallbackCause | null, proposal: ChosenResolution['proposal'] = null) =>
    rankingResolution(pick, 'ranking', alternatesOnly ? null : cause, alternatesOnly ? null : proposal);
  if (context.limited.has(plan.phaseId)) {
    return fallback('question-limit');
  }
  if (context.mode === 'blocked') {
    return fallback(context.blockedCause);
  }
  if (context.mode === 'ranking' || context.outcome === null) {
    return fallback(null);
  }
  const outcome = context.outcome;
  if (!outcome.sent || outcome.requestCause !== null) {
    return fallback(outcome.requestCause);
  }
  if (!outcome.offered.has(plan.phaseId)) return fallback(null);
  const validation = outcome.answers.get(plan.phaseId);
  if (
    validation === undefined ||
    validation.cause !== null ||
    validation.choice === null
  ) {
    return fallback(validation?.cause ?? 'bad-output', validation?.proposal ?? null);
  }
  const options = outcome.offered.get(plan.phaseId) ?? [];
  const index = optionIndex(validation.choice);
  const option = index === null ? undefined : options[index];
  const row =
    option === undefined
      ? undefined
      : plan.ranked.find((entry) => entry.candidate.id === option.laneId);
  if (option === undefined || row === undefined) {
    return fallback('bad-output');
  }
  const alternate = plan.alternates?.find((entry) =>
    entry.option.laneId === option.laneId && entry.option.model === option.model,
  );
  return {
    kind: 'chosen',
    source: 'model',
    candidate: row.candidate,
    ...(alternate !== undefined ? { selectedScore: alternate.scored } : {}),
    cause: null,
    proposal: null,
    reported: validation.confidence,
  };
}

function rankingResolution(
  candidate: RoutingCandidate,
  source: 'ranking' | 'pin',
  cause: FallbackCause | null,
  proposal: ChosenResolution['proposal'],
): ChosenResolution {
  return {
    kind: 'chosen',
    source,
    candidate,
    cause,
    proposal,
    reported: null,
  };
}

function rankingPick(plan: PhasePlan): RoutingCandidate {
  const pick = plan.spread?.pick?.candidate ?? plan.ranked[0]?.candidate;
  if (pick === undefined) {
    throw new Error(`phase ${plan.phaseId} has no ranking pick`);
  }
  return pick;
}
