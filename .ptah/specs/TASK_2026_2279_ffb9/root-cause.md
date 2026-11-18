# Subagent budget handoff: evidence and root cause

## Evidence and confidence

**PROVEN:** The three agents reached a cooperative notes gate and returned `stop_reason: end_turn`. The available evidence does not show a weighted/raw/duration safety stop for any of them. The gate deliberately ends work at the **warning**, including below the configured handoff limit. Automatic instruction injection accounts for the large context jumps; the tool results alone do not.

**PROVEN:** Sources below are this worktree's source, the actual JSONL transcripts, and durable handoff records. Earlier `analysis.md`, `investigation-findings.md`, and `session-report.md` were used only to locate the three transcript filenames. Their conclusions were not adopted.

Evidence aliases (all `:line` references are physical lines):

- `M` = `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts`.
- `G` = `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-notes-gate.ts`.
- `H` = `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-handoff-message.ts`.
- `B` = `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-hooks.ts`.
- `P` = `libs/shared/src/lib/utils/agent-budget-policy.ts`.
- `U` = `libs/shared/src/lib/types/agent-turn-usage.types.ts`.
- `T1`, `T2`, `T3` = `~/.claude/projects/D--projects-ptah-extension/c3749b1b-e7b1-4e87-99bd-d0af7d6356ac/subagents/agent-<id>.jsonl`, respectively IDs `a78a3ec78eb2bc288`, `a0ff5b5f5517ace28`, `adc13f149458cb6fe`.
- `R` = `D:/projects/ptah-extension/.ptah/subagent-handoffs/`.
- `R1` = `R/20261118T135433503Z-6022e27eef10cd09-toolu_01Kb4FVWeDA2WoTA1AWo4TZu-467ca0da.handoff.md`.
- `R2` = `R/20261118T135510348Z-6022e27eef10cd09-toolu_01RaHXAkWSkAHDVHBQAry7eZ-38888017.handoff.md`.
- `R3` = `R/20261118T135541388Z-6022e27eef10cd09-toolu_01Ai7R7wnHPY1jx76QPcE4wF-7fd4769b.handoff.md`.
- Notes `N1`, `N2`, `N3` = `R/toolu_01Kb4FVWeDA2WoTA1AWo4TZu.md`, `R/toolu_01RaHXAkWSkAHDVHBQAry7eZ.md`, `R/toolu_01Ai7R7wnHPY1jx76QPcE4wF.md`.
- `W` = `D:/projects/ptah-extension/.claude-worktrees/feat-lane-usage-probes-e50cd63b407b` (incident worktree; read only).

**PROVEN:** All transcripts and all three matching handoff records were found at those locations. **NOT PROVEN:** No accepted-turn runtime log with the per-request `weightedTotal` was located; the investigation has transcript and durable-record evidence rather than that log. The quoted final weighted totals are recorded monitor values, not a reconstruction of missing runtime messages.

## Exact rules today

All rules in this section are **PROVEN from source**, not assertions about an unobserved runtime build.

