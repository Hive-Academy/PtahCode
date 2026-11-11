# Context

Epic: `.ptah/specs/TASK_2026_924_8ac1/design-system-epic.md`, level 1, family 2 (form controls),
steps 2 and 3, step 4 preparation. Research: `.ptah/specs/TASK_2026_940_eef5/form-controls-research.md`.

## Owner API (step 2)

Folder `libs/frontend/ui/src/lib/form-controls/`, exported from `@ptah-extension/ui`. Look file
`ptah-form-controls.css` (imported in `apps/ptah-extension-webview/src/styles.css` after the
button look). Each host has `data-ptah-control="<kind>"`.

| Directive | Selector | Inputs | Host classes | Role |
|---|---|---|---|---|
| `PtahInputDirective` | `input[ptahInput]` | `size` xs/sm/md (sm), `tone` default/mono/compact, `invalid`, `label` | `input input-bordered input-<size>` | textbox (native) |
| `PtahTextareaDirective` | `textarea[ptahTextarea]` | same | `textarea textarea-bordered textarea-<size>` | textbox |
| `PtahSelectDirective` | `select[ptahSelect]` | same | `select select-bordered select-<size>` | combobox (native) |
| `PtahCheckboxDirective` | `input[type=checkbox][ptahCheckbox]` | `size` xs/sm (sm), `label` | `checkbox checkbox-primary checkbox-<size>` | checkbox |
| `PtahToggleDirective` | `input[type=checkbox][ptahToggle]` | `size` xs/sm (sm), `label` | `toggle toggle-primary toggle-<size>`, `role="switch"` | switch |

- `data-ptah-tone` is absent for `default`, else `mono` or `compact`.
- `aria-invalid="true"` while `invalid` is set or the wrapping `ptah-field` has an error. Absent when valid (never `"false"`).
- `label` writes `aria-label` only while it has a value. A static `aria-label` stays.
- `ptah-field` finds the control through `PtahFieldControlRef` (`surfaces/field-control-ref.ts`). It projects `ptahFieldControl`, `ptahInput`, `ptahTextarea` and `ptahSelect`.
- No rule sets `position`, width, margin or `padding-inline`. Consumers keep layout classes.
- Decision 3: native `<select>` stays. No combobox.
