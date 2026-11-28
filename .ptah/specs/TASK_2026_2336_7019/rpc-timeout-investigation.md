# Startup RPC Timeout Investigation (`boot:getReadiness`, `provider:getPlanLimits`, `harness:get-install-migration-notice`)

## Verdict

**`real-bug`** — affects both development and production Electron startup (aggravated in dev by unminified bundles and DevTools opening at startup, not caused by the dev build).

The console symptoms all stem from **Electron main-process event-loop starvation right after the renderer loads**, compounded by:
1. A tight 5 s timeout and unguarded 2 s poll loop in `BootStatusService` (causing the `9x, 5x, 8x` timeout storm).
2. A 24 s internal budget + unbounded post-deadline `sessionOwners` loop in `PlanLimitsSnapshotService` against a 30 s client timeout.
3. Synchronous main-thread startup work launched immediately after `mainWindow.loadFile()` (SQLite migrations/task-index replacement, harness sync + `execFileSync('git', ...)` in `gitignore-writer.ts`, and un-deferred `InstallScopeMigrationService.run()`).

---

## 1. Timeouts & Electron Main-Process Handlers

### Renderer Timeout Configuration (`ClaudeRpcService`)
- **Default timeout:** `DEFAULT_RPC_TIMEOUT_MS = 30_000` ms (`libs/frontend/core/src/lib/services/claude-rpc.service.ts:24`).
- **Resolution & logging:** `options?.timeout ?? (CHAT_ADMISSION_RPC_METHODS.has(method) ? CHAT_ADMISSION_RPC_TIMEOUT_MS : DEFAULT_RPC_TIMEOUT_MS)` (`claude-rpc.service.ts:151-155`); timer logs `[ClaudeRpcService] RPC timeout for method: ${method}` at `claude-rpc.service.ts:174-187` (`:178`).

