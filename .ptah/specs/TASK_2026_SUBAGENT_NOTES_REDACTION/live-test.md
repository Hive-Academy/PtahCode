# Ptah Dev Electron live test — subagent notes redaction

Date: 2026-11-08 local (Africa/Cairo). Built from this worktree. Log references below are one-based lines in `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`; log timestamps are UTC. The fake marker was assembled from parts in the chat prompt and is not printed here.

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestor | PASS | `git merge-base --is-ancestor 5a88ce09d HEAD` exited 0. |
| Production raw SHA-256 | PASS | Start, after the Dev settings edit, after launch, and end: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. No raw-only reserialization occurred. Production settings were read for hashes only. |
| Production canonical SHA-256 | PASS | Recursive key sort, JSON stringify, SHA-256 at the same four checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. No canonical change. |
| Dev settings backup and restore | PASS | Backup and byte-for-byte restored `C:\Users\abdal\.ptah-dev\settings.json` SHA-256: `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`. Temporary backup was removed after verification. |
| Dev process ownership | PASS | Prelaunch query found zero Ptah Dev processes. Owned node launcher PID 37660 spawned Electron root PID 34156 from this worktree on port 9347; only those roots were stopped. Final Ptah Dev Electron count was zero. |

## Setup

The required commands ran in order and all exited 0: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`; `node scripts/copy-wasm.js dist/apps/ptah-electron`; `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron`. Dev settings were edited with Node JSON only: `compaction.subagentHandoffTokens=60000`; the weighted stop stayed 3,000,000. Launch used `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, and remote debugging port 9347. The UI showed Haiku 5.5 ([first stop](live-test/first-stop.png), [retry](live-test/retry-stop.png)); log lines 5014 and 5271 record `claude-haiku-5-5`. The UI workspace was the existing 40-note `subagent-budget-stop-path/.ptah/live-test-ws` scratch workspace.

## Checks

| Criterion | Result | Evidence |
| --- | --- | --- |
| One SDK subagent receives a near-budget notice and stops | PASS in first attempt | SDK `SubagentStart` lines 4834–4838; notice queued at 4938 (`contextTokens=51751`) and present in subagent transcript line 89; handoff saved at 4977 and task-scoped stop at 4978. The parent used the SDK Task tool. |
| Notes file replaces the fake marker with `[redacted]` and preserves four prose lines | **FAIL to establish** | The first notes file, `.ptah/subagent-handoffs/toolu_019wzmFG6MrDTbwZNeQVEV7o.md`, was never written. Its handoff record line 20 says it is missing. The retry's `toolu_012NiThqcQhz2UWGStr8BdqK.md` was also missing. The retry transcript has the notice at line 88, then six Read calls at lines 93, 98, 104, 109, 114, 119 and **zero Write calls**. Thus neither redaction nor prose preservation ran on an agent-written file. |
| Canonical handoff record and parent visible turn contain no fake marker | PASS for absence | Both canonical `.handoff.md` records were checked programmatically against the assembled fake marker and returned false. The CDP visible-turn check also returned false. This absence does not prove redaction because the notes file was absent. |
| No `.tmp` sibling and no notes-redaction warning | PASS for observed run, vacuous for rewrite | Neither expected notes path had a `.tmp` sibling. Log lines 4834–5500 contained no notes-redaction warning. A separate renderer warning at line 5115 concerns a missing session file and is unrelated. No notes rewrite was attempted. |
| Fresh subagent can read notes path | NOT EXERCISED | The parent spawned one retry subagent (line 5261), which read scratch notes but had no redacted notes path to read. The expected file did not exist. |

The retry reached a second near-budget notice at log line 5426 (`contextTokens=51045`), saved its canonical handoff at 5473, and stopped at 5474. Its SDK transcript line 88 contains the notice. The first parent reply incorrectly said the first agent never reached the notice; the Dev log and SDK transcript prove it did. The final parent reply again said no notice naming a path was found, while the retry transcript records one. These are parent reporting errors, separate from the unexercised file redactor.

## Findings

The requested end-to-end redaction result remains **unproven**. In two attempts, Haiku continued reading after the near-budget notice and never wrote its notes file, despite explicit instructions. The missing fixture prevents an honest PASS or FAIL judgment on the redactor itself. Both canonical records and the visible parent text omitted the fake marker, but neither had agent-written notes to sanitize. The parent marked both handoff records `status: dismissed` in the scratch workspace after stopping.

## Cleanup

Stopped only the owned Ptah Dev Electron root and launcher. Restored Dev settings byte-for-byte and verified the backup hash; removed the temporary backup and CDP eval script. Final production raw and canonical hashes matched their initial values. No source was edited by this test, and no commit, push, PR, test, serve, or e2e command was run. Existing source modifications shown by `git status --short` predated this live test; this run added this report and CDP screenshots in the task folder.

## Decisions

- Retried once after the first agent ignored the notice. The retry was defensible because the first attempt did not create the required notes fixture; it is reversible and isolated to the scratch workspace.
- Counted absence of the fake marker in the canonical record and visible turn separately from notes redaction. Evidence: both expected notes files were missing. This interpretation is reversible if a later run supplies an agent-written file.
