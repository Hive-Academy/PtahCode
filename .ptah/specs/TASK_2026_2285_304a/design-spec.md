# Design spec: Settings redesign (Providers > Lanes, Advanced, Claude Code tools & skills)

Prototype (visual source of truth): `prototype/index.html`. URL params: `?nav=1` (13rem nav, real 800px window), `?theme=light`, `?view=advanced|tools|lanes`, `?modal=1`, `?expandTools=1`. Prototype hex values approximate the oklch theme in `apps/ptah-extension-webview/tailwind.config.js` (anubis ~171-260, anubis-light ~245-280); implementers use the Tailwind/daisyUI tokens, not the hex.

## Scope
- Providers page, section Lanes (table, add/edit modal, tier modal, catalog modal, popovers).
- Advanced page: all sections, plus Claude Code tools & skills, drawers, settings shell.
- Min window 800x600 (`main-window.ts:52`); with the 13rem nav the page container is 577px. Electron only. Typecheck of templates required after implementation.
- No capability removed (decision 12). No backend contract change (decision 9).

## Tokens and primitives used
Existing (reuse, do not redefine):
| Name | Path / value |
|---|---|
| `--ptah-space-1..12`, `--ptah-gap-inline/label/controls/field(1rem)/group(1.5rem)/section(2rem)/heading`, `--ptah-page-gutter` | `libs/frontend/ui/src/lib/tokens/ptah-tokens.css` |
| `--ptah-control-h-xs/sm/md/lg` (1.5/2/2.5/2.75rem), `--ptah-icon-xs/sm/md` (.75/.875/1rem) | same |
| `--ptah-form-section-aside-w` 15rem, `--ptah-form-section-fields-max-w` 36rem (~line 501) | same |
| `--ptah-z-raised` 30, `--ptah-z-menu` 50, `--ptah-z-dialog` 60, `--ptah-z-overlay` 1000 | same |
| Colour tokens `base-content-muted`, `surface-0..3`, `state-*` | `apps/ptah-extension-webview/tailwind.config.js:32-42` |
| Primitives `form-section`, `setting-row`, `settings-layout`, `disclosure`, `description-list`, `table`, `inline-confirm` | `libs/frontend/ui/src/lib/patterns/` |
| `modal`, `drawer`, `popover`, `form` ; `ptahIconButton`, `ptah-alert`, `ptah-status` | `libs/frontend/ui/src/lib/native/`, `.../patterns/` |
| Settings docs | `docs/design-system/settings/` |

New (3 tokens, one line each in `ptah-tokens.css`). The card inset reuses the existing `--ptah-card-padding-lg` (1.25rem, `ptah-tokens.css:420`); no `--ptah-card-padding-lg` is added. The unused `--ptah-surface-pad` (line 28) is deleted. The prototype does not use the 3 tokens (literals); the implementation uses the tokens:
| Token | Value | Why |
|---|---|---|
| `--ptah-popover-max-h` | `min(28rem, calc(100dvh - 2rem))` | one cap for every popover (P5-P7, F10) |
| `--ptah-modal-max-h` | `calc(100dvh - 2rem)` | modal viewport cap (P1-P4) |
| `--ptah-lane-row-h` | 3.5rem | equal lane rows (P18) |

`form-section` gains optional `icon` input; `settings-layout` page header gains `icon` (F22, F35). `--ptah-card-padding-lg` is applied by the global rule `[data-glass-surface=content]` (`apps/ptah-extension-webview/src/styles.css` ~3238) (F1/F2).

**Popover cap implementation (decision 22)**: add `size()` to `floating-ui.service.ts` (+ its spec); `native-popover.component.ts` enables it by default with a new opt-out input `capToViewport` (default `true`; the mode at line ~131 that sets `max-height:none` passes `false`). `native-dropdown` and `native-autocomplete` are unchanged. Re-check specs: `floating-ui.service.spec.ts`, `native-popover.component.spec.ts`, and the popover consumers in Settings (model popover, install popover, membership key, catalog hint). When the trigger is within 8px of an edge at 800x600 and neither side has room: take the side with more room (`flip` with `fallbackStrategy: bestFit`), the panel scrolls inside `availableHeight` (minimum 8rem).

