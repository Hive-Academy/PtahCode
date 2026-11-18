## Summary
The Electron chat Display sidebar is removed. Display arrivals and explicit display opens now use the detached window by default. Automatic updates refresh in place; explicit opens focus the window. Native close holds back reopening during the same streaming turn. The detached window owns Keep current view and Close.

## Root cause of the height problem
- `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts:85`: the active tabpanel previously lacked a growing flex container. A full-height window above it did not give its intrinsically sized viewers the remaining height. Active panels now use flex-column/flex-1/min-h-0, and surface renderers grow with internal scrolling.
- `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-file-viewer.component.ts:14`: the file-viewer host did not fill the flex allocation. The image frame now fills and centers at line 25; its image keeps max-width/max-height and object-contain, preserving natural-size limits. The PDF's previous 70vh cap is replaced by full-height flex sizing at line 29. Markdown scrolls inside the allocated area.
- `libs/frontend/chat-ui/src/lib/organisms/artifacts/artifact-viewer.component.ts:184`: the iframe normally uses intrinsic reported pixel height. Display mode now clears that inline height and stretches through a full-height/min-h-0 flex chain. Inline artifact cards retain their existing height behavior.
- `libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.ts:45`: the existing h-dvh window root and min-h-0/flex-1 main are retained and covered by a regression assertion.
These source causes and sizing classes are verified by tests; rendered Electron resizing has not been visually verified in this lane.

## Files changed
| Path | Change |
| --- | --- |
| `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts` | Remove Display sheet imports, controls and resize wiring; bind detached source. |
| `libs/frontend/chat/src/lib/components/templates/chat-view.component.html` | Remove Display host, column, detached rail, controls and separator. |
| `libs/frontend/chat/src/lib/components/templates/chat-view.component.spec.ts` | Remove obsolete sidebar suite and width mocks. |
| `libs/frontend/chat/src/lib/components/templates/chat-view.keepalive.spec.ts` | Remove sheet fixture wiring; retain transcript keepalive coverage. |
| `libs/frontend/chat/src/lib/components/templates/display-window-wiring.ts` | New source binding and artifact auto-open wiring without sidebar layout persistence. |
| `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts` | Emit explicit/automatic window requests; retain tab selection, pin and current-turn close rules; remove width state. |
| `libs/frontend/chat/src/lib/services/display-dock/display-dock.state.spec.ts` | Remove width tests and expectations. |
| `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts` | Automatically open once, coalesce opens, refresh without focus, focus explicit requests; route background sources; close suppression; pin action. |
| `libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.spec.ts` | Cover default opening, refresh/focus, background tabs, native close, host fallback and source routing. |
| `libs/frontend/chat/src/lib/services/display-window/display-window-wire.ts` | Validate typed pin actions. |
| `libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.ts` | Move Keep current view control here; replace Re-attach with Close; retain full-viewport root. |
| `libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.spec.ts` | Pin action, Close control and viewport class regressions. |
| `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts` | Fill active tabpanel and surface renderer; pass fillAvailable to artifact viewer. |
| `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.spec.ts` | Full-height active panel regression. |
| `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-file-viewer.component.ts` | Fill/shrink flex chain; center contain-fit images; full-height PDFs and scrollable markdown. |
| `libs/frontend/chat-ui/src/lib/organisms/display-panel/display-file-viewer.component.spec.ts` | Image/PDF fill and fit class regressions. |
| `libs/frontend/chat-ui/src/lib/organisms/artifacts/artifact-viewer.component.ts` | Display-only fillAvailable input removes intrinsic iframe height; inline cards retain existing sizing. |
| `libs/frontend/chat-ui/src/lib/organisms/artifacts/artifact-viewer.component.spec.ts` | Fill mode host/iframe regression. |
| `libs/frontend/chat-ui/src/lib/services/ptah-ui-display-dock.ts` | Document detached-window routing behind the existing chip port. |
| `libs/frontend/chat-ui/src/lib/organisms/ptah-ui/ptah-ui-display-chip.component.ts` | Update navigation contract comment. |
| `libs/frontend/core/src/lib/services/electron-layout.service.ts` | Remove persisted displaySidebarWidth signal, setter, schema and persistence. |
| `libs/frontend/core/src/lib/services/electron-layout.service.spec.ts` | Remove obsolete display-width specs and payload expectations. |
| `libs/backend/rpc-handlers/src/lib/handlers/display-window-rpc.handlers.ts` | Validate pin boolean beside the RPC handler. |
| `libs/backend/rpc-handlers/src/lib/handlers/display-window-rpc.handlers.spec.ts` | Accept pin in validated relay actions. |
| `libs/shared/src/lib/types/rpc/rpc-display-window.types.ts` | Add typed pin action; document historical attach action as close. |
| `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-board.component.ts` | Remove deleted sheet from overlay selector. |
| `libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts` | Remove deleted sheet from overlay selector. |
| `libs/frontend/canvas/src/lib/canvas-detail/canvas-detail-transcript.component.spec.ts` | Remove sheet stub/import; retain surface publishing and assert no sheet host. |
| `libs/frontend/command-center/src/lib/components/command-rail-display.component.ts` | Electron displays use Open Display launcher; existing non-Electron inline fallback retained. |
| `libs/frontend/command-center/src/lib/components/command-rail-display.component.spec.ts` | Cover detached launch and absence of inline panel on Electron. |
| `scripts/eager-closure-gate.js` | Replace sidebar wiring allowlist with detached source wiring; delete sheet allowlist. |
| `apps/ptah-electron/src/config/eager-closure-gate.spec.ts` | Update eager-growth fixtures for renamed wiring and deleted sheet. |

