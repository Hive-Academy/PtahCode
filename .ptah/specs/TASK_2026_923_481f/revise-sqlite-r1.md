# Revision status: IMPLEMENTED; full verify blocked by concurrent task-specs type errors

## Findings 1-5

1. **Fixed (S3)** — `libs/backend/rpc-handlers/src/lib/handlers/in-flight-coalescer.ts:11`: a run older than 5 s cannot accept a new caller; the newer run replaces the map entry, and the older settlement cannot erase it. `in-flight-coalescer.spec.ts` proves early join, late replacement, old settlement, and failure cleanup. The second full library verify passed rpc-handlers tests.

2. **Fixed (U2 staging)** — `libs/backend/persistence-sqlite/src/lib/backup-retention.ts:54` selects staging roots only when the complete name is an own final backup name plus the staging suffix, inside the kind directory and away from the live DB/sidecars. `backup.service.ts:756` uses it. `backup.service.ts:670` logs every removed staging artifact by base name and size. `backup.service.spec.ts:1257` proves an own stale file is deleted and a stale foreign look-alike survives. The scan now stats only listed sidecars (`backup.service.ts:759`); otherwise a missing sidecar aborted the whole sweep. The focused test and third full library test phase passed.

3. **Fixed (U2 ordering)** — `libs/backend/persistence-sqlite/src/lib/backup-retention.ts` normalizes seconds-only stamps to millisecond strings before sorting and uses the filename as a deterministic tie-breaker. It accepts only the two historical compact forms and rejects impossible calendar dates. `backup-retention.spec.ts` proves mixed-form ordering and accepted/rejected names. The third full library test phase passed before the calendar check; the focused retention spec then passed all 8 tests after that final change.

4. **Fixed (U4 boot order)** — `apps/ptah-electron/src/activation/boot-heavy-services.ts:568` starts the detached report only after the final heavy boot phase and the cron start have settled. The service then waits on the governor. `boot-heavy-services.install-scope.spec.ts:151` proves the start follows both reconciliation and cron. Focused Electron Jest: 1 suite, 6 tests passed. Full Electron verify was not run because the library verify gate failed and the three-run limit was reached.

5. **Fixed (U4 log content)** — `libs/backend/persistence-sqlite/src/lib/integrity/table-size-protocol.ts:41` limits worker failures to `dbstat-missing`, `open-failed`, or `query-failed`; the response guard rejects arbitrary detail. `table-size-report.service.ts:55,71` and `apps/ptah-electron/src/activation/table-size-report-start.ts:34,40` log bounded error classes rather than messages. The runner's table-size error path is likewise bounded (`integrity/db-worker-runner.ts:103`). `table-size-protocol.spec.ts:102` uses an open error containing a path; `table-size-report.service.spec.ts:96` uses path-bearing governor and spawn errors and asserts none reaches logs. The third full library test phase passed.

## Older backup name forms

`git log -p -- libs/backend/persistence-sqlite/src/lib/backup.service.ts` and `git show 5a4638db2^:libs/backend/persistence-sqlite/src/lib/backup.service.ts` show the older `compactIso()` removed `-`, `:`, and `.mmm` from ISO, yielding `YYYYMMDDTHHMMSSZ`; its `prefixFor` used `<db>.pre-migration-` and `<db>.reset-`. That history and the current `destPath()` show these complete names:

- pre-migration: `<db>.pre-migration-YYYYMMDDTHHMMSSZ.sqlite` (old); `<db>.pre-migration-YYYYMMDDTHHMMSSmmmZ-<hex8>.sqlite` (current).
- reset: `<db>.reset-YYYYMMDDTHHMMSSZ.sqlite` (old); `<db>.reset-YYYYMMDDTHHMMSSmmmZ-<hex8>.sqlite` (current).
- daily: `<db>-YYYY-MM-DD.sqlite` in both versions, inside `backups/`.

The current compact form is evidenced by `compactIso()` returning the stripped full ISO timestamp plus four random bytes in hex. The strict matcher rejects seconds-plus-hex and milliseconds-without-hex forms that this service never created. Both historical compact forms still rotate.

## Verification

Three permitted `npm run verify -- -p persistence-sqlite,rpc-handlers` runs were made. Runs 1 and 2 exposed and helped fix the two new persistence test failures; run 1 also had an unrelated rpc-handlers native-session timeout. In run 3, persistence lint/typecheck passed and both library test tasks passed. The command exited 1 because rpc-handlers typecheck followed concurrent edits in `libs/backend/task-specs/src/lib/task-index.service.ts:347,351` and reported TS18048 (`state` possibly undefined). That path belongs to another lane; it was not edited here. The coordinator was notified.

Real last lines of run 3, omitting the cache path and recommendation URLs:

```text
 NX   2 tasks: 2 succeeded
 Run duration:      5m 57s
 Cache:             0/2 hit (0%)
 Critical path:     3m 55s (1 task)
 Recoverable time:  2m 1s (34% of the run)
[verify 2026-11-10T19:15:15.274Z] lock released after 455.5s, exit code 1
```

Focused checks after the library failure: the staging service spec passed (1 test); the Electron boot spec passed (6 tests); the retention spec passed (8 tests) after the final calendar-validity change. `git diff --check` found no whitespace errors. No app, real user database, build, or package target was run.

## Decisions

- Join age is 5 s against the existing 30 s analytics budget. A late caller starts a fresh run, retaining one map entry per key without letting an older settlement remove it.
- Staging cleanup uses the same strict final-name pattern as retention, followed by the service's randomized `.tmp` suffix. Missing sidecars do not stop cleanup of an existing own staging file.
- Historical timestamps are compared as digit strings to avoid unsafe 17-digit JavaScript numbers.
- Calendar validation prevents a forged impossible date from qualifying as an own backup name.
- The table-size report remains detached; moving its trigger after boot avoids starting its disk scan during subsequent startup phases.
- Worker failure logs carry bounded codes or `Error`/`UnknownError`, never exception text.
