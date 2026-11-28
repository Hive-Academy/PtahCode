# Code-Logic Re-Review 2 (Final) — TASK_2026_2329_dd5d (Frontend Fix Round 2)

- **Reviewer**: Independent Code-Logic Re-Reviewer (`same-family built-in subagent — weaker-evidence fallback because ptah_agent_spawn is unavailable in this session`)
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`
- **Prior Re-Review**: `code-logic-review-frontend-rereview.md`
- **Fix Report**: `fix-round-2-frontend-report.md`
- **Verdict**: **APPROVED** (`0` Blocking, `0` Serious, `0` Moderate, `0` new Minor findings; 1 non-blocking style/redundancy observation noted under Maintenance Debt)

---

## 1. Scope & Evidence

### Inspected Source & Test Files (Read in Full)
1. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts` + `.spec.ts`
2. `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts` + `.spec.ts`
3. `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` + `.spec.ts`
4. `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts` + `.spec.ts`

### Supporting Files Cross-Checked
- `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts` (root instantiation of `OnboardingWorkspaceStore`, `readyForActivePath()` gating)
- `libs/frontend/onboarding/src/lib/shell/onboarding-shell.component.ts`
- Global grep across `libs/` and `apps/` for all `syncBackendActive` and `setCurrentWorkspacePath` callers

### Independent Checks Run in Worktree
| Check | Scope | Exit Code | Result |
| --- | --- | --- | --- |
| Jest (`setup-wizard`) | `wizard-analysis-runner.service.spec.ts --detectOpenHandles --runInBand` | `0` | 1/1 suite, 32/32 passed, 0 open handles |
| Jest (`onboarding`) | `onboarding-resume.store.spec.ts`, `analyze-workspace.page.spec.ts`, `analyze-workspace.render.spec.ts`, `analysis-step.store.spec.ts`, `onboarding-workspace.store.spec.ts` (`--runInBand --detectOpenHandles`) | `0` | 5/5 suites, 79/79 passed, 0 open handles |
| TypeScript (`tsc --noEmit`) | `libs/frontend/setup-wizard/tsconfig.lib.json`, `libs/frontend/onboarding/tsconfig.lib.json` | `0` | 0 errors |
| ESLint | All 8 modified frontend source and spec files | `0` | 0 errors, 16 pre-existing warnings, 0 new warnings, 0 unjustified suppressions |

---

## 2. Prior Findings Disposition Table (`[N1]`–`[N3]`)

| ID | Prior Severity | Status | Evidence (`file:line`) | Notes |
| --- | --- | --- | --- | --- |
| **[N1]** | Blocking | **Fixed** | `wizard-analysis-runner.service.ts:81-106, 157, 243-265, 308-323, 354-417`; `onboarding-workspace.store.ts:56, 61`; `analyze-workspace.page.ts:733, 759`; `wizard-analysis-runner.service.spec.ts:676-780`; `onboarding-workspace.store.spec.ts:171-226` | `WizardAnalysisRunner` tracks `currentWorkspacePath` via `setCurrentWorkspacePath()` synced from root `OnboardingWorkspaceStore` (constructor + `untracked()` effect) and `AnalyzeWorkspacePage` (`effect()` + `ngOnInit()`). Switching away from `activeWorkspacePath` pauses polling via `stopBackendWatcher()` without clearing `_backendActive` and bumps `backendWatcherToken` (invalidating any in-flight poll, including rapid `A -> B -> A` ABA switches). `syncBackendActive(true)` only starts the watcher when `isWatcherAllowedForCurrentWorkspace()` holds. `pollBackendActive()` verifies workspace match before and after `await wizardRpc.getResumableRun()`, and `isPathWithinWorkspace()` enforces slash-normalized, Windows-drive-case-insensitive, prefix-safe containment of `analysis.analysisDir` before adopting a completed/failed analysis. Regression tests verify both cross-workspace pause/resume + stale in-flight discard and foreign `analysisDir` (`/repo/ab/...` vs `/repo/a`) rejection with 0 open handles. |
| **[N2]** | Serious | **Fixed** | `wizard-analysis-runner.service.ts:392-443`; `onboarding-resume.store.ts:138-145`; `analyze-workspace.page.ts:810-817`; `wizard-analysis-runner.service.spec.ts:782-836`; `onboarding-resume.store.spec.ts:253-280`; `analyze-workspace.page.spec.ts:1428-1462` | All three exit paths now require explicit `analysisActive === false` before clearing `backendActive`. In `pollBackendActive()`, `analysisActive === true` resets `backendWatcherErrors` and re-schedules, `analysisActive === false` adopts validated completion and calls `syncBackendActive(false)`, and `analysisActive === undefined` (the real `WizardRpcService.getResumableRun()` RPC error fallback `{ analysis: null, generation: null }`) routes to `handleBackendPollError()`, retrying up to `MAX_BACKEND_POLL_ERRORS` (5) and then stopping the timer cleanly without clearing `_backendActive`. Regression tests across all 3 units pass the real `{ analysis: null, generation: null }` fallback shape and confirm `backendActive` is preserved and bounded to 5 polls. |
| **[N3]** | Minor | **Fixed** | `onboarding-workspace.store.ts:66-71`; `onboarding-workspace.store.spec.ts:171-226` | `this.wizard.reset()` is now inside the `if (!this.runner?.isRunning() && !this.runner?.isCanceling())` guard alongside `this.runner?.reset?.()`. Switching `A -> B -> C -> A` while Workspace A is running/canceling preserves A's `SetupWizardStateService` stream and phase state, while idle switches and runner-less test harnesses (`!undefined && !undefined === true`) still reset `wizard`. Verified by dedicated `A -> B -> C -> A` regression test. |

