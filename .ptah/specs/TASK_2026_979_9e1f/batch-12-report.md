# Batch 12 report — Cron opt-in and run-summary warning (C9)

## Files changed

- MODIFIED `libs/backend/cron-scheduler/src/lib/job-runner.ts`
  - `execute` now receives `includeConnectors: true` (#1466). It is the only one-shot caller that passes it.
  - New optional injection `@inject(PLATFORM_TOKENS.MCP_GATEWAY, { isOptional: true }) mcpGateway: IMcpGateway | null = null`, added as the last constructor parameter. No existing `new JobRunner(...)` caller outside the spec, so nothing else needed changing.
  - In the stream loop, `system`/`init` `mcp_servers` entries whose status is neither `connected` nor `disabled` are collected. The CLI's `error` string becomes the detail.
  - After the loop, `mcpGateway.status({kind:'internal-query', capability:'privileged', includeConnectors:true, workspaceRoot: cwd})` entries that are not `connected` are added, deduplicated by name against the init entries (init wins). This covers a cold-start `pending` entry with its timeout detail. A throwing `status()` is logged at warn through `logWithContext`, carries a `// degradation-audit: reported - ...` marker, and leaves the summary without a gateway warning.
  - Summary = base capped at 500 characters + `\n[warning] MCP unavailable: name(status: detail), ...` capped at 300. When there is no detail it reads `name(status)`. The 500 cap moved from the raw `result` slice into `withMcpWarning`, so it behaves the same. The run status and job schema are unchanged.
- MODIFIED `libs/backend/cron-scheduler/src/lib/job-runner.spec.ts`
  - `makeHarness` takes an optional gateway as its second argument. Existing tests are unchanged.
  - New describe block with 6 tests: the flag is passed; a `needs-auth` init entry and a cold-start `pending` gateway entry (`tools/list timed out after 12s`) are each named, with an exact status-call scope and no failed/skipped; the failed init error is used as detail and duplicates are removed; the 500/300 caps hold; an all-connected run leaves the summary unchanged; a throwing gateway status is logged and the run still succeeds.

## Checks run

- `npx jest --config libs/backend/cron-scheduler/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cron-scheduler/src/lib/job-runner.spec.ts`: 21 passed, 21 total.
- `npx tsc --noEmit --project libs/backend/cron-scheduler/tsconfig.lib.json`: exit 0.
- `npx tsc --noEmit --project libs/backend/cron-scheduler/tsconfig.spec.json`: exit 0.
- `npx eslint` on both changed files: exit 0, no findings.
- Not run: the batch's `npm run verify` commands. The coordinator instructed focused checks only; the coordinating agent owns the inner loop and gate.

## Deviations

- The gateway scope `workspaceRoot` is the same `cwd` the run uses (`job.workspaceRoot ?? process.cwd()`). This matches the credential scope the one-shot runner issues (`workspaceRoot: cwd` in `sdk-query-runner.service.ts`). Reversible.
- Dedup by server name between init and gateway entries was not specified. It was added so that one server is never listed twice.
- Otherwise none.