## Files deleted
- `libs/frontend/chat/src/lib/components/organisms/display-sheet/display-sheet.component.ts`
- `libs/frontend/chat/src/lib/components/organisms/display-sheet/display-sheet.component.spec.ts`
- `libs/frontend/chat/src/lib/components/templates/display-sidebar-wiring.ts`
- `libs/frontend/chat/src/lib/components/templates/chat-view.dock.spec.ts`

## Preserve list
| Sidebar capability | Result |
| --- | --- |
| Multiple display tabs and switching | Stays in the existing detached DisplayPanel; surfaces, files and artifacts share its strip. |
| Display count | Stays in the detached window header. |
| Closing the view | Close and the native window close close the detached view; same-turn streamed surfaces do not immediately reopen it. Explicit display opens reopen/focus it. Content remains available through its chip and tab state, as before. |
| Keep current view | Moved to detached header; typed pin action updates the same store pin and prevents automatic selection changes. |
| Image, PDF, markdown, HTML/artifact and surface/chart viewing | Stays; file/surface containers fill the viewport, artifacts fill their iframe, oversized content scrolls internally. Images fit without forced upscaling. |
| Surface sync and per-surface view state | Stays through the existing headless transcript sync and snapshot/action bridge. |
| Fullscreen artifact, external links, retry | Stays through existing panel outputs and RPC allowlists. |
| Non-Electron inline rendering | Existing transcript and command-center inline fallback retained; desktop-only backend host unchanged. |
| Agent-monitor state | Existing shared state is retained for non-Electron inline agent monitoring and command-center reveal cues; it is not display-sidebar layout state. |

## Proposed Removals
- In-window Display host/sheet, right layout column, resize separator and saved display width: expressly requested; no replacement sidebar.
- Display sidebar toggle/Collapse and Detach/Re-attach controls: detached is the sole Electron display surface. Close replaces Re-attach, and Open Display/chips open or focus it.
- Sidebar-only component/width/dock layout specs: deleted or removed in place; retained behavior is tested at the dock/window/viewer boundaries.
No display content kind, pinning, tab switching or surface synchronization is intentionally removed.

## Decisions
| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep existing dock state as the display selection store | Reuse vs introduce another store | Existing chip ports, surface sync, per-tab state, command-center reveal and non-Electron agent monitor all use it. Width/sidebar component state is removed. | Yes |
| Signal automatic vs explicit open requests | Focus on every publish vs requests with focus intent | Automatic stream updates must not steal focus; existing host open focuses an already-open native window. Requests open only while closed unless explicit. | Yes |
| Keep the historical attach wire action as Close | Rename public action vs preserve transport compatibility | Existing main-renderer relay already closes native window. UI now says Close; additive pin action does not change the host port. | Yes |
| Use an artifact fillAvailable input | Change every artifact card vs display-only fill | Inline artifact cards depend on content height; the detached panel needs viewport height. | Yes |
| Adapt command-center Electron display consumer | Keep duplicate inline display vs detached launcher | Consumer search found another DisplayPanel in command-center. Electron uses the launcher; non-Electron preserves its inline implementation. | Yes |
| Update eager allowlist and canvas selectors | Leave obsolete paths vs update consumers | Searches found deleted sidebar paths in the bundle gate and overlay selectors. Needed to avoid dead references and eager-growth failure. | Yes |

