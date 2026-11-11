# Family 2 look: form controls

Date: 2026-11-11. Task: TASK_2026_950_ed73. Status: waiting for the user approval (step 4).
Owner: `libs/frontend/ui/src/lib/form-controls/` (directives) and `ptah-form-controls.css`
(look). API: `context.md` in this folder. Research: `TASK_2026_940_eef5/form-controls-research.md`.
Gallery: `/ui-gallery`, section `family-form-controls` (Electron only).

The look has one scope: hosts with `data-ptah-control`. A raw DaisyUI control keeps the look of
today until it moves to a directive (step 5). There is no `[data-ptah-look='next']` scope.

## Decisions for the user (epic section 10)

The coordinator took the recommendations. Confirm or change each one at the approval.

| # | Decision | Proposed | Visible effect |
|---|---|---|---|
| 1 | Default size of text controls | `sm` = `--ptah-control-h-sm` (32 px) for input, select; textarea minimum 52 px | The 13 unsized inputs go from 48 px to 32 px high (review settings drawer). The 9 wizard inputs go from 36 px (`min-h-9`) to 32 px. |
| 2 | 85 custom input looks | Fold into three tones: `default`, `mono`, `compact`. Own height, fill, border, radius, focus and font-size classes stop to have an effect on a directive host. Layout classes stay. | Filter bar inputs lose `rounded-lg` (pill radius of the theme) and `bg-surface-0` (field fill). Wizard inputs lose `bg-base-100` and the muted border (token edge). |
| 3 | Native `<select>` against combobox | Keep native `<select>` with `ptahSelect` | The chevron shows again in glass themes (the glass `background` shorthand removes it today). No behavior change. |

## A. Owner checks

- [x] Owner in `libs/frontend/ui`, exported from `@ptah-extension/ui` (`src/index.ts`).
- [x] Tokens only. `form-controls` is in `TOKEN_ONLY_DIRS` (`tokens/ptah-tokens.spec.ts`).
- [x] Gallery section with each size, tone and state: default, hover, focus-visible, disabled,
      error, placeholder, long text, icon slot (`pl-8`), tinted panels. Busy and active do not
      apply to a text field. Icon only does not apply.
- [x] Behavior is native (`<input>`, `<textarea>`, `<select>`, checkbox). The toggle is a native
      checkbox with `role="switch"`. The accessibility spec is
      `form-controls/form-controls.a11y.spec.ts` (name, role, keyboard path, state, focus ring).
- [ ] Zero-pixel adoption: not in this step (step 5 starts after the approval).
- [x] Scoped checks: see the pull request test plan.

## 1. Variants

| Variant | Purpose | Use | Do not use |
|---|---|---|---|
| `ptahInput`, tone `default` | One line of text, number, search, URL, password | Forms, settings, dialogs | Chat composer (exception U2) |
| tone `mono` | Paths, ids, keys, cron expressions, code | Values that the user copies or compares by character | Prose |
| tone `compact` | Dense rows: filter bars, table cells, inline edit | With size `xs` or `sm` in a toolbar row | A form with labels above the fields |
| `ptahTextarea` | Many lines of text | Descriptions, prompts in settings, allow lists | Chat or lane composers (exception U2) |
| `ptahSelect` | One choice from a short fixed list | Up to about 15 options | Search in a long list (use `ptah-native-autocomplete`) |
| `ptahCheckbox` | Select an item, or one option with a separate save | Lists, filters, consent | An on/off setting that applies at once (use the toggle) |
| `ptahToggle` | An on/off setting that applies at once | Settings rows, feature switches | A choice that needs a submit |

Sizes: text controls `xs` (24 px), `sm` (32 px, default), `md` (40 px). A textarea has no fixed
height: `sm` and `md` have a minimum of 52 px, and `xs` has a minimum of 40 px with label type. Checkbox and toggle `xs`
and `sm` (default). One tone for checkbox and toggle: primary when checked. The research proposed a
`neutral` tone. It is removed: the glass rule paints each checked choice primary, so `neutral`
looked the same as `primary` in the reference themes.

