# Settings design target

This folder is the tracked design target for the Settings pages of the Electron app. Each
settings pull request compares its Electron screenshots with the screens in this folder. The
rules are in [visual-gate.md](visual-gate.md).

**Agreed revision: rev 2 ("Flight deck", review A3, Direction B).** Rev 1 is superseded for
Providers and Context. Rev 1 is still the target for Advanced and Search & Voice, because
rev 2 has no screen for these pages.

## User decisions after rev 2

These rules come from a user decision of 2026-11-17. They take priority over the design spec,
the apply plan and the screens.

- Every Settings dropdown uses the shared `ptah-select` (designed menu). The native
  `select[ptahSelect]` menu is not permitted in Settings. This rule replaces the "Pick one of
  many" row of `settings-design-spec.md`, which permits `select[ptahSelect]` for short static
  lists.
- Every text field uses `ptah-field` with a true floating label. The label rests in the field
  when the field is empty and has no focus. The label goes up only on focus or when the field
  has a value. A real placeholder must not hold the label up. Put help text in the hint line.
- Exception that stays: in a `ptah-setting-row` and in a compact table cell, the control shows
  no floating label, because the row title or the column header is the label. The dropdown of
  that control still uses the designed menu.
- Decision model and lane routing settings (Routing suggestions, Rotate close executors) live on
  the Decision matrix page, not on Context Management (user decision of 2026-11-18). Context
  Management keeps only context topics. The "See decision matrix" link is removed.
- The "Field appearance (F3)" rule of `settings-apply-plan.md` (`appearance="stacked"` for
  fields that always have a value) is replaced by the floating label rule above.

### How the shared controls implement these rules

- `ptah-select` (`@ptah-extension/ui`) is the documented dropdown. Its menu is a token
  listbox placed by Floating UI, never the operating system menu.
- With a floating label: put `ptah-select` in `ptah-field label="..."`.
- Compact, without a floating label (a `ptah-setting-row` or a table cell): use
  `ptah-select` without `ptah-field`, with `size="xs"` or `size="sm"`, and
  `labelledBy="<id of the row title or column header>"` or `label="..."`.
- Text fields: `ptah-field` floats the label only on focus or with a value. A `placeholder`
  is transparent at rest and shows on focus.
- `select[ptahSelect]` still compiles, but it opens the native menu. Do not use it in new
  Settings code.

## Source

The files were copied from the design task `TASK_2026_2196_0f09` (branch
`feat/settings-redesign`, folder `.ptah/specs/TASK_2026_2196_0f09/`). That folder is not
tracked in git. Each copy was compared byte by byte with its source. These changes were made
after the copy:

- In `settings-apply-plan.md` a local absolute path was replaced with
  `<main-checkout>\node_modules`.
- Prettier padded the table columns of the two Markdown files. The text did not change.
- In `settings-design-spec.md` the `States` row of the data table spec was joined to the
  `Responsive` row (a missing line break in the source). It is now a separate row.
- In `settings-apply-plan.md` the screen pattern `prototype/screens/<tab>-*.jpg` matched no
  rev 2 file. The plan now refers to the screen index below.
- In `settings-apply-plan.md` the visual gate item now refers to `visual-gate.md`, which adds
  the 1920 and 2560 px dark screenshots.
- In `settings-design-spec.md` a note after the "when to use" table points to the user
  decisions above. The rows of the table did not change.

The HTML prototype and the screens are unchanged copies.

The design spec and the apply plan refer to files that are not in this folder (`status.md`,
`component-catalog.md`, `settings-inventory.md`, `responsive-review/`, `stitch/`, earlier lane
screens). These files stay in the design task only. `prototype/rev-2.html` in the spec is
identical to `prototype/settings-prototype.html` here.

The spec and the apply plan require each pull request to keep every `id`, `data-testid` and
`aria-label` of `settings-inventory.md` section 6. That inventory is not tracked. Until it is,
take the full hook set from the current settings source in `libs/frontend/chat/src/lib/settings/`
and its specs. The apply plan lists the hooks at risk for each pull request.

