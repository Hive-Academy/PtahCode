# Combined duplication inventory

This merges [part A](inventory-part-a.md) and [part B](inventory-part-b.md) for the Electron renderer. See those files for per-library counts and file:line samples. Direction is extraction into the existing system (`context.md`, “Direction change 2”), with PR #1028 treated as a proposed layer (`pr-1028.diff`).

**Counting caveat.** A counts static `class` attributes in inline Angular templates/HTML and normalizes to relevant class tokens; B counts regex hits across component templates. Adding the two gives an *indicative raw-use floor*, not an exact number of distinct elements. A class may contribute to two categories; B counts such as `<dialog>`, `<h1>`, `role=tab`, and `data-glass-surface` are separately reported. “Bypass” below is raw hits divided by raw hits plus observed shared-component call sites where comparable; the latter are a broad selector scan and can include a domain component with the same selector. A `100%` figure means no generic shared primitive exists, not that every instance needs migration. Do not use these ratios as enforcement baselines without one consistent template parser.

| Pattern | Combined raw floor; leading variants | Shared today / PR #1028; indicative bypass | Evidence and drift |
|---|---|---|---|
| Button | **1,014** (A461+B553); `btn btn-ghost btn-xs`, `btn btn-ghost btn-sm`, `btn btn-outline btn-sm`, `btn btn-primary btn-sm`; B reports 14 modifier tokens | Today none / `button[ptahButton]` in PR; **100% today** | `libs/frontend/chat/src/lib/settings/advanced-settings.component.ts:99,109`; `libs/frontend/marketplace/src/lib/external-installed-row.component.ts:72`; diff:1287-1310. Sizes, order, outline/ghost, focus treatment vary. |
| Input | **109** (47+62); `input input-bordered input-sm`, `input-sm`, `input-bordered input-xs` | `ptah-field` only wraps a control; PR extends `ptahFieldControl` class injection; **100% native-control bypass** | `libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts:170`; `libs/frontend/tasks-ui/src/lib/components` examples in part B:70-88; diff:1355. Existing field wrapper has zero uses in B. |
| Select | **35** (16+19); `select select-bordered select-sm/xs` | No select directive; field control in PR; **100%** | `libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:412`; part B:90-103. |
| Textarea | **17** (3+14); `textarea textarea-bordered`, `textarea-xs/sm` | No textarea directive; field control in PR; **100%** | `libs/frontend/chat/src/lib/settings/output-style/output-style-instructions-field.component.ts:103`; part B:105-116. B also finds 16 native `<textarea>` tags. |
| Checkbox / toggle | **58** (A27+B20 checkbox+B11 toggle); `checkbox checkbox-xs checkbox-primary`, `toggle toggle-sm toggle-primary` | None / none; **100%** | `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:194,245`; `libs/frontend/skill-synthesis-ui/src/lib/components/skills-pause-switch.component.ts:93-97`; part B:118-137. B finds 37 native checkbox inputs, so class total is a floor. |
| Link | **29** (11+18); `link link-hover`, `link-primary` | None / none; **100%** | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:61`; part B:139-145. Other plain anchors and `btn-link` are additional. |
| Field | **≥11** (`label-text` A2 + B5, `form-control` B9 overlap possible) | `ptah-field` exists, PR changes `ptahFieldControl`; **effectively all bespoke in B** | `libs/frontend/ui/src/lib/surfaces/field.component.ts:13,33`; part B:84-88,163-165. Structural label/hint/error duplication exceeds class count. |
| Dialog / modal / drawer / confirm | **≥61** (A23 modal/drawer attributes+B38 `class=modal`), plus B19 native `<dialog>` | Native modal/drawer exist (7/12 broad call-site hits); PR does not add these; **roughly 75–90% raw for comparable overlays**, method-sensitive | `libs/frontend/chat/src/lib/update-dialog/update-dialog.component.ts:48-89`; `libs/frontend/git-ui/src/lib/shared/git-confirm-dialog.component.ts:52-68`; part B:147-159,293-304. Raw `modal-open` and native dialog differ in focus/inert handling. |
| Card / section / surface | Daisy card **15** (A5+B10); `surface-1/2/3` **180** (A20+B160); B has 39 `data-glass-surface` uses | `ptah-surface-card/section/tile`, `ptah-native-card`, catalog card; PR adds list-detail, page header, toolbar; **high bypass**, section/tile have zero B uses | `libs/frontend/chat/src/lib/components/organisms/execution/agent-execution.component.ts:66`; `libs/frontend/onboarding/src/lib/shared/status-card.component.ts:11-12`; part B:167-194. Radius `rounded`, `rounded-xl`, `rounded-box`, `rounded-[22px]` differs. |
| Stat tile | **26** class blocks (A13 `stats-*`+B13 Daisy `stat`); four distinct implementations | UI `ptah-stat-card`, PR adds `size='dense'`; **near-total bypass in B**; marketplace collision has same selector | `libs/frontend/chat-ui/src/lib/molecules/session/session-stats-summary.component.html:1,272`; `libs/frontend/marketplace/src/lib/ui/stat-card.component.ts:65`; diff:1384-1401; part B:197-214. |
| Badge / chip | **246** (A134+B112); `badge-outline/ghost` × `xs/sm` plus tones | Today only domain `ptah-file-status-badge`; PR `ptah-status-badge`; **near 100% today** | `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts:214`; `libs/frontend/tasks-ui` part B:216-235; diff:1163-1169. Eight local status-chip components. |
| List row / list-detail | Static Daisy marker **1** in A; B documents repeated bespoke rows, no comparable total | No generic row today / PR `div[ptahListRow]`, `ptah-list-detail`; **structural bypass, unquantified** | `libs/frontend/notification-center/src/lib/notification-center.component.ts:48`; part B:236-243; diff:846-862,929-940. Row action clusters differ. |
| Page header / toolbar | No reliable class total; B finds 35 `<h1>` and seven named local headers | None today / PR `ptah-page-header`, `ptah-toolbar`; **structural bypass, unquantified** | `libs/frontend/command-center/src/lib/components/command-center-header.component.ts:10`; part B:245-266; diff:1036-1049,1228-1240. Marketplace has 27 of B's 35 `h1`, so that is not a page count. |
| Tabs / segmented | A20 class attributes+B2 `tabs` = **22**, plus B27 `role=tab` | `ptah-native-tab-group` (B reports three uses); PR adds none; **most tablists bypass** | `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:247-260`; `libs/frontend/memory-curator-ui` part B:268-279. Shell, `tabs-boxed`, and native group differ. |
| Menu / dropdown | A5+B14 `dropdown` = **19**, plus B8 `menu` | Native dropdown/popover and CDK counterparts exist; PR adds none; **raw markup remains, ratio unquantified** | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:206-257`; part B:281-291. |
| Toast / alert / banner | Alert **78** (A12+B66); B finds zero `toast` classes | No toast/alert today; PR state panel handles some error/partial states; **100% generic alert bypass** | `apps/ptah-extension-webview/src/app/app.html:17`; `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts:157`; part B:305-307,315-334. Several feature banners duplicate a notice shell. |
| Empty / loading / error | **≥262** (A82+B74 spinners+B106 skeleton; overlapping state class attributes possible); `loading-spinner loading-xs`, `skeleton` | Catalog skeleton and chat skeleton block today; PR `ptah-state-panel`; **high bypass**, exact ratio unavailable | `libs/frontend/chat/src/lib/settings/advanced-settings.component.ts:126`; `libs/frontend/marketplace` part B:309-330; diff:1104-1125. Empty layouts are often classless custom blocks. |

