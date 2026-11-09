# Duplication inventory — part B (TASK_2026_904)

Read-only count of repeated DaisyUI / Tailwind markup in the page libs. Glass work belongs inside these primitives once, per Direction change 2 in `context.md`.

## Method

- Scope: `dashboard`, `declarative-dashboard`, `setup-wizard`, `onboarding`, `git-ui`, `marketplace`, `mcp-apps-page`, `memory-curator-ui`, `messaging-gateway-ui`, `review-runs-ui`, `skill-synthesis-ui`, `tasks-ui`, `cron-scheduler-ui`, `harness-builder`, `machines-ui`, `workspace-indexing`, `chat-routing`.
- Templates only: `*.component.ts` and `*.html`, excluding `*.spec.ts`.
- `chat-routing` has 0 component files and 0 HTML files. It drops out of every row below.
- Counts are regex hits. A button with `btn btn-ghost btn-xs` counts once under `class="btn` and once under each modifier.
- Class-string tops are static `class="..."` prefixes (about 70 characters). Bindings such as `[class]` and `[ngClass]` are extra and are called out when seen.
- `libs/frontend/ui` is a primitive reference only. It was not inventoried in depth.
- Tools: no `ptah_*` MCP tools are connected in this lane (only the `tasks` automation server). Counts used `rg`. No UI skill for this inventory is in the session skill list (`impeccable`, `ui-ux-designer`, `angular-frontend-patterns` are absent), so none was loaded.

Lib keys: dash, decl, wiz, onb, git, mkt, mcp, mem, msg, rev, skl, tsk, cron, hrn, mac, ws.

Template files (component ts / html): dash 14/6, decl 19/0, wiz 21/0, onb 33/0, git 29/0, mkt 49/6, mcp 3/0, mem 18/0, msg 8/0, rev 9/1, skl 17/0, tsk 23/0, cron 3/0, hrn 7/0, mac 15/0, ws 1/1.

## Primitives already in `libs/frontend/ui`

Exported selectors that match this layer: `ptah-field`, `ptah-surface-card`, `ptah-surface-section`, `ptah-surface-tile`, `ptah-stat-card`, `ptah-native-card`, `ptah-native-modal`, `ptah-native-drawer`, `ptah-native-dropdown`, `ptah-native-tab-group`, `ptah-native-popover`, `ptah-dropdown`, `ptah-popover`, `ptah-file-status-badge`, `ptah-catalog-card` (and catalog grid / skeleton / storefront), `ptah-json-schema-form`.

No button, input, select, textarea, checkbox, toggle, link, badge/chip, list row, page header, toolbar, menu, toast, or empty/loading/error component is exported. `ptah-field` is the only field chrome. `ptah-file-status-badge` is git-diff specific.

Part B imports of `@ptah-extension/ui` are brand marks, motion, popover, and a few native shells. `ptah-field`, `ptah-surface-section`, `ptah-surface-tile`, and the UI `PtahStatCardComponent` have zero references in this scope.

## Native elements

### Button

`class="btn` hits: **553 across 16 libs**. `<button`: 643. About 90 buttons use a binding or no literal `class="btn`.

| lib | dash | decl | wiz | onb | git | mkt | mcp | mem | msg | rev | skl | tsk | cron | hrn | mac | ws |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `class="btn` | 10 | 15 | 27 | 45 | 79 | 112 | 5 | 43 | 17 | 22 | 40 | 54 | 14 | 27 | 31 | 12 |

Modifier hits (one control can carry several): `btn-ghost` 341, `btn-xs` 300, `btn-sm` 275, `btn-primary` 128, `btn-outline` 82, `btn-square` 28, `btn-active` 16, `btn-error` 14, `btn-warning` 9, `btn-circle` 6, `btn-success` 2, `btn-disabled` 2, `btn-secondary` 1, `btn-link` 1. `btn-md`, `btn-lg`, `btn-accent`, `btn-neutral`, `btn-info`: 0.

Top static prefixes:

