import type { GraphPalette } from './model/graph.types';

export const FALLBACK_GRAPH_PALETTE: GraphPalette = {
  kind: {
    fact: '#5b8def',
    preference: '#ab7ee8',
    event: '#e3a65b',
    entity: '#5fbf9f',
  },
  tier: { core: '#d5a348', recall: '#5b8def', archival: '#89919e' },
  session: ['#5b8def', '#ab7ee8', '#5fbf9f', '#e3a65b'],
  cluster: ['#5fbf9f', '#e3a65b', '#ab7ee8', '#5b8def'],
  fallback: '#89919e',
};

export function readGraphPalette(element: Element): GraphPalette {
  const view = element.ownerDocument.defaultView;
  if (!view) return FALLBACK_GRAPH_PALETTE;
  const style = view.getComputedStyle(element);
  const token = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  const base = FALLBACK_GRAPH_PALETTE;
  return {
    kind: {
      fact: token('--color-info', base.kind.fact),
      preference: token('--color-secondary', base.kind.preference),
      event: token('--color-warning', base.kind.event),
      entity: token('--color-success', base.kind.entity),
    },
    tier: {
      core: token('--color-warning', base.tier.core),
      recall: token('--color-info', base.tier.recall),
      archival: token('--color-base-content-muted', base.tier.archival),
    },
    session: base.session,
    cluster: base.cluster,
    fallback: token('--color-base-content-muted', base.fallback),
  };
}
