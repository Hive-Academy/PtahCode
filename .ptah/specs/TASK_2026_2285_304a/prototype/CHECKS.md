# Prototype checks

Rendered with the headless browser tool from `file://` (Chromium). Viewport confirmed via `innerWidth/innerHeight`.

| Screenshot (in `screens/`) | What was checked | Result | Fix |
| --- | --- | --- | --- |
| `lanes-800x600-dark.png` (`?nav=1`) | `fixSpans()` + ResizeObserver; Lane column width; horizontal overflow; detail layout | PASS. Lane th = 327 px (was 65 px before the fix); `#page` scrollWidth 577 = clientWidth 577; Status/Permission/Network/Model hidden (0 px) and shown in the detail; group header and detail span the visible columns; detail is one column | none needed |
| `lanes-1600x900-dark.png` (Claude row expanded) | overflow, clipped text, alignment, decision 13 | PASS after fix | Detail labels "Permission modes" / "Network" repeated what the row's Permission and Network controls show. Renamed to "Permission support" / "Network support" (line 637). Labels fit on one line |
| `lanes-1600x900-light.png` (Claude row expanded) | same, light theme | PASS (taken before the rename; same layout, labels shorter now, so no new wrap risk) | same rename |
| `modal-800x600-dark.png` (`?modal=1`) | header and footer stay visible while body scrolls | PASS. Box 568 px high at y 16-584 (<= 600-32); header y 17-74, footer y 526-583; body `overflow-y:auto`, scrollHeight 1043 > clientHeight 452 | none needed |
| `advanced-1600x900-dark.png` | overflow, clipping, alignment | PASS. Two-column sections align; no overflow | none |
| `advanced-1600x900-light.png` | same, light | PASS. Accent turns teal in light (as in the project theme); text readable | none |
| `tools-1600x900-dark.png` (`?view=tools&expandTools=1`) | two-column grid, token badges, summary | PASS. No clipping | none |
| `tools-800x600-dark.png` (`?view=tools&expandTools=1&nav=1`) | single column, overflow | PASS. `#page` 577/577, no horizontal scroll; info alert wraps | none |

## Decision 13 (expanded lane detail)

Checked on the Claude row (screenshots above). The detail has no model/effort, permission, network or enabled control and no repeated version or provider line (Provider appears only in the detail for CLI agents, where the row line 2 shows the version, not the provider). Information (Provider, Account, Executable, Native behavior, capabilities) is inline read-only text. The only buttons are real actions: Test, and the icon-only Reset to default. Permission/Network/Model rows appear in the detail only when the table hides those columns (narrow container), per the design.

## Not checked

- Ptah CLI rows, Cursor and Ollama expanded details, loading/empty/error states, Reorder mode, kebab menus, Install popovers and the membership key popover were not re-rendered in this pass (they were built by the predecessor and not screenshotted here).
- The 800x600 light theme, the 1600x900 view with `?nav=1`, and tools/modal in light were not captured (screenshot budget).
- Keyboard and focus order, screen-reader behaviour, and the contrast pairs (not computed here; hex values are approximations of the project's oklch theme).
- Real Electron rendering and the real Angular components: this is a static HTML prototype.
- Minor, not fixed: on the tools view with `?nav=1` the settings nav highlights "Providers" (a prototype nav limitation, not a design item).

## Round 1
- [x] 1 kind badges: `.badge.kind-cli` (info blue) and `.badge.kind-ptah` (new `--gold`, #d4af37 dark / #8a6500 light); both read as tinted border + text. Ratios not computed, not measured with a tool (estimated above 4.5:1).
- [x] 2 gap: `tr.grp.second th` padding-top 1.75rem above the Ptah group header.
- [x] 3 light theme: status text and "Needs attention" badge text use `--bc`; icon keeps ink.
- [x] 4 status cell: empty `.l2` hidden so the one-line status centers with the selects. "Needs API key" rows keep a second line (Sign in).
- [x] 5 reorder: one flat list in order (enabled lanes by order, then disabled), no group headers, grip handle (HTML5 drag/drop) + up/down; verified up/down moves the row. Leaving Reorder returns to grouped view.
- [x] 6 kebab: CLI/Ptah rows = Test (+ Sign in for Cursor). Note: the CLI detail footer still has its reset icon (not in scope of the request); Ptah footer unchanged (Edit tiers, Edit, Delete).
- [x] 7 detail: "All capabilities" disclosure (collapsed, read-only), Account for Claude only, Ptah "Tier models" = "3 of 3 set" + one line per tier (tier model id reuses the lane's model: placeholder data).
- [x] 8 Add more: icon-only re-detect in strip header, "Details" disclosure per card (shows install command).
- [x] 9 Max concurrent max=100; model button `title` = full model id (prototype data only has the short id).
- [x] 10 tooltips on row expander, popover Close, "Clear filter".

Screenshots (screens/): lanes-1600x900-dark.png, lanes-1600x900-light.png, lanes-reorder-1600x900-dark.png, lanes-nav-1600x900-dark.png.
Not captured: a true 800x600 render. The browser session kept its first viewport (1600x900) on re-navigation, so the `?nav=1` shot is 1600 wide with the 13rem nav, not the 800px window. The 800px layout was not re-checked after these edits.
