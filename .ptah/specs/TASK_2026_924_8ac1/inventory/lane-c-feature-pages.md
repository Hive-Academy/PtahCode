# Lane C feature-page control inventory

## Summary

| Family | Classified elements | Looks | Top libs | Approximate? |
|---|---:|---:|---|---|
| F1 | 68 | 34 | memory-curator-ui 14, marketplace 11, review-runs-ui 9 | Yes |
| F2 | 20 | 14 | onboarding 5, review-runs-ui 2, git-ui 2 | Yes |
| F3 | 75 | 42 | tasks-ui 41, git-ui 10, review-runs-ui 9 | Yes |
| F4 | 41 | 15 | harness-builder 6, marketplace 6, review-runs-ui 5 | Yes |
| F5 | 776 | 219 | marketplace 125, onboarding 111, tasks-ui 95 | Yes |
| F6 | 78 | 40 | onboarding 15, dashboard 12, memory-curator-ui 10 | Yes |
| F7 | 190 | 105 | skill-synthesis-ui 52, git-ui 28, tasks-ui 27 | Yes |
| F8 | 221 | 92 | marketplace 63, tasks-ui 36, onboarding 29 | Yes |
| F9 | 361 | 205 | onboarding 102, marketplace 87, tasks-ui 29 | Yes |
| F10 | 192 | 111 | marketplace 38, tasks-ui 33, onboarding 21 | Yes |
| F11 | 266 | 119 | marketplace 86, memory-curator-ui 35, tasks-ui 26 | Yes |
| F12 | 430 | 196 | git-ui 75, marketplace 63, onboarding 62 | Yes |
| F13 | 35 | 9 | marketplace 18, command-center 8, declarative-dashboard 5 | Yes |
| F14 | 153 | 89 | onboarding 37, memory-curator-ui 24, marketplace 20 | Yes |

## Count method

Scope: eligible `*.ts` inline templates and `*.html` in the 17 named feature libraries; specs, stories, and fixture paths excluded. Raw counts are `rg -o -N -P` match lines across source; classified counts are one per matching template opening element. An element may belong to multiple families. Inline template extraction and markup heuristics make all classified counts approximate. Elements in `@for` count once. Raw counts include TS strings/comments and are therefore deliberately unclassified.

## Library matrix

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

## Families

### F1 ? 68 classified elements

Raw ripgrep matches: `<input\b` 110.
Per lib: review-runs-ui 9, tasks-ui 9, memory-curator-ui 14, skill-synthesis-ui 1, declarative-dashboard 3, command-center 2, machines-ui 3, git-ui 7, onboarding 1, cron-scheduler-ui 3, messaging-gateway-ui 4, harness-builder 1, marketplace 11.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 9 | `input input input-bordered` | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:67` |
| 6 | `input input input-bordered input-sm` | `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:157` |
| 6 | `input input input-sm input-bordered` | `libs/frontend/memory-curator-ui/src/lib/components/memory-danger-zone.component.ts:42` |
| 4 | `input input input-bordered input-sm text-xs font-mono` | `libs/frontend/marketplace/src/lib/external-marketplaces.component.ts:156` |
| 3 | `input input input-xs input-bordered min-w-0 font-mono` | `libs/frontend/tasks-ui/src/lib/components/detail/task-relations.component.ts:285` |
| 3 | `input input input-bordered input-xs w-20` | `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/memory-trigger-toggle.component.ts:34` |
| 3 | `input input input-sm input-bordered font-mono` | `libs/frontend/messaging-gateway-ui/src/lib/components/platform-token-form.component.ts:20` |
| 3 | `input input input-bordered input-sm text-xs` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:189` |
| 2 | `input input input-bordered input-sm h-8 min-w-0 bg-surface-0 text-sm` | `libs/frontend/tasks-ui/src/lib/components/filter/task-view-menu.component.ts:369` |
| 2 | `input input input-xs input-bordered md:max-w-xs` | `libs/frontend/memory-curator-ui/src/lib/components/timeline-filters.component.ts:93` |
| 2 | `input input input-xs input-bordered` | `libs/frontend/memory-curator-ui/src/lib/components/timeline-filters.component.ts:114` |
| 2 | `input input input-sm input-bordered max-w-sm` | `libs/frontend/memory-curator-ui/src/lib/components/memory-search-bar.component.ts:26` |
| ? | 22 other looks | ? |

Where used: review-runs-ui (9 elements), tasks-ui (9 elements), memory-curator-ui (14 elements), skill-synthesis-ui (1 elements), declarative-dashboard (3 elements), command-center (2 elements), machines-ui (3 elements), git-ui (7 elements), onboarding (1 elements), cron-scheduler-ui (3 elements), messaging-gateway-ui (4 elements), harness-builder (1 elements), marketplace (11 elements).
Component examples: `review-settings-drawer.component.html`, `review-runs-page.component.ts`, `memory-danger-zone.component.ts`, `external-marketplaces.component.ts`, `task-relations.component.ts`.
Binding: signal/property + event candidate 60.

Subtypes: text 42, number 8, password 5, search 10, date 2, url 1.

### F2 ? 20 classified elements

Raw ripgrep matches: `<textarea\b` 22.
Per lib: review-runs-ui 2, tasks-ui 1, skill-synthesis-ui 1, declarative-dashboard 1, memory-curator-ui 1, git-ui 2, onboarding 5, cron-scheduler-ui 1, machines-ui 2, messaging-gateway-ui 1, harness-builder 2, mcp-apps-page 1.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 4 | `textarea textarea textarea-bordered` | `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:48` |
| 2 | `textarea textarea textarea-bordered min-h-[140px]` | `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts:118` |
| 2 | `textarea textarea textarea-bordered textarea-sm font-mono` | `libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts:379` |
| 2 | `textarea textarea textarea-bordered border-base-content/50` | `libs/frontend/harness-builder/src/lib/components/sidebar/builder-presets-section.component.ts:120` |
| 1 | `textarea textarea textarea-bordered textarea-sm bg-surface-0 text-sm` | `libs/frontend/tasks-ui/src/lib/components/task-create-dialog.component.ts:138` |
| 1 | `textarea textarea textarea-bordered h-72 font-mono text-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-body-editor.component.ts:80` |
| 1 | `textarea textarea textarea-bordered text-sm` | `libs/frontend/declarative-dashboard/src/lib/components/surface-text-input.component.ts:72` |
| 1 | `textarea textarea textarea-bordered textarea-xs font-mono text-xs` | `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/memory-diagnostics-accordion.component.ts:135` |
| 1 | `textarea textarea textarea-bordered textarea-xs` | `libs/frontend/git-ui/src/lib/review-canvas/file-diff-section.component.ts:320` |
| 1 | `textarea textarea textarea-bordered font-mono text-sm` | `libs/frontend/git-ui/src/lib/commit/commit-composer.component.ts:273` |
| 1 | `textarea textareaClass` | `libs/frontend/onboarding/src/lib/proposal/reply-composer.component.ts:40` |
| 1 | `textarea textarea textarea-bordered textarea-sm min-h-[2.5rem] rounded-md text-sm text-base-content placeholder:text-base-content-muted disabled:cursor-not-allowed` | `libs/frontend/machines-ui/src/lib/components/remote-composer/remote-composer.component.ts:43` |
| ? | 2 other looks | ? |