| Method | Effective Timeout | Renderer Caller | Main-Process Handler | Backing Implementation |
| --- | --- | --- | --- | --- |
| `boot:getReadiness` | **5,000 ms** (`READINESS_PULL_TIMEOUT_MS`) | `BootStatusService.pullReadiness()` (`libs/frontend/core/src/lib/services/boot-status.service.ts:76, 248-252`) | `BootRpcHandlers.register()` (`libs/backend/rpc-handlers/src/lib/handlers/boot-rpc.handlers.ts:65-71, 78-104`) | `ElectronBootReadinessProvider.getReadiness()` (`apps/ptah-electron/src/services/platform/electron-boot-readiness.ts:39-41`) reading `BootCoordinator.snapshot()` (`apps/ptah-electron/src/activation/boot-coordinator.ts:476-483`) & `BootProgressPublisher.snapshots()` (`apps/ptah-electron/src/activation/boot-progress-publisher.ts:203-207`) |
| `provider:getPlanLimits` | **30,000 ms** (default) | `PlanLimitsStore.loadOnce()` (`libs/frontend/core/src/lib/services/plan-limits.store.ts:212`) | `ProviderRpcHandlers.registerPlanLimits()` (`libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:287-296`) | `PlanLimitsSnapshotService.snapshot()` / `assemble()` (`libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts:144-207, 263-283`) -> `PlanLimitOwnerDiscoveryService.discoverTargets()` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.ts:237-385`) & `PlanUsageService.getOwnerSnapshot()` (`libs/backend/auth-providers/src/lib/quota/plan-usage.service.ts`) |
| `harness:get-install-migration-notice` | **30,000 ms** (default) | `InstallScopeMigrationNoticeComponent.load()` (`libs/frontend/chat/src/lib/components/molecules/notifications/install-scope-migration-notice.component.ts:308-312`) | `InstallScopeNoticeRpcHandlers.register()` (`libs/backend/rpc-handlers/src/lib/install-scope/install-scope-notice-rpc.handlers.ts:103-112`) | `InstallScopeMigrationService.readNotice()` / `readLedger()` (`libs/backend/rpc-handlers/src/lib/install-scope/install-scope-migration.service.ts:376-414, 438-447`) |

- **IPC dispatch path:** `preload.ts:21-23` (`ipcRenderer.send('rpc')`) -> `IpcBridge.setupRpcHandler()` (`apps/ptah-electron/src/ipc/ipc-bridge.ts:536-660`) -> `RpcHandler.handleMessage()` (`libs/backend/vscode-core/src/messaging/rpc-handler.ts:211-289`).

---

## 2. Handler Behavior, Registration Order & Root-Cause Analysis

### Not a Handler-Registration Race
All three handlers are registered **before** the renderer loads:
1. `bootstrapElectron()` initializes `IpcBridge` (`apps/ptah-electron/src/activation/bootstrap.ts:585`) and registers `ElectronBootReadinessProvider` (`bootstrap.ts:781-783`).
2. `wireRuntimePreWindow()` calls `registerRpcSurface()` (`apps/ptah-electron/src/activation/wire-runtime.ts:341-344`), registering all manifest entries (`libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:219-223, 325-329, 369-373`).
3. Only afterward does `registerPostWindow()` call `mainWindow.loadFile(rendererPath)` (`apps/ptah-electron/src/main.ts:425-445`, `apps/ptah-electron/src/activation/post-window.ts:99`).
4. Additionally, an unregistered method returns `{ success: false, error: 'Method not found: ...' }` immediately (`rpc-handler.ts:218-232`) — it never hangs until timeout.

### Per-Handler Analysis
1. **`boot:getReadiness` (0 I/O, waits on nothing):**
   - Purely synchronous in-memory read of `BootCoordinator.snapshot()` and `BootProgressPublisher.snapshots()`. It cannot be slow on its own; timing out at 5 s requires the main event loop (or renderer) to be stalled.
   - **Why it retries and produces `(repeated 9x, 5x, 8x)`:** `BootStatusService` pulls once on construction (`boot-status.service.ts:202`) because the `did-finish-load` push (`post-window.ts:117-120`) races Angular's message listener. Once any snapshot shows `readiness === 'warming'` or an unsettled `boot:progress` step, `syncWatchdog()` (`boot-status.service.ts:310-330`) starts `setInterval(..., DEFAULT_READINESS_RETRY_AFTER_MS)` (`:334-337`, `2000 ms` at `libs/shared/src/lib/types/rpc/rpc-readiness.types.ts:67`) for the duration of `warming` and up to `HOST_STEP_PULL_WINDOW_MS = 60_000` (`:84`).
   - **`startWatchdog()` has no in-flight guard**, and a timed-out pull (`:253`) leaves `_status` unchanged (`warming`/unsettled). Thus, during a prolonged main-loop stall, a new 5 s RPC is dispatched every 2 s and times out 5 s later — 22 consecutive timeouts (`9 + 5 + 8`, broken in DevTools when `provider:getPlanLimits` / `harness:get-install-migration-notice` log in between) corresponds to ~44+ s of main-loop unresponsiveness.

2. **`harness:get-install-migration-notice` (1 small async file read):**
   - `readNotice()` does **not** join `InstallScopeMigrationService`'s serialized `this.tail` queue (`install-scope-migration.service.ts:376-447`); it performs a single async `fs/promises.readFile` on `~/.ptah/migrations/install-scope.json` and Zod-parses it.
   - Timing out at **30 s** on a single `fs.readFile` (or `ENOENT`) is strong proof that the main process event loop was blocked/starved across that window (and not that this handler is internally slow).

3. **`provider:getPlanLimits` (can be legitimately slow + has an unbounded tail):**
   - `PlanLimitsSnapshotService.assemble()` (`plan-limits-snapshot.service.ts:97, 267-282`) uses `SNAPSHOT_BUDGET_MS = 24_000`, leaving only 6 s headroom before the 30 s client timeout.
   - On a cold start, `discoverTargets()` (`budget = 12_000 ms`) awaits `CliDetectionService.detectAll()` (measured ~13 s on Windows `.CMD` shims; `wire-runtime.ts:559`) and provider probes, then `Promise.all(ownerSnapshot)` runs network/local-RPC/CLI-store reads up to `SLOW_LIMIT_LOOKUP_DEADLINE_MS = 12_000` ms (`libs/shared/src/lib/utils/plan-limits/evidence-precedence.ts:25`).
   - **Unbounded post-deadline work:** `await this.sessionOwners(scope.sessionIds ?? [], owners)` (`plan-limits-snapshot.service.ts:281, 372-409`) runs *after* `deadlineAt` with no budget check, sequentially awaiting `this.metadata.get(sessionId)` per session.
   - With a 24 s budget + unbounded tail, even a 4–6 s startup stall pushes total latency past 30 s.

### How the Two `WARN` Lines Tie Everything Together
- `WARN VSCodeService: slow sync state read {"durationMs":3795}` (`libs/frontend/core/src/lib/services/vscode.service.ts:251-260`) measures `ipcRenderer.sendSync('get-state')` (`preload.ts:25`). Its main-process handler (`ipc-bridge.ts:853-880`) does **zero I/O** (Map + in-memory `ElectronStateStorage.get()`). A 3.8 s synchronous reply directly proves **main-process event-loop starvation** right as the renderer initialized.
- `WARN RendererFrame: long frame {"durationMs":4488,"blockingMs":4437,"scriptCount":0}` (`libs/frontend/core/src/lib/services/renderer-frame-monitor.service.ts:141-148`) reflects that exact synchronous IPC block (`scriptCount: 0` because the stall happened inside native sync IPC wait rather than JS script execution).
- Immediately after `mainWindow.loadFile()`, `main.ts:453` starts `coordinator.startPostWindow()` -> `bootHeavyServicesOnce()` (`apps/ptah-electron/src/activation/boot-heavy-services.ts:194-572`) concurrently with `registerCodeExecutionMcpForSubagents()`, `runSessionStoreMigration()`, and `task-index` warm-up. Known synchronous main-thread blockers in this boot window include:
  - `better-sqlite3` open/migrations (`openAndMigrate()`) and `onDidOpen` full-workspace `task_specs` replacement transaction (`libs/backend/task-specs/src/lib/task-index.store.ts`, documented in `.ptah/specs/TASK_2026_923_481f/investigation-sync-blockers.md`).
  - `InstallScopeMigrationService.run()` started at `boot-heavy-services.ts:268`, which runs `reconciler.reconcile(root, { mode: 'full' })` across **every recent workspace** (`install-scope-migration.service.ts:1039-1078`), plus `reconcileHarness()` (`boot-heavy-services.ts:329`). Both hit synchronous fs calls (`atomic-write.ts`, `windows-retry.ts` `Atomics.wait`, `harness-manifest.builder.ts`) and **`execFileSync('git', ['ls-files', ...], { timeout: 10_000 })`** in `libs/backend/harness-sync/src/lib/gitignore/gitignore-writer.ts:484`.
  - Eager synchronous DI graph construction in `captureShutdownHandles()` (`wire-runtime.ts:570, 585-796`).

---

## 3. Dev-Only Artifact vs. Production Bug & User Impact

- **Not dev-only:** `npm run electron:serve` (`apps/ptah-electron/project.json:487-500`) runs the Nx build steps sequentially and only launches Electron (`apps/ptah-electron/scripts/launch.js`) after builds complete. None of the handlers or startup boot paths above are dev-only.
- **Confirmed in production logs:** Prior release-log investigations in this repo captured the identical failure mode in packaged production builds:
  - `.ptah/specs/TASK_2026_921_fde0/implementation-report.md` & commit `260cd2d63` (Nov 10, 2026): 34 s renderer freeze in sync `get-state` + burst of RPC timeouts while main was starved.
  - `.ptah/specs/TASK_2026_923_481f/context.md` & commit `549e1c2d5` (Nov 10, 2026): 8–27 s main-process `[event-loop] lag` stalls at startup in release logs.
  - Commit `4edf19bf5` (Nov 23, 2026): raised Reviews startup RPC timeouts from 5 s to 15 s because main and renderer each stall for several seconds on startup.
- **User impact:**
  - **UI freeze on launch (4–30+ s):** Synchronous `get-state` blocks the renderer frame until main responds; initial RPCs queue behind the stalled loop.
  - **`boot:getReadiness`:** Boot progress/screen stalls without updates; 2 s watchdog polls pile up and spam console/log errors until main recovers.
  - **`provider:getPlanLimits`:** `PlanLimitsStore.applyLoadFailure()` (`plan-limits.store.ts:298-303`) sets `loadError = true` and installs an empty placeholder (`generatedAt: 0`), showing **"Usage / Unavailable"** in plan-limit cards/strips until a later push or manual refresh.
  - **`harness:get-install-migration-notice`:** Notice silently treats timeout as `null` and retries on `INSTALL_MIGRATION_NOTICE_RECHECK_MS` (`2s, 5s, 10s, ...`), delaying display of a pending migration notice (self-recovers once main unblocks).

---

## 4. Recent Git History (`git log --oneline -15`)

### `boot-rpc.handlers.ts` & `electron-boot-readiness.ts`
```text
6650b5c5a feat(core,shared,electron): track host boot steps and workspace state
4a00d8c74 feat(electron): batch 3 - broadcast boot readiness and back-office activity
```
*(No recent regressions in the handler itself.)*

### `install-scope-notice-rpc.handlers.ts` & `install-scope-migration.service.ts`
```text
# install-scope-notice-rpc.handlers.ts
c2b62f5db feat(shared,rpc-handlers,electron): start install migration on boot
8fd439795 feat(rpc-handlers): add install migration notice RPC and fixtures

