# UI review: Settings > Providers (Lanes section)

Path prefixes: `PA/` = `libs/frontend/chat/src/lib/settings/ptah-ai/`, `PR/` = `libs/frontend/chat/src/lib/settings/providers/`,
`UI/` = `libs/frontend/ui/src/lib/`. Shared popover and drawer defects are in `ui-review-advanced.md` (F10, F13, F17). This file does not repeat them.

## Summary

- The Lanes table mixes three row kinds (installed CLI agents, Ptah CLI instances, CLI agents that are not installed) in one flat list. The two Ptah CLI cards below the table repeat its "add instance" action and hold the defaults far from the rows that use them.
- Row height is a fixed `49px` minimum, and the identity cell adds a second line only for some rows. The status cell uses absolute placement for the kebab menu. These two causes make the misalignment in the screenshots.
- The expanded row detail uses three unrelated grid areas (facts, chips, actions) with 12 outline text buttons. Most of them must be icon buttons or one menu.
- The shared modal (`ptah-native-modal`) scrolls the whole `modal-box`, so the header and the Save footer scroll away. The model/effort popover and the catalog hint popover have no height cap. They are the overflow sources specific to this page.
- Icons are almost absent: section title, column headers, statuses, and detail actions have no lucide icon.

## Findings

| # | Severity | Category | file:line | What is wrong | Exact fix |
|---|---|---|---|---|---|
| P1 | Serious | overflow | `UI/native/modal/native-modal.component.ts:82` | The `modal-box` is the only scroll container (daisyUI 4 default: `max-height: calc(100vh - 5em); overflow-y: auto`). The header and footer are projected into the same box, so in a short Electron window the title, Close and Save scroll out of view. All centered modals on this page use it (P2, P3, P4). | Make the box a flex column with a scroll body: `class="modal-box flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0"`, wrap the default `<ng-content />` in `<div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">`, give header and footer `shrink-0`. Remove the `-mx-6 -mt-6` / `-mx-6 -mb-6` negative margins in the callers after that. |
| P2 | Serious | overflow | `PR/add-cli-instance-modal.component.html:7-9,59-61` | The header and footer use `-mx-6 -mt-6` / `-mx-6 -mb-6` to bleed to the box edge. They depend on the box padding and scroll with the body (P1). The provider select and the model search list (autocomplete `max-h-80`) open inside a box of `calc(100vh - 5em)`: in a window under about 600px high, the list is cut by the box scroll. | Apply P1. Header `shrink-0 border-b px-5 py-3`, footer `shrink-0 border-t px-5 py-3` without negative margins. Use the size `md` (`max-w-lg`) as today. |
| P3 | Serious | overflow | `PR/cli-tier-mapping-modal.component.html:9,15-60,185-187` | Three tier rows, each with a model search field and an effort select. Same header/footer pattern as P2. The Save footer scrolls away. | Apply P1. Keep the `<ul class="space-y-3">` in the scroll body. |
| P4 | Moderate | overflow | `PR/provider-catalog-modal.component.ts:29,42` | The list has its own `max-h-[50vh] overflow-y-auto` inside a box that also scrolls: two nested scroll areas. With a short window, 50vh plus the search field plus header is near the box limit. | After P1, remove `max-h-[50vh]` and let the P1 body scroll. Keep the search field in the header slot so it stays visible. |
| P5 | Serious | overflow | `PA/cli-model-effort-popover.component.ts:114` | The model/effort popover has `max-w-[calc(100vw-2rem)]` but no width and no max-height. It holds notes, an error line, and a model search field whose list opens below "over the page" (`:170`). In a short window, opened from a lower row (Pi, OpenCode), the panel and its list go past the window bottom. Shared cause is F10. | Add `w-[20rem] max-h-[min(28rem,calc(100dvh-2rem))] overflow-y-auto`. Use the `capPopoverHeight` rule (`PR/popover-height-cap.ts:18`) as the Main Agent popover does (`PR/main-agent-reassign-popover.component.ts:679`). |
| P6 | Moderate | overflow | `PR/providers-settings.component.ts:278-306` | The catalog hint popover body is `p-[var(--ptah-gap-field)]` only: no width, no max-height. The catalog list grows with the provider count. | Add `w-72 max-h-[min(24rem,calc(100dvh-2rem))] overflow-y-auto` to the `content` div. |
| P7 | Minor | overflow | `PA/cli-provider-card-popovers.component.ts:17`, `PA/cursor-credential-popover.component.html:4`, `PA/lanes-table-detail.component.css` (`.capability-value`) | Fixed width with `max-w-[calc(100vw-2rem)]`, no max-height. Content is short today (permission text, install command, capability value), so overflow risk is low. The install guide can grow with the note and command. | Add `max-h-[calc(100dvh-2rem)] overflow-y-auto` to each root. |
| P8 | Moderate | buttons | `PA/cli-provider-card-popovers.component.ts:21` | The popover Close is a ghost text button "Close", but the other popovers on the page use an icon `X` button (`PA/cursor-credential-popover.component.html:19-25`, `PA/cli-model-effort-popover.component.ts:129-135`). | Use `ptahIconButton label="Close"` with `<lucide-angular [img]="X" class="h-3.5 w-3.5" />`. |
| P9 | Serious | structure | `PA/lanes-section-header.component.ts:27-46` and `PA/agent-orchestration-config.component.html:109-135` | Two controls edit the order: "Edit order" (header, switches the table into up/down mode) and the pencil icon next to the order chips (opens a reorder popover). Same task, two paths, two places. | Keep one. Remove the pencil popover from the policy bar. Make the header control an icon + label toggle: `ArrowUpDown` + "Reorder" (pressed state shows `Check` + "Done"). |
| P10 | Moderate | buttons | `PA/lanes-section-header.component.ts:36-46`; `PA/ptah-cli-instances.component.html:21-31,50-58` | "New Ptah CLI instance" (header) and "+ Add Ptah CLI instance" (instances card) do the same thing. The header version has no icon. | One control. Put `Plus` + "Add Ptah CLI instance" at the head of the Ptah CLI group (see Proposed structure). Remove the header button. |
| P11 | Moderate | buttons | `PA/agent-orchestration-config.component.html:172-200` | "Re-detect CLIs" is an outline button with a small `h-3 w-3` icon and text. It is a refresh of the CLI list, so it belongs with the "Add more" area and the CLI group, not the policy bar. | Icon-only `ptahIconButton` with `RefreshCw` (`h-4 w-4`), `label="Re-detect CLI agents"`, tooltip. Place it in the CLI agents group header. Keep the spinner state (`animate-spin` on the same icon). |
| P12 | Serious | buttons | `PA/lanes-table-detail.component.html:98-137` | The five capability chips (Messaging, Permission, Network, MCP, Limit) are outline **buttons** that each open a popover with one line. They look like actions, and "Permission" is also the label of the "Native CLI behavior" button (`:47`) beside them. | Show capabilities as a read-only definition list in the detail (label + value, one line each) with a lucide icon per item: `MessageSquare` Messaging, `ShieldCheck` Permission, `Globe` Network, `Plug` MCP, `Gauge` Limit. Remove the popovers. Long values use `title` and wrap. |
| P13 | Moderate | buttons | `PA/lanes-table-detail.component.html:28-57` | "Native CLI behavior" shows a button with the text "Permission" that opens a popover with one sentence. A button label that repeats the column name gives no information. | Show the value as text (`system.permission.detail` short form) and an `Info` icon button (`label="About native CLI behavior"`) for the long text. |
| P14 | Serious | buttons | `PA/lanes-table-detail.component.html:139-308` | The actions column holds 5 to 7 outline text buttons of equal weight: Test, All capabilities, Info, Install guide, Credentials / Codex settings, Reset to default, Edit tiers, Edit, Delete. "All capabilities" duplicates P12 and the kebab item (`PA/lanes-table.component.html:165-173`). | Keep 1 primary action as icon + label: `Play` "Test" with the result text next to it. Move Info, Install guide, All capabilities, Reset to default into the row kebab (they are already partly there). Keep lane-specific setup as icon + label: `KeyRound` "Credentials", `Settings2` "Codex settings", `Layers` "Edit tiers". Instances: `Pencil` icon button "Edit", `Trash2` icon button "Delete" (danger tone, at the end). |
| P15 | Moderate | buttons | `PA/lanes-table.component.html:505-516`, `PA/cli-lane-default-cell.component.ts:131-139` | "Reset to default (plan)" is an outline text button with a parenthetical value. It is a rare, undo-type action. | `ptahIconButton` with `RotateCcw`, `label="Reset to default (plan)"` as tooltip, placed next to the Permission/Network values it resets. |
| P16 | Serious | buttons | `PA/cli-lane-default-cell.component.ts:230-249` | In `wide` layout (Ptah CLI defaults card) "More default actions" is a visible ghost **text** button above the selects (screenshot 2). It reads like a caption. The `card` layout of the same component uses an icon `Ellipsis` button (`:110-125`). | Use the same `ptahIconButton` + `Ellipsis` as `card` layout, or (better, with P15) a `RotateCcw` icon button. Remove the text button. |
| P17 | Moderate | buttons | `PA/lanes-table.component.html:115-140`, `PA/lane-row-identity.component.ts:179-190` | "Install guide" / "Sign in" are ghost text buttons in the Status cell. They push the kebab and make the status cell content vary in width. Two copies exist; CSS hides one (`PA/lanes-table.component.css` "Recovery is visible beside Status"). | With the "Add more" area (P22) these rows leave the table. For a lane in the table that needs a key (Cursor): use icon + label `LogIn` "Sign in" as a `btn-xs` link. Delete the hidden copy in `lane-row-identity`. |
| P18 | Serious | alignment | `PA/lanes-table.component.css:158-160`, `PA/lane-row-identity.component.ts:157-163` | `tr { height: 49px }` is a minimum in table layout. The identity cell has a second line (version or provider) for installed rows only, so those rows are 49px and the others grow or shrink with content (screenshot: Codex/Ollama rows vs Copilot/Cursor). | Give every row the same two-line identity: name + kind on line 1, a muted line 2 for all rows (`v1.0.89`, provider name, or "—"). Set `height: 3.5rem` on data rows. Or move version to the detail and use one line for all rows. Pick one. Recommended: two lines for all. |
| P19 | Serious | alignment | `PA/lanes-table.component.css:328-347` | The Status cell has `padding-inline-end: 2.5rem` and the kebab is `position: absolute; top: 50%`. Status text, recovery button and kebab sit in one cell, so the kebab is not in its own column and its x position depends on the status column width (`23%` / `7rem` / `13rem` per tier). | Give the kebab its own last-but-one column (`<col class="w-10">`, `<th><span class="sr-only">Actions</span></th>`), next to the expander. Remove the absolute placement and the `padding-inline-end`. |
| P20 | Serious | alignment | `PA/lanes-table.component.html:226-232,247-253`; `PA/lanes-table.component.css:46-49` | Ptah CLI rows show plain text "Unavailable" in the Permission and Network cells, while CLI rows show `sm` selects. The text has no box and a smaller font (`0.75rem`), so the columns look ragged. Grok shows "Select mode" placeholder, which reads as an empty value. | For instance rows render a muted, non-interactive value in the same box size: `<span class="inline-flex h-8 items-center gap-1 text-xs text-base-content-muted"><lucide Link2 class="h-3.5 w-3.5"/>From Ptah CLI defaults</span>` (and show the inherited value). For a CLI with no saved value show "Default" instead of the placeholder "Select mode". |
| P21 | Serious | alignment | `PA/lanes-table-detail.css:8-16,85-95` | The wide detail grid is `minmax(0,1.4fr) max-content minmax(0,1fr)` with areas `facts chips actions`. The middle track is `max-content`, so its width follows the chip count, and the three clusters do not line up with any table column. Facts use a `8.5rem` label column; chips and actions have no labels. | Use a 2-column grid: left `dl` of facts (Model/Effort, Provider, Account, Version, Native behavior) and right `dl` of capabilities (P12), both `grid-template-columns: 9rem 1fr`. Put actions in one footer row across both columns: `flex items-center gap-2 border-t pt-3`, Test on the left, other actions right-aligned. |
| P22 | Serious | structure | `PA/lanes-table.component.html:65-80`, `PA/cli-matrix-rows.ts` | CLI agents that are not installed are full rows with "—" order, disabled selects, disabled toggle and an expander. They take 4 of 10 rows and carry no usable control. | Filter rows with `kind === 'system' && status.kind === 'not-installed'` out of the table. Render them in an "Add more CLI agents" strip (see Proposed structure). |
| P23 | Serious | structure | `PA/cli-orchestration-matrix.component.ts:198-218` | "Ptah CLI defaults" and "Ptah CLI instances" are separate cards under the table. The instances card gets `[rows]="[]"` (`:210`), so it only shows a title and an Add button; the real instance rows are in the table. The defaults apply to those rows but sit far from them. | One Lanes card with two `tbody` groups (P24). Move `ptah-cli-shared-defaults` into the Ptah CLI group header as a compact inline pair. Delete the `ptah-cli-instances` card from the matrix. |
| P24 | Moderate | structure | `PA/lanes-table.component.html:48-65` | Kinds are only shown by a small "CLI agent" / "Ptah CLI" badge per row. Order is global across both kinds, which is correct, but the eye cannot group them. | Keep one global order. Do not split order. Add a visual group marker that does not break order: either (a) two `<tbody>` with a group header `<tr><th colspan="9" scope="rowgroup">` when the user sorts by kind, or (b) keep order and add a left accent border `border-s-2 border-primary/40` on Ptah CLI rows plus a legend in the header. Recommended: (b) in order mode, (a) is the default view only if the product accepts per-kind order. See Clarifications. |
| P25 | Minor | structure | `PA/ptah-cli-instances.component.html:64-500` | About 430 lines render instance cards that never show, because the matrix passes `[rows]="[]"`. | Remove the card list when P23 lands, or keep the component only for the empty state and Add. |
| P26 | Moderate | alignment | `PA/agent-orchestration-config.component.html:13-30` | "Max Concurrent" is a `w-48` floating-label field in the order strip row. It is taller than the chips and the label is clipped by the border (screenshot 1). It is a policy number, not part of the order. | Move it to the section header actions as a compact `input-sm w-20` with a left `Layers` icon and label "Max concurrent". Keep the order strip as one line of chips. |
| P27 | Moderate | icons | `PA/lanes-section-header.component.ts:4-9`; `PA/cli-shared-defaults.component.ts` heading | "Lanes", "Ptah CLI defaults", "Ptah CLI instances" titles have no icon, while the nav has icons. | `Route` (or `Workflow`) for Lanes, `SlidersHorizontal` for defaults, `Boxes` for Ptah CLI group, `Terminal` for CLI agents group, `PackagePlus` for "Add more". Size `h-4 w-4 text-base-content-muted`. |
| P28 | Minor | icons | `PA/lanes-table.component.html:35-46` | Column headers are text only. | Icons are optional for column headers. Add them only to Permission (`ShieldCheck`), Network (`Globe`), Model (`Cpu`) at `h-3.5 w-3.5`. Keep Order, Lane, Status, Enabled as text. |
| P29 | Moderate | icons | `PA/lanes-table-status.component.ts:20-29` | Statuses are a dot + text ("Installed", "Not installed", diamond "Needs API key"). Colour and shape alone carry the meaning. | Use `CircleCheck` (success), `KeyRound` (needs key, warning), `CircleDashed` (not installed, muted), `CircleAlert` (error), `Loader2 animate-spin` (testing). Keep the text. |
| P30 | Minor | icons | `PA/lanes-table.component.html:554-573`; `PA/cli-orchestration-matrix.component.ts:181-189` | Empty, loading and error states are plain text ("No lanes available.", "Loading lanes…"). | `Inbox` for empty, `Loader2` for loading, `TriangleAlert` + `RotateCw` "Retry" for error. |
| P31 | Minor | a11y | `PA/lanes-table-status.component.ts:88-95`, `PA/lane-row-identity.component.ts:173-177` | The unsupported-combination mark is the glyph `&#9432;` in a `tabindex=0` span with `title` only. A keyboard user cannot read the title. Screenshots show the same `ⓘ` for Grok, Cursor, Pi. | Use `ptahIconButton` with `Info` and a tooltip that shows on focus, `label="Unsupported combination: …"`. |
| P32 | Minor | a11y | `PA/cli-lane-default-cell.component.ts:210-213,252-258` | Warning uses text glyphs `⚠` and `&#9888;`. | Use lucide `TriangleAlert` `h-3.5 w-3.5 text-warning` with `aria-hidden`, keep the sr-only text. |
| P33 | Minor | a11y | `PA/lanes-table.component.html:141-202` | The kebab menu items have no icons, and "Details" duplicates the expander. | Remove "Details" (expander does it). Add icons: `Play` Test, `ListChecks` All capabilities, `Layers` Tiers, `Pencil` Edit, `Trash2` Delete (danger), `Info` Info, `BookOpen` Install guide, `RotateCcw` Reset default. |

