# Shared UI usage evidence

Scope: `libs/frontend/**` and `apps/ptah-extension-webview/**`; rendered `.ts` templates and `.html`, excluding `*.spec.ts`, `*.test.ts`, stories, CSS, comments, and test harnesses. A site is one rendered control/element, so a file can have multiple sites. Searches used `rg`; each cited line came from a ripgrep hit. `F/` means `libs/frontend/`; `W/` means `apps/ptah-extension-webview/`.

The UI index/folders already expose button, alert, native tab group, status badge, state panel, tooltip directive, stat card, and skeleton. `PtahButtonTone` currently allows `default | danger | muted-danger`. No table or general disclosure owner is exported.

## 1. Warning tone for `ptahButton`

**Total: 36 sites** (19 warning action buttons, 17 warning alerts/notices). The button API change is directly motivated by the 19 action sites; alerts already have a shared warning tone.

### Outside chat settings (34)

| Site | Needed features |
| --- | --- |
| `F/git-ui/src/lib/shared/git-confirm-dialog.component.ts:136` | filled, sm confirmation |
| `F/skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts:402` | filled, xs |
| `F/skill-synthesis-ui/src/lib/components/clones/clone-bulk-toolbar.component.ts:54` | filled, xs |
| `F/skill-synthesis-ui/src/lib/components/clones/bulk-rebase-confirm.component.ts:77` | filled, sm confirmation |
| `F/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts:534` | filled, sm |
| `F/skill-synthesis-ui/src/lib/components/clones/reconcile-guard.ts:273` | filled, sm |
| `F/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:333` | outline, xs |
| `F/skill-synthesis-ui/src/lib/components/clones/clone-detail-drawer.component.ts:349` | outline, xs |
| `F/command-center/src/lib/components/command-pending-input.component.ts:99` | filled, compact/touch target |
| `F/command-center/src/lib/components/command-pending-input.component.ts:131` | filled, compact/touch target |
| `F/marketplace/src/lib/harness/harness-repair-dialog.component.ts:328` | filled, sm |
| `F/marketplace/src/lib/harness/harness-health-badge.component.ts:207` | outline, xs |
| `F/chat-ui/src/lib/molecules/lane-composer.component.ts:60` | filled, sm |
| `F/chat-ui/src/lib/molecules/permissions/deny-message-popover.component.ts:51` | outline, xs deny action |
| `F/chat-ui/src/lib/molecules/permissions/deny-message-popover.component.ts:77` | filled, xs deny action |
| `F/chat/src/lib/components/molecules/delivery-status/delivery-status.component.ts:37` | filled, xs |
| `F/chat/src/lib/components/molecules/confirmation-dialog.component.ts:78` | filled, compact/touch target confirmation |
| `F/workspace-indexing/src/lib/workspace-indexing.component.html:243` | warning notice |
| `F/workspace-indexing/src/lib/workspace-indexing.component.html:340` | warning notice |
| `F/review-runs-ui/src/lib/components/review-bot-identity.component.ts:14` | warning notice / alert role |
| `F/setup-wizard/src/lib/components/completion/outcome-summary.component.ts:60` | warning notice / alert role |
| `F/setup-wizard/src/lib/components/completion/library-stale-notice.component.ts:16` | warning notice |
| `F/setup-wizard/src/lib/components/agent-preview-dialog.component.ts:166` | warning notice / alert role |
| `F/setup-wizard/src/lib/components/agent-preview-dialog.component.ts:184` | warning notice / alert role |
| `F/setup-wizard/src/lib/components/agent-preview-dialog.component.ts:195` | warning notice / alert role |
| `F/tasks-ui/src/lib/components/detail/task-folder-overview.component.ts:107` | warning notice |
| `F/memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts:321` | warning notice / dynamic tone |
| `F/skill-synthesis-ui/src/lib/components/clones/skill-clones-view.component.ts:307` | warning notice / dynamic tone |
| `F/marketplace/src/lib/smithery-surface.component.ts:337` | warning notice |
| `F/marketplace/src/lib/pages/skills/plugin-config-home-notice.component.ts:172` | warning notice |
| `F/marketplace/src/lib/pages/skills/installed-library-stale-notice.component.ts:22` | warning notice |
| `F/marketplace/src/lib/external-install-report.component.ts:162` | warning notice |
| `F/marketplace/src/lib/kept-items-repair-prompt.component.ts:440` | warning notice |
| `F/chat/src/lib/components/molecules/peer-session-send/peer-session-send-dialog.component.ts:131` | warning notice |