Where used: review-runs-ui (2 elements), tasks-ui (1 elements), skill-synthesis-ui (1 elements), declarative-dashboard (1 elements), memory-curator-ui (1 elements), git-ui (2 elements), onboarding (5 elements), cron-scheduler-ui (1 elements), machines-ui (2 elements), messaging-gateway-ui (1 elements), harness-builder (2 elements), mcp-apps-page (1 elements).
Component examples: `review-finding-card.component.ts`, `new-project-intake.page.ts`, `cron-scheduler-tab.component.ts`, `builder-presets-section.component.ts`, `task-create-dialog.component.ts`.
Binding: signal/property + event candidate 14.

### F3 ? 75 classified elements

Raw ripgrep matches: `<select\b` 28; `ptah-native-dropdown|ptah-native-autocomplete|ptah-native-popover|ptah-native-option|ptah-provider-model-picker|ptah-peer-session-picker` 14; `\bdropdown(-content)?\b` 37; `\bmenu\b` 108; `role="(menu|menuitem|listbox|combobox|option)"` 21; `cdkMenu|ngListbox|ngCombobox|ngOption` 0.
Per lib: review-runs-ui 9, tasks-ui 41, memory-curator-ui 1, declarative-dashboard 1, onboarding 1, setup-wizard 1, machines-ui 4, git-ui 10, cron-scheduler-ui 1, harness-builder 1, marketplace 5.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 7 | `ptah-task-facet-menu (unstyled)` | `libs/frontend/tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:273` |
| 7 | `li menu-title text-[10px]` | `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:575` |
| 6 | `select (unstyled)` | `libs/frontend/review-runs-ui/src/lib/findings/review-findings-panel.component.ts:22` |
| 4 | `select select select-bordered select-sm` | `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:126` |
| 4 | `div dropdown dropdown-end` | `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:532` |
| 4 | `ptah-native-popover (unstyled)` | `libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.ts:46` |
| 2 | `div (unstyled)` | `libs/frontend/review-runs-ui/src/lib/components/review-runs-list.component.ts:41` |
| 2 | `select select select-bordered select-sm h-9 bg-surface-0 text-sm` | `libs/frontend/tasks-ui/src/lib/components/task-create-dialog.component.ts:103` |
| 2 | `details dropdown` | `libs/frontend/tasks-ui/src/lib/components/filter/task-view-menu.component.ts:146` |
| 2 | `select select select-bordered select-sm h-8 min-h-8 bg-surface-0 text-sm` | `libs/frontend/tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:365` |
| 2 | `select select select-xs select-bordered` | `libs/frontend/tasks-ui/src/lib/components/detail/task-relations.component.ts:272` |
| 2 | `button (unstyled)` | `libs/frontend/tasks-ui/src/lib/components/detail/task-detail-header.component.ts:150` |
| ? | 30 other looks | ? |

Where used: review-runs-ui (9 elements), tasks-ui (41 elements), memory-curator-ui (1 elements), declarative-dashboard (1 elements), onboarding (1 elements), setup-wizard (1 elements), machines-ui (4 elements), git-ui (10 elements), cron-scheduler-ui (1 elements), harness-builder (1 elements), marketplace (5 elements).
Component examples: `task-filter-bar.component.ts`, `task-list.component.ts`, `review-findings-panel.component.ts`, `review-runs-page.component.ts`, `draft-comments-bar.component.ts`.
Binding: signal/property + event candidate 27.

### F4 ? 41 classified elements

