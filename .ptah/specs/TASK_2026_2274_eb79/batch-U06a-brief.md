# Batch U06a brief — bots page and public entry

Worktree (work only here): `D:\projects\ptah-extension\.claude-worktrees\bots-phase-1` (branch `feat/bots-phase-1`).
Task folder: `D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\.ptah\specs\TASK_2026_2274_eb79`.

## Objective

Compose the bots roster page after the editor exists. Angular 22 standalone, OnPush, `inject()`, `input()`/`output()`,
signal queries, built-in control flow, no `[innerHTML]`, no `ngClass`/`ngStyle`, stable `track` ids. Electron first:
this page runs in the Electron renderer (`apps/ptah-extension-webview`).

## Write set (only these files)

- `libs/frontend/bots-ui/src/lib/bots-page.component.ts`
- `libs/frontend/bots-ui/src/index.ts` (new; it does not exist yet — the alias `@ptah-extension/bots-ui` points to it)
- `libs/frontend/bots-ui/src/lib/bots-page.css`
- `libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts`
- If a provider-models adapter is needed (see Carry-forward), one new file
  `libs/frontend/bots-ui/src/lib/bots-provider-models-loader.ts` is allowed. Do not modify any other file.

## Read set

- `implementation-plan.md` section "U06a" (about line 656) and `design-spec.md` (roster, list states, empty, error,
  narrow back flow, "Preview later" placeholder, "Show archived (N)"), `prototype/bots.html` in the task folder.
- `libs/frontend/bots-ui/src/lib/bots.store.ts` (load, refresh, select, newDraft, discard, dirty, list, summaries,
  unreadable, unidentifiedRowNotice, archivedCount, listError, error, catalog signals, setWorkspaceRoots, loadAvatar,
  avatar cache, lanes).
- `libs/frontend/bots-ui/src/lib/bot-list-row.component.ts` (inputs incl. `lastEdit`, output `avatarNeeded`),
  `bot-editor.component.ts` (inputs `installedSkills`, `knownToolIds`, `catalogLoaded`, `catalogLoading`,
  `catalogFailed`), `batch-U06b-review.md` "Safe to carry forward to U06a" sections.
- `libs/frontend/ui/src/lib/foundation/list-detail.component.ts` (configurable split width from U02).
- `PROVIDER_MODELS_LOADER` port: `libs/frontend/ui/src/lib/native/provider-model-picker/provider-models-loader.port.ts`.
  Find the existing app adapter (grep `provide: PROVIDER_MODELS_LOADER` in `libs/frontend`).
- How the renderer gets the workspace roots and installed skills in other pages (grep in `libs/frontend/core`).
- Existing spec style: `bot-editor.component.spec.ts`.

## Acceptance criteria

- Every file stays below 700 lines. Run `npx prettier --write` on your files.
- Barrel `src/index.ts` exports only the page component (and nothing else unless the route needs it).
- Page spec asserts: an inert "Preview later" placeholder; "Show archived (N)" with the correct count; list, loading,
  error and empty states; dirty-navigation confirmation (discard is confirmed before the selection changes); the
  narrow back flow; user bots visible with the User badge. No execution control.
- The page calls `store.setWorkspaceRoots(...)` before `store.load()`.
- Shows `store.listError()` in the list and `store.error()` when `store.draft()` is null (the editor hides then).
- Unreadable items show as item diagnostics with no actions; `unidentifiedRowCount` shows as one notice.

## Carry-forward rows for U06a (must handle)

- Bound the visible image avatars to 64 or fewer. Call `loadAvatar` from the visible row (`avatarNeeded`), not from a
  broad `effect`. Handle `avatarNeeded` without a synchronous store write during change detection (defer, e.g.
  `queueMicrotask` or `afterNextRender`).
- If the cache evicts a visible row's image, re-request a null entry for a visible row (U04 re-review N1).
- Pass `lastEdit` text to each row.
- Pass the installed skills and tool catalog to the editor. Pass `catalogLoaded = false` while the tool catalog loads
  or fails.
- Provide `PROVIDER_MODELS_LOADER` above the editor (runtime picker). Reuse the existing app adapter if it is in a lib
  that `bots-ui` may import (`@ptah-extension/core`, `@ptah-extension/ui`, `@ptah-extension/shared`). Do NOT import
  `@ptah-extension/chat`. If no reusable adapter exists, write a small one in
  `bots-provider-models-loader.ts` over the existing RPC client, and record it under `## Decisions`.
- `ui-class-audit` allows 0 raw DaisyUI control classes (`btn*`, `badge`, `alert`, `input`, `select`, `toggle`,
  `skeleton`, ...) in new files. Use `ptahButton`, `ptahIconButton`, `ptahBadge` and other `@ptah-extension/ui` parts.
- In a multi-root workspace, `newDraft` must get an explicit scope.

## Checks (lane-only; do NOT run `npm run verify` or `nx`)

- `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json`
- `npx eslint <changed files>`
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` (0 counts over baseline; no bots-ui FAIL line)
- `npx jest --config libs/frontend/bots-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/bots-ui/src/lib/bots-page.component.spec.ts libs/frontend/bots-ui/src/lib/bot-editor.component.spec.ts`

Never run `build`, `serve`, `dev`, `e2e` or `package`. Do not edit `tools/ui-class-audit/baseline.json`.

## Git

No git writes: no commit, push, stash, restore, checkout, reset or clean. Report a change you did not make; do not
revert it.

## Deliverable

`D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\.ptah\specs\TASK_2026_2274_eb79\batch-U06a-report.md`.
Write a skeleton early, then fill it: files with line counts, how each acceptance criterion and carry-forward row is
met, `## Decisions`, command results. Reply `WROTE: <path>` plus one headline.
