# P5 PR 4 review fixes

## Findings addressed

- **1 and 9:** Added `nextDebounceDelay` and use one `Date.now()` reading per writer or watcher event. Both paths share the same debounce and maximum wait rule (`task-index.service.ts:379-386, 677-691`).
- **3:** Re-add writer folders to `state.writerFolders` when a flush fails, so the retry emits `reason: 'write'` (`task-index.service.ts:763`).
- **4:** The disposal drain passes `false` to `scheduleRebuild`, so teardown does not emit a change event (`task-index.service.ts:631`).
- **5:** Disposal waits for every drain outcome with `Promise.allSettled` before disposing the rebuild queue (`task-index.service.ts:641`).
- **7:** Added a watcher-only reason spec (`task-index.service.spec.ts:727`), a failed writer retry spec that verifies indexing and write reason (`:702`), and a failed disposal drain spec that verifies waiter rejection (`:763`). The five-writer coalescing spec now verifies all five tasks appear in `service.list` (`:643`).
- **8:** Added the white-box setup comment to the no-state fallback spec (`task-index.service.spec.ts:784`).
- **10:** Added `writers` to the existing watcher batch debug payload (`task-index.service.ts:740`).

Findings 2 and 6 were accepted for the PR description and were not changed. A mixed watcher and writer batch continues to emit `reason: 'write'`.

## Checks

- Focused Jest suite: **72 passed, 72 total**.
- `tsc` lib project: passed.
- `tsc` spec project: passed.
- ESLint on the two changed files: **0 errors, 2 existing warnings** (spec non-null assertion and source max-lines).

Final line counts: `task-index.service.ts` **1024**; `task-index.service.spec.ts` **1617**.
