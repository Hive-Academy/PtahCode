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

State on 2026-11-10: capture run 3 passed (2 tests, no "NOT captured" line). The page is
1.53 MiB and is published as artifact `2c0f6a9e-c83a-4682-b171-fae5ec0cbbc0`
("Design preview — detachable Git dock (PR #1038)"). No product code changed.

Steps that remain, in sequence:

1. Commit the capture, the generator, the defects file, the page and these notes.
2. `git push origin HEAD:feat/detachable-git-dock-p2b` (fast-forward only, no force).
3. `gh pr edit 1038`: add the "Design preview" line and the defect list. Correct the test-plan
   line about CI lint (the `checks` job passed on 3a64dd228).
4. Report to the parent session with `ptah_agent_report`.

Open decision for the user: decision 16 deviation (the 96 px detached rail). See frames
`03-main-detached-rail` and `03b-rail-close-up`, and the defect list in
`design-preview-defects.json`.
