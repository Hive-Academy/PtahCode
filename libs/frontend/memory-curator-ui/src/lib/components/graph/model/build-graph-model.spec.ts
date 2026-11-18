import type { MemoryGraphNodeWire, MemoryGraphEdgeWire } from '@ptah-extension/shared';
import { DEFAULT_GRAPH_VIEW } from '../../../services/memory-graph-state.service';
import { buildGraphModel } from './build-graph-model';
import type { GraphPalette } from './graph.types';
const palette: GraphPalette = { kind: { fact: 'red', event: 'blue', entity: 'green', preference: 'yellow' }, tier: { core: 'gold', recall: 'gray', archival: 'black' }, session: [], cluster: [], fallback: 'white' };
const nodes = [{ id: 'b', kind: 'fact', tier: 'core', salience: 0.5, hits: 1, subject: 'B', pinned: false }, { id: 'a', kind: 'fact', tier: 'core', salience: 0.5, hits: 1, subject: 'A', pinned: false }] as MemoryGraphNodeWire[];
const edges = [{ source: 'a', target: 'b', kind: 'subject', weight: 1 }, { source: 'a', target: 'missing', kind: 'semantic', weight: 0.8 }] as MemoryGraphEdgeWire[];
it.each([['normal', nodes, edges, ['a', 'b'], 1], ['reverse', [...nodes].reverse(), [...edges].reverse(), ['a', 'b'], 1]] as const)('%s stable model', (_name, inputNodes, inputEdges, expectedIds, edgeCount) => {
  const model = buildGraphModel(inputNodes, inputEdges, DEFAULT_GRAPH_VIEW, palette);
  expect(model.nodes.map(node => node.id)).toEqual(expectedIds);
  expect(model.edges).toHaveLength(edgeCount);
  expect(model.clusters).toEqual(['A', 'B']);
});
