# Implementation Report — Batch 12 (`TASK_2026_2330_2fc3`)

Status: COMPLETE

## Changed files

- Modified: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
- Modified: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts`
- Modified: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts`
- Created: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts`
- Created: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`

## Acceptance criteria

| # | Criterion | Status | Evidence (`file:line`) |
| --- | --- | --- | --- |
| 1 | `?rerun=1` only triggers `SetupRunStore.rerun`; `startFresh` never resets a live run; the old completed record stays. | Met | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:805-820, 1044-1117, 1219-1265`; `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts:355-435` |
| 2 | Page destroy no longer aborts/resets the team builder (workspace-change reset kept). | Met | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:199-227, 656-658`; `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:500-550` |
| 3 | `TeamBuilderRunCoordinator` owns install-then-launch, sets `handoffTabId` and `completed`/`handed-off`; launch failure -> `failed` at `review` with `installed` kept; Cancel -> `cancelled`. | Met | `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:105-155, 200-398`; `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:127-350` |
| 4 | "Open conversation" shows only if the tab still exists; else "The conversation was closed" (D3). | Met | `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:145-158, 626-639`; `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html:89-123`; `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:306-341` |
| 5 | Electron first; accessible. | Met | `openConversation()` calls `TabManagerService.switchTab`, `AppStateManager.requestCanvasTab(..., true)` (Electron Orchestra Canvas), and `AppStateManager.setCurrentView('chat')` (`team-builder-start.page.ts:626-639`); `role="status"` + `aria-live="polite"`, `role="alert"`, `[attr.inert]` during install, explicit `type="button"` (`team-builder-start.page.html:89-203`). Visual verification in Electron and `typecheck-templates` are owned by the coordinator per batch rules. |

## Check results

- Jest (`npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath ...`): **PASS** — 4 suites passed, 85 tests passed, 0 failed (`.ptah/tmp/b12-jest.log`).
- TypeScript (`npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`): **PASS** — exit code 0, 0 errors (`.ptah/tmp/b12-tsc.log`).
- ESLint (`npx eslint <8 changed/new files>`): **PASS** — exit code 0, 0 errors, 3 pre-existing warnings (`max-lines` on `analyze-workspace.page.ts` and `team-builder-start.page.ts`; `explicit-member-accessibility` on `ngOnDestroy` stub in `analyze-workspace.render.spec.ts`) (`.ptah/tmp/b12-eslint.log`).
- Degradation audit (`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`): **PASS** — `degradation-audit: TOTAL 0 unsuppressed site(s)` (`.ptah/tmp/b12-degradation.log`).
- `ptah_get_diagnostics`: Clean (0 errors in requested source files on cached run; `tsc --noEmit` verified 0 errors after final edit).

## Template change

- **Yes** — `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html` updated to bind `viewStage()` (`handed-off`, `launching`, `installing`, `interrupted`, `intent`, `review`, `consent`), render "Conversation opened" + conditional "Open conversation" / "The conversation was closed" (D3), render explicit "Cancel" during `installing`/`launching`, and render "Continue" for `interrupted`. Coordinator should run `-t typecheck-templates -p ptah-extension-webview`.
- `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` template was not modified.

## Skills