| n | class prefix |
| ---: | --- |
| 71 | `btn btn-ghost btn-xs` |
| 40 | `btn btn-ghost btn-sm` |
| 22 | `btn btn-primary btn-sm` |
| 16 | `btn btn-outline btn-sm` |
| 13 | `btn btn-sm` |
| 13 | `btn btn-ghost btn-xs gap-1` |
| 12 | `btn btn-sm btn-primary` |
| 12 | `btn btn-primary btn-xs` |

Examples:

- `messaging-gateway-ui/src/lib/components/platform-bindings-panel.component.ts:26` `btn btn-ghost btn-xs`
- `marketplace/src/lib/external-installed-row.component.ts:72` `btn btn-ghost btn-sm text-error`
- `skill-synthesis-ui/src/lib/components/skill-specs-control.component.ts:28` `btn btn-primary btn-xs` plus `focus-visible:outline`
- `onboarding/src/lib/shell/workspace-header.component.ts:20` `btn btn-outline btn-sm`
- `declarative-dashboard/src/lib/components/dashboard-stat.component.ts:51` `btn btn-ghost btn-xs btn-square` with `aria-label`

Primitive: none. Every lib paints Daisy classes directly. Marketplace also hides them behind helpers (`marketplace/src/lib/ui/connector-card-actions.component.ts:34` `[class]="buttonClass('btn-ghost text-error')"`).

Inconsistencies:

- Same role, two size orders: `btn-primary btn-sm` (22) and `btn-sm btn-primary` (12).
- Sizes in real use are only `xs` and `sm`. Default (no size) still appears (`btn btn-sm` vs bare `btn` in `setup-wizard/src/lib/components/confirmation-modal.component.ts:100`).
- Ghost is the default action; primary is the commit action; outline is a third secondary style used heavily in onboarding and setup (11 each) and harness (14).
- `focus-visible:` utilities: 147 hits in 13 libs, piled into machines (38), tasks (37), git (25), marketplace (22). Dashboard has 1, declarative-dashboard 0, cron 0. Some controls add a second ring on top of Daisy `btn` (`skills-pause-switch.component.ts:97`).
- Icon buttons (`btn-square` 28, `btn-circle` 6) sometimes carry `aria-label` (dashboard stat) and sometimes only a visible glyph.

### Input

`class="input`: **62 across 11 libs**. `<input`: 105 (includes checkboxes). `input-bordered` 60, `input-sm` 37, `input-xs` 17. No `input-ghost`.

| lib | decl | git | mkt | mem | msg | rev | skl | tsk | cron | hrn | mac |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `class="input` | 3 | 7 | 11 | 14 | 4 | 8 | 1 | 8 | 3 | 1 | 2 |

Top prefixes: `input input-bordered w-full` 8, `input input-sm input-bordered` 5, `input input-bordered input-sm w-full text-xs font-mono` 4, plus one-off `h-8`, `bg-surface-0`, `font-mono`, and a custom `focus-visible:outline-[oklch(...)]`.

Examples:

- `messaging-gateway-ui/src/lib/components/platform-token-form.component.ts:27` `input input-sm input-bordered font-mono`
- `messaging-gateway-ui/src/lib/components/platform-bindings-panel.component.ts:62` `input input-xs input-bordered w-24 font-mono`
- `declarative-dashboard/src/lib/components/surface-text-input.component.ts:72` textarea sibling of the same bordered style

Primitive: `ptah-field` exists (`libs/frontend/ui/src/lib/surfaces/field.component.ts:13`) and labels a projected input/select/textarea. **0 uses** in part B. `form-control` 9 (mem 5, tsk 4) and `label-text` 5 (mem only). `aria-invalid`: 10 (decl 5, mkt 1, tsk 1, hrn 1, mac 2).

Inconsistencies: modifier order (`input-sm input-bordered` vs `input-bordered input-sm`), mono vs default font, `bg-surface-0` on some tasks fields only, and almost no shared error wiring.

### Select

`class="select`: **19 across 10 libs**, all `select-bordered`. `select-sm` 14, `select-xs` 5. `<select`: 24.

Per lib: decl 1, wiz 1, onb 1, git 3, mem 1, rev 3, tsk 6, cron 1, hrn 1, mac 1.

