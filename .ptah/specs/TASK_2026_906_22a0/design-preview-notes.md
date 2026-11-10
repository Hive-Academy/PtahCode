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

See the end of this file (updated after each run).