### Chat settings (2)

| Site | Needed features |
| --- | --- |
| `F/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:110` | filled, sm |
| `F/chat/src/lib/settings/feedback/settings-toast.component.ts:144` | filled, sm |

## 2. `ptah-table`

**Total: 24 rendered tables** (23 native `<table>` elements and one `role="table"` layout). No rendered role-only grid was found in the scoped search.

### Outside chat settings (11)

| Site | Needed features |
| --- | --- |
| `F/chat-ui/src/lib/molecules/session/session-model-breakdown.component.ts:30` | role table, compact rows, numeric columns, accessible row/column headers |
| `F/tasks-ui/src/lib/components/task-maintenance-dialog.component.ts:79` | compact rows |
| `F/marketplace/src/lib/ui/provider-table.component.ts:299` | sm rows, wide/overflow |
| `F/marketplace/src/lib/ui/coverage-matrix.component.ts:175` | xs dense rows, wide/overflow |
| `F/declarative-dashboard/src/lib/components/dashboard-table.component.ts:58` | xs dense rows, numeric columns |
| `F/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:43` | sm rows, numeric columns |
| `F/dashboard/src/lib/components/usage-dashboard/usage-top-sessions.component.ts:19` | xs dense rows, numeric columns |
| `F/dashboard/src/lib/components/usage-dashboard/usage-breakdown-table.component.ts:56` | xs dense rows, numeric columns |
| `F/dashboard/src/lib/components/usage-dashboard/usage-breakdown-table.component.ts:96` | xs dense rows, numeric columns |
| `F/review-runs-ui/src/lib/components/review-findings-table.component.ts:62` | sm rows, nested details |
| `F/chat-ui/src/lib/molecules/session/plan-limits/lane-usage-tile.component.ts:234` | xs dense rows, numeric columns, nested in disclosure |

### Chat settings (13)

| Site | Needed features |
| --- | --- |
| `F/chat/src/lib/settings/output-style/output-style-list.component.ts:131` | compact rows, inline controls |
| `F/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts:92` | xs dense rows, inline controls, wide/overflow |
| `F/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:157` | xs dense rows, inline controls |
| `F/chat/src/lib/settings/ptah-ai/voice-config.component.ts:126` | xs dense rows, inline controls |
| `F/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:110` | sm rows, inline controls |
| `F/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:87` | sm rows, inline controls |
| `F/chat/src/lib/settings/ptah-ai/go-vet-consent-config.component.ts:118` | xs dense rows, inline controls |
| `F/chat/src/lib/settings/ptah-ai/elevenlabs-panel.component.ts:103` | sm rows, inline controls |
| `F/chat/src/lib/settings/pro-features/mcp-port-config.component.ts:161` | xs dense rows, inline controls |
| `F/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:134` | xs dense rows, inline controls |
| `F/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:190` | xs dense rows, inline controls |
| `F/chat/src/lib/settings/pro-features/claude-builtins-config.component.ts:267` | xs dense rows, inline controls |
| `F/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:120` | xs dense rows, inline controls |

## 3. Disclosure / collapsible section

**Total: 100 sites** (37 native `<details>`, 63 selected hand-made controlled disclosure toggles). Menus, popovers, and dropdown `<details>` are excluded; their `aria-expanded` means popup state, not section disclosure.

### Outside chat settings (84)

