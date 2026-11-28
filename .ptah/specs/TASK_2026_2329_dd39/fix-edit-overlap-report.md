# Edit header overlap

The supplied Electron captures at 1280, 1440, and 1824 px show the model ID overlapping the Effort chip and the Instance name clipping “OpenRouter team.” At 800 px, the stacked layout shows both values in full. The desktop modal reaches its width cap at all three wider viewports. Its grid allotted too little space to the name and Model / Effort, and the inner popover trigger retained its content width when its outer flex item shrank.

## Files changed

- `libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.html` gives the name and Model / Effort wider desktop tracks.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-model-effort-cell.component.ts` constrains the Edit model trigger through its wrapper, lets the model text truncate with an ellipsis, exposes the full ID in its title, and prevents the Effort popover from shrinking.
- `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts` checks that the model text's right edge stays at or before the Effort chip's left edge at 1280, 1440, and 1824 px.

## Verification

- Focused frontend-chat Jest passed all 114 tests across the Add CLI Instance modal, CLI orchestration matrix, and lanes table specs.
- TypeScript passed for `libs/frontend/chat/tsconfig.lib.json` and `apps/ptah-extension-webview/tsconfig.app.json`.
- ESLint passed for all three changed source files.
- `git diff --check` passed.

Post-change Electron captures and execution of the geometry assertion are pending the coordinator's run. The standalone Angular template check is outside the permitted commands for this lane.

CLI skill discovery was unavailable. I read the repository's `ui-ux-designer` and `angular-frontend-patterns` skill files directly. The Ptah dependency index returned partial coverage without entries for the components, so I used `rg` to locate their template and shared consumers.
