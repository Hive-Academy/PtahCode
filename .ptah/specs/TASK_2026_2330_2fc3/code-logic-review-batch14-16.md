# Code Logic Review — `TASK_2026_2330_2fc3` (Batch 14 & Batch 16, commit `7920ac82d7`)

Review family: antigravity | Implementer family: codex | Worktree: `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 5/10                                 |
| Verdict             | REVISE                               |
| Blocking issues     | 2                                    |
| Serious issues      | 2                                    |
| Moderate issues     | 3                                    |
| Minor issues        | 1                                    |
| Failure modes found | 7                                    |

**Score calibration:** **5/10 (real gaps — REVISE)**. This sits below the 7–8 (sound) band because two Blocking logic/security defects survive unit tests due to mocked boundaries: (1) explicitly resuming a dismissed bound `agent-generation` checkpoint fails on the real backend with `blocked (ownerTabId)` and misleads the user into a phantom `"Generating agents…"` running screen, and (2) `SetupRpcHandlers.analysisWorkspaceRoot` accepts arbitrary subdirectories (and lexical symlink escapes / whitespace paths under `cwd`) rather than exact open workspace roots. Two Serious defects (single-slot `checkpoint` signal wiped across workspace switches / transient errors, and `setup.error()` poisoning Canvas/Chat 2-check readiness inconsistently) reinforce the 5–6 band. It sits above 3–4 because Defect 1 (`SETUP_RUN_ENTRY` wiring in real `app.config.ts`), Defect 3a/3b fixes, dead-symbol removals, saved-analysis discovery with Retry and last-known data retention, `teamBuilder` recovery field preservation, and all 9 TypeScript / 740 Jest / ESLint checks are sound at the foundation.

## Five logic questions

### 1. How does this fail silently?

1. **Reopened dismissed generation checkpoint silently fails to resume and renders a fake running state** (`libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:277-315`, `:459-475`, `:484-506`; `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts:454-478`; `libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts:392-399`). `reopenDismissedCheckpoint` assigns a fresh `id: newRunId()`, so the backend rejects `resume: true` with `blocked` + `ownerTabId: <orig-id>`. `resolveBlockedStart` adopts `<orig-id>` as `status: 'running', backendRunId: null` without starting a resume or reconciling, and the page navigates to `<orig-id>` showing `"Generating agents…"` while nothing is running on the backend until the 5 s orphan grace reverts it to `interrupted`, leaving two duplicate interrupted records.
2. **Stale dismissal marker drops pushes after explicit reopen** (`libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:355-361`; `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-dismissals.ts:23-64`). Dismissal markers are never cleared on explicit reopen (`reopenDismissedCheckpoint`) or explicit analysis resume (`analyze-workspace.page.ts:1224`). Any generation push carrying `<orig-id>` before `<orig-id>` exists in `_index` is silently discarded by `adoptPushedRun`.
3. **Transient `getResumableRun` error silently removes `"Open saved agent generation"`** (`libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:399-424`; `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:219-224`). `getResumableRun` catches RPC failures and returns `{ analysis: null, generation: null }`, causing `adoptResumableGeneration` to execute `this.checkpoint.set(null)` with no error state or Retry.
4. **In-session and completed agent-generation runs silently omit `agentsWritten`** (`libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-attempt.ts:185-233`). `agentsWritten` is populated only from `wizard:get-resumable-run` (`setup-run-bound.coordinator.ts:232-239`), never from `SetupGenerationRunState.result.counts.written`, so Home rows omit the written-agent count for completed runs (never returned as resumable) and for in-session failures/interruptions until reload.

### 2. What user action produces unexpected behaviour?

1. **Dismiss an interrupted agent-generation run, click `"Open saved agent generation"`, then click `Resume`:** On arrival at `/onboarding/analyze/generate?tab=<new-id>`, `wizard:get-generation-run-state` returns `{ run: null }` because `locateBound` checks `manifest.tabBinding?.tabId === binding.tabId` (`wizard-generation-checkpoint.service.ts:316`). Clicking `Resume` sends `<new-id>`, triggers backend `blocked (ownerTabId: <orig-id>)`, switches the URL to `<orig-id>` showing `"Generating agents…"`, never runs generation, and after 5 s leaves two `Interrupted` rows on Setup Home.
2. **Dismiss an interrupted agent-generation run from the current session (before any `get-resumable-run` refresh), or switch Workspace A → Workspace B → Workspace A:** `"Open saved agent generation"` is missing immediately after in-session dismiss (`checkpoint` is `null`), and switching A → B clears `checkpoint` (`setup-run-bound.coordinator.ts:221`), wiping Workspace A's reopenable checkpoint until A's async `getResumableRun` succeeds again.
3. **Open Canvas when Skills + Project scan are both ready (`2/2`) while `setup-status:get-status` fails:** Canvas displays `"Readiness unavailable [Retry]"` (`canvas-empty-board.component.ts:199`, `workspace-vitals.store.ts:293`) while Chat hides readiness cleanly (`chat-empty-state-screen.component.ts:113`), even though agents were excluded from readiness.
4. **Cancel a running analysis and switch workspaces while cancel is in flight:** `SetupRunAnalysisCoordinator.cancel()` (`setup-run-analysis.coordinator.ts:239`) calls `getResumableRun()` without `record.workspacePath`, checking `analysisActive` against the *new* workspace instead of the cancelled run's workspace.

### 3. What input data produces a wrong answer?

1. **Subdirectory, symlink-inside-workspace, or whitespace `workspacePath` on analysis RPCs** (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:824-834`; `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts:15`). `analysisWorkspaceRoot` uses `isAuthorizedWorkspace` (`isPathWithinRoots`) instead of `findOpenWorkspaceRoot`, so `/open-ws/subdir`, `/open-ws/symlink-to-other-ws`, and `"   "` (when `process.cwd()` is inside an open folder) are accepted instead of throwing `UNAUTHORIZED_WORKSPACE`, and `wizard:load-analysis` (`:999`) will even write `CLAUDE.md` inside that subdirectory via `AnalysisClaudeMdLinker.link`.
2. **Older host omitting `savedRun` on `wizard:analysis-status` and `runId` on `wizard:list-analyses`** (`libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-saved-analysis.ts:95-103`). `read()` throws `DISCOVERY_ERROR` permanently whenever `completed.runId` is absent, even though `SavedAnalysisMetadata.runId` is declared optional for older hosts (`libs/shared/src/lib/types/wizard/steps.ts:14-15`) and `recover()` (`:206-217`) explicitly falls back to `loadAnalysis`.
3. **Legacy v3 manifest with empty `runId: ""`** (`libs/backend/agent-generation/src/lib/types/multi-phase.types.ts:108`; `setup-run-saved-analysis.ts:81,101`). `MultiPhaseManifestV3Schema` accepts `runId: z.string()` (empty allowed); `read()` falls through to `listAnalyses` and throws `DISCOVERY_ERROR` on Retry indefinitely.
4. **Explicit `undefined` optional property in `SetupRunStore.report(id, { teamBuilder })`** (`libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-record.ts:39-44`). Spreading `...update.teamBuilder` over `...record.teamBuilder` overwrites a preserved field (`ownerDecision`, `installCompleted`, `hadAttachments`) if a caller includes a key with value `undefined` rather than omitting it.

