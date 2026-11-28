# Batch 12 Bounded Fix Report — Finding 17 (`TASK_2026_2330_2fc3`)

Worktree: `/home/amun/ptah-extension/.claude-worktrees/setup-background-runs`
Scope: Final review (bounded correction) **Finding 17 (Major)** ONLY from `.ptah/specs/TASK_2026_2330_2fc3/code-logic-review-batch12.md`. No backend, shared, or `chat-state` files were modified; all prior Finding 15 guard and teardown behaviors are preserved.

## Code Change

- **`libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts`**
  - **`:234-243`** — Extended the reactive pending-cleanup `effect()` to track `this.tabs?.activeTabId?.()` alongside `this.tabs?.tabs?.()` and `this.tabs?.backgroundTabsRevision?.()`, so activating a previously parked tab or switching back to its workspace immediately triggers retirement of its deferred cleanup entry.
  - **`:1179-1200`** — Added `isUserVisibleTab(tabs, tabId, lookup)` to detect when a tab is either the active tab (`tabs.activeTabId() === tabId`), present in the active workspace's visible `tabs()` list, or owned by the active workspace (`lookup.workspacePath === null || lookup.workspacePath === tabs.activeWorkspacePath`).
  - **`:1202-1287`** — Added `deferred = false` to `closeUncommittedTabForWorkspace`:
    - When `isUserVisibleTab` is true and `deferred` is true (or the tab is dirty/busy), deletes `tabId` from `pendingTabCleanups` and returns without calling `tabs.closeTab(tabId, true)`.
    - For background-partition tabs (`!userVisible`), preserves the exact Finding 15 guarded close path (`closeTabAcrossWorkspaces` for bound tabs, `closeHandoffPredecessor(tabId, sessionId, false)` for unbound tabs, no raw removal). On refusal, retires the pending entry if the tab disappeared, became dirty, or became visible in the active workspace during the await.
    - In the fallback branch without `findTabByIdAcrossWorkspaces` (`:1264-1276`), deferred retries retire the entry if visible or back in the owner workspace and never call `tabs.closeTab(tabId, true)`.
  - **`:1289-1326`** — Updated `flushPendingTabCleanups` to retire (`delete`) any pending entry before checking busy status whenever the tab is missing, owned by a different workspace, dirty, or user-visible (`isUserVisibleTab`), skip closing while `this.launcher.workspaceRoot() === ownerWorkspace` (half-switched transition window), and pass `deferred = true` to `closeUncommittedTabForWorkspace` for parked background tabs only.

## New Regression Spec

- **`libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts:1370-1471`** (inside `describe('real cross-partition close guards', ...)`)
  - Added `retires deferred cleanup and keeps the tab open when the user returns and activates a previously busy parked tab before it settles to loaded`:
    - Launches a team-builder handoff in `/ws`, attaches a real `SessionId`, switches to `/ws-b`, and parks the tab with `status: 'streaming'`.
    - Settles the deferred send with failure and confirms the busy refusal keeps the `pendingTabCleanups` entry for `/ws` with zero `ClosedTabEvent`s.
    - Switches back to `/ws` and activates the tab (`realTabManager.switchTab(launchedTabId)`) while still `streaming`, asserting `activeTabId()` matches and the pending cleanup entry is retired immediately.
    - Settles the tab to `loaded` and clean (`realTabManager.markLoaded(launchedTabId)`), asserting `closeTab` and `removeBackgroundTab` were not called, the tab stays open and active with `{ status: 'loaded', isDirty: false }`, `closedEvents` is empty, and `pendingTabCleanups` does not contain the tab.

## Focused Verification

| Check | Command | Result | Log |
| --- | --- | --- | --- |
| Focused Jest | `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-start.page.spec.ts` | **PASS** — 2/2 suites, **55/55 tests passed** (`exit 0`) | `.ptah/tmp/b12-f17-jest.log` |
| TypeScript (`lib`) | `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` | **PASS** — **0 errors** (`exit 0`) | `.ptah/tmp/b12-f17-tsc-lib.log` |
| ESLint | `npx eslint libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts` | **PASS** — **0 errors**, 1 pre-existing `max-lines` warning on `team-builder-run.coordinator.ts` (`exit 0`) | `.ptah/tmp/b12-f17-eslint.log` |
| Ptah Diagnostics | `ptah_get_diagnostics` scoped to both changed files | **PASS** — **0 errors, 0 warnings** in requested files (`coverage: clean`; 13 pre-existing errors in untouched sibling files) | — |
| Diff hygiene | `git diff --check libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.ts libs/frontend/onboarding/src/lib/proposal/team-builder-run.coordinator.spec.ts` | **PASS** — 0 issues (`exit 0`) | — |

## Tool & Skill Notes

- `ui-ux-designer` and `angular-frontend-patterns` skills were not present in this host's available skill catalogue; this change was strictly non-UI Angular service/coordinator logic following the repository's existing signal/effect and Jest conventions.
- Source inspection and diagnostics used `ptah_read_symbol`, `ptah_ast_analyze`, `ptah_context_enrich_file`, and `ptah_get_diagnostics`.
