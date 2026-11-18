# B1a report — cron store, runner, CronJobService

Agents wrote most of the code; the coordinating session ran the checks and fixed the findings.

## Files (`libs/backend/cron-scheduler/src/lib/` unless a path is given)

- `types.ts`: `CronJobCreator`, `ScheduledJob.createdBy`, `ScheduledJob.lastRunStatus`,
  `JobRun.sessionId`, `CreateJobInput.createdBy?`.
- `job.store.ts`: writes `created_by_kind` / `created_by_session_id`; `get` and `list` read the
  status of the newest run with ONE correlated subquery (`idx_job_runs_job`); `update` keeps
  the creator.
- `run.store.ts`: `setSessionId(id, sessionId)` (writes once: `AND session_id IS NULL`).
- `job-runner.ts`: records the first SDK `session_id` of the stream; a failure is only logged.
- NEW `cron-job.service.ts`, `errors.ts` (`CronJobValidationError`), `di/tokens.ts`
  (`CRON_TOKENS.CRON_JOB_SERVICE = Symbol.for('PtahCronJobService')`), `di/register.ts`,
  `src/index.ts`.
- `libs/backend/rpc-handlers/src/lib/handlers/cron-rpc.handlers.ts`: uses the service, creator
  `{ kind: 'user' }`.

## CronJobService API (`@ptah-extension/cron-scheduler`)

```ts
list(filter?: { enabledOnly?: boolean; workspaceRoot?: string | null }): ScheduledJobDto[]
get(id: string): ScheduledJobDto | null
create(input: CronJobCreateInput, creator: CronJobCreator): ScheduledJobDto
update(id: string, patch: CronJobUpdatePatch): ScheduledJobDto
toggle(id: string, enabled: boolean): ScheduledJobDto
delete(id: string): boolean
runNow(id: string, signal?: AbortSignal): Promise<JobRunDto | null>
runs(id: string, opts?: { limit?: number; offset?: number }): JobRunDto[]
nextFire(id: string): number | null
previewNextFire(cronExpr: string, timezone = 'UTC', count = 1): number[]   // max 50
```

Validation throws `CronJobValidationError(field, message)` with `field` in
`prompt | workspaceRoot | cronExpr | timezone | id`.

## Defect found and fixed

`validateAndNormalizeWorkspaceRoot` checked for a `..` segment AFTER `path.normalize`, which
collapses every `..` of an absolute path, so the check could never reject. The same code is on
`main` in the RPC handler. The service now checks the raw segments. `/a/../b` was accepted
before and is now refused.

## DI

Both hosts call `registerCronSchedulerServices` (`apps/ptah-electron/src/di/phase-2-libraries.ts`,
`libs/backend/cli-engine/src/lib/thoth/register-thoth-libraries.ts`), so no host file changed.

## Specs

`cron-job.service.spec.ts` (new, 20), `job.store.spec.ts` (+7: creator, last run status, one
query), `run.store.spec.ts` (+4: `setSessionId`), `job-runner.spec.ts` (session id recorded
once, failure does not fail the run), `cron-rpc.handlers.spec.ts` (now through the real service).
