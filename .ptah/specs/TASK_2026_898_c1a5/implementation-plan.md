# Implementation Plan — TASK_2026_898_c1a5

## Scope and evidence

Phase A ships before Phase B. AC1–AC10 in `task-description.md` are binding; user decisions 8–9 in `decisions.md` settle cleanup and session history. No production code is written by this plan.

Manual close today runs through `TabManagerService.closeTab` (`libs/frontend/chat-state/src/lib/tab-manager.service.ts:1491-1593`): it removes the open tab at `:1558-1561` and emits the close event at `:1574-1579`. For an active tab, `closeTabAcrossWorkspaces` calls it but does not await it (`:1615-1622`). `ClosedTabSessionEnderService` listens for that event and sends `chat:abort` when the session is orphaned (`libs/frontend/chat/src/lib/services/closed-tab-session-ender.service.ts:39-64`). Previous Sessions independently draws `view.filteredSessions()` (`libs/frontend/chat/src/lib/components/organisms/previous-sessions/previous-sessions-modal.component.ts:211-223`); manual close does not remove a persisted session row or move it out of Done. Per user decision 9, an acknowledged predecessor receives exactly this manual-close behavior: its tab/execution close, while an existing Done row may remain and lineage stays in the stats sidebar tree. This is the accepted interpretation of AC3's conflicting ordinary-row wording; add no handoff-specific filter, archive, or deletion.

## Phase A — handoff acknowledgement and close

### Components, verified contracts, and flow

1. In `cli-agent-runtime`, persist a successful handoff record keyed by predecessor tab/SDK ID, successor tab/SDK ID, canonical workspace root, and canonical `HANDOFF.md` path. Persist after successor start/adoption commit (`session-handoff.service.ts:294-315`), then bind successor SDK ID when resolved (`:628-651`). Keep the record through partial close/restart.
2. Register Zod-validated MCP `ptah_session_handoff_ack` in `vscode-lm-tools`' protocol dispatcher. Input: `{successorSessionId, predecessorSessionId, handoffPath}`; server derives actual caller identity and matches it to the recorded successor and exact predecessor/path. Return `closed|already-closed|retryable-failure|refused` with safe reason. Add `session:handoffAck` to `libs/shared/src/lib/types/rpc.types.ts`, allowlist and session RPC handler only for the host/UI close bridge. No supplied tab ID can select an unrelated tab.
3. The ack service sets `acknowledged/closePending` durably, then requests close of the exact bound predecessor tab via an awaitable `TabManagerService` facade that reuses `closeTab` and checks the expected session. Its `onTabClosed` listener sends `chat:abort`; verify backend stop separately and await `endSession`/idle if there is no tab. Mark `closeCompleted` only after tab and execution both stop. Use the same path for automatic and manual handoffs; adjust `AutoHandoffSourceCloserService` to react to ack, not merely creation. Keep successor/adopted work untouched.
4. Move `armCallerStop` at `session-handoff.service.ts:299` behind ack. The current flush handler and `stopCaller` at `:568-616` may provide a safe post-ack stop boundary but must never stop an unacknowledged predecessor. If ack arrives during its turn, persist pending and stop at flush; if already flushed, close immediately. Update `.claude/skills/session-handoff/SKILL.md` to require reading the exact file, accepting adopted work, invoking ack, checking the result, retrying failure, and offering manual close fallback.

### Failure, retry, idempotency

Use one durable pair record and compare-and-set close state. Concurrent/repeated acks join the same attempt. A failed UI close, abort or backend stop leaves `closePending`; retry/restart resumes only unfinished steps. Recheck tab/session binding before close. Missing file, failed handoff, wrong caller, wrong pair or path refuse without side effects. A fire-and-forget tab request is never recorded as success. Retain the predecessor record and adopted work after failures.

### File-level change list and projects