## Proposed structure

One card: "Lanes". Order stays global. Ptah CLI instances are rows in the same table, marked by a group accent. Uninstalled CLI agents leave the table.

```
┌ Lanes  [10]  ─────────────────────────────────── (6/10) [⇅ Reorder] [Max concurrent: 20] ┐
│ Ptah tries enabled lanes from the top when a task does not name one.                     │
│ Order: 1 Codex → 2 Ollama Code → 3 Claude → 4 Antigravity → 5 Grok → 6 kimi code          │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│  #  Lane                     Status          Permission    Network     Model       On ⋮ ›│
│ ── ⌨ CLI agents ─────────────────────────────────────────── [⟳ re-detect] ────────────── │
│  1  ◉ Codex      CLI agent   ✔ Installed     [Yolo   ▾]    [Allowed▾]  gpt-6.1 · high [●] ⋮ ›│
│     v0.165.0                                                                             │
│  3  ›_ Claude    CLI agent   ✔ Installed     [Yolo   ▾]    [Allowed▾]  CLI default    [●] ⋮ ⌄│
│     v2.x                                                                                 │
│   ┌ detail ─────────────────────────────────────────────────────────────────────────┐   │
│   │ Model / effort  CLI default · default ▾   │ ✉ Messaging   yes                    │   │
│   │ Provider        Anthropic                 │ 🛡 Permission plan·ask·auto·yolo      │   │
│   │ Native behavior plan (ⓘ)                  │ 🌐 Network    allowed                │   │
│   │ Account         Second Lane ▾             │ 🔌 MCP        yes                    │   │
│   │ Version         v2.x                      │ ◔ Limit       …                      │   │
│   │ ───────────────────────────────────────────────────────────────────────────────  │   │
│   │ [▶ Test]  Not run yet                     [🔑 Credentials] [⟲] [ⓘ] [⋯]          │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
│  4  ▲ Antigravity CLI agent  ✔ Installed     [Plan   ▾]    [Allowed▾]  claude-…    [●] ⋮ ›│
│  5  ⌀ Grok  ⓘ    CLI agent   ✔ Installed     [Default▾]    —           CLI default [●] ⋮ ›│
│     Cursor  ⓘ    CLI agent   🔑 Needs key [→ Sign in]  …                           [○] ⋮ ›│
│ ── ▦ Ptah CLI instances ─ defaults: Permission [Yolo▾]  Network [Allowed▾]  [+ Add] ──── │
│  2 ┃ Ollama Code  Ptah CLI   ✔ Installed     ⛓ Yolo (default)  ⛓ Allowed   glm-5.3 · high [●] ⋮ ›│
│     Ollama Cloud                                                                         │
│  6 ┃ kimi code    Ptah CLI   ✔ Installed     ⛓ Yolo (default)  ⛓ Allowed   k3.1-pro · med [●] ⋮ ›│
│     Kimi Code                                                                            │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 📦 Add more CLI agents                                                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                                      │
│  │ ◎ Copilot     │ │ ▯ OpenCode    │ │ π Pi          │                                     │
│  │ Not installed │ │ Not installed │ │ Not installed │                                     │
│  │ [📖 Install]  │ │ [📖 Install]  │ │ [📖 Install]  │                                     │
│  └──────────────┘ └──────────────┘ └──────────────┘                                      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Notes on the wireframe:

- The group header rows are `<tr><th scope="rowgroup" colspan="9">`. The order numbers stay global (2 and 6 are in the Ptah CLI group). This keeps the "tries from the top" rule visible while the kinds are grouped. See Clarifications for the alternative (one list, accent only).
- A row with "Needs API key" stays in the CLI group because it is installed. Only `not-installed` rows move to "Add more".
- Each "Add more" card needs: `cli` id, `name`, provider mark id, `status.kind`, `CLI_INSTALL_GUIDES[cli].command` and `.note` (`PA/cli-orchestration-matrix.component.ts:51`), the `recover(row)` handler (`PA/lanes-table.component.ts:92`) that opens the install guide, and `redetect` after install. Card: `rounded-lg border border-base-300 p-3 flex flex-col gap-2 w-44`, grid `grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2`. The Install action opens the existing install-guide popover (command with copy, note, Re-detect).
- Expanded detail: 2 columns of `dl` (`grid-cols-[9rem_1fr]`) and one action footer. In a narrow pane (container under 600px) the two `dl` stack.

## Modal inventory

| Component | File | Max-height tied to viewport? | Own scroll area? | Max-width | Can overflow? | Fix |
|---|---|---|---|---|---|---|
| Shared modal primitive | `UI/native/modal/native-modal.component.ts:82` | Yes, daisyUI default `calc(100vh - 5em)` | Whole `modal-box` scrolls, header and footer included | `sm` `max-w-sm`, `md` `max-w-lg`, `lg` `max-w-2xl` | No window overflow, but header and Save scroll away | P1 |
| Add / edit Ptah CLI instance | `PR/add-cli-instance-modal.component.html:1-261` | Inherited | Inherited (whole box) | `max-w-lg` | Footer scrolls out; autocomplete list cut | P1, P2 |
| CLI tier mapping | `PR/cli-tier-mapping-modal.component.html:1-202` | Inherited | Inherited | `max-w-lg` | Footer scrolls out | P1, P3 |
| Provider catalog | `PR/provider-catalog-modal.component.ts:29-42` | Inherited + list `max-h-[50vh]` | Two nested scroll areas | `max-w-lg` | Double scroll | P4 |
| Provider setup wizard | `PR/provider-setup-wizard.component.ts:294-298` | Drawer `h-full` | Drawer body `overflow-y-auto` | `max-w-2xl` | No (shared drawer, see F17) | — |
| Connection detail drawer | `PR/connection-detail-drawer.component.ts:67` | Drawer `h-full` | Drawer body | `max-w-lg` | No (see F13, F17) | — |
| Main agent reassign popover | `PR/main-agent-reassign-popover.component.html:20-21,67` | Yes, `capPopoverHeight` | Yes | `w-[21rem] max-w-[calc(100vw-2rem)]` | No | Model to copy |
| Model / effort popover | `PA/cli-model-effort-popover.component.ts:114` | **No** | **No** | `max-w-[calc(100vw-2rem)]`, no width | **Yes** (long notes + search list, lower rows) | P5 |
| Preferred order popover | `PA/agent-orchestration-config.component.html:139` | Yes `max-h-[calc(100vh-…)]` | Yes | `w-[16rem]` | No | Remove with P9 |
| Capability / Info / Install / Permission popovers | `PA/cli-provider-card-popovers.component.ts:17` | No | No | `w-[19rem]` | Low risk | P7, P8 |
| Capability chip popover | `PA/lanes-table-detail.component.html:125-132` | No | No | `min(20rem,80vw)` | Low risk | Remove with P12 |
| Instance "All capabilities" popover | `PA/lanes-table-detail.component.html:266-270` | `max-h-72` (fixed, not viewport) | Yes | `w-72` | Low | Use `max-h-[min(18rem,calc(100dvh-2rem))]` |
| Cursor credentials popover | `PA/cursor-credential-popover.component.html:4` | No | No | `w-[19rem]` | Low | P7 |
| Reset default popover | `PA/cli-lane-default-cell.component.ts:103-140,214-249` | No | No | none | No (one button) | Replace with P15 |
| Catalog hint popover | `PR/providers-settings.component.ts:278-306` | **No** | **No** | none | **Yes**, grows with catalog | P6 |

## Capabilities to preserve

| Capability | file:line |
|---|---|
| Lane count badge and enabled ring | `PA/lanes-section-header.component.ts:9,17-26` |
| Edit order mode (up/down per row) | `PA/lanes-section-header.component.ts:27-35`, `PA/lanes-table.component.html:80-89` |
| Reorder popover list | `PA/agent-orchestration-config.component.html:109-160` |
| Add Ptah CLI instance | `PA/lanes-section-header.component.ts:36-46`, `PA/ptah-cli-instances.component.html:21-31,50-58` |
| Max concurrent agents | `PA/agent-orchestration-config.component.html:13-30` |
| Order chips with "+N" overflow | `PA/agent-orchestration-config.component.html:43-81` |
| Re-detect CLI agents (with busy state) | `PA/agent-orchestration-config.component.html:172-200` |
| Retry after a read error | `PA/lanes-table.component.html:49-63,559-569` |
| Install guide / Sign in recovery | `PA/lanes-table.component.html:116-140`, `PA/lanes-table.component.ts:92-99` |
| Kebab: Details, Test, All capabilities, Tiers, Edit, Delete | `PA/lanes-table.component.html:141-202` |
| Inline delete confirm | `PA/lanes-table.component.html:204-211,542-549` |
| Permission / Network lane default per CLI | `PA/lanes-table.component.html:213-254` |
| Model and effort popovers | `PA/lanes-table.component.html:261-367` |
| Enabled toggle | `PA/lanes-table.component.html:375-391` |
| Row expander | `PA/lanes-table.component.html:392-400` |
| Unsupported combination warning | `PA/lanes-table-status.component.ts:85-97` |
| Detail: Version, Executable, Provider, Native behavior, Account | `PA/lanes-table-detail.component.html:11-67` |
| Detail (instance): Provider, Key status, Tier models | `PA/lanes-table-detail.component.html:68-96` |
| Capability chips | `PA/lanes-table-detail.component.html:98-137` |
| Test with result text | `PA/lanes-table-detail.component.html:140-157` |
| Info / All capabilities / Install guide popovers | `PA/lanes-table-detail.component.html:160-202` |
| Cursor credentials popover | `PA/lanes-table-detail.component.html:203-231` |
| Codex settings | `PA/lanes-table-detail.component.html:232-242` |
| Instance capabilities, Edit tiers | `PA/lanes-table-detail.component.html:243-305` |
| Reset to default, Edit, Delete (detail) | `PA/lanes-table.component.html:493-541` |
| Ptah CLI shared defaults + reset | `PA/cli-shared-defaults.component.ts`, `PA/cli-lane-default-cell.component.ts:214-249` |
| Collapsed layouts under 950px | `PA/lanes-table.component.html:7,11-21,428-481` |
| Add instance modal, tier modal | `PA/cli-orchestration-matrix.component.ts:221-231` |

## Decisions

- D1: Order stays one global list. Grouping must not change what "tries from the top" means. Group headers show global numbers.
- D2: Uninstalled CLI agents leave the table. "Needs API key" rows stay, because the CLI is installed.
- D3: Ptah CLI defaults move into the Ptah CLI group header. The separate cards are removed.
- D4: Rare or informative actions go into the kebab or become icon buttons with tooltip and `aria-label`. Primary or setup actions keep icon + label. Text-only buttons stay only for Retry in a message cell.
- D5: The modal fix is in the shared `ptah-native-modal` (P1), not per modal.
- D6: The kebab gets its own column. The status cell has no absolute content.

| Control today | Decision | Reason |
|---|---|---|
| Edit order | Icon + label (`ArrowUpDown` "Reorder") | Mode toggle; a pressed state needs a text state |
| Re-detect CLIs | Icon-only (`RefreshCw`) + tooltip | Common refresh idiom; low frequency |
| Messaging / Permission / Network / MCP / Limit | Not buttons: icon + text facts | They show values, not actions |
| Test | Icon + label (`Play` "Test") | Main action of the detail; result text next to it |
| All capabilities | Kebab item | Duplicate of facts and kebab |
| Info | Icon-only (`Info`) | Standard help idiom |
| Reset to default (plan) | Icon-only (`RotateCcw`), value in tooltip | Undo-type, rare |
| Install guide | Icon + label (`BookOpen` "Install") in "Add more" card | Only action of the card |
| Sign in | Icon + label (`LogIn` "Sign in") | Primary recovery of the row |
| Close in popovers | Icon-only (`X`) | Consistent with other popovers |
| Edit / Delete (instance) | Icon-only (`Pencil`, `Trash2`) | Standard row actions |

## Clarifications Needed

- C1: Group display. Option A: two row groups (CLI agents, Ptah CLI instances) with global order numbers, so numbers are not sequential inside a group. Option B: one list in global order with an accent bar on Ptah CLI rows and a legend. The wireframe shows A. B keeps the order easier to read. The product owner must choose.
- C2: Version line. Show it for every row (two-line rows) or only in the detail (one-line rows). The recommendation is two lines for all rows, with the provider name for Ptah CLI rows.
