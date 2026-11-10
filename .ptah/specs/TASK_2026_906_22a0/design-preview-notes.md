# Design preview — notes and next exact step (TASK_2026_906, PR #1038)

## How to make the captures again (repository root, one command at a time)

1. Build the Electron app and the renderer (heavy, under the lock):
   `node scripts/verify.mjs --exec --task git-dock-preview -- npx nx build-dev ptah-electron`
   `node scripts/verify.mjs --exec --task git-dock-preview -- npx nx copy-renderer-dev ptah-electron`
2. Capture:
   `node scripts/verify.mjs --exec --task git-dock-preview -- npx playwright test --config=apps/ptah-electron-e2e/git-dock-preview.config.ts`
   Output: `dist/apps/ptah-electron-e2e/git-dock-preview-shots/*.jpg`.
3. Build the page:
   `node .ptah/specs/TASK_2026_906_22a0/build-design-preview.mjs`
4. Publish `.ptah/specs/TASK_2026_906_22a0/design-preview.html` with `ptah_artifact_publish`
   (title: "Design preview — detachable Git dock (PR #1038)").

The capture uses the real RPC fixtures (`support/real-rpc-fixtures.ts`) and a scratch repository.
Nothing is mocked: the Git window is a second BrowserWindow, and the fake RPC listener of the
default fixtures does not reach it. The capture file is `*.shot.ts`, so the `e2e` target
(`**/*.spec.ts`) does not run it. The worktree needs `node_modules` (a junction to the main
checkout; not committed).

## Files

| Item | Path |
| ---- | ---- |
| Playwright config | `apps/ptah-electron-e2e/git-dock-preview.config.ts` |
| Capture | `apps/ptah-electron-e2e/src/specs/git-dock-preview/git-dock-preview.shot.ts` |
| Page generator | `.ptah/specs/TASK_2026_906_22a0/build-design-preview.mjs` |
| Defects, deviation text, omitted frames | `.ptah/specs/TASK_2026_906_22a0/design-preview-defects.json` |
| Page | `.ptah/specs/TASK_2026_906_22a0/design-preview.html` |

## Next exact step

State on 2026-11-10, phase 2 (defect fixes). All fix commits are on the PR branch:

| Defect | Commit | Result |
| ------ | ------ | ------ |
| 1 Git window surface | 1a300aa39 | fixed |
| 2 Theme follow at run time | 517794125 | fixed (theme name only) |
| 6 Default and minimum width | f328838d2 | fixed (920 / 720 px) |
| 5 Detach and Attach icons, divider | 489c8ca05 | fixed |
| 4 Detach alone, no repository | 9531759ac | fixed (Detach hidden) |
| 3 The 96 px rail | - | open, user decision |
| 7 Focus ring tokens | - | tokens match the docked dock, no change |
| 8 Raw Git error text | - | open, not from this PR |

The captures of the old head (8bdc25d29) are in
`dist/apps/ptah-electron-e2e/git-dock-preview-before/` (not committed). The page generator
reads them as the "before" frames (second argument).

Steps that remain, in sequence:

1. Build the renderer and capture again (steps 1 and 2 above).
2. Examine the frames: surface, theme follow (02x), minimum width (02m, hunk header not cut).
3. Build the page and publish it with the same title.
4. Commit the capture file, the generator, the defects file, the page and these notes. Push.
5. Read the lane review (`fix-diff-review.md`), then update the PR body and report to the parent.

Open decision for the user: decision 16 deviation (the 96 px detached rail). See frames
`03-main-detached-rail` and `03b-rail-close-up`.
