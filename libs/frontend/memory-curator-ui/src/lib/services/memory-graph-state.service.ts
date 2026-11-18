import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { AppStateManager } from '@ptah-extension/core';
import {
  MEMORY_GRAPH_LIMITS,
  type MemoryGraphEdgeKind,
  type MemoryGraphNodeWire,
  type MemoryGraphResult,
} from '@ptah-extension/shared';
import { graphFiltersToParams } from '../components/graph/model/graph-filters-to-params';
import { graphSearch } from '../components/graph/model/graph-search';
import type {
  GraphViewOptions,
  MemoryGraphFilters,
} from '../components/graph/model/graph.types';
import { MemoryRpcService } from './memory-rpc.service';
import { memoryFailureMessage } from './memory-state.service';

const ALL_EDGES: readonly MemoryGraphEdgeKind[] = [
  'semantic',
  'subject',
  'session',
];
export const DEFAULT_GRAPH_FILTERS: MemoryGraphFilters = {
  tiers: [],
  kinds: [],
  pinnedOnly: false,
  scope: 'workspace',
  sessionId: null,
  createdFrom: null,
  createdTo: null,
  edgeKinds: ALL_EDGES,
  minSimilarity: MEMORY_GRAPH_LIMITS.minSimilarity.default,
  maxNodes: MEMORY_GRAPH_LIMITS.maxNodes.default,
};
export const DEFAULT_GRAPH_VIEW: GraphViewOptions = {
  colorBy: 'kind',
  sizeBy: 'salience',
  clusterBy: 'subject',
  mode: 'nodes',
  showLabels: false,
  frozen: false,
};

@Injectable({ providedIn: 'root' })
export class MemoryGraphStateService {
  private readonly rpc = inject(MemoryRpcService);
  private readonly appState = inject(AppStateManager);
  private readonly destroyRef = inject(DestroyRef);
  private readonly _filters = signal<MemoryGraphFilters>(DEFAULT_GRAPH_FILTERS);
  private readonly _result = signal<MemoryGraphResult | null>(null);
  /**
   * Session choices for the filter. A session-filtered result holds one
   * session only, so the choices come from a result without the session
   * filter. `sessionsContext` identifies the other filters of that result.
   */
  private readonly _sessions = signal<readonly string[]>([]);
  private sessionsContext: string | null = null;
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _selectedIds = signal<readonly string[]>([]);
  private readonly _searchQuery = signal('');
  private readonly _view = signal<GraphViewOptions>(DEFAULT_GRAPH_VIEW);
  private requestSeq = 0;
  private lastWorkspacePath = this.appState.workspaceInfo()?.path ?? null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor() {
    effect(() => {
      const path = this.appState.workspaceInfo()?.path ?? null;
      if (path !== this.lastWorkspacePath) {
        this.lastWorkspacePath = path;
        this.clearSelection();
      }
    });
    this.destroyRef.onDestroy(() => {
      if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
      ++this.requestSeq;
    });
  }

  public readonly filters = this._filters.asReadonly();
  public readonly result = this._result.asReadonly();
  public readonly loading = this._loading.asReadonly();
  public readonly error = this._error.asReadonly();
  public readonly selectedIds = this._selectedIds.asReadonly();
  public readonly searchQuery = this._searchQuery.asReadonly();
  public readonly view = this._view.asReadonly();
  public readonly nodes = computed(() => this._result()?.nodes ?? []);
  public readonly edges = computed(() => {
    const filters = this._filters();
    return (this._result()?.edges ?? []).filter(
      (edge) =>
        filters.edgeKinds.includes(edge.kind) &&
        (edge.kind !== 'semantic' || edge.weight >= filters.minSimilarity),
    );
  });
  public readonly edgeCounts = computed(() => {
    const edges = this._result()?.edges ?? [];
    return {
      semantic: edges.filter((edge) => edge.kind === 'semantic').length,
      subject: edges.filter((edge) => edge.kind === 'subject').length,
      session: edges.filter((edge) => edge.kind === 'session').length,
    };
  });
  public readonly capped = computed(() => this._result()?.capped ?? false);
  public readonly totalMatching = computed(
    () => this._result()?.totalMatching ?? 0,
  );
  public readonly semanticAvailable = computed(
    () => this._result()?.semanticAvailable ?? true,
  );
  public readonly selectedNodes = computed(() => {
    const byId = new Map(this.nodes().map((node) => [node.id, node]));
    return this._selectedIds().flatMap((id) => {
      const node = byId.get(id);
      return node ? [node] : [];
    });
  });
  public readonly matchIds = computed(() =>
    graphSearch(this.nodes(), this._searchQuery()),
  );
  public readonly sessions = this._sessions.asReadonly();
  public readonly isDefaultFilters = computed(() => {
    const f = this._filters();
    return (
      f.tiers.length === 0 &&
      f.kinds.length === 0 &&
      !f.pinnedOnly &&
      f.scope === 'workspace' &&
      f.sessionId === null &&
      f.createdFrom === null &&
      f.createdTo === null &&
      f.edgeKinds.length === ALL_EDGES.length &&
      ALL_EDGES.every((kind) => f.edgeKinds.includes(kind)) &&
      f.minSimilarity === DEFAULT_GRAPH_FILTERS.minSimilarity &&
      f.maxNodes === DEFAULT_GRAPH_FILTERS.maxNodes
    );
  });

