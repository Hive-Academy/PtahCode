# Design system epic: primitives first, then composites

Date: 2026-11-11. Task: TASK_2026_940_eef5. Status: approved by the user. Every later design
system session follows this document.

This document replaces the order of families in section 5 of `design-system-plan.md`. It keeps
the method, the gates and the token rules of that plan. Where the two documents disagree, this
document wins.

Related documents (all in `.ptah/specs/`):

| Document | Content |
|---|---|
| `TASK_2026_924_8ac1/design-system-plan.md` | Method, gates, token rules, risks |
| `TASK_2026_924_8ac1/renderer-component-inventory.md` | Raw counts of the renderer by family |
| `TASK_2026_926_6b1f/look-approval-checklist.md` | Checklist of the Look approval |
| `TASK_2026_929_26ca/button-research.md` | Format of a level 1 research |
| `TASK_2026_940_eef5/form-controls-research.md` | Level 1 research: form controls |
| `TASK_2026_940_eef5/composites-research.md` | Level 2 research: composites |

## 1. Goal

The renderer must look like one product. Primitives alone do not give this result. A button
that is correct inside a dialog that is different on each page still looks like a different
product on each page. Thus the epic has two levels.

| Level | What it is | Who owns the look |
|---|---|---|
| 1. Primitives | One control: button, icon button, input, textarea, select, checkbox, toggle | `libs/frontend/ui`, tokens only |
| 2. Composites | A pattern that the user sees as a unit: dialog, card, section header, settings row, list row, empty state, tabs, menu, badge, autocomplete | `libs/frontend/ui`, built from level 1 primitives |

The composites carry the unique flavor of the product. Level 1 is a means to level 2. It is not
the goal.

## 2. Level 1: primitives

1. **Button and icon button.** The look is approved and merged. The adoption is in progress.
2. **Form controls, one family.** Input, textarea, select, checkbox and toggle go through the
   six steps together. They have one research, one look sheet and one user approval. The
   research is `TASK_2026_940_eef5/form-controls-research.md`. Lanes do the mechanical
   adoption.

A primitive does not wait for a composite. A composite waits for the primitives that it uses.

## 3. Level 2: composites

The composites are, in the order of the first plan: dialog, card and panel, section header,
settings row, list row, empty state, tabs, menu, badge and autocomplete. Autocomplete is an
input plus a menu, so it follows the menu.

The research `TASK_2026_940_eef5/composites-research.md` counts each pattern and gives the
final order. The rules for the order are:

- Order by use count first, then by visual impact. A composite that uses another composite
  (list row uses the card look) follows it. Thus the table below is not a strict count order.
- Skip a pattern that occurs one or two times. Record the skip and the count.
- Put a composite after each primitive that it needs.
- Every composite goes through the six steps of section 4.

Proposed order (from the research, counts are raw plus owner uses, outside `libs/frontend/ui`):

| # | Composite | Count | Why here |
|---|---|---:|---|
| 1 | Badge and status | 260 | Highest count, 16 lib groups, no primitive needed |
| 2 | Alert, empty state, skeleton and spinner | 78, 106, 254 | Share one `ptah-state-panel`, need only button |
| 3 | Card, panel surface, section header | 42, 158, 357 | Frame every screen: highest visual impact |
| 4 | Dialog and drawer | 45, 12 | Need form controls. Drawer owner exists. |
| 5 | Tabs, segmented control, menu | 22, 18, 18 | Navigation look. Menu comes before autocomplete. |
| 6 | List row, settings row | 248, 257 | Large counts but varied DOM. They follow card and header. |
| 7 | Table, key-value row, details | 23, 64, 47 | Simple recipes, last |
| WATCH | Autocomplete | 7 | Two raw uses. Build with the next feature that needs it. |
| SKIP | Toast, divider, avatar, steps, kbd, raw tooltip | 0 to 6 | Record the count. Adopt `ptahTooltip` only. |

The heading, list item and label counts are upper bounds. They count common tags.

## 4. The six steps of a family

A family is one primitive, one group of primitives, or one composite.

| Step | Name | Result | Gate |
|---|---|---|---|
| 1 | Research | A research file in the task folder: census with method, recipes, exclusions, API sketch, risks | Numbers come from code. The method is in the file. |
| 2 | Component and gallery | The owner in `libs/frontend/ui`, exported from `@ptah-extension/ui`, with a gallery section for each variant and state | Scoped verify. Tokens only. The accessibility spec passes. |
| 3 | Look | A look sheet `family-<n>-look.md` with variants, tokens, white space, hierarchy, reference pages and removals | The checklist in `look-approval-checklist.md`, sections A, B and D |
| 4 | User approval | Electron screenshots, dark and light theme, before and after, on three to five reference pages | The user approves one time for the family or the group |
| 5 | Adoption | The templates move to the owner, lib by lib, in batches of at most six write files | Declared DOM delta gate. A batch that needs a new variant goes back to step 3. |
| 6 | Removal | The raw recipes, the private components and the old inputs are deleted. The ratchet baseline goes down. | The ratchet, the lint rule and the `## Proposed Removals` list in the pull request |

Rules:

- A row moves one time only. It moves with zero pixels if its DOM is equal. Otherwise it moves
  together with the new look.
