# FE-A3b — Memory graph presentational controls

## Files

Created under `libs/frontend/memory-curator-ui/src/lib/components/graph/`:
- `graph-filter-rail.component.ts` and `.spec.ts`
- `time-brush.component.ts` and `.spec.ts`
- `time-brush.buckets.ts` and `.spec.ts`
- `memory-inspector.component.ts` and `.spec.ts`
- `graph-selection-bar.component.ts` and `.spec.ts`

## Component contracts

- `ptah-memory-graph-filter-rail` (`GraphFilterRailComponent`): no inputs or outputs; injects `MemoryGraphStateService`, calls `patchFilters`, `patchView`, `resetFilters`.
- `ptah-memory-time-brush` (`TimeBrushComponent`): `timestamps = input.required<readonly number[]>()`, `from = input<number | null>(null)`, `to = input<number | null>(null)`; `rangeChange = output<TimeBrushRange>()`, where `{ readonly from: number | null; readonly to: number | null }`.
- `ptah-memory-inspector` (`MemoryInspectorComponent`): `nodes = input.required<readonly MemoryGraphNodeWire[]>()`, `connected = input<readonly ConnectedMemory[]>([])` where `{ readonly node: MemoryGraphNodeWire; readonly kind: MemoryGraphEdgeKind; readonly weight: number }`, `detail = input<MemoryWire | null>(null)`, `detailLoading = input(false)`, `busy = input(false)`; `pin`, `unpin`, `forget`, `selectNode` are `output<string>()`; `closed = output<void>()`.
- `ptah-memory-graph-selection-bar` (`GraphSelectionBarComponent`): `count = input.required<number>()`, `busy = input(false)`; `pinAll`, `unpinAll`, `forgetAll`, `clear` are `output<void>()`.

## Test IDs and accessible names

- Rail: `memory-graph-rail`, `memory-graph-edge-semantic`, `memory-graph-edge-subject`, `memory-graph-edge-session`, `memory-graph-similarity`; aside “Graph filters”, tier and kind groups, named selects, toggle labels, slider “Similarity at least”. Disabled semantic control uses `aria-describedby` and visible reason.
- Brush: `memory-graph-time-brush`; section “Created date range”, native thumbs “From date” and “To date”, Clear button.
- Inspector: `memory-inspector`, `memory-entry-pin`, `memory-entry-unpin`, `memory-entry-forget`; aside “Memory inspector”, “Close inspector”, memory selection buttons, action labels “Pin/Unpin/Forget entry <id>”.
- Selection bar: `memory-graph-selection-bar`; toolbar “Selected memory actions”, named action buttons and inline confirmation.

## Checks

- Jest: 5 suites passed, 7 tests passed after correcting the rail spec selector.
- `npx ngc --noEmit --project libs/frontend/memory-curator-ui/tsconfig.lib.json`: no errors; existing NG8107 warning in `components/diagnostics/db-health-panel.component.ts:178`.
- ESLint on ten changed files: 0 errors and 0 file warnings. Nx boundary rule skipped because no cached ProjectGraph.
- Ptah diagnostics query timed out after 45 seconds; explicit Angular compiler check completed.

## Decisions

- An empty tier or kind array represents all. Clicking a chip from all materializes the remaining choices; removing the final selected chip does nothing. This follows F3 and is reversible.
- Edge toggles and the similarity slider call `patchFilters`; the service applies these client side. This follows F2 and is reversible.
- The inspector displays the session id as text with no session-open action, per F8.
- Each range thumb emits clamped timestamps. Native range inputs supply keyboard behavior; the bucket helper ignores invalid timestamps.

## Not done / visual review

- No canvas, toolbar, composing view, barrel, service or other library was changed.
- Electron visual review should compare rail spacing and wrapping, disabled semantic explanation, histogram/thumb alignment, inspector overflow and inline confirmation, and selection bar at 1440, 1168 and 784 widths in light and dark themes against the prototype screens. No browser check was run, as requested.
