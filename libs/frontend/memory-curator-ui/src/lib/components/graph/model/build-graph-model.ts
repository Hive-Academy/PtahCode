import type { MemoryGraphEdgeWire, MemoryGraphNodeWire } from '@ptah-extension/shared';
import type { GraphModel, GraphPalette, GraphViewOptions } from './graph.types';
import { colorOf, edgeDash, edgeOpacity, radiusOf } from './node-style';

export function buildGraphModel(nodes: readonly MemoryGraphNodeWire[], edges: readonly MemoryGraphEdgeWire[], viewOptions: GraphViewOptions, theme: GraphPalette): GraphModel {
  const orderedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(orderedNodes.map(node => node.id));
  const clusterOf = (node: MemoryGraphNodeWire): string => viewOptions.clusterBy === 'kind' ? node.kind : viewOptions.clusterBy === 'session' ? node.sessionId ?? 'No session' : node.subject ?? 'No subject';
  const renderNodes = orderedNodes.map(node => ({
    id: node.id, label: node.subject ?? node.preview, color: colorOf(node, viewOptions.colorBy, theme),
    size: radiusOf(node, viewOptions.sizeBy), cluster: clusterOf(node), pinned: node.pinned,
    core: node.tier === 'core', wire: node,
  }));
  const renderEdges = edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({
    id: `${edge.kind}:${edge.source}:${edge.target}`, source: edge.source, target: edge.target,
    kind: edge.kind, weight: edge.weight, dash: edgeDash(edge.kind), opacity: edgeOpacity(edge.kind, edge.weight),
  })).sort((a, b) => a.id.localeCompare(b.id));
  return { nodes: renderNodes, edges: renderEdges, clusters: [...new Set(renderNodes.map(node => node.cluster))].sort() };
}
