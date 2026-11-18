# Batch U06b brief — editor, save bar and conflict drawer

Worktree (work only here): `D:\projects\ptah-extension\.claude-worktrees\bots-phase-1` (branch `feat/bots-phase-1`).
Task folder: `D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\.ptah\specs\TASK_2026_2274_eb79`.

## Objective

Keep editor orchestration and feedback small. Angular 22 standalone, OnPush, `inject()`, `input()`/`output()`,
signal queries, built-in control flow, no `[innerHTML]`, no `ngClass`. Electron first: this UI runs in the
Electron renderer (`apps/ptah-extension-webview`).

## Write set (only these files)

- `libs/frontend/bots-ui/src/lib/bot-editor.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-save-bar.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-conflict-drawer.component.ts`
- `libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`
- Small fixes allowed in `libs/frontend/bots-ui/src/lib/bot-identity-runtime-section.component.ts` only for
  carry-forward row "U05 re-review 1 #3/#4" (below). Do not modify any other file.

## Read set

- `implementation-plan.md` section "U06b" (about line 641) and `design-spec.md` (editor, save bar, conflict,
  archived note states), `prototype/` in the task folder.
- `libs/frontend/bots-ui/src/lib/bots.store.ts` (store API: blockedReason, readonly, error, listError,
  setWorkspaceRoots, loadAvatar, uploadAvatar, resubmitConflict, loadConflictLatest, save, toggle, draft).
- U05 sections: `bot-identity-runtime-section.component.ts`, `bot-skills-tools-section.component.ts`,
  `bot-memory-approval-section.component.ts`, `bot-delete-dialog.component.ts` (their inputs/outputs).
- `batch-U05-report.md`, `batch-U05-review.md` (Re-review 1 "Safe to carry forward").
- Existing spec style: `libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts`.
- Shared UI exports from `@ptah-extension/ui` that the U05 sections already use.

## Acceptance criteria

- Each file stays below 700 lines (eslint `max-lines`, blank lines and comments skipped). Write Prettier-clean code
  (run `npx prettier --write` on your files).
- Editor composes the four U05 sections and the delete dialog, and owns focus and actions.
- Save bar owns its eight display states (from design-spec.md).
- Conflict drawer owns the comparison display and emits choices (compare, edit mine, resubmit, load latest).
- Store stays the only state writer. No dependency on the future page or the barrel (`src/index.ts`).
- Editor spec asserts: the Enabled switch is shown with the exact associated hint
  "Applies at once. Does not save other edits."; the execution-disabled message stays visible; Restore is present
  in the archived note and restore is disabled when it must be; readonly archive; first-invalid focus; conflict
  comparison; draft preservation.
- No execution control.

## Carry-forward rows for U06b (must handle)

- Disable save, enabled and field controls from `blockedReason()` and `readonly()`. Keep conflict compare,
  edit-mine, `resubmitConflict` and `loadConflictLatest` available during a conflict.
- Pass no scope to `uploadAvatar`. Show `error` in the editor (the editor is the one owner of `store.error()`).
- The editor binds `installedSkills`, `knownToolIds`, `catalogLoaded`, `catalogLoading`, `catalogFailed` on the
  skills section. Pass `catalogLoaded = false` while the tool catalog loads or fails.
- The editor passes the target bot's `archived`, `dirty` and `name` to the delete dialog, mounts it closed and
  toggles `isOpen`.
- U05 re-review 1 #3: an invalid second avatar file does not cancel an earlier valid upload in flight. Cancel it
  through an existing store method if one exists; else document the choice under `## Decisions`.
- U05 re-review 1 #4: `setEffort(null)` returns without clearing while `setTier(null)` clears. Make them consistent.

## Checks (lane-only; do NOT run `npm run verify` or `nx`)

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`
- `npx eslint <changed files>`
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts libs/frontend/bots-ui/src/lib/bot-form-sections.spec.ts`

Never run `build`, `serve`, `dev`, `e2e` or `package`.

## Git

No git writes: no commit, push, stash, restore, checkout, reset or clean. Report a change you did not make; do not
revert it.

## Deliverable

`D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\.ptah\specs\TASK_2026_2274_eb79\batch-U06b-report.md`.
Write a skeleton early, then fill it: files changed with line counts, how each acceptance criterion and each
carry-forward row is met, `## Decisions`, command results. Reply `WROTE: <path>` plus one headline.
