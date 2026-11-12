# Badge adoption batch 1

Worktree: `ui-badge-adopt-1`. Owner: `PtahBadgeDirective` from `@ptah-extension/ui`. Existing semantic content, OnPush, and signals were retained. Family 3 styling changes are intentional under the inventory mapping; no rendered visual review was available in this lane.

| Group 1 file (under `libs/frontend/chat/src/lib/components/`) | Change | DOM delta |
|---|---|---|
| `atoms/workflow-badge.component.ts` | Neutral soft sm badge; updated class assertion spec. | Span retained; owner data attributes replace badge classes. |
| `file-suggestions/suggestion-option.component.ts` | Accent, info, and neutral soft xs badges. | Spans retained; owner data attributes replace badge classes. |
| `molecules/agent-card/agent-card-header.component.ts` | Neutral outline/soft metadata and dynamic status tone. | Spans retained; owner data attributes replace badge classes. |
| `molecules/execution-header/execution-header.component.ts` | Neutral soft sm account badge. | Span retained; owner data attributes replace badge classes. |
| `molecules/lane-event/lane-event-row.component.html` | Neutral soft sm attachment badges; owner imported by companion component. | Spans retained; owner data attributes replace badge classes. |
| `molecules/notifications/resume-notification-banner.component.ts` | Warn soft/outline xs badges. | Spans retained; owner data attributes replace badge classes. |
| `molecules/peer-session-send/peer-session-send-dialog.component.ts` | Dynamic reachability tone plus info/err outcome badges. | Spans retained; owner data attributes replace badge classes. |
| `molecules/session-filter-bar/session-filter-bar.component.ts` | Neutral soft xs count badge. | Span retained; owner data attributes replace badge classes. |
| `organisms/agent-monitor-panel.component.ts` | Neutral and warn soft counts and permission badges. | Spans retained; owner data attributes replace badge classes. |
| `organisms/execution/inline-agent-bubble.component.ts` | Metadata and state badges mapped to neutral/info/ok/warn/err tones, outline where present. | Spans retained; owner data attributes replace badge classes. |
| `organisms/execution/monitor-card.component.ts` | Neutral soft xs lifespan badge. | Span retained; owner data attributes replace badge classes. |
| `organisms/execution/send-message-chip.component.ts` | Info/ok/err/warn soft xs status badges. | Spans retained; owner data attributes replace badge classes. |
| `organisms/execution/subagent-tile.component.ts` | Left raw: permission action is a button, and the owner selector accepts only `span[ptahBadge]`; changing it to a span would remove button behavior. | None. |
| `organisms/execution/task-card.component.ts` | Dynamic status class changed to typed badge tone; updated class assertion spec. | Span retained; owner data attributes replace badge classes. |
| `organisms/message-bubble.component.html` | Neutral soft sm file and image badges; owner imported by companion component. | Two `div` hosts changed to `span` for the directive, retaining flex layout and children. |

Baseline: ran `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts --update-baseline` successfully. It reported 0 tokens over baseline and pruned badge entries from the 14 migrated files; the raw `subagent-tile.component.ts` entry remains. `file-tag.component.ts` and all other untouched raw files remain in the baseline. Baseline diff is 84 deletions and 2 additions (the latter are JSON closing lines, not count increases).

Verification: `git diff --check` passed. Scoped Ptah diagnostics was unavailable because its provider workspace root is the other worktree. `npm run verify -- -t test -p @ptah-extension/chat` queued behind other runs, acquired a slot, and was stopped after roughly two minutes without a result (exit 1 from interruption). No build, serve, e2e, typecheck templates, or workspace-wide check was run. CLI skill invocation was unavailable in this lane (no Skill tool exposed).