Top prefixes: `select select-bordered select-sm` 5, `select select-xs select-bordered` 2, `select select-bordered select-sm h-9 bg-surface-0 text-sm` 2. One harness select forces `!border-base-content/50` and a custom focus ring.

Examples:

- `onboarding/src/lib/shell/workspace-header.component.ts:15`
- `tasks-ui/src/lib/components/task-create-dialog.component.ts:105` and `:121` (`h-9 bg-surface-0`)

Primitive: none for a native `<select>`. `ptah-native-dropdown` is used only by `marketplace/src/lib/ui/provider-filter-select.component.ts:20`. The other 10 libs keep a raw `<select>`.

### Textarea

`<textarea`: **16 across 11 libs**. `class="textarea`: 14. `textarea-bordered` 14, `textarea-sm` 5, `textarea-xs` 2.

Per element: decl 1, onb 2, git 2, mcp 1, mem 1, msg 1, skl 2, tsk 1, cron 1, hrn 2, mac 2.

Examples:

- `mcp-apps-page/src/lib/components/apps-page.component.ts:215` `textarea textarea-bordered w-full text-sm resize-none`
- `messaging-gateway-ui/src/lib/components/allow-list-editor.component.ts:25` `textarea textarea-bordered textarea-sm w-full font-mono`

Primitive: none. Same bypass as input (`ptah-field` unused).

### Checkbox and toggle

`type="checkbox"` (any quotes): **37 across 13 libs**. `class="checkbox`: 20 across 8 libs. `class="toggle`: **11 across 8 libs**.

Checkbox inputs: decl 1, wiz 1, onb 1, git 2, mkt 6, mem 3, msg 1, rev 6, skl 2, tsk 5, cron 1, hrn 6, ws 2.

Daisy checkbox sizes: `checkbox-xs` 10 (git 2, mkt 5, msg 1, tsk 2), `checkbox-sm` 9 (decl 1, onb 1, mem 2, rev 3, tsk 2), `checkbox-primary` 1 (mkt). Radio is rare: `type="radio"` 6 (decl 1, onb 3, skl 2).

Toggle classes: `toggle-primary` 8, `toggle-sm` 6, `toggle-xs` 3, `toggle-error` 1, `toggle-warning` 1.

Examples:

- `git-ui/src/lib/task/task-worktree-view.component.ts:261` `checkbox checkbox-xs`
- `review-runs-ui/src/lib/components/review-repositories-editor.component.ts:34` `checkbox checkbox-sm`
- `review-runs-ui/src/lib/components/review-confirm-dialog.component.ts:12` bare `checkbox`
- `skill-synthesis-ui/src/lib/components/skills-pause-switch.component.ts:93-97` and `memory-curator-ui/src/lib/components/memory-pause-switch.component.ts:92-97` — same switch markup, including the WCAG 2.5.8 comment and `toggle toggle-sm toggle-primary` plus a hand-written focus ring

Primitive: none. The two pause switches are a local copy of one control.

`marketplace/src/lib/ui/capability-toggle.component.ts` is a custom capability list (the word "toggle" there is mostly the component name, not Daisy `toggle`).

### Link

`class="link`: **18 across 6 libs** (onb 10, mkt 3, msg 1, skl 2, tsk 1, cron 1). `link-hover` 6, `link-primary` 5, `btn-link` 1 (mem).

Many navigations are anchors wearing `btn`, for example `cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts:138` `<a class="btn btn-ghost btn-sm">`, and `marketplace/src/lib/pages/skills/skill-detail.component.ts:231` `<a class="btn btn-ghost btn-sm">`.

Primitive: none.

### Dialog

`<dialog`: **19 across 6 libs** (dash 3, wiz 4, git 3, mkt 3, skl 3, tsk 3).

`ptah-native-modal` wraps this pattern (`libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:74-90`: `<dialog class="modal">`, `modal-box`, `modal-backdrop`, focus and `aria-label` / `aria-labelledby`). Call sites that use it: `setup-wizard/src/lib/components/pack-install-prompt.component.ts:17`, `skill-synthesis-ui` quarantined-agents panel and `reconcile-guard.ts`. The shared confirm/alert shells do not.

Bypass examples:

