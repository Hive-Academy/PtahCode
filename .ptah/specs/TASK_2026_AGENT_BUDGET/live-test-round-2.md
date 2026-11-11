# Ptah Dev live test round 2 — TASK_2026_AGENT_BUDGET

Date: 2026-11-08 (Africa/Cairo). Worktree head `dcf9e5c8818d432c96b10e0e088ee55e55260797`. Log references are one-based lines in `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`; selected lines appear in [sanitized-log.txt](live-test-round-2/sanitized-log.txt). No prompt text, MCP URL, credential, or secret is included in the excerpt.

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestor | PASS | `git merge-base --is-ancestor 8aaa227e7 HEAD` exited 0. |
| Production settings, raw SHA-256 | PASS | Start, after Dev edit, after launch, end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. Production file was read by test commands for hashes only. |
| Production settings, canonical SHA-256 | PASS | Recursive key sort plus JSON stringify at the same four checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. |
| Dev settings baseline and restoration | PASS | Initial, backup, and final raw SHA-256: `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. Backup and restored bytes matched; backup deleted. |
| Process isolation | PASS | No Ptah Dev process before launch. Owned Node launcher PID 25788, Electron root PID 49936, and their descendants were tracked. Port 9348 served CDP after launch; all 28 owned descendants were stopped and port closed. |

## Setup

The required `build-dev`, `copy-wasm`, and `copy-renderer-dev` commands ran in that order and exited 0; both Nx targets used the verify lock. The Dev settings JSON was edited with Node to set `agentBudget.warnRatio=0.85`, `stopWeightedTokens=300000`, and `handoffContextTokens=40000`. The scratch workspace was `.ptah/live-test-ws`. The successful launch used `NODE_ENV=development`, `PTAH_NO_DEVTOOLS=1`, and `--remote-debugging-port=9348`. CDP drove the Electron renderer. An initial launch omitted `NODE_ENV=development` and exited without a running process or CDP endpoint; the corrected launch was the one tested. Its production settings hash remained unchanged.

Check A ran in a Claude-provider chat using a Codex CLI lane. Check B ran in a separate native OpenAI Codex-provider chat; the Dev desktop main-agent selection was changed through the UI after A finished. Log 52266 confirms `authMethod=thirdParty` and `anthropicProviderId=openai-codex`; log 52330 confirms the active provider. The UI showed `OpenAI Codex` for the B chat.

## Checks

| Criterion | Result | Evidence |
| --- | --- | --- |
| A: true CLI Session ID and observed inexpensive model | PASS | Log 51522 binds the lane to CLI session `01a1b9b4-0a68-7d72-aa91-db712881c397`. Logs 50931–51512 show observed model `gpt-6-luna`, selected by the parent as its cheapest available Codex option. |
| A: real per-turn input/output telemetry and cost authority | PASS | Five `Accepted lane turn` records at 50931, 51034, 51141, 51414, 51512. They contain numeric input/output/cache tokens, weighted totals 74,669 → 124,416 → 180,926 → 242,052 → 305,692, ratios 0.249 → 0.415 → 0.603 → 0.807 → 1.019, and `costAuthority:"catalog"`. |
| A: exactly one warning near 85% or in stop message | FAIL | One warning event is logged at 51516 on the fifth turn, after the ratio jumped from 0.807 to 1.019; there is no separate near-85% turn. Its delivery mode is `unsupported`. The UI did not independently establish that the stop envelope carried the warning. The log proves one warning event, not successful delivery. |
| A: budget stop and stop source | PASS | Log 51513 says `Agent budget tripped; stopping` and `stopReason:"budget"`, with zero repeats and zero tool calls. The parent UI identified the same 300,000 weighted-token budget stop. |
| A: progress pointer in completion | FAIL | The parent UI referred to starting a fresh lane for remaining work, but no specific progress pointer was established from the captured log or UI text. |
| A: exhausted-session resume refused/fresh | PASS | Log 51583 records `decision:"fresh"`, reason `CLI session cannot resume after budget stop`; log 51601 records different CLI session `01a1b9b5-e71b-78b1-a366-4cc3c49faa8f`. The outward behavior was a fresh handoff lane, not a plain error. |
| A: telemetry-unavailable log and reason | NOT EXERCISED | The five observed turns had usable totals. No `Lane turn telemetry unavailable` or `telemetry-unavailable` stop appeared in the test interval; no missing-totals turn was induced. |
| B: native Codex child thread started | FAIL | The native Codex parent claimed a child named `/root/readme_inspection` and reported three read-only findings. Host log 52510–52511 instead records `Codex early child event buffer overflow` because native child linkage was not reported within the buffer limit. A host-confirmed child thread ID was not established. |
| B: one observer charge per child turn, no double charge | FAIL | No `[Codex budget] Child budget decision` entry appeared for this native chat. The lost linkage prevents proving attribution or charge count. |
| B: decision at about 40,000 context tokens | FAIL | No child observer decision or context-token threshold was logged. The observer is advisory only; no stop is claimed. |
| C: Claude CLI telemetry and resume-cost gap | NOT EXERCISED | Optional check was not run. |

## Findings

A's numeric telemetry and budget stop are live-proven. The warning is recorded once, but `mode:"unsupported"` means delivery was not demonstrated. The 300,000 limit was crossed in a single turn from 80.7% to 101.9%; it did not produce an observable warning near 85%. Native Codex chat reached the parent model, but the child-linkage buffer overflow at 52510–52511 is a concrete blocker for validating the child observer. The parent reported child work, yet the host did not log a linked child or budget decisions. The parent in A read a scratch MCP config that exposed an endpoint token in its own UI output; that content is excluded from this report and sanitized evidence.

## Cleanup

Stopped only launcher PID 25788, Electron root PID 49936, and their 26 tracked descendants; no owned process remained and port 9348 was closed. Restored Dev settings byte-for-byte and deleted the backup. Removed the temporary CDP script and the incidental `.gitignore` addition made by Ptah during launch; `git status` shows only this report/evidence directory. Production raw and canonical hashes still match their start values. No source code, commit, push, merge, other build target, serve target, e2e target, or package target was used.

## Decisions

- Counted the resume admission gate as PASS because it blocked continuation of the exhausted CLI session and created a different session; a hard-error-only interpretation would mark the outward behavior differently. Evidence: logs 51583 and 51601. Reversible interpretation.
- Marked native child start as FAIL to establish despite the parent’s self-report, because the host explicitly reported missing linkage and supplied no confirmed child ID. Evidence: logs 52510–52511. Reversible after a linked live run.
