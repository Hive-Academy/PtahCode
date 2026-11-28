# Code-Logic Re-Review — TASK_2026_2329_dd5d (Frontend Fix Round 1)

- **Reviewer**: Independent Code-Logic Re-Reviewer (`same-family built-in subagent — weaker-evidence fallback because ptah_agent_spawn is unavailable in this session`)
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`
- **Prior Review**: `code-logic-review-frontend.md`
- **Fix Report**: `fix-round-1-frontend-report.md`
- **Verdict**: **REVISE** (`1` Blocking, `1` Serious, `0` Moderate, `1` Minor — all new regressions in Fix Round 1's backend completion watcher / hydration exit path; plus `1` deferred minor item from `[m2]`)

---

## 1. Scope & Evidence

### Inspected Source & Test Files (Read in Full)
1. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts` + `.spec.ts`
2. `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts` + `.spec.ts`
3. `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` + `.spec.ts` + `analyze-workspace.render.spec.ts`
4. `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts` + `.spec.ts`
5. `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts` + `.spec.ts`
6. `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts` + `.spec.ts`
7. `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts` + `.spec.ts`

### Supporting Contracts Cross-Checked
- `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts` (`getResumableRun()` error-swallowing contract)
- `libs/frontend/setup-wizard/src/lib/services/setup-wizard-state.service.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (`registerGetResumableRun()` workspace lookup & `analysisActive` contract)
- `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts` (`getActiveRun(workspacePath)`)
- `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts`, `analysis-found-card.component.ts`, `shell/onboarding-shell.component.ts`
- `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts`, `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts`

### Independent Checks Run in Worktree
| Check | Scope | Exit Code | Result |
| --- | --- | --- | --- |
| Jest (`setup-wizard`) | `wizard-analysis-runner.service.spec.ts --detectOpenHandles --runInBand` | `0` | 1/1 suite, 29/29 passed, 0 open handles |
| Jest (`onboarding`) | All 7 affected spec suites (`onboarding-resume.store`, `analyze-workspace.page`, `analyze-workspace.render`, `analysis-step.store`, `analyze-skills.page`, `onboarding-workspace.store`, `stack-skill-review.component`) `--detectOpenHandles --runInBand` | `0` | 7/7 suites, 144/144 passed, 0 open handles |
| TypeScript (`tsc --noEmit`) | `libs/frontend/setup-wizard/tsconfig.lib.json`, `libs/frontend/onboarding/tsconfig.lib.json` | `0` | 0 errors |
| ESLint | All 14 modified frontend source and spec files | `0` | 0 errors, 33 pre-existing warnings, 0 unjustified suppressions |

*Note on test coverage*: Passing unit tests missed New Findings **[N1]** and **[N2]** because (a) no test switches workspaces while `WizardAnalysisRunner`'s backend watcher timer is active, and (b) `wizard-analysis-runner.service.spec.ts:652` mocked `mockRpcService.getResumableRun.mockRejectedValue(...)`, whereas the real `WizardRpcService.getResumableRun()` never rejects and instead returns `{ analysis: null, generation: null }` (`analysisActive: undefined`).

---

## 2. Prior Findings Disposition Table

| ID | Prior Severity | Status | Evidence (`file:line`) | Notes |
| --- | --- | --- | --- | --- |
| **B1** | Blocking | **Fixed** | `wizard-analysis-runner.service.ts:224-227, 522-526, 566-573`; `analyze-workspace.page.ts:757-760, 783-804`; `wizard-analysis-runner.service.spec.ts:575-599`; `analyze-workspace.page.spec.ts:1213-1393` | `syncBackendActive(true)` returns early when `_isRunning()` is true; `run()` `finally` clears `_backendActive`, stops watcher, and bumps `runGeneration`; `AnalyzeWorkspacePage.ngOnInit()` snapshots `hadLocalRun` / `initialRunGeneration` / `hadResult` / `hadLoaded` before `await` and guards against stale `getResumableRun()` replies. Verified with real-runner integration test. |
| **B2** | Blocking | **Fixed** *(introduces new regressions **[N1]** & **[N2]**)* | `wizard-analysis-runner.service.ts:95-96, 120-124, 163-165, 244-337`; `onboarding-resume.store.ts:138-147`; `analyze-workspace.page.ts:805-813`; `wizard-analysis-runner.service.spec.ts:601-670`; `onboarding-resume.store.spec.ts:218-251`; `analyze-workspace.page.spec.ts:1395-1426` | Same-workspace post-reload completion watcher (`2500ms` chained `setTimeout`, `DestroyRef.onDestroy()` + `reset()` + `cancel()` + `run()` cleanup, 0 open handles) and `syncBackendActive(false)` exit paths exist and pass in single-workspace healthy-IPC flows. However, the new watcher introduces cross-workspace corruption (**[N1]**) and transient-RPC false-clear (**[N2]**). |
| **S1** | Serious | **Fixed** *(for local runs; cross-workspace bleed reintroduced in backend watcher — see **[N1]**)* | `wizard-analysis-runner.service.ts:130, 148-149, 192-201, 511, 551, 561`; `analysis-step.store.ts:62, 124-140`; `analyze-workspace.page.ts:643-658, 729-732`; `onboarding-workspace.store.ts:53-87`; `analysis-step.store.spec.ts:112-147`; `analyze-workspace.page.spec.ts:1428-1467`; `onboarding-workspace.store.spec.ts:113-169` | Local run results and errors are now scoped via `resultWorkspacePath` / `isResultForWorkspace(...)`; `AnalysisStepStore.completedLiveResult()` and `AnalyzeWorkspacePage.analysisError` check workspace match; `OnboardingWorkspaceStore` wraps effect in `untracked()`, simplifies `hasLiveAnalysis()`, and resets idle `runner` on workspace switch. |
| **S2** | Serious | **Fixed** | `wizard-analysis-runner.service.ts:359-368, 516-542`; `analyze-workspace.page.ts:1027-1045`; `wizard-analysis-runner.service.spec.ts:695-714`; `analyze-workspace.page.spec.ts:1469-1486` | `resumeAnalysis()` and `startFreshAnalysis()` pass `allowCachedResult = false`; `ensureStarted()` only reuses `undefined`/`completed` manifests; `continuePrevious()` resets `wizardState` whenever `existingResult.manifest.lifecycle !== 'completed'`. |
| **M1** | Moderate | **Fixed** | `stack-skill-review.component.ts:298-326`; `stack-skill-review.component.spec.ts:965-1056` | `selectedSkills` copies `[...selected]` and sorts by `compareSkillsByInstallsDesc`, placing known skills before unknown keys (`localeCompare` tie-breaker). Covered in both judged post-toggle and non-judged modes. |
| **m1** | Minor | **Fixed** | `analyze-skills.page.ts:1132-1142`; `analyze-skills.page.spec.ts:2242-2312` | `back()` falls back from `queryParamMap.get('analysis')` to `this.analysis.selected() ?? this.analysis.loaded()?.manifest.slug ?? null`. |
| **m2** | Minor | **Open** *(2/3 fixed; 1 deferred)* | Fixed: `analyze-workspace.page.ts:343` (`{{ elapsedSeconds() }}s elapsed`) & `742-749` (`untracked()`). Deferred: `skill-sh-browser.component.ts:79-88` & `stack-coverage.ts:181-193` | Untracked `store.loaded()` read and elapsed copy are fixed. Cross-library comparator deduplication (`skill-sh-browser.component.ts` vs `stack-coverage.ts`) remains deferred outside Fix Round 1's write set (non-blocking). |

---

## 3. New Findings Introduced in Fix Round 1

### Blocking

#### [N1] Backend completion watcher (`pollBackendActive`) polls the current backend workspace without checking whether the user switched workspaces — clearing Workspace A's active run and stamping Workspace B's analysis as Workspace A's result
- **Locations**:
  - `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:274-312`
  - `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:395-401`
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:681-780`
  - `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts:213-230`