- `git-ui/src/lib/shared/git-confirm-dialog.component.ts:52-68` `<dialog class="modal">`, `modal-box max-w-sm`, `role="alertdialog"`, `aria-labelledby`, `btn btn-sm`
- `setup-wizard/src/lib/components/confirmation-modal.component.ts:94-116` same Daisy skeleton, `data-glass-surface="overlay"`, bare `btn` / `btn-ghost`, no `aria-labelledby` on the `<h3>`
- `review-runs-ui/src/lib/components/review-confirm-dialog.component.ts:6-16` no `<dialog>`. Fixed overlay, `surface-1 ... rounded-xl`, `role="dialog"`, hand-rolled Tab trap

Other local dialogs: `ptah-direct-removal-confirm`, `ptah-harness-repair-dialog`, `ptah-external-consent-dialog`, `ptah-bulk-rebase-confirm`, `ptah-harness-builder-leave-dialog`, `ptah-task-create-dialog`, `ptah-task-maintenance-dialog`, `ptah-task-sweep-dialog`, `ptah-corpus-build-dialog`, `ptah-agent-preview-dialog`.

## Composites

### Field

Covered above. Label + control + hint/error is re-built per form. `ptah-field` is unused. `fieldset`: 15 (decl 3, onb 2, mkt 6, skl 2, mac 2).

### Card and section

Daisy `class="card"`: **10 across 3 libs** (dash 3, decl 5, wiz 2). `card-bordered` 5 (decl only). `card-body` 2, `card-title` 3. Most "card" names in the tree are feature components, not Daisy cards.

What pages actually share is the surface utility:

| token | hits |
| --- | ---: |
| `surface-2` | 87 |
| `surface-1` | 38 |
| `surface-3` | 38 |
| `surface-0` | 16 |

`surface-[123]` is **160 hits in 12 libs**: dash 7, wiz 5, git 3, mkt 11, mem 30, msg 16, rev 6, skl 2, tsk 55, cron 8, hrn 16, ws 1. `surface-0` adds dash, mkt, mem, skl, tsk.

`data-glass-surface`: **39 in 3 libs** (onb 33, mkt 5, wiz 1). Values seen: `content`, `tile`, `chrome`, `overlay`, `plate`. Onboarding is the only lib that uses it as the page system (`onboarding/src/lib/shared/status-card.component.ts:12`). Everyone else reaches for `surface-*`.

Radius is not shared: onboarding status cards use `rounded-[22px]` (`status-card.component.ts:11`); UI and marketplace stat tiles use `rounded-xl`; tasks/machines use `rounded-box` (45 hits: tsk 25, mac 18, git 2); dashboard stat uses plain `rounded`.

Primitives and bypass:

| primitive | part B uses |
| --- | --- |
| `ptah-surface-card` | memory diagnostics accordion only (`SurfaceCardComponent` import) |
| `ptah-surface-section`, `ptah-surface-tile` | 0 |
| `ptah-native-card` | memory health panels, `cron-job-card`, skill clone card and scorecard detail |
| `ptah-catalog-card` family | marketplace only (55 `ptah-catalog-` hits) |

Local section shells keep their own headers: `ptah-skills-section-header`, `ptah-file-section-header`, `ptah-proposal-section`, harness `ptah-builder-*-section`.

### Stat tile

Four implementations:

| implementation | shape | where |
| --- | --- | --- |
| UI `ptah-stat-card` | `surface-2 rounded-xl p-4`, label + `text-2xl` value | `libs/frontend/ui/src/lib/surfaces/stat-card.component.ts:7`. **0 imports in part B** |
| Marketplace `ptah-stat-card` | same selector, different component: icon, tone, loading/error/ready, skeleton, retry | `marketplace/src/lib/ui/stat-card.component.ts:65` |
| Daisy `stat` strip | identical inner class `stat min-w-0 overflow-hidden p-4` | 13 hits: mem 5, msg 4, cron 4 |
| `ptah-dashboard-stat` | `rounded border border-base-300 bg-base-200`, 10px uppercase label | `declarative-dashboard/src/lib/components/dashboard-stat.component.ts:45` |

Daisy strip examples (same class string):

