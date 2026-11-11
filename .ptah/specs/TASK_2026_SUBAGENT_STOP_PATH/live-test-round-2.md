# Ptah Dev Electron live test, round 2 — 2026-11-07

## Setup

- Worktree: `D:\projects\ptah-extension\.claude-worktrees\subagent-budget-stop-path`. Scratch workspace: `.ptah/live-test-ws` (15 note files, about 64 KB). No source file was edited during this live test. Screenshots are under [live-test-2](live-test-2/).
- Production Ptah PID 26500 was already running and was not stopped. No Ptah Dev instance was running before launch. Dev Electron PID 44684 was launched on CDP port 9342 with `CLAUDE_CODE_SUBAGENT_MODEL=haiku` and `PTAH_NO_DEVTOOLS=1`. Renderer was driven over CDP.
- Build completed with `node scripts/verify.mjs --exec --task build-dev -- npx nx build-dev ptah-electron`; then `node scripts/copy-wasm.js dist/apps/ptah-electron` and `node scripts/verify.mjs --exec --task copy-renderer-dev -- npx nx copy-renderer-dev ptah-electron` completed. No test, serve, e2e, or workspace-wide target was run.
- Backed up `C:\Users\dev\.ptah-dev\settings.json` to `settings.json.bak-livetest2` before changing budgets. Backup SHA-256: `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`. The dev provider settings selected Claude `haiku`; the `openai-codex` Haiku tier was `gpt-5.6-luna`. Codex readiness RPC reported signed in, and the app model list exposed `gpt-5.6-luna`.
- Budget settings per scenario: (1) handoff 25,000, weighted stop 100,000,000; (2) handoff 2,000,000, weighted stop 100,000,000; (3) handoff 2,000,000, weighted stop 60,000; (4) handoff 25,000, weighted stop 100,000,000. Claude sessions explicitly selected Haiku 5.5 in the UI because new chats displayed Opus 5.5 by default. Scenario 4 explicitly selected the displayed `gpt-5.6-luna` option. No secret values are included here.
- Log evidence below refers to `C:\Users\dev\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-07.log`. Line numbers are from that file after this run. A `SubagentStop` **hook** means the SDK agent finished; it is distinct from `[SubagentBudgetMonitor] Subagent stopped`.

## Scenario 1 — handoff stop, Claude/Haiku

Two general-purpose subagents read the 15 scratch notes one by one. The first was foreground; the second was background. Both completed their work. Their assistant usage records identify `claude-haiku-5-5`: final context was 56,347 tokens for session `a26b853a-07cb-46a3-911a-1688cbc466da` and 55,676 for `2bd41004-1532-4444-868b-2b027cd3b081`. Both exceeded the 25,000 handoff threshold. Trace files: `~/.claude/projects/D--projects-ptah-extension--claude-worktrees-subagent-budget-stop-path--ptah-live-test-ws/<session>/subagents/agent-<id>.jsonl`. [Running screenshot](live-test-2/scenario1-running.png).

| Check | Result | Evidence |
| --- | --- | --- |
| a. 85% notice before stop | **FAIL** | No `Near-budget warning queued` line in this run's log interval, despite trace context exceeding 21,250. The exact source log text is at `subagent-budget-monitor.ts:630`. No notice screenshot exists. |
| b. `reason=handoff` | **FAIL** | No `[SubagentBudgetMonitor] Subagent stopped` line in this run's interval. SDK starts at log 5776 (18:52:33.434Z) and 6438 (18:56:17.054Z); normal SDK stop hooks at 5967 (18:53:08.398Z) and 6627 (18:56:55.861Z). |
| c. durable handoff progress and redaction | **NOT PROVEN** | No Ptah budget handoff record was created under scratch `.ptah/subagent-handoffs`. The first agent wrote its own scratch `handoff.md` on normal completion; that is not a budget handoff record and cannot prove redaction. |
| d. parent says Ptah stopped it | **FAIL** | Parent received normal completion, not a Ptah stop; no stop-specific wording was observed. |
| e. no resume-now/cache-warm advice | **NOT PROVEN** | The required `INTERRUPTED AGENTS` stopped-agent path was never reached. |
| f. resume/SendMessage refused | **NOT PROVEN** | There was no stopped identity to target; no refusal was exercised. |
| g. declined Read/Bash diagnostics | **NOT PROVEN** | No `declined` or `The user doesn't want to take this action` entry appeared in this run's log interval; see Defect 6 below. |
| h. chat usable after stop | **NOT PROVEN** | No budget stop occurred. Normal completion alone cannot prove post-stop usability. |

