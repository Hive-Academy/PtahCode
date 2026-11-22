# TASK_2026_2297_920a — Replace automatic agent stops with cooperative handoff

## User requirement (2026-11-21, verbatim intent)

"I need to prevent all of those automatic stops unless they are handled properly. A stopped subagent
should be part of a workflow where we never need to call the stop call ourselves. It should be a
workflow that starts before it reaches that threshold and hands off its work, rather than a weird stop
that breaks everything. This should never happen in our handoff workflow or subagent/lane context and
budget management. Messages should be very clear about the reason. The checks should not be proactive
kills but declarative: the system knows when the subagent is consuming its limits and asks it to hand
off and finish its work normally, but never hard-closes it in the middle of its work while even the
main agent has no clue what is going on."

User decision (AskUserQuestion): **Pause, never kill.** No hard stop remains. When an agent ignores
the handoff request and passes a high ceiling (for example 2x budget), Ptah blocks NEW tool calls with
a clear Ptah-labeled message telling the agent to write notes and return. The agent stays alive, the
parent is told, and a person decides the rest.

## Observed failures that motivate this (same day)

1. Subagent budget monitor: after the notes phase completed, Ptah called `Query.stopTask()`
   (`warning-notes-complete; forced stop`) on a backend-developer subagent that had finished its code
   and was writing its final report. The SDK labels every stopTask "stopped by user".
2. Right after that stop, a parent tool call came back with the SDK stock text "The user doesn't want
   to take this action right now. STOP what you are doing and wait for the user..." The parent model
   obeyed and stopped. Ptah only logs this (`session-query-executor.service.ts` ~287) and tells the
   model in the handoff message to retry Read/Glob once (`subagent-handoff-message.ts:131`).
3. No-activity watchdog (`no-activity-watchdog.ts`, 180 s; background task quiet 600 s; compaction
   dwell 300 s) aborted child session b8d9fca1 ~3.5 min after it armed a 30-minute `Monitor` watch.
   The child stayed dead (Fix C of TASK_2026_2288_5a47 retries only top-level handoff successors).
4. Child sessions' `ptah_agent_report` was refused (`unattributed-caller`, `parent-session-not-active`).

## Goals

- No `stopTask` / abort in any normal budget or handoff path. Thresholds ask; the agent returns
  normally with a structured handoff result; the parent continues from it.
- Last resort = pause (block new tool calls with a clear Ptah reason), never kill.
- Watchdog: open watches (Monitor, background tasks, lane waits) count as accounted activity.
  A real provider hang gets a clear reason; unattended sessions (successors AND child sessions)
  recover or report to the parent and never stay dead silently.
- One reason vocabulary. Ptah never shows the SDK's "the user" wording for a Ptah decision.
- Electron host first. Keep CLI lanes, platform-cli and cli-engine working.
</content>
</invoke>

## User decisions on the plan (2026-11-21, coordinator session)

- Delivery: phased PRs. The coordinator session acts for the user: it starts child sessions per
  phase, creates PRs, reads review status, acts on findings and merges (`gh pr merge --merge`).
- Pause ceiling: 2x the existing `agentBudget.*` keys (ask at `warnRatio`, pause at 2x).
- APPROVED: CLI lane inactivity timeout and repeat-call stop become ask-then-pause (no kill).
- APPROVED: child session runtime cap + grace freezes new tools and holds sends (no interrupt).
- NOT APPROVED: "handoff keeps predecessor". `ptah_session_handoff_ack` keeps today's behavior:
  after the successor acknowledges, the predecessor is ended (`endSession(..., 'parent-stop')`).
  Plan parts that remove that stop (batch 11 ack, batch 24 source-closer) are out of scope.

## Program phases

| Phase | Scope (implementation-plan.md batches) | Fixes | Task / branch | PR | State |
| --- | --- | --- | --- | --- | --- |
| P1 | Shared vocabulary + thresholds, subagent budget, permissions (1-7, 21, 23) | failures 1, 2 | feat/coop-handoff-p1-subagents | #1464 | merged |
| P2 | Watchdog, cause propagation, first-turn recovery incl. children, child cap freeze (8-13, 22, 25) | failure 3 | feat/coop-handoff-p2-watchdog | #1472 | merged |
| P3 | Child session report routing (17-18) | failure 4 | feat/coop-handoff-p3-reports | #1463 | merged |
| P4 | CLI lanes ask-then-pause (14-16, 26) | lane kills | feat/coop-handoff-p4-lanes | [#1476](https://github.com/Hive-Academy/PtahCode/pull/1476) | merged |
| P5 | Electron UI rendering and handoff banner (19-20) | UI labels | feat/coop-handoff-p5-ui | PR pending | in review |

## Follow-ups

Items found during P1-P3 that no phase of this program covers yet.

- (a) Notes gate keyed by agent ID only (pre-existing on main). Scope the gate by parent session and
  invocation, so a reused agent ID cannot inherit an earlier gate state.
- (b) Tool-less resumed start frame that the executor drops (found in P1). A resumed subagent can start
  with a frame that has no tool list, and the executor drops it.
- (c) P3 limits:
  - The child registry is in memory only, so it is empty after a restart.
  - Pre-dispatch claim versus outcome-unknown on restore.
  - `markDelivered` can overwrite a cancelled row.
  - Handoff reparent gap.
  - SDK alias routing and de-duplication.
- (d) Ambient and Monitor open tasks hide a real provider hang. The watchdog counts them as open work, so
  a hang shows only as overdue log warnings. P5 does not cover this: it renders lane notices only.
  The overdue callback in `session-query-executor.service.ts` still only logs. A UI notice needs a
  new path from the SDK session to the host (adapter callback, like `setCompactionStartCallback`),
  a message type and a banner in the chat view. Open for a later phase.
- (g) SDK subagent ask and pause notices (P1) still reach only the parent text and the agent. No
  event carries them to the renderer, so a paused subagent shows no chip. Lane notices show a chip (P5).
- (h) `agent-process-manager.account-binding.spec.ts` ("stays ambient when the stored lane selection
  is the default route") fails inside any linked worktree: `worktreeMainRoot` makes a second read.
  CI is not affected. Make the spec independent of the checkout location.
- (e) A child predecessor that reached the runtime cap has no retirement timer after a cooperative
  handoff (review finding m8 in `review-P2-B.md`).
- (f) Other minor review findings of P2 are in `review-P2-A.md` and `review-P2-B.md`.