- Host skill catalogue did not list `angular-frontend-patterns` or `ui-ux-designer`; implementation followed existing Angular standalone/signal conventions and Batch 8/10 onboarding patterns in this repository.

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| B12-1 | Separate leaving (`Back`) from explicit cancellation (`Cancel`) on `TeamBuilderStartPage` during `installing`/`launching`. | (a) `Back` leaves without aborting and a dedicated `Cancel` button calls `coordinator.cancel(recordId)`; (b) `Back` aborts launch. | Normative rule 5 ("Leaving never cancels, aborts or resets any record. Only an explicit Cancel or a workspace switch stops work") and Component 7 ("`HarnessChatLaunchCancelledError` comes only from an explicit Cancel. The record becomes `cancelled`"). | Yes |
| B12-2 | When `?rerun=1` arrives on `AnalyzeWorkspacePage` with no prior `completed`/`cancelled` record in `SetupRunStore` (e.g., cleared storage or legacy saved analysis) and no live run, fall back to `startFresh()` (which creates a new record via `SetupRunStore.start` and never resets a live run). | (a) Fallback to `startFresh()` when no prior record exists; (b) no-op if no prior record exists. | Preserves `?rerun=1` for workspaces whose saved analysis predates `SetupRunStore` (or after localStorage clear) while still routing all re-runs of completed/cancelled records strictly through `SetupRunStore.rerun(id)` without resetting live runs. | Yes |
| B12-3 | Keep `StackSkillStore` unmodified (outside Batch 12 write set) and derive `'handed-off'` / background `'installing'` & `'launching'` stages via `viewStage = computed(...)` on `TeamBuilderStartPage`. | (a) Derived `viewStage()` on `TeamBuilderStartPage`; (b) add `'handed-off'` to `StackSkillStage` in `stack-skill.store.ts`. | `stack-skill.store.ts` is owned by Batch 10 and excluded from Batch 12's write set; `viewStage()` cleanly combines `SetupRunRecord` state with `StackSkillStore.stage()`. | Yes |

## Proposed Removals

- None. Cancelling a pending team-builder launch remains available via the explicit `Cancel` button (`cancelRun()`), while `Back` now leaves the run active in the background per Normative Rule 5.

## Clarifications Needed

- None.

---

## Revise round 1

Addressed all 9 findings from `.ptah/specs/TASK_2026_2330_2fc3/code-logic-review-batch12.md` (8 Major, 1 Minor) and added regression specs for each finding.

### Changed files (round 1)

