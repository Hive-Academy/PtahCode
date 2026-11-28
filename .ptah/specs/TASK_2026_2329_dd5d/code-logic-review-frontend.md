# Code-Logic Review — TASK_2026_2329_dd5d (Frontend Slice)

- **Reviewer**: Independent Code-Logic Reviewer (`same-family built-in subagent — weaker-evidence fallback because ptah_agent_spawn is unavailable in this session`)
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-setup-wizard-nav-skill-review-0acbb324f0de`
- **Verdict**: **REVISE** (`2` Blocking, `2` Serious, `1` Moderate, `2` Minor)

---

## 1. Scope & Evidence

### Inspected Source Files (Read in Full + Diff vs `main`)
1. `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts`
2. `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts`
3. `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts`
4. `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts`
5. `libs/frontend/onboarding/src/lib/home/resume-banner.component.ts`
6. `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts`
7. `libs/frontend/onboarding/src/lib/home/analysis-found-card.component.ts`
8. `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
9. `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts`
10. `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts`
11. `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts`
12. `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts`
13. `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts`
14. `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts`

### Supporting Contracts & Specs Verified
- `libs/shared/src/lib/types/rpc/rpc-setup.types.ts`, `libs/shared/src/lib/types/wizard/steps.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (diff + `registerDeepAnalyze` / `registerGetResumableRun`)
- `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts` (diff)
- `libs/frontend/setup-wizard/src/lib/services/setup-wizard-state.service.ts`, `wizard-rpc.service.ts`, `setup-wizard/wizard-phase-analysis.ts`, `setup-wizard/wizard-message-dispatcher.ts`, `setup-wizard/wizard-analysis-state.ts`
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.html`, `skill-selection-rail.component.ts`, `skill-not-judged-row.component.ts`, `shared/run-status-chip.component.ts`, `shell/onboarding-shell.component.ts`, `shell/workspace-header.component.ts`
- Specs inspected: `wizard-analysis-runner.service.spec.ts`, `analyze-workspace.page.spec.ts`, `onboarding-workspace.store.spec.ts`, `stack-skill-review.component.spec.ts`

### Independent Checks Run in Worktree
| Check | Scope | Exit Code | Result |
| --- | --- | --- | --- |
| Jest (`setup-wizard`) | `wizard-analysis-runner.service.spec.ts` | `0` | 1 suite, 24/24 passed |
| Jest (`chat-ui`) | `setup-status.store.spec.ts`, `skill-sh-browser.component.spec.ts` | `0` | 2 suites, 44/44 passed |
| Jest (`onboarding`) | All 11 affected spec suites | `0` | 11 suites, 184/184 passed |
| ESLint | All 14 modified frontend source files | `0` | 0 errors, 40 warnings (pre-existing conventions; 0 unjustified suppressions) |
| TypeScript (`tsc --noEmit`) | `setup-wizard`, `chat-ui`, `onboarding` `tsconfig.lib.json` | `0` | 0 errors |

*Note on test coverage*: Passing unit tests in `analyze-workspace.page.spec.ts` and `wizard-analysis-runner.service.spec.ts` did **not** catch Blocking Findings #1 and #2 because the page spec mocked `getResumableRun` without `analysisActive: true` on remount and mocked `WizardAnalysisRunner`, while the runner spec manually invoked `runner.syncBackendActive(false)` right before resolving `deepAnalyze`.

---

## 2. Five Logic Answers

