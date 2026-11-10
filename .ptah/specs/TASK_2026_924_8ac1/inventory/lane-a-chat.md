# Chat renderer control inventory (lane A)

## Method and scope

Scope: `libs/frontend/chat/src/lib/**`, `*.ts` inline templates and `*.html`. Excludes settings, specs, stories, and test fixtures. Raw counts are regex occurrences from `rg -o -N` with the specified globs; classified counts are template opening elements, including elements within `@for` once. Families overlap. Counts and looks are approximate where template regex parsing or dynamic classes are involved.

## Summary

| Family | Classified | Looks | Top surfaces | Approximate? |
|---|---:|---:|---|---|
| F1 field/input | 10 | 8 | previous-sessions-toolbar, session-filter-bar, session-organization-editor | Yes |
| F2 textarea | 3 | 3 | execution, chat-input, peer-session-send | Yes |
| F3 select/dropdown/menu/combobox | 34 | 22 | session-inspector, chat-input, send-to-messaging | Yes |
| F4 toggle/checkbox/radio | 6 | 4 | session-filter-bar, molecules, session-organization-editor | Yes |
| F5 button/icon button | 213 | 100 | templates, session-inspector, organisms | Yes |
| F6 tabs/segmented | 17 | 3 | templates | Yes |
| F7 dialog/modal/drawer/popover/tooltip | 184 | 111 | session-inspector, templates, execution | Yes |
| F8 table/list row | 42 | 21 | session-inspector, notifications, session-organization-chips | Yes |
| F9 card/panel/section header | 37 | 31 | templates, execution, notifications | Yes |
| F10 badge/chip/status | 70 | 47 | execution, organisms, agent-card | Yes |
| F11 empty state/skeleton/spinner | 48 | 26 | execution, session-inspector, chat-input | Yes |
| F12 toast/alert/banner | 69 | 36 | templates, session-inspector, display-window | Yes |
| F13 avatar/mark | 6 | 4 | templates, transcript, setup-plugins | Yes |
| F14 other | 11 | 6 | session-inspector, subagent-lane, execution | Yes |

## F1 field/input

**Classified:** 10. **Raw patterns:** `<input\b` 17.
Input types: text 7, date 2, url 1.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `grow text-xs` | 2 | `libs/frontend/chat/src/lib/components/molecules/previous-sessions-toolbar/previous-sessions-toolbar.component.ts:74` |
| `${FOCUS_RING} bg-surface-0 border-surface-border h-8 input input-sm rounded-lg text-xs w-f` | 2 | `libs/frontend/chat/src/lib/components/molecules/previous-sessions-toolbar/previous-sessions-toolbar.component.ts:146` |
| `bg-base-100 border-base-content/10 focus:border-primary input input-bordered input-sm w-fu` | 1 | `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:203` |
| `input input-bordered w-full` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.html:67` |
| `${FOCUS_RING} bg-surface-0 border-surface-border h-8 input input-sm rounded-lg w-full` | 1 | `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:224` |
| `${FOCUS_RING} bg-surface-0 border-[color:var(--surface-border-strong)] h-7 input input-bor` | 1 | `libs/frontend/chat/src/lib/components/molecules/session-list-row/session-list-row.component.ts:165` |
| `font-mono input input-bordered input-sm text-xs` | 1 | `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:259` |
| `input input-bordered input-sm text-xs` | 1 | `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:365` |

**Surfaces:** previous-sessions-toolbar/previous-sessions-toolbar.component (3), session-filter-bar/session-filter-bar.component (2), session-organization-editor/session-organization-editor.component (2), templates/app-shell.component (1), session-inspector/inspector-session-actions.component (1), session-list-row/session-list-row.component (1).
**Binding:** ngModel 1, signals/events 9.

## F2 textarea

**Classified:** 3. **Raw patterns:** `<textarea\b` 5.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `leading-snug resize-none text-[11px] textarea textarea-bordered textarea-xs` | 1 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:365` |
| `bg-transparent border-0 focus:outline-none focus:ring-0 leading-[1.6] outline-none resize-` | 1 | `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:283` |
| `h-24 resize-none text-sm textarea textarea-bordered w-full` | 1 | `libs/frontend/chat/src/lib/components/molecules/peer-session-send/peer-session-send-dialog.component.ts:102` |