## 2. Tokens

Each rule of `ptah-form-controls.css` reads `--ptah-*` tokens only. New tokens are in
`tokens/ptah-tokens.css`, block "Form controls family". Values: `ptah-glass` (dark) and
`ptah-glass-light` (light) from `apps/ptah-extension-webview/tailwind.config.js`.

| Token | Definition | Dark | Light |
|---|---|---|---|
| `--ptah-control-h-xs` / `-sm` / `-md` | 1.5 / 2 / 2.5 rem | 24 / 32 / 40 px | same |
| `--ptah-field-textarea-min-h` | `--ptah-control-h-field` | 52 px | same |
| `--ptah-radius-control` | `--rounded-btn` | 9999 px (pill) | 9999 px |
| `--ptah-radius-field-multiline` | `--glass-radius-inner`, else `--rounded-box` | 14 px (glass on) | 14 px |
| `--ptah-border-width` | 1 px | 1 px | 1 px |
| `--ptah-field-bg` | `--glass-fill-input`, else base-100 | base-100 #17191d at 66 % (glass) | base-100 #f7f3fd at 58 % (glass) |
| `--ptah-field-fg` | base-content | #f2f2f1 | #1e1936 |
| `--ptah-field-placeholder` | `--bcm` | oklch(90.05% 0.0071 268.54) | oklch(46.56% 0.0614 293.53) |
| `--ptah-field-border` | `--ptah-control-edge` (55 % base-content in base-100) | mix of #f2f2f1 and #17191d | mix of #1e1936 and #f7f3fd |
| `--ptah-field-border-hover` | `--ptah-control-edge-strong` (68 %) | mix | mix |
| `--ptah-field-border-invalid` | `--ptah-state-err` | state ink, else error #ff6b6b | state ink, else error #cf3a3a |
| `--ptah-field-disabled-bg` | `--surface-2` (base-200) | #202329 | #eee8f8 |
| `--ptah-field-disabled-fg` | `--bcm` | as placeholder | as placeholder |
| `--ptah-field-disabled-opacity` | `--ptah-btn-disabled-opacity` | 0.48 | 0.48 |
| `--ptah-choice-edge` | `--ptah-control-edge` | mix | mix |
| `--ptah-choice-on` | primary | #e4b94a | #7c5700 |
| `--ptah-focus-ring-*` | 2 px outline, 2 px offset, `--glass-focus` else primary | base-content (glass) | base-content (glass) |
| `--ptah-font-mono` | JetBrains Mono stack (same as Tailwind `font-mono`) | | |
| `--ptah-select-chevron-size` / `-inset` | 0.25 rem / 1.25 rem (DaisyUI geometry) | 4 / 20 px | same |
| `--ptah-text-body-*` | 0.875 rem / 1.25 rem / 400 | default tone, sizes sm and md | same |
| `--ptah-text-label-*` | 0.75 rem / 1 rem | size xs and tone compact | same |
| `--ptah-text-code-*` | 0.8125 rem / 1.25 rem / 400 | tone mono | same |

## 3. White space

Rules from `foundation-tokens.md` section 3 (the rule names of its table).

| Item | Value | Rule |
|---|---|---|
| Control height | 24 / 32 / 40 px | Control dimensions, `--ptah-control-h-*` |
| Inner padding (inline) | 8 / 12 / 16 px for xs / sm / md. DaisyUI sets it and it equals the tokens. The consumer can add `pl-8` or `pr-9` for an icon. | `--ptah-control-px-xs`, `--ptah-control-px`, `--ptah-control-px-md` |
| Label to control, control to hint | 4 px (`ptah-field`) | "Label to control, control to hint", `--ptah-gap-label` |
| Control to control in one row | 8 px | "Control to control in one row", `--ptah-gap-controls` |
| Field to field | 16 px | "Field to field", `--ptah-gap-field` |
| Checkbox or toggle to its label | 8 px | "Icon to label in a control", `--ptah-gap-inline` |

