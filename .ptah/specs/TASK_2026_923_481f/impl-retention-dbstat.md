# Implementation report: U2 (daily retention 3) and U4 (dbstat size report)

All paths are relative to the worktree root.

## Files changed and created

U2:
- changed `libs/backend/persistence-sqlite/src/lib/backup.service.ts`
- changed `libs/backend/persistence-sqlite/src/lib/backup.service.spec.ts`
- created `libs/backend/persistence-sqlite/src/lib/backup-retention.ts`
- created `libs/backend/persistence-sqlite/src/lib/backup-retention.spec.ts`

U4:
- created `libs/backend/persistence-sqlite/src/lib/integrity/table-size-protocol.ts` (+ `.spec.ts`)
- created `libs/backend/persistence-sqlite/src/lib/table-size-report.service.ts` (+ `.spec.ts`)
- changed `libs/backend/persistence-sqlite/src/lib/integrity/integrity-worker-protocol.ts` (union types)
- changed `libs/backend/persistence-sqlite/src/lib/integrity/integrity-worker.ts` (dispatch)
- changed `libs/backend/persistence-sqlite/src/lib/di/tokens.ts`, `di/register.ts`, `src/index.ts`
- created `apps/ptah-electron/src/activation/table-size-report-start.ts`
- changed `apps/ptah-electron/src/activation/boot-heavy-services.ts`
- changed `apps/ptah-electron/src/di/expected-resolvable.ts`

## U2 changes

- `backup.service.ts` `KEEP_BY_KIND`: `daily` 7 -> 3. `pre-migration` 1 and `reset` 2 unchanged. Doc comment updated.
- `backup-retention.ts` (new, pure, no I/O): `backupNamePattern(prefix, kind)` is a strict full-name regex for the names the service creates (`<prefix>YYYY-MM-DD.sqlite` for daily, `<prefix><compact stamp>[-hex8].sqlite` for the others). `isInsideDir(root, target)` checks containment after `path.resolve`. `selectBackupsToDelete(...)` keeps the newest `keep`, then drops any file whose path is outside the kind directory or equals the live DB path (or its `-wal`/`-shm`, case-folded on Windows).
- `backup.service.ts` `rotate()`: the old prefix+`.sqlite` filter is replaced by `selectBackupsToDelete`. New private `deleteRotatedBackup(dir, file, kind)` does `fs.promises.stat` then `fs.promises.unlink` (rotation stays async), logs, and on error logs a warning and continues. Staging sweep is unchanged.
- Log line changed from debug to info: `[persistence-sqlite] backup rotated (deleted)` with `{ file, sizeBytes, kind }`. `file` is the base name only. Failure: `[persistence-sqlite] backup rotation delete failed (non-fatal)` with `{ file, kind, error }` (unchanged shape).
- Existing spec updated: `KEEP_BY_KIND` test now expects daily 3.

Behaviour note: the old filter deleted any `<prefix>*.sqlite` file. The strict pattern now ignores such names that do not match the service patterns. This is intended (no look-alike deletion).

## U4 changes

- `table-size-protocol.ts`: request `{ id, type:'table-size', dbPath, topN }`; response `{ id, type, ok:true, status:'ok'|'unavailable', totalBytes, tables[{name,bytes,pages}], durationMs, detail }`. `performTableSizeReport(env, request)` is pure and never throws. It runs two SELECTs on `dbstat` (`GROUP BY name ORDER BY bytes DESC, name LIMIT ?`, and `SUM(pgsize)`). Any failure (no `dbstat`, open failure) returns `unavailable` with the reason. Guards: `isTableSizeRequest` (zod), `asTableSizeResponse`. `TABLE_SIZE_TOP_N = 25`.
- `integrity-worker-protocol.ts`: `TableSizeRequest`/`TableSizeResponse` added to the inbound/outbound unions (type import only).
- `integrity-worker.ts`: `ReadOnlyDatabase` gets `prepare`; new first dispatch branch runs `performTableSizeReport` with the existing read-only opener (`readonly: true, fileMustExist: true`). No write path.
- `table-size-report.service.ts`: `SqliteTableSizeReportService.reportOnce(signal?)`. Once per process. No integrity worker factory -> silent no-op (no log). Waits for a quiet host via the existing optional `BACKGROUND_WORK_GOVERNOR` (`whenClear`, lane `sqlite-table-size-report`); abort -> silent stop; other governor error -> warn and run (fail open). Runs through the shared `DbWorkerRunner` with fixed budget `TABLE_SIZE_BUDGET_MS = 60_000` (runner kills the worker and logs its own budget warning). On timeout it logs one warning `[persistence-sqlite] table size report abandoned — no reply within the budget` `{ budgetMs }`.
- Log lines: `[persistence-sqlite] table size report` `{ totalBytes, tables: [{ name, bytes, pages }], durationMs }`; `[persistence-sqlite] table size report unavailable` `{ detail }`; `[persistence-sqlite] table size report failed` `{ error }`. No path in any line.
- DI: new token `SQLITE_TABLE_SIZE_REPORT` in `di/tokens.ts`, singleton in `di/register.ts`, export in `index.ts`. `expected-resolvable.ts` gets the new entry for Electron.
- Trigger: `table-size-report-start.ts` (thin, not awaited, errors logged at warn) is called in `boot-heavy-services.ts` right after the WAL checkpoint start, only when SQLite is open. No new scheduler: it uses the existing governor.
- platform-cli / cli-engine: they bind no factory, so `reportOnce` returns at once without a log.

