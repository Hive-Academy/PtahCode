import type { MemoryGraphEdgeWire } from '@ptah-extension/shared';

export interface GraphPosition { readonly id: string; readonly x: number; readonly y: number }
export type GraphDirection = 'up' | 'down' | 'left' | 'right';

export function nearestInDirection(positions: readonly GraphPosition[], fromId: string, direction: GraphDirection): string | null {
  const origin = positions.find(position => position.id === fromId);
  if (!origin) return null;
  const candidates = positions.filter(position => {
    const dx = position.x - origin.x;
    const dy = position.y - origin.y;
    return direction === 'up' ? dy < 0 : direction === 'down' ? dy > 0 : direction === 'left' ? dx < 0 : dx > 0;
  });
  candidates.sort((a, b) => {
    const distance = (p: GraphPosition) => (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2;
    return distance(a) - distance(b) || a.id.localeCompare(b.id);
  });
  return candidates[0]?.id ?? null;
}

export function nextLinked(edges: readonly MemoryGraphEdgeWire[], fromId: string, index: number): string | null {
  const ids = [...new Set(edges.flatMap(edge => edge.source === fromId ? [edge.target] : edge.target === fromId ? [edge.source] : []))].sort();
  return ids.length ? ids[((index % ids.length) + ids.length) % ids.length] : null;
}
