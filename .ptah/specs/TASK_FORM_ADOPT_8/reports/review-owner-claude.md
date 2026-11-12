# Review: TASK_FORM_ADOPT_8 (static review, no tests run)

Verdict: no blocking defects. Four low or informational findings.

## F1 (low) field.component.ts:189-195 - effect now tracks `labelFor`
`syncId` reads `this.labelFor()` inside the `wire()` effect, so the effect depends on the
signal that it writes. The guard `!== id` stops a loop. But each observer-driven change of
`labelFor` re-runs `wire()`, and `wire()` calls `observeDescription`, which disconnects and
re-creates the MutationObserver (pending records are dropped). No infinite loop: the second run
finds equal values. Fix (optional): read with `untracked(() => this.labelFor())`.

## F2 (low) field.component.ts:191-194 - bound id cleared to empty
If a consumer bound `[id]` becomes `''`/null, the observer writes the generated id into the DOM
(`control.id = id`). Angular does not re-write an unchanged binding value, so the generated id
stays. The label follows it, so `for` is not stale. Correct, but no spec covers it. Add a
case: `boundId.set('')` -> input.id and label.htmlFor equal the `ptah-field-control-*` id.

## F3 (info) rich-select.component.ts:105 - `controlId` getter and effect tracking
The getter reads `triggerId()`, and `wire()` reads `marked.controlId`, so the field effect
tracks `triggerId` and `label[for]` follows a change. This is correct. The trigger has
`[id]="controlId"`, so `control.id` is never empty and the generated-id write is skipped.
`listboxId` and option ids use `generatedId` (stable). `aria-controls` still matches the
listbox. No defect. Spec gap: the spec does not change `triggerId` after first render.

## F4 (low) mcp-directory-browser.component.ts - changes beyond the stated block
- The search input (`ptahInput size="sm"`) and the target checkbox (`ptahCheckbox size="xs"`)
  also changed, outside the "required-inputs block" scope. Confirm this is intended.
- The `secret` badge became text `name (secret)` in the label. This is a visible change
  (badge to plain text); the badge styling is lost.
- The description moved to `ptah-field [hint]`. A11y gain: `aria-describedby` now links it.
  Behavior: the hint shows only when set (`hint() || error()`), same as before.
- The select now uses `ptah-select` with `triggerId`; label `for` reaches the combobox trigger
  (`aria-labelledby` set by `setFieldLabel`). No regression found. The panel opens in an
  overlay: check it is not clipped by the storefront panel overflow (not verified visually).
- Spec: the extra `setTimeout` + `settle` before asserting `label[for]` shows the label link
  is now set asynchronously (effect/observer). Acceptable, but the first render has a short
  window where `for` is the generated id, not the bound one.

## Not found
No effect/observer loop, no stale `label for` in the tested cases, no regression of
`aria-describedby` handling (`syncDescription` unchanged and still called by the observer).
