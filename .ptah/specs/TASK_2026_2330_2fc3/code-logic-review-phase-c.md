# Code Logic Review — Phase C (`TASK_2026_2330_2fc3`)

Review family: antigravity (read-only cross-batch phase review)
Worktree: `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs` (branch `feat/setup-background-runs`, `8923e7718e..HEAD`)

## Summary

| Metric | Value |
| --- | --- |
| Overall score | **5/10** |
| Verdict | **REVISE** |
| Critical findings (NEW) | 1 |
| Major findings (NEW) | 5 |
| Minor findings (NEW) | 3 |
| Known open items confirmed | Batch 16 (5 items), Batch 14 (cleanup/wiring), open per-batch Minors |

**Band rationale:** **5/10 — REVISE** (real gaps). Each Phase C batch is individually solid and all 641 focused Jest tests, library TypeScript checks, ESLint checks, and the degradation audit pass with zero errors. Reviewing the phase end to end across boundaries, however, exposes **1 Critical** and **5 Major** cross-batch integration defects that per-batch specs could not observe: an analysis run permanently deadlocks its workspace when it completes across a workspace switch or reloads without a resumable manifest; clicking "Continue to Project guidance" from `AnalyzeSkillsPage` creates an unstarted `running` guidance record that polls into `"Guidance interrupted"` after ~7.5 s; five Phase C routes pass `analysis=<runId>` (with an `agent-generation` `tab` or no `tab`) to `AnalyzeSkillsPage`, which forwards the UUID to `wizard:load-analysis` (slug-only) and fails; `ProjectGuidancePage` never reacts to workspace switches; `TeamBuilderRunCoordinator` compares unnormalized workspace roots against normalized `SetupRunStore` records; and team-builder's post-install "Re-attach files" / interrupted "Continue without attachments" flows erase confirmed install state or launch with empty guidance. This sits above 3–4 because the underlying architecture (split `SetupRunStore` collaborators, tab-free bound runs, persisted `guidanceHandoff`, backend skill-review persistence, reactive Home list, D3 chat handoff, and workspace-pinned consent install) is structurally sound and each defect admits a localized fix.

---

## Scope Examined (Whole Files Read)

- **Store & collaborators (`libs/frontend/setup-wizard/src/lib/services/`):**
  - `setup-run.types.ts`, `setup-run-steps.ts`, `setup-run-persistence.ts`, `setup-run.store.ts`
  - `setup-run/setup-run-record.ts`, `setup-run-host.ts`, `setup-run-poll.ts`, `setup-run-binding.ts`, `setup-run-attempt.ts`, `setup-run-bound.coordinator.ts`, `setup-run-analysis.coordinator.ts`, `setup-run-skill-review.coordinator.ts`
  - `generation-handoff.store.ts`, `setup-run-entry.service.ts`, `generation-run-event-adapter.ts`, `generation-workflow.store.ts`, `guidance-generation.store.ts`, `wizard-analysis-runner.service.ts`, `wizard-rpc.service.ts`
- **Onboarding pages & coordinators (`libs/frontend/onboarding/src/lib/`):**
  - `onboarding.routes.ts`, `home/setup-runs-list.component.ts`, `home/onboarding-home.component.ts`, `shell/onboarding-step-link.ts`, `shell/onboarding-workspace.store.ts`, `shell/onboarding-shell.component.ts`, `shared/run-status-chip.component.ts`
  - `analyze/agent-generation-run.page.ts`, `analyze/analyze-done.page.ts`, `analyze/analyze-skills.page.ts`, `analyze/analyze-workspace.page.ts`, `analyze/analysis-step.store.ts`, `analyze/project-guidance.page.ts`, `analyze/generation-step.store.ts`, `focus/onboarding-focus-router.service.ts`
  - `proposal/stack-skill.store.ts`, `proposal/team-builder-run.coordinator.ts`, `proposal/team-builder-start.page.ts`, `proposal/team-builder-start.page.html`, `launcher/harness-chat-launcher.service.ts`
