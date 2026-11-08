# Live fixes for PR #995

## 1. CLI matrix overflow

Cause: `captureMatrixPopovers` checks the table wrapper's `scrollWidth - clientWidth`. The Electron layout is narrower than VS Code because of the shell sidebar; the prior 76 px cell reduction still left 43 px horizontal overflow in CI. The live 1024 px capture places the matrix at x=101..1041.25, 17.25 px beyond the viewport.

Change: `cli-orchestration-matrix.component.ts` now constrains the host and wrapper to the available width, gives the table a fixed layout, and allows header and cell text to wrap. The existing single stacked Lane defaults column retains Permission and Network controls. Labels, focusable controls, and text colors remain unchanged. Expected wrapper overflow is 0 px in the 1024 px Electron and VS Code variants and at 1400 px. At x=101 in the 1024 px capture, the available width is 923 px; the matrix must end at or before x=1024. These are expectations from CSS, not measured screenshots. E2e/rendered verification was prohibited.

## 2. Cursor reasons

Cause: the Cursor manifest marks plan, ask, and auto-edit unsupported with explicit reasons, while the cell rendered only supported select options. Change: the cell displays each unavailable Cursor mode and its manifest reason as visible, keyboard-reachable text. A focused component spec checks all three reasons and tab stops.

## 3. Codex reset

Cause: `PtahFileSettingsManager.get()` falls through to its registered `danger-full-access` default when the legacy key is absent. `readCliLaneDefaults` called the workspace provider with `undefined`, so the legacy fallback was projected as a saved row. `readRaw` now supplies an explicit null sentinel and maps it back to absence. Explicitly stored values, including `danger-full-access`, still project. A regression spec simulates file-settings fallback and checks both absence and an explicit stored value. Development startup also seeds `~/.ptah-dev` from production via `prepareDevelopmentSettings`, but the observed reset state is explained by the reader fallback even when the key is absent in the active file.

## 4. agent:getConfig timeout

Code trace: `registerGetConfig` awaits `cliDetection.detectAll()`, `mergePtahCliAgents()`, `getCursorApiKeyStatus()`, and `readDecisionModelStatus()` sequentially. `cliLaneDefaults` is read synchronously in the result construction after detection. `CliDetectionService.detectAll()` can wait on an in-flight or first PATH scan. The new settings read introduces no awaited work, so the branch's lane-default projection cannot itself cause the renderer timeout. No change to detection was made; this timeout remains an independent investigation.

## 5. Marketplace CI

The failing marketplace spec uses `marketplace-shell` and discovery-view selectors. The changed files are confined to the CLI settings matrix and agent config handlers, with no marketplace imports or selector changes. This appears unrelated. `gh run list --branch main --workflow webview-e2e --limit 5` could not retrieve main results: this environment has no GitHub CLI authentication (`gh auth login` required).

## Files changed

- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts` and its spec
- `libs/backend/rpc-handlers/src/lib/handlers/agent-config/cli-lane-defaults-config.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.set-config.spec.ts`

## Verification

- Focused RPC spec: 112 passed, exit 0, using `npx nx test @ptah-extension/rpc-handlers --testPathPatterns=agent-rpc.handlers.set-config.spec.ts --coverage=false --maxWorkers=2 --output-style=static`; rerun after the final assertion passed.
- First focused attempt failed because Jest 30 renamed `--testPathPattern` to `--testPathPatterns`; corrected command passed.
- `ptah_get_diagnostics` on changed files timed out after 45 seconds, twice; qualified as unchecked.
- `npm run verify -- -p @ptah-extension/chat,@ptah-extension/rpc-handlers`: lint/typecheck stage passed 4/4 tasks; the combined test stage was idle for several minutes and was interrupted (exit 1), so the full verify command did not complete. Focused chat spec passed 7/7 tests and focused RPC spec passed 112/112 tests.
- E2e, build, and serve were not run, per instruction.

## Decisions

- Used the existing file-settings caller-default precedence with a null sentinel instead of expanding the workspace-provider interface across hosts. Evidence: `PtahFileSettingsManager.get()` checks caller default before registered default. Reversible.
- Kept the one stacked Lane defaults column and changed table sizing, preserving the current matrix structure. Reversible.

