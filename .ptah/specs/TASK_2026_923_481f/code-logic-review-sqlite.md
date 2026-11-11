# Verdict: REVISE

Read-only review of the uncommitted worktree. No tests or builds were run. Skill discovery found no locally invocable code-review skill; review used the diff and source files.

## S2

No confirmed defect in the changed timing paths. The timing spec checks the new log fields, but does not measure real main-loop responsiveness.

## S3

1. **MAJOR — `libs/backend/rpc-handlers/src/lib/handlers/analytics-rpc.handlers.ts:89`**. A second identical RPC joining at 29.9 seconds shares the first call's 30-second abort timer (line 97). If the summary honors abort, the second caller fails after about 0.1 seconds, despite having its own 30-second allowance. The new concurrency specs only join calls immediately and never exercise this boundary. **Fix:** bound each caller independently, or avoid joining a run whose remaining budget is too short; add a late-join test with fake time and an abort-aware summary.

The key includes both fields accepted by the strict request schema: range and resolved workspace. The coalescer removes entries on success and failure.

## U2

2. **BLOCKER — `libs/backend/persistence-sqlite/src/lib/backup.service.ts:756`**. `rotate()` still sweeps staging files using only `startsWith(prefix)` and the broad `STAGING_SUFFIX` (line 150). For example, a stale foreign file named `ptah-garbage.12345678.tmp` in the daily backup directory passes this check, then line 775 passes it to `discardArtifact`, which unlinks it. It is not a name this service creates: daily staging is `<db>-YYYY-MM-DD.sqlite.<hex>.tmp`. This violates the hard requirement that rotation delete only its own files. The staging deletion also logs `staging: target` (line 676), an absolute path, without a size. **Fix:** match the entire final backup name for the kind followed by the staging suffix, validate the resolved target against the backup directory and live database paths, and log each removed staging file by base name and size. Add a service-level test with a stale foreign staging look-alike.

3. **MINOR — `libs/backend/persistence-sqlite/src/lib/backup-retention.ts:65`**. Lexical reverse sorting treats an older second-resolution compact name such as `ptah.reset-20250101T120000Z.sqlite` as newer than `ptah.reset-20250101T120000900Z-aabbccdd.sqlite`: `Z` sorts after `9`. A rapid upgrade/restart within the same second can therefore keep the older backup and delete the newer one at the retention boundary. **Fix:** parse both supported compact timestamp forms into comparable timestamps, with a deterministic tie-breaker; test mixed old and new names in the same second.

## U4

4. **MAJOR — `apps/ptah-electron/src/activation/boot-heavy-services.ts:242`**. The report is started before the subsequent `harness` boot phase at line 244. `BackgroundWorkGovernor.whenClear()` resolves immediately if already clear (`libs/backend/vscode-core/src/diagnostics/background-work-governor.ts:281`), so the worker can start during boot rather than after boot idle. It may compete with the remaining startup work for disk I/O. **Fix:** trigger the report after the boot-ready/idle boundary, then apply the governor wait; test that no worker starts while boot phases remain.

5. **MAJOR — `libs/backend/persistence-sqlite/src/lib/table-size-report.service.ts:106`**. The worker returns raw exception text as `detail` (`integrity/table-size-protocol.ts`, `describe(error)` and `unavailable()`), and this line logs it unchanged. For example, failure to resolve `better-sqlite3` in the worker can produce a Node require stack containing absolute paths. The other catch logs at lines 55 and 71 also forward raw exception messages. This violates the no-absolute-path/user-data log requirement. **Fix:** return a bounded error code/category from the worker and log that code; sanitize or omit messages from service and runner failures. Add a test that supplies a path-bearing error and inspects all emitted log context.

The table-size command uses the worker's read-only opener, dispatches by a distinct `type`, and uses `DbWorkerRunner`, whose budget path kills the worker. The optional factory permits the CLI no-op path. The current tests exercise those mechanics with fakes; they do not prove the boot-idle ordering or path-safe error logging.