Raw ripgrep matches: `type="checkbox"` 37; `type="radio"` 6; `\btoggle\b|\bcheckbox\b|\bradio\b` 377; `role="switch"` 3.
Per lib: skill-synthesis-ui 4, review-runs-ui 5, memory-curator-ui 3, declarative-dashboard 3, tasks-ui 5, setup-wizard 1, workspace-indexing 2, git-ui 2, onboarding 2, cron-scheduler-ui 1, messaging-gateway-ui 1, harness-builder 6, marketplace 6.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 9 | `input checkbox checkbox-sm` | `libs/frontend/review-runs-ui/src/lib/components/review-repositories-editor.component.ts:32` |
| 8 | `input checkbox checkbox-xs` | `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:271` |
| 6 | `input (unstyled)` | `libs/frontend/harness-builder/src/lib/components/harness-config-preview.component.ts:90` |
| 5 | `input toggle toggle-sm toggle-primary` | `libs/frontend/skill-synthesis-ui/src/lib/components/skills-pause-switch.component.ts:93` |
| 2 | `input radio radio-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:270` |
| 2 | `input toggle toggle-xs toggle-primary` | `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html:439` |
| 1 | `input toggle toggle-warning` | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:134` |
| 1 | `input checkbox` | `libs/frontend/review-runs-ui/src/lib/components/review-confirm-dialog.component.ts:12` |
| 1 | `button dp-toggle gap-2 rounded-[inherit]` | `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:169` |
| 1 | `input radio radio-sm` | `libs/frontend/declarative-dashboard/src/lib/components/surface-choice-input.component.ts:78` |
| 1 | `input checkbox h-6 w-6` | `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:197` |
| 1 | `input toggle toggle-xs` | `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:612` |
| ? | 3 other looks | ? |

Where used: skill-synthesis-ui (4 elements), review-runs-ui (5 elements), memory-curator-ui (3 elements), declarative-dashboard (3 elements), tasks-ui (5 elements), setup-wizard (1 elements), workspace-indexing (2 elements), git-ui (2 elements), onboarding (2 elements), cron-scheduler-ui (1 elements), messaging-gateway-ui (1 elements), harness-builder (6 elements), marketplace (6 elements).
Component examples: `review-repositories-editor.component.ts`, `task-list.component.ts`, `harness-config-preview.component.ts`, `skills-pause-switch.component.ts`, `agent-model-editor.component.ts`.
Binding: signal/property + event candidate 35.

Subtypes: checkbox 36, radio 4.

### F5 ? 776 classified elements

Raw ripgrep matches: `<button\b` 750; `\bbtn\b` 2010; `ptahButton|ptahSetupAction|ptahRailIconAction` 22; `role="button"` 3; `<a\b` 47.
Per lib: review-runs-ui 41, skill-synthesis-ui 44, tasks-ui 95, memory-curator-ui 47, declarative-dashboard 17, onboarding 111, setup-wizard 35, command-center 32, dashboard 19, machines-ui 34, git-ui 94, workspace-indexing 12, cron-scheduler-ui 16, messaging-gateway-ui 18, harness-builder 30, marketplace 125, mcp-apps-page 6.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 111 | `button btn btn-ghost btn-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:206` |
| 58 | `button (unstyled)` | `libs/frontend/review-runs-ui/src/lib/findings/review-findings-panel.component.ts:26` |
| 52 | `button btn btn-ghost btn-sm` | `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:63` |
| 40 | `button btn btn-primary btn-sm` | `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:25` |
| 22 | `button btn btn-sm` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/bulk-rebase-confirm.component.ts:64` |
| 22 | `button btn btn-ghost btn-xs gap-1` | `libs/frontend/machines-ui/src/lib/components/copy-command/copy-command.component.ts:32` |
| 17 | `button btn btn-outline btn-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/skill-specs-control.component.ts:38` |
| 17 | `button btn btn-outline btn-sm` | `libs/frontend/onboarding/src/lib/shell/workspace-header.component.ts:22` |
| 13 | `button btn btn-ghost btn-sm border border-surface-border` | `libs/frontend/tasks-ui/src/lib/components/task-board-states.component.ts:80` |
| 12 | `button btn btn-sm btn-primary` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts:283` |
| 11 | `button btn btn-primary btn-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:328` |
| 11 | `button btn btn-xs btn-ghost` | `libs/frontend/tasks-ui/src/lib/components/detail/task-metadata-editor.component.ts:212` |
| ? | 207 other looks | ? |

Where used: review-runs-ui (41 elements), skill-synthesis-ui (44 elements), tasks-ui (95 elements), memory-curator-ui (47 elements), declarative-dashboard (17 elements), onboarding (111 elements), setup-wizard (35 elements), command-center (32 elements), dashboard (19 elements), machines-ui (34 elements), git-ui (94 elements), workspace-indexing (12 elements), cron-scheduler-ui (16 elements), messaging-gateway-ui (18 elements), harness-builder (30 elements), marketplace (125 elements), mcp-apps-page (6 elements).
Component examples: `agent-model-editor.component.ts`, `review-findings-panel.component.ts`, `review-runs-page.component.ts`, `review-run-detail.component.ts`, `bulk-rebase-confirm.component.ts`.
Binding: signal/property + event candidate 725.

Subtypes: text 665, icon-only 89, link 22.

### F6 ? 78 classified elements

Raw ripgrep matches: `role="(tab|tablist|tabpanel)"` 35; `\btabs?\b` 1069; `\bjoin\b` 176; `ptah-native-tab-group` 6.
Per lib: review-runs-ui 1, memory-curator-ui 10, skill-synthesis-ui 1, tasks-ui 8, command-center 8, dashboard 12, onboarding 15, workspace-indexing 1, git-ui 8, cron-scheduler-ui 3, messaging-gateway-ui 4, marketplace 4, mcp-apps-page 3.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 11 | `div join` | `libs/frontend/memory-curator-ui/src/lib/components/memory-search-bar.component.ts:53` |
| 8 | `div (unstyled)` | `libs/frontend/command-center/src/lib/components/command-center-page.component.html:236` |
| 7 | `button join-item btn btn-xs` | `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html:11` |
| 4 | `button join-item btn btn-sm` | `libs/frontend/memory-curator-ui/src/lib/components/memory-search-bar.component.ts:58` |
| 3 | `ptah-native-tab-group (unstyled)` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts:299` |
| 3 | `div gap-1 rounded-full border border-base-300` | `libs/frontend/onboarding/src/lib/ready/ready-settings-step.page.ts:125` |
| 3 | `button min-h-8 rounded-full text-sm` | `libs/frontend/onboarding/src/lib/ready/ready-settings-step.page.ts:132` |
| 3 | `ptah-details-log (unstyled)` | `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:140` |
| 3 | `button btn btn-ghost btn-xs join-item` | `libs/frontend/git-ui/src/lib/open-in/open-in-button.component.ts:89` |
| 2 | `button tab` | `libs/frontend/memory-curator-ui/src/lib/components/memory-search-bar.component.ts:41` |
| 2 | `button btn join-item btn-xs` | `libs/frontend/memory-curator-ui/src/lib/components/memory-indexed-code.component.ts:108` |
| 1 | `input input input-bordered` | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:78` |
| ? | 28 other looks | ? |

Where used: review-runs-ui (1 elements), memory-curator-ui (10 elements), skill-synthesis-ui (1 elements), tasks-ui (8 elements), command-center (8 elements), dashboard (12 elements), onboarding (15 elements), workspace-indexing (1 elements), git-ui (8 elements), cron-scheduler-ui (3 elements), messaging-gateway-ui (4 elements), marketplace (4 elements), mcp-apps-page (3 elements).
Component examples: `memory-search-bar.component.ts`, `command-center-page.component.html`, `usage-dashboard.component.html`, `skill-clones-view.component.ts`, `ready-settings-step.page.ts`.
Binding: signal/property + event candidate 32.

### F7 ? 190 classified elements

Raw ripgrep matches: `<dialog\b` 21; `\bmodal\b` 125; `ptah-native-modal|ptah-native-drawer` 21; `\bdrawer\b` 143; `popover` 37; `\btooltip\b` 29; `data-tip` 2; `title="|\[title\]|\[attr\.title\]` 266; `role="dialog"` 20; `Overlay\b|cdkConnectedOverlay` 13.
Per lib: review-runs-ui 11, tasks-ui 27, memory-curator-ui 5, skill-synthesis-ui 52, onboarding 13, setup-wizard 8, command-center 2, dashboard 8, git-ui 28, cron-scheduler-ui 12, messaging-gateway-ui 1, marketplace 22, harness-builder 1.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 9 | `button (unstyled)` | `libs/frontend/tasks-ui/src/lib/components/task-board-header.component.ts:136` |
| 9 | `div modal-action` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/bulk-rebase-confirm.component.ts:63` |
| 8 | `dialog modal modal-open` | `libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:45` |
| 8 | `button btn btn-ghost btn-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:355` |
| 6 | `ptah-review-confirm-dialog (unstyled)` | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:163` |
| 5 | `p text-xs text-base-content-muted` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:195` |
| 4 | `button btn btn-ghost btn-sm` | `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:26` |
| 4 | `ptah-native-drawer (unstyled)` | `libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:245` |
| 4 | `div modal-box max-w-2xl` | `libs/frontend/dashboard/src/lib/components/skill-selection-card/skill-selection-card.component.ts:149` |
| 4 | `ptah-native-popover (unstyled)` | `libs/frontend/git-ui/src/lib/review-canvas/draft-comments-bar.component.ts:46` |
| 3 | `button modal-backdrop` | `libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:152` |
| 3 | `button btn btn-ghost btn-sm btn-square` | `libs/frontend/tasks-ui/src/lib/components/detail/task-document-reader.component.ts:107` |
| ? | 93 other looks | ? |

Where used: review-runs-ui (11 elements), tasks-ui (27 elements), memory-curator-ui (5 elements), skill-synthesis-ui (52 elements), onboarding (13 elements), setup-wizard (8 elements), command-center (2 elements), dashboard (8 elements), git-ui (28 elements), cron-scheduler-ui (12 elements), messaging-gateway-ui (1 elements), marketplace (22 elements), harness-builder (1 elements).
Component examples: `task-board-header.component.ts`, `bulk-rebase-confirm.component.ts`, `task-maintenance-dialog.component.ts`, `clone-detail-drawer.component.ts`, `review-settings-drawer.component.html`.
Binding: signal/property + event candidate 50, native dialog 11, CDK 2.

### F8 ? 221 classified elements

Raw ripgrep matches: `<table\b` 10; `\btable\b` 135; `ptah-list-row|ptahInboxRow|ptah-list-detail|ptah-inbox-layout` 14; `<li\b` 177; `role="(row|listitem)"` 20; `@for` 350.
Per lib: review-runs-ui 10, tasks-ui 36, memory-curator-ui 8, skill-synthesis-ui 9, declarative-dashboard 6, command-center 2, dashboard 11, setup-wizard 10, machines-ui 8, git-ui 12, onboarding 29, cron-scheduler-ui 1, messaging-gateway-ui 12, harness-builder 4, marketplace 63.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 72 | `li (unstyled)` | `libs/frontend/review-runs-ui/src/lib/components/review-findings-table.component.ts:82` |
| 7 | `li menu-title text-[10px]` | `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:575` |
| 6 | `li gap-2` | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:113` |
| 6 | `li rounded border border-base-300` | `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:338` |
| 6 | `ptah-catalog-card-skeleton (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:399` |
| 6 | `ptah-catalog-card (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:415` |
| 5 | `table table table-xs` | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-table.component.ts:57` |
| 4 | `button (unstyled)` | `libs/frontend/review-runs-ui/src/lib/components/review-runs-list.component.ts:43` |
| 4 | `li gap-1` | `libs/frontend/dashboard/src/lib/components/usage-dashboard/stacked-bar-chart.component.html:147` |
| 4 | `li min-w-0` | `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-cost-summary.component.ts:16` |
| 3 | `li rounded-lg border border-base-300 bg-base-200/40` | `libs/frontend/setup-wizard/src/lib/components/completion/outcome-summary.component.ts:70` |
| 3 | `div (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:493` |
| ? | 80 other looks | ? |

Where used: review-runs-ui (10 elements), tasks-ui (36 elements), memory-curator-ui (8 elements), skill-synthesis-ui (9 elements), declarative-dashboard (6 elements), command-center (2 elements), dashboard (11 elements), setup-wizard (10 elements), machines-ui (8 elements), git-ui (12 elements), onboarding (29 elements), cron-scheduler-ui (1 elements), messaging-gateway-ui (12 elements), harness-builder (4 elements), marketplace (63 elements).
Component examples: `review-findings-table.component.ts`, `task-list.component.ts`, `dashboard-chart.component.ts`, `analyze-done.page.ts`, `smithery-surface.component.ts`.
Binding: signal/property + event candidate 8.

### F9 ? 361 classified elements

Raw ripgrep matches: `\bcard\b` 867; `ptah-native-card|ptah-surface-card|ptah-surface-section|ptah-surface-tile|ptah-stat-card|ptah-page-header|ptah-toolbar|catalog-card` 63; `data-glass-surface` 98; `\bcollapse\b` 68; `<details\b` 31; `<h[23]\b` 210.
Per lib: review-runs-ui 6, skill-synthesis-ui 21, tasks-ui 29, declarative-dashboard 11, memory-curator-ui 27, onboarding 102, command-center 22, dashboard 11, setup-wizard 8, workspace-indexing 2, git-ui 5, machines-ui 4, cron-scheduler-ui 4, messaging-gateway-ui 2, harness-builder 18, marketplace 87, mcp-apps-page 2.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 13 | `section rounded-[22px] border border-base-300` | `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:311` |
| 11 | `ptah-native-card (unstyled)` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-card.component.ts:194` |
| 9 | `div gap-2` | `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/storage-health-panel.component.ts:227` |
| 8 | `ptah-catalog-card (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:415` |
| 7 | `h2 font-semibold` | `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:111` |
| 6 | `details text-sm` | `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:29` |
| 6 | `div collapse collapse-arrow rounded-lg` | `libs/frontend/harness-builder/src/lib/components/harness-config-preview.component.ts:89` |
| 6 | `div collapse-title gap-2 text-sm font-medium min-h-0` | `libs/frontend/harness-builder/src/lib/components/harness-config-preview.component.ts:91` |
| 6 | `div collapse-content` | `libs/frontend/harness-builder/src/lib/components/harness-config-preview.component.ts:101` |
| 6 | `ptah-catalog-card-skeleton (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:399` |
| 6 | `ptah-brand-mark (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:425` |
| 5 | `div text-xs font-medium` | `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/storage-health-panel.component.ts:150` |
| ? | 193 other looks | ? |

Where used: review-runs-ui (6 elements), skill-synthesis-ui (21 elements), tasks-ui (29 elements), declarative-dashboard (11 elements), memory-curator-ui (27 elements), onboarding (102 elements), command-center (22 elements), dashboard (11 elements), setup-wizard (8 elements), workspace-indexing (2 elements), git-ui (5 elements), machines-ui (4 elements), cron-scheduler-ui (4 elements), messaging-gateway-ui (2 elements), harness-builder (18 elements), marketplace (87 elements), mcp-apps-page (2 elements).
Component examples: `analyze-done.page.ts`, `clone-card.component.ts`, `storage-health-panel.component.ts`, `smithery-surface.component.ts`, `project-guidance.page.ts`.
Binding: signal/property + event candidate 23, CDK 1.

### F10 ? 192 classified elements

Raw ripgrep matches: `\bbadge\b` 685; `ptah-status-badge|ptah-file-status-badge` 2; `rounded-full` 96; `\bkbd\b` 4.
Per lib: review-runs-ui 13, skill-synthesis-ui 20, command-center 9, tasks-ui 33, memory-curator-ui 11, declarative-dashboard 2, onboarding 21, setup-wizard 8, dashboard 5, machines-ui 11, git-ui 13, harness-builder 8, marketplace 38.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 11 | `span badge badge-sm` | `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:12` |
| 11 | `span badge badge-ghost badge-sm` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts:80` |
| 9 | `span h-2 w-2 rounded-full bg-current` | `libs/frontend/review-runs-ui/src/lib/components/review-runs-list.component.ts:57` |
| 7 | `span badge badge-outline badge-sm` | `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:42` |
| 6 | `span badge badge-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:198` |
| 5 | `span badge badge-ghost badge-sm tabular-nums` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts:117` |
| 4 | `span badge badge-success badge-sm` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts:74` |
| 4 | `span badge badge-ghost badge-sm text-base-content` | `libs/frontend/tasks-ui/src/lib/components/detail/task-folder-overview.component.ts:43` |
| 4 | `span badge badge-sm badge-ghost` | `libs/frontend/setup-wizard/src/lib/components/analysis-transcript.component.ts:75` |
| 4 | `ptah-catalog-card (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:415` |
| 3 | `span badge badge-ghost badge-xs` | `libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts:13` |
| 3 | `span badge badge-outline` | `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:22` |
| ? | 99 other looks | ? |

Where used: review-runs-ui (13 elements), skill-synthesis-ui (20 elements), command-center (9 elements), tasks-ui (33 elements), memory-curator-ui (11 elements), declarative-dashboard (2 elements), onboarding (21 elements), setup-wizard (8 elements), dashboard (5 elements), machines-ui (11 elements), git-ui (13 elements), harness-builder (8 elements), marketplace (38 elements).
Component examples: `review-finding-card.component.ts`, `enhance-preview-drawer.component.ts`, `review-runs-list.component.ts`, `agent-model-editor.component.ts`, `quarantined-agents-panel.component.ts`.
Binding: signal/property + event candidate 7.

### F11 ? 266 classified elements

Raw ripgrep matches: `\bloading\b` 671; `skeleton` 113; `animate-spin` 16; `animate-pulse` 11; `ptah-state-panel` 0.
Per lib: skill-synthesis-ui 13, review-runs-ui 3, tasks-ui 26, memory-curator-ui 35, setup-wizard 16, command-center 4, dashboard 7, machines-ui 18, onboarding 20, workspace-indexing 5, git-ui 26, cron-scheduler-ui 3, harness-builder 3, marketplace 86, mcp-apps-page 1.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 63 | `span loading loading-spinner loading-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/skill-specs-control.component.ts:32` |
| 12 | `div (unstyled)` | `libs/frontend/git-ui/src/lib/history/history-timeline.component.ts:325` |
| 7 | `p text-xs text-base-content-muted` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:382` |
| 7 | `lucide-angular h-3 w-3` | `libs/frontend/command-center/src/lib/components/command-work-list.component.ts:90` |
| 6 | `div skeleton h-3` | `libs/frontend/memory-curator-ui/src/lib/components/timeline-view.component.ts:68` |
| 6 | `span skeleton h-10 rounded-xl` | `libs/frontend/machines-ui/src/lib/components/machine-list/machine-list.component.ts:75` |
| 6 | `ptah-catalog-card-skeleton (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:399` |
| 5 | `button btn btn-ghost btn-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:440` |
| 5 | `span loading loading-spinner loading-sm` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts:55` |
| 4 | `span loading loading-spinner loading-md` | `libs/frontend/tasks-ui/src/lib/components/task-board-states.component.ts:52` |
| 4 | `div skeleton h-3 w-40` | `libs/frontend/memory-curator-ui/src/lib/components/timeline-view.component.ts:67` |
| 4 | `button btn btn-primary btn-sm` | `libs/frontend/setup-wizard/src/lib/components/pack-install-prompt.component.ts:182` |
| ? | 107 other looks | ? |

Where used: skill-synthesis-ui (13 elements), review-runs-ui (3 elements), tasks-ui (26 elements), memory-curator-ui (35 elements), setup-wizard (16 elements), command-center (4 elements), dashboard (7 elements), machines-ui (18 elements), onboarding (20 elements), workspace-indexing (5 elements), git-ui (26 elements), cron-scheduler-ui (3 elements), harness-builder (3 elements), marketplace (86 elements), mcp-apps-page (1 elements).
Component examples: `skill-specs-control.component.ts`, `history-timeline.component.ts`, `clone-detail-drawer.component.ts`, `command-work-list.component.ts`, `timeline-view.component.ts`.
Binding: signal/property + event candidate 24.

### F12 ? 430 classified elements

Raw ripgrep matches: `\balert\b` 396; `toast` 62; `banner` 158; `role="(alert|status)"` 364; `aria-live` 30.
Per lib: review-runs-ui 29, skill-synthesis-ui 25, tasks-ui 19, memory-curator-ui 28, declarative-dashboard 11, onboarding 62, setup-wizard 25, command-center 21, dashboard 7, machines-ui 27, git-ui 75, workspace-indexing 7, cron-scheduler-ui 1, messaging-gateway-ui 6, harness-builder 20, marketplace 63, mcp-apps-page 4.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 28 | `div (unstyled)` | `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:166` |
| 25 | `p (unstyled)` | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:33` |
| 17 | `p text-xs text-base-content-muted` | `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:225` |
| 12 | `p text-sm text-error` | `libs/frontend/review-runs-ui/src/lib/findings/review-findings-panel.component.ts:30` |
| 12 | `p text-xs text-error` | `libs/frontend/skill-synthesis-ui/src/lib/components/skill-synthesis-tab.component.ts:104` |
| 11 | `div gap-2` | `libs/frontend/skill-synthesis-ui/src/lib/components/skill-synthesis-tab.component.ts:31` |
| 10 | `div alert alert-error alert-sm` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:184` |
| 9 | `div alert alert-error` | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:35` |
| 9 | `p text-xs` | `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:53` |
| 9 | `div alert alert-warning text-xs` | `libs/frontend/tasks-ui/src/lib/components/detail/task-folder-overview.component.ts:102` |
| 9 | `p text-xs text-base-content` | `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/memory-diagnostics-accordion.component.ts:273` |
| 9 | `p text-sm text-state-err` | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:213` |
| ? | 184 other looks | ? |

Where used: review-runs-ui (29 elements), skill-synthesis-ui (25 elements), tasks-ui (19 elements), memory-curator-ui (28 elements), declarative-dashboard (11 elements), onboarding (62 elements), setup-wizard (25 elements), command-center (21 elements), dashboard (7 elements), machines-ui (27 elements), git-ui (75 elements), workspace-indexing (7 elements), cron-scheduler-ui (1 elements), messaging-gateway-ui (6 elements), harness-builder (20 elements), marketplace (63 elements), mcp-apps-page (4 elements).
Component examples: `review-runs-page.component.ts`, `review-settings-drawer.component.html`, `review-findings-panel.component.ts`, `skill-synthesis-tab.component.ts`, `smithery-surface.component.ts`.
Binding: signal/property + event candidate 6, native dialog 1.

### F13 ? 35 classified elements

Raw ripgrep matches: `\bavatar\b` 48; `ptah-brand-mark|ptah-provider-mark|ptah-monogram-tile|ptah-mark-svg` 37; `<img\b` 0.
Per lib: declarative-dashboard 5, command-center 8, dashboard 4, marketplace 18.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 12 | `ptah-brand-mark (unstyled)` | `libs/frontend/marketplace/src/lib/smithery-surface.component.ts:425` |
| 9 | `ptah-monogram-tile (unstyled)` | `libs/frontend/command-center/src/lib/components/command-work-list.component.ts:70` |
| 6 | `ptah-provider-mark (unstyled)` | `libs/frontend/command-center/src/lib/components/command-work-list.component.ts:65` |
| 3 | `ptah-provider-mark h-4 w-4` | `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-top-sessions.component.ts:25` |
| 1 | `ptah-dashboard-avatar (unstyled)` | `libs/frontend/declarative-dashboard/src/lib/components/surface-node.component.ts:239` |
| 1 | `div dp-container-body-child` | `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:145` |
| 1 | `span (unstyled)` | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-avatar.component.ts:83` |
| 1 | `span text-sm font-semibold` | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-avatar.component.ts:90` |
| 1 | `span text-xs text-base-content-muted` | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-avatar.component.ts:96` |

Where used: declarative-dashboard (5 elements), command-center (8 elements), dashboard (4 elements), marketplace (18 elements).
Component examples: `smithery-surface.component.ts`, `command-work-list.component.ts`, `usage-top-sessions.component.ts`, `surface-node.component.ts`, `surface-layout.component.ts`.
Binding: static/native markup only.

### F14 ? 153 classified elements

Raw ripgrep matches: `<progress\b` 9; `\bprogress\b` 232; `ptah-meter` 0; `\bdivider\b` 21; `\bsteps?\b` 287; `\bbreadcrumbs\b` 8; `\bstat\b` 125; `\blink\b` 802.
Per lib: skill-synthesis-ui 3, review-runs-ui 2, tasks-ui 8, memory-curator-ui 24, declarative-dashboard 14, onboarding 37, machines-ui 1, git-ui 5, workspace-indexing 2, cron-scheduler-ui 19, messaging-gateway-ui 18, marketplace 20.
Looks (class recipe with layout spacing removed):
| Count | Look | Example |
|---:|---|---|
| 13 | `div stat min-w-0 overflow-hidden` | `libs/frontend/memory-curator-ui/src/lib/components/memory-stats-strip.component.ts:31` |
| 13 | `div stat-title min-w-0 text-base-content-muted` | `libs/frontend/memory-curator-ui/src/lib/components/memory-stats-strip.component.ts:39` |
| 9 | `ptah-onboarding-stepper (unstyled)` | `libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts:97` |
| 5 | `a link` | `libs/frontend/onboarding/src/lib/ready/provider-panel.component.ts:170` |
| 4 | `ptah-stat-card (unstyled)` | `libs/frontend/marketplace/src/lib/pages/overview/overview-page.component.html:48` |
| 3 | `a link link-primary text-xs` | `libs/frontend/skill-synthesis-ui/src/lib/components/skill-synthesis-tab.component.ts:46` |
| 3 | `div stat-figure text-primary` | `libs/frontend/memory-curator-ui/src/lib/components/memory-stats-strip.component.ts:32` |
| 3 | `div stat-figure text-info` | `libs/frontend/memory-curator-ui/src/lib/components/memory-stats-strip.component.ts:51` |
| 3 | `div stat-figure text-base-content-muted` | `libs/frontend/memory-curator-ui/src/lib/components/memory-stats-strip.component.ts:70` |
| 3 | `button btn btn-ghost btn-xs` | `libs/frontend/declarative-dashboard/src/lib/components/dashboard-stat.component.ts:70` |
| 3 | `a btn btn-ghost btn-sm` | `libs/frontend/onboarding/src/lib/ready/provider-panel.component.ts:135` |
| 3 | `a link link-hover` | `libs/frontend/onboarding/src/lib/home/onboarding-home.component.ts:253` |
| ? | 77 other looks | ? |

Where used: skill-synthesis-ui (3 elements), review-runs-ui (2 elements), tasks-ui (8 elements), memory-curator-ui (24 elements), declarative-dashboard (14 elements), onboarding (37 elements), machines-ui (1 elements), git-ui (5 elements), workspace-indexing (2 elements), cron-scheduler-ui (19 elements), messaging-gateway-ui (18 elements), marketplace (20 elements).
Component examples: `memory-stats-strip.component.ts`, `analyze-done.page.ts`, `provider-panel.component.ts`, `overview-page.component.html`, `skill-synthesis-tab.component.ts`.
Binding: signal/property + event candidate 11.

## Accessibility gaps

These are source-level candidates; nearby labels, projected names, and component behavior need manual review.

| Gap | Count | Examples (up to 8) |
|---|---:|---|
| input missing label/name candidate | 29 | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:92`, `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:101`, `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:110`, `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:120`, `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:134`, `libs/frontend/review-runs-ui/src/lib/components/review-repositories-editor.component.ts:32`, `libs/frontend/review-runs-ui/src/lib/components/review-repositories-editor.component.ts:40`, `libs/frontend/review-runs-ui/src/lib/components/review-repositories-editor.component.ts:50` |
| toggle missing name candidate | 16 | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:134`, `libs/frontend/review-runs-ui/src/lib/components/review-repositories-editor.component.ts:32`, `libs/frontend/review-runs-ui/src/lib/components/review-repositories-editor.component.ts:40`, `libs/frontend/review-runs-ui/src/lib/components/review-repositories-editor.component.ts:50`, `libs/frontend/review-runs-ui/src/lib/components/review-confirm-dialog.component.ts:12`, `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:270`, `libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:283`, `libs/frontend/declarative-dashboard/src/lib/components/surface-layout.component.ts:169` |
| title-only name candidate | 38 | `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:163`, `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:174`, `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:185`, `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html:195`, `libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts:268`, `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:25`, `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:26`, `libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts:77` |
| icon button missing name | 11 | `libs/frontend/tasks-ui/src/lib/components/task-board-header.component.ts:81`, `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts:171`, `libs/frontend/command-center/src/lib/components/command-center-start.component.ts:59`, `libs/frontend/onboarding/src/lib/shared/recovery-screen.component.ts:30`, `libs/frontend/git-ui/src/lib/git-dock/git-dock-header.component.ts:102`, `libs/frontend/git-ui/src/lib/open-in/open-in-button.component.ts:114`, `libs/frontend/onboarding/src/lib/ready/ready-connection-step.page.ts:42`, `libs/frontend/cron-scheduler-ui/src/lib/components/cron-job-detail-drawer.component.ts:204` |
| custom menu/listbox without role or keyboard handler candidate | 20 | `libs/frontend/git-ui/src/lib/open-in/open-in-button.component.ts:85`, `libs/frontend/tasks-ui/src/lib/components/task-board-header.component.ts:132`, `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:170`, `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:261`, `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:276`, `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:634`, `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:647`, `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:653` |
| clickable div/span without role, tabindex or keyboard handler | 3 | `libs/frontend/onboarding/src/lib/proposal/answer-dock.component.ts:25`, `libs/frontend/messaging-gateway-ui/src/lib/components/gateway-setup-guide.component.ts:8`, `libs/frontend/harness-builder/src/lib/components/harness-builder-leave-dialog.component.ts:26` |
| dialog missing label candidate | 1 | `libs/frontend/setup-wizard/src/lib/components/confirmation-modal.component.ts:94` |


Dialog focus management requires behavior inspection; its count is **undetermined** from markup alone.

## Shared controls

Selectors defined in `@ptah-extension/ui` or `@ptah-extension/chat-ui`; counts are template tag instances per library. Attribute directives are counted below.

| Family | Library | Shared selector | Uses |
|---|---|---|---:|
| F1 | machines-ui | `ptah-tool-input-display` (`chat-ui`) | 1 |
| F1 | marketplace | `ptah-install-scope-field` (`chat-ui`) | 1 |
| F10 | git-ui | `ptah-file-status-badge` (`ui`) | 2 |
| F10 | review-runs-ui | `ptah-ui-status-badge` (`ui`) | 1 |
| F13 | command-center | `ptah-provider-mark` (`ui`) | 4 |
| F13 | dashboard | `ptah-provider-mark` (`ui`) | 4 |
| F13 | marketplace | `ptah-brand-mark` (`ui`) | 12 |
| F13 | marketplace | `ptah-provider-mark` (`ui`) | 1 |
| F14 | command-center | `ptah-context-ring` (`chat-ui`) | 1 |
| F14 | command-center | `ptah-display-panel` (`chat-ui`) | 1 |
| F14 | command-center | `ptah-session-stats-summary` (`chat-ui`) | 1 |
| F14 | dashboard | `ptah-plugin-catalog-panel` (`chat-ui`) | 1 |
| F14 | git-ui | `ptah-pierre-diff-host` (`chat-ui`) | 1 |
| F14 | harness-builder | `ptah-session-stats-summary` (`chat-ui`) | 1 |
| F14 | machines-ui | `ptah-thinking-block` (`chat-ui`) | 1 |
| F14 | machines-ui | `ptah-tool-output-display` (`chat-ui`) | 1 |
| F14 | marketplace | `ptah-catalog-grid` (`ui`) | 14 |
| F14 | marketplace | `ptah-json-schema-form` (`ui`) | 1 |
| F14 | marketplace | `ptah-plugin-catalog-panel` (`chat-ui`) | 1 |
| F14 | marketplace | `ptah-storefront-panel` (`ui`) | 6 |
| F14 | mcp-apps-page | `ptah-electron-resize-handle` (`chat-ui`) | 1 |
| F3 | marketplace | `ptah-native-dropdown` (`ui`) | 1 |
| F3 | marketplace | `ptah-native-option` (`ui`) | 1 |
| F6 | git-ui | `ptah-native-tab-group` (`ui`) | 1 |
| F6 | marketplace | `ptah-native-tab-group` (`ui`) | 1 |
| F6 | skill-synthesis-ui | `ptah-native-tab-group` (`ui`) | 1 |
| F7 | cron-scheduler-ui | `ptah-native-drawer` (`ui`) | 1 |
| F7 | git-ui | `ptah-native-popover` (`ui`) | 2 |
| F7 | marketplace | `ptah-native-drawer` (`ui`) | 3 |
| F7 | marketplace | `ptah-native-popover` (`ui`) | 2 |
| F7 | setup-wizard | `ptah-native-modal` (`ui`) | 1 |
| F7 | skill-synthesis-ui | `ptah-native-drawer` (`ui`) | 2 |
| F7 | skill-synthesis-ui | `ptah-native-modal` (`ui`) | 2 |
| F7 | tasks-ui | `ptah-native-drawer` (`ui`) | 1 |
| F8 | machines-ui | `ptah-inbox-layout` (`ui`) | 1 |
| F8 | review-runs-ui | `ptah-inbox-layout` (`ui`) | 1 |
| F13 | command-center | `ptah-monogram-tile` (`ui`) | 4 |
| F9 | cron-scheduler-ui | `ptah-native-card` (`ui`) | 1 |
| F9 | machines-ui | `ptah-tool-call-header` (`chat-ui`) | 1 |
| F9 | marketplace | `ptah-catalog-card` (`ui`) | 8 |
| F9 | marketplace | `ptah-catalog-card-skeleton` (`ui`) | 6 |
| F13 | marketplace | `ptah-monogram-tile` (`ui`) | 5 |
| F9 | marketplace | `ptah-stat-card` (`ui`) | 4 |
| F9 | mcp-apps-page | `ptah-permission-request-card` (`chat-ui`) | 1 |
| F9 | mcp-apps-page | `ptah-question-card` (`chat-ui`) | 1 |
| F9 | memory-curator-ui | `ptah-native-card` (`ui`) | 9 |
| F9 | memory-curator-ui | `ptah-surface-card` (`ui`) | 1 |
| F9 | skill-synthesis-ui | `ptah-native-card` (`ui`) | 2 |
| F5 | review-runs-ui | `ptahButton` directive (`ui`) | 10 |
| F5 | onboarding | `ptahSetupAction` directive (`ui`) | 7 |
| F5 | machines-ui | `ptahSetupAction` directive (`ui`) | 3 |
| F5 | review-runs-ui | `ptahSetupAction` directive (`ui`) | 2 |
| F8 | machines-ui | `ptahInboxRow` directive (`ui`) | 1 |
| F8 | review-runs-ui | `ptahInboxRow` directive (`ui`) | 3 |
| F1 | review-runs-ui | `ptahFieldControl` directive (`ui`) | 6 |

## Reusable local controls

Selector declarations in scope with at least two observed usages across `libs/frontend/**` and `apps/ptah-extension-webview/**`. Counts are source tag matches and may include examples in TS strings.

| Selector | Definition | Usages |
|---|---|---:|
| `ptah-target-marks` | `libs/frontend/marketplace/src/lib/ui/target-marks.component.ts:82` | 8 |
| `ptah-task-facet-menu` | `libs/frontend/tasks-ui/src/lib/components/filter/task-filter-bar.component.ts:112` | 7 |
| `ptah-stat-card` | `libs/frontend/marketplace/src/lib/ui/stat-card.component.ts:65` | 7 |
| `ptah-run-panel` | `libs/frontend/onboarding/src/lib/shared/run-panel.component.ts:8` | 6 |
| `ptah-open-in-button` | `libs/frontend/git-ui/src/lib/open-in/open-in-button.component.ts:31` | 6 |
| `ptah-workspace-header` | `libs/frontend/onboarding/src/lib/shell/workspace-header.component.ts:6` | 4 |
| `ptah-confirmation-modal` | `libs/frontend/setup-wizard/src/lib/components/confirmation-modal.component.ts:89` | 3 |
| `ptah-status-card` | `libs/frontend/onboarding/src/lib/shared/status-card.component.ts:6` | 3 |
| `ptah-command-copy-row` | `libs/frontend/onboarding/src/lib/ready/command-copy-row.component.ts:22` | 3 |
| `ptah-onboarding-path-tile` | `libs/frontend/onboarding/src/lib/home/path-tile.component.ts:25` | 3 |
| `ptah-removal-lock-badge` | `libs/frontend/marketplace/src/lib/ui/removal-lock-badge.component.ts:36` | 3 |
| `ptah-provider-filter-select` | `libs/frontend/marketplace/src/lib/ui/provider-filter-select.component.ts:66` | 3 |
| `ptah-copy-command-button` | `libs/frontend/marketplace/src/lib/ui/copy-command-button.component.ts:56` | 3 |
| `ptah-connector-card-status` | `libs/frontend/marketplace/src/lib/ui/connector-card-status.component.ts:27` | 3 |
| `ptah-connector-card-actions` | `libs/frontend/marketplace/src/lib/ui/connector-card-actions.component.ts:21` | 3 |
| `ptah-scorecard-badge` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-badge.component.ts:23` | 2 |
| `ptah-provenance-badge` | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/provenance-badge.component.ts:45` | 2 |
| `ptah-task-card` | `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts:138` | 2 |
| `ptah-file-decision-row` | `libs/frontend/setup-wizard/src/lib/components/preview-decisions/file-decision-row.component.ts:32` | 2 |
| `ptah-provider-panel` | `libs/frontend/onboarding/src/lib/ready/provider-panel.component.ts:28` | 2 |
| `ptah-readiness-panel` | `libs/frontend/machines-ui/src/lib/components/readiness-panel/readiness-panel.component.ts:76` | 2 |
| `ptah-proposal-status-card` | `libs/frontend/onboarding/src/lib/proposal/proposal-status-card.component.ts:16` | 2 |
| `ptah-proposal-panel` | `libs/frontend/onboarding/src/lib/proposal/proposal-panel.component.ts:26` | 2 |
| `ptah-provider-table` | `libs/frontend/marketplace/src/lib/ui/provider-table.component.ts:196` | 2 |
| `ptah-marketplace-keep-replace` | `libs/frontend/marketplace/src/lib/kept-items-repair-prompt.component.ts:110` | 2 |
| `ptah-skills-section-header` | `libs/frontend/marketplace/src/lib/pages/skills/skills-section-header.component.ts:29` | 2 |

## Files with the most raw control markup

Sum of raw pattern matches within template source; family patterns may overlap.

| File | Raw matches |
|---|---:|
| `libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts` | 173 |
| `libs/frontend/marketplace/src/lib/smithery-surface.component.ts` | 158 |
| `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.html` | 123 |
| `libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts` | 115 |
| `libs/frontend/marketplace/src/lib/external-marketplaces.component.ts` | 96 |
| `libs/frontend/marketplace/src/lib/oauth-surface.component.ts` | 96 |
| `libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts` | 91 |
| `libs/frontend/marketplace/src/lib/pages/connectors/connectors-page.component.html` | 90 |
| `libs/frontend/onboarding/src/lib/ready/provider-panel.component.ts` | 90 |
| `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts` | 89 |
| `libs/frontend/harness-builder/src/lib/components/harness-config-preview.component.ts` | 84 |
| `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts` | 83 |
| `libs/frontend/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts` | 78 |
| `libs/frontend/marketplace/src/lib/pages/servers/installed-servers-page.component.ts` | 75 |
| `libs/frontend/git-ui/src/lib/task/task-worktree-view.component.ts` | 75 |

## Decisions

- Treat class names only on opening elements as control evidence; TS class names outside inline templates are raw matches only.
- Treat title attributes as native tooltip evidence in F7, including controls whose primary family is elsewhere.
- Count a shared tag use wherever it appears; import origin is not inferred from tag spelling.
- Count looks by tag plus significant classes; dynamic bindings and component internals can create additional runtime looks.
