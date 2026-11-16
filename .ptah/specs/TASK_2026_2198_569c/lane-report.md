# Lane report: usage summary main-loop stall

## Pinned blocking call

`UsageAnalyticsService.summarize` processes Codex contributions in one loop. For each previously unseen native thread it awaits `SessionStatsRepository.hasWorkspaceCodexRun`, but the repository method executes a synchronous SQLite statement before its promise resolves. The original statement combines an unindexed `run_id` predicate with an `OR` and a `COALESCE` workspace join. The await resumes as a microtask, so the loop does not return to the event loop. An offline read-only Codex scan of the real data returned 51,725 contributions from 979 rollout files and 896 distinct session IDs. Timing 100 of those IDs against the real SQLite database with the original statement took **16,368 ms with zero 20 ms timer ticks**. A full set of 896 was interrupted after it continued well beyond a minute. This pins the call pattern, though the 30–55 s production blocks also depend on how many IDs that request processes before its budget expires. The Codex file scan itself took 15,639 ms total with a 60.8 ms maximum event-loop delay; it was not the uninterrupted 30–55 s block.

The original backfill page plan on the real read-only DB used `idx_session_usage_repository_time` plus `USE TEMP B-TREE FOR ORDER BY`. On a copy of that DB with migration 0076 applied, the new plan uses `idx_session_usage_backfill_pending (repository_id=? AND repository_backfill_attempted_at_ms=? AND rowid>?)` and has no temp sort. A 43,277-row page walk took 645 ms total. The indexed overlap statement uses `idx_session_usage_codex_run` for checkpoint rows and `idx_session_usage_turns_session_time` for CLI rows. On the migrated copy, 1,000 missing-thread lookups took 9.96 ms total.

## Changes

- `libs/backend/usage-analytics/src/lib/usage-summary.service.ts` (a): yields via a real `setImmediate` when contribution processing exceeds a 20 ms budget. The regression spec shows a timer runs between costly contributions.
- `libs/backend/usage-analytics/src/lib/sources/codex.source.ts` (a): adds a 20 ms budget yield while parsing JSONL lines.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts` (a, b, c): rewrites overlap lookups as two indexed branches; selects only unattempted rows with a path; persists failed backfill attempts; clears the marker if a revised row changes its path.
- `libs/backend/persistence-sqlite/src/lib/migrations/0076_usage_backfill_lookup.ts` and `migrations/index.ts` (a, b, c): adds the durable attempt column and indexes for pending backfill and Codex run lookup.
- `libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts` (b): records failed row IDs after each page, making a second run leave failed rows alone.
- `libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts` (e): runs the after-pass hook initially and after changed scans, skipping unchanged follow-ups. A new spec covers that behavior.
- `apps/ptah-electron/src/di/phase-2-libraries.ts` and `libs/backend/cli-engine/src/lib/container.ts` (d): change unresolved path logging from warn to debug in both hosts.
- `libs/frontend/chat/src/lib/services/vitals/usage-vitals.cache.ts` and `vitals-load.ts` (f): usage summary failures back off from 30 seconds, doubling on consecutive failures up to five minutes; the existing per-key in-flight guard remains. The cache spec covers a pending call and repeated failures.
- Updated specs: `repository-identity-backfill.spec.ts`, `usage-reconciliation.spec.ts`, `usage-summary.service.spec.ts`, `usage-vitals.cache.spec.ts`.

## Focused checks

- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts`: **1 suite failed to load, 2 passed, 14 tests passed**. Jest's pre-existing mapper pointed to a missing `node_modules/marked/lib/marked.umd.js` inside this worktree. This was a test environment failure, not an assertion failure.
- After linking this worktree's ignored `node_modules` path to the existing dependency install, `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/usage-summary.service.spec.ts`: **21 passed**.
- `npx jest --config libs/backend/usage-analytics/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts`: **15 passed**.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/vitals/usage-vitals.cache.spec.ts`: **10 passed**.
- `npx tsc --noEmit --project libs/backend/usage-analytics/tsconfig.lib.json`: **passed**, including a rerun after the final Codex parser edit.
- `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.lib.json`: **passed**.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: **passed**.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`: **passed**.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`: **passed**.
- `npx eslint` on the changed files except the later Codex source edit: **0 errors, 4 warnings** (three existing max-lines warnings and one existing no-useless-assignment warning); Nx module-boundary rule skipped because no cached ProjectGraph. `npx eslint libs/backend/usage-analytics/src/lib/sources/codex.source.ts`: **0 errors**, same graph warning.
- `git diff --check`: **passed**.

## Unmet requirement and limits

Outcome **(a) is partial**. The pinned multi-second call is now indexed and the long contribution loop yields, but the task evidence measured existing individual synchronous SQLite summary calls at 219–759 ms (`getWorkspaceSessionCount`, `getWorkspaceMessageCount`, `getWorkspaceTopSessions`, `getWorkspaceRepositoryIds`). I did not move or split those calls, so I cannot assert that every path reachable from `analytics:spendSummary` stays below about 50 ms. The offline indexed lookup benchmark used a copy of the real DB because the live DB was opened read-only throughout. I did not run a full Electron UI hang reproduction. No commit, push, or PR was made. Matching installed design/Angular skills were unavailable through the CLI skill search, so repository patterns were used. The Ptah scoped diagnostics tool errored at transport level; focused TypeScript checks were the fallback. An interim parent report was refused with `parent-inbox-full`.