- **Backend consent install & analysis contracts:**
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`, `setup-rpc.schema.ts`, `skills-sh-rpc.handlers.ts`, `utils/workspace-authorization.ts`
  - `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts`
- **Host/core workspace sources:**
  - `libs/frontend/core/src/lib/services/electron-layout.service.ts`, `vscode.service.ts`, `libs/frontend/chat-state/src/lib/tab-manager.service.ts`, `tab-workspace-partition.service.ts`
- **All Phase C commits (`8923e7718e..HEAD`) and per-batch reviews** (`batch8`, `batch9`, `batch10`, `batch11`, `batch12`, `batch15`, `batch17a`, `batch17b`), `implementation-plan.md`, `batches.md`, `context.md`.

---

## NEW Findings (Cross-Batch Phase C)

### 1. [Critical] Analysis records permanently wedge in `running` and deadlock `AnalyzeWorkspacePage` after background workspace-switch completion or reload without a resumable manifest

- **Files:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts:28-74, 98-139`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:193-206`
  - `libs/frontend/onboarding/src/lib/shell/onboarding-workspace.store.ts:76-86`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:1158-1159, 1337-1348, 1393-1395`
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:691-725`
- **Scenario & Impact:** Two distinct cross-batch paths leave an `analysis` `SetupRunRecord` stuck in `status: 'running'` forever:
  1. **Workspace switch `A -> B` mid-analysis:** User starts analysis `R_A` in Workspace A (`runnerSeen.add(R_A.id)` and `liveThisSession.add(R_A.id)`), then switches to Workspace B while it runs. When `WizardAnalysisRunner` finishes Workspace A's analysis (`wizard-analysis-runner.service.ts:662-686`), `SetupRunStore`'s constructor effect (`setup-run.store.ts:201-206`) triggers `analysis.syncFromRunner(false, false)`. Because `syncFromRunner` (`setup-run-analysis.coordinator.ts:99-103`) reads `const workspace = this.host.workspacePath()` (Workspace B!) and iterates only `this.host.runsFor(workspace)`, `R_A` is never visited and remains `running` with `liveThisSession.has(R_A.id) === true`. When the user switches back `B -> A`:
     - `SetupRunAnalysisCoordinator.reconcile` skips `R_A` because `if (this.host.isLiveThisSession(record.id)) continue;` (`:46`).
     - `SetupRunStore`'s runner effect (`:201-206`) does not track `workspacePath()`, so `syncFromRunner` never re-runs.
     - `OnboardingWorkspaceStore` (`onboarding-workspace.store.ts:80-85`) sees `!runner.isRunning()` and calls `wizard.reset()` + `runner.reset()`, discarding the finished result.
  2. **Renderer reload mid-analysis when `wizard:get-resumable-run` returns `analysisActive: false` with `analysis: null`:** `findLatestResumableRun` omits completed analyses that have no unfinished generation, so if an analysis completes while reloading — or if the app restarts before Phase 1 writes a manifest — `wizard:get-resumable-run` returns `{ analysis: null, generation: null, analysisActive: false }` (`setup-rpc.handlers.ts:691-725`). In `SetupRunAnalysisCoordinator.reconcile` (`:47-53`), `if (!manifest || (record.backendRunId !== null && record.backendRunId !== manifest.runId)) continue;` treats `!manifest` as "no evidence" even though `resumable.analysisActive === false` authoritatively proves no analysis is active (contrast `wizard-rpc.service.ts:420`, where RPC failure leaves `analysisActive === undefined`, and `analyze-workspace.page.ts:903`, which already distinguishes `=== false`). Furthermore, if `analysisActive === true` after reload and the user stays on Home without mounting `AnalyzeWorkspacePage`, nothing hydrates `runner.syncBackendActive(true)` and `SetupRunStore` does not poll `analysis` (`setup-run-bound.coordinator.ts:61-63`), so completion is never observed.
  - **Deadlock:** Once `R_A` is wedged in `running`, Home (`SetupRunsListComponent`) shows a permanent spinning `Running` row with no Dismiss/Review skills/Re-run; `SetupRunEntryService.openSetup()` always hijacks Setup nav to `/onboarding/analyze?tab=R_A`; and `AnalyzeWorkspacePage` shows idle `"Start a workspace analysis"` (no Stop button because `isAnalysisActive()` is `false`), where clicking **"Start analysis"** silently no-ops because `hasLiveRun()` (`:1393-1395`) sees `R_A.status === 'running'`. The user cannot start, stop, or dismiss analysis in that workspace without manually clearing `localStorage`. *(Distinct from Batch 16, which adopts disk-only completed analyses when no record exists.)*
- **Fix:**
  1. In `SetupRunAnalysisCoordinator.syncFromRunner` (`setup-run-analysis.coordinator.ts:98-139`), iterate `[...this.runnerSeen]` via `this.host.get(id)` using each record's own `record.workspacePath` (instead of `this.host.workspacePath()`) for `isRunningForWorkspace` and `isResultForWorkspace`, and when `running` is `true` mark records matching `this.runner.activeWorkspacePath()`. That settles Workspace A's record immediately on background completion while viewing Workspace B.
  2. In `SetupRunAnalysisCoordinator.reconcile` (`:45-60`), when `resumable.analysisActive === false` and `!this.host.isLiveThisSession(record.id)` and `manifest` is absent or mismatched, do not leave `record` `running`: resolve against saved analyses newer than `record.createdAt` (or mark `interrupted` when no matching completed analysis exists), keeping the "no evidence" `continue` strictly for `resumable.analysisActive === undefined` (RPC failure).
  3. When `reconcile` sees `resumable.analysisActive === true` and `!this.runner.isRunningForWorkspace(workspace)`, call `this.runner.syncBackendActive(true, { startedAt: resumable.activeAnalysisStartedAt, workspacePath: workspace })` from the coordinator so Home and the shell badge observe reload-era analysis completion without requiring `AnalyzeWorkspacePage` to mount.

---

### 2. [Major] `AnalyzeSkillsPage.continueToGuidance()` creates a phantom `running` `project-guidance` record without starting backend work — causing Home/shell to report Running, then flipping `ProjectGuidancePage` to "Guidance interrupted" (and raising an unseen badge) after ~7.5 s

- **Files:**
  - `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1304-1336`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:182-184, 207-212, 275-308`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:61-63, 244-279`
  - `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:224-250, 410-417, 474-491, 677-750, 843-876, 950-952`
- **Scenario & Impact:**
  1. On `AnalyzeSkillsPage`, clicking **"Skip skills"** or **"Continue to Project guidance"** runs `continueToGuidance()` (`analyze-skills.page.ts:1312-1320`), which calls `this.setupRuns.start('project-guidance', workspace, { parentId: parent?.id, analysisRunId: runId, origin: 'analysis-result-continue' })` and navigates to `/onboarding/analyze/guidance?tab=<record.id>&analysis=<runId>`.
  2. `SetupRunStore.start()` (`setup-run.store.ts:295`) creates the record with **`status: 'running'`**, `backendRunId: null`, and adds it to `liveThisSession`. Neither `AnalyzeSkillsPage` nor `ProjectGuidancePage` starts any backend guidance run (`ProjectGuidancePage.agentRecord` at `:677-686` only auto-starts a pending `GenerationHandoffStore` countdown when `parent.workflow === 'agent-generation'`, never `'skill-review'`).
  3. On mount, `ProjectGuidancePage` gets `null` from `getBoundRunState`, stays in `workflow.state() === 'idle'`, and displays `"Ready to create guidance"` + **"Start guidance"**, while Home (`SetupRunsListComponent`) and the Electron shell Setup nav simultaneously show `Project guidance` as **Running** (`runningCount() === 1`).
  4. Because `record.status === 'running'` and no push arrives, `SetupRunStore`'s shared 2.5 s poll (`setup-run.store.ts:182-184`, `setup-run-bound.coordinator.ts:244-279`) polls `getBoundRunState`, receives `null`, and after `ORPHAN_GRACE_MS` (5 s, ~7.5 s wall time) applies **`status: 'interrupted'`**.
  5. While the user is reading `ProjectGuidancePage`, `interrupted()` flips to `true`, mutating `"Ready to create guidance"` into **`"Guidance interrupted"`** / `"Guidance was interrupted. Retry the run."` and swapping **"Start guidance"** for **"Retry"**.
  6. Worse, if the user clicks **"Skip to Done"** (`project-guidance.page.ts:950-952`) or leaves Setup without starting guidance, `ProjectGuidancePage` calls `runs.release(binding.tabId)` on destroy, and 7.5 s later the poll marks the never-started record `interrupted` with **`unseen: true`**, lighting up the Setup nav attention badge and adding a phantom `"Project guidance — Interrupted"` failure on Home.
- **Fix:** Align `AnalyzeSkillsPage.continueToGuidance()` with Batch 8's record-on-start design (`project-guidance.page.ts:843-876`):
  - Only navigate with `?tab=<existing.id>` when a non-terminal `project-guidance` record already exists for the workspace.
  - Otherwise, mark the `skill-review` parent `completed` and navigate to `['/onboarding', 'analyze', 'guidance']` with `{ queryParams: { ...(runId ? { analysis: runId } : {}) } }` without creating a `running` record in advance (or, if continuing from Skills is intended to auto-start guidance immediately, invoke `startBoundGuidance` via `GenerationHandoffStore` / `SetupRunStore` when creating the `running` record).

---

### 3. [Major] Five Phase C routes pass `analysis=<analysisRunId>` (with an `agent-generation` `tab` or no `tab`) to `AnalyzeSkillsPage`, which forwards the UUID to slug-only `wizard:load-analysis` and fails with "That analysis could not be loaded"

- **Files:**
  - `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:579-606, 1350-1360`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts:77, 130-144`
  - `libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts:174-190, 226-231`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:258-264`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:1287-1296`
  - `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:978-981`
  - `libs/backend/agent-generation/src/lib/services/analysis-storage.service.ts:843-852`
