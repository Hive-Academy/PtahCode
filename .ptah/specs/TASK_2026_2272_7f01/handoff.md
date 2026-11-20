# TASK_2026_2272_7f01 — Handoff to a new session

Continue TASK_2026_2272_7f01: PR 1 of GitHub issue
https://github.com/Hive-Academy/PtahCode/issues/1400 (agent MCP tools for the cron scheduler)
plus the redesign of the Schedules UI.

## Where the work is

- Worktree: `the task worktree`
- Branch: `feat/cron-agent-tools` (from main 3389d5ca8). Nothing is committed yet.
- Task folder: `.ptah/specs/TASK_2026_2272_7f01/` (`task.md` is `in_progress`; read `context.md`).
- Make every edit, check and commit in this worktree. Give its path to each subagent.

## Read first

1. `.ptah/specs/TASK_2026_2272_7f01/context.md` — decision, contract, batches, findings.
2. Backend handoff notes: `<main checkout>/.ptah/subagent-handoffs/toolu_01PNVPg8hjp1r2Q3ccPyoftM.md`
   (brief: `toolu_01PNVPg8hjp1r2Q3ccPyoftM.task.md`).
3. Frontend handoff notes: `<main checkout>/.ptah/subagent-handoffs/toolu_01MUNR6qFKXLRTuuzvCbUuC5.md`
   (brief: `toolu_01MUNR6qFKXLRTuuzvCbUuC5.task.md`).
4. Run `git status` and `git diff --stat main` in the worktree to confirm the state below.

## Done

- Shared contract in `libs/shared/src/lib/types/rpc.types.ts`:
  - `ScheduledJobDto.createdBy: CronJobCreatorDto` (`{kind:'user'} | {kind:'session'; sessionId}`)
  - `ScheduledJobDto.lastRunStatus: JobRunStatusDto | null`
  - `JobRunDto.sessionId: string | null`
- Migration `libs/backend/persistence-sqlite/src/lib/migrations/0076_cron_job_creator.ts` + spec,
  registered in `migrations/index.ts`. It adds `scheduled_jobs.created_by_kind` (default 'user',
  CHECK user|session), `scheduled_jobs.created_by_session_id`, `job_runs.session_id`.
  Migrations are forward-only: do not edit `0004_cron`.
- 26 migration specs (0028–0075): latest-version pin changed from 75 to 76.

## Remaining work — PR 1

Run as smaller agents with explicit file ownership (backend agents B1a–B1c in sequence or with
disjoint files; B2 in parallel with B1). Each agent must stop well below its context budget and
write a report in the task folder.

### B1a — store, runner, service (backend-developer)

Files: `libs/backend/cron-scheduler/**`, `libs/backend/rpc-handlers/src/lib/handlers/cron-rpc*`,
DI wiring in `apps/ptah-electron` and `libs/backend/cli-engine` if needed.

1. Find every place that builds a `ScheduledJob` or a `JobRun`. Update `types.ts`.
2. `job.store.ts`: save the creator. Read `lastRunStatus` with one subquery on the
   `(job_id, scheduled_for DESC)` index.
3. `run.store.ts`: add `setSessionId(runId, sessionId)`.
4. `job-runner.ts` `dispatch()`: take `session_id` from the SDK `system`/`init` message and
   call `setSessionId`. The handle does not carry it.
5. New `CronJobService` (token, registration, barrel export). Move `assertSafePrompt`,
   `validateAndNormalizeWorkspaceRoot`, `toJobDto`, `toRunDto` into it. Add croner checks for
   the expression and the timezone. Absolute workspaceRoot, no `..`. Reject `handler:` prompts.
6. Switch the cron RPC handlers to the service, creator `{kind:'user'}`.
7. Check Electron DI, `apps/ptah-electron/src/di/expected-resolvable.ts` and the cli-engine
   container. Write specs.

### B1b — MCP tools and `cron` namespace (backend-developer)

Files: `libs/backend/vscode-lm-tools/**`.

1. Nine tools: `ptah_cron_list` (nextFire + last run status), `_get`, `_create`, `_update`,
   `_toggle`, `_delete`, `_run_now`, `_runs`, `_next_fire`.
   - `_create`: name, cronExpression, prompt, workspaceRoot (default = session workspace),
     timezone, enabled. Returns id and nextFire. Creator = `{kind:'session', sessionId}`.
   - `_runs`: status, scheduledFor, startedAt, endedAt, resultSummary, errorMessage, sessionId.
