# Ptah CLI instance Edit header

## Root cause

- At 800, 1440 and 1824 px, the failure was at the read-only height assertion. The selector `dd, dd button` sampled both value containers and their nested buttons, producing two distinct heights. The read-only row assertion had already passed at those widths.
- At 1280 px, the fixture timed out waiting 30 seconds for `ptah-electron-shell` in `UiDriver.prepare()`, before the scene applied its viewport or used a settings locator. The attached Electron main-loop watchdog logged recovery after 31,982 ms. The header scene group now allows one retry for transient startup failures.
- The old scene captured the Edit dialog only at 1824 px, after the failing read-only height assertion. The Edit dialog itself stacked the name and fixed provider and did not include the other three fields.

## Changes

- `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts` scopes read-only and Edit locators to the expanded OpenRouter detail and the named dialog. It compares actual control tops within two CSS pixels and verifies whole-field wrapping at 800 px. Edit screenshots use `ptah-cli-instance-edit-<width>.png`.
- `libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.html` adds the responsive Edit grid. The create form retains its stacked layout.
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts` supplies the model and effort controls and inherited permission and network values. `cli-orchestration-matrix.component.spec.ts` checks the rendered Edit fields.
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-model-effort-cell.component.ts` reuses the existing model and effort editing actions with the form-control height.
- `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts` provides the wider modal size used by the Edit dialog.

The product layout changed in the Edit dialog. The header uses a five-column desktop grid and a two-column narrow grid with Model and Effort together on a full-width row. Provider remains fixed. Permission and network remain inherited from Ptah CLI defaults.

## Verification

- Reviewed the supplied 800 and 1824 px Electron screenshots. The read-only detail wraps at 800 px and fits one row at 1824 px.
- Fresh Electron screenshots and rendered Edit geometry await the coordinator's run. This lane did not launch Electron or run Playwright.
- Focused Jest passed. The three Chat suites passed 114 tests and the UI native-modal suite passed 19 tests.
- TypeScript passed for the Chat library, the Electron renderer, and the design-preview scene. The separate Angular template typecheck was outside the allowed commands. The focused Chat Jest suite rendered the Edit template.
- ESLint exited 0 across the changed files. It reported four existing non-null assertion warnings in the matrix spec and the existing max-lines warning for the matrix component.
- `git diff --check` passed.