## Files

| File                                | Size (bytes) | Content                                                                         |
| ----------------------------------- | -----------: | ------------------------------------------------------------------------------- |
| `prototype/settings-prototype.html` |      159,681 | Prototype, rev 2. Open it in a browser. Width options 1168, 784, 390 and Fluid. |
| `settings-design-spec.md`           |       45,071 | Design spec (Phase A3, rev 2)                                                   |
| `settings-apply-plan.md`            |       19,122 | Apply plan for the Phase B pull requests                                        |
| `visual-gate.md`                    |            — | Screenshot gate for every settings pull request                                 |

## Screen index

All screens are in `prototype/screens/`. "Rev" is the prototype revision of the screen.

| Screen                                        | Page                         | Theme | Width | Rev |
| --------------------------------------------- | ---------------------------- | ----- | ----: | --- |
| `rev2b-providers-lanes-dark-1168.jpg`         | Providers, lanes             | dark  |  1168 | 2   |
| `rev2b-providers-lanes-light-1168.jpg`        | Providers, lanes             | light |  1168 | 2   |
| `rev2b-providers-lanes-dark-784-expanded.jpg` | Providers, expanded lane row | dark  |   784 | 2   |
| `rev2b-providers-lanes-light-784.jpg`         | Providers, lanes             | light |   784 | 2   |
| `review-a3-providers-lanes-dark-1440.jpg`     | Providers, lanes             | dark  |  1440 | 2   |
| `review-a3-providers-lanes-light-784.jpg`     | Providers, lanes             | light |   784 | 2   |
| `review-a3-matrix-dark-1440.jpg`              | Decision matrix              | dark  |  1440 | 2   |
| `lane2b-providers-dark-1168.jpg`              | Providers                    | dark  |  1168 | 2   |
| `lane2b-providers-light-784.jpg`              | Providers                    | light |   784 | 2   |
| `lane2b-connections-dark-784.jpg`             | Providers, Connections       | dark  |   784 | 2   |
| `lane2b-detail-light-784.jpg`                 | Providers, lane detail       | light |   784 | 2   |
| `rev2-context-dark-784.jpg`                   | Context                      | dark  |   784 | 2   |
| `rev2-matrix-light-1168.jpg`                  | Decision matrix              | light |  1168 | 2   |
| `advanced-dark-1168.jpg`                      | Advanced                     | dark  |  1168 | 1   |
| `advanced-light-1168.jpg`                     | Advanced                     | light |  1168 | 1   |
| `advanced-dark-784.jpg`                       | Advanced                     | dark  |   784 | 1   |
| `advanced-light-784.jpg`                      | Advanced                     | light |   784 | 1   |
| `search-dark-1168.jpg`                        | Search & Voice               | dark  |  1168 | 1   |
| `search-light-1168.jpg`                       | Search & Voice               | light |  1168 | 1   |
| `search-dark-784.jpg`                         | Search & Voice               | dark  |   784 | 1   |
| `search-light-784.jpg`                        | Search & Voice               | light |   784 | 1   |

Notes:

- `lane2b-*` screens are rev 2 captures of the same lane work as `rev2b-*`. The gap analysis
  of `TASK_2026_2255_53ce` uses them as reference screens. `lane2b-connections-dark-784.jpg`
  is the only Connections screen.
- `rev2-context-*` and `rev2-matrix-*` are the only rev 2 screens of Context and the decision
  matrix. The rev 1 Context screens are superseded and are not in this folder.
- The design spec names `screens/matrix-*.jpg` for the decision matrix. No such file exists.
  Use `review-a3-matrix-dark-1440.jpg` and `rev2-matrix-light-1168.jpg`.
- Superseded screens (`rev2-providers-lanes-*`, `lane2-*`, `lane-*`, rev 1 `providers-*` and
  `context-*`) are not in this folder.
- For a page or a width with no screen, open `prototype/settings-prototype.html` with the Fluid
  width option and capture it at the gate width.