| Path | Change | Purpose |
| --- | --- | --- |
| `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts`, `session-handoff.port.ts` | modify | Durable pair, ack, delayed stop contract. |
| `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts` | new | Persistent close checkpoint. |
| `libs/backend/cli-agent-runtime/src/lib/di/tokens.ts`, `registration.ts` | modify | tsyringe registration. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts` and adjacent `session-handoff-ack.tool.ts` | modify/new | Zod MCP entry. |
| `libs/shared/src/lib/types/rpc.types.ts`; `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts` | modify | Typed bridge/allowlist. |
| `libs/frontend/chat-state/src/lib/tab-manager.service.ts` | modify | Awaitable exact-binding manual close. |
| `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts` | modify | Ack-triggered close for both handoff types. |
| `.claude/skills/session-handoff/SKILL.md` | modify | Successor instructions. |

Projects for scoped `npm run verify -- -p ...`: `@ptah-extension/cli-agent-runtime`, `@ptah-extension/vscode-lm-tools`, `@ptah-extension/shared`, `@ptah-extension/rpc-handlers`, `@ptah-extension/chat-state`, `@ptah-extension/chat`, `ptah-electron`, and CLI composition if affected. Split into file-disjoint batches of ≤6 files: backend record/DI; MCP/RPC; UI close; skill/specs. Update the four Electron host DI guards (`apps/ptah-electron/src/di/container.smoke.spec.ts`, `expected-resolvable.ts`, `rpc-surface.spec.ts`, `surface-composition.spec.ts`) when adding services or RPC.

## Phase B — task lifecycle and close-out

### Components, verified contracts, and flow

1. **Review and merge hook:** orchestration skill confirms `gh pr create` yielded an open PR with bounded `gh pr view --json state,mergedAt,headRefName,baseRefName,url`, then uses existing `ptah_task_update` to set `in_review`. A host task-scoped PR reconciler runs at startup and task-index changes to catch already-open PRs. While a task remains `in_review`, it also checks that task's PR every 5 minutes (and on git-watcher fetch/HEAD events when available). One scheduler timer per host tracks due times for the set of in-review tasks; there is no timer per task or UI row. Unavailable lookups back off exponentially to a 1-hour ceiling and reset on success. Only `in_review` tasks enter the periodic set, bounding `gh` calls. Use typed `GitInfoService.readPrStatus`/GitHub CLI adapter (Electron composition `task-end-hook-composition.ts:165,494`), match exact task branch and base main, and change only carrier `status:` via `TaskWriterService`. Failed PR creation/lookup, push, and CI never mark done. A PR closed without merge reports `closed-unmerged` and leaves carrier status unchanged; the user/orchestrator chooses `in_progress` or `cancelled`. Confirmed reviewed merge sets `done` and enqueues that task's close-out run in the background. The reconciler is the automatic post-merge hook.
2. **Explicit entry and retry:** MCP `ptah_task_close_out {taskId,workspaceRoot}` validates Zod input/root, confirms merged PR, returns accepted run ID. `ptah_task_close_out_status {runId}` reports separate memory, learning and cleanup outcomes (`pending|running|succeeded|skipped|failed|blocked`, reason, retryable). Add shared `task:closeOut`/`task:closeOutStatus` RPC types and handler only if UI calls it. `/close-task` orchestration step invokes the same task-keyed run after merge, polls status, and provides a manual retry path.
3. **Manual cleanup hook:** `ptah_task_cleanup_completed` records an explicit task-scoped “agent cleaned up a task” event. Close-out invokes the same hook after cleanup evaluation, including pending/blocked; manual callers receive its result. Evaluation never claims deletion.
4. **Learning owner:** reuse task-end hook `CloseCurateStep`, `HarvestStep`, `DisposeEvaluateStep`, journal and worker. Electron curation/harvest ports already call `MemoryTriggerService.curateSessionForTaskEnd` and `SpecHarvesterService.harvestTask` (`task-end-hook-composition.ts:223-250`). `TaskEndTransitionDetector` observes status/startup (`:203-212,393-448`) but must defer task-specific costly steps until the reconciler confirms reviewed merge and starts close-out, or an explicit close-out/manual learning request confirms that merge. One task-keyed journal run owns all steps; no parallel early terminal-status learning. `DisposeEvaluateStep` evaluates only, never deletes.
5. **Every relevant automatic Stop/boot caller:** `SkillTriggerService.start` registers Stop (`skill-trigger.service.ts:69-72`), `onStop` schedules spec harvest (`:90-94`), and `scheduleHarvest/fireHarvest` calls auto `harvester.harvest` (`:143-161`). Remove this chain; retain SubagentStop/PostToolUse/prompt telemetry (`:59-68,96-141`). Electron boots task-end hook (`apps/ptah-electron/src/activation/task-end-hook.activation.ts:66-69`): keep observation/reconciliation, gate its task-specific harvest/learning until confirmed merge enqueues close-out or an explicit manual request. `MemoryTriggerService` Stop registration (`memory-trigger.service.ts:296-298`), turn-complete curation (`:529-552`), and boot scan (`:322,1326-1443,1554-1566`) remain unchanged: they curate all chat sessions, including sessions with no task. Close-out additionally calls its existing task-scoped `curateSessionForTaskEnd` through the Electron port. Existing manual `skillSynthesis:harvestSpecs` RPC (`rpc.types.ts:2569`) remains explicit; `harvestTask` skips incomplete tasks (`spec-harvester.service.ts:207-225`).
6. **Opt-in cleanup:** host settings key `taskCloseOut.autoRemoveMergedWorktreeAndBranch` in `~/.ptah/settings.json` (existing task-end setting pattern in `task-end-hook-config.ts:7-11`), default `false`. Off means `pending-approval` awaiting per-task approval, while memory/learning proceed. On: write-capable Git cleanup port with Electron and CLI adapters, separate from task-end's read-only Git runner. Resolve canonical path under task worktree area; reject main/current/foreign worktree or active bound session. Check exact task branch, `git status --porcelain` clean (including untracked), `git merge-base --is-ancestor <branch> main`, confirmed merged PR; recheck immediately before `git worktree remove -- <path>` then `git branch -d -- <branch>`. Use argument arrays/timeouts, no force. Partial removal checkpoints retry only remaining branch deletion. Git watcher's vanished-worktree prune (`git-watcher.service.ts:984-1044`) remains unrelated.
7. Update `.claude/skills/orchestration/SKILL.md`, `references/task-tracking.md`, `references/git-standards.md` for PR/status/merge reconciliation, post-merge close-out, manual hook and pending approval. Update `CLAUDE.md:62-63,97-98` to recognize the user's explicit opt-in setting as standing cleanup authorization under the clean+merged checks; otherwise per-task approval is required.

### Failure, retry, idempotency

Persist one run per canonical repository/task/merged PR identity, with per-step state before dispatch. Concurrent calls join it. Completed learning/curation never reruns; failed steps retry independently. Keep the harvester's already-harvested marker and add a durable synthesis checkpoint where needed. Bound GitHub read calls with timeout/backoff; unknown PR state blocks status/cleanup. The cleanup event is idempotent and distinct from actual removal. Report partial failure without secrets.

### File-level change list and projects

| Path | Change | Purpose |
| --- | --- | --- |
| `libs/backend/task-end-hook/src/lib/trigger/task-end-transition-detector.ts`, `worker/task-end-run-worker.ts` | modify | Observe status; gate work on the merge hook or explicit request. |
| `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.ts`, `task-pr-reconciler.service.ts` | new | Background run and PR lifecycle. |
| `libs/backend/task-end-hook/src/lib/persistence/task-end-store.interface.ts`, `sqlite-task-end.store.ts` | modify | Durable per-step/event checkpoint. |
| `libs/backend/task-end-hook/src/lib/ports/pr-status.port.ts`, `git-cleanup.port.ts` | modify/new | Typed PR and write-capable Git boundary. |
| `libs/backend/task-end-hook/src/lib/config/task-end-hook-config.ts`, `di/tokens.ts`, `di/register.ts`, `src/index.ts` | modify | Setting and tsyringe exports/registration. |
| `libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.ts` | modify | Separate evaluation/removal outcomes. |
| `apps/ptah-electron/src/di/task-end-hook-composition.ts`, `activation/task-end-hook.activation.ts` | modify | Host ports and explicit worker trigger. |
| `libs/backend/platform-electron/src/git/task-cleanup.adapter.ts`, `libs/backend/platform-cli/src/git/task-cleanup.adapter.ts` plus each root `src/registration.ts` | new/modify | Host Git adapters. |
| `libs/backend/skill-synthesis/src/lib/triggers/skill-trigger.service.ts`, `spec-harvester.service.ts` | modify | Remove Stop harvest; preserve explicit path. |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts` plus adjacent `task-close-out.tools.ts` | modify/new | Zod MCP tools. |
| `libs/shared/src/lib/types/rpc.types.ts`, `libs/backend/rpc-handlers/src/lib/handlers/task-rpc.handlers.ts` | modify/new | Typed optional UI surface/allowlist. |
| `.claude/skills/orchestration/SKILL.md`, `references/task-tracking.md`, `references/git-standards.md`, `CLAUDE.md` | modify | Workflow and authorization text. |

