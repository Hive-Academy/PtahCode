# Composites research (level 2)

Scope: `apps/ptah-extension-webview/src` and `libs/frontend/**`. Templates are `.html` files and inline `template:` strings in `.ts` files. Excluded: `*.spec.ts`, `*.stories.ts`, `libs/frontend/webview-e2e-harness`. Files come from `git ls-files`.

## Census method

Script: `.ptah/specs/TASK_2026_940_eef5/composites-census.py`. Run it from the repository root with `python -I .ptah/specs/TASK_2026_940_eef5/composites-census.py`. It is read-only and repeatable.

- The script reads 1,566 files and 640 templates. It finds 14,127 tags with a multi-line regex. 13,810 tags are outside `libs/frontend/ui`.
- A tag matches by static `class="..."` tokens, by `role` attribute, by tag name, or by attribute name. The script does not evaluate `[class]` or `ngClass`. It strips `{{ }}` from class values.
- A count is a static source occurrence. It is not a rendered repetition. A `@for` loop counts one time.
- All counts below are **outside** `libs/frontend/ui`, unless the text says otherwise. The owner components in `libs/frontend/ui` are not consumers.
- A lib group is a folder under `libs/frontend`. `chat-settings` is `libs/frontend/chat/src/lib/settings`. `app` is `apps/ptah-extension-webview`. The renderer has 25 groups.
- **Exact** means a class token, a role, a tag name or an attribute. **Heuristic** means a structural guess. The text marks each heuristic.
- A "private copy" is a feature-lib component whose selector matches a keyword. This is a heuristic. The script lists the selectors.
- Role counts include popovers and spinners. For example `role="dialog"` occurs 50 times. Most of them are popover content, not modals. Thus the dialog unit does not use `role`.

## Census table

"Raw" means the recipe that the family must replace. "Owner use" means a tag of an existing `libs/frontend/ui` component. "Groups" counts the lib groups of raw and owner use together.

| Composite | Unit (detection) | Raw | Owner use | Files (raw) | Groups | Rule type | Verdict |
|---|---|---:|---:|---:|---:|---|---|
| Badge, chip, status | class `badge` | 253 | 7 (`ptah-ui-status-badge` 3, `ptah-file-status-badge` 4) | 130 | 16 | exact | BUILD |
| Alert, banner | class `alert` | 77 | 1 (`ptah-state-panel`) | 43 | 15 | exact | BUILD |
| Skeleton, loading | classes `skeleton`, `loading`, tag `progress` | 244 (spinner 127, skeleton 100, progress 17) | 10 (`ptah-catalog-card-skeleton`) | 113 | 20 | exact | BUILD (spinner and skeleton) |
| List row | tag `li` (all lists) | 239 | 9 (`ptahListRow` 4, `ptahInboxRow` 5) | 128 | 19 | exact tag, heuristic as a row | BUILD |
| Row that is clickable | `flex items-center hover:bg-*` | 56 | 0 | 40 | 11 | heuristic | BUILD (part of list row) |
| Section and page header | tag `h1`-`h3` | 355 | 2 (`ptah-page-header` 1, `ptah-toolbar` 1) | 221 | 24 | exact tag, heuristic as a header | BUILD |
| Header row with actions | `justify-between items-center` plus first child `h*` | 37 | 0 | 35 | 15 | heuristic | BUILD (part of header) |
| Settings row | `<label>` 216, `<fieldset>` 25, `form-control` 9 | 250 | 7 (`ptah-field` 3, `ptahSettingsField` 2, `ptahSetupField` 2) | about 120 | 21 | exact tag, heuristic as a row | BUILD |
| Label and control row | `div flex items-center justify-between` | 127 | 0 | 102 | 19 | heuristic | BUILD (part of settings row) |
| Dialog, modal | class `modal-box`, tag `dialog`, `ptah-native-modal` | 38 | 7 | 28 (all) | 10 | exact | BUILD |
| Drawer | `ptah-native-drawer` | 0 | 12 | 12 | 5 | exact | DONE, WATCH adoption |
| Card, panel | class `card` | 9 | 33 (`ptah-native-card` 13, `ptah-catalog-card` 11, `ptah-stat-card` 6, `ptah-surface-card` 2, `ptah-surface-tile` 1) | 8 | 5 + 8 | exact | BUILD (look) |
| Panel surface | `div bg-base-* border rounded`, no `card` | 158 | 0 | 94 | 17 | heuristic | BUILD (join card) |
| Empty state | text such as "No sessions yet" | 105 | 1 (`ptah-state-panel`) | 79 | 19 | heuristic | BUILD |
| Key-value row | tag `dl` 36 (`dt` 107), class `stat` 21 | 57 | 7 (`ptah-stat-card` 6, `ptah-meter` 1) | 31 | 14 | exact | BUILD |
| Table | tag `table` | 23 (`tr` 60) | 0 | 20 | 7 | exact | BUILD |
| Details, collapse | tag `details` 41, class `collapse` 6 | 47 | 0 | 37 | 13 | exact | BUILD |
| Segmented control | class `join` of buttons | 18 (`join-item` 30) | 0 | 17 | 8 | exact | BUILD |
| Tabs | class `tabs`, `role="tablist"` | 16 | 6 (`ptah-native-tab-group`) | 13 | 10 + 4 | exact | BUILD |
| Menu, dropdown | class `menu`, `dropdown-content` | 12 | 6 (`ptah-native-dropdown`) | 10 | 5 + 4 | exact | BUILD (high impact) |
| Popover | `ptah-native-popover` | 0 | 37 | 27 | 6 | exact | DONE |
| Autocomplete, combobox | `role="combobox"`, `ptah-native-autocomplete` | 2 | 5 (`ptah-provider-model-picker` 4, `ptah-peer-session-picker` 1) | 2 | 2 + 2 | exact | WATCH |
| Tooltip | class `tooltip` | 1 (and `title` attribute 715) | 0 (`ptahTooltip` 0) | 1 | 1 | exact | SKIP raw, adopt `ptahTooltip` |
| Toast | class `toast` | 0 | 0 | 0 | 0 | exact | SKIP |
| Divider 1, avatar 1, steps 2, kbd 2 | class tokens | 6 | 0 | 6 | 4 | exact | SKIP |

