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

export interface CandidatePoolSource {
  readonly lanes: readonly LaneCandidate[];
  readonly roles: readonly string[];
  readonly childSessionEligible?: boolean;
}

export interface CandidateToolsDetailedResult {
  readonly byPhase: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly string[] | null>
  >;
  readonly timedOutPhases: readonly string[];
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

/** Read gate-stage tool lists once per phase and candidate, optionally bounded by a deadline. */
export async function readCandidateToolsDetailed(
  phases: GatePhases,
  gathered: CandidatePoolSource,
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
  deadline?: RouteDeadline,
): Promise<CandidateToolsDetailedResult> {
  const byPhase = new Map<string, ReadonlyMap<string, readonly string[] | null>>();
  const timedOutPhases: string[] = [];

  const requiredPhases = phases.filter(
    (phase) => (phase.requiredCapabilities ?? []).length > 0,
  );
  if (requiredPhases.length === 0) {
    return { byPhase, timedOutPhases };
  }

  const phaseResults = await Promise.all(
    requiredPhases.map(async (phase) => {
      let phaseTimedOut = false;
      const entries = await Promise.all(
        candidatesForPhase(phase, gathered).map(async (candidate) => {
          const readTools = source.tools;
          if (readTools === undefined) {
            return [candidate.id, null] as const;
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
              return [candidate.id, raced.value ?? null] as const;
            }
            if (raced.kind === 'deadline') {
              phaseTimedOut = true;
              logger.warn('[lane-routing] candidate tool list timed out', {
                candidateId: candidate.id,
                phaseId: phase.id,
              });
              return [candidate.id, null] as const;
            }
            logger.warn('[lane-routing] candidate tool list unreadable', {
              candidateId: candidate.id,
              errorName:
                raced.error instanceof Error ? raced.error.name : 'unknown',
            });
            return [candidate.id, null] as const;
          }
          try {
            return [candidate.id, (await readTools(candidate, phase)) ?? null] as const;
          } catch (error: unknown) {
            logger.warn('[lane-routing] candidate tool list unreadable', {
              candidateId: candidate.id,
              errorName: error instanceof Error ? error.name : 'unknown',
            });
            return [candidate.id, null] as const;
          }
        }),
      );
      return { phaseId: phase.id, map: new Map(entries), phaseTimedOut };
    }),
  );

  for (const result of phaseResults) {
    byPhase.set(result.phaseId, result.map);
    if (result.phaseTimedOut) {
      timedOutPhases.push(result.phaseId);
    }
  }
  return { byPhase, timedOutPhases };
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
