# Review: owner fixes in libs/frontend/ui (a11y + Angular)

Verdict: acceptable to merge. No blocker. Two medium and three low findings.

## What is correct
- field.component.ts `syncDescription`: reads the live `aria-describedby`, removes the field id,
  re-adds it only when hint/error exists. Consumer ids are kept. Write is guarded by an
  equality check, so the MutationObserver does not loop on its own writes.
- `observeDescription`: one observer per control, re-created if the control changes,
  disconnected through `DestroyRef`. Observer callbacks touch only the DOM (no signals),
  so zoneless and OnPush are safe. A short window on first render (effect runs before the
  consumer binding writes) is fixed by the observer in a microtask. No AT impact.
- Removing `originalDescription` from the ref, base, directive and rich-select is consistent.
  Rich-select never set a description on its trigger, so no behavior is lost. The field
  writes to the trigger (`element`), and the observer watches the same element.
- toggle.directive.ts: removing `role="switch"` while indeterminate is right. `switch`
  does not support `aria-checked="mixed"`, so the native checkbox role reports "mixed".
  The host `[indeterminate]` property binding is needed because a directive input with the
  same name shadows the DOM property. `booleanAttribute` supports the bare attribute.
- capability-toggle.component.ts:211,356: passes `indeterminate()` and also resets
  `input.indeterminate` after a native click. This is required (see M1).

## Findings

### M1 (medium) toggle.directive.ts:16-17 - state drifts after a native click
A native click clears `input.indeterminate`, but the input signal stays `true`. Angular does
not rewrite an unchanged host binding. Result: role stays removed and the property stays
false until the signal changes. Only capability-toggle compensates (manual reset in
`onChange`). Fix: document in the directive JSDoc that the consumer must keep the input in
sync (or reset the property on `change`). Optional: add a `(change)` host listener that
re-writes `el.indeterminate = this.indeterminate()` for controlled usage.

### M2 (medium) field.component.ts:108-117 - unrelated template change alters label text
The `labelTpl` was reformatted. The old template had no whitespace between `{{ label() }}`
and the required marker. The new one adds text whitespace/newlines inside `<label>`. This
can change `label.textContent` (trailing space) and break exact-text queries or accessible
name trimming in consumers. The svg path reflow (lines 66-82) is only formatting churn.
Fix: revert the formatting of the template (keep the diff to the logic only).

### L1 (low) field.component.ts:~157-170 - observer stays on an old control
If `control()` becomes undefined, `wire()` returns early. The observer stays on the old
element until the field is destroyed, and the field id stays in the old element.
Fix: disconnect and set `observed = null` when there is no control.

### L2 (low) field.component.ts:149 - MutationObserver availability
`new MutationObserver` is not guarded. This is fine for Electron and jsdom, but add
`typeof MutationObserver !== 'undefined'` if the lib is ever rendered on the server.

### L3 (low) CRLF warnings on 4 files
Git warns that CRLF becomes LF in rich-select, text-control.base, field-control-ref and
field-control.directive. Normalize line endings so the diff stays minimal.

## Do the specs prove the behavior?
- field-bound-description.spec.ts: yes for the end state. It checks first render, a changed
  binding, error replacing hint (same id), and removal of the field id. It waits with
  `setTimeout`, which flushes the observer microtask, so it truly exercises the observer.
  Gaps: no check that a static consumer id and a bound id both survive (the older
  field.component.spec covers static); no rich-select case; no disconnect-on-destroy check.
  Add one case with `bound` set to `null` while a hint exists (expect only the field id).
- form-controls.a11y.spec.ts `ptahToggle indeterminate`: proves role removal/restoration and
  the native property in both directions. Gap: no test of the native-click drift (M1) and no
  test for the capability-toggle consumer (`indeterminate` host + reset in `onChange`).