# install-scope-migration.service.ts
21d744ab1 fix(rpc-handlers,platform-core,harness-sync): isolate skill store per scope
d720768ec fix(rpc-handlers,vscode-lm-tools): address CodeRabbit round on PR 879
711641e34 fix(rpc-handlers): attach the audit marker to the registry read catch
4e1d36f44 fix(rpc-handlers): keep migration state safe on partial failures
d990147cc fix(harness-sync,rpc-handlers,vscode-lm-tools): address PR review
557eff874 fix(shared,harness-sync,cli-agent-runtime,rpc-handlers,cli): close review gaps
4510058a8 feat(rpc-handlers,agent-generation): migrate legacy installs to workspace
```
*(Note: `c2b62f5db` wired `InstallScopeMigrationService.run()` into `boot-heavy-services.ts` at startup, adding multi-workspace full reconciles — which hit sync fs + `execFileSync` in `gitignore-writer.ts` — directly into the post-window boot window.)*

### `plan-limits-snapshot.service.ts` & `plan-limit-owner-discovery.service.ts`
```text
# plan-limits-snapshot.service.ts
f121bc744 fix(acp-runtime,rpc-handlers,chat): fix Antigravity live-test bugs
d67c5ecdd perf(rpc-handlers): cache complete plan limits snapshots for 30 s
7dc072ef6 perf(task-specs,rpc-handlers,auth-providers): log host load diagnostics
8759077cc fix(rpc-handlers,core): share in-flight session lists and plan limits
f4e2f87ed fix(codex-runtime,agent-sdk,rpc-handlers): price live Codex turns
76c137ee3 feat(dashboard,cli-agent-runtime): numbers-first limits and usage view
63512dbce fix(auth-providers): read live plan limits for codex, opencode and ollama
0b305d45c fix(plan-limits): read real provider limits and redesign the limit cards
e94159db7 fix(auth-providers): key Antigravity owners on the active Google account
a90f7594f feat(rpc-handlers): batch 15 - add plan-limits RPC, snapshot service and push broadcaster

