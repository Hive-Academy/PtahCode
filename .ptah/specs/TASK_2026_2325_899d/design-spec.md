# Design Spec - TASK_2026_2325_899d

Two surfaces: (A) the Setup model option, (B) the skills review step with judge results. Prototype:
`prototype/index.html` (README there lists states, screenshots and rule provenance). Electron first; the renderer is `apps/ptah-extension-webview`.

## 1. Audience and goals

User running onboarding in the Electron app. Goals: know and control which model does setup work (A); see why each stack item gets install, build or no skill, trust the pre-selection, and still reach everything by hand (B).

## 2. Current-state evidence

- Settings "Background models": rows Memory curator, Enhancement, Decision (`provider-consumer-assignments.component.ts:85-145`); each row = name + tier badge + helper text, and an outline pill cell that opens a popover picker, "Each choice saves at once, with Undo" (`:300-320`). Roles in `provider-consumer-rows.ts` (`BACKGROUND_ROLE_IDS`).
- Skills step (screenshot `.ptah/tmp/observe/05-skills.png`): Stack coverage strip with dot + "N selected" chips (`stack-coverage-strip.component.html`), pick-card grid (`skill-pick-card.component.html`), sticky selection rail ("Install N skills and continue" primary, "Skip skills" ghost), per-item draft forms for unmatched items (`unmatched-stack-list`, removed by D5), select-all default (removed by D5).

## 3. Layout and hierarchy

### A1 Settings, Setup row (`prototype` surface A1)
Same `article.role` grid as the other rows: left = "Setup" (h3 `text-sm font-medium`), tier badge, helper "Runs project analysis, skill review, agent generation and guidance during setup."; right = outline `ptahButton` cell (provider mark, "Provider / model", chevron) opening the same popover picker (provider select, model select, "Use workspace model" outline button, helper "Each choice saves at once, with Undo..."). Header badge count becomes "4 roles". Placed first (lane-proposed). Provider and model are one stored pair `{provider, model}` (prototype state `setup = null | pair`). Choosing a provider alone does not save; the model select enables after the provider is chosen and the pair commits atomically when both are valid (finding 1). Undo restores the previous pair (or Unset) in one step. Round trip: the pair set in A1 is what A2 reads on return and what survives a restart; storage scope (global or per workspace) is an implementation-plan item the spec does not decide, and the restart proof is carried to the handoff (section 12). The picker pattern "save at once with Undo" is an existing precedent in the provider assignments source, not a project-wide rule; the Setup adaptation (atomic pair save, Undo restoring the previous pair) is `lane-proposed`. Stale, model-only, provider-only and signed-out are derived from the stored pair against the provider catalogue, never from which state button is pressed.

States (all rendered):
| State | Cell label | Extra |
| --- | --- | --- |
| Unset | "Workspace model: Anthropic / claude-sonnet-4-5" + "Following workspace" badge | hint "No Setup model is chosen, so setup uses the workspace provider and its selected model." (D7) |
| Set | "Provider / model" | after change: info alert "Setup saved: ..." with Undo (`role=status`) |
| Stale (model no longer offered) | stored pair shown | error alert naming provider and missing part; actions "Choose a model", "Use workspace model"; no silent substitution (req 2.8) |
| Only provider stored | "Provider / (no model chosen)" | same alert; naming the missing model |
| Only model stored (provider missing or no longer offered) | "(no provider) / model" | same alert naming the missing provider; actions "Choose a provider", "Use workspace model" |
| Provider not signed in | stored pair | alert "OpenRouter is not signed in..." with "Set up OpenRouter" (existing readiness pattern `readiness-setup-*`). The button runs the readiness action (a sign-in step is shown, then the alert clears when ready); it does not toggle the picker. |
| Opened from analyze link | row outlined `border-primary` (existing `activeEditId` treatment) | focus lands on the cell |
| Provider failure after a run started | not in Settings; shown on A2 and the run pill, naming provider (req 2.9) | |

### A2 Analyze page card (read-only)
`tile` with h2 "Setup model", state badge (Default / Set / Needs attention), pair as bold text with provider mark, hint line, link-variant button "Change in Settings" with an external-arrow glyph at the right. Default: states that the workspace provider and selected model apply. Invalid pair: error alert inside the card, "Start analysis" disabled with adjacent hint "Choose a valid Setup model to start."; alert actions "Choose a model" (link to Settings) and "Use workspace model" (explicit user act). Every invalid case (stale, model-only, provider-only, signed-out) disables Start and shows the guard with the case-specific message; the same guard stops a skills request (first run and Re-run), see 3.1 (R13). Provider failure after start: error alert above Start with "Retry with this model" and "Change in Settings"; nothing switches models silently. The card re-reads the value on return from Settings without restart (req 2.2). The run pill and result show the pair used per stage (see 3.1).

