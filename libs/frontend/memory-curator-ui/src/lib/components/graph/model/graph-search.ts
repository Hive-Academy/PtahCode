import type { MemoryGraphNodeWire } from '@ptah-extension/shared';

export function graphSearch(nodes: readonly MemoryGraphNodeWire[], query: string): Set<string> {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return new Set();
  return new Set(nodes.filter(node => `${node.subject ?? ''} ${node.preview}`.toLocaleLowerCase().includes(needle)).map(node => node.id));
}