### 4. What happens when a dependency fails?

1. **`wizard:analysis-status` rejects or returns `reason: 'unreadable'`, or `wizard:list-analyses` rejects during discovery:** Handled well in `SetupRunSavedAnalysis.discover()` (`setup-run-saved-analysis.ts:36-65`): existing records and freshness are preserved, fixed user-facing `DISCOVERY_ERROR` is stored per normalized workspace path, concurrent reads coalesce, and Retry clears only that workspace's error on success.
2. **`wizard:get-resumable-run` fails:** `WizardRpcService.getResumableRun` (`wizard-rpc.service.ts:399-424`) returns `{ analysis: null, generation: null }`, which preserves existing records in `_index` but wipes `SetupRunBoundCoordinator.checkpoint` (`setup-run-bound.coordinator.ts:221`), silently hiding dismissed-checkpoint reopen.
3. **`setup-status:get-status` fails:** `SetupStatusStore.error` is set (`setup-status.store.ts:234,240`). Setup Home replaces only its status chips with `"Status unavailable"` + Retry (`onboarding-home.component.ts:201-221`, good), **but** Canvas (`workspace-vitals.store.ts:293`) and Chat (`chat-empty-state-screen.component.ts:119`) also treat this unrelated agent-status failure as `"Readiness unavailable"`.
4. **`localStorage` throws on read or write:** Read returns `{ index: {}, corrupt: true }` and schedules rewrite (`setup-run-persistence.ts:365-371`, `setup-run.store.ts:205`); write warns and keeps in-memory state (`setup-run-persistence.ts:447-457`).
5. **`SETUP_RUN_ENTRY` token absent (VS Code / test host) or `openSetup()` returns `'failed'` / rejects:** `ElectronShellComponent.openSetupHub()` (`electron-shell.component.ts:896-942`) falls back to Setup Home via `SurfaceRouterService.navigateToSurface('onboarding')` when on a Setup child route, or `appState.setCurrentView('onboarding')` from another surface, guarded by `shellNavigationId`, `lastSuccessfulNavigation()?.id`, and `canSwitchViews()`.

### 5. What is missing that the requirements never mentioned?

1. **Identity preservation across dismiss → reopen for bound backend checkpoints:** Backend `wizard:submit-selection` (`resume: true`) and `wizard:get-generation-run-state` both enforce `manifest.tabBinding.tabId === binding.tabId`. Any UI reopen path for a bound checkpoint must reuse the checkpoint's owning `tabId` (or the backend must expose `ownerTabId` on `ResumableGenerationRun`) and clear the dismissal marker when the user explicitly reopens/resumes it.
2. **Bounded persistence for `dismissals`:** `byWorkspace` is capped at 20 records per workspace (`setup-run-persistence.ts:27`), but `dismissals` (`setup-run-persistence.ts:86-105,437`) has no cap at all and grows forever in `localStorage`.
3. **Coalescing race between manual `retrySavedAnalysis` and `SetupRunStore.reconcile()`:** If Retry is clicked while `reconcile()` is still awaiting `getResumableRun`, `reconcile()` coalesces onto the in-flight `discover()` promise (`setup-run-saved-analysis.ts:39-40`) that may have already called `observe()` before `analysis.reconcile()` inserted the interrupted analysis record, leaving `analysisFreshness` unset on that interrupted row until the next refresh.

## Failure modes

### FM-1: Dismissed bound agent-generation reopen rejected by backend `ownerTabId` guard
- Trigger: User dismisses an interrupted bound `agent-generation` run (`setup-ORIG`), clicks `"Open saved agent generation"`, then clicks `Resume`.
- Symptom: Page initially cannot read run state (`locateBound` returns `null`), then `Resume` navigates to `/onboarding/analyze/generate?tab=setup-ORIG` displaying `"Generating agents…"` while no backend run executes; 5 s later it flips back to `Interrupted` leaving two duplicate rows (`setup-ORIG` and `setup-NEW`) in Setup Home.
- Evidence: `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:277-315`, `:459-475`, `:484-506`; `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts:454-478`; `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-checkpoint.service.ts:96-107`, `:314-322`.
- Current handling: `reopenDismissedCheckpoint` generates a new random record id (`newRunId()`); `sendBoundStart` catches `blocked`, adopts `ownerTabId` as `running` without retrying, and returns `owner`. Dismissal marker is never cleared.
- Recommendation: Expose `ownerTabId` (from `manifest.tabBinding?.tabId`) on `ResumableGenerationRun` and reuse it in `insertCheckpoint` when valid and unclaimed; clear the dismissal marker on explicit reopen/resume.

