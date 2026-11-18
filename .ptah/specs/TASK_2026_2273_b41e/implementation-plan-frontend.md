# Implementation plan — frontend (Memory panel with graph)

Task `TASK_2026_2273_b41e`. Lib: `libs/frontend/memory-curator-ui` (`scope:webview`,
`type:feature`, `platform:angular`). Design of record: `docs/design-system/thoth/` in pull
request #1427 (read it in the worktree `.claude-worktrees/thoth-panels-design`). Author: the
orchestrator, from the notes of a stopped architect agent plus source checks.

## 1. Inputs and constraints

- Angular 22, standalone, OnPush, signal inputs/outputs, `inject()`, built-in control flow,
  zoneless. No NgModules, no `BehaviorSubject`.
- Every dropdown is `ptah-select`. Text fields are `ptah-field` with a floating label. Compact
  toolbar search and setting-row controls are the exceptions.
- Every existing `id`, `data-testid` and `aria-label` of the lib stays. No capability is removed
  (parity table: design spec section 12.1).
- `sigma`, `graphology`, `graphology-layout-forceatlas2` load only with a dynamic `import()` when
  the Graph view first renders.
- `max-lines` is 700 (warn). Keep each new file under 350 lines.
- No change to `libs/frontend/thoth-shell` structure, VS Code host or TUI host.

## 2. Codebase evidence

| # | Fact | State |
| --- | --- | --- |
| E1 | `thoth-shell.component.ts:40` imports `MemoryCuratorTabComponent` eagerly; template `:246` `<ptah-memory-curator-tab (pausedChange)="onPausedChange()" />` | Verified |
| E2 | The whole thoth-shell is a lazy route (`apps/ptah-extension-webview/src/app/app.routes.ts:125-133`). Sigma needs a second, nested `import()` so it is not in the Thoth chunk | Verified |
| E3 | `apps/ptah-extension-webview/scripts/assert-eager-bundle.mjs:27-39` holds `FORBIDDEN_MARKERS`; a marker that matches no chunk fails the check (`:151+`) | Verified |
| E4 | `memory-curator-tab.component.ts`: `MemoryTabView = 'memories' \| 'timeline' \| 'corpus' \| 'code' \| 'maintenance'` (`:44-45`); `viewChips` `:355-361`; `_view` signal `:363`, not persisted; `onViewChange` `:591`; only this file uses `MemoryTabView` | Verified |
| E5 | Tab template: non-Electron fallback `:81-105`; root `data-testid="thoth-section-memory"` `:109`; code-view header actions (`aria-label="Clean code-index junk"` `:142`, `memory-rebuild-index` `:156-157`, `memory-rebuild-result` `:176`, `memory-code-error` `:185`); pause switch `:192`; stats strip `:194-197`; `nav role=tablist aria-label="Memory views"` `:199-216`; `@switch` views `:218-319` | Verified |
| E6 | Tab class injects `MemoryStateService`, `VSCodeService`, `AppStateManager`, `MemoryRpcService`, `WorkspaceIndexingService` (`:325-329`); output `pausedChange` (`:339`); `isElectron` (`:351`); `workspaceRoot` from `appState.workspaceInfo()?.path` (`:371-376`) | Verified |
| E7 | `MemoryRpcService` pattern (`memory-rpc.service.ts:70-93`): `await this.rpc.call('memory:list', params, { timeout })`, then `result.isSuccess() && result.data` or `throw new Error(result.error \|\| '… failed')`. Timeouts in `MEMORY_RPC_TIMEOUTS` (`:44-50`) | Verified |
| E8 | `MemoryStateService.refresh()` (`:199-226`): `resolveScopedWorkspaceRoot()`, a request sequence counter that drops stale results, `_loading` / `_error` signals, `failureMessage('list', err)` | Verified |
| E9 | Spec mock pattern: `memory-state.service.spec.ts:41-63` (`{ provide: MemoryRpcService, useValue: { list: listMock, … } }`, `AppStateManager` with a workspace signal) | Verified |
| E10 | `src/services.ts` is the eager services barrel. Do not export graph code from it. `src/index.ts` exports the tab, timeline, corpus components and the state/RPC services | Verified |
| E11 | UI APIs: `ptah-native-tab-group` (`tabs: NativeTab[]`, `activeId` model, `ariaLabel`, `tabSelected`); `ptah-instrument-band` (`segments`, `loading`, `ariaLabel`, `segmentSelect`); `ptah-select` (`options`, `value` model, `label`, `labelledBy`, `size`, `disabled`); `ptah-table` (`label` required, `columns`, `size`, `collapseBelow`); `ptah-page-header` (`title`, `description`) | Verified |
| E12 | Lib typecheck: `npx ngc --noEmit --project libs/frontend/memory-curator-ui/tsconfig.lib.json` | Verified (project.json) |
| A1 | Sigma API. The current release is `sigma` 4.0.6 (not v3). Expected: `new Sigma(graph, container, settings)`, `getCamera().animate()`, events `clickNode`, `enterNode`, `leaveNode`, `clickStage`; `graphology-layout-forceatlas2/worker` default export with `start()`, `stop()`, `kill()` | Assumption — read the installed `.d.ts` files after the install and adapt only `sigma-renderer.adapter.ts` |
| E13 | Licenses and versions from the npm registry (2026-11-18): `sigma` 4.0.6 MIT, `graphology` 0.26.0 MIT, `graphology-layout-forceatlas2` 0.10.1 MIT, `graphology-types` 0.24.8 MIT (peer of the two graphology packages). No native code | Verified (`npm view`) |