| Rule | Exact quantity, threshold, action | Source |
|---|---|---|
| Settings | Live validated `agentBudget.*`; defaults warning ratio 0.85, handoff 150,000, weighted limit 3,000,000, duration 90 min | `helpers/compaction-config-provider.ts:93-103` under agent-sdk; `libs/shared/src/lib/types/advanced-settings.types.ts:166-190`; `P:14-40` |
| Request context | `contextTokens = input_tokens + cache_read_input_tokens + cache_creation_input_tokens`; output excluded | `M:357-384` |
| Raw accounting | `uncachedInput: true` converts SDK input to inclusive input; raw increment is inclusive input + output, repeated across requests | `M:1456-1464`; `U:104-110`; `P:158,179` |
| Weighted accounting | SDK monitor uses default policy (no `laneAccounting`). Increment is raw when pricing unavailable; otherwise `max(raw, catalog class cost / 0.000003)`. Cache reads do NOT get a 10% raw-floor discount in this mode | `M:607`; `P:87-98,163-180` |
| Warning | First non-stopped warning when context >= `Handoff * ratio`, OR `max(rawTotal,weightedTotal) >= WeightedLimit * ratio`, OR total + largest/current turn >= WeightedLimit | `P:103-107`; `M:674-707` |
| Default context warning | 150,000 * 0.85 = **127,500**. Registers notes-only gate immediately, queues warning for next tool result; missing agent ID/paths defer registration | `M:680-701` |
| Handoff threshold | Policy returns `handoff: context >= Handoff`, but monitor does **not consume that flag as a direct stop**. At the warning it asks for notes and final response; normal SubagentStop prepares a handoff regardless of context | `P:112`; `M:654-664,799-841`; `B:76-77` |
| Safety token stop | Default-mode `max(cumulative raw,cumulative weighted) >= WeightedLimit`, OR **single request context >= 2 * Handoff**. Sets stopped snapshot; monitor labels it `safety` and calls stop | `P:103,108-112,184-196`; `M:657-664` |
| Safety duration stop | Elapsed since monitor state start >= `maxDurationMin * 60000`; timer also enforces without new assistant messages; reports `safety` | `P:109`; `M:1277-1303` |
| Missing usage | Missing usable input/output usage stops SDK monitor immediately as `safety`; three-unavailable-turn rule applies only to `laneAccounting` callers | `M:605-624`; `P:129-153` |
| Gate-triggered stop | Three counted denial bursts or expiry triggers `stopWarnedAgent`; it passes reason **`handoff`**, not a gate-specific cause | `G:58-81`; `M:718-751` |
| Normal end | `SubagentStop` while gate active prepares `handoff`, marks monitor state stopped; it need not invoke an SDK task-stop operation | `B:76-77`; `M:799-900` |

**PROVEN:** SDK safety is not the CLI lane's deferred-token-stop policy. The latter is selected through `{laneAccounting:true}` and `P:115-126`; do not generalize its one-turn deferral to `M:607`.

### Gate details and every termination route

**PROVEN (`G:4-81`):** Only exact tool names `Write` and `Edit`, with a nonempty `file_path` resolving to the one canonical notes file, are permitted. Candidate must also be lexically inside the recorded workspace. Windows case/slash normalization applies. `Read` of even the notes file, Bash, mkdir through Bash, other tools, deliverable writes, sibling notes, and traversal outside workspace are denied. This is lexical normalization, not symlink resolution. Unwarned IDs and parent hooks without an agent ID bypass the gate.

Exact denial text (`G:79`, substitute the absolute registered notes path):

> Ptah budget handoff: write your notes to {notesPath}, then end your turn with a final message starting "PTAH BUDGET HANDOFF:" that summarizes progress and next steps. Do not call other tools. End your turn now.

Exact expired denial (`G:62`):

> Ptah budget handoff expired. End your turn now.

Exact hook failure denial (`B:16,44-63,94-101`):

> Ptah notes gate failed. End your turn now; do not call other tools.

**PROVEN:** `B:69-74` converts the gate reason into SDK `permissionDecision: deny`. `M:711-728` invokes the gate; this is Ptah's PreToolUse hook, not user refusal.

**PROVEN:** Gate termination and cleanup rules:

1. Counted denials reach **3** (`G:4,72-80`). A denial increments only if no preceding denial or >=2,000 ms since the immediately previous denial; every denial updates that timestamp. Parallel/rapid denials are coalesced; this is not a tool-call limit.
2. Before any decision: expiry at >=120,000 ms after warning. After first decision (allowed or denied): expiry at >=45,000 ms after that decision. Writes do not reset the timer. Expiry checked before allowing even a correct Write (`G:6-7,50-66`). One-second watchdog also invokes stop (`M:763-786`). There is no successful-write completion test today.
3. Normal SubagentStop runs `finishWarnedAgent` and removes gate in `finally` (`M:897-900`). This can occur with no notes written; inferred notes are supported.
4. Successful forced stop removes gate and pending notice (`M:1706-1711`). Failed/deferred stops leave gate active; record-attempt exhaustion prevents further gate stop/watchdog attempts (`M:744-755,770`).
5. New task ID for a reused tool invocation clears old gate (`M:931-951`); session release clears its gates/timers (`M:1131-1153`). `finish()` deletes an entry (`G:46-48`). `TaskCompleted` alone is not a finish branch (`B:24,76`).