- Modified: `libs/frontend/setup-wizard/src/lib/services/setup-run.types.ts`
- Modified: `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts`
- Modified: `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`
- Modified: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
- Modified: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts`

### Findings fixed

| # | Severity | Fix (`file:line`) | Regression spec(s) |
| --- | --- | --- | --- |
| 1 | Major | Added root workspace observer `effect()` in `TeamBuilderRunCoordinator` (`team-builder-run.coordinator.ts:207-220, 453-458, 524-547`) that invalidates workspace executions and immediately resolves live records to `interrupted` with known `installed` results (and preserves late install results on `interrupted`/`cancelled` records at `:687-718`). Kept page-local workspace reset in `TeamBuilderStartPage`. | `team-builder-run.coordinator.spec.ts`: `immediately resolves live runs to interrupted on root workspace switch A -> B -> A before deferred install settles`, `immediately resolves a launching run to interrupted on workspace switch A -> B -> A and preserves installed skills`; `team-builder-start.page.spec.ts`: `interrupts a detached installing run on workspace switch A -> B -> A and remounts A in interrupted recovery` |
| 2 | Major | Closed `<ptah-stack-skill-consent>` on transition from `consent` to `installing` (`team-builder-start.page.html:283-290`, `[open]="viewStage() === 'consent'"`), keeping `[busy]="viewStage() === 'installing'"` so `onClosed()` does not emit `cancelRequested`, exposing non-inert `Back` and `Cancel` buttons (`team-builder-start.page.html:221-244`), and moving focus to `Cancel` via `afterNextRender` (`team-builder-start.page.ts:554-556`). | `team-builder-start.page.spec.ts`: `closes the consent modal on install so Back and Cancel are reachable by mouse and keyboard while installing` |
| 3 | Major | Implemented a direct foreground/background chat handoff contract with an explicit commit boundary in `TeamBuilderRunCoordinator` (`team-builder-run.coordinator.ts:222-233, 425-449, 574-578, 851-1082`) and view attach/detach registration in `TeamBuilderStartPage` (`team-builder-start.page.ts:911-922`). Detached runs create the ordinary chat tab with `activate = false`, queue `requestCanvasTab(..., false)`, and never call `setCurrentView('chat')`. `AbortSignal` is passed to install, guidance, and workflow-prompt RPCs and races foreground canvas adoption; cancellation before `sendOrQueueMessage` closes any uncommitted tab via `tabs.closeTab(tabId, true)` and never sends; `outcome.cancelled` settles as `cancelled` rather than `handed-off`; `cancel()` waits on an already-dispatched `sendOrQueueMessage` so committed sends are never masked by a cancelled record. | `team-builder-run.coordinator.spec.ts`: `completes install-then-launch detached without stealing focus and records handoffTabId and handed-off`, `does not steal focus when the user switched away from onboarding view even if view remained attached`, `aborts and cleans up an uncommitted chat tab without sending when cancelled during deferred canvas adoption`, `treats a cancelled first send outcome as cancelled rather than handed-off`, `waits for an in-flight committed send on cancel instead of stranding a sent chat behind a cancelled record`, `passes an AbortSignal to install RPC and stops before launching when cancelled mid-install` |
| 4 | Major | Gave the workspace's live team-builder run precedence over `currentRecordId` and URL `tab` (`team-builder-start.page.ts:90-112, 736-792`), rebound bound `?tab=` URLs when claiming a live run or allocating a new id after terminal records (`team-builder-start.page.ts:210-221, 784-792`), and enforced atomic per-workspace single-live-execution ownership in `TeamBuilderRunCoordinator.canClaimWorkspace` (`team-builder-run.coordinator.ts:355-359, 389-393, 461-482`). | `team-builder-run.coordinator.spec.ts`: `deduplicates same-id double-clicks and refuses a second historical record in the same workspace`; `team-builder-start.page.spec.ts`: `gives the workspace live run precedence over a historical failed URL id and blocks a second run`, `replaces a cancelled-run URL id when resubmitting and drives subsequent launch on the new id` |
| 5 | Major | Added optional non-sensitive `teamBuilder` recovery fields (`selectedIds`, `ownerDecision`, `installCompleted`, `hadAttachments`) to `SetupRunRecord` and persistence (`setup-run.types.ts:86-93`, `setup-run-persistence.ts:211-236`), plus root coordinator draft + localStorage recovery cache (`team-builder-run.coordinator.ts:239-350, 1140-1196`). Decoupled `skillsInstalled` from the error display string (`team-builder-start.page.ts:326-333`), added `loadReview({ preserveSelection, preserveError })` (`:338-361`), re-previewed recorded selection on consent re-entry and interrupted continuation requiring refreshed script approval (`:644-676, 853-868, 1064-1080`), restored review recommendations on failed-review hydration (`:1022-1049`), and added an explicit `team-builder-attachments-unavailable` alert + guard before sending when reload drops attachments (`team-builder-start.page.html:89-119`, `team-builder-start.page.ts:528, 574, 616-629`). | `setup-run-persistence.spec.ts`: `keeps team-builder fields only for team-builder runs`; `team-builder-start.page.spec.ts`: `re-enters a failed post-install run using the explicit installCompleted checkpoint and retains guidance and attachments across teardown`, `warns before sending when reload drops attachments on a failed post-install run`, `restores selected skills and re-previews for consent on consent re-entry, requiring refreshed script approval`, `loads recommendations without wiping restored selection on failed-review hydration`, `re-checks skills and re-previews recorded selection on Continue for an interrupted team-builder run` |
| 6 | Major | Separated `hadRunnerActive = this.isAnalysisActive()` from `hadLiveRun` in `AnalyzeWorkspacePage.ngOnInit` (`analyze-workspace.page.ts:832-897`) so a cold mount with an idle runner and a persisted `running` record still calls `getResumableRun()`, invokes `runner.syncBackendActive(true, ...)`, and attaches the stream and clock. | `analyze-workspace.page.spec.ts`: `hydrates a backend-active analysis on cold mount even when a persisted running record already exists` |
| 7 | Major | Removed the `startFresh()` fallback from `AnalyzeWorkspacePage.triggerRerun()` (`analyze-workspace.page.ts:1100-1135`) so `?rerun=1` triggers ONLY `SetupRunStore.rerun(source.id)`. When no eligible workspace-local `completed`/`cancelled` record exists (or the explicit `?tab=` source is ineligible), consumes `?rerun=1`, displays `[data-testid="analysis-rerun-notice"]` (`analyze-workspace.page.ts:304-312`), leaves Start available, and falls through to `getResumableRun()` discovery without calling `start` or the runner. | `analyze-workspace.page.spec.ts`: `consumes rerun=1 without calling start or runner when no eligible record exists or when the explicit source failed` |
| 8 | Major | Scoped `activeRecord` and `findRerunSourceRecord` strictly to `runsFor(workspace)` with no global `setupRuns.get(tabId)` fallback (`analyze-workspace.page.ts:649-676, 1349-1371`), prioritized live workspace run and `currentRecordId` over stale URL `tab`, cleared `currentRecordId` on workspace switch (`:795-805`), rebound `?tab=` on rerun/start/attach (`:848-859, 1136-1156`), and resolved `reviewSkills()` from the completed record matching the displayed `manifest.runId` (`:1273-1336`). | `analyze-workspace.page.spec.ts`: `scopes record lookups to the active workspace so a stale foreign tab id cannot trigger rerun across workspaces`, `rebinds URL tab on explicit-id rerun and navigates Review skills to the newly completed analysis` |
| 9 | Minor | Replaced try/catch DI wrappers in `TeamBuilderStartPage` with direct `inject(..., { optional: true })` (`team-builder-start.page.ts:76-77`) so provider construction failures are never swallowed. Routed workspace invalidation ahead of cancellation exceptions in `TeamBuilderRunCoordinator.executeLaunch` (`team-builder-run.coordinator.ts:812-848`), logged active failures via `logger.error`, and updated `degradation-audit:` markers to accurately describe each branch. | `team-builder-run.coordinator.spec.ts`: `classifies a launcher error after workspace invalidation as ignored/interrupted rather than explicit Cancel`; `team-builder-start.page.spec.ts`: `does not swallow TabManagerService construction errors via an optional DI catch` |

### Decisions (round 1)

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| B12-R1-1 | Add optional `selectedIds`, `ownerDecision`, `installCompleted`, and `hadAttachments` fields to `SetupRunRecord['teamBuilder']` in `setup-run.types.ts` + `setup-run-persistence.ts`, AND mirror non-sensitive recovery metadata in a bounded localStorage sidecar inside `TeamBuilderRunCoordinator` (`ptah.team-builder-recovery.v1`, no file contents/paths/secrets). | (a) Types/persistence optional fields + coordinator sidecar (keeps `setup-run.store.ts` untouched while another lane edits it); (b) edit `setup-run.store.ts` directly. | Revise instructions explicitly permit adding optional fields to `setup-run.types.ts` and `setup-run-persistence.ts` while forbidding edits to `setup-run.store.ts`. Pairing the schema extension with the coordinator recovery store keeps old records valid AND persists recovery metadata across reloads today; a later store pass can forward the optional fields in `SetupRunStore.report`. | Yes |
| B12-R1-2 | Implement background-aware, cancellation-safe chat handoff directly in `TeamBuilderRunCoordinator` using `ClaudeRpcService`, `TabManagerService`, `AppStateManager`, `ChatStore`, `ActionBannerService`, and `ComposerRestoreService` (keeping `HarnessChatLauncherService` untouched). | (a) Direct handoff boundary inside `TeamBuilderRunCoordinator`; (b) modify `HarnessChatLauncherService`. | `harness-chat-launcher.service.ts` is outside the round 1 write set and always performs foreground `setCurrentView('chat')` / `focus: true` without post-adoption cancellation checks. Direct coordination inside `TeamBuilderRunCoordinator` keeps `HarnessChatLauncherService` unchanged for `NewProjectStartPage` while fulfilling Finding 3 completely. | Yes |
| B12-R1-3 | Close `<ptah-stack-skill-consent>` immediately on transition to `installing` (`[open]="viewStage() === 'consent'"`) and focus the installing `Cancel` button instead of modifying `StackSkillConsentComponent`. | (a) Close modal on `installing` and expose progress bar `Back`/`Cancel`; (b) add Cancel inside `StackSkillConsentComponent`. | `stack-skill-consent.component.*` is outside the write set, and closing the native `<dialog>` immediately lifts top-layer inertness so both mouse and keyboard `Back`/`Cancel` work during pending installs. | Yes |

### Check results (round 1)

- Jest (`setup-wizard` `setup-run-persistence.spec.ts`): **PASS** — 1 suite passed, 43 tests passed, 0 failed (`.ptah/tmp/b12r1-jest-sw.log`).
- Jest (`onboarding` `team-builder-run.coordinator.spec.ts`, `team-builder-start.page.spec.ts`, `analyze-workspace.page.spec.ts`, `analyze-workspace.render.spec.ts`): **PASS** — 4 suites passed, 104 tests passed, 0 failed (`.ptah/tmp/b12r1-jest-onb.log`).
- TypeScript (`npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json`): **PASS** — exit code 0, 0 errors (`.ptah/tmp/b12r1-tsc-sw.log`).
- TypeScript (`npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`): **PASS** — exit code 0, 0 errors (`.ptah/tmp/b12r1-tsc-onb.log`).
- ESLint (`npx eslint <9 changed TS files>`): **PASS** — exit code 0, 0 errors, 3 `max-lines` warnings (`.ptah/tmp/b12r1-eslint.log`).
- Degradation audit (`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`): **PASS** — `degradation-audit: TOTAL 0 unsuppressed site(s)` (`.ptah/tmp/b12r1-degradation.log`).
- `git diff --check`: **PASS** — exit code 0.

### Template change (round 1)

- **Yes** — `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html` (closed consent dialog during `installing`, added `#installingCancel` and `data-testid="team-builder-installing-back"`, added `team-builder-attachments-unavailable` recovery alert + `Continue without attachments` action, wired `onSelectionToggled` / `onOwnerDecisionChange` / `onApproveSkill` draft persistence) and inline template in `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` (added `rerunNotice()` `<ptah-alert data-testid="analysis-rerun-notice">`). Coordinator should run `-t typecheck-templates -p ptah-extension-webview`.