## 3. Architecture decision

1. **Feature folder.** All graph code is in `src/lib/components/graph/` and
   `src/lib/services/memory-graph-state.service.ts`. The page shell imports one component,
   `ptah-memory-graph-view`.
2. **Renderer port.** The Sigma code is behind `GraphRendererPort` (`graph-renderer.port.ts`).
   `sigma-renderer.adapter.ts` is the only file that imports `sigma` and `graphology`. The canvas
   component gets the adapter through a factory token, `GRAPH_RENDERER_FACTORY`, whose default
   does `import('./sigma-renderer.adapter')`. Specs give a fake factory. Jest never loads WebGL.
3. **Pure functions.** Model building, style mapping, filter mapping, search and keyboard
   navigation are pure files with their own specs.
4. **One filter state.** `MemoryGraphStateService` owns filters, selection and the RPC result.
   The List view reads the same service, so Graph and List always show the same set.
5. **View ids.** `MemoryTabView` becomes `'graph' | 'list' | 'timeline' | 'boards' | 'code' |
   'health'`. Default `'graph'`. The view stays in component state (as today, E4). The
   `nav role=tablist aria-label="Memory views"` contract stays through `ptah-native-tab-group`
   with `ariaLabel="Memory views"`.
6. **No new `@ptah-extension/ui` component.** The components of design spec section 7 live in
   this lib (one user). Time brush and filter rail are local.

## 4. Component specifications

### 4.1 `MemoryRpcService.graph()` — MODIFY `services/memory-rpc.service.ts`

`graph(params: MemoryGraphParams): Promise<MemoryGraphResult>` with the E7 pattern and a new
`MEMORY_RPC_TIMEOUTS.GRAPH_MS = 15_000`. Spec: success, RPC failure → throws.

### 4.2 `MemoryGraphStateService` — CREATE `services/memory-graph-state.service.ts`

- Responsibility: filters, selection and graph data for Graph and List.
- State (private signals, read-only public): `filters` (`MemoryGraphFilters`: tiers, kinds,
  pinnedOnly, scope `'workspace' | 'all'`, sessionId, createdFrom, createdTo, edgeKinds,
  minSimilarity, maxNodes), `result` (`MemoryGraphResult | null`), `loading`, `error`,
  `selectedIds` (ordered), `searchQuery`, `view` options (`colorBy`, `sizeBy`, `clusterBy`,
  `mode: 'nodes' | 'clusters'`, `showLabels`, `frozen`).
- Computed: `nodes`, `edges` (filtered by the edge-kind toggles and the slider on the client, so
  a toggle does not need a new RPC call), `edgeCounts` per kind, `capped`, `totalMatching`,
  `semanticAvailable`, `selectedNodes`, `matchIds`, `sessions` (distinct session ids),
  `isDefaultFilters`.