- **Verified Fact (Exact Trace)**:
  1. After a webview reload on Workspace A (`/ws-a`) while Workspace A's analysis is running on the backend, `syncBackendActive(true, { workspacePath: '/ws-a', startedAt })` sets `_backendActive = true`, `_activeWorkspacePath = '/ws-a'`, and schedules the 2500ms watcher timer (`wizard-analysis-runner.service.ts:229-244, 268-271`).
  2. The user switches workspaces to Workspace B (`/ws-b`). `OnboardingWorkspaceStore` (`onboarding-workspace.store.ts:64`) calls `hasLiveAnalysis('/ws-a', '/ws-b')` → `true`, so it preserves `runner` (and the running watcher timer). `OnboardingResumeStore.refresh()` (`onboarding-resume.store.ts:141`) guards against clearing Workspace A while on Workspace B. Meanwhile, the backend switches `workspaceProvider.getWorkspaceRoot()` to `'/ws-b'`.
  3. Within 2.5 seconds, `WizardAnalysisRunner.pollBackendActive()` fires (`wizard-analysis-runner.service.ts:284-309`):
     - `watchedWorkspace = this._activeWorkspacePath()` → `'/ws-a'`.
     - It calls `await this.wizardRpc.getResumableRun()`, which sends `{}` with **no** `workspacePath` (`wizard-rpc.service.ts:397-401`).
     - Backend `registerGetResumableRun()` (`setup-rpc.handlers.ts:681`) reads `workspaceRoot = this.workspaceProvider.getWorkspaceRoot()` → **`'/ws-b'`**.
     - `this.getActiveAnalysisRun('/ws-b')` (`multi-phase-analysis.service.ts:218-223`) returns **`null`** because the active run belongs to `'/ws-a'`.
     - Backend returns Workspace B's latest persisted analysis (if any) with `analysisActive: false`.
  4. `pollBackendActive()` hits `if (resumable.analysisActive !== true)` (`wizard-analysis-runner.service.ts:296`):
     - **Active-run loss**: Line `307` calls `this.syncBackendActive(false)`, destroying Workspace A's active-run state while Workspace A is still executing on the backend.
     - **Cross-workspace data corruption**: Because `wizardState.multiPhaseResult()` is `null` after a reload, if Workspace B has a `completed` or `failed` analysis returned by `findLatestResumableRun('/ws-b')`, lines `304-305` write **Workspace B's analysis** into `wizardState.setMultiPhaseResult(analysis)` and tag `_resultWorkspacePath` as **`'/ws-a'`**!
