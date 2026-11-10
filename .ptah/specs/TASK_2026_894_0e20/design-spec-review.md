# Design spec review - TASK_2026_894_0e20

- **Author:** codex lane, ui-ux-designer
- **Reviewer:** antigravity
- **Revision:** 1
- **Round:** 1
- **Reviewed:** `design-spec.md`, `parity-inventory.md`, `prototype/index.html`, `prototype/README.md`, `prototype/screenshots/*.png` (dark, light, routing-dark, narrow-dark; provider-light was not opened), `screenshots/before/2.png` and `3.png`. Code checked against the files the spec cites in `libs/frontend/chat/src/lib/settings/...` and `apps/ptah-extension-webview/src/styles.css`.
- **Not done:** I did not render the prototype in a browser, and I did not run any tests or builds. Contrast figures are computed from the hex values in `prototype/index.html`, not measured.

## Verdict

**REVISE**

The visual direction is sound. The shared-defaults card, instance cards, rotation tiles and capability grid all fix the screenshots. These gaps need closing before Gate 1.7:

1. The Codex relocation is not implementable as written (F1).
2. The prototype shows a Context management panel that does not match the product (F2).
3. The friendly-name data source is not specified (F3).
4. The lane-defaults column is too tall and the responsive threshold is not proven (F4, F5).
5. Several matrix capabilities are silently absent from the prototype (F6).

## Findings

### Blocking

**F1. The Codex sandbox and web-search destination does not exist as the spec describes it.**
- Location: spec "Context management and Codex"; `prototype/index.html` provider panel; `providers-settings.component.ts:45,350-355,437-474`; `connection-drawer/connection-kind.ts:12-33`.
- The spec says "Codex connection detail surface … Add 'Agent behavior' after connection details". The prototype shows an inline two-pane page (connection list plus detail tile).
- In the product, a connection opens `ptah-connection-detail-drawer`, a side drawer with tabs. Tab ids are `overview | accounts | credentials | models | advanced`, and `TABS_BY_KIND` is keyed by auth mode, not provider (`connection-kind.ts:3-7,23-29`).
- Codex has no kind of its own, so a Codex-only "Agent behavior" tab or section needs one of two things:
  - a new `ConnectionDrawerTabId`, plus a provider-id check that `connection-kind.ts` deliberately avoids;
  - a section inside an existing tab.
- The spec picks neither. It also does not say where the drawer's width and scroll behavior fit the four-radio sandbox fieldset, the confirmation and the Windows caveat.
- The matrix link "Codex sandbox: Providers → Codex" has no navigation path. `ProvidersSettingsDrawerRequest` says "Only the Claude Accounts drawer is requestable" (`providers-settings.component.ts:79-83,561-562`).
- `CliLaneDefaultCellComponent` has no router or output for navigation, so the spec must add one (see F4).
- Missing states: Codex is not a configured connection, the user is signed out, and the host is not Electron.
- Required fix: name the exact drawer tab or section, the id type change, the deep-link request shape and the cell output. Redraw the prototype provider screen as the drawer.

### Serious