## Shared rules
**Modal shell** (`ptah-native-modal`): box = flex column, `max-height: var(--ptah-modal-max-h)`, `overflow:hidden`, `p-0`.
| Part | Rule |
|---|---|
| Header | `shrink-0 border-b px-5 py-3`; icon + h2 + Close (`ptahIconButton`, `X`, aria-label "Close") |
| Body | `min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4`, scroll shadow |
| Footer | `shrink-0 border-t px-5 py-3`; hint left; Cancel (ghost) + one primary right |
| Width | sm 24rem, md 32rem, lg 42rem; `max-width: calc(100vw - 2rem)` |
Remove negative-margin header/footer in callers (P2, P3) and `max-h-[50vh]` list (P4). Esc and scrim close, focus trap, focus returns to trigger. Drawers keep `h-full` + scrolling body; close = `X` icon button (F13).

**Popover cap**: every panel `max-height = min(--ptah-popover-max-h, availableHeight)` via floating-ui `size()` in `libs/frontend/ui/src/lib/native/shared/floating-ui.service.ts`; `max-width: calc(100vw - 1rem)`; `overflow-y-auto overscroll-contain`; flip to the side with most room. Widths sm 16rem, md 20rem (default), lg 21rem. Membership key stays a popover (decision 10), `w-80`, header with `X`.

**Control rule**
| Control | Form | Icon |
|---|---|---|
| Reorder | icon + label; pressed = "Done", aria-pressed | `ArrowUpDown` / `Check` |
| Re-detect CLIs | icon-only + tooltip + aria-label | `RefreshCw` |
| Add Ptah CLI instance | icon + label (one control, Ptah group header) | `Plus` |
| Max concurrent | labelled number input | `Layers` |
| Test | icon + label, result text beside | `Play`; `CircleCheck` / `CircleAlert` / `Loader2` |
| Credentials / Sign in | icon + label | `KeyRound` / `LogIn` |
| Edit tiers | icon + label | `Layers` |
| Edit | icon-only | `Pencil` |
| Delete | icon-only, danger | `Trash2` |
| Reset to default | icon-only, value in tooltip | `RotateCcw` |
| Install guide | icon + label | `BookOpen` |
| Close | icon-only | `X` |
| Export / Import | icon + label | `Download` / `Upload` |
| Enter membership key | icon + label | `KeyRound` |
| Preview style | icon-only | `Eye` |
| New style | secondary, icon + label | `Plus` |
| Details drawer (agent rows) | icon-only | `PanelRightOpen` |
Rule: a control with a universal glyph and a tooltip is icon-only; a primary or ambiguous action keeps its label; every icon-only button has `aria-label` and a tooltip on hover and focus.

**Icon map**
| Where | Icon |
|---|---|
| Lanes / CLI agents / Ptah CLI instances / defaults / Add more | `Route` / `Terminal` / `Boxes` / `SlidersHorizontal` / `PackagePlus` |
| Column headers Permission / Network / Model | `ShieldCheck` / `Globe` / `Cpu` |
| Status Installed / Needs key / Not installed / Error / Testing | `CircleCheck` (success) / `KeyRound` (warning) / `CircleDashed` (muted) / `CircleAlert` / `Loader2` |
| Empty / error | `Inbox` / `TriangleAlert` |
| Unsupported combo | focusable `Info` button + tooltip |
| Capability facts Messaging, Permission, Network, MCP, Limit | `MessageSquare`, `ShieldCheck`, `Globe`, `Plug`, `Gauge` |
| Detail labels Provider, Account, Executable, Key status, Tier models | `Bot`, `LogIn`, `Terminal`, `KeyRound`, `Layers` |
| Advanced sections Membership & data / Agent behaviour / Output style / MCP & Browser / Claude Code tools / others | `KeyRound` / `Bot` / `Palette` / `Plug` / `Wrench` / `SlidersHorizontal` |
| Membership Community / Builder / active / needs attention / inactive | `Layers` / `Sparkles` / `CircleCheck` / `TriangleAlert` / `CircleAlert` |
| Tools groups; summary; search; empty | `Wrench`, `Terminal`, `RefreshCw`; `Zap`; `Search`; `Inbox` |

