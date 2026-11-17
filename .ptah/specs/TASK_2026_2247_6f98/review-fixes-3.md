# Review fixes 3

## Finding 1: trailing drain lost its emission policy

- Fix: `libs/backend/task-specs/src/lib/task-index.service.ts:109,247,835-854` stores the joined callers' emission policy in `trailingEmit`, resets it after capture, and passes it to the trailing rebuild.
- Spec: `keeps a trailing dispose drain silent while an earlier writer rebuild finishes` (`task-index.service.spec.ts:1127`). It gates the first scan, queues a second writer, disposes, then verifies only the first writer emitted.
- Mutant check: changed the trailing rebuild argument back to `true`; the spec failed because an event for `TASK_2026_008` appeared. Restored the fix.

## Finding 2: dispose drain resolved an unpersisted write

- Fix: `libs/backend/task-specs/src/lib/task-index.service.ts:638-647,786,817-821` shares `assertIndexPersisted` with `flush()` and rejects dispose waiters when a ready store did not persist. An offline store still resolves waiters.
- Spec: `rejects a dispose-drained writer when a ready store does not persist it` (`task-index.service.spec.ts:1161`). It also checks the offline-store exception.
- Mutant check: restored the old unconditional resolve in the dispose drain; the spec failed because the writer resolved. Restored the fix.

## Final validation

- Jest, requested spec path: passed, 95 tests.
- `tsc --noEmit --project libs/backend/task-specs/tsconfig.lib.json`: passed.
- `tsc --noEmit --project libs/backend/task-specs/tsconfig.spec.json`: passed.
- ESLint on both changed TypeScript files: passed with 0 errors and 2 warnings (existing non-null assertion at spec line 111; service max-lines warning).