# plan-limit-owner-discovery.service.ts (top 5)
f121bc744 fix(acp-runtime,rpc-handlers,chat): fix Antigravity live-test bugs
0e771df05 fix(auth-providers,cli-agent-runtime): per-source Claude usage proof
dadf66285 fix(auth-providers,cli-agent-runtime): named Claude account plan and usage
cafb70221 feat(auth-providers,cli-agent-runtime): read kimi code plan usage
200077ef1 feat(cli-agent-runtime): read lane plan owner from its own route
```
*(Note: `provider-rpc.handlers.ts` had 15 recent commits, all for model-list/Antigravity/Kimi/Codex catalog changes, none altering `registerPlanLimits()`. In `f121bc744` (Nov 22, 2026), `PlanLimitsSnapshotService.sessionOwners()` was extended with `providerSessionExecution` metadata lookups that run sequentially after `deadlineAt`.)*

### Related Startup-Freeze Context Commits
```text
4edf19bf5 fix(review-runs-ui): stop review reads timing out during startup  (Nov 23, 2026)
549e1c2d5 fix(task-specs,persistence-sqlite,rpc-handlers): cut startup main-loop load  (Nov 10, 2026)
260cd2d63 fix(core,chat): cut sync state IPC reads that freeze the renderer  (Nov 10, 2026)
```

---

## 5. Recommended Fixes

1. **Remove synchronous main-loop blockers on the startup path (P0 — root cause):**
   - Replace `execFileSync('git', ['ls-files', ...])` in `libs/backend/harness-sync/src/lib/gitignore/gitignore-writer.ts:484` with async `execFile` / `IProcessSpawner`.
   - Defer `InstallScopeMigrationService.run()` (`apps/ptah-electron/src/activation/boot-heavy-services.ts:268`) until after boot settles / `BackgroundWorkGovernor` clears (the notice component already re-checks over 5 minutes).
   - Offload or chunk with event-loop yields the full-workspace `better-sqlite3` `task_specs` replacement transaction (`libs/backend/task-specs/src/lib/task-index.store.ts`, per `TASK_2026_923_481f`), and check Electron main-process `ptah-hang.log` / `[event-loop] lag` output to verify no additional synchronous stall remains during startup.

2. **Prevent overlapping `boot:getReadiness` timeout storms (P1):**
   - In `libs/frontend/core/src/lib/services/boot-status.service.ts:246-270, 332-338`, guard `pullReadiness()` with an in-flight flag (or use chained `setTimeout` after settlement instead of `setInterval`) so slow/stalled replies never pile up every 2 s.
   - Increase `READINESS_PULL_TIMEOUT_MS` (`:76`) from `5_000` ms to `15_000` ms (consistent with commit `4edf19bf5`) so brief startup stalls do not log false timeouts.

3. **Keep `provider:getPlanLimits` comfortably inside the 30 s client budget (P1):**
   - In `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts:97, 267-282, 372-409`, move `sessionOwners()` inside the `deadlineAt` budget (parallelize `metadata.get()` and cap by remaining budget) and reduce `SNAPSHOT_BUDGET_MS` from `24_000` ms to ~`18_000`–`20_000` ms so transient startup lag does not trigger client-side RPC timeouts.