---

## Revise round 2

Addressed all remaining defects from `## Re-review round 1` of `.ptah/specs/TASK_2026_2330_2fc3/code-logic-review-batch12.md` (Findings 1, 3, 5, 9 test strengthening, and new Findings 10–13), keeping changes strictly within the Batch 12 frontend write set.

### Changed files (round 2)

- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts`
- Modified: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts`

### Fixes and regression specs (round 2)

| Finding(s) | Fix (`file:line`) | Regression spec(s) |
| --- | --- | --- |
| 10 (and 1, 3) — Workspace switch dispatch boundary & parked tab cleanup | `invalidateForWorkspace` now honors `execution.sendInFlight` (`team-builder-run.coordinator.ts:572-607`), keeping execution ownership and the tab intact until `sendOrQueueMessage` settles. On settlement (`handoffDirect` `:1051-1126`, `executeLaunch` catch `:896-916`): a successful send commits `completed`/`handed-off` in its original workspace without closing the tab; a cancelled send marks `cancelled` and cleans up the tab; a failed send skips foreground `composerRestore` when switched away, records `failed` at step `review` with `installed` kept, and cleans up the tab. Replaced `closeTab`-only cleanup with workspace-aware `closeUncommittedTabForWorkspace` + `flushPendingTabCleanups` (`:227-230, 1154-1245`), closing parked background tabs via `findTabByIdAcrossWorkspaces` → `closeTabAcrossWorkspaces` / `closeHandoffPredecessor` / `TabWorkspacePartitionService.removeBackgroundTab`, with deferred retry on workspace return if a tab is temporarily busy. Also ordered `setupRuns.cancel(recordId)` ahead of `execution.controller.abort()` in `cancel()` (`:467-494`) so mid-install cancellation returns `true` cleanly without racing `inactiveOutcome`. | `team-builder-run.coordinator.spec.ts`: `retains a successful handoff in its original workspace when switching workspaces while the first send is in flight`, `closes a parked uncommitted tab and marks cancelled when a deferred send cancels after a workspace switch`, `closes a parked uncommitted tab and records review failure with installed skills when a deferred send fails after a workspace switch` |
| 11 (and 1, 3) — Production RPC abort contract & late install settlement | Stopped passing `{ signal }` to `rpc.call('wizard:install-skills-with-consent', ...)` (since `ClaudeRpcService` deletes its response handler on abort without stopping backend work) and raced the call via `awaitWithAbort(installRpc, execution.controller.signal)` (`team-builder-run.coordinator.ts:656-688`). Frontend stops immediately before chat launch while attaching `handleLateInstallSettlement` (`:766-801`), guarded by record identity and `record.workspacePath === execution.workspacePath`. On explicit same-workspace Cancel, confirmed late `installed` names are preserved on the `cancelled` record without launching chat; on workspace switch (`execution.abortedForWorkspace`), untrusted cross-workspace late writes are ignored conservatively (`installCompleted` stays `false`, workspace B is untouched, chat never launches) pending backend workspace pinning (see `## Clarifications Needed`). | `team-builder-run.coordinator.spec.ts`: `immediately resolves live runs to interrupted on root workspace switch A -> B -> A between two selected skills using production abort transport and ignores untrusted late writes`, `obeys the production RPC abort contract on mid-install cancel so chat launch stops immediately while late install evidence is preserved` |
| 12 (and 5) — Preserve persisted install checkpoint & recovery metadata across repeated reloads | `TeamBuilderRunCoordinator.saveDraft` (`team-builder-run.coordinator.ts:302-384`) now seeds omitted fields (`selectedIds`, `ownerDecision`, `hadAttachments`, `installCompleted`, `intent`) from `prev ?? persistedRecovery ?? record.teamBuilder` and preserves `completedInstalls` unless `installCompleted` is explicitly overridden; `recoveryFor` (`:266-300`) uses consistent `draft ?? persistedRecovery ?? record.teamBuilder` precedence. `TeamBuilderStartPage`'s attachment effect (`team-builder-start.page.ts:212-246`) guards on `hydratedRecordId === record.id` and skips empty-tray writes on initial mount/reload unless the user previously had attachments for that record (`hadLocalAttachmentsForRecord`), preventing empty-tray initialization from erasing sidecar recovery metadata. | `team-builder-start.page.spec.ts`: `preserves installCompleted, selection, ownerDecision and hadAttachments across repeated reloads when records carry only SetupRunStore.report fields` |
| 13 (and 4, 5) — Atomic record-switch reset/hydration & async `recordId` guards | Added `resetRecordViewState()` (`team-builder-start.page.ts:1021-1039`) and invoked it atomically on workspace switch (`:181-190`), `record -> null`, and every record-id switch in `hydrateFromRecord` (`:1041-1166`), unconditionally resetting and hydrating all record-owned fields (including empty `intent`, `installed`, `selectedIds`, `ownerDecision`, `guidanceFacts`, `guidanceNote`, `attachments`, and `missingAttachments`) and invalidating pending `requestVersion`/`searchVersion`/`searchTimer` work. Updated `currentInstalled()` (`:766-772`) to prefer `activeRecord()?.teamBuilder?.installed` over stale local state, claimed newly allocated ids in `ensureRecord` (`:811-819`), and added `recordId` staleness checks across `loadReview` (`:343-462`), `search` (`:464-505`), `cancelRun` (`:641-658`), `continueInterrupted` (`:660-715`), `previewSelectedSkills` (`:836-898`), `rehydrateConsent` (`:900-920`), and `applyRunOutcome` (`:922-960`). | `team-builder-start.page.spec.ts`: `resets and hydrates all record-owned fields atomically when switching between two failed records on a mounted page`, `invalidates pending loadReview work when rebinding a mounted page to another record` |
| 9 (test strengthening) — Actual cancellation exception in workspace-invalidation launch catch | Updated the coordinator launch-catch regression spec to reject with `new HarnessChatLaunchCancelledError()` instead of a plain `Error` so moving the cancellation branch ahead of workspace invalidation fails the test. | `team-builder-run.coordinator.spec.ts`: `classifies a HarnessChatLaunchCancelledError after workspace invalidation as ignored/interrupted rather than explicit Cancel` |

