/**
 * Ranking candidates (part A §4).
 *
 * Plain data for one routing call. Lane identity is `ptahCliId` for a Ptah
 * CLI row and `cli` otherwise (part A data flow, step 5). Family prefers the
 * row's `family` and otherwise `laneFamilyOf`. A null limit map, or a missing
 * key, is `unknown`: missing evidence is not `at-limit`.
 */
import {
  laneFamilyOf,
  SUBAGENT_FAMILY,
  PHASE_KINDS,
  type CliDetectionResult,
  type CliType,
  type LaneFamilyInput,
  type LaneLimitState,
} from '@ptah-extension/shared';
import type { LimitEvidence } from '../contracts/route-decide-result.schema';

export interface LaneCandidate {
  readonly kind: 'lane';
  /** `ptahCliId` when the row is a Ptah CLI agent; otherwise `cli`. */
  readonly id: string;
  readonly cli: CliType;
  readonly ptahCliId?: string;
  readonly displayName?: string;
  readonly family: string;
  readonly installed: boolean;
  readonly disabled: boolean;
  readonly limitState: LaneLimitState;
  readonly limitEvidence?: LimitEvidence;
  /** Copied from the row. `0` means unranked and is preserved. */
  readonly preferredRank?: number;
}

export interface SubagentCandidate {
  readonly kind: 'subagent';
  /** `subagent:<role>`. */
  readonly id: string;
  readonly role?: string;
  readonly phaseKind?: (typeof PHASE_KINDS)[number];
  readonly family: typeof SUBAGENT_FAMILY;
}

/** An eligible new child session; no session id exists until start succeeds. */
export interface ChildSessionCandidate {
  readonly kind: 'child-session';
  readonly id: 'child-session';
  readonly family: typeof SUBAGENT_FAMILY;
}

export type RoutingCandidate = LaneCandidate | SubagentCandidate | ChildSessionCandidate;

/** User-facing label used for preference matching and the candidate trace. */
export function candidateDisplayName(candidate: RoutingCandidate): string {
  switch (candidate.kind) {
    case 'lane':
      return candidate.displayName ?? candidate.id;
    case 'subagent':
      return candidate.role ?? candidate.phaseKind ?? candidate.id;
    case 'child-session':
      return candidate.kind;
  }
}

/**
 * A system CLI lane has one default model and takes a per-call model id.
 * Ptah CLI providers and the `claude` lane select a model by tier instead.
 */
export function isSystemCliLane(
  candidate: RoutingCandidate,
): candidate is LaneCandidate {
  return (
    candidate.kind === 'lane' &&
    candidate.cli !== 'ptah-cli' &&
    candidate.cli !== 'claude'
  );
}

export function laneCandidateId(
  row: Pick<CliDetectionResult, 'cli' | 'ptahCliId'>,
): string {
  if (row.cli === 'ptah-cli' && row.ptahCliId) {
    return row.ptahCliId;
  }
  return row.cli;
}

/** Row `family` when the lister set it; otherwise `laneFamilyOf`. */
export function resolveLaneFamily(
  row: LaneFamilyInput & Pick<CliDetectionResult, 'family'>,
): string {
  if (row.family) {
    return row.family;
  }
  return laneFamilyOf(row);
}

/**
 * Limit-map key is the candidate id (`cli` or `ptahCliId`). A null map means
 * the limit lookup was unavailable, so every lane is `unknown`.
 */
export function limitStateForCandidate(
  candidateId: string,
  limits: ReadonlyMap<string, LaneLimitState> | null,
): LaneLimitState {
  if (limits === null) {
    return 'unknown';
  }
  return limits.get(candidateId) ?? 'unknown';
}

export function toLaneCandidate(
  row: CliDetectionResult,
  limits: ReadonlyMap<string, LaneLimitState> | null,
  evidence?: ReadonlyMap<string, LimitEvidence> | null,
): LaneCandidate {
  const id = laneCandidateId(row);
  const limitEvidence = evidence?.get(id);
  return {
    kind: 'lane',
    id,
    cli: row.cli,
    displayName: row.ptahCliName?.trim() || id,
    ...(row.cli === 'ptah-cli' && row.ptahCliId
      ? { ptahCliId: row.ptahCliId }
      : {}),
    family: resolveLaneFamily(row),
    installed: row.installed,
    disabled: row.disabled === true,
    limitState: limitEvidence?.state ?? limitStateForCandidate(id, limits),
    ...(limitEvidence === undefined ? {} : { limitEvidence }),
    ...(typeof row.preferredRank === 'number'
      ? { preferredRank: row.preferredRank }
      : {}),
  };
}

export function toSubagentCandidate(role: string): SubagentCandidate {
  if (role.trim() === '') {
    throw new Error('subagent role must be non-empty');
  }
  return {
    kind: 'subagent',
    id: `subagent:${role}`,
    role,
    family: SUBAGENT_FAMILY,
  };
}

export function toPhaseSubagentCandidate(phaseKind: (typeof PHASE_KINDS)[number]): SubagentCandidate {
  if (phaseKind.trim() === '') throw new Error('subagent phase kind must be non-empty');
  return { kind: 'subagent', id: `subagent:${phaseKind}`, phaseKind, family: SUBAGENT_FAMILY };
}
