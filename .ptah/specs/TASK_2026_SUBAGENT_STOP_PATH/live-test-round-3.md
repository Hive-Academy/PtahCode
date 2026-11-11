# Ptah Dev Electron live test — round 3

Date: 2026-11-07. Worktree: `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path`. HEAD: `b6a85e268`.

**Attempt 1 aborted.** PID 24380 was initially mistaken for a Ptah Dev instance. The coordinator confirmed from its command line that it was a Playwright docs capture with an isolated `--user-data-dir` and no Ptah Dev profile lock. It and child 31968 were left untouched. This report covers the resumed run.

## Isolation gate

| Check | Result | Evidence |
| --- | --- | --- |
| #978 included | PASS | `git merge-base --is-ancestor 28f5c97ac HEAD` exited 0. `apps/ptah-electron/src/main.ts:72` sets `PTAH_SETTINGS_DIR` to `path.join(homedir(), '.ptah-dev')`. |
| Production baseline | PASS | `C:\Users\dev\.ptah\settings.json` SHA-256: `54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238`, matching expected prefix. |
| Dev lock | PASS | Prelaunch process command lines showed no unowned instance using the Ptah Dev profile. PID 24380 used a separate docs-capture profile. |
| Backup and restore | PASS | `C:\Users\dev\.ptah-dev\settings.json.bak-livetest3` SHA-256 `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`. Restored Dev settings matched that hash at end, with budgets 150000/3000000 and Haiku tier `gpt-5.6-luna`. |
| Isolation throughout | PASS | Production hash was rechecked after every Dev settings change, each launch, UI provider save, and cleanup; always identical to baseline. |

## Setup

The required commands succeeded in order: `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron` (19:27:29Z); `node scripts/copy-wasm.js dist/apps/ptah-electron`; `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron` (19:29:12Z). No tests, serve, e2e, or workspace-wide check ran.

