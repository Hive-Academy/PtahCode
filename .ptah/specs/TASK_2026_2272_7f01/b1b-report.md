# B1b report — nine `ptah_cron_*` MCP tools and the `ptah.cron` namespace

Written by the coordinating session; two small agents wrote the specs.

## Files (`libs/backend/vscode-lm-tools/src/lib/code-execution/`)

- NEW `namespace-builders/cron-namespace.builder.ts`: `CronNamespace`, `buildCronNamespace`.
  Results are `{ status: 'ok', ... }` or `{ status: 'refused', reason, field? }`. Times are ISO
  strings. The creator is `{ kind: 'session', sessionId }` when the MCP request carries a
  session id, otherwise `{ kind: 'user' }`. A new job defaults to the workspace of the calling
  session (never the home-directory fallback).
- NEW `mcp-core/cron.tools.ts`: zod `.strict()` schemas, `inputSchema` generated from them,
  `CRON_TOOL_NAMES`, `CRON_READ_TOOL_NAMES`, `CRON_MUTATING_TOOL_NAMES`, `cronTools`.
- `mcp-core/lifecycle-tools.ts`: `...cronTools` (this one list feeds `effective-tool-list.ts`
  and `protocol-dispatcher.ts`).
- `mcp-core/mcp-caller-policy.ts`: list/get/runs/next_fire = `read`; the five write tools =
  `agent-control` (privileged callers only).
- `types.ts` (`PtahAPI.cron`), `ptah-api-builder.service.ts` (the service is resolved from the
  container on every call, like the session spawner), `namespace-builders/index.ts`,
  `namespace-builders/system-namespace.builders.ts` (`ptah.help('cron')`).
- `package.json`: dependency on `@ptah-extension/cron-scheduler`.

## Tools

| Tool | Class | Result |
|---|---|---|
| `ptah_cron_list` | read | jobs with nextFire, lastRunStatus, createdBy, prompt preview |
| `ptah_cron_get` | read | one job, full prompt |
| `ptah_cron_runs` | read | status, scheduledFor, startedAt, endedAt, resultSummary, errorMessage, sessionId |
| `ptah_cron_next_fire` | read | by job id, or preview of an expression (count up to 50) |
| `ptah_cron_create` | write | id, nextFire, job |
| `ptah_cron_update` / `_toggle` / `_delete` / `_run_now` | write | job / run |

## Decisions

- Scheduler guidance for the model is in the tool descriptions and in `ptah.help('cron')`.
  The MCP server instructions are capped at 512 characters, so nothing was added there.
- The tool input uses `cronExpression`; the service and the RPC contract use `cronExpr`.
- A host without the scheduler returns a refusal that names the reason.

## Specs

`cron.tools.spec.ts` (new, 37; it pins the five write names to agent-sdk
`CRON_MUTATING_TOOL_NAMES`), `cron-namespace.builder.spec.ts` (new, 55),
`mcp-contract.sweep.spec.ts` (nine drivers, nine description budgets, tool counts +9),
`effective-tool-list` snapshots (+27 lines: nine names in three lists).