**Section pattern** (`form-section`): card inset `--ptah-card-padding-lg` all sides; grid `aside 15rem | fields` (decision 21: Advanced sections set `ptah-form-section [wide]`, the existing input at `form-section.component.ts:124`, which replaces `minmax(0,var(--ptah-form-section-fields-max-w))` (36rem) with the full width; other `form-section` users keep the cap; setting-row text keeps `max-w-prose`), gap `--ptah-gap-section`; sections separated by `--ptah-gap-section` always (not only with glass, F8). Under 640px container the aside stacks above the fields.
**Row pattern** (`setting-row`): grid `minmax(0,1fr) auto`, `py --ptah-gap-field`; `border-b` only between rows (first row no top pad, last row no divider/bottom pad, F3); one right-aligned control column `flex justify-end gap --ptah-gap-controls` with a fixed `size-8` action slot before the control so toggles share the right edge (F4; implemented as an optional `[action]` slot on `setting-row`, a new content projection slot, and listed with its spec); selects `w-56`; hint wraps, never truncated (F9). Under 640px rows stack, controls left.

## Providers > Lanes
**Card** "Lanes" (`--ptah-card-padding-lg`; 0.75rem at 800px): header = `Route` + title + count badge + "6 of 7 enabled" + Max concurrent input (number, range 1-100, `input-sm w-20`, P-6) + Reorder toggle (P26); one-line description; order line = chips with global numbers, overflow chip "+N" (P-7), empty text "No CLI agent installed yet. Use Add more below." pointing to the strip (P-13). Count semantics (P-1): the badge counts installed lanes only (CLI agents installed + Ptah CLI instances); "6 of 7 enabled" uses the same 7; not-installed CLIs in the strip are not counted.

**Table**: one `<table>` fixed layout with `colgroup`: Order w-16, Lane (flexible), Permission, Network, Model, Status, On w-16, kebab w-10, expander w-10. Two `<tbody>` groups, global order numbers (decision 6; numbers 2 and 6 may sit in the Ptah group). The Order cell has a visible column header and `aria-hidden` for a placeholder dash (no `aria-label` on a plain span).
**Kind badges** (decision 16, aligned to the approved prototype, decision 26): two named variants, outline style with COLOURED TEXT and a tinted border: `kind-cli` = text `info`, border `info/50`; `kind-ptah` = text in the warm brand accent (the gold of the Ptah row accent bar; use the existing theme token for it, search before adding one), border at 55%. Each theme uses a text shade that gives >= 4.5:1 on the card surface (prototype: dark `#60a5fa` / `#d4af37`, light `#1d4ed8` / `#8a6500`). Measure with the real tokens at implementation; if a shade fails, darken or lighten the text shade for that theme, do not fall back to one colour. **Group gap** (decision 17): `padding-top: 1.75rem` on the second group header (the prototype value), in addition to the hairline.
| Group header | Content |
|---|---|
| CLI agents | `Terminal` + name + count; `RefreshCw` re-detect (icon-only) |
| Ptah CLI instances | `Boxes` + name + count; inline defaults: Permission and Network selects (xs), `RotateCcw` reset, the single `Plus` "Add Ptah CLI instance" (xs). The defaults card and instances card are removed (P23, P25) |
Ptah rows carry a 2px accent inset on the first cell (P24). Group-header and detail cells use `colspan` = visible column count (prototype `fixSpans()`; real implementation: set per breakpoint).

**Row** (every row exactly `--ptah-lane-row-h`, P18): line 1 name + kind badge; line 2 version (CLI) or provider (Ptah CLI), `--` never blank. Status = icon + text (P29). Kebab (`EllipsisVertical`, role=menu, icon per item, P33): CLI = Test, Sign in (Cursor, when a key is needed; Reset to default stays in the detail footer); Ptah = Test only (decision 23). Kebab holds only quick actions that need no expand (Test, and Sign in when a key is needed); Edit tiers, Edit, Delete, Credentials live in the detail footer only; no Reset on a Ptah row unless a per-row override exists (none today, P-59 is group level). Cursor (needs key) stays in table: `KeyRound` warning + line-2 "Sign in" link (P17). Permission/Network: CLI rows show selects; Ptah rows show muted inherited value with `Link2` + "(default)" in the same 2rem box (P20); unsupported combo (Grok/Cursor) = `Info` button (P31). Model cell = button opening model/effort popover (capped); its `title`/tooltip carries the full model id (truncated text). Icon-only buttons including row expander, popover Close and Clear filter use `ptahTooltip` (`tooltipOnFocus` default true): hover and focus.