**Surfaces:** execution/inline-agent-bubble.component (1), chat-input/chat-input.component (1), peer-session-send/peer-session-send-dialog.component (1).
**Binding:** signals/events 3.

## F3 select/dropdown/menu/combobox

**Classified:** 34. **Raw patterns:** `<select\b` 6; `ptah-native-dropdown|ptah-native-autocomplete|ptah-native-popover|ptah-native-option|ptah-provider-model-picker|ptah-peer-session-picker` 20; `\bdropdown(-content)`\b` 50; `\bmenu\b` 47; `role="(menu|menuitem|listbox|combobox|option)"` 22; `cdkMenu|ngListbox|ngCombobox|ngOption` 0.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `<unstyled ptah-native-popover>` | 4 | `libs/frontend/chat/src/lib/components/molecules/mcp-status-chip.component.ts:25` |
| `btn btn-ghost btn-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-b` | 3 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.html:16` |
| `focus-visible:bg-base-300 focus-visible:outline-none hover:bg-base-300 rounded-md text-lef` | 2 | `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:365` |
| `<unstyled ptah-native-dropdown>` | 2 | `libs/frontend/chat/src/lib/components/molecules/chat-input/effort-selector.component.ts:104` |
| `<unstyled ptah-native-option>` | 2 | `libs/frontend/chat/src/lib/components/molecules/chat-input/effort-selector.component.ts:162` |
| `btn btn-ghost btn-sm font-normal h-auto text-left w-full` | 2 | `libs/frontend/chat/src/lib/components/molecules/send-to-messaging/send-to-messaging.component.ts:72` |
| `${FOCUS_RING} bg-surface-0 border-surface-border h-8 rounded-lg select select-sm sm:flex-i` | 2 | `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:279` |
| `select select-bordered select-sm w-full` | 2 | `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:158` |
| `select select-bordered select-sm` | 2 | `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:270` |
| `bg-base-200 border border-base-300 rounded-lg shadow-lg suggestions-panel` | 1 | `libs/frontend/chat/src/lib/components/file-suggestions/unified-suggestions-dropdown.component.ts:58` |
| `bg-surface-1 border border-surface-border rounded-md shadow-lg` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-actions-menu.component.ts:87` |
| `focus-visible:bg-base-content/5 focus-visible:outline-none h-8 hover:bg-base-content/5 tex` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-actions-menu.component.ts:96` |
Additional looks: 10.

**Surfaces:** chat-input/chat-input.component (5), session-inspector/inspector-session-actions.component (4), session-organization-editor/session-organization-editor.component (4), session-inspector/inspector-task-section.component (3), send-to-messaging/send-to-messaging.component (3), session-filter-bar/session-filter-bar.component (3), session-inspector/inspector-agent-actions-menu.component (2).
**Binding:** signals/events 32, static/indirect 1, native popover 1.

## F4 toggle/checkbox/radio

**Classified:** 6. **Raw patterns:** `type="checkbox"` 6; `type="radio"` 0; `\btoggle\b|\bcheckbox\b|\bradio\b` 73; `role="switch"` 0.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `checkbox checkbox-xs` | 2 | `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:188` |
| `toggle toggle-xs` | 2 | `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:239` |
| `checkbox checkbox-sm` | 1 | `libs/frontend/chat/src/lib/components/molecules/confirmation-dialog.component.ts:58` |
| `toggle toggle-sm` | 1 | `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:197` |

**Surfaces:** session-filter-bar/session-filter-bar.component (4), molecules/confirmation-dialog.component (1), session-organization-editor/session-organization-editor.component (1).
**Binding:** signals/events 6.

## F5 button/icon button

