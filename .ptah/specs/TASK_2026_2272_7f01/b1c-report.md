# B1c report — permissions for the cron write tools

Done by the coordinating session (three B1c agents stopped at the reading stage).

## Files

- NEW `libs/backend/agent-sdk/src/lib/permission/cron-tool-policy.ts`
  - `CRON_MUTATING_TOOL_BASE_NAMES` (`ptah_cron_create|update|toggle|delete|run_now`)
  - `CRON_MUTATING_TOOL_NAMES` (the same names with the `mcp__ptah__` prefix)
  - `isCronMutatingTool(toolName)`, `describeCronToolRequest(toolName, input)`,
    `CRON_UNATTENDED_DENY_MESSAGE`
- `permission/index.ts` and `src/index.ts`: exports (`@ptah-extension/agent-sdk`).
- `permission/permission-description.ts`: `generateDescription` uses the cron text first.
- `sdk-permission-handler.ts`:
  - `decide()`: one branch right after the unattended-policy lookup, before every auto-approval
    path (unattended YOLO, the `mcp__ptah__*` allow, YOLO, auto-edit, background agents, stored
    rules). Unattended session or CLI lane → deny with `CRON_UNATTENDED_DENY_MESSAGE`.
    All other sessions → `requestUserPermission`.
  - "Always Allow" branch: no rule is stored for a cron write tool and no pending sibling
    request is resolved. The one call is allowed.
- NEW specs: `permission/cron-tool-policy.spec.ts`, `sdk-permission-handler.cron-tools.spec.ts`.

## Decisions

- CLI lanes are denied, the same as unattended sessions. The handler comment at the plan-lane
  check says that nobody watches a lane prompt.
- The prompt text reads `cronExpression` and `cronExpr`, flat or inside `patch`.
- agent-sdk cannot import cron-scheduler. For toggle, delete and run_now the prompt shows the
  job id only, not the stored job prompt. Open item for PR 2 (a lookup port).

## Checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false
  --runTestsByPath` on the two new specs: 53 passed.
- The same command with `sdk-permission-handler.spec.ts` and
  `sdk-permission-handler.unattended.spec.ts`: 141 passed (before the one-line spec fix).
- `npx eslint` on the changed files: 0 errors, 1 warning (`max-lines` on
  `sdk-permission-handler.ts`, which was above 700 lines before this task).
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: exit 0.