2. Pattern: `mcp-core/task-close-out.tools.ts` (Zod `.strict()`, `safeParse`, refused JSON) and
   `session-tools.ts` (`inputSchemaOf`, `readOnlyHint` on read tools, `*_TOOL_NAMES` as const).
   Register through `lifecycle-tools.ts` style, `effective-tool-list.ts`,
   `protocol-dispatcher.ts` (around line 1055), `mcp-caller-policy.ts` tool class, tool profile.
3. PtahAPI `cron` namespace for `execute_code`, `ptah.help()` text, snapshot updates.
4. Scheduler guidance in the system prompt. Specs.

### B1c — permissions (backend-developer)

Files: `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts`,
`libs/backend/agent-sdk/src/lib/permission/**`.

1. One exported constant with the five mutating cron tool names (create, update, toggle,
   delete, run_now).
2. They always prompt, also in auto and yolo modes. Unattended sessions deny them (today they
   auto-allow `mcp__ptah__*`, around line 902).
3. The prompt shows the job prompt, the schedule and the workspace. Specs.

### B2 — Schedules UI redesign (frontend-developer)

Files: `libs/frontend/cron-scheduler-ui/**` only. Design: `docs/design-system/settings/`
("Flight deck"). Load the `angular-frontend-patterns` skill.

1. Read the shared UI components in `libs/frontend/ui` and the `tools/ui-class-audit` baselines.
2. Split the tab into five components: header with a 4-segment instrument band; job list with
   search (`ptah-toolbar`, `ptah-section-header`) and `ptah-inline-confirm` delete; job card on
   `ptah-surface-card` (not the retired `ptah-native-card`) with creator and last status; create/
   edit form (`ptah-field`, `ptah-select`); run history (with session id).
3. Rules: gold only for the one primary action; teal only for live/healthy; state colors only
   through `ptah-status`, `span[ptahBadge]`, `ptah-alert`; sentence case; mono only for ids,
   paths, keys; shadows only on overlays; skeleton, compact `ptah-alert` with Retry,
   `ptah-state-panel` with one action.
4. Replace the stats-grid spec with an instrument-band test. One `@if` per projected drawer slot
   (NG8011). Remove the old "DATA LIMIT" note in `cron-format.ts`. Keep all `data-testid` values.
   Calculate the next-fire preview locally, or list it as a gap. Update fixtures.

## Finish PR 1

1. Inner loop per batch: `npm run verify -- --related -p <projects>`, then
   `npm run verify -- -t lint,typecheck -p <projects>`.
2. Full gate once before the push:
   `npm run verify -- -p shared,cron-scheduler,persistence-sqlite,rpc-handlers,vscode-lm-tools,agent-sdk,cron-scheduler-ui,ptah-electron`
   and `npm run verify -- -t typecheck-templates -p ptah-extension-webview`.
   Write output to `.ptah/tmp/<name>.log` and filter the file.
3. Electron screenshots of Schedules at 1920 and 2560 px, dark mode (visual-reviewer).
4. Independent reviews: code-logic-reviewer and code-style-reviewer. Fix confirmed findings.
5. Read `.commitlintrc.json`, `git log -3`, `git status`. Stage task files by path. Commit in the
   foreground. Subject ≤ 72 chars, body lines ≤ 100, no `security`/`git` scope. Trailer:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
6. Push and `gh pr create` against main in one background command. Title < 70 chars,
   `## Summary`, `## Test plan` with real results, footer
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Reference #1400 as
   "Part of" (not "Closes").
7. Set `task.md` to `in_review`. Watch CI and reviews with `gh`; fix and push again.
   Report PR URL, head, CI and review state.

## PR 2 (later task — do not start here)

- Part 2: promptFile; permission mode with allow and deny lists; argument rules; model and
  effort; runtime cap (timeout = failed); overlap rule (overlap = skipped); per-job catch-up;
  one-off jobs.
- Part 3: MCP and OAuth inheritance (fail early, name the server); CLAUDE.md, agents and skills
  loading; kept transcript that opens from run history; docs.
- Part 4: notification for failed or repeatedly skipped runs (messaging gateways or desktop,
  per job); failed badge; resultSummary from the final message.

## Rules (repeat in every brief)

- No workspace-wide checks. No build, serve, dev, e2e or package targets.
- CLI lanes run only focused `npx jest --config ... --runInBand --coverage=false
  --runTestsByPath`, `npx tsc --noEmit --project`, `npx eslint <files>`. The coordinator runs
  `npm run verify`. Do not check a project while a lane edits it.
- Electron first. Visual reviews in Electron only.
- No merge, force push, history rewrite, branch deletion or worktree removal.
- Only the coordinating session commits, pushes and manages the PR.
