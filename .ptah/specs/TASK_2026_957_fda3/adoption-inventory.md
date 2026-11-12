# Badge and status adoption inventory

Source: tools/ui-class-audit/baseline.json entries for the badge root in ui-badge-adopt-1, confirmed by reading source and targeted rg. Badge-root counts are static audit counts, not runtime instances.

## Owners

- PtahBadgeDirective: selector span[ptahBadge], inputs tone (neutral, accent, info, ok, warn, err), appearance (soft, outline), size (xs, sm), count (boolean). CSS hooks [data-ptah-badge], .ptah-badge-text; tokens --ptah-badge-*.
- PtahStatusComponent: selector ptah-status, inputs status (running, queued, pending, needs-review, warning, failed, offline, completed, online), label, appearance (pill, inline, dot), size (xs, sm). CSS hooks [data-ptah-status], .ptah-status-glyph, .ptah-status-text. Inks: run, idle, need, err, done.
- Mapping: ghost/plain/neutral = neutral soft; primary/accent/secondary = accent soft; info/success/warning/error = info/ok/warn/err soft; outline is context dependent; size follows xs/sm. State plus dot should usually use ptah-status. File mappings below aggregate multiple recipes.
- Look safety: NO raw DaisyUI badge can move with identical pixels. Family 3 explicitly changes ghost and solid fills, typography, and heights. DOM column span means the host may remain a span; review tag means a host conversion or child change. Every migration needs visual review. Epic step 5 requires declared DOM delta and at most six write files per implementation batch, so planning groups below must be subdivided.

## Raw badge files

