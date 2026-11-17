# PR #1385 review fixes

## Finding A: failed watcher write

- `libs/backend/task-specs/src/lib/task-index.service.ts:732-737`: `flush()` retains the rebuild result and throws when a ready store reports `indexWritten: false`, allowing the existing catch block to restore pending folders and arm a retry. Offline stores keep their existing behavior.
- `libs/backend/task-specs/src/lib/task-index.service.spec.ts:571`: the new spec makes the folder write and full-scan fallback fail once, then verifies the watcher retries and indexes the folder.
- Proof: with only the `flush()` fix temporarily reverted, the exact Jest command failed this spec: `scanFolders` was called once instead of twice after the retry interval. The fix was restored.

## Finding B: fingerprints for unscanned folders

- `libs/backend/task-specs/src/lib/task-index.service.ts:1029`: full directory fingerprint capture now runs only when `touched` is empty. Folder rebuilds copy the current map and update touched folders only.
- `libs/backend/task-specs/src/lib/task-index.service.spec.ts:601`: the new spec starts with an empty specs directory, creates A and B, delivers watcher events, applies A before debounce, then verifies B is indexed after the watcher flush.
- Proof: with only the fingerprint fix temporarily reverted, the exact Jest command failed this spec: the list contained A but omitted B. The fix was restored.

## Checks on restored fixes

- `npx jest --config libs/backend/task-specs/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/task-specs/src/lib/task-index.service.spec.ts`: passed, 82 tests.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.spec.json`: passed.
- `npx eslint libs/backend/task-specs/src/lib/task-index.service.ts libs/backend/task-specs/src/lib/task-index.service.spec.ts`: passed with 0 errors and 2 pre-existing warnings (non-null assertion at spec line 111; max-lines at service line 918).
- `git diff --check`: passed.