## Checks run
Final focused results: 452 tests across 13 suites passed, five TypeScript projects passed, and ESLint found zero errors. Checks are focused; no git, nx, npm verify, build, serve, dev, e2e or package target was run. Long output is in `.ptah/tmp/display-*.log`.

| Command | Result / log |
| --- | --- |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | Passed; `display-chat-tsc.log`. |
| `npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json` | Passed, including final renderer check; `display-renderer-final-tsc.log`. |
| `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json` | Passed; `display-electron-tsc.log`. |
| `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/display-window-rpc.handlers.spec.ts` | Passed: 29 tests; `display-rpc-jest.log`. |
| `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/organisms/artifacts/artifact-viewer.component.spec.ts` | Passed: 28 tests including fill mode; `display-artifact-final-jest.log`. |
| `npx jest --config libs/frontend/chat-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat-ui/src/lib/organisms/display-panel/display-file-viewer.component.spec.ts libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.spec.ts --moduleNameMapper '{"^marked$":"D:/projects/ptah-extension/node_modules/marked/lib/marked.umd.js"}'` | Passed: 2 suites, 30 tests; `display-viewers-mapped-jest.log`. |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/display-dock/display-dock.state.spec.ts libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.spec.ts --moduleNameMapper '{"^marked$":"D:/projects/ptah-extension/node_modules/marked/lib/marked.umd.js"}'` | Passed: 2 suites, 40 tests; `display-window-mapped-jest.log`. |
| `npx jest --config libs/frontend/command-center/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/command-center/src/lib/components/command-rail-display.component.spec.ts --moduleNameMapper '{"^marked$":"D:/projects/ptah-extension/node_modules/marked/lib/marked.umd.js"}'` | Passed: 7 tests; `display-command-rail-jest.log`. |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.spec.ts` | Passed: 28 tests before the last closed-source replay guard; final rerun recorded below. `display-sync-final-jest.log`. |

The mapped commands were launched with a Python `subprocess.run` argument array to preserve the JSON argument on Windows. This uses the existing installed dependency outside the worktree, read-only. No package/configuration or installed dependency was modified. Initial unoverridden viewer/window/dock attempts failed before collecting tests because `jest.preset.js` points at the absent worktree-local `node_modules/marked/lib/marked.umd.js`; the final mapped runs resolve that verification limitation. Initial synchronization assertions expected sidebar-era behavior and were updated to default opening. Initial ESLint found a duplicate min-height class binding and unused fixture imports; these were corrected before final lint. The first canvas run passed nine tests and found a stale assertion referencing the removed panel fixture. It was changed to assert retained dock surfaces across visibility changes, then rerun.

