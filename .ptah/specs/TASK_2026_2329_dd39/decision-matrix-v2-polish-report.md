# Decision matrix dashboard v2 polish

The settings shell supplies the visible title and description. The dashboard remains a named region, and its toolbar puts the Context management button and right-aligned routing status, update time, and refresh button on one row. The toolbar allows wrapping at 24.75rem of content width and below.

The routing switches use an opt-in setting-row layout that splits at 17rem of usable row width, or about 20rem for a padded Glass card. The Current pick card puts the meter beside the lane when it has at least 30rem of usable content width.

I inspected the coordinator's dark 1824 px capture, light 1440 px dashboard and detail captures, and both 800 px captures. They showed the duplicate title and the 1440 px stacking. The updated Electron scene checks for a single heading and aligned toolbar and switch rows at all three capture widths. It also checks the five scored pick rows at 1440 and 1824 px.

## Files changed

- Under `libs/frontend/chat/src/lib/settings/ptah-ai`, changed `decision-matrix-page.component.html`, `decision-matrix-page.component.css`, `decision-matrix-page.component.ts`, and `decision-matrix-page.component.spec.ts`.
- In the same directory, opted in to the compact split in `host-routing-setting.component.ts`, `performance-routing-setting.component.ts`, and `lane-rotation-setting.component.ts`.
- Under `libs/frontend/ui/src/lib/patterns/setting-row`, changed `setting-row.component.ts` and `setting-row.component.spec.ts`.
- Updated `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts`.
- Added this report.

## Verification

- Focused Jest passed 43 tests across five suites. The chat suites covered the dashboard and its three routing controls, and the UI suite covered the opt-in setting-row layout.
- TypeScript passed for Electron, the shared renderer, the UI library, and a focused Electron preview project. The temporary preview check configuration was removed.
- ESLint passed for the changed TypeScript and HTML files without errors or warnings.
- The UI class audit found zero counts over baseline for class usage and raw spacing.
- Electron scene execution, new screenshots, and strict Angular template checking remain with the coordinator under the command restrictions.
- Native skill invocation was unavailable. Applied the checked-in UI/UX, Angular frontend, and surface-authoring guidance. Used native search where the Ptah dependency index lacked coverage.
