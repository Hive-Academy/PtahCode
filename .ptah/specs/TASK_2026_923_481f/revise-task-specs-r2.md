# Revise round 2: task specs

## Finding status

1. FIXED — `task-index.service.ts:679-700,838-845`: listener exceptions are caught and logged with a generic Error object, and watcher flush retries are bounded at 1 s, 5 s, and 30 s before one exhaustion WARN. Specs at `task-index.service.spec.ts:779,801` cover permanent scan failure and a throwing listener.
2. FIXED — `task-index.service.ts:729`: trailing-run cleanup checks both active ownership and absence of a newer trailing run. The overlapping-rejection spec at `task-index.service.spec.ts:697` exercises a later queued run; the microtask window has no dedicated test.
3. FIXED — `task-index.service.ts:346-352`: a writer snapshot is cleared if the rebuild returns `indexWritten: false` or rejects. Spec at `task-index.service.spec.ts:828` checks that the watcher echo retries the failed SQLite write.
4. FIXED — `task-scanner.service.ts:168`: `readMs` now measures elapsed worker-phase time outside synchronous parsing, including I/O waits, residue checks and yields. It cannot exceed the worker-phase elapsed time. Existing scanner specs cover ordered results.
5. FIXED — `rebuild-timing.ts:35-38` selects severity from run time excluding queue wait; `task-index.service.ts:676` emits the suppressed echo count at info. `rebuild-timing.spec.ts:37` checks the level after a long wait.
6. FIXED — `task-index.service.ts:155-157` uses an optional tsyringe token for the clock. `task-index.service.spec.ts:992` resolves the service through a child container without registering that token.
Gap test. FIXED — `task-index.service.spec.ts:697`: run 1 rejects, then two callers overlap during run 2; they settle after exactly one more rebuild.

## Files changed

- `libs/backend/task-specs/src/lib/task-index.service.ts`: bounded watcher retries, listener isolation, ownership guard, writer snapshot cleanup, visible suppression count, optional clock token.
- `libs/backend/task-specs/src/lib/task-index.service.spec.ts`: retry, listener, snapshot, overlapping-rejection, and DI tests.
- `libs/backend/task-specs/src/lib/task-scanner.service.ts`: wall-time read phase metric.
- `libs/backend/task-specs/src/lib/rebuild-timing.ts`: log level excludes queue wait.
- `libs/backend/task-specs/src/lib/rebuild-timing.spec.ts`: long-wait log-level test.

## Verification

Command: `npm run verify -- -p task-specs | Select-Object -Last 40` (PowerShell equivalent of `| tail -40`). The final run passed. Scoped Ptah TypeScript diagnostics: zero errors. `git diff --check` found no whitespace errors.

## Remaining risks

A thrown event listener is isolated at the event fire boundary; the platform event emitter stops at the first throwing listener, so later listeners on that same fire are not invoked. The next change still fires normally. No path or carrier content is added to timing or retry lines. The SQLite replace remains synchronous and measured by `sqliteReplaceMs`.

## Final verification result

The first run passed lint/typecheck (2/2 Nx tasks) and failed Jest (1/1 Nx test task) because `rebuild-timing.spec.ts` still expected WARN from a 2000 ms total that included 470 ms of queue wait. The Jest log reported 19 suites passed, 1 failed; 573 tests passed, 1 failed. The test input was corrected to 2470 ms total, representing 2000 ms of run time.

The final command was `npm run verify -- -p task-specs | Select-Object -Last 40` (PowerShell tail equivalent). It exited 0. Its final output reported:

```
[verify 2026-11-10T19:21:07.510Z] starting verify lint,typecheck (task-specs)
 NX   2 tasks: 2 succeeded
[verify 2026-11-10T19:21:36.611Z] starting verify test (task-specs)
 NX   1 task: 1 succeeded
  Run duration:      38.0s
  Cache:             0/1 hit (0%)
  Critical path:     37.9s (1 task)
  Recoverable time:  <1ms
[verify 2026-11-10T19:22:18.123Z] lock released after 70.6s, exit code 0
```

The final Nx counts are 2/2 lint and typecheck tasks passed and 1/1 Jest task passed. The verify tail did not print a Jest case count for the successful run.

