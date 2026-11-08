# Fix round 3 — task 7

## Evidence and root cause

D1 and D2 share one session-key mismatch. The live log line 33911 records SDK `SubagentStart` with `sessionId=fa5028c2-7d72-4c51-b9bd-133b6fa31ec5`, `parentSessionId=d121cbf9-a3bb-45cd-8264-3f6253f3fc3a`, SDK agent `a04a16d19daddac4f`, and a hook UUID tool ID. Line 34007 records the warning in the SDK session under spawning tool ID `toolu_01HAWdbM94c5M23W45qNiuy2`. Line 34215 records `SubagentStop` for the same SDK session and agent. The SDK subagent JSONL `C:\Users\abdal\.claude\projects\D--projects-ptah-extension--claude-worktrees-subagent-budget-stop-path--ptah-live-test-ws\fa5028c2-7d72-4c51-b9bd-133b6fa31ec5\subagents\agent-a04a16d19daddac4f.jsonl` records 28 denied Reads, including lines 50, 52, 54, 56, and 128. The budget hook previously chose the captured `parentSessionId` before `input.session_id`; its monitor calls therefore missed the warning state stored under `fa5028…`. This explains both the missing safety stop and missing normal-exit record. The hook's `tool_use_id` can be a separate UUID; the monitor correctly keys subagent state by the streamed spawning `toolu_…` and matches by SDK `agent_id`.

D3 follows from D2: normal-exit `finishWarnedAgent` returned before its existing `redactNotes` call. The live notes had key-value-shaped data and no matching `.handoff.md` in all three scenarios (live-test-2.md). The normal-exit path now reaches the existing in-place redaction and record write. No live retest was run in this lane.

## Changes

- `subagent-budget-hooks.ts:37`: prefer SDK `session_id`, using captured ID only when absent. `subagent-budget-hooks.spec.ts:49` uses the live parent UUID, SDK agent ID, `toolu_…` Read ID, hook UUID stop ID, and distinct captured ID to verify both denial and normal-exit routing.
- `subagent-budget-monitor.ts:775-796,839-928`: info logs identify each gate-stop and normal-exit early return with session and agent IDs; failed asynchronous normal-exit delivery is caught and logged. The existing normal-exit redaction at `:909` now runs after the routing fix. `subagent-budget-monitor.spec.ts:2408` checks an agent-written notes file is redacted in place, remaining text is preserved, and a record is written.
- `subagent-budget-hooks.ts:59`: forced `PostToolUseFailure` returns only short attribution; the separately pushed handoff is not copied into it. `subagent-budget-hooks.spec.ts:34` checks the exact text.
- `subagent-budget-monitor.ts:782,807,818`: after record-write attempts are exhausted, gate denials no longer rearm the one-second watchdog or repeat its failure warning; the existing 2x safety stop remains available. `subagent-handoff-message.ts:112` identifies a context-token ceiling accurately.
- `subagent-budget-monitor.ts:1635,1664,1728,1818`: removed unused `skipRecord` and unreachable non-forced delivery branches. `subagent-budget-monitor.spec.ts:568,621` again exercises transcript lookup across two record-write attempts and checks progress, redaction, and the stop notice.

## Decisions

- Used the SDK hook's parsed `session_id` as the primary monitor key; the captured ID remains a fallback. Evidence: live log lines 33911, 34007, 34215 and the monitor's state key. Reversible.
- Kept record exhaustion from causing an unrecorded gate stop. The existing 2x safety path is the fallback; this preserves the record gate policy. Reversible.

## Verification

- Focused `npm run verify -- -t test -p agent-sdk -- --testPathPatterns=subagent-budget`: exit 0 after final spec edits.
- `npm run verify -- -t lint,typecheck,test -p agent-sdk`: lint and typecheck passed; test exited 1 solely for the known Windows symlink EPERM failures in `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts`. 5,632 tests passed; two failed.
- `npm run verify -- -t typecheck -p ptah-electron`: exit 0.
- Scoped Ptah TypeScript diagnostics on changed files: zero errors after the final edit.

## Remaining limitation

The notice-queue eviction assertions requested in the review were not restored in the monitor spec. Its forced-stop route now sends handoffs directly, so the old five-stop scenario does not exercise notice-queue eviction. The queue's own eviction behavior remains covered in `subagent-handoff-delivery.spec.ts`. A controlled forced-stop live retest is still needed to prove exactly-once parent delivery and safety-stop behavior in Electron.