- `memory-curator-ui/src/lib/components/memory-stats-strip.component.ts:30-31` wraps each stat in `surface-2 ... rounded-xl`
- `cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts:203-204` uses `stats surface-2` as the group
- `messaging-gateway-ui/src/lib/components/messaging-gateway-tab.component.ts:200`

`stat-title` / `stat-value` / `stat-figure` follow the same 5/4/4 split. Selector collision: marketplace and `@ptah-extension/ui` both register `ptah-stat-card`.

### Badge and chip

`class="badge`: **112 across 11 libs**.

| lib | dash | wiz | onb | git | mkt | mem | rev | skl | tsk | hrn | mac |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hits | 2 | 8 | 4 | 6 | 22 | 11 | 6 | 12 | 27 | 8 | 6 |

Modifiers: `badge-sm` 72, `badge-ghost` 55, `badge-xs` 44, `badge-outline` 31, `badge-warning` 23, `badge-success` 18, `badge-error` 16, `badge-primary` 4, `badge-info` 3, `badge-neutral` 2, `badge-secondary` 2, `badge-accent` 1.

Top prefixes: `badge badge-sm` 8, `badge badge-xs` 6, `badge badge-ghost badge-sm` 6, `badge badge-ghost badge-sm tabular-nums` 5, `badge badge-outline badge-sm` 4, `badge badge-success badge-sm` 4.

Examples:

- `skill-synthesis-ui/src/lib/components/skills-pause-switch.component.ts:57` `badge badge-warning badge-sm`
- `git-ui/src/lib/task/task-worktree-view.component.ts:388` `badge badge-xs badge-ghost`
- `declarative-dashboard/src/lib/components/dashboard-badge.component.ts:13-18` maps tone to `badge badge-neutral|primary|info|success|warning|error` with no size

Primitive: `ptah-file-status-badge` is used by git changed-file tree only. General status chips are local: `ptah-dashboard-badge`, `ptah-status-pill`, `ptah-harness-health-badge`, `ptah-removal-lock-badge`, `ptah-scorecard-badge`, `ptah-provenance-badge`, `ptah-run-status-chip`, `ptah-session-sync-chip`. Sizes `xs` and `sm` both mean "small status", and ghost vs outline vs solid tone are three chrome systems.

### List row

No shared row primitive. Rows are feature components with their own action cluster of `btn-ghost btn-xs` / `btn-sm`:

- `marketplace/src/lib/external-plugin-row.component.ts:58`
- `marketplace/src/lib/external-installed-row.component.ts:72`
- `marketplace/src/lib/ui/provider-table.component.ts` and `provider-card-list.component.ts` (card list is the same records in another layout)
- `tasks-ui/src/lib/components/board/task-card.component.ts:138` (`ptah-task-card`)

### Page header

Repeated page-title row: icon tile + `h1.text-xl.font-semibold` + muted description + actions.

- `cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts:121-143` full row, then a `join` scope switch
- `skill-synthesis-ui/src/lib/components/skill-synthesis-tab.component.ts:70` `<h1 class="text-xl font-semibold tracking-tight">Skills</h1>`
- `review-runs-ui/src/lib/components/review-runs-page.component.ts:55` `<h1 class="text-xl font-semibold">Review runs</h1>` (no `tracking-tight`)

`<h1>`: **35 in 9 libs** (mkt 27, and 1 each in onb, mcp, mem, msg, rev, skl, tsk, cron). `<h2>`: **74 in 14 libs**. `<h3>`: 106. Title scale also uses `text-2xl` 17 (mkt 7, mem 4, msg 3, cron 3) and `text-xl` 20 (8 libs). Marketplace puts many `h1`s inside the store, so a raw `h1` count is not "one title per page".

Local header components: `ptah-workspace-header`, `ptah-task-board-header`, `ptah-task-detail-header`, `ptah-git-dock-header`, `ptah-git-dock-scope-header`, `ptah-skills-section-header`, `ptah-file-section-header`. No shared page-header primitive.

### Toolbar

Local toolbars, each with its own `btn-ghost btn-xs/sm` cluster:

