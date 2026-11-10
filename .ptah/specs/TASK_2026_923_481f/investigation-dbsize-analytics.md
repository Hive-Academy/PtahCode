# Investigation: database size and analytics (TASK_2026_923_481f)

Scope: read-only. Paths are relative to the worktree. Log lines are in
`Ptah Electron-2026-11-10.log` (UTC). No database was opened.

## Q4 - Why is `ptah.sqlite` 1.5 GB with 47920 free pages?

**Short answer.** The free pages explain only 12% of the file: 47920 x 4096 B = 187 MiB of
1563 MiB. About 1.37 GiB is live data. The size comes from the memory store and the code
index (text, FTS5 index and 384-float vectors), plus the observation queue. Rows are removed
only by age and count rules for `memories` (and only if the lifecycle runs), by processed-row
rules for `observation_queue`, and by per-file rules for `code_symbols`. No table has a
total-size cap. No full `VACUUM` exists after migration 0009. This is inference from code.
The per-table byte counts are unknown, because the real database was not opened.

### Size candidates

| Table (migration:line) | Writer (file:line) | Retention | Runs |
|---|---|---|---|
| `memory_chunks` text + `memory_chunks_fts` + `memory_chunks_vec` FLOAT[384] (`0002_memory.ts:37,48,70`) | `memory-curator/src/lib/memory.store.ts:281,760` | Archive after 30 d, delete after 60 d, cap 25 000 per workspace (`memory-lifecycle-config.ts:14-16`). Pinned and `core` rows excluded (`memory-lifecycle.store.ts:50-58`) | Hourly cron tick, run decided by `memory-retention.service.ts:304` |
| `code_symbols` + `code_symbols_fts` + `code_symbols_vec` FLOAT[384] (`0013_code_symbols.ts:14,31,54`) | `memory-curator/src/lib/code-symbol.store.ts:511,721` | Delete only per file on re-index (`:508,627`) and for orphans. No age or workspace-size rule found | On index events |
| `observation_queue` with `tool_input_json`, `tool_response_text`, `assistant_message` (`0016_observation_queue.ts:17`) | `memory-curator/src/lib/observation-queue.store.ts:136` | Delete only rows with `processed_at` older than a cutoff (`observation-retention.store.ts:55-57`). Unprocessed rows never deleted | Same retention run |
| `gateway_messages` (`0005_gateway.ts:21`) | gateway lib | No retention found (not traced further) | - |

Evidence for the live-data share:
- `memory_chunks_fts.bm25`, `memory_chunks_vec.knn` and `code_symbols_vec.knn` appear as slow
  queries in the search worker (log 14400-14407, 20916-20920, 34435-34436). The indexes are large.
- A 601-613 MB WAL is logged (log 10533, 24189). That WAL is separate from the 1563 MiB main
  file, but it shows heavy write volume.
- Pre-migration copies sit next to the database: `ptah.pre-migration-20261110T...sqlite`
  is 1.64 GB (directory listing of `~/.ptah/state`). It is disk use, not database size.
- Stores of the other databases are small: `sessions.sqlite` is 22 MB, `ptah-dev.sqlite` 380 MB.

### PRAGMAs at open (`libs/backend/persistence-sqlite/src/lib/sqlite-connection.service.ts`)

1. `:105-112` `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`,
   `temp_store = MEMORY`, `mmap_size = 268435456` (256 MiB), `busy_timeout = 5000`.
2. `cache_size` and `page_size`: **not set**. Defaults apply (page size 4096 per log 33493,
   cache about 2 MB).
3. `auto_vacuum`: not set at open. Migration `0009_auto_vacuum.ts:54-59` sets `INCREMENTAL`
   once, with `VACUUM INTO` when `dbPath` is a file. The reclaimer reports the mode
   (`sqlite-page-reclaimer.ts:207`). A database created before 0009 and never rebuilt stays
   in mode 0. The mode of this file is unverified.
4. `wal_autocheckpoint`: set to 0 after start so that a worker checkpoints
   (`:634-637`; log 33556-33557 at 15:58:24).
5. `wal_checkpoint(TRUNCATE)` on close only (`:576`).

### Reclaim and checkpoint policy

1. `sqlite-page-reclaimer.ts:140` runs `incremental_vacuum(N)` with N at most 65 536
   (`:34`). It never runs a full vacuum (doc `:5-11`).
2. `memory-retention.service.ts:489-536` calls it in bounded steps after the purge, then a
   PASSIVE checkpoint (`:536`, `sqlite-page-reclaimer.ts:176`). It stops with
   `auto-vacuum-not-incremental` (`:498-500`) when the mode is not 2.
3. The scheduler `WAL checkpoint scheduler started` (log 33513) polls every 5 s and
   checkpoints every 30 s or at 16 MiB WAL.
4. The page reclaimer and the purge use `better-sqlite3` on the same shared connection. The
   steps are bounded in time per batch, not off the main thread.

### What the 15:57:46 start did to the size

