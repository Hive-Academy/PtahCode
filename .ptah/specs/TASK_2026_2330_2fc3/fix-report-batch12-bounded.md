# Batch 12 Bounded Fix Report (`TASK_2026_2330_2fc3`)

Worktree: `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs`
Scope: Re-review round 2 findings **14**, **15**, and **16** from `.ptah/specs/TASK_2026_2330_2fc3/code-logic-review-batch12.md`. Finding 11 (backend workspace pinning, Batch 17) and all unrelated behaviors were left untouched.

## Changes by Finding

### Finding 14 (Major) — Preserve missing-attachment warning across same-renderer remounts

- **Code change**: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:1062-1094`
  - In `hydrateFromRecord`, stopped unconditionally clearing `missingAttachments` when an in-memory `draft` exists.
  - Derived `hasAvailableAttachments` from `draft.attachmentFiles.length > 0 || draft.attachmentImages.length > 0` and computed `missingAttachments` from `recovery.hadAttachments && !hasAvailableAttachments && record.status !== 'completed' && record.status !== 'cancelled'` regardless of whether a draft exists.
  - Kept the explicit `"Continue without attachments"` opt-out persisted via `continueWithoutAttachments()` (`libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts:626-639`), which sets `hadAttachments: false` in both the in-memory draft and persisted recovery sidecar.
- **Changed spec**: `libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts:1661-1790`
  - Extended `preserves installCompleted, selection, ownerDecision and hadAttachments across repeated reloads when records carry only SetupRunStore.report fields`:
    - Verified the review refresh populates an in-memory draft with `hadAttachments: true` and empty attachment arrays.
    - Destroyed and remounted `TeamBuilderStartPage` while reusing the same root `TeamBuilderRunCoordinator`, asserting `missingAttachments()` stays `true`, the unavailable-attachments alert renders, and `launchChat()` stays blocked (zero additional `sendOrQueueMessage` calls).
    - Verified reattaching a file clears `missingAttachments()` and survives another same-coordinator remount.
    - Verified explicit `"Continue without attachments"` opt-out persists across both a same-coordinator remount and a fresh reload from `localStorage`, allowing direct `launchChat()` without re-installing skills.

### Finding 15 (Major) — Preserve close refusals and avoid raw partition removal for parked tabs

- **Code change**: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts:9,36-42,190-241,1174-1283`
  - Removed the `TabWorkspacePartitionService` injection and raw `workspacePartition.removeBackgroundTab(...)` fallback.
  - Added `BUSY_TAB_STATUSES` (`streaming`, `resuming`, `switching`, `awaiting-background`, `sleeping`), `closingTabIds` re-entrancy tracking, and `isBusyTab(...)` (`:36-42,209,1174-1176`).
  - Updated `closeUncommittedTabForWorkspace` (`:1178-1261`):
    - Validates tab workspace ownership before closing.
    - For active-workspace tabs: leaves dirty tabs for the user (removes any pending entry) and defers busy tabs in `pendingTabCleanups` without calling `closeTab(tabId, true)`.
    - For background-partition tabs: routes bound tabs through `tabs.closeTabAcrossWorkspaces(tabId, sessionId)` and unbound tabs through `tabs.closeHandoffPredecessor(tabId, sessionId, false)` (`predecessorStopped = false` so all busy statuses and `isDirty` are enforced by `closeBackgroundTab`, tab identity is revalidated, and normal `abortStreaming` + `ClosedTabEvent` teardown runs). Does not fall through on refusal.
    - Deletes the `pendingTabCleanups` entry only after a supported close succeeds, when the tab no longer exists, or when the tab is dirty (left available to the user). Keeps refused busy tabs in `pendingTabCleanups`.
  - Added a reactive `effect()` watching `tabs.tabs()` and `tabs.backgroundTabsRevision()` (`:232-240`) and updated `flushPendingTabCleanups` (`:1263-1283`) so busy parked tabs are retried only once they become safe to close (`!isDirty && !isBusyTab`).
  - `libs/frontend/chat-state` was **not edited**; `TabManagerService`'s existing `closeTabAcrossWorkspaces`, `closeHandoffPredecessor(..., false)`, `closeTab`, `findTabByIdAcrossWorkspaces`, and `backgroundTabsRevision` already provide the guarded close and teardown contract.