- `marketplace/src/lib/ui/bulk-action-bar.component.ts:96`
- `skill-synthesis-ui/src/lib/components/clones/clone-bulk-toolbar.component.ts` (`ptah-clone-bulk-toolbar`)
- `git-ui/src/lib/review-canvas/hunk-toolbar.component.ts` (`ptah-hunk-toolbar`)
- `tasks-ui/src/lib/components/task-board-header.component.ts`

No shared toolbar primitive.

### Tabs and segmented control

Daisy `class="tabs"`: **2, both in memory**, the same string `tabs tabs-boxed tabs-sm w-fit bg-surface-2 p-1`:

- `memory-curator-ui/src/lib/components/memory-curator-tab.component.ts:195`
- `memory-curator-ui/src/lib/components/memory-search-bar.component.ts:38`

`role="tab"`: **27 in 6 libs** (onb 8, git 4, mcp 2, mem 7, msg 3, cron 3). `aria-selected`: 12 in 7 libs.

Segmented control is Daisy `join`, not `tabs`. `join-item`: 22 in 6 libs (dash 7, git 5, mkt 1, mem 4, tsk 3, cron 2). Cron uses `join` + `role="tab"` (`cron-scheduler-tab.component.ts:146-163`). Git spot editor uses `btn btn-ghost btn-xs join-item` (`git-ui/src/lib/spot-editor/spot-editor.component.ts:170`). `segmented` as a class name: 3 hits (dash 1, mkt 2). `btn-group`: 0.

Primitive: `ptah-native-tab-group` is used in three places: `git-ui/.../review-shell.component.ts`, `marketplace/.../server-detail.component.ts`, `skill-synthesis-ui/.../skill-clones-view.component.ts`. The other tablists bypass it.

### Menu and dropdown

`class="dropdown"`: **14, only git (2) and tasks (12)**. `dropdown-content` 7, `dropdown-end` 6. `class="menu"`: **8, all tasks**. `menu-title` 7, `menu-xs` 4, `menu-sm` 2.

Examples:

- `tasks-ui/src/lib/components/task-board-header.component.ts:133` `dropdown-content menu ... bg-surface-2 border border-surface-border rounded-box`
- `tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:144` `dropdown-content menu menu-sm`
- `tasks-ui/src/lib/components/board/task-card.component.ts:278` `dropdown-content menu menu-xs ... rounded-box`

Primitive: `ptah-native-dropdown` is only `marketplace/.../provider-filter-select.component.ts`. CDK `ptah-dropdown` has 0 template uses in part B. Tasks reimplemented menu panels with Daisy `dropdown` + `menu`.

### Modal and drawer

`class="modal"`: **38 across 7 libs** (dash 4, wiz 4, git 4, mkt 9, mem 3, skl 8, tsk 6).

Pieces: `modal-box` 11 (7 libs), `modal-open` 11 (5 libs), `modal-action` 9 (5 libs), `modal-backdrop` 6 (5 libs).

Top prefixes: `modal modal-open` 10, `modal-backdrop` 6, `modal-action` 5, `modal-box` 3, `modal-box max-w-2xl` 3, bare `modal` 2, `modal-box max-w-xl` 1, `modal-box max-w-sm` on the git confirm.

Examples: git confirm and setup confirmation above; `marketplace/src/lib/kept-items-repair-prompt.component.ts:393` `modal-box max-w-2xl`; `skill-synthesis-ui/.../skill-clones-view.component.ts:470` bare `modal-box`; `tasks-ui/.../task-create-dialog.component.ts:57` `<dialog>`.

Drawer: Daisy `drawer-side` 0, `drawer-toggle` 1 (cron). `ptah-native-drawer` is on the happy path for `cron-job-detail-drawer`, tasks maintenance dialog, skill clone detail, and enhance preview. Marketplace also imports it (7 `ptah-native-drawer` hits). Widths and chrome of the Daisy modals are still per call site (`max-w-sm` / `max-w-xl` / `max-w-2xl`, glass overlay only on the setup confirm).

### Toast

`class="toast"` and `toast-`: **0** in this scope. UI does not export a toast. Transient feedback here is an inline `alert` or a banner (`ptah-resume-banner`, `ptah-conflict-banner`, `ptah-reconnect-banner`, `ptah-memory-indexing-banner`, `ptah-owner-conflict-banner`, `ptah-connection-readiness-banner`).

