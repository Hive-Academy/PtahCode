# Code Logic Review - TASK_2026_2198_569c

## Verdict

CHANGES REQUIRED. Score: 5/10. The repeated 12-second backfill sort is addressed, but user-visible stale repository data and substantial single-statement Electron stalls remain. This is above the 3-4 band because paging now converges and the SQL rewrite preserves its boolean result; below 7-8 because the remaining cases occur on normal failures and the measured database.

## Confirmed findings (severity order)

### Serious - transient resolver failures suppress backfill for seven days

- `libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts:41-48`, `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:171`: a thrown git timeout is cached as `null` and every affected row is stamped exactly like a nonexistent path. The next quiet pass cannot retry it for seven days, so repository spend and paths remain missing after git recovers. The original incident includes git timeouts while Electron is stalled. Minimal fix: distinguish exceptions from definitive `null` results; leave exception rows eligible for the next pass or give them a short bounded retry, with a test for recovery.

### Serious - one summary query still holds the Electron loop for hundreds of milliseconds

- `libs/backend/usage-analytics/src/lib/usage-summary.service.ts:70`, `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:701-730,759-806`: `yieldImmediate()` follows the synchronous SQLite statement and cannot interrupt it. The implementer's read-only measurements on the main workspace still show a 90-day top-sessions statement at 394.5 ms, groups at 227.9 ms and message count at 245.4 ms; the requested under-50-ms bound is unmet. A repeated RPC can therefore still produce visible Electron lag, though far shorter than the reported 30-55 seconds. Minimal fix: profile and split or move these queries off the main thread, or implement an equivalent indexed plan measured below the bound.

### Moderate - repository totals can again form an uninterrupted chain

- `libs/backend/usage-analytics/src/lib/usage-summary.service.ts:139-146`, `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:220-243,252-257`: up to 100 repository IDs are handled in a loop with two synchronous queries per ID and only microtask awaits. This creates another event-loop stall if a workspace spans many repositories. Abort is checked before each ID but its timer cannot run during the chain. Minimal fix: add a periodic macrotask yield inside the loop and check abort immediately after it.

### Moderate - migration adds an unused index and a fragile hard index hint

- `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:187-191`, `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:168`: no current query uses `idx_session_usage_backfill_pending`; the page query forces `idx_session_usage_backfill_rowid`. The latter shares the leading `repository_id` key with the existing `idx_session_usage_repository_time`, though its rowid order avoids the temporary sort. Both extra indexes add migration and write cost to the 71k-row database. On a schema missing `idx_session_usage_backfill_rowid`, `INDEXED BY` makes the page query fail at preparation rather than letting SQLite choose another plan; a normal fully migrated database has the index. Minimal fix: remove the unused pending index in a later migration if no planned consumer exists, and avoid a mandatory index hint or add a schema assertion with a clear migration error.

### Moderate - session path changes wait for retry

- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:167,171,343-346`: the query may use `sessions.workspace_path`, but the upsert clears the failed marker only when the usage row's `worktree_path` or `workspace_key` changes. A session whose workspace path is corrected while the usage row stays unchanged remains hidden for seven days. Minimal fix: invalidate markers for that session on a changed session path, or include the resolved path in the retry identity.

## Five logic questions

1. Silent failure: the transient timeout marker at `repository-identity-backfill.service.ts:41-48` hides the row until its retry age expires.
2. Unexpected user action: reopening a now-valid worktree can still show missing repository spend for seven days (`session-stats-repository.ts:171`).
3. Wrong input answer: a changed `sessions.workspace_path` with unchanged usage-row paths leaves the old failed marker (`session-stats-repository.ts:167,343-346`).
4. Dependency failure: resolver exceptions are logged as unresolved and persisted; a transaction failure in `markRepositoryUsageUnresolved` propagates to the after-pass hook, which logs and retries on the next pass (`usage-reconciliation.service.ts:151-157`).
5. Missing requirement: no bounded main-thread time for individual summary statements or the repository-totals loop (`usage-summary.service.ts:70,139-146`).

## Trace and checks

- S0008 is version 8 after version 7 and creates the column and indexes in sessions.sqlite (`session-store-migrations.ts:187-202`). The fresh and populated-version-7 tests cover migration and row preservation (`session-store.spec.ts:138-168`); the lane reports a 190.6 ms migration on a disposable copy of the real database. The test does not assert the rowid index that the query requires.
- Paging advances by `rowId`, stamps failed rows, and excludes missing paths; it terminates even when every returned path fails (`session-stats-repository.ts:163-191`, `repository-identity-backfill.service.ts:23-54`). Rows with no path are skipped on every pass but cannot be resolved. Synchronous transaction bodies have no `await`, so another JavaScript caller cannot interleave on the same connection between `BEGIN IMMEDIATE` and `COMMIT`. An already open transaction causes `BEGIN` to throw before this method enters its rollback block; it does not roll back the other transaction.
- The upsert's `IS NOT` comparison correctly resets the marker for changed row-level path/key, including null transitions (`session-stats-repository.ts:343-346`). The `UNION ALL` branches match the old mutually exclusive producer predicates, their parameter order is correct, and the final `LIMIT 1` scopes the compound query (`session-stats-repository.ts:650-663`).
- `lastBackfillAt` changes only after successful `afterPass`; unchanged scans retry hourly while started, and failed hooks retry on the next scheduled pass (`usage-reconciliation.service.ts:97-106,151-169`).
- Summary state is local to each `summarize` call, so its new yields do not themselves mix concurrent calls (`usage-summary.service.ts:41-60`). Most yields have a following abort check; repository IDs are followed by a check inside the loop. Codex parsing checks abort after each yield (`sources/codex.source.ts:48-54`). Individual line JSON parsing and SQLite statements remain synchronous.
- Other `VitalsLoadCache` production users are `HostInventoryCache` (skills and CLI counts) and `RecentWorkspacesStore` (`host-inventory.cache.ts:24,37`, `recent-workspaces.store.ts:36`). Their first retry stays 5 seconds, but repeated failures now delay reads up to 160 seconds, which can delay recovery of those screens; `RecentWorkspacesStore.load()` uses `refresh()` and bypasses the backoff. The failure counter resets on any ready/empty result (`vitals-load.ts:117-125`).
- New specs are not all vacuous: the usage-summary timer test fails without its timed loop yield (`usage-summary.service.spec.ts:25-49`), and retry/backoff tests exercise the new state. They do not enforce the SQL time bound, repository-totals yielding, exception recovery, or required rowid index. The repository backfill mock implements its own attempted-row filtering, so it does not test real SQL interaction (`repository-identity-backfill.spec.ts:6-30`).
- Reviewed the 16-file diff, relevant full source and task evidence. `ptah_get_diagnostics` was unavailable after its scoped TypeScript check timed out; the lane report records focused Jest and TypeScript passes. No new checks were run here. Remaining uncertainty: no Electron hang reproduction or independent timing run under this review.

## Decisions

- Treat a thrown resolver error as transient, distinct from a returned `null`: the task evidence includes timed-out git children and the current code merges both cases. This is reversible by changing retry classification.
