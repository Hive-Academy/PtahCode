# Live test: SDK subagent budget stop handoff

Date: 2026-11-08. Result: **FAIL**. The foreground and noncooperative forced stops were attributed to a user interruption in the parent's first reply. The background normal exit did continue autonomously, but no durable normal-exit handoff record was observed. The requested three-denial / 45-second safety route was not reached.

## Setup and evidence locations

- Before launch, no process using the Ptah Dev user-data directory was running. The existing `live-integration` worktree was clean. Detached merge of `origin/main` and `fix/subagent-stop-handoff` succeeded; both `5a88ce09d` and `5839a7a58` are ancestors of the merged HEAD. Its `node_modules` junction points to the main checkout.
- All three requested commands exited 0, in order: `build-dev` (35.6 s), `copy-wasm`, `copy-renderer-dev` (1m22s). Launched Dev with `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, CDP port 9351, launcher PID 51596 and Electron root PID 23460.
- Fresh chats in the 40-note scratch workspace: `stop-handoff-foreground` (SDK session `8e8d676d-48d7-4d8b-8709-7ce7172555a3`), `stop-handoff-background` (`928c2d1e-9173-455a-b208-37baf115af67`), `stop-handoff-noncooperative` (`05ce5fc3-193a-438e-806f-602c3c93727e`). UI showed Haiku 5.5 for each. The first chat unexpectedly spawned a Codex CLI lane despite the task; later chats explicitly forbade lanes and show zero CLI runs.
- Log: `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-08.log`, line numbers below. Claude SDK JSONL is under `C:\Users\abdal\.claude\projects\D--projects-ptah-extension--claude-worktrees-subagent-budget-stop-path--ptah-live-test-ws\<session-id>.jsonl`. Screenshots: [foreground-running.png](foreground-running.png), [background-running.png](background-running.png), [noncooperative-stopped.png](noncooperative-stopped.png). The CDP UI was also inspected after each stop; quotations below are from that visible parent turn. Screenshots were captured during the runs, not used to infer the final reply in isolation.

## Scenario 1: foreground Agent

| Check | Result | Evidence |
| --- | --- | --- |
| a. Hook order | **FAIL** | First Agent: `PreToolUse Agent` line 26044; `SubagentStop` 26154; parent `PostToolUse Agent` 26162, **after** SubagentStop. This Agent delegated to a CLI lane and returned. Second Agent: warning 26608, forced stop 26684, parent `PostToolUseFailure Agent` 26691; no `SubagentStop`, `TaskCompleted`, or parent `PostToolUse` for that forced call. Read calls show PreToolUse then PostToolUse, e.g. 26270-26271. |
| b. First parent reply | **FAIL** | First reply after the forced Agent stop says “Your interrupt stopped the spawn call” while also acknowledging Ptah's budget monitor. It asks which option to take. JSONL line 102 for tool `toolu_01TRYS2EsnZjsVGgNoZx4ybH` contains `[Request interrupted by user for tool use]`. |
| c. Continue without user | **PASS, delayed** | After a later CLI lane report, the parent read two notes and completed a synthesis without a new human turn. Its first reply had already asked for input. |
| d. Notes | **PASS** | `toolu_01TRYS2EsnZjsVGgNoZx4ybH.md` (2,029 bytes) and a single `.handoff.md` record (3,839 bytes) exist; `toolu_01LQj8kcCMjoYKrysJTztfi3.md` also exists. Notes were host-generated/inferred where needed. |
| e. Exactly once | **FAIL (not established)** | Each stopped tool has one durable record, but the first response and later continuation contain different handoff presentations. The JSONL interrupt result contains no repair context, so one-shot parent delivery through `additionalContext` is not demonstrated. |

The first Agent's normal SubagentStop preceded parent PostToolUse, satisfying the order assumption for that call. The second forced call demonstrates the SDK drops the attempted repair from the visible tool result. Root-cause hypothesis: `subagent-budget-hooks.ts:50-60` returns `PostToolUseFailure.additionalContext`, while `subagent-budget-monitor.ts:897-906` immediately claims the handoff as delivered. The SDK emits its own interruption tool result instead, as JSONL line 102 shows. The delayed queued/index fallback can then arrive too late for the first parent reply.

## Scenario 2: background Agent

| Check | Result | Evidence |
| --- | --- | --- |
| a. Hook order | **FAIL (incomplete hook path)** | Warning at line 27339 (54,133 context tokens), notes `Write` PostToolUse at 27420, `SubagentStop` 27428, SDK task notification at 27435. The parent Agent PostToolUse was the earlier launch result, not an after-stop result. No `TaskCompleted` or `PostToolUseFailure` appeared for this agent. |
| b. First parent reply | **FAIL (strict wording)** | The first text after completion says “The subagent stopped at a budget warning after reading 10 of the 40 notes.” It avoids user attribution but does not name **Ptah**. The final synthesis later says “Ptah budget warning.” |
| c. Continue without user | **PASS** | The parent read notes 11-40 and completed a synthesis in the same chat without another user message. The UI showed the completed turn and zero running agents. |
| d. Notes | **PASS** | Agent-written `toolu_01JWL3UFuwZzSwEUub12Bd2Q.md` exists (1,543 bytes); the parent read it. |
| e. Exactly once | **FAIL (not established)** | One SDK completion notification was observed, but no `.handoff.md` durable record for this tool ID was found. The background Agent launch JSONL line 33 is an async launch result, so it cannot prove same-turn handoff delivery. |

Root-cause hypothesis for the missing normal record: `subagent-budget-monitor.ts:828-849` returns early if the notes gate is absent or the state is already stopping, and `:1401-1409` requires a running registry record for one lookup. The log shows SubagentStop and registry completion immediately afterward. The exact early-return condition needs instrumentation; this run does not prove which branch fired.

## Scenario 3: noncooperative Agent

| Check | Result | Evidence |
| --- | --- | --- |
| a. Hook order and safety stop | **FAIL** | First warning/stop at lines 28280/28288 (101,376 context tokens), then `PostToolUseFailure Agent` 28295. Replacements repeat at 28469/28609/28616, 28791/28928/28935, and 29177/29185/29192. No `SubagentStop` or `TaskCompleted` appeared for these forced calls; no three-denial or 45-second safety-stop log was observed. The context estimate jumped over 60,000, so the ordinary forced stop won before the gate path could be exercised. |
| b. First parent reply | **FAIL** | The first reply says “The Agent call was interrupted by the user before it ran” and asks for confirmation. JSONL line 35 for tool `toolu_016Xeze625a31k7dvb97KTmg` contains `[Request interrupted by user for tool use]`. Later replies repeat the user-interruption claim. |
| c. Continue without user | **PASS, delayed** | After reading each handoff record, the parent launched replacement Agents without another user message. It repeatedly asked for input first, and the run was stopped during a fifth replacement to prevent an unbounded loop. |
| d. Notes | **PASS** | Host-generated inferred `toolu_016Xeze625a31k7dvb97KTmg.md` exists (1,980 bytes), with a corresponding `.handoff.md` record (3,791 bytes). Further replacements also produced notes and records. |
| e. Exactly once | **FAIL** | The parent received a chain of distinct handoff records and repeated the same erroneous interruption explanation. Delivery of each individual record through the claimed one-shot `additionalContext` path is not visible in the JSONL tool results. |

The prompt explicitly requested continued `Read` after a budget notice. For the first Agent, the monitor's context estimate was already 101,376 at its first warning, and it stopped 17 ms later. That prevented three gate denials. The failure is an unmet live scenario, not proof that the gate's denial counter is broken. The parent-attribution failure has the same likely cause as foreground: `subagent-budget-hooks.ts:57-60` adds repair context to PostToolUseFailure, but the SDK tool result still says the user interrupted, and `subagent-budget-monitor.ts:897-906` has already claimed the handoff.

## Decisions

- Counted a later autonomous continuation as check c passing, while keeping check b failed because its first reply had already asked for input or misattributed the stop. This is reversible if acceptance requires uninterrupted continuation from the first reply.
- Marked check e failed where exact once could not be proven from the parent-visible JSONL result. A single durable record does not establish that its text reached the parent once.
- Stopped the noncooperative chat during a fifth replacement. Four prior forced stops already established the repeated parent-attribution failure; the intended denial path was not reached.

## Isolation

| Check | Before | After |
| --- | --- | --- |
| Production settings raw SHA-256 | `780f1063cb844f461dac8fa5c11d14c565af2afe02c805253824527ab4b1c01a` | same |
| Production settings canonical sorted-key SHA-256 | `321e5a3bccff6840ed43c6d7e85f35f193ccf575b7fd71db5e09ec80c1e44abb` | same |
| Dev settings raw SHA-256 | `3b727d826f40043dcc6e879b9023db60a075c4fbd67ed945ba5ac738d694fad6` | same after byte-for-byte restore from `settings.live-stop-handoff-backup-20261108-050748.json` |
| Dev processes | none | Electron root PID 23460 and launcher PID 51596 stopped; final process query found none using the Ptah Dev user-data directory or CDP port 9351 |

Only the Dev settings were edited for the run: `compaction.subagentHandoffTokens=60000`, Claude model tiers to Haiku and non-Claude tiers to `openai-codex` `gpt-5.6-luna`. Production settings were read for hashes only. No source files were edited, and no commit, push, PR, workspace-wide check, serve, e2e, or package target was run. The detached `live-integration` worktree remains in place.