**Classified:** 213. **Raw patterns:** `<button\b` 204; `\bbtn\b` 453; `ptahButton|ptahSetupAction|ptahRailIconAction` 0; `role="button"` 1; `<a\b` 3.
Kinds: link 3, text button 181, icon-only 29.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `btn btn-ghost btn-xs` | 30 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:573` |
| `<unstyled button>` | 12 | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:90` |
| `btn btn-ghost btn-square btn-xs` | 10 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:239` |
| `no-drag tab whitespace-nowrap` | 8 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:247` |
| `btn btn-ghost btn-sm` | 7 | `libs/frontend/chat/src/lib/components/templates/chat-view.component.html:166` |
| `icon-btn-label text-xs` | 6 | `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:70` |
| `btn btn-primary btn-sm` | 6 | `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:226` |
| `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 font-medium h` | 6 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.ts:47` |
| `btn btn-link btn-xs` | 5 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:451` |
| `btn btn-ghost btn-square btn-xs focus-visible:outline focus-visible:outline-2 focus-visibl` | 5 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.html:4` |
| `btn btn-primary btn-xs` | 4 | `libs/frontend/chat/src/lib/components/molecules/notifications/auth-required-banner.component.ts:74` |
| `border cursor-pointer rounded-lg shrink-0 transition-all` | 3 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:346` |
Additional looks: 88.

**Surfaces:** templates/app-shell.component (16), templates/electron-shell.component (13), organisms/agent-monitor-panel.component (10), execution/inline-agent-bubble.component (9), session-inspector/inspector-session-actions.component (9), session-inspector/inspector-task-section.component (9), session-organization-editor/session-organization-editor.component (9).
**Binding:** signals/events 206, static/indirect 7.

## F6 tabs/segmented

**Classified:** 17. **Raw patterns:** `role="(tab|tablist|tabpanel)"` 10; `\btabs`\b` 1855; `\bjoin\b` 46; `ptah-native-tab-group` 0.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `no-drag tab whitespace-nowrap` | 8 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:247` |
| `tab-label whitespace-nowrap` | 8 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:257` |
| `electron-tabs no-drag tabs tabs-lifted` | 1 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:241` |

**Surfaces:** templates/electron-shell.component (17).
**Binding:** static/indirect 9, signals/events 8.

## F7 dialog/modal/drawer/popover/tooltip

