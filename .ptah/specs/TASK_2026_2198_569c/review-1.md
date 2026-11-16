# Coordinator review 1: defects to fix

Read `context.md` (evidence) and `lane-report.md` (what the first lane run did) in this folder
first. An earlier lane run started on these defects and stopped without a report. Its edits are
in the working tree: check `git status --short` and `git diff` before you change anything, and
keep correct work.

Bug in one sentence: the Electron main loop blocks 30 to 55 s because
`UsageAnalyticsService.summarize` (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts`)
and the repository identity backfill run long synchronous SQLite work without a macrotask yield.

## Defect 1 (blocking): migration in the wrong database

The first run added migration 0076 to `libs/backend/persistence-sqlite/src/lib/migrations/`
(the MAIN database, ptah.sqlite). The table `session_usage_turns` is in the separate session
store database (sessions.sqlite), created by
`libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts`.
The interrupted run already deleted 0076, reverted `migrations/index.ts`, and edited
`session-store-migrations.ts` and `session-store.spec.ts`. Verify that this move is complete
and correct:

- The new step adds column `repository_backfill_attempted_at_ms INTEGER` and the indexes
  `idx_session_usage_backfill_pending (repository_id, repository_backfill_attempted_at_ms)` and
  `idx_session_usage_codex_run (run_id, occurred_at_ms) WHERE producer = 'codex-checkpoint'`,
  in the versioning and style that file already uses.
- Spec: a fresh database and an upgrade from the previous version both end with the column and
  both indexes; the step is safe on a database that already has rows.
- Nothing about this remains in `migrations/` or its specs (they assert max version 75).
- Prove it on a COPY of the real database: copy `C:\Users\<user>\.ptah\state\sessions.sqlite` to
  `.ptah/tmp/` (NEVER write to the original), run the real session store migration code path on
  the copy, and report: migration time in ms (it runs on the main thread at start, about 71k
  rows), `EXPLAIN QUERY PLAN` of the backfill page query (no `TEMP B-TREE`), and the time of
  1,000 `hasWorkspaceCodexRun` lookups. Delete the copy afterwards.

## Defect 2: summary statements still block

`summarize` still runs single synchronous statements of 219 to 759 ms each, back to back with
only microtask awaits between them: `getWorkspaceUsageGroups`, `getWorkspaceSessionCount`,
`getWorkspaceMessageCount`, `getWorkspaceTopSessions`, `getWorkspaceRepositoryIds`
(`session-stats-repository.ts`). All use
`LEFT JOIN sessions s ... WHERE COALESCE(s.workspace_key, t.workspace_key) = ?`, which defeats
`idx_session_usage_workspace_time`.

1. Put a real macrotask yield (`yieldImmediate`) between these repository calls in `summarize`.
2. Make each statement index-friendly so that one statement stays under about 50 ms on the real
   data, WITHOUT changing results. Read how `workspace_key` is written on both tables before you
   touch the COALESCE. Verify equality: run old and new SQL on the real DB opened read-only
   (`node:sqlite`, `new DatabaseSync(path, { readOnly: true })`) for workspace key
   `d:\projects\ptah-extension` (7-day and 90-day ranges) and one other key, and compare the
   outputs exactly. If a statement cannot be made fast with identical results, keep the old SQL
   for it, say so, and report its measured time.

## Defect 3: backfill can miss new rows

`UsageReconciliationService.runPass` now runs the after-pass hook only when `changed` or on the
first pass. Rows that the live ledger inserts later with `repository_id IS NULL` (not through a
reconciliation scan) must still get a backfill attempt within a bounded time. Read where rows
are inserted and decide whether `changed` covers them. If it does not, add a cheap bounded
trigger (an indexed `EXISTS` for a pending row, or at most once per N minutes). Add a test.

## Defect 4: failed marker is permanent

`markRepositoryUsageUnresolved` marks rows forever. A path can become resolvable later. Make the
page query retry rows whose attempt is older than 7 days, still on the index and without a full
sort, or explain in the report why permanent is right. Keep the behavior that a revised row with
a changed path clears the marker.

## Defect 5: backoff exponent

`libs/frontend/chat/src/lib/services/vitals/vitals-load.ts`:
`2 ** Math.min(consecutiveFailures - 1, 5)` gives a half interval when the count is 0. Clamp the
exponent at 0. Confirm that other users of `VitalsLoadCache` keep their previous first-retry
interval.

## Rules

- Worktree only. No commit, no push, no pull request.
- No `npm run verify`, no `nx`, no build/serve/dev/e2e/package. Focused checks only:
  `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx tsc --noEmit --project <tsconfig>`, `npx eslint <changed files>`.
  Long output goes to `.ptah/tmp/<name>.log`; read only the tail.
- Strict TypeScript: no `any`, no `@ts-ignore`, no `as unknown as X`; `unknown` in catch.
  Injected Logger only. Public lib aliases only. Electron is the priority host; keep
  `cli-engine` working.
- Do not weaken tests.

## Report

Write `lane-report-2.md` in this folder (UTF-8, ASCII hyphens only). Create it at once with one
section per defect marked "pending" and update it after each defect, so an interruption loses
nothing. Per defect: files changed, measured numbers, exact focused checks with real results
including failures, and anything not done with the reason. Also state whether a `node_modules`
link exists in this worktree (path, type, target); the first run created one.