| Site | Needed features |
| --- | --- |
| `F/workspace-indexing/src/lib/workspace-indexing.component.html:399` | native summary/open |
| `F/chat-ui/src/lib/molecules/agent-card/agent-card-output.component.ts:279` | native summary/open, chevron/icon, nested content |
| `F/chat-ui/src/lib/molecules/turn-recap/turn-summary-tests.component.ts:141` | native summary/open |
| `F/chat-ui/src/lib/molecules/turn-recap/turn-summary-files.component.ts:175` | native summary/open, nested content |
| `F/markdown/src/lib/marked-extensions.ts:229` | native summary/open, default open |
| `F/memory-curator-ui/src/lib/components/diagnostics/memory-diagnostics-accordion.component.ts:298` | native summary/open, nested content |
| `F/memory-curator-ui/src/lib/components/diagnostics/db-health-panel.component.ts:175` | native summary/open, nested content |
| `F/machines-ui/src/lib/components/machines-view/machine-overview.component.ts:245` | native summary/open |
| `F/machines-ui/src/lib/components/machines-view/machines-intro.component.ts:49` | native summary/open |
| `F/tasks-ui/src/lib/components/task-board-header.component.ts:117` | native summary/open, nested content |
| `F/marketplace/src/lib/oauth-surface.component.ts:247` | native summary/open |
| `F/marketplace/src/lib/pages/skills/skill-detail.component.ts:352` | native summary/open |
| `F/tasks-ui/src/lib/components/board/task-list.component.ts:594` | native summary/open, nested content |
| `F/tasks-ui/src/lib/components/detail/task-detail.component.ts:295` | native summary/open, nested content |
| `F/skill-synthesis-ui/src/lib/components/skill-specs-control.component.ts:90` | native summary/open |
| `F/review-runs-ui/src/lib/findings/review-finding-card.component.ts:30` | native summary/open |
| `F/review-runs-ui/src/lib/components/review-findings-table.component.ts:75` | native summary/open |
| `F/setup-wizard/src/lib/components/generation-errors.component.ts:16` | native summary/open |
| `F/setup-wizard/src/lib/components/completion/outcome-summary.component.ts:68` | native summary/open, default open |
| `F/chat/src/lib/components/molecules/agent-card/agent-card.component.ts:84` | native summary/open, chevron/icon, nested content |
| `F/setup-wizard/src/lib/components/agent-next-steps.component.ts:121` | native summary/open, nested content |
| `F/onboarding/src/lib/shared/details-log.component.ts:93` | native summary/open |
| `F/chat/src/lib/components/molecules/notifications/install-scope-migration-notice.component.ts:113` | native summary/open |
| `F/chat/src/lib/components/molecules/notifications/install-scope-migration-notice.component.ts:131` | native summary/open |
| `F/onboarding/src/lib/proposal/new-project-intake.page.ts:268` | native summary/open |
| `F/onboarding/src/lib/proposal/stack-skill-consent.component.html:32` | native summary/open |
| `F/onboarding/src/lib/proposal/stack-skill-consent.component.html:45` | native summary/open |
| `F/onboarding/src/lib/analyze/analyze-workspace.page.ts:173` | native summary/open |
| `F/onboarding/src/lib/ready/provider-panel.component.ts:184` | native summary/open |
| `F/onboarding/src/lib/ready/provider-panel.component.ts:320` | native summary/open |
| `F/canvas/src/lib/canvas-rail/canvas-rail.component.ts:176` | controlled open, aria-expanded, chevron/icon |
| `F/canvas/src/lib/canvas-rail/canvas-rail.component.ts:270` | controlled open, aria-expanded, chevron/icon |
| `F/chat-ui/src/lib/molecules/turn-recap/turn-summary-chip.component.ts:96` | controlled open, aria-expanded, animated |
| `F/chat-ui/src/lib/molecules/session/session-stats-summary.component.html:187` | controlled open, aria-expanded, chevron/icon, compact size |
| `F/chat-ui/src/lib/molecules/session/session-stats-summary.component.html:395` | controlled open, aria-expanded, chevron/icon, compact size |
| `F/chat-ui/src/lib/molecules/tool-execution/tool-input-display.component.ts:129` | controlled open, aria-expanded, nested content |
| `F/chat-ui/src/lib/molecules/tool-execution/tool-input-display.component.ts:211` | controlled open, aria-expanded, nested content |
| `F/chat-ui/src/lib/molecules/tool-execution/tool-call-header.component.ts:92` | controlled open, aria-expanded, chevron/icon, nested content |
| `F/chat-ui/src/lib/molecules/background-agent-strip.component.ts:172` | controlled open, aria-expanded, nested content |
| `F/chat-ui/src/lib/molecules/background-agent-strip.component.ts:311` | controlled open, aria-expanded, nested content |
| `F/chat-ui/src/lib/molecules/tool-execution/code-output.component.ts:105` | controlled open, aria-expanded, nested content |
| `F/chat-ui/src/lib/molecules/thinking-block.component.ts:35` | controlled open, aria-expanded |
| `F/chat-ui/src/lib/molecules/compact-session/compact-session-activity.component.ts:681` | controlled open, aria-expanded |
| `F/chat-ui/src/lib/molecules/session/plan-limits/lane-subtotal-tile.component.ts:50` | controlled open, aria-expanded, chevron/icon |
| `F/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tile.component.ts:63` | controlled open, aria-expanded, chevron/icon |
| `F/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tile.component.ts:215` | controlled open, aria-expanded, default open, chevron/icon |
| `F/chat-ui/src/lib/molecules/session/plan-limits/lane-usage-tile.component.ts:81` | controlled open, aria-expanded, chevron/icon |
| `F/chat-ui/src/lib/molecules/session/plan-limits/lane-usage-tile.component.ts:349` | controlled open, aria-expanded, chevron/icon |
| `F/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.ts:265` | controlled open, aria-expanded, chevron/icon, compact size |
| `F/chat-ui/src/lib/molecules/session/inspector-stats/inspector-session-stats.component.ts:374` | controlled open, aria-expanded, chevron/icon, compact size |
| `F/marketplace/src/lib/smithery-surface.component.ts:484` | controlled open, aria-expanded |
| `F/tasks-ui/src/lib/components/tasks-view.component.ts:235` | controlled open, aria-expanded, nested content |
| `F/tasks-ui/src/lib/components/task-board-header.component.ts:104` | controlled open, aria-expanded, nested content |
| `F/marketplace/src/lib/external-marketplaces.component.ts:329` | controlled open, aria-expanded |
| `F/tasks-ui/src/lib/components/board/task-list.component.ts:183` | controlled open, aria-expanded, nested content |
| `F/tasks-ui/src/lib/components/detail/task-detail-header.component.ts:122` | controlled open, aria-expanded, nested content |
| `F/declarative-dashboard/src/lib/components/surface-layout.component.ts:171` | controlled open, aria-expanded, animated, compact size |
| `F/declarative-dashboard/src/lib/components/dashboard-table.component.ts:40` | controlled open, aria-expanded, compact size |
| `F/declarative-dashboard/src/lib/components/dashboard-stat.component.ts:63` | controlled open, aria-expanded, compact size |
| `F/declarative-dashboard/src/lib/components/dashboard-chart.component.ts:35` | controlled open, aria-expanded, compact size |
| `F/declarative-dashboard/src/lib/components/dashboard-list.component.ts:37` | controlled open, aria-expanded, compact size |
| `F/git-ui/src/lib/history/history-stash-section.component.ts:97` | controlled open, aria-expanded |
| `F/git-ui/src/lib/history/history-stash-section.component.ts:162` | controlled open, aria-expanded |
| `F/git-ui/src/lib/review-canvas/changed-file-tree.component.ts:162` | controlled open, aria-expanded, chevron/icon, nested content |
| `F/skill-synthesis-ui/src/lib/components/clones/clone-phase-files.component.ts:74` | controlled open, aria-expanded, nested content |
| `F/git-ui/src/lib/review-canvas/file-section-header.component.ts:175` | controlled open, aria-expanded, nested content |
| `F/chat/src/lib/components/organisms/transcript/lane-thread-row.component.ts:40` | controlled open, aria-expanded |
| `F/setup-wizard/src/lib/components/preview-decisions/diff-disclosure.component.ts:60` | controlled open, aria-expanded |
| `F/chat/src/lib/components/organisms/message-bubble.component.html:164` | controlled open, aria-expanded, animated, nested content |
| `F/chat/src/lib/components/organisms/message-bubble.component.html:282` | controlled open, aria-expanded, animated, nested content |
| `F/chat/src/lib/components/organisms/agent-monitor-panel.component.ts:300` | controlled open, aria-expanded, nested content |
| `F/chat/src/lib/components/organisms/execution/agent-execution.component.ts:72` | controlled open, aria-expanded, animated, nested content |
| `F/chat/src/lib/components/organisms/execution/agent-execution.component.ts:137` | controlled open, aria-expanded, animated, nested content |
| `F/chat/src/lib/components/organisms/execution/inline-agent-bubble.component.ts:125` | controlled open, aria-expanded, nested content |
| `F/setup-wizard/src/lib/components/analysis-transcript.component.ts:65` | controlled open, aria-expanded |
| `F/setup-wizard/src/lib/components/agent-preview-dialog.component.ts:132` | controlled open, aria-expanded, nested content |
| `F/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts:85` | controlled open, aria-expanded, chevron/icon, nested content |
| `F/chat/src/lib/components/molecules/turn/turn-disclosure-row.component.ts:55` | controlled open, aria-expanded, chevron/icon |
| `F/chat/src/lib/components/organisms/session-inspector/inspector-agents-section.component.ts:220` | controlled open, aria-expanded, nested content |
| `F/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:178` | controlled open, aria-expanded, nested content |
| `F/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:206` | controlled open, aria-expanded, nested content |
| `F/chat/src/lib/components/organisms/session-inspector/inspector-request-panel.component.ts:314` | controlled open, aria-expanded |
| `F/chat/src/lib/components/molecules/lane-event/lane-event-row.component.html:13` | controlled open, aria-expanded, chevron/icon |
| `F/chat/src/lib/components/molecules/mcp-servers-card.component.ts:19` | controlled open, aria-expanded |