### B Skills step order (top to bottom)

**Width and density (R22, user-requested D11, numbers lane-proposed).** The skills step has no narrow centered column: it uses the full width of the renderer window with normal page padding. Candidates are compact cards; the method banner is one line, the coverage strip at most two lines of chips, the rail sticky. Target: at 1100 px wide and 1000 px window height, 8 Install skills and 3 Build proposals are visible within about 1.5 window heights; at >=1400 px the grid adds columns (section 6). Density changes no state, count, reason or action; all stay reachable.
1. Header, Back, "Re-run skill search" (existing).
2. Existing alerts: search-failure (error, lists items and reasons, Re-run), warning, summary-source notice, action error.
3. **Method banner** (new, `role` region, an alert (illustrative names `alert info|warn`; no shared alert API is implied, concrete classes follow `stack-skill-review.component.html:43-110`)): one sentence naming the method with counts, a "Why this method" disclosure listing each stage (Decision model, Normal model) as badge (used / failed / skipped, glyph + word) plus reason category (`unavailable`, `timed out`, `invalid output`, `provider error`), and the Setup and Decision pairs used. Variants: all decision, mix "8 items by the decision model, 4 by the normal model", partial "..., N not judged" (warn, disclosure collapsed, count and warn tone stay in the one line), none "Not judged by AI. Showing registry order." (warn, collapsed, same rule). Never claims only the first method (req 3.11). R22: collapsed by default to ONE line (sentence with counts, plus the warn tone and the "N not judged" count in the partial and none variants), with "Why this method" as a toggle button (`aria-expanded`, `aria-controls`, keyboard reachable) that opens the stage details.
4. Stack coverage strip (existing, unchanged semantics): chips keep the registry dot (selected / available / no match / search failed) and gain a verdict suffix "glyph + word" (check Install, plus Build, minus No skill needed, question mark Not judged). Chip click still filters. Registry state and verdict are two separate marks (req 3.9). 12-chip overflow behaviour unchanged. R22: at most two lines of chips by default; the rest sit behind the existing overflow control ("+N more").
5. **Verdict filter** (new): "Show" + `ptahButton` xs toggles with counts: All, Install, Build, No skill needed, Not judged (zero-count ones hidden).
6. **Install** section: pick-card grid (existing card) pre-selected; the card is compact (R22): checkbox, name, source link, one-line description, covers badges, installed badge, and ONE line of reason with its stage caption ("Install, Decision model"; left border `--ptah-control-edge`), truncated with an ellipsis. An expand control on each card (icon `ptahButton` xs, native `button`, in tab order after the source link; `aria-expanded`, `aria-controls` the detail region, accessible name "Show full reason and script note for <skill name>", toggling to "Hide ..."; Enter and Space toggle) opens the full reason and the script note in place; nothing is always expanded. Card toggle, source link, installed badge, covers badges unchanged.
7. **Build** section: short list of rows (not forms). Row = proposed skill name, "Build" info badge, judge name, reason, "Covers" item badges (one proposal can cover several items), and an outline "Preview draft" button (R23; one dense row, reason on one line with the same expand control as Install cards). Pressing it opens ONE inline preview view in that row (see 3.5: proposed name, destination path, generated SKILL.md rendered readable, Edit toggle revealing name input, description input and content textarea, primary "Create skill" only inside it, "Cancel"); opening another asks first when the open draft has unsaved edits (3.5). States: generating (`role=status` spinner), ready ("Generated, review before creating" badge), generation failed (warn alert, draft keeps name + evidence, "Try again"), created (info alert with the path computed from the submitted name), create failed (error alert, edits kept), invalid (empty name or content disables Create with hint). Nothing is written to disk before "Create skill" in the preview (req 5.3, R23); leaving without creating is valid (5.6). "No registry candidates" warn badge when the item's search failed.
8. **Not judged**: one row per item: name, "Not judged" warn badge, registry badge (matched / no match / search failed), "Search for <name>" outline xs, "Draft a skill" ghost xs, then the item's registry candidates as ordinary selectable pick cards (unselected). Never dropped (req 3.6).
9. **No skill needed**: collapsed `details`, rows with reason.
10. **Other candidates**: collapsed `details`; dashed pick cards with a warn badge ("Rejected by judge" / "No verdict") and the judge reason; selectable. Shown only for candidates that no item row and no verdict section lists; see 3.3 (R16). Hidden under a verdict filter and when no judge ran or both stages failed (item rows already show the pool).
11. "Find more skills": existing search plus new outline "Write a skill by hand" (opens an empty draft editor; also in the empty state).
12. Selection rail (existing): "N selected", hint "Covers X of Y stack items. Pre-selected from install verdicts."; with zero: "Nothing is pre-selected without an AI install verdict."; primary "Install N skills and continue" disabled at 0; ghost "Skip skills" always enabled. While a draft editor is open, rail Install is disabled with a visible reason ("Finish or close the skill editor first"), so consent cannot open and Create is the one primary action (R20).

