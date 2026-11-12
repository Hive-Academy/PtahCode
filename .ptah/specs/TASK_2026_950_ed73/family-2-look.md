# Family 2 look: form controls

Date: 2026-11-11. Task: TASK_2026_950_ed73. Status: waiting for the user approval (step 4).
Revision 2: the user rejected the first look ("very basic"). This revision adds the floating label
field and the rich select, and reverses decision 3.

Owners in `libs/frontend/ui/src/lib/`:

- `surfaces/field.component.ts` (`ptah-field`): the one field owner. Label, control, icon slots,
  actions, helper text, error text, counter, required mark, busy rail.
- `form-controls/rich-select/` (`ptah-select`): the rich select.
- `form-controls/*.directive.ts`: `ptahInput`, `ptahTextarea`, `ptahSelect` (native), `ptahCheckbox`,
  `ptahToggle`.
- Look: `form-controls/ptah-form-controls.css`, `form-controls/ptah-field.css`,
  `form-controls/rich-select/ptah-select.css`. Tokens: `tokens/ptah-tokens.css`.

Gallery: `/ui-gallery`, section `family-form-controls` (Electron only). The look has one scope:
`.ptah-field`, `.ptah-select` and hosts with `data-ptah-control`. A raw DaisyUI control keeps the
look of today until it moves to an owner (step 5).

## Decisions for the user (epic section 10)

| # | Decision | Proposed | Visible effect |
|---|---|---|---|
| 1 | Default size of text controls | In a form: `ptah-field` size `md` (48 px), `lg` 56 px. Inline (toolbar, table): the bare directive, `sm` 32 px. | Form inputs grow from 32–48 px to 48 px and get the floating label. Toolbar inputs stay 32 px. |
| 2 | 85 custom input looks | Three tones stay: `default`, `mono`, `compact`. Compact is stacked only (no floating label). | Filter bar inputs lose `rounded-lg` and `bg-surface-0`. |
| 3 | Native `<select>` against the rich select | **Reversed.** Form selects move to `ptah-select` (rich). Inline selects stay native with `ptahSelect`. | Form selects get the floating label, groups, search, icons and descriptions. See section 6. |

## The concept: one field, one rail

The field is a glass well with a 2 px rail at the bottom edge. The rail carries the state, so the
edge of the well stays quiet:

- Focus: the box shows the focus ring only. The rail stays off (TASK_2026_969_3aab: one focus
  treatment, the user rejected ring plus rail). The label takes the accent ink.
- Error: the rail is on in the error color, also without focus. The error text replaces the hint.
- Busy: a short segment sweeps along the rail. It replaces a spinner. Under reduced motion it stops.
- Read-only: the edge is dashed, there is no rail and no hover fill.
- Disabled: the fill of base-200 and 48 % opacity.

The rich select uses the same language. The active option has an inset 2 px rail at the left edge.
The selected option has the accent ink and a check mark. The button family has the same pill
focus ring, so the two families agree.

## A. Owner checks

- [x] Owners in `libs/frontend/ui`, exported from `@ptah-extension/ui` (`src/index.ts`).
- [x] Tokens only. `design-tokens.spec.ts` checks that each rule of `ptah-field.css` and
      `ptah-select.css` is scoped to its owner, with no `!important`.
- [x] Gallery: each variant and state, in dark and light, on base-100, base-200 and base-300.
      A provider connection form. A rich select with groups, icons and search.
- [x] A11y specs: `field.component.spec.ts`, `rich-select.component.spec.ts`,
      `rich-select-list.spec.ts`, `form-controls.a11y.spec.ts`, and the gallery spec (each control
      has a name).
- [ ] Zero-pixel adoption: not in this step (step 5 starts after the approval).

## 1. Variants

| Variant | Purpose | Use | Do not use |
|---|---|---|---|
| `ptah-field` floating (default), size `md` / `lg` | A labeled form field. The label sits in the field and floats up on focus or value. | Forms, settings, dialogs, wizards | Toolbars, table cells |
| `ptah-field` `appearance="stacked"` | Label above the control | Long labels, compact tone, textareas with a long hint | — |
| `ptahInput` bare, sizes `xs` / `sm` / `md` | Inline text | Filter bars, table cells, inline edit | A form field (use `ptah-field`) |
| tone `mono` | Paths, ids, keys, cron expressions | Values that the user copies | Prose |
| tone `compact` | Dense rows | Stacked only, size `xs` / `sm` | A floating field |
| `ptahTextarea` in `ptah-field` | Many lines. `counter` shows "N / max". | Descriptions, notes, allow lists | Chat or lane composers (exception U2) |
| `ptah-select` (rich) | One choice. Groups, search, icons, descriptions, disabled options, clear. | Form selects. Search turns on by itself at 8 or more options. | Toolbar sorts with 2–4 words |
| `ptahSelect` (native) | One choice from a short fixed list, inline | Toolbar and table selects | Form fields |
| `ptahCheckbox`, `ptahToggle` | No change from revision 1 | — | — |

