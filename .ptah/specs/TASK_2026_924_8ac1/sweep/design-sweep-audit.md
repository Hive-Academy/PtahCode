# Electron renderer design sweep

## Scope and counting

This is a static source audit of the Electron renderer, its routed surfaces in `apps/ptah-extension-webview/src/app/app.routes.ts:89-205`, and feature tabs mounted inside Settings, Thoth, and chat. Counts below are remaining literal DaisyUI class occurrences from `tools/ui-class-audit/baseline.json`, grouped by library; `btn` counts are base-class occurrences, not every modifier. Raw control counts are source tag occurrences (`<input>`, `<select>`, `<textarea>`) outside the UI library and tests. Dynamic class bindings and semantic uses of words such as “label” are not reliably counted. File:line examples were checked against current source. A zero means no counted raw recipe, not a claim that the screen is visually correct. No renderer was started, so clipping and viewport behavior are risks to verify during implementation rather than observed defects.

The authoritative spacing scale is `libs/frontend/ui/src/lib/tokens/ptah-tokens.css:8-31`: page gutter 24px, surface padding 16px, field gap 16px, group gap 24px, section gap 32px. Preserve intentional compact controls in dense rails; remove arbitrary `p-*`/`gap-*` only where adjacent sections differ without a content reason.

## Summary

| Page or feature | Owner gaps (ratchet) | Form issues | Spacing issues | Severity |
| --- | ---: | --- | --- | --- |
| App shell / gallery | 1 shell alert; gallery is owner reference | Gallery exercises fields | Shell toast placement | LOW |
| Canvas | 13 buttons, 6 skeletons | 2 controls, 1 field | Dense rail/inspector | MEDIUM |
| Command Center | 2 buttons, 1 alert | 2 inputs | Toast and pending input | MEDIUM |
| Cron scheduler | 1 alert | 6 controls, 5 fields | Mixed inline grouping | LOW |
| Analytics dashboard | 8 buttons, 2 alerts, 1 badge | Filters use local controls | KPI/table density | HIGH |
| Declarative dashboard | 0 counted | 7 controls, 0 fields | Widget grid density | MEDIUM |
| Git UI | 16 buttons, 4 skeletons, 2 alerts | 14 controls, 1 field | Toolbar and editor density | HIGH |
| Machines | 1 button, 6 skeletons | 6 controls, 0 fields | List/overview loading | MEDIUM |
| Marketplace | 17 buttons, 16 alerts, 28 skeletons, 2 badges | 18 inputs, 4 fields | Catalog/installer density | HIGH |
| MCP Apps | 0 counted | 1 textarea | Apps detail hierarchy | LOW |
| Memory curator | 7 buttons, 12 skeletons, 4 alerts | 19 controls, 8 fields | Diagnostics/detail density | HIGH |
| Messaging gateway | 4 buttons, 3 alerts | 6 controls, 0 fields | Token form grouping | MEDIUM |
| Notifications | 4 buttons | No form surface | Small action targets | LOW |
| Onboarding | 7 buttons, 2 skeletons | 13 controls, 5 fields | Step-to-step padding | HIGH |
| Review Runs | 9 alerts, 3 skeletons, 1 toggle | 23 controls, 10 fields | Findings/filter density | HIGH |
| Setup wizard | 13 alerts, 6 skeletons, 1 button | 2 controls, 0 fields | Transcript/dialog rhythm | MEDIUM |
| Skill synthesis | 10 buttons, 7 alerts, 1 badge | 7 controls, 0 fields | Clone editor density | HIGH |
| Tasks | 10 badges, 7 buttons, 7 skeletons, 1 alert, 1 checkbox | 28 controls, 4 fields | Filter/board density | HIGH |
| Thoth shell | 0 counted | Child tabs carry forms | Tab hierarchy | LOW |
| Workspace indexing | 7 alerts | 2 inputs | Status panel density | MEDIUM |
| Settings and chat (`chat`) | 56 buttons, 19 badges, 19 skeletons, 5 alerts, 3 toggles | 122 controls, 25 fields | Large settings surface | HIGH |
| Chat UI | 34 buttons, 6 skeletons, 5 alerts, 3 badges, 1 checkbox, 1 input | 22 controls, 1 field | Composer/card density | HIGH |