| File | Raw roots | Existing modifiers | Owner tone / appearance / size | DOM | Disposition |
|---|---:|---|---|---|---|
| libs/frontend/chat/src/lib/components/atoms/workflow-badge.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/components/file-suggestions/file-tag.component.ts | 1 | badge-lg | neutral soft lg MISSING | review tag | Q3 owner lacks lg |
| libs/frontend/chat/src/lib/components/file-suggestions/suggestion-option.component.ts | 3 | badge-accent, badge-ghost, badge-info, badge-xs | neutral/accent/info soft xs | span | candidate |
| libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts | 9 | badge-error, badge-ghost, badge-info, badge-outline, badge-sm, badge-success, badge-warning, badge-xs | neutral/info/ok/warn/err outline/soft xs/sm | span | candidate |
| libs/frontend/chat/src/lib/components/molecules/execution-header/execution-header.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/components/molecules/lane-event/lane-event-row.component.html | 2 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/components/molecules/notifications/resume-notification-banner.component.ts | 2 | badge-outline, badge-warning, badge-xs | warn outline/soft xs | span | candidate |
| libs/frontend/chat/src/lib/components/molecules/peer-session-send/peer-session-send-dialog.component.ts | 3 | badge-error, badge-info, badge-sm, badge-success, badge-xs | info/ok/err soft xs/sm | span | candidate |
| libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts | 1 | badge-neutral, badge-xs | neutral soft xs | span | candidate |
| libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts | 5 | badge-neutral, badge-sm, badge-warning, badge-xs | neutral/warn soft xs/sm | span | candidate |
| libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts | 12 | badge-error, badge-ghost, badge-info, badge-outline, badge-sm, badge-success, badge-warning, badge-xs | neutral/info/ok/warn/err outline/soft xs/sm | span | candidate |
| libs/frontend/chat/src/lib/components/organisms/execution/monitor-card.component.ts | 1 | badge-ghost, badge-xs | neutral soft xs | span | candidate |
| libs/frontend/chat/src/lib/components/organisms/execution/send-message-chip.component.ts | 4 | badge-error, badge-info, badge-success, badge-warning, badge-xs | info/ok/warn/err soft xs | span | candidate |
| libs/frontend/chat/src/lib/components/organisms/execution/subagent-tile.component.ts | 1 | badge-sm, badge-warning | warn soft sm | review tag | candidate |
| libs/frontend/chat/src/lib/components/organisms/execution/task-card.component.ts | 1 | badge-xs | neutral soft xs | span | candidate |
| libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html | 2 | badge-sm | neutral soft sm | review tag | candidate |
| libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts | 3 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/components/organisms/transcript/lane-thread-row.component.ts | 1 | badge-error, badge-info, badge-success, badge-warning, badge-xs | info/ok/warn/err soft xs | span | candidate |
| libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts | 1 | badge-warning, badge-xs | warn soft xs | span | candidate |
| libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts | 4 | badge-outline, badge-sm | neutral outline/soft sm | span | EXCLUDED PR #1121 |
| libs/frontend/chat/src/lib/settings/output-style/output-style-list.component.ts | 4 | badge-outline, badge-xs | neutral outline/soft xs | span | EXCLUDED PR #1121 |
| libs/frontend/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | EXCLUDED PR #1121 |
| libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts | 4 | badge-outline, badge-warning, badge-xs | warn outline/soft xs | span | EXCLUDED PR #1121 |
| libs/frontend/chat/src/lib/settings/pro-features/mcp-port-config.component.ts | 1 | badge-outline, badge-xs | neutral outline/soft xs | span | EXCLUDED PR #1121 |
| libs/frontend/chat/src/lib/settings/pro-features/vscode-lm-config.component.ts | 3 | badge-outline, badge-xs | neutral outline/soft xs | span | EXCLUDED PR #1121 |
| libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts | 2 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/accounts/accounts-tab.component.ts | 1 | badge-sm, badge-warning | warn soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/accounts/ambient-account-row.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts | 1 | badge-outline, badge-xs | neutral outline/soft xs | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/connection-drawer/overview-tab.component.ts | 1 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts | 1 | badge-xs | neutral soft xs | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.ts | 1 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts | 2 | badge-ghost, badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts | 2 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts | 1 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts | 3 | badge-ghost, badge-sm, badge-warning, badge-xs | neutral/warn soft xs/sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-cells.component.ts | 1 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.ts | 1 | badge-outline, badge-xs | neutral outline/soft xs | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts | 2 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts | 2 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts | 2 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.ts | 4 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/voice-config.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts | 3 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat-ui/src/lib/atoms/cost-badge.component.ts | 3 | badge-ghost, badge-sm, badge-success | neutral/ok soft sm | span | candidate |
| libs/frontend/chat-ui/src/lib/atoms/duration-badge.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts | 1 | badge-error, badge-ghost, badge-info, badge-sm, badge-success, badge-warning | neutral/info/ok/warn/err soft sm | span | candidate |
| libs/frontend/chat-ui/src/lib/atoms/token-badge.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/agent-card/agent-card-output.component.ts | 2 | badge-xs | neutral soft xs | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/agent-card/agent-card-permission.component.ts | 1 | badge-sm, badge-warning | warn soft sm | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/agent-summary.component.ts | 1 | badge-ghost, badge-xs | neutral soft xs | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/chat-input/autopilot-popover.component.ts | 1 | badge-outline, badge-primary, badge-xs | accent outline/soft xs | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-meta.component.ts | 3 | badge-outline, badge-xs | neutral outline/soft xs | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/permissions/permission-request-card.component.ts | 2 | badge-error, badge-warning, badge-xs | warn/err soft xs | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/question-card.component.ts | 1 | badge-error, badge-warning, badge-xs | warn/err soft xs | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/provider-lane-limit-tile.component.ts | 1 | badge-ghost, badge-xs | neutral soft xs | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts | 3 | badge-neutral, badge-outline, badge-sm, badge-warning, badge-xs | neutral/warn outline/soft xs/sm | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts | 1 | badge-ghost, badge-xs | neutral soft xs | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-call-header.component.ts | 3 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary-files.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/command-center/src/lib/components/command-center-header.component.ts | 3 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/command-center/src/lib/components/command-center-start.component.ts | 3 | badge-outline, badge-primary | accent outline/soft sm | span | candidate |
| libs/frontend/command-center/src/lib/components/command-rail-tabs.component.ts | 1 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-breakdown-table.component.ts | 1 | badge-ghost, badge-xs | neutral soft xs | span | candidate |
| libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html | 1 | badge-sm, badge-warning | warn soft sm | review tag | candidate |
| libs/frontend/git-ui/src/lib/commit/commit-composer.component.ts | 1 | badge-sm, badge-success | ok soft sm | span | candidate |
| libs/frontend/git-ui/src/lib/review-canvas/file-section-header.component.ts | 3 | badge-ghost, badge-outline, badge-xs | neutral outline/soft xs | span | candidate |
| libs/frontend/git-ui/src/lib/spot-editor/spot-editor.component.ts | 1 | badge-ghost, badge-xs | neutral soft xs | span | candidate |
| libs/frontend/git-ui/src/lib/task/task-worktree-view.component.ts | 4 | badge-ghost, badge-warning, badge-xs | neutral/warn soft xs | span | candidate |
| libs/frontend/machines-ui/src/lib/components/machines-view/machine-overview.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/machines-ui/src/lib/components/machines-view/machines-page-header.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/machines-ui/src/lib/components/reconnect-banner/session-sync-chip.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/machines-ui/src/lib/components/remote-approval-block/remote-approval-block.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts | 1 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/machines-ui/src/lib/components/remote-session-view/remote-session-view.component.ts | 3 | badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/external-consent-dialog.component.ts | 3 | badge-ghost, badge-sm, badge-warning, badge-xs | neutral/warn soft xs/sm | span | candidate |
| libs/frontend/marketplace/src/lib/external-install-report.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/kept-items-repair-prompt.component.ts | 2 | badge-error, badge-ghost, badge-sm, badge-success | neutral/ok/err soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/pages/overview/overview-page.component.html | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/pages/servers/installed-servers-page.component.ts | 2 | badge-ghost, badge-outline, badge-sm | neutral outline/soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/pages/servers/provider-list-view.component.html | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/pages/servers/server-detail.component.html | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/pages/skills/installed-skills-page.component.ts | 4 | badge-ghost, badge-outline, badge-sm, badge-warning | neutral/warn outline/soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/pages/skills/skill-detail.component.ts | 3 | badge-sm, badge-warning, badge-xs | warn soft xs/sm | span | candidate |
| libs/frontend/marketplace/src/lib/shell/marketplace-nav.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/smithery-surface.component.ts | 1 | badge-neutral, badge-xs | neutral soft xs | span | candidate |
| libs/frontend/marketplace/src/lib/ui/needs-attention.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/marketplace/src/lib/ui/provider-table.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/memory-curator-ui/src/lib/components/corpus-suggestions.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts | 5 | badge-error, badge-ghost, badge-sm, badge-success, badge-warning | neutral/ok/warn/err soft sm | span | candidate |
| libs/frontend/memory-curator-ui/src/lib/components/diagnostics/event-feed.component.ts | 1 | badge-error, badge-info, badge-sm, badge-success, badge-warning | info/ok/warn/err soft sm | span | candidate |
| libs/frontend/memory-curator-ui/src/lib/components/diagnostics/storage-health-panel.component.ts | 2 | badge-error, badge-ghost, badge-sm, badge-success, badge-warning | neutral/ok/warn/err soft sm | span | candidate |
| libs/frontend/memory-curator-ui/src/lib/components/memory-pause-switch.component.ts | 1 | badge-sm, badge-warning | warn soft sm | span | candidate |
| libs/frontend/memory-curator-ui/src/lib/components/timeline-filters.component.ts | 1 | badge-sm, badge-warning | warn soft sm | span | candidate |
| libs/frontend/review-runs-ui/src/lib/components/review-page-header.component.ts | 1 | badge-outline | neutral outline/soft sm | span | candidate |
| libs/frontend/review-runs-ui/src/lib/components/review-repositories.component.ts | 1 | badge-outline | neutral outline/soft sm | span | candidate |
| libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts | 2 | badge-outline, badge-warning | warn outline/soft sm | span | candidate |
| libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts | 3 | badge-ghost, badge-outline, badge-sm, badge-xs | neutral outline/soft xs/sm | span | candidate |
| libs/frontend/setup-wizard/src/lib/components/agent-preview-dialog.component.ts | 2 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/setup-wizard/src/lib/components/analysis-transcript.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/setup-wizard/src/lib/components/community-packs-panel.component.ts | 2 | badge-ghost, badge-sm, badge-success | neutral/ok soft sm | span | candidate |
| libs/frontend/setup-wizard/src/lib/components/completion/outcome-summary.component.ts | 1 | badge-error, badge-ghost, badge-outline, badge-sm | neutral/err outline/soft sm | span | candidate |
| libs/frontend/setup-wizard/src/lib/components/preview-decisions/file-decision-row.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/setup-wizard/src/lib/components/preview-decisions/target-root-choice.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts | 1 | badge-xs | neutral soft xs | span | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-card.component.ts | 1 | badge-sm | neutral soft sm | review dynamic | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts | 3 | badge-ghost, badge-outline, badge-sm, badge-success | neutral/ok outline/soft sm | span | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/clones/provenance-badge.component.ts | 2 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/clones/reconcile-guard.ts | 2 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-badge.component.ts | 1 | badge-error, badge-ghost, badge-sm, badge-success | neutral/ok/err soft sm | span | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-detail.component.ts | 2 | badge-error, badge-ghost, badge-success, badge-xs | neutral/ok/err soft xs | span | candidate |
| libs/frontend/skill-synthesis-ui/src/lib/components/skills-pause-switch.component.ts | 1 | badge-sm, badge-warning | warn soft sm | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts | 8 | badge-ghost, badge-outline, badge-xs | neutral outline/soft xs | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts | 6 | badge-ghost, badge-outline, badge-sm, badge-xs | neutral outline/soft xs/sm | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/detail/task-activity.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | review dynamic | candidate |
| libs/frontend/tasks-ui/src/lib/components/detail/task-detail.component.ts | 1 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/detail/task-detail-header.component.ts | 3 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/detail/task-document-reader.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/detail/task-folder-overview.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/detail/task-metadata-editor.component.ts | 1 | badge-sm | neutral soft sm | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/detail/task-relations.component.ts | 1 | badge-ghost, badge-outline, badge-sm | neutral outline/soft sm | review tag | candidate |
| libs/frontend/tasks-ui/src/lib/components/detail/task-run-placeholder.component.ts | 1 | badge-ghost, badge-sm | neutral soft sm | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/filter/task-view-menu.component.ts | 1 | badge-outline, badge-xs | neutral outline/soft xs | span | candidate |
| libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts | 2 | badge-ghost | neutral soft sm | span | candidate |
| libs/frontend/thoth-shell/src/lib/components/thoth-shell.component.ts | 1 | badge-sm, badge-warning | warn soft sm | span | candidate |

