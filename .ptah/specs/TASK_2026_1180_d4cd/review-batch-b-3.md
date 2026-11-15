**Verdict: CHANGES REQUESTED**

# Logic review 3: batch (b), findings N1-N5

All five findings of `review-batch-b-2.md` are fixed. One new major defect comes from the
N1 fix: on Windows, the runner now runs `taskkill /T /F` on the PID of a parent that already
exited. A one-line change fixes it. Score: 8/10 after that change.

Checks: `npx jest ... --runTestsByPath` with the adapter, JSON parser, runner, plan reader and
OAuth reader specs: 5 suites, 115 tests passed. I did not run `tsc` or `eslint` again.

## Status of N1-N5

| # | Status | Evidence |
|---|--------|----------|
| N1 unbounded close wait | Fixed | `fallback-usage.runner.ts:211-219` races `closed` with `FALLBACK_CLOSE_GRACE_MS`, clears and unrefs the timer. The flight then settles and `:108-112` releases `flights`/`total`/`running`. Directory removal waits for the real close (`:188-197`). `liveRuns` keeps the handle until close (`:189,199`), so `disposeFallbackRuns` still kills it at shutdown. The `closed` rejection branch (`:198-203`) prevents an unhandled rejection. |
| N2 caller abort cancels shared flight | Fixed | `fallback-usage.runner.ts:146` checks only `runSignal`. |
| N3 position in every key | Fixed | `antigravity-usage-window.ts:10,13`: `other:cli-${slug}-${suffix}` for a unique slug (same as `main`). An index is added only for an empty or colliding slug. JSON counts only usable groups (`antigravity-usage-json.parser.ts:48-60`). TSV counts by first appearance (`antigravity-cli-usage.adapter.ts:178-191`). |
| N4 `mkdtemp` ENOENT shown as "CLI not found" | Fixed | `fallback-usage.runner.ts:136-144` catches `create()` separately and returns `cwdUnavailable`. `:101` does not cache it. `antigravity-cli-usage.adapter.ts:138` stops the candidate loop. |
| N5 TSV rounds to 100 % | Fixed | `antigravity-cli-usage.adapter.ts:225`: 100 only when remaining is 0, else at most 99.9. |

## New findings

### M1. [major] Windows tree kill can hit a reused PID

Evidence:
- `fallback-usage.runner.ts:60` now skips `stopRun` only when `isClosed()`. On `main`, Windows
  also skipped when the parent had `exited()`.
- In the N1 case (parent exited, a grandchild holds the pipe), `:62` calls
  `killProcessTree(pid, 'SIGKILL')`, which runs `taskkill /pid <pid> /T /F`
  (`libs/backend/platform-core/src/utils/process-tree-reaper.ts:59-66`).
- After `exit`, libuv closes the Windows process handle, so Windows can give the PID to a new
  process. The parent can exit up to 15 s before the timeout fires. If the PID was reused,
  `taskkill /T /F` force-kills an unrelated user process and all its children.
- The kill also has little benefit. `taskkill /T` starts from the given PID. When the parent no
  longer exists, it does not find the orphaned grandchild.
- On POSIX the change is safe: the group kill (`process.kill(-pid)`) targets the process group,
  which stays valid while any member lives.

Fix: restore the Windows guard:
`if (process.platform === 'win32' ? handle.exited?.() : handle.isClosed?.()) return;`.
The bounded close grace already fixes N1 without this kill. Change the Windows
exit-before-close test in `fallback-usage.runner.spec.ts` to expect no tree kill.

## Checked and clean

- Timers: the run timer (`:182`), the tree-kill timer (`:70`) and the close timer (`:218`) are
  cleared on all paths.
- False AT LIMIT: windows still carry no `modelScope` and no exhaustion evidence. A parse
  failure or no usable row gives `undefined` (unknown).
- Privacy: the new warn lines log only `error.name` (`:140-142,193-195,200-202`). No path,
  owner key, output or account data is logged.