**Expanded detail** (decision 13). Repeats nothing the row shows (not model/effort, permission, network, enabled, version, provider line). Two-column `dl` (`grid-cols-[9rem_1fr]`):
| Column | CLI | Ptah CLI |
|---|---|---|
| Left (not in row) | Provider, Account (Claude only, P-44), Executable, Native behavior (inline text, one-line clamp + More/Less); Copilot: labelled `switch` row "Auto-approve" (decision 19, P-66, real write `saveSettings({orchestration:{copilotAutoApprove}})`, with Undo) | Key status, Tier models: "n of 3 set" / "loading" plus one line per tier (P-45) |
| Right (capability facts, inline read-only, icon + label + value) | Messaging, Permission modes, Network, MCP, Limit; then a `ptah-disclosure` "All capabilities" (decision 20; read-only `dl` of `cliCapabilityView` groups, lines and reasons; no popover, no kebab entry) | same (instance capabilities) |
Footer (`border-t`, only real actions): Test + result text left; right: Credentials (only if a key is needed), Codex settings (Codex only), Edit tiers / Edit / Delete (Ptah), Reset (`RotateCcw`, CLI). Footer actions are not repeated in the kebab (decision 23). A detail with nothing extra collapses to one compact facts row + footer, never an empty grid. Info-only popovers (Messaging, Permission, Network, MCP, Limit, Info, All capabilities, Native behavior) are no longer buttons (P12, P13).

**Add more CLI agents strip** (decision 8): not-installed CLIs (Copilot, OpenCode, Pi) leave the table. Strip in the same card: `grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]`, small cards: monogram tile, name, `CircleDashed` + "Not installed", `BookOpen` Install button -> install popover (command + Copy + Re-detect), plus a "Details" `ptah-disclosure` on the card (decision 20; info and capabilities of a CLI that is not installed, U-8/U-10/U-14, read-only). The strip header carries the same icon-only `RefreshCw` Re-detect with the label "Re-detect CLIs" (P-9; one label everywhere). Source data: `CLI_INSTALL_GUIDES`.

**States** (the card keeps its header)
| State | Rule |
|---|---|
| Loading | `Loader2` + 3 skeleton rows of `--ptah-lane-row-h`, `aria-busy="true"` |
| Empty | `Inbox`, "No lanes available", primary Add Ptah CLI instance |
| Error | `TriangleAlert`, message, Retry (`RotateCcw`), `role="alert"` |
| Partial read error | table stays; one error row (`TriangleAlert`, `role="alert"`, Retry) above the groups (P-10); host read-state slot kept (P-15) |
| Reorder (decisions 14, 18) | see below |