The pre-migration copy is dated `20261110T155746869Z`, the same millisecond block as log 33493.
So pending migrations existed at that start (`migration-runner.ts:92-108`). The copy runs in the
integrity worker (`backup.service.ts:1-14`), not on the main thread. Its comment records
~27 s on a 1 GB database when it ran in process. The earlier in-process time is the same
27 s figure as the `ptahCli:list` duration. The copy is now out of process, but see Q5.

## Q5 - `analytics:spendSummary` 31.5 s and the other two slow RPC handlers

**Short answer.** `spendSummary` is not slow only because of the stall. It started at
15:58:22.25 (end 15:58:53.827 minus 31573 ms), after the last lag at 15:58:21.70. It then ran
about 31.5 s alone and hit its own 30 s abort budget (`analytics-rpc.handlers.ts:33`). The
cost is file scans of agent transcripts, not the large `ptah.sqlite`. `ptahCli:list` and
`auth:getAuthStatus` are the opposite case: they did almost no work of their own and
waited for the loop.

### Handler path

1. Handler `libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts:56-97` sets
   `USAGE_SUMMARY_BUDGET_MS = 30_000` (`:33`) with `setTimeout(... abort ...)` (`:87`).
2. `usage-summary.service.ts:57-127` reads the ledger first, then loops over `this.sources`
   (`:128-136`): `claude-ledger`, `codex`, `grok`, `opencode`.
3. Ledger query: `session-stats-repository.ts:400-429`. Quote:
   `FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id WHERE
   COALESCE(s.workspace_key, t.workspace_key) = ? AND t.occurred_at_ms >= ? AND
   t.occurred_at_ms < ? GROUP BY day, t.provider_id, ...`. Three more statements follow:
   session count, message count, top sessions (`usage-summary.service.ts:95-99`).
4. **Database used:** `sessions.sqlite` (the session store, 22 MB), not `ptah.sqlite`.
   `session-store-database.ts:14-18,44,62` opens it with `journal_mode = WAL` and
   `synchronous = NORMAL`. Calls are synchronous `better-sqlite3` on the main thread.
   `await store.ready()` only awaits the open.
5. **Indexes** (`session-store/session-store-migrations.ts:67-69`):
   `idx_session_usage_turns_time (occurred_at_ms, provider_id, model_id)`,
   `idx_session_usage_turns_session_time`, `idx_session_usage_workspace_time
   (workspace_key, occurred_at_ms)`. The `COALESCE(s.workspace_key, t.workspace_key) = ?`
   predicate blocks use of the workspace index. The planner can only use the time range
   index, then join `sessions` by key. The query slices by `LEDGER_SLICE_MS` when a
   signal is set (`:63-65`). No JSON column is parsed in the ledger SQL. With a 22 MB
   store this is unlikely to take seconds. Per-query timing is not logged.
6. **Transcript scans** (the likely 30 s): `claude-ledger.source.ts:92-120` walks
   `~/.claude/projects` through `SessionStatsReaderService` (`agent-sdk/.../
   session-stats-reader.service.ts:166,522`, async `fs.readdir`). Limits are 10 000 files and
   100 000 records per root (`:6-7`). `codex.source.ts:27` and `grok.source.ts:21-35` read
   `rollout-*.jsonl` and `updates.jsonl` with `createReadStream` + `JSON.parse` per line
   (`file-facts.ts:6-9,24`; 64 MiB per file). The result cache key is size + mtime
   (`file-facts.ts:21`), so the first cold scan after start parses everything.
7. **OpenCode source** runs synchronous `better-sqlite3` on the main thread
   (`opencode.source.ts:30-61`): `json_valid(data)` and `json_extract(m.data,'$.role')`
   over `message`, paged at 256 rows with a `setImmediate` yield (`:42,58`), but the final
   query `LIMIT 100001` (`:61`) runs in one block. JSON is parsed in SQL for every row
   in range. It cannot use an index on `$.role`.
8. **Other 30 s runs** with the same pattern: log 16179 (30011 ms, 05:22), 37547 and 37558
   (30003 ms and 30001 ms, 17:36-17:37), long after any stall. Several 2-6.7 s runs also
   occur (log 51, 816, 1131, 16589). So the handler is slow by itself on a cold or
   large scan, with no stall present. Repeated runs (13:02 etc.) show no cache win after
   the process restarts: the cache is in memory only (`file-facts.ts:15`, `opencode.source.ts:15`).

### Timing against the stall window

Loop lag lines: log 33498 (8006.9 ms, 15:57:55.482), 33499 (17259 ms, 15:58:14.740),
33518 (2990.5 ms, 15:58:21.701). The window is about 15:57:47.5 to 15:58:21.7.

| Handler | Start (end - duration) | End | Duration | Outside stall |
|---|---|---|---|---|
| `auth:getAuthStatus` (log 33504) | 15:57:55.49 | 15:58:14.742 | 19247 ms | About 0 s. The call began just as the first 8 s lag ended and waited until the 17 s lag ended |
| `ptahCli:list` (log 33547) | 15:57:55.49 | 15:58:22.671 | 27184 ms | About 1 s after 15:58:21.7 |
| `analytics:spendSummary` (log 33775-33776) | 15:58:22.25 | 15:58:53.827 | 31573 ms | **All 31.5 s**. Hit the 30 s budget plus about 1.5 s |