## Transcript timelines

**PROVEN:** Each table counts unique provider `requestId` once, not assistant blocks, API-request-blob copies, or tool calls. Usage and phases are proven transcript values and source comparisons. `I/R/C/O` mean input/cache_read/cache_creation/output. Phase is relative to the 127,500 warning and 150,000 handoff thresholds. `NP` in weighted column means **NOT PROVEN**: per-request runtime weighted telemetry and runtime pricing map are missing. Final recorded weighted values are PROVEN in `R1/R2/R3:9`. Even final transcript output can differ from output visible to the live stream monitor; do not substitute summed finalized usage for live weighted totals.

Exact-message keys for the tables:

- **D1/D2/D3** = the exact gate denial above with N1/N2/N3 as the absolute Windows path; transcript prefixes are `PreToolUse:Bash hook error:` (D1,D3) and `PreToolUse:Read hook error:` (D2).
- **W1/W3** = `H:44-57` warning, quoted below, delivered as PostToolUse:Write additional context, using context 197822 / 127777, notes N1/N3, task agent ID.
- **F1/F2/F3** = handoff record first line quoted below; final assistant messages start `PTAH BUDGET HANDOFF:` and have `stop_reason: end_turn`.

### Agent 1: a78a3ec78eb2bc288

| Request / UTC / transcript lines | I / R / C / O | Context | weightedUsed | Phase | Monitor-visible action / exact message key |
|---|---|---:|---|---|---|
| 1 / 13:53:55 / T1:16 | 2 / 0 / 109094 / 187 | 109096 | NP | below warning | No budget message |
| 2 / 13:53:57 / T1:26-28 | 1 / 109094 / 12898 / 463 | 121993 | NP | below warning | No budget message |
| 3 / 13:54:00 / T1:40-42 | 4 / 121992 / 75826 / 231 | 197822 | NP | above handoff, below 300k safety ceiling | Gate active; Bash denied D1 at T1:42 |
| 4 / 13:54:04 / T1:46-50 | 2 / 197818 / 386 / 2643 | 198206 | NP | notes | Write N1 succeeds T1:48; W1 T1:50 |
| 5 / 13:54:33 / T1:52 | 2 / 198204 / 3001 / 1561 | 201207 | 829183 (R1:9) | normal exit | Final handoff text; F1 in R1:7 |

**PROVEN trigger:** Warning-induced cooperative exit, `M:674-707` -> gate `G:68-80` -> normal SubagentStop `B:76-77`, `M:799-900`. One observed denial; final `end_turn`; N1 written. Context limit was crossed but is not a direct stop branch in `M:654-664`. **NOT PROVEN:** A forced SDK task-stop invocation; no corresponding runtime stop log/callback evidence was found.

### Agent 2: a0ff5b5f5517ace28

| Request / UTC / transcript lines | I / R / C / O | Context | weightedUsed | Phase | Monitor-visible action / exact message key |
|---|---|---:|---|---|---|
| 1 / 13:54:51 / T2:16 | 2 / 24448 / 84079 / 135 | 108529 | NP | below warning | Reads predecessor R1 (T2:17) |
| 2 / 13:54:52 / T2:24 | 1 / 108527 / 11037 / 192 | 119565 | NP | below warning | Bash |
| 3 / 13:54:54 / T2:29-33 | 2 / 119564 / 4083 / 325 | 123649 | NP | below warning | Reads two source files |
| 4 / 13:54:57 / T2:42-44 | 4 / 123647 / 76302 / 227 | 199953 | NP | above handoff | Read denied D2 at T2:44 |
| 5 / 13:55:05 / T2:46-47 | 2 / 199949 / 380 / 1613 | 200331 | 752071 (R2:9) | normal exit | Final says no notes/deliverable written; F2 in R2:7 |

