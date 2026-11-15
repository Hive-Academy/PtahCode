# RPC timeouts and session-switch latency — 2026-11-15

## Summary

- **Verified:** The installed app's `chat:start` took 143,226.5 ms; its renderer timed out after approximately 120 s, consistent with the chat-specific timeout, not the generic 30 s default.
- **High-confidence inference:** 109 s elapsed between session-config and prompt-config logs, across the awaited MCP subagent registration. Current source caps that wait at 3 s, so the installed bundle or another synchronous step differs from this checkout's expected behavior.
- **Verified:** Nov 14–15 have 9,554 slow-handler entries and 71 renderer timeout log entries; git reads, chat admission, and session resume are the largest recurrent groups.
- **Verified:** Task-spec watcher rebuild timing was logged 1,045 times from 11:00–11:03Z on Nov 15 alongside 260–895 ms event-loop lag; watchdog also captured separate 5–11 s main-loop stalls.
- **Verified:** Session switch still serially awaits `session:load`, `chat:resume`, then a chunked renderer history replay. Its first two waits and replay cost are additive.

## Log evidence

Source keys below are line references to the bounded local logs: `15` = `.ptah/tmp/applogs/Ptah Electron-2026-11-15.log`, `14` = corresponding `2026-11-14.log`, `hang` = `.ptah/tmp/applogs/ptah-hang.log`. Dates in filenames include the previous UTC evening. Counts are log entries, not distinct user actions; duplicate `Context:` lines were excluded. “Slow” is the host's slow-handler threshold (2 s), and p50 is the median of those *slow entries only*, not all calls. A dash means no logged entry.

| RPC method | Nov 14 slow / p50 / max (ms) / renderer timeout | Nov 15 slow / p50 / max (ms) / renderer timeout |
| --- | ---: | ---: |
| `chat:start` | 3 / 22,864.9 / 66,314.1 / 0 | 15 / 161,204.5 / 3,070,249.1 / 11 |
| `chat:continue` | 29 / 82,457.4 / 238,899.6 / 5 | 35 / 87,239.8 / 2,421,531.0 / 11 |
| `chat:resume` | 90 / 27,354.9 / 243,212.2 / 1 | 97 / 34,629.9 / 188,562.5 / 1 |
| `autocomplete:commands` | 11 / 40,107.3 / 76,420.9 / 9 | 15 / 67,214.0 / 154,665.9 / 9 |
| `git:info` | 2,117 / 7,545.6 / 281,927.0 / 0 | 1,039 / 7,771.2 / 190,194.3 / 0 |
| `git:watchRoots` | 2,031 / 3,401.7 / 26,793.3 / 0 | 389 / 2,873.8 / 15,672.4 / 0 |
| `session:list` | 711 / 3,377.4 / 15,293.4 / 1 | 526 / 3,021.4 / 11,304.7 / 0 |
| `tasks:get` | 1,140 / 3,486.2 / 39,535.6 / 0 | 71 / 12,943.7 / 31,439.2 / 0 |
| `provider:getPlanLimits` | 160 / 13,788.5 / 17,700.3 / 0 | 218 / 15,124.7 / 24,080.4 / 0 |
| `analytics:spendSummary` | 10 / 30,654.3 / 31,919.0 / 0 | 79 / 30,532.5 / 33,409.3 / 0 |
| `config:models-list` | — | 5 / 37,036.6 / 187,270.9 / 3 |
| `agent:detectClis` | — | 1 / 338,082.7 / 338,082.7 / 1 |
| `tasks:sweepFinished` | — | 1 / 260,186.8 / 260,186.8 / 1 |
| `agent:listMessageReceipts` | 1 / 10,120.3 / 10,120.3 / 0 | 1 / 257,295.4 / 257,295.4 / 1 |
| Other methods combined | 375 / — / — / 17 | 384 / — / — / 0 |
| **All methods** | **6,678 slow / 33 timeouts** | **2,876 slow / 38 timeouts** |

The “other” counts are the residual after the displayed methods and should be treated as an aggregate only. `session:load` has no slow-handler entries in these two files; that is absence of instrumentation evidence, not proof of a fast load.

| UTC window / log line | Observation |
| --- | --- |
| Nov 15 10:59:35.106, `15:142636` | `chat:start - session config`, MCP running. Handler completed at 11:01:58.330 (`15:143729`) after 143,226.5 ms; inferred entry 10:59:35.103. |
| Nov 15 11:01:23.974, `15:143415` | `chat:start - prompt config`: 108.9 s after session config. SDK adapter starts at 11:01:32.721 (`15:143500`); SDK query starts 11:01:58.325 (`15:143726`). |
| Nov 15 11:01:35.640, `15:143533–143536` | Renderer `chat:start` timeout and message-send failure, about 120.5 s after inferred handler entry. The late host result cannot resolve the removed pending call (`claude-rpc.service.ts:174–203`). |
| Nov 15 11:00–11:03, `15:143227–144416` | Task-spec watcher timing logs per minute: 327, 327, 240, 151. Event-loop lag includes 895 ms at 11:01:05 (`15:143259`) and recurring 260–748 ms at 11:03 (`15:144120–144416`). |
| Nov 15 11:02:19, `15:143845` | `provider:getPlanLimits` took 15.4 s while the above activity continued; it does not explain the prior 109 s registration interval by itself. |
| Nov 15 01:41:14, `hang:456` | `ptah-workspace-watch-host` utility crashed with Windows access-violation exit code `-1073741819`. It predates the 11:01 defect by over 9 h; no direct causal link is logged. |

