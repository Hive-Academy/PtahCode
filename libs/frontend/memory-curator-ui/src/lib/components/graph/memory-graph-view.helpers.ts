import type {
  MemoryGraphEdgeWire,
  MemoryGraphNodeWire,
} from '@ptah-extension/shared';
import type { ConnectedMemory } from './memory-inspector.component';

export const GRAPH_VIEW_STYLES = `
      .graph-pane {
        container-type: inline-size;
        min-width: 0;
      }
      .graph-grid {
        display: grid;
        grid-template-columns: 15rem minmax(0, 1fr) 20rem;
        min-height: 34rem;
        position: relative;
      }
      .graph-rail {
        min-width: 0;
      }
      .graph-main {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .graph-canvas {
        min-height: 26rem;
        flex: 1;
        position: relative;
      }
      .graph-inspector {
        min-width: 0;
        border-left: 1px solid var(--color-surface-border);
      }
      @container (max-width: 1279px) {
        .graph-grid {
          grid-template-columns: 15rem minmax(0, 1fr);
        }
        .graph-inspector {
          position: absolute;
          z-index: 12;
          right: 0;
          top: 0;
          bottom: 0;
          width: min(20rem, 85%);
          background: var(--color-surface-2);
          box-shadow: -8px 0 24px #0002;
        }
      }
      @container (max-width: 899px) {
        .graph-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .graph-rail {
          position: absolute;
          z-index: 15;
          left: 0;
          top: 0;
          bottom: 0;
          width: min(15rem, 85%);
          overflow: auto;
          background: var(--color-surface-2);
          box-shadow: 8px 0 24px #0002;
        }
      }
    `;

export function connectedMemories(
  selected: readonly MemoryGraphNodeWire[],
  nodes: readonly MemoryGraphNodeWire[],
  edges: readonly MemoryGraphEdgeWire[],
): readonly ConnectedMemory[] {
  if (selected.length !== 1) return [];
  const id = selected[0].id;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges
    .flatMap((edge) => {
      const other =
        edge.source === id
          ? edge.target
          : edge.target === id
            ? edge.source
            : null;
      const node = other ? byId.get(other) : undefined;
      return node ? [{ node, kind: edge.kind, weight: edge.weight }] : [];
    })
    .sort((a, b) => b.weight - a.weight);
}

export function observeGraphPane(
  element: HTMLElement,
  onLayout: (layout: 'wide' | 'medium' | 'narrow') => void,
  onTheme: () => void,
): () => void {
  const updateLayout = (width: number): void =>
    onLayout(width < 900 ? 'narrow' : width < 1280 ? 'medium' : 'wide');
  updateLayout(element.getBoundingClientRect().width);
  const resize =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) =>
          updateLayout(entries[0]?.contentRect.width ?? element.clientWidth),
        );
  resize?.observe(element);
  onTheme();
  const theme = new MutationObserver(onTheme);
  theme.observe(element.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-theme-mode'],
  });
  return () => {
    resize?.disconnect();
    theme.disconnect();
  };
}