**PROVEN trigger:** Same warning/gate/cooperative-exit path as agent 1 (`M:674-707`, `G:68-80`, `B:76-77`, `M:799-900`). No three-denial event is in this transcript. `R2:33` explicitly identifies host-generated inferred notes.

**PROVEN path comparison:** Gate permits **Write/Edit N2**, `D:/projects/ptah-extension/.ptah/subagent-handoffs/toolu_01RaHXAkWSkAHDVHBQAry7eZ.md`. Actual denied call is **Read** of `W/libs/backend/auth-providers/src/lib/quota/readers/antigravity-plan-usage.reader.ts` (`T2:43-44`). Both tool and path fail the gate. Declared deliverable is `W/.ptah/specs/TASK_2026_2277_22ef/code-logic-review-antigravity.md` (`T2:1`); the gate would deny writing it too (`G:68`).

**PROVEN:** T2:47 says: "I did not write the deliverable `code-logic-review-antigravity.md` or the notes file, because the hook said not to call further tools." **NOT PROVEN:** The premise that the subagent attempted a notes Write to the wrong path and it was rejected. No Write/Edit attempt exists in T2. The denial simultaneously says write notes and "End your turn now"; the final response attributes its decision to the latter instruction. A notes Write to N2 was technically permitted before expiry; saying the gate rejected such a Write would misstate the evidence.

### Agent 3: adc13f149458cb6fe

| Request / UTC / transcript lines | I / R / C / O | Context | weightedUsed | Phase | Monitor-visible action / exact message key |
|---|---|---:|---|---|---|
| 1 / 13:55:04 / T3:16 | 2 / 24448 / 84344 / 104 | 108794 | NP | below warning | Reads N1 |
| 2 / 13:55:06 / T3:24 | 1 / 108792 / 11241 / 265 | 120034 | NP | below warning | Bash |
| 3 / 13:55:09 / T3:29 | 2 / 120033 / 2046 / 210 | 122081 | NP | below warning | Bash |
| 4 / 13:55:11 / T3:34 | 2 / 122079 / 1411 / 196 | 123492 | NP | below warning | Bash |
| 5 / 13:55:12 / T3:39-40 | 2 / 123490 / 1256 / 292 | 124748 | NP | below warning | Bash |
| 6 / 13:55:16 / T3:45 | 2 / 124746 / 687 / 168 | 125435 | NP | below warning | Bash |
| 7 / 13:55:18 / T3:50 | 2 / 125433 / 1201 / 168 | 126636 | NP | below warning | Bash |
| 8 / 13:55:19 / T3:53-55 | 2 / 126634 / 313 / 276 | 126949 | NP | below warning | Bash |
| 9 / 13:55:23 / T3:57-58 | 2 / 126947 / 828 / 226 | 127777 | NP | warning crossed | Bash denied D3 |
| 10 / 13:55:25 / T3:60-64 | 2 / 127775 / 378 / 1461 | 128155 | NP | notes | Write N3 succeeds T3:62; W3 T3:64 |
| 11 / 13:55:41 / T3:66 | 2 / 128153 / 1815 / 887 | 129970 | 1365067 (R3:9) | normal exit | Final says deliverable absent; F3 in R3:7 |

**PROVEN trigger of 129,970 handoff:** 127,777 >= 127,500 activates gate and instructs end-turn; N3 written, then normal SubagentStop finalization, `M:674-707,799-900`, `B:76-77`. The final occurs about 18 seconds after denial, below the 45-second expiry; only one denial is recorded. 129,970 is below 150,000 and 300,000; recorded weighted total is below 3,000,000. **NOT PROVEN:** A safety stop or denial-count expiry here. This was not a 14-request run: T3 has 11 unique provider requests.