Private copies (heuristic, selector keywords, outside `libs/frontend/ui`): the renderer has 606 components. Counts: card or panel 72, list row 22, menu or dropdown or popover or picker 21, dialog or modal 20, alert or banner or callout 19, header 17, tabs 17, badge or status 32, drawer or sheet or sidebar 10, empty or state 8, skeleton 2, autocomplete or search 3. Some matches are false hits, for example `ptah-sidebar-tab`. The list is in the script output.

## Variants

Recipes use only the tokens of the family. Examples are `file:line`.

### Dialog, modal (38 raw, 7 owner use)

| Count | Recipe | Examples |
|---:|---|---|
| 12 | `modal modal-open` (wrapper, state by class) | `libs/frontend/chat/src/lib/components/molecules/peer-session-send/peer-session-send-dialog.component.ts:40`; `libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:45` |
| 6 | `max-w-2xl modal-box` | `libs/frontend/chat-ui/src/lib/molecules/notifications/compaction-marker.component.ts:55`; `libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:50` |
| 4 | `modal-box` (no width) | `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:55`; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts:470` |
| 2 each | `max-w-sm`, `max-w-lg`, `max-w-md` + `modal-box` | `libs/frontend/chat/src/lib/components/molecules/confirmation-dialog.component.ts:48`; `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:49`; `libs/frontend/tasks-ui/src/lib/components/task-create-dialog.component.ts:62` |

Footer: 14 `modal-action` blocks. Sizes: sm, md, lg, 2xl. Private dialog components: 20. Two are `ptah-confirmation-dialog` and `ptah-git-confirm-dialog`. Both are the same confirm pattern.

### Badge (253 raw)

| Count | Recipe | Examples |
|---:|---|---|
| 46 | `badge badge-ghost badge-sm` | `libs/frontend/chat-ui/src/lib/atoms/cost-badge.component.ts:63`; `libs/frontend/tasks-ui/src/lib/components/detail/task-run-placeholder.component.ts:30` |
| 46 | `badge badge-outline badge-sm` | `libs/frontend/chat-ui/src/lib/atoms/token-badge.component.ts:34`; `libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts:87` |
| 30 | `badge badge-sm` | `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts:21`; `libs/frontend/tasks-ui/src/lib/components/detail/task-relations.component.ts:226` |
| 25 | `badge badge-outline badge-xs` | `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-meta.component.ts:130`; `libs/frontend/tasks-ui/src/lib/components/filter/task-view-menu.component.ts:167` |
| 24 | `badge badge-ghost badge-xs` | `libs/frontend/chat-ui/src/lib/molecules/agent-summary.component.ts:93`; `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:400` |
| 11 | `badge badge-sm badge-warning` | `libs/frontend/chat-ui/src/lib/molecules/agent-card/agent-card-permission.component.ts:25`; `libs/frontend/thoth-shell/src/lib/components/thoth-shell.component.ts:166` |

Token counts: size sm 147, xs 96, lg 1. Style: outline 81, ghost 72. Color: warning 26, success 9, info 7, neutral 6, error 6, primary 2, accent 2, secondary 1. Chip-like tags without `badge` (heuristic): 42 in 31 files, for example `libs/frontend/canvas/src/lib/canvas-detail/agent-dock-menu.component.ts:41`.

### Alert, banner (77 raw)

| Count | Recipe | Examples |
|---:|---|---|
| 30 | `alert alert-error` | `apps/ptah-extension-webview/src/app/app.html:17`; `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:404` |
| 19 | `alert alert-warning` | `libs/frontend/chat/src/lib/components/molecules/peer-session-send/peer-session-send-dialog.component.ts:139`; `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:348` |
| 12 | `alert alert-error alert-sm` | `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts:157`; `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:385` |
| 7 | `alert alert-info` | `libs/frontend/chat/src/lib/components/organisms/execution/execution-node.component.ts:430`; `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:32` |
| 5 | `alert` (no color) | `libs/frontend/command-center/src/lib/components/command-center-page.component.html:17` |

Colors: error 44, warning 20, info 8. Size sm 14. Soft 2. Success 0.

### Card, panel (9 raw `card`, 158 raw panel surface heuristic)

| Count | Recipe | Examples |
|---:|---|---|
| 5 | `card card-bordered bg-base-100` | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:19`; `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:211` |
| 1 each | four one-off recipes (`card-border shadow-sm`, `border-info`, `border-base-300`, bare `card`) | `libs/frontend/chat-ui/src/lib/molecules/thinking-block.component.ts:28`; `libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:78` |

