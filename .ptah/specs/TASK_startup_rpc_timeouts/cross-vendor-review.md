# Cross-Vendor Review — Startup RPC Timeout Storm Fix (`fix/startup-rpc-timeouts`)

## Verdict: **needs-changes**

The direction of the changes is sound — converting `git ls-files` to async `execFile`, adding an in-flight guard to `BootStatusService`, bounding `PlanLimitsSnapshotService.sessionOwners()`, and adding headroom to `USAGE_SUMMARY_BUDGET_MS` all address real causes identified in `rpc-timeout-investigation.md`. However, independent review surfaced **three concrete issues that should be fixed before merge**, plus a few smaller nits.

---

## Findings

### 1. [Bug / False-Positive Test] New `BootStatusService` test never arms the watchdog while the pull is in flight

- **Files:**
  - `libs/frontend/core/src/lib/services/boot-status.service.spec.ts:368-413`
  - `libs/frontend/core/src/lib/services/boot-status.service.ts:139, 209-216, 317-358`
- **Issue:** On construction (`boot-status.service.ts:139, 215`), `_status` defaults to `READY_DEFAULT` (`readiness: 'ready'`), `this.watchdog` is `null`, and `pullReadiness()` is invoked once. `startWatchdog()` is only called from `syncWatchdog()`, which is only triggered by `adopt()` (`:320`) or `foldHostSteps()` (`:313`).
  In the new spec (`boot-status.service.spec.ts:368-413`), the first `rpc.call` stays unresolved and no `warming` push is sent before advancing timers. Consequently, at lines `393` and `397` (`jest.advanceTimersByTime(2000)` twice), **`this.watchdog` is still `null`** — no interval callback runs at all. Those assertions pass even if `if (this.pullInFlight) return;` is removed completely. Then at line `402`, `resolveFirst` resolves with `warming` (clearing `pullInFlight` and finally starting the watchdog), and line `409` fires pull #2, which resolves immediately. The `pullInFlight` guard branch is never exercised.
- **Fix:** Either deliver a `warming` push while pull #1 is still pending (so `startWatchdog()` arms the interval while `pullInFlight === true`), or let pull #1 resolve with `warming` and hold pull #2 pending across two 2000 ms ticks while asserting `call` stays at `2` until pull #2 settles. Also consider a case where a pull rejects/times out to pin that `finally` resets `pullInFlight`.
- **Production code status:** `boot-status.service.ts:81, 202, 263-264, 287-289` itself is correct — `pullInFlight` is set synchronously before `await` and cleared in `finally`, and raising `READINESS_PULL_TIMEOUT_MS` to `15_000` is consistent with the startup stall window.

---

### 2. [Correctness + Effectiveness Gap] `startInstallScopeMigration()` governor deferral diverges from `admitUserLayerPass`, can leak an unhandled rejection, omits `signal`, and does not defer when the governor starts `clear`

- **Files:**
  - `apps/ptah-electron/src/activation/boot-heavy-services.ts:156-242, 323`
  - Compare `apps/ptah-electron/src/activation/plugin-activation.ts:221-259`
  - Compare `libs/backend/vscode-core/src/diagnostics/background-work-governor.ts:130-138, 244, 281-288`
  - Compare `libs/backend/vscode-core/src/diagnostics/event-loop-monitor.ts:77`
