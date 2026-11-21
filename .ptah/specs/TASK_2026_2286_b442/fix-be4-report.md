# Fix round be4 — TASK_2026_2286_b442

Scope: `code-logic-re-review-2.md` new defects 1 (major) and 2 (minor). Write set:
`libs/backend/auth-providers/src/lib/quota/readers/` runner, its spec, and the degradation-audit
justifications in the Antigravity adapter and JSON parser.

## Design

1. **A cancelled flight is closed to new waiters.** `runFallbackUsage` now loops over the
   cache check and flight lookup. If the flight for the key has an aborted controller (the last
   waiter left, or the owner's `runSignal` fired), the caller does not join it. It waits in
   `waitForClose` until that flight's promise settles. The promise settles only after the flight's
   `finally` block runs, which releases `flights`, `total` and `running`. So the old flight keeps
   its concurrency slot until its process and temporary-directory cleanup end. The caller then
   rechecks the cache. A run its waiters abandoned writes no cache entry, so the caller starts a
   fresh flight or joins a live one. An owner abort still records its short backoff, so the caller
   gets `cli-backoff` for that key. The wait is bounded by the caller's own `signal` and
   `runSignal`, which return `cli-unavailable`, and by its `deadline`, which returns `cli-timeout`.
   Every listener and timer is released when the wait ends. This holds whether or not the caller
   passes `admit`.
2. **Admission is synchronous.** `FallbackRequest.admit` is now `(value: T) => boolean`. The flight
   no longer awaits anything after `execute`, so admission cannot hold the slot. Only a literal
   `true` admits. A hook that returns a promise anyway, through a cast, fails closed at once as
   `cli-account-mismatch`. A throw still fails closed as `cli-account-mismatch` and is logged by
   error name. Since nothing is awaited, an owner abort can no longer arrive during admission and
   still lead to a late cache write. The production hook in `antigravity-cli-usage.adapter.ts` was
   already typed `boolean`, so the adapter needed no change for this.

## Files changed

- `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.ts`
  - Adds the cache and flight loop with the aborted-flight wait, and the new `waitForClose` helper.
  - Narrows `admit` to a synchronous boolean that must be exactly `true` to admit.
  - Changes the admission catch marker to the known form `reported` (the catch logs).
  - Drops the unused `_error` binding (removes an eslint warning).
- `libs/backend/auth-providers/src/lib/quota/readers/fallback-usage.runner.spec.ts`
  - The async `admit` in the typed-failure test is now synchronous.
  - New tests:
    - Admission is synchronous: the type check rejects an async hook (`@ts-expect-error`). At run time a promise fails closed, and the slot frees at once.
    - A retry that arrives before the cancelled flight's cleanup resolves does not join that flight. It waits, then gets a fresh live flight with a successful result (`start` is called twice).
    - The wait for a cancelled flight is bounded by the retry's own signal (`cli-unavailable`) and deadline (`cli-timeout`).
- `libs/backend/auth-providers/src/lib/quota/readers/antigravity-cli-usage.adapter.ts` and
  `antigravity-usage-json.parser.ts`: the `JSON.parse` catch now has a
  `// degradation-audit: optional-capability - ...` justification. Non-JSON output is an
  unparseable reply, and the output is never logged.

## Check results

- `npx jest --config libs/backend/auth-providers/jest.config.ts --runInBand --coverage=false --runTestsByPath <16 readers specs> libs/backend/auth-providers/src/lib/quota/plan-usage.service.spec.ts`:
  16 suites and 403 tests passed (`.ptah/tmp/fix-be4-jest.log`).
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/auth-providers/tsconfig.spec.json`: no diagnostics in the
  changed readers files. The `@ts-expect-error` directive is consumed.
- `npx eslint` on the four changed files: exit 0, with no warnings.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0. For
  `libs/backend/auth-providers` it reports 23 ok against a baseline of 24
  (`.ptah/tmp/fix-be4-degradation.log`). Before this round it reported a FAIL: the marker kind
  `fail-closed` from be3 is not a known form, and two parse catches had no marker.
- I did not run `npm run verify`, nx, build, serve or e2e, as the brief required.

## Decisions

- I narrowed admission to synchronous instead of bounding an asynchronous hook. Options were to
  narrow it, or to bound an async hook by the deadline and cancellation and suppress cache writes.
  The only production hook is synchronous, and narrowing removes the extra phase entirely. This
  can be reversed.
- A waiting caller with no `deadline` and no signal waits until the cancelled flight's cleanup
  settles. That cleanup is bounded by the tree-kill timeout and `FALLBACK_CLOSE_GRACE_MS`, plus
  the temporary-directory removal. This matches how such a caller already waits on a live flight.
  This can be reversed.

## Round 2 (answers code-logic-re-review-3.md)

Design, all in `fallback-usage.runner.ts`:

- `callerGone(request, now)` returns `cli-unavailable` for an aborted `signal` or `runSignal` and
  `cli-timeout` for an expired deadline. It touches no shared state. It runs at entry and again
  after each `waitForClose`, before the cache read and the slot reservation (Major 1, Minor 2).
- The flight wraps the executor and records `spawned`. A `cli-timeout` with no spawn sets no
  backoff (Major 1).
- A joiner keeps its own deadline timer. Its expiry returns `cli-timeout` and decrements the
  waiter count but never aborts the flight: the run's own timeout decides CLI health.
- An owner `runSignal` abort that wins after a success was selected marks the flight disposed:
  no admission, `cli-unavailable`, no cache entry.

Tests: 4 new cases in `fallback-usage.runner.spec.ts` (deadline at closing-flight settlement,
unspawned timeout not cached, owner abort during close grace, shorter-deadline joiner).

Decision: no dedicated test for a microtask-ordered `runSignal` abort between close and resume.
The post-wait `callerGone` check covers it structurally.

Checks: focused Jest 16 suites / 433 tests pass; eslint exit 0; degradation audit exit 0.
`tsc` of the lib reports only TS2339 at `agent-sdk/.../sdk-query-runner.service.ts:289`, caused
by the shared `node_modules` holding Claude Agent SDK 0.3.318 while the lockfile pins 0.3.329.