### Check results (round 2)

- Jest (`onboarding` `team-builder-run.coordinator.spec.ts`, `team-builder-start.page.spec.ts`, `analyze-workspace.page.spec.ts`, `analyze-workspace.render.spec.ts`): **PASS** — 4 suites passed, 110 tests passed, 0 failed (`.ptah/tmp/b12r2-jest-onb.log`).
- Jest (`setup-wizard` `setup-run-persistence.spec.ts`): **PASS** — 1 suite passed, 43 tests passed, 0 failed (`.ptah/tmp/b12r2-jest-sw.log`).
- TypeScript (`npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`): **PASS** — exit code 0, 0 errors (`.ptah/tmp/b12r2-tsc-onb.log`).
- TypeScript (`npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json`): **PASS** — exit code 0, 0 errors (`.ptah/tmp/b12r2-tsc-sw.log`).
- ESLint (`npx eslint <9 changed TS files>`): **PASS** — exit code 0, 0 errors, 3 pre-existing `max-lines` warnings (`.ptah/tmp/b12r2-eslint.log`).
- Degradation audit (`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`): **PASS** — `degradation-audit: TOTAL 0 unsuppressed site(s)` (`.ptah/tmp/b12r2-degradation.log`).
- `ptah_get_diagnostics` (scoped to the 4 round-2 modified files): **PASS** — 0 errors, 0 warnings in requested files.
- `git diff --check`: **PASS** — exit code 0.

