# Combined Ptah Dev Electron live test

2026-11-08 local (Africa/Cairo), detached integration worktree `d18b93437`. Log references are one-based lines in `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log` (UTC timestamps).

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestry | PASS | `git merge-base --is-ancestor 5a88ce09d HEAD` exited 0; HEAD `d18b93437fccbdb75c439a153c3ca529b03dc17e`. |
| Production settings, raw SHA-256 | PASS | Start, after Dev edit, after launch, end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. Production file read for hashes only. |
| Production settings, canonical sorted-key SHA-256 | PASS | Same checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. No reserialization or canonical change. |
| Dev settings backup and restore | PASS | Original backup and restored file SHA-256 `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`; only `compaction.subagentHandoffTokens=60000` was edited via Node JSON. |
| Dev process isolation | PASS | No Ptah Dev process before launch; port 9350 free. Owned Electron root PID 6224 was launched from this worktree and stopped. Final Ptah Dev process count zero. Production Ptah remained running and untouched. |

## Setup

The commands ran in the requested order and each exited 0: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`; `node scripts/copy-wasm.js dist/apps/ptah-electron`; `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron`. Launch set `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, and `--remote-debugging-port=9350`. The workspace was the existing 40-note `subagent-budget-stop-path/.ptah/live-test-ws`. Each new chat showed Haiku 5.5 in the UI; line 10910 records parent SDK model `haiku`, and line 11012 records `claude-haiku-5-5` usage. Screenshots are in [live-test-combined](live-test-combined/).

## Scenario M — MCP workspace URL: PASS

Log line 10912 gives the session URL: `http://localhost:51821/session/0ff6f5c1-e7d8-4597-871b-35deb622b9a1/workspace/D%3A%5Cprojects%5Cptah-extension%5C.claude-worktrees%5Csubagent-budget-stop-path%5C.ptah%5Clive-test-ws` (no token in URL). Line 10953 records `Eager-loaded ptah MCP tools (69)` with `ptah` status `connected`. The parent called `ptah_search_files` with `note-0*.txt` and visibly reported nine files, note-01 through note-09. [UI evidence](live-test-combined/mcp-pass.png).

## Scenario A — `modelTier: haiku`, no model: PASS for observed model

Line 11202 dispatcher args: `{"cli":"claude","model":"default","modelTier":"haiku"}`. That `default` is the dispatcher's schema sentinel; line 11216 resolves the spawned SDK lane to `"model":"haiku"`, and line 11217 policy confirms `"model":"haiku","modelSource":"request"`. Agent `500e0b23-59e9-4552-a4ea-f02775e1873f` completed with exit 0 at line 11292. Its Claude SDK transcript `ba79ee56-3f9f-4e6b-8768-7aee12ad7030.jsonl` contains only assistant model `claude-haiku-5-5`; the visible parent reported `OK`, `claude-haiku-5-5`, 2 input/4 output tokens, and about $0.0093. The parent and transcript exposed no lane `modelUsage` object or keys, so the requested SDK `modelUsage` key check is unavailable. No Sonnet or Opus model appeared in the lane transcript.

## Scenario B — `model: haiku`, no tier: PASS for observed model

Line 11501 dispatcher args: `{"cli":"claude","model":"haiku","modelTier":"unset"}`. Lines 11523-11524 resolve the SDK lane and policy to `haiku`; agent `c71f0402-841f-4d7f-b7ed-7642b2d986e5` completed with exit 0 at line 11582. Its SDK transcript `e899085d-80d7-45cb-ae56-1899155bd9f1.jsonl` contains only assistant model `claude-haiku-5-5`. The visible parent reported `OK`, 2 input/4 output tokens, and about $0.0005; the UI completion card labeled the lane `claude-haiku-5-5` ([capture](live-test-combined/lanes-pass.png)). As in A, the lane transcript has no `modelUsage` object or keys; that particular check remains unavailable. No Sonnet or Opus model appeared in the lane transcript.

## Scenario R — notes redaction: PASS for redaction; one-agent scope FAIL

The first SDK Task/Explore subagent started at lines 11920-11924. Line 12041 reports the near-budget notice for `toolu_01UH42K5tTdHKd5h7NWyKuCK` at 51,676 context tokens. A 50 ms Node log watcher immediately wrote `.ptah/subagent-handoffs/toolu_01UH42K5tTdHKd5h7NWyKuCK.md` with two assembled fake credential fields and the four requested prose lines, before the stop. Line 12086 saved the canonical `.handoff.md`; line 12092 stopped the subagent for handoff at 61,527 context tokens.

After the stop, the notes file contained `API_KEY=[redacted]` and `--client-secret=[redacted]`, plus all four unchanged lines: `Basic usage of the tool`, `primary key: id`, `the key insight`, `token-budget: 130000`. A programmatic check found no fake marker in the notes file, its canonical `.handoff.md`, or the parent's visible turn. No `.tmp` sibling and no notes-redaction warning appeared. [UI capture](live-test-combined/redaction-pass.png). No retry was needed.

The parent read the redacted notes successfully, then started a second Explore subagent at line 12117 despite the instruction to spawn one. I clicked Stop generating; the parent turn ended. Its final visible text incorrectly attributed the first stop to the user and claimed no notes were written. The log and file checks above contradict those statements. The redaction behavior passed, but the one-subagent scope did not.

## Cleanup

Stopped only owned Dev root PID 6224; no Ptah Dev Electron process remained. Restored Dev settings byte-for-byte; final Dev SHA-256 matched the backup. Final production raw and canonical hashes matched their start values. Temporary watcher, hash, settings, CDP evaluation, usage, and check scripts were removed. No source edit, commit, push, PR, test, serve, or e2e command was run.

## Decisions

- Used the prior 40-note scratch workspace and 60,000-token handoff threshold because earlier live runs proved they reach the warning and stop. Reversible.
- Counted the first stop and the parent-initiated second Task separately. The first established redaction; the second violated the requested one-subagent scope. Evidence: lines 12092 and 12117. Reversible interpretation if task semantics change.
- Reported lane `modelUsage` as unavailable rather than inferring keys from parent usage. Evidence: both lane SDK transcripts have model fields but no `modelUsage` object. Reversible with richer lane telemetry.
