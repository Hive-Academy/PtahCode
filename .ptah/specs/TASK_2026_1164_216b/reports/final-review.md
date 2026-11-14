# Final review — TASK_2026_1164_216b

**Verdict: REJECT.** The live sink rejects the new contribution shape, and Codex live/replay ownership can count the same native thread twice. The focused batch tests and type checks reported by B9/B11 do not exercise these two end-to-end paths. `ptah_get_diagnostics` was unavailable after its 45-second TypeScript timeout; no gate, build, Nx, or e2e command was run here.

## Findings

### Blocker — new live contributions fail at the SQLite boundary

`libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts:15-49,71-75` uses a `.strict()` schema that omits `nativeThreadId`, `repositoryId`, `worktreePath`, `source`, `missingReason`, `billable`, and both coverage bounds. New producers send these fields: `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:152-187` sends `nativeThreadId`, `missingReason`, `billable`, and bounds; `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:868-875` sends `missingReason` and bounds. Zod rejects those writes before `toRows`, so newly measured live usage is absent, finalization cannot recover it, and replay may become the only billable source. **Fix:** add every optional port field to the sink schema with its proper Zod type, then test actual owner and lane contributions through `recordUsage` into SQLite.

### Blocker — Codex native-thread ownership is keyed to the wrong session

`libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:331-350` demotes replay only where `live.session_id = replay.session_id`. Codex replay always uses the rollout thread UUID as `sessionId` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts:158-169`), while a checkpoint uses the Ptah session ID and stores the native root in `runId` (`libs/backend/agent-sdk/src/lib/session-metadata-store.ts:305-309`). A lane can also fall back to its lane `runId` despite having a native thread (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:153-159`). Once the sink accepts these writes, replay and measured live rows for the same thread remain billable together. **Fix:** match Codex ownership by verified native thread ID (checkpoint root and verified descendants; lane `nativeThreadId`) independently of Ptah `session_id`, then recompute affected aggregates in the same transaction. Add a checkpoint with different Ptah/native IDs and a lane without `cliSessionId` to the replay integration tests.

### Major — malformed replay events can permanently advance the cursor

`libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts:211-227` catches any Zod failure from a chunk, retries events individually, drops failures, then commits `next` with an empty event list. A schema mismatch or malformed but otherwise readable usage record is permanently skipped on the next scan. This breaks the specified rollback-on-failed-write contract and can silently undercount historical usage (the warning contains only a count). **Fix:** keep the cursor before the first rejected event, or persist a durable rejected-record marker with source path/offset and explicit coverage degradation; never advance past a failed ledger write as if it succeeded.

### Major — startup reconciliation has no discovery-page cap

`libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts:159-200` traverses every file and drains every file's chunks in one pass; `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts:85-95` iterates the full selected Codex tree. The 256 KiB range reads and `setImmediate` yields bound individual operations, but do not cap total startup I/O. Large historical profiles can keep background scans active for a long period and compete with the host; B9 independently reports the missing first-page cap. **Fix:** persist discovery pagination and enforce a first-page/byte or time budget per pass, resuming later without skipping files.

### Major — empty live model lists become measured zero usage

`libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts:247-275` synthesizes four zero counters for an event with no models and defaults `billable` to true. The task contract says absent counters are NULL and own no interval, whereas a measured all-zero event is distinct. This row can suppress replay for its session and make coverage appear complete. **Fix:** synthesize NULL counters and `billable=false` for no-measurement events; preserve zero only when the producer actually reported zero.

## Five logic questions

1. **Silent failure:** rejected live writes are logged by the sink but the dashboard can still show replay-only totals; dropped replay Zod events advance the cursor (findings 1 and 3).
2. **Unexpected user action:** opening usage after a Codex run can show live and replay spend for the same native thread (finding 2).
3. **Wrong input answer:** an empty model list is stored as measured zero and may claim ownership (finding 5).
4. **Dependency failure:** a failed database write rolls back its transaction in `usage-cursor-repository.ts:97-118`; a Zod rejection in the reconciler instead advances the cursor (finding 3).
5. **Missing requirement detail:** startup enumeration needs a persisted page boundary to honor the stated cap without losing older files (finding 4).

## Scope and residual risk

Reviewed the committed B0-B8/B10 diff plus the B9/B11 working tree, task ownership contract, batch reports, source/replay/SQL paths, host start/stop wiring, repository summary and dashboard contract. Electron `will-quit` calls stop (`apps/ptah-electron/src/main.ts:509-512`); CLI disposal does too (`libs/backend/cli-engine/src/lib/container.ts:423-426`). The optional `UsageSummary.repositories` field is backward compatible (`libs/shared/src/lib/types/rpc/rpc-analytics.types.ts:66`), and the dashboard labels known repository cost as partial (`libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-dashboard.component.html:114`). No source files were edited. Reassess after the two blockers are fixed and an end-to-end live-to-replay ledger test passes.
