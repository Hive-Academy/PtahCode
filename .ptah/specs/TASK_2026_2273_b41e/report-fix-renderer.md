# FIX-R renderer report

## Findings

| Finding | Status | Change | Focused Jest test |
| --- | --- | --- | --- |
| #1 | Done | `memory-graph-canvas.component.ts:258` ignores bubbled key events from child controls. | `leaves Enter on zoom buttons and modified shortcuts to their controls` |
| #2 | Done | `renderer/sigma-renderer.adapter.ts:64` passes `settings: { allowInvalidContainer: true }`; the existing ResizeObserver remains. | No adapter test: Sigma requires WebGL, unavailable in Jest. Angular compiler verifies the option shape. |
| #3 | Done | `memory-graph-canvas.component.ts:164,277-293` clears stale focus; unfocused Enter does not select; first arrow focuses and announces. | `focuses and announces the first node on an arrow, but does not select on unfocused Enter` |
| #5 | Done | `memory-graph-canvas.component.ts:258` leaves Ctrl, Meta, and Alt shortcuts unhandled. | `leaves Enter on zoom buttons and modified shortcuts to their controls` |
| #8 | Done | `memory-graph-canvas.component.ts:207,241,326` carries a short original error detail in `rendererError`; the alert remains generic. | `shows and emits a safe error when the factory rejects`; `emits the original renderer mount error detail` |
| #10 | Done | `memory-graph-canvas.component.ts:297,318` uses model edges for link navigation and counts. | `uses model edges for link navigation and resets the link index when focus changes` |
| #11 | Done | `memory-graph-canvas.component.ts:312` resets link index on focus changes outside bracket navigation. | `uses model edges for link navigation and resets the link index when focus changes` |

## Files changed

- `libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph-canvas.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph-canvas.component.spec.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/renderer/sigma-renderer.adapter.ts`
- `.ptah/specs/TASK_2026_2273_b41e/report-fix-renderer.md`

## Checks

- `npx jest --config libs/frontend/memory-curator-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph-canvas.component.spec.ts`: passed, 1 suite and 9 tests.
- `npx ngc --noEmit --project libs/frontend/memory-curator-ui/tsconfig.lib.json`: passed after correcting the Sigma option nesting. Initial run failed with TS2353 for the option at top level.
- `npx eslint <three changed TypeScript files>`: exited 0; 12 existing explicit-member-accessibility warnings on the canvas component, 0 errors.
- `npx prettier --write <three changed TypeScript files>`: exited 0; final run reported all three unchanged.
- `ptah_get_diagnostics` scoped to the three changed files: unavailable after a 45-second timeout; `ngc` passed independently.

## Decisions

- Kept the existing generic user alert and added the original error message, capped at 160 characters, to the `rendererError` output. Reversible. Evidence: the review requests detail in the output while the existing UI uses a generic alert.
- Kept the raw `edges` input contract for compatibility, but graph navigation and announcements now use the rendered model edges. Reversible. Evidence: the model drops invalid edges, and this batch limits the affected files.
- Did not add a WebGL-backed Sigma test in Jest. Evidence: the task states the adapter has no WebGL in Jest; the installed Sigma type declaration and `ngc` confirm the setting.
