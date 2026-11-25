import type { RouteSpawnFacts } from '@ptah-extension/shared';
import type { GateResult } from '../contracts/route-decide-result.schema';
import { ROUTE_RECORD_CAP } from '../routing-constants';

const MAX_DECISION_MODEL_ID_LENGTH = 128;

export interface RouteRecordReader {
  spawnFacts(routeId: string, phaseId: string): RouteSpawnFacts | null;
}

export class RouteRecordRegistry implements RouteRecordReader {
  private readonly routes = new Map<string, ReadonlyMap<string, RouteSpawnFacts>>();

  store(routeId: string, roster: Readonly<GateResult['roster']>, decisionModel: string | null): void {
    const phases = new Map<string, RouteSpawnFacts>();
    const modelId = decisionModel?.slice(0, MAX_DECISION_MODEL_ID_LENGTH) ?? null;
    for (const entry of roster) {
      if (entry.status !== 'chosen') continue;
      phases.set(entry.phaseId, {
        routeId,
        phaseId: entry.phaseId,
        laneId: entry.executor.id,
        model: entry.model,
        effort: entry.effort,
        source: entry.source,
        decisionModel: entry.modelProposal === null ? null : modelId,
        proposalConfidence: entry.modelProposal?.confidence ?? null,
      });
    }
    this.routes.set(routeId, phases);
    if (this.routes.size > ROUTE_RECORD_CAP) {
      const oldest = this.routes.keys().next();
      if (!oldest.done) this.routes.delete(oldest.value);
    }
  }

  spawnFacts(routeId: string, phaseId: string): RouteSpawnFacts | null {
    return this.routes.get(routeId)?.get(phaseId) ?? null;
  }
}