**F2. The prototype's Context management tab invents controls and drops real ones.**
- Location: `prototype/index.html` `#context` panel; `orchestration-settings.component.ts:83-90`.
- It shows read-only inputs "Context budget" and "Tool output budget" with the value "Global value". It shows "Background queries" with no controls.
- The real tab keeps `session-budget-settings`, `lane-guards-settings`, `advanced-settings-group` for `context-budgets` and `background-queries`, and these remain editable.
- The prototype's note, "The two older Codex-only context limits are removed in favor of global values", is unrequested copy.
- Developers could implement fake read-only fields. Replace the panel with the real remaining groups minus `codex-agents` and the sandbox. Say explicitly that nothing is added.
- Related: the spec gives no UI for how global values now govern Codex (decisions #6/#7). Say "no UI" if that is the intent.

**F3. The source of friendly names is not stated (item 5).**
- Location: spec "Routing and capability evidence"; `rpc-capability-matrix.types.ts:43-55`; `lane-rotation-setting.component.ts:79-88`.
- The RPC returns only `{key, candidateId}` and `{family, model}` strings.
- The spec says to "resolve `pc-*` against configured Ptah CLI instances". The only frontend source of instance names is `cliAgents()` and `ptahCliName` inside `agent-orchestration-config.component.ts` (spec `cli-matrix-rows.ts:66,342`). The rotation component is a sibling and has no access to it.
- The spec does not say which store or RPC supplies the names, or whether the rotation and capability components need a shared signal store. This should go in the spec as an extracted store, per the Angular guidance.
- Other gaps:
  - `subagent:<slug>` has no registry. "Code logic reviewer" and "Senior tester" can only come from title-casing the slug. State that rule.
  - System ids such as `codex`, `antigravity` and `kimi code` need a display-name table.
  - The routing key `plan-review|review` needs a key-to-label dictionary. The prototype invents "Plan review · review" and "Architecture · plan" with no rule.
  - The capability `model` strings are raw (screenshot 3: `claude-sonnet-4-6 Claude Sonnet 4.6 (Thinking)`). The prototype shows "GPT-6 Sol" and "GLM 5.3 Cloud". No parser or catalogue is named, and the fallback is not specified.
  - A deleted instance should fall through to "Unknown executor". The spec has this, but not a loading state while instances are still being read.

**F4. The lane-defaults column is too tall, and the cell cannot be reused as specified.**
- Location: `prototype/screenshots/dark.png` (rows are about 160px); spec "CLI agents and custom instances matrix"; `cli-lane-default-cell.component.ts:15-49`.
- The 204px column stacks the "Auto (default) · built-in" line, a Permission label and select, then a Network label and select. Every row is about 3x the height it needs and the table reads as sparse.
- Judgement: inline is better. Put Permission and Network side by side as two `select-xs` fields in a 2-column grid, with 2-3 letter visible labels or visually hidden labels (both already have `aria-label`). Show "Auto (default) · built-in" as a muted caption or a `title`. Rows drop to about 64-72px. If 204px is too tight for `auto-edit`, merge the Permissions & Safety and Lane defaults columns (354px).
- The cell template is one component for three uses: the shared card, the table and the card layout. The `w-[4.75rem]` and `[overflow-wrap:anywhere]` classes are baked in (`:15`).
- The spec only says "remove `w-[4.75rem]` in this placement". It needs a layout input (`layout = input<'stacked' | 'inline' | 'card'>`) and an output for the Codex link.
- The inline Full-access confirmation (`:42-47`, with a long warning and Confirm/Cancel) is not designed for a 204px cell. The prototype omits it. Design this state: popover, or expand the row.
- In the shared card at 1600px, the selects stretch to about 470px each for "Plan" and "Allow" (`dark.png`). Cap them at `max-w-xs`.

**F5. The responsive switch is unproven.**
- Location: spec "CLI agents and custom instances matrix"; `prototype/index.html` `@media(max-width:1450px)`; README.
- The spec says the table appears at container width ≥1200px, with a table minimum of 1184px. The prototype switches on a viewport media query at 1450px, not a container query. Its "900px preview" button only caps `max-width`.
- Electron's sidebar is never modelled, and the spec never states its width. The 900/1200/1600 claims cannot be verified.
- There are no 1200px screenshots. The spec "At a 1200px window, keep cards" is untested.
- Nested padding (page 24 + card 20) leaves less than the container width available to the table, and 1184px plus padding needs about 1260px of container.
- Fix: state the sidebar width and the padding arithmetic. Make the prototype use `@container`. Add 1200px and 900px (sidebar present) screenshots.

**F6. Parity: matrix features the prototype and spec leave out.**
- Location: `cli-orchestration-matrix.component.ts:257,539,581,629,660,679,727,758,819`; `before/2.png`; parity rows 13-16.
- The "kept" decisions are not shown in the prototype:
  - the info (ⓘ) affordance beside "Auto-approve" and "Full auto" (visible in `before/2.png`, dropped in `dark.png`);
  - the Credentials cell (`toggleCell(…, 'credentials')`);
  - the Install popover and install guide (`:660-727`);
  - the uninstalled-CLIs disclosure (`:257`);
  - the model, effort and permission popover editors, which appear as plain buttons with no popover state;
  - the capability summary badges the spec requires ("up to two badges + Show capabilities"). The prototype's matrix rows have none, and the card rows have none either.
- The matrix row Actions also omit anything beyond Test and "⋯". The spec says "labeled ghost buttons and More within 100px"; the prototype's 100px column cannot hold labelled Test plus More.
- The parity inventory marks all of this "keep", but the prototype is the visual contract. Add states for uninstalled and needs-key rows and the open popovers, or add an explicit "unchanged from today" note per cell.

**F7. Control contrast fails the spec's own 3:1 rule.**
- Location: spec "States and accessibility" and "Design system applied" (`border-base-content/10`); prototype `--line:#ffffff24` (dark) and `#29242a2b` (light).
- In dark, the line colour is about 1.5:1 against `--b2` (#262a32). In light it is about 1.5:1 against the card. Select, number-input and checkbox boundaries use this line.
- The spec requires 3:1 for control boundaries, so the spec contradicts itself.
- Decorative card borders at /10 are fine. Controls need `select-bordered` with `border-base-content/40` or higher, or an existing token. The real selects use DaisyUI `select-bordered` (`cli-lane-default-cell.component.ts:23`). Say the prototype's `--line` is not the production token.
- Targets: the spec says ≥32px, but the prototype `btn.small` is 30px and the switch is 18px. DaisyUI `toggle-xs` is about 16px (existing `lane-rotation-setting.component.ts:62`). The target needs a padded label.

### Moderate

**F8. Invented shell and class names that do not match the existing card shells (item 3).**
- Location: spec "Design system applied".
- The spec's shared shell (`max-w-[96rem] mx-auto px-4 py-6 space-y-8`) and card (`rounded-2xl border border-base-content/10 bg-base-100 p-5`) are not found in the existing settings components. The existing sections use `data-glass-surface="content"` with `border-b border-base-content/10 pb-7` (`advanced-settings-group.component.ts:80-85`), or `flex flex-col gap-3` plus the glass-surface padding (`capability-matrix-setting.component.ts:42-47,132-136`).
- Adding `bg-base-100 border rounded-2xl` on top of `data-glass-surface` would double the border and fill on the glass surface.
- Reuse `data-glass-surface` and its tile variant. Drop the new max-width unless the Settings host lacks one.
- The "tile" token `rounded-lg … bg-base-200/40 p-4` is also unmatched.
- The `--primary`, `--accent` and `--score` values in the prototype CSS are hard-coded hex values that were never traced to `styles.css`. `--score:#83d7ad` is not in the real token set. State that the prototype's hex values are placeholders.

**F9. Wrong or misleading citations in the spec.**
- `styles.css:3515-3516` is cited for the light theme. Those lines are the moonstone accent overrides, not the base `ptah-glass-light` definition.
- `providers-settings.component.ts:88` (the `CONTROL` constant) includes `hover:underline`, yet the spec forbids "underlined link styling for action buttons".
- The other cited lines hold: `styles.css:43,58-61,127`, `cli-orchestration-matrix.component.ts:845-849`, `advanced-settings-group.component.ts:83-98`.

**F10. The accessibility requirements do not fit the prototype's markup.**
- Location: spec "States and accessibility"; `prototype/index.html` `.evidence`.
- The grid is built from `<div>`s with no roles. `scope=rowgroup` is valid only on a `<th>` in a real table.
- Use a real `<table>` with `<th scope="col|row">` and `<tbody>` per family, or ARIA `role=table/rowgroup/row/columnheader/rowheader`. Add an accessible name.
- The family headers use `aria-expanded="true"` with no controlled region and no toggle behaviour. The "⌄" glyph must be `aria-hidden`.
- The spec requires a sticky family/model label at 900px; the prototype does not implement it.
- Disclosures: the prototype uses native `<details>`; the spec asks for `aria-expanded` and `aria-controls`. Pick one. `<details>` is acceptable and simpler, but do not specify both.
- The three-chip strip loses information that is only available after expanding, with no per-chip tooltip. Visible text is acceptable.

**F11. Missing states.**
- Location: spec "Routing and capability evidence"; `lane-rotation-setting.component.ts:79-88`.
- `lastPicksUnavailable` ("Recent picks are unavailable", `text-warning`) and the empty last-picks list have no design.
- The prototype shows no loading, error with Retry, or empty states. The spec lists them in prose but the prototype never renders them.
- A very long model string, many families (the real matrix has about 10 family/model profiles), and an all-unrated family have no design. A default of expanded or collapsed per family is not stated.
- `asOf`, `sourceRef` and `note` are available in the cell data but unused. State whether they appear, for example as a tooltip.

**F12. Copy errors and unsupported claims.**
- "Scores combine local outcomes" is wrong. Sources are `seed`, `user` and `local` (`rpc-capability-matrix.types.ts:13`).
- The "● Evidence available" badge is not backed by any data.
- The prototype shows "local" for every cell, so the source badge is never exercised for `seed` or `user`. Mock `n=` values increase by column (`d[3]+i`), which looks like real data.
- The link text "Codex sandbox: Providers → Codex" loses the existing explanation that the lane default and the sandbox are the same setting. Keep a short sentence.

**F13. Toggles replaced with checkboxes.**
- Location: `prototype/index.html` (routing and rotation use `<input type=checkbox class=switch>`).
- The real components use DaisyUI `toggle toggle-xs toggle-success` (`lane-rotation-setting.component.ts:62`). Web search is specified as `toggle toggle-primary`. State which toggle colour applies to which control. Do not change the Rotation and Routing toggles unless the user asks.

### Minor

**F14. Prototype navigation.**
- Page title "Agents, providers and routing" and the four-tab bar are prototype scaffolding. Mark them as such so they are not read as an information-architecture change to Settings.

**F15. Pre-existing naming confusion kept.**
- The "Permissions & safety" badge (for example "Full auto") sits next to a "Lane defaults" Permission select (for example "Plan"), and the two can look contradictory. Not required to fix, but the new layout makes them adjacent.

**F16. Raw option values.**
- The selects show raw tokens (`yolo`, `auto-edit`, `allow`). The prototype matches the raw tokens, but "Yolo" and "Auto-edit" would match the new friendly-name language.

## Parity check

Original five problems:

| User problem | Result |
|---|---|
| 1. Ptah CLI shared defaults squeezed | Solved in the prototype (full-width two-column card, `dark.png`). Needs a cell layout input (F4). Selects are over-wide at 1600px. |
| 2. Chips wrapping mid-word | Solved by `whitespace-nowrap` and the 3-chip strip. Lane-defaults column is readable but too tall; inline is better (F4). The Codex note now points to the new location, but the location is not real as drawn (F1). |
| 3. Rotation picks and capability matrix | Design language is followed and friendly names are shown. The name source is unspecified (F3). |
| 4. Codex auto-compact and tool output controls gone | Done in the spec. The prototype's replacement Context panel is wrong (F2). |
| 5. Web search and sandbox in the Codex provider settings | Intent correct, mechanism not implementable as written (F1). |

Capabilities in `parity-inventory.md`:

| Capability row | Status |
|---|---|
| Rows 1-6, 12-13, 17-19 | Kept. The grouped matrix keeps score, source, samples and stale. Source and stale are visible without hover. |
| Rows 7-11 | Kept in spec, shown in the prototype. |
| Rows 14-16 (matrix capabilities, defaults, actions, uninstalled disclosure) | Kept in spec, not shown in the prototype (F6). |
| Rows 20-21 (codexAutoCompactTokens, codexToolOutputTokenLimit) | Removed, as approved (decisions.md #3). |
| Rows 22-24 (web search, sandbox, Codex cross reference) | Moved. See F1 for the destination. |

No silent removal of a user capability was found in the spec text. The following parity-adjacent items are not covered by the inventory:
- the (ⓘ) permission info affordance;
- the "Click model or effort cells to reassign in place" hint;
- the Credentials and Install cells;
- `lastPicksUnavailable`;
- the delete-confirm and empty states in the instances card.

## Themes, widths, accessibility

- **Themes:** dark and light screenshots exist for CLI agents only. Routing and provider have one theme each (`routing-dark.png`, `provider-light.png`). Accent, muted and stale text contrast is acceptable by computed values (dark muted `#bac0c8` on `#1d2027`, light accent `#895c19` on `#faf8f5`). Control boundaries are not (F7).
- **Widths:** only 1600px (table) and 900px (cards) are shown. 1200px is untested (F5).
- **Focus:** a 2px outline exists in the prototype. The spec's `outline-primary` token is untested against the light primary.
- **Motion:** reduced-motion handling is stated but not shown.

## Implementability (item 5)

- Angular 22 standalone, OnPush and signals are feasible for the matrix, instance and capability grid, with the extracted store F3 asks for.
- No backend change is needed beyond decisions.md, as long as names come from F3's store.
- The Codex move needs frontend plumbing the spec omits (F1).
- `ptah-codex-sandbox-setting` is currently a ~500-line component mounted in a deferred chunk (`orchestration-settings.component.ts:80-90`). Moving it into the drawer needs a decision on whether it stays a lazy chunk.

## Lane-introduced constraints

These come from the spec's "Lane-introduced constraints" section and from rules found in the spec body. None was requested by the user.

- **lane-proposed:** table only at container width ≥1200px, otherwise row cards; fixed column widths (52/224/94/132/136/92/150/204/100px); table minimum 1184px.
- **lane-proposed:** at most three capability chips on instances and two in the matrix, with the rest behind "Show capabilities". This reduces visible capability information.
- **lane-proposed:** new chip wording ("Messaging · resume", "Permission · plan", "Network · allow").
- **lane-proposed:** "Unknown executor" fallback with a raw-id details element; title-case slug rule for `subagent:`.
- **lane-proposed:** regrouping the capability matrix into a family-collapsible model × task grid, with sticky labels, `h-1.5` score bars and an "All models" label for `*`.
- **lane-proposed:** target sizes (≥32px, ≥44px in card mode) and the WCAG 4.5:1 / 3:1 thresholds, as stated requirements.
- **lane-proposed:** `max-w-[96rem]`, `rounded-2xl` shells, 8/16/24/32px rhythm.
- **lane-proposed:** web-search switch style; "Agent behavior" heading.
- **lane-proposed:** new copy ("Evidence available", "Scores combine local outcomes", the Context note, "Extra agent lanes through connected providers…").
- **lane-proposed:** prototype tabs and page title.
- Spec-asserted constraint: the prototype is static and changes no product code. This one is fine.

## Open items

1. Decide the Codex surface: a drawer tab or a section, and the deep-link mechanism (F1).
2. Name the store and RPC that supply instance names and model display names (F3).
3. Decide whether the lane-defaults cell becomes inline or merged with the safety column (F4), and design its confirmation.
4. State the Electron sidebar width and verify the 900/1200/1600px thresholds with a container-query prototype (F5).
5. Add uninstalled, needs-key, popover, loading, error and empty states to the prototype, or mark them unchanged (F6, F11).
6. Replace the Context management panel with the real remaining groups (F2).
7. Fix the contrast spec and prototype tokens (F7), and mark the hex values as placeholders (F8).
8. Re-review after revision. I have not seen `provider-light.png` in detail.
