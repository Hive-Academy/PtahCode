# Timer adoption batch plan

Source check: current `setInterval`, `formatDuration`, `formatRelative`, relative/`ago`, and `CountdownClock` uses under `libs/frontend` and `apps/ptah-extension-webview`, compared with the time inventory and proposal in TASK_2026_970_fa60. Paths below are current source paths; inventory line numbers are not used as locations. `core` is `scope:webview,type:core`; `ui` is `scope:webview,type:ui`; the listed consumer libraries are `type:feature` (some also have `platform:angular`). The webview app is `type:app`. The `@nx/enforce-module-boundaries` rules allow feature/app → ui and core, but block core → ui. Target `ClockService` means `@ptah-extension/core`; target time component/helper means `@ptah-extension/ui`. A pure helper imported into core would also be blocked.

| PR | Adoption file | Current purpose and intended adoption | Target owner | Lib tag / boundary |
|---|---|---|---|---|
| 1 | `libs/frontend/core/src/lib/services/plan-limits.store.ts` | Own 30 s reset clock; retain timestamp reset calculations and acquire coarse shared clock. | `ClockService` | core; core → core allowed |
| 1 | `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tiles.ts` | Builds reset, window, observed age, and cooldown copy; pass reset epoch through for countdown while preserving evidence/cooldown semantics. | `formatRelative`, `ptah-countdown` at rendering site | chat-ui feature; ui allowed |
| 1 | `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/lane-tiles.ts` | Reuses cooldown/reset lines for lane tiles; use shared relative formatting where equivalent. | `formatRelative` | chat-ui feature; ui allowed |
| 1 | `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tile.component.ts` | Renders reset text in plan tile; render reset deadline through countdown. **Charts track also touches its meter markup: reserve meter changes for that track and keep timer edit confined to reset text.** | `ptah-countdown` | chat-ui feature; ui allowed |
| 1 | `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card.component.ts` | Computes live elapsed text from run timestamps; pass start/end timestamps to timer, freezing completed runs. | `ptah-timer` | chat feature; ui allowed |
| 1 | `libs/frontend/chat/src/lib/components/molecules/agent-card/agent-card-header.component.ts` | Displays supplied elapsed string; host the elapsed timer without changing card layout. | `ptah-timer` | chat feature; ui allowed |
| 2 | `libs/frontend/machines-ui/src/lib/services/countdown-clock.ts` | Existing countdown API is **already** a thin `ClockService` wrapper in current code; retain for one adoption PR. | `ClockService` | machines-ui feature; core allowed |
| 2 | `libs/frontend/machines-ui/src/lib/components/remote-approval-block/remote-approval-block.component.ts` | Sole live `CountdownClock` consumer; displays deadline/approval countdown; migrate to owner countdown or shared clock and preserve expiry handling. | `ptah-countdown`, `ClockService` | machines-ui feature; ui/core allowed |
| 2 | `libs/frontend/machines-ui/src/lib/components/machines-view/machines-view.component.ts` | Own wall-time interval for machine list refresh; acquire shared clock. | `ClockService` | machines-ui feature; core allowed |
| 3 | `libs/frontend/onboarding/src/lib/analyze/generate-agents.page.ts` | Own 250 ms generation deadline countdown; derive seconds from deadline and shared clock. | `ClockService`, `ptah-countdown` where rendered | onboarding feature; ui/core allowed |
| 3 | `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts` | Own analysis elapsed interval; derive from start timestamp. | `ClockService`, `ptah-timer` where rendered | onboarding feature; ui/core allowed |
| 4 | `libs/frontend/chat/src/lib/services/voice-input.service.ts` | Own recording elapsed interval; clock-backed elapsed state from recording start. | `ClockService` | chat feature; core allowed |
| 5 | `libs/frontend/command-center/src/lib/components/command-relative-time.ts` | Local relative-age helper used by command work, node detail, and start views. | `formatRelative` | command-center feature; ui allowed |
| 6 | `libs/frontend/cron-scheduler-ui/src/lib/components/cron-format.ts` | Formats next/last run as future/past relative time; preserve unknown empty state. | `formatRelative` | cron-scheduler-ui feature; ui allowed |
| 7 | `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/storage-health-panel.component.ts` | Relative status and retention timestamps, including future dates. | `formatRelative` | memory-curator-ui feature; ui allowed |
| 7 | `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/event-feed.component.ts` | Extra local event age helper named in inventory prose; replace delta-based helper with timestamp-based owner. | `formatRelative` | memory-curator-ui feature; ui allowed |
| 8 | `libs/frontend/workspace-indexing/src/lib/workspace-indexing.component.ts` | Both local duration and verbose relative-age formatters. | `formatDuration`, `formatRelative` | workspace-indexing feature; ui allowed |
| 9 | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/scorecard-detail.component.ts` | Local completed run duration formatter. | `formatDuration` | skill-synthesis-ui feature; ui allowed |
| 9 | `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-action-gating.ts` | Local cooldown duration and clone relative-age helper; preserve null em dash. | `formatDuration`, `formatRelative` | skill-synthesis-ui feature; ui allowed |
| 10 | `libs/frontend/chat/src/lib/components/molecules/background-task-tiles/background-task-tiles-container.component.ts` | Own 1 s tile age interval. | `ClockService` | chat feature; core allowed |
| 10 | `libs/frontend/chat/src/lib/components/organisms/subagent-lane/subagent-lane.component.ts` | Own lane elapsed interval. | `ClockService`, `ptah-timer` where rendered | chat feature; ui/core allowed |
| 10 | `libs/frontend/canvas/src/lib/canvas.store.ts` | Own hidden-running-session status poll at concurrency cap; shares cadence only if visibility pause preserves cap enforcement. | `ClockService` if behavior permits | canvas feature; core allowed; behavioral exception pending parity |
| 11 | `libs/frontend/chat-streaming/src/lib/agent-monitor.store.ts` | Own permission countdown clock and expiry state transition; preserve expiry after tab returns. | `ClockService` | chat-streaming feature; core allowed |
| 11 | `libs/frontend/core/src/lib/services/boot-status.service.ts` | Own readiness watchdog that calls host `pullReadiness`; this is a retry action, not a display clock. Keep as named exception unless a separate retry scheduler is designed. | No timer UI owner | core; ui import blocked |
| 11 | `libs/frontend/core/src/lib/services/back-office-activity.service.ts` | Own idle-age display tick; acquire coarse shared clock. | `ClockService` | core; core → core allowed, core → ui blocked |
| 12 | `libs/frontend/dashboard/src/lib/utils/format.utils.ts` | Local dashboard duration and relative-age helpers; preserve long-range month/year behavior as an explicit text difference or adapter. | `formatDuration`, `formatRelative` | dashboard feature; ui allowed |
| 12 | `libs/frontend/chat/src/lib/services/session-display-utils.service.ts` | Session-list relative-date helper. | `formatRelative` | chat feature; ui allowed |
| 12 | `libs/frontend/chat-ui/src/lib/molecules/vitals/plan-ring.component.ts` | Local `resets in` text; use reset deadline owner. | `ptah-countdown`, `formatRelative` | chat-ui feature; ui allowed; **charts track touches ring/meter visuals: timer text only** |
| 12 | `libs/frontend/chat-ui/src/lib/atoms/duration-badge.component.ts` | Seventh inventory duration site currently delegates to shared `formatDurationMs`; adopt UI helper if its visible form matches, otherwise record owner format difference. | `formatDuration` | chat-ui feature; ui allowed |
| 13 | `libs/frontend/chat-ui/src/lib/molecules/session/session-stats-format.ts` | Local session duration helper used by summary, view, and compact lanes. | `formatDuration` | chat-ui feature; ui allowed |
| 13 | `libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-agent-list.ts` | Local inspector duration formatter. | `formatDuration` | chat feature; ui allowed |

The six relative helpers counted in the proposal are `session-display-utils.service.ts`, `command-relative-time.ts`, dashboard `format.utils.ts`, `cron-format.ts`, `storage-health-panel.component.ts`, and `workspace-indexing.component.ts`. `event-feed.component.ts` and `clone-action-gating.ts` are additional relative helpers explicitly present in inventory prose. The seven duration sites are dashboard `format.utils.ts`, `session-stats-format.ts`, `inspector-agent-list.ts`, `workspace-indexing.component.ts`, `scorecard-detail.component.ts`, `clone-action-gating.ts`, and `duration-badge.component.ts`. The eleven own intervals are plan limits, Machines view, two onboarding pages, voice, background task tiles, subagent lane, canvas, agent monitor, boot watchdog, and back-office activity. The old Machines `CountdownClock` is no longer a twelfth own interval.

Other `setInterval` hits are outside time-display adoption: `git-root-watch-lease.service.ts` renews a lease; `streaming-quotes.component.ts` and `typewriter.service.ts` animate content. Current `apps/ptah-extension-webview` search found no adoption interval. Additional `ago` copy in Git stash, onboarding analysis-found, Machines last-seen, provider connection overview, and resume notification is outside the enumerated inventory; assess text equivalence in later cleanup before widening these batches. Keep reset/cooldown and session duration visible text unless the owner formatter differs; record every resulting visible text change in implementation PRs. The current owner `formatRelative` emits one unit and `just now` below 10 s; dashboard month/year, indexing verbose units, and unknown/null labels need explicit parity review. The current owner `formatDuration` offers `clock` and `compact` styles; check each old formatter against both before choosing. Core must not import `@ptah-extension/ui`; use its clock signal without a private copy of the UI formatter.

| PR | Files | Libs to verify |
|---|---:|---|
| 1 | 6 | `core,chat-ui,chat` |
| 2 | 3 | `machines-ui` |
| 3 | 2 | `onboarding` |
| 4 | 1 | `chat` |
| 5 | 1 | `command-center` |
| 6 | 1 | `cron-scheduler-ui` |
| 7 | 2 | `memory-curator-ui` |
| 8 | 1 | `workspace-indexing` |
| 9 | 2 | `skill-synthesis-ui` |
| 10 | 3 | `chat,canvas` |
| 11 | 3 | `chat-streaming,core` |
| 12 | 4 | `dashboard,chat,chat-ui` |
| 13 | 2 | `chat-ui,chat` |

Each PR has at most six source write files; specs do not count. Verify with `npm run verify -- -p <listed libs>` and add `npm run verify -- -t typecheck-templates -p ptah-extension-webview` after template changes. No verification was run for this research plan.

## Revised grouping (coordinator, max 6 write files each)
- PR1: plan limits + agent card (6 files).
- PR2: machines (3) + onboarding (2) + voice (1) = 6.
- PR3: command-center, cron, memory (2), indexing, skill-synthesis scorecard-detail = 6.
- PR4: clone-action-gating, background-task-tiles, subagent-lane, agent-monitor.store, back-office-activity = 5. canvas.store.ts: own commit, behavior parity check; 6th file.
- PR5: dashboard format.utils, session-display-utils, duration-badge, session-stats-format, inspector-agent-list = 5.
- PR6: plan-ring.component.ts alone, last, after the charts track release.
- Named exception: boot-status.service.ts (accepted).
- Removal-step list (not adopted now): "ago" copies in git stash, onboarding analysis-found, machines last-seen, provider connection overview, resume notification.