Total: 129 files and 248 badge-root uses. All have look-safe = no. EXCLUDED rows are recorded but are absent from batches.

## Additional status marks and handmade pills

These are outside the audit badge-root total. Counts below are grep-confirmed source marks, with dynamic branches counted as one mark.

| File | Marks | Owner | Disposition |
|---|---:|---|---|
libs/frontend/chat/src/lib/settings/settings.component.html | 2 dots | ptah-status dot, need/done | candidate
libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts | 5 dots | ptah-status inline/dot, done/need/err | candidate
libs/frontend/chat/src/lib/settings/providers/connection-drawer/advanced-tab.component.ts | 1 dot + dynamic probe | ptah-status dot | EXCLUDED PR #1121 advanced
libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts | 1 dynamic dot | ptah-status dot, done/idle | candidate
libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts | 2 dots | ptah-status dot, done/need | candidate
libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts | 2 dots | ptah-status dot, done/need | candidate
libs/frontend/chat/src/lib/settings/license/license-status-card.component.ts | 3 dots | ptah-status, err/done/need | EXCLUDED PR #1121 license
libs/frontend/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts | 1 dot | ptah-status dot | EXCLUDED PR #1121 pro-features
libs/frontend/chat/src/lib/components/atoms/session-organization-chips/session-live-phase-indicator.component.ts | 1 dot | ptah-status dot, run | candidate
libs/frontend/memory-curator-ui/src/lib/components/timeline-view.component.ts | 1 dot | ptah-status dot | candidate
libs/frontend/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts | 2 dots | ptah-status dot, run/need | candidate
libs/frontend/git-ui/src/lib/spot-editor/spot-editor.component.ts | 1 dot | ptah-status dot, need | candidate
libs/frontend/command-center/src/lib/components/command-center-header.component.ts | 1 dynamic dot | ptah-status dot, done/need | candidate
libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/lane-usage-tile.component.ts | 1 dot | ptah-status dot, done | candidate
libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts | 1 ptah-ui-status-badge | ptah-status pill, failed/needs-review | candidate
libs/frontend/marketplace/src/lib/ui/removal-lock-badge.component.ts | 1 handmade pill | ptahBadge warn soft sm | candidate
libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts | 1 handmade pill | ptahBadge info soft sm | candidate
libs/frontend/notification-center/src/lib/notification-center.component.ts | 1 count pill | ptahBadge warn soft xs count | candidate