### FM-2: Subdirectory / lexical-symlink escape on workspace-pinned analysis RPCs
- Trigger: Caller passes a subdirectory of an open folder (e.g. `/open-ws/sub`), a symlink inside an open folder pointing to another workspace (`/open-ws/link -> /other-ws`), or whitespace `"   "` (when `cwd` is inside an open folder) as `workspacePath` to `wizard:get-resumable-run`, `wizard:analysis-status`, `wizard:list-analyses`, or `wizard:load-analysis`.
- Symptom: Backend authorizes and reads `.ptah/analysis` from the subdirectory or symlink target (another workspace), and `wizard:load-analysis` executes `AnalysisClaudeMdLinker.link(workspaceRoot)` writing `CLAUDE.md` there.
- Evidence: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:824-834`, `:994-1002` vs `:1440-1448`; `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts:15`; `libs/backend/platform-core/src/utils/path-containment.ts:22-26`.
- Current handling: Uses `isAuthorizedWorkspace` (lexical descendant check) and returns the raw caller string.
- Recommendation: Use `findOpenWorkspaceRoot(workspacePath, this.workspaceProvider)` (already imported at `setup-rpc.handlers.ts:87`) to require an exact open workspace root and return its canonical host spelling; trim `workspacePath` in `setup-rpc.schema.ts:15`.

### FM-3: Global single-workspace `checkpoint` signal cleared on workspace switch or transient RPC error
- Trigger: User dismisses a generation checkpoint in Workspace A, switches to Workspace B (no checkpoint), then switches back to A (or `getResumableRun(A)` transiently fails). Or user dismisses an in-session interrupted generation run before a `getResumableRun` refresh.
- Symptom: `"Open saved agent generation"` disappears on Setup Home even though a resumable checkpoint exists on disk and was dismissed.
- Evidence: `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:47-50`, `:215-281`; `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:399-424`.
- Current handling: Single `signal<{ workspace; generation } | null>` overwritten with `null` whenever any workspace has `resumable.generation == null`.
- Recommendation: Key discovered checkpoints per normalized workspace in a `ReadonlyMap<string, ResumableGenerationRun>`; preserve last-known entry on transport error; seed/refresh on dismissing an interrupted generation run.

### FM-4: Failed agent-status RPC triggers `"Readiness unavailable"` on Canvas and Chat
- Trigger: `setup-status:get-status` fails while `PluginCatalogService` (`skillsReady`) and `wizard:list-analyses` (`scanReady`) succeed.
- Symptom: On Canvas, even when `Skills` and `Project scan` are `2/2` (`allReady === true`), Canvas renders `"Readiness unavailable [Retry]"` while Chat hides readiness. When `< 2/2`, both Canvas and Chat display `"Readiness unavailable"` for a check they no longer show.
- Evidence: `libs/frontend/chat/src/lib/services/vitals/workspace-vitals.store.ts:280-298`; `libs/frontend/canvas/src/lib/canvas-rail/canvas-empty-board.component.ts:198-229`; `libs/frontend/chat/src/lib/components/molecules/setup-plugins/chat-empty-state-screen.component.ts:113-130`; `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/setup-status.store.ts:142-157,214-245`.
- Current handling: Both `WorkspaceVitalsStore.readiness().unavailable` and `ChatEmptyStateViewComponent` still inspect `setup.error()`.
- Recommendation: Gate Canvas and Chat readiness availability only on `scanError()`, `workspaceNotOpen()`, and `catalog.error()` (keeping `setup.error()` exclusively on Setup Home where the agents chip renders).

### FM-5: Analysis cancel checks `getResumableRun()` on the wrong workspace after a switch
- Trigger: User cancels an active analysis and switches workspaces before `cancel()` calls `getResumableRun()`.
- Symptom: `analysisActive` is read from the newly active workspace instead of `record.workspacePath`, causing false cancel confirmation or false cancel refusal.
- Evidence: `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts:232-243`.
- Current handling: Calls `await this.rpc.getResumableRun()` with no `workspacePath`.
- Recommendation: Pass `record.workspacePath` (`await this.rpc.getResumableRun(record.workspacePath)`).

### FM-6: Live/completed agent-generation runs never populate `agentsWritten`
- Trigger: Agent generation completes, fails, or is interrupted during the current session without a subsequent `get-resumable-run` adoption.
- Symptom: Setup Home row omits `"N agents written"` for in-session failures/interruptions (until reload) and permanently omits it for completed runs.
- Evidence: `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-attempt.ts:185-233`; `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:232-239`.
- Current handling: Only `adoptResumableGeneration` computes `agentsWritten`.
- Recommendation: Populate `agentsWritten` from `run.result?.counts?.written` in `SetupRunAttempts.observation()` and `applyReportFields()`.

### FM-7: Unbounded `dismissals` persistence and older-host discovery hard-failure
- Trigger: Repeated dismissals across workspaces over time, or running against a host whose `wizard:analysis-status` omits `savedRun` and `wizard:list-analyses` omits `runId`.
- Symptom: `ptah.setup-runs.v1` grows without bound; older hosts display a permanent `"Could not check for saved workspace analyses."` alert on every Retry.
- Evidence: `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts:86-105,434-439`; `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-saved-analysis.ts:95-103`.
- Current handling: `dismissals` has no cap; `read()` throws `DISCOVERY_ERROR` when `completed.runId` is missing instead of falling back to `loadAnalysis(completed.filename, workspacePath)`.
- Recommendation: Cap persisted dismissals (e.g., per workspace or bounded total with FIFO eviction); fall back to `loadAnalysis(completed.filename, workspacePath)` when `completed.runId` is absent.

## Blocking issues

### B1. Explicit resume of a dismissed bound agent-generation checkpoint fails against the real backend and misleads the user into a phantom running state

- File: `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:277-315`, `:459-475`, `:484-506`; `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-checkpoint.service.ts:96-107`, `:314-322`; `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-rpc.handlers.ts:454-478`; `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:355-361`
- Scenario:
  1. A bound `agent-generation` run (`id: 'setup-ORIG'`) writes `generation-manifest.json` containing `tabBinding: { tabId: 'setup-ORIG', workflow: 'setup-agent-generation', workspacePath }` (`wizard-generation-checkpoint.service.ts:193-195`) and is interrupted.
  2. The user dismisses `setup-ORIG` on Setup Home (`setup-run.store.ts:473-479`). Only `{ workspacePath, workflow, backendRunId }` is persisted; `'setup-ORIG'` is lost.
  3. The user clicks `"Open saved agent generation"` (`setup-runs-list.component.ts:286-290`). `reopenDismissedCheckpoint` calls `insertCheckpoint` (`:290-315`), creating a new record `'setup-NEW'` (`id: newRunId()`, `backendRunId: 'gen-1'`).
  4. On `/onboarding/analyze/generate?tab=setup-NEW`, `wizard:get-generation-run-state` returns `{ run: null }` because `locateBound` checks `manifest.tabBinding?.tabId === binding.tabId` (`wizard-generation-checkpoint.service.ts:316`).
  5. When the user clicks **Resume**, `SetupRunStore.retry('setup-NEW')` sends `wizard:submit-selection { resume: true, tabBinding: { tabId: 'setup-NEW', ... } }`. The real backend (`wizard-generation-rpc.handlers.ts:454-478`) sees `'setup-ORIG' !== 'setup-NEW'` and rejects with `{ success: false, rejection: { reason: 'blocked', ownerTabId: 'setup-ORIG' } }`.
  6. `sendBoundStart` (`:459-475`) calls `resolveBlockedStart` (`:484-506`), which adopts `'setup-ORIG'` as `status: 'running', backendRunId: null` and returns early at `:492` (`owner.id !== binding.tabId`) without starting the resume or reconciling, while reverting `'setup-NEW'` to `status: 'interrupted'`.
  7. `AgentGenerationRunPage.resume()` (`agent-generation-run.page.ts:395-399`) navigates to `/onboarding/analyze/generate?tab=setup-ORIG`, displaying `"Generating agents…"` while nothing is running on the backend. After 5 s (`ORPHAN_GRACE_MS`), polling reconciles `'setup-ORIG'` back to `interrupted`, leaving two duplicate interrupted records (`setup-ORIG` and `setup-NEW`) on Setup Home. In addition, the dismissal marker for `'gen-1'` is never cleared, so `adoptPushedRun` (`setup-run.store.ts:358`) drops any pushed event whose `tabBinding.tabId` is not currently in `_index`.
- Impact: Breaks Batch 16 Acceptance #2 ("explicit resume stays available") in Electron production; users clicking Resume see a fake running spinner and duplicate interrupted rows instead of resuming their checkpoint.
- Fix:
  1. Include `ownerTabId?: string` (from `manifest.tabBinding?.tabId`) in `ResumableGenerationRun` (`libs/shared/src/lib/types/rpc/rpc-setup.types.ts:383-391`) and `toResumableGenerationRun` (`wizard-generation-checkpoint.service.ts:96-107`).
  2. In `SetupRunBoundCoordinator.insertCheckpoint` (`setup-run-bound.coordinator.ts:290-315`), reuse `generation.ownerTabId` as `record.id` when `isOnboardingIdentityValue(generation.ownerTabId)` and no conflicting record uses that id (falling back to `newRunId()` only for legacy unbound checkpoints).
  3. Add `SetupRunDismissals.clear(workspace, workflow, runId)` (persisted via `scheduleWrite()`) and invoke it on `reopenDismissedCheckpoint` (and when an explicitly resumed analysis claims a `backendRunId`).
  4. Add a store/handler contract test that enforces the backend's `ownerTabId` ownership check on `startBoundAgents(..., true)` so mismatched `tabId` is caught.

### B2. `SetupRpcHandlers.analysisWorkspaceRoot` authorizes arbitrary subdirectories and lexical symlink escapes instead of exact open workspace roots

- File: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:824-834` (called by `:697`, `:807`, `:921`, `:957`) and `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts:15`
- Scenario:
  1. `analysisWorkspaceRoot` calls `isAuthorizedWorkspace(workspacePath, this.workspaceProvider)` (which checks lexical containment via `isPathWithinRoots`, permitting any descendant directory inside an open folder) and returns the raw caller-supplied `workspacePath`. By contrast, `registerInstallSkillsWithConsent` in the exact same file (`:1440-1448`) uses `findOpenWorkspaceRoot` (already imported at `:87`) to require an exact open workspace root (`sameWorkspaceRoot`) and return the host's canonical folder string.
  2. Because `isPathWithinRoots` is purely lexical (`libs/backend/platform-core/src/utils/path-containment.ts:22-26`), a symlink inside an open workspace pointing to another workspace (`/open-ws/link -> /other-ws`) passes `isAuthorizedWorkspace` and allows reading `/other-ws/.ptah/analysis/` via all four RPCs — and on `wizard:load-analysis` (`:994-1002`), triggers `AnalysisClaudeMdLinker.link(workspaceRoot)`, writing `CLAUDE.md` inside that target directory.
  3. Any nested subdirectory `/open-ws/sub` is also accepted instead of rejecting with `UNAUTHORIZED_WORKSPACE`.
  4. `setup-rpc.schema.ts:15` omits `.trim()` on `workspacePath`. When `process.cwd()` is inside an open folder, `"   "` resolves under `cwd`, passes `isPathWithinRoots`, and is returned uncanonicalized.