- **Impact**: 100% reproducible in Electron whenever the user switches workspaces for >2.5s after a post-reload active-run hydration. Breaks active-run tracking for Workspace A and can cross-contaminate Workspace A with Workspace B's completed/failed analysis.
- **Concrete Fix**:
  1. Make `WizardAnalysisRunner` aware of the currently active frontend workspace (e.g., via `setCurrentWorkspacePath(path)` synced from `OnboardingWorkspaceStore` and/or optional `ElectronLayoutService`/`VSCodeService` fallback in `setup-wizard`), and guard `pollBackendActive()` both **before** and **after** `await this.wizardRpc.getResumableRun()`:
     - If `watchedWorkspace !== null` and the current workspace is known and differs from `watchedWorkspace` (or changed while the RPC was in flight), do **not** call `getResumableRun()` / do **not** adopt `resumable.analysis` or call `syncBackendActive(false)`; pause polling until the active workspace matches `watchedWorkspace` again (or re-schedule / resume when returning to `watchedWorkspace`).
  2. As defense-in-depth before adopting `resumable.analysis` at lines `298-306`, verify that when `watchedWorkspace !== null` and `analysis.analysisDir` is present, the normalized `analysisDir` is located under `watchedWorkspace` (e.g., starts with `${watchedWorkspace}/` or `${watchedWorkspace}\\`).
  3. Add a regression test in `wizard-analysis-runner.service.spec.ts` verifying that when the active workspace switches from `/repo/a` to `/repo/b` while `backendActive` is true for `/repo/a`, the watcher does not clear `/repo/a`'s `backendActive` and never adopts `/repo/b`'s analysis under `/repo/a`, and resumes polling once back on `/repo/a`.

---

### Serious

