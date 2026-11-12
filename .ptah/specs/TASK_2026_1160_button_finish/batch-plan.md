# Button adoption completion: research and batch plan

## Counts (main at 0823a07cc)
- Class audit baseline: 1518 tokens. Button roots (`btn`, `btn-*`): 725 tokens.
- Raw `<button>`/`<a>` with class `btn`: 224, in 118 files, 18 libs. None in `libs/frontend/ui`.
- Per lib (tokens): chat 208, chat-ui 116, canvas 89, marketplace 56, git-ui 47, skill-synthesis-ui 33, dashboard 30, tasks-ui 21, memory-curator-ui 21, messaging-gateway-ui 19, onboarding 18, core 16, notification-center 14, review-runs-ui 14, cron-scheduler-ui 13, command-center 4, machines-ui 4, setup-wizard 2.
- Modifier tokens: btn-xs 122, btn-ghost 120, btn-sm 94, btn-primary 45, btn-outline 43, btn-active 22, btn-warning 19, btn-square 13, btn-error 8, btn-success 5, btn-info 4, btn-circle 2, btn-disabled 2, btn-gold 2.

## Earlier work (all merged, not redone)
#1066 owner, #1071 look, #1073 and #1080 marketplace, #1078 pages look, #1082 memory/skills/machines,
#1087 git-ui/tasks-ui, #1088 onboarding, #1089 chat-ui/harness/command-center, plus 4c-1, 4c-2, 4c-2b, 4c-3, 4d-1, 4d-2.
Remote branches `feat/ui-button-adopt-*` are all merged. Local branches `chore/ui-button-adopt-session-home-4`
and `feat/ui-button-adopt-4d2` are stale: do not reuse. No open PR touches button files (open: #1142, #1147, #1148, #1045).
The remaining files are the ones that earlier batches skipped (rail, app shell, dialogs, tone buttons).

## Owner gaps (owner has primary, secondary, ghost, danger, link; sizes xs, sm, md; icon button; `data-state=active`)
- btn-warning (19 uses, 28 files list below), btn-success (5), btn-info (4), btn-gold (2): no tone variant.
  Default: stay raw, named exception, unless a small owner PR adds a tone input. None blocks a batch.
- btn-circle (2: previous-sessions-toolbar, session-filter-bar): round shape not in icon button. Raw exception.
- btn-active (22): maps to `data-state="active"` or `aria-pressed`. No gap, lane must check each use.
- btn-disabled (2: install-scope-field, open-in-button): use `[disabled]`. No gap.
- btn-outline (43): no outline variant. Coordinator decision: stay raw, named exception, until the user decides.
- Layout classes such as `h-auto min-h-8 flex-col` (canvas-rail-card) may fight the owner size: lane checks each, else exception.

## Batch plan (at most 6 write files, spec files extra, disjoint by file)
### B1 chat part 1 (6 files, 12 raw buttons)
- libs/frontend/chat/src/lib/components/molecules/confirmation-dialog.component.ts
- libs/frontend/chat/src/lib/components/molecules/delivery-status/delivery-status.component.ts
- libs/frontend/chat/src/lib/components/molecules/previous-sessions-toolbar/previous-sessions-toolbar.component.ts
- libs/frontend/chat/src/lib/components/molecules/send-to-messaging/send-to-messaging.component.ts
- libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts
- libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts

### B2 chat part 2 (6 files, 14 raw buttons)
- libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts
- libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.html
- libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts
- libs/frontend/chat/src/lib/components/organisms/workspace-sidebar.component.ts
- libs/frontend/chat/src/lib/components/templates/app-shell.component.html
- libs/frontend/chat/src/lib/settings/advanced-settings.component.ts

### B3 chat part 3 (6 files, 11 raw buttons)
- libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts
- libs/frontend/chat/src/lib/settings/advanced/codex-sandbox-setting.component.ts
- libs/frontend/chat/src/lib/settings/feedback/settings-toast.component.ts
- libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts
- libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts
- libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.ts

### B4 chat part 4 (6 files, 7 raw buttons)
- libs/frontend/chat/src/lib/settings/output-style/output-style-notices.component.ts
- libs/frontend/chat/src/lib/settings/output-style/output-style-parity-section.component.ts
- libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts
- libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts
- libs/frontend/chat/src/lib/settings/pro-features/system-prompt-drawer.component.ts
- libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts

### B5 chat part 5 (6 files, 13 raw buttons)
- libs/frontend/chat/src/lib/settings/providers/accounts/accounts-tab.component.ts
- libs/frontend/chat/src/lib/settings/providers/accounts/add-account-form.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-drawer/codex-sign-in-block.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts

### B6 chat part 6 (6 files, 6 raw buttons)
- libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts

### B7 chat part 7 (1 files, 1 raw buttons)
- libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts

### B8 chat-ui part 1 (6 files, 8 raw buttons)
- libs/frontend/chat-ui/src/lib/atoms/copy-button.component.ts
- libs/frontend/chat-ui/src/lib/atoms/copy-text-button.component.ts
- libs/frontend/chat-ui/src/lib/atoms/report-response-button.component.ts
- libs/frontend/chat-ui/src/lib/molecules/agent-card/agent-card-permission.component.ts
- libs/frontend/chat-ui/src/lib/molecules/agent-steer-input.component.ts
- libs/frontend/chat-ui/src/lib/molecules/chat-input/autopilot-popover.component.ts

### B9 chat-ui part 2 (6 files, 17 raw buttons)
- libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-session-callout.component.ts
- libs/frontend/chat-ui/src/lib/molecules/lane-composer.component.ts
- libs/frontend/chat-ui/src/lib/molecules/permissions/deny-message-popover.component.ts
- libs/frontend/chat-ui/src/lib/molecules/permissions/permission-request-card.component.ts
- libs/frontend/chat-ui/src/lib/molecules/question-card.component.ts
- libs/frontend/chat-ui/src/lib/molecules/setup-plugins/install-scope-field.component.ts

### B10 chat-ui part 3 (6 files, 10 raw buttons)
- libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts
- libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts
- libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts
- libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary-files.component.ts
- libs/frontend/chat-ui/src/lib/organisms/mermaid/mermaid-diagram.component.ts
- libs/frontend/chat-ui/src/lib/organisms/ptah-ui/ptah-ui-display-chip.component.ts

### B11 marketplace part 1 (6 files, 8 raw buttons)
- libs/frontend/marketplace/src/lib/external-installed-row.component.ts
- libs/frontend/marketplace/src/lib/external-marketplaces.component.ts
- libs/frontend/marketplace/src/lib/external-plugin-row.component.ts
- libs/frontend/marketplace/src/lib/harness/harness-health-badge.component.ts
- libs/frontend/marketplace/src/lib/harness/harness-repair-dialog.component.ts
- libs/frontend/marketplace/src/lib/oauth-surface.component.ts

### B12 marketplace part 2 (6 files, 9 raw buttons)
- libs/frontend/marketplace/src/lib/pages/connectors/connectors-page.component.html
- libs/frontend/marketplace/src/lib/pages/skills/installed-skills-page.component.ts
- libs/frontend/marketplace/src/lib/pages/skills/plugin-config-home-notice.component.ts
- libs/frontend/marketplace/src/lib/smithery-surface.component.ts
- libs/frontend/marketplace/src/lib/ui/provider-filter-select.component.ts
- libs/frontend/marketplace/src/lib/ui/provider-filters.component.ts

### B13 canvas part 1 (6 files, 25 raw buttons)
- libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-tabs.component.ts
- libs/frontend/canvas/src/lib/canvas-detail/canvas-lane-view.component.ts
- libs/frontend/canvas/src/lib/canvas-rail/canvas-empty-board.component.ts
- libs/frontend/canvas/src/lib/canvas-rail/canvas-focus-header.component.ts
- libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-board.component.ts
- libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts

### B14 canvas part 2 (1 files, 4 raw buttons)
- libs/frontend/canvas/src/lib/canvas-rail/canvas-rail.component.ts

### B15 git-ui part 1 (6 files, 12 raw buttons)
- libs/frontend/git-ui/src/lib/branch-picker/branch-picker-dropdown.component.ts
- libs/frontend/git-ui/src/lib/conflict/conflict-banner.component.ts
- libs/frontend/git-ui/src/lib/open-in/open-in-button.component.ts
- libs/frontend/git-ui/src/lib/review-canvas/comparison-bar.component.ts
- libs/frontend/git-ui/src/lib/review-canvas/file-section-header.component.ts
- libs/frontend/git-ui/src/lib/spot-editor/spot-editor.component.ts

### B16 git-ui part 2 (1 files, 2 raw buttons)
- libs/frontend/git-ui/src/lib/stash/stash-popover.component.ts

### B17 skill-synthesis-ui part 1 (6 files, 9 raw buttons)
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/bulk-rebase-confirm.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-bulk-toolbar.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-card.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/reconcile-guard.ts

### B18 skill-synthesis-ui part 2 (1 files, 1 raw buttons)
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts

### B19 memory-curator-ui (5 files, 7 raw buttons)
- libs/frontend/memory-curator-ui/src/lib/components/corpus-build-dialog.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/corpus-list.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/memory-indexed-code.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/memory-search-bar.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/timeline-filters.component.ts

### B20 tasks-ui (4 files, 6 raw buttons)
- libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts
- libs/frontend/tasks-ui/src/lib/components/filter/task-filter-bar.component.ts
- libs/frontend/tasks-ui/src/lib/components/filter/task-view-menu.component.ts
- libs/frontend/tasks-ui/src/lib/components/task-board-header.component.ts

### B21 small libs 1 (6 files, 12 raw buttons)
- libs/frontend/cron-scheduler-ui/src/lib/components/cron-job-card.component.ts
- libs/frontend/cron-scheduler-ui/src/lib/components/cron-job-detail-drawer.component.ts
- libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts
- libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-breakdown-table.component.ts
- libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-cost-donut.component.ts
- libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html

### B22 small libs 2 (6 files, 11 raw buttons)
- libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts
- libs/frontend/onboarding/src/lib/ready/ready-connection-step.page.ts
- libs/frontend/onboarding/src/lib/shared/run-panel.component.ts
- libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts
- libs/frontend/review-runs-ui/src/lib/components/review-runs-page.component.ts
- libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html

### B23 small libs 3 (6 files, 11 raw buttons)
- libs/frontend/machines-ui/src/lib/components/add-machine-pane/add-machine-pane.component.ts
- libs/frontend/machines-ui/src/lib/components/machines-view/machine-overview.component.ts
- libs/frontend/messaging-gateway-ui/src/lib/components/messaging-gateway-tab.component.ts
- libs/frontend/messaging-gateway-ui/src/lib/components/platform-bindings-panel.component.ts
- libs/frontend/notification-center/src/lib/notification-center.component.ts
- libs/frontend/notification-center/src/lib/notification-snackbar.component.ts

### B24 small libs 4 (3 files, 8 raw buttons)
- libs/frontend/command-center/src/lib/components/command-pending-input.component.ts
- libs/frontend/core/src/lib/components/attention-permission-actions.component.ts
- libs/frontend/setup-wizard/src/lib/components/confirmation-modal.component.ts
## Decisions of the coordinator
- Raw exceptions: btn-outline, btn-warning, btn-success, btn-info, btn-gold, btn-circle. No owner change now.
- Order: batches with only expressible uses go first. Each report gives adopted and raw counts.