- Impact: Violates the workspace-pinning boundary ("backend workspace-pinned reads cannot read another workspace") and exposes `wizard:load-analysis` to writing `CLAUDE.md` in arbitrary subdirectories / symlink targets.
- Fix:
  1. Change `analysisWorkspaceRoot` (`setup-rpc.handlers.ts:824-834`) to use `findOpenWorkspaceRoot(workspacePath, this.workspaceProvider)` and return that canonical open folder root, throwing `RpcUserError('Access denied: workspace path is not an open folder.', 'UNAUTHORIZED_WORKSPACE')` when `workspacePath` is supplied and no open root matches.
  2. Trim `workspacePath` in `setup-rpc.schema.ts:15` (`z.string().trim().min(1).max(4096).optional()`).
  3. Add unit tests in `setup-rpc.handlers.spec.ts` verifying that subdirectories of an open workspace and whitespace-only `workspacePath` are rejected with `UNAUTHORIZED_WORKSPACE` / `INVALID_PARAMS` across all four RPCs.

## Serious issues

### S1. `SetupRunBoundCoordinator.checkpoint` is a single global signal, so workspace switches, transient RPC failures, or in-session dismissals hide `"Open saved agent generation"`

- File: `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-bound.coordinator.ts:47-50`, `:215-281`; `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts:399-424`
- Scenario:
  1. `checkpoint` stores a single `{ workspace, generation } | null`. Switching from Workspace A (dismissed checkpoint) to Workspace B (no checkpoint) runs `adoptResumableGeneration(B, ...)` → `this.checkpoint.set(null)` (`:221`), erasing Workspace A's checkpoint.
  2. Returning to Workspace A leaves `"Open saved agent generation"` absent while `getResumableRun(A)` is in flight; if `getResumableRun(A)` transiently errors/times out, `WizardRpcService.getResumableRun` (`wizard-rpc.service.ts:417-423`) swallows the error and returns `{ analysis: null, generation: null }`, keeping `checkpoint` permanently `null` with no error or Retry.
  3. Dismissing an `agent-generation` run that became `interrupted` during the current session (without a subsequent `getResumableRun` call) leaves `checkpoint` as `null`, so `"Open saved agent generation"` does not render until a workspace switch or reload.
- Impact: Users who dismiss an interrupted agent generation lose the explicit reopen affordance on workspace switch, transient RPC failure, or immediately after in-session dismissal.
- Fix: Replace the single `checkpoint` signal with a per-workspace `signal<ReadonlyMap<string, ResumableGenerationRun>>` keyed by `normalizeSetupWorkspacePath(workspace)`; distinguish transport failures from a confirmed `{ generation: null }` response so last-known checkpoint state is retained on error; and populate or refresh the workspace's checkpoint entry when dismissing an interrupted `agent-generation` record with a valid `backendRunId`.

### S2. Failed `setup-status:get-status` (agent check) still triggers `"Readiness unavailable"` on Canvas and Chat, contradicting 2-check readiness

- File: `libs/frontend/chat/src/lib/services/vitals/workspace-vitals.store.ts:280-298`; `libs/frontend/canvas/src/lib/canvas-rail/canvas-empty-board.component.ts:198-229`; `libs/frontend/chat/src/lib/components/molecules/setup-plugins/chat-empty-state-screen.component.ts:113-130`
- Scenario: Batch 14 removed agents from `SetupStatusStore.readyCount()` and `allReady()` (now 2 checks: Skills + Project scan) while keeping `setup-status:get-status` for Setup Home's agents chip. However, `WorkspaceVitalsStore.readiness().unavailable` (`workspace-vitals.store.ts:293`) still includes `this.setup.error() !== null` (which is only set by `setup-status:get-status` failures at `setup-status.store.ts:234,240`), and `ChatEmptyStateViewComponent` (`chat-empty-state-screen.component.ts:119`) still checks `setup.error() || setup.scanError()`. Because `CanvasEmptyBoardComponent` evaluates `@if (ready.unavailable)` before `@else if (!ready.allReady)` (`canvas-empty-board.component.ts:199-218`), a failed `setup-status:get-status` when Skills and Project scan are both ready (`2/2`) causes Canvas to show `"Readiness unavailable [Retry]"` while Chat hides readiness as complete. When `< 2/2`, both surfaces falsely show `"Readiness unavailable"` even though both displayed checks succeeded.
- Impact: Visible false error banner on Canvas/Chat and inconsistent readiness state across Canvas vs Chat when `setup-status:get-status` fails.
- Fix: Remove `this.setup.error() !== null` from `WorkspaceVitalsStore.readiness` (`workspace-vitals.store.ts:293`) and `setup.error()` from `chat-empty-state-screen.component.ts:119` (use `setup.scanError()` and `catalog.error()` / `setup.workspaceNotOpen()`, keeping `setup.error()` only on `OnboardingHomeComponent.statusUnavailable`). Update the corresponding assertions in `workspace-vitals.store.spec.ts:530` and `chat-empty-state.component.spec.ts:173`.

## Moderate and minor issues

