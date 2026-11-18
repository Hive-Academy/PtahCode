import type { MemoryWire } from '@ptah-extension/shared';
import { DEFAULT_GRAPH_FILTERS } from '../../../services/memory-graph-state.service';
import { matchesGraphFilters } from './matches-graph-filters';

const entry = { tier: 'core', kind: 'fact', pinned: true, sessionId: 's1', createdAt: 100 } as MemoryWire;
describe('matchesGraphFilters', () => {
  it.each([
    ['default', {}, true],
    ['tier', { tiers: ['recall'] as const }, false],
    ['kind', { kinds: ['event'] as const }, false],
    ['pinned', { pinnedOnly: true }, true],
    ['session', { sessionId: 's2' }, false],
    ['from inclusive', { createdFrom: 100 }, true],
    ['from after', { createdFrom: 101 }, false],
    ['to inclusive', { createdTo: 100 }, true],
    ['to before', { createdTo: 99 }, false],
  ])('%s', (_name, patch, expected) => expect(matchesGraphFilters(entry, { ...DEFAULT_GRAPH_FILTERS, ...patch })).toBe(expected));
});
