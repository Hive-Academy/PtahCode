import { isRetiredRole, SUBAGENT_FAMILY } from '@ptah-extension/shared';
import type { RouteDecideArgs } from '../contracts/route-decide-args.schema';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import {
  toPhaseSubagentCandidate,
  toSubagentCandidate,
  type LaneCandidate,
  type RoutingCandidate,
} from '../ranking/candidate.types';
import type { RouteCandidateSource } from '../route-candidate-source.port';
import { withinBudget, type RouteDeadline } from './route-deadline';

type GatePhases = Extract<RouteDecideArgs, { stage: 'gate-0.1' }>['phases'];
type GatePhase = GatePhases[number];

export type ToolEvidenceFailureCause = 'timeout' | 'error' | 'unavailable';

const FAILURE_CAUSE_ORDER: readonly ToolEvidenceFailureCause[] = [
  'timeout',
  'error',
  'unavailable',
];

const MAX_GATHER_REASON_CHARS = 160;
const MAX_REASON_LABEL_CHARS = 64;

function isUnsafeReasonChar(code: number): boolean {
  return (
    code <= 0x1f || // U+0000-U+001F (includes CR, LF, TAB, ESC)
    (code >= 0x7f && code <= 0x9f) || // DEL and C1 controls
    code === 0x2028 || // LINE SEPARATOR
    code === 0x2029 || // PARAGRAPH SEPARATOR
    code === 0x3b // ';'
  );
}

/**
 * Sanitize and length-cap an aggregate gather diagnostic reason using the same
 * control-character, semicolon, whitespace, and 160-character rules used by
 * `routing-rules-setting.ts`.
 */
