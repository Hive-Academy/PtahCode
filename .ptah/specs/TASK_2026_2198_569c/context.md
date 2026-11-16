# TASK_2026_2198_569c: main-loop stalls from usage summary and repository backfill

## Symptom

The Electron app shows "not responding" again and again. On 2026-11-16 from 08:58 to 09:33 UTC
the main event loop was blocked 30 to 55 s in almost every minute (about 40 back-to-back stalls).
Shorter stalls (5 to 12 s) continue after that.

## Evidence (measured, coordinator session)

Sources: `%APPDATA%/Ptah/logs/ptah-hang.log` (main-loop-watchdog) and
`%APPDATA%/Ptah/logs/Ptah Electron-2026-11-16.log`.

1. Each long stall is one synchronous block. `[event-loop] lag: {"maxMs":42446.4}` is logged
   right after it. No log line is written during the block.
2. Each block is bracketed the same way:
   - recovery, then the renderer sends `analytics:spendSummary` at once (its previous call timed
     out: `[ClaudeRpcService] RPC timeout for method: analytics:spendSummary`, then
     `UsageVitalsCache: Usage summary RPC failed`);
   - about 2 to 3 s of normal loop activity, with bursts of
     `Repository identity backfill could not resolve path` (about 29 per cycle);
   - the block starts (30 to 55 s);
   - the first line after the block is
     `[RPC] slow handler: {"method":"analytics:spendSummary","durationMs":45023.2}`.
3. `Repository identity backfill could not resolve path` was logged 215,071 times on
   2026-11-16 and 0 times on 11-13, 11-14 and 11-15. The backfill came with commits `d7ed4a363`
   (11-13) and `337ea4cb8` (11-14); the installed build picked it up on 11-16.
4. While the loop is blocked, git children time out (`rev-parse` / `git status`
   `timed out after 30000ms`), so `git:info` and `git:watchRoots` fail with
   `GIT_ROOT_PROBE_FAILED`. These are victims, not the cause.
5. Database `~/.ptah/state/sessions.sqlite` (101 MB), read-only measurements in plain Node:
   - `session_usage_turns`: 71,229 rows, 42,512 with `repository_id IS NULL`.
   - 600 distinct unresolved paths; 377 rows have no path at all. Many paths are deleted
     worktrees, so they can never resolve.
   - `getUnresolvedRepositoryUsagePage` plan: `SEARCH t USING INDEX
     idx_session_usage_repository_time (repository_id=?)` + `USE TEMP B-TREE FOR ORDER BY`.
     Every page sorts all 42k rows again. A full walk is 214 pages and 12.3 s of synchronous
     SQLite time (about 58 ms per page, 224 ms worst) in an idle process.
   - Spend summary queries for the main workspace, 90-day range: `getWorkspaceUsageGroups`
     519 ms, `getWorkspaceMessageCount` 502 ms, `getWorkspaceTopSessions` 759 ms,
     `getWorkspaceSessionCount` 227 ms, `getWorkspaceRepositoryIds` 219 ms. All synchronous.
   - 976 Codex rollout files changed in the last 30 days under `~/.codex/sessions`.

## Confirmed defects

- D1. `RepositoryIdentityBackfillService.runOnce`
  (`libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts`) never records
  a failed attempt. Rows that cannot resolve stay `repository_id IS NULL`, so every
  reconciliation pass (`UsageReconciliationService.runPass` -> `afterPass`) walks all 42k rows
  again and spawns git for every distinct unresolved path again (cache is per run). This never
  converges.
- D2. The page query re-sorts the whole unresolved set on every page (see plan above).
- D3. The resolver wrapper logs at `warn` once per unresolved path per pass
  (`apps/ptah-electron/src/di/phase-2-libraries.ts:710`,
  `libs/backend/cli-engine/src/lib/container.ts:767`): 215k lines in one day.
- D4. A failed `analytics:spendSummary` is sent again at once by the renderer
  (`UsageVitalsCache`), so one slow summary becomes a continuous loop.

## Not yet pinned

The exact synchronous call that holds the loop for 30 to 55 s in one piece. It runs inside or
next to `UsageSummaryService` (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts`)
about 2 to 3 s after the handler starts. Candidates, none proven:

- the per-contribution loop at lines 199-214: `await this.pricing.price(...)` and
  `await this.statsRepository.hasWorkspaceCodexRun(...)` resolve as microtasks, so a large
  contribution list is one uninterrupted block;
- a `source.read(...)` implementation that reads or parses many files synchronously
  (976 Codex rollouts, Claude JSONL);
- backfill pages and summary SQL that interleave on the one SQLite connection.

A CPU profile or an offline timing harness must settle this before the fix is called complete.
