import type { MemoryGraphEdgeKind, MemoryGraphNodeWire } from '@ptah-extension/shared';
import type { GraphPalette, GraphViewOptions } from './graph.types';

function paletteIndex(value: string, length: number): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return length ? hash % length : 0;
}

export function colorOf(node: MemoryGraphNodeWire, colorBy: GraphViewOptions['colorBy'], palette: GraphPalette): string {
  if (colorBy === 'kind') return palette.kind[node.kind];
  if (colorBy === 'tier') return palette.tier[node.tier];
  const key = colorBy === 'session' ? node.sessionId : node.subject;
  const colors = colorBy === 'session' ? palette.session : palette.cluster;
  return key && colors.length ? colors[paletteIndex(key, colors.length)] : palette.fallback;
}

export function radiusOf(node: MemoryGraphNodeWire, sizeBy: GraphViewOptions['sizeBy']): number {
  if (sizeBy === 'uniform') return 6;
  if (sizeBy === 'hits') return 4 + Math.min(12, Math.log2(Math.max(0, node.hits) + 1) * 2);
  return 4 + Math.min(12, Math.max(0, node.salience) * 12);
}

export function edgeDash(kind: MemoryGraphEdgeKind): 'solid' | 'dashed' | 'dotted' {
  return kind === 'subject' ? 'dashed' : kind === 'session' ? 'dotted' : 'solid';
}

export function edgeOpacity(kind: MemoryGraphEdgeKind, weight: number): number {
  return kind === 'semantic' ? Math.max(0, Math.min(1, weight)) : 0.7;
}
