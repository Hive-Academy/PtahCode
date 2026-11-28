# Fix focus trap report — TASK_2026_2329_dd39

## Root cause

The migration to the Angular CDK dialog (`Dialog.open` portal) removed the old
`<dialog>`-based Tab wrap. The old implementation had a `keydown` handler that
called `preventDefault()` at the panel boundaries and moved focus from the last
control to the first (and back with Shift+Tab). CDK 22 `FocusTrap` is
anchor-based only. It has no `keydown` listener, so a dispatched Tab keydown on
the last control was not consumed and focus did not wrap.

## Changed files

- `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts`
  - Attach a `ConfigurableFocusTrap` (from `ConfigurableFocusTrapFactory`,
    `@angular/cdk/a11y`) to the portaled panel element in an
    `afterRenderEffect` keyed on the `panel()` view child.
  - Register a `keydown` listener on the panel in the same effect. On Tab it
    consumes the event at the boundaries and wraps focus with
    `focusFirstTabbableElement()` / `focusLastTabbableElement()`, with the
    previous direct-focus move as fallback.
  - Release the trap and the listener in the effect cleanup, which runs on
    close (view destroyed) and on `ngOnDestroy`.
- `libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts`
  - New case "consumes Tab at the panel boundaries and wraps focus itself":
    asserts `defaultPrevented` and the wrap in both directions. The existing
    wrap test simulates the browser focus move, so it did not pin the restored
    key handling.

## Notes

- The CDK dialog container still provides its own focus trap and focus
  restore. Escape handling stays in `openPtahDialog` through
  `ref.keydownEvents`, which the CDK keyboard dispatcher delivers only to the
  top overlay, so a nested Escape still closes only the top modal.
- The `(keydown)` template binding was avoided: the Angular ESLint rule
  `template/interactive-supports-focus` rejects interaction handlers on a
  non-focusable `div`. The listener is attached imperatively instead.

## Check results

- `npx jest --config libs/frontend/tasks-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/tasks-ui/src/lib/components/task-create-dialog.component.spec.ts`
  - 1 suite passed. 10 passed, 0 failed, 10 total. (Before the fix: 1 failed,
    9 passed — "wraps Tab from the last control back to the first".)
- `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts`
  - 1 suite passed. 18 passed, 0 failed, 18 total.
- `npx eslint libs/frontend/ui/src/lib/native/modal/native-modal.component.ts libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts`
  - 0 errors, 0 warnings.
- `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`
  - Clean.
