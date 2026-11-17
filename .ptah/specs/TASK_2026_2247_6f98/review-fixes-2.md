# PR #1387 review finding: active writer flush during disposal

## Changes

- `libs/backend/task-specs/src/lib/task-index.service.ts:154`: track active flush promises.
- `libs/backend/task-specs/src/lib/task-index.service.ts:641`: defer rebuild queue disposal until pending writer drains and active flushes settle; dispose immediately when neither exists.
- `libs/backend/task-specs/src/lib/task-index.service.ts:705`: register each timer-started flush and remove it on settlement.
- `libs/backend/task-specs/src/lib/task-index.service.ts:779`: retry only while the same workspace state remains current.
- The resumed flush still uses the no-state rebuild queue path, so its accepted writer resolves after the rebuild.

## New regression specs

- `libs/backend/task-specs/src/lib/task-index.service.spec.ts:779`: pause a writer flush in fingerprinting, dispose the service, then verify the queue remains available until the writer resolves and its scan runs.
- `libs/backend/task-specs/src/lib/task-index.service.spec.ts:816`: pause fingerprinting, dispose, fail the later scan, and verify there is no retry timer or further scan.

## Negative proof

- Temporarily reverted all service changes and ran the specified Jest command: both new specs failed. The first observed queue disposal while the flush was paused; the second received `Task index rebuild queue disposed` instead of the scan failure.
- Restored active-flush tracking and deferred disposal while leaving out only the retry guard, then ran the same command: the second spec failed because `jest.getTimerCount()` was 1 instead of 0. Restored the guard afterward.

## Final checks

- Specified Jest command: passed, 74/74 tests.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/backend/task-specs/tsconfig.spec.json`: passed.
- `npx eslint libs/backend/task-specs/src/lib/task-index.service.ts libs/backend/task-specs/src/lib/task-index.service.spec.ts`: passed with zero errors; two pre-existing warnings on unchanged lines (spec non-null assertion at line 111 and service max-lines at line 938).
- Scoped Ptah diagnostics: zero errors. `git diff --check`: clean.