Field actions:

- `clearable`: a clear button. It shows only when the control has a value. It sends an `input`
  event, so `ngModel` and reactive forms see the change. Then focus goes back to the control.
- `revealable`: show and hide for a password, with `aria-pressed`.
- `counter`: the character count, with `maxlength` when it is set.
- `[ptahFieldLeading]` and `[ptahFieldTrailing]`: icon slots.
- `required`: the mark `*` (hidden from screen readers) and `aria-required`.

Rich select keyboard path: ArrowDown, ArrowUp, Enter and Space open. The arrows skip disabled
options. Home and End go to the ends. Type-ahead finds an option by its first letters. Enter
chooses. Esc closes and keeps focus on the trigger. Tab closes and does not choose. The trigger is
a `combobox` with `aria-activedescendant`, and the panel is a `listbox` with `group` parts. With
search, the search input is the combobox. The panel uses `FloatingUIService`. The component works
with `ngModel`, reactive forms (CVA) and `[(value)]`.

## 2. Tokens

New tokens in `tokens/ptah-tokens.css`, block "Field and select". Revision 1 tokens stay.

| Token | Value | Note |
|---|---|---|
| `--ptah-field-h-md` / `-lg` | 3 / 3.5 rem (48 / 56 px) | Floating field heights |
| `--ptah-field-pad-x` / `-pad-top` / `-pad-bottom` | 12 px / 20 px / 6 px | Room for the floated label |
| `--ptah-field-radius` | `--glass-radius-inner`, else 10 px | Field well. Not pill: a label needs room. |
| `--ptah-field-bg-hover` | field fill mixed 8 % with base-content | Hover fill |
| `--ptah-field-label-fg` / `-fg-active` | muted ink / primary 62 % in base-content | Active label ≥ 4.5:1 on base-100/200/300 (spec) |
| `--ptah-field-label-float-*` | 11 px, 16 px leading, 600, top 6 px | Floated label |
| `--ptah-field-rail-h` / `-rail-color` / `-rail-busy` | 2 px / primary / primary 55 % | The rail |
| `--ptah-field-busy-duration` | 1400 ms, 0.01 ms under reduced motion | Busy sweep |
| `--ptah-field-icon` / `-action-size` | 16 px / 28 px | Icon slot, action button |
| `--ptah-field-icon-fg` / `-message-fg` | muted ink | Icons, hint, counter |
| `--ptah-select-panel-bg` / `-panel-edge` | glass overlay fill / strong edge | Panel, with `--glass-blur-overlay` |
| `--ptah-select-panel-max-h` / `-panel-pad` | 18 rem / 4 px | Panel size |
| `--ptah-select-option-min-h` | 36 px | Option row |
| `--ptah-select-option-active-bg` / `-selected-fg` | primary 16 % / primary 62 % in base-content | Active and selected option |
| `--ptah-select-group-fg` | muted ink | Group header |

Motion: the label float and the rail use `--ptah-duration-*` and `--ptah-ease-*` tokens. Under
`prefers-reduced-motion` all transitions and the busy sweep stop.

## 3. White space

| Item | Value | Rule |
|---|---|---|
| Field height | 48 / 56 px floating, 32 px bare `sm` | Control dimensions |
| Inner padding | 12 px inline. 20 px top and 6 px bottom in a floating field. | `--ptah-field-pad-*` |
| Icon slot to text | 8 px | `--ptah-gap-inline` |
| Control to hint or error | 4 px | `--ptah-gap-label` |
| Field to field | 16 px | `--ptah-gap-field` |
| Option row | 36 px high, 8 px inline padding, 4 px panel padding | `--ptah-select-*` |

## 4. Visual hierarchy

| Part | Type role |
|---|---|
| Label at rest | body (14 px), muted ink |
| Floated label | 11 px, 600, accent ink on focus |
| Value | body (14 px). Mono tone: code (13 px). |
| Hint, error, counter | hint (12 px). Error uses state ink. |
| Option label / description | body / hint, muted |
| Group header | label (12 px, 600), muted, sticky |

Order of emphasis: focus ring > error rail > hover fill > rest > disabled.

## 5. Reference pages

| Page | Today | Proposed |
|---|---|---|
| Provider setup wizard | 9 raw inputs, 36 px | `ptah-field` floating `md`. The provider and model selects become `ptah-select` with icons. The key field is `revealable`. |
| Session filter bar | raw compact input and 2 selects | Bare `ptahInput` compact and native `ptahSelect` (inline, stays native) |
| Review settings drawer | 5 unsized inputs, 48 px | `ptah-field` floating `md` (same height, new label) |
| Cron scheduler tab | inputs, mono textarea, select | `ptah-field`, `ptahTextarea` mono with `counter`, `ptah-select` |
| Session organization editor | 4 selects | `ptah-select`, groups by workspace |

