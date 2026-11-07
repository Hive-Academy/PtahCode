# Phase 3 round 1 review

## Logic

Verdict: APPROVED  
Score: 8/10

- **L1 RESOLVED — `libs/backend/task-end-hook/src/lib/task-end-hook.integration.spec.ts:513-526`.** The removed boots are retained at line 516. Every boot is disposed, then each `awaitStopped()` is awaited before SQLite closes; the inner `finally` closes the DB and the outer `finally` restores real timers. `connectTaskEndHook` awaits detector and worker settlement (`libs/backend/task-end-hook/src/lib/di/register.ts:119-122`), so this covers the asynchronous work identified in L1.
- **L2 RESOLVED — `libs/backend/task-end-hook/src/lib/task-end-hook.integration.spec.ts:437-448,539-557`.** The carrier fixture is written before `afterFixtures` installs the spies. The index event, debounce, detection, settle, and all steps then run while the spies are active; they are restored in `finally`. The assertion checks recorded calls at lines 551-555. The existing fake git call list and read-only vector assertions remain at lines 582-595.
- **NEW defects:** none in the fix scope.

The test still asserts literal `effectiveMode: 'off'` at `task-end-hook.integration.spec.ts:574-580` and checks git verbs without `fetch` at `:582-595`. The fix adds no production filesystem or git path. The score is 8 rather than 9 because this is a read-only review of test code; the reported 19 suites and 598 tests passing were not independently rerun here.

## Style

Verdict: APPROVED  
Score: 8/10

The callback is local to the fixture helper and makes the spy window explicit (`task-end-hook.integration.spec.ts:437-448`). Nested `finally` blocks express the teardown order (`:513-526`). No new style defect was found. The prior Phase 3 style assessment remains unchanged.

## Decisions

- **Accept the `afterFixtures` callback.** Options: duplicate fixture setup in this case or add a callback to the helper. The callback keeps the existing detection sequence in one place while allowing the spy to start after the required fixture write (`task-end-hook.integration.spec.ts:437-448,543-545`). Reversible.
- **Accept the teardown sequence.** The handle contract waits for detector and worker settlement (`di/register.ts:119-122`); closing the DB after those awaits is the required order (`task-end-hook.integration.spec.ts:513-526`). Reversible.

Read the original review, implementer fix report, supplied fix diff, current spec, and the handle's stop contract. The implementer reports scoped lint, typecheck, and tests passing. No Nx, npm, npx, git, build, or test command was run in this review.
