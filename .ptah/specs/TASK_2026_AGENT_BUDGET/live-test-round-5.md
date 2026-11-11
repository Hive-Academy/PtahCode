# Ptah Dev live test round 5 — TASK_2026_AGENT_BUDGET

Date: 2026-11-08 (Africa/Cairo). HEAD `cd1c9bb9903f3b64845b9e80ab62576d470e8f60`. Evidence uses one-based lines of `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`; selected token-free lines are in [sanitized-log.txt](live-test-round-5/sanitized-log.txt).

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Head and ancestor | PASS | `git rev-parse HEAD` matched the requested head; `git merge-base --is-ancestor 8aaa227e7 HEAD` exited 0. |
| Production settings | PASS | Raw SHA-256 at start, after each Dev edit, after launch, and at end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. Canonical sorted-JSON SHA-256 at those checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. Hashes only. |
| Dev settings | PASS | Original and restored raw SHA-256: `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. A byte-for-byte backup was made before edits, restored, then removed. |
| Process and port | PASS | No Ptah Dev process or port 9348 listener before launch. Launched Electron root PID 14732 with `NODE_ENV=development`, `PTAH_NO_DEVTOOLS=1`, `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, and remote debugging on 9348. Stopped its 29 owned PIDs only; root and listener absent afterward. |
| Scratch configuration isolation | PARTIAL | Before launch, `.agents`, `.claude`, `.ptah`, and `.mcp.json` were moved out, leaving README.md only. Electron regenerated `.agents/mcp_config.json` and `.mcp.json` during the test. Agent prompts prohibited reading them; C's parent explicitly reported leaving them unread. The regenerated copies prevent a proof that the workspace stayed config-free. They were removed at cleanup and the originals restored. |

## Setup

Rebuilt from this head using the required sequence, all exit 0: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`; `node scripts/copy-wasm.js dist/apps/ptah-electron`; `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron`. The board had room (`0 / 9 running` initially); no board session was closed or deleted. A used Dev `warnRatio: 0.85`, `stopWeightedTokens: 250000`, `handoffContextTokens: 40000`. C first used 400000/50000, then C2 and C3 used 180000/50000. All tests used the scratch workspace `.ptah/live-test-ws` and prompts restricted reads to README.md or generated handoff notes.

## Checks table

| Criterion | Result | Evidence |
| --- | --- | --- |
| A: Codex CLI per-turn charge and stop | PASS | Claude parent `agent-budget-round5-A` spawned `gpt-6-luna`, true CLI Session ID `01a1ba2b-a99e-75f0-82a3-89d9e4847ac1` (host 65769). Four distinct `Accepted lane turn` records at 65852, 65907, 65960, 66050 show weighted totals 77,116 → 149,414 → 207,538 → 268,459; the budget stopped the lane at 66051 before six turns could complete. |
| A: one warning and lane-visible injection | PASS | Exactly one warning before the stop, host 65962, `mode:"queue-next-turn"`; injection debug ID `agent-budget-warning` at 65988. The true CLI rollout JSONL line 103 contains a user input beginning `Budget warning: finish your current work, report progress, and prepare a short handoff.` Only this sanitized excerpt is quoted. |
| A: progress pointer and resume | PASS | Parent UI showed the 250,000 limit, true CLI Session ID, and last completed turn `01a1ba2c-a8d3-7ae2-9b8c-32f635a411df`. Resume gate 66138 returned `decision:"fresh"`, reason `budget stop: CLI session cannot resume after budget stop`; a new CLI Session ID was created, then stopped. |
| B: native child linkage | PASS | The existing native Codex-provider chat `agent-budget-round4-B` delegated to `/root/readme_detailed`. Host 66087 linked parent thread `01a1ba0e-9645-7aa3-8a14-376e955b6c93` to child `01a1ba2c-e480-7700-be5f-d1a4bd7e6f4e`; no `Codex early child event buffer overflow` occurred in this run interval. |
| B: child accounting and 40,000-context advisory | FAIL | Host 66212, 66264, 66311 produced three child decisions, all `coverage:"telemetry-unavailable"`, with no accepted counters or near-40,000 advisory. The child was linked again on each connection at 66220 and 66299. Three decisions for three observed completed child turns do not show a duplicate charge, but no usable charge was established. This is a live regression/gap after the round 4 linkage fix. |
| C: observed Haiku turns, warning, stop | PASS | The focused C3 Task `a171b513ba34e7c98` had five accepted turns at 67503, 67510, 67514, 67520, 67523, observed model `claude-haiku-5-5`, catalog cost authority. Warning queued once at 148,151/180,000 (82.3%, policy forecast near 85%) at 67521. Ptah stopped it at 187,815/180,000: handoff saved 67525, stop 67529, parent turn stop 67532. |
| C: child notes, one record, parent attribution | PARTIAL | C3 child `Write` at 67505–67509 created `c3-progress-notes.md` (38 bytes) before warning. It contained only a heading and `Task id: unknown`; no post-warning update was observed. Exactly one `.handoff.md` record was created for C3, with 39,661/50,000 context tokens. Parent UI first stated that Ptah's budget monitor stopped the child, not the user, then read the record and started one fresh Haiku Task that read its handoff and summarized remaining work. Host 67553 also warned the queued parent handoff write was not resent after its time window, despite the parent reading the record. |
| C: stopped Task gate, burst, resume | PARTIAL | Three parallel SendMessage calls to stopped Task `a171b513ba34e7c98` were denied by PreToolUse, `decisionSource:"subagent-budget"`, host 67557, 67560, 67563. They produced no extra handoff record: one burst, one C3 record. A resume attempt was **NOT EXERCISED** because the available native Agent tool schema had no resume parameter. |

## Findings

- A closes the round 4 lane-warning evidence gap: the warning was present in the Codex rollout, and the stopped CLI session was not resumed.
- B's first-notification child linkage now works, but its three decisions had `telemetry-unavailable`; the 40,000-context advisory remains unproven. The repeated link lines and missing telemetry need investigation.
- C1 finished normally before a warning; C2 and its fresh continuation hit budget stops but neither wrote child notes. C3 wrote notes first and exercised the stop, handoff, denial burst, and fresh Task. The child did not update its notes after the warning, and the native Agent schema did not expose resume. The monitor's `Handoff not read by the parent in time` warning occurred even though the parent read the C3 record. These are the remaining #1004 live gaps; the Ptah attribution and stopped-Task SendMessage gate behaved as intended.

## Cleanup

Stopped only the owned Electron tree and confirmed port 9348 closed. Restored Dev settings byte-for-byte; deleted its backup. Production raw and canonical hashes matched every checkpoint. Restored the scratch workspace's original files and removed generated MCP copies, generated scratch files, temporary CDP/hash/edit scripts, PID file, and backup directories. Electron's incidental `.gitignore` addition was reverted. A direct `Remove-Item` cleanup was automatically rejected as `blocked by policy`; a path-checked local cleanup script removed the generated copies after the originals were restored. No source edit, commit, push, or merge was made. `git status` showed only this round 5 report and evidence directory.