**Classified:** 184. **Raw patterns:** `<dialog\b` 6; `\bmodal\b` 89; `ptah-native-modal|ptah-native-drawer` 0; `\bdrawer\b` 4; `popover` 36; `\btooltip\b` 18; `data-tip` 0; `title="|\[title\]|\[attr\.title\]` 159; `role="dialog"` 7; `Overlay\b|cdkConnectedOverlay` 30.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `btn btn-ghost btn-xs` | 9 | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:235` |
| `no-drag tab whitespace-nowrap` | 8 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:247` |
| `<unstyled div>` | 7 | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:49` |
| `<unstyled button>` | 6 | `libs/frontend/chat/src/lib/components/molecules/mcp-status-chip.component.ts:27` |
| `btn btn-ghost btn-square btn-xs` | 6 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:239` |
| `text-base-content-muted` | 6 | `libs/frontend/chat/src/lib/components/molecules/agent-card/cli-lane-usage-summary.component.ts:30` |
| `<unstyled dialog>` | 5 | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:48` |
| `text-[11px] text-base-content-muted truncate` | 5 | `libs/frontend/chat/src/lib/components/organisms/execution/monitor-card.component.ts:43` |
| `btn btn-ghost btn-square btn-xs focus-visible:outline focus-visible:outline-2 focus-visibl` | 5 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.html:4` |
| `<unstyled time>` | 5 | `libs/frontend/chat/src/lib/components/molecules/delivery-status/delivery-status.component.ts:23` |
| `<unstyled form>` | 4 | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:89` |
| `truncate` | 4 | `libs/frontend/chat/src/lib/components/molecules/chat-input/model-selector.component.ts:79` |
Additional looks: 99.

**Surfaces:** lane-event/lane-event-row.component (12), execution/inline-agent-bubble.component (11), organisms/agent-monitor-panel.component (8), templates/app-shell.component (8), templates/electron-shell.component (8), agent-card/agent-card-header.component (7), agent-card/cli-lane-usage-summary.component (7).
**Binding:** native dialog 5, static/indirect 25, signals/events 153, native popover 1.

## F8 table/list row

**Classified:** 42. **Raw patterns:** `<table\b` 0; `\btable\b` 6; `ptah-list-row|ptahInboxRow|ptah-list-detail` 0; `<li\b` 28; `role="(row|listitem)"` 4; `@for` 85.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `<unstyled li>` | 18 | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:44` |
| `border cursor-pointer rounded-lg shrink-0 transition-all` | 3 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:346` |
| `bg-base-200 border border-base-content/15 focus-visible:outline focus-visible:outline-2 fo` | 2 | `libs/frontend/chat/src/lib/components/molecules/background-task-tiles/background-task-tiles.component.ts:29` |
| `bg-base-200 rounded` | 2 | `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:219` |
| `btn btn-ghost btn-sm btn-square focus-visible:outline-none focus-visible:ring-2 focus-visi` | 1 | `libs/frontend/chat/src/lib/components/molecules/global-config-actions.component.ts:37` |
| `focus-visible:bg-base-content/5 focus-visible:outline-none h-8 hover:bg-base-content/5 tex` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-actions-menu.component.ts:96` |
| `duration-[120ms] st-r transition-colors` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts:144` |
| `text-state-need text-xs` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-request-panel.component.ts:270` |
| `btn btn-ghost btn-xs font-mono font-normal` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:188` |
| `font-mono` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:211` |
| `focus-visible:outline focus-visible:outline-2 hover:bg-base-content/5 rounded-md tabular-n` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.html:30` |
| `text-sm` | 1 | `libs/frontend/chat/src/lib/components/organisms/transcript/lane-thread-row.component.ts:13` |
Additional looks: 9.

**Surfaces:** notifications/install-scope-migration-notice.component (6), session-organization-chips/session-organization-chips.component (6), session-inspector/inspector-task-section.component (4), organisms/agent-monitor-panel.component (3), previous-sessions/previous-sessions-modal.component (2), session-inspector/inspector-agent-actions-menu.component (2), session-inspector/inspector-agents-section.component (2).
**Binding:** signals/events 21, static/indirect 21.

## F9 card/panel/section header

**Classified:** 37. **Raw patterns:** `\bcard\b` 201; `ptah-native-card|ptah-surface-card|ptah-surface-section|ptah-surface-tile|ptah-stat-card|ptah-page-header|ptah-toolbar` 0; `data-glass-surface` 21; `\bcollapse\b` 35; `<details\b` 3; `<h[23]\b` 16.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `<unstyled div>` | 3 | `libs/frontend/chat/src/lib/components/organisms/workspace-sidebar.component.ts:54` |
| `<unstyled ptah-sidebar-tab>` | 2 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:486` |
| `ae-collapse-wrapper` | 2 | `libs/frontend/chat/src/lib/components/organisms/execution/agent-execution.component.ts:94` |
| `ae-collapse-inner` | 2 | `libs/frontend/chat/src/lib/components/organisms/execution/agent-execution.component.ts:98` |
| `<unstyled details>` | 2 | `libs/frontend/chat/src/lib/components/molecules/notifications/install-scope-migration-notice.component.ts:111` |
| `bg-base-200 border border-base-300 rounded-lg shadow-lg suggestions-panel` | 1 | `libs/frontend/chat/src/lib/components/file-suggestions/unified-suggestions-dropdown.component.ts:58` |
| `bubble-collapse-wrapper` | 1 | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:33` |
| `bubble-collapse-inner` | 1 | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:37` |
| `bg-surface-1 border-b border-surface-border navbar` | 1 | `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:56` |
| `bg-base-200 border border-base-content/10 rounded-xl shadow-lg w-72` | 1 | `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:193` |
| `bg-base-200 border-base-content/15 border-l text-xs w-36` | 1 | `libs/frontend/chat/src/lib/components/templates/chat-view.component.html:211` |
| `bg-surface-1 border-b border-surface-border h-10` | 1 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:216` |
Additional looks: 19.

**Surfaces:** templates/electron-shell.component (7), execution/agent-execution.component (4), chat-input/chat-input.component (3), notifications/install-scope-migration-notice.component (3), organisms/message-bubble.component (2), templates/app-shell.component (2), templates/chat-view.component (2).
**Binding:** signals/events 19, static/indirect 18.

## F10 badge/chip/status

**Classified:** 70. **Raw patterns:** `\bbadge\b` 215; `ptah-status-badge|ptah-file-status-badge` 0; `rounded-full` 37; `\bkbd\b` 0.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `badge badge-info badge-xs` | 4 | `libs/frontend/chat/src/lib/components/file-suggestions/suggestion-option.component.ts:85` |
| `h-2 rounded-full shrink-0 w-2` | 4 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:323` |
| `badge badge-outline badge-xs` | 4 | `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts:214` |
| `badge badge-warning badge-xs` | 3 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:496` |
| `animate-pulse badge badge-warning badge-xs` | 2 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:371` |
| `badge badge-sm bg-base-content/10 border-0 text-base-content` | 2 | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:323` |
| `badge badge-sm badge-warning` | 2 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:185` |
| `animate-pulse bg-current h-1.5 rounded-full w-1.5` | 2 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:216` |
| `badge badge-error badge-xs` | 2 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:233` |
| `badge badge-ghost badge-xs` | 2 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:263` |
| `badge badge-ghost badge-sm font-mono` | 2 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:92` |
| `badge badge-ghost badge-sm text-[9px] text-base-content-muted` | 2 | `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts:135` |
Additional looks: 35.