Port **9343** was free before launch. Each launch used `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, `PTAH_NO_DEVTOOLS=1`, and `node apps/ptah-electron/scripts/launch.js --remote-debugging-port=9343`. Production Ptah root PID **26500** remained running and untouched. Scratch workspace: `.ptah/live-test-ws`. Log below: `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-07.log` (one-based lines, UTC timestamps).

| Run | Own Dev root PID | Handoff | Weighted stop | Dev settings SHA-256 after edit | Actual model |
| --- | ---: | ---: | ---: | --- | --- |
| Recovery launch | 47216 | — | — | — | None |
| 1 handoff | 16156 | 25000 | 100000000 | `EB026B11992BAF96ADFC058520B0F479AAA695B9AADA35C8F2586D3C209D1EF3` | `claude-haiku-5-5` |
| 2 steer | 49864 | 2000000 | 100000000 | `2514A13A97532995465734B62168194AB54FDE616E8AED80CA332DEB7C279174` | `claude-haiku-5-5` |
| 3 safety | 33696 | 2000000 | 60000 | `069B2C2BC6DF727C47958841EEA61FB14030228E03C11F5F11ED940A33AF126E` | `claude-haiku-5-5` |
| 4 Codex | 49672 | 25000 | 100000000 | Same as run 1 before UI switch | `gpt-5.6-luna` |

The first PowerShell settings rewrite produced a Dev settings load failure; the app rewrote its Dev file to 118 bytes. Root 47216 and its descendants were stopped immediately, the backup restored, and later temporary edits used Node JSON parsing. Production hash stayed unchanged.

## Scenario 1 — handoff stop

The UI selected Haiku 5.5. A general-purpose subagent was asked to read scratch notes one by one.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 85% notice before stop | **FAIL** | No `Near-budget warning queued` line in this run. First relevant usage jumped over the 25000 limit, reaching 32080 context tokens. Exact source message at `subagent-handoff-message.ts:48` begins: “Ptah budget notice: your context is at ${contextTokens} tokens, close to the ${handoffTokens}-token limit at which Ptah's subagent budget monitor stops this subagent.” No delivery was observed before stop. |
| Monitor sees budget and stops for handoff | **PASS** | 19:32:07.959Z SubagentStart, line 12258; 19:32:12.817Z `[SubagentBudgetMonitor] Subagent stopped`, `reason=handoff`, `contextTokens=32080`, `weightedUsed=43458`, line 12308. |
| Handoff records progress | **PASS** | Record saved 19:32:12.812Z, line 12301. [Record](../../live-test-ws/.ptah/subagent-handoffs/20261107T193212808Z-608ce3017e5e7af5-toolu_01TPRv8CmPmKMwqsugXEbLY9-7c4a0345.handoff.md) says “Read note-01.txt (1 of 15) - done”, names the completed Read, says Ptah stopped the agent, and says it cannot be resumed. |
| Secrets redacted | **NOT PROVEN** | No secret marker was used; no redaction test was possible. No secret values are in this report. |
| Main text attributes stop to Ptah | **FAIL** | Handoff was sent as parent user turn 19:32:12.818Z, line 12310, yet visible main reply reported “stopped by user” and said no Ptah stop message or handoff path was present. |
| No cache-warm or resume-now advice | **PASS** | The record says the stopped agent cannot be resumed and suggests a fresh agent if work remains. The visible reply gave no cache-warm or resume-now advice. |
| Stopped-agent SendMessage refused with guidance | **NOT PROVEN** | A follow-up requested SendMessage to the stopped agent; the UI remained working about 90 seconds and no refusal appeared before the Dev run was stopped. |
| Follow-up succeeds | **NOT PROVEN** | The follow-up did not finish during observation. |
| Model ID | **PASS** | SDK `model=haiku` at 19:31:59.038Z, line 12152; usage `claude-haiku-5-5` at 19:32:11.153Z, line 12281. |

At 19:32:12.817Z, line 12307, the monitor warned `Budget stop succeeded without an agent id; signal not published`. This may relate to the parent misattribution but the log does not prove causation. Parent-turn diagnostic at 19:32:12.819Z, line 12313, has `abortSignalAborted=false`, `pendingPermissionRequests=0`. [Screenshot](live-test-3/scenario1-stop.png) was taken while the run was active, so it is not proof of the final reply.

## Scenario 2 — steer allowed

The prompt requested a slow background general-purpose subagent and a SendMessage steer while it ran; a second prompt repeated the steer request.

| Criterion | Result | Evidence |
| --- | --- | --- |
| Background agent running | **FAIL** | SubagentStart 19:36:28.935Z, line 14033; normal SubagentStop hook 19:37:15.104Z, line 14299; completion says `isBackground=false` at 19:37:15.108Z, line 14304. |
| SendMessage steer allowed | **NOT PROVEN** | No SendMessage permission or accepted steer appeared before completion. The foreground run did not exercise the requested path. The normal SubagentStop hook is not a budget stop. |
| Model ID | **PASS** | Usage lines 14281 and 14320 show `claude-haiku-5-5`. |

## Scenario 3 — safety stop

| Criterion | Result | Evidence |
| --- | --- | --- |
| Safety stop | **PASS** | SubagentStart 19:38:50.058Z, line 15705; monitor stop 19:38:58.777Z, line 15787, `reason=safety`, `contextTokens=37276`, `weightedUsed=63453` against 60000. |
| Chat usable afterward | **PASS** | Parent visibly described Ptah's automatic stop, not a user stop. A later simple prompt received `OK`. [Screenshot](live-test-3/scenario3-safety.png). |
| Model ID | **PASS** | Usage lines 15800 and 15831 show `claude-haiku-5-5`. |

Parent-turn diagnostic 19:38:58.778Z, line 15790: `abortSignalAborted=false`, `pendingPermissionRequests=0`.

## Scenario 4 — OpenAI Codex

Settings showed Connected OAuth. The Dev UI selected `gpt-5.6-luna` ([screenshot](live-test-3/scenario4-luna.png)). Dev settings key `settings.app.electron.workspace.4fe322142059d599.provider.thirdParty.openai-codex.selectedModel` was `gpt-5.6-luna`; `settings.provider.openai-codex.mainAgent.modelTier.haiku` was also `gpt-5.6-luna`. After UI save, Dev hash was `2FE9DF5B1779CC470E48A5FAFA4EF585445592975AB0A153D4CE30C80F4F1C1F`; production stayed unchanged.

| Criterion | Result | Evidence |
| --- | --- | --- |
| Main and child use selected model | **PASS** | `ModelDiag savedModel=gpt-5.6-luna` at 19:42:05.465Z, line 17594, and 19:42:26.886Z, line 17743. Main usage at 19:43:20.570Z, line 17978, says `gpt-5.6-luna`. Main rollout `rollout-2026-11-07T21-42-38-01a1b788-cbc5-7e72-b002-418bf9e84c4c.jsonl` and child rollout `rollout-2026-11-07T21-42-48-01a1b788-f431-7430-9f98-c5a5c84459e9.jsonl` under `C:\Users\dev\.codex\sessions\2026\11\07` both record `model=gpt-5.6-luna`; child metadata links to main thread and scratch cwd. Round 2's wrong-model finding did not recur. |
| Handoff stop, progress, parent attribution | **NOT PROVEN** | No `[SubagentBudgetMonitor]` event appeared after Codex launch. UI still showed the run active at 19:44:31Z; Dev was stopped to avoid further model cost. No attributed handoff record or completed parent reply. |
| Secret redaction | **NOT PROVEN** | No handoff record or secret marker. |

## Defect 6 — permission denial after stop

**Partially reproduced; fields unavailable.** The scenario 3 parent reply said Read of the handoff and task files “was denied.” A search of the relevant Dev log interval found no `[SdkPermissionHandler] Permission decision`, `Permission response received`, `Permission response handled`, `declined`, or `The user doesn't want to take this action` entry. Thus `route`, `decisionSource`, `interrupt`, and `recentSubagentBudgetStop` cannot be quoted without inventing values. The available `[SessionQueryExecutor] Subagent budget stop parent turn` at **19:38:58.778Z, line 15790** reports `abortSignalAborted=false`, `pendingPermissionRequests=0`. It does not log the other requested fields. The missing telemetry is an instrumentation gap; the visible denial alone does not establish its permission route.