1. **Where can failure look like success?**
   - **Blocking #1**: When a user navigates back to `/onboarding/analyze` mid-run, `ngOnInit()` calls `runner.syncBackendActive(true, ...)` while `_isRunning()` is already `true`. When `runner.run()` subsequently completes (or fails), its `finally` block clears `_isRunning`, `_startedAt`, and `_activeWorkspacePath`, leaving `_backendActive === true`. The page never leaves `"Analyzing workspace"`, and because `_activeWorkspacePath` was nulled while `_backendActive` stayed `true`, `isRunningForWorkspace(anyPath)` now returns `true` for every workspace.
   - **Blocking #2**: After a webview reload while an analysis is running on the backend, `syncBackendActive(true, ...)` sets `_backendActive = true`, but **no production code path anywhere in `libs/` ever calls `syncBackendActive(false)`** and the backend never broadcasts `setup-wizard:analysis-complete`. When the backend finishes, the UI stays permanently stuck in `"Running"` / `"Analyzing workspace"`.
   - **Serious #2**: Clicking `"Continue previous run"` (`continuePrevious()`) when `wizardState.multiPhaseResult()` holds a `paused` (non-failed, non-completed) manifest silently returns immediately from `WizardAnalysisRunner.run()` because `if (existingMultiPhase) return;` short-circuits without calling `wizardRpc.deepAnalyze({ resume: true })`.

