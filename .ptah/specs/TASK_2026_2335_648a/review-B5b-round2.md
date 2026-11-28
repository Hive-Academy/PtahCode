# B5b Code Review — Round 2

**Verdict: APPROVE**

All four defects from `review-B5b.md` are fixed, no new blocking defects were introduced, and both focused Jest suites (77/77) and ESLint (0 errors, 0 warnings) pass.

---

## Per-Defect Status

1. **Defect 1 (Serious · Workspace switch using previous workspace status / wrong-workspace writes & Undo) — FIXED**
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:349-380`: `promptWorkspace` derives from `workspaceScope.activeWorkspacePath() ?? '.'`; `promptRead` stores `{ workspacePath, status, loading, error }`; `scopedPromptRead` gates all derived signals (`promptLoading`, `promptStatus`, `promptLoadError`, `hasGeneratedPrompt`, `promptEnabled`, `promptToggleDisabled`) to the active workspace so a scope switch immediately invalidates the previous workspace's status before any effect runs.
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:431-434,524-553`: A constructor `effect()` triggers `loadPromptStatus(workspacePath)` on every workspace change (`untracked`), and `loadPromptStatus` creates a fresh `pending` token and drops any response if `this.promptRead() !== pending || this.promptWorkspace() !== workspacePath` (`:546`).
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:460-475,577-593`: `onPromptModeChange` captures `workspacePath` and `previous` at the change event and passes that `workspacePath` to both `write` and `undo`. `writePromptMode` writes to the captured `workspacePath` and only re-reads status when `workspacePath === this.promptWorkspace()` (`:589-591`).
   - `libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts:426-433,497-508,529-552`: Drawer status is similarly keyed via `scopedStatus` + monotonic `statusReadId`, dropping obsolete or wrong-workspace reads at `:543`.
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts:252-286,419-427`: Covers A-with-content -> B-without-content immediate invalidation, dropping a late A read-back, and verifying `feedback.undo()` writes to `/a` without re-reading or mutating `/b`.

2. **Defect 2 (Moderate · Stale mounted toggle after generation completion / drawer reopen) — FIXED**
   - `libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts:422-423,497-508,601-611`: `changed` and `statusObserved` both emit the resolved `workspacePath`. Successful open/reopen reads emit `statusObserved(workspacePath)` (`:503-505`), and completed regeneration/reconciliation emits `changed(workspacePath)` (`:607`).
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:313-320,516-518`: Binds both `(changed)` and `(statusObserved)` to `onPromptStatusInvalidated($event)`, which refreshes status only when `workspacePath === this.promptWorkspace()`.
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts:921-967`: Renders the real deferred `<ptah-system-prompt-drawer>` (`DeferBlockState.Complete`) and tests both `'generation completion'` (via `regenerate-check-again`) and `'drawer reopen'` across the missing-to-generated transition, asserting the mounted toggle becomes enabled and checked.

3. **Defect 3 (Moderate · `sr-only` status contradicted session scope) — FIXED**
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:178-187`: The `sr-only` span now renders `'Applies to new sessions'` when `promptEnabled()` is true (replacing `'Active for all sessions'`), matching `PROMPT_NOTE_ON` (`:76-77`) and `PROMPT_NOTE_OFF` (`:78-79`).
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts:579-588`: Updated regression assertion verifies `'Applies to new sessions'`.

4. **Defect 4 (Minor · Missing keyboard blocking and focusability regression assertion) — FIXED**
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:198-207`: Toggle continues to use `[ptahBusyDisabled]="promptToggleDisabled() || saving()"` (which sets `aria-disabled="true"` without native `disabled`, keeps the control focusable, lets `Tab`/`Escape` pass, and cancels activation keys in capture phase per `libs/frontend/chat/src/lib/settings/feedback/busy-disabled.directive.ts:35-38,52-68`).
   - `libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts:235-250`: Asserts `toggle.tabIndex === 0`, `focus()` moves `document.activeElement` to the switch, `Tab` `keydown` is not cancelled, `Space` `keydown` is cancelled (`defaultPrevented === true`), checkbox stays unchecked, and no `enhancedPrompts:setEnabled` RPC is sent.

---

## Additional Verification Criteria

- **No side effects in `computed()`**: Verified across all `computed()` signals in `agent-behaviour-section.component.ts:349-427` and `system-prompt-drawer.component.ts:430-493`. All derivations are pure; RPC/state mutations occur only in `effect(..., untracked(...))` and event handlers.
- **Obsolete requests cannot publish workspace-keyed status**: Verified in `agent-behaviour-section.component.ts:529-552` (per-request `pending` object identity + `promptWorkspace()` match check) and `system-prompt-drawer.component.ts:533-551` (monotonic `statusReadId` + `workspacePath()` match check).
- **Undo writes to the originating workspace**: Verified in `agent-behaviour-section.component.ts:466-472,577-593` and tested in `agent-behaviour-section.component.spec.ts:282-285`.
- **Toggle stays focusable when disabled**: Verified via `[ptahBusyDisabled]` (`agent-behaviour-section.component.ts:203`, `busy-disabled.directive.ts:36,52-68`) and tested in `agent-behaviour-section.component.spec.ts:235-250`.
- **`sr-only` text says `"Applies to new sessions"`**: Verified at `agent-behaviour-section.component.ts:178-186` and tested in `agent-behaviour-section.component.spec.ts:579-588`.

---

## New Defects / Non-Blocking Observations

- **New blocking defects**: None.
- **Non-blocking observations**:
  1. `libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts:146`: If the drawer's initial open status load fails and the user clicks the inline `Retry` button (`(click)="loadStatus()"`), `loadStatus()` does not emit `statusObserved`, so the parent row would not refresh on that retry path alone (only on open/reopen or regeneration completion).
  2. Because the host does not broadcast a settings-level status-change push event for enhanced prompts, a background Setup run finishing while Settings > Advanced remains continuously mounted without opening Details or remounting Settings will still refresh only when Details is opened or Settings is remounted.

---

## Checks Run

1. **Focused Jest**:
   ```text
   npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.spec.ts
   ```
   - **Result**: PASS (exit code 0) — 2/2 test suites passed (`system-prompt-drawer.component.spec.ts`, `agent-behaviour-section.component.spec.ts`), 77/77 tests passed, 0 failed, 25.391 s.

2. **Focused ESLint**:
   ```text
   npx eslint libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.spec.ts libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts
   ```
   - **Result**: PASS (exit code 0) — 0 errors, 0 warnings.

3. **Out-of-scope / Environment Notes**:
   - No edits to source files, no `nx`, no `typecheck-templates`, no `npm run verify`, and no Electron visual checks were executed per review lane rules.
   - `ptah_code_search_symbols` returned an empty index (`0 symbols`), so `git grep` was used as the fallback for caller/event discovery. No frontend skill loader was exposed for `angular-frontend-patterns` in the built-in skill list.
