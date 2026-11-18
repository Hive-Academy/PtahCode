import { MEMORY_GRAPH_LIMITS, type MemoryGraphParams } from '@ptah-extension/shared';
import type { MemoryGraphFilters } from './graph.types';

export function graphFiltersToParams(filters: MemoryGraphFilters, workspaceRoot: string | null): MemoryGraphParams {
  return {
    scope: filters.scope,
    ...(filters.scope === 'workspace' && workspaceRoot ? { workspaceRoot } : {}),
    ...(filters.tiers.length && filters.tiers.length < 3 ? { tiers: filters.tiers } : {}),
    ...(filters.kinds.length && filters.kinds.length < 4 ? { kinds: filters.kinds } : {}),
    ...(filters.pinnedOnly ? { pinnedOnly: true } : {}),
    ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
    ...(filters.createdFrom !== null ? { createdFrom: filters.createdFrom } : {}),
    ...(filters.createdTo !== null ? { createdTo: filters.createdTo } : {}),
    maxNodes: filters.maxNodes,
    minSimilarity: MEMORY_GRAPH_LIMITS.minSimilarity.min,
  };
}