The first subagent trace ends at 18:53:08.385Z with model `claude-haiku-5-5`, usage input 2 + cache creation 677 + cache read 55,668 = 56,347 context tokens. The second ends at 18:56:55.847Z with the same model, 2 + 1,623 + 54,051 = 55,676. The trace's actual assistant messages are Haiku; incidental model strings elsewhere in trace metadata were not counted as model usage.

## Scenario 2 — steer while running, Claude/Haiku

The main chat spawned a background general-purpose agent at log 7062 (18:58:58.167Z), agent `aec3dfd5e067294ff`. Its trace records `claude-haiku-5-5`, final context 55,209 tokens at 18:59:30.804Z. The normal SDK stop hook is log 7228 (18:59:30.814Z).

| Check | Result | Evidence |
| --- | --- | --- |
| Agent runs with high handoff threshold | **PASS** | Log 7062 records start; Haiku trace records its work and normal completion under 2,000,000 / 100,000,000 budgets. |
| Steer reaches it while running | **NOT PROVEN** | The agent finished before a main-chat SendMessage steer could be submitted. No steer delivery or refusal was logged. |

## Scenario 3 — safety stop, Claude/Haiku

The general-purpose agent started at log 7846 (19:01:03.752Z), agent `a8f323ea56e8a1d5d`. Its trace uses `claude-haiku-5-5`, final context 55,722 tokens at 19:01:42.284Z. Log 8042 (19:01:42.306Z) is its normal SDK stop hook. The parent chat reported normal completion. [Follow-up screenshot](live-test-2/scenario3-followup.png).

| Check | Result | Evidence |
| --- | --- | --- |
| `reason=safety` at weighted 60,000 | **FAIL** | No `[SubagentBudgetMonitor] Subagent stopped` or `reason=safety` line in this run's log interval. The trace confirms substantial Haiku usage, but the monitor's weighted total is unavailable because it emitted no stop line. |
| Chat usable after a safety stop | **NOT PROVEN** | No safety stop occurred. A follow-up prompt did return `usable` in the UI, proving only ordinary post-completion usability. |

## Scenario 4 — non-Claude provider

Codex readiness reported a found executable and signed-in status. The app's model list mapped Haiku tier to `gpt-5.6-luna` (log 9320, 19:05:18.067Z), and that option was selected in the UI ([model screenshot](live-test-2/scenario4-model.png)). The actual main-chat Codex rollout `~/.codex/sessions/2026/11/07/rollout-2026-11-07T21-05-49-01a1b767-1937-7d71-a9f9-a73955766282.jsonl` records `turn_context.model=gpt-6-luna` at 19:05:51.928Z. The main chat called `ptah_agent_spawn` with `model=default, modelTier=sonnet` at log 9517 (19:06:14.490Z) and again at 9539 (19:06:20.111Z). Log 9556 (19:06:20.894Z) records the spawned Codex agent `f9aa8c14-fe2e-418b-ab28-5979c4aac09b` with `model=gpt-6-sol`; log 9557 identifies `modelSource=setting`. The Dev process tree was stopped as soon as this mismatch was identified.

| Check | Result | Evidence |
| --- | --- | --- |
| Authenticated Codex available | **PASS** | Readiness RPC returned signed-in; app model list and log 9320 exposed `gpt-5.6-luna`. |
| Main and subagent use only `gpt-5.6-luna` | **FAIL** | Codex rollout uses `gpt-6-luna`; Dev log 9556 uses `gpt-6-sol` for the spawned agent, despite UI selection. |
| a. 85% notice | **NOT PROVEN** | Run aborted on wrong models before the threshold path could be checked. |
| b. handoff stop | **NOT PROVEN** | Same abort; no `reason=handoff` from this Codex run. |
| c. handoff record/progress/redaction | **NOT PROVEN** | Same abort; no budget record. |
| d. parent says Ptah stopped it | **NOT PROVEN** | Same abort. |