## Screen findings

### App shell and UI gallery

`apps/ptah-extension-webview/src/app/app.html` has the shell's raw alert (ratchet: 1); route evidence is `app.routes.ts:205`. Use `ptah-state-panel` for a persistent app error, reserving a compact toast for transient messages. The gallery already demonstrates `ptah-page-header` and `ptah-field` (`ui-gallery.component.ts:62`, `ui-gallery/gallery-provider-form.component.ts:34`) and is the reference for owner adoption, not an end-user page. Keep the gallery out of page defect totals.

### Canvas (`canvas`)

The rail card has six raw buttons, including `canvas-rail-card.component.ts:206`; the inspector has six raw skeleton elements at `canvas-inspector-dock.component.ts:217`. Use `ptahButton`, and a shared `ptah-state-panel` loading composition for the inspector. The canvas search is wrapped by `ptah-field` at `orchestra-canvas.component.ts:143-144`; the rail card input at `canvas-rail-card.component.ts:426` needs an accessible name and field treatment if it is a persistent form. Keep rail controls at the shared small height token and align the card, rail and inspector padding to `--ptah-surface-pad`; review the cramped attention action at line 206 at narrow Electron widths. The empty board already uses `ptah-stat` (`canvas-empty-board.component.ts:188`), so preserve that KPI owner.

### Command Center (`command-center`)

Two pending-input raw buttons are at `command-pending-input.component.ts:99,131`; apply `ptahButton` with one primary action per pending prompt. The page toast at `command-center-page.component.html:18` hand-builds an alert with `right-4 top-16 gap-2`; use the app's state/notification treatment and token-based inset. Inputs at `command-session-controls.component.ts:23` and `command-pending-input.component.ts:80` have labels on nearby lines 22 and 77; keep association explicit and use `ptah-field` when help/error text is required. The command rail tab at `command-rail-tabs.component.ts:84` needs a single tab hierarchy and consistent hit area.

### Cron scheduler (`cron-scheduler-ui`, Thoth tab)

The error at `cron-scheduler-tab.component.ts:275` is a raw alert; use `ptah-state-panel`. The five `ptah-field` wrappers at lines 337-398 are a good base for the four inputs, textarea and select; keep help and validation messages inside those fields. The inline label/group at line 415 uses a raw gap; align it to `--ptah-gap-controls`. Three `ptah-stat` uses at lines 233-237 establish the KPI row; align the scheduler list beneath it with `ptah-section-header`.

### Analytics dashboard (`dashboard`)

`usage-dashboard.component.html:13-14` uses raw button range tabs; `usage-cost-donut.component.ts:17-18` repeats that recipe. Use `ptahButton` or `ptah-native-tab-group` for mutually exclusive ranges, with one emphasized action. The dashboard also retains two alerts and a badge (`usage-dashboard.component.html:44,68-72`); use `ptah-ui-status-badge` and `ptah-state-panel`. The top sessions table starts at `usage-top-sessions.component.ts:19`; align headers, numeric columns and row padding through a future table owner. The KPI strip (`usage-kpi-strip.component.ts:18,33`) should use `ptah-stat` so title/value/secondary text match other dashboards; group charts under `ptah-section-header` and preserve the current page title/action hierarchy.

### Declarative dashboard (`declarative-dashboard`, Thoth dashboard)

No counted raw owner recipe remains, but the data-driven form components at `surface-text-input.component.ts:70-80` and `surface-choice-input.component.ts:55-79` render seven native controls with no `ptah-field` use. Wrap each generated field, carry label/help/error metadata through the schema, and use the shared control heights. The table at `dashboard-table.component.ts:58` and chart table at `dashboard-chart.component.ts:43` need a table owner for row density and alignment. Replace local `gap-*` in these field components with `--ptah-gap-field` where sibling spacing differs; constrain wide dashboard content to the page gutter and a deliberate content width.

### Git UI (`git-ui`)

The spot editor uses raw buttons and alerts at `spot-editor.component.ts:177-188`; comparison choices use raw buttons at `review-canvas/comparison-bar.component.ts:136-137`. Use `ptahButton`, `ptah-state-panel`, and `ptah-native-tab-group` for the comparison scope. Nine inputs, three selects and two textareas span this library, yet only one `ptah-field` was found; apply field wrappers in editor/filter forms, with helper/error text next to each control. Keep the comparison toolbar at `--ptah-gap-controls`, detail groups at `--ptah-gap-group`, and align list rows to `div[ptahListRow]`. The four skeletons should share the corresponding list/card geometry.

