# Design spec re-review (round 1) - TASK_2026_2285_304a

Scope: my 2 Blocking, 8 Serious, the Parity gaps table, decisions 16-23, new removals/contradictions. Read-only; prototype not re-rendered by me (markup + 2 PNGs read: `lanes-reorder-1600x900-dark.png`, `lanes-1600x900-light.png`).

## Verdict

**REVISE** - one Serious item is open and it is small: the spec's kind-badge rule (decision 16) contradicts the approved prototype (S-1 below). Everything else is resolved.

## Earlier items

| Id | Resolved | Evidence |
|---|---|---|
| Blocking 1 (drag) | yes | Spec "Reorder mode": `GripVertical` handle, `aria-roledescription="sortable"`, reuses `ptah-lane-order-list`, tests to carry. Prototype `index.html:88-91, 626, 696` (grip, `draggable`, dragstart); `lanes-reorder-1600x900-dark.png` shows grip + up/down in each Order cell and "Done". |
| Blocking 2 (cross-group semantics) | yes | Decision 18 / spec "Reorder mode": one flat list in global order, no groups while on, `aria-disabled` at ends, focus stays, `aria-live` "moved to position N", returns to grouped view. Screenshot matches (flat list, Ollama as 1). |
| Serious 1 (Copilot switch) | yes in spec | Spec "Expanded detail" left column: Copilot labelled `switch` "Auto-approve", write + Undo (decision 19). Prototype does not draw it (Copilot is only an Add-more card), see Minor 1. |
| Serious 2 (All capabilities, U-10/U-14) | yes | Spec "Expanded detail" right column: `ptah-disclosure` "All capabilities", read-only, no popover/kebab; Add-more card "Details" disclosure. Prototype: `<details class="caps">` (`:663`), "Details" on cards (screenshot). Not a new removal (decision 20 keeps it). |
| Serious 3 (light status ink) | yes | Spec Accessibility: all status text uses `base-content`, ink on icon/border only. Prototype light screenshot: "Installed", "Needs API key" text in base colour, icon coloured. |
| Serious 4 (form-section cap, action slot) | yes | Spec "Section pattern": `ptah-form-section [wide]` (`form-section.component.ts:124`) per decision 21; "Row pattern" `[action]` slot (2 matches). |
| Serious 5 (Advanced items) | yes | Spec "Unchanged capabilities (keep)": A-5/A-6/A-9, A-1, A-3, A-32, A-30, A-34/A-35, P-64/P-65, P-10. |
| Serious 6 (tools states) | yes | Spec "Claude Code tools" States: skeleton, load error + Retry fail-closed, unverified-policy alert, Undo, focus after failed write. |
| Serious 7 (popover size()) | yes | Spec "Popover cap implementation": `size()` in `floating-ui.service.ts`, `capToViewport` default true in `native-popover` only, dropdown/autocomplete unchanged, specs to re-check, bestFit fallback, min 8rem. |
| Serious 8 (kebab duplicates) | yes | Spec "Row": kebab = Test (+ Sign in when key needed); footer actions not repeated; no Reset on Ptah rows. Prototype `kebab` per CHECKS item 6. |
| Parity: P-8/M-1 | yes | Blocking 1. |
| Parity: P-66 | yes | Serious 1. |
| Parity: P-29/50/53/M-6 | yes | Serious 2. |
| Parity: U-8/10/14 | yes | Add-more "Details". |
| Parity: P-7 | yes | Card: "+N" overflow chip, empty text. |
| Parity: P-10, P-15 | yes | States: "Partial read error" row, host slot kept. |
| Parity: P-13 | yes | Card: "No CLI agent installed yet. Use Add more below." |
| Parity: P-1 | yes | Card: "Count semantics (P-1)": installed lanes only; ring uses the same 7. |
| Parity: P-9 | yes | Add-more strip header icon-only `RefreshCw`, one label "Re-detect CLIs"; prototype has the icon in the strip header (screenshot). |
| Parity: P-45 | yes | Detail: "Tier models: n of 3 set / loading" + lines; prototype "3 of 3 set" (CHECKS 7). |
| Parity: A-1, A-3, A-5, A-6, A-9, A-30, A-32, A-34, A-35, P-64, P-65 | yes | "Unchanged capabilities (keep)" rows. |
| Parity: A-22, A-26, A-27 | yes | Serious 6. |

Decisions in the spec: 16 (Kind badges; but see S-1), 17 (Group gap), 18 (Reorder), 19, 20, 21, 22, 23 all present (Decisions table + sections). In the prototype: 16 (`:82-83`, badges visible in both screenshots), 17 (`:87` `tr.grp.second th{padding-top:1.75rem}`; light screenshot shows a clear band above "Ptah CLI instances"), 18, 20, 23 present.

Removals: the spec lists exactly R-1..R-3 (approved, decision 15). No new removal found. R-3 text now notes drag and up/down stay.

## Still open

1. **S-1 (Serious): kind-badge rule in the spec contradicts the prototype and weakly meets decision 16.** Spec "Kind badges": `kind-cli` = `info/50` border + `info/10` fill, `kind-ptah` = `accent/50` border + `accent/10` fill, **text `base-content` in both**. Prototype `index.html:82-83`: text and border use `--info` (blue) and a new `--gold` (#d4af37 dark / #8a6500 light); screenshots show coloured text. With identical text colour and 10% fills the two badges differ only by a faint border, and in the dark theme the accent is the same lavender family as the info blue, so the user's "different colors" request may not be visible. Required change (pick one, state it in the spec): (a) adopt the prototype: `kind-cli` text+border = `info`, `kind-ptah` text+border = a named warm/gold token that exists in `tailwind.config.js` (`warning` or the theme's gold; do not add a token unless needed), light-theme text must pass 4.5:1 or use the darker variant; update the Accessibility table row; or (b) keep `base-content` text and change the prototype to match, with fills strong enough to read as two colours. Option (a) matches what the user approved on screen.

## New issues (all Minor, none block)

1. Gap size: decision 17 and spec say about 1rem (`--ptah-gap-field`); prototype uses `padding-top:1.75rem` (`:87`). Make the spec value 1.75rem or the prototype 1rem; the approved screenshot shows 1.75rem.
2. Prototype still uses `disabled` on group switches (`data-gs ... saving?'disabled'`) and has no `aria-disabled` / `aria-roledescription="sortable"`; the spec requires them. Implementation follows the spec; note it in CHECKS so nobody copies the prototype.
3. Prototype has no installed Copilot row, so the "Auto-approve" switch (decision 19) is not visible in it. Spec only.
4. Prototype Reorder list shows the expanded Claude detail inside the flat list and the disabled Cursor row at the end without a grip. Spec does not say whether details collapse and where disabled lanes sit in Reorder mode. Add one line: "details collapse when Reorder starts; disabled lanes are listed after enabled ones and have no grip".
5. The 800x600 layout was not re-rendered after round 1 (accepted open point; not counted).
