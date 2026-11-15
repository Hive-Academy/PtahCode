# Flake: subagent-budget-monitor.spec.ts `jest.getTimerCount()` (line ~3087)

## Root cause
Test: "clears a pending failed-stop retry immediately on normal exit" asserts `expect(jest.getTimerCount()).toBe(0)` after `finishWarnedAgent`.
`jest.getTimerCount()` is a GLOBAL count on the current fake clock, not a count of this test's monitor timers.

`SubagentBudgetMonitor` arms timers that outlive a test that does not release its session:
- the 1 s notes-gate watchdog (`scheduleGateTimeout`), which re-arms itself in its `finally` while a gate is active,
- the per-subagent deadline timer (`armDeadline`), and
- stop-retry timers (`onStopFailed`).

Many earlier tests run on REAL timers and never call `release()`, so these real timers stay armed (they are `unref`'d, so Jest does not hang). In a normal fast run they fire (or not) long before this test. Under CPU load the whole spec takes 45-70 s and this test needs real fs I/O (355 ms observed), so a leaked real timer fires INSIDE this test's window. Its callback calls the global `setTimeout` (now the fake one) to re-arm / retry, which adds timers to the fake clock. The assertion then sees 1-2 extra timers.
Reproduced: 6 parallel jest copies, 1 failure in ~24 runs: `Expected: 0, Received: 2` at line 3087.
This is a test-isolation defect, not a production defect (production monitor clears its own timers correctly: `release()`/`finishWarnedAgent` do), so no production edit was made.

## Fix
Test-only, in `subagent-budget-monitor.spec.ts`:
- `makeHarness` registers every monitor it builds in `createdMonitors`.
- A top-level `afterEach` calls `jest.useRealTimers()` and `monitor.release(...)` for the sessions the spec uses (`session-1`, `session-2`, `session-rekeyed`) on every created monitor. `release()` clears deadline, stop-retry and idle gate timers, so no timer survives its test.
No assertion was weakened, no test skipped or deleted, no timeout raised.

## Proof
Before: under load, 1 of ~24 runs failed with `Received: 2` at line 3087.
After (see results below).

- 10 sequential runs (`npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath <spec>`), run concurrently with a second copy as CPU load: 10/10 passed, 232/232 tests each.
- The second concurrent copy (load): 10/10 passed, 232/232 each.
- `npx eslint <spec>`: clean (no output).
- Caveat: the flake was about 1 in 24 runs even under load, so 20 green runs is supportive evidence, not a statistical proof. The mechanism is removed rather than masked.