### Empty, loading, and error

Loading: `loading-spinner` **74 in 9 libs** (dash 4, onb 1, git 7, mkt 33, mem 12, skl 4, tsk 7, mac 2, ws 4). `loading-xs` 65 (mostly the same nodes), `loading-sm` 6, `loading-md` 4, `loading-dots` 1 (mcp). `aria-busy`: 52 in 11 libs.

Skeleton class: **106 in 8 libs** (wiz 6, onb 4, git 4, mkt 56, mem 22, rev 3, tsk 8, hrn 3). Marketplace also has `ptah-catalog-card-skeleton` from UI, plus local skeletons.

Error: `class="alert"` **66 in 11 libs**.

| lib | dash | wiz | git | mkt | mem | msg | rev | skl | tsk | cron | ws |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `class="alert` | 2 | 13 | 2 | 16 | 4 | 3 | 10 | 7 | 1 | 1 | 7 |

Tones: `alert-error` 42 (11 libs), `alert-warning` 23 (9), `alert-info` 11 (4), `alert-success` 2 (2), `alert-sm` 11. Top prefixes: `alert alert-error py-2 text-sm` 5, `alert alert-error alert-sm py-1 px-2` 5, bare `alert alert-error` 5, `alert alert-warning my-2` 3, `alert alert-warning block text-xs` 3.

Examples:

- `cron-scheduler-ui/.../cron-scheduler-tab.component.ts:283` `role="alert"` + `alert alert-error text-sm`
- `memory-curator-ui/.../timeline-view.component.ts:36` `role="alert"` + `alert alert-error`
- `workspace-indexing/src/lib/workspace-indexing.component.html:25` `alert alert-error text-xs p-2`
- `declarative-dashboard/.../dashboard-alert.component.ts:16-34` a second alert: `alert border border-info|success|warning|error bg-base-200`, tone as border and icon, not `alert-error`

Empty: the class `empty-state` is only a comment or test id (mkt 3, cron 2). The visible pattern is an inline centered block, for example `cron-scheduler-tab.component.ts:288-298` (`flex flex-col items-center gap-2 px-6 py-16 text-center`, icon, "No scheduled jobs yet"). Marketplace provider table / card list own an empty-state button (`provider-table.component.ts:540`). `tasks-ui` `ptah-task-board-states` is another local empty/loading/error host. No shared empty, loading, or error component.

### Banners

Same role, separate components: `ptah-resume-banner`, `ptah-conflict-banner`, `ptah-reconnect-banner`, `ptah-memory-indexing-banner`, `ptah-owner-conflict-banner`, `ptah-connection-readiness-banner`, `ptah-plugin-config-home-notice`, `ptah-installed-library-stale-notice`, `ptah-library-stale-notice`. Setup and marketplace each have a "library stale" notice.

## Local components that duplicate each other

| role | copies |
| --- | --- |
| Confirm / alert dialog | `ptah-git-confirm-dialog`, `ptah-confirmation-modal`, `ptah-review-confirm-dialog`, `ptah-direct-removal-confirm`, `ptah-bulk-rebase-confirm`, `ptah-harness-builder-leave-dialog`, `ptah-harness-repair-dialog`. Three behavior models: native `<dialog class="modal">`, the same shell plus glass, and a fixed `role="dialog"` overlay. |
| Stat tile | UI `ptah-stat-card` (unused here), marketplace `ptah-stat-card` (same selector), Daisy `stat` strip copied in memory / messaging / cron, `ptah-dashboard-stat`. |
| Status chip | `ptah-dashboard-badge`, `ptah-status-pill`, `ptah-run-status-chip`, `ptah-session-sync-chip`, `ptah-scorecard-badge`, `ptah-provenance-badge`, `ptah-harness-health-badge`, `ptah-removal-lock-badge`, plus raw `badge` classes. |
| Pause switch | `skills-pause-switch` and `memory-pause-switch` (same template, lines 87-103). |
| Page title row | cron, skills, review runs (`h1` + `text-xl font-semibold` + muted line + actions). Memory and messaging use the same stat strip under their own titles (`text-2xl` shows up in those four libs). |
| Stale-library notice | `ptah-library-stale-notice` (setup), `ptah-installed-library-stale-notice` (marketplace). |
| Empty / error block | inline in cron, workspace-indexing, memory timeline, marketplace tables, tasks board states, plus `ptah-dashboard-alert`. |

