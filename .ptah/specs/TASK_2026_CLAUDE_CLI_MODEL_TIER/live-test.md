# Ptah Dev Electron live test — Claude CLI model tier

Date: 2026-11-08 local (2026-11-07 UTC). Built from this worktree. Log citations are one-based lines in `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`.

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| Required ancestor | PASS | `git merge-base --is-ancestor 5a88ce09d HEAD` exited 0. |
| Production raw SHA-256 | PASS | Start, after launch, and final: `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a`. No Dev settings edit occurred. |
| Production canonical SHA-256 | PASS | Recursive key sort, JSON stringify, SHA-256 at the same checkpoints: `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb`. No reserialization or canonical change. Production settings were read for hashes only. |
| Dev settings backup and restore | PASS | `settings.json.bak-claude-cli-model-tier` and restored `settings.json` both have raw SHA-256 `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6`. No settings edit was needed. |
| Dev process ownership | PASS | Prelaunch query found zero Ptah Dev Electron processes. Owned launcher PID 3536 and Electron root PID 13612 were stopped. Final query found zero Ptah Dev Electron processes. Production and other Electron instances were untouched. |

## Setup

The required commands succeeded in order: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron` (exit 0), `node scripts/copy-wasm.js dist/apps/ptah-electron` (exit 0), and `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron` (exit 0). The launch used `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, and remote debugging port 65491. The scratch workspace was `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path\.ptah\live-test-ws`. The UI showed **Haiku 5.5** in [the fresh session](live-test/session-a.png); log lines 3200-3201 show saved model `haiku` and the selected Haiku 5.5 option. The parent SDK query started with `model: "haiku"` (line 3325), and parent usage recorded `claude-haiku-5-5`, cost $0.004891 (line 3413).

## Scenario A — `cli: "claude"`, `modelTier: "haiku"`, no `model`

**FAIL / blocked before spawn.** The Haiku parent was asked to call `ptah_agent_spawn` once with those arguments and a one-word-OK task. Its visible response says the Ptah MCP server returned HTTP 403 `AUTH_HEADER_REJECTED`, so the tool was unavailable and nothing was spawned: [UI capture](live-test/a-result.png). The Dev log line 3353 records `ptah` as `status: "failed"` with zero eager-loaded Ptah MCP tools. No dispatcher spawn args, lane policy/model, lane SDK init/session model, completion usage label, SDK `modelUsage` keys, or lane cost exist for this attempt. The $0.004891 above is **parent** cost, not lane cost. Thus the model-tier fix was not exercised live.

## Scenario B — `cli: "claude"`, `model: "haiku"`

**NOT RUN.** The same parent Ptah MCP connection was unavailable after A. A second paid parent call could not reach `ptah_agent_spawn`; no B lane evidence exists.

## Findings

The live verification is inconclusive for both requested lane paths because the parent session's Ptah MCP connection failed before a spawn. The HTTP 403 is visible in the UI; the log confirms the failed MCP state. This report does not infer a lane model from the parent model. Repairing the Ptah MCP authorization path and rerunning both cases is necessary to establish the requested PASS criteria.

## Cleanup

Stopped only the owned Ptah Dev launcher and Electron root; final Ptah Dev process count was zero. Restored Dev settings byte-for-byte from the backup and verified its hash. Final production raw and canonical hashes match the starting values. No source edit, commit, push, PR, test, serve, or e2e command was run by this lane.

## Decisions

- Stopped after the first failed spawn attempt because the failed MCP connection is a prerequisite for both scenarios; repeating a paid parent request would not produce lane evidence without an external authorization change. Reversible.
