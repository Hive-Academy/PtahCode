# Ptah Dev live test round 3 — TASK_2026_AGENT_BUDGET

Attempt 1 could not start a chat: the board held 20 sessions and disabled **New session**. This rerun closed three earlier completed test sessions through the UI and exercised checks A and B. Date: 2026-11-08 (Africa/Cairo). HEAD: `5be9cd31da0fbd6c00d38fbc81ea3dd65b183f82`. Line numbers below refer to `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`; a token-free selection is in [sanitized-log.txt](live-test-round-3/sanitized-log.txt).

## Isolation gate

| Criterion | Result | Evidence |
| --- | --- | --- |
| Required ancestor and head | PASS | `git merge-base --is-ancestor 8aaa227e7 HEAD` exited 0; HEAD matched the requested SHA. |
| Production settings hashes | PASS | Raw SHA-256 at start, after the Dev edit, after launch, and at end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. Canonical SHA-256 at the same four checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. Production file was read for hashes only. |
| Dev settings backup and restoration | PASS | Initial, backup, and final raw SHA-256: `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. Edited only the Dev copy with Node JSON; restored backup byte-for-byte and deleted it. |
| Process isolation | PASS | No Ptah Dev process before launch. Launched with `PTAH_NO_DEVTOOLS=1` and CDP port 9348; launcher PID 40612, Electron root PID 46920. Stopped only the owned process tree (28 PIDs); port 9348 closed. |

## Setup

The existing Electron `dist` build was from the requested HEAD, so this rerun did not rebuild. The earlier attempt ran the required `build-dev`, WASM copy, and `copy-renderer-dev` sequence under the verify lock. Dev `agentBudget` was set to `warnRatio: 0.85`, `stopWeightedTokens: 300000`, and `handoffContextTokens: 40000`. Electron launched with `NODE_ENV=development`, `PTAH_NO_DEVTOOLS=1`, and `--remote-debugging-port=9348`.

The UI board held 20 sessions. I closed, without deleting history, these three oldest completed test entries (titles as displayed): `Start one general-purpose subagent in…`, `Start one general-purpose subagent.`, and a second `Start one general-purpose subagent in…`. **New session** then became enabled. I selected the exact scratch folder `D:\projects\ptah-extension\.claude-worktrees\agent-budget\.ptah\live-test-ws` through the Electron frontend's existing path registration and verified the sidebar path; no native Add Folder dialog was used.

Before launch, I moved the scratch folder's `.agents`, `.claude`, `.ptah`, and `.mcp.json` into a temporary backup, leaving only `README.md`. The test prompts expressly prohibited reading MCP, Ptah, home, or credential configuration. **Security limitation:** Electron regenerated `.agents/mcp_config.json` and `.mcp.json` during the run. Thus the required config-free scratch state was not maintained; I did not inspect or print their contents, and cannot prove the CLI ignored them. Cleanup restored the original scratch contents and removed the generated copies.

## Checks

| Criterion | Result | Evidence |
| --- | --- | --- |
| A: Claude-provider parent spawns Codex CLI and records numeric turns | PASS | Chat `agent-budget-round3-A` started under Claude provider. Log 59548: `cli=codex`, requested model `gpt-6-luna`, scratch workdir, lane ID `fc0f3b31-ac76-42d2-bee7-046c1c632210`. Log 59559 binds true CLI Session ID `01a1b9e4-7c0e-7402-a53b-606bfce21a39`. Five `Accepted lane turn` records at 59605, 59658, 59704, 59749, 59796, all observed model `gpt-6-luna` and cost authority `catalog`; weighted totals 77067, 130634, 169155, 209694, 272946. Numeric input/output for each are in the excerpt. |
| A: exactly one predictive warning before stop, delivered to lane by steer or queue | FAIL | One warning was generated at ratio 0.90982 on the fifth completed turn, before the 300000 stop. Routing first returned `unsupported` (59797), then fallback `start-turn` (59798), and logged `Budget warning delivered` with `start-turn` (59800). The continuation then failed with `Codex turn is already active` (59807–59808). There is no verified lane-visible warning text. The requested steer/queue delivery was not observed. |
| A: budget stop, completion pointer, and exhausted-session resume refusal | FAIL | Original lane never reached 300000: final accepted weighted total was 272946 (59796). The parent attempted a resume, but gate chose `fresh` at 59917 because the **warning** threshold had been reached, and did so again at 60352. Fresh lanes were spawned. No budget stop/source, completion with true Session ID plus last completed turn, or exhausted-session resume was observed for the original lane. Fifth accepted turn ID was `01a1b9e5-e6c4-78d1-a393-37f0bad79758`. |
| B: native Codex parent and child start | PASS | Chat `agent-budget-round3-B` used OpenAI Codex as the **chat provider**; settings save at 61230 and active provider/workdir at 61378. Parent UI reported native child `/root/readme_review` and follow-up review prompts. This is evidence of a child from the parent UI, not of host linkage. |
| B: host-linked child ID, no early overflow, per-turn charge, advisory decision near 40000 | FAIL | Log 61549 reports `Codex early child event buffer overflow`; 61550 states native child linkage was not reported within the buffer limit. No `[Codex budget] Child budget decision` appeared in the B interval, so one charge per child turn and a decision near 40000 could not be established. No stop is claimed: this observer is advisory. |
| B: raw notification method order if linkage fails | FAIL | Only two method names were visible in the existing host log around child start: `thread/settings/updated` (61482), then `item/commandExecution/outputDelta` (61500), followed by overflow (61549). The full raw app-server notification sequence was not logged; capturing it would require instrumentation outside this no-source-edit test. No notification content or credentials are included. |
| C: Claude CLI telemetry, observed model, resume-cost comparison | NOT EXERCISED | Optional check was not run after the A and B failures. |

## Findings

- The predictive warning triggered once at 90.982% before the configured stop, but its fallback continuation collided with an active Codex turn. A fresh-session gate also treated the warning threshold as a reason to reject resume before the stop. These observations prevent validating the stop completion and progress pointer.
- The native Codex parent did launch a child in the UI, but the host missed linkage and overflowed its early-event buffer. No child budget decision was logged. The existing log exposes only two notification method names, insufficient to reconstruct the start order.
- Electron regenerated MCP configuration inside the scratch folder. This violates the requested config-free test isolation even though the prompts restricted reads and no secrets were printed. The generated files were removed during cleanup.

## Cleanup

Stopped only the owned Electron process tree and confirmed port 9348 was closed. Restored Dev settings byte-for-byte and deleted the backup. Restored the scratch folder's original entries, removed app-generated MCP configuration copies and the temporary CDP script. Removed an app-generated `.gitignore` line, leaving no tracked source change. Production raw and canonical hashes remained unchanged at the final checkpoint. No commit, push, merge, extra build, serve, e2e, or package target was run.

## Decisions

- Closed the three oldest completed test sessions because the rerun explicitly authorized closing earlier live-test sessions; the board showed them completed and retained their history. Reversible by reopening those sessions.
- Reused the existing build because HEAD matched the requested SHA and the user specified rebuilding only if it changed. Reversible by running the documented build sequence later.