| Command | Result / log |
| --- | --- |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.spec.ts libs/frontend/chat/src/lib/components/templates/chat-view.component.spec.ts libs/frontend/chat/src/lib/components/templates/chat-view.keepalive.spec.ts --moduleNameMapper '{"^marked$":"D:/projects/ptah-extension/node_modules/marked/lib/marked.umd.js"}'` | Passed: 3 suites, 151 tests; `display-chat-final-jest.log`. Includes the final closed-source guard. |
| `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/electron-layout.service.spec.ts` | Passed: 128 tests; `display-layout-jest.log`. |
| `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/config/eager-closure-gate.spec.ts` | Passed: 29 tests; `display-eager-gate-jest.log`. Existing ts-jest allowJs configuration warnings. |
| `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json` | Passed; `display-cli-engine-tsc.log`. |
| `npx tsc --noEmit --project libs/backend/platform-cli/tsconfig.lib.json` | Passed; `display-platform-cli-tsc.log`. |

```text
npx eslint libs/frontend/chat/src/lib/components/templates/chat-view.component.ts libs/frontend/chat/src/lib/components/templates/chat-view.component.spec.ts libs/frontend/chat/src/lib/components/templates/chat-view.keepalive.spec.ts libs/frontend/chat/src/lib/components/templates/display-window-wiring.ts libs/frontend/chat/src/lib/services/display-dock/display-dock.state.ts libs/frontend/chat/src/lib/services/display-dock/display-dock.state.spec.ts libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.ts libs/frontend/chat/src/lib/services/display-window/display-window-sync.service.spec.ts libs/frontend/chat/src/lib/services/display-window/display-window-wire.ts libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.ts libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.spec.ts libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.ts libs/frontend/chat-ui/src/lib/organisms/display-panel/display-panel.component.spec.ts libs/frontend/chat-ui/src/lib/organisms/display-panel/display-file-viewer.component.ts libs/frontend/chat-ui/src/lib/organisms/display-panel/display-file-viewer.component.spec.ts libs/frontend/chat-ui/src/lib/organisms/artifacts/artifact-viewer.component.ts libs/frontend/chat-ui/src/lib/organisms/artifacts/artifact-viewer.component.spec.ts libs/frontend/chat-ui/src/lib/services/ptah-ui-display-dock.ts libs/frontend/chat-ui/src/lib/organisms/ptah-ui/ptah-ui-display-chip.component.ts libs/frontend/core/src/lib/services/electron-layout.service.ts libs/frontend/core/src/lib/services/electron-layout.service.spec.ts libs/backend/rpc-handlers/src/lib/handlers/display-window-rpc.handlers.ts libs/backend/rpc-handlers/src/lib/handlers/display-window-rpc.handlers.spec.ts libs/shared/src/lib/types/rpc/rpc-display-window.types.ts libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-board.component.ts libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts libs/frontend/canvas/src/lib/canvas-detail/canvas-detail-transcript.component.spec.ts libs/frontend/command-center/src/lib/components/command-rail-display.component.ts libs/frontend/command-center/src/lib/components/command-rail-display.component.spec.ts scripts/eager-closure-gate.js apps/ptah-electron/src/config/eager-closure-gate.spec.ts
```
Passed: 31 files, zero errors, 14 existing warnings; `display-all-eslint.log`. Nx module-boundary enforcement was unavailable without a cached ProjectGraph.


Additional final checks:

| Command | Result / log |
| --- | --- |
| `npx jest --config libs/frontend/canvas/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/canvas/src/lib/canvas-detail/canvas-detail-transcript.component.spec.ts --moduleNameMapper '{"^marked$":"D:/projects/ptah-extension/node_modules/marked/lib/marked.umd.js"}'` | Passed: 10 tests; `display-canvas-final-jest.log`. |
| `npx eslint libs/frontend/canvas/src/lib/canvas-detail/canvas-detail-transcript.component.spec.ts` | Passed: zero errors; `display-canvas-final-eslint.log`. Nx boundary check unavailable without cached graph. |
| `ptah_get_diagnostics` with `files` set to the absolute paths of `display-window-sync.service.ts` and `canvas-detail-transcript.component.spec.ts`, `severity: "error"` | Unavailable after 45 seconds; both files unchecked. Earlier scoped attempts had the same result. Native checks above are the fallback evidence. |

## Not done / risks
- No Electron screenshot or interactive resize/image/PDF/HTML visual review was available. Electron attach tools are absent and build/serve/e2e targets are prohibited for this lane. The coordinator must perform the rendered Electron gate.
- Native renderer `tsc` is not the full Angular template gate; the coordinator must run that gate under the task's verification split.
- Skill invocation/discovery is unavailable in this lane: matching `angular-frontend-patterns` / `ui-ux-designer` instructions could not be loaded. Repository and supplied Angular instructions were followed directly.
- Scoped `ptah_get_diagnostics` returned unavailable: compiler still running after 45 seconds. Native TypeScript checks were used as fallback; this is not a Ptah diagnostic pass.
- ESLint cannot enforce Nx module boundaries without a cached ProjectGraph. Existing godfile/non-null warnings remain in untouched portions of modified files; no new backend injectable or cross-layer dependency was introduced.
- `apps/ptah-electron/src/windows/display-window.ts`, the desktop-only host port, and backend CLI composition require no change: the existing open/focus/publish APIs cover the new default. The wire change adds only pin validation.
- Extra reads/edits beyond the initial list: artifact viewer (intrinsic iframe sizing), core layout persistence, canvas consumers/spec stubs, command-center's second display consumer, and the Electron eager-closure gate. These were required by consumer discovery.
- An earlier agent report about the command-center consumer was refused with `delivered: false`, reason `parent-inbox-full`; no pending approval or unresolved decision is assumed.