The stylesheet sets no `position`, width, margin or inline padding. The consumer owns layout.

## 4. Visual hierarchy

| Part | Type role |
|---|---|
| Field label (`ptah-field`) | label (12 px, 500) |
| Value, default tone | body (14 px, 400) |
| Value, mono tone | code (13 px mono) |
| Value, compact tone or size xs | label size (12 px) |
| Placeholder | body size, muted ink (`--bcm`) |
| Hint and error text | hint (12 px). Error uses state ink. |

Order of emphasis: focus ring > error edge > hover edge > rest edge > disabled. A focused invalid
control keeps the error edge and gets the focus ring. Utility classes for height, radius, border,
fill, focus or font have no effect on a directive host: use the `size` and `tone` inputs. A checked choice
(primary fill) is stronger than a text field. A form has at most one primary button (button family).

## 5. Reference pages

Recipes of today come from the source (static `class`). Heights before are DaisyUI values plus the
global `.input` rule (`min-height: 32px`, `font-size: 13px`).

| Page | Today | Proposed | Expected visible difference |
|---|---|---|---|
| Provider setup wizard (`chat/.../providers/provider-setup-wizard.component.ts`) | 9 × `input input-bordered input-sm w-full min-h-9 border-base-content-muted bg-base-100 text-base-content focus-visible:outline…`; 7 × `radio radio-sm` | `ptahInput` default, `w-full` stays. Radios stay raw (out of family scope). | 36 → 32 px high. Fill: glass input fill. Edge: token edge. Value 13 → 14 px. Focus ring: same 2 px outline. |
| Session filter bar (`chat/.../session-filter-bar.component.ts`) | `input input-sm rounded-lg h-8 min-h-8 bg-surface-0 border-surface-border`; 2 × `select select-sm rounded-lg h-8 … pl-2 pr-6 bg-surface-0 text-xs`; 2 × `checkbox checkbox-xs`; 2 × `toggle toggle-xs` | `ptahInput`/`ptahSelect` tone `compact`, size sm; `ptahCheckbox` xs; `ptahToggle` xs. `pl-2 pr-6` and width classes stay. | Height stays 32 px. Radius `rounded-lg` → pill. Edge `surface-border` → token edge (stronger, 3:1). Checked checkbox → primary in non-glass themes. Unchecked toggle edge stronger. |
| Review settings drawer (`review-runs-ui/.../review-settings-drawer.component.html`) | 5 × `input input-bordered w-full` (unsized, 4 number); `toggle toggle-warning` (md) | `ptahInput` default sm; `ptahToggle` sm | Inputs 48 → 32 px (decision 1). Toggle 24 × 48 → 20 × 32 px and warning → primary. |
| Cron scheduler tab (`cron-scheduler-ui/.../cron-scheduler-tab.component.ts`) | 2 × `input input-bordered input-sm`; `input … input-sm font-mono`; `textarea textarea-bordered textarea-sm font-mono`; `select select-bordered select-sm`; `toggle toggle-sm toggle-primary` | `ptahInput` default and `mono`; `ptahTextarea` mono; `ptahSelect`; `ptahToggle` sm | Height stays 32 px. Value 13 → 14 px (mono 13 px). Textarea minimum 52 px, radius 14 px. Select chevron shows in glass. |
| Session organization editor (`chat/.../session-organization-editor.component.ts`) | 4 × `select select-bordered select-sm` (2 with `w-full`); `input … input-sm text-xs`; `input … input-sm font-mono text-xs`; `toggle toggle-sm` | `ptahSelect`; `ptahInput` compact and mono; `ptahToggle` sm | Height stays 32 px. Mono value 12 → 13 px. Neutral toggle → primary when on (non-glass themes). |

