# Fix round be3 — TASK_2026_2286_b442

Scope: re-review rows 2, 3, 6 and the new defect (model-turn latch). Write set:
`libs/backend/auth-providers/src/lib/quota/readers/` runner, Antigravity adapter, Antigravity reader, and their specs.

## Changes

- `fallback-usage.runner.ts`
  - New optional `admit?: (value: T) => Promise<boolean> | boolean` on `FallbackRequest`. It runs once inside the
    shared flight, after the parse and before the cache write, whether or not a waiter is still listening.
    A `false` result or a throw rejects the result. A throw is logged by error name, with a `degradation-audit: fail-closed`
    comment. A rejected result is not cached, and every waiter gets the new `FallbackReason`
    `cli-account-mismatch`.
  - Each flight is now `{ promise, controller, waiters }` with its own `AbortController`. `execute` receives the
    flight's signal as `runSignal`, and the caller's `runSignal` (owner disposal) is linked to it. Every waiter
    increments `waiters`. A waiter that has a signal and aborts decrements the count, and at zero the flight's
    controller aborts. The existing check before `executor.start` therefore stops a launch that has not started yet
    (for example during temporary directory creation). A waiter without a signal can never leave.
  - A flight that its waiters abandoned sets no backoff (`until = 0`), so the next read is not blocked by a
    cancellation. An abort by the owner's `runSignal` keeps today's short backoff.
  - Callers that omit `admit` behave as before. The only callers are the Antigravity adapter and the runner and
    service specs.
- `antigravity-cli-usage.adapter.ts`
  - New optional request field `currentAccountFingerprint?: () => string`. The adapter passes an `admit` hook. On a
    `num_turns > 0` reply the hook sets the model-turn latch and the backoff in the flight and admits the result. On a
    usage reply it admits the result only when `currentAccountFingerprint()` still equals the fingerprint the flight
    started with.
  - The runner's `cli-account-mismatch` maps to the cause `account-mismatch`. `AntigravityCliFailureCause` is now
    `Exclude<FallbackReason, 'cli-account-mismatch'> | 'cli-model-turn' | 'account-mismatch'`. The waiter path reuses
    the backoff that the flight already recorded.
  - `discard()` and the rejection generations stay. They cover the narrow window between the flight settling and
    the reader's post-check, and they keep the existing spec assertions intact.
- `antigravity-plan-usage.reader.ts`: passes `currentAccountFingerprint: () => readStoreOwner().key` to the CLI read,
  keeps its own cheap check after the run, and adds `cli-exit-error` to `PROMOTED_CLI_CAUSES`.

## Specs added (no existing assertion weakened or removed)

- Runner:
  - The last waiter aborts during cwd creation: `start` is never called, the directory is removed, and the next read
    launches (no backoff).
  - One of two signalled waiters aborts after launch: the process is not killed and the other waiter gets the result.
  - `admit` runs when the only waiter left in the same tick that the reply arrived, and its rejection is not cached.
  - Both waiters get `cli-account-mismatch`, and a later read launches again.
- Adapter:
  - The only waiter cancels after launch and the reply has `num_turns: 1`: a read for another owner returns
    `cli-model-turn` and `start` stays at 1.
  - The store fingerprint changes during the run: the read returns `account-mismatch` and the next read launches.
  - The store switches A to B to A while the only waiter cancelled: B's windows are not replayed from the cache
    (`start` is 2).
- Reader: the promotion spec now asserts that a `cli-exit-error` cause becomes the snapshot `statusReason`, not
  `no-oauth`.

## Verification

- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json` exits 0 (`.ptah/tmp/fix-be3-tsc.log`).
  `tsconfig.spec.json` also exits 0.
- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath` was
  run on the runner, adapter and reader specs, plus `plan-usage.service.spec.ts` (the other caller of the runner).
  Result: 4 suites and 143 tests pass (`.ptah/tmp/fix-be3-jest.log`).
- `npx eslint` on the 6 changed files: 0 errors and 3 warnings (unused catch bindings). The warnings are on
  `antigravity-plan-usage.reader.ts:119` and `:267`, and on the runner's `:264` (`_error`). These lines already
  existed and this round did not touch them.
- Not run: `npm run verify`, nx, and the degradation-audit ratchet (the brief excludes them). The coordinator
  should run the gate. The new catch has a `degradation-audit:` justification comment.

## Decisions

- One `admit` hook covers ownership and the model-turn latch, instead of a separate `onParsed` hook. Both decisions
  need the parsed value inside the flight, and one hook keeps the runner surface small. This is reversible.
- `discard()` stays alongside the hook. The hook now prevents the caching bug. `discard` only covers the
  post-settle window, and removing it would mean deleting spec assertions.
- Because of fix 3, a cancelled sole waiter normally kills the run before the reply. The latch spec therefore
  delivers the reply and the cancellation in the same tick. That is the remaining race that fix 2 has to cover.