- **Issues:**
  1. **Skips on all `whenClear()` rejections instead of failing open on non-`AbortError` (`boot-heavy-services.ts:213-220`):**
     Both the `BackgroundWorkAdmission` contract (`background-work-governor.ts:130-133`) and `admitUserLayerPass` (`plugin-activation.ts:246-258`) skip **only** on `error instanceof Error && error.name === 'AbortError'` (governor disposed / signal aborted) and warn + run (fail open) on any other rejection. The JSDoc at `boot-heavy-services.ts:195-198` even states *"skip on dispose, run ungoverned otherwise — the same rule `admitUserLayerPass` follows"*, yet lines `213-220` treat every caught error as disposal and `return`.
     *(Note: skipping on actual governor disposal / `AbortError` IS the right call over unconditional fire-and-forget — `InstallScopeMigrationService.run()` resumes from its ledger on the next start, and starting multi-workspace reconciles during quit is undesirable.)*
  2. **Potential unhandled promise rejection if `governor.isClear()` throws (`boot-heavy-services.ts:203-205`):**
     `startInstallScopeMigration()` invokes `void (async (): Promise<void> => { ... })()`. Line `205` (`if (governor !== null && !governor.isClear())`) sits outside any `try/catch`; a throwing `isClear()` will reject the dropped promise unhandled, contradicting the contract at `:188-189`.
  3. **Boot abort `signal` not wired (`boot-heavy-services.ts:117, 210-221`):**
     Every other background step in `bootHeavyServicesOnce` uses `signal` (`coordinator.abortSignal`). Passing `signal` to `governor.whenClear({ signal, lane: INSTALL_SCOPE_MIGRATION_GOVERNOR_LANE })` and checking `if (signal.aborted) return;` before starting `migration.run()` ensures shutdown aborts cleanly even if the governor is not disposed first (or in hosts without `armDiagnostics`).
  4. **Effectiveness gap on cold startup (`background-work-governor.ts:244`, `event-loop-monitor.ts:77`, `boot-heavy-services.ts:205, 323`):**
     `BackgroundWorkGovernor` initializes to `'clear'` and only transitions to `'lagging'` after `EventLoopMonitor` emits a 2 s sample (`DEFAULT_EVENT_LOOP_SAMPLE_INTERVAL_MS = 2_000`) with `maxMs >= 1_000` (or two consecutive 2 s windows with `p99Ms > 100`), or when a foreground turn is `generating` (never true at cold boot). If `bootThothRuntime()` reaches line `323` before any lag sample flips the governor (e.g., SQLite opened in `< 1 s`, or before the first 2 s tick), `governor.isClear()` is `true`, so `whenClear()` is bypassed and `migration.run()` still starts synchronously right before `refreshUserLayer()` and `reconcileHarness()` — meaning the migration itself can still *cause* the startup stall while renderer startup RPCs are arriving. If the intent is to keep `migration.run()` out of the startup boot window unconditionally, moving `startInstallScopeMigration()` after heavy boot settles (as `startTableSizeReportAfterMigrations` does at `boot-heavy-services.ts:624-626`) or yielding/deferring until boot readiness settles is needed in addition to the governor gate.
- **Test note (`boot-heavy-services.install-scope.spec.ts:297-332`):** The added test does exercise real deferral behavior (not just the mock), verifying `driveBoot` completes while `whenClear` is pending and `migration.run` fires after `releaseClear('clear')`. Once fixed, add cases for `AbortError` (skips) and non-`AbortError` rejection (fails open and runs).

---

### 3. [Correctness] `PlanLimitsSnapshotService.sessionOwners()` deadline fallback does not mark the snapshot non-cacheable

- **Files:** `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts:194-207, 280-294, 394-454`
- **Issue:** In `assemble()` (`:280-294`), `cacheable` is only set to `false` when `discoveryIncomplete` is true or when `readOwner()` triggers `onFallback` (`:282, 333, 363`). `sessionOwners()` (`:394-454`) has no `onFallback` hook.
  If discovery + owner reads all succeed near the 24 s ceiling (`cacheable === true`), leaving `remainingMs <= 0` or too small for `metadata.get()` to finish, `sessionOwners()` skips or times out the lookups and fills `{ ownerKey: null, modelScope: null }` (`:451`). `snapshot()` (`:203-205`) then **caches that degraded snapshot for 30 s** (`PLAN_LIMITS_SNAPSHOT_TTL_MS`), serving `ownerKey: null` to subsequent non-refresh callers even after startup settles.
