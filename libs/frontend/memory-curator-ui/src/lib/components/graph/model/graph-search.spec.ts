import type { MemoryGraphNodeWire } from '@ptah-extension/shared';
import { graphSearch } from './graph-search';
const nodes = [
  { id: 'a', subject: 'Alpha', preview: 'first' },
  { id: 'b', subject: null, preview: 'BETA text' },
] as MemoryGraphNodeWire[];
it.each([
  ['alpha', ['a']], ['beta', ['b']], ['TEXT', ['b']], ['missing', []], ['', []],
])('search %s', (query, ids) => expect([...graphSearch(nodes, query)]).toEqual(ids));
