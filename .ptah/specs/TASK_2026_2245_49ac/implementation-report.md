# P5 PR 2 implementation report

## Design
Watcher and writer rebuilds scan at most 64 named folders, then apply the changed rows and deletions atomically. Unknown or oversized batches, graph references, and folder scan/write failures use the full scan. Activation and reindex retain full replacement. Folder updates preserve metadata from the last full scan. Timing logs include `mode`.

The watcher port exposes change/create/delete events but no runtime error event; watcher construction errors are logged and activation still performs its full scan. No new dependency or Git write was made. Skill invocation was unavailable in this lane; Ptah workspace analysis was used, with direct reads for source inspection.

## Changed files
- `task-index.service.ts`: route named watcher/writer batches to scoped rebuilds, preserve merged unknown batches, and retain full fallbacks.
- `task-scanner.service.ts`: expose folder scanning through the existing parser and directory naming rules.
- `task-index.store.ts`: apply folder upserts and deletions in one transaction in both stores.
- `rebuild-timing.ts`: record full versus folder mode.
- `task-index.service.spec.ts`: cover scoped updates, deletion, creation, burst coalescing, fallbacks, and revised watcher/writer expectations.
- `task-scanner.service.spec.ts`: cover selected-folder parsing and removed-folder reporting.
- `task-index.store.spec.ts`: cover folder batch results and metadata preservation under the shared contract.
- `rebuild-timing.spec.ts`: assert the new mode field.

`git diff --stat`: 8 files changed, 255 insertions(+), 56 deletions(-). `git diff --check`: pass.

## Tests added or updated
- `updates, deletes, and adds only touched folders without a full scan`
- `falls back to a full scan for an unknown watcher event and an oversized batch`
- `coalesces distinct changed folders into one scoped scan`
- `scans selected folders with full-scan parsing rules and reports removed folders`
- `applies upserts and deletions without changing full-scan metadata`
- Existing watcher, writer, reindex, and rebuild timing cases were updated for scoped scan and fallback behavior.

## Checks
- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/task-index.service.spec.ts libs/backend/task-specs/src/lib/task-scanner.service.spec.ts libs/backend/task-specs/src/lib/task-index.store.spec.ts libs/backend/task-specs/src/lib/rebuild-timing.spec.ts`: 4 suites passed, 137 tests passed, 0 failed.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/tasks-rpc.handlers.spec.ts`: 1 suite passed, 272 tests passed, 0 failed.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`: passed, 0 errors.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.spec.json`: passed, 0 errors.
- `npx eslint libs/backend/task-specs/src/lib/task-index.service.ts libs/backend/task-specs/src/lib/task-scanner.service.ts libs/backend/task-specs/src/lib/task-index.store.ts libs/backend/task-specs/src/lib/rebuild-timing.ts libs/backend/task-specs/src/lib/task-index.service.spec.ts libs/backend/task-specs/src/lib/task-scanner.service.spec.ts libs/backend/task-specs/src/lib/task-index.store.spec.ts libs/backend/task-specs/src/lib/rebuild-timing.spec.ts`: passed, 0 errors, 3 warnings (existing non-null assertion, file length, and scanner assignment); Nx module-boundary rule skipped because no cached ProjectGraph.

END-OF-REPORT

## Follow-up fix

- Folder rebuilds now compare graph fields for existing rows and check references only when a folder is added or removed. Status-only watcher changes with `parent` and `relates_to` remain in folder mode; graph changes and referenced deletions use a full scan.
- The scanner derives cross-file issues for scanned rows against stored rows with the changed folders replaced, preserving `parent_cycle` and other graph findings without reading unchanged carriers.
- Both stores update excluded folder rows and `excluded_count` during folder changes while retaining the last full scan timestamp. SQLite updates the count in the row transaction and publishes the in-process excluded set after commit.

Added tests: `uses folder mode for a watcher status change with graph links`, `preserves parent cycle issues during a folder rebuild`, `uses a full scan when an existing task changes parent`, `uses a full scan when a deleted folder is referenced`, and `updates excluded folders when a scanned folder becomes excluded, valid, or deleted` (shared store contract).

Checks: focused task-specs Jest 4 suites / 143 tests passed; focused rpc-handlers Jest 1 suite / 272 tests passed; both task-specs TypeScript projects passed; ESLint passed with 0 errors and 3 existing warnings; `git diff --check` passed. The whole diff is about 420 changed lines (362 additions, 58 deletions), slightly above the approximate 400-line target. No CLI skill invocation tool was available in this lane.

## Review fixes

- **B1:** Queue jobs now carry `forceFull`, merge it with OR, and pass it to the runner. Tests: `preserves a forced full scan when a later folder job supersedes it`; `runs a full scan when an unknown event follows a trailing writer folder rebuild`.
- **M1:** Folder mode requires written scan metadata. Test: `uses a full scan for a watcher folder after activation skipped its write`.
- **M2:** Unknown-only failed flushes arm a retry. Test: `retries an unknown-only watcher event after its full scan rejects`.
- **m1:** Folder counts use the pre-write row list and metadata plus the changed rows, with no post-write store read. Test: `returns folder counts without reading the store after the write`.
- **m2:** Both stores reject folder updates before a written full scan, leaving rows and metadata consistent. Test: `rejects folder changes before a full scan has written metadata` (shared store contract).
- **m3:** The `rebuild` docblock states the watcher completeness condition. Existing test: `updates, deletes, and adds only touched folders without a full scan` covers the observed-change case.

Checks after review fixes: focused task-specs Jest 5 suites / 154 tests passed; focused rpc-handlers Jest 1 suite / 272 tests passed; both task-specs TypeScript projects passed; ESLint on changed task-specs files passed with 0 errors and 3 existing warnings; `git diff --check` passed. Skill discovery found no locally installed matching skill. No Git writes were made.

The tracked diff is 491 insertions and 65 deletions across 11 files, including an unrelated pre-existing context edit. This exceeds the approximate 400-line target; the review fixes add targeted regression coverage. The optional nits required more than one-line changes or risked inaccurate timing counts, so they remain open.