Two identical lines (33775 and 33776) show two parallel `spendSummary` calls. The renderer
RPC timeout fired at 15:58:22.247 for `ptahCli:list` and `auth:getAuthStatus` (log 33536-33538).

### `ptahCli:list` and `auth:getAuthStatus`

1. `ptahCli:list` (`ptah-cli-rpc.handlers.ts:106-125`) calls `ptahCliRegistry.listAgents()`.
   `ptah-cli-registry.ts:317-337` runs `ensureMigrated()` and `Promise.all` over agents with
   `authSecrets.getCredential/hasProviderKey` and `isKimiCodeConnectionUsable()`. These are
   async secret reads and a small check: no heavy sync work was found. Likely wait on the
   loop and on the 3 s lag. The residual 1 s after 21.7 s is below the noise level.
2. `auth:getAuthStatus` (`auth/auth-status-methods.ts:60-100`) returns a cache hit, a coalesced
   in-flight promise, or `statusCache.compute(...)`. `compute` was not traced in depth. The
   17 s duration matches the 17.259 s lag exactly, so it is wait time.

## Proposed fixes

1. **Move analytics scans off the main thread** (files: `usage-summary.service.ts`,
   `sources/opencode.source.ts`, `sources/file-facts.ts`, `analytics-rpc.handlers.ts`).
   Run the source reads in a worker (the repo has a search worker and an integrity worker
   pattern), or at least yield per file and per paged batch. Not data-safety related.
2. **Defer `analytics:spendSummary` until boot idle** (handler, plus
   `libs/frontend/chat/.../usage-vitals.cache.ts:88`,
   `libs/frontend/dashboard/.../analytics-usage.store.ts:123`). Do not call it during the
   first 60 s. Return the cached or partial result when `[background-work] lagging`.
3. **Persist the scan cache** or add a time-window summary table for the `claude-ledger`,
   codex and grok sources, so a restart does not rescan. Lower the 30 s budget to 8-10 s and
   return `partial` (the service already supports `time-budget`).
4. **Replace the `COALESCE(s.workspace_key, t.workspace_key)` predicate** in
   `session-stats-repository.ts:422` with an index-friendly form (two `UNION ALL` branches
   or a backfilled `workspace_key`). Low value: the store is 22 MB.
5. **Coalesce duplicate `spendSummary` calls** (two at 15:58:53) in the handler with an
   in-flight promise per `{range, workspace}`.
6. **Add per-statement timing** for the ledger queries before making change 4.
7. **USER-RESERVED: total-size cap and age retention for `code_symbols` and
   `memory_chunks` indexes** (`code-symbol.store.ts`, `memory-lifecycle-config.ts`,
   `memory-retention.service.ts`). This deletes user data.
   Options: (a) keep as is; (b) cap `code_symbols` per workspace and delete rows of
   workspaces not opened for N days; (c) lower `maxPerWorkspace` below 25 000.
   Recommendation: (b), after a table size report (fix 9).
8. **USER-RESERVED: reclaim the 187 MiB free pages and verify `auto_vacuum`**
   (`sqlite-page-reclaimer.ts`, `memory-retention.service.ts`).
   Options: (a) do nothing: free pages are reused by new rows; (b) run bounded
   `incremental_vacuum` after boot idle, only when `auto_vacuum` = 2; (c) one manual
   `VACUUM INTO` in a worker with a backup.
   Recommendation: (a), then (b). Do not run a full `VACUUM` on the main thread. Check the
   `auto_vacuum` mode first (add it to `logConnectionHealth`, `sqlite-connection.service.ts:665-684`).
9. **Add a per-table size report** (non-destructive): `dbstat` virtual table in the
   integrity worker, exposed through `db:health`. This gives the missing evidence for Q4.
10. **Avoid a pre-migration copy of a 1.6 GB database on every migration** when the
    pending migration is additive (`migration-runner.ts:92-108`, `backup.service.ts:170`).
    USER-RESERVED: it changes the backup safety net. Options: keep; skip for additive
    migrations; copy only when free disk is enough. Recommendation: keep, and measure the
    worker's impact on the main loop first (the worker is a separate process, so the stall
    source is likely elsewhere: see the sibling investigation).

## Decisions

1. Treat the free pages (187 MiB) as secondary. The main growth is live memory and
   code index data. Confirm with fix 9 before any delete.
2. Fix the `spendSummary` handler first (fixes 1-3, 5). It is slow by itself and also
   adds main-thread work during the busy start.
3. No change of PRAGMAs is proposed. `mmap_size` 256 MiB and `synchronous = NORMAL` are
   acceptable. Setting `cache_size` is optional and needs a measured gain.
4. Open question for the user: approval of items 7, 8 and 10 (USER-RESERVED).
5. Not verified: `auto_vacuum` mode of the real file, per-table byte counts, the body of
   `statusCache.compute`, and the exact source of the 27 s stall before 15:57:55.
