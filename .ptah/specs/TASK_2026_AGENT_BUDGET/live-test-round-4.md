# Ptah Dev live test round 4 — TASK_2026_AGENT_BUDGET

Date: 2026-11-08 (Africa/Cairo). HEAD `a551154398518449d082833f085f23abc8f88f72`. Log references are one-based lines of `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`; selected token-free lines are in [sanitized-log.txt](live-test-round-4/sanitized-log.txt).

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestor and head | PASS | `git merge-base --is-ancestor 8aaa227e7 HEAD` exited 0; HEAD matched the requested SHA. |
| Production settings | PASS | Raw SHA-256 at start, after Dev edit, after launch and end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. Canonical sorted-JSON SHA-256 at all four points: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. Hashes only; no contents printed. |
| Dev settings | PASS | Initial, backup and final raw SHA-256: `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. Edited only the Dev copy, restored backup byte-for-byte and deleted it. |
| Process isolation | PASS | No Ptah Dev process or listener on 9348 before launch. Electron root PID 44024 launched with `NODE_ENV=development`, `PTAH_NO_DEVTOOLS=1`, port 9348. Stopped its 25-process owned tree; root and port 9348 absent afterward. |
| Scratch configuration isolation | FAIL | Existing `.agents`, `.claude`, `.ptah`, `.mcp.json` were moved out before launch, leaving README only. Electron regenerated `.agents/mcp_config.json` and `.mcp.json` during A. The prompt prohibited reading them, but the config-free state did not persist and non-reading cannot be proved. Original files were restored after stop; generated copies were overwritten, and no extra paths remained. An automatic approval review rejected direct `Remove-Item` commands for those files; the stated result was `blocked by policy`. |

## Setup

Rebuilt from this changed HEAD in the required order: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron` (exit 0), `node scripts/copy-wasm.js dist/apps/ptah-electron` (exit 0), and `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron` (exit 0). Dev `agentBudget` used `warnRatio: 0.85`, `stopWeightedTokens: 250000`, `handoffContextTokens: 40000`. The board had room, so no prior session was closed. A and B used separate named chats in `.ptah/live-test-ws`; B's workspace main connection was switched through the UI to Codex after A completed.

## Checks table

| Criterion | Result | Evidence |
| --- | --- | --- |
| A: Claude parent, Codex CLI `gpt-6-luna`, per-turn accounting | PASS | Chat `agent-budget-round4-A` used Claude. True CLI Session ID `01a1ba0b-9a57-72a2-b71f-a662cebdb012` linked at log 63131. Four `Accepted lane turn` lines 63169, 63210, 63250, 63297 show observed `gpt-6-luna` and weighted totals 120,507 → 184,291 → 229,850 → 300,799. The task requested 8 reports but the budget stopped it after 4 turns, so 6+ could not occur. |
| A: one warning before stop, steer or queue, no active-turn error | PASS | One `Budget warning delivered` at 63252, `mode:"queue-next-turn"`, after ratio 0.9194 and before stop. No `Codex turn is already active` in this run's log interval. The generic router also logged `unsupported` at 63251, but the actual warning delivery was the adapter's queue, not an unsupported or start-turn delivery. |
| A: warning text visible in lane output | FAIL | The host proves the warning was queued and the next turn completed, but the captured parent transcript and sanitized host log do not expose the warning's text in the lane output. Delivery to the model cannot be independently established. |
| A: stop, progress pointer and resume gate | PASS | Log 63297 reached 300,799; 63298 has `stopReason:"budget"`. Parent UI displayed the 250,000 limit, true CLI Session ID and progress turn ID `01a1ba0c-7c23-7711-955c-be2df2f7b684`. Log 63377 refused resume of that Session ID with `decision:"fresh"`, reason `budget stop: CLI session cannot resume after budget stop`; the UI identified the new session as fresh. |
| B: native Codex child and no overflow | PASS | Chat `agent-budget-round4-B` displayed `OpenAI Codex` as chat provider. Parent reported native child `/root/readme_inspection`, a README finding and a follow-up. No `Codex early child event buffer overflow` appeared in B's log interval. This proves a UI-visible child, not host linkage. |
| B: host-linked child ID, per-turn charge, near-40,000 decision | FAIL | No host-linked child thread ID or `[Codex budget] Child budget decision` was logged. One charge per child turn and the advisory near-40,000 decision were not established. The threshold may not have been reached in this short task. |
| B: method-name order when linkage fails | PASS | Debug method-only sequence at 64174–64201: `thread/status/changed`, `mcpServer/startupStatus/updated`, `turn/started`, `item/started`, `item/completed`, `item/agentMessage/delta`, `turn/moderationMetadata`, `thread/tokenUsage/updated`, `turn/completed`. No `thread/started` appears in that sequence. No notification payload was captured. |

## Findings

- The revised Codex warning path used `queue-next-turn` and avoided the round 3 active-turn collision. The budget stop and fresh-session reason are live-proven. The warning text itself remains unproven at the lane-visible boundary.
- Native child linkage still failed despite a UI-visible child and no buffer overflow. The new debug trace shows an unlinked turn sequence without `thread/started`; it does not expose a host child thread ID or budget charges.
- Electron recreated MCP configuration in the scratch workspace. The test prompts restricted reads, but this prevents a clean claim that the agent ran in a config-free folder.

## Cleanup

Stopped only the owned Electron process tree and confirmed port 9348 closed. Restored Dev settings byte-for-byte and deleted its backup; production raw and canonical hashes matched all checkpoints. Restored the scratch workspace's original files, overwrote app-generated MCP copies, and confirmed no extra files remained. Removed temporary CDP and hash scripts and reverted Electron's incidental `.gitignore` addition. Empty scratch-backup directories remain because automatic approval review rejected `Remove-Item`; they contain no files. `git status` shows only this report and its evidence directory. No source change, commit, push or merge was made.