### Machines (`machines-ui`)

The machine list and overview use six raw skeletons (`machine-list.component.ts:81-82`, `machines-view.component.ts:202-206`); give loading, empty and error states matching `ptah-state-panel`. The overview button at `machine-overview.component.ts` is the only counted raw button; convert to `ptahButton`. Three inputs, one select and two textareas have no field owner; group connection settings in sections, include help/error text, and use shared control heights. Match list/overview padding to `--ptah-surface-pad` so the loading state does not jump.

### Marketplace (`marketplace`)

The largest state inconsistency is 16 alerts and 28 skeletons. Examples: `smithery-surface.component.ts:190,312`, `pages/skills/installed-skills-page.component.ts:272-274`. Convert actions to `ptahButton`, statuses to `ptah-ui-status-badge`, and each catalog loading/error/empty area to `ptah-state-panel` or the UI catalog-card skeleton. Eighteen native inputs but four `ptah-field` wrappers indicate search and install forms need labels/help/error review. `ui/provider-table.component.ts:299` and `ui/coverage-matrix.component.ts:92` require a shared table density pattern. Use `--ptah-page-gutter` for page edges and `--ptah-gap-section` between catalog sections; keep only the install action primary in a card.

### MCP Apps (`mcp-apps-page`)

The Electron-only route is `app.routes.ts:156-162`. No counted Daisy owner gap was found. The single native textarea should be reviewed for `ptah-field`, a persistent label, help and validation. Keep the app list/detail split under `ptah-page-header` and `ptah-section-header`; verify wide detail text wraps inside the available desktop pane. No source evidence justified a broader restyle.

### Memory curator (`memory-curator-ui`, Thoth tab)

`memory-entry-list.component.ts:34-36` and `memory-indexed-code.component.ts:64-65` hand-build loading rows (12 skeletons total). Use matching `ptah-state-panel`/list-row skeletons and `div[ptahListRow]` for entries. The eight `ptah-field` uses in `memory-danger-zone.component.ts:47-62` show the form owner is partially adopted; audit the remaining 17 inputs, one select and one textarea for names/help/errors, especially destructive actions. `memory-stats-strip.component.ts:31,55` already uses `ptah-stat`; retain this KPI geometry. Diagnostics key/value rows at `diagnostics/storage-health-panel.component.ts:152` need the missing description-list owner. Separate stats, timeline and diagnostics with `--ptah-gap-section`.

### Messaging gateway (`messaging-gateway-ui`, Thoth tab)

The token form uses inline labels and inputs at `platform-token-form.component.ts:20-22,40-44`; use `ptah-field` so secret-help and validation live with the input. The allow-list textarea at `allow-list-editor.component.ts:26` needs its own label/help. Raw alert/action pair at `platform-bindings-panel.component.ts:24,28` should become `ptah-state-panel` and `ptahButton`. The tab has `ptah-stat` at `messaging-gateway-tab.component.ts:214-218`; align platform status, binding list and token form below it with section headers and `--ptah-gap-group`.

### Notifications (`notification-center`)

Actions remain raw at `notification-center.component.ts:60,82` and `notification-snackbar.component.ts:59-60`; use `ptahButton` and maintain a single primary notification action. The count bubble at `notification-center.component.ts:30` is hand-built; use `ptah-ui-status-badge` if its compact geometry fits. There is no form surface. Keep the bell target and action rows at the shared control height; snackbar width/stacking needs visual confirmation in Electron.

### Onboarding (`onboarding`)

`proposal/new-project-intake.page.ts:108-115` pairs a custom warning block with a raw button; use `ptah-state-panel` and `ptahButton`. The ready step has raw choice buttons at `ready/ready-connection-step.page.ts:104-105`. Thirteen native controls and five fields indicate mixed form ownership: `proposal/team-builder-start.page.html:39-40` has a wrapped textarea, while `ready/connection-choice.component.ts:62-68` needs field/help/error review. Step content uses local `p-*` and `gap-*` in `proposal/team-builder-skill-review.component.html:31,94`; normalize to the page gutter/group tokens. Keep a single primary “continue” action per step and a clear step title/section order.