### B state map
| State | Banner | Pre-selection | Notes |
| --- | --- | --- | --- |
| Loading / judging | status panel with stage checklist, `aria-live=polite`; skeleton chips and cards | none; rail "Waiting for results", Back, Skip stay enabled | first load only; on re-run the previous grid stays (existing) |
| Judged | info, mix counts | install verdicts | |
| Partly judged | warn, failed stage reason, Re-run | install verdicts kept | not-judged rows with candidates |
| No judge | warn "Not judged by AI. Showing registry order." both stages with reasons | none | all items under Not judged; search, select, install, skip, re-run, Back work |
| Registry failed (some) | info/warn + error alert listing items | install verdicts for matched items | affected items' build / skip rows carry "No registry candidates"; no install for them |
| Registry and judge failed | both alerts | none | Re-run, per-item search, Back available |
| Empty | none | none | "No skills match your stack yet" with Search skills and Write a skill by hand |
| Whole request failed | existing load-error panel, Try again, Back | n/a | unchanged |

### 3.1 Model precedence, snapshots and the run pill (findings 1-2; decisions D4, D6, D7)

Four setup operations: (1) project analysis, (2) skill judging in the normal stage, (3) agent generation, (4) guidance. For each, the pair is: the Setup pair if set, otherwise the workspace provider and its selected model. The chat picker and a tab `overrideModel` never apply (D6, D7). The Decision role stays a separate role: it governs the Decision stage of skill judging only and is never replaced by the Setup pair.

Snapshots: the pair is read once when a setup run starts (analysis, agent generation, guidance) and once when a skills request starts. A resumed run takes a fresh snapshot at its skills request start. A call that has been accepted by a provider is immutable: a later change in Settings does not alter it and affects only the next call. The result separates "Current setting" (live value) from "Pair used" (snapshot per stage).

Run pill and result (existing pill, per-stage text added; prototype states "Run pill" and "Result"): "Analysis: Anthropic / claude-sonnet-4-5; Decision stage: <Decision pair>; Normal stage: Anthropic / claude-sonnet-4-5". The attempted pair is shown for a failed stage as "attempted <pair>"; "used <pair>" only for a stage that returned. Stages that never ran show no pair.

Attribution (R14): three separate records. (a) The completed Analysis pair is immutable after analysis ends; a Setup change or a Re-run never rewrites it. (b) Per skills run, one record per stage (Decision, normal model) holding the pair attempted and the pair used. (c) The preview pair "next run will use". The run pill shows one badge per stage when the stage pairs differ and one badge when they are equal. An after-start error names the pair of the failed stage, not the live setting. A Decision pair appears only when the Decision role is configured.

Invalid stored pair (R13): the workspace fallback of D7 applies only when Setup is unset. When a pair is stored but invalid, a skills request (first run or Re-run) does not start; the previous result stays on screen; an error names the provider and the missing or stale part; no text says the workspace model was used. Recovery action by cause: provider absent from the catalogue -> "Choose a provider"; stale model, or only a provider stored -> "Choose a model"; only a model stored -> "Choose a provider"; provider not signed in -> "Sign in".

Failure surfaces: named-provider failure in analysis, agent generation and guidance appears in that step's existing error surface and names the provider and model; nothing switches silently. Judging failures degrade through the method banner (3 B). Banner rule (bug fix): the Decision pair is rendered only when the Decision stage was attempted; with "Not configured" no pair is drawn beside it.

### 3.2 Verdict and identity model (finding 3)

- An item has `outcomes[]`: zero or more install references, an optional build proposal reference, or none ("No skill needed" or "Not judged"). Install and Build can sit on one item; several Install candidates can serve one item; one Install can cover several items.
- Candidate identity is the canonical key `source/skillId`; the same name from another source is a different candidate. Proposal identity is the proposal id. Links run item to decisions; a card lists every item it covers and clicking either chip filters to that card.
- Dedupe by canonical key. A candidate must be in the run's pool to be installable; deprecated candidates are excluded from Install. An invalid verdict is discarded and the item is sent to the normal stage; "Not judged" appears only after that attempt also fails.
- Contract (R15): `item -> outcomes[]`; each outcome has `verdict`, `reason` and, for Install, `candidateId`. A draft opened from a Build outcome uses the reason of THAT Build outcome at the generation boundary, not the first outcome. Build intro copy: "No registry skill fits" only when the item has no Install outcome; otherwise "A project skill can add what the installed skill does not cover".
- Fixtures required in the prototype: dual-verdict item (Install + Build), shared candidate (one card, two covered items), same-name candidate from another source.

