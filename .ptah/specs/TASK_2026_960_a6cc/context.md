# Spend summary latency

## Evidence and measurements

`analytics:spendSummary` delegates to `UsageAnalyticsService.summarize` at `libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts:55,102`. The service queries the session stats repository at `libs/backend/usage-analytics/src/lib/usage-summary.service.ts:59-115`, then awaits external sources in source order at `:130-248`. The SQLite aggregate is at `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:400-427` and has a time index at `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:67`.

Throwaway benchmark, entirely synthetic temp data: 500,000 turns across 90 days and 20 workspaces, with the repository's actual aggregate SQL. Hourly slices: 2,160 queries, 551.7 ms. Daily slices: 90 queries, 251.3 ms. The 300.4 ms saving cannot explain a 28-second handler. I reverted the daily-slice change. An earlier run gave 478.5 ms versus 235.7 ms, consistent with a small saving.

Synthetic source fixtures: 200 Codex rollout files with 100 events each, 100 Grok files with 100 events each, and 10,000 OpenCode messages. Cold/warm reads in ms: Codex 847.0/61.5, Grok 406.8/92.5, OpenCode 1612.7/13.6, Antigravity 0.1/0, Ollama Cloud 0.1/0. With new source instances on the same fixtures, serial reads took 2585.6 ms and concurrent reads 2069.4 ms. These measurements show external reads are more costly than slice overhead in this fixture; they do not measure the installed user's folders. `FileFactsCache` already keys complete file projections by file path, size, and mtime at `libs/backend/usage-analytics/src/lib/sources/file-facts.ts:13-41`, so no duplicate cache was added. The benchmark script and all synthetic data were removed after measurement.

Read-only installed Electron log inspection under the `Ptah` logs folder (not `Ptah Dev`), all UTC 2026-11-11: `provider:getPlanLimits` 3320.2 ms at 20:04:03.633; event-loop max lag 795.9 ms at 20:04:21.283; `analytics:spendSummary` 28178 ms at 20:04:28.570. There is no spend-summary SQL warning or per-source timing entry from 20:04:00 through 20:04:30. The adjacent SQLite slow warning at 20:03:28.366 took 71.5 ms for an unrelated metadata query selecting id, workspace root, subject, type, concepts, files, and creation time. Event-loop max lag reached 812.6 ms at 20:04:43.338. The installed log establishes long wall time and some loop lag, but does not identify one dominant source. No private paths, names, or tokens were copied.

## Final cause and fix

The prior implementation awaited the external source reads serially (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts:130-139` before this fix), so slow async file or OpenCode reads accumulated on the RPC wall clock. The synthetic benchmark supports this as a larger contributor than hourly SQL overhead. The installed log does not prove which individual source dominated that run. The source path is `CodexSource.read` at `libs/backend/usage-analytics/src/lib/sources/codex.source.ts:17-42`, with `createReadStream` at `libs/backend/usage-analytics/src/lib/sources/file-facts.ts:25`; OpenCode also runs synchronous JSON-filtered SQLite queries at `libs/backend/usage-analytics/src/lib/sources/opencode.source.ts:42-61`.

`UsageAnalyticsService` now starts independent external reads concurrently, then consumes results in the original order to preserve aggregation and status semantics. Later readers start on the next event-loop turn so a fast first reader can settle before another reader aborts the shared budget. Each has a 10-second cooperative abort budget plus a 1-second grace period; a stalled reader produces a partial status while other completed sources remain available. `OpenCodeSource` now checks cancellation after its awaited file stats so it does not start a late SQLite read after the RPC has ended. The RPC's 30-second overall budget remains. Synchronous SQLite statements cannot be interrupted mid-statement, so this deadline bounds cooperative I/O and waiting, not a native call that blocks the event loop. Regression tests check concurrent starts, stalled-reader partial status, source-abort ordering, and the aggregate's indexed plan on a 20,000-row temp database. No migration of the installed 1.5 GB database was added.

## Plan limits

`provider:getPlanLimits` calls `PlanLimitsSnapshotService.snapshot` at `libs/backend/rpc-handlers/src/lib/handlers/provider-rpc.handlers.ts:266-273`. That service discovers owners and reads provider snapshots in parallel at `libs/backend/rpc-handlers/src/lib/services/plan-limits-snapshot.service.ts:179-184,212-240`; discovery fans out to detection, CLI stores, sessions, and lanes at `libs/backend/cli-agent-runtime/src/lib/cli-agents/limits/plan-limit-owner-discovery.service.ts:227-310`. It does not use the usage summary repository or external usage sources. Its observed 3.3-second wall time is a separate path; it was not changed.

## Changed files

- `libs/backend/usage-analytics/src/lib/usage-summary.service.ts`
- `libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts`
- `libs/backend/usage-analytics/src/lib/sources/opencode.source.ts`
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts`
- `.ptah/specs/TASK_2026_960_a6cc/context.md`

## Verification

- `npm run verify -- -p @ptah-extension/persistence-sqlite` — PASS (lint, typecheck, test).
- `npm run verify -- -p @ptah-extension/usage-analytics` — initial two runs FAIL (lint/typecheck passed; one ordering test, then one concurrency test failed). Final rerun PASS (lint, typecheck, test).

## Parent-abort review fix

The review identified a remaining wait at `libs/backend/usage-analytics/src/lib/usage-summary.service.ts:136-171`: aborting the parent signal aborted each child controller but did not settle its pending `Promise.race` if a reader ignored cancellation. A summary could therefore remain pending until the 10-second source deadline and 1-second grace after the RPC's 30-second budget. Each source race now includes a promise rejected by the parent abort listener. The existing `finally` clears the source deadline and grace timers and removes that listener when the race settles. The source is reported partial with reason `time-budget`.

A fake-timer regression test in `libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts` aborts an unresolved source before its deadline, asserts that summarize resolves after advancing just 1 ms, and checks timer cleanup. This review changed `libs/backend/usage-analytics/src/lib/usage-summary.service.ts`, `libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts`, and this context file.

Verification: `npm run verify -- -p @ptah-extension/usage-analytics` — PASS (lint, typecheck, test; exit code 0).