### Review Runs (`review-runs-ui`)

Five raw alerts and three skeletons occur in `review-runs-page.component.ts:63-68`; use `ptah-state-panel` for the page’s loading/error/empty states. The settings drawer still has a raw toggle and alert at `review-settings-drawer.component.html:25,35`; use the form-control owner and field help/error. Ten fields coexist with 14 inputs, seven selects and two textareas; `findings/review-findings-panel.component.ts:22-25` compresses select labels and filters, so group filters in a toolbar with consistent control height and `--ptah-gap-controls`. `review-findings-table.component.ts:62` needs aligned rows and numeric/status columns under a table owner. Keep findings count and one primary review action visible in the page header.

### Setup wizard (`setup-wizard`)

The transcript skeleton at `analysis-transcript.component.ts:106` and alerts at `agent-preview-dialog.component.ts:159,166` are representative of six skeletons and 13 alerts; use matching state panels. The confirmation modal has a raw button at `confirmation-modal.component.ts:106`; use `ptahButton` inside `ptah-native-modal`. The model picker select at `generation-model-picker.component.ts:19-22` and guidance input at `guidance-result-panel.component.ts:34-35` need `ptah-field`, help/error text, and common height. Align transcript, preview and confirmation padding to dialog/surface tokens.

### Skill synthesis (`skill-synthesis-ui`, Thoth tab)

Clone operations use raw alerts/buttons (`clones/skill-clones-view.component.ts:257,277,512`) and raw status badge (`clones/agent-model-editor.component.ts:210`); use `ptah-state-panel`, `ptahButton`, and `ptah-ui-status-badge`. Seven controls have no `ptah-field`, including the pause switch at `skills-pause-switch.component.ts:94-99` and body editor at `clones/clone-body-editor.component.ts:8,81`. Group clone metadata and editing controls with section headers, field help/errors and common heights. Keep only the save/rebase action primary within each drawer; use `--ptah-gap-field` rather than local gap values in `agent-model-editor.component.ts:282,295`.

### Tasks (`tasks-ui`)

The board card mixes a raw checkbox, badge and buttons at `board/task-card.component.ts:184-186,373`; use the form-control owner, `ptah-ui-status-badge`, and `ptahButton`. `detail/task-document-reader.component.ts:136` shows one of seven raw skeletons. The create dialog starts with `ptah-field` at `task-create-dialog.component.ts:86-87,116-117`, but the filter bar has inline labels and controls at `filter/task-filter-bar.component.ts:155,370`, and only four fields cover 28 controls overall. Add field labels/help/errors to the dialog and filters, align filter spacing to `--ptah-gap-controls`, and use `ptah-toolbar` plus `div[ptahListRow]` for list mode. One primary create action belongs in the page header; board cards use secondary actions.

### Thoth shell (`thoth-shell`)

The route starts at `app.routes.ts:125-133`. The shell has no counted raw Daisy recipe; `thoth-shell.component.ts:209` has a badge-like status expression that should be checked against `ptah-ui-status-badge`. Keep the shell’s tab/navigation hierarchy consistent with `ptah-native-tab-group`; child tab findings are in Cron, Memory, Messaging and Skill Synthesis above. Avoid adding an extra competing page header inside each tab; use section headers for tab content.

### Workspace indexing (`workspace-indexing`, Settings feature)

Seven raw alerts are in `workspace-indexing.component.html:25,33` and later states. Use `ptah-state-panel` for persistent indexing status/error/empty states. Two inputs need labels and `ptah-field` with progress/help/error text. The disclosure at `workspace-indexing.component.html:413-414` should follow the future disclosure owner. Align status panel, progress and advanced details with `--ptah-gap-group`.

### Settings and chat (`chat`) — last implementation wave