## Ranked extraction candidates

Score = occurrences × Daisy modifier spread × libs. Occurrences are the element-level class hits in the tables above (modifiers that sit on the same element are not added again). Spread is the number of distinct size/tone/shape tokens, ignoring layout utilities (`w-full`, `gap-1`, `shrink-0`).

| rank | candidate | occ | spread | libs | score | why this one |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Button | 553 | 14 | 16 | 123872 | Every page lib. No primitive. Ghost/primary/outline × xs/sm, plus square/circle. |
| 2 | Badge / chip | 112 | 12 | 11 | 14784 | xs vs sm, ghost vs outline vs solid tone, and 8 local chip components. |
| 3 | Empty / loading state | 180 | 5 | 12 | 10800 | 74 spinners + 106 skeletons. Sizes xs/sm/md/dots. Empty blocks are still inline. |
| 4 | Surface shell (card / section) | 179 | 4 | 12 | 8592 | `surface-0..3` hand-rolled. `ptah-surface-section` / `tile` unused. Glass is a second system (below). |
| 5 | Alert / error line | 66 | 5 | 11 | 3630 | `alert-error/warning/info/success` + `alert-sm`. `ptah-dashboard-alert` paints tone as a border instead. |
| 6 | Checkbox / toggle | 37 | 6 | 13 | 2886 | xs/sm/plain checkbox and sm/xs/primary toggle. Pause switch copied twice. |
| 7 | Text input | 62 | 3 | 11 | 2046 | `input-bordered` × sm/xs. `ptah-field` unused. Order, mono, and `bg-surface-0` drift. |
| 8 | Modal / confirm | 38 | 6 | 7 | 1596 | `modal-open` vs `<dialog>`, three max widths, three focus models. `ptah-native-modal` already exists. |
| 9 | Glass attribute | 39 | 5 | 3 | 585 | `content` / `tile` / `chrome` / `overlay` / `plate`. Fold into the surface primitive (rank 4). Onboarding holds 33 of 39 hits. |
| 10 | Select | 19 | 3 | 10 | 570 | All bordered, sm vs xs, a few height and `bg-surface-0` overrides. |

Skeleton sits inside rank 3 (106 of the 180). Alone it would score 106 × 1 × 8 = 848, with 56 of those hits in marketplace.

The formula under-ranks these because each copy is a whole component, not a repeated class token. They are still extraction targets:

- **Stat tile.** 13 identical `stat min-w-0 overflow-hidden p-4` blocks in 3 libs, plus two `ptah-stat-card`s and `ptah-dashboard-stat`. Score of the Daisy string alone is 13 × 1 × 3 = 39.
- **Page header row.** The cron / skills / review `h1` + description + actions block. `<h1>` is 35, but marketplace's 27 inflate that number.
- **Tabs / segmented control.** `role="tab"` 27 × 3 patterns (join, `tabs-boxed`, native tab group) × 6 libs = 522. `ptah-native-tab-group` covers 3 call sites.
- **Textarea.** 14 × 3 × 11 = 462. Same gap as input.
- **Menu.** Tasks-only Daisy `dropdown` + `menu` (14 and 8). One `ptah-native-dropdown` in marketplace.
- **Toast.** Absent. Banners are the current substitute and they are per feature.

## What part B should build on

UI already has the overlay and surface layer (`native-modal`, `native-drawer`, `native-tab-group`, `native-dropdown`, `native-card`, `surface-*`, `field`, `stat-card`). Part B pages do not use field, surface section/tile, or the UI stat card. The missing native row is button, input, select, textarea, checkbox/toggle, and link. The missing composites that the class counts support first are badge, alert, loading/empty, and a single surface/card shell so `surface-*` and `data-glass-surface` stop being pasted per page.
