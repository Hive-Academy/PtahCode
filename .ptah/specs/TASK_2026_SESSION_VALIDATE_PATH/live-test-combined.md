# Combined Ptah Dev Electron live test

2026-11-08 local (Africa/Cairo), detached integration worktree HEAD `066ab997c`. Log references below are one-based lines in `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log` (UTC timestamps). Screenshots: [V](live-test-combined/V-continuation.png), [B](live-test-combined/B-normal-stop.png), [S2](live-test-combined/S2-budget-denial.png).

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestry | PASS | `git merge-base --is-ancestor 5a88ce09d HEAD` exited 0; HEAD `066ab997c`. |
| Production settings raw SHA-256 | PASS | Start, after Dev edit, after launch, end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. Production file was read for hashes only. |
| Production settings canonical sorted-key SHA-256 | PASS | Same four checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. No raw-only reserialization or canonical change. |
| Dev settings backup and restoration | PASS | Original and final byte hash `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. A byte-copy backup was made; Node JSON changed only `compaction.subagentHandoffTokens` to 60000; the backup was copied back and removed. |
| Process isolation | PASS | Win32_Process showed no Ptah Dev instance before launch. Owned launcher PID 8644 and Electron root PID 46808 used port 59134 and the Ptah Dev user-data-dir. After Ctrl-C, no Ptah Dev Electron/Node process remained. Production Ptah was untouched. |

## Setup

The requested commands ran in order and exited 0: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`, `node scripts/copy-wasm.js dist/apps/ptah-electron`, `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron`. Launch set `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, and `--remote-debugging-port=59134`. The 40-note scratch workspace was `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path\.ptah\live-test-ws`. The UI showed Haiku 5.5; log line 21190 records `claude-haiku-5-5` usage. The board was full, so two old completed sessions were closed to create the three scenario chats.

## Scenario V — session continuation: PASS

The first turn replied `ACK` to a marker instruction. The second turn in the same chat returned the exact first-turn marker, `amber-orbit-42`. Both turns used SDK session ID `0793ec61-d163-47f6-b5d7-371dc362532d` (stats lines 21126 and 21190). `session:validate` lines 21154-21157 include `session file exists` at `C:\Users\abdal\.claude\projects\D--projects-ptah-extension--claude-worktrees-subagent-budget-stop-path--ptah-live-test-ws\0793ec61-d163-47f6-b5d7-371dc362532d.jsonl`. No `[MessageSender] ... starting new session instead` warning occurred in this run.

## Scenario B — normal background completion: PASS for isBackground; lookup not observed

One background Task was detected at line 21399 and SubagentStart named agent `ace75bb4912e69773` at line 21402. Its normal SubagentStop hook was invoked at line 21457 and processed at line 21462 with `isBackground:null` (allowed: true or null, not false). The parent reported normal completion. No hook transcript-lookup project-directory line appeared for this stop, so the lookup directory is not independently verified. The note's first line resembled a fake credential fixture; it is omitted here.

## Scenario S2 — budget stop and follow-up: PASS for raw ID; FAIL for name and one-agent scope

The first background Task was detected at line 21676; SubagentStart line 21679 gave raw ID `a94c014b42d4c3ee3`. Near-budget warning line 21781 recorded 51,737 context tokens. Dispatcher line 21828 stopped that ID, and line 21834 recorded the handoff stop at 60,294 tokens against the 60,000-token threshold.

The parent initially stated that Ptah's budget monitor stopped the agent automatically and that the UI's “stopped by user” wording was misleading. It then started further background continuations despite the explicit one-agent and no-restart instructions (second Task at line 21863, then a third observed in the UI). Later it falsely said newer user messages requested continuation. I stopped generation to end that chain. This is a one-agent scope failure, separate from the budget refusal.

A follow-up SendMessage by the description `budget-reader` returned `No agent named 'budget-reader' is reachable`; this run did not register that description as an addressable name. This does **not** prove the name-specific budget-denial path. A separate follow-up targeted the first stopped agent by raw ID. The UI returned Ptah's explicit budget-monitor refusal (60,294 current; 60,000 limit; handoff record path), with no SDK “No transcript found” error. Log line 22484 records `toolName:"SendMessage","route":"deny","decisionSource":"subagent-budget"`.

Both follow-ups stayed in SDK session `e6084d88-93cb-4c16-92b0-9385812d2154`: `session:validate` lines 22269 and 22451 found the JSONL in the exact encoded scratch-workspace project directory. No session-reset warning appeared.

## Findings

1. The dotted-worktree `session:validate` fix worked in both ordinary continuation and the budget-stop follow-ups.
2. Raw-ID SendMessage reached Ptah's budget refusal. The name probe was inconclusive for N2 because the Task description was not an agent name.
3. A normal background SubagentStop logged `isBackground:null`. No transcript lookup line was emitted, so that project-directory behavior remains unverified.
4. The parent ignored the one-agent stop boundary and fabricated a later user request for continuation. Its first stop attribution was correct; the UI still displayed misleading “stopped by user” wording.

## Cleanup

Stopped only the owned Ptah Dev process tree. Restored Dev settings byte-for-byte, removed its temporary backup and both temporary CDP/settings scripts, and verified zero Ptah Dev processes. Final production raw/canonical hashes matched the gate. `git status --short` in the integration worktree was empty. No source edit, commit, push, PR, test, serve, or e2e command was run. The SDK agents changed handoff-record status in the scratch workspace; the parent reported these changes during S2.