## 6. Census: native selects

The census found 84 native `<select>` in 40 files. The rule: a select in a form (a label, a
value that the user saves, more than about 5 options, groups, icons or descriptions) moves to
`ptah-select`. An inline select (toolbar, table cell, 2–5 short options, the value applies at
once) stays native with `ptahSelect`. Native keeps the platform picker and costs no overlay.

| Group | Files | Move to `ptah-select` | Stay native | Why |
|---|---|---|---|---|
| Provider and model pickers | `ui/native/provider-model-picker` (11), `setup-wizard/generation-model-picker`, `chat/settings/providers/decision-model-row`, `main-agent-reassign-popover`, `add-cli-instance-modal`, `cli-lane-default-cell` | All | — | Many options, groups by provider, provider icons, search |
| Settings forms | `chat/settings/ptah-ai/*` (elevenlabs, local TTS/STT, cache TTL, session budget), `pro-features/*`, `output-style-parity-section` | All | — | Labeled form fields with a saved value |
| Task and review forms | `tasks-ui/task-create-dialog`, `task-metadata-editor`, `task-relations`, `session-organization-editor`, `cron-scheduler-tab`, `harness-builder/builder-presets-section`, `mcp-directory-browser` | All | — | Labeled fields, descriptions help the choice |
| Toolbars and filters | `task-filter-bar`, `task-bulk-bar`, `session-filter-bar`, `review-findings-panel`, `review-runs-page`, `review-findings-table`, `git-ui/comparison-bar`, `file-diff-section`, `remote-session-list`, `onboarding/workspace-header`, `memory-danger-zone` | — | All | Inline, short lists, the value applies at once |
| Generic owners | `ui/native/form/json-schema-form`, `declarative-dashboard/surface-choice-input`, `provider-model-search-field` | Decide in step 5 | — | The data decides: enum size and labels come from a schema |
| Test files | `webview-e2e-harness/*` | — | Follow the page | Fixtures follow the adopted page |

The step 5 batches use this table. Each batch confirms its count with a fresh grep.

## Exceptions (keep their look)

- Chat composer textarea (`chat-input.component.ts`), decision U2. The four other composers are
  reviewed one by one in step 5.
- Canvas rail, `contenteditable` editors, CodeMirror (`git-ui/spot-editor`), terminal.
- `input type="range"` (1), card radios with `peer sr-only` (3).
- Radios (23): not in this family scope. See the open questions.

## Proposed Removals

Step 6 removes these after the adoption. Nothing is removed in this step.

- Decision 3 of revision 1 ("keep native select first"): reversed.
- The spinner in a busy field: the busy rail replaces it.
- `extracted/setup-field` (`select[ptahSetupField]`, `SETUP_FIELD_LOOK`): replaced by `ptah-select`.
- `surfaces/field-control.directive.ts` (`ptahFieldControl`): replaced by `ptahInput`,
  `ptahTextarea` and `ptah-select` inside `ptah-field`.
- `ptah-native-autocomplete` as a select replacement: `ptah-select` with search covers it.
- Raw recipes outside `libs/frontend/ui`: `input input-bordered*`, `select select-bordered*`,
  `textarea textarea-bordered*`, `checkbox checkbox-*`, `toggle toggle-*`.
- Global rules in `styles.css` that only serve raw controls (`.input, .textarea` min-height,
  `.toggle-sm`), and the glass form rules once no raw control remains.
- Local focus constants on controls and the Settings ring rule for raw choices.
- Ratchet: add the class roots `input`, `select`, `textarea`, `checkbox`, `toggle` to
  `tools/ui-class-audit` in step 5 and seed the baseline.

## D. Review

- [x] Contrast: `design-tokens.spec.ts` checks the muted ink and the active label ≥ 4.5:1 and the
      rail ≥ 3:1 on base-100/200/300, in `ptah-glass` and `ptah-glass-light`.
- [x] Spacing: each value is a token.
- [x] One design language: the field, the rich select and the button family share the focus
      ring, the radius family and the glass fills.
- [ ] Independent reviewer lane: see the pull request.

## C. Screenshots

The coordinator runs the Electron dev app from this worktree. Open `/ui-gallery`, section
"Form controls family", in `ptah-glass` and `ptah-glass-light`.

| Image | Theme | File | SHA-256 |
|---|---|---|---|
| Gallery section | dark / light | open | open |
| Rich select open, with search | dark / light | open | open |
| Provider form | dark / light | open | open |

## Open questions

1. **Radios.** Recommendation: add `ptahRadio` with the checkbox look in step 5.
2. **Multi-select.** `ptah-select` chooses one value. Recommendation: add multiple values only
   when a consumer needs them.
3. **Async options.** Recommendation: add a `loading` state to `ptah-select` in the first batch
   that loads options from the host.

## Approval record

Answer: open. Date: open. Approved changes: open.