### 3.3 Entry points and the candidate pool (findings 4-5)

- Every detected item, whatever its verdict (Install, Build, No skill needed, Not judged, and during an outage), has "Search for <name>" (outline xs) and "Draft a skill" (ghost xs). Search opens a results region inside that row: query shown, loading, "No other results", error, and retained selections. A manual search has a submit and a clear action.
- "Draft a skill" mounts an editor in that item's row (mount key is the item id, not the group key) and keeps that item's evidence. On close, focus returns to the opener.
- Pool reachability (R16), one rule: under the "All" filter every candidate of the run pool is reachable. Item rows are the authoritative pool, and every candidate of an item is listed, not one. An "Other candidates" section exists only for candidates that no item row and no verdict section shows (each with its rejection reason or "No verdict"). Under a verdict filter the section is hidden and one line "N more candidates - Show all" resets the filter to All. No judge and Both failed have no "Other candidates" section.
- A failed search has no candidates. Candidates appear under a failed item only when retained from an earlier successful call, labelled "Results from the first search" with their provenance.

### 3.4 Parity through the real paths (finding 6)

- Re-run keeps the previous grid (no skeleton) and shows a dismissible notice "Selection was reset" directly under the header (below Back and the heading), above alerts.
- The rail shows the selected list with a remove action per entry, counts, Skip and script help. Its rail-or-bar variant follows the existing production rail.
- Install progression reuses the production rail and consent components unchanged (R17). Production gate: one approval per skill that has scripts; Install is disabled until every such skill is approved (`stack-skill-consent.component.ts:43-48`). There are no per-script approvals. The progression (consent, preview, retryable preview error, partial-install error, installed, "Continue to Project guidance", guidance navigation recovery) is listed as parity rows in the handoff. The prototype shows a reduced depiction, labelled as such: one unchecked approval per skill and Install disabled until approved.
- Back, Skip and Retry change a visible state or announce through the status region. Load-error states for analysis and workspace exist. Cards are disabled while busy. A source link renders as a link only for HTTPS URLs.

### 3.5 Skill draft semantics (finding 7; source `project-skill-draft.component.ts:21,30,43-45,52,62`)

- Slug = name lowercased, characters outside `a-z0-9-` replaced by `-`, repeated `-` collapsed, leading/trailing `-` trimmed. The destination hint and the Create guard derive from the slug of the current name: a punctuation-only name yields an empty slug and Create is disabled. Create is also disabled for blank content or while busy. While Create is busy, name and content are read-only and Create stays disabled; the submit guard and the result are bound to the submitted values.
- Destination hint: `~/.ptah/plugins/ptah-harness-<slug>/skills/<slug>/SKILL.md`. "Created: <path>" is shown only after the call returns a path, derived from the submitted values, not the current form.
- Generation results are ignored if the editor was closed or replaced (revision token). Generation with empty output and "no model available" are manual-fallback triggers (new states "Empty output" and "No model"); the draft keeps the name and evidence. Edits are kept on any error.
- **Preview before creation (R23, user-requested D11; labels and layout lane-proposed).** "Preview draft" opens the draft in a preview view in the row: proposed name, destination hint (above), and the generated SKILL.md content rendered readable (headings, lists, code as formatted text, `max-height` scroll region, focusable `tabindex=0` with a label). An "Edit" toggle swaps the rendered content for the name, description and content fields (same fields, same R18 protection, kept across toggles). States reuse the manual-fallback states above inside the preview: loading (`role=status` "Generating draft..."), generation failed, empty output, no model; each keeps name and evidence and offers Edit and "Try again". The primary "Create skill" exists only inside the preview and follows the Create guard; "Cancel" closes it and returns focus to the opener. Nothing is written before "Create skill" (req 5.3). R20: rail Install stays disabled while the preview is open. Draft protection (R18): any action that would replace a draft with unsaved edits asks first (no silent loss): another row's editor, "Write a skill by hand", a per-item search that closes the editor, and a generation retry.

### 3.6 Coverage, filters and status words (finding 10)

- One coverage rule for strip, chips and rail (R19): an item is covered when at least one selected skill maps to it, whatever its origin (judge, registry or manual search). A chip of an item whose original search failed and that a manual result covers shows both facts ("Covered - original search failed"). A card rendered more than once keeps one canonical selection key and gets a unique description id per rendering. The covered count derives from SELECTED coverage (existing semantics); the strip keeps score order and highlights the active item. More than 12 chips show a "Show more" control and focus moves to the first new chip. Each verdict filter has its own empty text ("No items with this verdict").
- Clicking a covered item shows every card that covers it (item links), not only cards whose primary verdict is that item.
- Verdict filter counting unit is the item ("12 items"). Builds read "2 proposals covering 3 items".
- Stage status words (used, failed, skipped) in the method banner are the only badge text and are not `aria-hidden`.

