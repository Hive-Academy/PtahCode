Verdict: REVISE

## Defects

1. **Major — backend §1 B6:** The cited `0002_memory.ts:12-31` does not define `quarantined_at`; it is added by `libs/backend/persistence-sqlite/src/lib/migrations/0048_memory_quarantine.ts:19`. Correct B6's citation and state that graph queries require the migrated schema. The active-row condition itself is supported by `libs/backend/memory-curator/src/lib/memory.store.ts:527`.

2. **Major — frontend §§3, 4.2, 4.7:** The plan makes Graph and List read one graph result, yet `libs/shared/src/lib/types/rpc/rpc-memory.types.ts:240-254` supplies only a 160-character preview while `libs/frontend/memory-curator-ui/src/lib/components/memory-entry-list.component.ts:148` requires complete `MemoryWire` entries (including `content`, `sourceMessageIds`, etc. at `rpc-memory.types.ts:13-25`). Define how List obtains full entries and preserves its current entry content, cue list, actions, and pagination while sharing graph filters and selection. Add a contract test for this mapping.

3. **Major — frontend §§4.2–4.3:** The plan calls edge toggles and similarity slider client-only, but `graph-filters-to-params.ts` is to send `edgeKinds` and `minSimilarity` while the backend filters edges using both (`implementation-plan-backend.md:94-106`). Once the server omits a kind or low-scoring edge, a client toggle or lower slider cannot restore it. Always request all edge kinds at the minimum slider threshold and filter locally, or refetch when enabling a kind or lowering the threshold; test both transitions.

4. **Major — frontend §§4.6–4.7:** Preservation of every existing `id`, `data-testid`, and `aria-label` is asserted but the replacement instructions enumerate only a subset. The parity table includes diagnostics, curator, storage, event feed, recovery toast, and danger-zone controls (`thoth-design-spec.md:305-333`); the current entry list also exposes `aria-label="Memory entries"`, `thoth-section-memory-entries`, and per-entry pin labels (`libs/frontend/memory-curator-ui/src/lib/components/memory-entry-list.component.ts:24-26,94-113`). Add an explicit attribute and capability inventory for every touched component, with focused parity assertions after moving panes and converting the list to `ptah-table`.

5. **Major — frontend §4.8:** An *exported-only* `'ptah-sigma-adapter'` constant can be removed by tree shaking, making the anti-vacuity check fail (`apps/ptah-extension-webview/scripts/assert-eager-bundle.mjs:149-159`). Require a string used at runtime in the adapter's lazy chunk, and specify an Electron bundle inspection that confirms it is present in a built lazy chunk and absent from the eager closure (`assert-eager-bundle.mjs:120-123`).

6. **Minor — backend §§4.1, 4.4:** `tiers`/`kinds` permit empty arrays (only maximum lengths are specified), but the SQL plan only says `tier IN`/`kind IN` (`implementation-plan-backend.md:87-91,146-149`). Define whether empty arrays match nothing or mean all, implement that choice without an invalid/ambiguous `IN ()`, and test it. State that `maxNodes`/`k` floor before clamping so fractional boundary values resolve predictably.

7. **Major — backend §§4.2–4.3:** The worker client has a default 5-second execution timeout plus queue time (`libs/backend/memory-curator/src/lib/search-worker.client.ts:128-129,208-209`), while the handler gives graph 4 seconds (`implementation-plan-backend.md:151-153`). Specify the intended deadline propagation and test a queued/late graph request returns `null`, then the store returns subject/session edges with `semanticAvailable: false`. Ensure this fallback does not conceal an RPC validation or SQL failure; the client currently degrades all request failures through its `empty` value (`search-worker.client.ts:208-218`).

8. **Minor — frontend §§4.5, 5:** The stated keyboard/live-region accessibility contract has no focused component test; the plan only names model specs and an Electron visual review (`implementation-plan-frontend.md:89-137,177-187`). Add focused keyboard, focus, live-region, reduced-motion, and selection tests. Assert the existing Memory ids/labels survive Graph/List/Health navigation.

## Verified claims

22 of 25 evidence rows confirmed against the available source. False: B6's migration citation (defect 1). Not checked: B8's prior handoff/review assertion; E13's external npm registry license/version assertion (packages are not installed here).

## Decisions

- The approved Graph main view, List view, inspector, three edge kinds, vec-off message, lazy Sigma/graphology, `ptah-select`/`ptah-field`, and one PR stand.
- The SQL outline is otherwise compatible with current columns and the vec0 join: `memory_chunks_vec.rowid = memory_chunks.rowid` (`memory.store.ts:289-293`; `0007_fix_vec0_rowid.ts:7-10`). Copy the 384 little-endian floats from the returned BLOB respecting byte offsets; test actual sqlite-vec BLOB shape as well as the plain-table fake. `quarantined_at IS NULL` is required.
- Worker protocol exhaustiveness is concentrated in `search-worker.protocol.ts`'s query union/result map, `search-worker-runtime.ts:255-274`, `search-worker.client.ts:91,140-172`, and `search-worker.port.ts:28-34`. Search found no other concrete `ISqliteSearchWorker` implementer or typed fake in the specified projects; `MemoryStore`, `CodeSymbolStore`, and `MemorySearchService` consume the port. Add compile coverage for all three consumers.
- The named shared guard `libs/shared/src/lib/types/rpc/host-source-registry.contract.spec.ts:50-54` filters only host-source-shaped names (`:17-20`); `memory:graph` does not match. Its baseline file needs no edit. No other shared registry guard requiring a new method was found.
- No Angular standalone/OnPush/signal/zoneless violation is explicit in the plan. The Sigma adapter must update Angular signals from callbacks and clean up the worker, renderer, and listeners on destruction. The nested dynamic import matches the lazy Thoth route (`app.routes.ts:125-133`) and the eager-closure script's static-import traversal.
- The two plans use the same wire names and return shape. Backend 4-second deadline and frontend 15-second RPC timeout leave room for the degraded fallback, subject to defect 7. The pure backend module is a valid implementation of apply-plan §2.1's behavior; the apply-plan file inventory names a service/host registration, but no new DI dependency is needed when the store owns the pure function.

## Clarifications Needed

- Decide the empty tiers/kinds semantics (defect 6); record it in both the schema and UI filter mapping.