## Exceptions (keep their look)

- Chat composer textarea (`chat-input.component.ts`), decision U2. The four other composers
  (`lane-composer`, `commit-composer`, `remote-composer`, `reply-composer`) are reviewed one by one
  in step 5.
- Canvas rail, `contenteditable` editors, CodeMirror (`git-ui/spot-editor`), terminal.
- `input type="range"` (1), card radios with `peer sr-only` (3), the JSON schema form (5, after
  the owners exist).
- Radios (23): not in this family scope. See the open questions.

## Proposed Removals

Step 6 removes these after the adoption. Nothing is removed in this step.

- `extracted/setup-field` (`select[ptahSetupField]`, `SETUP_FIELD_LOOK`): replaced by `ptahSelect`.
- `surfaces/field-control.directive.ts` (`ptahFieldControl`): replaced by `ptahInput`,
  `ptahTextarea` and `ptahSelect` inside `ptah-field`.
- Raw recipes outside `libs/frontend/ui`: `input input-bordered*`, `select select-bordered*`,
  `textarea textarea-bordered*`, `checkbox checkbox-*`, `toggle toggle-*` (the 129 recipes of the
  research, minus the exceptions).
- Global rules in `styles.css` that only serve raw controls: `.input, .textarea { min-height:
  var(--input-height) }`, `.toggle-sm { width: 32px; height: 16px }` (it never applies: DaisyUI
  `[type=checkbox].toggle-sm` has a higher specificity), and the glass form rules once no raw
  control remains.
- Local focus constants on controls (for example `${FOCUS_RING}` in the session filter bar) and the
  Settings ring rule `:where(ptah-settings) :is(.checkbox, .radio, .toggle):focus-visible`.
- Ratchet: add the class roots `input`, `select`, `textarea`, `checkbox`, `toggle` to
  `tools/ui-class-audit` in step 5 and seed the baseline (not in this step).

## D. Review

- [x] Contrast: `design-tokens.spec.ts` asserts, for `ptah-glass` and `ptah-glass-light`, text
      ≥ 4.5:1 (value and placeholder on base-100) and edge, focus ring, checked fill and error edge
      ≥ 3:1 on base-100 and the tinted panels. Axe on the gallery needs Electron (see C).
- [x] Spacing: each value is a token of the 4 px scale. Chevron geometry is a token.
- [x] One design language: the five pages map to the same three tones and two choice sizes.
- [ ] Independent reviewer lane: see the pull request.

## C. Screenshots: blocker

The owner session must not run `build`, `serve`, `dev`, `e2e` or `package` targets. Electron
screenshots need the renderer and the Electron host built from this branch. To make them, the user
(or the coordinator with the user's permission) runs, in this worktree:

1. `npm run electron:serve`
2. Open `/ui-gallery`, section "Form controls family", in `ptah-glass` and `ptah-glass-light`.
3. Open the five reference pages above at 1440 × 900. "Before" is `main`. "After" needs the
   step 5 adoption of the page, so the after images of the pages come with the first adoption
   batch. The gallery shows the proposed look now.
4. Record the file name and the SHA-256 hash of each image here.

| Image | Theme | File | SHA-256 |
|---|---|---|---|
| Gallery section | dark / light | open | open |
| Each reference page, before | dark / light | open | open |
| Keyboard focus on a control | dark | open | open |

## Open questions

1. **Radios.** The research proposed `ptahRadio`. The family scope has five kinds without radio.
   Recommendation: add `ptahRadio` with the checkbox look in step 5, before the Settings batches.
2. **Composites.** `ptah-search-input` and `ptah-secret-input` (icon, clear, reveal) are
   composites. Recommendation: build them in level 2 with the input owner.
3. **`ptah-field` density and state** (`compact`, `pending`, `saved`). Recommendation: add them in
   the first adoption batch that needs them, with a look request only if the look changes.

## Approval record

Answer: open. Date: open. Approved changes: open.
