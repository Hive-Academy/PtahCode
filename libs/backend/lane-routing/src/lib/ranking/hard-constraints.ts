/**
 * Hard-constraint filter (Requirements 3.2-3.6).
 *
 * Pure: no clock, no I/O, no randomness. The same input returns the same
 * result, and candidate order is the caller's order.
 *
 * A lane matches the first rule that applies: `at-limit`, then `disabled`,
 * then `not-installed`, required capabilities, then `reviewer-family`.
 * `pruned` is a later ranking cut (Requirement 12.2), not
 * a hard constraint.
 *
 * Reviewer-family compares a `review` or `document-review` phase with the
 * implement phases named by `reviews`, or with every implement phase when
 * `reviews` is absent or empty. Pass `deferReviewerFamily` on the pass that
 * runs before those executors exist. An empty forbidden set excludes nobody.
 *
 * A pin that breaks a rule, or that names no single candidate, makes the
 * phase `pin-unavailable`. Another candidate is never substituted. A pin
 * matches one candidate id, or a `cli` value that belongs to exactly one lane.
 */
import { PHASE_KINDS } from '../contracts/route-decide-args.schema';
import { capabilitiesFromTools, requiredCapabilities, type MachineCapability } from './capability';
import { EXCLUSION_RULES } from '../contracts/route-decide-result.schema';
import { EXCLUDED_LIMIT_STATE } from '../routing-constants';
import type { RoutingCandidate } from './candidate.types';

export type PhaseKind = (typeof PHASE_KINDS)[number];

export type ExclusionRule = (typeof EXCLUSION_RULES)[number];

/** Rules this filter can emit. `pruned` is intentionally absent. */
export const HARD_CONSTRAINT_RULES = [
  'at-limit',
  'disabled',
  'not-installed',
  'missing-capability',
  'capability-unknown',
  'reviewer-family',
  'not-listed',
] as const satisfies readonly ExclusionRule[];

export type HardConstraintRule = (typeof HARD_CONSTRAINT_RULES)[number];

/** Phases whose lane must not share an implementer's family (Req 3.3). */
export const REVIEW_PHASE_KINDS = [
  'review',
  'document-review',
] as const satisfies readonly PhaseKind[];

export const PHASE_EXCLUSION_REASONS = [
  'no-eligible-candidate',
  'reviewer-family',
  'pin-unavailable',
  'missing-capability',
] as const;

export type PhaseExclusionReason = (typeof PHASE_EXCLUSION_REASONS)[number];

export interface ConstraintPhase {
  readonly id: string;
  readonly kind: PhaseKind;
  /** Implement phase ids this review covers. Empty means every implement phase. */
  readonly reviews?: readonly string[];
  readonly requiredCapabilities?: readonly MachineCapability[];
}

export interface KnownPhaseExecutor {
  readonly phaseId: string;
  readonly kind: PhaseKind;
  readonly family: string;
}

export interface CandidateExclusion {
  readonly candidate: string;
  readonly rule: ExclusionRule;
  readonly capability?: MachineCapability;
}

export interface ConstrainPhaseInput {
  readonly phase: ConstraintPhase;
  readonly candidates: readonly RoutingCandidate[];
  readonly toolNames?: ReadonlyMap<string, readonly string[] | null>;
  /** User pin executor: a candidate id, a unique `cli` value, or `subagent:<role>`. */
  readonly pin?: { readonly executor: string };
  readonly knownExecutors?: readonly KnownPhaseExecutor[];
  /**
   * Skip reviewer-family. Set on the pre-review pass (data-flow step 6).
   * The review pass omits it and supplies `knownExecutors`.
   */
  readonly deferReviewerFamily?: boolean;
}

export interface EligiblePhase {
  readonly phaseId: string;
  readonly status: 'eligible';
  readonly eligible: readonly RoutingCandidate[];
  /** Rule exclusions only. A pin does not mark the other clean candidates. */
  readonly excluded: readonly CandidateExclusion[];
  readonly pinAccepted: boolean;
}

export interface UnavailablePhase {
  readonly phaseId: string;
  readonly status: 'unavailable';
  readonly exclusionReason: PhaseExclusionReason;
  readonly excluded: readonly CandidateExclusion[];
  /** Set only when `exclusionReason` is `pin-unavailable`. */
  readonly pinRule: ExclusionRule | null;
  /** True only for exclusion reason `reviewer-family` (Req 2.3). */
  readonly needsDisclosedFallback: boolean;
}

export type PhaseConstraintResult = EligiblePhase | UnavailablePhase;

function includesKind(kinds: readonly PhaseKind[], kind: PhaseKind): boolean {
  return kinds.some((entry) => entry === kind);
}

function forbiddenReviewerFamilies(
  phase: ConstraintPhase,
  knownExecutors: readonly KnownPhaseExecutor[],
  deferReviewerFamily: boolean,
): ReadonlySet<string> | null {
  if (deferReviewerFamily || !includesKind(REVIEW_PHASE_KINDS, phase.kind)) {
    return null;
  }
  const implementers = knownExecutors.filter(
    (executor) => executor.kind === 'implement',
  );
  const reviews = phase.reviews ?? [];
  const relevant =
    reviews.length > 0
      ? implementers.filter((executor) => reviews.includes(executor.phaseId))
      : implementers;
  return new Set(relevant.map((executor) => executor.family));
}