**Surfaces:** execution/inline-agent-bubble.component (13), organisms/agent-monitor-panel.component (9), agent-card/agent-card-header.component (9), execution/send-message-chip.component (5), lane-event/lane-event-row.component (4), file-suggestions/suggestion-option.component (3), peer-session-send/peer-session-send-dialog.component (3).
**Binding:** static/indirect 43, signals/events 27.

## F11 empty state/skeleton/spinner

**Classified:** 48. **Raw patterns:** `\bloading\b` 156; `skeleton` 22; `animate-spin` 16; `animate-pulse` 16; `ptah-state-panel` 0.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `loading loading-spinner loading-xs` | 11 | `libs/frontend/chat/src/lib/components/file-suggestions/unified-suggestions-dropdown.component.ts:80` |
| `animate-spin h-3 w-3` | 5 | `libs/frontend/chat/src/lib/components/organisms/execution/agent-execution.component.ts:85` |
| `animate-spin h-2.5 w-2.5` | 3 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:155` |
| `animate-spin size-3` | 3 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.ts:83` |
| `animate-pulse badge badge-warning badge-xs` | 2 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:371` |
| `loading loading-md loading-spinner` | 2 | `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:278` |
| `animate-spin h-3.5 w-3.5` | 2 | `libs/frontend/chat/src/lib/components/organisms/execution/agent-execution.component.ts:224` |
| `animate-pulse bg-current h-1.5 rounded-full w-1.5` | 2 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:216` |
| `animate-pulse bg-primary h-1.5 rounded-full w-1.5` | 1 | `libs/frontend/chat/src/lib/components/organisms/workspace-sidebar.component.ts:77` |
| `text-center` | 1 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:444` |
| `animate-spin h-3 text-base-content-muted w-3` | 1 | `libs/frontend/chat/src/lib/components/organisms/execution/agent-execution.component.ts:159` |
| `h-3 loading loading-spinner shrink-0 w-3` | 1 | `libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-modal.component.html:247` |
Additional looks: 14.

**Surfaces:** execution/inline-agent-bubble.component (6), execution/agent-execution.component (5), session-inspector/inspector-agents-section.component (3), session-inspector/inspector-task-section.component (3), transcript/chat-transcript.component (3), organisms/agent-monitor-panel.component (2), templates/electron-shell.component (2).
**Binding:** static/indirect 32, signals/events 16.

## F12 toast/alert/banner

**Classified:** 69. **Raw patterns:** `\balert\b` 56; `toast` 4; `banner` 192; `role="(alert|status)"` 59; `aria-live` 9.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `text-error text-xs` | 14 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:522` |
| `sr-only` | 7 | `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html:187` |
| `text-base-content-muted text-xs` | 5 | `libs/frontend/chat/src/lib/components/templates/display-window/display-window.component.ts:90` |
| `text-state-err text-xs` | 4 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts:203` |
| `<unstyled div>` | 3 | `libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-load-state.component.ts:120` |
| `text-error` | 2 | `libs/frontend/chat/src/lib/components/templates/chat-view.component.html:238` |
| `text-base-content text-sm` | 2 | `libs/frontend/chat/src/lib/components/templates/electron-welcome.component.ts:144` |
| `alert alert-error alert-soft text-xs` | 2 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:103` |
| `bg-base-300/30 border border-warning/40 rounded` | 2 | `libs/frontend/chat/src/lib/components/molecules/notifications/auth-required-banner.component.ts:35` |
| `empty-chat__notice` | 2 | `libs/frontend/chat/src/lib/components/molecules/setup-plugins/chat-empty-state-screen.component.ts:120` |
| `bg-warning/10 border border-warning/25 rounded` | 1 | `libs/frontend/chat/src/lib/components/molecules/mcp-server-list.component.ts:45` |
| `bg-base-200 border border-primary/30 rounded-lg shadow-lg text-xs w-64` | 1 | `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:87` |
Additional looks: 24.

