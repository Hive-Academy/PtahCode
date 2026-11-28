# Code Logic Review — Batch 18A (`TASK_2026_2330_2fc3`)

Review family: antigravity (read-only logic review of Codex Batch 18A implementation)
Worktree: `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs`
Scope: Uncommitted changes in `libs/frontend/setup-wizard/**`, `libs/frontend/onboarding/src/lib/{analyze,home,shell}/**`, and `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (21 files), plus read-only compatibility check of `normalizeSetupWorkspacePath` callers in `libs/frontend/onboarding/src/lib/proposal/**` (Batch 18B).

---

## Summary

| Metric | Value |
| --- | --- |
| Overall score | **6/10** |
| Verdict | **REVISE** |
| Blocking issues | 1 |
| Serious issues | 2 |
| Moderate issues | 2 |
| Minor issues | 1 |
| Failure modes found | 5 |

**Band rationale:** **6/10 — REVISE** (real gaps). Batch 18A solidly closes the POSIX logic behind Phase C F1–F4, F7–F8, and Batch 17b M1–M2 with sensitive frontend specs, keeps Batch 18B's `normalizeSetupWorkspacePath` callers intact, preserves pre-18A persisted records on upgrade, and passes all 643 focused Jest tests, all 3 library TypeScript checks, and ESLint with zero errors. However, it cannot be approved yet because: (1) M4's change to fold Windows paths to lowercase forward-slash (`c:/work/repo`) breaks raw `===`/`!==` comparisons against backend `realpath`-canonicalized bindings (`C:\Work\Repo`) in `AgentGenerationRunPage`, `ProjectGuidancePage`, `GenerationStepStore`, and `OnboardingFocusRouter`, silently blanking both live generation transcripts and breaking agent result counts/retry on Windows; (2) `SetupRunAnalysisCoordinator.recoverSaved` introduces an unsuppressed `empty-catch` block that violates the repository's `degradation-audit` gate; and (3) the new backend `loadByRunId` fallback in `wizard:load-analysis` has zero unit tests (and `libs/backend/rpc-handlers` was not tested in the implementation run). This sits above 3–4 because the underlying fixes are sound and every remaining defect admits a small, localized patch.

---

## Targeted Fix Verification Matrix

| Item | Status | Evidence & Regression Sensitivity |
| --- | --- | --- |
| **Phase C F1** (analysis deadlock across workspace switch / reload) | **PARTIAL** (core fixed; `degradation-audit` violation & resumed `analyzedAt` edge case) | `setup-run-analysis.coordinator.ts:28-179`, `setup-run.store.ts:196, 206, 561`, `wizard-analysis-runner.service.ts:264-286`: `runnerSeen` Map settles originating workspace records across workspace switches; `analysisActive === false` recovers saved result or marks `interrupted` while `analysisActive === undefined` (RPC failure) preserves `running`; `analysisActive === true` hydrates `runner.syncBackendActive(true)` without mounting `AnalyzeWorkspacePage`. Specs (`setup-run.store.spec.ts:328-453`) fail on old code. **Gaps:** unsuppressed `empty-catch` at `setup-run-analysis.coordinator.ts:212` (Finding 2); `manifest.analyzedAt` vs `updatedAt` on resumed analysis without `backendRunId` (Finding 6). |
| **Phase C F2** (phantom `project-guidance` record from Skills) | **FIXED** | `analyze-skills.page.ts:1332-1367` completes `skill-review`, reopens an existing live guidance record if present, and otherwise navigates to `/onboarding/analyze/guidance?analysis=<runId>` without calling `setupRuns.start('project-guidance', ...)`. `project-guidance.page.ts:674-692, 857-881` links the new guidance record to the completed `skill-review` when the user clicks Start. Specs (`analyze-skills.page.spec.ts:451-476`, `project-guidance.page.spec.ts:271-293`) fail on old code. |
| **Phase C F3** (five `analyze/skills` return routes, Back link, backend fallback) | **PARTIAL** (frontend & backend logic fixed; missing backend tests) | `analyze-skills.page.ts:586-604` resolves `routedReview` for any workspace record (`agent-generation`, `project-guidance`, `skill-review`, `analysis`) or recordless matching run ID; `agent-generation-run.page.ts:185-193, 228-233` and `analyze-done.page.ts:258-268` preserve `tab` + `analysisRunId`; `analyze-workspace.page.ts:1071-1076, 1289-1312` drops the recordless runId forward link and resolves run-ID Back links via `store.useAnalysis`; `analysis-step.store.ts:199` stores `result.manifest.slug ?? slug`. Backend `setup-rpc.handlers.ts:978-994` authorizes workspace first (`:955-971`), blocks traversal/separators/dots (`params.filename !== filename \|\| !/^[a-z0-9_-]{1,200}$/i.test(filename)`), and delegates to exact-match `AnalysisStorageService.loadByRunId` (`analysis-storage.service.ts:829-837, 909-939`). Frontend specs fail on old code. **Gap:** zero backend tests in `setup-rpc.handlers.spec.ts` (Finding 3). |
| **Phase C F4** (`ProjectGuidancePage` workspace reactivity & stale actions) | **PARTIAL** (effect & main actions fixed; `stop`/`refresh`/`retryLookup`/`openLatest` unguarded pre-flush) | `project-guidance.page.ts:560-569, 617-644, 887-963` reacts to `runs.workspacePath()`, releases & unbinds prior binding, clears `detectedStack`/`lookupPending`/`lookupError`, sets `workspace-mismatch` for foreign `?tab=`, and guards `start`, `retry`, `followWorkflowBinding`, `setEnabled`, `refreshSaved`, `loadContent`, and `download`. Spec (`project-guidance.page.spec.ts:251-269`) fails on old code. **Gap:** template `(stop)="workflow.stop()"` (`:209, :220`) and `retryLookup`/`refresh`/`openLatest` lack `hasWorkspaceBinding()` (Finding 4). |
| **Phase C F7** (`SetupRunStore.rerun` copying old `analysisRunId`) | **FIXED** | `setup-run.store.ts:498-499` sets `analysisRunId: previous.workflow === 'analysis' ? null : previous.analysisRunId`. Spec (`setup-run.store.spec.ts:1054-1068`) fails on old code. |
| **Phase C F8** (failed analysis view + `"skills installed"` copy) | **PARTIAL** (both fixed; saved-analysis view blocked on `?tab=<failedId>` & `safeFailureCopy` bypass) | `setup-runs-list.component.ts:77` + spec `:463` fixed (`skill`/`skills`). `analyze-workspace.page.ts:691-699, 1042-1051` + spec `:1605-1641` shows targeted failed record even with newer results. **Gap:** `analysisError` blocks selecting saved analyses when `tab=<failedId>` stays in the URL, and `safeError` bypasses `safeFailureCopy` for `localStorage`-persisted `record.error` (Finding 5). |
| **17b M1** (`AnalyzeSkillsPage` cancel on workspace switch / destroy) | **FIXED** (for Analyze Skills; `proposal/` is 18B) | `analyze-skills.page.ts:526, 536-539, 576, 1237-1238, 1257, 1297, 1301-1310` retains `installRunId`, sends `wizard:cancel-skill-install` once on workspace/run change or destroy, and ignores late replies. Parameterized spec (`analyze-skills.page.spec.ts:863-909`) fails on old code. |
| **17b M2** (`AnalyzeSkillsPage` confirmed `installed` names + specs) | **FIXED** | `analyze-skills.page.ts:1266-1288` validates `Array.isArray(installed)`, includes `Installed skills: ...` alongside `failedSkill`/`reason` on failure or cancellation, and stays on `review`. Parameterized spec (`analyze-skills.page.spec.ts:824-861`) covers selection-save failure (no `failedSkill`) and `cancelled: true` and fails on old code. |
| **17b M4** (`normalizeSetupWorkspacePath` Windows folding & upgrade safety) | **BROKEN ON WINDOWS CONSUMERS** (normalizer & upgrade hydration work; breaks 4 downstream Windows consumers) | `setup-run-persistence.ts:122-133` canonicalizes `\` -> `/`, folds drive/UNC case, preserves drive root (`d:/`) and POSIX case; `readSetupRunIndex` (`:306, :313-316`) normalizes both old keys (`C:\Work\Repo`, `C:`) and record paths on read so existing persisted records hydrate and match; Batch 18B's `proposal/` callers (`team-builder-run.coordinator.ts:144-147, 579-622`, `team-builder-start.page.ts:51-55, 104, 858`) only compare/index normalized values and keep raw paths for RPCs. **Blocking regression:** breaks raw `===`/`!==` comparisons against backend `realpath` bindings (`C:\Work\Repo`) in `AgentGenerationRunPage`, `ProjectGuidancePage`, `GenerationStepStore`, and `OnboardingFocusRouter` (Finding 1); also lacks a legacy Windows hydration test (Finding 6). |

---

## Numbered Findings

### 1. [Blocking] M4 Windows path folding (`c:/work/repo`) breaks raw `workspacePath` comparisons against backend canonical bindings (`C:\Work\Repo`) across four onboarding consumers

- **Files:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts:122-133`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-binding.ts:29-39`
  - `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-binding.ts:226-249`
  - `libs/backend/rpc-handlers/src/lib/handlers/enhanced-prompts-rpc.handlers.ts:668-671, 962, 977`
  - `libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts:272, 302, 442`
  - `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:434`
  - `libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts:127`
  - `libs/frontend/onboarding/src/lib/focus/onboarding-focus-router.service.ts:30-32`
- **Scenario:**
  - On Windows (`C:\Work\Repo`), `normalizeSetupWorkspacePath('C:\\Work\\Repo')` now returns `'c:/work/repo'`. `SetupRunStore` stores `'c:/work/repo'` on `record.workspacePath`, and `bindingOf(record)` sends `{ workspacePath: 'c:/work/repo' }` to the backend.
  - Backend `authorizeTabWorkspace` (`wizard-generation-binding.ts:232-240`) resolves `host = await fsPromises.realpath(hostRoot)` -> `'C:\\Work\\Repo'` (native Windows drive case and backslashes) and stamps every `SetupGenerationRunState.binding.workspacePath` and every pushed `generation-stream` / `enhance-stream` `tabBinding.workspacePath` with `'C:\\Work\\Repo'`.
  - While `SetupRunBoundCoordinator`, `GenerationWorkflowStore`, and `GuidanceGenerationStore` use `matchesBinding()` (which normalizes both sides), four onboarding consumers compare `record.workspacePath` / `binding.workspacePath` (`'c:/work/repo'`) against backend-returned `'C:\\Work\\Repo'` with **raw `===`/`!==`** (or pass `'c:/work/repo'` directly to `workspaceCoordinator.switchWorkspace`):
    1. `AgentGenerationRunPage.run` (`agent-generation-run.page.ts:272`): `run.binding.workspacePath === record.workspacePath` is always `false` on Windows -> `run()` is always `null`, rendering `"Result counts are unavailable."`, omitting source status and failure errors, and permanently disabling `"Retry failed items"` (`:146, :412`).
    2. `AgentGenerationRunPage.transcript` (`agent-generation-run.page.ts:302`): `source.workspacePath !== record.workspacePath` is always `true` -> every `generationStream()` event is silently dropped; the live transcript stays blank (`"Waiting for generation output…"`).
    3. `AgentGenerationRunPage.retryFailedItems` (`agent-generation-run.page.ts:442`): `result.binding.workspacePath === binding.workspacePath` is always `false` -> retrying failed items can never confirm checkpoint completion.
    4. `ProjectGuidancePage.transcript` (`project-guidance.page.ts:434`): `source.workspacePath !== record.workspacePath` is always `true` -> every `enhanceStream()` event is silently dropped; the live guidance transcript stays blank (`"No output yet."`).
    5. `GenerationStepStore.readGuidanceSections` (`generation-step.store.ts:127`): `run.binding.workspacePath === binding.workspacePath` is always `false` -> returns `'stale'`, so generated guidance section counts never render on Windows.
    6. `OnboardingFocusRouter.focus` (`onboarding-focus-router.service.ts:31`): passes normalized `'c:/work/repo'` to `workspaceCoordinator.switchWorkspace(...)`, which keys `TabWorkspacePartitionService._workspaceTabSets` (`tab-workspace-partition.service.ts:102, 226`) by raw string rather than normalized path, creating a mismatched empty tab partition instead of activating `'C:\\Work\\Repo'`.
- **Impact:** Direct regression introduced by Batch 18A's M4 change (previously `normalizeSetupWorkspacePath('C:\\Work\\Repo')` returned `'C:\\Work\\Repo'`, matching `realpath`). On every Windows workspace, live generation and guidance transcripts are silently empty, agent generation results/counts/retry are broken, guidance section summaries disappear, and cross-workspace notification focus activates a wrong partition key.
- **Fix:**
  1. Compare workspace paths through `normalizeSetupWorkspacePath(left) === normalizeSetupWorkspacePath(right)` (or a shared `sameSetupWorkspacePath` helper exported from `@ptah-extension/setup-wizard`) at `agent-generation-run.page.ts:272, 302, 442`, `project-guidance.page.ts:434`, and `generation-step.store.ts:127`, and add Windows-path unit tests (`record.workspacePath = 'c:/work/repo'` vs backend `'C:\\Work\\Repo'`).
  2. In `OnboardingFocusRouter.focus` (`onboarding-focus-router.service.ts:31`), resolve the matching open workspace folder's raw path (e.g., via `ElectronLayoutService.workspaceFolders()` compared with `normalizeSetupWorkspacePath`) before calling `workspaceCoordinator.switchWorkspace(...)`, or verify `switchWorkspace` normalizes keys.

---

### 2. [Serious] Unsuppressed `empty-catch` in `SetupRunAnalysisCoordinator.recoverSaved` violates the repository `degradation-audit` gate

- **File:** `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts:212-214`
- **Scenario:**
  ```ts
    } catch {
      // Backend inactivity is confirmed; the run can be retried if its result cannot be read.
    }
  ```
  `tools/degradation-audit/check-degradation.ts:11, 73, 102-107` flags any zero-statement `catch` block (`empty-catch`) lacking a valid `// degradation-audit: <optional-capability|reported> - <reason>` marker, and `batches.md:31` requires every swallowed RPC failure to carry a `degradation-audit:` comment.
- **Impact:** Fails the repository's `degradation-audit` check (`npm run verify` / CI ratchet) and silently turns a transient `listAnalyses` / `loadAnalysis` failure after confirmed backend inactivity into `status: 'interrupted'` without a suppression marker.
- **Fix:** Add an explicit `// degradation-audit: optional-capability - ...` (or `reported`) suppression comment with a clear justification on line 213 — or, if transient read failures should preserve retryability without losing a completed result, distinguish RPC failure from "no matching completed analysis".

---

### 3. [Serious] New backend manifest-ID fallback in `wizard:load-analysis` has zero unit tests

- **Files:**
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:978-994`
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts:2037-2117` (untouched)
- **Scenario:** Batch 18A added a `loadByRunId` fallback inside `wizard:load-analysis` with traversal and regex guards (`params.filename !== filename || !/^[a-z0-9_-]{1,200}$/i.test(filename)`), but added no tests in `setup-rpc.handlers.spec.ts` and did not run `libs/backend/rpc-handlers` Jest or `tsc` in `impl-report-batch18a.md`. The existing failure test at `setup-rpc.handlers.spec.ts:2064-2077` only passes because its mock omits `loadByRunId` (throwing `TypeError: storageService.loadByRunId is not a function`, caught by the outer `catch`).
- **Impact:** Security boundary and fallback behavior in `wizard:load-analysis` have zero regression coverage; reverting the fallback or relaxing the traversal guard would not fail any backend test.
- **Fix:** Add unit tests under `describe('wizard:load-analysis')` in `setup-rpc.handlers.spec.ts` covering: (1) manifest run-ID fallback loads via `loadByRunId(workspaceRoot, runId)` when `loadMultiPhase` rejects; (2) traversal/separator/dot inputs (`../run-1`, `dir/run-1`, `run.1`) reject without calling `loadByRunId`; (3) `loadByRunId` returning `null` maps to `ANALYSIS_LOAD_FAILED`; (4) unauthorized `workspacePath` rejects with `UNAUTHORIZED_WORKSPACE` before `loadByRunId`.

---

### 4. [Moderate] `ProjectGuidancePage` leaves `workflow.stop()`, `retryLookup()`, `refresh()`, and bound `openLatest()` unguarded against a pre-flush workspace switch

- **File:** `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:209, 220, 787-796, 810-817, 818-841`
- **Scenario:** `ProjectGuidancePage` added `hasWorkspaceBinding()` guards for `retry`, `setEnabled`, `refreshSaved`, `loadContent`, and `download` (explicitly tested before `fixture.detectChanges()` at `project-guidance.page.spec.ts:256-258`). However:
  - Template lines `:209` (`(stop)="workflow.stop()"`) and `:220` (`(click)="workflow.stop()"`) invoke `workflow.stop()` directly, bypassing `hasWorkspaceBinding()`.
  - `retryLookup()` (`:787-796`), `refresh()` (`:810-817`), and the bound branch of `openLatest()` (`:819-840`) do not check `hasWorkspaceBinding()`.
- **Impact:** Clicking Stop in the window between a workspace switch signal update and Angular's effect flush sends a cancel for Workspace A's guidance run while Workspace B is active; `retryLookup`/`refresh`/`openLatest` can likewise query or mutate Workspace A's binding.
- **Fix:** Route template stop events through `protected stop(): void { if (!this.hasWorkspaceBinding()) return; this.workflow.stop(); }` and guard `retryLookup()`, `refresh()`, and the bound `openLatest()` branch with `hasWorkspaceBinding()`.

---

### 5. [Moderate] `AnalyzeWorkspacePage` failed-record override blocks inspecting saved analyses and bypasses `safeFailureCopy` for `localStorage`-persisted `record.error`

- **File:** `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:691-699, 1042-1052, 1078-1104`
- **Scenario:**
  1. When opened via `/onboarding/analyze?tab=<failedId>`, `analysisError()` returns `record.error` at `:691-699` **before** checking `if (this.store.selected()) return null;` (`:708`). Clicking a saved analysis card calls `useSaved(filename)`, which merges `{ analysis: filename }` into query params while preserving `tab=<failedId>`, so `viewState()` stays `'failed'` and the user cannot view any saved analysis from that URL.
  2. `safeError()` (`:1042-1050`) bypasses `safeFailureCopy` whenever `record.error === raw`, rendering arbitrary `ptah.setup-runs.v1` `localStorage` text (up to 500 chars) verbatim instead of filtering through fixed copy.
- **Impact:** Selecting a saved analysis after opening a failed Home row silently appears to do nothing (the failed panel stays pinned), and `safeFailureCopy`'s redaction invariant is weakened for persisted error strings.
- **Fix:** Move `if (this.store.selected()) return null;` ahead of the failed-record check (or clear `tab: null` in `useSaved`), and keep `safeError` backed by fixed/whitelisted copy (e.g., mapping `FAILURE_COPY.analysis` rather than passing arbitrary `record.error` verbatim).

---

### 6. [Minor] `recoverSaved` checks immutable `manifest.analyzedAt` (misses resumed runs without `backendRunId`) and `setup-run-persistence.spec.ts` lacks a Windows legacy-key upgrade test

- **Files:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts:71, 195, 207`
  - `libs/backend/agent-generation/src/lib/services/wizard/analysis-run-checkpoint.ts:177, 333`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts:366-376`
- **Scenario:**
  1. `AnalysisRunCheckpoint` writes `manifest.analyzedAt` once on initial run creation (`:177`) and only updates `manifest.updatedAt` on resume/finish (`:333`). If a resumed analysis whose Setup record has `backendRunId: null` (e.g., created via `continuePrevious()` after clearing `localStorage`) finishes during a renderer reload, `Date.parse(manifest.analyzedAt) >= record.createdAt` is `false`, so `recoverSaved` marks the finished run `interrupted` rather than `completed`.
  2. `readSetupRunIndex` (`setup-run-persistence.ts:306, 313-316`) correctly normalizes pre-18A Windows keys (`"C:\\Work\\Repo"` -> `"c:/work/repo"`, `"C:"` -> `"c:/"`) and record paths on read, but `setup-run-persistence.spec.ts` only tests POSIX trailing-slash merging and has no regression test verifying upgrade hydration of legacy Windows records.
- **Fix:** Add a legacy Windows upgrade hydration spec in `setup-run-persistence.spec.ts` (`"C:\\Work\\Repo"` and `"C:"` buckets/records hydrating and merging with `"c:/work/repo"` / `"c:/"`), and consider comparing `manifest.updatedAt ?? manifest.analyzedAt` in `recoverSaved` when recovering a resumed manifest.

---

## Five Logic Questions

### 1. How does this fail silently?
- **Windows generation & guidance transcripts and result counts (`agent-generation-run.page.ts:272, 302, 442`; `project-guidance.page.ts:434`; `generation-step.store.ts:127`):** After M4 folds Windows `record.workspacePath` to `'c:/work/repo'` while backend `authorizeTabWorkspace` stamps canonical `'C:\\Work\\Repo'`, raw `===`/`!==` comparisons silently drop every stream event, turn `AgentGenerationRunPage.run()` into `null`, and return `'stale'` for guidance section counts (Finding 1).
- **Selecting a saved analysis while viewing a failed Home analysis row (`analyze-workspace.page.ts:691-699, 1078-1104`):** `useSaved()` loads the analysis and updates `?analysis=<slug>`, but `tab=<failedId>` remains in the URL and `analysisError()` keeps `viewState()` pinned to `'failed'`, so clicking a saved analysis appears to do nothing (Finding 5).
- **Transient `listAnalyses`/`loadAnalysis` failure in `recoverSaved` (`setup-run-analysis.coordinator.ts:212-214`):** Caught by an unsuppressed empty `catch {}` and silently settled as `interrupted` (Finding 2).

### 2. What user action produces unexpected behaviour?
- **Opening a running or failed Agent Generation run or running Project Guidance on Windows:** The user sees an empty transcript (`"Waiting for generation output…"` / `"No output yet."`), `"Result counts are unavailable."`, and a disabled `"Retry failed items"` button even while events and results are arriving from the backend (Finding 1).
- **Clicking a saved analysis after opening a `Failed` analysis row from Home (`analyze-workspace.page.ts:691-699`):** The page stays on `"Analysis failed"` instead of showing the selected analysis (Finding 5).
- **Clicking Stop on `ProjectGuidancePage` during a workspace switch before Angular flushes effects (`project-guidance.page.ts:209, 220`):** Calls `workflow.stop()` against the previous workspace's binding (Finding 4).
- **Clicking "Skip skills" / "Continue to Project guidance" on `AnalyzeSkillsPage` (F2), clicking any of the five "Review skills" return links (F3), or switching workspaces during `AnalyzeSkillsPage` skill install (17b M1):** All now behave as expected on POSIX — no phantom guidance record or 7.5 s orphan interruption, all five return links resolve the skill review, and workspace switch / destroy cancels the active skill install with its exact `installRunId`.

### 3. What input data makes this produce a wrong answer rather than an error?
- **Any Windows workspace root (`C:\Work\Repo`, `\\Host\Share\Folder`) passed through `SetupRunStore`:** Normalizes to `'c:/work/repo'` / `'//host/share/folder'`, which disagrees with backend `realpath` `'C:\\Work\\Repo'` in raw-equality consumers (`AgentGenerationRunPage`, `ProjectGuidancePage`, `GenerationStepStore`) and in `OnboardingFocusRouter` -> `TabWorkspacePartitionService` (Finding 1).
- **A resumed analysis manifest completed during reload when the record has `backendRunId: null` (`setup-run-analysis.coordinator.ts:195, 207`):** `manifest.analyzedAt` reflects the original start timestamp (older than the resumed record's `createdAt`), causing `recoverSaved` to classify a completed run as `interrupted` (Finding 6).
- **Path-traversal or malformed `filename` passed to `wizard:load-analysis` (`setup-rpc.handlers.ts:978-994`):** Properly blocked — `params.filename !== path.basename(params.filename)` and `/^[a-z0-9_-]{1,200}$/i` reject separators, `..`, and dots before `loadByRunId`, and `AnalysisStorageService.loadByRunId` matches exact `manifest.runId` only among subdirectories of `<authorizedWorkspace>/.ptah/analysis/` (though currently untested — Finding 3).

### 4. What happens when a dependency fails, times out, or returns a shape it should not?
- **`wizard:get-resumable-run` fails (`analysisActive === undefined`):** `SetupRunAnalysisCoordinator.reconcile` (`:36-91`) skips both the active and inactive branches and preserves the record's `running` status (verified at `setup-run.store.spec.ts:328-332`).
- **`wizard:list-analyses` or `wizard:load-analysis` fails inside `recoverSaved` (`setup-run-analysis.coordinator.ts:185-226`):** Backend inactivity is already confirmed (`analysisActive === false`), so the record is marked `interrupted` (retryable); however, the empty `catch` lacks a `degradation-audit:` comment (Finding 2).
- **`wizard:install-skills-with-consent` returns `success: false` (selection-save failure, no `failedSkill`), `cancelled: true`, or malformed non-array `installed` (`analyze-skills.page.ts:1266-1295`):** Non-array `installed` throws and shows generic retry error; `success: false` / `cancelled: true` preserves `state.installed()`, surfaces `"Installed skills: ..."` + reason in the alert, closes consent, stays on `review`, and never navigates.
- **`wizard:cancel-skill-install` rejects on workspace switch or destroy (`analyze-skills.page.ts:1305-1309`):** Caught with a valid `degradation-audit:` comment; local `installRunId` is cleared upfront and late install replies are ignored by `isCurrent()`.

### 5. What is missing that the requirements never mentioned?
- **Cross-boundary contract for `record.workspacePath` normalization (Finding 1):** Batch 17b Minor 4 asked to align `normalizeSetupWorkspacePath` with Windows separator/case folding, without calling out that `SetupRunStore` stores the normalized value directly on `record.workspacePath` / `binding.workspacePath` while backend `authorizeTabWorkspace` returns raw `fsPromises.realpath` strings — requiring every consumer comparing against backend bindings (or passing `record.workspacePath` into raw-keyed services like `WorkspaceCoordinator.switchWorkspace`) to normalize or resolve the raw folder path.
- **Backend regression specs for the new `wizard:load-analysis` `loadByRunId` fallback (Finding 3)** and **legacy Windows upgrade hydration tests in `setup-run-persistence.spec.ts` (Finding 6).**

---

## Failure Modes

### 1. Windows bound-run transcript & result blackout
- **Trigger:** Running agent generation or project guidance on a Windows workspace (`C:\Work\Repo`).
- **Symptom:** Live transcripts remain blank, `AgentGenerationRunPage` reports `"Result counts are unavailable."` and disables `"Retry failed items"`, and guidance section counts never appear.
- **Evidence:** `setup-run-persistence.ts:127-132`, `wizard-generation-binding.ts:232-240`, `agent-generation-run.page.ts:272, 302, 442`, `project-guidance.page.ts:434`, `generation-step.store.ts:127`.
- **Current handling:** Raw strict string comparison (`===` / `!==`) between `'c:/work/repo'` and `'C:\\Work\\Repo'`.
- **Recommendation:** Normalize both sides with `normalizeSetupWorkspacePath` at all five comparison sites and add Windows-path regression tests.

### 2. Windows notification focus creates wrong tab partition
- **Trigger:** Focusing a background workspace's generation/guidance notification via `OnboardingFocusRouter.focus()` on Windows.
- **Symptom:** `workspaceCoordinator.switchWorkspace('c:/work/repo')` opens a fresh empty partition instead of the existing `'C:\\Work\\Repo'` tab partition.
- **Evidence:** `onboarding-focus-router.service.ts:31`, `tab-workspace-partition.service.ts:102, 226`.
- **Current handling:** Passes normalized `record.workspacePath` directly to `switchWorkspace`.
- **Recommendation:** Resolve the matching open folder's raw path via `normalizeSetupWorkspacePath` before invoking `switchWorkspace`.

### 3. Degradation-audit gate failure in `SetupRunAnalysisCoordinator.recoverSaved`
- **Trigger:** Running `tools/degradation-audit/check-degradation.ts` (or CI verify).
- **Symptom:** Fails with `empty-catch` violation at `setup-run-analysis.coordinator.ts:212`.
- **Evidence:** `setup-run-analysis.coordinator.ts:212-214`, `tools/degradation-audit/check-degradation.ts:11, 73, 102-107`.
- **Current handling:** Plain comment inside empty `catch {}` with no `degradation-audit:` prefix.
- **Recommendation:** Add a properly formatted `// degradation-audit: optional-capability - ...` suppression comment (or handle RPC read failure distinctly).

### 4. Pre-effect-flush Stop on `ProjectGuidancePage` cancels prior workspace run
- **Trigger:** Workspace switches `A -> B` while `ProjectGuidancePage` is open and the user clicks Stop before Angular flushes effects.
- **Symptom:** `workflow.stop()` cancels Workspace A's guidance run.
- **Evidence:** `project-guidance.page.ts:209, 220, 787-841`.
- **Current handling:** Template calls `workflow.stop()` directly without checking `hasWorkspaceBinding()`.
- **Recommendation:** Route stop through a `hasWorkspaceBinding()`-guarded method and guard `retryLookup`/`refresh`/`openLatest`.

### 5. Failed-analysis route pins failed panel over user-selected saved analyses
- **Trigger:** Opening a `Failed` analysis row from Home (`/onboarding/analyze?tab=<failedId>`) and clicking any saved analysis card.
- **Symptom:** URL updates with `analysis=<slug>`, but the view remains stuck on `"Analysis failed"`.
- **Evidence:** `analyze-workspace.page.ts:691-699, 708, 1078-1104`.
- **Current handling:** Failed-record check runs ahead of `this.store.selected()` and `useSaved` preserves `tab=<failedId>`.
- **Recommendation:** Let an explicit `store.selected()` take precedence over the failed-record fallback (or clear `tab` in `useSaved`).

---

## Checks Run

All commands ran read-only against `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` with logs written under `.ptah/tmp/`:

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Jest (`setup-wizard`, 6 suites) | `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath setup-run.store.spec.ts setup-run-persistence.spec.ts wizard-analysis-runner.service.spec.ts wizard-rpc.service.spec.ts setup-run-steps.spec.ts generation-handoff.store.spec.ts` | **PASS** — 6/6 suites, **310/310 tests** | `.ptah/tmp/b18a-review-jest-setup-wizard.log` |
| Jest (`rpc-handlers`, 2 suites) | `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath setup-rpc.handlers.spec.ts setup-rpc-skill-install.spec.ts` | **PASS** — 2/2 suites, **111/111 tests** | `.ptah/tmp/b18a-review-jest-rpc.log` |
| Jest (`onboarding`, 9 suites) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <8 Batch 18A specs + generation-step.store.spec.ts>` | **PASS** — 9/9 suites, **222/222 tests** | `.ptah/tmp/b18a-review-jest-onboarding.log` |
| TypeScript (`setup-wizard`, `onboarding`, `rpc-handlers` lib) | `npx tsc --noEmit --project <project>/tsconfig.lib.json` | **EXIT 0** on all 3 projects | `.ptah/tmp/b18a-review-tsc-{sw,ob,rpc}.log` |
| ESLint (all 21 Batch 18A files) | `npx eslint <21 changed files>` | **EXIT 0** — 0 errors, 42 pre-existing warnings | `.ptah/tmp/b18a-review-eslint.log` |

### Tool Fallbacks & Residual Uncertainty
- `ptah_code_search_symbols` returned 0 symbols (unindexed SQLite code index) and `ptah_lsp_references` resolved against the main checkout rather than this worktree; fell back to `grep -rn` for cross-file symbol/usage searches.
- `tools/degradation-audit/check-degradation.ts`, AOT template typecheck (`typecheck-templates`), and live Windows Electron runtime were not executed (outside permitted focused-check commands / Linux host); Finding 2 was verified by directly reading `tools/degradation-audit/check-degradation.ts:11, 73, 102-107`, and Finding 1 was verified by tracing `wizard-generation-binding.ts:232-240` + `enhanced-prompts-rpc.handlers.ts:668-671` end-to-end against every frontend consumer.
- Batch 16 and Batch 14 items remain PENDING in `batches.md` and are intentionally excluded from findings.

---

## Verdict

- **Recommendation:** **REVISE** (**6/10**)
- **Confidence:** **HIGH**
- **Top risk:** M4's Windows lowercase/forward-slash folding breaks raw `workspacePath` equality checks against backend `realpath` bindings in `AgentGenerationRunPage`, `ProjectGuidancePage`, `GenerationStepStore`, and `OnboardingFocusRouter`, silently blanking live transcripts and breaking agent generation results/retry on Windows.
- **Required before approval:**
  1. Normalize both sides of backend-binding `workspacePath` comparisons in `agent-generation-run.page.ts:272, 302, 442`, `project-guidance.page.ts:434`, and `generation-step.store.ts:127` (and resolve raw open-folder path in `onboarding-focus-router.service.ts:31`) with Windows-casing/backslash regression tests (Finding 1).
  2. Fix the unsuppressed `empty-catch` at `setup-run-analysis.coordinator.ts:212` so `degradation-audit` stays at 0 unsuppressed sites (Finding 2).
  3. Add unit tests for `wizard:load-analysis`'s `loadByRunId` fallback, traversal/dot rejection, `null` handling, and unauthorized workspace rejection in `setup-rpc.handlers.spec.ts` (Finding 3).
  4. Guard `stop()`/`retryLookup()`/`refresh()`/`openLatest()` in `project-guidance.page.ts` (Finding 4), fix the `AnalyzeWorkspacePage` failed-record vs saved-selection priority and `safeError` bypass (Finding 5), and add a legacy Windows hydration test in `setup-run-persistence.spec.ts` (Finding 6).


---

## Re-review round 1

Review family: antigravity (read-only logic re-review of Codex Batch 18A round-1 fixes)
Worktree: `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs`
Scope: Uncommitted changes across 28 files in `libs/frontend/setup-wizard/**`, `libs/frontend/onboarding/src/lib/{analyze,home,shell}/**`, and `libs/backend/rpc-handlers/**`, plus read-only export compatibility verification for `libs/frontend/onboarding/src/lib/proposal/**` (Batch 18B).

### Summary

| Metric | Value |
| --- | --- |
| Overall score | **8/10** |
| Verdict | **APPROVED** |
| Blocking issues | 0 |
| Serious issues | 0 |
| Moderate issues | 0 |
| Minor issues | 1 |
| Failure modes found | 1 (minor) |

**Band rationale:** **8/10 — APPROVED** (sound). All six round-0 findings (1 blocking, 2 serious, 2 moderate, 1 minor) are resolved with targeted regression specs that fail against the previous revision; all earlier Batch 18A fixes (Phase C F1–F4, F7, F8; Batch 17b M1, M2, M4) remain intact with no regressions; `normalizeSetupWorkspacePath` retains its exact exported name and signature for Batch 18B's `proposal/` callers; and all 662 focused Jest tests, all 3 project TypeScript checks, and ESLint pass with 0 errors. This sits at 8/10 rather than 9–10 because of one minor scalability/resilience edge case in `SetupRunAnalysisCoordinator.recoverSaved` when `record.backendRunId` is `null` (sequential full `loadAnalysis` scans with an outer `try/catch` and `AnalysisClaudeMdLinker.link` per completed entry), plus residual uncertainty from not executing live Windows Electron runtime or AOT template checks in this environment. It clearly clears the 5–6 band because zero blocking, serious, or moderate defects remain.

### Status of Prior Findings (1–6)

| # | Prior Finding | Status | Verification & Regression Sensitivity |
| --- | --- | --- | --- |
| **1** | **[Blocking]** Windows path folding broke raw `workspacePath` comparisons against backend `realpath` bindings | **RESOLVED** | `setup-run-persistence.ts:122-150`, `setup-wizard/src/index.ts:12-15`: preserved `normalizeSetupWorkspacePath` export/signature for Batch 18B `proposal/` callers (`team-builder-run.coordinator.ts:22`, `team-builder-start.page.ts:30`), added `setupWorkspacePath` (preserves native filesystem spelling, normalizes bare `C:` -> `C:\`), and exported `sameSetupWorkspacePath`. `SetupRunStore.workspacePath` (`setup-run.store.ts:118-122`), `start` (`:283, :296`), `createBoundRunRecord` (`setup-run-binding.ts:175, :180`), and `parseSetupRunRecord` (`setup-run-persistence.ts:173-175, :198`) retain native spelling while bucket keys (`runsFor`, `patch`, `insert`, `remove`, `readSetupRunIndex`) always fold via `normalizeSetupWorkspacePath`. Audited every `workspacePath` comparison across `setup-wizard` and `onboarding/{analyze,home,shell}`: all cross-boundary checks now use `sameSetupWorkspacePath` or `matchesBinding` on both sides (`agent-generation-run.page.ts:223, 273, 303, 443`; `project-guidance.page.ts:435, 588-591, 658, 704, 723, 743, 861, 897, 924, 956, 991`; `generation-step.store.ts:99, 109, 132, 170, 203`; `analyze-done.page.ts:166`; `generation-handoff.store.ts:58, 138, 156, 168, 200, 257, 281`; `bound-generation-tab.ts:12`; `setup-run-analysis.coordinator.ts:138, 189, 193`). Regression specs fail on prior code: `setup-run.store.spec.ts:933-950`, `agent-generation-run.page.spec.ts:181-272`, `project-guidance.page.spec.ts:371-424`, `generation-step.store.spec.ts:119-131`. Native spelling also keeps `OnboardingFocusRouter` working for current and pre-18A records (known intermediate-profile caveat excluded per scope). |
| **2** | **[Serious]** Unsuppressed `empty-catch` in `SetupRunAnalysisCoordinator.recoverSaved` violated `degradation-audit` | **RESOLVED** | `setup-run-analysis.coordinator.ts:220-222` now logs fixed warning `console.warn('[setup-run-analysis] Saved analysis recovery failed.')` without leaking backend paths/exceptions and transitions confirmed-inactive runs to retryable `interrupted`. Verified against `tools/degradation-audit/check-degradation.ts:521-550` and `.ptah/tmp/batch18a-revise-audit-final.log` (0 violations in Batch 18A; only 2 sites reported are in concurrent Batch 18B `proposal/`). Regression spec (`setup-run.store.spec.ts:360-379`) fails on prior code. |
| **3** | **[Serious]** Zero unit tests for `wizard:load-analysis` `loadByRunId` fallback | **RESOLVED** | `setup-rpc.handlers.ts:978-994` adds post-load exact ID verification (`match?.manifest.runId !== filename`). Six new/updated specs in `setup-rpc.handlers.spec.ts:2038-2163` cover slug fast path, exact manifest-ID fallback in a second authorized open workspace, traversal/separator/dot rejection (`dir/run-1`, `run.1`, `../run-1`), unauthorized workspace rejection before container resolution, mismatched manifest ID rejection (`run-10` vs `run-1`), and `null` fallback mapping to `ANALYSIS_LOAD_FAILED` with fixed error copy. All fail if fallback or guards are reverted. |
| **4** | **[Moderate]** `ProjectGuidancePage` unguarded pre-flush `stop`, `retryLookup`, `refresh`, and bound `openLatest` | **RESOLVED** | `project-guidance.page.ts:210, 221, 791-848, 951-958` routes both Stop controls through `protected stop()` guarded by `hasWorkspaceBinding()`, guards `retryLookup`, `refresh`, `refreshStatus`, and bound `openLatest` upfront and across awaits, and compares workspace identity via `sameSetupWorkspacePath`. Unbound `openLatest()` reads `latestGuidance()` from current `this.runs.runs()` and validates via `openRecord`. Regression spec (`project-guidance.page.spec.ts:275-297`) verifies pre-flush DOM Stop click + `retryLookup`/`refresh`/`openLatest` emit zero side effects and fails on prior code. |
| **5** | **[Moderate]** `AnalyzeWorkspacePage` failed-record override blocked saved analyses and bypassed `safeFailureCopy` | **RESOLVED** | `analyze-workspace.page.ts:691-692` returns `null` from `analysisError` whenever `this.store.selected()` is set, so clicking a saved analysis immediately shows the completed panel even with `tab=<failedId>` in the URL. `safeError` (`:1042-1044`) unconditionally filters through `safeFailureCopy(raw, 'Analysis could not finish. Try again.')` (`safe-failure-copy.ts:112-119` never echoes raw text). DOM regression spec (`analyze-workspace.page.spec.ts:1605-1649`) asserts redaction of path-bearing persisted `record.error` and transition to `'Analysis complete'` upon `useSaved(...)`; fails on prior code. |
| **6** | **[Minor]** `recoverSaved` missed resumed runs (`analyzedAt` vs `updatedAt`) and lacked Windows legacy-key hydration spec | **RESOLVED** | `setup-run-analysis.coordinator.ts:72, 198-219` evaluates `manifest.updatedAt ?? manifest.analyzedAt` in both `reconcile` and `recoverSaved`, inspecting completed manifests when `record.backendRunId` is null so resumed runs whose `savedAt` predates `record.createdAt` still recover. Regression spec (`setup-run.store.spec.ts:381-421`) verifies recovery of a resumed manifest after an older entry. `setup-run-persistence.spec.ts:378-402` adds a parameterized upgrade hydration spec for legacy Windows buckets `C:\Work\Repo` and `C:` merging into `c:/work/repo` and `c:/`, preserving native `record.workspacePath` (`C:\Work\Repo`, `C:\`), and round-tripping through `serializeSetupRunIndex` with zero warnings. |

### Earlier Batch 18A Fixes — No Regressions

- **Phase C F1** (`setup-run-analysis.coordinator.ts:29-230`, `setup-run.store.ts:194-209, 555-574`, `wizard-analysis-runner.service.ts:214-287`): Verified intact across workspace switches, reload hydration, and RPC failure (`analysisActive === undefined`).
- **Phase C F2** (`analyze-skills.page.ts:1332-1367`, `project-guidance.page.ts:678-696, 864-889`): Verified intact — Skills completes `skill-review` and navigates without creating an unstarted guidance record.
- **Phase C F3** (`analyze-skills.page.ts:586-605`, `agent-generation-run.page.ts:185-194, 229-234`, `analyze-done.page.ts:261-271`, `analyze-workspace.page.ts:1061-1068, 1281-1304`, `analysis-step.store.ts:199`, `setup-rpc.handlers.ts:978-994`): Verified intact with full frontend and backend test coverage.
- **Phase C F4** (`project-guidance.page.ts:561-570, 621-648, 791-983`): Verified intact and now fully guarded pre-flush.
- **Phase C F7** (`setup-run.store.ts:497-503`, `setup-run.store.spec.ts:1138-1159`): Verified intact — analysis reruns clear `analysisRunId`.
- **Phase C F8** (`setup-runs-list.component.ts:77`, `analyze-workspace.page.ts:691-700, 1042-1044`): Verified intact and fixed for saved-analysis selection and redaction.
- **Batch 17b M1 & M2** (`analyze-skills.page.ts:530-580, 1215-1310`, `analyze-skills.page.spec.ts:823-909`): Verified intact.
- **Batch 17b M4** (`setup-run-persistence.ts:122-150, 322-343`): Verified intact without breaking Windows consumers or Batch 18B `proposal/` callers.

### New Findings

#### 1. [Minor] `recoverSaved` sequential full-manifest scan without `backendRunId` scales O(N) with history and aborts on a single unreadable entry

- **Files:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts:198-222`
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1002-1010`
- **Scenario:** When an analysis Setup record has `backendRunId === null` and the backend confirms inactivity (`analysisActive === false`) with no matching `resumable.analysis`, `recoverSaved` fetches all completed entries from `listAnalyses` and sequentially calls `rpc.loadAnalysis(filename, workspacePath)` for every entry until one has `updatedAt ?? analyzedAt >= record.createdAt`. If the run crashed before saving (so none match), every historical completed analysis is loaded in full (reading all phase markdown files and running `AnalysisClaudeMdLinker.link(workspaceRoot)` on each completed load). In addition, a single transient `loadAnalysis` rejection on an earlier entry breaks out of the outer `try/catch` (`:197-222`) without checking subsequent entries (mitigated because `listValidRuns` pre-filters valid manifests and `loadMultiPhase` tolerates missing phase files).
- **Impact:** Low probability / non-blocking. Typical workspaces hold a handful of analyses and `recoverSaved` only runs once after reload/watcher stop for an unlinked record; however, workspaces with large analysis histories incur unnecessary sequential RPC + linker overhead on an interrupted analysis, and a single mid-scan read failure would stop checking remaining entries.
- **Fix (non-blocking follow-up):** Isolate per-entry `loadAnalysis` errors inside the loop (or expose `updatedAt` in `SavedAnalysisMetadata` in a future schema batch so `listAnalyses` can filter/order without loading full phase contents).

### Five Logic Questions (Round 1)

#### 1. How does this fail silently?
- No silent data-loss or misleading-success paths remain in the reviewed Batch 18A scope. Previously silent Windows transcript/result blackouts (`agent-generation-run.page.ts`, `project-guidance.page.ts`, `generation-step.store.ts`), failed-record saved-analysis selection blocking (`analyze-workspace.page.ts`), and silent `empty-catch` in `recoverSaved` (`setup-run-analysis.coordinator.ts`) are all closed.
- Minor residual: inside `recoverSaved` (`setup-run-analysis.coordinator.ts:205-222`), if `record.backendRunId` is `null` and an earlier completed analysis throws during `loadAnalysis` (e.g., deleted concurrently between `listAnalyses` and `loadAnalysis`), the outer `catch` logs the fixed warning and transitions the record to `interrupted` without checking later entries in `filenames`.

#### 2. What user action produces unexpected behaviour?
- All previously reported unexpected user flows (Windows generation/guidance views, clicking a saved analysis from a failed Home analysis row, clicking Stop/Retry/Refresh on `ProjectGuidancePage` during a pre-flush workspace switch, and resuming an analysis whose original `analyzedAt` predated the Setup record) now behave as expected and are backed by DOM/store regression tests.
- No blocking, serious, or moderate unexpected user action was found in Batch 18A scope.

#### 3. What input data makes this produce a wrong answer rather than an error?
- Mixed-case and mixed-separator Windows paths (`C:\Work\Repo`, `c:/work/repo/`, `C:`, `C:\`, `\\Host\Share\Folder`) now hash to the same normalized bucket key while preserving native spelling on records/bindings and normalizing both operands in every comparison.
- Malformed or traversal `filename` inputs to `wizard:load-analysis` (`../run-1`, `dir/run-1`, `run.1`) are rejected before `loadByRunId`, and mismatched `manifest.runId` replies are rejected (`setup-rpc.handlers.ts:983-993`).
- Persisted `localStorage` `record.error` containing paths or private text is always filtered through `safeFailureCopy` (`analyze-workspace.page.ts:1042-1044`).

#### 4. What happens when a dependency fails, times out, or returns a shape it should not?
- `wizard:get-resumable-run` failure (`analysisActive === undefined`): `SetupRunAnalysisCoordinator.reconcile` preserves `running` (`setup-run-analysis.coordinator.ts:37-93`).
- `wizard:list-analyses` / `wizard:load-analysis` failure in `recoverSaved`: logs fixed warning without raw error text and settles the confirmed-inactive record to retryable `interrupted` (`setup-run-analysis.coordinator.ts:220-229`).
- `wizard:load-analysis` unauthorized workspace or mismatched/null `loadByRunId`: returns coded `UNAUTHORIZED_WORKSPACE` or `ANALYSIS_LOAD_FAILED` (`setup-rpc.handlers.ts:963-1000`).
- `wizard:install-skills-with-consent` failure, cancellation, or non-array `installed`: handled safely with confirmed skill names preserved and no premature navigation (`analyze-skills.page.ts:1259-1296`).

#### 5. What is missing that the requirements never mentioned?
- Exposing `updatedAt` on `SavedAnalysisMetadata` (outside Batch 18A's shared-contract scope) would let `recoverSaved` avoid full `loadAnalysis` RPCs + `AnalysisClaudeMdLinker.link` calls for historical completed analyses when `record.backendRunId` is `null` (New Finding 1, Minor).
- As explicitly noted and accepted out of scope for Batch 18A, an intermediate dev profile that ran the uncommitted round-0 revision may still hold folded paths for `OnboardingFocusRouter.focus()` until the focus router owner matches open Electron workspace folders.

### Checks Run (Round 1)

All commands ran read-only against `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` with logs under `.ptah/tmp/`:

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Jest (`setup-wizard`, 6 suites) | `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath setup-run.store.spec.ts setup-run-persistence.spec.ts wizard-analysis-runner.service.spec.ts wizard-rpc.service.spec.ts setup-run-steps.spec.ts generation-handoff.store.spec.ts` | **PASS** — 6/6 suites, **315/315 tests** | `.ptah/tmp/b18a-r1-review-jest-setup-wizard.log` |
| Jest (`onboarding`, 10 suites outside `proposal/`) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <9 analyze/home specs + onboarding-focus-router.service.spec.ts>` | **PASS** — 10/10 suites, **230/230 tests** | `.ptah/tmp/b18a-r1-review-jest-onboarding.log` |
| Jest (`rpc-handlers`, 2 suites) | `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath setup-rpc.handlers.spec.ts setup-rpc-skill-install.spec.ts` | **PASS** — 2/2 suites, **117/117 tests** | `.ptah/tmp/b18a-r1-review-jest-rpc.log` |
| TypeScript (`setup-wizard`, `onboarding`, `rpc-handlers` lib) | `npx tsc --noEmit --project <project>/tsconfig.lib.json` | **EXIT 0** on all 3 projects | `.ptah/tmp/b18a-r1-review-tsc-{sw,ob,rpc}.log` |
| ESLint (all 28 changed Batch 18A files) | `npx eslint <28 changed files>` | **EXIT 0** — 0 errors, 48 pre-existing warnings | `.ptah/tmp/b18a-r1-review-eslint.log` |

*Tool note:* `ptah_search_files` returned 0 files for `.ptah/specs/**` (dot-directory ignore) and succeeded for `**/analysis-storage.service.ts`; `grep -rn` was used for full-tree text audits of `workspacePath` / normalizer usages across the worktree.

### Verdict (Round 1)

- **Recommendation:** **APPROVED** (**8/10**)
- **Confidence:** **HIGH**
- **Top risk:** Minor O(N) sequential `loadAnalysis` scan (and single-entry abort) in `SetupRunAnalysisCoordinator.recoverSaved` when an interrupted analysis lacks `backendRunId` in a workspace with many completed analyses (`setup-run-analysis.coordinator.ts:198-222`).
- **What a robust follow-up would add:** Per-entry `try/catch` inside `recoverSaved`'s loop (or surfacing `updatedAt` in `SavedAnalysisMetadata`), plus matching open Electron folders in `OnboardingFocusRouter` in a dedicated focus-router change if intermediate dev-profile folded records must be supported.