Most panels are plain divs. The heuristic finds 158 (app 29, chat-settings 28, marketplace 21, chat-ui 20, onboarding 19). The app count includes gallery pages. The owners already exist: `ptah-native-card` 13 uses, `ptah-catalog-card` 11, `ptah-stat-card` 6.

### Tabs, segmented control, menu, table

| Composite | Count | Recipe | Examples |
|---|---:|---|---|
| Tabs | 13 | `role="tablist"` with `.tab` buttons, no `tabs` class | `libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-tabs.component.ts:142`; `libs/frontend/thoth-shell/src/lib/components/thoth-shell.component.ts:127` |
| Tabs | 2 / 1 | `tabs tabs-boxed tabs-sm` / `tabs tabs-lifted` | `libs/frontend/memory-curator-ui/src/lib/components/memory-curator-tab.component.ts:192`; `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:245` |
| Segmented | 17 / 1 | `join` + `join-item` buttons / `join join-horizontal` | `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/install-scope-field.component.ts:96`; `libs/frontend/git-ui/src/lib/open-in/open-in-button.component.ts:54` |
| Menu | 5 | `dropdown-content menu menu-xs` | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:209`; `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:546` |
| Menu | 2 / 2 | `dropdown-content` / `dropdown-content menu` | `libs/frontend/chat-ui/src/lib/atoms/theme-toggle.component.ts:214`; `libs/frontend/tasks-ui/src/lib/components/task-board-header.component.ts:132` |
| Table | 15 / 5 / 1 | `table table-xs` / `table-sm` / `table-sm table-zebra` | `libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.ts:130`; `libs/frontend/review-runs-ui/src/lib/components/review-findings-table.component.ts:61` |

### Skeleton, loading, empty state, header

- Spinner: 108 `loading loading-spinner loading-xs`, 6 `loading-md`, 1 `loading-lg`. Example: `libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts:30`.
- Skeleton: 100 plain `skeleton` tags. Example: `libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts:217`.
- Empty state (heuristic): 105 text nodes in 79 files and 19 groups. Examples: `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail.component.ts:196` ("No sessions") and `:250` ("No sessions yet"). Private empty components: `ptah-canvas-empty-board`, `ptah-chat-empty-state`, `ptah-chat-empty-state-view`. `ptah-state-panel` has 1 use.
- Header row (heuristic): 37 in 35 files. Examples: `apps/ptah-extension-webview/src/app/git-window/git-window.component.ts:22`. The owners `ptah-page-header` and `ptah-toolbar` have 1 use each.

## Level 1 needs and owners today

| Composite | Level 1 primitives and composites it needs | Owner today in `libs/frontend/ui/src/lib` | Private in feature libs |
|---|---|---|---|
| Dialog | button, icon button, input, textarea, select, checkbox, toggle, header | `native/modal` (`native-modal.component.ts`, 7 uses) | 20 dialog components, 38 raw `modal-box` |
| Drawer | button, icon button, header | `native/drawer` | `ptah-system-prompt-drawer` and 9 sidebar or sheet hits |
| Card, panel | button, badge, header | `native/card`, `native/catalog-card`, `surfaces/surface-card`, `surfaces/surface-tile`, `surfaces/stat-card` | 72 card or panel selectors, 158 raw panels |
| Section and page header | button, icon button, tabs, badge | `foundation/page-header`, `foundation/toolbar`, `surfaces/surface-section` | 17 header selectors |
| Settings row | input, textarea, select, checkbox, toggle, button | `surfaces/field`, `extracted/settings-field`, `extracted/setup-field` | many local label and control rows |
| List row | button, icon button, badge, checkbox, menu | `foundation/list-row`, `surfaces/inbox-row`, `foundation/list-detail` | 22 row selectors, 56 clickable rows |
| Empty state | button, icon | `foundation/state-panel` | `ptah-chat-empty-state`, `ptah-canvas-empty-board` |
| Tabs, segmented | button | `native/tab-group` (6 uses) | 17 tab selectors, 18 `join` groups |
| Menu | button, icon button, list row | `native/dropdown` (6 uses), `native/popover` (37 uses), `native/option` | raw `dropdown-content menu` 10 |
| Badge, status | icon | `foundation/status-badge`, `native/file-status-badge` | 32 badge selectors, 253 raw |
| Alert, banner | button, icon button | `foundation/state-panel` (partial) | 19 banner or callout selectors |
| Autocomplete | input, menu, option | `native/autocomplete`, `selection/autocomplete`, `native/provider-model-picker` | 0 consumers of `ptah-native-autocomplete` |
| Table | badge, icon button, checkbox | none | 23 raw tables |

Note: `libs/frontend/ui/src/lib/overlays` and `selection` also have `dropdown`, `popover`, `autocomplete` and `option` folders. They duplicate `native`. Decide the one owner before the menu work.

## Dependency matrix

Y means the composite needs the primitive.

| Composite | Button | Icon button | Input | Textarea | Select | Checkbox | Toggle | Other composite |
|---|---|---|---|---|---|---|---|---|
| Dialog | Y | Y | Y | Y | Y | Y | Y | header |
| Card, panel | Y | | | | | | | badge, header |
| Section header | Y | Y | | | | | | tabs |
| Settings row | Y | | Y | Y | Y | Y | Y | |
| List row | Y | Y | | | | Y | | badge, menu |
| Empty state | Y | | | | | | | |
| Tabs, segmented | Y | | | | | | | |
| Menu | Y | Y | | | | | | list row |
| Badge | | | | | | | | |
| Alert | Y | Y | | | | | | |
| Autocomplete | | | Y | | | | | menu |
| Table | | Y | | | | Y | | badge |

## Ranking

Order by use count (raw plus owner use, units above): badge 260, skeleton and loading 254, settings row 257, header 357, list row 248, alert 78, empty state 106, panel surface 158, key-value 64, details 47, dialog 45, popover 37, card 42, segmented 18, tabs 22, table 23, menu 18, drawer 12, autocomplete 7. The heading counts are partly heuristic. Header, list row and settings row count common tags. Use them with care.

Order by visual impact (screen share, frequency, product look):

1. Card and panel surface, with section header. They frame every screen.
2. Dialog. It blocks the screen and the user sees it in every flow.
3. Menu and popover. The user opens them all day.
4. Tabs and segmented control. They show the navigation of each area.
5. Badge and status. There are many of them and they carry color.
6. List row. It defines the chat, task and marketplace lists.
7. Settings row. It fills the settings area.
8. Empty state and alert. They are rare but they set the tone.
9. Skeleton, table, key-value row.

## Proposed build order

1. **Form controls** (level 1). Dialog, settings row and autocomplete need them.
2. **Badge and status.** It has the highest count, 16 groups and no primitive need. One approval covers size, ghost, outline and color.
3. **Alert and empty state, with skeleton and spinner.** They share `ptah-state-panel`. They need only button.
4. **Card, panel surface and section header.** Visual impact is high. Merge the five card owners into one recipe and add the panel recipe (158).
5. **Dialog and drawer.** 38 raw dialogs move to `ptah-native-modal`. Drawer is done and needs adoption only. Dialog needs form controls.
6. **Tabs, segmented control and menu.** Fold `join` (18) and `role="tablist"` (13) into `ptah-native-tab-group`. Move 12 raw menus to `ptah-native-dropdown`.
7. **List row and settings row.** They are the largest counts but the DOM varies. Do them after the card and header look is stable.
8. **Table, key-value row, details.** They are common but each has a simple recipe. Do them last.
9. **Autocomplete (WATCH).** It has 2 raw uses and no consumer of the owner. It follows the menu and the input. Build it with the next feature that needs it.

Reasons: a composite waits for its primitives. Order inside a level follows count first, then impact. Pure skips: toast (0), divider 1, avatar 1, steps 2, kbd 2, raw tooltip (1).

## Largest sub-areas (reference screens)

Sizes count tags outside `libs/frontend/ui` (method: the script, section "SUB-AREAS").

| Sub-area | Tags | Template files | Suggested reference screens |
|---|---:|---:|---|
| Settings (`chat-settings`) | 2,573 | 74 | Output style editor, provider panel, tables (13 of 23) |
| Chat (`chat`) | 1,845 | 85 | Confirm dialog, empty state, peer session dialog |
| Chat components (`chat-ui`) | 1,545 | 93 | Message badges, tool cards, status badge |
| Marketplace | 1,413 | 51 | Catalog cards, tabs, alerts (16) |
| Onboarding | 970 | 44 | Wizard steps, list rows (28), collapse (10) |

Next: `tasks-ui` 681 (menus 7 of 12, dialogs), `git-ui` 627, `memory-curator-ui` 534, `skill-synthesis-ui` 406. Canvas has 3 modals and 12 owner drawers, but it is a key product look. Add it as a reference for the card and tabs.

## Risks

- Heuristic counts (empty state, header row, panel surface, clickable row, label row) over-count or under-count. Check each batch by hand before it is a gate.
- `<li>`, `<label>`, `<h1>`-`<h3>` and `<dl>` are common tags. They do not each become a composite. Use the counts only as an upper bound.
- `role="alert"` (275) and `role="status"` (277) mark spinners and live regions. Do not use them as alert counts.
- Dynamic class sets (`[class]`, `ngClass`) are invisible to the census. The raw counts are a lower bound.
- `libs/frontend/ui` has duplicate folders (`native`, `overlays`, `selection`). The ratchet and lint rules must name one owner.
- The `app` group counts gallery pages. Remove gallery paths from the ratchet baseline.

## Open decisions

1. **Which duplicate owner wins for menu, popover and autocomplete?** `native/*` has all the consumers (37 popover, 6 dropdown). Recommendation: keep `native/*`. Delete `overlays/*` and `selection/*` after the check shows zero imports.
2. **Do panel surfaces share one card owner?** There are 5 card owners and 158 raw panels. Recommendation: one `ptah-surface-card` API with a `variant` input, built with the card look (build order group 4).
3. **Is autocomplete a family now?** It has 2 raw uses and no consumer of the owner. Recommendation: WATCH. Build it only with the next feature that needs it.
4. **Do list row and settings row get a strict DOM?** Their raw counts are high, but the DOM varies. Recommendation: build the owner with content slots. Move only rows with an equal DOM in the first batch.
5. **Skip toast, divider, avatar, steps and kbd?** Total use is 6. Recommendation: SKIP. The epic (section 3) records the counts.
