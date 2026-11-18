Verdict: changes requested. Two major layout defects remain, plus a consumer regression and accessibility/test gaps. No blocker found.

Evidence below refers to committed files at `879a6240c`, reviewed against `867a8a3e8`; existing uncommitted source edits were excluded and left untouched. Paths are repository-relative.

1. **Major — the viewport maximum loses to the panel's inline minimum.**
   Evidence: `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css:281` sets `max-width: min(32rem, calc(100vw - ...))`, but `rich-select.component.ts:295` still sets `minWidth` to the entire anchor width.
   When the anchor exceeds the cap, CSS minimum sizing wins over maximum sizing. A wide field therefore still creates a panel wider than the intended cap; an anchor wider than the available viewport can still overflow. Floating UI shifts/flips it but does not resize it (`libs/frontend/ui/src/lib/native/shared/floating-ui.service.ts:163`).
   Fix: clamp the panel minimum to the available viewport width, preferably using Floating UI size middleware; keep the maximum and minimum consistent when resizing.

2. **Major — options still cannot wrap in the targeted table cells.**
   Evidence: `libs/frontend/ui/src/lib/patterns/table/table.component.ts:122` sets `white-space: nowrap` on `.ptah-table-control-cell`. The popup stays beneath that cell in the DOM (`libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.template.ts:51`). The new label/description rules at `rich-select/ptah-select.css:398` and `:402` add `overflow-wrap: anywhere` but do not reset inherited `white-space`.
   Consequently long options stay on one line in this compact variant, potentially producing horizontal scrolling/clipping despite the width cap.
   Fix: explicitly set `white-space: normal` on popup option text or the panel; retain nowrap only on the trigger value. Verify inside an actual `.ptah-table-control-cell`.

3. **Minor — the setting-row width reaches fields inside unrelated popovers.**
   Evidence: `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css:28` matches every descendant `ptah-field`, not just the row's control. Existing consumer `libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts:103` contains the Membership row, a `w-80` key-entry dialog at `:164`, and an unqualified Membership key field at `:194`.
   On a row container at least 640px wide, that dialog field changes from filling its content area to 13rem. The popover remains a DOM descendant even in the top layer (`libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:10`). This is a concrete existing-consumer layout regression caused by the broad selector.
   Fix: scope the fixed width to controls directly projected into the setting-row control slot, or opt compact controls in explicitly; nested dialog fields should keep the 100% default.

4. **Minor — the new setting-row examples leave their listboxes unnamed.**
   Evidence: `apps/ptah-extension-webview/src/app/ui-gallery/gallery-settings-controls.component.ts:59` and `:62` supply only `triggerId`, with no `label` or `labelledBy`. The row's native label can name the button via `for`, but does not name its separate listbox. `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.component.ts:152` and `:155` therefore resolve both listbox naming attributes to null outside a field; the bindings are at `rich-select.template.ts:80`.
   Fix: provide `label` on these examples, or expose an id for the row title and pass it through `labelledBy`. Assert the popup's accessible name when opened from a real setting row.

5. **Minor — the new table typography rule cannot override the xs rule.**
   Evidence: `libs/frontend/ui/src/lib/patterns/table/table.component.ts:138` uses `.ptah-table-control-cell .ptah-select__trigger` (specificity 0,2,0), while `libs/frontend/ui/src/lib/form-controls/rich-select/ptah-select.css:80` uses `.ptah-select[data-size='xs'] .ptah-select__trigger` (0,3,0).
   Thus the documented xs compact variant keeps `--ptah-text-label-size`, rather than the table's `--ptah-text-hint-size`. The defaults currently coincide, masking the failure when themes customize these tokens independently.
   Fix: include the select host and size attribute in the table selector, or supply a table typography token consumed by the size rule.

6. **Minor — the added specs do not exercise the layout failures they claim to guard.**
   Evidence: `libs/frontend/ui/src/lib/form-controls/form-controls-layout.spec.ts:17` through `:42` checks CSS source strings only. `rich-select/rich-select-compact.spec.ts:15` uses three options outside both setting-row and table contexts; its keyboard case at `:77` never enters searchable mode. `apps/ptah-electron-e2e/src/design-preview/form-controls.shot.ts:135` through `:149` captures images without layout assertions.
   These tests can pass with findings 1–5 present. They also do not establish that a long error/hint preserves field-grid alignment, or that the searchable compact variant preserves keyboard behavior and meaningful naming.
   Fix: add browser assertions for computed widths/heights, wrapped option geometry in table cells, field-grid empty/error states at narrow widths, and setting-row popup names; cover searchable keyboard navigation with at least eight options. Keep source-string tests only as supplemental checks.

Review coverage: searched `<ptah-select` and `<ptah-field` consumers throughout `libs/frontend`. The existing rich selects in `session-organization-editor.component.ts:155/:165` and `mcp-directory-browser.component.ts:346` are field-contained; no definite regression from the 100% default was identified there. Explicit width utilities such as `provider-consumer-assignments.component.ts:429` have greater specificity than the new zero-specificity default. Finding 3 covers the confirmed 13rem regression.

No introduced selector with nested `:has()` was found; the changed selectors appear syntactically valid. For valid nonempty ids, the new trigger/listbox `labelledBy` bindings correctly suppress `aria-label`, preserving naming precedence. Keyboard handlers and ControlValueAccessor methods are unchanged; no direct keyboard/API regression was identified by inspection. No added `as any`, `as unknown as`, `@ts-ignore`, `console.`, or `[innerHTML]` occurrence was found in the reviewed diff.

Validation: read-only inspection only; no tests, type checks, lint, builds, or browser rendering were run. Angular frontend skill read from the workspace; CLI skill discovery was unavailable. Ptah workspace analysis/source structure tools were used, with native git/rg for committed contents and text searches. Only this review file was written.
