# Review findings

- **P2 — Stale control observer** — `libs/frontend/ui/src/lib/surfaces/field.component.ts:173-176,211-221`: when the projected control becomes absent, `wire()` returns without disconnecting the observer or clearing `observed`. The old element keeps receiving field description updates until the field itself is destroyed; if the same element is projected back, `observed === control` also prevents reattachment if cleanup is later added only at removal. Disconnect and clear the observed element when `contentChild` becomes empty; remove the field-owned ID from the old control on replacement/removal. Add a spec that removes and replaces the projected control.
- **P2 — Server rendering can throw** — `libs/frontend/ui/src/lib/surfaces/field.component.ts:215`: `new MutationObserver` is unconditional in a shared Angular UI component. A server DOM without that global throws when a field with a control renders. Guard observer creation with platform/browser availability, keeping the initial description sync for SSR. Add a server-safe construction test or equivalent targeted coverage.

## Checks

- `syncDescription` reads the live attribute, removes only this field's ID, then appends it once when hint/error exists. Its equality check prevents a MutationObserver write loop. The observer filters only `aria-describedby` and disconnects on field destruction. `contentChild` selects one control; multiple simultaneous controls remain outside the component's one-control contract.
- `rg -n originalDescription libs apps` returned no matches.
- `PtahToggleDirective` writes the native `indeterminate` property and removes/restores `role=switch` according to the input. The marketplace consumer already binds `[indeterminate]="indeterminate()"` and restores the DOM property in its change handler; no consumer regression found by static review.
- The new bound-description spec covers initial binding, rebinding, error replacement, and removal of field text. The toggle spec covers true-to-false property and role changes. Neither covers projected-control removal/replacement or server rendering. No build, tests, e2e, or verify commands were run, as requested.