**Surfaces:** templates/chat-view.component (8), display-window/display-window.component (6), display-sheet/display-sheet.component (4), execution/send-message-chip.component (4), templates/electron-shell.component (3), session-inspector/inspector-request-panel.component (3), session-inspector/inspector-task-section.component (3).
**Binding:** static/indirect 56, signals/events 13.

## F13 avatar/mark

**Classified:** 6. **Raw patterns:** `\bavatar\b` 8; `ptah-brand-mark|ptah-provider-mark|ptah-monogram-tile|ptah-mark-svg` 0; `<img\b` 5.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `size-12` | 2 | `libs/frontend/chat/src/lib/components/templates/electron-welcome.component.ts:98` |
| `<unstyled img>` | 2 | `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.html:166` |
| `h-5 w-5` | 1 | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:223` |
| `avatar chat-image` | 1 | `libs/frontend/chat/src/lib/components/organisms/transcript/chat-transcript.component.html:164` |

**Surfaces:** transcript/chat-transcript.component (2), templates/electron-shell.component (1), templates/electron-welcome.component (1), templates/workspace-loading-state.component (1), setup-plugins/chat-empty-state-screen.component (1).
**Binding:** signals/events 5, static/indirect 1.

## F14 other

**Classified:** 11. **Raw patterns:** `<progress\b` 1; `\bprogress\b` 53; `ptah-meter` 0; `\bdivider\b` 2; `\bsteps`\b` 34; `\bbreadcrumbs\b` 0; `\bstat\b` 29; `\blink\b` 251.