- Methods: `refresh()` (E8 pattern: scoped root, sequence counter, `failureMessage`),
  `patchFilters()`, `resetFilters()`, `select(id, additive)`, `clearSelection()`,
  `showUpToMax()` (sets `maxNodes` 1500 and refreshes), `removeNodes(ids)` after a forget,
  `patchNode(id, patch)` after pin/unpin.
- A server-side filter change (tiers, kinds, pinned, scope, session, time range, maxNodes)
  calls `refresh()`, debounced 250 ms. A client-side change does not.
- Failure: the error text goes to `error`; the last good `result` stays.
- Spec: `memory-graph-state.service.spec.ts` (E9 pattern): stale result dropped, client edge
  filter, selection order, vec-off flag, cap, reset.

### 4.3 Pure functions — CREATE in `components/graph/model/`

| File | Contract |
| --- | --- |
| `graph-filters-to-params.ts` | `(filters, workspaceRoot) → MemoryGraphParams`; scope `'all'` → `workspaceRoot: null`; all tiers/kinds selected → field omitted |
| `build-graph-model.ts` | `(nodes, edges, viewOptions, theme) → GraphModel` (`{ nodes: RenderNode[], edges: RenderEdge[], clusters }`); drops edges with a missing endpoint; stable order |
| `node-style.ts` | `colorOf(node, colorBy, palette)`, `radiusOf(node, sizeBy)`, edge dash and opacity by kind and weight. The palette reads CSS tokens once per theme change |
| `graph-search.ts` | `(nodes, query) → Set<string>` on subject and preview, case-insensitive |
| `keyboard-nav.ts` | `nearestInDirection(positions, fromId, 'up' \| 'down' \| 'left' \| 'right') → id \| null`; `nextLinked(edges, fromId, index)` |
| `graph.types.ts` | `MemoryGraphFilters`, `GraphViewOptions`, `RenderNode`, `RenderEdge`, `GraphModel` |

Each file has a spec with table-driven cases.

### 4.4 Renderer — CREATE in `components/graph/renderer/`

- `graph-renderer.port.ts`: `GraphRendererPort { mount(container), setModel(model), setSelection(ids), setHighlight(ids), setFrozen(on), relayout(), fit(), zoom(delta), focus(id), positions(): ReadonlyMap<string, {x, y}>, viewport$ callback for the minimap, on(event, cb), destroy() }`.
  Events: `nodeClick {id, additive}`, `stageClick`, `nodeHover {id | null}`, `layoutState`.
- `graph-renderer.token.ts`: `GRAPH_RENDERER_FACTORY: InjectionToken<() => Promise<GraphRendererPort>>`
  with a default factory that does the dynamic import.
- `sigma-renderer.adapter.ts`: the only Sigma file. ForceAtlas2 in its worker, stop after 4 s.
  `prefers-reduced-motion`: run the layout synchronously for a fixed iteration count and show the
  final positions; camera moves without animation. `destroy()` kills the worker and the Sigma
  instance and removes listeners.
- Spec: the adapter has no Jest spec (WebGL). The visual review in Electron covers it.

### 4.5 Graph components — CREATE in `components/graph/`

| Component (selector) | Responsibility | Key test ids |
| --- | --- | --- |
| `memory-graph-view` (`ptah-memory-graph-view`) | Composes toolbar, rail, canvas, inspector, states. Calls `state.refresh()` on init and on workspace change | `memory-graph-view`, `memory-graph-count` |
| `graph-toolbar` | Search (`memory-search-input` stays on this field in Graph and on the List search), Nodes/Clusters radiogroup, Color by, Size by, Re-run layout, Freeze, Filters button (narrow) | `memory-graph-search`, `memory-graph-mode`, `memory-graph-relayout`, `memory-graph-freeze` |
| `graph-filter-rail` | Show, Connections (toggles with counts, slider), Layout | `memory-graph-rail`, `memory-graph-edge-semantic`, `-subject`, `-session`, `memory-graph-similarity` |
| `memory-graph-canvas` | Hosts the renderer port. `role="application"`, `aria-label` with counts, keyboard model, live region, zoom buttons, legend, minimap | `memory-graph-canvas`, `memory-graph-live`, `memory-graph-legend` |
| `time-brush` | Two-thumb range on `createdAt` with a histogram | `memory-graph-time-brush` |
| `memory-inspector` | Detail of one node, list of connected nodes, Pin/Unpin, Open source session, Forget (`ptah-inline-confirm`); count for many nodes | `memory-inspector`, reuses `memory-entry-pin`, `memory-entry-unpin`, `memory-entry-forget` |
| `graph-selection-bar` | Bulk Pin, Unpin, Forget, Clear selection | `memory-graph-selection-bar` |