Settings is routed at `app.routes.ts:111-118`; chat is the retained shell surface at `app.routes.ts:89-99`. The settings library still has 56 raw buttons, 19 badges, 19 skeletons, five alerts and three toggles. Examples: `settings/pro-features/claude-builtins-config.component.ts:161,171`, `settings/output-style/output-style-list.component.ts:192-200`, and shell actions in `components/templates/app-shell.component.html`. Convert these to the named owners in focused settings subareas. There are 95 inputs, 21 selects and six textareas versus 25 `ptah-field` occurrences; do a field-by-field pass for label association, help/error text, and common heights, starting with `settings/ptah-ai/web-search-config.component.ts:170,218-222`. The provider wizard already uses fields at `settings/providers/provider-setup-wizard.component.ts:436,516`; keep it as the form reference. The settings page tabs at `settings/settings.component.html:69,77` and wide detail tables at `settings/ptah-ai/capability-matrix-setting.component.ts:92` need common tab/table owners. The `gap-*`/`p-*` exceptions in provider wizard lines 557 and 1242 should be checked against tokens and adjacent groups. Preserve one primary save/connect action per settings pane.

### Chat UI (`chat-ui`) — last implementation wave

Raw actions remain in `molecules/lane-composer.component.ts:36` and `molecules/setup-plugins/mcp-directory-browser.component.ts:157,172`; use `ptahButton` and `ptah-state-panel`. The question card has a raw checkbox/input and buttons (`molecules/question-card.component.ts`, ratchet five combined occurrences); use the form-control owner and an explicit group label. Twenty inputs and two textareas but one `ptah-field` are mostly compact composer/search interactions; require accessible names and errors even where a full field wrapper would be too tall. Cards and tool execution rows should use `ptah-surface-card`/`div[ptahListRow]` where their semantics match. The composer and sidebar need a visual pass for clipping and action priority at desktop split-pane widths; source alone cannot establish that outcome.

## Missing shared owners

Counts are raw source tag occurrences across frontend production templates and app routes, excluding UI owner implementations, specs, and the e2e harness. They are upper bounds for screen instances because repeated templates and generated markup count separately.

| Pattern without a shared owner | Uses | Evidence and proposed owner |
| --- | ---: | --- |
| Data table | 24 | `dashboard/usage-top-sessions.component.ts:19`, `declarative-dashboard/dashboard-table.component.ts:58`; define `ptah-table` with header, numeric alignment, row density, empty/loading states. |
| Disclosure/details | up to 56 | `workspace-indexing.component.html:413`, `onboarding/shared/details-log.component.ts:99`; define a disclosure owner preserving native summary keyboard semantics. Count includes some strings in non-page source, so verify before migration. |
| Key/value description list | 34 `<dl>` | `memory-curator-ui/diagnostics/storage-health-panel.component.ts:152`, `chat/settings/ptah-ai/cli-capability-detail.component.ts:19`; define `ptah-description-list`/row with label and value columns. |

## Ordered fix batches

Each batch stays in one library and touches at most six files. The listed files are the first concrete edit set; repeat the pattern in subsequent same-library batches if the broader ratchet count remains. Do not convert a compact control to a full-height field where its interaction needs density; keep the owner and accessible naming.