| Watchdog date (UTC) | `hang` count / median / max blockedForMs | `recovered` count / median / max blockedForMs | Breadcrumb examples |
| --- | ---: | ---: | --- |
| Nov 14 | 11 / 5,118 / 5,248 | 11 / 6,154 / 9,410 | `hang:443`: `git:info` in flight; `ptah_workspace_analyze` and `ptah_session_handoff` in flight; last slow SQL 62 ms. `hang:447`: search/analyze in flight; last SQL 56 ms. |
| Nov 15 | 2 / 5,041 / 5,049 | 2 / 9,317 / 10,966 | `hang:457`: `session:getOrganization`, `ptah_agent_spawn`, workspace analyze in flight; last SQL 58 ms. `hang:459`: spawn/search/analyze in flight; last SQL 87 ms. |

The watchdog fires near 5 s, so `hang` maxima reflect detection time; `recovered` records the total stall. In-flight breadcrumbs show concurrency, not which operation blocked the loop. The `lastSlowSql` values in these four cited hangs are 56–87 ms and can predate the hang, so they do not establish SQL as the 5–11 s blocker.

## Root causes

1. **Chat admission waits on MCP registration or nearby synchronous preparation before the SDK launches — high confidence for the stage, medium for the exact substep.** The 10:59:35–11:01:23 gap (`15:142636`, `15:143415`) falls after `gateAccount`/session-config and before prompt preparation in `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1230–1271`. The code awaits `ensureRegisteredForSubagents` at :1251–1252, then prompt/runtime preparation at :1271 and :1745–1826, then SDK start at :1871–1877. Current `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-http/http-mcp-server.service.ts:566–586` has a 3,000 ms race (`:119`) and a warning on deadline; no such warning was found in these logs. Its fast-path still does a synchronous `.mcp.json` read/JSON parse at :609–633. **Inference:** installed code may predate the cap or synchronous work/timer starvation may bypass the expected wall-clock bound. The cap was added by `da6e82cb4` (Nov 15 06:49 +02); follow-up `88a095846` (07:37 +02) changed this path. These are candidate fixes to verify in the installed bundle, not proven regressions. A 143 s handler is beyond the renderer's chat admission timeout and is the highest impact failure.

2. **Main-loop contention from watcher/index churn plus concurrent MCP and Git work — medium confidence as a broad latency amplifier.** The 1,045 watcher rebuild timing entries and subsecond lag coincide with `chat:start` (`15:143227–144416`). `libs/backend/task-specs/src/lib/task-index.service.ts:628–674` attaches watcher callbacks and timers; :696–724 processes pending folders; :752–798 coalesces work per root; :810–869 still scans and calls synchronous `store.replaceWorkspace` on the caller's thread. Most sampled timing entries in this window report 0–1 ms `sqliteReplaceMs` and hundreds of ms total/coalesced wait, so SQL writes alone cannot explain 143 s. The watchdog records additional independent 5–11 s main-loop stalls (`hang:443,457,459`). `549e1c2d5` (Nov 10) and `c3a4c200d` (Nov 11) touched task indexing; no commit is proven to introduce this storm. Git read load is independently large (3,156 `git:info` slow entries across both files). Existing Git-root bounding commit `01234b5f4` needs installed-bundle verification before any re-fix.

3. **Session switch has additive host waits and renderer replay — high confidence for path, medium for cause of perceived regression.** `chat:resume` alone has 187 slow entries across two files, medians 27.4 s and 34.6 s among slow entries, and one renderer timeout each day. `session:list` and Git calls add background contention. `libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts:999–1001` waits for `session:load`, :1070–1095 waits for `chat:resume`, :1211–1245 replays and finalizes. `libs/frontend/chat/src/lib/services/chat-store/session-history-replayer.service.ts:348–363` still calls `processStreamEvent` per event, but chunks by `REPLAY_CHUNK_SIZE` and yields between chunks; the old claim of one uninterrupted full JSONL replay is **stale**. The default resume requests a tail page (`session-loader.service.ts:1083`), so “all history on first open outside LRU-8” is unverified here. `1071e9b85` (Nov 14) touched cached-tab restoration, but no measured before/after switch trace links it to regression.

4. **Workspace-watch utility crash — low confidence as a contributor to later session/RPC delay.** The access violation is verified at `hang:456`; its restart/fallback may create watch load, but no 11:01 crash or restart entry directly ties it to the headline call. Treat as a separate native-process reliability issue until its restart sequence and watch count are measured.

## Session switch path