- **Scenario & Impact:**
  - `wizard:load-analysis` -> `AnalysisStorageService.loadMultiPhase(workspaceRoot, slugDirName)` resolves `.ptah/analysis/<slugDirName>/manifest.json` strictly by directory slug, never by UUID `runId`.
  - `AnalyzeSkillsPage.ngOnInit` (`analyze-skills.page.ts:589-598`) only takes the `routedReview` (runId-based) branch when `params.get('tab')` finds a record whose `workflow` is `'skill-review'` or `'analysis'` and `slug === recordedRunId`. For every other URL carrying `?analysis=<runId>`, it clears `routedReview` and calls `this.loadSaved(slug)` -> `wizard:load-analysis(runId)`, which rejects with `ANALYSIS_LOAD_FAILED` and renders `"That analysis could not be loaded. Choose a completed analysis."`.
  - Five Phase C navigation paths hit this failure:
    1. **Home -> cancelled `agent-generation` row -> Open:** `stepTarget` (`setup-run-steps.ts:77, 137-144`) navigates to `/onboarding/analyze/skills?tab=<agentGenId>&analysis=<analysisRunId>` (`record.workflow === 'agent-generation'`).
    2. **`AgentGenerationRunPage` (`needs-input` / Preview required) -> "Return to Review skills":** `previewTarget` (`agent-generation-run.page.ts:174-181, 226-231`) calls `runs.targetOf(record, 'entry')` -> `/onboarding/analyze/skills?tab=<agentGenId>&analysis=<analysisRunId>` (`record.workflow === 'agent-generation'`).
    3. **`AgentGenerationRunPage` (`cancelled`) -> "Return to Review skills":** (`:185-190`) navigates to `/onboarding/analyze/skills?analysis=<analysisRunId>` (omits `tab`).
    4. **`AnalyzeDonePage` -> "Review skills":** (`analyze-done.page.ts:258-264`) forwards `analysis` from its query (`<analysisRunId>`) and drops `tab`.
    5. **`AnalyzeWorkspacePage.reviewSkills()` fallback when no completed `analysis` record exists:** (`analyze-workspace.page.ts:1287-1296`) sends `analysis: displayedRunId` (`manifest.runId`, not `manifest.slug`) with no `tab`.
  - Secondary asymmetry: clicking **Back** on `AnalyzeSkillsPage` (`:1350-1360`) after arriving via a routed `analysis=<runId>` URL forwards `?analysis=<runId>` to `/onboarding/analyze`, where `AnalyzeWorkspacePage.loadSaved` (`:1058`) compares against `item.filename` (slug) and silently skips selecting the analysis.
