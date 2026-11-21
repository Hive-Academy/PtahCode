# Design spec review - TASK_2026_2285_304a

Reviewed: `design-spec.md`, `prototype/index.html` (762 lines), `prototype/CHECKS.md`, 8 PNGs, against `decisions.md`, `parity-inventory.md`, `evidence/`. Source primitives read in `libs/frontend/ui/src/lib/`. Read-only; nothing run.

## Verdict

**REVISE.** Decision 14 is not met (no drag reorder in the spec or the prototype), and several parity items, one contrast rule and one primitive constraint need a spec change before implementation.

## Blocking

1. **Decision 14: drag reorder is missing.** `design-spec.md` "Providers > Lanes" > States > Reorder says "up/down (`ChevronUp/Down`) stacked inside the Order column". Prototype `index.html:164-166, 609, 681` has only up/down buttons. Parity P-8 says drag lives only in `lane-order-list`. The pencil popover is removed (R-3), so drag disappears. Required change: the spec must say that Reorder mode keeps drag (pointer + the existing `ptah-lane-order-list` drag behaviour or an equivalent grip handle with `GripVertical`, `aria-roledescription`, keyboard alternative = the up/down buttons). The prototype must show a grip handle in the Order cell in Reorder mode. Spec test list must carry the existing drag test (`agent-orchestration-config.component.spec.ts:~532`, `lane-order-list.component.spec.ts`).
2. **Reorder semantics across two groups are undefined and the prototype is misleading.** Global numbers span both groups (decision 6), but rows are grouped. Prototype `index.html:681` swaps `ord` with the neighbour in the *global* list. Pressing "Move Codex down" swaps numbers with Ollama (a Ptah row in the other group). Codex stays in place and its number changes to 2, so nothing visibly moves. Required change: define one rule in the spec. Either (a) Up/Down move within the group and the numbers are written to the global list preserving the other group's slots, or (b) reorder is a single flat list. State disabled states at the list ends (P-21 has them; the prototype does not disable them), the focus rule after a move (P-21 `LanesTableDeleteFocus`-style guard) and the `aria-live` announcement ("Codex moved to position 2").

## Serious

