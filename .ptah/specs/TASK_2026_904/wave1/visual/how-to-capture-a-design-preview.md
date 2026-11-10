# How to capture a design preview

Wave 2 and TASK_2026_902 reuse this procedure. All captures are Electron only.

## 1. Build that the capture needs

The spec starts the app from `dist/apps/ptah-electron` (`main.mjs`, `preload.js`,
`renderer/index.html`). Run each heavy command under the verify lock.

```bash
# Full build (main process + renderer). Necessary one time, and after a main-process change.
node scripts/verify.mjs --exec --task electron-build -- npx nx build-dev ptah-electron

# Renderer only. Sufficient after a change in apps/ptah-extension-webview or libs/frontend/**.
node scripts/verify.mjs --exec --task renderer-build -- npx nx copy-renderer-dev ptah-electron
```

## 2. Capture and compare

```bash
# Compare the current build with the stored snapshots (fails on 1 changed pixel).
node scripts/verify.mjs --exec --task visual-parity -- \
  npx playwright test --config=apps/ptah-electron-e2e/visual-parity.config.ts

# Write new baselines. Use "changed" to keep the snapshots that are equal.
node scripts/verify.mjs --exec --task visual-parity -- \
  npx playwright test --config=apps/ptah-electron-e2e/visual-parity.config.ts --update-snapshots=changed

# One group only.
... --config=apps/ptah-electron-e2e/visual-parity.config.ts -g 'consumer surfaces'
```

For a before/after pair: build the tree without the change, write the baselines, build the tree
with the change, then compare. A failed compare writes `*-actual.png` and `*-diff.png` to the
Playwright output folder; these are the "after" image and the changed pixels.

## 3. Where things are

| Item | Path |
| ---- | ---- |
| Config (`maxDiffPixels: 0`, snapshot path template) | `apps/ptah-electron-e2e/visual-parity.config.ts` |
| States | `apps/ptah-electron-e2e/src/visual-parity/wave1.spec.ts` |
| Fixture workspace | `.ptah/specs/TASK_2026_904/wave1/visual/sample-repo` |
| Snapshots (`{arg}.png`, git-ignored) | `.ptah/specs/TASK_2026_904/wave1/visual/snapshots/` |
| Page generator | `.ptah/specs/TASK_2026_904/wave1/visual/build-design-preview.mjs` |
| Page (generated, not committed) | `.ptah/specs/TASK_2026_904/wave1/visual/design-preview.html` |

## 4. How to add a state

1. In `wave1.spec.ts`, add a step to the applicable `test` (or a new `test`) that opens the
   surface in the fixture workspace.
2. Call `shot(...)` with a new snapshot name for each theme. The name becomes `{name}.png`.
3. If the surface has a scrollbar or a hover effect below the default pointer park position
   (1590, 990), give `settle()` a different park position for that name, as
   `review-settings-before` does.
4. Run the capture two times with `--update-snapshots=changed` and then one compare. A state is
   good only when the compare is 0 px.

## 5. Build the page

```bash
node .ptah/specs/TASK_2026_904/wave1/visual/build-design-preview.mjs "$(pwd)"
```

The script embeds the snapshots as data URIs. Keep the page below 2 MiB: do not embed the
`analyze-ready-*-glass` snapshots (1.5 MB to 1.8 MB each). Publish the page with
`ptah_artifact_publish` (`path` = the HTML file).

## 6. Known problems

- An Electron run can delete files in `.claude/commands/` and change
  `wave1/visual/sample-repo/.mcp.json`. Run `git status` after each run and restore these files
  with `git restore` before a commit.
- In some runs the app shows the Settings view during the chat rail focus step. Add
  `--retries=3`; a pass on the first attempt of the repeated run is a valid result.
- The worktree needs `node_modules` (a junction to the main checkout is sufficient).