### Duplicated local components, not just utilities

| Role | Copies / evidence |
|---|---|
| Confirm/alert dialog | **7**: `ptah-git-confirm-dialog`, `ptah-confirmation-modal`, `ptah-review-confirm-dialog`, `ptah-direct-removal-confirm`, `ptah-bulk-rebase-confirm`, `ptah-harness-builder-leave-dialog`, `ptah-harness-repair-dialog` (part B:336-344). |
| Status chip | **8**: `ptah-dashboard-badge`, `ptah-status-pill`, `ptah-run-status-chip`, `ptah-session-sync-chip`, `ptah-scorecard-badge`, `ptah-provenance-badge`, `ptah-harness-health-badge`, `ptah-removal-lock-badge` (part B:216-235,336-344). Chat adds its liked workflow/status/token badges (part A, “Preserve and generalize”). |
| Stat tile | **4 implementation families**: UI stat card, marketplace stat card with selector collision, copied Daisy stat strip in three libs, dashboard stat (part B:197-214). |
| Pause switch | **2** near-identical components: skills and memory pause switches (part B:133-135,343). |
| Stale-library notice | **2**: setup `ptah-library-stale-notice`, marketplace `ptah-installed-library-stale-notice` (part B:332-345). |
| Header and state shell | Seven local named headers; six named transient banners plus local empty/error blocks (part B:245-266,309-345). |

### Ranked top 12 extraction targets

Heuristic: combined raw floor × part A normalized variant spread where available, then promote structural duplicates that class counts miss. This is ordering, not a precise cost model.

| Rank | Target | Basis |
|---:|---|---|
| 1 | Native button | 1,014 raw; 45 A variants, 16 B libs |
| 2 | Badge/status chip | 246 raw; 32 A variants, eight local chips |
| 3 | Surface/card/section | 180 surface tokens + 39 glass attributes; radius/role drift |
| 4 | Empty/loading/error + alert | ≥262 state tokens + 78 alerts; local state hosts |
| 5 | Native input + field | 109 inputs; label/error wiring duplicated |
| 6 | Modal/confirm dialog | ≥61 raw modal attributes; seven local dialogs |
| 7 | Checkbox/toggle | ≥58 styled controls; two copied pause switches |
| 8 | Stat tile | Four implementation families, selector collision |
| 9 | Select + textarea | 35 selects, 17 textareas; same field/focus gap |
| 10 | Page header + toolbar | Seven local headers and many structural rows |
| 11 | Tabs/segmented + menu | 22 static tab classes + 27 role tabs; 19 dropdown classes |
| 12 | List row/detail + banner/toast | Class count understates repeated row/notice anatomy; PR has starter components |