1. **Copilot auto-approve toggle has no place (parity P-66, `keep`).** It lived inside the "Native CLI behavior / Permission" popover. Decision 13 turns that popover into inline read-only text, but the toggle is a real write (`saveSettings({orchestration:{copilotAutoApprove}})`, with Undo). Required change: add the toggle to the Copilot detail as a labelled `switch` row, or say it is removed and add it to `## Proposed Removals`. Also add "Copilot" to the detail footer/facts table in "Expanded detail".
2. **"All capabilities" (P-29, P-50, P-53, M-6) is silently dropped.** The spec keeps only five inline facts (Messaging, Permission, Network, MCP, Limit). The full capability groups, lines and reasons (`cliCapabilityView`, instance "All capabilities" popover) have no place, and the kebab entry is removed ("CLI kebab trimmed to Test / Sign in / Reset"). M-6 says "kebab item opens the capabilities". Required change: either add an inline "All capabilities" disclosure in the detail (read-only `dl`, no popover) or add it as R-4. Same for U-10/U-14 (capabilities and Info of a not-installed CLI): the Add-more card has only Install (spec "Add more CLI agents strip"; prototype `index.html:668`).
3. **Light-theme status text uses the failing ink colour in the prototype, against the spec's own rule.** Spec Accessibility says ok/warn text at 3.97:1 is icon-only and "status TEXT uses `base-content`". Prototype `index.html:591-592` colours the whole status line (`class="l1 ok"` / `"l1 warnc"` with the text span inside), `.ok{color:var(--ok)}` (line 99) and `.badge.warn` text (line 82, "Needs attention", warn chips). In `lanes-1600x900-light.png` "Installed" and "Needs API key" are green/orange text on the light surface. Required change: fix the prototype (ink on the icon, `--bc` on text, badge text in `base-content` with a tinted border), or darken the light inks to at least 4.5:1 and update the contrast table. Re-measure with the real oklch tokens as the spec says. The Test result text (`.ok` at line 685) has the same problem.
4. **`form-section` cannot produce the specified Advanced layout.** Spec "Section pattern" says grid `aside 15rem | fields 1fr`. The primitive is `grid-cols-[var(--ptah-form-section-aside-w)_minmax(0,var(--ptah-form-section-fields-max-w))]` with the fields capped at 36rem (`form-section.component.ts:53`, token `ptah-tokens.css:502`) unless `wide`. The 1600px prototype screenshots show controls at the far right edge of a ~1500px card. The primitive cannot do that. The spec lists only an `icon` input as the change. Required change: say which it is: uncap the fields column (name the token/change and the effect on every other form-section user), or keep 36rem and redraw the prototype. Also the `size-8` fixed action slot (F4) needs a `setting-row` change that is not listed (`setting-row.component.ts` has `[status]`/`[meta]` slots only).
5. **Parity: Advanced capabilities with no place in the spec or prototype.** Spec "Advanced" covers Membership / Agent behaviour / Output style / MCP and "others" with a one-line pattern. Missing: A-5 Account rows (name, email), A-6 Manage Membership, A-9 Log out with inline confirm (the prototype shows only the unlicensed "needs attention" state; the licensed state is never designed), A-1 overview band and Setup segment, A-32 Run onboarding again / Check Claude Code, A-34/A-35 Output style notices and CLI-parity section, A-30 Fine-tuning disclosures, A-3 import inline confirm location. Required change: add a row per item (location + control form + icon), or state "unchanged, only `--ptah-card-pad` applies" for each by name. The licensed-state variant of the Membership section must be drawn or specified.
6. **Claude tools: loading, error and undo states are not specified (A-22, A-26, A-27).** The spec describes only the populated state. A-26 is fail-closed (load / unverified policy error + Retry); A-27 is Undo + focus keeping after a failed write. Decision 9 adds per-id sequential writes, so partial failure is covered, but not the load states. Required change: add skeleton, load error + Retry (`role="alert"`), "unverified policy" error, and keep Undo on single toggles.
7. **Popover cap needs a change to a shared service that the spec treats as a one-line rule.** `floating-ui.service.ts` has `flip`, `shift`, `offset`, `autoUpdate` and no `size()` middleware (verified by import list, lines 28-40). The spec names the file, so the change is listed, but the service's `.spec` and every consumer (`native-popover`, `dropdown`, `autocomplete`) are affected, and `native-popover.component.ts:131` sets `max-height:none` in one mode. Required change: add an explicit "opt-in input `capToViewport`" or state the default flips for all consumers, and list the specs/consumers to re-check. Also say how the cap behaves when the trigger is within 8px of the edge at 800x600 (flip with no room on either side).
8. **Detail footer and kebab duplicate actions on Ptah rows (decision 13 intent).** Spec "Row" says the Ptah kebab = Test, Edit tiers, Edit, Reset, Delete. The detail footer (prototype `index.html:643-645`) also has Test, Edit tiers, Edit, Delete. The spec's own decision row says "CLI kebab trimmed ... other actions are in detail footer", but the Ptah kebab is not trimmed. Required change: trim the Ptah kebab to the same rule (Test, plus Delete if needed), or state why the duplicates stay. Also define "Reset" on a Ptah row: no per-row default exists (P-59 is group-level), and the prototype's Ptah detail has no Reset.

## Minor