- `libs/frontend/chat/src/lib/services/chat.store.ts:230–235` delegates to `SessionLoaderService.switchSession`.
- Existing live tab can switch immediately at `session-loader.service.ts:939–948`; cold/inactive path awaits `session:load` (:999–1001), then `chat:resume` (:1070–1095), then history replay (:1211–1245). Resync may first await a previous in-flight load (:962–974).
- Host `chat:resume` is `ChatSessionService.resumeSession` (`libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:2397`); activation can invoke SDK resume at :3197. The 30 s generic RPC timeout does not govern it: `libs/frontend/core/src/lib/services/claude-rpc.service.ts:23–34,145–155` selects the shared chat admission timeout for start/continue/resume; `libs/shared/src/lib/types/rpc/rpc-chat.types.ts:38–53` sets a 90 s host admission budget plus margin. An explicit caller timeout can override it.
- Replay is chunked and yields (`session-history-replayer.service.ts:348–363`). The cost is still proportional to returned events; no switch-specific event-count or paint timing in the supplied logs proves replay dominates. The Nov 14 cached-tab change `1071e9b85` warrants targeted timing, not rollback on this evidence.

## Proposed fixes

1. **Make installed-build and admission-stage timing observable; verify rollout.** Files: `chat-session.service.ts`, `http-mcp-server.service.ts`, release/build metadata. Log bounded, redacted durations for account gate, MCP registration, prompt/runtime preparation, SDK adapter start, and queue depth; stamp app commit/version at startup. Confirm the installed bundle contains `da6e82cb4`/`88a095846`. If absent, ship the already-landed 3 s cap; if present, profile the synchronous fast path and timer starvation, then make `.mcp.json` inspection async and bounded. **Risk:** low, except changing registration behavior needs subagent MCP validation. **Size:** M. **Fixes:** 1, partly 2. **TASK_2026_415 overlap:** none.
2. **Throttle watcher/index work at the producer and measure main-loop stalls.** Files: `task-index.service.ts`, task-index store/registration, Electron main-loop watchdog. Coalesce per root and folder over a bounded window, suppress duplicate no-op timing logs, cap concurrent root rebuilds, and move large scan/SQLite work off the main loop if profiles show it there. Add duration/queue metrics for each stage. **Risk:** medium: delayed task-board freshness or missed updates if coalescing is wrong. **Size:** L. **Fixes:** 2. **TASK_2026_415 overlap:** none; its async harness reads are a separate suspected blocker.
3. **Reduce and time session-switch critical path.** Files: `session-loader.service.ts`, `session-history-replayer.service.ts`, `chat-session.service.ts` resume path. Record load/resume/replay and event-count timings; remove serial prerequisites only after checking semantics, return bounded tail data, and keep replay chunks/paint yields. Investigate slow resume admission before changing cache size. **Risk:** medium: stale transcript, follow-up routing, or history fence ordering. **Size:** M–L. **Fixes:** 3. **TASK_2026_415 overlap:** none.
4. **Audit recurring background RPC load and utility crash separately.** Files: Git watch/root polling callers and `platform-electron/src/workspace-watch/` process lifecycle. Confirm fixed Git-root code is in the installed bundle, reduce repeated `git:info`/`git:watchRoots` calls per root, and capture crash dump/restart metrics for the watch host. **Risk:** medium: stale Git indicators and watch recovery. **Size:** M. **Fixes:** 2, 4. **TASK_2026_415 overlap:** none.

Increasing the generic 30 s timeout would not fix this case: current chat-specific timeout already outlasts 90 s, and the handler exceeded it. Prior merged work (#921, #944, #1033/#1041, #1063, #1102) should be checked for installed-bundle inclusion rather than proposed again. TASK_2026_415's readiness single-flight and async harness target reads remain open, but the supplied 11:01 trace does not implicate `boot:getReadiness`.

## Decisions

- **Decision:** Rank the stage-localized MCP/preparation wait first, broad main-loop contention second, session-switch pipeline third, watcher utility crash fourth. **Options:** reverse contention and MCP, or attribute all timeout to the crash. **Evidence:** timestamped stage gap and distance from crash. **Reversible:** yes after stage metrics.
- **Decision:** Treat source-vs-installed behavior as unresolved until bundle provenance is checked. **Options:** claim a regression in current source, or assume old installed build. **Evidence:** current 3 s registration cap versus 109 s observed stage and no deadline warning. **Reversible:** yes.

## Open questions

1. Which commit/version is inside the installed `app.asar` that produced Nov 15 logs, and does its MCP registration code include `da6e82cb4`?
2. What are per-stage durations and queue lengths for the 10:59:35 `chat:start`, especially `ensureRegisteredForSubagents`, runtime profile, and SDK option building?
3. What are `session:load`, `chat:resume`, replay event-count, and first-paint durations for a slow switch, split by cached/live and cold/inactive tabs?
4. What native crash dump or restart record explains the 01:41 watch-host access violation, and did its restart raise watcher count?

No source, config, or log files were changed. No build or tests were run, as requested. No matching skill catalogue was exposed in this lane; analysis used the supplied repository and logs.