Status and handmade rows all change DOM/look. Review semantics before replacing dots that sit next to text. Retain ptah-file-status-badge in libs/frontend/ui/src/lib/native/file-status-badge/file-status-badge.component.ts: git letter codes require a missing owner variant and contrast contract (Q3). Retain composer and canvas rail dots per U2. Other rounded colored marks found by grep serve buttons, progress bars, icons or audio meters and are outside this family. The old chat-ui ptah-status-badge has zero uses per the owner spec.

## File-disjoint adoption planning groups

Groups contain 10 to 20 badge files and follow lib boundaries where possible. Extra status-only candidates can join their lib group after DOM review. Subdivide each group into at most six write files for epic step 5. Template changes also need the renderer template check specified in CLAUDE.md.


### Group 1 (15 files; chat)

- libs/frontend/chat/src/lib/components/atoms/workflow-badge.component.ts
- libs/frontend/chat/src/lib/components/file-suggestions/suggestion-option.component.ts
- libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts
- libs/frontend/chat/src/lib/components/molecules/execution-header/execution-header.component.ts
- libs/frontend/chat/src/lib/components/molecules/lane-event/lane-event-row.component.html
- libs/frontend/chat/src/lib/components/molecules/notifications/resume-notification-banner.component.ts
- libs/frontend/chat/src/lib/components/molecules/peer-session-send/peer-session-send-dialog.component.ts
- libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts
- libs/frontend/chat/src/lib/components/organisms/agent-monitor-panel.component.ts
- libs/frontend/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts
- libs/frontend/chat/src/lib/components/organisms/execution/monitor-card.component.ts
- libs/frontend/chat/src/lib/components/organisms/execution/send-message-chip.component.ts
- libs/frontend/chat/src/lib/components/organisms/execution/subagent-tile.component.ts
- libs/frontend/chat/src/lib/components/organisms/execution/task-card.component.ts
- libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html