## Tests

- `backup-retention.spec.ts`: keeps newest N daily; ignores foreign files and look-alike names (`-wal`, `.bak`, `.tmp`, wrong prefix); never selects the live DB even with a crafted name; reset/pre-migration compact names match only their prefix; refuses a path outside the root.
- `backup.service.spec.ts` (new cases in the rotate block): daily rotation keeps 3, spares foreign files and the live DB, and logs name+size with no directory in the log; look-alike prefix rotation never touches the live DB; existing reset-keeps-2 and pre-migration cases still cover 2 and 1.
- `table-size-protocol.spec.ts`: row order, total, topN param, only SELECT statements, close called; typed `unavailable` when `dbstat` is missing; open failure -> `unavailable`; request/response guards.
- `table-size-report.service.spec.ts`: logs once with totals and tables (second call does nothing, no db path logged); silent no-op without a factory; waits for the governor before spawn; budget expiry -> one "abandoned" warning and worker killed (fake timers); `unavailable` reply logged.
- Not added: an Electron wiring spec for `table-size-report-start.ts` and a real-`better-sqlite3` run of `dbstat` (the binary is built for the Electron ABI, so Jest on Node cannot load it).

## Verify result

I ran one foreground run: `npm run verify -- -t test -p @ptah-extension/persistence-sqlite -- --testPathPatterns="backup|table-size|migration-runner"`. It waited 206 s for a slot, then ran 15 s. Result: **fail** (8 suites: 5 failed, 3 passed; 29 tests: 1 failed, 28 passed). Causes, from the Nx log:
1. `backup-retention.ts` had a broken regex literal (a backslash was lost when I wrote the file). Suites `backup-retention`, `backup.service`, `migration-runner`, `migration-runner.timing` failed to compile. **Fixed afterwards** (lines 18 and 24 re-checked by reading the file).
2. `table-size-report.service.spec.ts` timeout test expected exactly one warning, but the runner logs its own budget warning too. **Fixed afterwards** (assert only the "abandoned" line).

I did NOT run a second time (rule: one run). So the fixed state is **unverified by a run**. The coordinator must run the full scoped verify (persistence-sqlite, rpc-handlers, ptah-electron for the DI census and boot file).

## Nx projects touched

- `@ptah-extension/persistence-sqlite`
- `@ptah-extension/ptah-electron` (activation wiring, DI census) — check the project name in its `project.json`

## Decisions

- Strict file-name pattern instead of prefix-only, so look-alike files are never deleted. Daily pattern is `YYYY-MM-DD` only (the only form `destPath` creates for daily).
- Retention helpers live in their own small pure file; no new dependency edge, no use of an `isInsideRoot` from another lib.
- Worker reply `unavailable` is a typed status, not a throw; the host logs it at info.
- Idle trigger reuses the existing `BackgroundWorkAdmission` governor inside the service (same pattern as the daily backup); the Electron file only starts it. No `maxDeferMs` set, so the governor default ceiling applies and the report cannot starve.
- Rotation delete log raised debug -> info so each deletion with size is visible in normal logs.
- `topN` capped at 1000 by the request guard.

## Open risks

- Fixed state not re-run (see Verify result). Possible remaining issues: lint formatting, a type error in `integrity-worker.ts` (`ReadOnlyDatabase` now needs `prepare`; the real constructor type should satisfy it), and the `as TableSizeResponse` cast in `asTableSizeResponse` (matches the style of `asBackupResponse`, but a reviewer may prefer a zod parse).
- `dbstat` availability in the shipped `better-sqlite3` build is unmeasured here; the `unavailable` path covers it.
- `dbstat` on a large database reads every page. It runs in the worker process under a 60 s budget, but it adds disk reads once per launch.
- File size of `backup.service.ts` was not measured. Retention logic sits in `backup-retention.ts` to limit its growth.

## Line counts (added / removed)

U2: `backup.service.ts` about +40 / -24 (this file also holds ~10 earlier S2 lines in its diff), `backup.service.spec.ts` +38 / -2, new `backup-retention.ts` +74, new `backup-retention.spec.ts` +105. Total about +257 / -26.

U4: new `table-size-protocol.ts` +152, `table-size-protocol.spec.ts` +136, `table-size-report.service.ts` +120, `table-size-report.service.spec.ts` +153, `table-size-report-start.ts` +43; changed `integrity-worker-protocol.ts` +9 / -2, `integrity-worker.ts` +16, `tokens.ts` +2, `register.ts` +7, `index.ts` +1, `boot-heavy-services.ts` +5, `expected-resolvable.ts` +5. Total about +649 / -2.
