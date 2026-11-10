# Implementation report: S2 (sqlite timing lines) and S3 (spendSummary coalescing)

## 1. Files changed and created

Changed:
- `libs/backend/persistence-sqlite/src/lib/migration-runner.ts`
- `libs/backend/persistence-sqlite/src/lib/backup.service.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.spec.ts`

Created:
- `libs/backend/persistence-sqlite/src/lib/migration-runner.timing.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/in-flight-coalescer.ts`

## 2. What each change does

### S2: `migration-runner.ts`
- Constructor gets a 5th optional parameter `now: () => number`, default `performance.now()`. Specs inject a fake clock.
- `applyAll`: log `[persistence-sqlite] migration bookkeeping` with `durationMs`
  and `pendingVersions` (covers `ensureBookkeepingTable` + `readAppliedVersions`).
- New private method `backupBeforeMigration` (the backup await moved here, same order, same condition):
  - `[persistence-sqlite] pre-migration backup requested` with `pendingCount`.
  - `[persistence-sqlite] pre-migration backup settled` with `succeeded`, `mainWaitMs`, `workerDurationMs` (or `null`), `mainWaitExcessMs` (or `null`).
  - `[persistence-sqlite] pre-migration rotation started`, then `... rotation finished` with `durationMs`.
  - The existing warn `pre-migration backup failed (non-fatal)` is unchanged. Rotation still runs only when the backup path is not `null`.
- Per applied migration: `[persistence-sqlite] migration applied` with `version`, `durationMs`.
- Archive step: the existing `verified skill pipeline archive` line gets `durationMs`. No new path field.
- Deferred vec catch-up: the existing `applied deferred vec index ...` line gets a context with `durationMs`.
- New helper `roundMs` rounds to 2 decimals.

### S2: `backup.service.ts`
- `IBackupService` gets an optional `readonly lastWorkerDurationMs?: number | null`.
- `SqliteBackupService` sets `lastWorkerDurationMs` from the worker `response.durationMs` just before `backup completed`. Reason: `backup()` returns only the path, so the runner had no other source for the worker duration.
- No change to when or whether the backup runs, to retention, PRAGMAs or migration order.

### S3: `in-flight-coalescer.ts` (new) and `analytics-rpc.handlers.ts`
- `InFlightCoalescer<T>.run(key, start)`: callers with a running key share its promise. The entry is deleted in `finally` when the promise settles, so there is no result cache and failure is not sticky. No existing generic helper fitted (auth status uses a TTL cache), so a small helper was added.
- `usageSummary` validates and authorizes as before, then builds the key `JSON.stringify([range, workspace])` (workspace after default resolution) and calls `inFlight.run`.
- The old budget/abort/validate/error code moved unchanged into `runSummary`. The shared run uses the first caller's 30 s budget.

## 3. Tests added

`migration-runner.timing.spec.ts` (fake clock, fake backup service):
- bookkeeping line has `durationMs` and `pendingVersions` `[1, 2]`.
- settled line has `mainWaitMs` of at least 30000, `workerDurationMs` 1200 and `mainWaitExcessMs` equal to the difference. Request line has `pendingCount` 2. Rotation line has `durationMs`.
- `migration applied` lines carry versions `[1, 2]` and numeric `durationMs`.
- the new lines do not contain the backup destination path (sentinel check).

`analytics-rpc.handlers.spec.ts` (new `in-flight coalescing` block; `setup` got a `gate` option):
- two concurrent identical calls: `summarize` called once, same result object.
- different params: two calls.
- rejected run: entry cleared, next call runs again.
- call after settle: runs again.

## 4. Verify result

I ran `npm run verify -- -p @ptah-extension/persistence-sqlite,@ptah-extension/rpc-handlers` once. It exceeded the 600 s foreground timeout and was moved to the background. The session then ended and the task was marked stopped with no output read. **No pass/fail result was observed.** The coordinator must run verification. The known unrelated failure is 2 tests in `codex-account-usage.service.spec.ts`. The new specs and type-correctness are therefore unverified by a run.

## Decisions

- Worker duration comes from a new optional field on `IBackupService`, because the backup result carries only the path. Optional, so existing fakes still compile.
- The timing lines use `info` level (they must show in normal logs). Cost is a few lines per start-up.
- The coalescing key uses the resolved workspace, so a call without a workspace and a call with the same explicit workspace share a run.
- The backup request/settle lines carry no paths. Existing lines that log `dbPath`/`dest` were not changed.

## 5. Unfinished items and risks

- Verification not observed (see section 4). Possible issues to check: the cast in the spec's fake backup service, lint formatting of the long lines in `migration-runner.ts`, and the existing runner spec assertions on the logger (not expected to break).
- `mainWaitExcessMs` is `null` when the backup service does not expose `lastWorkerDurationMs`, or when the backup returned `null` without a completed worker run (the value may then be stale from an earlier backup in the same process).