Verify: npm run verify -- -p @ptah-extension/chat

### Group 2 (15 files; chat)

- libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts
- libs/frontend/chat/src/lib/components/organisms/transcript/lane-thread-row.component.ts
- libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts
- libs/frontend/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts
- libs/frontend/chat/src/lib/settings/providers/accounts/accounts-tab.component.ts
- libs/frontend/chat/src/lib/settings/providers/accounts/ambient-account-row.component.ts
- libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts
- libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts
- libs/frontend/chat/src/lib/settings/providers/connection-drawer/overview-tab.component.ts
- libs/frontend/chat/src/lib/settings/providers/decision-model-row.component.ts
- libs/frontend/chat/src/lib/settings/providers/main-agent-section.component.ts
- libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts
- libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts
- libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts

Verify: npm run verify -- -p @ptah-extension/chat

### Group 3 (15 files; chat, chat-ui)

- libs/frontend/chat/src/lib/settings/ptah-ai/cli-capability-cells.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/cursor-credential-popover.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/voice-config.component.ts
- libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts
- libs/frontend/chat-ui/src/lib/atoms/cost-badge.component.ts
- libs/frontend/chat-ui/src/lib/atoms/duration-badge.component.ts
- libs/frontend/chat-ui/src/lib/atoms/status-badge.component.ts
- libs/frontend/chat-ui/src/lib/atoms/token-badge.component.ts
- libs/frontend/chat-ui/src/lib/molecules/agent-card/agent-card-output.component.ts
- libs/frontend/chat-ui/src/lib/molecules/agent-card/agent-card-permission.component.ts