States in `memory-graph-view`: loading (`ptah-skeleton` + `role="status"` "Loading memory
graph"), empty (no memories), filtered-empty ("No memories match these filters." + Reset
filters), capped (line with "Show up to 1,500"), vec-off (`ptah-alert` warn "Semantic links are
unavailable." + "Open Health", semantic toggle disabled with a tooltip), RPC error
(`ptah-state-panel` + Retry), no workspace ("No workspace is open" + "Show all workspaces"),
paused (the graph still shows data).

Pin, unpin and forget call the existing `MemoryStateService` methods, then patch the graph state.
"Open source session" emits an output that the tab maps to the existing session-open path; when
no such path exists in the lib, the button is hidden (Assumption — check `AppStateManager` /
chat routing tokens in `libs/frontend/core/src/lib/tokens`; do not import `@ptah-extension/chat`).

### 4.6 Page shell — MODIFY `components/memory-curator-tab.component.ts`

- Layout: `ptah-page-header` (title "Memory", description) with the existing
  `ptah-memory-pause-switch` projected at the right; paused `ptah-alert`; indexing banner (moves
  from the old Memories view to the page level); stats (4.7); `ptah-native-tab-group`
  (`ariaLabel="Memory views"`); `@switch` panes.
- Panes: `graph` → `ptah-memory-graph-view`; `list` → search bar + `ptah-memory-entry-list`
  (4.8); `timeline`, `boards`, `code`, `health` → the existing children, unchanged inputs. The
  code-view header actions (E5) move into the Code index and Health panes with the same test ids
  and aria-labels.
- Keep: the non-Electron fallback, root `thoth-section-memory`, `pausedChange`, all E5 ids.
- Move the pane templates that make this file exceed 400 lines into
  `memory-health-pane.component.ts` and `memory-code-pane.component.ts` (thin wrappers).
- Spec: update `memory-curator-tab.component.spec.ts` for the new view ids and the default view;
  stub `ptah-memory-graph-view`.

### 4.7 Restyle of existing components — MODIFY

| File | Change |
| --- | --- |
| `memory-stats-strip.component.ts` | Render through `ptah-instrument-band` (5 segments). Keep `memory-stat-*` ids (on the segment content or a wrapping element) |
| `memory-entry-list.component.ts` | `ptah-table` rows (subject, kind, tier, salience, hits, last used, pin state), checkbox column, selection bound to `MemoryGraphStateService.selectedIds`, "Load more". Keep `memory-entry-row`, `-pin`, `-unpin`, `-forget`, `memory-cue-list` |
| `memory-search-bar.component.ts` | `ptah-field` compact search; tier and scope controls as `ptah-select` |
| `timeline-filters.component.ts`, `memory-danger-zone.component.ts`, `corpus-build-dialog.component.ts` | `ptah-select` and `ptah-field` per the control rules. No behavior change |
| `corpus-list.component.ts`, `corpus-suggestions.component.ts` | Headings "Knowledge boards", "Suggested boards"; row layout per the prototype. No behavior change |
| `diagnostics/*` | Section headers and cards per the Health screen. No behavior change, ids unchanged |

### 4.8 Bundle guard — MODIFY `apps/ptah-extension-webview/scripts/assert-eager-bundle.mjs`

Add one marker that is unique to the Sigma adapter chunk (for example the selector string
`ptah-memory-graph-canvas` is NOT enough, because it is in the Thoth chunk; use a string
constant exported only by `sigma-renderer.adapter.ts`, for example `'ptah-sigma-adapter'`).

### 4.9 Dependencies — MODIFY `package.json`, `package-lock.json`

Exact versions of `sigma`, `graphology`, `graphology-layout-forceatlas2` (and
`graphology-types` if the compiler needs it). The orchestrator does the install and the license
check (E13) before the frontend work starts.

## 5. Quality requirements

- Accessibility: design spec section 10. Arrow keys move the focus to the nearest node, Enter
  selects, Shift+Enter adds, Escape clears, `+` `-` `0` zoom and fit. The live region announces
  subject, kind, tier and link count. The List view gives every action without the canvas.
- Reduced motion: section 4.4.
- Responsive: 1440 rail + canvas + inspector; 1168 rail + canvas, inspector over the canvas on
  selection; 784 rail as slide-over behind "Filters", inspector overlay with a close button,
  minimap off. Use container queries on the pane, not on the pane element itself.
- Performance: 1,500 nodes and 9,000 edges render and stay interactive; `setModel` diffing must
  not rebuild the graphology graph on a selection or highlight change.
- Cleanup: the canvas component destroys the renderer in `DestroyRef.onDestroy`.

## 6. Handoff for decomposition

Dependency order: shared wire types (backend plan, first step) → 4.9 install → then two
parallel-safe packages.

| Package | Owner files | Seam |
| --- | --- | --- |
| FE-A graph feature | `services/memory-rpc.service.ts` (+spec), `services/memory-graph-state.service.ts` (+spec), `components/graph/**`, `apps/ptah-extension-webview/scripts/assert-eager-bundle.mjs`, `src/index.ts` (export of the view and the state service) | Public signal API of `MemoryGraphStateService` (4.2) and the selector `ptah-memory-graph-view` (no inputs; output `openSession`) |
| FE-B page shell and restyle | `components/memory-curator-tab.component.ts` (+spec), new pane wrappers, 4.7 files and their specs | Same seam. FE-B starts after FE-A has committed the state service and an empty view component |

Because FE-B needs the FE-A seam, run FE-A first to its first commit (state service + view
shell), then FE-B in parallel with the rest of FE-A.

Focused checks (executors run only these):

```bash
npx jest --config libs/frontend/memory-curator-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>
npx ngc --noEmit --project libs/frontend/memory-curator-ui/tsconfig.lib.json
npx eslint <changed files>
```

The orchestrator runs `npm run verify -- --related -p memory-curator-ui,thoth-shell`,
`npm run verify -- -t lint,typecheck -p memory-curator-ui,thoth-shell`,
`npm run verify -- -t typecheck-templates -p ptah-extension-webview`, and the full gate.

## Clarifications Needed

None. All four new packages are MIT (E13).

## Revision 1 (after `implementation-plan-review.md`, 2026-11-18)

These rules replace the text above where they differ.

- F1 (defect 2). **List keeps its data source.** `ptah-memory-entry-list` still gets full
  `MemoryWire` entries from `MemoryStateService` (`memory:list`), with its pagination, cue list
  and actions unchanged. Graph and List share (a) the selection (memory ids in
  `MemoryGraphStateService`) and (b) the filters: a pure function
  `matchesGraphFilters(entry: MemoryWire, filters): boolean` (tiers, kinds, pinnedOnly,
  sessionId, createdFrom, createdTo) filters the loaded list entries on the client. The
  inspector loads the full entry with `memory:get` (preview first, then the content). Spec:
  `matches-graph-filters.spec.ts` (contract between `MemoryWire` and `MemoryGraphNodeWire`
  fields), and a list component test that a graph filter hides a non-matching row.
- F2 (defect 3). **Edge controls are client-only, and the request never narrows edges.**
  `graph-filters-to-params.ts` always omits `edgeKinds` (all three) and always sends
  `minSimilarity: MEMORY_GRAPH_LIMITS.minSimilarity.min` (0.5). The toggles and the slider
  filter `result.edges` in a `computed`. Spec: enable a kind and lower the slider with no new
  RPC call, and the edges come back.
- F3 (defect 6). An empty tier or kind selection in the UI means "all" and is sent as an
  omitted field. The rail does not let the user clear the last chip to "nothing".
- F4 (defect 4). **Attribute inventory.** Before the first edit of the lib, the executor writes
  `parity-attributes-before.txt` in the task folder: every `id="…"`, `data-testid="…"`,
  `[attr.data-testid]`, `aria-label="…"` and `[attr.aria-label]` string in
  `libs/frontend/memory-curator-ui/src/lib/**/*.ts` (non-spec), sorted, one per line with its
  file. After the work, the same command writes `parity-attributes-after.txt`. Every "before"
  attribute value must be in "after" (a move to another file is permitted). The coordinator
  runs the comparison again. Capabilities: design spec section 12.1, row by row, in the
  executor report (stays / moved to <file>).
- F5 (defect 5). The bundle marker is a string that the adapter uses at runtime:
  `container.dataset['renderer'] = 'ptah-sigma-adapter'` in `mount()`. The Electron visual
  review confirms the marker is in a lazy chunk and not in the eager closure.
- F6 (defect 8). Component tests with the fake renderer factory: arrow-key navigation, Enter
  selects, Escape clears, focus stays on the canvas host, the live region text changes on
  selection and on load, `prefers-reduced-motion` reaches the port, and one test that the
  Memory ids and labels survive Graph → List → Health navigation.
- F7 (A1 resolved). Installed: `sigma` 4.0.6. Verified in `node_modules/sigma/dist/declarations/src`:
  `new Sigma(graph, container, options?)` (WebGL2), `getCamera()` with `animate(state, opts)`,
  `getState()`, `setState()`; `on('clickNode' | 'enterNode' | 'leaveNode' | 'clickStage', …)`
  with payload `{ node }`; `graphToViewport()`, `viewportToGraph()`, `getNodeDisplayData(key)`,
  `resize()`, `refresh`/`scheduleRender()`, `kill()`, `setSettings()`. v4 adds declarative
  `styles` and node/edge state (`setNodeState`). Keep the adapter on the stable subset: write
  `x`, `y`, `size`, `color`, `label` (and edge `size`, `color`) as graphology attributes and
  change them for selection and highlight. Read the `.d.ts` before you use any other API.
  `graphology-layout-forceatlas2/worker` default export: `new FA2Layout(graph, params)`,
  `isRunning()`, `start()`, `stop()`, `kill()`.
- F8. No session-open path exists in this lib. The inspector does not show "Open source
  session" (no import of `@ptah-extension/chat`). The session id stays visible as text.
- F9 (scope convention, orchestrator). `MemoryGraphParams` has `scope?: MemoryQueryScope`, as
  `memory:stats`. Filter scope `'all'` → `{ scope: 'all' }` with no `workspaceRoot`. Filter scope
  `'workspace'` → `{ scope: 'workspace', workspaceRoot }` with the same root rule that
  `MemoryStateService` uses for `memory:stats` / `memory:list`. Never send `workspaceRoot: null`
  to mean "all".

## Revision 2 (after `implementation-plan-review-2.md`)

- F10 (defect 2, List pagination). `MemoryStateService.refresh()` loads 200 rows at offset 0
  today (`memory-state.service.ts:211-219`). Add `loadMore()`: it requests the next page
  (`offset = entries.length`, limit 200) with the same scope, appends the rows without
  duplicates (by id), and uses the same sequence guard as `refresh()`. Add computed
  `hasMore = entries.length < total`. The List view shows "Showing N of TOTAL" and a
  `Load more` button (`data-testid="memory-list-load-more"`) while `hasMore` is true. When a
  graph filter is active and `hasMore` is true, the List shows one line: "Filters apply to the
  loaded entries. Load more to see all matches." Graph and List therefore show the same set
  when all rows are loaded, and the List states it when they are not. Specs: `loadMore`
  appends rows beyond row 200, a stale page is dropped, `hasMore` goes false at the total, and
  the button and the note render.
- F11 (after `implementation-plan-review-3.md`, revision cap reached). Architecture decision 4
  ("Graph and List always show the same set") is withdrawn. It was an orchestrator claim, not a
  user requirement. The contract is: Graph and List share the filters and the selection. The
  Graph shows the top `maxNodes` memories by rank and states the cap ("Showing N of TOTAL",
  `showUpToMax()`). The List shows the loaded entries that match the filters and states its
  count (F10). A selected id that is not in the other view stays selected and is not shown
  there. Open item for the user: the reviewer wants one identical set in both views.
  Review 3 permits "explicitly state and test the intended difference". Tests: the Graph count
  text with a capped result, the List count text with more entries than the graph cap, and a
  selection of an id that only one view contains.