- **Fix:** Pass an `onFallback` callback (or return a `degraded`/`complete` flag) from `sessionOwners()` and invoke it whenever `pending.length > 0 && remainingMs <= 0` or any lookup times out / fails, setting `cacheable = false`. Also log at `debug`/`warn` when `remainingMs <= 0` causes pending lookups to be skipped (matching `readOwner`'s log at `:329-332`).
- **Additional nits in `sessionOwners()`:**
  - **Duplicate `sessionIds` (`:408-410`, `:488`):** `discoveryRequest()` does not deduplicate `sessionIds` (unlike `scopeKey()` at `:500`). Under the old sequential `for` loop, the first occurrence populated `result[sessionId]` and subsequent duplicates were skipped; with `.filter()` + `Promise.all()`, duplicates launch redundant concurrent `metadata.get()` calls and timers. Use `[...new Set(sessionIds)].filter(...)`.
  - **Per-session timers / log fan-out (`:413-446`):** All pending lookups share the same `remainingMs` deadline; a single batch timer (or shared deadline promise) would avoid allocating `N` timers and emitting `N` identical `warn` lines when the deadline fires.
- **Verified clean in `plan-limits-snapshot.service.ts`:**
  - Computing `codexOwners` (`:401-403`) once before `Promise.all` is correct — it depends solely on the already-resolved `owners` parameter.
  - Mutating `result[sessionId]` from concurrent callbacks (`:429, 438`) has no JS reentrancy/race hazard once `pending` is deduplicated; failed/timed-out callbacks do not write to `result`, and `:450-452` safely backfills `{ ownerKey: null, modelScope: null }`.
  - `Promise.race([metadata.get(sessionId), timeout])` attaches handlers synchronously to both promises, so a late rejection from `metadata.get()` after timeout will not produce an unhandled rejection.
  - Keeping `SNAPSHOT_BUDGET_MS` at `24_000` is well-justified: discovery's deadline is `SNAPSHOT_BUDGET_MS - RESERVED_READ_MS` (`12_000`), which matches Windows `detectAll()` measurements and is pinned by `plan-limits-snapshot.service.spec.ts:522-549`.
  - New tests (`plan-limits-snapshot.service.spec.ts:398-450`) test real parallel dispatch and fake-timer bounding with `expect(jest.getTimerCount()).toBe(0)`. (Minor gap: neither tests a partially consumed budget or `remainingMs <= 0`.)

---

## Verified Clean (Brief Notes)

- **`libs/backend/harness-sync/src/lib/gitignore/gitignore-writer.ts`:**
  - Async conversion of `git ls-files` (`execFileSync` → `promisify(execFile)`) is complete; `git grep` confirms zero remaining `execFileSync`/`execSync`/`spawnSync` calls in production code under `libs/backend/harness-sync/src`. (Small sync fs calls like `isLinkedWorktreeRootSync`, `readFileSync`, and `atomicWriteWithRetry` remain, as scoped; note `isLinkedWorktreeRoot` already has an async counterpart in `linked-worktree.ts:52`, and `fs/windows-retry.ts:13` has a minor stale comment still referring to `HarnessGitignoreWriter.apply` as synchronous.)
  - Dropping `stdio: ['ignore', 'pipe', 'ignore']` (`gitignore-writer.ts:492-501`) is required because `execFile` does not accept `stdio`. The only behavioral differences are that `stderr` is buffered up to `maxBuffer` (1 MiB, same default as `execFileSync`) instead of discarded and `stdin` is piped instead of ignored; `git ls-files -z -- <dirs>` neither reads `stdin` nor prompts, and any `maxBuffer`/timeout/`ENOENT`/non-zero exit error is caught and mapped to `null` identically to before. `windowsHide: true`, `encoding: 'utf-8'`, and `timeout: 10_000` are preserved.
  - Minor test gap: `gitignore-writer.spec.ts` only injects synchronous `listTrackedPaths` stubs; adding a case returning a resolving/rejecting `Promise` would directly cover the async `listTracked()` path.
- **`libs/backend/harness-sync/src/lib/gitignore/gitignore-writer.spec.ts`:**
  - Audited all 48 `.apply()` call sites (lines `102`–`554`) and every enclosing `it`/`it.each` callback: **all 48 calls are `await`ed and all callbacks are `async`**. Nothing was missed.
- **`libs/backend/harness-sync/src/lib/reconciler/harness-reconciler.service.ts`:**
  - Sole production caller of `HarnessGitignoreWriter.apply()` (`:603`). `maintainGitignore()` is now `async` (`:573`) and `await`ed inside `try { ... } finally { lock.release(); }` (`:448-482`), preserving workspace lock coverage across the async git call and preserving non-fatal error logging (`:610-615`).
- **`libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts`:**
  - Lowering `USAGE_SUMMARY_BUDGET_MS` from `30_000` to `24_000` (`:41`) is clean, gives 6 s headroom ahead of `DEFAULT_RPC_TIMEOUT_MS`, keeps `timer.unref?.()` + `clearTimeout(timer)` in `finally`, and conflicts with no assertions in `analytics-rpc.handlers.spec.ts`.
