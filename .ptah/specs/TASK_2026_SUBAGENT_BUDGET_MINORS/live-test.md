# Ptah Dev Electron live regression test

2026-11-08 local, branch `fix/subagent-budget-minors`, HEAD `fd1335541`. Log references use one-based lines in `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`.

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestry | PASS | `git merge-base --is-ancestor 5a88ce09d HEAD` exited 0. |
| Production settings initial raw hash | PASS | `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. |
| Production settings initial canonical hash | PASS | `321e5a3bccff6840ed43c6d7e85f35b193ccf575b7fd71db5e09ec80c1e44abb`. |
| Dev settings initial backup | PASS | SHA-256 `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`; backup at `C:\Users\dev\.ptah-dev\settings.json.bak-budget-minors`. |
| No Dev instance before launch | PASS | Win32_Process command-line query returned no Ptah Dev Electron or Node process. |
| Production hashes after Dev edit | PASS | Raw and canonical matched initial hashes. |
| Production hashes after launch and at end | PASS | Raw `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a` and canonical `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb` at both checkpoints; no raw-only reserialization or canonical change. |
| Dev settings restored | PASS | Final SHA-256 `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`, byte-for-byte equal to backup; handoff threshold again 150000. |
| Dev process ownership and cleanup | PASS | Stopped only launcher PID 43404 and its Ptah Dev Electron root/children; final command-line query found zero Ptah Dev Electron processes. |

## Setup

The requested commands completed in order, each exiting 0: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron` (00:39:27Z), `node scripts/copy-wasm.js dist/apps/ptah-electron`, and `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron` (00:40:22Z). Dev `compaction.subagentHandoffTokens` changed from 150000 to 60000 using Node JSON; weighted stop remained 3000000. Ptah Dev launched from this worktree with `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, and port 9357. Launcher PID 43404, Electron root 44820. The chat UI showed Haiku 5.5 and log line 13904 recorded `claude-haiku-5-5` usage. The scratch workspace was `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path\.ptah\live-test-ws` (40 notes). The 20-session board was full, so one completed prior session was closed to create a new session.

## Scenarios

| Scenario | Result | Evidence |
| --- | --- | --- |
| S1 background stop and handoff | PASS for warning and stop; FAIL for one-agent scope; NOT PROVEN for N4/metadata | Background Task detected at lines 13861-13862; SubagentStart line 13869 names agent `aa3b5450b6d1a9b89`. Near-budget notice line 13989 (51,083 tokens), canonical record saved line 14037, stop dispatcher line 14038 targets that agent ID, and stop line 14044 records handoff at 60,317 tokens. Parent turn line 14047 and UI correctly say Ptah budget stopped the run, not the user, though the UI says a “stopped by user” notification appeared. The parent started an unrequested continuation at lines 14073/14079 despite the one-agent prompt and inaccurately claimed a newer user message requested it. No SubagentStop hook or transcript-lookup log line appeared for the budget-stopped agent; the hook's `isBackground` and N4 project-directory choice cannot be verified from this run. The transcript exists under the current scratch-workspace project directory, not a fallback directory. |
| S2 stopped-agent refusal | FAIL | Follow-up targeted stopped agent `aa3b5450b6d1a9b89` by raw ID. The renderer reported the SDK session file missing and started a new session (log line 14240); SendMessage returned SDK “No transcript found for agent ID” in the UI, not a Ptah `decisionSource=subagent-budget` denial. No stopped-name probe was made because the running continuation might have claimed the name. This does not establish whether the N2 name-specific fix works. |
| S2 running-agent steer | PASS for queued steer; timing partially observed | A new background Task started agent `a0b95db2497245629` at lines 14617-14621. The parent called SendMessage immediately after Task returned; UI reported it “queued for delivery at the agent's next tool round,” before any result was shown. No budget deny appeared in the interval. This agent later had notice line 14744 and handoff stop line 14796. The exact first-tool-result ordering was visible in the UI sequence, not logged explicitly. |
| S3 fake credential redaction | PASS | A 50 ms Node log watcher observed line 13989 and wrote `toolu_01LK2iuAdqHM2vzx2L3BTtcK.md` before stop line 14044. It assembled fake values at runtime for `--github-token=`, `--db-password=`, `--signing-key ` and `encryptionKey: `. After stop, all four fields contained `[redacted]`; `sortKey: name`, `primary key: id`, and `token-budget: 130000` were unchanged. Pattern checks found zero fake values in this notes file and the canonical handoff `20261108T004433316Z-9eb848de42414bab-toolu_01LK2iuAdqHM2vzx2L3BTtcK-e27f3234.handoff.md`; the rendered parent turn also had none. No full fake value is recorded here. |

## Findings

1. S1's budget warning, record save, correct stop target, and parent attribution worked. The parent nonetheless launched a second agent against the explicit one-agent instruction.
2. The stopped-agent refusal was not reached: the follow-up session reset and SDK returned “No transcript found.” The requested N2 check remains failed in this end-to-end path. The running-agent steer was queued, supporting N3's active-agent side, but the pending-preparation timing was not directly exercised.
3. The automatic budget stop did not invoke the SubagentStop hook, so this run provides no `isBackground` value and no N4 transcript-lookup project-directory log. The SDK transcript for the first agent exists in the current project directory.
4. All four additional credential forms were redacted in the watched notes file, while ordinary prose survived.

## Cleanup

Stopped the owned Dev launcher and Electron process tree. Restored Dev settings byte-for-byte, and final production raw/canonical hashes matched the gate. Removed all temporary watcher, hash, edit and CDP evaluation scripts. The backup at `C:\Users\dev\.ptah-dev\settings.json.bak-budget-minors` remains: a native removal command was rejected by the execution policy. `git status --short` showed only this untracked report. No source edit, commit, push, PR, test, serve, or e2e command was run.
