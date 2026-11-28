# Startup RPC timeout storm — implementation summary

Source investigation copied to `rpc-timeout-investigation.md` in this folder. All
claims verified against code before any edit (file:line citations below reflect
the state after edits, not the investigation's original line numbers).

## P0 — synchronous main-loop blockers on the startup path

1. **`libs/backend/harness-sync/src/lib/gitignore/gitignore-writer.ts`** —
   `gitTrackedPaths()` used `execFileSync('git', ['ls-files', ...])`, which
   blocks the Electron main-process event loop for the full `git` run. Changed
   to `promisify(execFile)`. Propagated `async`/`await` up through
   `listTracked` → `selectSkillPatterns` → `apply()` (now
   `Promise<GitignoreResult>`), and through the one production caller,
   `maintainGitignore()` in `harness-reconciler.service.ts` (now `async`,
   awaited by its own caller inside the existing try/finally).
   `HarnessGitignoreDeps.listTrackedPaths` widened to accept a sync-or-async
   return so existing test mocks did not need to change.

2. **`apps/ptah-electron/src/activation/boot-heavy-services.ts`** —
   `startInstallScopeMigration()` used to call `migration.run()` immediately
   (fire-and-forget) right after the window loads. `run()`'s synchronous work
   (`reconciler.reconcile` — sync fs, `Atomics.wait` retries, and the
   `execFile`-ized git call above) was running in the very event-loop turn
   boot-heavy-services continues in. Now gated behind
   `BackgroundWorkGovernor.whenClear()` (`TOKENS.BACKGROUND_WORK_GOVERNOR`,
   the same mechanism `admitUserLayerPass` in `plugin-activation.ts` already
   uses) — still never awaited by the boot path itself, fails open when the
   governor is unavailable or not registered (existing `boot-heavy-services.install-scope.spec.ts`
   coverage, which registers no governor, is unaffected), and skips the
   migration outright if the governor is disposed (app already quitting).
   Added a new test exercising the deferral itself.

3. **`task_specs` full-replace transaction chunking** — not changed in this
   task. `.ptah/specs/TASK_2026_923_481f/investigation-sync-blockers.md`
   on `main` already has its own implementation/review trail
   (`impl-task-specs.md`, `code-logic-review-task-specs.md`); re-checked here
   only to confirm it's tracked separately, out of this task's scope.

## P1 — `boot:getReadiness` timeout storm

**`libs/frontend/core/src/lib/services/boot-status.service.ts`** —
`startWatchdog()`'s `setInterval` had no in-flight guard: a pull that missed
its 5 s timeout during a main-process stall left a new 5 s RPC dispatched
every 2 s, compounding the stall into a timeout burst. Added a `pullInFlight`
boolean guard in `pullReadiness()` (set/cleared around the RPC call) so a
tick that lands while a pull is outstanding is a no-op instead of issuing a
second RPC. Raised `READINESS_PULL_TIMEOUT_MS` from `5_000` to `15_000` for
headroom during a brief startup stall. New spec case pins the no-pileup
behavior.

## P1 — `provider:getPlanLimits` unbounded tail

**`libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts`** —
`sessionOwners()` ran sequentially (`for` + `await` per session) **after**
`deadlineAt`'s 24 s budget had already elapsed, with no cap of its own —
the one genuinely unbounded part of the read. Rewrote it to run every
`metadata.get()` lookup in `Promise.all` and race the whole batch against
`deadlineAt - now()`, so a hung or slow native-session lookup degrades to
`ownerKey: null` instead of extending the RPC past the client's 30 s timeout.

`SNAPSHOT_BUDGET_MS` was **not** lowered from `24_000`, despite the
investigation's "~18–20 s" suggestion: discovery's own deadline is
`SNAPSHOT_BUDGET_MS - RESERVED_READ_MS` (`RESERVED_READ_MS` = the shared
`SLOW_LIMIT_LOOKUP_DEADLINE_MS` = `12_000`), and the investigation itself
documents `CliDetectionService.detectAll()` cold starts measuring close to
that same 12 s on Windows. Shrinking the total budget would have shrunk
discovery's allowance below its own worst-case, trading one timeout cause for
another — confirmed by `plan-limits-snapshot.service.spec.ts`'s existing
`"reserves time for a live owner read after discovery uses its 12 second
deadline"` test, which hard-asserts that exact split. The real fix is bounding
`sessionOwners()`, which removes the unbounded tail regardless of the budget
number.

## Item 4 — `analytics:spendSummary`

**`libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts`** —
no slow path of its own beyond the shared main-loop stall; it has a bounded
`AbortController` scan already. But its own abort budget
(`USAGE_SUMMARY_BUDGET_MS`) was `30_000`, equal to the client's own
`DEFAULT_RPC_TIMEOUT_MS`, leaving zero headroom — a scan that used the whole
budget raced the client's timeout instead of returning its own
`PERSISTENCE_UNAVAILABLE` answer first. Lowered to `24_000` for 6 s headroom,
matching the margin `plan-limits-snapshot.service.ts` already uses.

## Cross-vendor review (antigravity) — findings addressed

A cross-vendor review (`cross-vendor-review.md`, antigravity) found three real issues,
all fixed:

1. **Test gap**: the first `boot-status.service.spec.ts` in-flight-guard test never
   actually armed the watchdog while a pull was outstanding (the watchdog only starts
   after a `warming` snapshot is adopted), so it passed even with the guard removed.
   Rewrote it to let pull #1 resolve with `warming` first, then hold pull #2 open
   across two watchdog ticks. Verified it now fails without the guard.
2. **`startInstallScopeMigration()` governor handling**, three real bugs:
   - It skipped the migration on *every* `whenClear()` rejection, not just
     `AbortError` (governor disposed) — contradicting its own doc comment and
     `admitUserLayerPass`'s rule. Now checks `error.name === 'AbortError'` and fails
     open (warns, runs anyway) on any other rejection.
   - `governor.isClear()` ran outside any `try`/`catch`; a throwing `isClear()` would
     have rejected the fire-and-forget IIFE unhandled. Now the whole governor check
     is inside the existing outer `try`.
   - The boot's own abort `signal` was not passed to `whenClear()`. Now wired through,
     with an `if (signal.aborted) return;` check before starting `migration.run()`.
   - Added two tests: `AbortError` → skip, other rejection → fail open and run.
   - (Not changed: the reviewer also noted the governor starts `'clear'` and only
     flips to `'lagging'` after ~2 s of sampled event-loop lag, so a very fast cold
     boot could reach this call before the gate has anything to act on. Accepted as a
     known limitation shared with `admitUserLayerPass`'s existing use of the same
     governor — restructuring *when* the migration starts would break the existing
     pinned test `"starts the migration after the window and before refreshUserLayer"`
     and was out of scope for this fix.)
3. **`sessionOwners()` degraded results weren't marked non-cacheable.** When the
   remaining budget was already spent (or a lookup failed/timed out), the resulting
   `ownerKey: null` snapshot was still cached for the full 30 s TTL as if complete.
   Added an `onFallback` callback, invoked whenever pending lookups are skipped
   (budget already spent) or fail, which flips `assemble()`'s `cacheable` flag.
   Caught and fixed a real bug introduced while wiring this up: `cacheable` was read
   as a shorthand property in the *same* object-literal `return` statement that
   contained the `await this.sessionOwners(...)` call further down — JS evaluates
   object-literal properties in source order, so the shorthand `cacheable` was
   captured *before* `sessionOwners()` had a chance to flip it. Fixed by awaiting
   `sessionOwners()` into a local variable before building the return object. Also
   deduplicated `sessionIds` (a repeat used to launch a redundant concurrent lookup
   and timer). Added tests for both.

## Verification (focused, per CLAUDE.md)

- `npx jest --runTestsByPath` on every touched/added spec file: harness-sync
  (gitignore-writer, harness-reconciler.gitignore, harness-reconciler.linked-worktree),
  ptah-electron (boot-heavy-services.install-scope), frontend/core
  (boot-status.service), rpc-handlers (plan-limits-snapshot.service,
  analytics-rpc.handlers) — all green.
- `npm run verify -- -t typecheck -p harness-sync,rpc-handlers,ptah-electron,core`
  and `-t lint -p ...` — all green.
- **Known local-machine flake, not caused by this change**: the two
  harness-sync reconciler specs intermittently fail on this developer
  machine only, because `%TEMP%\.ptah\` (a stray real harness-state
  directory, pre-dating this task) sits directly under the OS temp
  directory, and `resolveHarnessWorkspaceRoot()`'s upward marker search
  (walking from a test's `mkdtemp`'d workspace toward `homedir()`) finds it
  and resolves the test's workspace root to `%TEMP%` instead of the test's
  own subdirectory. Confirmed by rerunning the same specs with `TEMP`/`TMP`
  redirected to a clean directory (`C:\ptah-test-tmp-clean`, no `.ptah`/`.git`
  ancestor) — all 53 tests pass. CI runs in a clean container and will not
  hit this.