- **M1 (Moderate) — Unpinned `getResumableRun()` in `SetupRunAnalysisCoordinator.cancel()`:** `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts:239` calls `await this.rpc.getResumableRun()` without `record.workspacePath` (similarly `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:885` omits `this.workspacePath()`). A workspace switch during cancel reads `analysisActive` from the wrong workspace. Pass `record.workspacePath` to `getResumableRun`.
- **M2 (Moderate) — `agentsWritten` missing for live/completed agent-generation runs:** `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-attempt.ts:185-233` does not copy `run.result?.counts?.written` into `SetupRunReport`. Only `adoptResumableGeneration` (`setup-run-bound.coordinator.ts:232-239`) sets `agentsWritten`, so completed runs (excluded by `findLatestResumableRun`) and in-session failures/interruptions never show `"N agents written"` on Setup Home.
- **M3 (Moderate) — Older-host discovery hard-failure, Retry/reconcile coalescing gap, and unbounded `dismissals`:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-saved-analysis.ts:95-103` throws `DISCOVERY_ERROR` if `status.savedRun` is missing and `listAnalyses` omits `runId` (optional per `libs/shared/src/lib/types/wizard/steps.ts:14-15`), unlike `recover()` (`:206-217`) which falls back to `loadAnalysis`.
  - If `retrySavedAnalysis(workspace)` is in flight while `reconcile()` awaits `getResumableRun`, `reconcile()` coalesces onto the in-flight `discover()` promise (`setup-run-saved-analysis.ts:39-40`), so an interrupted analysis inserted by `analysis.reconcile()` can miss its `incomplete` freshness attachment until the next refresh.
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts:86-105,434-439` persists `dismissals` with no cap on array length, allowing unbounded growth in `localStorage`.
- **m1 (Minor) — Missing regression specs and host-open declined copy:**
  - `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts` lacks direct tests for `dismissals` persistence/filtering, `agentsWritten` validation, and `analysisFreshness` validation.
  - `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts` lacks tests for `applyReportFields` clearing `agentsWritten` / `analysisFreshness` when run identity changes, and for `ownerTabId`-checked generation resume.
  - `libs/frontend/setup-wizard/src/lib/services/setup-generation-open.handler.ts:58-61`: when `SETUP_RUN_ENTRY` is provided and `setup-agent-generation` has no active run, `openWorkflow` returns `'failed'`, setting `launchNotice` to `'Setup could not open. Try Continue again.'` even though fresh agent-generation starts are intentionally disabled.

## Data flow

### Path A: Renderer `SETUP_RUN_ENTRY` wiring & Setup tab (Batch 14)
1. `apps/ptah-extension-webview/src/app/app.config.ts:248` registers `{ provide: SETUP_RUN_ENTRY, useExisting: SetupRunEntryService }` and `:250-256` binds `generationRouteTabValidatorToken` to `SetupRunStore.canRestoreGenerationRoute` — **OK**.
2. `ElectronShellComponent` (`electron-shell.component.ts:802,817-828`) injects `SETUP_RUN_ENTRY`, reading `attentionCount()` and `runningCount()` directly into the Setup nav badge/dot and `aria-label` — **OK**.
3. Clicking Setup nav calls `openSetupHub()` (`:896-942`): delegates to `entry.openSetup()` → `SetupRunEntryService.openSetup()` (`setup-run-entry.service.ts:24-29`) → active run `stepTarget` or bare `/onboarding`; without token on a Setup child route, routes to `/onboarding` via `SurfaceRouterService` behind `canSwitchViews()` and navigation-supersession guards — **OK**.

### Path B: Readiness checks across Chat, Canvas, and Setup Home (Batch 14)
1. `SetupStatusStore` (`setup-status.store.ts:117-157`) computes `skillsReady()`, `scanReady()`, `readyCount()` (0–2), `allReady()` (`=== 2`), `nextAction()` (`'open-library' | 'run-setup' | null`), and separate `agentsReady()` — **OK**.
2. `ChatEmptyStateViewComponent` (`chat-empty-state-screen.component.ts:113-130,186-198`) renders 2-check `ReadinessRingComponent` and no `Generate agents` CTA — **GAP (S2)**: `:119` still triggers `"Readiness unavailable"` on `setup.error()`.
3. `WorkspaceVitalsStore` (`workspace-vitals.store.ts:280-298`) exposes 2 checks and no `generate-agents` action — **GAP (S2)**: `:293` sets `unavailable: true` on `setup.error()`, overriding `allReady: true` in `CanvasEmptyBoardComponent` (`:199`).
4. `OnboardingHomeComponent` (`onboarding-home.component.ts:381-409`) renders separate `scan` and `agents` chips and uses `status.error()` — **OK**.

### Path C: Saved-analysis discovery, freshness & Retry (Batch 16)
1. `SetupRunStore` activates workspace → `reconcile()` (`setup-run.store.ts:645-665`) calls `getResumableRun(workspace)`, `analysis.reconcile(workspace, resumable)`, `bound.adoptResumableGeneration(workspace, resumable)`, then `savedAnalysis.discover(workspace)` — **OK** (minor coalescing gap in **M3** if manual Retry overlaps `reconcile`).
2. Backend `wizard:analysis-status` / `wizard:list-analyses` / `wizard:get-resumable-run` / `wizard:load-analysis` resolve workspace via `analysisWorkspaceRoot(params.workspacePath)` (`setup-rpc.handlers.ts:824-834`) — **GAP (B2)**: accepts subdirectories and lexical symlink escapes via `isAuthorizedWorkspace` instead of `findOpenWorkspaceRoot`.
3. `SetupRunSavedAnalysis.read()` (`setup-run-saved-analysis.ts:74-110`) qualifies `savedRun`, attaches `analysisFreshness` to matching records or adopts latest completed analysis with both `backendRunId` and `analysisRunId`, deduplicated per normalized workspace and suppressed by `wasDismissed` — **OK** (older-host fallback gap in **M3**).
4. On failure, `errors` map stores fixed copy per workspace while retaining `_index` records; `SetupRunsListComponent` (`setup-runs-list.component.ts:138-155,281-284`) renders alert + Retry without refreshing the whole store — **OK**.

### Path D: Dismissal markers & explicit resume (Batch 16)
1. `SetupRunStore.dismiss(id)` (`setup-run.store.ts:473-479`) persists `{ workspacePath, workflow, backendRunId }` atomically inside `ptah.setup-runs.v1` and removes the record — **OK** (unbounded growth in **M3**).
2. Passive adoption in `SetupRunSavedAnalysis.observe`, `SetupRunAnalysisCoordinator.adopt`, `SetupRunBoundCoordinator.adoptResumableGeneration`, and `SetupRunStore.adoptPushedRun` consults `dismissals.has(...)` keyed by normalized workspace + workflow + backend run id — **OK** (no cross-workspace leak).
3. Explicit resume for analysis (`AnalyzeWorkspacePage.continuePrevious`) starts a new analysis record and calls `runner.resumeAnalysis(workspace)` — **OK** (except dismissal marker is never cleared if record is later lost).
4. Explicit resume for dismissed agent generation (`SetupRunsListComponent.reopenGeneration` → `SetupRunStore.reopenDismissedGeneration` → `SetupRunBoundCoordinator.reopenDismissedCheckpoint` → `AgentGenerationRunPage.resume` → `SetupRunStore.retry`) — **GAP (B1, S1)**: single global `checkpoint` wiped on workspace switch / transient RPC failure; reopened record uses a new random `tabId`, causing backend `locateBound` to return `null` and `wizard:submit-selection (resume: true)` to reject with `blocked (ownerTabId)`.