2. **What user action surprises?**
   - **Navigating Home -> View -> waiting for completion** (the core bugfix flow): locks the page permanently in `"Analyzing workspace"` and disables `"Use"` on all saved analyses across all workspaces (Blocking #1).
   - **Switching from Workspace A (active analysis) to Workspace B and waiting**: when Workspace A completes or fails, Workspace B's `/onboarding/analyze` page suddenly renders Workspace A's `"Analysis complete"` (with Workspace A's phase markdown and `"Review skills"` slug) or Workspace A's `"Analysis failed"` panel (Serious #1).
   - **Toggling a high-download skill in Review Skills**: newly selected skills append to the bottom of the selection rail in toggle insertion order rather than download-count order (Moderate #1).
   - **Clicking Back on `AnalyzeSkillsPage` after entering via `?run=`**: drops the loaded analysis context because `back()` checks only `?analysis=` (Minor #1).

3. **What input returns a wrong answer?**
   - `WizardAnalysisRunner.isRunningForWorkspace(otherWorkspacePath)` after `syncBackendActive(true)` + `run()` `finally`: `_activeWorkspacePath` becomes `null` while `_backendActive` remains `true`, causing `isRunningForWorkspace('/unrelated/repo')` to return `true` (Blocking #1).
   - `WizardGetResumableRunResponse { analysisActive: false, analysis: null, generation: null }` after a post-reload run completes: `OnboardingResumeStore.refresh()` and `AnalyzeWorkspacePage.ngOnInit()` ignore `analysisActive: false` instead of calling `syncBackendActive(false)`, leaving `runner.isRunning() === true` (Blocking #2).
   - `StackSkillReviewComponent.selectedSkills` with non-judged `selectedIds` or post-toggle selections returns insertion order rather than descending `installs` order (Moderate #1).
   - Negative, `NaN`, or `Infinity` `installs` values are handled accurately (`normalizeInstalls` / `normalizeInstallCount` clamp to `0`, deterministic lexical tie-breakers `skillId`, `source`, `name`).

4. **What happens when a dependency fails, times out or returns malformed data?**
   - `SetupStatusStore.toScanFacts()` validates `wizard:list-analyses` with Zod (`ListAnalysesScanSchema`) and returns `null` (setting `scanError`) on malformed payloads while keeping legacy entries (`lifecycle === undefined`) valid and excluding `isActive: true` or non-`completed` runs. Verified safe.
   - `OnboardingResumeStore.refresh()` catches `getResumableRun` and `getBoundRunState` errors with `degradation-audit` comments and preserves independently discovered items.
   - `AnalysisFoundCardComponent` catches `getAnalysisStatus` failures and shows a retry alert.
   - `AnalyzeWorkspacePage` catches `loadSaved`, `useSaved`, `refreshSetupModel`, `useWorkspaceModel`, and `stop` failures cleanly with fixed copy.
   - `SkillShBrowserComponent` catches search/popular/recommended/install/uninstall failures with fixed copy or warning logs and `this.destroyed` guards.

5. **What requirement is missing?**
   - **Active-run completion after back-and-forth navigation AND post-reload hydration** is broken because `_backendActive` is never cleared on `run()` settlement or on `analysisActive: false`, and there is no post-reload completion watcher/join path (Blocking #1, Blocking #2).
   - **Workspace isolation on workspace switch while running** is incomplete because `multiPhaseResult` and `runner.errorMessage` are not workspace-scoped, allowing completed/failed runs from Workspace A to bleed into Workspace B (Serious #1).
   - **Selection rail download-count ordering** is only sorted for initial judged preselection, not after user toggles or in non-judged mode (Moderate #1).

---

## 3. Five Style & Architecture Answers

1. **What breaks in six months?**
   - Keeping `_isRunning` (frontend-owned promise) and `_backendActive` (hydrated flag) as independent booleans whose cleanup paths diverge (`run()` `finally` only resets `_isRunning`, while `syncBackendActive(true)` sets `_backendActive` unconditionally) is fragile and already caused Blocking #1.
2. **What might a new maintainer misread?**
   - `OnboardingWorkspaceStore.hasLiveAnalysis(priorPath, nextPath)` (`onboarding-workspace.store.ts:60-74`) checks `isRunningForWorkspace(priorPath) || isRunningForWorkspace(nextPath)` and then unconditionally falls through to `return this.runner.isRunning() || this.runner.isCanceling()`, making the workspace-specific `if` block misleading dead logic.
3. **Maintenance cost**
   - `compareByInstallsDesc` (`skill-sh-browser.component.ts:74-88`) and `compareSkillsByInstallsDesc` (`stack-coverage.ts:176-193`) duplicate the same comparator logic across `chat-ui` and `onboarding` (and across backend services); a shared helper in `@ptah-extension/shared` would keep tie-breaker semantics aligned.
4. **Inconsistency with local patterns**
   - `OnboardingWorkspaceStore` constructor `effect()` (`onboarding-workspace.store.ts:47-57`) reads runner signals inside `hasLiveAnalysis` without `untracked()`, and `AnalyzeWorkspacePage` constructor `effect()` (`analyze-workspace.page.ts:729-740`) reads `this.store.loaded()` without `untracked()`, unlike `OnboardingHomeComponent` (`onboarding-home.component.ts:445`) which properly isolates read/write side effects in `untracked()`.
5. **What alternative structure would be clearer?**
   - Model `WizardAnalysisRunner` active state as a single discriminated state (e.g. `'idle' | 'local-running' | 'backend-hydrated' | 'canceling'`) paired with `activeWorkspacePath`, `resultWorkspacePath`, and an owned cleanup/polling lifecycle for `'backend-hydrated'`, so `'local-running'` can never be poisoned by `'backend-hydrated'` and completion always transitions cleanly to `'idle'`.

---

## 4. Findings

### Blocking

#### [B1] Returning to `/onboarding/analyze` mid-run permanently latches `_backendActive = true`, hanging completion and leaking active state to every workspace
- **Locations**:
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:765-771`
  - `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:124-126, 149-161, 183, 410-416`
- **Verified Fact (Trace)**:
  1. User starts analysis on `/onboarding/analyze` (`runner._isRunning = true`, `_backendActive = false`, `_activeWorkspacePath = '/ws-a'`).
  2. User navigates to `/onboarding` and clicks `View` to return to `/onboarding/analyze` while the analysis is still running.
  3. `AnalyzeWorkspacePage.ngOnInit()` enters `if (this.isAnalysisActive())` (line 745), then continues to line 765 and calls `await this.rpc.getResumableRun()`.
  4. The backend returns `{ analysisActive: true, activeAnalysisStartedAt: '...' }` (`setup-rpc.handlers.ts:721-729`).
  5. Line 768 unconditionally calls `this.runner.syncBackendActive?.(true, ...)` (missing a `!this.runner.isRunning()` guard). `syncBackendActive` sets `this._backendActive.set(true)` (`wizard-analysis-runner.service.ts:183`).
  6. When `wizardRpc.deepAnalyze` settles, `WizardAnalysisRunner.run()`'s `finally` block (`wizard-analysis-runner.service.ts:410-416`) executes:
     ```ts
     this._isRunning.set(false);
     this._startedAt.set(null);
     this._activeWorkspacePath.set(null);
     ```
     It **never clears `this._backendActive`**!
  7. Because `isRunning = computed(() => this._isRunning() || this._backendActive())` (`wizard-analysis-runner.service.ts:124-126`), `runner.isRunning()` remains `true` permanently. Even worse, because `_activeWorkspacePath` was reset to `null` while `_backendActive` stayed `true`, `isRunningForWorkspace(anyPath)` hits `if (activePath === null) return true` (`wizard-analysis-runner.service.ts:155-158`) and returns `true` for **every workspace**.
  8. Even if `finally` cleared `_backendActive`, a race where `getResumableRun()` resolves with `analysisActive: true` 1ms *after* `run()` finishes would still re-arm `_backendActive = true`.
- **Impact**: Breaks the primary back-and-forth navigation bugfix scenario. After navigating Home -> View, the analysis **never** transitions to `"Analysis complete"`, `loadSaved()` never refreshes, Saved analyses `Use` buttons stay disabled, Home keeps showing `"Workspace analysis in progress"` (`Running`), and switching to any other workspace falsely reports an active analysis there too.
- **Concrete Fix**:
  1. In `WizardAnalysisRunner.syncBackendActive(true, ...)` (`wizard-analysis-runner.service.ts:183`), return early (do not set `_backendActive = true`) when `this._isRunning()` is already `true`.
  2. In `WizardAnalysisRunner.run()` `finally` (`wizard-analysis-runner.service.ts:410-416`), also clear `this._backendActive.set(false)`.
  3. In `AnalyzeWorkspacePage.ngOnInit()` (`analyze-workspace.page.ts:745-789`), if the page mounted while `this.isAnalysisActive()` was already `true` (local run already attached), skip calling `syncBackendActive(true)` from `getResumableRun()` (or capture a run generation/completion guard so a stale `getResumableRun()` response from before completion can never re-arm `_backendActive`).
  4. Add regression tests covering: (a) `AnalyzeWorkspacePage` remount when `getResumableRun()` returns `analysisActive: true` followed by real `WizardAnalysisRunner` completion transitioning to `"Analysis complete"` and refreshing `loadSaved()`; (b) `WizardAnalysisRunner` `syncBackendActive(true)` while `run()` is in flight followed by `deepAnalyze` resolving without a manual `syncBackendActive(false)` call.

#### [B2] Post-reload `backendActive` hydration has no exit path — UI stays stuck in `Running` forever after the backend finishes
- **Locations**:
  - `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:111, 167-200, 292-295, 307-325`
  - `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts:133-138`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:765-789`
- **Verified Fact**:
  - Grep across all of `libs/` confirms:
    1. **Zero** production call sites call `syncBackendActive(false)` (only unit tests do).
    2. Backend `MultiPhaseAnalysisService` / `SetupRpcHandlers` emit **no** `setup-wizard:analysis-complete` broadcast message when an analysis finishes.
  - Trace after a webview reload while an analysis is executing on the backend:
    1. `OnboardingResumeStore.refresh()` (`onboarding-resume.store.ts:134`) or `AnalyzeWorkspacePage.ngOnInit()` (`analyze-workspace.page.ts:768`) or `WizardAnalysisRunner.discoverResumableRun()` (`wizard-analysis-runner.service.ts:320`) calls `syncBackendActive(true, ...)`, setting `_backendActive = true`.
    2. While the user remains on `/onboarding/analyze`, nothing polls `getResumableRun()` or joins the backend run, so the UI stays on `"Analyzing workspace"` indefinitely after the backend finishes.
    3. Even when the user navigates back to `/onboarding` or re-opens `/onboarding/analyze` *after* the backend run finishes (`getResumableRun()` returns `{ analysisActive: false, ... }`), neither `OnboardingResumeStore.refresh()` (lines 133-138) nor `AnalyzeWorkspacePage.ngOnInit()` (lines 783-789) calls `this.runner.syncBackendActive(false)`.
    4. `_backendActive` remains `true` forever until the user clicks Stop or restarts the app.
- **Impact**: Any webview reload during an active analysis permanently traps `/onboarding` in a `"Running"` banner, hides `Re-run` on `AnalysisFoundCard`, disables `"Use"` on saved analyses, and traps `/onboarding/analyze` in `"Analyzing workspace"` even after the analysis completes.
- **Concrete Fix**:
  1. In both `OnboardingResumeStore.refresh()` (`onboarding-resume.store.ts:133-138`) and `AnalyzeWorkspacePage.ngOnInit()` (`analyze-workspace.page.ts:783-789`), when `latest?.analysisActive === false` (or `resumable.analysisActive === false`), call `this.runner.syncBackendActive?.(false)` (only when `isRunningForWorkspace(root)` or matching the hydrated workspace, and `syncBackendActive(false)` already preserves `_isRunning()` if a local run is active).
  2. In `WizardAnalysisRunner`, while `_backendActive()` is `true` and `_isRunning()` is `false`, run a bounded completion watcher (e.g., polling `wizardRpc.getResumableRun()` every ~2–3s, stopped immediately on `analysisActive !== true`, `reset()`, `cancel()`, or `run()` start — or emit a backend completion event / join-only RPC). When `analysisActive` turns `false`, call `syncBackendActive(false)` and adopt any newly completed analysis or let `AnalyzeWorkspacePage`'s `isAnalysisRunning()` `true -> false` effect refresh `loadSaved()` and transition out of `"Analyzing workspace"`. *(Avoid blindly calling `deepAnalyze()` without a join-only backend mode, as a race immediately after completion would launch a duplicate analysis.)*
  3. Add regression tests for `OnboardingResumeStore`, `AnalyzeWorkspacePage`, and `WizardAnalysisRunner` verifying that `backendActive` clears to `false` when the backend transitions from `analysisActive: true` to `analysisActive: false`.

---

### Serious

#### [S1] Cross-workspace result and error bleed when switching workspaces during an active analysis or after a failed analysis
- **Locations**:
  - `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts:47-74`
  - `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:396-415`
  - `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts:68-70, 123-126`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:643-652`
- **Verified Fact**:
  - When switching from Workspace A (active analysis) to Workspace B, `OnboardingWorkspaceStore` skips `this.wizard.reset()` (`onboarding-workspace.store.ts:53-55`).
  - Neither `SetupWizardStateService.multiPhaseResult` nor `WizardAnalysisRunner.errorMessage` records or checks which workspace produced it:
    1. When Workspace A's run completes while the user is in Workspace B, `runner.run()` writes Workspace A's result to `wizardState.setMultiPhaseResult(multiPhaseResult)` (`wizard-analysis-runner.service.ts:398`). `AnalysisStepStore.completedLiveResult()` (`analysis-step.store.ts:123-126`) exposes it unconditionally, so Workspace B's `/onboarding/analyze` page displays `"Analysis complete"` with **Workspace A's** phase contents and navigates to `/onboarding/analyze/skills?analysis=<workspace-A-slug>`.
    2. When Workspace A's run fails while the user is in Workspace B — or even after an **idle** switch from Workspace A (failed) to Workspace B (`OnboardingWorkspaceStore` calls `wizard.reset()` but never `runner.reset()`) — `AnalyzeWorkspacePage.analysisError` (`analyze-workspace.page.ts:643-652`) reads `this.runner.errorMessage()` and `this.wizardState.multiPhaseResult()` without workspace scoping, showing Workspace A's failure panel on Workspace B.
  - Additionally, `OnboardingWorkspaceStore` reads runner signals inside `effect()` without `untracked()` (`onboarding-workspace.store.ts:53`), and `hasLiveAnalysis()` line 73 makes the `priorPath`/`nextPath` check on lines 65-72 dead whenever any run is active.
- **Impact**: Wrong workspace analysis data or error states surface in another workspace; clicking `"Review skills"` attempts to load Workspace A's slug in Workspace B.
- **Concrete Fix**:
  1. Track the normalized workspace path of the last completed/failed run on `WizardAnalysisRunner` (e.g., `lastRunWorkspacePath` / `isResultForWorkspace(path)`), and gate both `AnalysisStepStore.completedLiveResult()` (taking or reading the active workspace path) and `AnalyzeWorkspacePage.analysisError` so live results and errors are only surfaced for the matching workspace.
  2. On idle workspace switches in `OnboardingWorkspaceStore` (`!hasLiveAnalysis`), also clear stale runner state (`this.runner?.reset()` when idle), wrap the `hasLiveAnalysis`/reset calls in `untracked()`, and simplify `hasLiveAnalysis()` to match its actual intent without dead branches.

#### [S2] `continuePrevious()` / `WizardAnalysisRunner.resumeAnalysis()` silently no-ops when `wizardState.multiPhaseResult()` holds a non-completed (`paused`) or stale result
- **Locations**:
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:1001-1003`
  - `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:222-231, 384-390`
- **Verified Fact**:
  - `AnalyzeWorkspacePage.continuePrevious()` only resets `wizardState` if `multiPhaseResult().manifest.lifecycle === 'failed'` (`analyze-workspace.page.ts:1001`).
  - `WizardAnalysisRunner.run()` (`wizard-analysis-runner.service.ts:385-389`) short-circuits unconditionally on `if (this.wizardState.multiPhaseResult()) { this.wizardState.setCurrentStep('analysis'); return; }` even when `resume === true`.
  - If `wizard:deep-analyze` returned a manifest with `lifecycle: 'paused'` (documented in `setup-rpc.handlers.ts:543`) or `wizardState` still holds a result from a previous run, clicking `"Continue previous run"` or `"Retry"` returns immediately without calling `wizardRpc.deepAnalyze({ resume: true })`.
- **Impact**: User clicking `"Continue previous run"` / `"Retry"` gets a silent no-op and cannot resume the paused analysis without clicking `"Start fresh"` (which discards progress).
- **Concrete Fix**:
  1. In `WizardAnalysisRunner.run(resume, workspacePath)` (`wizard-analysis-runner.service.ts:385-389`), only short-circuit on `existingMultiPhase` when `!resume && existingMultiPhase.manifest.lifecycle === 'completed'` (and clear `multiPhaseResult` or bypass the cache on explicit `resumeAnalysis()` / `startFreshAnalysis()`).
  2. In `AnalyzeWorkspacePage.continuePrevious()` (`analyze-workspace.page.ts:1001-1003`), reset `wizardState` whenever `multiPhaseResult()?.manifest.lifecycle !== 'completed'` (or unconditionally before resuming).

---

### Moderate

#### [M1] Selection rail (`selectedSkills`) drops download-count ordering after user toggles or in non-judged mode
- **Location**: `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts:298-315`
- **Verified Fact**:
  - `StackSkillStore.applyRecommendationResult()` sorts the initial preselected candidate IDs by `compareSkillsByInstallsDesc` (`stack-skill.store.ts:608-612`).
  - However, `StackSkillReviewComponent.selectedSkills` (`stack-skill-review.component.ts:298-315`) maps `[...selected]` directly in `Set` insertion order without sorting.
  - When a user selects a high-install skill from `Other candidates`, `Not judged`, or search results (or uses non-judged mode like Team Builder), it renders at the end of the selection rail rather than sorted by download count.
- **Impact**: Inconsistent ordering between the main skill grids (all sorted by `installs` DESC) and the selection rail after interaction or in non-judged mode.
- **Concrete Fix**:
  - Sort the selection rail entries in `selectedSkills` by `compareSkillsByInstallsDesc` using the `skills` lookup map (keeping entries with known metadata ahead of unknown keys, with `key.localeCompare` tie-breaker). Add a spec asserting rail order after toggling a higher-install skill.

---

### Minor

#### [m1] `AnalyzeSkillsPage.back()` drops analysis context when entered via `?run=` instead of `?analysis=`
- **Location**: `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:561-586, 1132-1138`
- **Verified Fact**: `back()` reads only `this.route.snapshot.queryParamMap.get('analysis')`. When the page was loaded through `?run=<runId>` (`loadResumed`), `analysis` is not in the URL even though `this.analysis.selected()` and `this.analysis.loaded()?.manifest.slug` are set.
- **Concrete Fix**: Use `const analysis = this.route.snapshot.queryParamMap.get('analysis') ?? this.analysis.selected() ?? this.analysis.loaded()?.manifest.slug ?? null;`.

#### [m2] Minor hygiene: duplicate download-count comparator, untracked read in `effect()`, and slightly stale elapsed copy
- **Locations**:
  - `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts:74-88` & `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts:176-193` (duplicated `compareByInstallsDesc` / `compareSkillsByInstallsDesc`).
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:732` (`this.store.loaded()` read inside `effect()` without `untracked()`, triggering harmless no-op re-runs when selecting saved analyses).
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:343` (`"{{ elapsedSeconds() }}s since you opened this page"` now measures from `runner.startedAt()`, so `"{{ elapsedSeconds() }}s elapsed"` would be more accurate).

---

## 5. Data Flow, Requirements Fulfillment & Edge Cases

### Download-Count Ordering Audit (Every Visible List)
| Surface / List | File:Line | Sorted `installs` DESC? | Mutates Input? | Memoization / Notes |
| --- | --- | --- | --- | --- |
| Review Skills — `installCards` | `stack-skill-review.component.ts:166-191` | Yes | No (`[...cards.values()]`) | Clean `computed` |
| Review Skills — `residualCards` | `stack-skill-review.component.ts:192-206` | Yes | No (`[...(residualCandidates)]`) | Clean `computed` |
| Review Skills — `row.candidates` | `stack-coverage.ts:533-548` | Yes | No (fresh array) | Covers both Not-judged grid & rejected rows |
| Review Skills — `row.manualCandidates` | `stack-coverage.ts:584-586` & `stack-skill.store.ts:527-549` | Yes | No (`[...combinedManual.values()]`) | Sorted in store and row builder |
| Review Skills — `otherResults` | `stack-skill-review.component.ts:293-297` & `stack-skill.store.ts:512-526` | Yes | No (`.filter().sort()`) | Clean `computed` |
| Review Skills — `filteredRecommendations` | `stack-skill-review.component.ts:282-292` | Yes | No (`[...recommendations()].sort()`) | Clean `computed` |
| Review Skills — `selectedSkills` (rail) | `stack-skill-review.component.ts:298-315` | **Partial** (initial judged only) | No | **See Moderate [M1]** |
| Marketplace — `popularSkills` | `skill-sh-browser.component.ts:627-646, 705` | Yes | No (fresh `entries`) | Also re-sorted on `refreshInstalledStatus` |
| Marketplace — `searchResults` | `skill-sh-browser.component.ts:627-646, 661` | Yes | No (fresh `entries`) | Debounced search, deduped + sorted |
| Marketplace — `recommendedDisplaySkills` | `skill-sh-browser.component.ts:454-467` | Yes | No (fresh `entries`) | Clean `computed` |

### Requirements Fulfillment Matrix
| Requirement | Status | Notes |
| --- | --- | --- |
| Back to `/onboarding` shows `Running` banner (`View`), not `Interrupted` | **Pass** | Reactive via `OnboardingResumeStore.items` + `ResumeBannerComponent` |
| `AnalysisFoundCard` hides `stale (incomplete)` and destructive `Re-run` while active | **Pass** | `visibleStatus` + `View progress` replacement + `rerun()` guard |
| Home tile does not flip to `Workspace analyzed` prematurely | **Pass** | `SetupStatusStore.toScanFacts()` excludes `isActive` and non-`completed` |
| Return to `/onboarding/analyze` preserves stream, phase header, elapsed timer, disables `Use` | **Fail on completion** | Stream/timer/UI re-attach cleanly on entry, **but [B1] permanently latches `_backendActive` so run never completes in UI** |
| Post-reload hydration clears when backend finishes | **Fail** | **See [B2]** — no `syncBackendActive(false)` call site or completion watcher |
| Workspace switch A -> B -> A while running | **Fail (bleed)** | Preserves A's stream, **but [S1] leaks A's completion/failure into B** |
| Cancel (`stop()`) and failed (`lifecycle === 'failed'`) handling | **Partial** | `stop()` and `failed` panel work; `paused` resume no-ops (**[S2]**) |
| `AnalyzeSkillsPage.back()` preserves `?analysis=` | **Pass (with minor gap)** | Preserves `?analysis=`; misses `?run=` fallback (**[m1]**) |
| Skills ordered by download count across Review Skills & Marketplace | **Pass (with moderate gap)** | All grids sorted; selection rail misses post-toggle/non-judged sort (**[M1]**) |

---

## 6. Pattern Compliance (`Angular`, `a11y`, `ui-class-audit`, `degradation-audit`)
- **`ChangeDetectionStrategy.OnPush`**: Present on all modified components (`SkillShBrowserComponent`, `ResumeBannerComponent`, `OnboardingHomeComponent`, `AnalysisFoundCardComponent`, `AnalyzeWorkspacePage`, `AnalyzeSkillsPage`, `StackSkillReviewComponent`).
- **Timer / Listener Cleanup**:
  - `AnalyzeWorkspacePage`: `window` `focus` listener removed via `destroyRef.onDestroy`, `setupAbort` aborted on destroy, `releaseClock()` called in `ngOnDestroy` and `effect()`, `store.detachStream()` called in `ngOnDestroy`. Clean.
  - `SkillShBrowserComponent`: `searchTimeout` cleared in `ngOnDestroy`, `destroyed` flag set via `destroyRef.onDestroy`. Clean.
- **Accessibility (ARIA)**:
  - `ResumeBannerComponent`: dynamic `aria-label` (`Active run in progress` / `Stopping run` / `Continue an interrupted run`), decorative icon `aria-hidden="true"`, native `<button type="button">`. Clean.
  - `AnalysisFoundCardComponent`: native `<button ptahButton type="button">`, error `role="alert"`. Clean.
  - `AnalyzeWorkspacePage`: disabled `Use` buttons during active analysis, `role="alert"` on errors. Clean.
- **`ui-class-audit`**:
  - `ResumeBannerComponent` uses approved Ptah state border tokens (`border-state-run/70`, `border-state-need/70`) and `[ptahSetupAction]="'glass'`.
  - `AnalysisFoundCardComponent` uses `ptahButton` directive. No unapproved raw CSS classes introduced.
- **`degradation-audit`**:
  - All newly added `catch` blocks (`analysis-found-card.component.ts:26`, `analyze-workspace.page.ts:89`, `onboarding-workspace.store.ts:17`) carry explicit `// degradation-audit: optional-capability` annotations. Existing catch blocks in modified files remain properly annotated.

---

## 7. Verdict

**REVISE** — Do not approve until Blocking Findings **[B1]** and **[B2]** (and recommended fixes for Serious Findings **[S1]** and **[S2]**) are resolved and verified with regression tests covering real `WizardAnalysisRunner` completion after remount and post-reload hydration exit.