## 4. Components and tokens (all existing unless marked proposed)

| Element | Component or token | Source |
| --- | --- | --- |
| Buttons (primary, outline, ghost, link, xs/sm/md) | `ptahButton`; heights `--ptah-control-h-xs/sm/md` 1.5/2/2.5rem; edge `--ptah-control-edge`; disabled `--ptah-btn-disabled-opacity` | `ptah-tokens.css:32-34,81-90,93-170` |
| Badges | `ptahBadge` size `xs` (16 px); `tone` neutral, accent, info, ok, warn, err; `appearance` soft or outline (outline is an appearance, not a tone); height `--ptah-badge-h-xs` | `badge/badge.types.ts:3-9`, `ptah-tokens.css:283` |
| Inputs | `ptahInput` / field tokens `--ptah-field-*` | `ptah-tokens.css:177-235` |
| Cards | pick card classes `--glass-radius-inner`, `--surface-1`, `--ptah-border-color`, selected `color-mix(--p 70%)` | `skill-pick-card.component.html:1-8` |
| Strip card | radius 22px, border `base-300`, padding `--ptah-surface-pad` | `stack-coverage-strip.component.html:1-4` |
| Gaps | `--ptah-gap-heading` 0.75rem, `--ptah-gap-field` 1rem, `--ptah-gap-controls` 0.5rem, `--ptah-gap-label` 0.25rem | `ptah-tokens.css:20-28` |
| Type | page title 1.25/1.75 600, section 1/1.5 600, group 0.875/1.25 600, body 0.875/1.25, hint 0.75/1rem | `ptah-tokens.css:48-71` |
| State ink | `--ptah-state-ok/warn/err/info` = `--state-ink-done/need/err/run` per theme | `ptah-tokens.css:276-279`, `tailwind.config.js:316-406` |
| Focus | 2px ring, offset 2px, `--ptah-focus-ring-color` | `ptah-tokens.css:257-259` |
| Muted text | `--bcm` | `styles.css`, theme values |
New: only a `reason` block (border-left 2px `--ptah-control-edge`, padding-left `--ptah-space-2`, 0.8125rem) and a `vrow` list-row (card pattern at row size). No new colour, radius or font.

## 5. Interaction and keyboard

- All new controls are native buttons, inputs, `details`, checkboxes: tab order follows DOM order = visual order. Verdict and coverage filters are toggle buttons (`aria-pressed`). Chips carry `aria-label` "<name>, <kind>. Registry: ... Verdict: ..." so the two marks are both announced.
- Opening the preview moves focus to its heading (the Name field when opened by "Write a skill by hand" or after Edit); closing (Cancel or after creation) returns focus to the row's "Preview draft" button (the opener). The expand controls are native buttons with `aria-expanded` and a per-skill accessible name (item 6); the preview Edit toggle is a button with `aria-pressed`. Creation, generation failure and load completion are announced through a polite status region.
- Setup picker: Close returns focus to the cell; the analyze link opens Settings and focuses the Setup cell. Selection toggle keeps focus on the checkbox.
- Verdict is shown as glyph + word, never colour alone; the existing strip maps no match and failed to the same warning glyph, distinguished by text (`stack-coverage-strip.component.ts:63`); the prototype's separate disc, ring and diamond shapes are a PROPOSED change.
- `prefers-reduced-motion`: skeleton shimmer and spinner stop.

## 6. Responsive widths (single window; container-based)

