# FE-A3a graph canvas and toolbar

## Files

- `libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph-canvas.component.ts` and `.spec.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/graph-toolbar.component.ts` and `.spec.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/graph-legend.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/graph-minimap.component.ts`

## Contracts

- `ptah-memory-graph-canvas`: inputs `model: GraphModel` (required), `selectedIds: readonly string[]`, `highlightIds: ReadonlySet<string> | null`, `frozen: boolean`, `showLabels: boolean`, `edges: readonly MemoryGraphEdgeWire[]`, `showMinimap: boolean`, `colorBy: GraphViewOptions['colorBy']`; outputs `nodeSelect: {id: string; additive: boolean}`, `selectionClear: void`, `rendererError: string`; public `relayout()` and `fit()`.
- `ptah-memory-graph-toolbar`: inputs `searchQuery: string`, `matchCount: number`, `mode: GraphViewOptions['mode']`, `colorBy: GraphViewOptions['colorBy']`, `sizeBy: GraphViewOptions['sizeBy']`, `frozen: boolean`, `layoutRunning: boolean`, `showFiltersButton: boolean`, `filtersOpen: boolean`; outputs `searchQueryChange: string`, `modeChange`, `colorByChange`, `sizeByChange`, `relayout: void`, `frozenChange: boolean`, `filtersToggle: void`; no public methods.
- `ptah-graph-legend`: inputs `colorBy`, `colors`; no outputs or public methods. `ptah-graph-minimap`: inputs `positions`, `viewport`; no outputs or public methods.

## Accessible surface

- Canvas host `role="application"`, `tabindex="0"`, `data-testid="memory-graph-canvas"`, count based `aria-label`, hidden keyboard instructions, and `memory-graph-live` polite live region.
- Zoom controls: `aria-label="Zoom in"`, `"Zoom out"`, `"Fit graph"`. Legend: `memory-graph-legend`. Minimap SVG: `aria-hidden="true"`.
- Toolbar: `memory-graph-search` with label “Search memories”; `memory-graph-mode` radio group labeled “Graph mode”; `memory-graph-relayout`; `memory-graph-freeze` with `aria-pressed`; `memory-graph-filters` with `aria-expanded`.

## Checks

- Focused Jest: 2 suites, 7 tests passed.
- `npx ngc --noEmit --project libs/frontend/memory-curator-ui/tsconfig.lib.json`: passed.
- ESLint on the six new files: passed.
- Ptah scoped diagnostics timed out after 45 seconds with four files unchecked; `ngc` is the completed typecheck.
- Prettier applied to all six files.

## Decisions

- The canvas adds an optional `colorBy` input (default `kind`) so its legend can match the current view setting. The requested input list alone does not expose the color mode; node `color` provides swatches. Reversible: yes.
- The minimap reads positions and viewport only on renderer layout and viewport events. This avoids per-node observers or polling. Reversible: yes.
- Renderer failures emit a safe fixed message and show a local alert; raw factory errors stay out of the UI. Reversible: yes.

## Not done

- Electron visual review, composing view, existing components, and any other library were outside this batch. This lane had no skill-loading tool, so the named Angular skill could not be loaded.
- The parent must bind the canvas `colorBy` input to the graph view option for modes beyond the default.

## Electron visual review

Inspect WebGL mounting, keyboard focus and announcements, zoom and fit, legend swatches across all color modes, minimap dots and viewport at wide widths, control placement, reduced motion, and renderer error alert against the Thoth graph prototype.
