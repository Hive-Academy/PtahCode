# Usage capture root cause

## Summary

The largest measurable gap is that the durable ledger captures live events only. Its port says transcript backfill is absent (`libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts:40`), and analytics explicitly reports historical sessions missing (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts:117-120`). The supplied 29k main and 24k child Claude requests cannot be converted into missing tokens without deduplicating transcript events against the ledger.

SDK usage is saved on accepted cumulative `result` messages, rather than each assistant message (`libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:643-700,709-750`). Crashes before a result, rejected/duplicate results, and sessions outside the owner can leave gaps.

Lane usage reaches outcome rows only if a handle declares `outcomeUsageIsTurnTotal`; only Codex declares it in the searched source (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1494-1499`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:845`). Several other adapters parse usage but cannot populate that completion field. The exact reasons for the supplied 448 NULL Codex rows are **UNVERIFIED**.

Analytics filters exact `workspace_key`, while lanes derive that key from working directory (`libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:421-435`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:170`). This fragments totals across worktrees. It hides rows but does not lose their tokens.

## Capture pipeline map

| Writer / table | Trigger and host | Supported source and drops |
|---|---|---|
| `SessionStatsOwnerService` → `SqliteSessionUsageSink` → `SessionStatsRepository`: `session_usage_turns`, `session_stats`, `session_usage_coverage` | Accepted SDK result; host with sink. Electron registers it at `apps/ptah-electron/src/di/phase-1-infra.ts:167`; CLI at `libs/backend/cli-engine/src/lib/container.ts:508`. | `sdk-owner`; rejected/duplicate/stale result and zero delta omitted (`libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:643-750,1222-1225`). Repository inserts and updates stats/coverage (`libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:150-236`). |
| `SessionMetadataStore` → same sink/tables | Native Codex checkpoint in registered host | `codex-checkpoint`; regressing checkpoint rejected; failed sink write does not roll back checkpoint (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:1539-1623`). Supplied period has no rows. |
| `recordLaneUsageOutcome` → same sink/tables | CLI lane terminal release in host | `cli-lane`; only `tracked.outcomeUsage`, which requires turn-total flag; missing or all-zero usage skipped (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1494-1499,3647-3659`; `lane-completion-outcome.ts:116-137`). |
| `LaneOutcomeRecorderService` / `SqliteLaneOutcomeStore`: token/cost columns of `lane_outcome_records` | Lane-completion signal via write pipeline (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:3661-3666`; `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts:157-206`). | Defaults NULL; mapper copies optional usage; SQLite maps columns (`libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts:122-124`; `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:75-77`; `libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.ts:48-58`). |
| Finalizer | Startup/interval in registered host | Changes `session_stats` status, not historical token rows (`libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts:148-163`; `session-stats-repository.ts:262-315`). |

Sink schema allows `sdk-owner`, `codex-checkpoint`, `cli-lane`; queue overflow rejects writes (`libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts:18,71-92`). The adapter inserts `__unattributed__` for absent model and `__session_residual__` for cost residual (`sqlite-session-usage-sink.ts:223-285`). These labels mean attribution gaps, not necessarily missing tokens. Event primary key is `(session_id, producer, event_key, model_id)` (`libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:45-65`).

## Root causes

1. **No historical or external transcript ingestion.** The port explicitly says live capture only and no transcript backfill (`libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts:40`). Claude JSONL from sessions outside Ptah's owner is invisible. Likely largest gap; token share **UNVERIFIED**.
2. **SDK result boundary.** Only accepted cumulative result captures usage; stale, invalid, duplicate, ignored-error and non-monotonic results do not (`libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:643-700`). Task-tool subagent spend can be included in the parent cumulative model cost, while per-turn usage is main-loop only (`session-stats-owner.service.ts:1173-1184`). No separate subagent ledger key is demonstrated. Token share **UNVERIFIED**.
3. **Lane completion gate.** Only Codex declares the turn-total capability, so other parsed usage never enters `tracked.outcomeUsage` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1494-1499`; `cli-adapters/codex/codex-app-server-lane.adapter.ts:845`). This explains NULL outcome columns for many non-Codex lanes. The supplied non-Codex NULL count is 775; its token share is **UNVERIFIED**.
4. **Incomplete Codex completions.** Codex event usage is optional (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-events.ts:51,237-245`), and completion copies only tracked usage (`agent-process-manager.service.ts:3647-3666`). Whether the supplied 448 NULL rows are failed launches, interruptions, old rows, or missing events is **UNVERIFIED**.
5. **Exact workspace filtering.** Analytics queries one key (`libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:421-435`); lane keys use working directory (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:170`). This explains partial per-repository UI totals across worktrees.