This is a model-routing defect and a cost-control failure for this test. The selected UI label did not describe the model in the main usage trace, and the main chat's spawn arguments selected a different tier for its agent. No further Codex prompts were sent after discovering this.

## Defect 6 — declined tool calls after a budget stop

**Trigger not reproduced.** There was no budget stop in the Claude runs and no `declined` or `The user doesn't want to take this action` log entry in the current run interval. The only matching permission decision near scenario 1 is log 5961 (18:53:06.567Z), a subagent `Write`: `route=auto-allow`, `decisionSource=permission-policy`, `interrupt=false`, `recentSubagentBudgetStop=false`. No `Permission response received`, `Permission response handled`, or `[SessionQueryExecutor] Subagent budget stop parent turn` line surrounded a declined Read/Bash call in this run; consequently `pendingPermissionRequests` has no value to quote. Earlier round-1 declined reads are documented in [live-test-report.md](live-test-report.md), but they are not evidence of a current round-2 trigger.

## Production settings unchanged — hash check

| Check | SHA-256 / observation |
| --- | --- |
| Before live test, `C:\Users\dev\.ptah\settings.json` | `2E2857A646F5613AA7E2FC82D1282EE249D6B1B39BEBBEA8F2D7C5454CA99DC4` |
| After Dev shutdown and settings restoration | `39BEFBBE2FB6D45F25E5B7D0B174FD4732AED3BBB1E4362612F24EB75099E519` |
| Result | **FAIL: hashes differ.** Production file `LastWriteTimeUtc` was 2026-11-07 19:04:53Z. Dev log 9025-9028 (19:04:53.771-19:04:53.779Z) shows a workspace-scoped Codex provider switch and an auto-map of the Codex Opus tier in the same second. The production file now contains that Opus tier mapping, while the dev settings backup did not. This timing makes a Dev-to-production settings leak plausible, but the before-file contents were not captured, so causation is not proven. Production Ptah PID 26500 remained running; the file was left untouched. |

## Cleanup

- Stopped only the Dev Electron tree rooted at PID 44684, including its Codex child processes (PIDs 20416 and 13572 and their descendants). A later process query found none of the enumerated Dev PIDs running. Production Ptah PID 26500 remained running.
- Restored the dev settings file from `settings.json.bak-livetest2`. Final dev SHA-256 equals backup SHA-256 `3B727D826F40043DCC6E879B9023DB60A075C4FBD67ED945BA5AC738D694FAD6`; final handoff budget 150,000, weighted stop 3,000,000, Claude selected model `haiku`, Codex Haiku tier `gpt-5.6-luna`.
- No commit, push, or PR was made. No production settings edit was made. Scratch data and this report remain for review.

## Findings

1. **Budget stop path did not fire in round 2.** Four Haiku subagents performed real work; two crossed the 25,000 handoff context threshold and all completed normally. Across the current-run log interval there were zero `[SubagentBudgetMonitor]` entries, including no near warning, observe-only warning, or stop. The reason is unresolved; the prior run did log both handoff and safety stops from the same Dev app log, so prior proof cannot be reused as round-2 proof.
2. **Codex model selection was not enforced.** The app showed `gpt-5.6-luna`, while the main usage trace recorded `gpt-6-luna` and the spawned agent log recorded `gpt-6-sol`. The Codex scenario was stopped immediately and its budget behavior remains unproven.
3. **Production settings hash changed during the Dev provider switch.** The test made no direct production edit, but the required before/after equality does not hold. Dev log 9025-9028 and the file's modification time align within one second; the production file contains the auto-mapped Codex Opus tier. Investigate whether workspace-scoped `auth:saveSettings` in Dev writes through to the production settings store. A concurrent production or external write remains possible without a before-file diff.
4. The steer-while-running path and Defect 6 declined-tool trigger remain unproven. No PASS is claimed for the stop-specific acceptance checks.