---

## 3. New Findings

None (`0` Blocking, `0` Serious, `0` Moderate, `0` Minor).

---

## 4. Five Logic Answers (Fix Round 2 Verification)

1. **Where can failure look like success?**
   - Verified closed: `WizardRpcService.getResumableRun()`'s silent failure fallback `{ analysis: null, generation: null }` (`analysisActive === undefined`) is no longer treated as completion in `pollBackendActive()`, `OnboardingResumeStore.refresh()`, or `AnalyzeWorkspacePage.ngOnInit()`. Cross-workspace `{ analysisActive: false, analysis: <wsB> }` replies are paused/discarded via `currentWorkspacePath`, monotonic `backendWatcherToken`, and `isPathWithinWorkspace()`.
2. **What user action surprises?**
   - Switching `A -> B`, `A -> B -> A` rapidly during an in-flight poll, or `A -> B -> C -> A` during a live/reloaded analysis now preserves Workspace A's active run and stream log, pauses polling while on other workspaces, and resumes cleanly when returning to A.
3. **What input returns a wrong answer?**
   - Prefix-collision paths (e.g. `/repo/ab/.ptah/analysis/...` vs `/repo/a`) are rejected by `isPathWithinWorkspace()`; trailing slashes and Windows drive letter casing are normalized; `analysisActive: undefined` routes to bounded retry rather than false completion.
4. **What happens when a dependency fails, times out or returns malformed data?**
   - Both rejected promises and `WizardRpcService`'s swallowed `{ analysis: null, generation: null }` fallback funnel through `handleBackendPollError()`, stopping the watcher timer cleanly at 5 consecutive errors without falsely clearing `_backendActive` or leaking timers.
5. **What requirement is missing?**
   - None within the frontend scope of `TASK_2026_2329_dd5d`.

---

## 5. Five Style & Architecture Answers (Fix Round 2 Verification)

1. **What breaks in six months?**
   - Low risk. If a future Electron workspace switch path is added outside `OnboardingWorkspaceStore`, keeping `setCurrentWorkspacePath` wired from `OnboardingWorkspaceStore`'s root effect (which tracks `ElectronLayoutService.activeWorkspace()`) covers all switches automatically once onboarding has been opened.
2. **What might a new maintainer misread?**
   - In `onboarding-workspace.store.ts:66-70`, the outer `if (!this.hasLiveAnalysis(prior, path))` is now logically subsumed by the inner `if (!this.runner?.isRunning() && !this.runner?.isCanceling())` (since `hasLiveAnalysis` is only `true` when `isRunning()` or `isCanceling()` is `true`). Harmless, but could be flattened in future cleanup.
3. **Maintenance cost**
   - Low. `handleBackendPollError()`, `isWatcherAllowedForCurrentWorkspace()`, and `isPathWithinWorkspace()` are small, pure/focused helpers with clear invariants and explicit comments explaining the `WizardRpcService` error-swallowing contract.
4. **Inconsistency with local patterns**
   - None. All `effect()` blocks wrap external writes in `untracked()`; `DestroyRef` cleanup and `--detectOpenHandles` verification match repository norms.
5. **What alternative structure would be clearer?**
   - None required for this task; the current fix is minimal, well-encapsulated, and strictly within the allowed frontend boundaries.

---

## 6. Timer, Concurrency & Remaining Uncertainty Check

- **Timer leaks**: Verified clean. `setTimeout` is chained (never `setInterval`), nulled before awaiting, and cleared in `stopBackendWatcher()` across all exit paths (`DestroyRef.onDestroy`, `setCurrentWorkspacePath` pause, `syncBackendActive(false)`, `reset()`, `cancel()`, `run()` start + `finally`, and 5-error cap). Both Jest runs passed `--detectOpenHandles` with 0 open handles.
- **Cross-workspace races**: Verified closed across `A -> B`, `A -> B -> A` mid-RPC, `A -> B -> C -> A`, and foreign `analysisDir` injection.
- **Remaining uncertainty**:
  1. In Electron, if a backend workspace switch back from `B -> A` ever takes longer than `BACKEND_POLL_INTERVAL_MS` (2.5s) while `layout.workspaceSwitchPending()` is still `true`, the first resumed poll could hit the backend before it switches roots (defense-in-depth `isPathWithinWorkspace` still blocks adopting B's analysis, though `analysisActive: false` from B could clear `backendActive` in that >2.5s stall window). Normal Electron switches complete in milliseconds.
  2. Live Electron runtime / visual E2E verification was not run in this code-logic re-review (unit/component specs + `tsc` + `eslint` were run directly in the worktree).

---

## 7. Verdict

**APPROVED** — `[N1]` (Blocking), `[N2]` (Serious), and `[N3]` (Minor) are all genuinely fixed with solid, contract-faithful regression tests, zero timer leaks, zero cross-workspace races, zero TypeScript/ESLint errors, and zero new regressions (`0` blocking, `0` serious).
