# Lane B brief: first-turn recovery for all unattended lineages, child cap freeze, child outcome (batches 11, 12, 13, 25)

Read lane-brief-common.md first. Your project: cli-agent-runtime (libs/backend/cli-agent-runtime) and, for batch 25 only, the shared type files
named below. Prefixes: S = libs/backend/cli-agent-runtime/src/lib/session-children/, L = .../cli-agents/, RT = libs/backend/cli-agent-runtime/src/lib/.
Lane A edits agent-sdk and rpc-handlers in parallel; do not edit them. Consume the cause contract in lane-brief-common.md.

Write set (exclusive; include specs): S/handoff-watchdog-recovery.ts, S/session-spawner.service.ts, S/session-child.registry.ts,
S/session-child-succession.ts, S/session-child-first-turn.watchdog.ts, S/session-child-outcome.ts, S/session-spawner.port.ts,
S/child-chat-session-host.port.ts (only if needed), L/lane-completion-result.ts, RT/wiring/agent-events.ts, RT/di/register.ts (only if needed),
libs/shared/src/lib/types/agent-messaging.types.ts, libs/shared/src/lib/types/agent-process.types.ts (optional notice/receipt fields only,
additive). Do NOT edit session-handoff.service.ts ack paths or the batch 24 files.

## Required behavior

1. First-turn recovery (batch 11 recovery part + batch 12). Today `HandoffWatchdogRecovery` (Fix C, TASK_2026_2288) retries ONLY top-level handoff
   successors and only on cause `no-activity-timeout`; it skips session children (`isSessionChild`). Extend the single-retry owner so one retry is
   available for: top-level successors, initial child sessions and child successors. Consume the typed end (`provider-no-response`, legacy
   `no-activity-timeout`). Atomically reserve exactly one retry for the logical first turn (key: lineage, startup generation, input id), then wait the
   existing 5 s teardown delay. Eligibility requires `payload.zeroOutwardEvents === true`, zero settled turns, no observed tool execution or
   partial output, and a confirmed ended attempt. Never replay on an ambiguous failure. Recover with the first input plus Ptah-labeled context
   (`formatWatchdogRetry()`; keep the recovery sender label "Ptah recovery") using the child start contract if no SDK ID is bound, else verified resume.
   The child spawner's 30 s end-grace and the 120 s first-turn probe must recognize the reserved retry and skip duplicate succession/settlement while
   the retry owns recovery; the probe stays advisory while liveness is uncertain. Abort a scheduled retry on explicit close, stop or ownership change.
   A second failure, an ineligible case, or an unsupported host settles ONCE and reports to the parent's verified lineage with
   `formatWatchdogFinalFailure(id)` or `formatWatchdogNoSafeRetry(id)` (top-level without parent: existing UI/log path). Replace the hard-coded
   "no stream activity for 180 s (no-activity watchdog...)" text in session-spawner `endOutside` and `session-child-outcome.ts` with Ptah-labeled
   shared copy; keep historical `no-activity-timeout` outcome readable.
2. Child runtime cap (batch 12). At cap + grace there must be NO forced interrupt, no `interruptInBackground(..., 'runtime-cap')`, no `hostSucceed(child,
   'runtime-cap-interrupted')` kill path (find `onHandoffGraceExpired`, `armRuntimeCap`, `armHandoffGrace`). Instead: set the P1 tool disposition so new
   non-handoff tools get a Ptah-labeled deny, hold host sends to that child with a Ptah-labeled refusal, mark the child paused-not-failed in the
   registry/outcome, publish ONE parent notice (`formatChildPauseNotice` / `formatAgentActionNotice` with childSession: true), keep the live session,
   lane ownership, notes and worktree intact, and let the child return normally (a handoff request already queued can finish when it next runs).
   The seam is `SessionToolDispositionRegistry` / `registerSessionToolDispositionFeed` in agent-sdk (`libs/backend/agent-sdk/src/lib/helpers/session-tool-disposition.port.ts`,
   RT/di/register.ts line ~165). Look at how it is exposed to the runtime and set `{phase:'paused', notice}` for the child's trusted tab and SDK ids; clear
   it on end/dispose/resume. At cap minus warn lead use `formatChildRuntimeAsk` for the ask. Failed successor start or exhausted succession allowance
   must also leave the live session reachable and produce one parent escalation.
3. Child outcome (batch 13). `session-child-outcome.ts` and the registry must distinguish a live paused child from an actual failure, keep prior outcomes
   readable, keep end grace, prestart cancel and explicit user stop behavior unchanged.
4. Optional visible progress (batch 25): additive optional `notice` (AgentActionNotice) and receipt fields on the child/lane completion result and
   events so the notice survives IPC/persistence without overloading the terminal outcome. Keep this small and additive.
5. Specs: handoff-watchdog-recovery (successor, child, child successor, eligibility, one retry, cancellation), session-spawner start-guard/succession
   specs (no kill at cap+grace, pause state, parent notice once, grace skip when retry owns recovery), session-child-outcome, registry, lane-completion-result.

## Out of scope for lane B
agent-sdk, rpc-handlers, vscode-lm-tools, webview. ptah_session_handoff_ack stays as is (predecessor ended with 'parent-stop').
Status file: .ptah/specs/TASK_2026_2297_920a/status-laneB.md