**Reorder mode** (replaces R-3's popover). While Reorder is on (button `aria-pressed`, label "Done"), the table shows ONE flat list in global order; the group headers, Add more strip and group gap are hidden (kind badge keeps identifying the kind). Each row's Order cell: `GripVertical` drag handle (`aria-roledescription="sortable"`, reuses `ptah-lane-order-list` drag behaviour, or that component itself rendered in the flat list) + `ChevronUp`/`ChevronDown` buttons (the keyboard alternative; `aria-label` "Move X up/down"; `aria-disabled` at list ends, P-21). After a move, focus stays on the moved row's same button; `aria-live="polite"` announces "Codex moved to position 2". Leaving Reorder returns to the grouped view with new numbers. Tests to carry: drag test in `agent-orchestration-config.component.spec.ts` (~532) and `lane-order-list.component.spec.ts`.

**Narrow widths** (container): < 950px Permission and Network columns hide, appear in the detail (`.only-narrow`); < 640px Model and Status columns and kind badge hide too (status becomes an icon beside the name, model a button in the detail). 800px with nav keeps Order, Lane, On, kebab, expander; no horizontal scroll (`scrollWidth == clientWidth`); group header controls wrap.

**Modals** (Add/Edit Ptah CLI instance, tier mapping, catalog) use the shared shell; footer holds Cancel + primary.

## Advanced
| Section | Rule |
|---|---|
| Membership & data (`KeyRound`) | Aside: icon, title, description, badges (plan, state) (F5, F23). Fields = 3 rows: "Membership key" (hint carries the former banner text; single `KeyRound` "Enter membership key" -> capped popover, F6/F11); "Settings backup" (`Download` Export, `Upload` Import, F18); "Ptah Builders" (ghost "Explore" + the one primary "Create account", F25). No duplicate status or key action |
| Agent behaviour (`Bot`) | 4 rows in section pattern; action slot (`PanelRightOpen` / `Info` / empty) + toggle at right edge; Chat reasoning effort select `w-56`; hints wrap |
| Output style (`Palette`) | Wide section via `form-section` (F7), "New style" secondary `Plus`; style cards with radio and `Eye` (built-in) or `Pencil` + `Trash2` (user) |
| MCP & Browser (`Plug`), Codex sandbox, VS Code LM, others | same section pattern, icon in header; only `ptah-form-section` + `--ptah-card-padding-lg` |
| Claude Code tools (`Wrench`) | see next section |
**Drawers**: System prompt drawer footer `px-5 py-3`, inner boxes `p-3`, preview max-height fluid (F12, F15); Output style editor confirms in a sticky strip above the footer (F14), textarea `min-h-32` flexible. **Shell**: align nav padding with page (F34), page header icon (F35), `stateMark` dot for Advanced needs-attention with title (F36, F40), single scroll/padding owner (F37), wide sections capped 56rem at >= 1400px (F38).

## Claude Code tools & skills
- Header `Wrench`; one `ptah-alert` info line replaces four explanation blocks (F28); sticky summary bar `sticky top-0 z-[var(--ptah-z-raised)]` (F27): `Zap` "Saved per turn ~N tokens", "x of 17 on", filter (`Search` icon, `X` clear).
- Three collapsible groups: Built-in tools (6), Terminal-only skills (11), Synced from claude.ai (0: `Inbox` empty state). First open by default; filter auto-expands matches, hides empty groups, shows "No match" + Clear.
- Group header: disclosure `button` (aria-expanded/controls, Enter/Space), badge "Hidden by default" on the Synced group (the same wording in the prototype), "n/N on - ~tokens", group `switch` (`aria-checked` true/false/mixed; label "Turn on all X", or "... N shown" while filtering). Group switch acts on visible rows.
- Group switch (decision 9): frontend runs the existing per-id RPC sequentially; the switch gets `aria-disabled="true"` (not `disabled`, keeps keyboard focus) while saving and ignores clicks; summary shows "Saving i of n" (live region); then ONE toast "Turned on N ... saved". Partial failure: toast lists failed count; failed rows keep their old state.
- Row: `switch` (not checkbox, F32), name (font-medium, truncate), token chip, optional warn chip "ReportFindings is off" for dependency-blocked skills (`aria-describedby`), description one line, `title` tooltip. Two columns at container >= 704px, one below; no `overflow-x-auto` wrappers (F30). Fix `aria-labelledby` ids (F29).
- States (A-22, A-26, A-27): loading = skeleton of 3 group headers + 4 rows, `aria-busy="true"`; load error = `ptah-alert` error + Retry (`RotateCcw`), `role="alert"`, fails closed (no switch shown); "unverified policy" = separate error alert with Retry, rows read-only; single-toggle writes show an Undo action in the toast and keep focus on the switch after a failed write. The "applies to new sessions" note stays in the info alert.
- Sticky summary offset: `top-0` is valid only after F37 (single scroll/padding owner) lands in the shell; until then use `top: calc(-1 * var(--ptah-page-gutter))`. Implement F37 first.
- Dense rows use one row component for tools and skills (F31).

## Accessibility
- Focus order: page header actions, then group/row controls in DOM order; modal focus trap, Esc, focus return; popover Esc returns focus; kebab `role=menu` with Arrow keys, Esc.
- Icon-only buttons: `aria-label` + tooltip on hover and focus. Switches `role=switch`; group switch `aria-checked="mixed"`. Disclosures and lane expanders: `button aria-expanded aria-controls`, Enter/Space.
- Reorder buttons: aria-label "Move X up/down". Save progress and toasts in `role=status`; errors `role=alert`.
- Status is never colour-only (icon + text). Reduced motion: no transitions beyond opacity.
- Contrast, WCAG 2.2 AA (text 4.5:1, UI/icon 3:1), measured with the prototype hex:
| Pair | Ratio | Pass |
|---|---|---|
| dark muted #9b9895 on #242430 / #1a1a20 | 5.34 / 6.04 | yes |
| light muted #6a4a5c on #e8e4e1 / #f0ece9 | 6.05 / 6.51 | yes |
| button ink #131317 on #d8d8ee; #2a1a33 on #58d6c6 | 13.22; 9.16 | yes |
| dark ok/warn/err #4ade80 / #fb923c / #f87171 on #242430 | 8.80 / 6.77 / 5.54 | yes |
| light err #b91c1c on #e8e4e1 | 5.12 | yes |
| light ok #15803d, warn #b45309 on #e8e4e1 | 3.97, 3.97 | icon only (3:1). Rule: all status text (row status, Test result, badges, chips) uses `base-content`; only the icon (and badge border) carries the ok/warn ink |
| `kind-cli` / `kind-ptah` coloured text on the card surface | measure at implementation, >= 4.5:1 in dark and light | required |
| focus ring dark #8ab4ff on #242430; light #1d4ed8 on #e8e4e1 | 7.34; 5.30 | yes |
Project statement: `--bcm` >= 4.5:1 on base-100/200/300 (`base-content-muted.spec.ts`); real tokens govern. Re-measure with the real oklch values at implementation.

## Unchanged capabilities (keep)
Decision 24. These adopt the section pattern (`ptah-form-section` + `--ptah-card-padding-lg`), the icon map and caps only; no restructure.
| Capability | Parity id | Adopts |
|---|---|---|
| Licensed membership state: Account rows (name, email), "Manage Membership" button (`ExternalLink`), Log out (`LogOut`) with its inline confirm (`ptah-inline-confirm`, Esc/Cancel return focus); badges Plan/State kept in the aside | A-5, A-6, A-9 | section pattern, icons (`CircleCheck` active), same rows as the unlicensed state minus "Enter membership key" |
| Overview instrument band and Setup segment | A-1 | page container padding, icon |
| Import settings inline confirm (in the header action row) | A-3 | `ptah-inline-confirm`, `Upload` icon |
| Run onboarding again, Check Claude Code | A-32 | section pattern, labelled buttons (`Play`, `RefreshCw`) |
| Fine-tuning disclosures (one closed `ptah-disclosure` per upkeep group) | A-30 | section pattern |
| Output style notices (error + dismiss, missing-style, name-collision) and command-line parity section | A-34, A-35 | `ptah-alert`, `TriangleAlert`, popover cap |
| Provider catalog modal and hint popover | P-64, P-65 | modal shell, popover cap |
| Partial read error row | P-10 | specified in Lanes states |

## Finding coverage
| Finding | Resolved by |
|---|---|
| P1-P4 | Shared rules: modal shell |
| P5-P7 | Popover cap rule |
| P8, F13 | `X` icon close (popover header, drawer) |
| P9 | Merged: one Reorder toggle; flat list with grip + up/down |
| P-66, P-29/50/53 | Copilot switch; inline All capabilities (decisions 19, 20) |
| P10 | Merged: one Add control in Ptah group header |
| P11 | Re-detect `RefreshCw` icon-only |
| P12 | Capability facts inline (decision 13) |
| P13 | Native behavior inline text, clamp + More/Less |
| P14 | Single detail footer, kebab trimmed |
| P15, P16 | `RotateCcw` icon-only reset |
| P17 | Sign in link in row; hidden copy removed |
| P18 | Two-line equal rows |
| P19 | Own kebab column |
| P20 | Inherited-value box |
| P21 | Two-column `dl` + one footer |
| P22 | Add more strip |
| P23, P25 | Defaults in Ptah group header; card lists removed (R-2) |
| P24 | Group headers + accent |
| P26 | Max concurrent in card header |
| P27-P30 | Icon map |
| P31 | Focusable `Info` button |
| P32 | `TriangleAlert` icon replaces glyphs |
| P33 | Kebab icons; Details -> expander |
| F1, F2 | `--ptah-card-padding-lg` + global glass rule |
| F3 | Row pattern: no last divider |
| F4 | Fixed control column |
| F5, F6 | Merged controls 6, 7 |
| F7 | Output style via `form-section` wide |
| F8 | Section gap always |
| F9 | Hint wraps |
| F10, F11, F16 | Popover cap |
| F12, F14, F15 | Drawer rules (spec only; verified in code review) |
| F17 | Keep (already correct) |
| F18-F21 | Control rule table |
| F22-F25 | Icon map, states |
| F26-F33 | Tools section layout |
| F34, F35, F37, F38 | Shell rules in Advanced (no prototype; verified in code review) |
| F36, F40 | `stateMark` dot + title |
| F39 | Keep unchanged |
| F41 | Mojibake fixed in code, no design change |

## Merged controls
1. Edit order + reorder pencil popover -> one Reorder toggle (keeps drag and up/down). 2. Header "New Ptah CLI instance" + card "+ Add" -> one Add in group header. 3. "All capabilities" button + kebab entry + chip popovers -> inline capability facts and an inline "All capabilities" disclosure. 4. "Info" + "Native CLI behavior" popover buttons -> inline text. 5. Duplicate Install guide / Sign in copy in status cell. 6. Aside badges vs Plan/State rows. 7. Toolbar "Enter Membership Key" + alert "Re-enter" -> one control. 8. Kebab "Details" -> row expander. 9. Ptah CLI defaults card + instances card -> Ptah group header.

## Proposed Removals (approved by the user 2026-11-20; exactly R-1..R-3, none added)
| # | Item | Reason |
|---|---|---|
| R-1 | Order "--" cell, Permission/Network selects, model/effort trigger, enabled toggle and kebab Test of a not-installed CLI (U-1, U-9, U-11, U-12, U-13) | Decision 8 moves the row to the strip; the controls are disabled today. Saved `disabledClis` and lane defaults stay stored |
| R-2 | Never-shown instance card list in `ptah-cli-instances` (P-61), `PA/ptah-cli-instances.component.html:64-500` | Dead UI: matrix passes `[rows]="[]"` |
| R-3 | Pencil reorder popover (M-1), kebab "Details" (M-5), hidden identity install link (M-4) | Duplicates; each action stays via the merged control (drag and up/down stay in Reorder mode) |

## Decisions
| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Version/provider not repeated in detail | repeat / row line 2 only | decision 13 rule; row line 2 carries them | yes |
| Permission, Network, Model appear in detail only when the table hides those columns | always / never / when hidden | no capability lost at 800px | yes |
| Group switch acts on visible (filtered) rows | all / visible | matches the label "N shown" | yes |
| Membership alert folded into key row, popover kept | banner / folded | decision 10, F6 | yes |
| New tokens limited to 3 | per-component values | P5, P1, P18 | yes |
| Prototype hex are approximations | n/a | tailwind.config.js oklch values govern | yes |
| Primary button follows glass-theme look (light lavender fill) | daisyUI primary | existing screenshots | yes |
| Light status text uses base-content, ink on icon only | darker inks | 3.97:1 measured | yes |
| Sample data (commands, tokens, skills, paths, "Second Lane") are placeholders | n/a | real data from `CLI_INSTALL_GUIDES` and builtins RPC | yes |
| Kebab rule | CLI: Test, Sign in; Ptah: Test | decision 23 | yes |
| Reorder = one flat list; grip + up/down | per-group / flat | decisions 14, 18 | yes |
| Kind badges two text colours; 1.75rem group gap | one style / two | decisions 16, 17 | yes |
| Copilot auto-approve switch; inline All capabilities; Add-more Details | remove / keep | decisions 19, 20, P-66 | yes |
| Advanced uses `form-section [wide]` | cap / wide | decision 21 | yes |
| Popover cap default-on with `capToViewport` opt-out | opt-in / default | decision 22 | yes |
| Reuse `--ptah-card-padding-lg`; 3 new tokens | add token / reuse | review Minor 1 | yes |
| Prototype geometry checks (800x600, 1600x900, themes) are done by the prototype verifier, not in this spec | n/a | task split | yes |

## Clarifications Needed
None. R-1..R-3 approved (decision 15).

## Revision log (round 1)
| Review item | Resolved in |
|---|---|
| Blocking 1, 2 | Lanes > Reorder mode; Merged controls 1 |
| Serious 1, 2 | Expanded detail (Copilot switch, All capabilities); Add more strip (Details) |
| Serious 3 | Accessibility (light status rule, contrast table) |
| Serious 4 | Section pattern (`wide`), Row pattern (`[action]` slot) |
| Serious 5 | Unchanged capabilities (keep) |
| Serious 6 | Claude Code tools > States |
| Serious 7 | Tokens > Popover cap implementation |
| Serious 8 | Row (kebab rule), Decisions |
| Minor 1 | Tokens (reuse `--ptah-card-padding-lg`, delete `--ptah-surface-pad`) |
| Minor 2, 3, 4, 5, 6, 7 | Card header; Expanded detail; Add more strip; States; Tier models |
| Minor 10, 12, 13 | Claude Code tools (aria-disabled, sticky dependency, "Hidden by default") |
| Minor 8, 9, 11 | Row (tooltips, model id title, Order header) |
| Parity gaps table | Unchanged capabilities, Lanes sections above (P-1, P-7, P-9, P-10, P-13, P-45, P-66, U-8/10/14) |