### Path E: Team Builder recovery fields in `SetupRunStore.report` (Batch 16)
1. `SetupRunReport.teamBuilder` (`setup-run-host.ts:23`) accepts optional `selectedIds`, `ownerDecision`, `installCompleted`, `hadAttachments` — **OK**.
2. `applyReportFields` (`setup-run-record.ts:36-45`) preserves omitted optional fields, copies arrays, and honors explicit `null`/`false` — **OK**.
3. `parseSetupRunRecord` (`setup-run-persistence.ts:292-326`) validates and round-trips all fields across reload — **OK**.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| B14: Provide `SETUP_RUN_ENTRY` in real `app.config.ts` (Defect 1) | COMPLETE | Verified in `app.config.ts:248` and `setup-run-entry-wiring.spec.ts:26-66`; route validator wired at `:250-256`. |
| B14: Remove `onboardingGenerationTarget`, `bound-generation-tab.ts`, dead setup-tab callers | COMPLETE | Deleted and zero production references remain across `apps/` and `libs/`; `WorkflowKind` setup members retained with documented history-label reason. |
| B14: Hide agent-generation new-start, no dead CTA, keep re-entry of existing runs, consistent readiness across chat/canvas/Home (Defect 2) | PARTIAL | No dead CTA and existing non-terminal runs re-enter cleanly, **but** `setup.error()` (agent check) still triggers `"Readiness unavailable"` on Canvas (overriding `allReady: true`) and Chat (**S2**). |
| B14: Setup tab works from Setup child routes (Defect 3a) | COMPLETE | Verified in `electron-shell.component.ts:896-942` and `electron-shell.setup-badge.spec.ts:410-423,493-510`. |
| B14: Remove stale `"bound session"` guidance subtitle (Defect 3b) | COMPLETE | Removed at `project-guidance.page.ts:492-519`, verified by spec at `:696-705`. |
| B16 #1: Completed disk analysis gets Home row + Review skills target, deduplicated by workspace and analysis identity | COMPLETE | Verified in `setup-run-saved-analysis.ts:74-173`, `setup-runs-list.component.ts:356-361`, `setup-run.store.spec.ts:792-814` (minor older-host fallback gap in **M3**). |
| B16 #2: Persisted dismissal markers stop passive re-adoption without leaking across workspaces; explicit resume stays available | PARTIAL | Passive suppression and workspace isolation work, **but** explicit resume of a dismissed bound agent-generation checkpoint fails against the real backend's `ownerTabId` check (**B1**), and workspace switch / transient RPC failure / in-session dismiss hides the reopen button (**S1**). |
| B16 #3: Store-owned saved-analysis discovery with per-workspace failure + Retry, retains last known data, no Home mount refresh | COMPLETE | Verified in `setup-run-saved-analysis.ts:12-65`, `setup-runs-list.component.ts:138-155,269-284`, `setup-run.store.spec.ts:816-853`. |
| B16 #4: Home row context for checkpoint `agentsWritten` and `analysisFreshness` state/reason | PARTIAL | `analysisFreshness` works end-to-end; `agentsWritten` works only for checkpoints loaded via `get-resumable-run` and is missing for live/completed runs (**M2**). |
| B16 #5: `SetupRunStore.report` preserves optional `teamBuilder` recovery fields | COMPLETE | Verified in `setup-run-host.ts:23`, `setup-run-record.ts:36-45`, `setup-run-persistence.ts:292-326`, `setup-run.store.spec.ts:958-990`. |
| B16 Security: Backend workspace-pinned reads cannot read another workspace | PARTIAL | Rejects out-of-workspace paths like `/not-open`, **but** accepts subdirectories and lexical symlink escapes inside an open folder via `isAuthorizedWorkspace` instead of `findOpenWorkspaceRoot` (**B2**). |

Implicit requirements not addressed:
- Preserving the backend checkpoint's `ownerTabId` across dismiss/reopen and clearing dismissal markers on explicit reopen/resume (**B1**).
- Pinning `SetupRunAnalysisCoordinator.cancel()`'s post-cancel `getResumableRun` check to `record.workspacePath` (**M1**).
- Bounding persisted `dismissals` in `localStorage` (**M3**).

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Empty workspace / unresolved Electron workspace | YES | `SetupRunsListComponent` gates on `readyForActivePath()`; `SetupRunStore.runsFor(null)` returns `[]`; backend returns `missing` / `{ analyses: [] }`. | None. |
| Concurrent discovery calls for same workspace | YES | `SetupRunSavedAnalysis.discover()` coalesces per normalized workspace key in `pending` map. | Coalescing with an in-flight manual Retry during `reconcile()` can miss attaching `incomplete` freshness to a newly adopted interrupted analysis (**M3**). |
| Discovery failure after prior success | YES | Retains last-known records and `analysisFreshness`, sets per-workspace fixed error copy, Retry clears only that workspace on success. | None. |
| Workspace switch during discovery | YES | Requests pin `workspacePath`; results update the originating workspace bucket and error map only. | `SetupRunBoundCoordinator.checkpoint` is not per-workspace, so switching A → B wipes A's reopenable generation checkpoint (**S1**). |
| Dismissing same `backendRunId` in Workspace A vs Workspace B | YES | `SetupRunDismissals` keys by `JSON.stringify([normalizedPath, workflow, backendRunId])`; verified no cross-workspace leakage. | Unbounded array in `localStorage` (**M3**). |
| Explicit resume of dismissed bound agent-generation checkpoint | NO | `reopenDismissedCheckpoint` allocates a brand-new `id: newRunId()`. | Backend `wizard:submit-selection` rejects with `blocked (ownerTabId)` and `locateBound` returns `null` (**B1**). |
| Subdirectory or symlink inside open folder passed as `workspacePath` | NO | `analysisWorkspaceRoot` uses lexical `isAuthorizedWorkspace` (`isPathWithinRoots`). | Allows subdirectory/symlink-target reads and `CLAUDE.md` linker writes on `wizard:load-analysis` (**B2**). |
| `setup-status:get-status` failure when Skills + Scan are ready | NO | `WorkspaceVitalsStore` and `ChatEmptyStateViewComponent` still check `setup.error()`. | Canvas shows `"Readiness unavailable"` while Chat hides readiness as 2/2 ready (**S2**). |
| `teamBuilder` report with explicit `ownerDecision: null` and `installCompleted: false` | YES | `applyReportFields` spreads over previous fields and copies arrays; `parseSetupRunRecord` preserves `null`/`false`. | Passing an explicit `{ ownerDecision: undefined }` key would erase a prior value (minor). |
| Final-row Dismiss keyboard focus | YES | `OnboardingHomeComponent` handles `(lastRunDismissed)="homeTitle.focus()"` (`onboarding-home.component.ts:115`), verified by spec (`:231-256`). | None. |

## Verification

- **Focused TypeScript (`tsc --noEmit`):** Passed (exit 0) across all 9 changed projects: `@ptah-extension/shared`, `agent-generation`, `rpc-handlers`, `core`, `setup-wizard`, `chat-ui`, `chat`, `onboarding`, and `ptah-extension-webview` (`tsconfig.app.json`).
- **Focused Jest (`--runInBand --coverage=false --runTestsByPath`):** **18/18 suites passed, 740/740 tests passed** (`ptah-extension-webview` 110, `setup-wizard` 230, `onboarding` 91, `chat-ui` 24, `chat` 48, `core` 54, `rpc-handlers` 99, `agent-generation` 84). Log: `.ptah/tmp/b14-16-review-jest.log`.
- **Focused ESLint:** Exit 0 across all 48 added/modified TypeScript files in `7920ac82d7` (0 errors, 63 pre-existing/file-length warnings). Log: `.ptah/tmp/b14-16-review-eslint.log`.
- **Tool notes:** `ptah_code_search_symbols` had an empty index (`0 symbols`) and `ptah_search_files` returned 0 hits for hidden `.ptah/specs/...`; fell back to read-only `git grep` / `git show` for cross-workspace symbol checks. Live Electron visual re-verification and Angular `typecheck-templates` remain coordinator/CI checks.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Classify B1 (dismissed bound generation reopen failing backend `ownerTabId` guard) as Blocking | Blocking vs Serious | Breaks explicit resume in production (`wizard-generation-rpc.handlers.ts:454-478`) and silently misleads the user with a fake `"Generating agents…"` screen (`setup-run-bound.coordinator.ts:459-475,492`). | Yes |
| Classify B2 (`analysisWorkspaceRoot` using `isAuthorizedWorkspace` instead of `findOpenWorkspaceRoot`) as Blocking | Blocking vs Serious | Security/workspace-isolation boundary explicitly under review; `findOpenWorkspaceRoot` is already imported at `setup-rpc.handlers.ts:87` and used at `:1441`; `wizard:load-analysis` also writes `CLAUDE.md` via `linker.link` at `:999`. | Yes |