**SDK path status:** Ptah main chat and child sessions are recorded *if* they pass the owner, produce an accepted result, and have sink registration (`session-stats-owner.service.ts:643-750`). Whether every `ptah_session_start` child does is **UNVERIFIED**. Task-tool subagents may be aggregated into parent result, not separately attributed (`session-stats-owner.service.ts:1173-1184`). Resumed runs can record later accepted results; duplicate or stale results do not (`session-stats-owner.service.ts:643-700`). Crash/interruption before result: not live recorded. `persistSession:false` one-shot has no transcript recovery (`libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:712`); whether it enters the owner is **UNVERIFIED**. Electron and CLI register sink (`apps/ptah-electron/src/di/phase-1-infra.ts:167`; `libs/backend/cli-engine/src/lib/container.ts:508`); VS Code registration **UNVERIFIED**. Pre-November 6 sessions were not backfilled (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts:117-120`).

## Lane adapters

| Family | Parses usage? / exposure in checked code | Consequence |
|---|---|---|
| Codex | Yes; app-server event mapper (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-events.ts:51,78-82,285-303`); rollout fixture includes cumulative and last token usage (`codex/__fixtures__/rollout-tail.jsonl:4-6`). | Only turn-total flagged handle (`codex/codex-app-server-lane.adapter.ts:845`); 448 NULL exact cause **UNVERIFIED**. |
| Grok | ACP handle validates and forwards prompt usage (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-session-handle.ts:105-116,822`); fixture includes `turn_completed.usage` (`acp/__fixtures__/grok-plain-turn.ndjson:71-74`). | No turn-total flag found; outcome usage blocked. |
| Antigravity | Yes, step and cumulative result usage (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts:139-143,834-845,878-897`). | No turn-total flag found. |
| OpenCode | Yes, step tokens and cost (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts:967-973,1221-1224`). | No turn-total flag found. |
| Copilot | Yes, `assistant.usage` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts:36,485-510,751-784`). | No turn-total flag found. |
| Cursor | Yes, usage event (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts:111,495`). | No turn-total flag found. |
| Pi | Yes, `message_end` / `turn_end` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.ts:532-544,744-754`). | No turn-total flag found. |
| Claude | SDK lane path exists (`libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts:1-31`). | Usage extraction and completion path **UNVERIFIED**. |
| ptah-cli anthropic-api, kimi-code, ollama-cloud | Stream loop has usage/model deltas (`libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts:659-669,828-876`). | How these become outcome rows **UNVERIFIED**; supplied rows NULL. |

External vendor documentation was not verified; “exposure” above means repository schemas/fixtures, not a guarantee for every installed CLI version.

## Read path / UI