### Chat settings (16)

| Site | Needed features |
| --- | --- |
| `F/chat/src/lib/settings/ptah-ai/lane-rotation-setting.component.ts:88` | native summary/open |
| `F/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts:108` | native summary/open |
| `F/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:353` | native summary/open |
| `F/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:1092` | native summary/open |
| `F/chat/src/lib/settings/providers/agents-routing-settings.component.ts:105` | native summary/open, nested content |
| `F/chat/src/lib/settings/output-style/output-style-parity-section.component.ts:62` | native summary/open |
| `F/chat/src/lib/settings/advanced-settings.component.ts:174` | native summary/open |
| `F/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts:78` | controlled open, aria-expanded |
| `F/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.component.ts:188` | controlled open, aria-expanded |
| `F/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts:102` | controlled open, aria-expanded |
| `F/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts:130` | controlled open, aria-expanded |
| `F/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.ts:191` | controlled open, aria-expanded, nested content |
| `F/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:200` | controlled open, aria-expanded |
| `F/chat/src/lib/settings/providers/decision-model-row.component.ts:168` | controlled open, aria-expanded |
| `F/chat/src/lib/settings/providers/accounts/account-detail-view.component.ts:210` | controlled open, aria-expanded |
| `F/chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:183` | controlled open, aria-expanded, nested content |

