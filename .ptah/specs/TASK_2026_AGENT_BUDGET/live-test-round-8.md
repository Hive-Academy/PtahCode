# Live test round 8 — TASK_2026_AGENT_BUDGET

Run 2026-11-08 in Ptah Dev Electron for PR #986, `feat/agent-budget`, HEAD `948ab6ce265581d44973b4822dda109005d4a9d7`. Selected host-log evidence is in [sanitized-log.txt](live-test-round-8/sanitized-log.txt). No source was edited, committed, pushed, or merged by this test lane.

## Isolation gate

| Gate | Result |
| --- | --- |
| Ancestor | PASS: `8aaa227e7` is an ancestor of HEAD. |
| Production settings | PASS: raw SHA-256 `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a` and canonical sorted-JSON SHA-256 `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb` at start, after Dev edits, after launch, and end. Hashes only; values were not printed. |
| Dev settings | PASS: backed up before edits, restored byte for byte; original/final raw SHA-256 `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. Backup removed. |
| Process and port | PASS: no Ptah Dev process or port-9348 listener before launch. Two launches used `PTAH_NO_DEVTOOLS=1`, `NODE_ENV=development`, `CLAUDE_CODE_SUBAGENT_MODEL=haiku`; owned roots 1880 and 48388 were stopped with their descendant trees only. No root or listener remained at end. |
| Scratch security | PASS: original `.agents`, `.claude`, `.ptah`, and `.mcp.json` were isolated before launch and restored byte for byte after generated copies were removed. Agents were confined to `README.md` and instructed against home Ptah paths, MCP/config files, and secrets. No generated MCP config copy remained. |
| Board | 0/9 running at launch. The board reached 20 total sessions; the tests reused an existing completed session rather than deleting a session. |

## Setup

Rebuilt from HEAD in the required order: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`; `node scripts/copy-wasm.js dist/apps/ptah-electron`; `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron`. All exited 0. Electron used CDP port 9348 and `.ptah/live-test-ws`. Native Codex chat was selected for B, then Claude CLI for A/C. A used `agentBudget.stopWeightedTokens=250000`; C used `agentBudget.handoffContextTokens=40000` and `stopWeightedTokens=65000` after a Dev-only settings correction. The earlier edit of legacy `compaction` keys did not control the live monitor; it was corrected before C's stop.

## Checks table

| Check | Result | Evidence |
| --- | --- | --- |
| **B — native Codex-provider child** | **PASS** for linkage, three decisions with real counters, and relink state; advisory **NOT EXERCISED** | Parent linked child at host line 79020. Three completed child turns produced exactly three decisions with context/input/output counters and `price-weighting-degraded` coverage (79050, 79071, 79096). The model was unavailable, so `codex/unknown` charged raw tokens without cost; one notice appeared (79051). Relinks (79060, 79083) added no charge. Maximum context was 23113/40000, so the advisory threshold was not reached. A second child was not run. |
| **A — Codex CLI lane** | **FAIL** strict no-unsupported condition; warning, stop, pointer and resume refusal **PASS** | Weighted totals 61386, 135357, 197884, 265352/250000 (79983, 80060, 80126, 80182). Warning was queued after turn 3 and injected into turn 4 (80128, 80150). The router still logged `mode:"unsupported"` immediately before queue delivery (80127). Original CLI session reference persisted (79935-80212); resume gate refused it after budget stop (80268). |
| **C — Haiku SDK subagent** | **PASS** for scoped handoff wording and first-reply attribution; **FAIL** if the parent reply itself must avoid quoting SDK wording | Task `ae80bd105e93429a3` stopped at 69913/65000 (82085-82092). One handoff record and one parent push preceded the reply. Targeted check of its handoff found the literal SDK interruption string absent and the Ptah-monitor paraphrase present. Parent's first reply named Ptah's budget, but quoted the SDK tool-result interruption string separately. |

## Findings

1. A's `unsupported` router entry remains a live regression despite successful `queue-next-turn` warning delivery. The strict A check fails.
2. B's raw-token fallback is live with one decision per completed child turn and no relink charge. The context advisory remains untested because the child stayed below 40000.
3. C's handoff paraphrase is live. The parent's own first reply still repeats the SDK interruption string while attributing the stop to Ptah; this is a narrower #1004 wording leak outside the handoff text.
4. The first C attempt finished normally at the 250000 limit. The second Task crossed the corrected 65000 limit after `agentBudget` was edited. The correction took effect on the next completed child turn, which explains its first-turn 250000 ratio and second-turn 65000 ratio.

## Decisions

- Classified A as FAIL because the requested absence of `mode:"unsupported"` is explicit, even though the warning reached the lane. Reversible if the acceptance condition changes.
- Classified C's handoff wording and first-reply attribution separately from the parent's quoted SDK tool result. The requested handoff text is clean; the UI quote remains a documented regression. Reversible if the wording scope changes.

## Cleanup

Stopped only the two owned Electron process trees; port 9348 is closed. Restored Dev settings byte for byte and removed their backup. Removed generated scratch `.agents`, `.claude`, `.ptah`, `.mcp.json`, and `.gitignore`, then restored and hash-verified the originals; the scratch backup was removed. Production raw and canonical hashes matched their start values. Existing unrelated worktree changes (`codex-child-budget-observer` files, `code-review-final-2.md`, and the prior round-6 artifact) were left untouched.
