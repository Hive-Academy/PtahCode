# Fix tests report — CDK overlay consumers

## Scope

Fixed the reported field, decision-endpoint, and Canvas rail Jest failures. The field and decision-endpoint fixes are spec-only. The Canvas fix also corrects the consumer's portaled menu query and rename-panel class. No tests were deleted or skipped, and no assertions were weakened.

## Root causes and fixes

### `libs/frontend/ui/src/lib/surfaces/field.component.spec.ts`

**Root cause:** The info popover content now renders in the CDK overlay container. The test still queried `fixture.nativeElement`, so `.ptah-field__info-panel` was `null` after the popover opened. The outside-dismissal step also used the removed `[role="presentation"]` backdrop contract instead of the CDK backdrop.

**Fix:** Injected `OverlayContainer` and moved the open-panel, closed-panel, and backdrop queries to its container element. Used `.cdk-overlay-backdrop` for the backdrop click. Kept the trigger and focus assertions on the host and preserved the Escape, focus restoration, ARIA, and outside-dismissal assertions.

### `libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts`

**Root cause:** The decision editor now renders in the native popover's CDK portal. The spec's `byTestId` and `suggestionIds` helpers searched only the component host. Consequently, editor text queries returned empty strings, model suggestion queries returned empty arrays, and editor inputs and buttons could not be found. Several direct label and info-popover queries had the same stale host root.

**Fix:** Added an `OverlayContainer` query root. `byTestId` now checks the host first and the overlay second, which preserves row-level queries and finds portaled editor controls. Moved suggestion, label, and info-popover queries to the overlay. Extended the secret-text assertion to cover both the host and overlay. No expected values or behavioral assertions were relaxed.

### `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.spec.ts` and `canvas-rail-card.component.ts`

**Root cause:** The session action menu and Rename dialog now render in CDK portals. The spec searched only the fixture host for menu items, dialogs, buttons, and the old backdrop. Production `menuItems()` also searched the host-side actions cell, so keyboard navigation received an empty item list. The Rename popover's `[&>.popover-panel]:p-0` selector could no longer reach its portaled panel.

**Fix:** Added spec helpers that query the host and `OverlayContainer`, and changed the backdrop query to `.cdk-overlay-backdrop`. Added a `#menu` reference and made production keyboard navigation query that menu element. Removed the stale direct-child padding selector. `onRenameOpened()` now applies `p-0` directly through the existing `NativePopoverComponent.panel()` API. No shared popover change was needed. The geometry test now asserts the class on the actual attached panel. All action, focus, Escape, Tab, nested-picker, and keyboard assertions remain active.

## Files changed

- `libs/frontend/ui/src/lib/surfaces/field.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts`
- `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.spec.ts`
- `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts`
- `.ptah/specs/TASK_2026_2329_dd39/fix-tests-report.md`

The only production change is in `canvas-rail-card.component.ts`.

## Check results

| Check | Result |
| --- | --- |
| `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/surfaces/field.component.spec.ts` | Passed: 1 suite, 15 tests. |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts` | Passed: 1 suite, 33 tests. |
| `npx eslint libs/frontend/ui/src/lib/surfaces/field.component.spec.ts libs/frontend/chat/src/lib/settings/providers/decision-model-row.endpoint.spec.ts` | Passed with no output. |
| `npx tsc --noEmit --project libs/frontend/ui/tsconfig.spec.json` | Failed on existing errors in unrelated files, including `badge.a11y.spec.ts`, `icon-button.directive.spec.ts`, `list-detail.component.spec.ts`, `aurora-effect.component.spec.ts`, `surface-tile.component.spec.ts`, and shared BigInt targets. The changed field spec had no reported diagnostic. |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` | Failed on existing project-wide errors in unrelated specs, including `resize-handle.component.spec.ts`, `agent-card-truncation.spec.ts`, `chat-input.component.spec.ts`, and `chat-view.component.spec.ts`. |
| `npx jest --config libs/frontend/canvas/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.spec.ts` | Passed: 1 suite, 56 tests. |
| `npx tsc --noEmit --project libs/frontend/canvas/tsconfig.lib.json` | Passed with no output. |
| `npx tsc --noEmit --project libs/frontend/canvas/tsconfig.spec.json` | Failed on existing errors in unrelated files: `canvas-rail-board.component.spec.ts`, `mock-rpc-service.ts`, and shared BigInt targets. The changed Canvas files had no reported diagnostics. |
| `npx eslint libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.spec.ts` | Exited 0: 0 errors and 19 warnings for non-null assertions and the existing `max-lines` warning. |

No `npm run verify`, Nx, build, serve, dev, end-to-end, commit, or push command was run.