- **Fix:**
  1. In `AnalyzeSkillsPage.ngOnInit` (`analyze-skills.page.ts:580-606`), extend the `routedReview` check to accept `record?.workflow === 'agent-generation'` and `'project-guidance'` when `recordedRunId && slug === recordedRunId`, AND when `tab` is absent check whether `slug` matches any workspace record's `analysisRunId` or `backendRunId` before falling back to `loadSaved(slug)`.
  2. In `AnalyzeWorkspacePage.reviewSkills()` (`:1287-1296`), fall back to `loaded?.manifest.slug` (when calling the slug-based route without a record), and in `AnalyzeDonePage.reviewSkills()` / `AgentGenerationRunPage` (`cancelled`), pass the `tab` param (e.g. `runs.targetOf(record, 'entry')`).

---

### 4. [Major] `ProjectGuidancePage` never reacts to workspace switches — remaining bound to Workspace A and allowing actions/retries against A while the user is in Workspace B

- **Files:**
  - `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:559-652, 878-929`
- **Scenario & Impact:**
  - `ProjectGuidancePage` checks `record.workspacePath !== this.runs.workspacePath()` inside `openRecord()` (`:642-644`), which is called only from `ngOnInit` and the `route.queryParamMap` (`tab`) subscription (`:594-605`). Unlike `AgentGenerationRunPage` (`:220`), `AnalyzeWorkspacePage` (`:795-806`), `AnalyzeSkillsPage` (`:529-552`), and `TeamBuilderStartPage` (`:182-191`), `ProjectGuidancePage` has no `effect` tracking `this.runs.workspacePath()`.
  - When a user views `/onboarding/analyze/guidance?tab=P_A` or `/onboarding/guidance?tab=P_A` in Workspace A and switches to Workspace B (via the shell header or sidebar), the route URL and `tab` query do not change. `this.binding()` stays bound to Workspace A (`workspacePath: '/ws-a'`), `this.recovery()` stays `null`, and the page continues displaying Workspace A's guidance result, detected stack, and content under Workspace B's header.
  - Clicking **Toggle** (`setEnabled`), **View content** (`loadContent`), **Download** (`download`), or **Retry/Regenerate** (`workflow.regenerateGuidance()` -> `runs.rerun(P_A)`) operates against Workspace A's binding while the active host workspace is Workspace B.