- A family that has no mass adoption (one owner, few uses) can merge steps 5 and 6.
- Screenshots come from Electron only. The renderer in `apps/ptah-extension-webview` is the
  Electron renderer. Do not use the VS Code host for visual review.

## 5. The faster procedure

The first family (button) used two looks and a `data-ptah-look='next'` scope. This cost too
many sessions. The following rules apply to all later families.

1. **One approval for each group.** All form controls get one look sheet and one approval. A
   composite group (for example dialog and drawer) gets one approval as well.
2. **No two-look phase.** Do not add a `[data-ptah-look='next']` scope for small controls. The
   gallery shows the proposed look. The reference pages show the before and after in the
   screenshots.
3. **Small files.** One research file, one look sheet. Do not write extra reports.
4. **Lanes for the mechanical work.** Counting, adoption and removal go to CLI lanes. The
   coordinating session reads the result summary, runs the scoped verify and decides the
   open questions.
5. **Scoped checks only.** `npm run verify -- -p <projects>`. No workspace-wide run.

## 6. Enforcement

A family is not closed when only the owner exists. The old patterns must be unable to come back.

| Mechanism | Applies to | Rule |
|---|---|---|
| `ui-class-audit` ratchet (`tools/ui-class-audit`) | Each family with DaisyUI class roots | Add the class roots of the family. Seed the baseline. After each adoption batch run `update-baseline` to record the decrease. |
| Lint rule per composite | Each composite | A template lint rule forbids the raw recipe outside `libs/frontend/ui`. The rule has a message that names the owner. |
| Baselines only go down | All | `--update-baseline` never raises an entry. A hand edit that raises a baseline needs a review comment that explains why. |
| Token guard (`TOKEN_ONLY_DIRS`) | Each new folder in `libs/frontend/ui` | The folder of the family is in the list. It uses tokens and no raw colors. |

Today the ratchet counts the roots `btn`, `input`, `select`, `textarea`, `card`, `badge`,
`alert` and `skeleton` (5570 tokens in 452 files on `main` at commit `afd0ddd02`). A lint rule
for a composite replaces a ratchet root when the composite has its own owner. It does not
increase the baseline.

## 7. Definition of done for a family

A family is done when all items are true.

- [ ] The owner is in `libs/frontend/ui` with a public export, a spec and a gallery section.
- [ ] The accessibility spec asserts name, role, keyboard path and focus ring.
- [ ] The look sheet has the user approval, the date and the screenshot hashes.
- [ ] No template outside `libs/frontend/ui` uses the raw recipe. The exceptions are listed in
      the research file (for example the chat composer and the canvas rail).
- [ ] The ratchet roots or the lint rule of the family are active. The baseline for the family
      is zero, or each remaining entry is a named exception.
- [ ] The private copies in feature libs are deleted.
- [ ] The scoped verify passes for the owner and each changed consumer.
- [ ] The pull request lists the removals and the checks that did not run.

## 8. Status

Update this table in the pull request of each step. Do not keep another status list.

| Level | Family | Research | Component and gallery | Look | User approval | Adoption | Removal |
|---|---|---|---|---|---|---|---|
| 1 | Button and icon button | done | done (#1066) | done (#1071) | done | in progress (marketplace #1073 merged, pages in a branch) | open |
| 1 | Form controls | done (this task) | done (TASK_2026_950_ed73) | done (`family-2-look.md`, screenshots wait for Electron) | open | open | open |
| 2 | Composites | done (this task) | open | open | open | open | open |

Order of the composites: section 3 of this document.

## 9. How a later session starts

1. Read this document, then the research file of the family.
2. Create a worktree and a task. Do not edit the main checkout.
3. Run the six steps in order. Stop at step 4 and ask the user.
4. Update the status table in the same pull request.

## 10. Open decisions for the user

Each decision has a recommendation. The coordinating session asks the user before the step that
needs the answer. Sources: the two research files of TASK_2026_940_eef5.

| # | Decision | Needed at | Recommendation |
|---|---|---|---|
| 1 | Default size of text controls. The unsized DaisyUI input is 3rem high. The token size `sm` is 2rem. Today 13 inputs and 4 textareas are unsized. | Form controls, step 3 | Use `sm` as the default. Show the height change in the look sheet. |
| 2 | Custom looks on 85 inputs (own height, focus or surface classes). | Form controls, step 3 | Fold them into three tones: default, mono and compact. The consumer keeps layout classes. |
| 3 | Native `<select>` against the rich combobox. | Form controls, step 2 | Keep native `<select>` with `ptahSelect` first. Move to the combobox only after a behavior parity test. |
| 4 | Duplicate owner folders in `libs/frontend/ui` (`native`, `overlays`, `selection`) for menu, popover and autocomplete. | Before the ratchet and lint rules of the composites | Keep `native/*`. It has all consumers. Delete `overlays/*` and `selection/*` after a check shows zero imports. |
| 5 | Card owners (5 today) and 158 raw panel surfaces. Also list row and settings row, where the DOM varies. | Composites 3 and 6 | One `ptah-surface-card` API with a `variant` input. Rows get content slots. Batches take rows with an equal DOM first. The other rows move together with the new look. Each row still moves one time. Autocomplete stays WATCH. Autocomplete has 2 raw uses, so the skip rule applies: keep it at WATCH even though the user listed it. Toast, divider, avatar, steps, kbd and raw tooltip stay SKIP (0 to 2 uses each). |
