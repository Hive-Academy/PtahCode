# P2 slice C fix round 2 and visual defect 4

TASK_2026_2325_899d · D45

## Files changed

- `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts`
- `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts`

## Fixes and regression tests

1. **Setup write alert**. A fresh, successful read of a set Setup pair or an unset Setup with a valid effective workspace pair clears the write alert. Invalid and unavailable results preserve it. The Settings-return regression covers both recovered states. The existing deferred-clear test still covers the queued read returning the unchanged invalid state and preserving the alert. See `analyze-workspace.page.ts:742` and `analyze-workspace.page.spec.ts:320`, `:382`.
2. **Deferred route Re-run**. Choosing a saved run consumes the pending Re-run before the saved load can settle. Start and Continue share route-intent consumption after their readiness guard. The regression clicks Use while Setup is invalid, recovers Setup during the saved load and verifies that the saved result wins without a fresh run. See `analyze-workspace.page.ts:849`, `:878`, `:887`, `:901` and `analyze-workspace.page.spec.ts:231`.
3. **Start button**. The primary class follows Setup readiness. The native disabled state, base button sizing, and label remain in place. The regression asserts the class and native disabled state before and after Setup recovery using the same DOM button. See `analyze-workspace.page.ts:443` and `analyze-workspace.page.spec.ts:427`.

## Checks

Focused commands ran under the repository verify lock using `node scripts/verify.mjs --exec`.

- Jest passed all 75 tests across the workspace page, workspace render and skills page suites. The first run exposed a timing error in the new saved-selection test. The test now flushes microtasks before asserting the router call.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` passed.
- ESLint passed on both changed files with zero errors and the existing `max-lines` warning on `analyze-workspace.page.ts`.
- Scoped `ptah_get_diagnostics` timed out after 45 seconds. Scoped `ptah_ast_analyze` parsed both final TypeScript files with zero error nodes.

## Decisions

- Clear the write alert on a settled healthy pair. The alternative was special handling for the queued refresh. Read validity already distinguishes the recovered state from the failed Setup state. Reversible.
- Consume the route intent at the start of an eligible explicit action. Waiting for the saved load would leave time for a Setup refresh to launch the deferred run. Route consumption uses the existing query merge and replacement options. Reversible.
- Bind the existing primary class locally on the native Start button. The shared directive's existing neutral look adds `btn-sm`, while the glass rules style a disabled base button with the intended muted treatment once `btn-primary` is absent. Reversible.

## Open items

Live Electron rendering was outside the assigned checks. The supplied pre-fix Electron crop was inspected and the DOM regression checks the class transition. The coordinator owns the subsequent visual review.

The lane exposed no separate skill-loading tool. The checked-in `angular-frontend-patterns` and `ui-ux-designer` skill instructions were read from their workspace files.