| Look (layout classes omitted) | Count | Example |
|---|---:|---|
| `btn btn-link btn-xs` | 5 | `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:451` |
| `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 font-medium h` | 2 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-git-section.component.ts:47` |
| `link link-primary text-sm` | 1 | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:60` |
| `h-1.5` | 1 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:151` |
| `link` | 1 | `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:179` |
| `link text-base-content text-xs truncate` | 1 | `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:310` |

**Surfaces:** subagent-lane/subagent-lane.component (3), execution/inline-agent-bubble.component (2), update-dialog/update-dialog.component (1), session-inspector/inspector-git-section.component (1), session-inspector/inspector-request-panel.component (1), session-inspector/inspector-task-section.component (1), chat-input/chat-input.component (1).
**Binding:** signals/events 11.

## Accessibility gaps

Static candidates; adjacent labels and component internals may resolve some. Counts approximate.

| Gap | Count | Examples (up to 8) |
|---|---:|---|
| Dialog without local labelling/focus evidence | 3 | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:48`<br>`libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-modal.component.html:2`<br>`libs/frontend/chat/src/lib/components/molecules/peer-session-send/peer-session-send-dialog.component.ts:40` |
| Input without explicit label/name | 5 | `libs/frontend/chat/src/lib/components/molecules/confirmation-dialog.component.ts:58`<br>`libs/frontend/chat/src/lib/components/templates/app-shell.component.html:203`<br>`libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:283`<br>`libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:188`<br>`libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:206` |
| Toggle without explicit accessible name | 3 | `libs/frontend/chat/src/lib/components/molecules/confirmation-dialog.component.ts:58`<br>`libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:188`<br>`libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:206` |
| Title as possible sole name | 3 | `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:259`<br>`libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:273`<br>`libs/frontend/chat/src/lib/components/organisms/execution/workflow-card.component.ts:60` |
| Clickable div/span without keyboard semantics | 2 | `libs/frontend/chat/src/lib/components/organisms/workspace-sidebar.component.ts:60`<br>`libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-modal.component.html:9` |
| Custom menu/listbox without role/keyboard | 3 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:206`<br>`libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:209`<br>`libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:255` |

## Shared component usage

Counts are template tag occurrences in scope, mapped to selector declarations in `libs/frontend/ui` or `libs/frontend/chat-ui`. A blank family has no matched shared selector. Raw tag searches may include non-template strings; approximate.

| Family | Shared selectors used (count; package) |
|---|---|
| F1 | `ptah-agent-steer-input` 2 (chat-ui), `ptah-tool-input-display` 1 (chat-ui) |
| F2 | none |
| F3 | `ptah-native-popover` 5 (ui), `ptah-native-dropdown` 2 (ui), `ptah-native-option` 2 (ui), `ptah-peer-session-picker` 1 (ui), `ptah-autopilot-popover` 1 (chat-ui) |
| F4 | `ptah-theme-toggle` 3 (chat-ui) |
| F5 | `ptah-copy-button` 1 (chat-ui), `ptah-report-response-button` 1 (chat-ui) |
| F6 | `ptah-sidebar-tab` 4 (chat-ui) |
| F7 | `ptah-native-popover` 5 (ui), `ptah-autopilot-popover` 1 (chat-ui) |
| F8 | none |
| F9 | `ptah-question-card` 1 (chat-ui), `ptah-artifact-card` 1 (chat-ui), `ptah-display-surface-sync` 1 (chat-ui), `ptah-agent-card-output` 1 (chat-ui), `ptah-compact-rail-card` 1 (chat-ui), `ptah-lane-result-card` 1 (chat-ui), `ptah-permission-request-card` 1 (chat-ui) |
| F10 | `ptah-cost-badge` 1 (chat-ui), `ptah-duration-badge` 1 (chat-ui), `ptah-token-badge` 1 (chat-ui), `ptah-turn-summary-chip` 1 (chat-ui) |
| F11 | `ptah-skeleton-block` 2 (chat-ui) |
| F12 | none |
| F13 | `ptah-agent-avatar` 3 (chat-ui) |
| F14 | `ptah-stat-cell` 6 (chat-ui), `ptah-stat-value` 4 (chat-ui), `ptah-stat-row` 2 (chat-ui), `ptah-inspector-session-stats` 2 (chat-ui), `ptah-agent-lane-stats` 1 (chat-ui), `ptah-compact-session-stats` 1 (chat-ui), `ptah-staged-steps` 1 (chat-ui) |

## Files with most raw control markup

Count is raw ripgrep pattern occurrences (including non-template matches), approximate.

| File | Raw control-pattern matches |
|---|---:|
| `libs/frontend/chat/src/lib/components/templates/chat-view.component.ts` | 181 |
| `libs/frontend/chat/src/lib/services/chat-store/compaction-lifecycle.service.ts` | 128 |
| `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts` | 121 |
| `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts` | 121 |
| `libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts` | 108 |
| `libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.service.ts` | 95 |
| `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.ts` | 84 |
| `libs/frontend/chat/src/lib/components/templates/app-shell.component.html` | 83 |
| `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts` | 82 |
| `libs/frontend/chat/src/lib/services/chat-tab-route-sync.service.ts` | 72 |
| `libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts` | 72 |
| `libs/frontend/chat/src/lib/services/provider-carry-over.service.ts` | 71 |
| `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts` | 71 |
| `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts` | 69 |
| `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts` | 61 |

## Reusable local controls

| Selector | Definition | Usages in frontend and webview (approx.) |
|---|---|---:|
| `ptah-update-dialog` | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:42` | 1 |
| `ptah-workflow-badge` | `libs/frontend/chat/src/lib/components/atoms/workflow-badge.component.ts:19` | 2 |
| `ptah-suggestion-option` | `libs/frontend/chat/src/lib/components/file-suggestions/suggestion-option.component.ts:47` | 1 |
| `ptah-unified-suggestions-dropdown` | `libs/frontend/chat/src/lib/components/file-suggestions/unified-suggestions-dropdown.component.ts:52` | 2 |
| `ptah-confirmation-dialog` | `libs/frontend/chat/src/lib/components/molecules/confirmation-dialog.component.ts:34` | 3 |
| `ptah-mcp-servers-card` | `libs/frontend/chat/src/lib/components/molecules/mcp-servers-card.component.ts:10` | 1 |
| `ptah-mcp-status-chip` | `libs/frontend/chat/src/lib/components/molecules/mcp-status-chip.component.ts:18` | 1 |
| `ptah-monitor-card` | `libs/frontend/chat/src/lib/components/organisms/execution/monitor-card.component.ts:22` | 1 |
| `ptah-schedule-wakeup-chip` | `libs/frontend/chat/src/lib/components/organisms/execution/schedule-wakeup-chip.component.ts:21` | 1 |
| `ptah-send-message-chip` | `libs/frontend/chat/src/lib/components/organisms/execution/send-message-chip.component.ts:27` | 1 |
| `ptah-task-card` | `libs/frontend/chat/src/lib/components/organisms/execution/task-card.component.ts:26` | 2 |
| `ptah-workflow-card` | `libs/frontend/chat/src/lib/components/organisms/execution/workflow-card.component.ts:28` | 1 |
| `ptah-previous-sessions-modal` | `libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-modal.component.ts:168` | 2 |
| `ptah-inspector-agent-row` | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-row.component.ts:24` | 1 |
| `ptah-lane-thread-row` | `libs/frontend/chat/src/lib/components/organisms/transcript/lane-thread-row.component.ts:10` | 1 |
| `ptah-agent-card-header` | `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts:65` | 1 |
| `ptah-agent-card` | `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card.component.ts:40` | 5 |
| `ptah-agent-continue-input` | `libs/frontend/chat/src/lib/components/molecules/agent-continue-input/agent-continue-input.component.ts:10` | 2 |
| `ptah-agent-origin-banner` | `libs/frontend/chat/src/lib/components/molecules/agent-origin-banner/agent-origin-banner.component.ts:31` | 1 |
| `ptah-chat-input` | `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:146` | 1 |
| `ptah-effort-selector` | `libs/frontend/chat/src/lib/components/molecules/chat-input/effort-selector.component.ts:96` | 1 |
| `ptah-model-selector` | `libs/frontend/chat/src/lib/components/molecules/chat-input/model-selector.component.ts:38` | 1 |
| `ptah-compact-session-card` | `libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts:114` | 3 |
| `ptah-delivery-status` | `libs/frontend/chat/src/lib/components/molecules/delivery-status/delivery-status.component.ts:15` | 7 |
| `ptah-auth-required-banner` | `libs/frontend/chat/src/lib/components/molecules/notifications/auth-required-banner.component.ts:30` | 3 |
| `ptah-resume-notification-banner` | `libs/frontend/chat/src/lib/components/molecules/notifications/resume-notification-banner.component.ts:33` | 1 |
| `ptah-session-budget-banner` | `libs/frontend/chat/src/lib/components/molecules/notifications/session-budget-banner.component.ts:51` | 1 |
| `ptah-peer-session-send-dialog` | `libs/frontend/chat/src/lib/components/molecules/peer-session-send/peer-session-send-dialog.component.ts:34` | 1 |
| `ptah-handoff-binding-picker` | `libs/frontend/chat/src/lib/components/molecules/send-to-messaging/handoff-binding-picker.component.ts:40` | 1 |
| `ptah-turn-disclosure-row` | `libs/frontend/chat/src/lib/components/molecules/turn/turn-disclosure-row.component.ts:29` | 1 |
| `ptah-session-organization-chips` | `libs/frontend/chat/src/lib/components/atoms/session-organization-chips/session-organization-chips.component.ts:54` | 1 |

## Decisions

- Raw counts include comments and non-template TypeScript strings; classified counts remove them by extracting backtick templates and HTML files.
- Input checkbox/radio elements belong to F4, other inputs to F1; anchor elements are F5 links.
- Looks omit layout classes and merge margin variants. Bound classes and cross-element accessible names require manual review; counts are approximate.
- Binding counts are element-level signals/events, ngModel, forms, CDK/aria, native dialog/popover or static/indirect; child internals are not counted.

