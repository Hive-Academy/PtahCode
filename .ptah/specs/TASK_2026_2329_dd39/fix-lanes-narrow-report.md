# Narrow Providers lanes matrix

## Cause

The fixed-layout table let the status label and Sign in action share an unbreakable line, despite reserving space for the row menu. The inherited Network value was an unwrapped inline flex group inside a clipped cell. The Model ID and effort also shared one line, so the effort trigger left little space for the ID at the narrower table width.

## Fix

- At table widths up to 75rem, Sign in moves below the status label. The row menu keeps its existing anchor. Status labels can ellipsize and retain their existing title.
- Inherited Permission and Network labels can wrap within their cells, including the `(default)` suffix.
- At table widths up to 75rem, the model gets the full column width and can wrap within it. Effort moves to its own line when present. The wide layout keeps its inline model and effort controls. The focused spec checks that the model trigger itself retains the full ID and display name in its title.

## Files

- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table.component.spec.ts`

## Checks

- Focused Jest suites `lanes-table.component.spec.ts` and `lanes-table.visual.component.spec.ts` passed with 79 tests.
- `tsc --noEmit` passed for chat (`libs/frontend/chat/tsconfig.lib.json`), Electron (`apps/ptah-electron/tsconfig.app.json`), and the renderer (`apps/ptah-extension-webview/tsconfig.app.json`).
- Scoped ESLint reported zero errors and 16 existing non-null assertion warnings in the spec. ESLint has no matching configuration for the stylesheet and reported it as ignored.
- `git diff --check` passed.
- Reviewed the supplied Electron screenshots at 1440px and 1824px against Status/Permission separation, the inherited Network suffix, and Model readability. The local Electron preview failed to launch the renderer, so post-change screenshot verification at 1280–1440px remains open.
- Read the workspace Angular frontend and UI/UX skill instructions. Used native `rg` for usage searches when the Ptah dependency graph omitted the stylesheet.
