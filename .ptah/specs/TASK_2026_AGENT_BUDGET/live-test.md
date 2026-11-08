# Ptah Dev Electron live test — TASK_2026_AGENT_BUDGET

Date: 2026-11-08 (Africa/Cairo). Worktree head `5a8411a147189b2738ecf8c158af9071947f10f9`. Log references are one-based lines in `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`. The selected, sanitized lines are in [sanitized-budget-log.txt](live-test/sanitized-budget-log.txt).

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| PR #978 ancestor | PASS | `git merge-base --is-ancestor 8aaa227e7 HEAD` exited 0. |
| Production settings raw SHA-256 | PASS | Start, after Dev edit, after launch, end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. Production settings were read only for hashes. |
| Production settings canonical SHA-256 | PASS | Recursive key sort and `JSON.stringify`, same four checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. |
| Dev settings restoration | PASS | Backed up `C:\Users\abdal\.ptah-dev\settings.json` before editing. Backup and restored bytes both hash to `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`; backup removed. |
| Process ownership | PASS | Prelaunch Ptah Dev process query returned zero. Owned Node launcher PID 47032 and Electron root PID 46056 were launched on port 9348 and stopped. Final query found neither PID nor an Electron process on 9348. |

## Setup

The prescribed `build-dev`, `copy-wasm`, and `copy-renderer-dev` commands all exited 0, in order. Dev-only Node JSON edit set `agentBudget.warnRatio=0.85`, `stopWeightedTokens=60000`, and `handoffContextTokens=40000`. Launch used `PTAH_NO_DEVTOOLS=1`, remote debugging port 9348, and `.ptah/live-test-ws` as the scratch workspace. CDP drove the Electron renderer. [Initial UI](live-test/initial.png), [Codex lane progress](live-test/lane-progress.png), and [budget result](live-test/budget-result.png) are captured.

## Checks

| Criterion | Result | Evidence |
| --- | --- | --- |
| A: Codex lane starts with true CLI session ID and observed model | PASS | Log 36130 binds agent `733f9a78` to CLI session `01a1b989-9189-7b60-b4d0-0d6172cbf007`; log 36119 reports actual model `gpt-6-sol` (the app chose its default, despite the cheap-model request). |
| A: Real per-turn input/output telemetry, one warning near 85% | **FAIL to establish** | No per-turn input/output figures or `[LaneBudgetTelemetry] Budget warning delivered` entry appeared for the test interval. The UI parent explicitly reported no warning. No warning count or 85% threshold claim is supported. |
| A: Ptah-attributed stop with `budget` reason | PASS | Log 36284 says `[AgentProcessManager] Lane guard tripped; stopping` with `stopReason:"budget"`; log 36306 records stopped exit. The UI parent reported completion reason `budget`. A second fresh session repeated the stop at log 36648. |
| A: Exhausted session cannot resume | PASS for admission gate | Log 36350 records `decision:"fresh"`, `reason:"CLI session cannot resume after budget stop"`; log 36363 shows a different CLI session ID. The app did not return a plain refusal: it started a fresh handoff lane. |
| A: 2 s usage drain / telemetry-unavailable turn | **FAIL to establish** | Neither a drain outcome nor a telemetry-unavailable turn was exposed in the sanitized log or UI evidence. The missing per-turn figures prevent attributing this to a particular cause. |
| B: Codex-provider child attribution, single charge, ~40k handoff, stop | **FAIL to establish** | No Codex-provider child run was established. Batch F states `CodexChildBudgetTap` is not instantiated by the production runtime and has no host settings/pricing caller; the observed Codex activity was CLI lanes spawned from a Claude-provider chat, which cannot prove child decisions. No child warning, handoff, or stop is claimed. |
| C: Claude CLI lane telemetry and resume cost gap | NOT EXERCISED | Optional check was not run. |

## Findings

The CLI budget admission and stop paths worked for the observed Codex lane. Warning delivery and numeric turn telemetry remain unproven in this run; the 60,000 weighted-token limit appears to have been crossed before a warning was visible. The selected model was `gpt-6-sol`, so the cheap-model condition was not met. The resume gate correctly prevented continuation of the exhausted CLI session, while its outward behavior was a new handoff lane. Batch F's unconnected child tap prevents an end-to-end child budget claim. The second Codex attempt produced the same budget stop (log 36648), and the chat was interrupted to avoid further lane creation.

## Cleanup

Stopped only the owned launcher and Electron root. Restored the Dev settings byte-for-byte, verified their hash, and deleted the backup. Removed Ptah's incidental `.gitignore` addition from this launch; the file has no remaining diff. Production raw and canonical hashes still match the start. Temporary CDP and settings scripts were removed after evidence capture. No source code was intentionally edited, and there was no commit, push, merge, other build target, serve target, e2e target, or package target.

## Decisions

- Counted the `decision:"fresh"` resume outcome as a successful admission gate, while describing the outward new-lane behavior separately. Evidence: log 36350 and 36363. Reversible interpretation if the acceptance criterion requires a hard error instead.
- Marked child behavior **FAIL to establish** because the documented production caller is absent and this run did not create a Codex-provider child. Reversible after Batch B wiring and a live child run.
