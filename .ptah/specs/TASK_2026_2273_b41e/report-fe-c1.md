# FE-C1 Memory graph view

## Files

- Created `libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph-view.component.ts` and `.spec.ts`.
- Created `libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph-view.helpers.ts` and `.spec.ts` for layout observation and connected-node sorting.
- Created `libs/frontend/memory-curator-ui/src/lib/components/graph/graph-palette.ts` for CSS palette tokens with a pure fallback.
- Modified `libs/frontend/memory-curator-ui/src/lib/components/graph/graph-filter-rail.component.ts`: readable select labels and rail width owned by the view.

## Component API and behavior

- Selector `ptah-memory-graph-view`; no required inputs; `openHealth: void` output.
- Composes toolbar, rail, canvas, time brush, inspector, and multi-selection bar. Reads the shared workspace signal, refreshes after the render turn and when its path changes, and disconnects observers on destroy.
- Wires search, view options, node selection, date range, detail lookup with a request sequence guard, connected memories by edge weight, and single/bulk pin, unpin, forget. Bulk actions stop on the service's exposed error and show it.
- Wide layout uses rail/canvas/inspector; medium overlays inspector; narrow opens the rail from Filters and hides the minimap. Container queries own CSS layout; ResizeObserver supplies component input flags.
- Test IDs: `memory-graph-view`, `memory-graph-count`, `memory-graph-loading`, `memory-graph-empty`, `memory-graph-filtered-empty`, `memory-graph-capped`, `memory-graph-vec-off`, `memory-graph-error`, `memory-graph-renderer-error`, `memory-graph-action-error`.

## Checks

- Prettier applied to all six changed files.
- Focused Jest: 3 suites, 30 tests passed, including the rail spec.
- Angular compiler (`ngc --noEmit`): passed; existing NG8107 warning in `components/diagnostics/db-health-panel.component.ts:185`, outside this lane's write set.
- ESLint on all six changed files: passed with no output.
- Ptah scoped diagnostics timed out with four files unchecked; the Angular compiler check completed afterward.
- No browser or Electron visual review was run, as instructed. No git operation was run.

## Decisions

- A missing CSS token falls back to a fixed graph palette; browser theme mutations trigger a fresh read. This keeps Jest and first render usable. Reversible.
- The view reads `AppStateManager.workspaceInfo()?.path`, the same signal used by `MemoryGraphStateService`, then delegates scope and filtering to that service. Reversible.
- Detail failures leave the inspector preview visible. A stale detail response is discarded by sequence number. Reversible.
- The service exposes action failures through `MemoryStateService.error()` after its methods resolve, so the view checks that signal after each id. Reversible.

## Not done / Electron visual review

- The Angular skill-loading tool was unavailable in this lane; repository conventions and neighboring components guided the implementation.
- Review 1440, 1168, and 784 pixel pane widths in light and dark themes: rail/inspector overlay placement, Filters control, minimap visibility, graph count and state banners, brush spacing, action error, and palette colors against the Thoth prototype screens. The UI has not been visually inspected.
