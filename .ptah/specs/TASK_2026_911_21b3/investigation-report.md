# TASK_2026_911_21b3 — Investigation report

Runtime cap hard-stop and "ended outside the spawner" root cause. Read-only investigation. Every claim cites `file:line` in this worktree. Paths are relative to the worktree root.

## Runtime cap path

1. Setting: `SESSION_CHILD_MAX_RUNTIME_MINUTES` — key `agentSessions.maxRuntimeMinutes`, fallback 120, min 5, max 720 — `libs/backend/cli-agent-runtime/src/lib/session-children/session-child-settings.ts:41-46`. `readInteger` (:94-107) maps a wrong type to the fallback and clamps out-of-range values. Settings are read fresh at every start (`session-spawner.service.ts:292`, inside `guardStart`), so a settings change applies to new children only.
2. Arming: `provisionAndStart` arms the cap right after the host start — `libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts:416`. `armRuntimeCap` (:1372-1381) starts one `setTimeout(minutes * 60_000)` through `armTimer` (:1394-1402, unref'd). There is one timer per live child and no code resets or kicks it. The clock is wall-clock: idle time and tool-wait time all count.
3. Firing — `onRuntimeExceeded`, `session-spawner.service.ts:948-968`:
   - :950-952 returns when the child is terminal or the runtime is gone.
   - :954-956 when `phaseOf(child) === 'generating'`, it calls `settle(childSessionId, 'timeout', undefined, Date.now())` first, so the in-flight turn is reported.
   - :957 sets `runtime.stopping = true`.
   - :958-962 `registry.markEnded(id, 'timed-out', ...)`. The status text is exactly `exceeded the ${minutes}-minute runtime cap (agentSessions.maxRuntimeMinutes)` — the string seen by TASK_2026_901 and the P2 child.
   - :963 `releaseResources` (:1279-1290) clears the timers and releases the permission policy and the MCP root.
   - :964 `interruptInBackground` (:1313-1327) calls `adapter.interruptSession` fire-and-forget, then releases the budget.
4. What the interrupt stops: `interruptSession` — `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts:2060-2066` — calls `sessionLifecycle.endSession`, which runs `endRecord` — `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-control.service.ts:306-398`: cleanup of pending permissions, `markAllInterrupted`, a `query.interrupt()` raced against 5 s (:352-375), then `abortController.abort()` and removal of the record (:338-339). So the cap stops the SDK query and tears down the session record. It does NOT stop the child's CLI lanes: they keep `parentSessionId` pointing at the dead child and are orphaned (`hasRunningLane`, `session-spawner.service.ts:1188-1203`). The tab, worktree and branch are kept. The record stays as terminal and is pruned only from the ended history (registry `pruneEnded`, keep 20).
5. How the parent is told: `settle` (:1004-1048) pushes `LaneCompletionNotifier.signalSessionChild` — `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-notifier.service.ts:737-838`. When the parent is not live, the spawner holds the completion (`recordDelivery`, :1051-1090) and the parent drains it later (`takeHeldCompletions`, :771-797). A timeout is reported with verdict `failed` (`sessionChildVerdictOf`, lane-completion-notifier.service.ts:192-205: every status other than `completed` maps to `failed`).

Summary: the cap is a hard, unannounced stop. No warning reaches the child, the in-flight tool call is aborted, and uncommitted work stays in the worktree with no owner.

## "Ended outside the spawner" path

1. The text is produced at `session-spawner.service.ts:937-941` inside `onGraceExpired` (:923-947): `markEnded(id, 'ended', 'ended outside the spawner: stop button, error or teardown')`.
2. The grace is armed by `onSessionEnd` (:911-921) when the SDK session ends and the spawner itself is not stopping. `SESSION_CHILD_GRACE_MS` is 30 s (:112). The grace is cancelled when the session re-registers (`onSessionIdResolved`, :862-877). On expiry: a live `activeIdOf(child)` again is harmless (:928-933); a child that `wasWorking` settles as `failed` (:934-936); otherwise it ends as `ended` (:937-941).
3. The end callback chain: `SessionEndCallbackRegistry.notifyAll` — `libs/backend/agent-sdk/src/lib/helpers/session-end-callback-registry.ts:59-79` — is fired by `endRecord` (`session-control.service.ts:389-393`) and by `disposeAllSessions` (:487-490).
4. Every code path that can end the session record, and so start this 30 s clock:
   - User stop: Stop button, `chat:abort`, `/clear` — `interruptSession`, `sdk-agent-adapter.ts:2060-2066`.
   - Any stream-loop exit: the broadcaster's `finally` block calls `endSessionIfTokenMatches` — `libs/backend/rpc-handlers/src/lib/chat/streaming/chat-stream-broadcaster.service.ts:449-454`. The comment at :432-434 says the loop is the session's ONLY consumer, so ANY exit (provider/stream error, CLI process exit, aborted query) tears down the record. No user stop needed.
   - Zero-event dead-session cleanup: chat-stream-broadcaster.service.ts:389-405.
   - NoActivityWatchdog: 180 s of UNACCOUNTED root silence aborts the query — `libs/backend/agent-sdk/src/lib/helpers/no-activity-watchdog.ts:306` (rules :10-19, :270-283); the abort runs in `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts:1625-1739`. A known tool in progress (a foreground typecheck) is accounted: the watchdog only logs "overdue" and re-arms, so it does not fire for it.
   - Config-change re-init: `requestConfigReinit` — `sdk-agent-adapter.ts:415-436` — runs `disposeAllSessions()` and tears down EVERY live session record mid-turn. No user stop needed.
   - Workspace folder close: `disposeSessionsForWorkspace` — `sdk-agent-adapter.ts:974`.
   - Compaction-dwell bound abort (query executor).
   - Slash-command record replacement: transient; the re-registration cancels the grace.
5. Can it fire without a user stop? Yes. Paths 2, 3, 4, 5, 6 and 7 all end the record without any user action.
6. Child ff1fe72e (TASK_2026_904 Wave 1) ended at 111 min with this text during a foreground typecheck. A foreground typecheck is an accounted tool, so the watchdog would only log "overdue" for it. 111 min is below the 120-min cap, so the runtime timer did not fire. Most probable cause: an abnormal mid-turn stream exit (path 2, 3, 4 or 7) or a config-change re-init (path 5) that killed the record, followed by 30 s without re-registration. Confidence: medium. Code cannot prove which one fired.
7. What cannot be proved from this worktree: the exact producer for ff1fe72e. No host logs exist inside the worktree (only `.ptah/specs/**`). The distinguishing log lines ("Session ... cleaned up after stream exit", "produced no stream activity", "Config change detected") are written outside it, and per the brief I did not search outside the worktree.

## Other session limits

1. Live-children cap: `agentSessions.maxConcurrent`, fallback 3, range 1..5 — `session-child-settings.ts:34-39`; refused as `cap-reached` in `guardStart` (`session-spawner.service.ts:293-307`) via `registry.reserveSlot` (`session-child.registry.ts:104-109`); `liveCount` :344-351.
2. Depth guard: a child cannot start children — `guardStart`, `session-spawner.service.ts:279-284` (`depth-exceeded`).
3. Permission deny window: `agentSessions.permissionDenyWindowMs`, fallback 60 s, range 0..600 s — `session-child-settings.ts:48-53`; applied by `policyFor` (`session-spawner.service.ts:1359-1370`).
4. End-grace: 30 s — `SESSION_CHILD_GRACE_MS`, `session-spawner.service.ts:112`.
5. Session budget (tokens/cost): advisory only, it never refuses a send — `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.ts:1-28`; stages tighten/handoff/limit with thresholds at `session-budget-stage.ts:130-136`. Banner: `libs/frontend/chat/src/lib/services/session-budget-actions.service.ts:41-64`. Automatic wrap-up at stage `limit`: root coordinator fires for EVERY mounted tab — `libs/frontend/chat/src/lib/services/session-auto-handoff-coordinator.service.ts:42-68`, `handoffStageReached` :309-320.
6. Auto-compact plus a compaction-dwell abort — `session-control.service.ts:708-923`.
7. NoActivityWatchdog: 180 s unaccounted silence — `no-activity-watchdog.ts:306`.
8. Lane limits: budget/duration stops — `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:465-466`; the subagent budget monitor warns, writes a handoff record, then stops — `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:19-31`; lane inactivity watchdog 60 min (`DEFAULT_INACTIVITY_TIMEOUT`, `agent-process-manager-helpers.ts:51`; `handleTimeout` kills the lane, `agent-process-manager.service.ts:2998-3035`); lane count cap `agentOrchestration.maxConcurrentAgents` default 5, max 100 — `agent-spawn-environment.service.ts:341-360`.
9. Handoff once per session — `session-handoff.service.ts:327-339`.
10. Ended-history prune: 20 kept — `session-child.registry.ts:21`, `pruneEnded` :333-342.

## Existing handoff machinery

1. Tools: `ptah_session_handoff` / `ptah_session_handoff_ack` — `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tools.ts:143-158` and `session-tool-handlers.ts:320-352` / `:395-457`.
2. The CALLER's model writes `HANDOFF.md` first: the skill `.claude/skills/session-handoff/SKILL.md:30-56`, or the inline wrap-up prompt `libs/frontend/chat/src/lib/services/session-handoff-prompts.ts:19-23` (`SESSION_HANDOFF_COMMAND = '/session-handoff'` :34).
3. `guardAndStart` — `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:283-430`:
   - :302-310 refuses a CHILD caller with code `child-session`: "a child session cannot hand off; its parent session supervises its work".
   - :634-662 `checkHandoffFile`: the handoff path must exist, be absolute and be inside an open workspace folder.
   - :341-347 adoption runs BEFORE the start is awaited: `adoptWork` (:526-562) calls `agents.adoptLanes` and `registry.reparent` for live/held children.
   - 30 s start deadline (:75, :361-373); ack record `state: 'recorded'` (:385-397); chain edge bind :742-780.
   - `acknowledgeRecord` :237-281: CAS `recorded → closePending → closeCompleted`; the predecessor is execution-stopped, then its tab is closed through `HANDOFF_PREDECESSOR_CLOSER`. The closer (`SessionHandoffCloser`, `libs/backend/rpc-handlers/src/lib/handlers/session-handoff-closer.ts`) is registered only in the Electron host — `apps/ptah-electron/src/di/phase-4-handlers.ts:110`.
   - `stopCaller` :714-740: `lifecycle.endSession` plus `turnState.forceIdle`.
4. The successor is a TOP-LEVEL session started in the caller's `cwd` (`HandoffChatSessionStartInput` has `cwd`, not `worktreePath` — `libs/backend/cli-agent-runtime/src/lib/session-children/child-chat-session-host.port.ts:39-55`), announced to webviews via `ChildChatSessionHostAdapter` (`sessionHandoff:opened` — `libs/backend/rpc-handlers/src/lib/chat/session/child-chat-session-host.adapter.ts:139-188`).
5. Session-budget banner end to end: budget stage reaches `handoff`/`limit` → banner (`session-budget-actions.service.ts:41-64`) → "Wrap up & hand off" sends `/session-handoff` or the inline prompt through the composer send path (:195-247) → the skill/tool flow above. The automatic trigger (`session-auto-handoff-coordinator.service.ts`) sends it for every mounted tab at stage `limit` when `sessionBudget.autoHandoffAtLimit` is on.
6. Can a CHILD use this? No, and the budget path dead-ends for it. The banner and the automatic trigger have no child exclusion (verified: no child check in either service), so a child at its budget limit does receive the wrap-up command — but when the child's model then calls `ptah_session_handoff`, the tool refuses with `child-session` (:302-310). On refusal the skill tells the session "Lanes and child sessions stay with this session", so nothing is handed off. Even if the refusal were lifted, the successor is a top-level session: it would not be in `SessionChildRegistry`, so it would lose slot accounting, the runtime cap, the depth guard and completion routing to the original parent.
7. Precedent inside the SDK: `SubagentBudgetMonitor` (`subagent-budget-monitor.ts:1-31`) already implements the wanted order for subagents: warn once near the limit, write the handoff record to disk BEFORE the stop, stop, then notify the parent (through the main-thread notice queue, `libs/backend/agent-sdk/src/lib/helpers/main-thread-notice-queue.ts`).

## Lane ownership and completion routing

1. Each lane records `parentSessionId`. `resolveParentSessionId` — `agent-process-manager.service.ts:2257-2287` — remaps every tracked lane's `parentSessionId` from the tab id to the real session id once known.
2. Completion: `signalLaneCompletion` (:3592-3643) → `LaneCompletionNotifier.signal` (`lane-completion-notifier.service.ts:367-407`) → a durable parent-delivery outbox (SQLite where available) drained to the live parent as an `<agent-lane-completed ...>` envelope (:248-296). Refusals: `no-parent-recorded`, `chat-runtime-unavailable`, `parent-session-not-active`, `delivery-failed`; a deleted parent is frozen with `parent-session-deleted` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-delivery/parent-envelope-store.service.ts:166`). `ptah_agent_report` uses the same transport.
3. When the parent ends or is replaced: the lanes keep running, and their completion signals stay pending in the outbox (or are held) with no live consumer — the orphaned-lane state seen after the 120-min stops.
4. Adoption machinery that already exists: `adoptLanes` — `agent-process-manager.service.ts:2303-2329` — moves every running lane whose `parentSessionId` is in `fromIds` to the successor and records it in `pendingAdoptions`; `settleLaneAdoption` :2337-2367 confirms or reverts, and a completion signal held during the adoption is sent after the settle (:3593-3599); `registry.reparent` — `session-child.registry.ts:214-229`; held child completions drain through `takeHeldCompletions` (`session-spawner.service.ts:771-797`).
5. For inheritance these must be invoked with `fromIds = [childSessionId, sdkSessionId]` of the dead child (the same pair `hasRunningLane` matches, `session-spawner.service.ts:1188-1203`) and `toSessionId` set to the successor, so lane ownership, held completions and completion routing all follow the successor with no schema change.

## Child session record

1. Fields: `SessionChildRecord` — `session-child.registry.ts:33-42` — childSessionId (tab UUID), sdkSessionId, parentSessionId, workspaceRoot, worktreePath, branch, baseRef, taskFolder, deliverables, taskId, status, pending permission, last completion, terminal status, held completion. Built in `provisionAndStart` — `session-spawner.service.ts:360-378`; worktree/branch/taskFolder/deliverables are fixed at start.
2. Statuses: `SessionChildStatus` — `session-spawner.port.ts:21-30`; terminal set `Extract<..., 'failed'|'stopped'|'timed-out'|'ended'>` (:33-36). Derived state: `statusOf` :1162-1178, `phaseOf` :1180-1186.
3. Transitions: `add`, `bindSdkSessionId`, `update`, `reparent`, `markEnded` (:300-321, idempotent, first terminal status wins), `remove`, `pruneEnded` (:333-342).
4. Persistence: in-memory only, process lifetime — `session-child.registry.ts:1-11`. Durable pieces are separate: the session-organization store (`recordOrganization`, `session-spawner.service.ts:885-909`, SQLite hosts only) and the task link from `ptah_session_link_task` (`libs/backend/session-organization/...` tools :17-72), which is stored per user OUTSIDE the repository.
5. Live-children slot accounting: `reserveSlot` :104-109, `add` :121-143, `liveCount` :344-351.
6. Parent completion turns: `settle` :1004-1048 → `signalSessionChild`; `recordDelivery` :1051-1090 keeps `heldCompletion` while the parent is not live; `takeHeldCompletions` :771-797 drains them on the parent's next `ptah_session_*` call.

## Seams for the fix

Smallest set of files/functions per required capability. All in `libs/backend/cli-agent-runtime/src/lib/session-children/` unless noted.

1. (a) Pre-cap warning to the child:
   - `session-child-settings.ts`: new warn-lead setting (for example `agentSessions.runtimeWarnMinutes`, default 10, min 0) read alongside `maxRuntimeMinutes`.
   - `session-spawner.service.ts` `armRuntimeCap` (:1372-1381): add a second, earlier timer. Deliver the warning with the same transport `send` uses (:566-611, peer message into the child session), or follow the `MainThreadNoticeQueue` precedent (`main-thread-notice-queue.ts`; used by `subagent-budget-monitor.ts:13-17`) so the warning rides the next tool result and never aborts the turn.
2. (b) Grace period:
   - Rework `onRuntimeExceeded` (:948-968): on the warn timer, mark the child "handoff requested", let the running turn finish (settle on the turn end, as :954-956 already does for `generating`), then re-arm a hard-stop timer. Reuse the `armGrace` (:1383-1392) pattern.
3. (c) Successor session in the SAME worktree and branch, same parent/task link and lane ownership:
   - New spawner path next to `provisionAndStart` (:319-428) that SKIPS `provisioner.create` — the provisioner refuses an existing branch (`child-worktree.provisioner.ts:108-110`) and an existing worktree (:128-130) — and instead reuses the record's `worktreePath`, `branch`, `baseRef`, `taskFolder`, `deliverables` and `taskId`, then follows the same `startOnHost` (:402-414) and cap-arm steps. The successor stays a CHILD record under the ORIGINAL `parentSessionId` (`registry.add`).
   - Lane ownership: call `adoptLanes(fromIds=[childSessionId, sdkSessionId], toSessionId=successor)` and `settleLaneAdoption` (`agent-process-manager.service.ts:2303-2329`, `:2337-2367`); reparent held completions (`recordDelivery`/`takeHeldCompletions`, spawner :1051-1090/:771-797). No schema change is needed (Lane ownership section, item 5).
4. (d) Parent notification:
   - Reuse `settle`/`recordDelivery` (:1004-1090) for the structured signal, plus one peer message through the send transport (:566-611) so the parent's transcript shows the succession at once.
5. (e) Last-resort stop after a failed handoff, without discarding work:
   - Keep `onRuntimeExceeded` as the final net (one re-arm after the warning): `markEnded('timed-out')` + `interruptInBackground` exactly as today. Model the reporting on `stop()` (:713-752), which already logs that the tab, worktree and branch are kept (:749). Nothing in the path deletes the worktree, and nothing must.
6. Electron-first wiring to touch: the successor announce reuses `ChildChatSessionHostAdapter` (`agentSession:opened` — `child-chat-session-host.adapter.ts:83-130`); the predecessor-child tab close needs the same `HANDOFF_PREDECESSOR_CLOSER` registration path (`apps/ptah-electron/src/di/phase-4-handlers.ts:110`), or the dead child's tab stays open after succession.
7. Spec files that must change:
   - `session-spawner.service.spec.ts` — grace block :1273-1365, runtime cap :1367-1403, guards :323-535, settle/push :693-827, held completions :829-903, stop :1169-1272, dispose :1523-1553, after-handoff :1575+.
   - `session-child-settings.spec.ts` (new setting), `session-child.registry.spec.ts` (succession transition), `session-child-contract.spec.ts` (the child contract text at `session-child-contract.ts:47-48` gains a wrap-up instruction).
   - `session-handoff.service.spec.ts` if the child refusal (:302-310) gains a spawner-issued exception.
   - `libs/backend/vscode-lm-tools/.../mcp-core/` specs: `session-tools.spec.ts`, `session-handoff-ack.tool.spec.ts`, `protocol-dispatcher.spec.ts`.
   - `agent-process-manager.service.spec.ts` (adoption of a dead child's lanes), lane-completion notifier specs (envelope source `ptah-session` successor).

## Decisions

1. Warn lead: recommend 10 minutes before the cap; deliver as a notice that never aborts the turn (notice queue / peer message), not as a send that could queue behind a long tool.
2. Successor identity: recommend a CHILD record under the original parent. It keeps slot accounting, the cap and completion routing intact. A top-level successor (the current handoff shape) would drop out of `SessionChildRegistry`.
3. Successor gets a fresh runtime cap; otherwise it re-enters the warning state at once.
4. Child handoff guard: recommend a dedicated spawner-driven succession path (seam 7c) instead of lifting the `child-session` refusal for everyone. The general tool keeps its top-level shape; the spawner owns child succession.
5. Child behavior at the warning: add one contract line to `session-child-contract.ts` (near :47-48) that reuses the wrap-up text of `session-handoff-prompts.ts:19-23`; `HANDOFF.md` default path = the record's `taskFolder`, else the worktree root.
6. Cover the `'ended'` (grace) path too: recommend yes. The same succession machinery, triggered from `onGraceExpired` instead of the cap, converts the ff1fe72e class of deaths from "work left unowned" into a handoff.
7. Electron first: the closer and announce wiring (seam 6) is verified in the Electron host; VS Code hosts keep the current behavior where the closer is absent (predecessor tab stays, work is still kept).

## Live example: host restart on 2026-11-10 (host-shutdown path)

Recorded by the orchestrator (this child session, branch `fix/session-runtime-cap-handoff`).
The app restarted at about 05:20 UTC (parent statement; lane stop time about 04:35-05:20 UTC)
while this child had three codex lanes in flight.

| Item | Observed after the restart | Evidence |
| --- | --- | --- |
| Child chat session | Survived: the transcript resumed and the tab accepted input. | This session continued. |
| Parent-child link | LOST. The host no longer lists this session as a child of 33a69d16. | Parent statement; `ptah_agent_report` returned `Delivered: No`, reason `unattributed-caller` (it was `Delivered: Yes` before the restart). |
| Child record (`SessionChildRegistry`) | LOST: the registry is in memory only (`session-child.registry.ts:6`, "TASK_2026_580 can persist them"). Slot accounting, label, task id/folder and deliverables went with it. | Code + the refusal above. |
| Runtime cap + grace timers | LOST with the record (inferred): timers live in `ChildRuntime` in the spawner. The session is now uncapped and nothing will ever settle it for the parent. | Code (`armRuntimeCap`), no record to arm from. Not observed directly. |
| Completion routing to the parent | LOST: no settle signal, no completion envelope can reach the parent for this child. | Follows from the missing record. |
| CLI lanes | All 3 running lanes STOPPED with `stopReason: host-restart`, partial edits on disk, skeleton deliverables. The lane rows and CLI session ids survived, so `resume_session_id` worked. | `ptah_agent_status` 05:27 UTC; resumes `1986ace0`, `32b7c87b`, `c702e821`. |
| Worktree, branch, uncommitted work | KEPT (39 modified, 3 new files). | `git status`. |
| Notice to the parent or the child | NONE. The child learned of the lane stops only when the user typed in its tab. | No signal in the transcript. |

Conclusion: a host shutdown loses no file, but it silently drops the parent-child link, the cap,
the completion routing and every running lane. This confirms the follow-up of decision 6b: a
persisted record per working child (session id, parent, worktree, branch, task id/folder, lane
CLI session ids) and one notice to the parent at the next host start. Lane CLI session ids
belong in that record: they made the recovery cheap here.

## Clarifications Needed

1. Host logs are needed to pin ff1fe72e's exact stream-exit producer; the distinguishing log lines are written outside this worktree. Which producer it was does not change the fix shape (seams cover all producers).
2. Should `requestConfigReinit` (config-change dispose of all sessions) also be succession-aware? Today it kills every live child mid-turn with the same "ended outside the spawner" result.
3. Retry policy for the last-resort stop: how many succession attempts before `onRuntimeExceeded` fires? Recommend one retry, then the current hard stop.
4. Should the runtime cap clock keep counting idle time (today it does), or only active time? A cap that counts idle time can fire while the child only waits on a lane.
