# Phase 3 fix report (round 1) - integration spec

File: libs/backend/task-end-hook/src/lib/task-end-hook.integration.spec.ts

## L1 (confirmed)
`h.boots.splice(0)` emptied the array before the `awaitStopped` loop, so nothing was awaited and the DB
closed early. Fixed in `afterEach` (line 513): removed boots go into a local `boots`; each is disposed, then
each `handle.awaitStopped()` is awaited; `h.db.close()` is in a `finally`; `jest.useRealTimers()` is in an
outer `finally`.

## L2 (confirmed)
Spies were installed after `endTask`. `endTask` (line ~437) now takes an `afterFixtures` callback, called after
the carrier fixture write and before the index event, debounce and detection. The full-run case (line ~544)
installs the spies there and keeps them through completion; they are restored in `finally`. Failure output now
names the mutating function. Result: zero mutating fs calls across detection, settle and all steps. No C1 finding.

## Verification
`npm run verify -- -p @ptah-extension/task-end-hook -- --output-style=static`: lint and typecheck passed;
19 of 19 suites, 598 of 598 tests passed; exit code 0.
