# Fourth live check: background subagent handoff

Date: 2026-11-08 (Africa/Cairo). **PASS: background scenario.** One fresh Haiku 5.5 chat reached the warning; no retry was needed. No product source edit, commit, push, or PR.

## Setup

- Confirmed no Ptah Dev process before launch. Clean `D:\projects\ptah-extension\.claude-worktrees\live-integration` was checked out detached at `1b6b1e796`. Both ancestry gates (`5a88ce09d`, `ff5f40803`) returned 0; the checkout remains clean.
- The three approved build commands ran in order and exited 0: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`, `node scripts/copy-wasm.js dist/apps/ptah-electron`, and `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron`.
- Backed up Dev settings and `note-01.txt` byte for byte. A Node edit of the full parsed settings object set `compaction.subagentHandoffTokens=60000`, Claude `haiku`, and `openai-codex` `gpt-5.6-luna`; verification returned 23 top-level keys and those values. App launch used `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, and CDP port 58604. The fake `api_key=PLACEHOLDER_NOT_A_SECRET` line was appended to `note-01.txt` before the chat.
- The first parent Agent call used `run_in_background=true` and the built-in Agent tool. Its prompt asked for all 40 notes in parallel Read batches, an agent-written notes file with the fake line when warned, and at most four smaller replacements. No CLI lane was used.

## Results

Evidence roots: Dev log `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`; parent JSONL `C:\Users\abdal\.claude\projects\D--projects-ptah-extension--claude-worktrees-subagent-budget-stop-path--ptah-live-test-ws\8e5b4ab9-add7-4766-85b9-d12895782a08.jsonl`; subagent JSONL in that session's `subagents\agent-abc05b3e9d019e917.jsonl`. Line numbers are one-based.

| Check | Result | Evidence |
| --- | --- | --- |
| One initial background Agent | **PASS** | Parent JSONL line 32: `Agent`, `run_in_background=true`, Haiku; SDK agent `abc05b3e9d019e917`. |
| Warning, parallel denial burst, no immediate three-denial stop | **PASS** | Dev log line 54671 warns at 62,981 context tokens. Lines 54674–54716 show eight `PreToolUse:Read` calls within 1.67 s. Subagent JSONL lines 64–79 show eight denied Read results from the same assistant message. The agent then issued `Write` (Dev log lines 54726–54733; subagent JSONL lines 86–87) and exited through normal `SubagentStop` at Dev log line 54742. Thus the parallel denials did not trigger the old immediate stop. The internal denial counter is not logged; this is behavioral evidence for one burst. |
| Agent-written notes and redaction | **PASS** | Subagent JSONL lines 86–87 show its own successful `Write` to `.ptah/subagent-handoffs/toolu_01BoHyPMWdNz2p6LyxK3NTjz.md`. That file's lines 11–16 contain `api_key=[redacted]`; it does not contain `api_key=PLACEHOLDER_NOT_A_SECRET`. |
| One durable handoff record | **PASS** | Dev log line 54748 saves one record, `20261108T061925222Z-aca4c38d83478915-toolu_01BoHyPMWdNz2p6LyxK3NTjz-12a6ea96.handoff.md`. One record matches the original Agent tool call. |
| Parent delivery, first reply, smaller continuation | **PASS** | Dev log line 54749 pushes one full parent message. Parent JSONL line 47 has one full handoff enqueue and line 50 delivers it; line 48/59 is the separate SDK task notification. Parent JSONL line 70 first replies that this is Ptah's budget handoff, disclaims a user interruption, and proceeds without a user message. Distinct Agent IDs at lines 71, 110 and 145 cover notes 17–26, 27–36 and 37–40: three smaller replacements, below the cap of four. Parent final text at line 224 says all 40 notes were covered. |

The 45 s postdecision timeout was not exercised because the warned agent wrote notes and stopped normally within 11 s. Screenshot: `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path\.ptah\live-test-ws\live4-background.png`.

## Isolation

- Stopped only the Ptah Dev launch started for this run (port 58604, Electron main PID 41396 and launcher PID 12272); a subsequent process check found no Ptah Dev Electron process. No production Ptah process was stopped.
- Production `C:\Users\abdal\.ptah\settings.json` was never written; raw SHA-256 before and after: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`.
- Restored Dev `C:\Users\abdal\.ptah-dev\settings.json` byte for byte; raw SHA-256 before and after: `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`.
- Restored `note-01.txt` byte for byte; raw SHA-256 before and after: `f8ccfd1b6ebf47f8a0c853b79da879412596196fc3b2c5370ea42ad7dcd0f393`.
- The two backup copies (`settings.json.live-test-4.bak` and `note-01.txt.live4.bak`) remain. Automatic approval review rejected their deletion command; it gave only `blocked by policy` as the reason. The temporary CDP helper scripts were removed.
- `live-integration` remains present, detached at `1b6b1e796`, with clean Git status. Earlier `live-test*.md` files were not changed.
