import type { MemoryWire } from '@ptah-extension/shared';
import type { MemoryGraphFilters } from './graph.types';

export function matchesGraphFilters(entry: MemoryWire, filters: MemoryGraphFilters): boolean {
  return (filters.tiers.length === 0 || filters.tiers.includes(entry.tier))
    && (filters.kinds.length === 0 || filters.kinds.includes(entry.kind))
    && (!filters.pinnedOnly || entry.pinned)
    && (!filters.sessionId || entry.sessionId === filters.sessionId)
    && (filters.createdFrom === null || entry.createdAt >= filters.createdFrom)
    && (filters.createdTo === null || entry.createdAt <= filters.createdTo);
}