Verify: npm run verify -- -p @ptah-extension/chat,@ptah-extension/chat-ui

### Group 4 (16 files; chat-ui, command-center, dashboard)

- libs/frontend/chat-ui/src/lib/molecules/agent-summary.component.ts
- libs/frontend/chat-ui/src/lib/molecules/chat-input/autopilot-popover.component.ts
- libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-meta.component.ts
- libs/frontend/chat-ui/src/lib/molecules/permissions/permission-request-card.component.ts
- libs/frontend/chat-ui/src/lib/molecules/question-card.component.ts
- libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/provider-lane-limit-tile.component.ts
- libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts
- libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts
- libs/frontend/chat-ui/src/lib/molecules/setup-plugins/skill-sh-browser.component.ts
- libs/frontend/chat-ui/src/lib/molecules/tool-execution/tool-call-header.component.ts
- libs/frontend/chat-ui/src/lib/molecules/turn-recap/turn-summary-files.component.ts
- libs/frontend/command-center/src/lib/components/command-center-header.component.ts
- libs/frontend/command-center/src/lib/components/command-center-start.component.ts
- libs/frontend/command-center/src/lib/components/command-rail-tabs.component.ts
- libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-breakdown-table.component.ts
- libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html

Verify: npm run verify -- -p @ptah-extension/chat-ui,@ptah-extension/command-center,@ptah-extension/dashboard

### Group 5 (15 files; git-ui, machines-ui, marketplace)

- libs/frontend/git-ui/src/lib/commit/commit-composer.component.ts
- libs/frontend/git-ui/src/lib/review-canvas/file-section-header.component.ts
- libs/frontend/git-ui/src/lib/spot-editor/spot-editor.component.ts
- libs/frontend/git-ui/src/lib/task/task-worktree-view.component.ts
- libs/frontend/machines-ui/src/lib/components/machines-view/machine-overview.component.ts
- libs/frontend/machines-ui/src/lib/components/machines-view/machines-page-header.component.ts
- libs/frontend/machines-ui/src/lib/components/reconnect-banner/session-sync-chip.component.ts
- libs/frontend/machines-ui/src/lib/components/remote-approval-block/remote-approval-block.component.ts
- libs/frontend/machines-ui/src/lib/components/remote-session-list/remote-session-list.component.ts
- libs/frontend/machines-ui/src/lib/components/remote-session-view/remote-session-view.component.ts
- libs/frontend/marketplace/src/lib/external-consent-dialog.component.ts
- libs/frontend/marketplace/src/lib/external-install-report.component.ts
- libs/frontend/marketplace/src/lib/kept-items-repair-prompt.component.ts
- libs/frontend/marketplace/src/lib/pages/overview/overview-page.component.html
- libs/frontend/marketplace/src/lib/pages/servers/installed-servers-page.component.ts

Verify: npm run verify -- -p @ptah-extension/git-ui,@ptah-extension/machines-ui,@ptah-extension/marketplace