### Exact warning and final monitor messages

**PROVEN:** W1/W3 text (`T1:50`, `T3:64`, `H:44-57`; interpolate only the indicated fields):

> Ptah budget notice: your context is at {197822 or 127777} tokens, close to the 150000-token limit at which Ptah's subagent budget monitor ends this subagent. Task id: {agentId}. Before your next step, write or UPDATE your progress notes at {N1 or N3} (create its directory if needed; overwrite a stub): current state, findings, decisions and their reasons, files touched, and the exact next steps. Then end your turn with a final message that starts "PTAH BUDGET HANDOFF:" and summarizes progress and next steps. Do not call other tools. A fresh subagent continues from that file.

**PROVEN:** F1/F2/F3 exact first sentence (`R1:7`, `R2:7`, `R3:7`):

> Ptah's subagent budget monitor handed off subagent `code-logic-reviewer` at 201207 context tokens (handoff limit 150000 tokens).
>
> Ptah's subagent budget monitor handed off subagent `code-logic-reviewer` at 200331 context tokens (handoff limit 150000 tokens).
>
> Ptah's subagent budget monitor handed off subagent `code-logic-reviewer` at 129970 context tokens (handoff limit 150000 tokens).

Each record continues exactly: "The interruption notice in the Agent result came from Ptah's subagent budget monitor, not the user. No user input is needed; continue autonomously now." Each `:8` says `Budget stop reason: handoff; SDK agent: {agentId}; SDK task: {agentId}.` Usage lines are exactly `Usage: {context} context tokens of 150000; {weighted} weighted tokens of 3000000.` with table values. These messages conflate normal warning exit with hitting a limit (`H:109-123`; normal exit passes `handoff` at `M:829`).

### Why so much growth in so few requests?

**PROVEN:** Initial instruction attachments `T1/T2/T3:6` contain root CLAUDE.md and four imported analysis files. Those four contents are 23,567 + 43,143 + 34,852 + 48,023 = **149,585 characters**, before wrappers. Initial contexts are measured above, not inferred from a model window.

**PROVEN:** Agent 1's source Reads load the worktree CLAUDE.md and the same four analysis files again as **nested_memory** attachments (`T1:31-35`). `T1:37` is the outbound API-request-blob containing those five system-reminder text blocks (13,124 + 23,753 + 43,337 + 35,036 + 48,207 = **163,457 characters**) plus the two source tool results (10,447 characters). Context jumps 121,993 ->197,822 (**+75,829**) on the next request; cache creation alone is 75,826. Subsequent notes/response growth gives 201,207. Agent 2 repeats the same five nested-memory injections at `T2:34-38`, outbound blob `T2:40`; context 123,649 ->199,953 (**+76,304**, creation 76,302), then 200,331. Tool-call count is not the budget input. Duplicate api-request-blob copies must not be counted as executed tools.

**PROVEN:** Additional SDK prompt/tool/MCP listing updates also appear before request 2 (`T1/T2:18-21`). **NOT PROVEN:** An exact token attribution of each imported file or the claimed "41k tokens": provider usage reports whole-request token classes, not per-attachment tokenization. The injection and timing are proven; partitioning the 75k increase exactly among attachments, results and SDK overhead requires provider tokenization/request accounting. Agent 3 has no equivalent five-file nested-memory reload in its transcript and grows gradually.

### Model and actual context window

| Agent | Model evidence | Actual context window evidence |
|---|---|---|
| 1 | **PROVEN:** `claude-sonnet-5-5`, T1:4 identity and T1:16 message.model | **NOT PROVEN:** no contextWindow/context_window field in T1 |
| 2 | **PROVEN:** same ID, T2:4 and T2:16 | **NOT PROVEN:** no capacity field in T2 |
| 3 | **PROVEN:** same ID, T3:4 and T3:16 | **NOT PROVEN:** no capacity field in T3 |