- **Fix:** Add a constructor `effect` in `ProjectGuidancePage` reading `this.runs.workspacePath()` that re-invokes `openRoute(this.route.snapshot.queryParamMap.get('tab'))` whenever the active workspace changes after initial mount, unbinding `workflow` and `guidance` and entering `'workspace-mismatch'` recovery for foreign `?tab=` bindings (or loading Workspace B's latest guidance when recordless).

---

### 5. [Major] Unnormalized `workspacePath` comparisons in `TeamBuilderRunCoordinator` vs normalized `SetupRunStore` records strand team-builder runs in `running` whenever `workspaceRoot` has a trailing separator

- **Files:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:637, 858-868, 968, 1274, 1359, 1427`
  - `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts:66-69`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:280, 293`
- **Scenario & Impact:**
  - `SetupRunStore.start()` always normalizes `record.workspacePath` with `normalizeSetupWorkspacePath()` (trimming trailing `/` and `\`).
  - `HarnessChatLauncherService.workspaceRoot` returns the raw unnormalized path (`this.tabs.activeWorkspacePath ?? this.vscode.config().workspaceRoot ?? ''`), which `TeamBuilderStartPage` passes into `TeamBuilderRunCoordinator` as `request.workspacePath` / `execution.workspacePath`.
  - Batch 17b normalized the comparison inside `installRecord()` (`:863-865`), but three store-transition guards in the same coordinator still use raw strict equality against `record.workspacePath`:
    - `invalidateForWorkspace` (`:637`): `record.workspacePath === execution.workspacePath` evaluates `false`, so switching workspaces aborts the execution without ever reporting `status: 'interrupted'` to `SetupRunStore`.
    - `executeLaunch` post-dispatch error catch (`:968`): `record.workspacePath !== execution.workspacePath` evaluates `true`, so a failed send skips `setupRuns.report(..., { status: 'failed' })` and returns `{ kind: 'ignored' }`.
    - `markCancelledIfLive` (`:1427`): `record.workspacePath !== workspacePath` evaluates `true`, so an aborted/cancelled launch never transitions the record to `cancelled`.
  - In all three cases, the `team-builder` record stays stuck in `status: 'running'` on Home and in `SetupRunStore` (even on POSIX whenever the workspace path has a trailing `/`, independent of Batch 17b Minor 4's Windows casing asymmetry). Similarly, `closeUncommittedTabForWorkspace` (`:1274`) and `flushPendingTabCleanups` (`:1359`) compare raw paths.
- **Fix:** Compare `normalizeSetupWorkspacePath(record.workspacePath) === normalizeSetupWorkspacePath(execution.workspacePath)` (or store normalized paths for record comparisons) at `:637`, `:968`, `:1427`, `:1274`, and `:1359`, matching `installRecord` (`:863-865`). Also use `||` instead of `??` in `HarnessChatLauncherService.workspaceRoot` (`:68`) so an empty string `activeWorkspacePath` falls back to `vscode.config().workspaceRoot`, matching `SetupRunStore.workspacePath` (`setup-run.store.ts:119`).

---

### 6. [Major] Team-builder post-install attachment recovery wipes confirmed install state on "Re-attach files" and launches with empty guidance on interrupted "Continue without attachments"

- **Files:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:290-326, 350-352, 626-639, 660-712, 730-747, 801-809, 1125-1130`
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html:89-119, 175-218`
- **Scenario & Impact:** When a post-install failed or interrupted `team-builder` run (`installCompleted === true`, `hadAttachments === true`) is reopened after a renderer reload, the page shows the missing-attachments alert (`team-builder-start.page.html:89-119`) with two actions, both of which break recovery:
  1. **Clicking "Re-attach files"** calls `backToIntent()` (`:730-747`), returning the user to the intent form (`team-builder-start.page.html:26-83`). After re-attaching files, the only forward button is **"Review skills"** (`submit()`, `:290-326`). `ensureRecord` reuses the existing `failed`/`interrupted` record (`:801-808`), and lines `:312-325` unconditionally overwrite `teamBuilder: { intent, installed: [] }`, `selectedIds: []`, `ownerDecision: null`, `installCompleted: false`, and call `loadReview()` without `preserveSelection` (setting `skillsInstalledState.set(false)` at `:351`). The user's already-installed skills and post-install checkpoint are silently wiped, forcing re-selection and re-installation.
  2. **Clicking "Continue without attachments" on an `interrupted` post-install run:** `hydrateFromRecord` (`:1125-1130`) sets `skillsInstalledState.set(true)` without calling `loadReview`, so `guidanceFacts()` is `[]` and `guidanceAnalysis` is `{ projectType: 'unknown', frameworks: [] }`. Because the missing-attachments alert renders above the interrupted banner, clicking **"Continue without attachments"** (`:626-639`) sees `this.skillsInstalled() === true` and invokes `this.launchChat()` directly — bypassing `continueInterrupted()`'s `setupRuns.retry` + `loadReview` (`:666-699`) and sending the chat prompt without project guidance facts or owner decision context.
- **Fix:**
  1. When `skillsInstalled()` / `coordinator.hasCompletedInstall(record.id)` is `true` on a `failed`/`interrupted` record, do not wipe `installed`, `selectedIds`, `ownerDecision`, or `installCompleted` on `submit()` (or provide a direct "Continue to team builder" submit path when returning from intent after re-attaching files).
  2. In `continueWithoutAttachments()` (`:626-639`), if `this.activeRecord()?.status === 'interrupted'`, delegate to `await this.continueInterrupted()` so `setupRuns.retry()` and `loadReview()` run before launching chat.

---

### 7. [Minor] `SetupRunStore.rerun(id)` copies the old analysis's output `analysisRunId` onto a brand-new `analysis` record

- **Files:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:479-504`
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-steps.ts:130-144`
- **Scenario & Impact:** `SetupRunStore.rerun(id)` passes `analysisRunId: previous.analysisRunId` into `this.start(...)` for all workflows. For `skill-review`, `agent-generation`, and `project-guidance`, `analysisRunId` is the upstream input analysis; for `workflow === 'analysis'`, `analysisRunId` is that run's own output ID. Copying it onto a new `analysis` record causes `stepTarget(newRecord)` to emit `?tab=<newId>&analysis=<oldAnalysisRunId>` while the new analysis is running or if it fails, cancels, or is interrupted before creating a new manifest.
- **Fix:** Pass `analysisRunId: previous.workflow === 'analysis' ? null : previous.analysisRunId` in `SetupRunStore.rerun` (`setup-run.store.ts:496`).

---

### 8. [Minor] Home `SetupRunsListComponent` disagrees with `AnalyzeWorkspacePage` on `failed` analysis records after reload/newer run, and mislabels `team-builder` installed skills as "agents installed"

- **Files:**
  - `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.ts:69-80, 138-140`
  - `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:691-706`
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:758-766`
- **Scenario & Impact:**
  1. Home renders a `failed` `analysis` row with a `Failed` chip and `record.error`, and **Open** links to `/onboarding/analyze?tab=<failedId>`. `AnalyzeWorkspacePage.analysisError` (`:691-706`) reads only in-memory `runner.errorMessage()` and `wizardState.multiPhaseResult()` and never inspects `activeRecord()?.status === 'failed'` or `activeRecord()?.error`. After a reload (when `runner.errorMessage()` is `null`), opening the `Failed` row shows `"Start a workspace analysis"` with no error or Retry; if a newer analysis completed in the same session, opening the older `Failed` row shows `"Analysis complete"` (the newer run's result).
  2. `SetupRunsListComponent.progressOf` (`:74-78`) displays `record.teamBuilder.installed.length` as `"N agent(s) installed"`, whereas `TeamBuilderRunCoordinator` populates `teamBuilder.installed` with installed **skills** from `wizard:install-skills-with-consent`.
- **Fix:**
  1. In `AnalyzeWorkspacePage.analysisError`, when `this.tab()` targets a `failed` workspace analysis record and no live analysis is active, surface `activeRecord()?.error ?? 'Analysis could not finish. Try again.'`.
  2. Change `setup-runs-list.component.ts:77` from `'agent' / 'agents'` to `'skill' / 'skills'` and update its spec.

---

### 9. [Minor] `SetupRunStore.dismiss()` and cap eviction never prune `TeamBuilderRunCoordinator`'s global 20-entry recovery sidecar

- **Files:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:406-411, 642-658`
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:39-40, 211-218, 404-410, 1495-1507`
- **Scenario & Impact:** Dismissing a terminal `team-builder` record from Home or evicting it via `capWorkspaceRuns` removes it from `ptah.setup-runs.v1` without calling `TeamBuilderRunCoordinator.clearRecovery(id)`. Because `ptah.team-builder-recovery.v1` caps `MAX_RECOVERY_ENTRIES = 20` *globally* across all workspaces (unlike `ptah.setup-runs.v1`'s 20 per workspace), stale dismissed records remain in the sidecar and can evict recoverable entries from another workspace.
- **Fix:** Before applying `MAX_RECOVERY_ENTRIES` in `savePersistedEntry` (and in `loadPersistedRecovery`), prune entries where `this.setupRuns.get(id) === null` (and retire the sidecar once Batch 16 item 5 moves the four optional fields into `SetupRunStore`).

---

## Five Logic Questions (Phase C Cross-Batch)

### 1. How does this fail silently?
- **Background analysis completion across workspaces (`setup-run-analysis.coordinator.ts:98-139`):** Finishing Workspace A's analysis while in Workspace B silently drops the completion event for `R_A`; no error is logged, `R_A` stays `running`, and `OnboardingWorkspaceStore` wipes the completed result on switch back (Finding 1).
- **Pre-manifest or completed-during-reload analysis (`setup-run-analysis.coordinator.ts:45-60`):** `reconcile` silently skips `running` records when `getResumableRun` returns `{ analysis: null, analysisActive: false }`, leaving `R_A` `running` and making `AnalyzeWorkspacePage.startFresh()` (`:1159`) silently no-op on click (Finding 1).
- **Trailing-separator workspace path in `TeamBuilderRunCoordinator` (`:637, :968, :1427`):** Workspace invalidation, post-dispatch launch failure, and cancellation silently skip updating `SetupRunStore` because `record.workspacePath` is normalized while `execution.workspacePath` is raw (Finding 5).
- **Post-install "Re-attach files" (`team-builder-start.page.ts:312-325`):** Clicking "Review skills" after re-attaching files silently overwrites `installed: []` and `installCompleted: false` on the reused record (Finding 6).

### 2. What user action produces unexpected behaviour?
- **Clicking "Skip skills" or "Continue to Project guidance" on `AnalyzeSkillsPage` (`analyze-skills.page.ts:1312-1335`) and waiting 8 seconds (or clicking "Skip to Done"):** Home/shell immediately show `Project guidance` as Running, then the idle guidance page abruptly changes to `"Guidance interrupted"` / `"Retry"`, or raises an unseen attention badge after Skip (Finding 2).
- **Clicking "Return to Review skills" on `AgentGenerationRunPage` (`needs-input` or `cancelled`), "Review skills" on `AnalyzeDonePage`, or opening a cancelled `agent-generation` run from Home:** Lands on `"That analysis could not be loaded. Choose a completed analysis."` (Finding 3).
- **Switching workspaces while viewing `ProjectGuidancePage` (`project-guidance.page.ts:559-652`):** Page remains bound to the previous workspace's guidance and lets actions run against it (Finding 4).
- **Clicking "Start analysis" after a wedged analysis record:** Button appears enabled and does nothing (Finding 1).
- **Clicking "Continue without attachments" on a reloaded post-install interrupted team-builder run (`team-builder-start.page.ts:626-639`):** Launches chat immediately without loading project guidance facts (Finding 6).
- **Leaving a `needs-input` `team-builder` run unfinished (non-blocking UX note):** `TeamBuilderStartPage` only renders a Cancel button during `installing`/`launching` (`team-builder-start.page.html:160, 235`), and Home only renders Dismiss on terminal rows (`setup-runs-list.component.ts:289`), so an abandoned `needs-input` team-builder run keeps `attentionCount() >= 1` and hijacks `openSetup()` until the user either completes launch or cancels during launch.

### 3. What input data makes this produce a wrong answer rather than an error?
- **An `analysis` `runId` passed in `?analysis=<runId>` without a `skill-review`/`analysis` `tab` (`analyze-skills.page.ts:580-606`):** Treated as a directory slug and sent to `wizard:load-analysis`, failing even when the analysis and `skill-review.json` exist (Finding 3).
- **A `workspaceRoot` with a trailing `/` or `\` (`harness-chat-launcher.service.ts:66-69`, `team-builder-run.coordinator.ts:637, 968, 1427`):** `SetupRunStore` normalizes it while `TeamBuilderRunCoordinator` keeps it raw, causing ownership comparisons to fail (Finding 5).
- **Re-running a completed `analysis` record (`setup-run.store.ts:496`):** Copies the previous analysis's output `analysisRunId` onto the new `analysis` record (Finding 7).
- **Opening a `failed` `analysis` row from Home after reload or after a newer run (`analyze-workspace.page.ts:691-706`):** Displays idle Start or the newer run's completed result instead of the failed record's error (Finding 8).

### 4. What happens when a dependency fails, times out, or returns a shape it should not?
- **`wizard:get-resumable-run` fails:** `WizardRpcService.getResumableRun()` returns `{ analysis: null, generation: null }` (`analysisActive: undefined`). Existing records retain last known status (safe), and Batch 16 will add surfaced discovery failure + Retry.
- **`wizard:install-skills-with-consent` fails / `keepSelected` fails / cancels:** Both production callers (`TeamBuilderRunCoordinator:704-709`, `AnalyzeSkillsPage:1234-1248`) pass `workspacePath` + unique `installRunId` and validate normalized reply `workspacePath` before mutating state; `cancelled: true` never launches chat or marks installed. No other callers of `wizard:install-skills-with-consent` exist across `libs/` or `apps/` (verified via `grep`). Known Batch 17b Minor 3 (malformed late reply missing `installed` array) and Minor 2 (`AnalyzeSkillsPage` omitting confirmed names from error copy) remain open.
- **Bound-run state lookup fails (`readBoundState`):** Keeps last known status and retries via poll/watchdog (`setup-run-attempt.ts:275-286`, `generation-workflow.store.ts:444-454`).
- **Chat send fails or is cancelled during `TeamBuilderRunCoordinator.handoffDirect`:** Preserves `installed`, respects `TabManagerService` close guards on parked tabs, and settles on `review` with error (except when trailing-separator path mismatch skips the store report — Finding 5).

### 5. What is missing that the requirements never mentioned?
- **Cross-workspace runner completion routing (`SetupRunAnalysisCoordinator.syncFromRunner`):** Requirements specified per-workspace records and leaving Setup without cancelling, but did not explicitly call out that `WizardAnalysisRunner` is a single root service whose completion can arrive while *another* workspace is active in `SetupRunStore` (Finding 1).
- **Lifecycle ownership for "navigate to guidance without starting yet":** Plan section 3 says `project-guidance` has no `needs-input` state ("takes no input after start"), while `AnalyzeSkillsPage.continueToGuidance()` created a `running` record on navigation before the user clicked "Start guidance" — leaving a 7.5 s race with `SetupRunBoundCoordinator`'s orphan grace (Finding 2).
- **Cancelling an abandoned `needs-input` `team-builder` run:** Plan section 3 specifies `cancelled -> team-builder at intent`, and rule 2 allows Cancel on `needs-input`, but `TeamBuilderStartPage` only exposes Cancel during `installing`/`launching`, leaving no UI way to cancel/clear an unwanted `needs-input` draft from `attentionCount` / `openSetup()`.

---

## Cross-Batch Contract Audit (5 Focus Areas)

| Focus Area | Assessment | Gaps Found |
| --- | --- | --- |
| 1. One `SetupRunStore` lifecycle across all 5 run kinds (no chat-tab mixing) | Tab-free isolation holds across analysis, skill-review, agent-generation, and project-guidance; D3 `handoffTabId`-only contract holds for team-builder. Lifecycle transitions have cross-batch breaks. | Findings 1, 2, 5, 7 |
| 2. Persistence / hydration consistency (`setup-run-record.ts`, sidecar, Home list) | `ptah.setup-runs.v1` schema validation, `guidanceHandoff` persistence, and `skill-review.json` round-trip are clean. Sidecar consolidation is pending Batch 16; dismissal leaks sidecar entries; post-install re-attach wipes recovery. | Findings 6, 9; Batch 16 item 5 (known) |
| 3. Concurrency (multi-workflow, workspace switch, reload mid-run) | Two runs of different kinds in one workspace isolate cleanly. Workspace switches break analysis completion and `ProjectGuidancePage`; reload breaks analysis without a resumable manifest. | Findings 1, 4, 5 |
| 4. Home list vs run pages agreement | Mostly consistent via `stepTarget` and reactive signals, but diverges on unstarted guidance from Skills, wedged/failed analysis, five `analyze/skills` return links, and `"agents installed"` copy. | Findings 1, 2, 3, 8 |
| 5. Consent-install contract across all callers | Verified via repo-wide grep: only two production callers exist (`TeamBuilderRunCoordinator:704`, `AnalyzeSkillsPage:1235`). Both pass `workspacePath` + unique `installRunId` and validate normalized reply `workspacePath`. | No new Major; Batch 17b Minors 1–4 confirmed open |

---

## Known Open Items Confirmed Still Open (Not Re-reported as New)

- **Pending Batch 16 (`batches.md:568-582`):**
  1. Completed disk-only analysis adoption into `SetupRunStore` / Home list (still absent in `setup-run-analysis.coordinator.ts:62-63`).
  2. Persisted dismissal markers preventing passive re-adoption of dismissed checkpoints (still absent in `setup-run-persistence.ts` and `setup-run.store.ts:406-411`).
  3. Store-owned saved-analysis discovery failure + Retry on Home (`wizard-rpc.service.ts:398-420` still swallows discovery errors into empty evidence).
  4. Home row context for checkpoint agents-written count and saved-analysis freshness state/reason.
  5. `SetupRunStore.report` / `applyReportFields` (`setup-run-record.ts:33-38`) preserving optional `teamBuilder` recovery fields (`selectedIds`, `ownerDecision`, `installCompleted`, `hadAttachments`).
- **Pending Batch 14 (`batches.md:606-630`):**
  - Wiring `SETUP_RUN_ENTRY` provider and switching `generationRouteTabValidator` from `TabManagerService` to `SetupRunStore` in `app.config.ts`; deleting `onboardingGenerationTarget` and `bound-generation-tab.ts`; auditing remaining `WorkflowKind` setup members.
- **Open Per-Batch Minors confirmed still present:**
  - **Batch 8:** `OnboardingFocusRouter.focus()` does not verify the workspace switch landed (`onboarding-focus-router.service.ts:30-32`); `ProjectGuidancePage.openRoute` does not reset `lookupError` (`project-guidance.page.ts:607-611`); legacy saved guidance with no record shows idle start view.
  - **Batch 9:** Queued state on `AnalyzeDonePage` renders `<ptah-agent-next-steps>` `@else` Continue button above the queued notice (`analyze-done.page.ts:65-95`); O(n²) transcript replay in `agent-generation-run.page.ts` / `project-guidance.page.ts`.
  - **Batch 11:** Minor 10 — final-row dismissal focuses `#skipButton` instead of `#onboarding-home-title` (`onboarding-home.component.ts:114`). *(Minors 11–12 were fixed by coordinator: `type="button"` on Show all and hiding `0` count.)*
  - **Batch 15:** Minors 1–4 (`setup-run.store.ts` at 694 lines ahead of Batch 16; `resolveBlockedStart` placed among private methods at `:590-598`; 7 internal coordination delegates unmarked `@internal`; `applyReportFields` widens `StoredSetupRunRecord` to `SetupRunRecord`).
  - **Batch 17b:** Minors 1–4 (`TeamBuilderRunCoordinator.invalidateForWorkspace` and `AnalyzeSkillsPage` do not send `wizard:cancel-skill-install` on workspace switch; `AnalyzeSkillsPage` omits confirmed `installed` names from failure/cancel copy and lacks frontend `keepSelected`-failure specs; `recordStoppedInstall` lacks `Array.isArray(result.installed)` guard; Windows case/slash asymmetry between `sameWorkspaceRoot` and `normalizeSetupWorkspacePath`).

---

## Checks Run

All commands were executed read-only against the worktree with logs saved under `.ptah/tmp/`:

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Jest (`setup-wizard`, 4 suites) | `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath setup-run.store.spec.ts setup-run-persistence.spec.ts setup-run-steps.spec.ts generation-handoff.store.spec.ts` | **PASS** — 4/4 suites, **228/228 tests** | `.ptah/tmp/phase-c-jest-setup-wizard.log` |
| Jest (`onboarding`, 14 suites) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath <14 Phase C specs>` | **PASS** — 14/14 suites, **291/291 tests** | `.ptah/tmp/phase-c-jest-onboarding.log` |
| Jest (`rpc-handlers`, 4 suites) | `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath setup-rpc-skill-install.spec.ts setup-rpc.schema.spec.ts skills-sh-rpc.handlers.spec.ts workspace-authorization.spec.ts` | **PASS** — 4/4 suites, **122/122 tests** | `.ptah/tmp/phase-c-jest-rpc.log` |
| TypeScript (`setup-wizard`, `onboarding`, `rpc-handlers` lib) | `npx tsc --noEmit --project <project>/tsconfig.lib.json` | **EXIT 0** on all 3 projects | `.ptah/tmp/phase-c-tsc-{sw,ob,rpc}.log` |
| ESLint (22 Phase C source files) | `npx eslint <22 files>` | **EXIT 0** — 0 errors, 7 pre-existing warnings (`max-lines`, `preserve-caught-error`, `explicit-member-accessibility`) | `.ptah/tmp/phase-c-eslint.log` |
| Degradation audit | `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` | **EXIT 0** — `TOTAL 0 unsuppressed site(s)` | `.ptah/tmp/phase-c-degradation.log` |

### Tool Fallbacks & Residual Uncertainty
- `ptah_search_files` returned 0 hits for `.ptah/specs/TASK_2026_2330_2fc3/*` (hidden directory); used `ls` for directory listing and `grep -rn` for free-text RPC method string searches (`wizard:install-skills-with-consent`, `wizard:cancel-skill-install`, `wizard:load-analysis`, `wizard:get-resumable-run`).
- Renderer AOT template typecheck (`-t typecheck-templates -p ptah-extension-webview`) and live Electron visual/interaction testing remain coordinator/Phase D checks outside permitted lane commands.

---

## Verdict

- **Recommendation:** **REVISE** (**5/10**)
- **Confidence:** **HIGH**
- **Top risk:** Permanent workspace analysis deadlock when an analysis completes after a workspace switch or reloads without a resumable manifest (Finding 1), paired with phantom interrupted guidance runs from `AnalyzeSkillsPage.continueToGuidance()` (Finding 2) and broken `analyze/skills` return links from Agent Generation / Done / Analyze (Finding 3).
- **Required before Phase C sign-off:** Fix Findings 1–6 with cross-batch regression specs (covering background workspace-switch completion + reload `analysisActive: false` reconciliation, `continueToGuidance` without phantom orphan interruption, `AnalyzeSkillsPage` accepting `agent-generation` `tab` / `runId` return links, `ProjectGuidancePage` workspace-switch reactivity, trailing-separator normalization in `TeamBuilderRunCoordinator`, and team-builder post-install "Re-attach files" / interrupted "Continue without attachments" recovery). Findings 7–9 are low-effort Minors that can land in the same fix pass or alongside Batch 16.