- >=761 px container: Settings uses the existing two-column `background-layout`. Skills step (R22): full window width, no max-width column, normal page padding; grid `repeat(auto-fill, minmax(17rem,1fr))` with compact cards, so 3 columns at 1100 and 4 or more at >=1400. Measurable target: at 1100 px wide and 1000 px high, 8 Install skills and 3 Build proposals fit in about 1.5 window heights (about 1500 px of page); the prototype records the measured value.
- 420-720: one or two columns; role rows stack at <=560 container (proposed; the existing `.consumer-role` row stacks at `@container (max-width: 400px)`, two-column layout at `min-width: 761px`, `provider-consumer-assignments.component.ts:515,520`; the prototype's `.role` class is local CSS); `vrow` (proposed local class) stacks actions under text at <=520 (verified at 420 px in `skills-both-failed-narrow-dark.png`); chips wrap.
- 761-1400: the grid fills the width; >=1400: columns grow with width, card minimum stays 17rem.
- Sticky rail wraps to two lines at narrow width.

## 7. Accessibility: contrast (WCAG 2.2 AA used as the working criterion, lane-proposed; no project statement found. 4.5:1 text, 3:1 non-text)

Measured from theme hex values in `tailwind.config.js` (`ptah-glass`, `ptah-glass-light`); surface-1 = mix(base-100, base-200 12%) per `design-tokens.spec.ts`; badge = ink on 14% tint over base-100.

| Pair | Dark | Light |
| --- | --- | --- |
| body text on base-100 / surface-1 | 15.71 / 15.55 | 15.39 / 15.25 |
| muted (`--bcm`) on base-100 / surface-1 / base-300 | 13.07 / 12.94 / 10.13 | 6.49 / 6.43 / 5.25 |
| primary button text on primary | 9.88 | 6.16 |
| ink info (run) on base-100 / badge tint / surface-1 | 9.19 / 6.94 / 9.10 | 7.23 / 5.79 / 7.17 |
| ink warn (need) on base-100 / badge tint / surface-1 | 9.77 / 7.36 / 9.67 | 5.69 / 4.65 / 5.64 |
| ink error on base-100 / badge tint / surface-1 | 8.43 / 6.50 / 8.34 | 6.90 / 5.43 / 6.84 |
| ink ok (done) on base-100 / badge tint / surface-1 | 10.61 / 7.84 / 10.50 | 6.63 / 5.37 / 6.58 |
| control edge vs base-100 (non-text) | 8.19 | 3.72 |
| primary as selected border vs base-100 (non-text) | 9.50 | 5.96 |
All text pairs >= 4.5, non-text >= 3. Lowest: light warn badge 4.65. Disabled controls exempt (WCAG 1.4.3). Glass blur backgrounds are not measured here; the existing scrim spec covers them. Link text uses `--ptah-state-info` ink with underline.

## 8. Copy (lane-proposed, for the docs phase)

Banner titles as in section 3; error strings name provider and missing part ("OpenAI no longer offers gpt-4.1-legacy. Setup runs are blocked until you choose a model."). Stage categories exactly: unavailable, timed out, invalid output, provider error. No assets are required (glyph characters and existing icons only); no `design-assets-inventory.md`.

## 9. Parity decisions

All `keep` rows stay reachable: load/resume/error panels, skeletons, coverage strip (filter, overflow, identity), summary-source notice, warning and search-failure alerts, action error, score ordering within a section, empty panel, pick card (source link, key, installed badge, reinstall), Covers and evidence, toggle clears consent, manual search incl. retained selections, per-item "Search for <name>", draft on request ("Draft a skill"), draft path and editable fields, rail consent flow, Skip, Back, Re-run. The team builder reuses the shared component: with no judge result it renders the existing view (judge sections appear only when a verdict list is present; implementer must keep the team-builder inputs optional). Three approved removals are kept unchanged. Replaced (approved, D5): select-all default becomes install-verdict pre-selection; automatic per-item draft forms become Build rows; fixed-template content becomes generated content with the manual fallback.

## 10. Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Group verdict sections rather than inline badge on one flat list | flat list with badges; sections | req 3.2 needs one decision to cover several items; build must be a list not forms | yes |
| Collapse "No skill needed" and "Other candidates" | expanded | keeps focus on actions; still reachable and counted | yes |
| Unset shows the workspace pair in the cell | empty cell "Not set" | D7 says workspace applies; user sees the effective value | yes |

## 11. Open questions (recommendation each)

1. Setup row position: first or last? Recommend first (broadest role).
2. Run pill per-stage text: specified in 3.1 and drawn as prototype states "Run pill" and "Result"; the optional layout stays open for Gate 1.7.
3. Pre-selection when an install candidate is already installed: recommend selected (reinstall note stays), matching "pre-select install verdicts only".
4. Electron-rendered visual check: not done in this phase (headless browser only); recommend the visual-review phase repeats it in Electron.

## 12. Implementation handoff

- A1: add `setup` to `BackgroundConsumerId` / row derivation in `provider-consumer-rows.ts` and a row in `provider-consumer-assignments.component.ts`; reuse the popover picker and readiness alerts; deep link param `initialEditingConsumerId = 'setup'`.
- Route: Setup is not in the current consumer id list (`provider-consumer-rows.ts:19`); extend `BackgroundConsumerId`, row derivation and the `initialEditingConsumerId` deep link handling, because adding a row alone does not activate the deep link. Persistence: choose storage scope (global or per workspace) in the implementation plan and prove survival across restart.
- Fixtures: the onboarding fixture response is TYPED against the shared recommendation RPC result type (decisions.md D8); a type error is the compatibility proof. Scoped parity proof: the GAP rows in `parity-inventory.md` and the team builder specs; no E2E is implied.
- A2: add a read-only card to `analyze-workspace.page.ts` that reads the same signal as the Setup row; disable Start when invalid.
- B: new presentational components in `proposal/` (one-line method banner, compact install card with expand control per R22, verdict section list, build row with "Preview draft" and a preview view that wraps the `project-skill-draft.component.ts` fields behind an Edit toggle (R23; the opener button receives focus on close), not-judged row); extend `skill-pick-card` with an optional reason input; chip suffix input on the coverage strip; keep all existing outputs. Verdict data comes from the recommend result; the view model in `prototype/index.html` (`model()`) shows the fields needed: per item `outcomes[]` (each with `verdict`, `reason`, and for Install `candidateId`; R15), `by` (decision | normal | none), `registry` status, per-stage `status` + reason category, rejected candidates with reasons.
- Boundary proof (requirements 2.3, 2.5): a test shows that a conflicting chat-tab `overrideModel` does not change the pair of any setup operation.
- Open item for the architect: the storage scope of the Setup setting (global or per workspace) and the restart proof; the spec does not decide them.
- Deferred to the Electron visual review: shipped consent component, keyboard traversal, live sticky rail, forced-colors.
- After template changes run the `typecheck-templates` target (project rule, CLAUDE.md).

## 13. Rule provenance (finding 11)

| Rule | Tag |
| --- | --- |
| Settings owns Setup, Analyze shows and links; precedence, workspace fallback, separate Decision stage; typed fixture; legacy team builder; three removals; independent registry fact; stage reason categories | `user-requested` (D3, D4, D6, D7, D5, D8; requirements 1.6, 2.3-2.5, 2.8, 3.7-3.9, 5.1, 5.7, 6.1-6.2) |
| Electron first; template verification; reuse of shared UI owners and focus styling | `project-rule` (`CLAUDE.md`) |
| Status as text or glyph, not colour alone; one primary action per surface | `project-rule` (ui-ux-designer skill). Scope: while a draft editor is open, "Create skill" is the only primary on screen; rail "Install N skills and continue" is disabled with a visible reason until the editor closes (R20). |
| Setup row first; verdict sections and order; disclosures; per-item filter counts and build count per proposal; Start disabled and the explicit "Use workspace model" button; atomic pair save with Undo restore; one editor at a time with a confirm before replacing edits; zero-count filters hidden; pool reachability rule and "Show all" line; confirm-before-replacement for every draft-replacing action; Navigation and invalid-pair behavior are requirements, only their controls (Choose a provider / Choose a model / Sign in, "Show all") are proposals; Setup placement; atomic save and Undo; custom widths; run-pill layout; placeholders; 560/520 container widths; shape-distinct strip glyphs; section 8 copy and the empty manual draft; per-stage run pill text; WCAG 2.2 AA as working criterion | `lane-proposed`, pending Gate 1.7 |
| Balanced model tier badge | `lane-proposed` placeholder; not a claim for arbitrary providers or models unless derived from model metadata |
| R22 full-width dense layout, compact cards, one-line banner, two-line strip | `user-requested` intent (D11: "design is so narrow ... scroll a lot"); `lane-proposed` numbers (17rem minimum, 1.5 heights, 3 and 4 columns, two lines, 1400 px breakpoint) and the expand control label |
| R23 "Preview draft" before creation, Edit toggle, Create only inside the preview | `user-requested` intent (D11: view custom skills before creation); `lane-proposed` labels ("Preview draft", "Edit"), view layout and placeholder states |
| Timeout example values in fixtures | fixture copy only; the 75 s overall ceiling is `user-requested` (requirement 1.5); no internal timeout is fixed here |

## Deviations from handoff notes

None. One addition beyond the notes: the confirm-before-replacing-edits rule in 3.5 and the primary-action scope in section 13, both from review finding 11.

## Revision log

1. Setup pair: single stored pair, atomic commit, Undo, derived invalid cases, readiness action, A2 guard for all cases, storage scope deferred to plan (A1, A2, handoff).
2. Precedence for four operations, Decision role distinct, snapshots, per-stage run pill, failure surfaces, banner pair rule (3.1).
3. Verdict and identity model with outcomes, canonical key, dedupe, deprecated, invalid verdict routing, three fixtures (3.2).
4. Per-item search and draft for every item, results region, editor mount by item id, manual search flow (3.3).
5. Full candidate pool in partial, no-judge and both-failed; failed-search provenance rule (3.3).
6. Re-run grid retention and reset notice, rail contents, install progression reuse, Back/Skip/Retry, load errors, busy, HTTPS link (3.4).
7. Real slug function and Create guard, path after return, stale-result token, empty-output and no-model states, kept edits, focus (3.5).
8. Handoff: typed fixture per D8, scoped parity proof, route extension (section 12).
9. Badge tone/appearance, container breakpoints, strip glyphs marked proposed, alert names illustrative, deep link extension (sections 4, 5, 6, 12).
10. Selected-coverage count, score order, overflow, per-filter empty text, item links, unit labels, status words not aria-hidden (3.6).
11. Provenance table, WCAG criterion relabelled, balanced tier withdrawn as claim, primary-action scope (section 13, heading 7).
Revision 2, finding 13: R13 invalid Setup pair blocks a skills request and recovery by cause (3.1, A2).
Finding 14: R14 three separate pair records, per-stage badges, stage-named errors (3.1).
Finding 15: R15 `item -> outcomes[]` contract, Build reason at generation, Build intro copy (3.2, section 12).
Finding 16: R16 one pool reachability rule, "Other candidates" and "Show all" (item 10, 3.3).
Finding 17: R17 production consent gate, one approval per skill, reduced-depiction label, notice position (3.4).
Finding 18: R18 draft protection, busy read-only, Created path from submitted values (items 7, 3.5).
Finding 19: R19 one coverage rule, "Covered - original search failed", unique description ids (3.6).
Finding 20: R20 ledger completed, rail Install disabled while the editor is open (item 12, section 13).
Finding 21: R21 capture URLs: README only, no spec change; handoff items added for boundary proof, storage/restart, deferred Electron checks (section 12).
Revision 3 (D11), R22: full-width dense skills step, compact cards with expand control, one-line banner, two-line strip, wider grid (item B intro, items 3, 4, 6, section 6, section 13).
R23: "Preview draft" replaces "Create skill...", preview view with Edit toggle and fallback states, Create only inside, focus returns to opener (item 7, 3.5, section 5 focus line, section 12, section 13).

## 14. Binding rules from review round 2 (user decision D13)

These rules close findings 22-32 of `design-spec-review.md`, Round 2. They win over the prototype script
and over any earlier sentence of this spec that conflicts. The prototype was not revised for them.

- **F22 grid.** Install grid `repeat(auto-fill, minmax(14.5rem, 1fr))`: 4 columns at 1100 px, 5 at 1440 px
  (replaces "17rem, 3 columns at 1100" in section 6). Target: at 1100 x 1000 all Install cards and Build
  proposals of the reference fixture (8 + 3) end within about 1500 px of product height.
- **F23 strip and banner.** The coverage strip shows at most two lines of chips at every width (the limit
  is measured, not a fixed chip count); "Show N more" moves focus to the FIRST newly shown chip. The
  collapsed banner of the no-judge and partial states shows the count "N not judged" in its one line.
- **F24 full text.** Every compact Install card AND every Build row has the same native "More" button
  that reveals the full description, reasons, covers and script note in place. Reading the full reason
  never needs "Preview draft". A card name wraps on word or hyphen boundaries, never by letter; the More
  button stays inside the card at every width and in every state.
- **F25 preview identity.** The frontmatter `name` of the generated SKILL.md equals the proposed skill
  name and the slug in the destination path. After a successful create, the preview closes, focus
  returns to the row's opener, the row shows "Created: <path>", and the same draft cannot be created
  twice.
- **F26 attribution.** Failure messages and stage badges read only recorded stage records (R14). A stage
  with no record shows no pair. Loading and empty states show no "used" pair. A later Setup change never
  alters the pair shown for a completed or failed run.
- **F27 guard on every start.** The invalid-pair guard (R13) runs before EVERY skills request start:
  first load, Re-run and "Try again" after a whole-request failure. When blocked and no earlier result
  exists, the block message does not mention a previous result and no loading state is shown.
- **F28 hidden count.** "N more candidates - Show all" counts every distinct candidate of the run pool
  that the active filter hides, not only the "Other candidates" section.
- **F29 one primary flow.** Consent and a draft view are mutually exclusive in both orders: opening one
  while the other is open is blocked with a visible reason. Any change of the selection after approvals
  were given discards the preview and the approvals (existing production behavior, parity rows 42, 59).
- **F30 draft stays reachable.** While a draft is open, a filter change keeps the draft row and its
  Cancel control visible (the row is pinned in every filter). While Create is in flight no action can
  replace or close the draft, and the view mode does not change; the result always reaches the user.
- **F31.** Prototype documentation only; no product rule.
- **F32 linked reasons.** A Build proposal that covers several stack items shows the reason of each
  linked Build outcome and passes all of them to draft generation. A Build proposal next to an Install
  outcome for the same item shows the intro "A project skill can add what the installed skill does not
  cover".
- **Handoff addition.** The plan carries the full pair and chat-picker test matrix of
  `task-description.md:167-180`, not only the conflicting tab override.