Do not label these incidents "200k-window models" from the observed context sizes or model name. Provider route, native/proxy capacity evidence and per-model SDK result capacity are missing from these three transcripts.

## Is safety independent of handoffContextTokens?

**PROVEN:** Partly. Cumulative weighted/raw limit, lifetime duration, and missing-telemetry stop are independent; the safety **2x context ceiling explicitly depends on handoffContextTokens** (`P:103-112`, `M:621-623`). Raising handoff alone leaves the first three intact.

| Current rule with default other settings | Handoff 450000 | Handoff 650000 |
|---|---|---|
| Warning context; gate can induce normal exit below configured limit | 382500 | 552500 |
| Nominal policy handoff flag (not a direct monitor stop) | 450000 | 650000 |
| Context safety ceiling | 900000 | 1300000 |
| Cumulative safety stop | max(rawTotal,weightedUsed) >=3000000 | same |
| Duration safety stop | >=90 minutes since monitor state start | same |
| Missing usable SDK telemetry | immediately, at any context size | same |
| Gate-specific expiry/denial stop, once warned by ANY warning rule | 3 separated denial bursts, or 45s after first decision /120s with no decision | same |

**PROVEN:** Cumulative totals are lifetime quantities, not context sizes. A 100k-context agent can accumulate 3m through repeated requests; no single context-token figure determines when that stop occurs. A weighted/predictive warning can also activate notes gate below 382,500/552,500. Duration and telemetry stops have no positive minimum context. The 2x ceiling cannot itself fire below the setting. No current model-window cap is applied by the monitor; raising the setting does not ensure warning before a smaller model's real capacity is exhausted.

**PROVEN:** Codex lane settings are a separate consumer. `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-spawn-environment.service.ts:267-281` reads ratio/handoff; `cli-adapters/codex/codex-lane-budgets.ts:59-76` computes `max(1,floor(ratio*handoff+epsilon))` as autoCompactTokens (default127500; 382500/552500 for these larger settings). `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:160-161` supplies default127500 and passes budgets at `:181`. Changing shared defaults or global ratio semantics affects this lane too.

## Fix plan (proposed rules, not implemented)

Each present rule below is **PROVEN** by the cited source. Each replacement and test is a **PROPOSAL**, not a claim about current behavior. Priority order:

