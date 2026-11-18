import type { MemoryGraphEdgeKind, MemoryGraphNodeWire, MemoryKindWire, MemoryTierWire } from '@ptah-extension/shared';

export interface MemoryGraphFilters {
  readonly tiers: readonly MemoryTierWire[];
  readonly kinds: readonly MemoryKindWire[];
  readonly pinnedOnly: boolean;
  readonly scope: 'workspace' | 'all';
  readonly sessionId: string | null;
  readonly createdFrom: number | null;
  readonly createdTo: number | null;
  readonly edgeKinds: readonly MemoryGraphEdgeKind[];
  readonly minSimilarity: number;
  readonly maxNodes: number;
}

export interface GraphViewOptions {
  readonly colorBy: 'kind' | 'tier' | 'session' | 'cluster';
  readonly sizeBy: 'salience' | 'hits' | 'uniform';
  readonly clusterBy: 'subject' | 'session' | 'kind';
  readonly mode: 'nodes' | 'clusters';
  readonly showLabels: boolean;
  readonly frozen: boolean;
}

export interface GraphPalette {
  readonly kind: Readonly<Record<MemoryKindWire, string>>;
  readonly tier: Readonly<Record<MemoryTierWire, string>>;
  readonly session: readonly string[];
  readonly cluster: readonly string[];
  readonly fallback: string;
}

export interface RenderNode {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly size: number;
  readonly cluster: string;
  readonly pinned: boolean;
  readonly core: boolean;
  readonly wire: MemoryGraphNodeWire;
}

export interface RenderEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: MemoryGraphEdgeKind;
  readonly weight: number;
  readonly dash: 'solid' | 'dashed' | 'dotted';
  readonly opacity: number;
}

export interface GraphModel {
  readonly nodes: readonly RenderNode[];
  readonly edges: readonly RenderEdge[];
  readonly clusters: readonly string[];
}