  public async refresh(): Promise<void> {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    const seq = ++this.requestSeq;
    const filters = this._filters();
    const root = this.appState.workspaceInfo()?.path ?? null;
    if (filters.scope === 'workspace' && !root) {
      this._loading.set(false);
      this._result.set(null);
      this._sessions.set([]);
      this.sessionsContext = null;
      this.clearSelection();
      this._error.set('No workspace is open.');
      return;
    }
    this._loading.set(true);
    this._error.set(null);
    try {
      const result = await this.rpc.graph(graphFiltersToParams(filters, root));
      if (seq === this.requestSeq) {
        this._result.set(result);
        await this.updateSessions(result, filters, root, seq);
      }
    } catch {
      if (seq === this.requestSeq)
        this._error.set(memoryFailureMessage('list'));
    } finally {
      if (seq === this.requestSeq) this._loading.set(false);
    }
  }

  private async updateSessions(
    result: MemoryGraphResult,
    filters: MemoryGraphFilters,
    root: string | null,
    seq: number,
  ): Promise<void> {
    const params = graphFiltersToParams({ ...filters, sessionId: null }, root);
    const context = JSON.stringify(params);
    if (filters.sessionId === null) {
      this.setSessions(result.nodes, context);
      return;
    }
    if (context === this.sessionsContext) return;
    // The other filters changed while a session filter is active: the
    // choices need a result without the session filter.
    this._sessions.set([filters.sessionId]);
    this.sessionsContext = null;
    try {
      const unfiltered = await this.rpc.graph(params);
      if (seq !== this.requestSeq) return;
      this.setSessions(unfiltered.nodes, context, filters.sessionId);
    } catch {
      // degradation-audit: optional-capability - the graph result is shown;
      // the choices keep the selected session and the next refresh tries again
    }
  }

  private setSessions(
    nodes: readonly MemoryGraphNodeWire[],
    context: string,
    selected: string | null = null,
  ): void {
    const found = nodes.flatMap((node) =>
      node.sessionId ? [node.sessionId] : [],
    );
    this._sessions.set(
      [...new Set(selected ? [selected, ...found] : found)].sort(),
    );
    this.sessionsContext = context;
  }

  public patchFilters(patch: Partial<MemoryGraphFilters>): void {
    const old = this._filters();
    const next = { ...old, ...patch };
    this._filters.set(next);
    const serverKeys: readonly (keyof MemoryGraphFilters)[] = [
      'tiers',
      'kinds',
      'pinnedOnly',
      'scope',
      'sessionId',
      'createdFrom',
      'createdTo',
      'maxNodes',
    ];
    if (serverKeys.some((key) => old[key] !== next[key]))
      this.scheduleRefresh();
  }
  public resetFilters(): void {
    this.patchFilters(DEFAULT_GRAPH_FILTERS);
  }
  public patchView(patch: Partial<GraphViewOptions>): void {
    this._view.update((view) => ({ ...view, ...patch }));
  }
  public setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }
  public select(id: string, additive = false): void {
    this._selectedIds.update((ids) =>
      additive ? (ids.includes(id) ? ids : [...ids, id]) : [id],
    );
  }
  public clearSelection(): void {
    this._selectedIds.set([]);
  }
  public deselect(id: string): void {
    this._selectedIds.update((ids) =>
      ids.filter((selected) => selected !== id),
    );
  }
  public async showUpToMax(): Promise<void> {
    this._filters.update((filters) => ({
      ...filters,
      maxNodes: MEMORY_GRAPH_LIMITS.maxNodes.max,
    }));
    await this.refresh();
  }
  public removeNodes(ids: readonly string[]): void {
    const removed = new Set(ids);
    const before = this.nodes();
    this._result.update((result) =>
      result
        ? {
            ...result,
            nodes: result.nodes.filter((node) => !removed.has(node.id)),
            edges: result.edges.filter(
              (edge) => !removed.has(edge.source) && !removed.has(edge.target),
            ),
            totalMatching: Math.max(
              0,
              result.totalMatching -
                result.nodes.filter((node) => removed.has(node.id)).length,
            ),
          }
        : null,
    );
    this._selectedIds.update((selected) =>
      selected.filter((id) => !removed.has(id)),
    );
    const remaining = new Set(this.nodes().map((node) => node.sessionId));
    const emptied = new Set(
      before
        .filter((node) => removed.has(node.id))
        .map((node) => node.sessionId)
        .filter((sessionId) => !remaining.has(sessionId)),
    );
    if (emptied.size > 0)
      this._sessions.update((sessions) =>
        sessions.filter((sessionId) => !emptied.has(sessionId)),
      );
  }
  public patchNode(id: string, patch: Partial<MemoryGraphNodeWire>): void {
    this._result.update((result) =>
      result
        ? {
            ...result,
            nodes: result.nodes.map((node) =>
              node.id === id ? { ...node, ...patch, id: node.id } : node,
            ),
          }
        : null,
    );
  }
  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    ++this.requestSeq;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 250);
  }
}