1. **Permit notes AND declared deliverable; remove contradictory denial language.** Files: G, M task metadata, H, B, `subagent-handoff-files.ts`, their specs. Present: only canonical notes Write/Edit (`G:68`); declared deliverable is not a gate input. Proposed: carry explicit validated deliverable path(s) from Agent task contract into gate; permit Write/Edit only to notes and declared deliverables, name all permitted paths in warning/denial, say "write these files, then end your turn". Do not confuse SDK `outputFile` (task output) with user deliverable. Do not infer arbitrary writable paths from free prose. Validate task-declared paths under intended worktree even when notes live under root workspace. Tests: notes+deliverable both allowed, source/unlisted files denied, Windows normalization, separate root-notes/worktree-deliverable roots, traversal/symlink escape defenses, absent deliverable metadata, parent/sibling isolation, exact denial names.
2. **Completion-based notes phase; no small call/denial quota (user requirement).** Files: G, M, B post-tool handling, H and specs. Present: 3 denial bursts, 45s/120s expiry; Write success not observed for completion. Proposed: remove count expiry completely; finish when successful tool results prove both notes and declared deliverable written/updated during this gate, OR SubagentStop ends the turn. No stub/existence-only completion. No deliverable declared means notes alone. Keep one generous watchdog, proposed **10 minutes from gate entry**, with explicit timeout reason; do not introduce a second short decision timer. Independent true safety limits remain explicit overrides. Tests: >3 denials and >10 permitted edits do not terminate, no 45s/120s cutoff, failed writes not complete, notes-only not complete when deliverable exists, both successes complete, early end-turn yields honest missing-file handoff, fake-timer 10min expiry; race-safe stop/cleanup/rekey/release.
3. **Give first over-threshold request a notes turn.** Files: M, H and monitor specs; additive P helper if needed. Present: H crossing is cooperative already; a first request that also meets safety stops immediately after warning (`M:656-664`). Proposed: explicit normal -> notes-pending -> complete state. A first request above effective warning/handoff enters notes phase once, even when it jumped over H or the existing 2xH soft context ceiling; do not queue warning and immediately stop for that same context trigger. Bound the notes request to verified remaining provider capacity/output allowance; a provider-capacity refusal must be reported explicitly rather than fabricated as a weighted stop. Deliver warning before gating next tool. Keep duration/missing telemetry and genuine cost ceilings distinctly enforced; any override must say why notes could not run. Tests: first request >H and >=2H, jump from below warning to >H, missing registry ID then arrival, one warning only, real hard safety override, no stop on streamed block duplicates.
4. **Use actual model-window-relative handoff with setting as cap (user requirement).** Files: M, shared pricing/context helper and additive policy input/types, H, specs. Present: M knows `message.model` at `:1453-1454` but compares only user H; usage reader `M:357-379` has no capacity. Proposed: resolve per-subagent route/model capacity; effectiveH = `min(settingH, floor(0.90 * verifiedWindow))`, warning = `warnRatio * effectiveH`. A verified 200000 window gives H180000/warning153000 for settings450000/650000 (reserve20000); setting150000 preserves H150000/warning127500. Proposed 0.90 is an explicit tunable design choice. Preserve completion-based notes even if the jump crosses effectiveH. Do not postpone warning until provider rejection.
   Capacity evidence is already resolved in `helpers/stream-transformer.ts:964-974`: `sdkMessage.modelUsage[model].contextWindow` -> `resolveContextCapacity`. Shared implementation `libs/shared/src/lib/utils/pricing.utils.ts:744-770` trusts positive native SDK capacity, else route-qualified discovered provider catalog, else `{tokens:null,source:'unknown'}`. Wire this capacity to the **subagent identity**, not a parent's model window; final result capacity arrives too late for its first warning, so retain validated per-route/model startup/discovery metadata. Monitor currently has no such plumbing. Unknown window: explicitly record unknown and conservatively use `min(settingH,150000)` pending evidence, with normal warning/notes; never claim a guessed 200k is real. Tests: native200k, native1m, proxy differing capacity, unknown, model/route change, late SDK evidence, setting as upper cap,450k/650k regression, no borrowed parent window.
5. **Prevent repeated fast successor relaunch.** Files: M, `subagent-handoff-record.ts`, `subagent-handoff-message.ts`, `subagent-resume-advice.ts`, owning Agent spawn guard/caller and specs. Present: H recommends smaller fresh agent and eventually finish in parent, but no lineage/rate check; `subagent-resume-advice.ts:47-61` chooses fresh for stopped/cold/near-limit agents, not whether another fresh agent is viable. Proposed: additive lineage, request-to-warning count, initial context and effectiveH fields in record. If successor reaches warning in <= predecessor's request count without a completed deliverable, mark lineage exhausted and reject another equivalent relaunch; parent completes or explicitly reduces initial instruction load/scope. Compare against effective thresholds, deduplicate streams, use explicit predecessor link rather than teammate name. Tests: incident predecessor request3/successor request4 (not "as fast" by request count), equal/faster successor blocked on next relaunch, slower productive successor allowed, unrelated scopes isolated, unknown ancestry does not invent failure history, restart/rekey preserves lineage. Runtime model autonomy still requires an enforceable spawn-path guard, not text alone.
6. **Accurate trigger, record and user message.** Files: M, H, handoff record/stop notice types and specs; additive shared cause field if needed. Present: only `handoff|safety`; normal warning end and denial expiry labelled handoff; safety text assumes weighted even for duration/missing telemetry (`H:69-83,109-119`). Proposed: preserve actual trigger with measured quantity/limit: warning-notes-complete, warning-turn-ended, notes-timeout, context-handoff, context-ceiling, weighted/raw-budget, duration, telemetry-unavailable. Include actual model capacity source, effectiveH and configured cap; distinguish cooperative return from forced SDK stop. Keep backward-readable old reason plus additive cause metadata. Tests: each trigger with exact message and record, below-H129970 cooperative exit, mixed context+duration precedence, exhausted lineage, failed record/stop retries and one publication.
7. **User decisions only: imports and defaults.** Files proposed only: `CLAUDE.md:179-182`, shared advanced-settings descriptor/spec, documentation, Codex default specs. Present: four unconditional imports; default150000. Option: replace bulk imports with short index and load relevant analysis on demand; investigate SDK root/worktree double loading. Review evidence shows149585 source characters, not a proven41k-token attribution. Default options: keep150000 pending window-relative behavior, or raise cap only after that behavior ships. Do not silently remove instructions or change defaults. Tests if chosen: import footprint measured with actual provider tokenizer, root/worktree instruction behavior, SDK warning and Codex default derivation stay consistent.

