# TASK_2026_2272_7f01 — Context

Source: https://github.com/Hive-Academy/PtahCode/issues/1400 and the user request to redesign
Schedules (`libs/frontend/cron-scheduler-ui`) with the settings "Flight deck" design
(`docs/design-system/settings/`) and the shared components.

## Delivery decision (user, 2026-11-18)

Two PRs.

- **PR 1 (this task):** issue Part 1 + Schedules UI redesign.
- **PR 2 (later task):** Parts 2–4 (job options, notifications, inheritance, docs).

## Shared contract (fixed before the batches start)

`libs/shared/src/lib/types/rpc.types.ts`:

- `ScheduledJobDto.createdBy: CronJobCreatorDto` — `{ kind: 'user' } | { kind: 'session'; sessionId }`.
- `ScheduledJobDto.lastRunStatus: JobRunStatusDto | null`.
- `JobRunDto.sessionId: string | null`.

## Batches

| Batch | Owner | Files |
|---|---|---|
| B1 backend | backend-developer | `libs/backend/cron-scheduler/**`, `libs/backend/persistence-sqlite/src/lib/migrations/**`, `libs/backend/rpc-handlers/src/lib/handlers/cron-rpc*`, `libs/backend/vscode-lm-tools/**`, `libs/backend/agent-sdk/src/lib/sdk-permission-handler.ts` + permission files, DI wiring in apps/ptah-electron and cli-engine if needed |
| B2 frontend | frontend-developer | `libs/frontend/cron-scheduler-ui/**` only |

## Key findings

- Validation lives in `cron-rpc.handlers.ts` (`assertSafePrompt`, `validateAndNormalizeWorkspaceRoot`,
  croner check in the scheduler). Move it to one `CronJobService` in `cron-scheduler`.
- MCP tools pattern: `vscode-lm-tools/.../mcp-core/lifecycle-tools.ts` + `task-close-out.tools.ts`;
  tool class in `mcp-caller-policy.ts`; listed through `effective-tool-list.ts`.
- Permission: interactive sessions prompt for `mcp__*` tools; unattended sessions auto-allow
  `mcp__ptah__*` (`sdk-permission-handler.ts:902`). Cron write tools must always prompt.
- `cron-job-card` uses the retired `ptah-native-card`; move to `ptah-surface-card`.
