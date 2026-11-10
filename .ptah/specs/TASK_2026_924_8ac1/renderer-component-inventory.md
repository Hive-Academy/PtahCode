# Renderer component inventory by control family

Date: 2026-11-10. Task: TASK_2026_924_8ac1. Commit: `f26db123d` (`main`).

Scope: the full Electron renderer, which is `apps/ptah-extension-webview/src` and
`libs/frontend/*/src`. Spec files, story files and `libs/frontend/webview-e2e-harness` are not in
scope. The scope has 1546 `.ts` and `.html` files.

Settings (`libs/frontend/chat/src/lib/settings/**`) is not counted again. TASK_2026_919_8ffc
counted it: 114 form controls (`settings-forms-inventory.md` in that task folder, pull request
#1056). Section 3 gives its totals. The raw counts in section 2 show Settings in its own column,
because the same patterns also find buttons, badges and dialogs that the 919 inventory did not
count.

## 1. Method

### 1.1 Two types of count

| Type | Made by | What it is | Precision |
|---|---|---|---|
| Raw count | Coordinating session | Matches of one pattern on one line, for the full renderer | Exact for the pattern. A class attribute that continues on a second line is missed by the class patterns. Tag patterns do not have this limit. |
| Classified count | Three lanes, one lib group each | Elements in templates, each put in one family, with its class recipe ("look") | Tag-based families are exact for templates. Class-based families are approximate. |

The lanes and their reports (evidence, in `inventory/`):

| Lane | Scope | Report |
|---|---|---|
| A | `libs/frontend/chat` without `settings/` | `inventory/lane-a-chat.md` |
| B | `chat-ui`, `canvas`, `chat-execution-tree`, `chat-streaming`, `markdown`, `thoth-shell`, `core`, `notification-center`, the app shell, and the audit of `libs/frontend/ui` | `inventory/lane-b-chat-ui-and-ui-lib.md` |
| C | 17 feature page libs: marketplace, onboarding, setup-wizard, git-ui, tasks-ui, dashboard, declarative-dashboard, memory-curator-ui, machines-ui, skill-synthesis-ui, command-center, review-runs-ui, messaging-gateway-ui, harness-builder, mcp-apps-page, cron-scheduler-ui, workspace-indexing | `inventory/lane-c-feature-pages.md` |

A "look" is the class recipe of an element with layout and spacing classes removed. The number
of looks for a family is the sum of the three lanes. It is an upper limit, because the same
recipe in two lanes counts two times.

### 1.2 How to get the raw counts again

Run these commands in a POSIX shell at the repository root.

```sh
git ls-files 'libs/frontend/**/*.ts' 'libs/frontend/**/*.html' \
  'apps/ptah-extension-webview/src/**/*.ts' 'apps/ptah-extension-webview/src/**/*.html' \
  | grep -v -E '\.spec\.ts$|\.stories\.ts$|webview-e2e-harness' > files.txt   # 1546 files

# one count: total, and the split by lib group
xargs grep -o -E -e '<PATTERN>' < files.txt | cut -d: -f1 \
  | sed -E 's#^libs/frontend/chat/src/lib/settings/.*#chat-settings#;
            s#^libs/frontend/([^/]+)/.*#\1#; s#^apps/.*#app#' | sort | uniq -c
```

A lib group is a folder below `libs/frontend`, with two special groups: `chat-settings` (the
Settings folder of the `chat` lib) and `app` (`apps/ptah-extension-webview`). 26 groups have
controls.

The ratchet numbers come from `tools/ui-class-audit/baseline.json` (sum of all entries for each
class root). That tool counts each blocked class token, so its numbers are higher than the
element counts.

### 1.3 What is approximate

- Class-based counts (badge, alert, loading, skeleton, card, tab, menu, stat).
- The `title` attribute count. It includes titles on elements that are not controls.
- `role="alert"` and `role="status"` counts. Many of them are plain text lines.
- All accessibility counts. They are candidates from the source. A label that wraps the control
  or a projected name can make a candidate correct.
- Lane C classified counts for F9, F11, F12 and F14. Its patterns are wide (headings, text
  lines, words in TypeScript), so these four counts are an upper limit.
- Dialog focus management. It is not measured. Markup does not show it.

### 1.4 Checks of the lane numbers

| Check | Raw count | Lane count | Result |
|---|---:|---:|---|
| `<button>` outside Settings and the ui lib | 1137 | 1167 (A 213, B 178, C 776, links included) | Agree (lanes include 50 `<a>` and `role="button"` elements) |
| Text-type `<input>` outside Settings and the ui lib | 152 less 50 checkbox less 13 radio = 89 | 88 (A 10, B 10, C 68) | Agree |
| Checkbox and radio outside Settings and the ui lib | 63 | 60 (A 6, B 13, C 41) | Agree |
| `<select>` on feature pages (lane C) | 28 | 28 | Agree |
| `<textarea>` outside Settings | 30 | 25 (A 3, B 2, C 20) | Lanes do not count 5 that are in TypeScript strings |
| 12 `file:line` examples read in the code | not applicable | 11 point to the element, 1 points to a comment line above it | Accepted. Each example in this document was read or comes from the same lane tables. |

## 2. Raw counts for the full renderer

"Rest" is the renderer without Settings and without `libs/frontend/ui`. "Groups" is the number
of lib groups that have a minimum of one match.

| Family | Pattern | Total | Groups | ui lib | Settings | Rest |
|---|---|---:|---:|---:|---:|---:|
| F1 | `<input\b` (all types) | 241 | 22 | 11 | 78 | 152 |
| F2 | `<textarea\b` | 31 | 16 | 0 | 1 | 30 |
| F3 | `<select\b` | 67 | 15 | 13 | 17 | 37 |
| F3 | `role="(menu\|listbox\|combobox)"` | 42 | 10 | 5 | 4 | 33 |
| F3 | `class="[^"]*\b(menu\|dropdown\|dropdown-content)\b` | 36 | 6 | 6 | 0 | 30 |
| F4 | `type="checkbox"` | 74 | 18 | 1 | 23 | 50 |
| F4 | `type="radio"` | 26 | 5 | 0 | 13 | 13 |
| F4 | `class="[^"]*\btoggle\b` | 24 | 14 | 1 | 2 | 21 |
| F5 | `<button\b` | 1489 | 26 | 25 | 327 | 1137 |
| F5 | `class="[^"]*\bbtn\b` | 1108 | 26 | 7 | 193 | 908 |
| F6 | `role="tab"\|class="[^"]*\btabs?\b` | 71 | 13 | 2 | 3 | 66 |
| F6 | `class="[^"]*\bjoin\b` | 48 | 8 | 0 | 6 | 42 |
| F7 | `<dialog\b` | 40 | 12 | 5 | 5 | 30 |
| F7 | `class="[^"]*\bmodal\b` | 65 | 11 | 3 | 3 | 59 |
| F7 | `<ptah-native-drawer\|class="[^"]*\bdrawer\b` | 16 | 6 | 4 | 5 | 7 |
| F7 | `<ptah-native-popover\|\bpopover(="\|\b target)` | 46 | 7 | 7 | 25 | 14 |
| F7 | `data-tip\|class="[^"]*\btooltip\b\|ptahTooltip` | 3 | 1 | 0 | 0 | 3 |
| F7 | `(\[attr\.)?\[?title\]?="` | 669 | 24 | 2 | 55 | 612 |
| F8 | `<table\b` | 24 | 7 | 0 | 13 | 11 |
| F8 | `<li\b` | 241 | 21 | 1 | 16 | 224 |
| F9 | `class="[^"]*\bcard\b` | 27 | 11 | 1 | 4 | 22 |
| F9 | `data-glass-surface` | 188 | 11 | 8 | 45 | 135 |
| F9 | `<details\b\|class="[^"]*\bcollapse\b` | 88 | 16 | 1 | 14 | 73 |
| F10 | `class="[^"]*\bbadge\b` | 259 | 18 | 3 | 47 | 209 |
| F11 | `class="[^"]*\bloading\b` | 130 | 15 | 3 | 20 | 107 |
| F11 | `animate-spin` | 34 | 9 | 0 | 0 | 34 |
| F11 | `skeleton\|animate-pulse` | 251 | 16 | 26 | 27 | 198 |
| F12 | `class="[^"]*\balert\b` | 78 | 16 | 1 | 0 | 77 |
| F12 | `role="(alert\|status)"` | 571 | 25 | 3 | 108 | 460 |
| F13 | `<ptah-(brand-mark\|provider-mark\|monogram-tile\|mark-svg)` | 62 | 6 | 16 | 8 | 38 |
| F14 | `class="[^"]*\bstat\b` (also finds `stat-title`, `stat-value`) | 61 | 4 | 0 | 0 | 61 |
| Shared | `<ptah-native-[a-z-]+` | 102 | 12 | 18 | 37 | 47 |
| Forms API | `ngModel` (string matches, more than one for each control) | 47 | 9 | 0 | 12 | 35 |
| Forms API | Reactive forms (`formControl`, `formGroup`) | 0 | 0 | 0 | 0 | 0 |

`<button>` tags by lib group: Settings 327, chat 204, chat-ui 117, marketplace 115, onboarding
104, git-ui 93, tasks-ui 89, memory-curator-ui 46, skill-synthesis-ui 44, canvas 41,
review-runs-ui 41, setup-wizard 36, machines-ui 34, command-center 32, harness-builder 30, ui 25,
dashboard 19, declarative-dashboard 17, messaging-gateway-ui 17, cron-scheduler-ui 15,
workspace-indexing 12, app 9, notification-center 9, mcp-apps-page 6, core 5, thoth-shell 2.

Ratchet baseline (`tools/ui-class-audit/baseline.json`): 5572 blocked class tokens in 451 files.

| Root | Tokens | Largest lib groups |
|---|---:|---|
| `btn` | 3531 | Settings 839, chat 404, marketplace 345, onboarding 249, git-ui 245, chat-ui 215, tasks-ui 172, memory-curator-ui 138, skill-synthesis-ui 127, canvas 101 |
| `badge` | 772 | chat 166, Settings 147, chat-ui 85, tasks-ui 71, marketplace 66 |
| `<dynamic>` | 482 | Class expressions that the tool cannot prove safe |
| `input` | 336 | Settings 113, memory-curator-ui 42, marketplace 33, tasks-ui 24, chat-ui 23, git-ui 19, review-runs-ui 16 |
| `alert` | 174 | marketplace 43, setup-wizard 26, review-runs-ui 20, skill-synthesis-ui 17 |
| `select` | 110 | Settings 38, tasks-ui 18, chat 12, git-ui 9, review-runs-ui 9 |
| `skeleton` | 96 | marketplace 28, Settings 13, memory-curator-ui 12 |
| `textarea` | 49 | (spread) |
| `card` | 22 | (spread) |

Baseline by lib group: Settings 1363, chat 656, marketplace 548, chat-ui 432, git-ui 344,
tasks-ui 313, onboarding 288, memory-curator-ui 250, skill-synthesis-ui 196, setup-wizard 141,
review-runs-ui 134, machines-ui 130, canvas 123, harness-builder 119, declarative-dashboard 94,
command-center 91, dashboard 75, cron-scheduler-ui 73, messaging-gateway-ui 73,
workspace-indexing 48, notification-center 31, core 19, mcp-apps-page 19, thoth-shell 9, app 2,
markdown 1.

## 3. Settings totals (from TASK_2026_919_8ffc, not counted again)

114 form controls in four tabs: Providers 68, Advanced 24, Search & Voice 15, Context
Management 7.

| Control | Count | Control | Count |
|---|---:|---|---:|
| Text input | 26 | Popover select | 5 |
| Native select | 17 | Number input | 5 |
| Radio | 14 | Segmented | 3 |
| Checkbox | 12 | Other | 3 |
| Secret input | 12 | Textarea | 1 |
| Toggle | 7 | Slider | 1 |
| Combobox | 7 | Custom menu | 1 |

Binding: 110 controls use an event binding and a signal, 4 use `ngModel`. The 919 inventory
does not count the buttons (327 tags), badges (47), dialogs (5), tables (13) and native tooltips
(55) of Settings. The raw counts in section 2 include them, and the plan includes them in the
adoption batches.

## 4. Family table

Classified counts for the renderer without Settings and without the ui lib (lanes A, B and C).
"Looks" is the sum of the lanes (upper limit). "~" shows an approximate count.

| # | Family | Classified (A + B + C) | Looks | Main pages and libs | Owner in `libs/frontend/ui` today |
|---|---|---:|---:|---|---|
| F1 | Field, text input | 88 (10 + 10 + 68) | 51 | memory-curator-ui 14, marketplace 11, tasks-ui 9, review-runs-ui 9, git-ui 7, chat, chat-ui | `ptah-field`, `ptahFieldControl` (review-runs-ui only), `ptah-toolbar` search, `ptah-json-schema-form` |
| F2 | Textarea | 25 (3 + 2 + 20) | 18 | onboarding 5, chat composer, lane composer, review-runs-ui, machines-ui | `ptahFieldControl` |
| F3 | Select, dropdown, menu, combobox | 117 (34 + 8 + 75) | 71 | tasks-ui 41, chat 34, git-ui 10, review-runs-ui 9, canvas | `ptah-native-dropdown`, `ptah-native-autocomplete`, `ptah-native-option`, `ptahSetupField`, two pickers |
| F4 | Toggle, checkbox, radio | 60 (6 + 13 + 41) | 27 | chat-ui 13, harness-builder 6, marketplace 6, tasks-ui 5, review-runs-ui 5 | None |
| F5 | Button, icon button, link button | 1167 (213 + 178 + 776) | 416 | All 25 groups. marketplace 125, onboarding 111, tasks-ui 95, git-ui 94, chat 213, chat-ui 116 | `ptahButton`, `ptahSetupAction`, `ptahRailIconAction` (28 uses in total) |
| F6 | Tabs, segmented | 118 (17 + 23 + 78) | 59 | electron shell 17, onboarding 15, dashboard 12, memory-curator-ui 10, chat-ui | `ptah-native-tab-group` (6 uses) |
| F7 | Dialog, drawer, popover, tooltip | ~498 (184 + ~124 + 190) | ~222 | skill-synthesis-ui 52, git-ui 28, tasks-ui 27, marketplace 22, chat | `ptah-native-modal` 7, `ptah-native-drawer` 12, `ptah-native-popover` 37. No tooltip. |
| F8 | Table, list row | 294 (42 + 31 + 221) | 132 | marketplace 63, tasks-ui 36, onboarding 29, chat 42 | `ptah-inbox-layout`, `ptahInboxRow`, `ptahListRow`, `ptah-list-detail` (16 uses, 8 in the gallery) |
| F9 | Card, panel, section header | ~440 (37 + 42 + ~361) | ~248 | onboarding 102, marketplace 87, tasks-ui 29, memory-curator-ui 27, command-center 22 | `ptah-native-card` 13, `ptah-catalog-card` 21, `ptah-surface-*` 12, `ptah-stat-card` 6, `ptah-page-header` 1 |
| F10 | Badge, chip, status | 312 (70 + 50 + 192) | 197 | chat 70, marketplace 38, tasks-ui 33, onboarding 21, skill-synthesis-ui 20, chat-ui | `ptah-ui-status-badge` 3, `ptah-file-status-badge` 4 |
| F11 | Empty state, skeleton, spinner | ~349 (48 + 35 + ~266) | ~154 | marketplace 86, memory-curator-ui 35, tasks-ui 26, git-ui 26, chat | `ptah-state-panel` (gallery only), `ptah-catalog-card-skeleton` 10 |
| F12 | Toast, alert, banner | ~553 (69 + 54 + ~430) | ~237 | git-ui 75, marketplace 63, onboarding 62, chat 69 | None |
| F13 | Avatar, mark | 49 (6 + 8 + 35) | 14 | marketplace 18, command-center 8, canvas, chat | `ptah-brand-mark` 15, `ptah-provider-mark` 18, `ptah-monogram-tile` 16 |
| F14 | Other (stat, stepper, link, meter, progress) | ~193 (11 + 29 + ~153) | ~97 | onboarding 37, memory-curator-ui 24, marketplace 20, cron-scheduler-ui 19 | `ptah-meter` (gallery only) |

Lane C counts by lib (the 17 feature page libs):

| Lib | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | F11 | F12 | F13 | F14 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| marketplace | 11 | 0 | 5 | 6 | 125 | 4 | 22 | 63 | 87 | 38 | 86 | 63 | 18 | 20 |
| onboarding | 1 | 5 | 1 | 2 | 111 | 15 | 13 | 29 | 102 | 21 | 20 | 62 | 0 | 37 |
| setup-wizard | 0 | 0 | 1 | 1 | 35 | 0 | 8 | 10 | 8 | 8 | 16 | 25 | 0 | 0 |
| git-ui | 7 | 2 | 10 | 2 | 94 | 8 | 28 | 12 | 5 | 13 | 26 | 75 | 0 | 5 |
| tasks-ui | 9 | 1 | 41 | 5 | 95 | 8 | 27 | 36 | 29 | 33 | 26 | 19 | 0 | 8 |
| dashboard | 0 | 0 | 0 | 0 | 19 | 12 | 8 | 11 | 11 | 5 | 7 | 7 | 4 | 0 |
| declarative-dashboard | 3 | 1 | 1 | 3 | 17 | 0 | 0 | 6 | 11 | 2 | 0 | 11 | 5 | 14 |
| memory-curator-ui | 14 | 1 | 1 | 3 | 47 | 10 | 5 | 8 | 27 | 11 | 35 | 28 | 0 | 24 |
| machines-ui | 3 | 2 | 4 | 0 | 34 | 0 | 0 | 8 | 4 | 11 | 18 | 27 | 0 | 1 |
| skill-synthesis-ui | 1 | 1 | 0 | 4 | 44 | 1 | 52 | 9 | 21 | 20 | 13 | 25 | 0 | 3 |
| command-center | 2 | 0 | 0 | 0 | 32 | 8 | 2 | 2 | 22 | 9 | 4 | 21 | 8 | 0 |
| review-runs-ui | 9 | 2 | 9 | 5 | 41 | 1 | 11 | 10 | 6 | 13 | 3 | 29 | 0 | 2 |
| messaging-gateway-ui | 4 | 1 | 0 | 1 | 18 | 4 | 1 | 12 | 2 | 0 | 0 | 6 | 0 | 18 |
| harness-builder | 1 | 2 | 1 | 6 | 30 | 0 | 1 | 4 | 18 | 8 | 3 | 20 | 0 | 0 |
| mcp-apps-page | 0 | 1 | 0 | 0 | 6 | 3 | 0 | 0 | 2 | 0 | 1 | 4 | 0 | 0 |
| cron-scheduler-ui | 3 | 1 | 1 | 1 | 16 | 3 | 12 | 1 | 4 | 0 | 3 | 1 | 0 | 19 |
| workspace-indexing | 0 | 0 | 0 | 2 | 12 | 1 | 0 | 0 | 2 | 0 | 5 | 7 | 0 | 2 |

## 5. Families in detail

Each family gives the most frequent looks with one example. The lane reports have the full
tables. All paths are relative to the repository root. `chat/` means
`libs/frontend/chat/src/lib/components/`.

### F1 Field and text input

- **Count:** 88 outside Settings. Settings has 43 more (text 26, secret 12, number 5).
- **Looks (51):**

  | Look | Count | Example |
  |---|---:|---|
  | `input input-bordered` | 9 | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:67` |
  | `input input-bordered input-sm` (two class orders) | 12 | `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:157`, `libs/frontend/memory-curator-ui/src/lib/components/memory-danger-zone.component.ts:42` |
  | `input input-bordered input-sm text-xs font-mono` | 4 | `libs/frontend/marketplace/src/lib/external-marketplaces.component.ts:156` |
  | `input input-bordered input-sm pl-8 text-xs` (search with icon) | 2 | `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts:176` |
  | `input input-sm h-8 rounded-lg bg-surface-0 border-surface-border` and a focus-ring constant | 2 | `chat/molecules/previous-sessions-toolbar/previous-sessions-toolbar.component.ts:74` |
  | `input input-bordered w-full` | 1 | `chat/organisms/session-inspector/inspector-session-actions.component.html:67` |

- **Binding:** `[value]` with `(input)` or `(change)` and a signal in almost all cases.
  `ngModel` in a small number of files (47 string matches in 9 lib groups). No reactive forms.
  No CDK and no `@angular/aria` on a text input.
- **Accessibility gaps:** input without a label or a name: 38 candidates (chat 5, lane B about
  4, feature pages 29). Example:
  `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:92`.
- **Owner today:** `ptah-field` (3 uses, all in the gallery), `ptahFieldControl` (10 uses, 6 in
  review-runs-ui), `ptah-toolbar` with a search box (gallery only).

### F2 Textarea

- **Count:** 25 outside Settings (31 tags in the renderer).
- **Looks (18):** `textarea textarea-bordered` 4
  (`libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:48`).
  `textarea textarea-bordered min-h-[140px]` 2
  (`libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts:118`).
  `textarea textarea-bordered textarea-sm font-mono` 2
  (`libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts:379`).
  `textarea textarea-bordered textarea-xs` (`chat/organisms/execution/inline-agent-bubble.component.ts:365`).
  Composer with no border (`chat/molecules/chat-input/chat-input.component.ts:283`). Lane
  composer with a computed class (`libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts:18`).
- **Binding:** `(input)` and `[value]`. The two composers set their size from the content.
- **Owner today:** none for the look. `ptahFieldControl` accepts a textarea.

### F3 Select, dropdown, menu, combobox

- **Count:** 117 outside Settings. Native `<select>`: 37 outside Settings and the ui lib, 17 in
  Settings, 13 inside the ui lib (67 in total).
- **Looks (71):**

  | Look | Count | Example |
  |---|---:|---|
  | Local facet menu component (tasks) | 7 | `libs/frontend/tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:273` |
  | DaisyUI menu list with `menu-title` | 7 | `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:575` |
  | `<select>` with no class | 6 | `libs/frontend/review-runs-ui/src/lib/findings/review-findings-panel.component.ts:22` |
  | `select select-bordered select-sm` | 7 | `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:126`, `chat/molecules/session-organization-editor/session-organization-editor.component.ts:158` |
  | `select select-sm h-8 rounded-lg bg-surface-0` | 1 | `chat/molecules/session-filter-bar/session-filter-bar.component.ts:279` |
  | `ptah-native-dropdown` | 5 | `chat/molecules/chat-input/effort-selector.component.ts:104` |
  | Custom menu panel `rounded-lg border bg-base-200 p-2 shadow-lg` with `btn btn-ghost btn-sm` items | 2 panels, 11 items | `libs/frontend/canvas/src/lib/canvas-rail/canvas-focus-header.component.ts:42` |
  | Suggestions panel (option with icon, text, badge) | 1 | `chat/file-suggestions/unified-suggestions-dropdown.component.ts:58` |
  | Custom menu in the session inspector | 1 | `chat/organisms/session-inspector/inspector-agent-actions-menu.component.ts:87` |

- **Binding:** signals and `(click)` or `(change)`. Floating UI only through
  `ptah-native-dropdown` and `ptah-native-popover`. The native `popover` attribute in the theme
  toggle. `@angular/aria`: 0 uses in feature code (the gallery imports its listbox).
- **Accessibility gaps:** custom menu or listbox without a role or a keyboard handler: 23
  candidates (chat 3, feature pages 20). Examples:
  `libs/frontend/git-ui/src/lib/open-in/open-in-button.component.ts:85`,
  `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:170`,
  `chat/organisms/session-inspector/inspector-task-section.component.ts:206`.
- **Owner today:** `ptah-native-dropdown` (6 uses), `ptah-native-option` (3),
  `ptah-native-autocomplete` (inside two pickers), `ptah-provider-model-picker` (4),
  `ptah-provider-model-search-field` (3), `ptah-peer-session-picker` (1),
  `select[ptahSetupField]` (2). The older `ptah-dropdown`, `ptah-autocomplete` and `ptah-option`
  have 0 uses outside the lib.

### F4 Toggle, checkbox, radio

- **Count:** 60 outside Settings. Settings has 33 more (radio 14, checkbox 12, toggle 7).
- **Looks (27):**

  | Look | Count | Example |
  |---|---:|---|
  | `checkbox checkbox-sm` | 10 | `libs/frontend/review-runs-ui/src/lib/components/review-repositories-editor.component.ts:32` |
  | `checkbox checkbox-xs` | 10 | `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:271` |
  | Checkbox with no class | 6 | `libs/frontend/harness-builder/src/lib/components/harness-config-preview.component.ts:90` |
  | `toggle toggle-sm toggle-primary` | 5 | `libs/frontend/skill-synthesis-ui/src/lib/components/skills-pause-switch.component.ts:93` |
  | `checkbox checkbox-xs checkbox-primary` | 3 | `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts:393` |
  | `toggle toggle-xs` | 2 | `chat/molecules/session-filter-bar/session-filter-bar.component.ts:188` |
  | `radio radio-xs radio-info` | 2 | `libs/frontend/chat-ui/src/lib/molecules/question-card.component.ts:150` |

- **Binding:** `[checked]` and `(change)` with a signal. `role="switch"`: 3 uses.
- **Accessibility gaps:** control without a name: about 24 candidates (chat 3, lane B about 5,
  feature pages 16). Example:
  `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:270`.
- **Owner today:** none. No toggle, checkbox or radio component is in the ui lib.

### F5 Button and icon button

- **Count:** 1167 outside Settings and the ui lib (1489 `<button>` tags in the renderer). In
  lanes A and B, 53 of 388 buttons are icon-only.
- **Looks (416 raw recipes):**

  | Look | Count | Example |
  |---|---:|---|
  | `btn btn-ghost btn-xs` (both class orders) | 167 | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:206` |
  | Button with no class (styled by a parent or a bound class) | 83 | `libs/frontend/review-runs-ui/src/lib/findings/review-findings-panel.component.ts:26` |
  | `btn btn-ghost btn-sm` | 68 | `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:63` |
  | `btn btn-primary btn-sm` | 54 | `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:25` |
  | `btn btn-ghost btn-square btn-xs` (icon) | 13 | `chat/organisms/agent-monitor-panel.component.ts:239` |
  | Shell tab button `no-drag tab whitespace-nowrap` | 8 | `chat/templates/electron-shell.component.ts:247` |
  | `btn btn-xs join-item` (segmented) | 11 | `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html:11` |
  | `btn btn-link btn-xs` | 5 | `chat/organisms/execution/inline-agent-bubble.component.ts:451` |

  Lane B found these modifiers on 175 buttons: `btn-ghost` 77, `btn-xs` 68, `btn-sm` 41,
  `btn-primary` 21, `btn-square` or `btn-circle` 14, `btn-outline` 9, state colors 14. After the
  merge of equal recipes in a different class order, lane B has about 20 real looks from 97 raw
  recipes. The same ratio gives about 85 real looks for the renderer. This number is an
  estimate.
- **Binding:** `(click)` and `[disabled]`. A busy state is written by hand each time (a spinner
  inside the button).
- **Accessibility gaps:** icon button without a name: 11
  (`libs/frontend/tasks-ui/src/lib/components/task-board-header.component.ts:81`). `title` as the
  only name: 42 (`libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:25`).
- **Owner today:** three recipes that are not related: `button[ptahButton]` (14 uses, 4 in the
  gallery, 10 in review-runs-ui), `button[ptahSetupAction]` (12: onboarding 7, machines-ui 3,
  review-runs-ui 2), `button[ptahRailIconAction]` (2, canvas). 28 of 1489 buttons (2 %) use an
  owner.

### F6 Tabs and segmented control

- **Count:** 118 outside Settings.
- **Looks (59):** `join` wrapper 11
  (`libs/frontend/memory-curator-ui/src/lib/components/memory-search-bar.component.ts:53`).
  `join-item btn btn-xs` 7 and `join-item btn btn-sm` 4. The shell tab strip, 17 elements and 3
  looks (`chat/templates/electron-shell.component.ts:247`). Custom tab strips in the theme
  toggle (`libs/frontend/chat-ui/src/lib/atoms/theme-toggle.component.ts:228`) and the display
  panel (`libs/frontend/chat-ui/src/lib/molecules/display-panel.component.ts:204`). A custom
  tab list in command-center
  (`libs/frontend/command-center/src/lib/components/command-center-page.component.html:236`).
- **Binding:** signals and `(click)`.
- **Accessibility gaps:** `role="tablist"` without arrow-key handling: 4 in lane B
  (`libs/frontend/canvas/src/lib/canvas-rail/canvas-lane-tabs.component.ts:142`).
- **Owner today:** `ptah-native-tab-group` (6 uses). `ptah-sidebar-tab` is local to chat-ui (5
  uses). No segmented control.

### F7 Dialog, modal, drawer, popover, tooltip

- **Count:** about 498 classified. This number is high because the lanes count each `title`
  attribute (lane A 159, lane B 106). Without `title`: 40 `<dialog>` tags, 65 `modal` class
  attributes, 16 drawers, 46 popovers.
- **Looks (about 222):** `dialog modal modal-open` 8
  (`libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:45`).
  `modal-action` row 9
  (`libs/frontend/skill-synthesis-ui/src/lib/components/clones/bulk-rebase-confirm.component.ts:63`).
  `ptah-native-popover` 37 uses, `ptah-native-drawer` 12, `ptah-native-modal` 7.
  `ptah-confirmation-dialog` local to chat (3 uses) and one more confirm modal in setup-wizard.
- **Tooltip:** 669 `title` attributes in 24 lib groups (chat 158, chat-ui 144, tasks-ui 86,
  git-ui 68, Settings 55). 3 DaisyUI tooltips (dashboard). No shared tooltip.
- **Binding:** native `<dialog>` with `showModal()`, the `popover` attribute with Floating UI,
  signals for the open state. CDK overlay: only in the older layer of the ui lib.
- **Accessibility gaps:** dialog without a label: 5
  (`libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:48`,
  `libs/frontend/setup-wizard/src/lib/components/confirmation-modal.component.ts:94`).
  `role="dialog"` without `aria-modal`: 5 in lane B. Focus management: not measured.
- **Owner today:** `ptah-native-modal`, `ptah-native-drawer`, `ptah-native-popover`. The older
  `ptah-popover` (CDK) has 0 uses outside the lib.

### F8 Table and list row

- **Count:** 294 classified. 24 `<table>` tags (Settings 13). 241 `<li>` tags.
- **Looks (132):** `<li>` with no class 90
  (`libs/frontend/review-runs-ui/src/lib/components/review-findings-table.component.ts:82`).
  `li rounded border border-base-300` 6
  (`libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:338`). Clickable row
  `border cursor-pointer rounded-lg transition-all` 3
  (`chat/organisms/agent-monitor-panel.component.ts:346`).
- **Accessibility gaps:** clickable `div` or `span` without role, tabindex or keyboard handler:
  6 (`chat/organisms/workspace-sidebar.component.ts:60`,
  `libs/frontend/onboarding/src/lib/proposal/answer-dock.component.ts:25`).
- **Owner today:** `ptah-inbox-layout` (4 uses), `button[ptahInboxRow]` (7), `div[ptahListRow]`
  (4, gallery only), `ptah-list-detail` (gallery only). No table component.

### F9 Card, panel, section header

- **Count:** about 440 classified (upper limit). 188 `data-glass-surface` attributes (onboarding
  72, Settings 45, chat 21, command-center 20). 27 DaisyUI `card` class attributes. 88
  collapsible elements (`<details>` or `collapse`).
- **Looks (about 248):** `section rounded-[22px] border border-base-300` 13
  (`libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:311`). `ptah-native-card` 11
  on feature pages
  (`libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-card.component.ts:194`).
  `ptah-catalog-card` 8 (`libs/frontend/marketplace/src/lib/smithery-surface.component.ts:415`).
  Most other elements have a recipe of their own.
- **Owner today:** two card APIs that are not related, `ptah-native-card` (13 uses) and
  `ptah-surface-card` (2 uses). Also `ptah-catalog-card` (21), `ptah-catalog-grid` (22),
  `ptah-storefront-panel` (8), `ptah-stat-card` (6), `ptah-surface-section` (9, gallery only),
  `ptah-page-header` and `ptah-toolbar` (gallery only).

### F10 Badge, chip, status

- **Count:** 312 classified. 259 `badge` class attributes in 18 lib groups. Ratchet: 772 tokens.
- **Looks (197):**

  | Look | Count | Example |
  |---|---:|---|
  | `badge badge-sm` | 11 | `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:12` |
  | `badge badge-ghost badge-sm` | 11 | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts:80` |
  | `badge badge-outline badge-sm` or `badge-xs` | 11 | `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:42`, `chat/molecules/agent-card/agent-card-header.component.ts:214` |
  | Status dot `h-2 w-2 rounded-full` | 28 | `libs/frontend/review-runs-ui/src/lib/components/review-runs-list.component.ts:57` |
  | `badge badge-info badge-xs`, `badge badge-warning badge-xs` | 7 | `chat/file-suggestions/suggestion-option.component.ts:85` |

- **Owner today:** three badge components that are not related: `ptah-ui-status-badge` (ui, 3
  uses, 2 in the gallery), `ptah-file-status-badge` (ui, 4 uses), `ptah-status-badge` (chat-ui,
  0 uses). Local badges in chat-ui: cost (4 uses), duration (2), token (1). Local to chat:
  `ptah-delivery-status` (7), `ptah-workflow-badge`.

### F11 Empty state, skeleton, spinner

- **Count:** about 349 classified (upper limit). 130 `loading` class attributes, 34
  `animate-spin`, 251 matches of `skeleton` or `animate-pulse`.
- **Looks (about 154):** `loading loading-spinner loading-xs` 74 in lanes A and C
  (`libs/frontend/skill-synthesis-ui/src/lib/components/skill-specs-control.component.ts:32`).
  Lucide icon with `animate-spin` in three sizes, 11 in chat
  (`chat/organisms/execution/agent-execution.component.ts:85`). Empty-state text
  `text-xs text-base-content-muted` 7. Two spinner systems are in use.
- **Owner today:** `ptah-state-panel` (1 use, in the gallery; 0 uses on the 17 feature page
  libs), `ptah-catalog-card-skeleton` (10), `ptah-skeleton-block` local to chat-ui (2).

### F12 Toast, alert, banner

- **Count:** about 553 classified (upper limit, includes plain status text). 78 DaisyUI `alert`
  class attributes in 16 lib groups. 571 `role="alert"` or `role="status"` attributes.
- **Looks (about 237):** inline error `text-error text-xs` 14
  (`chat/templates/electron-shell.component.ts:522`) and `text-sm text-error` 12
  (`libs/frontend/review-runs-ui/src/lib/findings/review-findings-panel.component.ts:30`).
  Status text with no class 53. DaisyUI `alert` in four tones (marketplace 43 ratchet tokens,
  setup-wizard 26, review-runs-ui 20).
- **Owner today:** none in the ui lib. Local: `ptah-notification-snackbar`
  (notification-center, 2 uses), `ptah-auth-required-banner` (chat, 3 uses).

### F13 Avatar and mark

- **Count:** 49 classified. 62 mark tags in the renderer.
- **Looks (14):** `ptah-brand-mark` 12
  (`libs/frontend/marketplace/src/lib/smithery-surface.component.ts:425`), `ptah-monogram-tile`
  9, `ptah-provider-mark` 9
  (`libs/frontend/command-center/src/lib/components/command-work-list.component.ts:65`). One
  DaisyUI avatar (`chat/organisms/transcript/chat-transcript.component.html:164`).
- **Owner today:** complete. Three marks on one SVG renderer. `ptah-agent-avatar` is local to
  chat-ui (8 uses in canvas and chat).

### F14 Other

- **Count:** about 193 classified (upper limit).
- **Looks (about 97):** DaisyUI `stat` blocks, 61 class attributes in 4 lib groups
  (`libs/frontend/memory-curator-ui/src/lib/components/memory-stats-strip.component.ts:31`).
  Local stepper `ptah-onboarding-stepper` 9
  (`libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:97`). Links `link` 8
  (`libs/frontend/onboarding/src/lib/ready/provider-panel.component.ts:170`). `<progress>` 4 in
  chat-ui. Rings and meters local to chat-ui (`ptah-context-ring`, `ptah-plan-ring`,
  `ptah-progress-ring`). Resize handles (`ptah-split-handle` 3, `ptah-electron-resize-handle`
  3).
- **Owner today:** `ptah-meter` (gallery only), `ptah-stat-card` (6 uses).

## 6. Accessibility gaps (candidates, all families)

| Gap | Chat (A) | Lane B | Feature pages (C) | Total | Closed by family |
|---|---:|---:|---:|---:|---|
| Input without a label or name | 5 | ~4 | 29 | ~38 | F1 |
| Toggle, checkbox or radio without a name | 3 | ~5 | 16 | ~24 | F4 |
| `title` as the only name of a control | 3 | 1 | 38 | 42 | F5, F7 |
| Icon button without a name | 0 | 0 | 11 | 11 | F5 |
| Custom menu or listbox without role or keyboard handler | 3 | 0 | 20 | 23 | F3 |
| Clickable `div` or `span` without role and keyboard | 2 | 1 | 3 | 6 | F8 |
| Dialog without a label | 3 | 1 | 1 | 5 | F7 |
| `role="dialog"` without `aria-modal` | not counted | 5 | not counted | 5 or more | F7 |
| Tab list without arrow keys | not counted | 4 | not counted | 4 or more | F6 |
| Dialog focus management | not measured | not measured | not measured | unknown | F7 |

## 7. What `libs/frontend/ui` has today

Source: lane B, part 2. "Uses" is the number of tag or attribute matches outside the ui lib.

| Layer | Folder | Contents | Uses |
|---|---|---|---|
| Foundation and surfaces (pull request #1028) | `foundation/`, `surfaces/` | `ptahButton` 14, `ptahFieldControl` 10, `ptah-field` 3, `ptah-inbox-layout` 4, `ptahInboxRow` 7, `ptah-stat-card` 6, `ptah-surface-card` 2, `ptah-surface-section` 9, `ptah-surface-tile` 1, `ptah-page-header` 1, `ptah-toolbar` 1, `ptah-list-detail` 1, `ptahListRow` 4, `ptah-state-panel` 1, `ptah-ui-status-badge` 3, `ptah-meter` 1 | 68. 36 of them are in the gallery. |
| Extracted (TASK_2026_904 Wave 1) | `extracted/` | `ptahSetupAction` 12, `ptahSetupField` 2, `ptahRailIconAction` 2 | 16 |
| Native | `native/` | Popover 37, catalog grid 22, catalog card 21, provider mark 18, monogram tile 16, brand mark 15, card 13, drawer 12, card skeleton 10, storefront panel 8, modal 7, dropdown 6, tab group 6, model picker 4, file status badge 4, option 3, search field 3, peer session picker 1, JSON schema form 1 | 207 |
| Older CDK layer | `overlays/`, `selection/` | `ptah-dropdown`, `ptah-popover`, `ptah-autocomplete`, `[autocompleteInput]`, `ptah-option` | 0 |
| Motion | `motion/` | `ptahMotionStage` 6, `ptahMotionRouteStage` 7 | 13 |

Duplicates and overlap inside the lib:

- Dropdown, popover, option and autocomplete exist two times (CDK layer and native layer). The
  CDK layer has no user.
- Three button recipes: `ptahButton`, `ptahSetupAction`, `ptahRailIconAction`.
- Two card APIs: `ptah-native-card` and `ptah-surface-card`.
- Two field recipes: `ptah-field` with `ptahFieldControl`, and `ptahSetupField`. TASK_2026_919
  adds a third (`ptahSettingsField`) in its worktree.
- Three badge components in two libs (ui: status, file status; chat-ui: status).

Families with no owner: toggle, checkbox and radio (F4), select as a component (F3), tooltip
(F7), alert, banner and toast (F12), spinner and skeleton (F11), segmented control (F6), table
(F8).

Related infrastructure:

- **Gallery:** route `ui-gallery` (`apps/ptah-extension-webview/src/app/app.routes.ts:205`),
  Electron only, no link in the product navigation. It shows only the foundation and surfaces
  layer.
- **Ratchet:** `tools/ui-class-audit`. It blocks 8 roots. It does not block `modal`,
  `dropdown`, `menu`, `tab`, `join`, `loading`, `toggle`, `checkbox`, `radio`, `tooltip`,
  `avatar`, `stat`, `collapse`, or raw tags.
- **Tokens:** `apps/ptah-extension-webview/src/styles.css` has glass, surface, elevation, state
  ink, motion and brand tokens. Height tokens exist (`--btn-height-*`, `--input-height`) with no
  use in feature templates. No shared focus-ring token and no control-radius token.
- **Themes:** 4 Ptah themes in `apps/ptah-extension-webview/tailwind.config.js` (`anubis`,
  `anubis-light`, `ptah-glass`, `ptah-glass-light`) and the stock DaisyUI themes in a lazy
  style sheet.

## 8. Reusable controls that are local to a feature lib

These components do the work of a shared control but are not in the ui lib. They are candidates
for an extraction source or for adoption of the owner.

| Family | Component | Lib | Uses |
|---|---|---|---:|
| F3 | `ptah-unified-suggestions-dropdown`, `ptah-effort-selector`, `ptah-model-selector` | chat | local |
| F3 | Task facet menu | tasks-ui | 7 |
| F3 | `ptah-agent-dock-menu` | canvas | 1 |
| F3, F4, F6 | `ptah-theme-toggle` (dropdown, tabs, radios, toggle in one popover) | chat-ui | 3 |
| F4 | `ptah-install-scope-field`, `ptah-motion-preference`, `ptah-motion-style-picker` | chat-ui | 1 each |
| F5 | `ptah-copy-button`, `ptah-copy-text-button`, `ptah-report-response-button` | chat-ui | 1, 3, 1 |
| F6 | `ptah-sidebar-tab` | chat-ui | 5 |
| F7 | `ptah-confirmation-dialog` | chat | 3 |
| F7 | `ptah-autopilot-popover`, `ptah-deny-message-popover` | chat-ui | local |
| F10 | `ptah-cost-badge`, `ptah-duration-badge`, `ptah-token-badge`, `ptah-status-badge` | chat-ui | 4, 2, 1, 0 |
| F10 | `ptah-delivery-status`, `ptah-workflow-badge` | chat | 7, local |
| F11 | `ptah-skeleton-block`, `ptah-typing-cursor` | chat-ui | 2, 7 |
| F12 | `ptah-notification-snackbar` | notification-center | 2 |
| F12 | `ptah-auth-required-banner` | chat | 3 |
| F13 | `ptah-agent-avatar` | chat-ui | 8 |
| F14 | `ptah-onboarding-stepper` | onboarding | 9 |
| F14 | `ptah-context-ring`, `ptah-plan-ring`, `ptah-progress-ring`, `ptah-readiness-ring` | chat-ui | local |
| F14 | `ptah-split-handle`, `ptah-electron-resize-handle` | chat-ui | 3, 3 |

## 9. Findings

1. **Buttons are the main duplication.** 1489 tags, 416 raw recipes, 63 % of the ratchet
   baseline. 2 % of the buttons use an owner. Five recipes cover 385 of the 1167 buttons outside
   Settings.
2. **The ui lib has owners for overlays and marks, and they are in use.** Popover, drawer,
   modal, catalog card and marks have 207 uses. The work there is adoption of the remaining
   hand-written dialogs (40 `<dialog>` tags).
3. **The generic layer from pull request #1028 has almost no adoption.** 68 uses, 36 of them in
   the gallery. Only review-runs-ui and machines-ui use it on a page.
4. **Five families have no owner:** toggle, checkbox and radio; tooltip; alert, banner and
   toast; spinner and skeleton; segmented control.
5. **The ui lib has internal duplicates:** an unused CDK layer, three button recipes, two card
   APIs, two field recipes and three badge components.
6. **Forms use one binding style.** Event binding with signals is the rule. `ngModel` is rare
   and reactive forms have 0 uses. The value contract of TASK_2026_919 (`model()`) fits the
   current code.
7. **`@angular/aria` is installed and not used in feature code.** Menus, tab lists and
   listboxes are written by hand, and 27 of them have no complete keyboard path.
8. **Feature pages hold most of the work.** The 17 feature page libs have 776 of the 1167
   buttons and 29 of the 38 inputs without a label. Marketplace, onboarding, tasks-ui and git-ui
   are the four largest.
9. **Native tooltips are everywhere.** 669 `title` attributes and no shared tooltip. 42 controls
   have `title` as the only name.
10. **Cards and alerts are mostly one of a kind.** About 248 recipes for 440 card elements. A
    variant list must come before adoption.

## 10. Decisions made in this inventory

| Decision | Reason | Reversible |
|---|---|---|
| Settings forms are cited from TASK_2026_919, not counted again. | The task brief says so. The raw counts show Settings in a separate column. | Yes |
| The `chat` lib is split into `chat` and `chat-settings` in all tables. | Settings is 1363 of the 2019 ratchet tokens of that lib. | Yes |
| Looks are summed across lanes and marked as an upper limit. | A merge of recipes across lanes needs a second pass. The plan does that pass in the extract batch of each family. | Yes |
| Wide lane C counts (F9, F11, F12, F14) are kept and marked approximate. | The raw counts in section 2 give the firm numbers for the same families. | Yes |
| `title` attributes are in F7 as native tooltips. | No other tooltip exists, so `title` does that work. | Yes |
