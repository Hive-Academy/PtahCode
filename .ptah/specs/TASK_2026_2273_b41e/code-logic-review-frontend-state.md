# Code Logic Review (frontend state) - TASK_2026_2273_b41e

Score: 6/10. Verdict: APPROVE WITH FIXES.

Scope read: `services/memory-graph-state.service.ts`, the diff of `memory-state.service.ts` and `memory-rpc.service.ts`, `graph/memory-graph-view.component.ts`, `memory-curator-tab.component.ts`, `memory-entry-list.component.ts`. Also read `memory-state.service.ts:318-366` (pin/unpin/forget), the confirm blocks in `graph-selection-bar.component.ts:11` and `memory-inspector.component.ts:28`. Not run; static read only. Files are under `libs/frontend/memory-curator-ui/src/lib/`.

Intended behaviours that hold:
- Graph refresh on workspace change: the view effect (`memory-graph-view.component.ts:293-302`) tracks only the workspace path. The refresh runs in a microtask, so it has no loop risk.
- Stale graph responses are discarded by `requestSeq` (`memory-graph-state.service.ts:85-101`), and the timer and seq are cleaned up on destroy.
- `loadMore` has a seq guard (`memory-state.service.ts` diff, `loadMore`). Search and refresh bump `entriesReqSeq`, so a late page is dropped and `loadingMore` is reset. Pages use `offset = entries.length` and are de-duplicated by id.
- Detail loading discards stale results via `detailSeq` (`memory-graph-view.component.ts:304-326`).
- Bulk and single forget are confirmed in the Graph view (selection bar and inspector). A bulk action stops on the first error (`runAction`, 340-346).
- `openHealth` is wired to `activeView.set('health')` (tab:144). The default view is `'graph'` (tab:226).

## Findings

| # | Severity | File:line | Problem | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | Serious | `memory-entry-list.component.ts:142-152`; `memory-curator-tab.component.ts:167,326-328` | Single forget in the List view has no confirmation. The spec requires one. | The trash button calls `forget.emit(entry.id)` and the tab's `onForget` calls `state.forget(id)` directly. Only the graph inspector and selection bar use `ptah-inline-confirm`. | Add an inline confirm in the list row, or hoist the confirm into the shared forget path. |
| 2 | Serious | `memory-entry-list.component.ts:73-78` | The row checkbox cannot deselect. `[checked]` is bound to selection, but `(change)` always calls `select(id, true)`, which is additive. | `memory-graph-state.service.ts:115-117` has no toggle; `select(id, true)` on an already selected id is a no-op. Unchecking flips the DOM while state stays selected. The Graph inspector and selection bar then show a selection the user cleared. | Add `toggleSelect(id)` to the state service, or call `select`/`deselect` based on `$event.target.checked`. |
| 3 | Serious | `memory-graph-view.component.ts:341-348` (and `memory-state.service.ts:351-360`) | A forget or pin that returns `success: false` is treated as success. The node is removed from the graph, but the memory still exists. | `memory.forget` sets no error when `res.success` is false and does not remove the entry. `runAction` only checks `memory.error()`, then calls `state.removeNodes([id])`. `pin`/`unpin` are patched with `pinned: action === 'pin'` and ignore `res.pinned`. The graph disagrees with the backend until the next refresh. | Have `MemoryStateService.pin/unpin/forget` return a boolean or the result. In `runAction`, only mutate the graph on success. Set `actionError` on `success: false`, and break. |
| 4 | Serious | `memory-graph-state.service.ts:123-131`; `memory-entry-list.component.ts`; `memory-curator-tab.component.ts:326` | Selection desyncs after a List-view forget. The list's forget removes the entry from `MemoryStateService._entries` only. It does not clear the id from `graph._selectedIds` or the graph result. | The selection bar uses `state.selectedIds().length` (`memory-graph-view.component.ts:227-231`), while the inspector uses `selectedNodes` (filtered by existing nodes). A forgotten id leaves a ghost id: the bar count is inflated. Bulk forget/pin over `selectedIds()` then hits the missing id, errors, and stops partway. Selection also survives a workspace switch. | Prune `selectedIds` to existing node ids, or clear the selection on forget and workspace change. Route all forgets through one path that also calls `graph.removeNodes`. Have the bar use `selectedNodes().length`. |
| 5 | Moderate | `memory-graph-state.service.ts:88-92` | With a workspace-scope filter and no workspace open, the error is set but the previous `_result` is kept. | The seq is bumped, so in-flight loads are dropped, but `_result` is not cleared. Old-workspace nodes are shown beside "No workspace is open." | `_result.set(null)` and clear the selection in that branch. |
| 6 | Moderate | `memory-graph-view.component.ts:303-326` | The detail effect depends on `selectedNodes()`, not on the id. | `patchNode`, `removeNodes` and `refresh` all create a new `selectedNodes` array. The effect re-runs, sets `detail` to null and refetches `memory:get` after every pin/unpin of the selected node and after every refresh. The inspector flickers and does a redundant RPC. | Derive `const id = computed(...)` for the single selected id and read that in the effect, so it only fires when the id changes. |
| 7 | Moderate | `memory-state.service.ts` `forget` (351-360) and `_total` | `forget` does not decrement `_total`. | After a forget, "Showing X of {{ total }}" is wrong. `hasMore` can stay true, so "Load more" shows with nothing left until the next load corrects `total`. | `_total.update(t => Math.max(0, t - 1))` on success. |
| 8 | Moderate | `memory-state.service.ts` `loadMore` (diff) | `offset` is computed before the await and is not guarded against pin/forget. | A forget during an in-flight page shifts the server window by one, so one entry is skipped (a gap). | Prefer a cursor, or re-derive `offset`, or disable forget during `loadingMore`. |
| 9 | Minor | `memory-graph-state.service.ts:105-111` | `patchFilters` compares array filters (`tiers`, `kinds`) by reference. | A UI that rebuilds `[]` for a "no tiers" patch triggers an unnecessary debounced refetch. `resetFilters` is safe only because it reuses the defaults. | Compare arrays by value. |
| 10 | Minor | `memory-entry-list.component.ts:38-39,187-191` | The List count compares visible filtered rows to the unfiltered backend `total`. List tier/scope (`MemoryStateService`) and graph filters (`MemoryGraphStateService`) are separate state objects, so "shared filters" is one-way (graph filters applied on top of the list). | The count message can imply missing rows. | Document it, or show "N shown, M loaded of T". |

## Notes

- No effect loops found.
- Re-mounting the graph view (`@switch`) re-runs the first effect and refreshes, which hides much of the graph staleness from findings 3 and 4, except for `selectedIds`, which is held in a root-provided service.
- Swallowed errors: `refresh` collapses every failure to one generic string (`graph-state:99`). This is acceptable, but the cause is lost.
- Fix 1-4 before merge. 5-8 are recommended.
