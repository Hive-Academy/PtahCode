import type { RouteCandidateSource } from '../route-candidate-source.port';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { requiredCapabilities } from '../ranking/capability';
import type { GateArgs } from './phase-plan';
import { candidatesFor } from './phase-plan';
import type { GatheredCall } from './gather';

/** Read gate-stage lists once per phase and candidate. A failed read is unknown. */
export async function readCandidateTools(
  phases: GateArgs['phases'],
  gathered: GatheredCall,
  source: RouteCandidateSource,
  logger: LaneRoutingLogger,
): Promise<ReadonlyMap<string, ReadonlyMap<string, readonly string[] | null>>> {
  const byPhase = new Map<string, ReadonlyMap<string, readonly string[] | null>>();
  for (const phase of phases) {
    if (requiredCapabilities(phase.kind, phase.requiredCapabilities).length === 0) continue;
    const entries = await Promise.all(candidatesFor(phase, gathered).map(async (candidate) => {
      try {
        return [candidate.id, await source.tools?.(candidate, phase) ?? null] as const;
      } catch (error: unknown) {
        logger.warn('[lane-routing] candidate tool list unreadable', {
          candidateId: candidate.id,
          errorName: error instanceof Error ? error.name : 'unknown',
        });
        return [candidate.id, null] as const;
      }
    }));
    byPhase.set(phase.id, new Map(entries));
  }
  return byPhase;
}