## Verdict

- Recommendation: **REVISE**
- Confidence: **HIGH**
- Top risk: Clicking **Resume** on a reopened dismissed bound `agent-generation` checkpoint fails against the real backend's `ownerTabId` ownership check and shows a phantom `"Generating agents…"` state, while backend workspace-pinned analysis RPCs accept arbitrary subdirectories / lexical symlink targets instead of exact open workspace roots.
- What a robust implementation would add:
  1. Expose `ownerTabId` on `ResumableGenerationRun`, reuse it in `SetupRunBoundCoordinator.insertCheckpoint`, and clear dismissal markers on explicit reopen/resume, backed by a contract spec that enforces backend `ownerTabId` rejection (**B1**).
  2. Switch `SetupRpcHandlers.analysisWorkspaceRoot` to `findOpenWorkspaceRoot` with trimmed `workspacePath` validation and subdirectory/whitespace rejection specs (**B2**).
  3. Store resumable generation checkpoints in a per-workspace map on `SetupRunBoundCoordinator`, retain last-known state on transient RPC failure, and seed/refresh on in-session dismissal (**S1**).
  4. Decouple `WorkspaceVitalsStore.readiness().unavailable` and `ChatEmptyStateViewComponent` from `setup.error()` so Canvas and Chat reflect only Skills + Project scan readiness (**S2**).
  5. Pass `record.workspacePath` in `SetupRunAnalysisCoordinator.cancel()` (**M1**), map `run.result?.counts?.written` into `agentsWritten` (**M2**), bound persisted `dismissals` + add older-host fallback (**M3**), and add persistence/unit tests for the new validation rules (**m1**).

## Re-review (0beb9223eb)

Review family: antigravity | Implementer family: codex | Commit: `0beb9223eb`

### Summary

| Metric | Value |
| --- | --- |
| Overall score | 9/10 |
| Verdict | APPROVED |
| Blocking issues | 0 (2/2 resolved) |
| Serious issues | 0 (2/2 resolved) |
| Moderate issues | 0 (3/3 resolved) |
| Minor issues | 0 (1/1 resolved) |
| Regressions found | 0 |

**Score calibration:** **9/10 (clean — APPROVED)**. Every Blocking, Serious, Moderate, and Minor finding from commit `7920ac82d7` is resolved in `0beb9223eb` with direct evidence against the real backend contracts (including real `WizardGenerationRpcHandlers` ownership checks and real filesystem/symlink tests on `SetupRpcHandlers`) and without introducing regressions. Held at 9/10 rather than 10/10 only because live Electron UI visual verification and Angular template typechecking remain outside this read-only lane.

### Finding-by-finding resolution

