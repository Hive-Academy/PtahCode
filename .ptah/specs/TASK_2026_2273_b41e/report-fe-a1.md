# FE-A1 — Memory graph data layer

## Files changed

- Modified `services/memory-rpc.service.ts` and `services/memory-rpc.service.spec.ts`.
- Created `services/memory-graph-state.service.ts` and `services/memory-graph-state.service.spec.ts`.
- Created `components/graph/model/graph.types.ts`, `graph-filters-to-params.ts`, `build-graph-model.ts`, `node-style.ts`, `graph-search.ts`, `keyboard-nav.ts`, `matches-graph-filters.ts`, and each matching `.spec.ts`.
- Captured `parity-attributes-before.txt` before editing the library.

All source paths above are under `libs/frontend/memory-curator-ui/src/lib/`.

## Public API

`MemoryRpcService.graph(params: MemoryGraphParams): Promise<MemoryGraphResult>`; RPC timeout 15,000 ms.

`MemoryGraphStateService` is root injectable. Read-only signal properties: `filters: Signal<MemoryGraphFilters>`, `result: Signal<MemoryGraphResult | null>`, `loading: Signal<boolean>`, `error: Signal<string | null>`, `selectedIds: Signal<readonly string[]>`, `searchQuery: Signal<string>`, `view: Signal<GraphViewOptions>`. Computed properties: `nodes`, `edges`, `edgeCounts`, `capped`, `totalMatching`, `semanticAvailable`, `selectedNodes`, `matchIds`, `sessions`, `isDefaultFilters`.

```ts
refresh(): Promise<void>
patchFilters(patch: Partial<MemoryGraphFilters>): void
resetFilters(): void
patchView(patch: Partial<GraphViewOptions>): void
setSearchQuery(query: string): void
select(id: string, additive?: boolean): void
clearSelection(): void
showUpToMax(): Promise<void>
removeNodes(ids: readonly string[]): void
patchNode(id: string, patch: Partial<MemoryGraphNodeWire>): void
```

Pure model signatures (types in `graph.types.ts`: `MemoryGraphFilters`, `GraphViewOptions`, `GraphPalette`, `RenderNode`, `RenderEdge`, `GraphModel`):

```ts
graphFiltersToParams(filters: MemoryGraphFilters, workspaceRoot: string | null): MemoryGraphParams
matchesGraphFilters(entry: MemoryWire, filters: MemoryGraphFilters): boolean
buildGraphModel(nodes: readonly MemoryGraphNodeWire[], edges: readonly MemoryGraphEdgeWire[], viewOptions: GraphViewOptions, theme: GraphPalette): GraphModel
colorOf(node: MemoryGraphNodeWire, colorBy: GraphViewOptions['colorBy'], palette: GraphPalette): string
radiusOf(node: MemoryGraphNodeWire, sizeBy: GraphViewOptions['sizeBy']): number
edgeDash(kind: MemoryGraphEdgeKind): 'solid' | 'dashed' | 'dotted'
edgeOpacity(kind: MemoryGraphEdgeKind, weight: number): number
graphSearch(nodes: readonly MemoryGraphNodeWire[], query: string): Set<string>
nearestInDirection(positions: readonly GraphPosition[], fromId: string, direction: GraphDirection): string | null
nextLinked(edges: readonly MemoryGraphEdgeWire[], fromId: string, index: number): string | null
```

## Checks

- Focused Jest: 9 suites, 78 tests passed; after the final edge-filter edit, the changed state spec passed again (8 tests).
- `ngc`: first run passed with an existing optional-chain warning in diagnostics. Second run reported TS2307 in `components/graph/renderer/graph-renderer.token.ts` for its missing `sigma-renderer.adapter`; this renderer file belongs to concurrent work outside FE-A1. No FE-A1 compiler errors were reported.
- ESLint: initial run had 0 errors and 28 explicit-accessibility warnings in the new service; modifiers were added and the final run passed with 0 file diagnostics; Nx boundary rule was skipped because the ProjectGraph cache was unavailable.
- `ptah_get_diagnostics`: attempted on changed files; tool timed out with 3 files unchecked. `ngc` was used as specified.

## Decisions

- F9 scope mapping: `all` sends `scope: 'all'` without `workspaceRoot`; `workspace` sends its root when available. Evidence: coordinator message and `MemoryStateService` scoped call. Reversible: yes.
- An empty tier or kind selection means all; edge kinds can be empty to hide all edges. Evidence: F3 applies only to tiers and kinds, while edge toggles are client-only. Reversible: yes.
- Edge counts describe available result edges before client toggles. Evidence: filter rail presents counts beside toggles. Reversible: yes.
- Graph failures use the existing safe `memoryFailureMessage('list')` text, keeping the last good result. Evidence: sibling state service pattern. Reversible: yes.

## Not done

- Components, Sigma, barrels, and other libraries are outside FE-A1. The concurrent renderer missing-module error is outside this batch's write set.
- Skill discovery/loading was unavailable in this CLI host; implementation followed the plan and repository patterns.