### Group 6 (15 files; marketplace, memory-curator-ui, review-runs-ui)

- libs/frontend/marketplace/src/lib/pages/servers/provider-list-view.component.html
- libs/frontend/marketplace/src/lib/pages/servers/server-detail.component.html
- libs/frontend/marketplace/src/lib/pages/skills/installed-skills-page.component.ts
- libs/frontend/marketplace/src/lib/pages/skills/skill-detail.component.ts
- libs/frontend/marketplace/src/lib/shell/marketplace-nav.component.ts
- libs/frontend/marketplace/src/lib/smithery-surface.component.ts
- libs/frontend/marketplace/src/lib/ui/needs-attention.component.ts
- libs/frontend/marketplace/src/lib/ui/provider-table.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/corpus-suggestions.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/diagnostics/event-feed.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/diagnostics/storage-health-panel.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/memory-pause-switch.component.ts
- libs/frontend/memory-curator-ui/src/lib/components/timeline-filters.component.ts
- libs/frontend/review-runs-ui/src/lib/components/review-page-header.component.ts

Verify: npm run verify -- -p @ptah-extension/marketplace,@ptah-extension/memory-curator-ui,@ptah-extension/review-runs-ui

### Group 7 (15 files; review-runs-ui, setup-wizard, skill-synthesis-ui)

- libs/frontend/review-runs-ui/src/lib/components/review-repositories.component.ts
- libs/frontend/review-runs-ui/src/lib/components/review-run-detail.component.ts
- libs/frontend/review-runs-ui/src/lib/findings/review-finding-card.component.ts
- libs/frontend/setup-wizard/src/lib/components/agent-preview-dialog.component.ts
- libs/frontend/setup-wizard/src/lib/components/analysis-transcript.component.ts
- libs/frontend/setup-wizard/src/lib/components/community-packs-panel.component.ts
- libs/frontend/setup-wizard/src/lib/components/completion/outcome-summary.component.ts
- libs/frontend/setup-wizard/src/lib/components/preview-decisions/file-decision-row.component.ts
- libs/frontend/setup-wizard/src/lib/components/preview-decisions/target-root-choice.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-card.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/enhance-preview-drawer.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/provenance-badge.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/quarantined-agents-panel.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/reconcile-guard.ts

Verify: npm run verify -- -p @ptah-extension/review-runs-ui,@ptah-extension/setup-wizard,@ptah-extension/skill-synthesis-ui

### Group 8 (16 files; skill-synthesis-ui, tasks-ui, thoth-shell)

- libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-badge.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-detail.component.ts
- libs/frontend/skill-synthesis-ui/src/lib/components/skills-pause-switch.component.ts
- libs/frontend/tasks-ui/src/lib/components/board/task-card.component.ts
- libs/frontend/tasks-ui/src/lib/components/board/task-list.component.ts
- libs/frontend/tasks-ui/src/lib/components/detail/task-activity.component.ts
- libs/frontend/tasks-ui/src/lib/components/detail/task-detail.component.ts
- libs/frontend/tasks-ui/src/lib/components/detail/task-detail-header.component.ts
- libs/frontend/tasks-ui/src/lib/components/detail/task-document-reader.component.ts
- libs/frontend/tasks-ui/src/lib/components/detail/task-folder-overview.component.ts
- libs/frontend/tasks-ui/src/lib/components/detail/task-metadata-editor.component.ts
- libs/frontend/tasks-ui/src/lib/components/detail/task-relations.component.ts
- libs/frontend/tasks-ui/src/lib/components/detail/task-run-placeholder.component.ts
- libs/frontend/tasks-ui/src/lib/components/filter/task-view-menu.component.ts
- libs/frontend/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts
- libs/frontend/thoth-shell/src/lib/components/thoth-shell.component.ts

Verify: npm run verify -- -p @ptah-extension/skill-synthesis-ui,@ptah-extension/tasks-ui,@ptah-extension/thoth-shell

No source, test, build or serve command was run for this inventory.