| Finding | Status | Evidence (production & contract specs) |
| --- | --- | --- |
| **B1 / FM-1** — Dismissed bound agent-generation reopen rejected by backend `ownerTabId` guard; stale dismissal markers | **RESOLVED** | `ResumableGenerationRun.ownerTabId?: string` added at `libs/shared/src/lib/types/rpc/rpc-setup.types.ts:388` and projected from `manifest.tabBinding.tabId` in `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation-checkpoint.service.ts:96-108`. `SetupRunBoundCoordinator` caches/seeds `ownerTabId` (`setup-run-bound.coordinator.ts:235-239,304`), gates `hasDismissedCheckpoint` on an unused valid `ownerTabId` (`:316-318`), reuses it in `insertCheckpoint` (`:345-346`), and clears the dismissal on reopen (`:335-336`). Blocked `agent-generation` retries verify live backend state (`run?.status === 'running' && verifiedRunStatus(...) === 'running'`, `:511-549`, avoiding stale-checkpoint `'starting'` states from `wizard-generation-binding.ts:148-160`) before following an owner; otherwise they keep the record retryable with fixed refusal copy surfaced on `AgentGenerationRunPage` (`agent-generation-run.page.ts:400-407`). Explicit analysis resumes clear dismissals via `SetupRunStore.report` (`setup-run.store.ts:408-418`), `SetupRunAnalysisCoordinator` (`setup-run-analysis.coordinator.ts:182-186,228-234`), and `AnalyzeWorkspacePage.continuePrevious` (`analyze-workspace.page.ts:893-901,1247-1254`). **Real-contract specs verified:** `setup-rpc.handlers.spec.ts:817-866` (`wizard:get-resumable-run` returns `ownerTabId`), `wizard-generation-rpc.handlers.spec.ts:989-1035` (real `WizardGenerationRpcHandlers` rejects foreign tab with `blocked` + `ownerTabId`, reads checkpoint under `saved.ownerTabId`, accepts `resume: true`, invokes orchestrator once), `setup-run.store.spec.ts:988-1012,1075-1205,2855-2872`, and `agent-generation-run.page.spec.ts:282-301`. |
| **B2 / FM-2** — `SetupRpcHandlers.analysisWorkspaceRoot` accepts subdirectories / lexical symlink escapes / whitespace | **RESOLVED** | `analysisWorkspaceRoot` (`libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:829-847`, awaited at all 4 call sites `:698,810,934,972`) requires `path.isAbsolute(workspacePath)`, matches exact open roots via `findOpenWorkspaceRoot`, verifies `await sameWorkspacePath(workspacePath, openRoot)` via `fsPromises.realpath` (`wizard-generation-binding.ts:115-131`) to defeat symlink-plus-`..` escapes, and returns canonical `openRoot`. `setup-rpc.schema.ts:14` trims `workspacePath` (`z.string().trim().min(1).max(4096).optional()`). **Real-filesystem specs verified:** `setup-rpc.handlers.spec.ts:472-561,2167-2206` uses real `fs.mkdtemp` directories and `fs.symlink(..., 'junction')`, verifying valid selected root plus rejection of subdirectory (`root/sub`), parent traversal (`root/../outside`), symlink escape (`root/link`), symlink followed by `..` (`root/link/..`), and whitespace (`'   '` → `INVALID_PARAMS`) across all 4 RPCs (`wizard:analysis-status`, `wizard:get-resumable-run`, `wizard:list-analyses`, `wizard:load-analysis`). |
| **S1 / FM-3** — Single global `checkpoint` signal cleared on workspace switch, transient RPC error, or in-session dismiss | **RESOLVED** | `SetupRunBoundCoordinator.checkpoints` is now a per-workspace `ReadonlyMap<string, GenerationCheckpoint>` keyed by `normalizeSetupWorkspacePath` (`setup-run-bound.coordinator.ts:54-56,273-290`). `WizardRpcService.getResumableRun` supports `{ throwOnError: true }` (`wizard-rpc.service.ts:400-427`), and `SetupRunStore.reconcile()` skips `adoptResumableGeneration` when the RPC fails (`setup-run.store.ts:665-676`) while clearing only that workspace on a confirmed `{ generation: null }`. `SetupRunStore.dismiss` seeds the cache via `rememberDismissedCheckpoint` without overwriting a newer checkpoint (`setup-run.store.ts:492`, `setup-run-bound.coordinator.ts:292-308`). **Specs:** `setup-run.store.spec.ts:1075-1205`, `wizard-rpc.service.spec.ts:420-442`. |
| **S2 / FM-4** — Failed `setup-status:get-status` triggers `"Readiness unavailable"` on Canvas and Chat | **RESOLVED** | Removed `this.setup.error() !== null` from `WorkspaceVitalsStore.readiness().unavailable` (`libs/frontend/chat/src/lib/services/vitals/workspace-vitals.store.ts:292-295`) and updated `ChatEmptyStateViewComponent` (`libs/frontend/chat/src/lib/components/molecules/setup-plugins/chat-empty-state-screen.component.ts:123-129,146`) to gate solely on `setup.scanError() || setup.workspaceNotOpen() || catalog.error()`, whose Retry button calls `setup.retry()` (refreshing both `catalog` and `setup` at `setup-status.store.ts:247-249`). **Specs:** `workspace-vitals.store.spec.ts:528-544`, `chat-empty-state.component.spec.ts:175-199`, plus `canvas-empty-board.component.spec.ts` passing (16/16). |
| **M1 / FM-5** — Unpinned `getResumableRun()` in `SetupRunAnalysisCoordinator.cancel()` and `AnalyzeWorkspacePage` | **RESOLVED** | `SetupRunAnalysisCoordinator.cancel()` calls `getResumableRun(record.workspacePath, { throwOnError: true }).catch(() => null)` and requires `resumable?.analysisActive === false` before marking cancelled (`setup-run-analysis.coordinator.ts:251-256`). `AnalyzeWorkspacePage` pins its initial lookup to `workspace` and drops stale results on workspace switch (`analyze-workspace.page.ts:886-888`). **Spec:** `setup-run.store.spec.ts:1706-1730`. |
| **M2 / FM-6** — `agentsWritten` missing for live/completed agent-generation runs | **RESOLVED** | `SetupGenerationRunState.agentsWritten?: number` added (`rpc-setup.types.ts:130-131`) and populated from `manifest.agents` in `generationRunState` (`wizard-generation-binding.ts:177-179`). `SetupRunAttempts.observation` maps `run.result?.counts?.written ?? run.agentsWritten` (`setup-run-attempt.ts:217-220`), and `applyReportFields` clears prior `agentsWritten` on `backendRunId` change while validating non-negative safe integers (`setup-run-record.ts:21-31`). **Specs:** `wizard-generation-rpc.handlers.spec.ts:1020-1028`, `setup-run.store.spec.ts:1014-1071`. |
| **M3 / FM-7** — Older-host discovery hard-failure, Retry/reconcile coalescing gap, unbounded `dismissals` | **RESOLVED** | `MAX_SETUP_RUN_DISMISSALS = 200` enforced in `parseDismissals` / `serializeSetupRunIndex` (`setup-run-persistence.ts:28,87-111,440`) and in-memory `SetupRunDismissals.restore` / `remember` (`setup-run-dismissals.ts:27-51`). `SetupRunSavedAnalysis.read()` falls back to `loadAnalysis(completed.filename, workspacePath)` when `completed.runId` is absent and gracefully skips legacy v3 empty `runId` without error (`setup-run-saved-analysis.ts:101-125`). `SetupRunSavedAnalysis.rediscover()` awaits any overlapping pending discovery before running a fresh pass (`:67-72`), called from `SetupRunStore.reconcile()` (`setup-run.store.ts:678`). **Specs:** `setup-run-persistence.spec.ts:107-130`, `setup-run.store.spec.ts:855-940`. |
| **m1 (Minor)** — Missing regression specs, declined host-open copy, explicit `undefined` in `teamBuilder` report | **RESOLVED** | Added persistence validation specs for `dismissals`, `agentsWritten`, and `analysisFreshness` (`setup-run-persistence.spec.ts:107-160`) and metadata-clearing spec (`setup-run.store.spec.ts:1046-1071`). Declined `setup-agent-generation` host opens now show `'Could not open agent generation. Open Setup to find saved runs.'` (`setup-generation-open.handler.ts:58-67`, `.spec.ts:121-127`). `applyReportFields` omits `undefined` keys when merging `teamBuilder` while preserving explicit `null`/`false` (`setup-run-record.ts:43-61`, `setup-run.store.spec.ts:1196-1230`). |

### Regression & edge-case check

- Checked all 29 changed TypeScript files in `0beb9223eb` for introduced regressions: none found.
- Verified `analysisWorkspaceRoot` async conversion is awaited at every call site (`setup-rpc.handlers.ts:698,810,934,972`) and fails closed when a directory does not exist on disk.
- Verified `PluginCatalogService` injection in `ChatEmptyStateViewComponent` does not break any chat or canvas spec.
- Non-blocking implementation notes (no defects):
  - `SetupRunSavedAnalysis.read()` older-host fallback (`setup-run-saved-analysis.ts:103`) reuses `wizard:load-analysis`, which may invoke `AnalysisClaudeMdLinker.link()` on completed manifests (documented trade-off in `fix-report-batch14-16.md:22`).
  - `SetupRunAnalysisCoordinator.cancel()` (`setup-run-analysis.coordinator.ts:254`) requires explicit `analysisActive === false`, which matches all return paths of the current `wizard:get-resumable-run` handler (`setup-rpc.handlers.ts:695,724,759,795,798`) and safely prevents false cancellation on transport failure.

### Re-review verification

- **Focused TypeScript (`tsc --noEmit`):** Passed (exit 0) across `libs/shared/tsconfig.lib.json`, `libs/backend/rpc-handlers/tsconfig.lib.json`, `libs/backend/rpc-handlers/tsconfig.spec.json`, `libs/frontend/setup-wizard/tsconfig.lib.json`, `libs/frontend/chat/tsconfig.lib.json`, `libs/frontend/onboarding/tsconfig.lib.json`, and `apps/ptah-extension-webview/tsconfig.app.json`. (Frontend `tsconfig.spec.json` targets pre-ES2020 BigInt in unrelated `libs/shared` files and is checked via Jest.)
- **Focused ESLint:** Exit 0 across all 29 changed TypeScript files in `0beb9223eb` (0 errors, 25 pre-existing/file-length warnings). Log: `.ptah/tmp/rereview-b14-16-checks.log`.
- **Focused Jest (`--runInBand --coverage=false --runTestsByPath`):** **12/12 suites passed, 600/600 tests passed** (`rpc-handlers` 2 suites / 241 tests, `setup-wizard` 4 suites / 246 tests, `chat` 2 suites / 28 tests, `canvas` 1 suite / 16 tests, `onboarding` 3 suites / 69 tests). Log: `.ptah/tmp/rereview-b14-16-checks.log`.

### Re-review verdict

- Score: **9/10**
- Recommendation: **APPROVED**
- Confidence: **HIGH**
