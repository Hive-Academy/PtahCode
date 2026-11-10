Verdict: APPROVE

Read-only round 2 review of the uncommitted diff. No tests, builds or state-changing commands were run. The DI smoke spec was read, not executed.

## First-review findings

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 1 | S3 late join shares a nearly expired abort timer | RESOLVED (residual: see N1) | `libs/backend/rpc-handlers/src/lib/handlers/in-flight-coalescer.ts:13-24` — a run older than 5 s is not joined. A joiner now keeps at least about 25 s of the 30 s budget. `in-flight-coalescer.spec.ts:10-30` covers the 4999/5000 ms boundary. |
| 2 | U2 staging sweep deleted foreign look-alike files | RESOLVED | `backup-retention.ts:55-66` accepts a staging root only when the whole name is an own final name plus `.<hex8>.tmp`, with a path containment check and a live-DB check. `backup.service.ts:756-758` uses it. `discardArtifact` (`backup.service.ts:669-686`) logs base name and size. A look-alike test exists in `backup.service.spec.ts` ("sweeps only own stale staging names"). |
| 3 | U2 mixed-form sort order | RESOLVED | `backup-retention.ts:69-75` and `:89-93` normalize both stamp forms to 17 digits and use the filename as tie-breaker. `backup-retention.spec.ts:92` tests the same-second case. |
| 4 | U4 report started during boot | RESOLVED | `boot-heavy-services.ts:566-569` starts the report after the last phase and the cron start. The service then waits on the governor (`table-size-report.service.ts:52-53`, `:61-75`). Spec: `boot-heavy-services.install-scope.spec.ts` (ordering test). |
| 5 | U4 raw exception text in logs | RESOLVED for the table-size path | The worker returns a bounded `detail` code (`table-size-protocol.ts:111-117`). The service, runner (`db-worker-runner.ts:102-105`) and start file log only `errorClass`. `table-size-report.service.spec.ts:96` asserts no path in logs. Other paths: see N2. |

## Checks of the hard rules

- **Coalescer.** An older settlement cannot delete a newer entry: the `finally` handler compares promise identity (`in-flight-coalescer.ts:21`). The map holds one entry per key and the entry is removed on settlement, so it cannot leak. A rejected run is removed the same way and does not poison later callers (`spec` "does not retain a failed run"). `runSummary` is `async`, so a synchronous throw in `start` cannot leave a stale entry.
- **Rotation.** Rotation stays async. It deletes only names that match the full own pattern for the kind, inside its own directory, never the live DB or `-wal`/`-shm` (`backup-retention.ts:36-52`, `:95-107`). Each deletion logs base name and size (`backup.service.ts:693-700`). Retention values are daily 3, pre-migration 1, reset 2 (`backup.service.ts:169-173`). Both historical compact forms match. The calendar check validates the same fields that `compactIso()` and the daily date produce, so no real own backup becomes immortal. Date parts are UTC ISO values, so they always validate.
- **Table-size report.** It opens read-only (`integrity-worker.ts:186-190`). It runs in the worker. It runs once (`started` flag). The `settle` function kills the worker at the 60 s budget. The report is a silent no-op without a factory (`table-size-report.service.ts:51`), so platform-cli and cli-engine are not affected.
- **DI.** The token is registered in `register.ts` and listed in `expected-resolvable.ts`. Dependencies (`SQLITE_DB_PATH`, `DbWorkerRunner`, logger, two optional ports) resolve in the same way as the WAL scheduler entry next to it. I see no reason for the smoke spec to fail. This is a read-only judgement; the spec was not run.
- **Migration timing logs.** The change adds `now`, logs and a split helper. Control flow, backup call, rotate condition and `KEEP_BY_KIND` use are the same as before.
- **Standards.** No `any`, `@ts-ignore` or `as unknown as X` in the scope. Catch blocks use `unknown`. The injected Logger is used. Swallowed errors in the new code carry a `degradation-audit` comment and a log.

## New findings

1. **MINOR — `libs/backend/persistence-sqlite/src/lib/backup.service.ts:714` (also `:810`).** The warn log for a failed rotation delete, and the outer scan failure log, still send `error.message`. An `EPERM`/`EBUSY` message contains the absolute file path. The hard rule asks for no absolute path in rotation logs. Failure scenario: a locked backup file on Windows logs its full path. Fix: log `errorClass` and `code` only, as `discardArtifact` already does.

2. **MINOR — `libs/backend/persistence-sqlite/src/lib/integrity/db-worker-runner.ts:102-105`.** The `errorContext` helper branches on `label === 'table-size'`. Other labels still log raw messages. This is acceptable for the scope, but the label check is fragile. Fix (optional): log the bounded form for all labels.

3. **MINOR — `libs/backend/persistence-sqlite/src/lib/backup.service.ts` doc comment of `rotate` (about lines 727-731).** The comment still says the same-second old/new ordering quirk "intentionally does not add parsing". The code now parses both forms. Fix: update the comment.

4. **MINOR (N1) — `analytics-rpc.handlers.ts:89`.** A joiner at 4.9 s shares the first run's abort timer and has about 25 s left, not 30 s. The risk is small and bounded. No change is required.

5. **MINOR — `table-size-protocol.ts:70-75`.** `asTableSizeResponse` does not validate the `tables` entries. A malformed entry would throw in the service map and be caught and logged by `reportOnce`. The worker is first-party code, so the risk is low.

## Do the tests prove the fixes?

- Coalescer: yes. The boundary test fails without the age check, and the reuse of `b` after `a` settles fails without the identity check.
- Staging look-alike, calendar and mixed-form ordering: yes, each has a direct test.
- Path-free logs: yes for governor, spawn and worker errors. No test covers the rotation failure log (finding 1 above).
- Boot ordering: the spec checks that the start follows reconciliation and cron.

## Required before approval

Nothing. Findings 1 and 3 are recommended small fixes before commit; the rest are optional.