## Other missing owners

| Pattern | Count and evidence | Minimal owner |
| --- | --- | --- |
| Raw `<progress>` | 13 rendered elements; `F/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:260`, `F/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:225`, `F/chat/src/lib/components/organisms/session-inspector/inspector-task-section.component.ts:150`, `F/declarative-dashboard/src/lib/components/dashboard-progress.component.ts:29`, `F/memory-curator-ui/src/lib/components/memory-indexing-banner.component.ts:97` | Native progress, determinate/indeterminate, tone, size, accessible label |

The existing tab group, badge/status, state panel, tooltip, and stat card owners rule those patterns out of this missing-owner list.

## Recommendations

- **Warning button: build.** Add `warning` tone to `ptahButton`, supporting filled and outline variants, `xs`/`sm` sizes, disabled/loading behavior, and icon/text content. Reuse the existing alert owner for warning notices.
- **Table: build a presentational `ptah-table`.** Support semantic table markup, `xs`/`sm` density, horizontal overflow, caption/headers, and projected rows/cells. Keep sorting, selection, row actions, empty/loading states, and sticky headers optional and consumer-owned until an evidenced site needs shared behavior; these were not established as common requirements by the raw table search.
- **Disclosure: build a small section owner.** Support native/controlled open state, default open, accessible summary/controls, chevron/icon, compact size, and projected nested content. Optional animation covers existing custom collapse surfaces; keep menu and popover triggers with their current owners.

