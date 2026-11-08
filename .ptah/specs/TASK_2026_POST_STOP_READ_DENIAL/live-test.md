# Ptah Dev Electron live test — post-stop Read/Glob

Date: 2026-11-07 UTC (2026-11-08 local). Built from this worktree. Log references are one-based lines in `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`. The log filename follows local date; entries use UTC timestamps.

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestor | PASS | `git merge-base --is-ancestor 5a88ce09d HEAD` exited 0. |
| Production raw SHA-256 | PASS | Start, after the sole Dev settings edit, after launch, and end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. |
| Production canonical SHA-256 | PASS | Recursive key sort, JSON stringify, SHA-256 at the same checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. No raw-only reserialization or canonical change. Production settings were read for hashes only. |
| Dev settings backup and restore | PASS | Backup `C:\Users\abdal\.ptah-dev\settings.json.bak-post-stop-read-denial` raw SHA-256 `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`; restored file has the identical hash. |
| Dev process ownership | PASS | Prelaunch query found zero Ptah Dev Electron processes; port 9346 was free. Only owned root PID 27624, launched from this worktree, was stopped. Final query found zero Ptah Dev user-data-dir Electron processes. |

## Setup

All three required commands succeeded in order: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron` (exit 0), `node scripts/copy-wasm.js dist/apps/ptah-electron` (exit 0), and `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron` (exit 0). Dev settings were edited with Node JSON only: `compaction.subagentHandoffTokens=60000`; weighted stop remained 3000000. Launch used `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, and `--remote-debugging-port=9346`. The new chat showed **Haiku 5.5**; log line 1617 confirms `claude-haiku-5-5`. Scratch workspace was the existing 40-note `.ptah/live-test-ws` under the `subagent-budget-stop-path` worktree.

## Scenario results

| Step | Result | Evidence |
| --- | --- | --- |
| One Haiku subagent reads notes and hits budget | PASS | SubagentStart log line 1433 named SDK agent `a73f9f143ca20b30c`. Near-budget warning at line 1551 (`contextTokens=51931`); handoff record saved at 1596; task-scoped stop at 1597-1602 (`reason=handoff`, `contextTokens=60292`). |
| Parent handoff contains the new retry sentence | PASS in SDK transcript/record; FAIL in first visible reply | The parent handoff text in Claude transcript `a1f4d6c8-73a3-4f78-b4f9-724c1eb10d24.jsonl:43` and the saved record says: “If a Read or Glob right after this handoff fails with \"The user doesn't want to take this action right now\" and you saw no permission prompt the user declined, retry that call once; if it fails the same way, stop and report to the user.” The first visible reply instead claimed the agent never ran and was interrupted by the user; [screenshot](live-test/post-stop-ui-stuck.png). |
| First parent Read after stop | PASS | Same transcript lines 58-59: `Read` of `note-01.txt`, tool ID `toolu_0171VeW8C2Yidj9C2sFaoqhk`, successful file content. |
| First parent Glob after stop | PASS | Same transcript lines 60, 65: `Glob` of `note-*.txt`, tool ID `toolu_0174nS97wQGK5LQTZx11TAJe`, successful note list. These calls are in an SDK continuation; the UI did not render that continuation. |
| Post-stop error and permission route | PASS for diagnosis | The sole `Tool result error after subagent budget stop` is log line 1610, `cause=interrupted`, tool ID `toolu_01VZGKMoh8KkUd2HWzU38EXh`: the stopped spawning `Task`, not parent Read/Glob. No parent Read/Glob error and no `[SdkPermissionHandler]` deny line occurred in the stop-to-parent window. Line 1605 says `abortSignalAborted=false`, `pendingPermissionRequests=0`. |
| Denial retry and loop | NOT EXERCISED / PASS for no loop | Neither parent file call had the SDK denial text, so one-retry behavior could not be tested. The parent did not enter a retry loop. |
| Follow-up parent Read/Glob | PASS | After the visible parent misattribution, a follow-up explicitly requested the calls. Transcript `74fc0d94-f1a6-4138-bced-f39ae779dc3e.jsonl:37-41` shows successful `Glob` and `Read`; line 62 reports both succeeded first try, 40 files, no denial. Log line 1937 confirms `claude-haiku-5-5`. A separate attempt to Read a wrong handoff path returned `File does not exist` (transcript lines 51-52), unrelated to SDK denial. [Follow-up UI capture](live-test/parent-followup-ui.png). |
| No crash; record saved | PASS with UI caveat | Electron remained reachable through CDP through the follow-up. Handoff record exists at `.ptah/live-test-ws/.ptah/subagent-handoffs/20261107T233105564Z-a2738a03b5ac8057-toolu_01VZGKMoh8KkUd2HWzU38EXh-61f6bd79.handoff.md` under the scratch worktree; log line 1596. The chat initially displayed the wrong user-interruption account and delayed or failed to render the SDK continuation. |

## Findings

The **SDK Read/Glob denial did not reproduce**. Both first post-stop parent file calls succeeded in the SDK transcript. The retry classifier therefore received no parent denial to classify; its `cause=denied` behavior remains unproven live. The visible parent reply was inaccurate: it said the agent never ran and blamed the user, while the log proves Ptah's budget monitor stopped the running agent. The SDK transcript later recorded the correct stop and successful file calls, but the visible chat did not show that continuation during observation. This is a separate parent/UI handoff issue worth investigating.

## Cleanup

Stopped owned Ptah Dev root PID 27624; final Ptah Dev process count was zero. Restored Dev settings byte-for-byte from the backup. Final production raw and canonical hashes matched the initial values. I did not edit source or run a commit, push, PR, test, serve, or e2e command. `git status --short` shows source modifications that this run did not touch; this run added only this report and its CDP screenshots in the task folder.

## Decisions

- Used the existing 40-note scratch workspace and H=60000 from round 5. Evidence: that setup previously crossed the 85% warning and stop. Reversible.
- Counted the interrupted spawning `Task` separately from parent Read/Glob. Evidence: transcript tool ID and log line 1610. Reversible if a later trace maps those IDs differently.