### Template change (round 2)

- **No** (no HTML or inline template changes in round 2; note that round 1 changed `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html` and the inline template in `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`, so the coordinator should still run `-t typecheck-templates -p ptah-extension-webview` for the batch overall).

## Clarifications Needed

1. **Backend workspace pinning and cancellation for `wizard:install-skills-with-consent` (Finding 11 — backend out of Batch 12 write set)**
   - **Current state:** `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:1424-1456` loops over `params.skills` and calls `SkillsShRpcHandlers.install(...)` without pinning the originating workspace root; `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts:429-452,1080-1082` resolves `workspaceProvider.getWorkspaceRoot()` on each call, and `ClaudeRpcService` abort signals only drop the frontend response handler without stopping extension-host work. Frontend round 2 makes the webview safe by racing `awaitWithAbort` without dropping the RPC handler, preserving confirmed same-workspace install evidence on Cancel, and ignoring untrusted late replies after a workspace switch so `installCompleted` is never falsely set and the next workspace's records are never mutated.
   - **Recommendation (follow-up backend task):**
     - Accept an explicit `workspacePath` (and optional `installRunId`) in `wizard:install-skills-with-consent`, pass the pinned `workspacePath` through `SkillsShRpcHandlers.install` so a workspace switch mid-install can never write skills into the newly selected workspace, and add a backend cancellation/abort check between skills (or `wizard:cancel-skill-install`) that returns the confirmed per-workspace installed list.
2. **Forwarding optional `teamBuilder` recovery fields in `SetupRunStore.report` (Finding 12 — `setup-run.store.ts` out of Batch 12 write set)**
   - **Current state:** `libs/frontend/setup-wizard/src/lib/services/setup-run.types.ts` and `setup-run-persistence.ts` already support optional `selectedIds`, `ownerDecision`, `installCompleted`, and `hadAttachments`, while `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:1191-1196` currently writes only `{ intent, installed }`. Frontend round 2 makes the `TeamBuilderRunCoordinator` sidecar lossless across repeated reloads and partial saves.
   - **Recommendation (follow-up store cleanup):** Once `setup-run.store.ts` is free from parallel lanes, preserve/merge those four optional `teamBuilder` fields in `SetupRunStore.report` so the Setup run index becomes the single persisted store for team-builder recovery metadata.
