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

## 3A. Planned families: timers and charts

Source: `TASK_2026_970_fa60/charts-timers-proposal.md` (with `inventory.md` and `web-research.md`).
The user asked for a plan to include an Angular charts library, with timers and countdowns.
The direction of the user for the whole design system is to unify all. A later change of one
owner applies everywhere. A consumer does not carry its own look.

Both families are level 2 families. They go through the six steps of section 4.

**Order.** These families start after the open form controls look correction (PR #1118) is
accepted. Reason: the gallery and the look sheets take one look track at a time. Timers come
first, because they need no library. Charts follow.

**Rule for both families.** Every timer, countdown, meter, ring, sparkline, stat and chart in
the renderer uses the owner from `libs/frontend/ui`. A consumer passes data and a `tone`. It
does not set colors, sizes or private geometry. A private clock or a private chart geometry
outside `libs/frontend/ui` is a removal target.

### 3A.1 Decisions (default, the user can change each one)

| # | Decision | Default |
|---|---|---|
| Q1 | Library | Chart.js 4 with `ng2-charts` for full charts. Own inline SVG owners for meter, ring, sparkline and stat tile. No library for these. |
| Q2 | Existing SVG charts | Do not replace them in the first step. They are later adoption candidates (usage stacked bars and cost donut in `libs/frontend/dashboard`, the charts in `libs/frontend/declarative-dashboard`). |
| Q3 | ECharts | Documented fallback only. |
| Q4 | First time features | Reset countdown (plan limits) and session elapsed time. The data for both exists. |
| Q5 | Tick | 1 s. Paused when the window is hidden. |
| Q6 | Clock | One `ClockService` replaces `WallClockService` (`libs/frontend/core/src/lib/services/wall-clock.service.ts`) and `CountdownClock` (`libs/frontend/machines-ui/src/lib/services/countdown-clock.ts`). The old API stays as a thin wrapper for one PR. |
| Q7 | Bundle | Keep the renderer budget in `apps/ptah-extension-webview/project.json`: `initial` warning 2.5 mb, error 4.1 mb. |
| Q8 | VS Code | No check now. Electron first. |

Versions come from the proposal. Check them at install time. The chart packages are not in
`package.json` today.

### 3A.2 Family T: timers and countdowns (no library, first)

Owners: `ClockService` (in `libs/frontend/core`), `ptah-timer`, `ptah-countdown`,
`ptah-relative-time` (in `libs/frontend/ui`), and the pure helpers `formatDuration` and
`formatRelative`. A timer always derives from a timestamp, never from a counted tick.

| Step | Plan |
|---|---|
| 1 Research | Done: proposal section 1.2 and `inventory.md`. 11 own intervals, 7 duration formatters and 6 relative-time helpers. |
| 2 Component and gallery | Owners, one gallery section per variant and state (running, urgent, expired, frozen), accessibility spec. Folder in `TOKEN_ONLY_DIRS`. |
| 3 Look | One look sheet (`family-<n>-look.md`) for the three components. Tone change below the urgent limit. |
| 4 User approval | Electron screenshots, dark and light theme, on reference pages (plan limits tile, agent card, machines view). One approval for the group. |
| 5 Adoption | Own intervals move to `ClockService`. Duration and relative-time copies move to the helpers. Batches of at most six write files. |
| 6 Removal | Delete the 7 + 6 formatter copies, `CountdownClock` and the raw clock intervals. Add a lint rule that bans a raw `setInterval` clock in feature libs, with a message that names the owner. The ratchet baseline goes down. |

First features (Q4): reset countdown in the plan limit tiles and elapsed time in the agent card.

Acceptance criteria:

- One interval serves all consumers. It runs only while a consumer exists. It pauses when the
  window is hidden (Page Visibility). On return the value is recomputed from the timestamp.
- `role="timer"` is silent for ticks. A separate polite live region announces only state
  changes ("less than 1 minute left", "expired"). Every value has an absolute time in `title`
  or in a `<time datetime>` element.
- With reduced motion, a countdown has no animated ring.
- Expiry events fire on return from the hidden state.

### 3A.3 Family C: charts (after timers)

Two parts. Part C1 has no dependency: extend `ptah-meter`
(`libs/frontend/ui/src/lib/foundation/meter.component.ts`), and add `ptah-ring`,
`ptah-sparkline` and `ptah-stat` as inline SVG. Part C2 is `ptah-chart` (line, bar, doughnut) on
Chart.js and `ng2-charts`. Duplicates to remove: two chart geometry sets, two rings, five
plan-limit meter bars and two stat cells (proposal section 1.1).

| Step | Plan |
|---|---|
| 1 Research | Done: proposal sections 1.1, 2 and 3. |
| 2 Component and gallery | C1 owners and gallery. Then C2 as a spike: add the packages, `ptah-chart`, token theme, lazy load, bundle measure. Gallery section per type and state, accessibility spec. |
| 3 Look | One look sheet for C1 and C2: tones, palette from tokens, axis and grid, legend, tooltip. |
| 4 User approval | Electron screenshots, dark and light theme. One approval for the group. |
| 5 Adoption | Meters and rings first (plan limits, budget, account tile, vitals). New trend charts next (usage trend, benchmark trend). Existing SVG charts only if the look matches (Q2). |
| 6 Removal | Delete private geometry, rings and meter copies. Add ratchet roots and lint rules. Baselines go down. |

Acceptance criteria:

- The chart library loads lazily (`@defer` or a lazy route) and is outside the `initial`
  bundle. The build must not warn on the `initial` budget (Q7). PR C2 records the measured
  `initial` size before and after.
- No inline script and no remote font or remote host. The CSP in
  `apps/ptah-electron/scripts/copy-renderer.js` stays unchanged.
- The canvas colors come from token values that the wrapper reads at run time. The chart
  rebuilds on a theme change (dark and `ptah-glass-light`).
- With reduced motion, a chart has no animation.
- Each chart has a text alternative (`ariaLabel` and a `summary` takeaway) and a table fallback
  (`showTable`).
- `series` is typed and checked with Zod at the edge.

### 3A.4 Planned pull requests

| # | PR | Family | Projects | Verify |
|---|---|---|---|---|
| T1 | Owners: `ClockService`, helpers, `ptah-timer`, `ptah-countdown`, `ptah-relative-time`, gallery, accessibility spec | T | `ui`, `core` | `npm run verify -- -p ui,core`, then `npm run verify -- -t typecheck-templates -p ptah-extension-webview` |
| T2 | Look sheet and Electron screenshots, user approval | T | docs | none (docs) |
| T3..Tn | Adoption batches (at most six write files each): plan limits and agent card first, then machines, onboarding, voice, command center, cron, memory, indexing, skill synthesis | T | the changed libs | `npm run verify -- -p <changed libs>` and `typecheck-templates` after a template change |
| T-last | Removal: formatter copies, `CountdownClock`, raw intervals, lint rule | T | changed libs, `tools/ui-class-audit` | scoped verify |
| C1 | `ptah-meter` extension, `ptah-ring`, `ptah-sparkline`, `ptah-stat`, gallery | C1 | `ui` | `npm run verify -- -p ui`, then `typecheck-templates` |
| C2 | Spike: packages, `ptah-chart`, token theme, lazy load, bundle measure. Changes `package.json` and the lock file. | C2 | `ui`, `ptah-extension-webview`, `ptah-electron` | `npm run verify -- -p ui,ptah-extension-webview` and the Electron `validate-deps` gate (runs on push) |
| C3 | Look sheet and Electron screenshots, user approval | C | docs | none (docs) |
| C4.. | Adoption: meters and rings (`chat-ui`, `chat`, `dashboard`), then trend charts (`dashboard`, `declarative-dashboard`, `skill-synthesis-ui`) | C | the changed libs | `npm run verify -- -p <changed libs>` |
| C-last | Removal: private geometry, rings, meter copies, ratchet roots, lint rules | C | changed libs, `tools/ui-class-audit` | scoped verify |

T1 and C1 are file-disjoint and can run in parallel. C2 waits for the user to accept Q1 and the
change of `package.json`. Nothing here starts before PR #1118 is accepted.

### 3A.5 Risks

| Risk | Control |
|---|---|
| Bundle size (the room in `initial` is not measured) | Lazy load. Measure in C2. Stop if the budget warns. |
| CSP | No inline script, no remote font, no remote host. Canvas needs no style injection. |
| Canvas does not read CSS variables | The wrapper reads token values and rebuilds on a theme change. Check dark and light. |
| Reduced motion | Chart and countdown animation off when the preference is set. |
| Accessibility of charts | Text alternative and table fallback are required. |
| Timer drift and hidden window | Derive from timestamps. Pause the display tick when hidden. |
| `validate-deps` gate and licence notice | The gate runs on push. Check that the packager lists the MIT notice. Not confirmed: whether a root `package.json` change is enough. |
| VS Code webview CSP not read | Not confirmed. Electron first (Q8). |

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
| 1 | Button and icon button | done | done (#1066) | done (#1071) | done | in progress (most page libs merged; completion task TASK_2026_1160_button_finish: 224 raw uses in 118 files at start, batch plan in `batch-plan.md`; user decided: `outline` variant is added (owner PR, gallery approval pending); warning, success, info, gold and circle stay raw as named exceptions; typed owner inputs for start alignment, danger tone, pill, 44 px size and selected state are planned) | open |
| 1 | Form controls | done (this task) | done (TASK_2026_950_ed73) | done (`family-2-look.md`, screenshots wait for Electron) | open | in progress (ratchet roots `checkbox`, `toggle`, `form-control`, `label` added; batches 1 to 10 of 10 done: marketplace, onboarding, canvas non-rail (16 files); chat providers and components (19 files), chat settings/ptah-ai (16 files; success-tone toggles left raw), chat settings advanced, license, output-style, pro-features (9 files), memory-curator-ui and skill-synthesis-ui (14 files), tasks-ui and cron-scheduler-ui (9 files; task-card selection checkbox keeps a 24 px card size), chat-ui, chat, command-center, mcp-apps-page, setup-wizard and workspace-indexing (12 files; owner fixes: ptah-field bound id, ptah-select triggerId; question-card info variants and command-text borderless variant left raw), git-ui and review-runs-ui (13 files; the warning toggle in the review settings drawer stays raw, no warning variant); machines-ui, messaging-gateway-ui and declarative-dashboard (13 files; the radio group in surface-choice-input stays raw; selected option color of ptah-select raised to 40% primary for contrast); radios are a named exception) | done (TASK_2026_1008_step6: baseline locks; 11 exceptions) |
| 2 | Composites | done (this task) | open | open | open | open | open |
| 2 | 1. Badge and status | done (TASK_2026_957_fda3) | done (TASK_2026_957_fda3) | done (`family-3-look.md`, screenshots wait for Electron) | open | open | open |
| 2 | Timers and countdowns (planned, section 3A) | done (TASK_2026_970_fa60) | open | open | open | open | open |
| 2 | Charts (planned, section 3A) | done (TASK_2026_970_fa60) | open | open | open | open | open |
| 2 | 3. Card, panel surface, section header | done (TASK_2026_1012_b1dc, `card-family-research.md`) | done (this PR: `ptah-surface-card`, `[ptahSurface]`, `ptah-section-header`, gallery family) | done (`family-card-look.md`, screenshots wait for Electron) | open | open | open |

Order of the composites: section 3 of this document. Timers and charts: section 3A. They start after PR #1118 is accepted.

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
| 3 | Native `<select>` against the rich combobox. | Form controls, step 2 | Reversed (user, revision 2): form selects move to `ptah-select`; inline selects stay native. See `family-2-look.md` section 6. |
| 4 | Duplicate owner folders in `libs/frontend/ui` (`native`, `overlays`, `selection`) for menu, popover and autocomplete. | Before the ratchet and lint rules of the composites | Keep `native/*`. It has all consumers. Delete `overlays/*` and `selection/*` after a check shows zero imports. |
| 5 | Card owners (5 today) and 158 raw panel surfaces. Also list row and settings row, where the DOM varies. | Composites 3 and 6 | One `ptah-surface-card` API with a `variant` input. Rows get content slots. Batches take rows with an equal DOM first. The other rows move together with the new look. Each row still moves one time. Autocomplete stays WATCH. Autocomplete has 2 raw uses, so the skip rule applies: keep it at WATCH even though the user listed it. Toast, divider, avatar, steps, kbd and raw tooltip stay SKIP (0 to 2 uses each). |
| 6 | Charts and timers: Q1 to Q8 of section 3A.1 are defaults. The user can change each one. | Before T1 (Q4 to Q6), before C2 (Q1, Q3, Q7) | Accept the defaults. C2 changes `package.json` and the lock file, so it needs an explicit approval. |
| 7 | Which runtime-cap or budget clock is wanted? A runtime-cap clock needs host data that does not exist yet. | After T3 | Keep it out of the first step. |
| 8 | Is a VS Code webview check needed for these families? | Before C2 | No. Electron first. Check only if the user asks. |
