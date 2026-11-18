# Code Logic Review (backend) - TASK_2026_2272_7f01

Verdict: NEEDS_REVISION. 0 blockers, 4 major, 5 minor.

Scope: whole-file reads of cron-job.service.ts (lines 70-388), cron-namespace.builder.ts (140-355), cron-rpc.handlers.ts, 0076_cron_job_creator.ts. The `handlerFor` body in cron.tools.ts (about lines 252-258) and the scheduler (`CronScheduler`, `JobNotFoundError`, `CronSchedulerError`) were not read; findings that depend on them are marked unverified.

## Findings

### Major

1. **Per-second schedules accepted** - cron-job.service.ts:189-206 (`validateSchedule`), 279-293 (`create`). The tool text says "5 fields", but validation only checks that croner can parse the pattern. A 6-field pattern such as `* * * * * *` passes, so an agent can create a job that starts an unattended agent session every second. Nothing enforces a minimum interval or a 5-field format. Fix: in `validateSchedule`, for agent creators at least, require 5 fields and compare the gap between two probed fire times against a minimum (for example 1 minute). Alternatively add a zod refine in cron.tools.ts.

2. **Agent-created job recorded as a user job** - cron-namespace.builder.ts:219-222. `creator()` returns `{ kind: 'user' }` whenever `deps.getSessionId()` is undefined. A write tool call from an MCP request that carries no session id is then attributed to the user, which defeats the `creator` provenance this PR adds. Fix: add an explicit `{ kind: 'agent' }` / unknown-session creator, or refuse the write tools when there is no session id.

3. **`run_now` reports a wrong error** - cron-namespace.builder.ts:312-318. `service.runNow` returns null for a malformed id (cron-job.service.ts:351-355). It also returns null whenever `scheduler.runNow` returns no run, for example when the run is skipped; this second case depends on scheduler behaviour I did not read. The tool answers `No scheduled job has the id ...` in both cases. The model is told the job does not exist when it may exist and have been skipped or not started. Fix: check `service.get(id)` first, as the other tools do. If the job exists but there is no run, return a refusal such as "run was not started".

4. **Service does not validate `name` and `prompt` type or emptiness** - cron-job.service.ts:279-293 and 306-331. The service header claims it validates all caller input. `assertSafePrompt` ignores non-strings, and `name`, `prompt` and `enabled` are passed to the scheduler unchecked. The tool boundary has zod (min 1, name max 200), but the `cron:create` and `cron:update` RPC path (cron-rpc.handlers.ts:121-153) has none. An empty prompt, a non-string name or an enormous name or prompt is stored. The tool also has no `max` on prompt, so an agent can store an arbitrarily large prompt in the DB. Fix: validate type, non-empty and a maximum length in the service so both surfaces share the rule.

### Minor

5. **`workspaceRoot` is not checked for existence or scope** - cron-job.service.ts:100-126. Only "absolute and no `..` segment" is enforced. An agent can schedule a run with cwd `/` or any directory, and symlinks are not resolved. The user approval step is the only guard. Consider requiring that the directory exists, and optionally that it is a known workspace.

6. **`next_fire` ignores `cronExpression` when `id` is given** - cron-namespace.builder.ts:335-345. If both are sent, `id` wins silently. The zod schema has no "exactly one of" refinement. Fix: refuse when both are present.

7. **Timezone error can be mislabelled** - cron-job.service.ts:128-136 and 199-205. `Intl.DateTimeFormat` may accept a timezone that croner rejects. The croner error is then reported against `cronExpr`.

8. **Migration idempotency is not self-contained** - 0076_cron_job_creator.ts:8-13. Three bare `ALTER TABLE ... ADD COLUMN` statements. Existing rows are fine (NOT NULL DEFAULT 'user' satisfies the CHECK). A crash between statements, or a runner that is not transactional, would make a re-run fail with "duplicate column name". The header asserts the runner is transactional, which I did not verify. Also nothing ties `created_by_session_id` to `created_by_kind = 'session'`.

9. **RPC reads swallow malformed ids** - cron-rpc.handlers.ts:116-119, 155-160, 174-198. `cron:get`, `cron:delete`, `cron:runs` and `cron:nextFire` return null, false or [] for a malformed id, while `cron:update` and `cron:toggle` throw a validation error. The behaviour is inconsistent but looks pre-existing. `cron:runs` passes `limit` and `offset` to the scheduler without bounds checks.

## Checked, no defect found

- Update and delete races: `update` reads the existing job and calls `scheduler.update` with no await in between (cron-job.service.ts:320-331), so there is no interleaving in the single-threaded process. The tool's `get` then `update` pair is likewise synchronous.
- `handler:` prompt bypass: blocked on both create and update (cron-job.service.ts:78-88, 280, 308).
- `..` traversal: raw segments are checked before normalisation (cron-job.service.ts:119).
- Tool errors: `CronJobValidationError` and `CronSchedulerError` become refusals; other errors are rethrown (cron-namespace.builder.ts:202-214). Whether the dispatcher hides the raw message of a rethrown error was not verified.
