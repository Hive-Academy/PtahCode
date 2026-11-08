# CI matrix overflow fix

## Cause

`captureMatrixPopovers` sets a 1024 × 768 viewport through `openSettingsAt`, then checks the `cli-matrix` table wrapper's `scrollWidth - clientWidth`. The new lane-default cell imposed a 144 px (`min-w-36`) intrinsic width in every CLI row. The wrapper exceeded its width by 64 px in both hosts and themes.

## Change

In `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts`, the cell now uses a 76 px width with zero minimum width. Explanatory text and the reset button wrap within that column. Both `select-xs` controls fill the column without imposing a larger minimum width; their accessible labels and value titles remain available. The visible Permission and Network labels, choices, warning, and reset action remain present. Existing `text-base-content` contrast is retained.

## Width reasoning

At the smoke test's 1024 px viewport, the responsive matrix can have a narrower content box in Electron than VS Code. The old 144 px minimum becomes 76 px, releasing 68 px against the measured 64 px overflow, so the expected wrapper overflow is at most 0 px, with approximately 4 px spare at the previous limiting width. This is a calculation from the test and CSS; no e2e target was run.

## Verification

`npm run verify -- -p @ptah-extension/chat`: passed (exit code 0). Both lint and typecheck succeeded, and the chat unit test target succeeded. Scoped `ptah_get_diagnostics` timed out after 45 seconds while TypeScript checking was still running; the successful project typecheck supplies the compiler result. No e2e target or rendered UI was run, per the task's verification restrictions.

## Decisions

- Kept both controls stacked in the existing cell instead of changing table columns. The current matrix already groups lane defaults in one column and its responsive rules hide Status and Provider at narrow widths. This is reversible.