function exclusionRule(
  candidate: RoutingCandidate,
  required: readonly MachineCapability[],
  toolNames: ReadonlyMap<string, readonly string[] | null> | undefined,
  forbiddenFamilies: ReadonlySet<string> | null,
): ExclusionRule | null {
  if (candidate.kind === 'lane') {
    if (candidate.limitState === EXCLUDED_LIMIT_STATE) {
      return 'at-limit';
    }
    if (candidate.disabled) {
      return 'disabled';
    }
    if (!candidate.installed) {
      return 'not-installed';
    }
  }
  if (required.length > 0) {
    const names = toolNames?.get(candidate.id);
    if (names == null) return 'capability-unknown';
    const available = capabilitiesFromTools(names);
    if (required.some((capability) => !available.has(capability))) return 'missing-capability';
  }
  if (forbiddenFamilies?.has(candidate.family) === true) {
    return 'reviewer-family';
  }
  return null;
}

function single<T>(items: readonly T[]): T | null {
  if (items.length !== 1) {
    return null;
  }
  for (const item of items) {
    return item;
  }
  return null;
}

function resolvePin(
  candidates: readonly RoutingCandidate[],
  executor: string,
): RoutingCandidate | null {
  const byId = candidates.filter((candidate) => candidate.id === executor);
  if (byId.length > 1) {
    return null;
  }
  const byIdMatch = single(byId);
  if (byIdMatch) {
    return byIdMatch;
  }
  const byCli = candidates.filter(
    (candidate) => candidate.kind === 'lane' && candidate.cli === executor,
  );
  if (byCli.length > 1) {
    return null;
  }
  return single(byCli);
}

function withRule(
  excluded: readonly CandidateExclusion[],
  candidate: string,
  rule: ExclusionRule,
): readonly CandidateExclusion[] {
  const already = excluded.some(
    (entry) => entry.candidate === candidate && entry.rule === rule,
  );
  if (already) {
    return excluded;
  }
  return [...excluded, { candidate, rule }];
}

function unavailable(
  phaseId: string,
  exclusionReason: PhaseExclusionReason,
  excluded: readonly CandidateExclusion[],
  pinRule: ExclusionRule | null,
): UnavailablePhase {
  return {
    phaseId,
    status: 'unavailable',
    exclusionReason,
    excluded,
    pinRule,
    needsDisclosedFallback: exclusionReason === 'reviewer-family',
  };
}

function classify(
  candidates: readonly RoutingCandidate[],
  required: readonly MachineCapability[],
  toolNames: ReadonlyMap<string, readonly string[] | null> | undefined,
  forbiddenFamilies: ReadonlySet<string> | null,
): {
  readonly eligible: readonly RoutingCandidate[];
  readonly excluded: readonly CandidateExclusion[];
} {
  const eligible: RoutingCandidate[] = [];
  const excluded: CandidateExclusion[] = [];
  for (const candidate of candidates) {
    const rule = exclusionRule(candidate, required, toolNames, forbiddenFamilies);
    if (rule === null) {
      eligible.push(candidate);
    } else {
      excluded.push({ candidate: candidate.id, rule,
        ...(rule === 'missing-capability' || rule === 'capability-unknown'
          ? { capability: required[0] } : {}),
      });
    }
  }
  return { eligible, excluded };
}

export function constrainPhase(
  input: ConstrainPhaseInput,
): PhaseConstraintResult {
  const required = requiredCapabilities(input.phase.kind, input.phase.requiredCapabilities);
  const forbiddenFamilies = forbiddenReviewerFamilies(
    input.phase,
    input.knownExecutors ?? [],
    input.deferReviewerFamily === true,
  );
  const classified = classify(
    input.candidates,
    required,
    input.toolNames,
    forbiddenFamilies,
  );

  const pin = input.pin;
  if (pin) {
    const target = resolvePin(input.candidates, pin.executor);
    if (!target) {
      return unavailable(
        input.phase.id,
        'pin-unavailable',
        withRule(classified.excluded, pin.executor, 'not-listed'),
        'not-listed',
      );
    }
    const pinRule = exclusionRule(target, required, input.toolNames, forbiddenFamilies);
    if (pinRule) {
      return unavailable(
        input.phase.id,
        'pin-unavailable',
        withRule(classified.excluded, target.id, pinRule),
        pinRule,
      );
    }
    return {
      phaseId: input.phase.id,
      status: 'eligible',
      eligible: [target],
      excluded: classified.excluded,
      pinAccepted: true,
    };
  }

  if (classified.eligible.length === 0) {
    if (classified.excluded.some((entry) => entry.rule === 'missing-capability' || entry.rule === 'capability-unknown')) {
      return unavailable(input.phase.id, 'missing-capability', classified.excluded, null);
    }
    const blockedByFamily = classified.excluded.some(
      (entry) => entry.rule === 'reviewer-family',
    );
    if (blockedByFamily) {
      return unavailable(
        input.phase.id,
        'reviewer-family',
        classified.excluded,
        null,
      );
    }
    return unavailable(
      input.phase.id,
      'no-eligible-candidate',
      classified.excluded,
      null,
    );
  }

  return {
    phaseId: input.phase.id,
    status: 'eligible',
    eligible: classified.eligible,
    excluded: classified.excluded,
    pinAccepted: false,
  };
}

function assertConstraintVocabulary(): void {
  for (const rule of HARD_CONSTRAINT_RULES) {
    if (!EXCLUSION_RULES.includes(rule)) {
      throw new Error(`hard constraint rule ${rule} is not an exclusion rule`);
    }
  }
  for (const kind of REVIEW_PHASE_KINDS) {
    if (!PHASE_KINDS.includes(kind)) {
      throw new Error(`constraint phase ${kind} is not a phase kind`);
    }
  }
}

assertConstraintVocabulary();