1. Token `--ptah-card-pad` (1.25rem) duplicates the existing `--ptah-card-padding-lg: 1.25rem` (`ptah-tokens.css:420`). Reuse it, or alias with one line. Spec "Tokens" says the unused `--ptah-surface-pad` (line 28) is replaced; say whether it is deleted or aliased. `--ptah-popover-max-h` and `--ptah-modal-max-h` have no existing equivalent (justified). `--ptah-lane-row-h` is justified by P18 but the prototype does not use it or the other two (0 matches for `lane-row-h|popover-max-h|modal-max-h`; the modal uses a literal `calc(100dvh - 2rem)` at line 225), so these tokens are unvalidated by the prototype.
2. Count semantics (parity P-1 note): the spec never says what the "Lanes" badge counts. Prototype `index.html:657` counts 7 (installed only) while "Add more" holds 3 more. State "installed lanes only" and keep the ring "6 of 7 enabled" consistent.
3. Max concurrent: prototype `index.html:375` uses `max="20"`; the source range is 1-100 (parity addendum P-6). Fix the prototype and write the range in the spec.
4. Account row: the prototype shows "Account" for every CLI row (Codex, Antigravity, Grok: "Main login"). Source shows it for Claude only (P-44). State "Claude only" in spec "Expanded detail" and fix the sample data.
5. Re-detect also belongs in the "Add more" strip (P-9 new location). The spec puts it only in the group header; the prototype strip (`index.html:383-390`) has none. Label differs: spec "Re-detect CLIs", prototype "Re-detect CLI agents". Pick one.
6. Order chips overflow ("+N", P-7) and empty text ("No CLI agent installed yet", P-13 pointing to the strip) are not specified; partial-read error row with Retry (P-10) and the host read-state slot (P-15) are not specified either (the spec's Error state is full-card only).
7. Spec detail "Tier models": parity P-45 requires "n of 3 set" / "loading" + one line per tier. Prototype shows "3 tiers mapped" only.
8. Icon-only controls without a tooltip in the prototype: row expander (`index.html:617`), popover "Close" (`:566, :688`), "Clear filter" (`:474`). They have `aria-label` but no `.tip`. The spec rule says tooltip on hover and focus for every icon-only button. The real `ptahTooltip` (`tooltipOnFocus` default true) covers it; say so in the spec.
9. Model button text is truncated with ellipsis (`claude-sonnet-5-5-…`, `lanes-1600x900-dark.png` Antigravity row) and the tooltip says only "Change model and effort". Add the full id to the tooltip/`title`.
10. Group switches are `disabled` while saving (`index.html:~735`). A disabled button drops keyboard focus. Use `aria-disabled="true"` and keep focus, then announce. The prototype tries to re-focus after the loop; the spec does not require it.
11. Order cell: `<span aria-label="Order">` and `aria-label="Not in order"` on a plain span (`index.html:608`) are not exposed by most screen readers. Use visually hidden text or `aria-hidden` plus a column header.
12. Sticky summary: spec says `sticky top-0`; prototype uses `top:calc(-1 * var(--ptah-page-gutter))` (`:253`) because the page owns the padding. The spec's F37 ("single scroll/padding owner") has to land first or the spec value is wrong. State the dependency.
13. Synced-skills group tag is "Hidden by default" in the prototype and "Off by default where applicable" in the spec. Align.
14. Light screenshot `lanes-1600x900-light.png` still shows the old labels "Permission modes" / "Network" (CHECKS.md says they were renamed; it was taken before the rename). Not a design defect.
15. Spec Ptah group header at 577px: two xs selects, reset and Add in one header. CHECKS says "group header controls wrap" but no screenshot shows the Ptah group header or the Add-more strip at 800x600.
16. `Info` "unsupported combination" is a focusable button with a tooltip but no `aria-describedby`/`role`; the prototype's `aria-label` repeats the full sentence. Fine, but the same text is announced twice if the select also carries a described-by.

## Parity gaps

Capabilities with decision `keep` or `move` that have no place (or an incomplete place) in the spec:

| Item | Gap |
|---|---|
| P-8 / M-1 (decision 14) | Drag reorder: no place (Blocking 1) |
| P-66 | Copilot auto-approve toggle: no place (Serious 1) |
| P-29, P-50, P-53, M-6 | "All capabilities" full view (Serious 2) |
| U-8, U-10, U-14 | Info / capabilities of a not-installed CLI: card has only Install |
| P-7 | Order chips "+N" overflow and empty text |
| P-10, P-15 | Partial read error row + host read-state slot |
| P-13 | Empty-state text pointing to the strip |
| P-1 | Count semantics |
| P-9 | Re-detect in the Add-more strip |
| P-45 | Tier models per-tier lines |
| A-1 | Overview instrument band, Setup segment |
| A-3 | Import inline confirm location |
| A-5, A-6, A-9 | Account rows, Manage Membership, Log out (licensed state) |
| A-22, A-26, A-27 | Tools loading/error/undo states |
| A-30, A-32, A-34, A-35 | Fine-tuning disclosures, onboarding/Check Claude Code, Output style notices and parity section |
| P-64, P-65 | Catalog modal and hint: spec says only "shared shell"; "keep" is implied, not stated |

Covered: P-2..P-6, P-9 (header), P-11, P-12, P-14..P-25, P-26..P-28, P-30..P-35, P-36..P-44, P-46..P-49, P-51, P-52, P-54..P-63 (contents of modals unchanged), A-2, A-4, A-7, A-8, A-10, A-11..A-21, A-23..A-25, A-28, A-29, A-31, A-33, A-36.

## Removals for the user

I do not approve any removal. The user must decide:

**Listed in the spec (`## Proposed Removals`, copied from the inventory):**
- R-1: for a not-installed CLI: Order "-" cell, Permission/Network selects, model/effort trigger, enabled toggle, kebab Test (decision 8).
- R-2: dead instance card list in `ptah-cli-instances` (`:64-500`).
- R-3: pencil reorder popover (M-1), kebab "Details" (M-5), hidden identity install link (M-4). Note: with M-1 the popover's drag goes with it unless Blocking 1 is fixed. Present R-3 to the user together with that fact.

**Not listed in the spec but removed or lost by the spec/prototype:**
- N-1: kebab "All capabilities" and the "All capabilities" popover content (Serious 2). Spec "Row" trims the kebab; not in R-1..R-3.
- N-2: kebab entries "Details", "Info", "Credentials/Install guide" per CLI beyond Test / Sign in / Reset (spec decisions table "CLI kebab trimmed"). "Details" is R-3; the rest is not.
- N-3: Info and capabilities of a not-installed CLI (U-10, U-14): the Add-more card offers Install only.
- N-4: Copilot auto-approve toggle (P-66) if the spec keeps native behavior as read-only text.
- N-5: the Native-behavior "Permission" popover text is replaced by a one-line clamp with More/Less (information kept, control removed; this is decision 13, no action needed except to confirm the clamp keeps the whole text).
- N-6: the Ptah CLI defaults card and instances card as separate cards (P-23, P-25, M-9): moved, not removed; listed under R-2 only for the dead list. Fine.
- N-7: Order chips "+N" overflow and the per-instance "Unavailable / Managed by connection" title if not carried over (P-7, P-35).
- N-8: Membership toolbar button hidden while the alert shows (M-9) and the aside Plan/State rows (M-8): merged, spec keeps both badges and a single action. Confirm with the user that the "Plan description" text is kept.

## Spec vs prototype

| # | Area | Spec | Prototype |
|---|---|---|---|
| 1 | Reorder | up/down stacked in Order cell; "rows regroup by kind" | up/down only; numbers swap globally with no row movement; no disabled ends; no grip (`:164-166, 681`) |
| 2 | Status text colour (light) | text uses `base-content` | text uses `--ok`/`--warn` (`:82, 99, 591-592, 685`) |
| 3 | Form-section fields width | `1fr` | `1fr` (matches the spec, but not the primitive's 36rem cap) |
| 4 | New tokens | 4 tokens | only `--ptah-card-pad` defined (`:39`); modal cap is a literal (`:225`); no `--ptah-lane-row-h` |
| 5 | Max concurrent | `input-sm w-20`, range per source | `width:4rem`, `max=20` (`:375`) |
| 6 | Re-detect | label "Re-detect CLIs"; also in strip (P-9) | "Re-detect CLI agents"; none in strip |
| 7 | Account in CLI detail | not limited | shown for every CLI; source is Claude only |
| 8 | Cursor "Sign in" | "line-2 Sign in link" in the row | in the Status cell line 2 (`:592`); hidden at < 640px, then only kebab/detail |
| 9 | Ptah kebab | Test, Edit tiers, Edit, Reset, Delete | same (`:696`); duplicates footer; "Reset" has no target |
| 10 | Tier models | per P-45 | "3 tiers mapped" |
| 11 | Group tag, synced | "Off by default where applicable" | "Hidden by default" |
| 12 | Sticky summary offset | `top-0` | `top:-gutter` |
| 13 | Order widths | Order `w-16`, kebab `w-10` | 4.25rem, 2.75rem |
| 14 | Membership licensed state | Manage / Account / Log out missing | only unlicensed state drawn |
| 15 | Output style cards | `Eye` (built-in) or `Pencil`+`Trash2` (user) | only built-in cards drawn |
| 16 | Advanced page icon / `stateMark` / nav padding | specified (F34-F36) | not drawn (CHECKS says so) |
| 17 | Detail labels, light screenshot | "Permission support" / "Network support" | light PNG shows older "Permission modes" / "Network" |

Checked and consistent: group headers (`Terminal`/`Boxes`, counts, `RefreshCw` icon-only), Ptah defaults in the group header (selects + `RotateCcw` + single `Plus` Add), accent inset on Ptah rows, inherited-value cell with `Link2` and "(default)", Add-more strip (3 cards, `CircleDashed`, `BookOpen` Install, popover with command/Copy/Re-detect), modal shell (header/body/footer, max-height `calc(100dvh - 2rem)`), tools groups, group `switch` with `aria-checked="mixed"`, sticky summary with filter, row switches, warn chip, empty synced group.

## Decision checks

- **User complaints (1a-1g):**
  (a) Modal: pass (`modal-800x600-dark.png`: box y16-584, header/footer pinned, body scrolls; CSS `:225-228`). Popovers/drawers: not rendered at 800x600; rule exists in the spec but depends on Serious 7.
  (b) Pass: icon-only for Re-detect, Edit, Delete, Reset, Close, kebab, expander. Test/Credentials/Edit tiers keep label (spec rule: primary/ambiguous). Alignment: fixed kebab/expander columns, pass.
  (c) Pass: one card, two `<tbody>` groups, global numbers, defaults in the Ptah group header (`:660-667`). Reorder semantics fail (Blocking 2).
  (d) Pass: Add-more strip (`:383-390, 668`); see Serious 2 / Minor 5.
  (e) Spec pass; primitive conflict in Serious 4. Prototype Advanced screenshots show one right-aligned control column and consistent card padding (pass).
  (f) Pass: icons on section headers, status, actions in both the spec icon map and the prototype.
  (g) Pass for the populated state: groups, filter, group switch (mixed state), row switches, sticky summary (`tools-*.png`). States in Serious 6.
- **Decision 13:** Claude detail markup (`:621-647`) has no model/effort, permission, network or enabled control and no version or provider-on-line-2 repeat. Pass. The Permission/Network/Model rows are in the detail only for narrow widths (`.only-narrow`), when the row hides those columns: pass, and the spec says it (Decisions table). Info is inline text (Messaging, Permission support, Network support, MCP, Limit, Native behavior with More/Less): pass. Buttons are Test, Credentials (key rows), Codex settings, Reset, Edit tiers, Edit, Delete: all real actions. Ptah detail (`:633-636, 643-645`): Key status, Tier models, capability facts, Test / Edit tiers / Edit / Delete: pass, no repeated control. Caveats: Serious 1 (Copilot toggle) and Serious 8 (kebab duplicates). CHECKS.md says Ptah rows were not re-rendered; I verified by reading the markup only.
- **Decision 14:** fail (Blocking 1).
- **Accessibility:** icon-only buttons all carry `aria-label`; tooltips on most (Minor 8). Keyboard: expander is a `button` with `aria-expanded`/`aria-controls` (`:617`); group disclosure the same (`:735`); reorder buttons have "Move X up/down" labels; kebab has Arrow keys; Esc closes floats (`:559`). Missing: drag keyboard path (Blocking 1), focus drop on disabled switches (Minor 10). Contrast: dark pairs pass; light ok/warn ink 3.97:1 is correctly flagged but misused in the prototype (Serious 3); the spec's claim "light err #b91c1c 5.12" passes.
- **Screenshots:** no horizontal overflow or clipped text in the 8 PNGs except the truncated model id (Minor 9) and the "(default)" inherited cells cut at the bottom edge of the 1600x900 captures (viewport crop, not a defect). Nothing resembles the `evidence/` defects (no text-button column, no table rows for uninstalled CLIs, no second card). At 800x600 the card header wraps ("Reorder" under "Max concurrent"): acceptable. The 800x600 Lanes capture shows only the top of the table.

## Not checked

- Prototype was not rendered by me; screenshots and markup were read. Hover/focus tooltips, kebab menu, Install/Model/Membership popovers at 800x600 were not seen (no PNG).
- Ptah CLI rows expanded, Cursor/Codex/Ollama details, Reorder mode, loading/empty/error states: markup read only.
- Light theme at 800x600; tools and modal in light.
- Real oklch token contrast (spec values are prototype hex).
- `table` primitive support for two `<tbody>` groups with per-breakpoint `colspan` (`collapseBelow`, `ptahMessageCell`): not verified in the component logic.
- Test names for each parity row; drawer rules (F12-F15) and shell rules (F34-F38) have no prototype and were not verified.
- `ptah_agent_report` and other Ptah MCP tools were not used for analysis; native file reads and `grep` were used instead.
