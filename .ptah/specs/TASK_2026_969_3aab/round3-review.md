CHANGES

- **major** — `libs/frontend/ui/src/lib/form-controls/ptah-field.css:130-132`: An open `ptah-select` gives the label the focus color even when focus has left the field. The requirement gives focus color only on focus. Remove the `.ptah-field:has(.ptah-select[data-open]) .ptah-field__label` branch. Keep `.ptah-field__box:focus-within .ptah-field__label`; the float state at lines 113-127 already covers open selects.
- **minor** — `libs/frontend/ui/src/lib/form-controls/field-notch-label.spec.ts:81-86`: The color test accepts the open-select branch and does not pin the focus-only rule. After the CSS fix, assert that the active-color selector contains `:focus-within` and has no `[data-open]` branch. Add a state test for an open select after focus leaves.

The field body is positioned, and the label has an inline start, padding, ellipsis, and an opaque float fill. The field reset has greater specificity than the new glass trigger focus rule. The glass rules exclude family text controls, keep border width fixed, and leave non-glass selectors unchanged. The new CSS-text regexes match the reviewed declarations; they do not prove rendered geometry or paint.

**Unconfirmed visual check:** The notch fill and unclipped rail need a render check at rounded corners, with long labels, leading slots, textarea, and both glass themes. No browser or Electron ran under this review's limits.

Verification: `git diff --check` passed. No tests ran. CLI skill discovery was unavailable; I used the available Ptah workspace analysis tool and read the diff and source files.