## Production settings unchanged; cleanup

Production SHA-256 before and after: `54FADE38980C3A9E6013B5FFEEAA6917165AD44E5FAC5CF7F4CA84E423B75238`. It matched after each temporary Dev settings change and launch. The production file was never edited. Production Ptah PID 26500 and its children were never stopped or touched.

All five own Dev roots (47216, 16156, 49864, 33696, 49672) and their descendants were stopped; final own-root count was zero. The isolated docs capture was not targeted. Dev settings were restored from backup with matching SHA-256 `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`. Screenshots are under [live-test-3](live-test-3/); scratch files remain under `.ptah/live-test-ws`.

## Findings

1. Handoff monitor stop worked, but no 85% warning preceded it and the parent misattributed the stop to the user. Log line 12307 reports no agent-id signal.
2. Safety monitor stop worked and the parent chat remained usable.
3. Background steer, stopped-agent SendMessage refusal, and scenario 1 follow-up remain unproven.
4. Codex selected, main, and child models all matched `gpt-5.6-luna`; its handoff path did not reach a budget stop during observation.
5. The parent-visible Read denial lacks the requested permission decision telemetry.

## Decisions

- Followed the coordinator's command-line and lock finding to classify the isolated docs capture outside the Ptah Dev gate. This was reversible and left that process untouched.
- Marked outcomes without a corresponding completed UI response or log event **NOT PROVEN**.
