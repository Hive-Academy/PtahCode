# Partial stop-path inventory (subagent "Inventory subagent budget stops", cut off by the notes gate)

Paths relative to `libs/backend/agent-sdk/src/lib/`. "Monitor" = `helpers/compaction/subagent-budget-monitor.ts`.
Line numbers are from main at 7ab0c5065+ (2026-11-21); re-check before editing.

## Subagent budget monitor stop pipeline
- `stop()` monitor:1458-1659: no task id -> deferred (1475); `prepareHandoff` (1689) writes record;
  `stopNotices.record` (1550); `dispatcher.stopSubagent` (1553) -> `Query.stopTask(taskId)`
  (`helpers/subagent-message-dispatcher.ts:291`). Failure: discard notice, backoff 1/2/4 s, max 3 tries.
  Success: `budgetStopCallbacks.notifyAll` (1617), registry status 'completed', notes gate finished,
  `deliverHandoff` (1649/1867), `records.writeStub`.
- Only monitor:1553 calls stopTask in the budget path (`di/register.ts:718-719` wires it; user-driven
  `rpc-handlers/.../subagent-rpc.handlers.ts:465` also calls it).
- Constants: monitor:144-148 (MAX_STOP_ATTEMPTS 3 ...); `subagent-notes-gate.ts:8` NOTES_GATE_TIMEOUT_MS 10 min;
  watchdog tick monitor:745-768 (1 s).

## Stop kinds
| Kind | Trigger | Kills? | Where |
| --- | --- | --- | --- |
| A near-budget warning | policySnapshot.warned (warnRatio x handoffContextTokens) | no; enters notes phase, PreToolUse deny of all other tools | monitor:620,638-675; notes-gate:30,75; text handoff-message:61-65 |
| B warning-notes-complete | PostToolUse write of notes file | YES stopTask | notes-gate:59-66; monitor:702-716 |
| C notes-timeout | 10 min after notes entry | YES stopTask | monitor:752,692,704; notes-gate:71 |
| D warning-turn-ended | SubagentStop during notes phase | no (cooperative return) | monitor:782-885 |
| E safety weighted/raw | policySnapshot.stopped | YES | monitor:621-627; stop-cause:25-29 |
| F safety duration | maxDurationMin timer | YES | monitor:1265-1293 |
| G missing telemetry | assistant msg without usage | YES | monitor:571-590; stop-cause:43-46 |
| H record write failure | 3 failed writes | leaves running, no handoff | monitor:1834-1860 |

Design note: D already is the desired cooperative path. The notes gate tells the model "Your turn ends
immediately after the notes write" — the fix is to let the turn end (D) instead of B's stopTask.
The notes gate also denies ALL non-notes tools: a read-only subagent (like this inventory agent) cannot
continue and cannot write its report -> must change.

## Messages
- Parent: `subagent-handoff-message.ts:101-178` (incl. 130-133 Read/Glob retry note); delivery
  `subagent-handoff-delivery.ts:86-147`; PostToolUseFailure context `subagent-budget-hooks.ts:94`.
- UI: `stopNotice` handoff-message:70-90; `message-transform/system-message.transformer.ts:654,712`
  map task_notification stopped/killed -> background_agent_stopped stoppedBy 'budget-monitor' (else 'user').
- Cause text: `subagent-stop-cause.ts:32-41`.

## Permission handler (`sdk-permission-handler.ts`)
- SendMessage budget refusal: 635-645 (deny, interrupt:false), 896-899; PreToolUse in
  `helpers/sdk-query-options-builder.ts:1450-1465`; text `helpers/compaction/subagent-resume-advice.ts:22`.
- **Likely source of "The user doesn't want to take this action right now"**: an aborted pending prompt
  (stopTask/interrupt) -> `awaitResponse` null (1572-1594) -> `{deny, 'Permission request was aborted',
  interrupt:true}` (1338-1348); with interrupt:true the CLI substitutes its canned text (comment 1381-1383).
  Not yet confirmed in the SDK cli.js.
- Timeouts: CLI_AGENT_PERMISSION_TIMEOUT_MS 10 min (118); UNROUTABLE 60 s
  (`system-abort-permission-message.ts:7`) -> "SYSTEM ABORT — this was NOT a user decision" (good pattern).
- `cleanupPendingPermissions` 1659-1738 -> SYSTEM ABORT text. `dispose()` 1638-1657 -> 'User denied
  permission', interrupt:true (bad: user wording). Deny 1376 "Permission denied by user for tool" (user
  wording). Lane identity timeout 1192-1201 interrupt:true.
- `recordBudgetStop` 301-306: log flag only.

## Injection channels into a running subagent
SubagentNoticeQueue -> PostToolUse additionalContext (`helpers/post-tool-use-hook-handler.ts:101-102,229-244`);
PreToolUse deny reason; SendMessage relay (`dispatcher:130-180`, no direct streamInput to a subagent);
canUseTool deny message interrupt:false.

## Not done
- Budget setting keys/defaults (AgentBudgetPolicy in shared; CompactionConfigProvider.getAgentBudgetSettings;
  resume-advice fallback warn ratio 0.85 at :50).
- grep SDK cli.js for the canned text.
- `session-query-executor.service.ts` ~287 detection review.
- Specs that assert stopTask is called (14 spec files under helpers/compaction/subagent-*.spec.ts).
- Whole other half: root no-activity watchdog vs Monitor/background work, session budget/runtime caps,
  child session no-activity + Fix C scope, CLI lane inactivity timeout, compaction stops.
</content>
</invoke>