1. **Marketplace state and catalog clarity** — `libs/frontend/marketplace`: `src/lib/smithery-surface.component.ts`, `src/lib/pages/skills/installed-skills-page.component.ts`, `src/lib/external-marketplaces.component.ts`, `src/lib/ui/provider-table.component.ts`, `src/lib/ui/coverage-matrix.component.ts`.
2. **Tasks board and filters** — `libs/frontend/tasks-ui`: `src/lib/components/board/task-card.component.ts`, `src/lib/components/filter/task-filter-bar.component.ts`, `src/lib/components/filter/task-view-menu.component.ts`, `src/lib/components/task-create-dialog.component.ts`, `src/lib/components/detail/task-document-reader.component.ts`.
3. **Review Runs page states and forms** — `libs/frontend/review-runs-ui`: `src/lib/components/review-runs-page.component.ts`, `src/lib/components/review-settings-drawer.component.html`, `src/lib/findings/review-findings-panel.component.ts`, `src/lib/components/review-findings-table.component.ts`.
4. **Analytics KPI and table density** — `libs/frontend/dashboard`: `src/lib/components/usage-dashboard/usage-dashboard.component.html`, `src/lib/components/usage-dashboard/usage-kpi-strip.component.ts`, `src/lib/components/usage-dashboard/usage-cost-donut.component.ts`, `src/lib/components/usage-dashboard/usage-top-sessions.component.ts`.
5. **Git comparison and editor controls** — `libs/frontend/git-ui`: `src/lib/spot-editor/spot-editor.component.ts`, `src/lib/review-canvas/comparison-bar.component.ts`, `src/lib/stash/stash-popover.component.ts`.
6. **Onboarding form and step rhythm** — `libs/frontend/onboarding`: `src/lib/proposal/new-project-intake.page.ts`, `src/lib/ready/ready-connection-step.page.ts`, `src/lib/ready/connection-choice.component.ts`, `src/lib/proposal/team-builder-skill-review.component.html`.
7. **Memory lists and diagnostics** — `libs/frontend/memory-curator-ui`: `src/lib/components/memory-entry-list.component.ts`, `src/lib/components/memory-indexed-code.component.ts`, `src/lib/components/memory-danger-zone.component.ts`, `src/lib/components/diagnostics/storage-health-panel.component.ts`.
8. **Skill clone editing** — `libs/frontend/skill-synthesis-ui`: `src/lib/components/clones/skill-clones-view.component.ts`, `src/lib/components/clones/agent-model-editor.component.ts`, `src/lib/components/clones/clone-body-editor.component.ts`, `src/lib/components/skills-pause-switch.component.ts`.
9. **Machines loading geometry** — `libs/frontend/machines-ui`: `src/lib/components/machines-view/machines-view.component.ts`, `src/lib/components/machine-list/machine-list.component.ts`.
10. **Command Center action and state** — `libs/frontend/command-center`: `src/lib/components/command-pending-input.component.ts`, `src/lib/components/command-center-page.component.html`.
11. **Canvas rail and inspector** — `libs/frontend/canvas`: `src/lib/canvas-rail/canvas-rail-card.component.ts`, `src/lib/canvas-rail/canvas-inspector-dock.component.ts`.
12. **Messaging token form** — `libs/frontend/messaging-gateway-ui`: `src/lib/components/platform-token-form.component.ts`, `src/lib/components/platform-bindings-panel.component.ts`.
13. **Cron field and state consistency** — `libs/frontend/cron-scheduler-ui`: `src/lib/components/cron-scheduler-tab.component.ts`.
14. **Setup preview and transcript** — `libs/frontend/setup-wizard`: `src/lib/components/agent-preview-dialog.component.ts`, `src/lib/components/analysis-transcript.component.ts`.
15. **Declarative dashboard forms** — `libs/frontend/declarative-dashboard`: `src/lib/components/surface-text-input.component.ts`, `src/lib/components/surface-choice-input.component.ts`.
16. **Indexing status** — `libs/frontend/workspace-indexing`: `src/lib/workspace-indexing.component.html`.
17. **Notification action ownership** — `libs/frontend/notification-center`: `src/lib/notification-center.component.ts`, `src/lib/notification-snackbar.component.ts`.
18. **Apps detail form** — `libs/frontend/mcp-apps-page`: `src/lib/components/apps-page.component.ts`.
19. **Thoth tab status** — `libs/frontend/thoth-shell`: `src/lib/components/thoth-shell.component.ts`.
20. **Settings owner adoption** — `libs/frontend/chat`: `src/lib/settings/ptah-ai/web-search-config.component.ts`, `src/lib/settings/pro-features/claude-builtins-config.component.ts`, `src/lib/settings/output-style/output-style-list.component.ts`, `src/lib/settings/settings.component.html`, `src/lib/settings/ptah-ai/capability-matrix-setting.component.ts`.
21. **Chat UI actions and question forms** — `libs/frontend/chat-ui`: `src/lib/molecules/lane-composer.component.ts`, `src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts`, `src/lib/molecules/question-card.component.ts`.

## Decisions

- **Electron scope:** audited the Electron route set and its mounted feature tabs; the route guard and task context establish Electron as the product view. Reversible: yes.
- **Counts:** used the checked-in class ratchet for owner gaps and current source tags for form/table counts, because the ratchet is the explicit adoption baseline and class-name text search would overcount semantic strings. Reversible: yes.
- **Unrendered risks:** recorded clipping and viewport fit as verification items, not observed failures. Static read-only scope prevents a reliable screenshot claim. Reversible: yes.