Projects and ≤6-file disjoint batches are specified below. The current worktree contains no `apps/ptah-extension-vscode` or `libs/backend/platform-vscode` tree (Ptah file search returned zero), so there are no VS Code host composition files by path to schedule here. Do not invent paths or silently claim VS Code registration; when that host is restored, add its actual composition and four guard paths as a separately scoped host-compatibility batch before shipping the shared RPC surface. The present host guard paths are Electron's `apps/ptah-electron/src/di/container.smoke.spec.ts`, `expected-resolvable.ts`, `rpc-surface.spec.ts`, `surface-composition.spec.ts`, and CLI's `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`, `src/lib/surface-composition.spec.ts`.

Each row names its complete file ownership (relative to repository root); no file appears in two batches. New spec files listed in the AC table belong to the project batch for their implementation file, or to a dedicated test batch if the team leader runs tests separately. The verify command is scoped to only that row's projects.

| Batch | Files (≤6) | Scoped verify |
| --- | --- | --- |
| B1 lifecycle journal | `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.ts`; `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.ts`; `libs/backend/task-end-hook/src/lib/trigger/task-end-transition-detector.ts`; `libs/backend/task-end-hook/src/lib/worker/task-end-run-worker.ts`; `libs/backend/task-end-hook/src/lib/persistence/task-end-store.interface.ts`; `libs/backend/task-end-hook/src/lib/persistence/sqlite-task-end.store.ts` | `npm run verify -- -p @ptah-extension/task-end-hook` |
| B2 ports/registration | `libs/backend/task-end-hook/src/lib/ports/pr-status.port.ts`; `libs/backend/task-end-hook/src/lib/ports/git-cleanup.port.ts`; `libs/backend/task-end-hook/src/lib/config/task-end-hook-config.ts`; `libs/backend/task-end-hook/src/lib/di/tokens.ts`; `libs/backend/task-end-hook/src/lib/di/register.ts`; `libs/backend/task-end-hook/src/index.ts` | `npm run verify -- -p @ptah-extension/task-end-hook` |
| B3 host cleanup | `libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.ts`; `apps/ptah-electron/src/di/task-end-hook-composition.ts`; `apps/ptah-electron/src/activation/task-end-hook.activation.ts`; `libs/backend/platform-electron/src/git/task-cleanup.adapter.ts`; `libs/backend/platform-electron/src/registration.ts`; `libs/backend/platform-cli/src/git/task-cleanup.adapter.ts` | `npm run verify -- -p @ptah-extension/task-end-hook @ptah-extension/platform-electron @ptah-extension/platform-cli ptah-electron` |
| B4 CLI/learning/MCP | `libs/backend/platform-cli/src/registration.ts`; `libs/backend/cli-engine/src/lib/container.ts`; `libs/backend/skill-synthesis/src/lib/triggers/skill-trigger.service.ts`; `libs/backend/skill-synthesis/src/lib/spec-harvester.service.ts`; `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts`; adjacent `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/task-close-out.tools.ts` | `npm run verify -- -p @ptah-extension/platform-cli @ptah-extension/cli-engine @ptah-extension/skill-synthesis @ptah-extension/vscode-lm-tools` |
| B5 RPC/Electron guards | `libs/shared/src/lib/types/rpc.types.ts`; `libs/backend/rpc-handlers/src/lib/handlers/task-rpc.handlers.ts`; `apps/ptah-electron/src/di/phase-4-handlers.ts`; `apps/ptah-electron/src/di/container.smoke.spec.ts`; `apps/ptah-electron/src/di/expected-resolvable.ts`; `apps/ptah-electron/src/di/rpc-surface.spec.ts` | `npm run verify -- -p @ptah-extension/shared @ptah-extension/rpc-handlers ptah-electron` |
| B6 surface/docs | `apps/ptah-electron/src/di/surface-composition.spec.ts`; `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`; `libs/backend/cli-engine/src/lib/surface-composition.spec.ts`; `.claude/skills/orchestration/SKILL.md`; `.claude/skills/orchestration/references/task-tracking.md`; `.claude/skills/orchestration/references/git-standards.md` | `npm run verify -- -p ptah-electron @ptah-extension/cli-engine` |
| B7 policy/specs | `CLAUDE.md`; `libs/backend/task-end-hook/src/lib/close-out/task-close-out.service.spec.ts`; `libs/backend/task-end-hook/src/lib/close-out/task-pr-reconciler.service.spec.ts`; `libs/backend/task-end-hook/src/lib/worker/task-end-run-worker.spec.ts`; `libs/backend/task-end-hook/src/lib/steps/dispose-evaluate.step.spec.ts`; `libs/backend/skill-synthesis/src/lib/triggers/skill-trigger.service.spec.ts` | `npm run verify -- -p @ptah-extension/task-end-hook @ptah-extension/skill-synthesis` |
| B8 boundary/specs | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/task-close-out.tools.spec.ts`; `libs/backend/platform-electron/src/git/task-cleanup.adapter.spec.ts`; `libs/backend/platform-cli/src/git/task-cleanup.adapter.spec.ts`; `apps/ptah-electron/src/activation/task-end-hook.activation.spec.ts`; `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/task-cleanup-completed.tool.spec.ts` | `npm run verify -- -p @ptah-extension/vscode-lm-tools @ptah-extension/platform-electron @ptah-extension/platform-cli ptah-electron` |

## Acceptance-criteria test plan

| AC | Spec and assertion |
| --- | --- |
| 1 | `session-handoff.service.spec.ts`: exact file/pair survives start; adopted lanes/children usable before ack. |
| 2 | `session-handoff-ack.tool.spec.ts`: wrong caller/pair/path or failed/missing record refuses close. |
| 3 | `tab-close-session-end.integration.spec.ts`, `previous-sessions-modal.component.spec.ts`: manual path, no tab/execution; persisted Done row follows existing manual-close behavior; tree preserved; repeated ack same result. |
| 4 | `session-handoff-ack.service.spec.ts`: partial failure persists and retries after restart without losing adopted work. |
| 5 | `task-pr-reconciler.service.spec.ts`: confirmed PR/startup sets only status line; failed PR does nothing; in-review polling is bounded. |
| 6 | `task-pr-reconciler.service.spec.ts`: push/CI no done; reviewed merge sets done and enqueues one close-out; closed-unmerged leaves status unchanged. |
| 7 | `task-close-out.service.spec.ts`, `task-end-run-worker.spec.ts`: distinct outcomes, background run and step idempotence. |
| 8 | `skill-trigger.service.spec.ts`, `task-end-hook.activation.spec.ts`: no automatic skill harvest at Stop/boot or terminal carrier transition; skill telemetry retained; explicit task harvest and incomplete skip. Existing memory-curator Stop/boot tests remain valid and unchanged. |
| 9 | `task-cleanup.adapter.spec.ts`, `dispose-evaluate.step.spec.ts`: off/dirty/unmerged/foreign/current blocked; authorized clean removal and partial retry. |
| 10 | `task-cleanup-completed.tool.spec.ts`: manual and close-out share one event, failure reported/retried. |

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Move immediate stop behind acknowledgement; flush only after ack. | Keep, move, both. | `session-handoff.service.ts:299,568-616` races ack. | Yes. |
| Use exactly manual tab close and its current list behavior. | Manual path; new archive/delete/group/filter. | User decision 9; `tab-manager.service.ts:1558-1579`; Previous Sessions `view.filteredSessions()` at `previous-sessions-modal.component.ts:216-223`. | Yes. |
| Skill PR step plus startup host reconciliation. | Skill; host; both. | Gate review note 1; existing `ptah_task_update`. | Yes. |
| GitHub PR status gates explicit task-end run. | Git watcher; `gh`; orchestration watch. | Existing PR adapter; terminal carrier hook can learn early. | Yes. |
| Reconciler starts background close-out on confirmed merge; MCP command and common cleanup-completed hook provide manual retry. | Hook; tool only; both. | User requested background hook after merge; AC7, AC10 need observable common result. | Yes. |
| Opt-in setting off, clean and merged safety checks. | Per-task; opt-in; unconditional. | User decision 8; `CLAUDE.md:62-63,97-98`. | Yes before deletion. |
| Leave closed-unmerged carrier unchanged and report outcome. | Reopen; cancel; leave unchanged. | A closed PR may be intentionally abandoned; reviewer finding 4. | Yes. |

## Clarifications Needed

None. User-reserved choices were settled in `decisions.md` rows 8–9.

## Revision log

1. Kept automatic memory curation on Stop and boot; close-out adds task-specific curation, and memory-curator is no longer a changed project.
2. Made the in-review PR reconciler a bounded periodic merge hook that sets done and starts background close-out; manual entry remains for retry.
3. Removed special Previous Sessions row handling; documented manual-close list behavior and the accepted AC3/decision 9 interpretation.
4. Left carrier status unchanged for closed-unmerged PRs and made the outcome visible.
5. Added explicit ≤6-file Phase B batches with scoped verify projects and named the available Electron/CLI composition files; documented that VS Code host composition paths are absent from this worktree.