#### [N2] `WizardRpcService.getResumableRun()` swallows errors and returns `analysisActive: undefined`, causing all three `backendActive` exit checks to falsely clear active runs on a single transient RPC failure (and rendering `MAX_BACKEND_POLL_ERRORS` dead code in production)
- **Locations**:
  - `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:395-418`
  - `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:296-327`
  - `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts:138-147`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:805-813`
- **Verified Fact**:
  - Real `WizardRpcService.getResumableRun()` (`wizard-rpc.service.ts:395-418`) wraps the RPC in `try/catch` and **never rejects**; on any RPC error or timeout it returns `{ analysis: null, generation: null }` (where `analysisActive` is `undefined`).
  - Meanwhile, real backend `registerGetResumableRun()` (`setup-rpc.handlers.ts:675-679, 701-708, 736-743, 771-780`) **always** returns an explicit boolean `analysisActive: true` or `analysisActive: false`.
  - All three frontend exit paths treat `analysisActive === undefined` as "not active":
    1. `WizardAnalysisRunner.pollBackendActive()` (`wizard-analysis-runner.service.ts:296`): `if (resumable.analysisActive !== true)` matches `undefined`, immediately calling `this.syncBackendActive(false)` (line 307) on the **first** transient RPC failure instead of entering the `catch` retry path (lines 312-327). Thus `MAX_BACKEND_POLL_ERRORS = 5` is unreachable in production!
    2. `OnboardingResumeStore.refresh()` (`onboarding-resume.store.ts:140-146`): `latest.analysisActive !== true && ... && this.runner.backendActive?.() === true` clears `syncBackendActive(false)` when `getResumableRun()` returns the error fallback `{ analysis: null, generation: null }`.
    3. `AnalyzeWorkspacePage.ngOnInit()` (`analyze-workspace.page.ts:805-813`): the `else` branch checks `this.runner.backendActive?.() === true` without requiring `resumable.analysisActive === false`, so an error fallback clears `syncBackendActive(false)`.
- **Impact**: Any single transient IPC hiccup or 10s RPC timeout during a post-reload active analysis immediately clears `backendActive`, dropping the `"Analyzing workspace"` / `"Running"` UI and re-enabling destructive `Re-run` and `Use` actions while the backend analysis is still running.
- **Concrete Fix**:
  1. In `WizardAnalysisRunner.pollBackendActive()` (`wizard-analysis-runner.service.ts:296-311`):
     - Only adopt completion and call `this.syncBackendActive(false)` when `resumable.analysisActive === false`.
     - When `resumable.analysisActive === undefined` (the `WizardRpcService.getResumableRun()` failure fallback), treat it as a poll error: increment `this.backendWatcherErrors`, stop the watcher once `>= MAX_BACKEND_POLL_ERRORS`, otherwise schedule the next tick.
  2. In `OnboardingResumeStore.refresh()` (`onboarding-resume.store.ts:138-147`) and `AnalyzeWorkspacePage.ngOnInit()` (`analyze-workspace.page.ts:805-813`), require explicit `analysisActive === false` before calling `this.runner.syncBackendActive?.(false)`.
  3. Add regression tests passing `{ analysis: null, generation: null }` (without `analysisActive`, matching `WizardRpcService.getResumableRun()`'s real fallback) to verify `backendActive` is NOT cleared on a single transient fallback and that `pollBackendActive()` bounds consecutive `undefined` responses to 5 attempts.

---

### Minor

#### [N3] Three-workspace switch (`A -> B -> C`) while Workspace A is running resets `SetupWizardStateService` even though `WizardAnalysisRunner` is kept alive
- **Location**: `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts:64-69`
- **Verified Fact**:
  - When Workspace A has a live analysis and the user switches `A -> B`, `hasLiveAnalysis('/ws-a', '/ws-b')` returns `true` and preserves both `wizard` and `runner`.
  - If the user then switches `B -> C` while A is still running, `hasLiveAnalysis('/ws-b', '/ws-c')` returns `false`. Line `66` guards `this.runner?.reset?.()` with `if (!this.runner?.isRunning() && !this.runner?.isCanceling())`, but line `65` still calls `this.wizard.reset()`, wiping Workspace A's live stream and phase statuses while its analysis is still executing.
- **Concrete Fix**: Gate `this.wizard.reset()` with the same `!this.runner?.isRunning() && !this.runner?.isCanceling()` guard (or have `hasLiveAnalysis()` return `this.runner.isRunning() || this.runner.isCanceling()` since `SetupWizardStateService` is a singleton and `AnalysisStepStore` + `AnalyzeWorkspacePage` already scope results/errors by workspace).

---

## 4. Five Logic Answers (Re-Review Delta)

1. **Where can failure look like success?**
   - **[N1]**: Switching from Workspace A (post-reload active analysis) to Workspace B causes `pollBackendActive()` to treat Workspace B's `{ analysisActive: false, analysis: <wsBCompleted> }` as Workspace A completing successfully.
   - **[N2]**: A single transient RPC error from `WizardRpcService.getResumableRun()` returns `{ analysis: null, generation: null }` (`analysisActive: undefined`), which all three exit checks treat as "backend analysis finished".
2. **What user action surprises?**
   - Switching to Workspace B for >2.5s after a reload while Workspace A is analyzing clears Workspace A's `"Running"` state and can show Workspace B's analysis under Workspace A (**[N1]**).
   - Hopping across three workspaces `A -> B -> C -> A` during a live run clears Workspace A's accumulated stream log (**[N3]**).
3. **What input returns a wrong answer?**
   - `WizardRpcService.getResumableRun()` fallback `{ analysis: null, generation: null }` (`analysisActive: undefined`) causes `pollBackendActive()`, `OnboardingResumeStore.refresh()`, and `AnalyzeWorkspacePage.ngOnInit()` to call `syncBackendActive(false)` (**[N2]**).
   - `pollBackendActive()` querying `getResumableRun()` while the backend active workspace is `/ws-b` returns `/ws-b`'s status/analysis and attributes it to `/ws-a` (**[N1]**).
4. **What happens when a dependency fails, times out or returns malformed data?**
   - Because `WizardRpcService.getResumableRun()` swallows failures into `{ analysis: null, generation: null }`, `pollBackendActive()`'s `catch` retry handler never executes against the real service (**[N2]**).
   - All other failure paths (`loadSaved`, `useSaved`, `cancel`, `refreshSetupModel`, `continuePrevious`) remain properly guarded.
5. **What requirement is missing?**
   - Workspace-aware polling and result validation in `WizardAnalysisRunner`'s backend completion watcher (**[N1]**), plus explicit `analysisActive === false` checks so transient RPC failures do not falsely clear `backendActive` (**[N2]**).

---

## 5. Five Style & Architecture Answers (Re-Review Delta)

1. **What breaks in six months?**
   - Any future caller of `getResumableRun()` assuming it rejects on error will repeat **[N2]**, because `WizardRpcService.getResumableRun()` silently converts errors into `{ analysis: null, generation: null }` (indistinguishable from a legacy backend response without `analysisActive`).
2. **What might a new maintainer misread?**
   - `pollBackendActive()`'s `try { ... } catch { this.backendWatcherErrors++ ... }` looks like real retry logic, but against `WizardRpcService.getResumableRun()` the `catch` branch is effectively dead code (**[N2]**).
   - `OnboardingWorkspaceStore` lines `64-69` look like they protect active runs on switch, yet `this.wizard.reset()` executes outside the `if (!this.runner?.isRunning() && !this.runner?.isCanceling())` guard (**[N3]**).
3. **Maintenance cost**
   - Low once **[N1]** and **[N2]** are resolved; `DestroyRef` cleanup, timer chaining (`setTimeout` rather than `setInterval`), monotonic `backendWatcherToken`, and `untracked()` usage in effects are clean and leak-free.
4. **Inconsistency with local patterns**
   - `OnboardingResumeStore` (`onboarding-resume.store.ts:141`) carefully checks `isRunnerActiveFor(root)` before clearing `backendActive`, whereas `WizardAnalysisRunner.pollBackendActive()` ignores the active workspace entirely (**[N1]**).
5. **What alternative structure would be clearer?**
   - Track `currentWorkspacePath` on `WizardAnalysisRunner` (updated by `OnboardingWorkspaceStore` / `AnalyzeWorkspacePage`, falling back to `ElectronLayoutService`/`VSCodeService`), pause/skip polling whenever `currentWorkspacePath !== activeWorkspacePath`, and check `resumable.analysisActive === false` explicitly (treating `undefined` as a poll error).

---

## 6. Timer / Effect / Pattern Compliance Check (Fix Round 1 Delta)

- **Timer Leaks & `DestroyRef` Cleanup**: Verified clean. `WizardAnalysisRunner` chains `setTimeout` (no overlapping polls), clears `backendWatcherTimer` and bumps `backendWatcherToken` in `stopBackendWatcher()`, invoked from `destroyRef?.onDestroy()`, `syncBackendActive(false)`, `reset()`, `cancel()`, and `run()` start + `finally`. `--detectOpenHandles` passed with 0 open handles.
- **Signal Updates in `effect()`**: `OnboardingWorkspaceStore` (line 58) and `AnalyzeWorkspacePage` (lines 731, 742) properly wrap side effects and reads in `untracked()`. No infinite effect loops observed.
- **Lint & Types**: 0 ESLint errors, 0 unjustified suppressions, 0 TypeScript errors across `setup-wizard` and `onboarding` `tsconfig.lib.json`.

---

## 7. Verdict

**REVISE** — All 6 core prior findings (`B1`, `B2` same-workspace exit, `S1` local-run scoping, `S2`, `M1`, `m1`) and 2/3 of `m2` were verified fixed with solid regression tests. However, Fix Round 1's new backend completion watcher introduced **1 Blocking** finding (**[N1]**: workspace switch during post-reload backend watcher clears Workspace A's active run and can attribute Workspace B's analysis to Workspace A) and **1 Serious** finding (**[N2]**: `WizardRpcService.getResumableRun()` returns `analysisActive: undefined` on RPC errors, bypassing the 5-error retry bound and clearing `backendActive` on a single transient failure). Resolve **[N1]** and **[N2]** (and optionally **[N3]**) with regression tests before approval.
