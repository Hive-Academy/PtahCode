# Implementation Report — Batch 18B (`TASK_2026_2330_2fc3`)

Scope: Phase C code-logic review fixes (Findings 5, 6, 9) and Batch 17b review fixes (Minors 1 coordinator part, 3), strictly within `libs/frontend/onboarding/src/lib/proposal/**`.

---

## Per-Finding Verdicts, Changes, and Regression Specs

### 1. Phase C Finding 5 (Major) — Unnormalized `workspacePath` comparisons in `TeamBuilderRunCoordinator`

- **Verdict:** **Fixed** (confirmed against source: `SetupRunStore.start()` normalizes `record.workspacePath`, while `TeamBuilderRunCoordinator` previously used raw `===`/`!==` comparisons at `invalidateForWorkspace`, post-dispatch error handling in `executeLaunch`, `markCancelledIfLive`, workspace switch/claim checks, and uncommitted tab cleanup guards).
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:140-150`: added `sameWorkspacePath(left, right)` delegating to `normalizeSetupWorkspacePath` from `@ptah-extension/setup-wizard`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:244, 579-623, 682, 703-705, 721-723, 918, 1021, 1039-1042, 1199-1202, 1237-1240, 1315, 1336, 1384, 1390, 1414-1416, 1423, 1430, 1438, 1491-1496`: normalized every workspace path comparison across constructor workspace switch detection, `abortWorkspace`, `canClaimWorkspace` (including passing the normalized path to `setupRuns.runsFor`), `invalidateForWorkspace`, `isStillActive`, `isForegroundFor`, `installRecord`, `executeLaunch` post-dispatch/abort catch paths, `handoffDirect` `canRestoreForeground`, `isUserVisibleTab`, `closeUncommittedTabForWorkspace`, `flushPendingTabCleanups`, and `markCancelledIfLive`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:27, 47-57, 104, 197, 427, 549, 755, 774, 787, 858-862, 928, 1015`: aligned workspace path comparisons and `runsFor(...)` lookups in `TeamBuilderStartPage` through `normalizeSetupWorkspacePath` / `sameWorkspacePath`.
- **Out-of-ownership note:** Phase C F5 also suggested changing `??` to `||` in `libs/frontend/onboarding/src/lib/launcher/harness-chat-launcher.service.ts:68`. That file is outside Batch 18B's ownership (`libs/frontend/onboarding/src/lib/proposal/**`) and was intentionally left untouched.
- **Regression spec:** `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1197-1291` — `normalizes trailing-separator workspace paths across invalidateForWorkspace, post-dispatch failure, and cancel transitions (F5)` (verifies all three store-transition guards + tab cleanup when `SetupRunStore` holds `/ws` and `workspaceRoot` / request carries `/ws/`).

---

### 2. Phase C Finding 6 (Major) — Post-install attachment recovery ("Re-attach files" & interrupted "Continue without attachments")

- **Verdict:** **Fixed** (confirmed against source: `submit()` unconditionally wiped `installed`, `selectedIds`, `ownerDecision`, `installCompleted`, and called `loadReview()` without `preserveSelection`; `continueWithoutAttachments()` called `launchChat()` directly on `interrupted` post-install runs before `setupRuns.retry()` or `loadReview()`, and creating a partial draft via `saveDraft({ hadAttachments: false })` could make `!draftFor(recordId)` skip `loadReview()`).
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:86, 414-420`: added `guidanceLoaded: boolean` to `TeamBuilderDraftState` so partial drafts (such as attachment or `hadAttachments` updates) do not mask an unloaded guidance state while drafts supplying `guidanceFacts` or `guidanceAnalysis` remain marked loaded.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:188, 243-245, 322-370, 392-396, 429, 507, 700-722, 770, 1100, 1118, 1160-1272`:
    - In `submit()`: when `coordinator.hasCompletedInstall(record.id)` is true, preserve confirmed `installed`, `selectedIds`, `ownerDecision`, and `installCompleted: true`, call `setupRuns.retry(record.id)` for `failed`/`interrupted` records, report `needs-input` / `review` with preserved `installed`, update intent/attachments in the draft, load guidance with `preserveSelection: true` if `!this.guidanceLoaded`, and return to post-install recovery instead of wiping install state.
    - In `skillsInstalled` and `hydrateFromRecord`: honor `hasCompletedInstall(record.id)` / `recovery.installCompleted` for recovered `needs-input` records too (so reloading after returning from "Re-attach files" keeps post-install recovery intact), and track `this.guidanceLoaded` across `loadReview`, `persistDraftFor`, `resetRecordViewState`, and `hydrateFromRecord`.
    - In the attachment `effect`: include `record.status === 'interrupted'` so re-attaching files on an interrupted run persists into the draft while still protecting initial empty-tray mounts via `hadLocalAttachmentsForRecord`.
    - In `continueWithoutAttachments()`: when `record?.status === 'interrupted'`, delegate to `await this.continueInterrupted()` so `setupRuns.retry()` and `loadReview({ preserveSelection: true })` run before `launchChat()`. On non-interrupted post-install runs, also ensure guidance is loaded if `!this.state.loading() && !this.guidanceLoaded && this.state.guidanceFacts().length === 0`.
    - In `continueInterrupted()`: check `!this.guidanceLoaded && this.state.guidanceFacts().length === 0` (instead of `!this.coordinator.draftFor(recordId)`) so a partial `saveDraft` from `continueWithoutAttachments()` never causes guidance loading to be skipped.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html:80`: render `Continue` instead of `Review skills` on the intent submit button when `skillsInstalled()` is true.
- **Regression specs:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:2016-2147` — `preserves confirmed install state, selection, and owner decision when clicking Re-attach files and submitting on a reloaded post-install failed|interrupted run`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:2149-2248` — `loads project guidance and retries before launching when clicking Continue without attachments on a reloaded post-install interrupted run`.

---

### 3. Phase C Finding 9 (Minor) — Prune 20-entry recovery sidecar on dismiss/eviction

- **Verdict:** **Fixed** (confirmed against source: dismissing or cap-evicting records in `SetupRunStore` left stale entries in `ptah.team-builder-recovery.v1` and `drafts`/`completedInstalls`, allowing dismissed records to count against `MAX_RECOVERY_ENTRIES = 20` and evict live entries from other workspaces).
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:262-275`: added a constructor `effect` observing `this.setupRuns.runs?.()` and `this.setupRuns.runsFor?.(workspace)` (without editing `SetupRunStore`) to reactively prune stale entries via `pruneStaleRecovery()` whenever store records change.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:1549-1598`: added `pruneStaleRecovery(keepRecordId?, flush?)` removing entries where `this.setupRuns.get(id) === null` from `persistedRecovery`, `drafts`, and `completedInstalls`; invoked it during `loadPersistedRecovery()` (flushing pruned state) and in `savePersistedEntry()` prior to enforcing `MAX_RECOVERY_ENTRIES`.
- **Regression spec:** `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1496-1653` — `prunes dismissed and evicted records from the 20-entry recovery sidecar reactively, on save, and on load (F9)` (covers reactive dismissal pruning, pre-cap pruning protecting an older live entry from another workspace, and startup load pruning).

---

### 4. Batch 17b Minor 1 (Coordinator part) — Send `wizard:cancel-skill-install` on `invalidateForWorkspace`

- **Verdict:** **Fixed** (confirmed against source: `invalidateForWorkspace` aborted `execution.controller` without calling `cancelSkillInstall(execution.installRunId)`).
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:533-536, 671-675`: in `invalidateForWorkspace` (matching `cancel()`), capture and clear `execution.installRunId` and invoke `void this.cancelSkillInstall(installRunId)` before `execution.controller.abort()`. The `installRpc` call remains without a transport abort signal and keeps its late reply handler so confirmed names are still attributed strictly by normalized reply `workspacePath`.
- **Regression spec:** `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1293-1383` — `sends wizard:cancel-skill-install on workspace invalidation and keeps attributing late replies by normalized reply workspacePath (17b M1)`.

---

### 5. Batch 17b Minor 3 — Guard malformed late install replies and prevent unhandled rejections in late `.then`

- **Verdict:** **Fixed** (confirmed against source: `installRpc.then(onFulfilled, onRejected)` did not catch throws inside `onFulfilled`, and `recordStoppedInstall` read `result.installed.length` without an `Array.isArray` guard).
- **Changes:**
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:765-813`: switched late settlement handling to `installRpc.then(...).catch(...)` with optional chaining (`lateResult?.isSuccess?.()`) and `degradation-audit: reported` logging so any rejection or synchronous throw inside the late handler is caught and logged instead of becoming an unhandled rejection; also guarded active `result.data` / `Array.isArray(result.data.installed)`.
  - `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:890-906`: guarded `recordStoppedInstall` with `if (!result || !Array.isArray(result.installed)) return;` and filtered confirmed names to non-empty strings.
- **Regression spec:** `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1385-1494` — `guards malformed late install replies and catches late handler throws without unhandled rejections (17b M3)` (verifies both missing `installed` array and a throwing `setupRuns.report` produce zero `unhandledRejection` events).

---

## Batch 12 F14–F17 Behavior Preserved

All existing Batch 12 F14–F17 tests — guarded cross-partition tab close with real `TabManagerService` / `TabWorkspacePartitionService`, no force-close of tabs the user took over, repeated-reload and same-renderer attachment warning from `hadAttachments` + available payloads, and mounted-page record switching — remain intact and passing.

---

## Checks Run

| Check | Exact Command | Result | Log |
| --- | --- | --- | --- |
| Focused Jest (`proposal/` specs) | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill.store.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-guidance-brief.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-consent.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts` | **PASS (EXIT 0)** — 6/6 suites, **97/97 tests passed** | `.ptah/tmp/b18b-jest.log` |
| TypeScript (`onboarding` lib) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | **PASS (EXIT 0)** — 0 errors | `.ptah/tmp/b18b-tsc.log` |
| ESLint (changed files) | `npx eslint libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.html libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` | **PASS (EXIT 0)** — 0 errors, 2 pre-existing `max-lines` warnings (`team-builder-run.coordinator.ts`, `team-builder-start.page.ts`) | `.ptah/tmp/b18b-eslint.log` |

### Tool / Skill Notes
- `ui-ux-designer` and `angular-frontend-patterns` skills were not listed in the host's available skills catalogue.
- `ptah_get_diagnostics` reported 0 diagnostics across all 4 changed TypeScript files after implementation; on the final retry after the spec provider fix it hit its 45s cache warm timeout, while `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` exited 0 cleanly.
- Template AOT typecheck (`-t typecheck-templates -p ptah-extension-webview`) is deferred to the coordinator gate per lane rules.