- **New/changed specs**: `libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:8-18,1015-1077,1114-1369`
  - Updated the two mocked parked-tab assertions (`:1016-1020,1071-1075`) to assert `closeHandoffPredecessor('tab-handoff-1', null, false)`.
  - Added `describe('real cross-partition close guards', ...)` (`:1114-1369`) wired to real `TabManagerService` and `TabWorkspacePartitionService`:
    1. `preserves a busy parked tab when close guards refuse after a failed deferred send and emits normal close teardown once safe` (`:1182-1283`): parks a tab with a bound `claudeSessionId` in `streaming` state, settles the deferred send with failure, asserts `closeTabAcrossWorkspaces` was called and refused, `removeBackgroundTab` was not called, no `ClosedTabEvent` was emitted, and the `pendingTabCleanups` entry stayed (and remained skipped while `sleeping`); once updated to `loaded`, asserts authorized cleanup closes the tab via `closeTabAcrossWorkspaces`, emits `{ tabId, sessionId, kind: 'close', streamAbortDispatched: false }`, and removes the pending entry.
    2. `leaves a dirty parked tab available to the user when close guards refuse after a cancelled deferred send` (`:1285-1368`): parks a tab with `isDirty: true`, settles the deferred send as cancelled, asserts `closeHandoffPredecessor(tabId, null, false)` refused, `removeBackgroundTab` was not called, no `ClosedTabEvent` was emitted, no pending cleanup entry was kept, and switching back to `/ws` leaves the dirty tab open for the user.

### Finding 16 (Minor) — Fix TypeScript errors in `analyze-workspace.page.spec.ts`

- **Code change**: `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts:254,1448-1451`
  - Typed `isCancelling` mock as `jest.fn<boolean, [string]>(() => false)` to resolve TS2322 against `FakeSetupRunStore.isCancelling`.
  - Typed `element.querySelectorAll<HTMLButtonElement>('ptah-run-panel button')` so both `retryButton()?.click()` calls (`:1452,1472`) resolve TS2339.

## Focused Verification

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Focused Jest | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts` | **PASS** — 3/3 suites, **94/94 tests passed** (exit 0) | `.ptah/tmp/b12-bounded-jest.log` |
| TypeScript (`lib`) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | **PASS** — **0 errors** (exit 0) | `.ptah/tmp/b12-bounded-tsc-lib.log` |
| TypeScript (`spec`) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json` | **0 errors in all 5 changed files** (exit 2 from 15 pre-existing errors in untouched sibling specs and shared/worker-protocol BigInt target settings) | `.ptah/tmp/b12-bounded-tsc-spec.log` |
| Ptah Diagnostics | `ptah_get_diagnostics` scoped to all 5 changed files | **PASS** — **0 errors, 0 warnings** in requested files (`coverage: clean`; 13 pre-existing errors in untouched sibling files) | — |
| ESLint | `npx eslint libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts` | **PASS** — **0 errors**, 2 pre-existing `max-lines` warnings (exit 0) | `.ptah/tmp/b12-bounded-eslint.log` |
| Diff hygiene | `git diff --check` | **PASS** — 0 issues (exit 0) | — |

## Tool & Skill Notes

- `ui-ux-designer` and `angular-frontend-patterns` skills were not present in this host's available skill catalogue; work followed the repository's existing Angular and testing conventions.
- `ptah_code_search_symbols` returned an empty index (`0 symbols`), so symbol inspection used `ptah_read_symbol`, `ptah_lsp_references`, and `ptah_search_files`.
