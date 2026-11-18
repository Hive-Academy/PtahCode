# TASK_2026_2265_519f — Shared ptah-select listbox popup and true floating labels

Child G of design system epic TASK_2026_1177_9109.

## Defects (user)

- Inputs do not use the shared input with a true floating label.
- Dropdowns show the native menu.

## Decisions

- `ptah-field.css`: a real `placeholder` no longer floats the label. The placeholder is
  transparent at rest and shows on focus. A native select whose chosen option has the value
  `''` is empty: without focus the label rests and the option text is hidden.
- `ptah-select` already opens a token listbox placed by Floating UI with full keyboard support.
  Added: `labelledBy` input (compact variant for setting rows and table cells), a trigger title
  for long values, wrap of long option text in the menu, a panel maximum width inside the
  viewport, the placeholder on focus in a floating field, and a table control-cell rule.
- `select[ptahSelect]` stays (legacy, native menu). Docs name `ptah-select` the documented
  control. No call site migration: the public API did not change. Child D (Providers) and
  child E (other Settings pages) migrate their call sites.
- No Settings page uses a floating `ptah-field` text input or `ptah-select` today (all use
  `appearance="stacked"` or the native select). The gate shots use the UI gallery page of the
  Electron dev instance, which shows the shared controls in every state.