## Existing regression evidence (read, not executed)

**PROVEN:** `subagent-notes-gate.spec.ts:8-81` pins notes-only access, three denial bursts, 45s/120s timers, expiry before a valid write, and Windows normalization; these expectations need intentional replacement. Monitor spec `:2386-2405` asserts warning127500 and no task stop, `:2439-2450` covers context310000 safety, and `:2453-2465` asserts normal handoff does not call stopSubagent. `agent-budget-policy.spec.ts:17-36` pins default immediate raw/token and unavailable-telemetry stops; its subsequent tests distinguish lane-only token-stop deferral. Preserve that distinction while adding explicit notes-phase handling.

**PROVEN arithmetic / NOT PROVEN live-weight reconstruction:** Finalized transcript sums of context+output are833409,754519,1368324, versus recorded monitor weighted totals829183,752071,1365067. These are different observation streams. The exact live per-block usage and runtime catalog needed to reproduce every intermediate weighted total are absent; no timeline substitutes those finalized sums for weightedUsed.

## Risks, projects, and verification boundary

**PROVEN scope:** Primary implementation projects are `agent-sdk` (monitor/gates/hooks/messages) and `shared` (additive capacity/trigger helpers and contracts). `shared` has 66 dependents per supplied architecture context; this dependent count was **NOT independently re-enumerated**. Prefer optional fields/new helpers; retain default `laneAccounting` behavior. If Codex defaults/window wiring change, also touch `cli-agent-runtime` and `cli-engine`. Keep `platform-cli` and Electron composition consumers compatible; no new host dependency or injectable is needed solely for this policy refactor.

**PROPOSAL risks:** completion must follow successful writes, not tool intent; allowed deliverables must not become arbitrary write permission; host root differs from agent worktree; instruction/capacity arrives late; runtime stream output differs from finalized JSONL; stop/normal-exit/watchdog can race; inferred notes must remain labelled inferred; lineage can falsely block unrelated tasks; 10min grace allows more spend, bounded by independent safety. Split helpers rather than growing the2035-line monitor. Preserve existing durable record ownership, redaction, retry and delivery semantics.

**PROVEN check status:** Source/transcript/record inspection only. No tests, Nx, verify, build, serve, dev, e2e, package, commit, push or branch change. Ptah workspace and AST tools were available and used; targeted native `rg`/PowerShell/Python reads supplied free-text/transcript evidence. No CLI-native skill loader was exposed; filesystem skill discovery was available, but inspected humanize/content-writing skills did not match this read-only forensic task, so no skill workflow was applied. The only file written is this report.

**PROPOSAL validation when authorized to implement:** Run only changed specs with `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed-agent-sdk-specs>`, then the equivalent `libs/shared/jest.config.ts` invocation; one process at a time. Add CLI consumer specs only if their projects change. This investigation does not establish test pass status or that the incident runtime binaries exactly match the current worktree source.
