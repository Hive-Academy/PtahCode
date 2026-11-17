# Review 2 fixes

| Finding | Change | Regression test |
| --- | --- | --- |
| Major 1: folder analysis exceptions retained a partial scan | `libs/backend/task-specs/src/lib/task-index.service.ts:885-887` clears `folderScan` and `stored` in the catch, so the full scanner runs and `replaceWorkspace` writes its result. | `falls back to a full scan when a watcher folder store read fails` (`task-index.service.spec.ts:649`); checks full scan, replacement write, no folder write, and a parent-cycle issue on the written row. |
| Major 2: offline boot read metadata and warned | `task-index.service.ts:854-857` checks cheap conditions and store readiness before `safeGetMeta`. | `does not read meta or warn when the store is not ready` (`task-index.service.spec.ts:377`). |
| Minor 1: unknown batches always retried at 1000 ms | `task-index.service.ts:120,737,747-750` adds a reserved retry key, advances its delay ladder, and clears it on success. No retry-map iteration treats the key as a folder. | `backs off consecutive unknown-only watcher flush failures` (`task-index.service.spec.ts:756`); checks 1000 ms then 5000 ms. |
| Minor 2: earlier-session metadata caveat undocumented | `task-index.service.ts:823` documents the temporary empty in-process excluded map and re-warm repair. | Documentation only. |
| Minor 3: created-folder reference fallback untested | No source change. | `uses a full scan when a created folder resolves a dangling parent` (`task-index.service.spec.ts:630`). |

## Focused checks

- Jest, requested three spec files: **3 suites, 138 tests passed**.
- `tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`: passed, 0 errors.
- `tsc --noEmit --project libs/backend/task-specs/tsconfig.spec.json`: passed, 0 errors.
- ESLint on the two changed source/spec files: passed, 0 errors, 2 existing warnings (`no-non-null-assertion` in spec, `max-lines` in service).
- `git diff --check`: passed.