export function sanitizeGatherReason(
  message: string,
  maxChars: number = MAX_GATHER_REASON_CHARS,
): string {
  let replaced = '';
  for (let index = 0; index < message.length; index += 1) {
    const code = message.charCodeAt(index);
    replaced += isUnsafeReasonChar(code) ? ' ' : message[index];
  }
  const cleaned = replaced.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxChars - 3))}...`;
}

function formatToolUnavailableReason(
  phaseId: string,
  causes: ReadonlySet<ToolEvidenceFailureCause>,
): string {
  const safePhaseId =
    sanitizeGatherReason(phaseId, MAX_REASON_LABEL_CHARS) || 'unknown';
  const ordered = FAILURE_CAUSE_ORDER.filter((cause) => causes.has(cause));
  return sanitizeGatherReason(
    `tool evidence unavailable for phase ${safePhaseId} (${ordered.join(', ')})`,
  );
}

export interface CandidatePoolSource {
  readonly lanes: readonly LaneCandidate[];
  readonly roles: readonly string[];
  readonly childSessionEligible?: boolean;
}

export interface IncrementalCandidatePool {
  readonly lanes: Promise<readonly LaneCandidate[]>;
  readonly roles: Promise<readonly string[]>;
  readonly childSessionEligible?: boolean;
}

export interface CandidateToolsDetailedResult {
  readonly byPhase: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly string[] | null>
  >;
  readonly timedOutPhases: readonly string[];
  readonly timedOutCandidatesByPhase: ReadonlyMap<string, ReadonlySet<string>>;
  /** One bounded, sanitized aggregate reason per phase with unavailable/failed tool evidence. */
  readonly reasons: readonly string[];
}

interface CandidateToolReadOutcome {
  readonly candidateId: string;
  readonly tools: readonly string[] | null;
  readonly failure?: ToolEvidenceFailureCause;
}

interface PhaseToolsOutcome {
  readonly phaseId: string;
  readonly map: ReadonlyMap<string, readonly string[] | null>;
  readonly timedOutCandidates: ReadonlySet<string>;
  readonly reason?: string;
}

/** Build the full candidate inventory for one gate phase. */
export function candidatesForPhase(
  phase: GatePhase,
  gathered: CandidatePoolSource,
): RoutingCandidate[] {
  const candidates: RoutingCandidate[] = [...gathered.lanes];
  if (gathered.childSessionEligible) {
    candidates.push({
      kind: 'child-session',
      id: 'child-session',
      family: SUBAGENT_FAMILY,
    });
  }
  if (phase.role === undefined) {
    candidates.push(toPhaseSubagentCandidate(phase.kind));
  } else if (isRetiredRole(phase.role)) {
    candidates.push(toPhaseSubagentCandidate(phase.kind));
  } else if (gathered.roles.includes(phase.role)) {
    candidates.push(toSubagentCandidate(phase.role));
  }
  return candidates;
}

async function readOneCandidateTools(
  candidate: RoutingCandidate,
  phase: GatePhase,
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<CandidateToolReadOutcome> {
  const readTools = source.tools;
  if (readTools === undefined) {
    return { candidateId: candidate.id, tools: null, failure: 'unavailable' };
  }
  if (deadline !== undefined) {
    const raced = await withinBudget(
      deadline,
      () => readTools(candidate, phase),
      (error) => {
        logger.warn(
          '[lane-routing] candidate tool list rejected after deadline',
          {
            candidateId: candidate.id,
            errorName: error instanceof Error ? error.name : 'unknown',
          },
        );
      },
    );
    if (raced.kind === 'ok') {
      if (raced.value == null) {
        return {
          candidateId: candidate.id,
          tools: null,
          failure: 'unavailable',
        };
      }
      return { candidateId: candidate.id, tools: raced.value };
    }
    if (raced.kind === 'deadline') {
      logger.warn('[lane-routing] candidate tool list timed out', {
        candidateId: candidate.id,
        phaseId: phase.id,
      });
      return { candidateId: candidate.id, tools: null, failure: 'timeout' };
    }
    logger.warn('[lane-routing] candidate tool list unreadable', {
      candidateId: candidate.id,
      errorName: raced.error instanceof Error ? raced.error.name : 'unknown',
    });
    return { candidateId: candidate.id, tools: null, failure: 'error' };
  }
  try {
    const value = await readTools(candidate, phase);
    if (value == null) {
      return { candidateId: candidate.id, tools: null, failure: 'unavailable' };
    }
    return { candidateId: candidate.id, tools: value };
  } catch (error: unknown) {
    logger.warn('[lane-routing] candidate tool list unreadable', {
      candidateId: candidate.id,
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return { candidateId: candidate.id, tools: null, failure: 'error' };
  }
}

async function readPhaseToolsIncremental(
  phasePromise: Promise<GatePhase>,
  pool: IncrementalCandidatePool,
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<PhaseToolsOutcome | null> {
  const phase = await phasePromise;
  if ((phase.requiredCapabilities ?? []).length === 0) {
    return null;
  }

  // Child-session and built-in phase subagent proofs depend only on the phase's
  // own requirements (independent of rows, roles, limits, model lists, and matrix).
  const childSessionPromise = pool.childSessionEligible
    ? readOneCandidateTools(
        {
          kind: 'child-session',
          id: 'child-session',
          family: SUBAGENT_FAMILY,
        },
        phase,
        source,
        logger,
        deadline,
      )
    : Promise.resolve(null);

  const subagentPromise =
    phase.role === undefined || isRetiredRole(phase.role)
      ? readOneCandidateTools(
          toPhaseSubagentCandidate(phase.kind),
          phase,
          source,
          logger,
          deadline,
        )
      : pool.roles.then((roles) => {
          const role = phase.role;
          if (role === undefined || !roles.includes(role)) {
            return null;
          }
          return readOneCandidateTools(
            toSubagentCandidate(role),
            phase,
            source,
            logger,
            deadline,
          );
        });

  // Lane proofs depend only on provisional lane identities from rows and this
  // phase's requirements (independent of roles, limits, model lists, and matrix).
  const laneResultsPromise = pool.lanes.then((lanes) =>
    Promise.all(
      lanes.map((lane) =>
        readOneCandidateTools(lane, phase, source, logger, deadline),
      ),
    ),
  );

  const [laneResults, childSessionResult, subagentResult] = await Promise.all([
    laneResultsPromise,
    childSessionPromise,
    subagentPromise,
  ]);

  const orderedOutcomes: CandidateToolReadOutcome[] = [...laneResults];
  if (childSessionResult !== null) {
    orderedOutcomes.push(childSessionResult);
  }
  if (subagentResult !== null) {
    orderedOutcomes.push(subagentResult);
  }

  const map = new Map<string, readonly string[] | null>();
  const causes = new Set<ToolEvidenceFailureCause>();
  const timedOutCandidates = new Set<string>();
  for (const entry of orderedOutcomes) {
    map.set(entry.candidateId, entry.tools);
    if (entry.failure !== undefined) {
      causes.add(entry.failure);
      if (entry.failure === 'timeout') timedOutCandidates.add(entry.candidateId);
    }
  }

  return {
    phaseId: phase.id,
    map,
    timedOutCandidates,
    ...(causes.size > 0
      ? { reason: formatToolUnavailableReason(phase.id, causes) }
      : {}),
  };
}

/**
 * Start each candidate tool proof as soon as both its candidate identity and
 * its phase requirements are known, without waiting on unrelated gather joins.
 */
export async function readCandidateToolsIncremental(
  phasePromises: readonly Promise<GatePhase>[],
  pool: IncrementalCandidatePool,
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<CandidateToolsDetailedResult> {
  const byPhase = new Map<string, ReadonlyMap<string, readonly string[] | null>>();
  const timedOutPhases: string[] = [];
  const timedOutCandidatesByPhase = new Map<string, ReadonlySet<string>>();
  const reasons: string[] = [];

  if (phasePromises.length === 0) {
    return { byPhase, timedOutPhases, timedOutCandidatesByPhase, reasons };
  }

  const phaseResults = await Promise.all(
    phasePromises.map((phasePromise) =>
      readPhaseToolsIncremental(phasePromise, pool, source, logger, deadline),
    ),
  );

  for (const result of phaseResults) {
    if (result === null) continue;
    byPhase.set(result.phaseId, result.map);
    if (result.timedOutCandidates.size > 0) {
      timedOutPhases.push(result.phaseId);
      timedOutCandidatesByPhase.set(result.phaseId, result.timedOutCandidates);
    }
    if (result.reason !== undefined) {
      reasons.push(result.reason);
    }
  }
  return { byPhase, timedOutPhases, timedOutCandidatesByPhase, reasons };
}

/** Read gate-stage tool lists once per phase and candidate, optionally bounded by a deadline. */
export async function readCandidateToolsDetailed(
  phases: GatePhases,
  gathered: CandidatePoolSource,
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<CandidateToolsDetailedResult> {
  return readCandidateToolsIncremental(
    phases.map((phase) => Promise.resolve(phase)),
    {
      lanes: Promise.resolve(gathered.lanes),
      roles: Promise.resolve(gathered.roles),
      childSessionEligible: gathered.childSessionEligible,
    },
    source,
    logger,
    deadline,
  );
}

/** Read gate-stage lists once per phase and candidate. A failed or timed-out read is unknown. */
export async function readCandidateTools(
  phases: GatePhases,
  gathered: CandidatePoolSource,
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<ReadonlyMap<string, ReadonlyMap<string, readonly string[] | null>>> {
  const result = await readCandidateToolsDetailed(
    phases,
    gathered,
    source,
    logger,
    deadline,
  );
  return result.byPhase;
}
