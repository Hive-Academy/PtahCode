# Design spec review, round 2 - TASK_2026_894_0e20

- **Author:** codex lane, ui-ux-designer
- **Reviewer:** antigravity
- **Revision:** 2
- **Round:** 2 of 2

## Verdict

**REVISE** (narrow). The revision resolves F1-F7 or supersedes them, and the card grid meets the width and height requirement in measurement. Three issues need a spec change before Gate 1.7:

1. The card has no room for states the real lane-defaults cell already produces. The body already overflows and scrolls in every card (N1).
2. No reserved region exists for Test result or status change, which the user explicitly asked for (N2).
3. Two spec claims do not survive a check against the repo (N3, N4).

None of these is a redesign. Each is a specification fix, and the rest of the design can proceed.

## Earlier findings

| # | Earlier finding | Status | Evidence |
|---|---|---|---|
| F1 | Codex destination did not exist (Blocking) | **Resolved** | The spec now places "Agent behavior" in the Credentials tab of `ptah-connection-detail-drawer`, after the Codex sign-in block, with no new tab id or kind. Checked in code: `credentials-tab.component.ts:181-193` (codex case with `ptah-codex-sign-in-block`) and `:454` (`connection.id === 'openai-codex'`, the id the spec relies on). The drawer is `w-full max-w-lg` (`connection-detail-drawer.component.ts:66`). The deep-link plumbing is specified: extend `ProvidersSettingsDrawerRequest` (today only `{claude-cli, accounts}`, `providers-settings.component.ts:79-85`), add a typed signal in the Settings shell, bind it at `settings.component.html:171`, and add the `codexSettingsRequested` output. Missing-connection and non-Electron fallbacks are stated. The drawer prototype is drawn as a drawer (`provider-detail-dark.png`, `provider-detail-light.png`; the HTML `#provider` panel). |
| F2 | Prototype Context panel invented controls (Serious) | **Superseded and resolved** | The user direction replaces it. The prototype has no Context tab (`index.html` panels are only `cli`, `routing`, `provider`). The spec says "keep the current production layout; remove only the Codex agents group". `orchestration-settings.component.ts:80-90` shows the group (`groupId="codex-agents"`) and the sandbox mount to remove. Implementation note: the `codexWebSearch` key definition must survive for the new toggle (decisions.md #9). |
| F3 | Friendly-name source unspecified (Serious) | **Resolved** | The spec adds a `RoutingDisplayNamesStore` over `state.cliAgents().data`. It specifies the built-in label helper, the slug title-case rule, the route-key dictionary, `cliModelDisplay()` for models, and the loading and unknown fallbacks. The prototype shows the friendly tiles and the empty and unavailable states (`routing-dark.png`). The "Loading executor…" state is described but not drawn (Minor N11). |
| F4 | Tall lane-defaults cell, no layout input (Serious) | **Resolved with caveats** | Permission and Network sit side by side in one row in both the shared card and each provider card (`1600-dark.png`). `layout` input, `codexSettingsRequested` output and an overlay for the full-access confirmation are specified. Caveat: the cell's other states have no space (N1). |
| F5 | Responsive threshold unproven (Serious) | **Resolved** | I measured the prototype in Chromium at 900, 1100, 1200, 1400, 1500 and 1600px. Columns were 1, 2, 3, 3, 3 and 4. Card sizes were 570x548, 379x548, 282x548, 349x548, 382x548 and 308.5x548. Container queries drive the count and the 240px sidebar is modelled. Real sidebar width remains unverified (the spec admits this). |
| F6 | Missing matrix affordances (Serious) | **Resolved with caveats** | Toggle, identity, status, capability summary and popover, provider, credentials, model, effort, safety Info and Edit, defaults, Codex note, Test and More are all drawn. The uninstalled group and full-access preview exist. Caveats: N2, N5, N9. |
| F7 | Weak control contrast (Serious) | **Partly resolved** | Prototype control borders measure well (`--control-border` #979da6 dark, #66616d light). The spec says that token "approximates `border-base-content/50`", which is not true in light (N3). |

## New findings

### Serious

**N1. Cards have no headroom, and the body scrolls inside every card.**
- Evidence:
  - The Chromium measurement shows `.agent-card-main` is 10-11px too short at 900, 1200 and 1600px (`scrollHeight` 341 vs `clientHeight` 330-331) on all four installed cards. With `overflow-y:auto; scrollbar-gutter:stable`, each card has a live nested scroll area and a reserved gutter (`index.html` `.agent-card-main`).
  - The real `CliLaneDefaultCellComponent` produces more content than the prototype shows: a "Saved default" caption and a "Reset to default (…)" button (`cli-lane-default-cell.component.ts:18-19`), an "Unsupported combination" status (`:20`), "Permission/Network: Unavailable - reason" text (`:33,:41`), and Cursor's unavailable-mode lines (`:28-32`). The only reserved region is the 40px Codex note (`.agent-note`).
- Impact:
  - Any of these states scrolls or clips content inside the card. This is the nested-scroll outcome the user wanted to avoid, and a clipped Reset or warning is a safety risk.
  - Native outlines on the first and last controls are also clipped by the scroll container: `.agent-card-main` has only `padding-right`, and the focus outline uses `outline-offset:3px`.
- Required change:
  - Budget the fixed body for the worst case. Reserve two lines for state text: unsupported, unavailable and saved-default.
  - Move Reset into a popover (the Edit permission popover, or beside the caption) so it needs no row.
  - Add a `padding` of at least 4px on all sides of the scroll container, or make the card tall enough that no card scrolls in the normal and error states.
  - Add a verification step to the spec: no `scrollHeight > clientHeight` for any card state.

**N2. No reserved region for Test result or status change.**
- Evidence: the user requires no growth "when a Test runs or status changes", and the spec says "Status and Test progress change text within reserved regions". The prototype card footer is only the Test and More buttons (`index.html`, `.agent-card-footer`). The status is one badge. Nothing shows the last-test result, running state, failure message, or a key-set, expired or needs-login state. The instance model shows "Last test: Not run yet" in the instance section, but the provider cards omit it.
- Required change:
  - Add an explicit aria-live line (fixed `min-h`, truncated with a title or popover for the full message) to the card, for example under the status badge or in the footer.
  - State that the Test button keeps its width while it shows the busy state (`ptahBusyDisabled` or a spinner in place).
  - State the status badge set (Installed, Needs key, Not installed, Running, Test failed) with a fixed-width slot.
  - Draw the Test running and Test failed states in the prototype.

**N3. The spec's border-contrast claim is wrong for the light theme.**
- Evidence: the spec says `--control-border` "approximates production `border-base-content/50`", and the revision note says 5.27:1 dark and 5.20:1 light. Those numbers come from the prototype's solid hex values, not from `/50`. A 50% mix of the light content colour (#24232b) on the card surface (#f2eee9) is about #8b898a, which is about 2.9:1 on that surface. That is below the 3:1 the spec requires. In dark the same mix is about 4.7:1 and passes.
- Required change: specify `border-base-content/60` or higher for controls in the light theme, or name the real token and verify its ratio. Rewrite the claim: the prototype value is a stand-in and is stronger than production would be at `/50`. Cover select, number input, toggle, popover-trigger buttons, and the Info/Edit buttons. The prototype's `Info`, `Edit` and model and effort triggers use this border, and so would production.

**N4. Tailwind container-query utilities are not available in this repo.**
- Evidence: `package.json` has `tailwindcss ^3.4.18` and `daisyui ^4.12.24`. `styles.css:16-18` uses the v3 `@tailwind` directives. I found no container-queries plugin. Existing container queries are plain CSS (`canvas-empty-board.component.css:14,221`, `chat-input.component.css:13`) or arbitrary properties (`canvas-lane-view.component.ts:74`: `[container-type:inline-size]`).
- The spec writes the grid as Tailwind classes ("Mount `@container` … switch to `grid-cols-2`, …"). `@container` and the `@[620px]:` variants do not exist without the plugin. `scrollbar-gutter-stable` is also not a Tailwind v3 class.
- Required change: state that the grid is implemented as component CSS with `container-type:inline-size` and `@container (min-width: …)` rules (the repo's existing pattern), or add `@tailwindcss/container-queries` as an explicit dependency decision. Use `[scrollbar-gutter:stable]` if the gutter stays.

### Moderate

**N5. Popover mechanism is ambiguous, and focus behaviour is unspecified.**
- Evidence: the spec says "popover/popovertarget, or existing CDK overlay". The product already has `ptah-native-popover` with `placement`, `hasBackdrop`, `(closed)`, `(opened)="focusOpened()"` and one-open-at-a-time state (`cli-orchestration-matrix.component.ts:67,407-413`), plus `ptah-cli-model-effort-popover` and `cursor-credential-popover`. The prototype uses bare `popover` attributes with no focus move.
- Required change:
  - Mandate `ptah-native-popover` for the capability, model, effort, permission, credentials, Info and More popovers. Keep the existing Model/Effort/Cursor-credential popover components.
  - Require: Escape closes and returns focus to the trigger; open focuses the first control; one popover open at a time; trigger exposes `aria-expanded` and `aria-controls`.
  - Do not use native `popover` for the full-access confirmation. It needs a modal dialog with a focus trap (the repo's shared native `<dialog>`, `cli-orchestration-matrix.component.ts:819`).

**N6. The full-access confirmation still has no defined anchor.**
- Evidence: the spec says "overlay or dedicated region outside the grid". The real component renders the confirmation inline in the cell (`cli-lane-default-cell.component.ts:42-48`), and the prototype shows it only as a `<details>` preview below the grid (`index.html`, "Preview full-access confirmation"), which does not model a confirmation raised from a card's select.
- Required change: choose one. A modal `<dialog>` is recommended, since it does not depend on the card and keeps the safety step blocking. The cell must keep the select value unchanged until Confirm, as it does today (`:85,:95`). The shared defaults card should use the same dialog.

**N7. Two different card shapes and two lists for the same instance.**
- Evidence: Ptah CLI instances (Glm, kimi code) appear as variable-height full-width cards in "Ptah CLI instances" (`1600-dark.png`) and again as fixed cards in the grid. The instance card has capability chips with a popover trigger, a two-column body and tier slots. The grid card has none of the tier slots, and its model, effort and Last test live elsewhere. This duplication pre-exists, but the new equal-size rule makes it more visible.
- Required change: state which surface owns each instance capability (tier slots, Last test, Key set) and confirm that the grid card reaches all of them through More (Tiers, Edit, Delete). The instance section's cards are not under the equal-size rule, and the spec should say so.

**N8. The responsive thresholds leave an inconsistent minimum card width.**
- Evidence: the thresholds are 620, 830 and 1180px. Resulting card widths at the thresholds are about 304, 268 and 286px. At a 900px window the content box is 570px, so the grid shows one 570px card, although two 279px cards would fit and match the 3-column minimum. The spec also gives widths measured against an assumed 240px sidebar. I could not verify the real Electron Settings layout: `settings.component.html:19` shows only the host container and a `nav` at `:70`.
- Required change: set the two-column threshold at about 560px so every column count has a similar minimum card width. State that the thresholds are provisional until measured in Electron.

**N9. "Credentials" is shown on every card but only exists for some agents today.**
- Evidence: the prototype gives every card an Access row with a Credentials popover (`1600-dark.png`, `index.html` `-credentials`). In the product only Cursor has a credentials cell and popover (`cursor-credential-popover.component`, `cli-orchestration-matrix.component.ts:629`). Showing it on Grok and Codex implies a capability they lack.
- Required change: show the Credentials row only for rows that have it today, and use the reserved space for the N2 status line.

### Minor

**N10. Link styling on buttons.** `.capbtn` ("All capabilities", "Show capabilities") is underlined (`index.html`), which contradicts the spec rule against underlined link styling for action buttons. Use `btn-ghost btn-xs` or the existing action style.

**N11. Prototype states not drawn.** "Loading executor…" for the routing names, the Test running and failed states (N2), a card with a long provider or instance name, and the Codex card when the host is not Electron. Only the empty and unavailable pick states and the evidence states are shown.

**N12. Details inside the evidence table.** Each score cell has a `<details>` "Evidence details" disclosure that grows its row. It is outside the card grid, so it is not a violation, but a popover would match the user's stated preference and the rest of the page.

**N13. Wasted card space.** The 548px cards leave a large blank gap between the defaults and the footer in non-Codex cards (`1600-dark.png`). Reducing the height after N1 and N2 are budgeted would shorten the page, especially in the one-column layout (four 548px cards at 900px).

**N14. Name collision.** The "Permission" row (CLI safety mode, with Info and Edit) and the "Permission" select in Lane defaults sit in one card. The spec labels them separately ("Current CLI mode" vs "Lane default"), but the prototype labels both "Permission". Use the spec's labels.

## Direction checks

**Identical card width and height.**
- At each column count all cards were identical in the same render (see F5). Height was 548px at every width.
- Opening an agent capability popover left all four card heights at 548px at every width.
- Width cannot change within a row: tracks are `minmax(0,1fr)` and the height is fixed.
- A select change: no change in the prototype's fixed layout, but the confirmation and state text need the N1 and N6 fixes, because they are the real growth sources.
- Test running and status change: unverified, because the prototype has no region for either (N2).
- Orphan card: at 3 columns the fourth card sits alone on a second row and has the same width (`1200-light.png`). This is acceptable.

**4/3/2/1 columns.** Container-driven and verified at the widths above. The user's "3 at about 1200px" holds (3 columns at 1200 and up to 1500px). The 4-column threshold is reached at about 1510px of window width with the assumed sidebar.

**Parity.** Max concurrent, order readout, Edit order, Re-detect CLIs, the uninstalled group, Ptah CLI instances and shared defaults, the full-access preview and the Codex sandbox link are all kept. The old table row's model and effort editors, permission Info and Edit, capabilities, Test and More are kept. The parity inventory adds rows for them (rows 13-20, 29, 34). Nothing is silently removed except the two approved keys. Open: Reset and unsupported states (N1), Test result (N2).

**Context management.** No redesign, as directed. The spec removes only the Codex agents group (and the sandbox mount). The prototype omits the tab, which is correct. Session budget, lane guards, `context-budgets` and `background-queries` stay as in `orchestration-settings.component.ts:62-90`.

**Design language and contrast.** Cards use `data-glass-surface="tile"` inside the content section (spec), which matches `capability-matrix-setting.component.ts:43`. Text contrast: dark muted #bac0c8 on #262a32 and light muted #5b5b68 on #f2eee9 pass 4.5:1 by computation. Status greens and the stale-badge accent pass in both themes. Control borders: see N3.

**Keyboard focus.** A 2px outline exists on buttons and selects (Chromium reports a solid outline on a focused select). Focus into and out of popovers needs N5. Clipping of the outline inside the scroll body needs N1.

**Angular 22 / DaisyUI / Tailwind feasibility.**
- Feasible: standalone OnPush cards, signals, the existing `ptah-native-popover`, and the cell's new input and output.
- Needs the spec fixes: container queries (N4), popover mechanism (N5), confirmation dialog (N6).
- The Codex drawer destination is real (F1).

## Lane-introduced constraints (tag lane-proposed)

- **lane-proposed:** fixed card height 34.25rem (548px) and the 620/830/1180px thresholds.
- **lane-proposed:** two capability summary chips plus the "All capabilities" popover.
- **lane-proposed:** a 40px reserved Codex note region, and moving Credentials onto every card (N9).
- **lane-proposed:** the shared-defaults and instance-card layouts, and the prototype sidebar and tabs.
- **lane-proposed:** targets of at least 40px for checkboxes and toggles.

## Checked

- **Read:** `design-spec.md`, `design-spec-revision-1.md`, `parity-inventory.md`, `prototype/index.html` (full source), `prototype/README.md` listing, and the screenshots `1600-dark.png`, `1200-light.png`, `900-dark.png`. The provider and routing screenshots from round 1 were not re-opened. Their HTML panels were read instead.
- **Rendered (Chromium via Playwright, a `file://` URL, not `ptah_browser_navigate`):** the prototype at 900, 1100, 1200, 1400, 1500 and 1600px, dark theme only (default). I measured column counts, card width and height, popover-open heights, body overflow and select focus outline. The `ptah_browser_*` tools were not listed in this session.
- **Not rendered live:** the light theme at 900 and 1600px (only `1200-light.png` was viewed), the provider drawer at the three widths, and the popovers beyond the capability popover.
- **Code checked:** `credentials-tab.component.ts:181-193,454`, `connection-detail-drawer.component.ts:66`, `providers-settings.component.ts:79-85`, `settings.component.html:19,70,171`, `cli-lane-default-cell.component.ts:15-48`, `cli-orchestration-matrix.component.ts:67,407-413,629,819`, `orchestration-settings.component.ts:62-90`, `package.json`, `styles.css:16-18`.
- **Not run:** builds, tests, servers. No product file was modified. The two scratch scripts were written to the system temp folder, outside the repo.

## Open items

1. Budget the card body for the real lane-defaults states and make sure no card scrolls (N1).
2. Add a reserved status and Test-result region and draw the running and failed states (N2).
3. Fix the control-border claim and the light-theme value (N3).
4. State how container queries are implemented, given Tailwind v3 (N4).
5. Mandate `ptah-native-popover` and a modal dialog for the full-access confirmation (N5, N6).
6. Decide the instance ownership question (N7), adjust the 2-column threshold (N8), and drop the Credentials row where it does not exist (N9).