`analytics:spendSummary` delegates to ledger-backed usage summary; dashboard store requests it (`libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts:4-5,31`; `libs/frontend/dashboard/src/lib/services/analytics-usage.store.ts:123`). It reads workspace coverage and marks historical Claude usage partial (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts:63-119`). `session:stats-batch` is a separate RPC for session analytics (`libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:1554-1595`); chat header also receives provisional `session:stats-live` (`libs/frontend/chat/src/lib/services/chat-message-handler.service.ts:869-880`). Different paths can show different totals. The dashboard recognizes the historical warning (`libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-summary.view-model.ts:306`).

## Prior attempts

`TASK_2026_870_session-stats-ledger` planned live accepted-result capture, Codex checkpoints, and bounded JSONL recovery (`.ptah/specs/TASK_2026_870_session-stats-ledger/implementation-plan.md:15-20`); current port still says no backfill (`libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts:40`). Budget investigations streamed Claude JSONL and Codex token deltas, but found named-profile transcripts absent in the period (`.ptah/specs/TASK_2026_AGENT_BUDGET/usage-burn-investigation.md:10,102-108`; `usage-burn-named-account.md:41-49`). `boot_scan_state` belongs to memory boot scanning (`libs/backend/persistence-sqlite/src/lib/migrations/0014_boot_scan_state.ts:1`; `libs/backend/memory-curator/src/lib/triggers/boot-scan-runner.ts:1`). Lane write pipeline journals outcomes (`libs/backend/lane-outcomes/src/lib/di/start.ts:19`); stats finalizer changes status only (`libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:262-315`). No usage transcript reconciler was found in searched stores.

## Proposed design

Extend `SESSION_USAGE_SINK` to accept one normalized event with source, stable event key, scope (`message`, `turn`, `session-cumulative`), repository ID, workspace key, session/parent IDs, lane run, optional task/PR, per-field nullable tokens, nullable cost, authority, and evidence reference. Preserve `session_usage_turns`, `session_stats`, `session_usage_coverage`, and `lane_outcome_records`; add nullable provenance/coverage columns and `usage_source_cursor` migration. NULL means unknown; zero means measured zero. Existing primary key and queue are starting points (`libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:45-65`; `sqlite-session-usage-sink.ts:71-92`).

Live collectors listen to turn settle, session close, and lane completion. Each adapter declares whether usage is per message, per turn, or cumulative; normalize and delta before writing. Do not merely enable the current turn-total flag on cumulative segments. Write lane outcome token columns from the same normalized event. If a provider yields no usage, save a coverage record with NULL tokens and reason.

A worker streams Claude JSONL under `~/.claude/projects`, Codex rollouts under `~/.codex/sessions`, and verified provider files/APIs where available. Trigger from events plus startup/timer reconciliation. Store file fingerprint, mtime, byte offset, and last event key; checkpoint cursor after transaction. Chunk or run off main thread, bound memory, rescan on rotation/truncation. Deduplicate Claude assistant request IDs and delta Codex cumulative counts. Reconcile live and file evidence by stable provider event key and authority without adding both. Derive canonical repository ID from git common directory, retain worktree path, and link parent/lane/task/PR only from explicit metadata.

## Batches

Proposed commands only; none run. Each batch has at most six files and two Nx projects.

1. **Live contract and schema:** `agent-sdk/src/lib/session-stats/session-usage-sink.ts`, `session-stats-owner.service.ts`; `persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts`, `session-stats-repository.ts`, `session-store-migrations.ts` (all under `libs/backend/`). Verify `npm run verify -- -p @ptah-extension/agent-sdk @ptah-extension/persistence-sqlite`.
2. **Claude recovery:** `persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts`, `session-store-migrations.ts`; `agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.ts`, `usage-reconciliation.service.ts`, `session-usage-sink.ts`. Verify same two projects.
3. **Lane normalization:** `cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`, `lane-completion-outcome.ts`, `cli-adapters/cli-adapter.interface.ts`, `cli-adapters/codex/codex-lane-events.ts`; `lane-outcomes/src/lib/lane-outcome-recorder.service.ts`. Verify `npm run verify -- -p @ptah-extension/cli-agent-runtime @ptah-extension/lane-outcomes`.
4. **Adapter coverage:** `cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts`, `opencode-cli.adapter.ts`, `copilot-sdk.adapter.ts`, `cursor-cli.adapter.ts`, `pi-cli.adapter.ts`, `acp/acp-session-handle.ts`. Verify `npm run verify -- -p @ptah-extension/cli-agent-runtime`.
5. **Repository aggregation:** `persistence-sqlite/src/lib/session-store/session-stats-repository.ts`; `usage-analytics/src/lib/usage-summary.service.ts`. Verify `npm run verify -- -p @ptah-extension/persistence-sqlite @ptah-extension/usage-analytics`. Frontend display follow-up: `libs/frontend/dashboard/src/lib/services/analytics-usage.store.ts` and `components/usage-dashboard/usage-summary.view-model.ts`; verify with its actual Nx project name (not confirmed).

## Decisions

- **Recommend live result as first authority, file replay as recovery.** Cumulative SDK results require deltas (`libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:1215-1228`); composite event key permits replay convergence (`libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:65`). Reversible.
- **Recommend repository ID alongside workspace key.** Lane working directory is the current key (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:170`). Reversible.
- **Recommend NULL for unknown, zero only for verified zero.** Outcome defaults NULL (`libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts:122-124`), but current lane builder coalesces absent fields to zero (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:121-129`). Reversible with migration.

## Open questions

1. Which configured Claude profile directories may be scanned? Recommend an explicit source registry and metadata-only cursors; named accounts may use separate config directories (`.ptah/specs/TASK_2026_AGENT_BUDGET/usage-burn-investigation.md:102-106`).
2. Should repository ID use git common-dir (worktrees grouped locally) or remote URL (clones grouped, possible fork collision)? Recommend common-dir plus optional remote grouping.
3. How should Task-tool subagent usage already included in parent cumulative result be attributed? Recommend one billable event with parent/child links, never double sum (`libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:1173-1184`).
4. Exact 448 Codex NULL breakdown and ptah-cli provider outcome route remain **UNVERIFIED**. Add reason counters before attributing a specific failure mode.
